import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  Quality,
  WebMOutputFormat,
  WrappedCanvas,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { ASPECT_SIZES } from './constants';
import { timeStretch } from './timeStretch';
import { ensureFonts } from './fonts';
import { renderFrame } from './renderer';
import { curveRate, overlayEnd, getMainFrameState, layoutMainTrack, projectDuration } from './timeline';
import { LaidOutClip, MediaAsset, Project } from './types';

export interface ExportOptions {
  resolution: 720 | 1080;
  fps: 24 | 30 | 60;
  quality: 'medium' | 'high' | 'very-high';
}

export interface ExportResult {
  blob: Blob;
  extension: 'mp4' | 'webm';
}

const SAMPLE_RATE = 48000;

const QUALITY: Record<ExportOptions['quality'], Quality> = {
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

export class ExportCancelled extends Error {
  constructor() {
    super('تم إلغاء التصدير');
  }
}

/** Mixes every audible clip into a single buffer with the Web Audio API. */
async function renderAudioMix(
  project: Project,
  layout: LaidOutClip[],
  assets: Map<string, MediaAsset>,
  duration: number
): Promise<AudioBuffer | null> {
  const length = Math.ceil(duration * SAMPLE_RATE);
  if (length <= 0) return null;
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const decoded = new Map<string, AudioBuffer | null>();

  const decode = async (asset: MediaAsset) => {
    if (!decoded.has(asset.id)) {
      try {
        decoded.set(asset.id, await ctx.decodeAudioData(await asset.file.arrayBuffer()));
      } catch {
        decoded.set(asset.id, null);
      }
    }
    return decoded.get(asset.id) ?? null;
  };

  let scheduled = 0;
  const schedule = (
    buffer: AudioBuffer,
    at: number,
    offset: number,
    sourceDuration: number,
    rate: number,
    volume: number,
    fadeIn: number,
    fadeOut: number,
    timelineDuration?: number
  ): AudioBufferSourceNode | null => {
    if (sourceDuration <= 0 || offset >= buffer.duration) return null;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = rate;
    const gain = ctx.createGain();
    const timelineDur = timelineDuration ?? sourceDuration / rate;
    const end = at + timelineDur;
    // Short ramps avoid clicks at hard cuts.
    const fi = Math.max(0.01, fadeIn);
    const fo = Math.max(0.01, fadeOut);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(fi, timelineDur / 2));
    gain.gain.setValueAtTime(volume, Math.max(at + Math.min(fi, timelineDur / 2), end - Math.min(fo, timelineDur / 2)));
    gain.gain.linearRampToValueAtTime(0, end);
    node.connect(gain).connect(ctx.destination);
    node.start(at, offset, sourceDuration);
    scheduled++;
    return node;
  };

  for (const lc of layout) {
    const { clip, asset } = lc;
    if (asset.kind !== 'video' || !asset.hasAudio || clip.muted || clip.volume <= 0 || clip.freeze) continue;
    const buffer = await decode(asset);
    if (!buffer) continue;
    if (clip.speedCurve) {
      // A speed curve varies the rate continuously; follow it with the playback rate (pitch moves with it).
      const node = schedule(buffer, lc.start, clip.inPoint, clip.outPoint - clip.inPoint, clip.speed, clip.volume, 0, 0, lc.duration);
      if (node) {
        const steps = 64;
        const curve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) curve[i] = clip.speed * curveRate(clip.speedCurve, (i + 0.5) / steps);
        node.playbackRate.setValueCurveAtTime(curve, lc.start, lc.duration);
      }
    } else if (clip.speed === 1) {
      schedule(buffer, lc.start, clip.inPoint, clip.outPoint - clip.inPoint, 1, clip.volume, 0, 0);
    } else {
      // Keep the voice's pitch: stretch the clip's samples instead of resampling them.
      const from = Math.floor(clip.inPoint * buffer.sampleRate);
      const to = Math.min(buffer.length, Math.ceil(clip.outPoint * buffer.sampleRate));
      if (to <= from) continue;
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).subarray(from, to));
      const stretched = timeStretch(channels, buffer.sampleRate, clip.speed);
      const out = ctx.createBuffer(stretched.length, stretched[0].length, buffer.sampleRate);
      stretched.forEach((data, c) => out.copyToChannel(data, c));
      schedule(out, lc.start, 0, out.duration, 1, clip.volume, 0, 0);
    }
  }

  for (const o of project.overlays) {
    const asset = assets.get(o.assetId);
    if (!asset || asset.kind !== 'video' || !asset.hasAudio || o.muted || o.volume <= 0 || o.start >= duration) continue;
    const buffer = await decode(asset);
    if (!buffer) continue;
    schedule(buffer, o.start, o.inPoint, Math.min(o.outPoint - o.inPoint, duration - o.start), 1, o.volume, 0, 0);
  }

  for (const a of project.audios) {
    const asset = assets.get(a.assetId);
    if (!asset || a.volume <= 0 || a.start >= duration) continue;
    const buffer = await decode(asset);
    if (!buffer) continue;
    const srcDur = Math.min(a.outPoint - a.inPoint, duration - a.start);
    schedule(buffer, a.start, a.inPoint, srcDur, 1, a.volume, a.fadeIn, a.fadeOut);
  }

  if (!scheduled) return null;
  return ctx.startRendering();
}

interface ClipFrameStream {
  input: Input;
  iterator: AsyncGenerator<WrappedCanvas | null, void, unknown>;
  remaining: number;
}

export async function exportProject(
  project: Project,
  assets: Map<string, MediaAsset>,
  options: ExportOptions,
  onProgress: (progress: number, stage: string) => void,
  signal: { cancelled: boolean }
): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('متصفحك لا يدعم تصدير الفيديو (WebCodecs). استخدم Chrome أو Edge الحديث.');
  }

  const layout = layoutMainTrack(project.clips, assets);
  const duration = projectDuration(project, layout);
  if (duration <= 0) throw new Error('المشروع فارغ. أضف مقطعاً أولاً.');

  const base = ASPECT_SIZES[project.aspect];
  const scale = options.resolution / Math.min(base.width, base.height);
  const width = Math.round((base.width * scale) / 2) * 2;
  const height = Math.round((base.height * scale) / 2) * 2;
  const fps = options.fps;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const quality = QUALITY[options.quality];

  onProgress(0, 'تجهيز الخطوط والصوت...');
  await ensureFonts(project.texts.map((t) => t.font));

  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat({ fastStart: 'in-memory' });
  let extension: ExportResult['extension'] = 'mp4';
  let videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width, height, bitrate: quality });
  if (!videoCodec) {
    format = new WebMOutputFormat();
    extension = 'webm';
    videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width, height, bitrate: quality });
  }
  if (!videoCodec) throw new Error('لا يوجد ترميز فيديو مدعوم في هذا المتصفح.');

  const target = new BufferTarget();
  const output = new Output({ format, target });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('تعذر تهيئة لوحة الرسم.');
  ctx.imageSmoothingQuality = 'high';

  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: quality, keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const mix = await renderAudioMix(project, layout, assets, duration);
  if (signal.cancelled) throw new ExportCancelled();
  let audioSource: AudioBufferSource | null = null;
  if (mix) {
    const audioCodec = await getFirstEncodableAudioCodec(
      extension === 'mp4' ? ['aac', 'opus'] : ['opus', 'vorbis'],
      { numberOfChannels: 2, sampleRate: SAMPLE_RATE }
    );
    if (audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }
  }

  const streams = new Map<string, ClipFrameStream>();
  const images = new Map<string, ImageBitmap>();

  try {
    await output.start();
    if (audioSource && mix) {
      await audioSource.add(mix);
      audioSource.close();
    }

    // Pre-compute which source timestamps each video (main clip or overlay) will be
    // asked for, in order, so mediabunny can decode each one sequentially.
    interface Visit { key: string; file: File; sourceTime: number }
    const timestampsByKey = new Map<string, number[]>();
    const visits: Visit[][] = [];
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const st = getMainFrameState(layout, t);
      const frameVisits: Visit[] = [];
      for (const r of [st.from, st.to]) {
        if (r && r.lc.asset.kind === 'video') frameVisits.push({ key: r.lc.clip.id, file: r.lc.asset.file, sourceTime: r.sourceTime });
      }
      for (const o of project.overlays) {
        const asset = assets.get(o.assetId);
        if (asset?.kind === 'video' && t >= o.start && t < overlayEnd(o)) {
          frameVisits.push({ key: `ov:${o.id}`, file: asset.file, sourceTime: o.inPoint + (t - o.start) });
        }
      }
      for (const v of frameVisits) {
        const list = timestampsByKey.get(v.key) ?? [];
        list.push(v.sourceTime);
        timestampsByKey.set(v.key, list);
      }
      visits.push(frameVisits);
    }

    const imageAssets = [...layout.map((lc) => lc.asset), ...project.overlays.map((o) => assets.get(o.assetId))];
    for (const asset of imageAssets) {
      if (asset?.kind === 'image' && !images.has(asset.id)) {
        images.set(asset.id, await createImageBitmap(asset.file));
      }
    }

    const currentFrames = new Map<string, CanvasImageSource>();
    const withoutVideo = new Set<string>();

    const pullFrame = async ({ key, file }: Visit) => {
      if (withoutVideo.has(key)) return;
      let stream = streams.get(key);
      if (!stream) {
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        const timestamps = timestampsByKey.get(key) ?? [];
        if (!track) {
          input.dispose();
          withoutVideo.add(key);
          return;
        }
        // No canvas pool: a frame may stay on screen (held in currentFrames) while later ones decode.
        const sink = new CanvasSink(track);
        stream = { input, iterator: sink.canvasesAtTimestamps(timestamps), remaining: timestamps.length };
        streams.set(key, stream);
      }
      const next = await stream.iterator.next();
      stream.remaining--;
      if (!next.done && next.value) currentFrames.set(key, next.value.canvas);
      if (stream.remaining <= 0) {
        await stream.iterator.return();
        stream.input.dispose();
        streams.delete(key);
      }
    };

    for (let f = 0; f < totalFrames; f++) {
      if (signal.cancelled) throw new ExportCancelled();
      const t = f / fps;
      for (const v of visits[f]) await pullFrame(v);

      ctx.setTransform(width / base.width, 0, 0, height / base.height, 0, 0);
      renderFrame(ctx, {
        width: base.width,
        height: base.height,
        project,
        layout,
        time: t,
        getFrame: (ref) =>
          ref.lc.asset.kind === 'image'
            ? images.get(ref.lc.asset.id) ?? null
            : currentFrames.get(ref.lc.clip.id) ?? null,
        getOverlayFrame: (o) => {
          const asset = assets.get(o.assetId);
          return asset?.kind === 'image' ? images.get(asset.id) ?? null : currentFrames.get(`ov:${o.id}`) ?? null;
        },
      });
      await videoSource.add(t, 1 / fps);

      if (f % 5 === 0) onProgress(f / totalFrames, 'جاري ترميز الفيديو...');
    }

    videoSource.close();
    onProgress(1, 'إنهاء الملف...');
    await output.finalize();
    const buffer = target.buffer;
    if (!buffer) throw new Error('فشل إنشاء الملف.');
    return { blob: new Blob([buffer], { type: extension === 'mp4' ? 'video/mp4' : 'video/webm' }), extension };
  } catch (err) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    throw err;
  } finally {
    for (const s of streams.values()) {
      await s.iterator.return().catch(() => {});
      s.input.dispose();
    }
    for (const img of images.values()) img.close();
  }
}

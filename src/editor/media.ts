import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { PEAKS_PER_SECOND } from './constants';
import { uid } from './timeline';
import { AssetKind, MediaAsset } from './types';

export function detectKind(file: File): AssetKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
  return null;
}

function waitFor(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', fail);
      reject(new Error('تعذر قراءة الملف'));
    };
    el.addEventListener(event, ok);
    el.addEventListener('error', fail);
  });
}

async function hasAudioTrack(file: File): Promise<boolean> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    return (await input.getPrimaryAudioTrack()) !== null;
  } catch {
    // Unknown container: assume audio exists and let decoding decide later.
    return true;
  } finally {
    input.dispose();
  }
}

async function computePeaks(file: File): Promise<number[] | undefined> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buffer.getChannelData(0);
    const bucket = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND));
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < data.length; i += bucket) {
      let peak = 0;
      const end = Math.min(data.length, i + bucket);
      for (let j = i; j < end; j += 8) peak = Math.max(peak, Math.abs(data[j]));
      peaks.push(peak);
      max = Math.max(max, peak);
    }
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } catch {
    return undefined;
  }
}

export async function loadAsset(file: File): Promise<MediaAsset> {
  const kind = detectKind(file);
  if (!kind) throw new Error(`نوع الملف غير مدعوم: ${file.name}`);
  const url = URL.createObjectURL(file);
  const base = { id: uid(), kind, name: file.name, file, url };

  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { ...base, duration: 0, width: img.naturalWidth, height: img.naturalHeight, thumbnail: url, hasAudio: false };
    }

    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      await waitFor(audio, 'loadedmetadata');
      const peaks = await computePeaks(file);
      return { ...base, duration: audio.duration, width: 0, height: 0, hasAudio: true, peaks };
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await waitFor(video, 'loadedmetadata');
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('مدة الفيديو غير معروفة');
    const width = video.videoWidth;
    const height = video.videoHeight;
    video.removeAttribute('src');
    video.load();

    const strip = await extractVideoFrames(file, duration).catch(() => null);
    return {
      ...base,
      duration,
      width,
      height,
      thumbnail: strip?.thumbnail ?? (await thumbnailFromElement(url, duration).catch(() => undefined)),
      frames: strip?.frames,
      frameInterval: strip?.frameInterval,
      hasAudio: await hasAudioTrack(file),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

const STRIP_HEIGHT = 96;
const MAX_STRIP_FRAMES = 40;

/**
 * Decodes real frames with WebCodecs. Mobile browsers often return a black
 * image when a <video> element is drawn right after seeking, so the element
 * is only a fallback.
 */
export async function extractVideoFrames(
  file: File,
  duration: number
): Promise<{ thumbnail: string; frames: string[]; frameInterval: number }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('no video track');
    const aspect = track.displayWidth / track.displayHeight || 9 / 16;
    const height = STRIP_HEIGHT;
    const width = Math.max(2, Math.round(height * aspect));
    const sink = new CanvasSink(track, { width, height, fit: 'cover', poolSize: 1 });
    const first = await track.getFirstTimestamp();

    const frameInterval = Math.max(0.5, duration / MAX_STRIP_FRAMES);
    const times: number[] = [];
    for (let t = 0; t < duration; t += frameInterval) times.push(first + t);

    const frames: string[] = [];
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      const canvas = wrapped?.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
      if (!canvas) {
        frames.push(frames[frames.length - 1] ?? '');
        continue;
      }
      frames.push(await canvasToDataUrl(canvas));
    }
    if (!frames.some(Boolean)) throw new Error('no frames decoded');
    const thumbIndex = Math.min(frames.length - 1, Math.floor(Math.min(1, duration / 3) / frameInterval));
    return { thumbnail: frames[thumbIndex] || frames.find(Boolean)!, frames, frameInterval };
  } finally {
    input.dispose();
  }
}

async function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ('toDataURL' in canvas) return canvas.toDataURL('image/jpeg', 0.7);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Fallback thumbnail: waits for a frame to actually be presented before drawing it. */
async function thumbnailFromElement(url: string, duration: number): Promise<string> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await waitFor(video, 'loadeddata');
    video.currentTime = Math.min(1, duration / 3);
    await waitFor(video, 'seeked');
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (v.requestVideoFrameCallback) {
      await Promise.race([
        new Promise<void>((resolve) => v.requestVideoFrameCallback!(() => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    const h = STRIP_HEIGHT;
    const w = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * h));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

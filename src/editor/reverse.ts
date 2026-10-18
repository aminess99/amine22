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
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { decodeFile } from './audioTools';

export const MAX_REVERSE_SECONDS = 60;
const FPS = 30;
/** Frames are decoded forwards in chunks this long, then written out backwards. */
const CHUNK_SECONDS = 0.5;
const MAX_SIDE = 1280;

/**
 * Renders a source range played backwards into a new video file. Video can only
 * be decoded forwards, so the range is walked from its end in short chunks: each
 * chunk is decoded forwards and its frames are encoded in reverse order.
 */
export async function reverseVideo(
  file: File,
  from: number,
  to: number,
  hasAudio: boolean,
  onProgress: (p: number) => void
): Promise<File> {
  if (typeof VideoEncoder === 'undefined') throw new Error('متصفحك لا يدعم معالجة الفيديو (WebCodecs).');
  const span = to - from;
  if (span > MAX_REVERSE_SECONDS) throw new Error(`عكس الفيديو متاح للمقاطع حتى ${MAX_REVERSE_SECONDS} ثانية.`);

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('لا يوجد فيديو في هذا الملف.');
    const scale = Math.min(1, MAX_SIDE / Math.max(track.displayWidth, track.displayHeight));
    const width = Math.max(2, Math.round((track.displayWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((track.displayHeight * scale) / 2) * 2);
    const sink = new CanvasSink(track, { width, height, fit: 'fill' });

    let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat({ fastStart: 'in-memory' });
    let ext = 'mp4';
    let codec = await getFirstEncodableVideoCodec(['avc', 'vp9'], { width, height });
    if (!codec) {
      format = new WebMOutputFormat();
      ext = 'webm';
      codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height });
    }
    if (!codec) throw new Error('لا يوجد ترميز فيديو مدعوم في هذا المتصفح.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const target = new BufferTarget();
    const output = new Output({ format, target });
    const video = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 1 });
    output.addVideoTrack(video, { frameRate: FPS });

    let audio: AudioBufferSource | null = null;
    let reversedAudio: AudioBuffer | null = null;
    if (hasAudio) {
      try {
        const decoded = await decodeFile(file);
        const a = Math.floor(from * decoded.sampleRate);
        const b = Math.min(decoded.length, Math.ceil(to * decoded.sampleRate));
        reversedAudio = new AudioBuffer({ numberOfChannels: decoded.numberOfChannels, length: Math.max(1, b - a), sampleRate: decoded.sampleRate });
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          reversedAudio.copyToChannel(decoded.getChannelData(c).slice(a, b).reverse(), c);
        }
        const audioCodec = await getFirstEncodableAudioCodec(ext === 'mp4' ? ['aac', 'opus'] : ['opus'], {
          numberOfChannels: reversedAudio.numberOfChannels,
          sampleRate: reversedAudio.sampleRate,
        });
        if (audioCodec) {
          audio = new AudioBufferSource({ codec: audioCodec, bitrate: 160_000 });
          output.addAudioTrack(audio);
        }
      } catch {
        // No decodable audio: the reversed clip is silent.
      }
    }

    await output.start();
    if (audio && reversedAudio) {
      await audio.add(reversedAudio);
      audio.close();
    }

    const totalFrames = Math.max(1, Math.round(span * FPS));
    const first = await track.getFirstTimestamp();
    let written = 0;
    for (let chunkEnd = totalFrames; chunkEnd > 0; chunkEnd -= Math.round(CHUNK_SECONDS * FPS)) {
      const chunkStart = Math.max(0, chunkEnd - Math.round(CHUNK_SECONDS * FPS));
      const times: number[] = [];
      for (let f = chunkStart; f < chunkEnd; f++) times.push(first + from + f / FPS);
      const frames: ImageBitmap[] = [];
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (wrapped) frames.push(await createImageBitmap(wrapped.canvas));
        else if (frames.length) frames.push(frames[frames.length - 1]);
      }
      for (let i = frames.length - 1; i >= 0; i--) {
        ctx.drawImage(frames[i], 0, 0, width, height);
        await video.add(written / FPS, 1 / FPS);
        written++;
      }
      new Set(frames).forEach((f) => f.close());
      onProgress(written / totalFrames);
    }
    video.close();
    await output.finalize();
    const name = file.name.replace(/\.[^.]+$/, '') + `-reversed.${ext}`;
    return new File([target.buffer!], name, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    input.dispose();
  }
}

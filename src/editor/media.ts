import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
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
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await waitFor(video, 'loadedmetadata');
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('مدة الفيديو غير معروفة');
    video.currentTime = Math.min(1, duration / 3);
    await waitFor(video, 'seeked');

    const thumbH = 120;
    const thumbW = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * thumbH));
    const canvas = document.createElement('canvas');
    canvas.width = thumbW;
    canvas.height = thumbH;
    canvas.getContext('2d')?.drawImage(video, 0, 0, thumbW, thumbH);
    const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
    const width = video.videoWidth;
    const height = video.videoHeight;
    video.removeAttribute('src');
    video.load();

    return { ...base, duration, width, height, thumbnail, hasAudio: await hasAudioTrack(file) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

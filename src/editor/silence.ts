import { uid } from './timeline';
import { AudioClip, MainClip, MediaAsset } from './types';

const WINDOW = 0.02; // seconds per loudness sample
const MIN_SILENCE = 0.45; // shorter pauses are kept
const PADDING = 0.12; // breathing room kept around speech

/**
 * Finds the speech (non-silent) ranges of a clip's source audio, in source seconds.
 * The threshold adapts to the clip: anything well below its typical speech level is silence.
 */
export async function findSpeechRanges(asset: MediaAsset, inPoint: number, outPoint: number): Promise<[number, number][]> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buffer = await ctx.decodeAudioData(await asset.file.arrayBuffer());
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const step = Math.max(1, Math.floor(WINDOW * rate));
  const from = Math.floor(inPoint * rate);
  const to = Math.min(buffer.length, Math.floor(outPoint * rate));

  const levels: number[] = [];
  for (let i = from; i < to; i += step) {
    let sum = 0;
    let n = 0;
    const end = Math.min(to, i + step);
    for (const ch of channels) {
      for (let j = i; j < end; j += 2) {
        sum += ch[j] * ch[j];
        n++;
      }
    }
    levels.push(Math.sqrt(sum / Math.max(1, n)));
  }
  if (!levels.length) return [];

  const sorted = [...levels].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  const threshold = Math.max(0.008, loud * 0.12);

  const ranges: [number, number][] = [];
  let silentSince: number | null = null;
  let speechStart: number | null = null;
  levels.forEach((level, i) => {
    const t = inPoint + i * WINDOW;
    if (level >= threshold) {
      if (speechStart === null) speechStart = t;
      silentSince = null;
    } else if (speechStart !== null) {
      if (silentSince === null) silentSince = t;
      if (t - silentSince >= MIN_SILENCE) {
        ranges.push([speechStart, silentSince]);
        speechStart = null;
        silentSince = null;
      }
    }
  });
  if (speechStart !== null) ranges.push([speechStart, silentSince ?? outPoint]);

  // Pad and merge ranges that now touch.
  const padded: [number, number][] = [];
  for (const [s, e] of ranges) {
    const ps = Math.max(inPoint, s - PADDING);
    const pe = Math.min(outPoint, e + PADDING);
    const last = padded[padded.length - 1];
    if (last && ps <= last[1]) last[1] = Math.max(last[1], pe);
    else padded.push([ps, pe]);
  }
  return padded.filter(([s, e]) => e - s >= 0.15);
}

/** Splits a clip into one clip per speech range. */
export function clipsFromRanges(clip: MainClip, ranges: [number, number][]): MainClip[] {
  return ranges.map(([s, e], i) => ({
    ...clip,
    id: i === 0 ? clip.id : uid(),
    inPoint: s,
    outPoint: e,
    transition: i === 0 ? clip.transition : { ...clip.transition, type: 'none' },
  }));
}

/** Keeps only the given source ranges of an audio track, placed back to back from where it starts. */
export function audioFromRanges(x: AudioClip, ranges: [number, number][]): AudioClip[] {
  let at = x.start;
  return ranges.map(([s, e], i) => {
    const piece: AudioClip = {
      ...x,
      id: i === 0 ? x.id : uid(),
      start: at,
      inPoint: s,
      outPoint: e,
      fadeIn: i === 0 ? x.fadeIn : 0,
      fadeOut: i === ranges.length - 1 ? x.fadeOut : 0,
    };
    at += e - s;
    return piece;
  });
}

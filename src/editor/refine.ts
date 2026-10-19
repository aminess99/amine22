import { ALL_FORMATS, BlobSource, CanvasSink, Input, InputVideoTrack } from 'mediabunny';
import { MediaAsset } from './types';

/**
 * Frame-accurate timing. The vision model places moments to about a second;
 * these tools look at the real frames and audio around that guess and return
 * the exact frame (or the exact millisecond for sound).
 */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

async function withVideoTrack<T>(file: File, fn: (track: InputVideoTrack, first: number) => Promise<T>): Promise<T | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    return await fn(track, await track.getFirstTimestamp());
  } finally {
    input.dispose();
  }
}

const fpsCache = new WeakMap<File, Promise<number>>();

/** The video's frame rate (30 when it can't be read). */
export function videoFps(asset: MediaAsset): Promise<number> {
  if (asset.fps) return Promise.resolve(asset.fps);
  let p = fpsCache.get(asset.file);
  if (!p) {
    p = withVideoTrack(asset.file, async (track) => (await track.computePacketStats(120)).averagePacketRate)
      .then((r) => (r && Number.isFinite(r) && r >= 5 && r <= 240 ? Math.round(r * 1000) / 1000 : 30))
      .catch(() => 30);
    fpsCache.set(asset.file, p);
  }
  return p;
}

/** Rounds a source time to the start of the frame it falls in. */
export const snapToFrame = (t: number, fps: number) => Math.max(0, Math.round(t * fps) / fps);

interface Frame {
  time: number;
  canvas: AnyCanvas;
}

/** Every real frame between two source times, at a small size. */
async function framesBetween(asset: MediaAsset, from: number, to: number, width = 64): Promise<Frame[]> {
  const out = await withVideoTrack(asset.file, async (track, first) => {
    const height = Math.max(8, Math.round((width * (asset.height || 9)) / (asset.width || 16)));
    const sink = new CanvasSink(track, { width, height, fit: 'fill' });
    const frames: Frame[] = [];
    for await (const w of sink.canvases(first + Math.max(0, from), first + Math.min(asset.duration, to))) {
      // Copy: the sink reuses its canvases.
      const copy = document.createElement('canvas');
      copy.width = w.canvas.width;
      copy.height = w.canvas.height;
      copy.getContext('2d')!.drawImage(w.canvas as CanvasImageSource, 0, 0);
      frames.push({ time: w.timestamp - first, canvas: copy });
      if (frames.length > 400) break;
    }
    return frames;
  });
  return out ?? [];
}

function luminance(c: AnyCanvas): Float32Array {
  const ctx = (c as HTMLCanvasElement).getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const lum = new Float32Array(data.length / 4);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return lum;
}

/** Mean absolute brightness change between consecutive frames (index i = change into frame i). */
function frameDiffs(frames: Frame[]): number[] {
  const lums = frames.map((f) => luminance(f.canvas));
  return lums.map((l, i) => {
    if (!i) return 0;
    const prev = lums[i - 1];
    let sum = 0;
    for (let k = 0; k < l.length; k++) sum += Math.abs(l[k] - prev[k]);
    return sum / l.length;
  });
}

/** The first frame of a camera cut near `approx`, or null when there is no clear cut. */
export async function refineCut(asset: MediaAsset, approx: number, window = 1): Promise<number | null> {
  const frames = await framesBetween(asset, approx - window, approx + window);
  if (frames.length < 3) return null;
  const diffs = frameDiffs(frames);
  let best = 1;
  for (let i = 2; i < diffs.length; i++) if (diffs[i] > diffs[best]) best = i;
  const sorted = [...diffs.slice(1)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  // A cut is a jump well above the usual frame-to-frame change.
  return diffs[best] > 12 && diffs[best] > median * 3 ? frames[best].time : null;
}

/** The frame with the most movement near `approx` (where an action peaks). */
export async function refineMotion(asset: MediaAsset, approx: number, window = 0.6): Promise<number | null> {
  const frames = await framesBetween(asset, approx - window, approx + window);
  if (frames.length < 3) return null;
  const diffs = frameDiffs(frames);
  let best = 1;
  for (let i = 2; i < diffs.length; i++) if (diffs[i] > diffs[best]) best = i;
  return frames[best].time;
}

// ---------------------------------------------------------------- audio

const RATE = 16000;
const audioCache = new WeakMap<File, Promise<Float32Array | null>>();

function monoAudio(file: File): Promise<Float32Array | null> {
  let p = audioCache.get(file);
  if (!p) {
    p = file
      .arrayBuffer()
      .then((buf) => new OfflineAudioContext(1, 1, RATE).decodeAudioData(buf))
      .then((b) => b.getChannelData(0))
      .catch(() => null);
    audioCache.set(file, p);
  }
  return p;
}

/** RMS energy in 5 ms steps over [from, to). */
function energy(data: Float32Array, from: number, to: number): { t0: number; step: number; e: Float32Array } {
  const step = 0.005;
  const n = Math.max(0, Math.floor((to - from) / step));
  const e = new Float32Array(n);
  const size = Math.round(step * RATE);
  for (let i = 0; i < n; i++) {
    const start = Math.round((from + i * step) * RATE);
    let sum = 0;
    for (let k = start; k < start + size && k < data.length; k++) if (k >= 0) sum += data[k] * data[k];
    e[i] = Math.sqrt(sum / size);
  }
  return { t0: from, step, e };
}

/** The start of the strongest sudden sound near `approx` (a hit, clap, door...), to 5 ms. */
export async function refineOnset(asset: MediaAsset, approx: number, window = 0.5): Promise<number | null> {
  const data = await monoAudio(asset.file);
  if (!data) return null;
  const { t0, step, e } = energy(data, Math.max(0, approx - window), approx + window);
  let best = -1;
  let bestRise = 0;
  for (let i = 4; i < e.length; i++) {
    const before = (e[i - 1] + e[i - 2] + e[i - 3] + e[i - 4]) / 4;
    const rise = e[i] - before;
    if (rise > bestRise) {
      bestRise = rise;
      best = i;
    }
  }
  return best >= 0 && bestRise > 0.02 ? t0 + best * step : null;
}

/** The quietest 20 ms near `t` — a pause between words — so a cut never clips speech. */
export async function snapToSilence(asset: MediaAsset, t: number, window = 0.35): Promise<number> {
  const data = asset.hasAudio ? await monoAudio(asset.file) : null;
  if (!data) return t;
  const { t0, step, e } = energy(data, Math.max(0, t - window), t + window);
  if (e.length < 5) return t;
  let best = 2;
  let bestE = Infinity;
  for (let i = 2; i < e.length - 2; i++) {
    const v = e[i - 2] + e[i - 1] + e[i] + e[i + 1] + e[i + 2];
    // Prefer the spot nearest the guess when the quiet is about equal.
    const score = v * (1 + Math.abs(t0 + i * step - t) * 0.5);
    if (score < bestE) {
      bestE = score;
      best = i;
    }
  }
  return t0 + best * step;
}

// ---------------------------------------------------------------- AI frame pick

/** Asks the vision model which of the real frames around each moment shows it first. */
export async function aiPickFrames(asset: MediaAsset, moments: { time: number; label: string }[], window = 0.7): Promise<(number | null)[]> {
  if (!moments.length) return [];
  const groups: { label: string; frames: string[]; times: number[] }[] = [];
  for (const m of moments) {
    const all = await framesBetween(asset, m.time - window, m.time + window, 256);
    // At most 16 evenly spread frames per moment (every 2nd-3rd frame at 30 fps).
    const step = Math.max(1, Math.ceil(all.length / 16));
    const picked = all.filter((_, i) => i % step === 0);
    groups.push({
      label: m.label,
      frames: picked.map((f) => (f.canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.6)),
      times: picked.map((f) => f.time),
    });
  }
  const res = await fetch('/api/refine-frames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups: groups.map(({ label, frames }) => ({ label, frames })) }),
  });
  if (!res.ok) return moments.map(() => null);
  const { picks } = (await res.json()) as { picks: number[] };
  return groups.map((g, i) => {
    const n = picks?.[i];
    return Number.isInteger(n) && n >= 0 && n < g.times.length ? g.times[n] : null;
  });
}

import {
  MAX_IMAGE_DURATION,
  MOTION_PRESETS,
  SPEED_CURVES,
  DEFAULT_IMAGE_DURATION,
  DEFAULT_TRANSITION_DURATION,
  MIN_CLIP_DURATION,
  NEUTRAL_ADJUSTMENTS,
} from './constants';
import {
  AudioClip,
  FrameRef,
  FrameTransform,
  LaidOutClip,
  MainClip,
  OverlayClip,
  MainFrameState,
  MediaAsset,
  Project,
  TextClip,
  TextKeyframe,
} from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function formatTime(seconds: number, withFraction = false): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const base = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  if (!withFraction) return base;
  const frac = Math.floor((s % 1) * 10);
  return `${base}.${frac}`;
}

export function clipDuration(clip: MainClip): number {
  if (clip.freeze) return clip.freeze;
  return (clip.outPoint - clip.inPoint) / clip.speed;
}

// ---------------------------------------------------------------- speed curves

const CURVE_SAMPLES = 200;
const curveCache = new Map<string, Float64Array>();

/** Cumulative source progress (0..1) at each of CURVE_SAMPLES+1 timeline positions. */
function curveTable(id: string): Float64Array | null {
  const curve = SPEED_CURVES.find((c) => c.id === id);
  if (!curve) return null;
  let table = curveCache.get(id);
  if (!table) {
    const pts = curve.points;
    const at = (p: number) => {
      const x = p * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(x));
      return pts[i] + (pts[i + 1] - pts[i]) * (x - i);
    };
    table = new Float64Array(CURVE_SAMPLES + 1);
    for (let i = 1; i <= CURVE_SAMPLES; i++) table[i] = table[i - 1] + at((i - 0.5) / CURVE_SAMPLES);
    const total = table[CURVE_SAMPLES];
    for (let i = 0; i <= CURVE_SAMPLES; i++) table[i] /= total;
    curveCache.set(id, table);
  }
  return table;
}

/** Source progress (0..1) at timeline progress p for a speed curve. */
export function curveProgress(id: string, p: number): number {
  const table = curveTable(id);
  if (!table) return p;
  const x = clamp(p, 0, 1) * CURVE_SAMPLES;
  const i = Math.min(CURVE_SAMPLES - 1, Math.floor(x));
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/** Instantaneous speed multiplier of a curve at timeline progress p. */
export function curveRate(id: string, p: number): number {
  const table = curveTable(id);
  if (!table) return 1;
  const x = clamp(p, 0, 1) * CURVE_SAMPLES;
  const i = Math.min(CURVE_SAMPLES - 1, Math.floor(x));
  return (table[i + 1] - table[i]) * CURVE_SAMPLES;
}

/** Inverse of curveProgress: timeline progress at which the curve reaches source progress u. */
export function curveInverse(id: string, u: number): number {
  const table = curveTable(id);
  if (!table) return u;
  let lo = 0;
  let hi = CURVE_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo] || 1;
  return (lo + (u - table[lo]) / span) / CURVE_SAMPLES;
}

export function createMainClip(asset: MediaAsset): MainClip {
  return {
    id: uid(),
    assetId: asset.id,
    inPoint: 0,
    outPoint: asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : asset.duration,
    speed: 1,
    volume: 1,
    muted: false,
    fit: 'contain',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    filterId: 'none',
    adjust: { ...NEUTRAL_ADJUSTMENTS },
    transition: { type: 'none', duration: DEFAULT_TRANSITION_DURATION },
    motion: null,
    ...CLIP_EXTRAS,
  };
}

/** Defaults for the clip fields added after the first release (also used to upgrade saved projects). */
export const CLIP_EXTRAS: Pick<
  MainClip,
  'crop' | 'flipH' | 'flipV' | 'animIn' | 'animOut' | 'effect' | 'mask' | 'chroma' | 'freeze' | 'speedCurve'
> = {
  crop: { x: 0, y: 0, w: 1, h: 1 },
  flipH: false,
  flipV: false,
  animIn: { type: 'none', duration: 0.5 },
  animOut: { type: 'none', duration: 0.5 },
  effect: null,
  mask: null,
  chroma: null,
  freeze: null,
  speedCurve: null,
};

export const OVERLAY_EXTRAS: Pick<OverlayClip, 'blend' | 'flipH' | 'chroma'> = {
  blend: 'source-over',
  flipH: false,
  chroma: null,
};

export function createOverlayClip(asset: MediaAsset, start: number): OverlayClip {
  return {
    id: uid(),
    assetId: asset.id,
    start,
    inPoint: 0,
    outPoint: asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : asset.duration,
    x: 0.72,
    y: 0.25,
    scale: 0.4,
    rotation: 0,
    opacity: 1,
    shape: 'rounded',
    volume: 1,
    muted: false,
    animIn: 'pop',
    animOut: 'fade',
    ...OVERLAY_EXTRAS,
  };
}

export function overlayEnd(o: OverlayClip): number {
  return o.start + (o.outPoint - o.inPoint);
}

export function overlayMaxOut(asset: MediaAsset): number {
  return asset.kind === 'image' ? MAX_IMAGE_DURATION : asset.duration;
}

export function activeOverlays(overlays: OverlayClip[], t: number): OverlayClip[] {
  return overlays.filter((o) => t >= o.start && t < overlayEnd(o));
}

export function splitOverlayClip(o: OverlayClip, t: number): [OverlayClip, OverlayClip] | null {
  const local = t - o.start;
  const dur = o.outPoint - o.inPoint;
  if (local < MIN_CLIP_DURATION || dur - local < MIN_CLIP_DURATION) return null;
  const cut = o.inPoint + local;
  return [
    { ...o, outPoint: cut, animOut: 'none' },
    { ...o, id: uid(), start: t, inPoint: cut, animIn: 'none' },
  ];
}

export function baseTransform(clip: MainClip): FrameTransform {
  return { zoom: clip.zoom, offsetX: clip.offsetX, offsetY: clip.offsetY, rotation: clip.rotation };
}

export function motionFromPreset(clip: MainClip, presetId: string): MainClip['motion'] {
  const preset = MOTION_PRESETS.find((m) => m.id === presetId);
  if (!preset) return null;
  const base = baseTransform(clip);
  const apply = (p: Partial<FrameTransform>): FrameTransform => ({
    zoom: base.zoom * (p.zoom ?? 1),
    offsetX: base.offsetX + (p.offsetX ?? 0),
    offsetY: base.offsetY + (p.offsetY ?? 0),
    rotation: base.rotation + (p.rotation ?? 0),
  });
  return { preset: presetId, keys: [{ at: 0, tf: apply(preset.from) }, { at: 1, tf: apply(preset.to) }] };
}

/** Adds or replaces the keyframe at `at` (0..1) with the clip's current transform. */
export function setKeyframe(clip: MainClip, at: number): MainClip['motion'] {
  const tf = baseTransform(clip);
  const keys = (clip.motion?.keys ?? []).filter((k) => Math.abs(k.at - at) > 0.02);
  keys.push({ at: clamp(at, 0, 1), tf });
  keys.sort((a, b) => a.at - b.at);
  return { preset: 'custom', keys };
}

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** The clip's frame transform at a progress (0..1) through the clip. */
export function transformAt(clip: MainClip, progress: number): FrameTransform {
  const keys = clip.motion?.keys;
  if (!keys?.length) return baseTransform(clip);
  const p = clamp(progress, 0, 1);
  if (keys.length === 1 || p <= keys[0].at) return keys[0].tf;
  const last = keys[keys.length - 1];
  if (p >= last.at) return last.tf;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].at < p) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const e = ease((p - a.at) / Math.max(1e-6, b.at - a.at));
  const lerp = (x: number, y: number) => x + (y - x) * e;
  return {
    zoom: lerp(a.tf.zoom, b.tf.zoom),
    offsetX: lerp(a.tf.offsetX, b.tf.offsetX),
    offsetY: lerp(a.tf.offsetY, b.tf.offsetY),
    rotation: lerp(a.tf.rotation, b.tf.rotation),
  };
}

export type TextTransform = Pick<TextClip, 'x' | 'y' | 'fontSize' | 'rotation'>;

/** Where a text sits at a progress (0..1) through it: its own fields, or its keyframes. */
export function textTransformAt(t: TextClip, progress: number): TextTransform {
  const keys = t.keys;
  if (!keys?.length) return { x: t.x, y: t.y, fontSize: t.fontSize, rotation: t.rotation };
  const p = clamp(progress, 0, 1);
  const pick = (k: TextKeyframe): TextTransform => ({ x: k.x, y: k.y, fontSize: k.fontSize, rotation: k.rotation });
  if (keys.length === 1 || p <= keys[0].at) return pick(keys[0]);
  const last = keys[keys.length - 1];
  if (p >= last.at) return pick(last);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].at < p) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const e = ease((p - a.at) / Math.max(1e-6, b.at - a.at));
  const lerp = (x: number, y: number) => x + (y - x) * e;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), fontSize: lerp(a.fontSize, b.fontSize), rotation: lerp(a.rotation, b.rotation) };
}

export const textProgress = (t: TextClip, time: number) => clamp((time - t.start) / Math.max(1e-6, t.duration), 0, 1);

/** Adds or replaces the keyframe at `at` (0..1) with the text's current position, size and rotation. */
export function setTextKeyframe(t: TextClip, at: number): TextKeyframe[] {
  const keys = (t.keys ?? []).filter((k) => Math.abs(k.at - at) > 0.02);
  keys.push({ at: clamp(at, 0, 1), x: t.x, y: t.y, fontSize: t.fontSize, rotation: t.rotation });
  return keys.sort((a, b) => a.at - b.at);
}

export function createAudioClip(asset: MediaAsset, start: number): AudioClip {
  return {
    id: uid(),
    assetId: asset.id,
    start,
    inPoint: 0,
    outPoint: asset.duration,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export function layoutMainTrack(clips: MainClip[], assets: Map<string, MediaAsset>): LaidOutClip[] {
  const out: LaidOutClip[] = [];
  let cursor = 0;
  for (const clip of clips) {
    const asset = assets.get(clip.assetId);
    if (!asset) continue;
    const duration = clipDuration(clip);
    const prev = out[out.length - 1];
    const transitionIn =
      prev && clip.transition.type !== 'none'
        ? Math.min(clip.transition.duration, prev.duration, duration)
        : 0;
    out.push({ clip, asset, index: out.length, start: cursor, end: cursor + duration, duration, transitionIn });
    cursor += duration;
  }
  return out;
}

export function projectDuration(project: Project, layout: LaidOutClip[]): number {
  let end = layout.length ? layout[layout.length - 1].end : 0;
  for (const t of project.texts) end = Math.max(end, t.start + t.duration);
  for (const a of project.audios) end = Math.max(end, audioClipEnd(a));
  for (const o of project.overlays) end = Math.max(end, overlayEnd(o));
  return end;
}

export function audioClipEnd(a: AudioClip): number {
  return a.start + (a.outPoint - a.inPoint);
}

export interface SourceInfo {
  /** Source seconds to show. */
  time: number;
  /** Source seconds per timeline second right now (0 for a held frame). */
  rate: number;
}

/** Where in its source a clip is at timeline time t, accounting for freeze frames and speed curves. */
export function sourceInfo(lc: LaidOutClip, t: number): SourceInfo {
  const { clip } = lc;
  const max = lc.asset.kind === 'video' ? Math.max(0, lc.asset.duration - 1 / 60) : Number.POSITIVE_INFINITY;
  if (clip.freeze) return { time: clamp(clip.inPoint, 0, max), rate: 0 };
  const local = t - lc.start;
  let raw: number;
  let rate = clip.speed;
  if (clip.speedCurve && local >= 0 && local <= lc.duration) {
    const p = local / lc.duration;
    raw = clip.inPoint + (clip.outPoint - clip.inPoint) * curveProgress(clip.speedCurve, p);
    rate = clip.speed * curveRate(clip.speedCurve, p);
  } else {
    raw = clip.inPoint + local * clip.speed;
  }
  const time = clamp(raw, 0, max);
  return { time, rate: time === raw ? rate : 0 };
}

export function sourceTimeFor(lc: LaidOutClip, t: number): number {
  return sourceInfo(lc, t).time;
}

/** Timeline progress (0..1) of a clip at timeline time t. */
export function clipProgress(lc: LaidOutClip, t: number): number {
  return lc.duration > 0 ? clamp((t - lc.start) / lc.duration, 0, 1) : 0;
}

const ref = (lc: LaidOutClip, t: number): FrameRef => ({ lc, sourceTime: sourceTimeFor(lc, t), localTime: t - lc.start });

/**
 * Transitions are centred on the cut between two clips: the outgoing clip
 * keeps playing (using source frames past its out point when available) for
 * half the transition, and the incoming clip starts half a transition early.
 */
export function getMainFrameState(layout: LaidOutClip[], t: number): MainFrameState {
  const empty: MainFrameState = { primary: null, from: null, to: null, transition: 'none', progress: 0 };
  if (!layout.length) return empty;

  let idx = layout.findIndex((l) => t >= l.start && t < l.end);
  if (idx === -1) {
    const last = layout[layout.length - 1];
    if (t >= last.end && t < last.end + 1e-3) idx = layout.length - 1;
    else return empty;
  }
  const cur = layout[idx];
  const primary = ref(cur, t);

  if (idx > 0 && cur.transitionIn > 0 && t < cur.start + cur.transitionIn / 2) {
    const d = cur.transitionIn;
    return {
      primary,
      from: ref(layout[idx - 1], t),
      to: primary,
      transition: cur.clip.transition.type,
      progress: clamp((t - (cur.start - d / 2)) / d, 0, 1),
    };
  }
  const next = layout[idx + 1];
  if (next && next.transitionIn > 0 && t >= cur.end - next.transitionIn / 2) {
    const d = next.transitionIn;
    return {
      primary,
      from: primary,
      to: ref(next, t),
      transition: next.clip.transition.type,
      progress: clamp((t - (cur.end - d / 2)) / d, 0, 1),
    };
  }
  return { primary, from: primary, to: null, transition: 'none', progress: 0 };
}

export function activeTexts(texts: TextClip[], t: number): TextClip[] {
  return texts.filter((x) => t >= x.start && t < x.start + x.duration);
}

/** Splits a main clip at timeline time t. Returns null when t is too close to an edge. */
export function splitMainClip(lc: LaidOutClip, t: number): [MainClip, MainClip] | null {
  const local = t - lc.start;
  if (local < MIN_CLIP_DURATION || lc.duration - local < MIN_CLIP_DURATION) return null;
  const b = { ...lc.clip, id: uid(), transition: { ...lc.clip.transition, type: 'none' as const }, animIn: { ...lc.clip.animIn, type: 'none' as const } };
  const a = { ...lc.clip, animOut: { ...lc.clip.animOut, type: 'none' as const } };
  if (lc.clip.freeze) return [{ ...a, freeze: local }, { ...b, freeze: lc.duration - local }];
  const cut = sourceTimeFor(lc, t);
  // A speed curve describes the whole clip, so the halves go back to constant speed.
  return [
    { ...a, outPoint: cut, speedCurve: null },
    { ...b, inPoint: cut, speedCurve: null },
  ];
}

/** Timeline time at which a clip shows a source time, or null when it doesn't show it. */
export function timelineTimeOf(lc: LaidOutClip, src: number): number | null {
  const c = lc.clip;
  if (c.freeze || src < c.inPoint - 0.02 || src > c.outPoint + 0.02) return null;
  const u = clamp((src - c.inPoint) / Math.max(1e-6, c.outPoint - c.inPoint), 0, 1);
  return lc.start + (c.speedCurve ? curveInverse(c.speedCurve, u) : u) * lc.duration;
}

/**
 * Re-places auto captions after the main track changed, from where their words
 * are in the source: they move, stretch or shrink with their clip, and lose the
 * words that were cut out (a caption with none left is removed).
 */
export function followCaptions(prev: Project, next: Project, assets: Map<string, MediaAsset>): Project {
  if (prev.clips === next.clips || !next.texts.some((t) => t.src)) return next;
  const layout = layoutMainTrack(next.clips, assets);
  // A clip whose file isn't loaded yet would shift everything after it.
  if (layout.length !== next.clips.length) return next;
  let changed = false;
  const texts: TextClip[] = [];
  for (const t of next.texts) {
    const src = t.src;
    if (!src || !t.words?.length) {
      texts.push(t);
      continue;
    }
    // A rewritten or translated line has other words than were spoken: it follows the span of its speech.
    const sameWords = t.words.length === src.words.length;
    let words: NonNullable<TextClip['words']> = [];
    const kept: number[] = [];
    let lastClip: LaidOutClip | null = null;
    src.words.forEach((w, i) => {
      for (const lc of layout) {
        if (lc.asset.id !== src.assetId || w.start < lc.clip.inPoint - 0.02 || w.start >= lc.clip.outPoint) continue;
        const start = timelineTimeOf(lc, w.start);
        if (start === null) continue;
        const end = timelineTimeOf(lc, Math.min(w.end, lc.clip.outPoint)) ?? start;
        words.push({ text: sameWords ? t.words![i].text : w.text, start, end: Math.max(start, end) });
        kept.push(i);
        lastClip = lc;
        return;
      }
    });
    if (!words.length || !lastClip) {
      changed = true;
      continue;
    }
    if (!sameWords) {
      const from = t.words[0].start;
      const span = Math.max(1e-3, t.words[t.words.length - 1].end - from);
      const a = words[0].start;
      const k = (words[words.length - 1].end - a) / span;
      words = t.words.map((w) => ({ text: w.text, start: a + (w.start - from) * k, end: a + (w.end - from) * k }));
    }
    const start = words[0].start;
    const end = Math.min(words[words.length - 1].end + src.hold, (lastClip as LaidOutClip).end);
    const duration = Math.max(0.2, end - start);
    const same = words.length === t.words.length && Math.abs(start - t.start) < 1e-4 && Math.abs(duration - t.duration) < 1e-4 && words.every((w, i) => Math.abs(w.start - t.words![i].start) < 1e-4);
    if (same) {
      texts.push(t);
      continue;
    }
    changed = true;
    const keep = kept.length === src.words.length;
    texts.push({
      ...t,
      start,
      duration,
      words,
      text: keep || !sameWords ? t.text : words.map((w) => w.text).join(' '),
      // Words that were cut out are gone for good from this caption.
      src: keep ? src : { ...src, words: kept.map((i) => src.words[i]) },
    });
  }
  return changed ? { ...next, texts } : next;
}

export function splitTextClip(text: TextClip, t: number): [TextClip, TextClip] | null {
  const local = t - text.start;
  if (local < MIN_CLIP_DURATION || text.duration - local < MIN_CLIP_DURATION) return null;
  const a: TextClip = { ...text, duration: local };
  const b: TextClip = { ...text, id: uid(), start: t, duration: text.duration - local };
  if (text.words?.length) {
    // Each half keeps the words spoken in it.
    const wa = text.words.filter((w) => w.start < t);
    const wb = text.words.filter((w) => w.start >= t);
    if (wa.length) Object.assign(a, { words: wa, text: wa.map((w) => w.text).join(' ') });
    if (wb.length) Object.assign(b, { words: wb, text: wb.map((w) => w.text).join(' ') });
    // The halves keep following the speech: split the source words the same way.
    if (text.src && text.src.words.length === text.words.length) {
      a.src = { ...text.src, words: text.src.words.slice(0, wa.length), hold: 0 };
      b.src = { ...text.src, words: text.src.words.slice(wa.length) };
    }
  }
  return [a, b];
}

/**
 * Keeps word timings in step with an edited caption: the same number of words keep
 * their times; otherwise the caption's span is shared out by word length.
 */
export function retimeWords(words: NonNullable<TextClip['words']>, text: string): TextClip['words'] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length || !words.length) return undefined;
  if (parts.length === words.length) return words.map((w, i) => ({ ...w, text: parts[i] }));
  const start = words[0].start;
  const end = words[words.length - 1].end;
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  let cursor = start;
  return parts.map((p) => {
    const d = ((end - start) * p.length) / total;
    const w = { text: p, start: cursor, end: cursor + d };
    cursor += d;
    return w;
  });
}

export function splitAudioClip(a: AudioClip, t: number): [AudioClip, AudioClip] | null {
  const local = t - a.start;
  const dur = a.outPoint - a.inPoint;
  if (local < MIN_CLIP_DURATION || dur - local < MIN_CLIP_DURATION) return null;
  const cut = a.inPoint + local;
  return [
    { ...a, outPoint: cut, fadeOut: 0 },
    { ...a, id: uid(), start: t, inPoint: cut, fadeIn: 0 },
  ];
}

/** Inserts a held frame of `seconds` at timeline time t, splitting the clip when t is inside it. */
export function insertFreeze(clips: MainClip[], lc: LaidOutClip, t: number, seconds = 2): { clips: MainClip[]; still: MainClip } {
  const still: MainClip = {
    ...lc.clip,
    id: uid(),
    inPoint: sourceTimeFor(lc, Math.min(t, lc.end - 1e-3)),
    freeze: seconds,
    speedCurve: null,
    transition: { ...lc.clip.transition, type: 'none' },
    animIn: { ...lc.clip.animIn, type: 'none' },
    animOut: { ...lc.clip.animOut, type: 'none' },
  };
  const parts = splitMainClip(lc, t);
  return {
    still,
    clips: clips.flatMap((c) => {
      if (c.id !== lc.clip.id) return [c];
      if (parts) return [parts[0], still, parts[1]];
      return t - lc.start < lc.duration / 2 ? [still, c] : [c, still];
    }),
  };
}

/** Timeline times of every Nth beat of a music clip. */
export function beatCuts(a: AudioClip, beats: number[], every: number): number[] {
  return beats
    .filter((b) => b >= a.inPoint && b < a.outPoint)
    .map((b) => a.start + (b - a.inPoint))
    .filter((_, i) => i % every === every - 1);
}

/** Re-times the main track so each clip ends on the next cut time. */
export function retimeToCuts(clips: MainClip[], assets: Map<string, MediaAsset>, cuts: number[]): MainClip[] {
  let cursor = 0;
  return clips.map((c) => {
    const end = cuts.find((x) => x > cursor + 0.3);
    if (end === undefined) {
      cursor += clipDuration(c);
      return c;
    }
    const want = end - cursor;
    const src = assets.get(c.assetId);
    let next: MainClip = c;
    if (c.freeze) next = { ...c, freeze: want };
    else if (src?.kind === 'image') next = { ...c, outPoint: c.inPoint + want };
    else if (src) next = { ...c, outPoint: Math.min(src.duration, c.inPoint + want * c.speed) };
    cursor += clipDuration(next);
    return next;
  });
}

/** Greedy lane assignment so overlapping items on a track don't hide each other. */
export function assignLanes<T extends { id: string }>(
  items: T[],
  range: (item: T) => [number, number]
): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => range(a)[0] - range(b)[0]);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const item of sorted) {
    const [s, e] = range(item);
    let lane = laneEnds.findIndex((end) => end <= s + 1e-6);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else {
      laneEnds[lane] = e;
    }
    lanes.set(item.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

export function snap(value: number, points: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function audioGainAt(a: AudioClip, t: number): number {
  const local = t - a.start;
  const dur = a.outPoint - a.inPoint;
  let g = a.volume;
  if (a.fadeIn > 0 && local < a.fadeIn) g *= clamp(local / a.fadeIn, 0, 1);
  if (a.fadeOut > 0 && dur - local < a.fadeOut) g *= clamp((dur - local) / a.fadeOut, 0, 1);
  return g;
}

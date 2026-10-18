import {
  DEFAULT_IMAGE_DURATION,
  DEFAULT_TRANSITION_DURATION,
  MIN_CLIP_DURATION,
  NEUTRAL_ADJUSTMENTS,
} from './constants';
import {
  AudioClip,
  FrameRef,
  LaidOutClip,
  MainClip,
  MainFrameState,
  MediaAsset,
  Project,
  TextClip,
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
  return (clip.outPoint - clip.inPoint) / clip.speed;
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
  };
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
  return end;
}

export function audioClipEnd(a: AudioClip): number {
  return a.start + (a.outPoint - a.inPoint);
}

export function sourceTimeFor(lc: LaidOutClip, t: number): number {
  const raw = lc.clip.inPoint + (t - lc.start) * lc.clip.speed;
  const max = lc.asset.kind === 'video' ? Math.max(0, lc.asset.duration - 1 / 60) : Number.POSITIVE_INFINITY;
  return clamp(raw, 0, max);
}

const ref = (lc: LaidOutClip, t: number): FrameRef => ({ lc, sourceTime: sourceTimeFor(lc, t) });

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
  const cut = lc.clip.inPoint + local * lc.clip.speed;
  return [
    { ...lc.clip, outPoint: cut },
    { ...lc.clip, id: uid(), inPoint: cut, transition: { ...lc.clip.transition, type: 'none' } },
  ];
}

export function splitTextClip(text: TextClip, t: number): [TextClip, TextClip] | null {
  const local = t - text.start;
  if (local < MIN_CLIP_DURATION || text.duration - local < MIN_CLIP_DURATION) return null;
  return [
    { ...text, duration: local },
    { ...text, id: uid(), start: t, duration: text.duration - local },
  ];
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

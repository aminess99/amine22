import { fileSpeech } from './silence';
import { layoutMainTrack, timelineTimeOf } from './timeline';
import { AudioClip, MediaAsset, Project } from './types';

/**
 * Auto-ducking: music marked with `duck` gets quieter while someone speaks.
 * "Speech" is the sound of the main clips, picture-in-picture videos and the
 * audio tracks that are not ducked themselves (voice-overs, TTS).
 */

/** Seconds the volume takes to go down before speech and back up after it. */
const RAMP = 0.25;
/** Pauses shorter than this keep the music down. */
const BRIDGE = 0.6;

// Speech ranges of a whole file, in source seconds, by asset id.
const speech = new Map<string, [number, number][]>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Called when speech data for a file becomes available, so the preview can refresh. */
export function onSpeechReady(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function loadSpeech(asset: MediaAsset): Promise<void> {
  const known = pending.get(asset.id);
  if (known) return known;
  const job = fileSpeech(asset).then((ranges) => {
    speech.set(asset.id, ranges);
    listeners.forEach((fn) => fn());
  });
  pending.set(asset.id, job);
  return job;
}

const isDucked = (a: AudioClip) => !!a.duck;

/** The files whose speech decides the ducking of this project. */
function speechSources(project: Project, assets: Map<string, MediaAsset>): MediaAsset[] {
  const out = new Map<string, MediaAsset>();
  for (const c of project.clips) {
    const a = assets.get(c.assetId);
    if (a?.kind === 'video' && a.hasAudio && !c.muted && !c.freeze) out.set(a.id, a);
  }
  for (const o of project.overlays) {
    const a = assets.get(o.assetId);
    if (a?.kind === 'video' && a.hasAudio && !o.muted) out.set(a.id, a);
  }
  for (const x of project.audios) {
    const a = assets.get(x.assetId);
    if (a && !isDucked(x)) out.set(a.id, a);
  }
  return [...out.values()];
}

/** Waits until every file the ducking needs has been analysed (used before export). */
export async function prepareDucking(project: Project, assets: Map<string, MediaAsset>) {
  if (!project.audios.some(isDucked)) return;
  await Promise.all(speechSources(project, assets).map(loadSpeech));
}

/**
 * Timeline spans where someone speaks, merged across short pauses. Null while
 * some file is still being analysed (analysis starts on the first call).
 */
export function speechTimeline(project: Project, assets: Map<string, MediaAsset>): [number, number][] | null {
  if (!project.audios.some(isDucked)) return [];
  let ready = true;
  for (const a of speechSources(project, assets)) {
    if (!speech.has(a.id)) {
      ready = false;
      loadSpeech(a);
    }
  }
  if (!ready) return null;

  const spans: [number, number][] = [];
  for (const lc of layoutMainTrack(project.clips, assets)) {
    const { clip, asset } = lc;
    if (asset.kind !== 'video' || !asset.hasAudio || clip.muted || clip.freeze) continue;
    for (const [s, e] of speech.get(asset.id) ?? []) {
      if (e <= clip.inPoint || s >= clip.outPoint) continue;
      const a = timelineTimeOf(lc, Math.max(s, clip.inPoint));
      const b = timelineTimeOf(lc, Math.min(e, clip.outPoint - 1e-3));
      if (a !== null && b !== null) spans.push([a, b]);
    }
  }
  for (const o of project.overlays) {
    const asset = assets.get(o.assetId);
    if (asset?.kind !== 'video' || !asset.hasAudio || o.muted) continue;
    for (const [s, e] of speech.get(asset.id) ?? []) {
      if (e <= o.inPoint || s >= o.outPoint) continue;
      spans.push([o.start + Math.max(s, o.inPoint) - o.inPoint, o.start + Math.min(e, o.outPoint) - o.inPoint]);
    }
  }
  for (const x of project.audios) {
    if (isDucked(x)) continue;
    for (const [s, e] of speech.get(x.assetId) ?? []) {
      if (e <= x.inPoint || s >= x.outPoint) continue;
      spans.push([x.start + Math.max(s, x.inPoint) - x.inPoint, x.start + Math.min(e, x.outPoint) - x.inPoint]);
    }
  }

  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s - last[1] < BRIDGE) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/** Volume multiplier (level..1) for a ducked track at timeline time t. */
export function duckFactor(a: AudioClip, t: number, spans: [number, number][] | null): number {
  if (!a.duck || !spans?.length) return 1;
  const level = a.duck.level;
  let f = 1;
  for (const [s, e] of spans) {
    if (t < s - RAMP) break;
    if (t > e + RAMP) continue;
    const k = t < s ? (s - t) / RAMP : t > e ? (t - e) / RAMP : 0;
    f = Math.min(f, level + (1 - level) * k);
  }
  return f;
}

/** Schedules the ducking on a gain node for an offline (export) render. */
export function scheduleDuck(gain: GainNode, level: number, spans: [number, number][], from: number, to: number) {
  gain.gain.setValueAtTime(1, 0);
  for (const [s, e] of spans) {
    if (e + RAMP < from || s - RAMP > to) continue;
    const down = Math.max(0, s - RAMP);
    gain.gain.setValueAtTime(1, down);
    gain.gain.linearRampToValueAtTime(level, Math.max(down + 0.01, s));
    gain.gain.setValueAtTime(level, Math.max(down + 0.01, e));
    gain.gain.linearRampToValueAtTime(1, e + RAMP);
  }
}

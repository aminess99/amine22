import { clamp } from './timeline';
import { MainClip, OverlayClip, TextClip } from './types';

/** A gesture relative to where it started: movement as a fraction of the canvas, scale factor, rotation in degrees. */
export interface GestureDelta {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}

const SCALE_SNAP = 0.04;
const ANGLE_SNAP = 4;

/** Pulls a scale onto `unity` when it is within a few percent, so 100% is easy to hit. */
export function snapScale(value: number, unity: number): number {
  return Math.abs(value - unity) / unity < SCALE_SNAP ? unity : value;
}

/** Pulls an angle onto the nearest right angle when it is within a few degrees. */
export function snapAngle(deg: number): number {
  const nearest = Math.round(deg / 90) * 90;
  const a = Math.abs(deg - nearest) < ANGLE_SNAP ? nearest : deg;
  return Math.round(a * 10) / 10;
}

export function applyClipGesture(c0: MainClip, d: GestureDelta): MainClip {
  const zoom = snapScale(clamp(c0.zoom * d.scale, 0.2, 5), 1);
  const rotation = snapAngle(c0.rotation + d.rotation);
  const offsetX = clamp(c0.offsetX + d.dx, -1, 1);
  const offsetY = clamp(c0.offsetY + d.dy, -1, 1);
  // A clip with keyframed motion is drawn from its keyframes, so move them along with the base.
  const ratio = zoom / c0.zoom;
  const shift = (t: NonNullable<MainClip['motion']>['from']) => ({
    zoom: t.zoom * ratio,
    offsetX: t.offsetX + (offsetX - c0.offsetX),
    offsetY: t.offsetY + (offsetY - c0.offsetY),
    rotation: t.rotation + (rotation - c0.rotation),
  });
  const motion = c0.motion ? { ...c0.motion, from: shift(c0.motion.from), to: shift(c0.motion.to) } : null;
  return { ...c0, zoom, rotation, offsetX, offsetY, motion };
}

export function applyTextGesture(t0: TextClip, d: GestureDelta): TextClip {
  return {
    ...t0,
    fontSize: Math.round(clamp(t0.fontSize * d.scale, 12, 400)),
    rotation: snapAngle(t0.rotation + d.rotation),
    x: clamp(t0.x + d.dx, 0, 1),
    y: clamp(t0.y + d.dy, 0, 1),
  };
}

export function applyOverlayGesture(o0: OverlayClip, d: GestureDelta): OverlayClip {
  return {
    ...o0,
    scale: clamp(o0.scale * d.scale, 0.05, 2),
    rotation: snapAngle(o0.rotation + d.rotation),
    x: clamp(o0.x + d.dx, 0, 1),
    y: clamp(o0.y + d.dy, 0, 1),
  };
}

export function resetClipTransform(c: MainClip): MainClip {
  return applyClipGesture(c, {
    dx: -c.offsetX,
    dy: -c.offsetY,
    scale: 1 / c.zoom,
    rotation: -c.rotation,
  });
}

const deg = (v: number) => `${Math.round(v)}°`;

export function gestureLabel(item: MainClip | TextClip | OverlayClip, kind: 'clip' | 'text' | 'overlay'): string {
  if (kind === 'clip') {
    const c = item as MainClip;
    return `${Math.round(c.zoom * 100)}% · ${deg(c.rotation)}`;
  }
  if (kind === 'text') {
    const t = item as TextClip;
    return `${t.fontSize}px · ${deg(t.rotation)}`;
  }
  const o = item as OverlayClip;
  return `${Math.round(o.scale * 100)}% · ${deg(o.rotation)}`;
}

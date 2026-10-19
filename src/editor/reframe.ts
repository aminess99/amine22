import { clamp } from './timeline';
import { Keyframe, MainClip, MediaAsset } from './types';

/**
 * Smart reframe: fills the frame with the clip (cover) and moves it so the main
 * subject the vision model tracked stays centred, as keyframes on the clip.
 * Returns null when there is nothing to follow or no room to move.
 */
export function reframeClip(clip: MainClip, asset: MediaAsset, W: number, H: number): MainClip | null {
  const track = asset.analysis?.subject ?? [];
  if (!asset.width || !asset.height) return null;
  const span = clip.outPoint - clip.inPoint;
  if (span <= 0) return null;
  const crop = clip.crop;
  const cropW = crop.w * asset.width;
  const cropH = crop.h * asset.height;
  const zoom = Math.max(1, clip.zoom);
  // Same scaling as the renderer for 'cover'.
  const scale = Math.max(W / cropW, H / cropH) * zoom;
  const dw = cropW * scale;
  const dh = cropH * scale;
  const maxX = Math.max(0, (dw / W - 1) / 2);
  const maxY = Math.max(0, (dh / H - 1) / 2);
  if (maxX < 0.01 && maxY < 0.01) return null;

  const points = track.filter((p) => p.time >= clip.inPoint - 1 && p.time <= clip.outPoint + 1);
  if (!points.length) return null;
  // Offset that puts a subject at (x, y) of the full frame in the middle of the canvas.
  const offsetFor = (x: number, y: number) => {
    const u = (x - crop.x) / crop.w;
    const v = (y - crop.y) / crop.h;
    return { ox: clamp((-(u - 0.5) * dw) / W, -maxX, maxX), oy: clamp((-(v - 0.5) * dh) / H, -maxY, maxY) };
  };
  const raw = points.map((p) => ({ at: clamp((p.time - clip.inPoint) / span, 0, 1), ...offsetFor(p.x, p.y) }));
  // Smooth with neighbours so the camera glides instead of twitching.
  const smooth = raw.map((p, i) => {
    const near = raw.slice(Math.max(0, i - 1), i + 2);
    return { at: p.at, ox: near.reduce((s, q) => s + q.ox, 0) / near.length, oy: near.reduce((s, q) => s + q.oy, 0) / near.length };
  });
  // Keep a keyframe only where the framing really moves.
  const keys: Keyframe[] = [];
  for (const p of smooth) {
    const last = keys[keys.length - 1];
    if (last && p.at - last.at < 0.02) continue;
    if (last && Math.abs(p.ox - last.tf.offsetX) < 0.015 && Math.abs(p.oy - last.tf.offsetY) < 0.015 && p !== smooth[smooth.length - 1]) continue;
    keys.push({ at: p.at, tf: { zoom, offsetX: p.ox, offsetY: p.oy, rotation: clip.rotation } });
  }
  if (keys[0] && keys[0].at > 0) keys.unshift({ at: 0, tf: { ...keys[0].tf } });
  const first = keys[0].tf;
  return {
    ...clip,
    fit: 'cover',
    zoom,
    offsetX: first.offsetX,
    offsetY: first.offsetY,
    motion: keys.length > 1 ? { preset: 'custom', keys } : null,
  };
}

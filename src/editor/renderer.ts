import { activeOverlays, activeTexts, clamp, getMainFrameState, transformAt } from './timeline';
import {
  Adjustments,
  FrameRef,
  LaidOutClip,
  MainClip,
  OverlayClip,
  Project,
  TextBounds,
  TextClip,
  TransitionType,
} from './types';

type Ctx = CanvasRenderingContext2D;

/** Returns the drawable frame for a clip at a source time, or null if not ready yet. */
export type FrameProvider = (ref: FrameRef) => CanvasImageSource | null;

/** Returns the drawable frame for an overlay at a source time. */
export type OverlayFrameProvider = (overlay: OverlayClip, sourceTime: number) => CanvasImageSource | null;

export interface RenderOptions {
  width: number; // base (logical) width; the context is pre-scaled to it
  height: number;
  project: Project;
  layout: LaidOutClip[];
  time: number;
  getFrame: FrameProvider;
  getOverlayFrame: OverlayFrameProvider;
  /** Text or overlay to outline in the preview. */
  selectedId?: string | null;
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function sourceSize(src: CanvasImageSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  if (typeof VideoFrame !== 'undefined' && src instanceof VideoFrame) return [src.displayWidth, src.displayHeight];
  const s = src as { width: number; height: number };
  return [s.width, s.height];
}

export function cssFilter(a: Adjustments, scale = 1): string {
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.sepia > 0) parts.push(`sepia(${a.sepia}%)`);
  if (a.grayscale > 0) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.blur > 0) parts.push(`blur(${a.blur * scale}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

function drawClipFrame(
  ctx: Ctx,
  ref: FrameRef,
  W: number,
  H: number,
  getFrame: FrameProvider,
  background: string,
  extraFilter = ''
) {
  // Every clip paints its own backdrop so letterboxed areas behave during transitions.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  const src = getFrame(ref);
  if (!src) return;
  const [sw, sh] = sourceSize(src);
  if (!sw || !sh) return;
  const clip: MainClip = ref.lc.clip;
  const span = clip.outPoint - clip.inPoint;
  const tf = transformAt(clip, span > 0 ? (ref.sourceTime - clip.inPoint) / span : 0);

  const base = clip.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const scale = base * tf.zoom;
  const dw = sw * scale;
  const dh = sh * scale;

  ctx.save();
  ctx.translate(W / 2 + tf.offsetX * W, H / 2 + tf.offsetY * H);
  if (tf.rotation) ctx.rotate((tf.rotation * Math.PI) / 180);
  // ctx.filter blur is applied in device pixels, so compensate for the context scale.
  const deviceScale = ctx.getTransform().a || 1;
  const filter = cssFilter(clip.adjust, deviceScale);
  ctx.filter = extraFilter ? (filter === 'none' ? extraFilter : `${filter} ${extraFilter}`) : filter;
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';

  const { warmth, vignette } = clip.adjust;
  if (warmth !== 0) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(warmth) / 100) * 0.6;
    ctx.fillStyle = warmth > 0 ? '#ff8a00' : '#0077ff';
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

type LayerDraw = (extraFilter?: string) => void;

function drawTransition(
  ctx: Ctx,
  type: TransitionType,
  rawProgress: number,
  W: number,
  H: number,
  drawA: LayerDraw,
  drawB: LayerDraw
) {
  const p = easeInOut(rawProgress);
  const layer = (fn: LayerDraw, alpha = 1, tx = 0, ty = 0, s = 1, filter = '') => {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (tx || ty) ctx.translate(tx, ty);
    if (s !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
    }
    fn(filter);
    ctx.restore();
  };
  const fill = (color: string, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  switch (type) {
    case 'fade':
      layer(drawA);
      layer(drawB, p);
      return;
    case 'fade-black':
    case 'fade-white': {
      const color = type === 'fade-black' ? '#000' : '#fff';
      if (p < 0.5) {
        layer(drawA);
        fill(color, p * 2);
      } else {
        layer(drawB);
        fill(color, (1 - p) * 2);
      }
      return;
    }
    case 'slide-left':
      layer(drawA, 1, -p * W);
      layer(drawB, 1, (1 - p) * W);
      return;
    case 'slide-right':
      layer(drawA, 1, p * W);
      layer(drawB, 1, -(1 - p) * W);
      return;
    case 'slide-up':
      layer(drawA, 1, 0, -p * H);
      layer(drawB, 1, 0, (1 - p) * H);
      return;
    case 'zoom-in':
      layer(drawB);
      layer(drawA, 1 - p, 0, 0, 1 + p * 0.6);
      return;
    case 'wipe':
      layer(drawA);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * p, H);
      ctx.clip();
      drawB();
      ctx.restore();
      return;
    case 'blur': {
      const scale = ctx.getTransform().a || 1;
      if (p < 0.5) layer(drawA, 1, 0, 0, 1 + p * 0.1, `blur(${p * 2 * 24 * scale}px)`);
      else layer(drawB, 1, 0, 0, 1 + (1 - p) * 0.1, `blur(${(1 - p) * 2 * 24 * scale}px)`);
      return;
    }
    default:
      layer(p < 0.5 ? drawA : drawB);
  }
}

function wrapLines(text: string): string[] {
  return text.split('\n');
}

function drawText(ctx: Ctx, t: TextClip, time: number, W: number, H: number): TextBounds {
  const local = time - t.start;
  const inDur = Math.min(0.45, t.duration / 2);
  const outDur = Math.min(0.4, t.duration / 2);
  const pIn = inDur > 0 ? clamp(local / inDur, 0, 1) : 1;
  const pOut = outDur > 0 ? clamp((t.duration - local) / outDur, 0, 1) : 1;

  let alpha = 1;
  let scale = 1;
  let dy = 0;
  let content = t.text;

  switch (t.animIn) {
    case 'fade':
      alpha *= easeOutCubic(pIn);
      break;
    case 'pop':
      scale *= Math.max(0, easeOutBack(pIn));
      alpha *= clamp(pIn * 3, 0, 1);
      break;
    case 'slide-up':
      dy += (1 - easeOutCubic(pIn)) * H * 0.06;
      alpha *= easeOutCubic(pIn);
      break;
    case 'zoom':
      scale *= 1.6 - 0.6 * easeOutCubic(pIn);
      alpha *= easeOutCubic(pIn);
      break;
    case 'typewriter': {
      const chars = Array.from(t.text);
      const typeDur = Math.min(1.5, t.duration * 0.6);
      const n = Math.ceil(chars.length * clamp(local / typeDur, 0, 1));
      content = chars.slice(0, n).join('');
      break;
    }
  }
  switch (t.animOut) {
    case 'fade':
      alpha *= pOut;
      break;
    case 'pop':
      scale *= easeOutCubic(pOut);
      break;
    case 'slide-down':
      dy += (1 - pOut) * H * 0.06;
      alpha *= pOut;
      break;
  }

  ctx.save();
  ctx.font = `${t.bold ? 800 : 400} ${t.fontSize}px "${t.font}", "Cairo", sans-serif`;
  ctx.direction = ARABIC_RE.test(t.text) ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';

  const lineHeight = t.fontSize * 1.3;
  // Measure the full text so the box doesn't jump while the typewriter reveals it.
  const fullLines = wrapLines(t.text);
  const widths = fullLines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(1, ...widths);
  const blockH = lineHeight * fullLines.length;
  const padX = t.fontSize * 0.35;
  const padY = t.fontSize * 0.15;

  const cx = t.x * W;
  const cy = t.y * H;
  const bounds: TextBounds = {
    id: t.id,
    kind: 'text',
    x: cx - blockW / 2 - padX,
    y: cy - blockH / 2 - padY,
    w: blockW + padX * 2,
    h: blockH + padY * 2,
  };

  if (alpha <= 0.001 || scale <= 0.001) {
    ctx.restore();
    return bounds;
  }

  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy + dy);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  if (t.background) {
    ctx.fillStyle = t.background;
    const r = t.fontSize * 0.2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-blockW / 2 - padX, -blockH / 2 - padY, blockW + padX * 2, blockH + padY * 2, r);
    } else {
      ctx.rect(-blockW / 2 - padX, -blockH / 2 - padY, blockW + padX * 2, blockH + padY * 2);
    }
    ctx.fill();
  }

  const lines = wrapLines(content);
  // In RTL the canvas flips the meaning of 'left'/'right', so use start/end-agnostic x math.
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width;
    let x = 0;
    const fullW = widths[i] ?? lw;
    if (t.align === 'left') x = -blockW / 2 + lw / 2;
    else if (t.align === 'right') x = blockW / 2 - lw / 2;
    else if (content !== t.text) {
      // Typewriter: keep partially typed lines anchored where the full line will sit.
      const rtl = ctx.direction === 'rtl';
      x = rtl ? fullW / 2 - lw / 2 : -fullW / 2 + lw / 2;
    }
    const y = -blockH / 2 + lineHeight * (i + 0.5);

    if (t.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = t.fontSize * 0.15;
      ctx.shadowOffsetY = t.fontSize * 0.05;
    }
    if (t.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.strokeWidth * 2;
      ctx.strokeStyle = t.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
  return bounds;
}

function drawOverlay(
  ctx: Ctx,
  o: OverlayClip,
  time: number,
  W: number,
  H: number,
  getFrame: OverlayFrameProvider
): TextBounds | null {
  const src = getFrame(o, o.inPoint + (time - o.start));
  if (!src) return null;
  const [sw, sh] = sourceSize(src);
  if (!sw || !sh) return null;

  const dur = o.outPoint - o.inPoint;
  const local = time - o.start;
  const animDur = Math.min(0.4, dur / 2);
  const pIn = animDur > 0 ? clamp(local / animDur, 0, 1) : 1;
  const pOut = animDur > 0 ? clamp((dur - local) / animDur, 0, 1) : 1;
  let alpha = o.opacity;
  let scale = 1;
  let dy = 0;
  const apply = (anim: OverlayClip['animIn'], p: number) => {
    const e = easeOutCubic(p);
    if (anim === 'fade') alpha *= e;
    else if (anim === 'pop') scale *= Math.max(0, easeOutBack(p));
    else if (anim === 'slide-up') {
      dy += (1 - e) * H * 0.08;
      alpha *= e;
    }
  };
  apply(o.animIn, pIn);
  apply(o.animOut, pOut);

  const w = o.scale * W;
  const h = (w * sh) / sw;
  const cx = o.x * W;
  const cy = o.y * H;
  const size = o.shape === 'circle' ? Math.min(w, h) : 0;
  const bw = size || w;
  const bh = size || h;
  const bounds: TextBounds = { id: o.id, kind: 'overlay', x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  if (alpha <= 0.001 || scale <= 0.001) return bounds;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(cx, cy + dy);
  if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.beginPath();
  if (o.shape === 'circle') ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  else if (o.shape === 'rounded' && typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.08);
  else ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  if (o.shape === 'circle') {
    // Cover the circle with the centre of the frame.
    const s = size / Math.min(sw, sh);
    ctx.drawImage(src, (-sw * s) / 2, (-sh * s) / 2, sw * s, sh * s);
  } else {
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
  return bounds;
}

/** Draws one composed frame. Shared by the live preview and the exporter. */
export function renderFrame(ctx: Ctx, opts: RenderOptions): TextBounds[] {
  const { width: W, height: H, project, layout, time, getFrame } = opts;
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, W, H);

  const state = getMainFrameState(layout, time);
  if (state.from && state.to && state.transition !== 'none') {
    const a = state.from;
    const b = state.to;
    drawTransition(
      ctx,
      state.transition,
      state.progress,
      W,
      H,
      (f) => drawClipFrame(ctx, a, W, H, getFrame, project.background, f),
      (f) => drawClipFrame(ctx, b, W, H, getFrame, project.background, f)
    );
  } else if (state.from) {
    drawClipFrame(ctx, state.from, W, H, getFrame, project.background);
  }

  const bounds: TextBounds[] = [];
  for (const o of activeOverlays(project.overlays, time)) {
    const b = drawOverlay(ctx, o, time, W, H, opts.getOverlayFrame);
    if (b) bounds.push(b);
  }
  for (const t of activeTexts(project.texts, time)) {
    bounds.push(drawText(ctx, t, time, W, H));
  }

  if (opts.selectedId) {
    const b = bounds.find((x) => x.id === opts.selectedId);
    if (b) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 10]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }
  return bounds;
}

export async function loadFonts(fonts: string[]) {
  if (!document.fonts) return;
  await Promise.all(
    [...new Set(fonts)].flatMap((f) => [
      document.fonts.load(`400 40px "${f}"`).catch(() => []),
      document.fonts.load(`800 40px "${f}"`).catch(() => []),
    ])
  );
}

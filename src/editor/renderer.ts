import { chromaKey, clipAnimState, drawChannelSplit, effectState, maskPath } from './clipFx';
import { drawParticleLayers, processFrame } from './proFx';
import { textAnimState } from './textFx';
import { activeOverlays, activeTexts, clamp, getMainFrameState, textProgress, textTransformAt, transformAt } from './timeline';
import {
  Adjustments,
  EffectItem,
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
  const raw = getFrame(ref);
  if (!raw) return;
  const [rw, rh] = sourceSize(raw);
  if (!rw || !rh) return;
  const clip: MainClip = ref.lc.clip;
  const duration = ref.lc.duration;
  const tf = transformAt(clip, duration > 0 ? ref.localTime / duration : 0);
  const anim = clipAnimState(clip.animIn, clip.animOut, ref.localTime, duration);
  const fx = effectState(clip.effect, ref.lc.start + ref.localTime);

  // Green screen works on the whole frame, then the crop picks the region to show.
  let src: CanvasImageSource = clip.chroma ? chromaKey(raw, rw, rh, clip.chroma) : raw;
  let [sw, sh] = clip.chroma ? sourceSize(src) : [rw, rh];
  const now = ref.lc.start + ref.localTime;
  if (clip.fx?.length) {
    // Pro effects (person segmentation, shaders) work on the whole source frame too.
    // A still picture's person mask never changes; a video's changes with every frame.
    const key = ref.lc.asset.kind === 'image' ? ref.lc.asset.id : `${ref.lc.asset.id}@${ref.sourceTime.toFixed(3)}`;
    const done = processFrame(src, sw, sh, clip.fx, now, key);
    if (done) {
      src = done.canvas;
      [sw, sh] = [done.w, done.h];
    }
  }
  const crop = clip.crop;
  const sx = crop.x * sw;
  const sy = crop.y * sh;
  const cw = Math.max(1, crop.w * sw);
  const ch = Math.max(1, crop.h * sh);
  const cropW = crop.w * rw;
  const cropH = crop.h * rh;

  const base = clip.fit === 'cover' ? Math.max(W / cropW, H / cropH) : Math.min(W / cropW, H / cropH);
  const scale = base * tf.zoom;
  const dw = cropW * scale;
  const dh = cropH * scale;

  ctx.save();
  ctx.globalAlpha *= anim.alpha;
  ctx.translate(W / 2 + (tf.offsetX + anim.dx + fx.dx) * W, H / 2 + (tf.offsetY + anim.dy + fx.dy) * H);
  const rot = tf.rotation + anim.rotation + fx.rotation;
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  const s = anim.scale * fx.scale;
  if (s !== 1) ctx.scale(s, s);
  if (clip.flipH || clip.flipV) ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
  if (clip.mask) {
    maskPath(ctx, clip.mask, dw, dh);
    ctx.clip();
  }
  // ctx.filter blur is applied in device pixels, so compensate for the context scale.
  const deviceScale = Math.abs(ctx.getTransform().a) || 1;
  const filter = cssFilter(clip.adjust, deviceScale);
  // Effect filters give blur in base pixels; scale it like the adjustments.
  const fxFilter = fx.filter.replace(/blur\(([\d.]+)px\)/, (_, n) => `blur(${(Number(n) * deviceScale).toFixed(1)}px)`);
  const fullFilter = [filter === 'none' ? '' : filter, extraFilter, fxFilter].filter(Boolean).join(' ') || 'none';
  if (fx.split > 0) {
    drawChannelSplit(
      ctx,
      (target, w, h) => {
        target.filter = fullFilter;
        target.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
        target.filter = 'none';
      },
      dw,
      dh,
      fx.split * W
    );
  } else {
    ctx.filter = fullFilter;
    ctx.drawImage(src, sx, sy, cw, ch, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
  }
  // Glitch: a few horizontal bands of the frame knocked sideways.
  for (const [y, hgt, shift] of fx.slices) {
    const by = sy + y * ch;
    const bh = Math.min(hgt * ch, sy + ch - by);
    if (bh <= 0) continue;
    ctx.drawImage(src, sx, by, cw, bh, -dw / 2 + shift * W, -dh / 2 + (by - sy) * (dh / ch), dw, bh * (dh / ch));
  }

  const { warmth, vignette } = clip.adjust;
  if (warmth !== 0) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(warmth) / 100) * 0.6 * anim.alpha;
    ctx.fillStyle = warmth > 0 ? '#ff8a00' : '#0077ff';
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  if (vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (fx.scanlines) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    const band = ((ref.lc.start + ref.localTime) * 0.35) % 1;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, band * H, W, H * 0.05);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,90,160,0.25)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (fx.flash !== 0) {
    ctx.save();
    ctx.globalAlpha = Math.abs(fx.flash);
    ctx.fillStyle = fx.flash > 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (clip.fx?.length) {
    ctx.save();
    ctx.globalAlpha *= anim.alpha;
    drawParticleLayers(ctx, clip.fx, now, W, H);
    ctx.restore();
  }
}

export type LayerDraw = (extraFilter?: string) => void;

export function drawTransition(
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
    case 'slide-down':
      layer(drawA, 1, 0, p * H);
      layer(drawB, 1, 0, -(1 - p) * H);
      return;
    case 'cover-left':
    case 'cover-right': {
      const dir = type === 'cover-left' ? 1 : -1;
      layer(drawA, 1, -dir * p * W * 0.3);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = W * 0.04;
      layer(drawB, 1, dir * (1 - p) * W);
      ctx.restore();
      return;
    }
    case 'zoom-out':
      layer(drawA, 1, 0, 0, 1 - p * 0.3);
      layer(drawB, p, 0, 0, 1.6 - p * 0.6);
      return;
    case 'cross-zoom': {
      const scale = ctx.getTransform().a || 1;
      if (p < 0.5) layer(drawA, 1, 0, 0, 1 + p * 1.2, `blur(${p * 30 * scale}px)`);
      else layer(drawB, 1, 0, 0, 1 + (1 - p) * 1.2, `blur(${(1 - p) * 30 * scale}px)`);
      return;
    }
    case 'spin': {
      const half = p < 0.5;
      const k = half ? p * 2 : (1 - p) * 2;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((half ? 1 : -1) * k * Math.PI);
      ctx.scale(1 - k * 0.7, 1 - k * 0.7);
      ctx.translate(-W / 2, -H / 2);
      (half ? drawA : drawB)();
      ctx.restore();
      return;
    }
    case 'circle':
    case 'diamond':
    case 'heart': {
      layer(drawA);
      const r = Math.hypot(W, H) * 0.55 * p * (type === 'heart' ? 1.5 : type === 'diamond' ? 1.42 : 1);
      ctx.save();
      ctx.beginPath();
      if (type === 'circle') ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      else if (type === 'diamond') {
        ctx.moveTo(W / 2, H / 2 - r);
        ctx.lineTo(W / 2 + r, H / 2);
        ctx.lineTo(W / 2, H / 2 + r);
        ctx.lineTo(W / 2 - r, H / 2);
      } else {
        // Heart: two lobes and a point, scaled around the centre.
        const cx = W / 2;
        const cy = H / 2 - r * 0.2;
        ctx.moveTo(cx, cy + r * 0.9);
        ctx.bezierCurveTo(cx - r * 1.3, cy + r * 0.1, cx - r * 0.7, cy - r * 0.9, cx, cy - r * 0.35);
        ctx.bezierCurveTo(cx + r * 0.7, cy - r * 0.9, cx + r * 1.3, cy + r * 0.1, cx, cy + r * 0.9);
      }
      ctx.closePath();
      ctx.clip();
      drawB();
      ctx.restore();
      return;
    }
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down': {
      layer(drawA);
      ctx.save();
      ctx.beginPath();
      if (type === 'wipe-right') ctx.rect(W * (1 - p), 0, W * p, H);
      else if (type === 'wipe-up') ctx.rect(0, H * (1 - p), W, H * p);
      else ctx.rect(0, 0, W, H * p);
      ctx.clip();
      drawB();
      ctx.restore();
      return;
    }
    case 'clock': {
      layer(drawA);
      const r = Math.hypot(W, H);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawB();
      ctx.restore();
      return;
    }
    case 'blinds': {
      layer(drawA);
      const n = 8;
      const band = H / n;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect(0, i * band, W, band * p);
      ctx.clip();
      drawB();
      ctx.restore();
      return;
    }
    case 'doors': {
      // A splits down the middle and swings open onto B.
      layer(drawB);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.beginPath();
        if (side < 0) ctx.rect(0, 0, W / 2, H);
        else ctx.rect(W / 2, 0, W / 2, H);
        ctx.clip();
        ctx.translate(side * p * W * 0.5, 0);
        drawA();
        ctx.restore();
      }
      return;
    }
    case 'whip': {
      // A fast pan with motion blur, switching mid-way.
      const scale = ctx.getTransform().a || 1;
      const blur = Math.sin(p * Math.PI) * 18 * scale;
      if (p < 0.5) layer(drawA, 1, -p * 2 * W * 0.6, 0, 1, `blur(${blur}px)`);
      else layer(drawB, 1, (1 - p) * 2 * W * 0.6, 0, 1, `blur(${blur}px)`);
      return;
    }
    case 'glitch': {
      const cur = p < 0.5 ? drawA : drawB;
      const k = Math.sin(p * Math.PI);
      layer(cur);
      // Shifted colour copies and torn bands at the peak.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      layer(cur, 0.35 * k, -W * 0.03 * k, 0, 1, 'hue-rotate(90deg)');
      layer(cur, 0.35 * k, W * 0.03 * k, 0, 1, 'hue-rotate(-90deg)');
      ctx.restore();
      for (let i = 0; i < 5; i++) {
        const y = ((Math.sin((i + 1) * 12.9898 + Math.floor(p * 20)) * 43758.5453) % 1 + 1) % 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y * H, W, H * 0.05);
        ctx.clip();
        ctx.translate((i % 2 ? 1 : -1) * W * 0.08 * k, 0);
        (i % 2 ? drawB : drawA)();
        ctx.restore();
      }
      return;
    }
    case 'flash': {
      // A quick white flash right on the cut.
      layer(p < 0.5 ? drawA : drawB);
      fill('#fff', Math.max(0, 1 - Math.abs(p - 0.5) * 5));
      return;
    }
    case 'shake': {
      const k = Math.sin(p * Math.PI);
      const dx = Math.sin(p * 90) * W * 0.04 * k;
      const dy = Math.cos(p * 70) * H * 0.03 * k;
      layer(p < 0.5 ? drawA : drawB, 1, dx, dy, 1 + k * 0.08);
      return;
    }
    case 'squeeze': {
      // A squashes to a line, then B springs out of it.
      const half = p < 0.5;
      const k = half ? 1 - p * 2 : (p - 0.5) * 2;
      ctx.save();
      ctx.translate(W / 2, 0);
      ctx.scale(Math.max(0.001, k), 1);
      ctx.translate(-W / 2, 0);
      (half ? drawA : drawB)();
      ctx.restore();
      return;
    }
    default:
      layer(p < 0.5 ? drawA : drawB);
  }
}

function wrapLines(text: string): string[] {
  return text.split('\n');
}

export function drawText(ctx: Ctx, t0: TextClip, time: number, W: number, H: number): TextBounds {
  // Keyframes (when set) move, scale and turn the text through its duration.
  const t: TextClip = t0.keys?.length ? { ...t0, ...textTransformAt(t0, textProgress(t0, time)) } : t0;
  const fs = t.fontSize;
  const anim = textAnimState(t, time, W, H, fs);

  let content = t.text;
  if (anim.chars !== null) content = Array.from(t.text).slice(0, anim.chars).join('');
  else if (anim.words !== null) {
    // Reveal whole words so Arabic letters stay joined.
    let shown = 0;
    content = t.text.replace(/\S+/g, (w) => (shown++ < anim.words! ? w : ''));
    content = content.replace(/[ \t]+$/gm, '');
  }

  ctx.save();
  ctx.font = `${t.bold ? 800 : 400} ${fs}px "${t.font}", "Cairo", sans-serif`;
  ctx.direction = ARABIC_RE.test(t.text) ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';

  const lineHeight = fs * (t.lineHeight ?? 1.3);
  // Measure the full text so the box doesn't jump while a reveal is running.
  const fullLines = wrapLines(t.text);
  const widths = fullLines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(1, ...widths);
  const blockH = lineHeight * fullLines.length;
  const shape = t.bgShape ?? 'box';
  const padX = fs * (shape === 'banner' ? 0.7 : shape === 'pill' ? 0.55 : 0.35);
  const padY = fs * (shape === 'banner' ? 0.25 : 0.15);

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

  const alpha = anim.alpha * (t.opacity ?? 1);
  if (alpha <= 0.001 || anim.scale <= 0.001) {
    ctx.restore();
    return bounds;
  }

  ctx.globalAlpha = alpha;
  ctx.translate(cx + anim.dx, cy + anim.dy);
  const rotation = t.rotation + anim.rotation;
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(anim.scale * anim.scaleX, anim.scale * anim.scaleY);
  if (anim.blur > 0.3 && 'filter' in ctx) {
    // Filters work in device pixels; scale the radius so preview and export match.
    const m = ctx.getTransform();
    ctx.filter = `blur(${(anim.blur * Math.hypot(m.a, m.b)).toFixed(1)}px)`;
  }
  if (anim.reveal !== null) {
    const rtl = ctx.direction === 'rtl';
    const w = (blockW + padX * 2) * anim.reveal;
    const left = rtl ? blockW / 2 + padX - w : -blockW / 2 - padX;
    ctx.beginPath();
    ctx.rect(left, -blockH / 2 - padY - fs, w, blockH + padY * 2 + fs * 2);
    ctx.clip();
  }

  if (t.words?.length && t.highlight) {
    drawWordCaption(ctx, t, time, W);
    ctx.restore();
    return bounds;
  }

  if (t.background) {
    const bx = -blockW / 2 - padX;
    const by = -blockH / 2 - padY;
    const bw = blockW + padX * 2;
    const bh = blockH + padY * 2;
    if (shape === 'outline') {
      ctx.strokeStyle = t.background;
      ctx.lineWidth = fs * 0.08;
      roundRectPath(ctx, bx, by, bw, bh, fs * 0.25);
      ctx.stroke();
    } else if (shape === 'banner') {
      // A slanted ribbon.
      const k = bh * 0.25;
      ctx.fillStyle = t.background;
      ctx.beginPath();
      ctx.moveTo(bx + k, by);
      ctx.lineTo(bx + bw + k, by);
      ctx.lineTo(bx + bw - k, by + bh);
      ctx.lineTo(bx - k, by + bh);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = t.background;
      roundRectPath(ctx, bx, by, bw, bh, shape === 'pill' ? bh / 2 : fs * 0.2);
      ctx.fill();
    }
  }

  const lines = wrapLines(content);
  const color = anim.hue !== null ? `hsl(${anim.hue}, 95%, 62%)` : t.color;
  const color2 = anim.hue !== null ? `hsl(${(anim.hue + 70) % 360}, 95%, 58%)` : t.gradient ?? null;
  const glowColor = t.glow ?? (anim.glow > 0 ? color : null);
  const depth = (t.extrude ?? 0) * fs;
  // In RTL the canvas flips the meaning of 'left'/'right', so use start/end-agnostic x math.
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width;
    let x = 0;
    const fullW = widths[i] ?? lw;
    if (t.align === 'left') x = -blockW / 2 + lw / 2;
    else if (t.align === 'right') x = blockW / 2 - lw / 2;
    else if (content !== t.text) {
      // Partial reveal: keep the line anchored where the full line will sit.
      const rtl = ctx.direction === 'rtl';
      x = rtl ? fullW / 2 - lw / 2 : -fullW / 2 + lw / 2;
    }
    const y = -blockH / 2 + lineHeight * (i + 0.5);

    // 3D depth: the letters repeated down and to the side, darkest at the back.
    if (depth > 0) {
      const steps = Math.min(24, Math.ceil(depth / 1.5));
      ctx.fillStyle = t.extrudeColor ?? '#000000';
      for (let k = steps; k >= 1; k--) {
        const d = (depth * k) / steps;
        if (t.strokeWidth > 0) {
          ctx.lineJoin = 'round';
          ctx.lineWidth = t.strokeWidth * 2;
          ctx.strokeStyle = t.extrudeColor ?? '#000000';
          ctx.strokeText(line, x + d * 0.6, y + d);
        }
        ctx.fillText(line, x + d * 0.6, y + d);
      }
    }

    if (t.shadow) {
      ctx.shadowColor = t.shadowColor ?? 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = fs * (t.shadowBlur ?? 0.15);
      ctx.shadowOffsetX = fs * (t.shadowOffset ?? 0.05) * 0.4;
      ctx.shadowOffsetY = fs * (t.shadowOffset ?? 0.05);
    }
    if (t.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.strokeWidth * 2;
      ctx.strokeStyle = t.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    let fill: string | CanvasGradient = color;
    if (color2) {
      const g = ctx.createLinearGradient(0, y - fs * 0.5, 0, y + fs * 0.5);
      g.addColorStop(0, color);
      g.addColorStop(1, color2);
      fill = g;
    }
    if (anim.glitch > 0) {
      // RGB split: cyan and magenta copies pulled apart.
      const off = fs * 0.07 * anim.glitch;
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(line, x - off, y);
      ctx.fillStyle = '#f0abfc';
      ctx.fillText(line, x + off, y + off * 0.3);
      ctx.globalAlpha = a;
    }
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = fs * (0.25 + 0.35 * anim.glow);
      ctx.fillStyle = fill;
      ctx.fillText(line, x, y);
    }
    ctx.fillStyle = fill;
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
  const raw = getFrame(o, o.inPoint + (time - o.start));
  if (!raw) return null;
  const [rw, rh] = sourceSize(raw);
  if (!rw || !rh) return null;
  let src: CanvasImageSource = o.chroma ? chromaKey(raw, rw, rh, o.chroma) : raw;
  if (o.fx?.length) {
    const done = processFrame(src, rw, rh, o.fx, time, `${o.assetId}@${(o.inPoint + (time - o.start)).toFixed(3)}`);
    if (done) src = done.canvas;
  }
  const [sw, sh] = [rw, rh];

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
  ctx.globalCompositeOperation = o.blend ?? 'source-over';
  ctx.translate(cx, cy + dy);
  if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  if (o.flipH) ctx.scale(-1, 1);
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

/** Colours the "MrBeast" style cycles through, one per word. */
const BEAST_COLORS = ['#facc15', '#4ade80', '#f87171', '#38bdf8', '#c084fc'];

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * A caption whose words light up as they are spoken. Words are laid out in
 * reading order (right to left for Arabic) and wrapped to the frame width;
 * each highlight style decides how the spoken word stands out.
 */
function drawWordCaption(ctx: Ctx, t: TextClip, time: number, W: number) {
  const words = t.words!;
  const hl = t.highlight!;
  const fs = t.fontSize;
  const rtl = ctx.direction === 'rtl';
  // The word being said, or the last one said during a pause.
  let current = words.findIndex((w) => time >= w.start && time < w.end);
  if (current === -1) {
    for (let i = words.length - 1; i >= 0; i--) if (time >= words[i].start) { current = i; break; }
  }
  const sinceStart = current >= 0 ? time - words[current].start : 0;

  const drawWord = (text: string, cx: number, y: number, fill: string | CanvasGradient, glow?: string) => {
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = fs * 0.55;
    } else if (t.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = fs * 0.15;
      ctx.shadowOffsetY = fs * 0.05;
    }
    if (t.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.strokeWidth * 2;
      ctx.strokeStyle = t.strokeColor;
      ctx.strokeText(text, cx, y);
      if (!glow) ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, cx, y);
    if (glow) ctx.fillText(text, cx, y); // a second pass makes the glow read on bright video
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  ctx.textAlign = 'center';

  if (hl.style === 'single') {
    // One word at a time, popping in as it is spoken.
    if (current < 0) return;
    const p = Math.min(1, sinceStart / 0.14);
    const s = 0.7 + 0.3 * (1 - Math.pow(1 - p, 3)) + 0.08 * Math.sin(p * Math.PI);
    ctx.save();
    ctx.scale(s, s);
    drawWord(words[current].text, 0, 0, current % 3 === 1 ? hl.color : t.color);
    ctx.restore();
    drawCaptionEmoji(ctx, t, time, -fs * 1.1);
    return;
  }

  const space = hl.style === 'bubble' ? fs * 0.75 : ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const maxW = W * 0.86;
  const lines: number[][] = [[]];
  let lineW = 0;
  widths.forEach((w, i) => {
    const add = (lines[lines.length - 1].length ? space : 0) + w;
    if (lineW + add > maxW && lines[lines.length - 1].length) {
      lines.push([i]);
      lineW = w;
    } else {
      lines[lines.length - 1].push(i);
      lineW += add;
    }
  });
  const lineHeight = fs * (hl.style === 'bubble' ? 1.6 : 1.35);
  const top = (-lineHeight * lines.length) / 2;

  lines.forEach((line, li) => {
    const total = line.reduce((sum, i) => sum + widths[i], 0) + space * (line.length - 1);
    const y = top + lineHeight * (li + 0.5);
    if (t.background) {
      ctx.fillStyle = t.background;
      roundRectPath(ctx, -total / 2 - fs * 0.35, y - fs * 0.62, total + fs * 0.7, fs * 1.24, fs * 0.2);
      ctx.fill();
    }
    let cursor = rtl ? total / 2 : -total / 2;
    for (const i of line) {
      const w = widths[i];
      const cx = rtl ? cursor - w / 2 : cursor + w / 2;
      cursor += (rtl ? -1 : 1) * (w + space);
      const word = words[i];
      const active = i === current && time < word.end;
      const spoken = time >= word.start;
      // Reveal: only the words said so far are on screen.
      if (hl.style === 'reveal' && !spoken) continue;
      const popIn = active ? 1 + 0.18 * Math.max(0, 1 - sinceStart / 0.18) : 1;
      let fill: string | CanvasGradient = t.color;
      let glow: string | undefined;

      ctx.save();
      switch (hl.style) {
        case 'color':
          if (active) fill = hl.color;
          break;
        case 'karaoke':
          if (spoken) fill = hl.color;
          break;
        case 'pop':
          if (active) {
            fill = hl.color;
            ctx.translate(cx, y);
            ctx.scale(1.12 * popIn, 1.12 * popIn);
            ctx.translate(-cx, -y);
          }
          break;
        case 'beast':
          if (active) {
            fill = BEAST_COLORS[i % BEAST_COLORS.length];
            ctx.translate(cx, y);
            ctx.scale(1.15 * popIn, 1.15 * popIn);
            ctx.translate(-cx, -y);
          }
          break;
        case 'comic':
          if (active) {
            fill = hl.color;
            ctx.translate(cx, y);
            ctx.rotate((-5 * Math.PI) / 180);
            ctx.scale(1.1 * popIn, 1.1 * popIn);
            ctx.translate(-cx, -y);
          }
          break;
        case 'neon':
          if (active) {
            fill = '#ffffff';
            glow = hl.color;
          } else {
            ctx.globalAlpha *= 0.75;
          }
          break;
        case 'gradient':
          if (active) {
            const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
            g.addColorStop(0, hl.color);
            g.addColorStop(1, '#818cf8');
            fill = g;
          }
          break;
        case 'box':
          if (active) {
            ctx.fillStyle = hl.color;
            roundRectPath(ctx, cx - w / 2 - fs * 0.18, y - fs * 0.62, w + fs * 0.36, fs * 1.24, fs * 0.18);
            ctx.fill();
          }
          break;
        case 'bubble':
          ctx.fillStyle = active ? hl.color : '#ffffff';
          roundRectPath(ctx, cx - w / 2 - fs * 0.28, y - fs * 0.66, w + fs * 0.56, fs * 1.32, fs * 0.66);
          ctx.fill();
          break;
        case 'underline':
          if (active) {
            ctx.fillStyle = hl.color;
            const grow = Math.min(1, sinceStart / 0.15);
            roundRectPath(ctx, cx - (w / 2) * grow, y + fs * 0.5, w * grow, fs * 0.13, fs * 0.06);
            ctx.fill();
          }
          break;
        case 'reveal':
          if (active) {
            fill = hl.color;
            const k = Math.min(1, sinceStart / 0.12);
            ctx.globalAlpha *= k;
            ctx.translate(cx, y);
            ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
            ctx.translate(-cx, -y);
          }
          break;
        case 'bounce':
          if (active) {
            fill = hl.color;
            ctx.translate(0, -Math.sin(Math.min(1, sinceStart / 0.3) * Math.PI) * fs * 0.28);
          }
          break;
        case 'outline':
          if (!active) {
            // Hollow letters; the spoken word fills in.
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, fs * 0.05);
            ctx.strokeStyle = t.color;
            ctx.strokeText(word.text, cx, y);
            ctx.restore();
            continue;
          }
          fill = hl.color;
          break;
        case 'marker':
          if (active || spoken) {
            // A highlighter stroke that sweeps across the word as it is said.
            const grow = active ? Math.min(1, sinceStart / 0.2) : 1;
            ctx.save();
            ctx.globalAlpha *= active ? 0.85 : 0.35;
            ctx.fillStyle = hl.color;
            ctx.beginPath();
            const x0 = rtl ? cx + w / 2 + fs * 0.12 - (w + fs * 0.24) * grow : cx - w / 2 - fs * 0.12;
            ctx.moveTo(x0, y - fs * 0.32);
            ctx.lineTo(x0 + (w + fs * 0.24) * grow, y - fs * 0.4);
            ctx.lineTo(x0 + (w + fs * 0.24) * grow, y + fs * 0.4);
            ctx.lineTo(x0, y + fs * 0.46);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          break;
        case 'fire':
          if (active) {
            const g = ctx.createLinearGradient(0, y - fs * 0.5, 0, y + fs * 0.5);
            g.addColorStop(0, '#fde047');
            g.addColorStop(0.5, hl.color);
            g.addColorStop(1, '#dc2626');
            fill = g;
            glow = '#f97316';
          }
          break;
        case 'shadow':
          if (active) {
            // A hard, coloured 3D shadow behind the spoken word.
            ctx.save();
            ctx.fillStyle = hl.color;
            for (let d = 1; d <= 6; d++) ctx.fillText(word.text, cx + d * fs * 0.012, y + d * fs * 0.015);
            ctx.restore();
            ctx.translate(-fs * 0.02, -fs * 0.02);
          }
          break;
        case 'spotlight':
          if (!active) ctx.globalAlpha *= 0.35;
          break;
        case 'wave':
          ctx.translate(0, Math.sin(time * 6 - i * 0.9) * fs * 0.08);
          if (active) fill = hl.color;
          break;
        case 'slide':
          if (active) {
            fill = hl.color;
            const k = Math.min(1, sinceStart / 0.16);
            ctx.globalAlpha *= 0.3 + 0.7 * k;
            ctx.translate(0, (1 - k) * fs * 0.45);
          }
          break;
        case 'glitch':
          if (active && sinceStart < 0.35) {
            // Split colour copies that settle into the word.
            const k = 1 - sinceStart / 0.35;
            const j = Math.sin(time * 90) * fs * 0.06 * k;
            ctx.save();
            ctx.globalAlpha *= 0.8;
            ctx.fillStyle = '#22d3ee';
            ctx.fillText(word.text, cx - j - fs * 0.04 * k, y);
            ctx.fillStyle = '#f0abfc';
            ctx.fillText(word.text, cx + j + fs * 0.04 * k, y);
            ctx.restore();
          }
          if (active) fill = hl.color;
          break;
      }
      drawWord(word.text, cx, y, fill, glow);
      ctx.restore();
    }
  });
  drawCaptionEmoji(ctx, t, time, top - fs * 0.75);
}

/** An emoji that pops in above a caption. */
function drawCaptionEmoji(ctx: Ctx, t: TextClip, time: number, y: number) {
  if (!t.emoji) return;
  const p = Math.min(1, Math.max(0, (time - t.start) / 0.3));
  const s = p < 1 ? 0.4 + 0.8 * p - 0.2 * Math.sin(p * Math.PI) : 1 + 0.04 * Math.sin(time * 6);
  ctx.save();
  ctx.translate(0, y);
  ctx.scale(s, s);
  ctx.font = `${t.fontSize * 1.05}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(t.emoji, 0, 0);
  ctx.restore();
}

/** Draws one composed frame. Shared by the live preview and the exporter. */
/** Runs effects-track items over the whole canvas (pixels in, pixels out) and draws their particles. */
function applyEffectTrack(ctx: Ctx, effects: EffectItem[], time: number, W: number, H: number) {
  const canvas = ctx.canvas;
  const done = processFrame(canvas, canvas.width, canvas.height, effects, time, '');
  if (done) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(done.canvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  drawParticleLayers(ctx, effects, time, W, H);
}

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
  // The effects track works on everything drawn so far; texts stay on top, untouched.
  const effects = (project.effects ?? []).filter((e) => time >= e.start && time < e.start + e.duration);
  if (effects.length) applyEffectTrack(ctx, effects, time, W, H);

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

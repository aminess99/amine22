import { clamp } from './timeline';
import { ChromaKey, ClipAnim, ClipEffect, ClipMask } from './types';

type Ctx = CanvasRenderingContext2D;

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** Deterministic pseudo-random value in [-1, 1] for an integer seed, so preview and export match. */
export function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export interface MotionOffset {
  alpha: number;
  dx: number; // fraction of canvas width
  dy: number; // fraction of canvas height
  scale: number;
  rotation: number; // degrees
}

const IDENTITY: MotionOffset = { alpha: 1, dx: 0, dy: 0, scale: 1, rotation: 0 };

function applyAnim(m: MotionOffset, anim: ClipAnim, p: number, entering: boolean, local: number) {
  if (anim.type === 'none' || p >= 1) return;
  const e = easeOut(p);
  const away = 1 - e; // 1 at the very start of an entrance / end of an exit
  const dir = entering ? 1 : -1;
  switch (anim.type) {
    case 'fade':
      m.alpha *= e;
      break;
    case 'zoom-in':
      m.scale *= entering ? 0.6 + 0.4 * e : 1 + 0.4 * away;
      m.alpha *= e;
      break;
    case 'zoom-out':
      m.scale *= entering ? 1.4 - 0.4 * e : 1 - 0.4 * away;
      m.alpha *= e;
      break;
    case 'slide-left':
      m.dx += away * dir;
      break;
    case 'slide-right':
      m.dx -= away * dir;
      break;
    case 'slide-up':
      m.dy += away * dir;
      break;
    case 'slide-down':
      m.dy -= away * dir;
      break;
    case 'spin':
      m.rotation += away * 180 * dir;
      m.scale *= Math.max(0.01, e);
      break;
    case 'shake':
      m.dx += Math.sin(local * 70) * 0.04 * away;
      m.rotation += Math.sin(local * 55) * 4 * away;
      break;
    case 'pop': {
      // Overshoots then settles.
      const c = 1.70158;
      const back = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
      m.scale *= Math.max(0.01, back);
      m.alpha *= Math.min(1, p * 3);
      break;
    }
    case 'bounce':
      m.scale *= Math.max(0.01, bounceOut(p));
      break;
    case 'drop':
      m.dy -= (1 - bounceOut(p)) * dir;
      break;
    case 'rise': {
      const c = 1.70158;
      const back = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
      m.dy += (1 - back) * 0.6 * dir;
      m.alpha *= Math.min(1, p * 2);
      break;
    }
    case 'swing':
      m.rotation += Math.sin(p * Math.PI * 3) * 12 * away * dir;
      m.alpha *= Math.min(1, p * 2.5);
      break;
    case 'roll':
      m.dx -= away * dir;
      m.rotation -= away * 360 * dir;
      break;
    case 'elastic': {
      const el = p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
      m.scale *= Math.max(0.01, el);
      break;
    }
    case 'whip-left':
    case 'whip-right': {
      // A fast slide that eases hard at the end.
      const fast = 1 - Math.pow(1 - p, 5);
      m.dx += (anim.type === 'whip-left' ? 1 : -1) * (1 - fast) * 1.2 * dir;
      break;
    }
  }
}

function bounceOut(p: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
}

/** Entrance/exit animation offsets at `local` seconds into a clip lasting `duration`. */
export function clipAnimState(animIn: ClipAnim, animOut: ClipAnim, local: number, duration: number): MotionOffset {
  const m = { ...IDENTITY };
  const dIn = Math.min(animIn.duration, duration / 2);
  const dOut = Math.min(animOut.duration, duration / 2);
  if (dIn > 0 && local < dIn) applyAnim(m, animIn, clamp(local / dIn, 0, 1), true, local);
  if (dOut > 0 && duration - local < dOut) applyAnim(m, animOut, clamp((duration - local) / dOut, 0, 1), false, local);
  return m;
}

export interface EffectState extends MotionOffset {
  /** White (positive) or black (negative) flash strength 0..1. */
  flash: number;
  /** Horizontal colour-channel offset in canvas fractions; 0 for none. */
  split: number;
  /** Glitch slices: [y fraction, height fraction, x shift fraction]. */
  slices: [number, number, number][];
  scanlines: boolean;
  /** Extra CSS filter for the frame (e.g. 'blur(4px)'); '' for none. Blur is in base pixels. */
  filter: string;
}

/** Per-frame parameters of a clip's video effect at absolute timeline time t. */
export function effectState(effect: ClipEffect | null, t: number): EffectState {
  const s: EffectState = { ...IDENTITY, flash: 0, split: 0, slices: [], scanlines: false, filter: '' };
  if (!effect) return s;
  const k = clamp(effect.intensity, 0, 1);
  const frame = Math.floor(t * 30);
  switch (effect.type) {
    case 'shake':
      s.dx = noise(frame) * 0.025 * k;
      s.dy = noise(frame + 9999) * 0.025 * k;
      s.rotation = noise(frame + 4242) * 1.5 * k;
      s.scale = 1 + 0.05 * k; // hide the edges that shaking would reveal
      break;
    case 'zoom-pulse': {
      const phase = (t * 2) % 1; // two beats per second
      s.scale = 1 + 0.12 * k * Math.pow(1 - phase, 3);
      break;
    }
    case 'flash': {
      const phase = t % 1;
      s.flash = 0.85 * k * Math.pow(1 - Math.min(1, phase * 4), 2);
      break;
    }
    case 'strobe':
      s.flash = (Math.floor(t * 10) % 2 === 0 ? 0.6 : -0.6) * k;
      break;
    case 'rgb-split':
      s.split = 0.012 * k * (0.6 + 0.4 * Math.sin(t * 6));
      break;
    case 'glitch': {
      // Short bursts a few times a second.
      const burst = noise(Math.floor(t * 4)) > 0.2 && (t * 4) % 1 < 0.45;
      if (burst) {
        s.split = 0.02 * k * Math.abs(noise(frame));
        const count = 3 + Math.floor(Math.abs(noise(frame + 7)) * 4);
        for (let i = 0; i < count; i++) {
          s.slices.push([Math.abs(noise(frame * 3 + i)), 0.02 + Math.abs(noise(frame * 5 + i)) * 0.08, noise(frame * 7 + i) * 0.08 * k]);
        }
      }
      break;
    }
    case 'vhs':
      s.split = 0.004 * k;
      s.scanlines = true;
      s.dx = noise(frame) * 0.002 * k;
      break;
    case 'earthquake':
      s.dx = noise(frame) * 0.06 * k;
      s.dy = noise(frame + 9999) * 0.06 * k;
      s.rotation = noise(frame + 4242) * 4 * k;
      s.scale = 1 + 0.14 * k;
      break;
    case 'zoom-shake': {
      // A punch-in on each beat with a shake that dies away.
      const phase = (t * 1.5) % 1;
      const hit = Math.pow(1 - phase, 4);
      s.scale = 1 + (0.06 + 0.12 * hit) * k;
      s.dx = noise(frame) * 0.03 * hit * k;
      s.dy = noise(frame + 77) * 0.03 * hit * k;
      break;
    }
    case 'heartbeat': {
      const b = t % 1;
      const bump = b < 0.12 ? Math.sin((b / 0.12) * Math.PI) : b > 0.22 && b < 0.34 ? Math.sin(((b - 0.22) / 0.12) * Math.PI) * 0.7 : 0;
      s.scale = 1 + 0.1 * k * bump;
      break;
    }
    case 'bounce':
      s.dy = -Math.abs(Math.sin(t * Math.PI * 2)) * 0.04 * k;
      s.scale = 1 + 0.06 * k;
      break;
    case 'sway':
      s.rotation = Math.sin(t * 2.2) * 3 * k;
      s.dx = Math.sin(t * 1.1) * 0.015 * k;
      s.scale = 1 + 0.08 * k;
      break;
    case 'flicker':
      s.filter = `brightness(${(1 + noise(frame) * 0.35 * k).toFixed(2)})`;
      break;
    case 'blur-pulse':
      s.filter = `blur(${(Math.pow(Math.abs(Math.sin(t * Math.PI)), 3) * 10 * k).toFixed(1)}px)`;
      break;
    case 'bw-pulse':
      s.filter = `grayscale(${Math.round((0.5 + 0.5 * Math.sin(t * Math.PI * 2)) * 100 * k)}%)`;
      break;
    case 'rainbow':
      s.filter = `hue-rotate(${Math.round((t * 180 * k) % 360)}deg) saturate(${(1 + 0.4 * k).toFixed(2)})`;
      break;
    case 'invert':
      s.filter = (t * 2) % 1 < 0.12 * (0.5 + k) ? 'invert(1)' : '';
      break;
    case 'old-film':
      s.scanlines = true;
      s.dy = noise(frame) * 0.004 * k;
      s.filter = `sepia(${Math.round(70 * k)}%) brightness(${(1 + noise(frame + 3) * 0.12 * k).toFixed(2)}) contrast(1.1)`;
      if (noise(Math.floor(t * 3)) > 0.85) s.flash = 0.15 * k;
      break;
    case 'dreamy':
      s.filter = `blur(${(1.5 * k).toFixed(1)}px) brightness(${(1.08 + 0.06 * Math.sin(t * 2)).toFixed(2)}) saturate(1.15)`;
      s.scale = 1 + 0.03 * k * Math.sin(t);
      break;
  }
  return s;
}

/** Builds the clip path for a mask, centred on the origin over a frame of w×h. */
export function maskPath(ctx: Ctx, mask: ClipMask, w: number, h: number) {
  const size = clamp(mask.size, 0.1, 1.5);
  const r = (Math.min(w, h) / 2) * size;
  ctx.beginPath();
  switch (mask.shape) {
    case 'circle':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'rounded': {
      const mw = w * size;
      const mh = h * size;
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-mw / 2, -mh / 2, mw, mh, Math.min(mw, mh) * 0.08);
      else ctx.rect(-mw / 2, -mh / 2, mw, mh);
      break;
    }
    case 'band': {
      const bh = h * size * 0.4;
      ctx.rect(-w, -bh / 2, w * 2, bh);
      break;
    }
    case 'heart': {
      const s = r * 1.1;
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(0, s * 0.1, -s * 0.5, -s * 0.45, -s * 0.95, -s * 0.1);
      ctx.bezierCurveTo(-s * 1.35, s * 0.35, -s * 0.6, s * 0.95, 0, s * 1.15);
      ctx.bezierCurveTo(s * 0.6, s * 0.95, s * 1.35, s * 0.35, s * 0.95, -s * 0.1);
      ctx.bezierCurveTo(s * 0.5, -s * 0.45, 0, s * 0.1, 0, s * 0.35);
      break;
    }
    case 'triangle':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.95, r * 0.7);
      ctx.lineTo(-r * 0.95, r * 0.7);
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.75, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.75, 0);
      ctx.closePath();
      break;
    case 'oval':
      ctx.ellipse(0, 0, (w / 2) * size * 0.9, (h / 2) * size * 0.9, 0, 0, Math.PI * 2);
      break;
    case 'arch': {
      // A window: rounded top, square bottom.
      const aw = w * size * 0.7;
      const ah = h * size * 0.85;
      ctx.moveTo(-aw / 2, ah / 2);
      ctx.lineTo(-aw / 2, -ah / 2 + aw / 2);
      ctx.arc(0, -ah / 2 + aw / 2, aw / 2, Math.PI, 0);
      ctx.lineTo(aw / 2, ah / 2);
      ctx.closePath();
      break;
    }
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      break;
    }
  }
}

// ---------------------------------------------------------------- chroma key

let chromaCanvas: HTMLCanvasElement | null = null;
const CHROMA_MAX_SIDE = 960;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Keys out a colour (green screen). Works in chroma space so shadows on the
 * screen still key out, and pulls the key colour out of the edges (spill).
 */
export function chromaKey(src: CanvasImageSource, sw: number, sh: number, key: ChromaKey): HTMLCanvasElement {
  const scale = Math.min(1, CHROMA_MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  chromaCanvas ??= document.createElement('canvas');
  const c = chromaCanvas;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [kr, kg, kb] = hexToRgb(key.color);
  // Chroma (Cb, Cr) of the key colour.
  const kcb = -0.169 * kr - 0.331 * kg + 0.5 * kb;
  const kcr = 0.5 * kr - 0.419 * kg - 0.081 * kb;
  const lo = 10 + key.similarity * 110;
  const hi = lo + 4 + key.smoothness * 80;
  const dominant = kg >= kr && kg >= kb ? 1 : kb >= kr ? 2 : 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const cb = -0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b;
    const dist = Math.hypot(cb - kcb, cr - kcr);
    if (dist < hi) {
      const a = dist <= lo ? 0 : (dist - lo) / (hi - lo);
      d[i + 3] = Math.round(d[i + 3] * a);
      // Spill: cap the key's channel at the average of the other two.
      if (dominant === 1) d[i + 1] = Math.min(g, (r + b) / 2 + (g - (r + b) / 2) * a);
      else if (dominant === 2) d[i + 2] = Math.min(b, (r + g) / 2 + (b - (r + g) / 2) * a);
      else d[i] = Math.min(r, (g + b) / 2 + (r - (g + b) / 2) * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- colour channel split

let splitCanvas: HTMLCanvasElement | null = null;

/**
 * Draws a frame with its red and blue channels pushed apart horizontally.
 * The caller has already transformed the context so the frame spans (-w/2, -h/2, w, h).
 */
export function drawChannelSplit(
  ctx: Ctx,
  draw: (target: Ctx, w: number, h: number) => void,
  w: number,
  h: number,
  offset: number
) {
  const device = Math.abs(ctx.getTransform().a) || 1;
  const pw = Math.max(1, Math.min(1600, Math.round(w * device)));
  const ph = Math.max(1, Math.round((pw * h) / w));
  splitCanvas ??= document.createElement('canvas');
  const c = splitCanvas;
  if (c.width !== pw || c.height !== ph) {
    c.width = pw;
    c.height = ph;
  }
  const s = c.getContext('2d')!;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const channels: [string, number][] = [
    ['#ff0000', -offset],
    ['#00ff00', 0],
    ['#0000ff', offset],
  ];
  for (const [color, dx] of channels) {
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, pw, ph);
    draw(s, pw, ph);
    s.globalCompositeOperation = 'multiply';
    s.fillStyle = color;
    s.fillRect(0, 0, pw, ph);
    s.globalCompositeOperation = 'destination-in';
    draw(s, pw, ph);
    ctx.drawImage(c, -w / 2 + dx, -h / 2, w, h);
  }
  ctx.restore();
}

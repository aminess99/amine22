import { TextClip } from './types';

/** How a text is drawn at one moment of its in, out and looping animations. */
export interface TextAnimState {
  alpha: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  dx: number;
  dy: number;
  /** Degrees, added to the text's own rotation. */
  rotation: number;
  /** Blur radius in base-resolution pixels. */
  blur: number;
  /** Fraction of the block revealed by a wipe, from the reading start; null shows all. */
  reveal: number | null;
  /** Characters / words shown by the typewriter / word reveal; null shows all. */
  chars: number | null;
  words: number | null;
  /** 0..1 strength of the glitch split. */
  glitch: number;
  /** Rainbow hue in degrees, or null for the text's own colours. */
  hue: number | null;
  /** 0..1 extra glow (neon in, glow loop). */
  glow: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
function easeOutBounce(p: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
}
const easeOutElastic = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
/** Deterministic noise in 0..1, so preview and export flicker the same way. */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const LONG_IN = new Set(['bounce', 'elastic', 'drop', 'glitch', 'neon', 'stamp']);

/** Word count used by the word-by-word reveal. */
export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function textAnimState(t: TextClip, time: number, W: number, H: number, fontSize: number): TextAnimState {
  const s: TextAnimState = { alpha: 1, scale: 1, scaleX: 1, scaleY: 1, dx: 0, dy: 0, rotation: 0, blur: 0, reveal: null, chars: null, words: null, glitch: 0, hue: null, glow: 0 };
  const local = time - t.start;
  const inDur = Math.min(LONG_IN.has(t.animIn) ? 0.75 : 0.45, t.duration / 2);
  const outDur = Math.min(0.4, t.duration / 2);
  const p = inDur > 0 ? clamp01(local / inDur) : 1;
  const q = outDur > 0 ? clamp01((t.duration - local) / outDur) : 1;
  const fs = fontSize;

  switch (t.animIn) {
    case 'fade':
      s.alpha *= easeOutCubic(p);
      break;
    case 'pop':
      s.scale *= Math.max(0, easeOutBack(p));
      s.alpha *= clamp01(p * 3);
      break;
    case 'slide-up':
      s.dy += (1 - easeOutCubic(p)) * H * 0.06;
      s.alpha *= easeOutCubic(p);
      break;
    case 'slide-down':
      s.dy -= (1 - easeOutCubic(p)) * H * 0.06;
      s.alpha *= easeOutCubic(p);
      break;
    case 'slide-left':
      s.dx += (1 - easeOutCubic(p)) * W * 0.3;
      s.alpha *= easeOutCubic(p);
      break;
    case 'slide-right':
      s.dx -= (1 - easeOutCubic(p)) * W * 0.3;
      s.alpha *= easeOutCubic(p);
      break;
    case 'zoom':
      s.scale *= 1.6 - 0.6 * easeOutCubic(p);
      s.alpha *= easeOutCubic(p);
      break;
    case 'zoom-in':
      s.scale *= 0.3 + 0.7 * easeOutCubic(p);
      s.alpha *= easeOutCubic(p);
      break;
    case 'typewriter': {
      const n = Array.from(t.text).length;
      const dur = Math.min(1.5, t.duration * 0.6);
      s.chars = Math.ceil(n * clamp01(local / dur));
      break;
    }
    case 'words': {
      const n = wordCount(t.text);
      const dur = Math.min(n * 0.3, t.duration * 0.6);
      s.words = Math.ceil(n * clamp01(local / Math.max(0.01, dur)));
      break;
    }
    case 'wipe':
      s.reveal = easeInOut(p);
      break;
    case 'bounce':
      s.scale *= easeOutBounce(p);
      break;
    case 'elastic':
      s.scale *= Math.max(0, easeOutElastic(p));
      break;
    case 'blur':
      s.blur += (1 - easeOutCubic(p)) * fs * 0.35;
      s.alpha *= easeOutCubic(p);
      break;
    case 'spin':
      s.rotation -= (1 - easeOutCubic(p)) * 270;
      s.scale *= 0.2 + 0.8 * easeOutCubic(p);
      s.alpha *= clamp01(p * 2);
      break;
    case 'flip':
      s.scaleX *= Math.max(0.001, easeOutBack(p));
      s.alpha *= clamp01(p * 3);
      break;
    case 'drop':
      s.dy -= (1 - easeOutBounce(p)) * H * 0.3;
      s.alpha *= clamp01(p * 4);
      break;
    case 'stamp':
      s.scale *= 1 + Math.pow(1 - clamp01(p * 1.6), 3) * 1.8;
      s.alpha *= clamp01(p * 3);
      if (p > 0.6 && p < 1) s.dx += (noise(local * 90) - 0.5) * fs * 0.08 * (1 - p) * 2.5;
      break;
    case 'glitch':
      if (p < 1) {
        s.glitch = Math.max(s.glitch, 1 - p);
        s.alpha *= noise(Math.floor(local * 24)) > 0.25 ? 1 : 0.15;
        s.dx += (noise(Math.floor(local * 30) + 7) - 0.5) * fs * 0.4 * (1 - p);
      }
      break;
    case 'neon':
      if (p < 1) {
        // A sign struggling to light: on/off flashes that settle.
        const on = noise(Math.floor(local * 14) + 3) < 0.35 + p * 0.65;
        s.alpha *= on ? 1 : 0.08;
        s.glow = Math.max(s.glow, 1 - p * 0.5);
      }
      break;
  }

  const r = 1 - q; // exit progress
  switch (t.animOut) {
    case 'fade':
      s.alpha *= q;
      break;
    case 'pop':
      s.scale *= easeOutCubic(q);
      break;
    case 'slide-down':
      s.dy += r * H * 0.06;
      s.alpha *= q;
      break;
    case 'slide-up':
      s.dy -= r * H * 0.06;
      s.alpha *= q;
      break;
    case 'slide-left':
      s.dx -= r * r * W * 0.3;
      s.alpha *= q;
      break;
    case 'slide-right':
      s.dx += r * r * W * 0.3;
      s.alpha *= q;
      break;
    case 'zoom':
      s.scale *= 1 + r * 0.8;
      s.alpha *= q;
      break;
    case 'wipe':
      if (r > 0) s.reveal = Math.min(s.reveal ?? 1, easeInOut(q));
      break;
    case 'blur':
      s.blur += r * fs * 0.35;
      s.alpha *= q;
      break;
    case 'spin':
      s.rotation += r * 270;
      s.scale *= Math.max(0, 1 - r * 0.8);
      s.alpha *= q;
      break;
    case 'flip':
      s.scaleX *= Math.max(0.001, easeOutCubic(q));
      break;
    case 'fall':
      s.dy += r * r * H * 0.4;
      s.rotation += r * 25;
      s.alpha *= q;
      break;
    case 'glitch':
      if (r > 0) {
        s.glitch = Math.max(s.glitch, r);
        s.alpha *= noise(Math.floor(local * 24) + 11) > 0.3 ? q : 0;
        s.dx += (noise(Math.floor(local * 30) + 5) - 0.5) * fs * 0.4 * r;
      }
      break;
  }

  const tau = Math.PI * 2;
  switch (t.animLoop ?? 'none') {
    case 'pulse':
      s.scale *= 1 + 0.06 * Math.sin(tau * 1.2 * local);
      break;
    case 'heartbeat': {
      const b = local % 1;
      const bump = b < 0.14 ? Math.sin((b / 0.14) * Math.PI) : b > 0.24 && b < 0.38 ? Math.sin(((b - 0.24) / 0.14) * Math.PI) * 0.7 : 0;
      s.scale *= 1 + 0.12 * bump;
      break;
    }
    case 'shake':
      s.dx += Math.sin(local * 47) * fs * 0.035;
      s.dy += Math.cos(local * 39) * fs * 0.025;
      s.rotation += Math.sin(local * 31) * 1.5;
      break;
    case 'wave':
      s.rotation += Math.sin(tau * 0.8 * local) * 4;
      s.dy += Math.sin(tau * 0.8 * local + 1.2) * fs * 0.06;
      break;
    case 'float':
      s.dy += Math.sin(tau * 0.5 * local) * fs * 0.12;
      break;
    case 'bounce':
      s.dy -= Math.abs(Math.sin(Math.PI * 1.6 * local)) * fs * 0.25;
      break;
    case 'swing':
      s.rotation += Math.sin(tau * 0.7 * local) * 8;
      break;
    case 'jelly': {
      const w = Math.sin(tau * 1.5 * local);
      s.scaleX *= 1 + 0.09 * w;
      s.scaleY *= 1 - 0.09 * w;
      break;
    }
    case 'glow':
      s.glow = Math.max(s.glow, 0.5 + 0.5 * Math.sin(tau * local));
      break;
    case 'flicker':
      s.alpha *= noise(Math.floor(local * 12) + 1) > 0.85 ? 0.35 : 1;
      break;
    case 'rainbow':
      s.hue = (local * 120) % 360;
      break;
  }
  return s;
}

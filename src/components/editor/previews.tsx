import React, { useEffect, useRef } from 'react';
import { captionStyleFields } from '../../editor/constants';
import { cssFilter, drawText, drawTransition, renderFrame } from '../../editor/renderer';
import { createMainClip, layoutMainTrack } from '../../editor/timeline';
import { ensureFonts } from '../../editor/fonts';
import { Adjustments, MainClip, MediaAsset, Project, TextClip, TransitionType } from '../../editor/types';

const LOOP_MS = 2400;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Runs a looping Web Animation on an element while it is mounted. */
function useLoop(ref: React.RefObject<HTMLElement | null>, keyframes: Keyframe[], options: KeyframeAnimationOptions, deps: unknown[]) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof el.animate !== 'function') return;
    const anim = el.animate(keyframes, { iterations: Infinity, ...options });
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** The still a preview animates: a clip frame, or a neutral gradient when there is none. */
function Still({ src, filter, className, style }: { src?: string | null; filter?: string; className?: string; style?: React.CSSProperties }) {
  if (!src) {
    return (
      <div
        className={className}
        style={{ ...style, filter, background: 'linear-gradient(135deg,#0ea5e9 0%,#a855f7 55%,#f59e0b 100%)' }}
      />
    );
  }
  return <img src={src} alt="" draggable={false} className={`${className ?? ''} object-cover`} style={{ ...style, filter }} />;
}

export { filmstripFrame as frameAt } from '../../editor/media';

// ---------------------------------------------------------------- filters

/** A frame shown with a filter, including the warmth tint and vignette the canvas adds. */
export function FilterThumb({ src, adjust }: { src?: string | null; adjust: Adjustments }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Still src={src} filter={cssFilter(adjust, 0.25)} className="absolute inset-0 h-full w-full" />
      {adjust.warmth !== 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: adjust.warmth > 0 ? '#ff8a00' : '#0077ff',
            opacity: (Math.min(100, Math.abs(adjust.warmth)) / 100) * 0.6,
            mixBlendMode: 'soft-light',
          }}
        />
      )}
      {adjust.vignette > 0 && (
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle, transparent 40%, rgba(0,0,0,${(adjust.vignette / 100) * 0.85}) 100%)` }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- transitions

type Frames = Keyframe[];
const steady = (k: Keyframe): Frames => [{ ...k, offset: 0 }, { ...k, offset: 1 }];

/** Loads an image once (null while loading or when there is none). */
function useImage(src?: string) {
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!src) return;
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = src;
  }, [src]);
  return img;
}

/**
 * Two frames looping through a transition: the end of the outgoing clip into the
 * start of the next, drawn by the same code as the video.
 */
export function TransitionThumb({ a, b, type }: { a?: string; b?: string; type: TransitionType }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imgA = useImage(a);
  const imgB = useImage(b);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const paint = (img: HTMLImageElement | null, colors: [string, string], W: number, H: number, filter?: string) => {
      ctx.filter = filter || 'none';
      if (img) {
        const k = Math.max(W / img.width, H / img.height);
        ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, colors[0]);
        g.addColorStop(1, colors[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.filter = 'none';
    };
    const draw = (ms: number) => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const t = (ms % LOOP_MS) / LOOP_MS;
      const progress = Math.min(1, Math.max(0, (t - 0.2) / 0.5));
      const layerA = (f?: string) => paint(imgA, ['#0ea5e9', '#a855f7'], w, h, f);
      const layerB = (f?: string) => paint(imgB, ['#f59e0b', '#ef4444'], w, h, f);
      if (progress <= 0) layerA();
      else if (progress >= 1) layerB();
      else drawTransition(ctx, type, progress, w, h, layerA, layerB);
    };
    draw(LOOP_MS * 0.45);
    if (reducedMotion()) return;
    let stop: (() => void) | null = null;
    const start = performance.now();
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !stop) stop = addTicker((now) => draw(now - start));
      else if (!entry.isIntersecting && stop) {
        stop();
        stop = null;
      }
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      stop?.();
    };
  }, [imgA, imgB, type]);
  return <canvas ref={ref} className="block h-full w-full" />;
}

// ---------------------------------------------------------------- clip motion

export function MotionThumb({ src, from, to }: { src?: string; from: React.CSSProperties['transform']; to: React.CSSProperties['transform'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useLoop(ref, [{ transform: from }, { transform: to }], { duration: LOOP_MS, direction: 'alternate', easing: 'ease-in-out' }, [from, to]);
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={ref} className="absolute inset-0">
        <Still src={src} className="h-full w-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- text & overlay animations

const IN_FRAMES: Record<string, Frames> = {
  none: steady({ opacity: 1 }),
  fade: [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 1, offset: 1 }],
  pop: [{ transform: 'scale(0)', offset: 0 }, { transform: 'scale(1.18)', offset: 0.3 }, { transform: 'scale(1)', offset: 0.45 }, { transform: 'scale(1)', offset: 1 }],
  'slide-up': [{ transform: 'translateY(70%)', opacity: 0, offset: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.45 }, { transform: 'translateY(0)', opacity: 1, offset: 1 }],
  zoom: [{ transform: 'scale(1.7)', opacity: 0, offset: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.45 }, { transform: 'scale(1)', opacity: 1, offset: 1 }],
  typewriter: [{ clipPath: 'inset(0 0 0 100%)', offset: 0 }, { clipPath: 'inset(0 0 0 0%)', offset: 0.6 }, { clipPath: 'inset(0 0 0 0%)', offset: 1 }],
};

const OUT_FRAMES: Record<string, Frames> = {
  none: steady({ opacity: 1 }),
  fade: [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.85 }, { opacity: 0, offset: 1 }],
  pop: [{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1)', offset: 0.4 }, { transform: 'scale(0)', offset: 0.85 }, { transform: 'scale(0)', offset: 1 }],
  'slide-down': [{ transform: 'translateY(0)', opacity: 1, offset: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.4 }, { transform: 'translateY(70%)', opacity: 0, offset: 0.85 }, { transform: 'translateY(70%)', opacity: 0, offset: 1 }],
  'slide-up': [{ transform: 'translateY(0)', opacity: 1, offset: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.4 }, { transform: 'translateY(70%)', opacity: 0, offset: 0.85 }, { transform: 'translateY(70%)', opacity: 0, offset: 1 }],
};

/** A selectable chip whose sample animates the way the item will enter or leave. */
export function AnimChip({
  id,
  label,
  phase,
  active,
  sample = 'نص',
  onClick,
}: {
  key?: React.Key;
  id: string;
  label: string;
  phase: 'in' | 'out';
  active: boolean;
  sample?: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const frames = (phase === 'in' ? IN_FRAMES : OUT_FRAMES)[id] ?? steady({ opacity: 1 });
  useLoop(ref, frames, { duration: 1800 }, [id, phase]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] transition ${active ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
    >
      <span className="flex h-8 w-full items-center justify-center overflow-hidden rounded bg-black/40">
        <span ref={ref} className="inline-block text-sm font-black text-white" style={{ fontFamily: '"Cairo", sans-serif' }}>
          {sample}
        </span>
      </span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- templates

export function TemplateThumb({
  frames,
  filter,
  colors,
  title,
}: {
  frames: string[];
  filter: string;
  colors: [string, string];
  title: { text: string; font: string; color: string; stroke: string };
}) {
  const shown = frames.length ? frames.slice(0, 3) : [];
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: `linear-gradient(160deg, ${colors[0]}, ${colors[1]})` }}>
      {shown.map((src, i) => (
        <SlideFrame key={i} src={src} index={i} count={shown.length} filter={filter} />
      ))}
      <span
        className="absolute inset-x-0 top-[30%] truncate px-0.5 text-center text-[9px] font-black leading-tight"
        style={{ fontFamily: `"${title.font}", sans-serif`, color: title.color, WebkitTextStroke: title.stroke ? `0.6px ${title.stroke}` : undefined, paintOrder: 'stroke fill' }}
        dir="auto"
      >
        {title.text}
      </span>
    </div>
  );
}

function SlideFrame({ src, index, count, filter }: { key?: React.Key; src: string; index: number; count: number; filter: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seg = 1 / count;
  const start = index * seg;
  const fade = Math.min(0.08, seg / 4);
  const frames: Frames =
    count === 1
      ? [{ opacity: 1, transform: 'scale(1)', offset: 0 }, { opacity: 1, transform: 'scale(1.15)', offset: 1 }]
      : [
          { opacity: index === 0 ? 1 : 0, transform: 'scale(1)', offset: 0 },
          ...(index === 0 ? [] : [{ opacity: 0, transform: 'scale(1)', offset: start - fade }]),
          { opacity: 1, transform: 'scale(1)', offset: Math.max(0, start) },
          { opacity: 1, transform: 'scale(1.12)', offset: Math.min(1, start + seg) },
          ...(index === count - 1 ? [] : [{ opacity: 0, transform: 'scale(1.12)', offset: Math.min(1, start + seg + fade) }, { opacity: 0, transform: 'scale(1)', offset: 1 }]),
        ];
  useLoop(ref, frames, { duration: 1500 * count }, [src, index, count]);
  return (
    <div ref={ref} className="absolute inset-0">
      <img src={src} alt="" draggable={false} className="h-full w-full object-cover" style={{ filter }} />
    </div>
  );
}

// ---------------------------------------------------------------- caption styles

const SAMPLE_WORDS = ['شاهد', 'الآن'];
const SAMPLE_LOOP = 2.4;
const THUMB_W = 430; // logical width the sample is laid out in
const THUMB_H = 215;

/**
 * A caption style drawn by the real renderer, cycling through a short sample
 * sentence, so the preview is exactly what the video will show.
 */
export function CaptionStyleThumb({ styleId }: { key?: React.Key; styleId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const look = captionStyleFields(styleId);
    // The loop redraws every frame, so the style's font appears as soon as it loads.
    ensureFonts([look.font]).then(() => reducedMotion() && draw(per * 1.5));
    const per = (SAMPLE_LOOP - 0.3) / SAMPLE_WORDS.length;
    const clip: TextClip = {
      ...look,
      id: 'preview',
      text: SAMPLE_WORDS.join(' '),
      start: 0,
      duration: SAMPLE_LOOP,
      x: 0.5,
      y: 0.55,
      rotation: 0,
      align: 'center',
      animIn: 'none',
      animOut: 'none',
      words: SAMPLE_WORDS.map((text, i) => ({ text, start: i * per, end: (i + 1) * per })),
      emoji: '🔥',
    };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const draw = (t: number) => {
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#334155');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.setTransform(w / THUMB_W, 0, 0, h / THUMB_H, 0, 0);
      drawText(ctx, clip, t, THUMB_W, THUMB_H);
    };
    if (reducedMotion()) {
      draw(per * 1.5);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw(((now - start) / 1000) % SAMPLE_LOOP);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [styleId]);
  return <canvas ref={ref} className="block h-full w-full" />;
}

// ---------------------------------------------------------------- live text previews

/** One animation frame loop shared by every visible text preview. */
const tickers = new Set<(now: number) => void>();
let tickRaf = 0;
function tick(now: number) {
  tickers.forEach((fn) => fn(now));
  tickRaf = tickers.size ? requestAnimationFrame(tick) : 0;
}
function addTicker(fn: (now: number) => void) {
  tickers.add(fn);
  if (!tickRaf) tickRaf = requestAnimationFrame(tick);
  return () => {
    tickers.delete(fn);
  };
}

/**
 * Texts drawn by the real renderer on a looping clock, so a preview shows exactly
 * what the video will. Animates only while on screen.
 */
export function TextThumb({
  texts,
  loop,
  width = 1080,
  height = 1080,
  still,
  className,
}: {
  key?: React.Key;
  texts: TextClip[];
  /** Seconds before the preview starts over. */
  loop: number;
  /** Logical size the texts are laid out in. */
  width?: number;
  height?: number;
  /** Time shown when motion is reduced. */
  still?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const signature = JSON.stringify(texts);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let fontsReady = false;
    ensureFonts(textsRef.current.map((t) => t.font)).then(() => {
      fontsReady = true;
      draw(stillTime);
    });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const stillTime = still ?? loop * 0.6;
    const draw = (time: number) => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#334155');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (!fontsReady) return;
      // Cover the thumb with the logical frame, centred.
      const k = Math.max(w / width, h / height);
      ctx.setTransform(k, 0, 0, k, (w - width * k) / 2, (h - height * k) / 2);
      for (const t of textsRef.current) if (time >= t.start && time < t.start + t.duration) drawText(ctx, t, time, width, height);
    };
    draw(stillTime);
    if (reducedMotion()) return;
    let stop: (() => void) | null = null;
    const start = performance.now();
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !stop) stop = addTicker((now) => draw(((now - start) / 1000) % loop));
      else if (!entry.isIntersecting && stop) {
        stop();
        stop = null;
      }
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loop, width, height, still]);
  return <canvas ref={ref} className={className ?? 'block h-full w-full'} />;
}

// ---------------------------------------------------------------- clip effects, animations and masks

let sampleImage: HTMLCanvasElement | null = null;
/** A colourful stand-in frame for clips without a picture yet. */
function sampleFrame(): HTMLCanvasElement {
  if (sampleImage) return sampleImage;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 320, 320);
  g.addColorStop(0, '#0ea5e9');
  g.addColorStop(0.55, '#a855f7');
  g.addColorStop(1, '#f59e0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(160, 140, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(70, 230, 180, 26);
  sampleImage = c;
  return c;
}

/**
 * A clip's frame drawn by the real renderer with one setting changed (an
 * animation, effect or mask), looping, so each option shows what it does.
 */
export function ClipFxThumb({ src, patch, loop = 2 }: { key?: React.Key; src?: string | null; patch: Partial<MainClip>; loop?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useImage(src ?? undefined);
  const signature = JSON.stringify(patch);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const frame: CanvasImageSource = img ?? sampleFrame();
    const fw = img?.width ?? 320;
    const fh = img?.height ?? 320;
    const asset = { id: 'thumb', kind: 'image', name: '', file: null as unknown as File, url: '', duration: 0, width: fw, height: fh, hasAudio: false } as MediaAsset;
    const clip: MainClip = { ...createMainClip(asset), fit: 'cover', outPoint: loop, ...patch };
    const project: Project = { aspect: '1:1', background: '#0b0f17', clips: [clip], texts: [], audios: [], overlays: [] };
    const layout = layoutMainTrack([clip], new Map([['thumb', asset]]));
    const W = 320;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const draw = (time: number) => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(w / W, 0, 0, h / W, 0, 0);
      renderFrame(ctx, { width: W, height: W, project, layout, time: Math.min(time, loop - 0.001), getFrame: () => frame, getOverlayFrame: () => null });
    };
    draw(loop * 0.5);
    if (reducedMotion()) return;
    let stop: (() => void) | null = null;
    const start = performance.now();
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !stop) stop = addTicker((now) => draw(((now - start) / 1000) % loop));
      else if (!entry.isIntersecting && stop) {
        stop();
        stop = null;
      }
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, signature, loop]);
  return <canvas ref={ref} className="block h-full w-full" />;
}

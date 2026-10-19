import { useEffect, useRef } from 'react';
import { captionStyleFields } from '../editor/constants';
import { ensureFonts } from '../editor/fonts';
import { renderFrame } from '../editor/renderer';
import { TEXT_TEMPLATES, templateTexts } from '../editor/textTemplates';
import { createMainClip, layoutMainTrack } from '../editor/timeline';
import { MediaAsset, Project, TextClip } from '../editor/types';
import { CaptionStyleThumb, ClipFxThumb, TextThumb, TransitionThumb } from './editor/previews';

/** Home page previews drawn by the editor's renderer (loaded separately from the page). */

const LOOP = 6;
const SAMPLE = ['هذا', 'محرر', 'فيديو', 'ذكي', 'يفهم', 'كلامك'];

/** A stand-in "video" frame: a sunset scene drawn once. */
function demoFrame(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 960;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 960);
  sky.addColorStop(0, '#1e1b4b');
  sky.addColorStop(0.45, '#7c3aed');
  sky.addColorStop(0.7, '#f97316');
  sky.addColorStop(1, '#0f172a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 540, 960);
  g.fillStyle = '#fde68a';
  g.beginPath();
  g.arc(270, 600, 110, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111827';
  g.beginPath();
  g.moveTo(0, 700);
  g.quadraticCurveTo(140, 560, 290, 690);
  g.quadraticCurveTo(420, 600, 540, 680);
  g.lineTo(540, 960);
  g.lineTo(0, 960);
  g.fill();
  return c;
}

/**
 * The hero: a phone-shaped preview drawn live by the editor's own renderer —
 * camera motion, word-by-word captions, a title template and sparkles.
 */
export function HeroDemo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const frame = demoFrame();
    const asset = { id: 'hero', kind: 'image', name: '', file: null as unknown as File, url: '', duration: 0, width: 540, height: 960, hasAudio: false } as MediaAsset;
    const clip = {
      ...createMainClip(asset),
      fit: 'cover' as const,
      outPoint: LOOP,
      motion: { preset: 'zoom-in', keys: [{ at: 0, tf: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 } }, { at: 1, tf: { zoom: 1.25, offsetX: 0, offsetY: -0.03, rotation: 0 } }] },
    };
    const per = 0.42;
    const caption: TextClip = {
      ...captionStyleFields('beast'),
      id: 'cap',
      text: SAMPLE.join(' '),
      start: 1.4,
      duration: SAMPLE.length * per + 0.6,
      x: 0.5,
      y: 0.72,
      rotation: 0,
      align: 'center',
      animIn: 'none',
      animOut: 'fade',
      words: SAMPLE.map((text, i) => ({ text, start: 1.4 + i * per, end: 1.4 + (i + 1) * per })),
      emoji: '🔥',
    };
    const tpl = TEXT_TEMPLATES.find((t) => t.id === 'gold-3d')!;
    const title = templateTexts(tpl, 0.1).map((t) => ({ ...t, text: 'مونتاج', y: 0.22, duration: 1.3 }));
    const project: Project = {
      aspect: '9:16',
      background: '#000',
      clips: [clip],
      texts: [...title, caption],
      audios: [],
      overlays: [],
      effects: [{ id: 'sp', type: 'sparkles', intensity: 0.6, speed: 1, start: 0, duration: LOOP }],
    };
    const layout = layoutMainTrack([clip], new Map([['hero', asset]]));
    let fontsReady = false;
    ensureFonts([caption.font, ...title.map((t) => t.font)]).then(() => (fontsReady = true));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 540;
    const H = 960;
    const draw = (time: number) => {
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
      renderFrame(ctx, {
        width: W,
        height: H,
        project: fontsReady ? project : { ...project, texts: [] },
        layout,
        time,
        getFrame: () => frame,
        getOverlayFrame: () => null,
      });
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      ensureFonts([caption.font]).then(() => draw(2.6));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw(((now - start) / 1000) % LOOP);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="relative mx-auto w-[230px] sm:w-[260px]">
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-tr from-fuchsia-600/30 via-indigo-600/20 to-cyan-500/30 blur-3xl" />
      <div className="relative rounded-[2.2rem] border border-white/10 bg-slate-900 p-2 shadow-2xl">
        <canvas ref={ref} className="block aspect-[9/16] w-full rounded-[1.7rem]" />
      </div>
    </div>
  );
}

export function FeaturePreview({ kind }: { kind: 'caption' | 'fx' | 'transition' }) {
  if (kind === 'caption') return <CaptionStyleThumb styleId="beast" />;
  if (kind === 'fx') return <ClipFxThumb patch={{ fx: [{ type: 'light-leak', intensity: 0.8 }, { type: 'sparkles', intensity: 0.7 }] }} loop={3} />;
  return <TransitionThumb type="heart" />;
}

export function TemplateCard({ id }: { id: string }) {
  const tpl = TEXT_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return null;
  return <TextThumb texts={templateTexts(tpl, 0.15)} loop={tpl.duration + 0.6} width={1080} height={1350} />;
}

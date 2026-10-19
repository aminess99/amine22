import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  ChevronDown,
  Clapperboard,
  Download,
  Languages,
  MessageSquareText,
  PenLine,
  ScanFace,
  Smartphone,
  Sparkles,
  Store,
  Upload,
  UserRound,
  Wand2,
  GraduationCap,
  Mic,
} from 'lucide-react';
import { BRAND } from '../brand';
import { captionStyleFields } from '../editor/constants';
import { ensureFonts } from '../editor/fonts';
import { renderFrame } from '../editor/renderer';
import { TEXT_TEMPLATES, templateTexts } from '../editor/textTemplates';
import { createMainClip, layoutMainTrack } from '../editor/timeline';
import { MediaAsset, Project, TextClip } from '../editor/types';
import { CaptionStyleThumb, ClipFxThumb, TextThumb, TransitionThumb } from './editor/previews';

interface HomePageProps {
  onStart: () => void;
  onStartWithFiles: (files: File[]) => void;
}

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
function HeroDemo() {
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

const FEATURES: { title: string; text: string; icon: React.ComponentType<{ className?: string }>; preview?: React.ReactNode }[] = [
  {
    title: 'حرّر بالكلام',
    text: 'اكتب "احذف أول 3 ثواني وأضف كابشن" فينفّذ المحرر الخطوات، ويمكنك التراجع بضغطة.',
    icon: Wand2,
  },
  {
    title: 'كابشن تلقائي',
    text: '33 نمطاً متحركاً، كلمة بكلمة ومتزامنة مع الصوت، بالعربية والدارجة.',
    icon: MessageSquareText,
    preview: <CaptionStyleThumb styleId="beast" />,
  },
  {
    title: 'تأثيرات احترافية',
    text: 'أضواء، عدسات، ريترو، جزيئات وتقسيم الشاشة، مع معاينة لكل تأثير.',
    icon: Sparkles,
    preview: <ClipFxThumb patch={{ fx: [{ type: 'light-leak', intensity: 0.8 }, { type: 'sparkles', intensity: 0.7 }] }} loop={3} />,
  },
  {
    title: 'إزالة الخلفية',
    text: 'بدون شاشة خضراء: تمويه الخلفية أو تغييرها أو قص الشخص فوق فيديو آخر.',
    icon: ScanFace,
  },
  {
    title: 'مقاطع قصيرة تلقائية',
    text: 'الذكاء الاصطناعي يشاهد الفيديو الطويل ويقترح أقوى اللحظات لتيك توك وريلز.',
    icon: Clapperboard,
  },
  {
    title: 'انتقالات وقوالب',
    text: '30 انتقالاً و32 قالب نص متحرك و44 خطاً عربياً.',
    icon: PenLine,
    preview: <TransitionThumb type="heart" />,
  },
  {
    title: 'صوت وتعليق',
    text: 'تحويل النص إلى صوت، مؤثرات صوتية، تسجيل تعليق، وتأثيرات على الصوت.',
    icon: AudioLines,
  },
  {
    title: 'يعمل على الهاتف',
    text: 'في المتصفح مباشرة، بدون تثبيت، مع التحكم بالأصابع.',
    icon: Smartphone,
  },
];

const STEPS = [
  { title: 'ارفع فيديو', text: 'من هاتفك أو حاسوبك، فيديو أو صور أو صوت.', icon: Upload },
  { title: 'حرّر بيدك أو بالكلام', text: 'قص، كابشن، تأثيرات… أو اكتب ما تريد وسيفعله الذكاء الاصطناعي.', icon: Wand2 },
  { title: 'صدّر وانشر', text: 'MP4 جاهز لتيك توك وريلز ويوتيوب، بمقاسات 9:16 و16:9 و1:1.', icon: Download },
];

const AUDIENCES = [
  { title: 'صنّاع المحتوى', text: 'كابشن جذاب ومقاطع قصيرة من البث والبودكاست في دقائق.', icon: UserRound },
  { title: 'المتاجر والإعلانات', text: 'فيديو منتج بقوالب السعر والعروض وخلفيات نظيفة.', icon: Store },
  { title: 'المعلمون والدورات', text: 'دروس أوضح بالكابشن والعناوين وحذف الصمت.', icon: GraduationCap },
  { title: 'البودكاست', text: 'قص المقاطع المهمة وإضافة الكابشن والموجات.', icon: Mic },
];

const FAQ = [
  { q: 'هل الموقع مجاني؟', a: 'نعم، المحرر وكل أدواته مجانية حالياً، والتصدير بدون علامة مائية.' },
  { q: 'هل يجب أن أسجّل حساباً؟', a: 'لا. افتح المحرر وابدأ مباشرة. يُحفظ مشروعك تلقائياً في متصفحك.' },
  { q: 'هل يعمل على الهاتف؟', a: 'نعم، على متصفح الهاتف والحاسوب، بدون تثبيت أي تطبيق.' },
  { q: 'أين تذهب فيديوهاتي؟', a: 'التحرير يتم داخل متصفحك. يُرسل الصوت فقط عند طلب الكابشن أو تحليل الذكاء الاصطناعي، ولا نحتفظ به.' },
  { q: 'هل يفهم اللهجات العربية؟', a: 'نعم، الكابشن والأوامر تفهم الفصحى والدارجة، ويمكنك تصحيح أي كلمة بسهولة.' },
  { q: 'ما أقصى طول للفيديو؟', a: 'التحرير بلا حد عملي، وتحليل الذكاء الاصطناعي للفيديو حتى 15 دقيقة.' },
];

function FaqItem({ q, a }: { key?: React.Key; q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-right text-sm font-bold text-white">
        {q}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm leading-relaxed text-slate-400">{a}</p>}
    </div>
  );
}

export function HomePage({ onStart, onStartWithFiles }: HomePageProps) {
  const pick = (
    <label className="relative flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/10">
      <Upload className="h-4 w-4" />
      ارفع فيديو وابدأ
      <input
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          if (files.length) onStartWithFiles(files);
          e.target.value = '';
        }}
      />
    </label>
  );
  const start = (
    <button
      type="button"
      onClick={onStart}
      className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-fuchsia-600 to-indigo-600 px-7 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-fuchsia-600/30 hover:brightness-110"
    >
      ابدأ التحرير مجاناً
      <ArrowLeft className="h-4 w-4" />
    </button>
  );

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <div className="text-center md:text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold text-fuchsia-200">
            <Sparkles className="h-3.5 w-3.5" /> {BRAND.tagline}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            اكتب ما تريد،
            <br />
            <span className="bg-gradient-to-l from-fuchsia-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">والذكاء الاصطناعي يُمَنتِج</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 md:mx-0">
            محرر فيديو كامل في المتصفح: كابشن تلقائي، تأثيرات احترافية، إزالة الخلفية، مقاطع قصيرة، وأوامر بالعربية تنفّذ المونتاج عنك.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center md:justify-start">
            {start}
            {pick}
          </div>
          <p className="mt-4 text-xs text-slate-500">بدون تسجيل · بدون علامة مائية · يعمل على الهاتف</p>
        </div>
        <HeroDemo />
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">كل ما تحتاجه لفيديو احترافي</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400">أدوات مونتاج كاملة مع ذكاء اصطناعي يفهم العربية.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                {f.preview ?? <f.icon className="h-10 w-10 text-fuchsia-300/80" />}
              </div>
              <div className="p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <f.icon className="h-4 w-4 text-fuchsia-300" /> {f.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Commands showcase */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid items-center gap-10 rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/60 to-slate-900 p-6 sm:p-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">المونتاج بالأوامر</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              صِف ما تريد كما تقوله لصديق، فيعرض المحرر الخطوات قبل التنفيذ. يفهم الوقت، والكلام الذي قيل في الفيديو، وحتى ما يظهر في الصورة بعد تحليله.
            </p>
            <div className="mt-6">{start}</div>
          </div>
          <div className="space-y-2.5">
            {['احذف الصمت وأضف كابشن بنمط MrBeast', 'اقطع الجزء الذي فيه السيارة', 'أضف ثلج من الثانية 5 وموسيقى هادئة', 'اصنع مقطعاً قصيراً لتيك توك من أفضل لحظة'].map((c, i) => (
              <div key={c} className={`flex ${i % 2 ? 'justify-start' : 'justify-end'}`}>
                <span className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm text-white">{c}</span>
              </div>
            ))}
            <div className="flex justify-start">
              <span className="rounded-2xl bg-fuchsia-600/80 px-4 py-2.5 text-sm text-white">✓ تم، يمكنك التراجع بضغطة</span>
            </div>
          </div>
        </div>
      </section>

      {/* Templates strip */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">قوالب نصوص متحركة جاهزة</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {['subscribe', 'neon-sign', 'lower-third', 'sale'].map((id) => {
            const tpl = TEXT_TEMPLATES.find((t) => t.id === id)!;
            return (
              <div key={id} className="overflow-hidden rounded-2xl border border-white/10">
                <div className="aspect-[4/5]">
                  <TextThumb texts={templateTexts(tpl, 0.15)} loop={tpl.duration + 0.6} width={1080} height={1350} />
                </div>
                <p className="bg-white/[0.03] py-2 text-center text-xs text-slate-300">{tpl.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">ثلاث خطوات فقط</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-200">
                <s.icon className="h-6 w-6" />
              </div>
              <div className="mt-3 text-xs font-bold text-fuchsia-300">الخطوة {i + 1}</div>
              <h3 className="mt-1 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">لمن {BRAND.name}؟</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <a.icon className="h-6 w-6 text-cyan-300" />
              <h3 className="mt-3 text-sm font-bold text-white">{a.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">أسئلة شائعة</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-l from-fuchsia-600/30 via-indigo-600/30 to-cyan-600/30 p-8 text-center ring-1 ring-white/10 sm:p-12">
          <Languages className="mx-auto h-8 w-8 text-white/80" />
          <h2 className="mt-4 text-2xl font-extrabold text-white sm:text-3xl">جاهز لصنع فيديوك القادم؟</h2>
          <p className="mt-3 text-sm text-slate-300">افتح المحرر الآن، مجاناً وبدون تسجيل.</p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            {start}
            {pick}
          </div>
        </div>
      </section>
    </div>
  );
}

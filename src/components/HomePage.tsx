import React, { lazy, Suspense, useState } from 'react';
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
  Share,
} from 'lucide-react';
import { useInstall } from '../pwa';
import { BRAND } from '../brand';

interface HomePageProps {
  onStart: () => void;
  onStartWithFiles: (files: File[]) => void;
  /** Opens the editor with these files in the auto edit (montage) wizard. */
  onAutoEdit: (files: File[]) => void;
}

// The live previews use the editor's renderer, so they load after the page shows.
const HeroDemo = lazy(() => import('./HomeVisuals').then((m) => ({ default: m.HeroDemo })));
const FeaturePreview = lazy(() => import('./HomeVisuals').then((m) => ({ default: m.FeaturePreview })));
const TemplateCard = lazy(() => import('./HomeVisuals').then((m) => ({ default: m.TemplateCard })));

/** Offers to install the site as an app (or explains how on iPhone). */
function InstallHint() {
  const { mode, install } = useInstall();
  if (mode === 'prompt')
    return (
      <button
        onClick={install}
        className="mx-auto mt-4 flex items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-xs font-bold text-fuchsia-200 hover:bg-fuchsia-500/20 md:mx-0"
      >
        <Download className="h-4 w-4" /> ثبّت مونتاج كتطبيق على جهازك
      </button>
    );
  if (mode === 'ios')
    return (
      <p className="mt-4 text-xs text-slate-400">
        لتثبيته كتطبيق على الآيفون: اضغط زر المشاركة <Share className="inline h-3.5 w-3.5" /> ثم «إضافة إلى الشاشة الرئيسية».
      </p>
    );
  return null;
}

const TEMPLATE_IDS: [string, string][] = [
  ['subscribe', 'اشترك'],
  ['neon-sign', 'لافتة نيون'],
  ['lower-third', 'اسم ولقب'],
  ['sale', 'تخفيض'],
];

const FEATURES: { title: string; text: string; icon: React.ComponentType<{ className?: string }>; preview?: 'caption' | 'fx' | 'transition' }[] = [
  {
    title: 'حرّر بالكلام',
    text: 'اكتب "احذف أول 3 ثواني وأضف كابشن" فينفّذ المحرر الخطوات، ويمكنك التراجع بضغطة.',
    icon: Wand2,
  },
  {
    title: 'كابشن تلقائي',
    text: '33 نمطاً متحركاً، كلمة بكلمة ومتزامنة مع الصوت، بالعربية والدارجة.',
    icon: MessageSquareText,
    preview: 'caption',
  },
  {
    title: 'تأثيرات احترافية',
    text: 'أضواء، عدسات، ريترو، جزيئات وتقسيم الشاشة، مع معاينة لكل تأثير.',
    icon: Sparkles,
    preview: 'fx',
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
    preview: 'transition',
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

export function HomePage({ onStart, onStartWithFiles, onAutoEdit }: HomePageProps) {
  const auto = (big: boolean) => (
    <label
      className={`group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-fuchsia-400/40 bg-gradient-to-l from-fuchsia-600/25 via-indigo-600/20 to-cyan-500/10 text-right shadow-lg shadow-fuchsia-900/30 hover:border-fuchsia-300 ${big ? 'p-4' : 'px-5 py-3.5'}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-fuchsia-600 to-indigo-500 shadow-md">
        <Clapperboard className="h-5 w-5 text-white" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-extrabold text-white">مونتاج تلقائي بالذكاء الاصطناعي</span>
        <span className="block text-xs text-slate-300">ارفع فيديوهاتك، يشاهدها ويكتب خطة، ثم يُمَنتِج الفيديو كاملاً</span>
      </span>
      <Upload className="h-4 w-4 shrink-0 text-fuchsia-200" />
      <input
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          if (files.length) onAutoEdit(files);
          e.target.value = '';
        }}
      />
    </label>
  );
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
          <div className="mx-auto mt-8 max-w-xl md:mx-0">{auto(true)}</div>
          <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center md:justify-start">
            {start}
            {pick}
          </div>
          <p className="mt-4 text-xs text-slate-500">بدون تسجيل · بدون علامة مائية · يعمل على الهاتف</p>
          <InstallHint />
        </div>
        <Suspense fallback={<div className="mx-auto aspect-[9/16] w-[230px] rounded-[2.2rem] border border-white/10 bg-slate-900 sm:w-[260px]" />}>
          <HeroDemo />
        </Suspense>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">كل ما تحتاجه لفيديو احترافي</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400">أدوات مونتاج كاملة مع ذكاء اصطناعي يفهم العربية.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                {f.preview ? (
                  <Suspense fallback={<f.icon className="h-10 w-10 text-fuchsia-300/80" />}>
                    <FeaturePreview kind={f.preview} />
                  </Suspense>
                ) : (
                  <f.icon className="h-10 w-10 text-fuchsia-300/80" />
                )}
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

      {/* Auto edit */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-950/40 via-slate-900 to-indigo-950/40 p-6 sm:p-10">
          <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">مونتاج كامل بضغطة: أنت المخرج، والذكاء الاصطناعي يُنفّذ</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-slate-300">
            ارفع كل لقطاتك ودع الذكاء الاصطناعي يشاهدها: يختار أقوى اللحظات، يرتبها في قصة، ويضيف النصوص والكابشن والموسيقى والانتقالات، وتعليقاً صوتياً إن أردت. وقبل أن يلمس أي شيء يعرض عليك خطة تراجعها وتعدّلها بكلامك.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {[
              ['ارفع لقطاتك', 'فيديوهات وصور وموسيقى إن أردت، واختر المنصة والأسلوب والمدة.'],
              ['يشاهد ويفهم', 'يحلل كل فيديو: المشاهد وجودتها واللحظات المميزة.'],
              ['خطة للمراجعة', 'ترتيب المشاهد والنصوص والموسيقى. عدّلها بكلامك: «اجعله أقصر».'],
              ['مونتاج جاهز', 'يُبنى على الخط الزمني، وتعدّل ما شئت ثم تصدّر.'],
            ].map(([t, d], i) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="text-xs font-bold text-fuchsia-300">{i + 1}</span>
                <h3 className="mt-1 text-sm font-bold text-white">{t}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{d}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-6 max-w-xl">{auto(false)}</div>
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
          {TEMPLATE_IDS.map(([id, label]) => (
            <div key={id} className="overflow-hidden rounded-2xl border border-white/10">
              <div className="aspect-[4/5] bg-slate-900">
                <Suspense fallback={null}>
                  <TemplateCard id={id} />
                </Suspense>
              </div>
              <p className="bg-white/[0.03] py-2 text-center text-xs text-slate-300">{label}</p>
            </div>
          ))}
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

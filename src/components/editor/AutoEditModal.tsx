import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clapperboard,
  Copy,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  Plus,
  RefreshCw,
  Sparkles,
  Subtitles,
  Type,
  X,
} from 'lucide-react';
import { AUTO_STYLES, AutoEditBrief, AutoEditPlan } from '../../editor/autoEditSpec';
import { MAX_AUTO_FOOTAGE, planDuration } from '../../editor/autoEdit';
import { CAPTION_STYLES, FILTER_PRESETS, TRANSITIONS } from '../../editor/constants';
import { fxDef } from '../../editor/proFxCatalog';
import { TEXT_TEMPLATES } from '../../editor/textTemplates';
import { TTS_VOICES } from '../../editor/tts';
import { formatTime } from '../../editor/timeline';
import { MediaAsset } from '../../editor/types';
import { cn } from '../../lib/utils';

export type AutoEditStage =
  | { step: 'brief' }
  | { step: 'working'; status: string; progress: number | null }
  | { step: 'plan'; plan: AutoEditPlan }
  | { step: 'error'; message: string };

interface Props {
  library: MediaAsset[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  loading: boolean;
  stage: AutoEditStage;
  /** Notes about files that could not be analysed, shown with the plan. */
  notes: string[];
  onPlan: (brief: AutoEditBrief) => void;
  onRevise: (feedback: string) => void;
  onBuild: () => void;
  onBack: () => void;
  onClose: () => void;
}

const ASPECTS: { id: AutoEditBrief['aspect']; label: string; hint: string }[] = [
  { id: '9:16', label: 'تيك توك / ريلز / شورتس', hint: '9:16' },
  { id: '16:9', label: 'يوتيوب', hint: '16:9' },
  { id: '1:1', label: 'مربع', hint: '1:1' },
  { id: '4:5', label: 'منشور إنستغرام', hint: '4:5' },
];
const LENGTHS = [15, 30, 60, 90];
const LANGUAGES = ['العربية الفصحى', 'الدارجة المغربية', 'اللهجة الخليجية', 'اللهجة المصرية', 'English', 'Français'];

const label = (list: { id: string; label: string }[], id: string | null | undefined) => list.find((x) => x.id === id)?.label ?? id ?? '';

function Thumb({ asset, time }: { asset?: MediaAsset; time?: number }) {
  if (!asset) return <div className="h-full w-full bg-slate-800" />;
  if (asset.kind === 'image') return <img src={asset.url} alt="" className="h-full w-full object-cover" />;
  const frames = asset.frames ?? [];
  const i = frames.length && time !== undefined ? Math.min(frames.length - 1, Math.floor(time / (asset.frameInterval || 1))) : 0;
  const src = frames[i] ?? asset.thumbnail;
  return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-slate-800"><Film className="h-5 w-5 text-slate-500" /></div>;
}

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
        active ? 'border-fuchsia-400 bg-fuchsia-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
      )}
    >
      {children}
    </button>
  );
};

/** The auto edit ("مونتاج تلقائي") wizard: brief → AI watches and plans → review/revise → build. */
export function AutoEditModal(props: Props) {
  const { library, selected, onToggle, onAddFiles, loading, stage, notes, onPlan, onRevise, onBuild, onBack, onClose } = props;
  const hasAudio = library.some((a) => a.kind === 'audio' && selected.has(a.id));
  const [brief, setBrief] = useState<AutoEditBrief>({
    aspect: '9:16',
    style: 'energetic',
    duration: 30,
    notes: '',
    voiceover: false,
    captions: true,
    music: hasAudio ? 'library' : 'search',
    language: LANGUAGES[0],
  });
  const [feedback, setFeedback] = useState('');
  // Files picked on the home page finish loading after the wizard opens.
  useEffect(() => {
    if (hasAudio) setBrief((b) => (b.music === 'search' ? { ...b, music: 'library' } : b));
  }, [hasAudio]);
  const set = (patch: Partial<AutoEditBrief>) => setBrief((b) => ({ ...b, ...patch }));

  const chosen = library.filter((a) => selected.has(a.id));
  const footage = chosen.filter((a) => a.kind === 'video').reduce((s, a) => s + a.duration, 0);
  const visuals = chosen.filter((a) => a.kind !== 'audio').length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" dir="rtl">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border border-white/10 bg-[#10131a] shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-fuchsia-600 to-indigo-500">
            <Clapperboard className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-extrabold text-white">مونتاج تلقائي بالذكاء الاصطناعي</h2>
            <p className="text-[11px] text-slate-400">يشاهد ملفاتك، يكتب خطة، ثم ينفّذ المونتاج بعد موافقتك.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {stage.step === 'brief' && (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200">1. الملفات ({chosen.length})</h3>
                  <span className={cn('text-[11px]', footage > MAX_AUTO_FOOTAGE ? 'text-amber-300' : 'text-slate-500')}>
                    فيديو: {formatTime(footage)} من {MAX_AUTO_FOOTAGE / 60} دقائق كحد أقصى
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {library.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onToggle(a.id)}
                      className={cn('relative aspect-square overflow-hidden rounded-lg border-2', selected.has(a.id) ? 'border-fuchsia-400' : 'border-transparent opacity-40')}
                      title={a.name}
                    >
                      {a.kind === 'audio' ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-emerald-900/60 p-1 text-emerald-200">
                          <Music className="h-5 w-5" />
                          <span className="w-full truncate text-[9px]">{a.name}</span>
                        </div>
                      ) : (
                        <Thumb asset={a} time={0} />
                      )}
                      {selected.has(a.id) && (
                        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-500">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                      {a.kind === 'video' && <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white drop-shadow">{formatTime(a.duration)}</span>}
                    </button>
                  ))}
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/15 text-slate-400 hover:bg-white/5">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                    <span className="text-[10px]">إضافة</span>
                    <input
                      type="file"
                      multiple
                      accept="video/*,image/*,audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const files: File[] = e.target.files ? Array.from(e.target.files) : [];
                        if (files.length) onAddFiles(files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">فيديوهات وصور، وملف موسيقى إن أردت. اضغط على ملف لاستبعاده.</p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-bold text-slate-200">2. أين ستنشره؟</h3>
                <div className="flex flex-wrap gap-2">
                  {ASPECTS.map((a) => (
                    <Chip key={a.id} active={brief.aspect === a.id} onClick={() => set({ aspect: a.id })}>
                      {a.label} <span className="text-[10px] text-slate-400" dir="ltr">{a.hint}</span>
                    </Chip>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-bold text-slate-200">3. الأسلوب</h3>
                <div className="flex flex-wrap gap-2">
                  {AUTO_STYLES.map((s) => (
                    <Chip key={s.id} active={brief.style === s.id} onClick={() => set({ style: s.id })}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-bold text-slate-200">4. المدة</h3>
                  <div className="flex flex-wrap gap-2">
                    {LENGTHS.map((n) => (
                      <Chip key={n} active={brief.duration === n} onClick={() => set({ duration: n })}>
                        {n} ثانية
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-bold text-slate-200">لغة النصوص والصوت</h3>
                  <select
                    value={brief.language}
                    onChange={(e) => set({ language: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-bold text-slate-200">5. صف الفيديو الذي تريده (اختياري)</h3>
                <textarea
                  value={brief.notes}
                  onChange={(e) => set({ notes: e.target.value.slice(0, 500) })}
                  rows={2}
                  dir="auto"
                  placeholder="مثلاً: إعلان لمطعمي، ركّز على الأطباق وانهِ بـ «اطلب الآن»"
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
                />
              </section>

              <section className="grid gap-2 sm:grid-cols-3">
                <Chip active={brief.captions} onClick={() => set({ captions: !brief.captions })}>
                  <span className="flex items-center justify-center gap-1.5"><Subtitles className="h-4 w-4" /> كابشن تلقائي {brief.captions ? '✓' : ''}</span>
                </Chip>
                <Chip active={brief.voiceover} onClick={() => set({ voiceover: !brief.voiceover })}>
                  <span className="flex items-center justify-center gap-1.5"><Mic className="h-4 w-4" /> تعليق صوتي {brief.voiceover ? '✓' : ''}</span>
                </Chip>
                <select
                  value={brief.music}
                  onChange={(e) => set({ music: e.target.value as AutoEditBrief['music'] })}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                >
                  <option value="library" disabled={!hasAudio}>الموسيقى: من ملفاتي</option>
                  <option value="search">الموسيقى: ابحث لي (Freesound)</option>
                  <option value="none">بدون موسيقى</option>
                </select>
              </section>
            </div>
          )}

          {stage.step === 'working' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-fuchsia-500/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-600 to-indigo-500">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
              </div>
              <p className="max-w-sm whitespace-pre-line text-sm font-semibold text-slate-100">{stage.status}</p>
              {stage.progress !== null && (
                <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-to-l from-fuchsia-500 to-indigo-500 transition-all" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
                </div>
              )}
              <p className="text-[11px] text-slate-500">لا تغلق الصفحة.</p>
            </div>
          )}

          {stage.step === 'error' && (
            <div className="space-y-3 py-10 text-center">
              <p className="text-sm text-red-300">{stage.message}</p>
              <button type="button" onClick={onBack} className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white">
                رجوع
              </button>
            </div>
          )}

          {stage.step === 'plan' && <PlanView plan={stage.plan} library={chosen} notes={notes} />}
        </div>

        <div className="border-t border-white/5 p-3">
          {stage.step === 'brief' && (
            <button
              type="button"
              disabled={!visuals || loading}
              onClick={() => onPlan(brief)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-600/30 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              {visuals ? 'شاهد الملفات واكتب الخطة' : 'أضف فيديو أو صورة أولاً'}
            </button>
          )}
          {stage.step === 'plan' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value.slice(0, 300))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && feedback.trim()) {
                      onRevise(feedback.trim());
                      setFeedback('');
                    }
                  }}
                  dir="auto"
                  placeholder="تريد تغيير شيء؟ مثلاً: اجعله أقصر، ابدأ بمشهد البحر..."
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!feedback.trim()}
                  onClick={() => {
                    onRevise(feedback.trim());
                    setFeedback('');
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> عدّل الخطة
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-xl bg-white/5 px-3 py-3 text-xs text-slate-300">
                  <ArrowRight className="h-4 w-4" /> الإعدادات
                </button>
                <button
                  type="button"
                  onClick={onBuild}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-600/30"
                >
                  <Clapperboard className="h-4 w-4" /> موافق، نفّذ المونتاج
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanView({ plan, library, notes }: { plan: AutoEditPlan; library: MediaAsset[]; notes: string[] }) {
  const total = useMemo(() => planDuration(plan), [plan]);
  const [copied, setCopied] = useState(false);
  const publish = [plan.publish.caption, plan.publish.hashtags.join(' ')].filter(Boolean).join('\n\n');
  const tpl = (id?: string) => TEXT_TEMPLATES.find((t) => t.id === id)?.label;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-extrabold text-white">{plan.title}</h3>
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">≈ {Math.round(total)} ثانية · {plan.segments.length} مشهد</span>
        </div>
        {plan.idea && <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{plan.idea}</p>}
        {plan.hook && (
          <p className="mt-2 text-xs text-amber-200">
            <span className="font-bold">البداية الجاذبة: </span>
            {plan.hook}
          </p>
        )}
      </div>
      {notes.length > 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">{notes.join(' ')}</p>}

      <div>
        <h4 className="mb-2 text-xs font-bold text-slate-200">ترتيب المشاهد</h4>
        <ol className="space-y-2">
          {plan.segments.map((s, i) => {
            const asset = library[s.media - 1];
            return (
              <li key={i} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg sm:h-20 sm:w-20">
                  <Thumb asset={asset} time={(s.start + s.end) / 2} />
                  <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    {asset?.kind === 'image' ? <ImageIcon className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    <span className="truncate">{asset?.name}</span>
                    <span dir="ltr" className="shrink-0 tabular-nums">
                      {asset?.kind === 'image' ? `${(s.end - s.start).toFixed(1)}s` : `${formatTime(s.start, true)} → ${formatTime(s.end, true)}`}
                    </span>
                    {s.speed && s.speed !== 1 && <span className="shrink-0 text-cyan-300">×{s.speed}</span>}
                  </div>
                  <p className="text-xs text-slate-200">{s.why}</p>
                  <div className="flex flex-wrap gap-1">
                    {s.text && (
                      <span className="flex items-center gap-1 rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
                        <Type className="h-3 w-3" /> {s.text}
                      </span>
                    )}
                    {s.effect && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">تأثير: {fxDef(s.effect)?.label ?? s.effect}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <Info title="الانتقالات والألوان" text={`${label(TRANSITIONS, plan.transition)}${plan.filter ? ` · فلتر ${label(FILTER_PRESETS, plan.filter)}` : ''}`} />
        <Info title="الصوت الأصلي" text={plan.original_audio === 'keep' ? 'يبقى مسموعاً' : 'مكتوم'} />
        <Info title="الكابشن" text={plan.captions.on ? `نمط ${label(CAPTION_STYLES, plan.captions.style)}` : 'بدون كابشن'} />
        <Info
          title="الموسيقى"
          text={plan.music ? (plan.music.media ? `${library[plan.music.media - 1]?.name ?? ''} · ${Math.round(plan.music.volume * 100)}%` : `بحث: "${plan.music.query}" · ${Math.round(plan.music.volume * 100)}%`) : 'بدون موسيقى'}
        />
        {(plan.opening || plan.ending) && (
          <Info
            title="العنوان والخاتمة"
            text={[plan.opening && `البداية: ${tpl(plan.opening.template)} «${plan.opening.texts.join(' / ')}»`, plan.ending && `النهاية: ${tpl(plan.ending.template)} «${plan.ending.texts.join(' / ')}»`].filter(Boolean).join(' · ')}
          />
        )}
        {plan.sfx_on_cuts && <Info title="مؤثرات" text={`صوت عند كل انتقال (${plan.sfx_on_cuts})`} />}
      </div>

      {plan.voiceover && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Mic className="h-3.5 w-3.5" /> التعليق الصوتي ({label(TTS_VOICES, plan.voiceover.voice)})
          </h4>
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-300">{plan.voiceover.script}</p>
        </div>
      )}

      {publish && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200">نص المنشور</h4>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(publish).then(() => setCopied(true)).catch(() => {})}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? 'تم النسخ' : 'نسخ'}
            </button>
          </div>
          <p className="select-text whitespace-pre-line text-xs text-slate-300">{publish}</p>
        </div>
      )}
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] text-slate-500">{title}</p>
      <p className="text-xs text-slate-200">{text}</p>
    </div>
  );
}

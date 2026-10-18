import React from 'react';
import { Captions, Check, Film, Image as ImageIcon, Layers, Loader2, Music, Plus, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FILTER_PRESETS, STICKERS, TEXT_PRESETS, TRANSITIONS, presetAdjustments } from '../../editor/constants';
import { PROJECT_TEMPLATES, templatePreview } from '../../editor/templates';
import { FilterThumb, TemplateThumb, TransitionThumb } from './previews';
import { cssFilter } from '../../editor/renderer';
import { formatTime } from '../../editor/timeline';
import { AssetKind, MediaAsset, TransitionType } from '../../editor/types';

function UploadButton({
  accept,
  label,
  hint,
  onFiles,
  loading,
}: {
  accept: string;
  label: string;
  hint: string;
  onFiles: (files: File[]) => void;
  loading: number;
}) {
  // The input covers the whole card so the tap reaches it directly; some in-app
  // browsers refuse to open the picker from a script-triggered click.
  return (
    <label className="relative flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-400/5 px-4 py-5 text-center transition-colors hover:bg-cyan-400/10">
      {loading > 0 ? <Loader2 className="h-6 w-6 animate-spin text-cyan-300" /> : <Upload className="h-6 w-6 text-cyan-300" />}
      <span className="text-sm font-bold text-white">{loading > 0 ? `جاري التحميل (${loading})...` : label}</span>
      <span className="text-[11px] text-slate-400">{hint}</span>
      <input
        type="file"
        accept={accept}
        multiple
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </label>
  );
}

function AssetCard({ asset, onAdd, onOverlay }: { key?: React.Key; asset: MediaAsset; onAdd: () => void; onOverlay?: () => void }) {
  const Icon = asset.kind === 'video' ? Film : asset.kind === 'image' ? ImageIcon : Music;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-asset-id', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="group relative aspect-square cursor-grab overflow-hidden rounded-lg bg-slate-800 ring-1 ring-white/5"
    >
      {asset.thumbnail ? (
        <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-700/40 to-slate-800">
          <Music className="h-7 w-7 text-emerald-300" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate" dir="auto">{asset.name}</span>
        {asset.duration > 0 && <span className="mr-auto shrink-0 tabular-nums">{formatTime(asset.duration)}</span>}
      </div>
      <button
        type="button"
        onClick={onAdd}
        title="إضافة إلى الخط الزمني"
        className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-lg transition-transform hover:scale-110"
      >
        <Plus className="h-4 w-4" />
      </button>
      {onOverlay && (
        <button
          type="button"
          onClick={onOverlay}
          title="إضافة كطبقة فوق الفيديو"
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition-transform hover:scale-110"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface MediaPanelProps {
  assets: MediaAsset[];
  kinds: AssetKind[];
  loading: number;
  onFiles: (files: File[]) => void;
  onAdd: (asset: MediaAsset) => void;
  onOverlay?: (asset: MediaAsset) => void;
}

export function MediaPanel({ assets, kinds, loading, onFiles, onAdd, onOverlay }: MediaPanelProps) {
  const isAudio = kinds.includes('audio');
  const list = assets.filter((a) => kinds.includes(a.kind));
  return (
    <div className="space-y-4 p-4">
      <UploadButton
        accept={isAudio ? 'audio/*' : 'video/*,image/*'}
        label={isAudio ? 'رفع موسيقى أو مؤثر صوتي' : 'استيراد فيديو أو صور'}
        hint={isAudio ? 'MP3 · WAV · M4A · OGG' : 'MP4 · MOV · WEBM · JPG · PNG'}
        onFiles={onFiles}
        loading={loading}
      />
      {list.length > 0 ? (
        <>
          <p className="text-[11px] text-slate-500">
            اضغط + للإضافة، أو اسحب العنصر إلى الخط الزمني.
            {onOverlay && ' الزر البرتقالي يضيفه كطبقة فوق الفيديو.'}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {list.map((a) => (
              <AssetCard key={a.id} asset={a} onAdd={() => onAdd(a)} onOverlay={onOverlay && (() => onOverlay(a))} />
            ))}
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-xs text-slate-500">
          {isAudio ? 'لا توجد ملفات صوتية بعد.' : 'مكتبتك فارغة. ابدأ باستيراد مقاطعك.'}
        </p>
      )}
    </div>
  );
}

interface CaptionTool {
  busy: boolean;
  status: string | null;
  run: (wordsPerCaption: number) => void;
}

export function TextPanel({ onAdd, captions }: { onAdd: (presetId: string) => void; captions: CaptionTool }) {
  const [words, setWords] = React.useState(3);
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2 rounded-xl bg-violet-500/10 p-3 ring-1 ring-violet-400/20">
        <div className="flex items-center gap-2 text-sm font-bold text-violet-100">
          <Captions className="h-4 w-4" /> كابشن تلقائي بالذكاء الاصطناعي
        </div>
        <p className="text-[11px] leading-relaxed text-violet-200/70">يفرّغ كلام الفيديو ويضيفه كنصوص متزامنة على الخط الزمني.</p>
        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span>كلمات في كل سطر:</span>
          {[1, 2, 3, 5].map((n) => (
            <button key={n} type="button" onClick={() => setWords(n)}
              className={cn('h-6 w-6 rounded-md', words === n ? 'bg-violet-400 text-slate-950' : 'bg-white/5 hover:bg-white/10')}>
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={captions.busy}
          onClick={() => captions.run(words)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {captions.busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {captions.busy ? 'جاري التفريغ...' : 'إنشاء الكابشن'}
        </button>
        {captions.status && <p className="text-[11px] text-violet-100/80">{captions.status}</p>}
      </div>
    <div className="grid grid-cols-2 gap-2">
      {TEXT_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAdd(p.id)}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-800/80 p-2 ring-1 ring-white/5 transition hover:ring-cyan-400/60"
        >
          <span
            className="max-w-full truncate px-1.5 text-lg leading-tight"
            dir="auto"
            style={{
              fontFamily: `"${p.style.font}"`,
              fontWeight: p.style.bold ? 800 : 400,
              color: p.style.color,
              background: p.style.background ?? undefined,
              WebkitTextStroke: p.style.strokeWidth ? `${Math.min(4, p.style.strokeWidth / 2)}px ${p.style.strokeColor}` : undefined,
              paintOrder: 'stroke fill',
              textShadow: p.style.shadow ? '0 2px 6px rgba(0,0,0,0.6)' : undefined,
              borderRadius: 4,
            }}
          >
            {p.style.text}
          </span>
          <span className="text-[11px] text-slate-400">{p.label}</span>
        </button>
      ))}
    </div>
    </div>
  );
}

interface FiltersPanelProps {
  thumbnail?: string;
  currentId: string | null;
  disabled: boolean;
  onApply: (filterId: string) => void;
  onApplyAll: (filterId: string) => void;
}

export function FiltersPanel({ thumbnail, currentId, disabled, onApply, onApplyAll }: FiltersPanelProps) {
  return (
    <div className="p-4">
      {disabled ? (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">أضف مقطعاً إلى الخط الزمني أولاً.</p>
      ) : (
        <p className="mb-3 text-[11px] text-slate-500">المعاينة على الإطار الحالي من فيديوك. الفلتر يُطبَّق على المقطع المحدد أو المقطع عند مؤشر التشغيل.</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {FILTER_PRESETS.map((f) => {
          const active = currentId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => onApply(f.id)}
              className="group text-center disabled:opacity-40"
            >
              <div
                className={cn(
                  'relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-sky-500 via-fuchsia-500 to-amber-400 ring-2 transition',
                  active ? 'ring-cyan-400' : 'ring-transparent group-hover:ring-white/30'
                )}
              >
                <FilterThumb src={thumbnail} adjust={presetAdjustments(f.id)} />
                {active && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Check className="h-5 w-5 text-cyan-300" />
                  </div>
                )}
              </div>
              <span className="mt-1 block text-[11px] text-slate-300">{f.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled || !currentId}
        onClick={() => currentId && onApplyAll(currentId)}
        className="mt-4 w-full rounded-lg bg-white/5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"
      >
        تطبيق الفلتر الحالي على كل المقاطع
      </button>
    </div>
  );
}

interface TransitionsPanelProps {
  frames: { a?: string; b?: string };
  currentType: TransitionType | null;
  disabled: boolean;
  onApply: (type: TransitionType) => void;
  onApplyAll: (type: TransitionType) => void;
}

export function TransitionsPanel({ frames, currentType, disabled, onApply, onApplyAll }: TransitionsPanelProps) {
  return (
    <div className="p-4">
      {disabled ? (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">تحتاج مقطعين على الأقل لإضافة انتقال.</p>
      ) : (
        <p className="mb-3 text-[11px] text-slate-500">
          اختر نقطة القطع بالضغط على زر <span className="inline-block rounded bg-slate-700 px-1">⇄</span> بين مقطعين في الخط الزمني.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {TRANSITIONS.map((t) => {
          const active = currentType === t.id;
          return (
            <button key={t.id} type="button" disabled={disabled} onClick={() => onApply(t.id)} className="group text-center disabled:opacity-40">
              <div
                className={cn(
                  'relative aspect-[3/4] overflow-hidden rounded-lg bg-slate-800 ring-2 transition',
                  active ? 'ring-cyan-400' : 'ring-transparent group-hover:ring-white/30'
                )}
              >
                <TransitionThumb a={frames.a} b={frames.b} type={t.id} />
              </div>
              <span className="mt-1 block text-[11px] text-slate-300">{t.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled || !currentType}
        onClick={() => currentType && onApplyAll(currentType)}
        className="mt-4 w-full rounded-lg bg-white/5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"
      >
        تطبيق على كل نقاط القطع
      </button>
    </div>
  );
}

export function StickersPanel({ onAdd }: { onAdd: (emoji: string) => void }) {
  return (
    <div className="space-y-4 p-4">
      {STICKERS.map((g) => (
        <div key={g.group}>
          <p className="mb-2 text-[11px] font-semibold text-slate-400">{g.group}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {g.items.map((e) => (
              <button key={e} type="button" onClick={() => onAdd(e)}
                className="flex aspect-square items-center justify-center rounded-lg bg-white/5 text-2xl transition hover:scale-110 hover:bg-white/10 active:scale-150">
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-500">الملصق يُضاف عند مؤشر التشغيل، وتستطيع تكبيره وتحريكه وإضافة حركة له مثل النص.</p>
    </div>
  );
}

export function TemplatesPanel({ disabled, frames, onApply }: { disabled: boolean; frames: string[]; onApply: (id: string) => void }) {
  return (
    <div className="space-y-3 p-4">
      {disabled ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">أضف مقاطعك أو صورك أولاً، ثم اختر قالباً لتنسيقها تلقائياً.</p>
      ) : (
        <p className="text-[11px] text-slate-500">القالب يعيد تنسيق المقاطع الموجودة (فلاتر، انتقالات، حركة) ويضيف عنواناً. يمكنك التراجع بـ Ctrl+Z.</p>
      )}
      {PROJECT_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={disabled}
          onClick={() => onApply(t.id)}
          className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2.5 text-right ring-1 ring-white/5 transition hover:ring-cyan-400/50 disabled:opacity-40"
        >
          <div className="h-20 w-12 shrink-0 overflow-hidden rounded-md">
            <TemplateThumb frames={frames} colors={t.colors} {...templatePreview(t.id)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">{t.label}</p>
            <p className="text-[11px] text-slate-400">{t.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

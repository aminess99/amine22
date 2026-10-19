import React from 'react';
import { Check, Clapperboard, Copy, Crop, Eye, Loader2, Play, ScanEye } from 'lucide-react';
import { formatTime } from '../../editor/timeline';

export interface AiShort {
  key: string;
  start: number;
  end: number;
  title: string;
  reason: string;
  score: number;
}

export interface AiPanelState {
  /** Videos on the main track and whether each has been analysed. */
  videos: { id: string; name: string; analyzed: boolean }[];
  busy: boolean;
  status: string | null;
  progress: number | null;
  error: string | null;
  summary: string | null;
  shorts: AiShort[];
  publish: { title: string; description: string; hashtags: string[] } | null;
  thumbnailTime: number | null;
  /** Scenes the model found hard to watch, for one-tap cleanup. */
  badScenes: number;
  canReframe: boolean;
}

interface AiPanelProps {
  state: AiPanelState;
  onAnalyze: () => void;
  onPreview: (start: number, end: number) => void;
  onShort: (s: AiShort) => void;
  onReframe: () => void;
  onRemoveBad: () => void;
  onSeek: (t: number) => void;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-200"
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? 'تم النسخ' : 'نسخ'}
    </button>
  );
}

export function AiPanel({ state, onAnalyze, onPreview, onShort, onReframe, onRemoveBad, onSeek }: AiPanelProps) {
  const pending = state.videos.filter((v) => !v.analyzed).length;
  const analyzed = state.videos.length - pending;
  return (
    <div className="space-y-3 border-b border-white/5 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
        <ScanEye className="h-4 w-4 text-sky-400" />
        الذكاء الاصطناعي يشاهد الفيديو
      </div>
      {!state.videos.length ? (
        <p className="text-[11px] text-slate-500">أضف فيديو إلى الخط الزمني ليحلله الذكاء الاصطناعي.</p>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed text-slate-400">
            يرى الصورة ويسمع الصوت، فيفهم المشاهد واللحظات بدقة الإطار. بعدها تفهم الأوامر ما يظهر في الفيديو، وتحصل على مقاطع قصيرة مقترحة وتأطير ذكي.
          </p>
          {pending > 0 && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={state.busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {state.busy ? 'جاري التحليل...' : `تحليل الفيديو${state.videos.length > 1 ? ` (${pending} من ${state.videos.length})` : ''}`}
            </button>
          )}
          {state.busy && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-300">{state.status}</p>
              {state.progress !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(state.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          {state.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</p>}
          {analyzed > 0 && pending === 0 && !state.busy && <p className="text-[11px] text-emerald-300">✓ تم تحليل الفيديو. الأوامر الآن تفهم ما يظهر فيه.</p>}
        </>
      )}

      {state.summary && <p className="rounded-lg bg-white/5 p-2.5 text-xs leading-relaxed text-slate-200">{state.summary}</p>}

      {state.shorts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Clapperboard className="h-3.5 w-3.5" />
            مقاطع قصيرة مقترحة
          </div>
          {state.shorts.map((s) => (
            <div key={s.key} className="space-y-1.5 rounded-lg bg-white/5 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-white">{s.title}</span>
                <span className="shrink-0 rounded bg-sky-500/20 px-1.5 text-[10px] text-sky-200">{s.score}/10</span>
              </div>
              <p className="text-[11px] text-slate-400">{s.reason}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-slate-500" dir="ltr">
                  {formatTime(s.start, true)} → {formatTime(s.end, true)} ({Math.round(s.end - s.start)}s)
                </span>
                <button type="button" onClick={() => onPreview(s.start, s.end)} className="mr-auto flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-200">
                  <Play className="h-3 w-3 fill-current" />
                  معاينة
                </button>
                <button type="button" onClick={() => onShort(s)} className="rounded-md bg-sky-600 px-2 py-1 text-[10px] font-bold text-white">
                  اصنع المقطع
                </button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-500">"اصنع المقطع" يبقي هذا الجزء فقط بمقاس 9:16 مع تأطير ذكي. يمكنك التراجع بزر التراجع.</p>
        </div>
      )}

      {(state.canReframe || state.badScenes > 0) && (
        <div className="grid grid-cols-1 gap-1.5">
          {state.canReframe && (
            <button type="button" onClick={onReframe} className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10">
              <Crop className="h-3.5 w-3.5" />
              تحويل إلى عمودي مع تأطير يتبع الشخص
            </button>
          )}
          {state.badScenes > 0 && (
            <button type="button" onClick={onRemoveBad} className="rounded-lg bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10">
              حذف اللقطات السيئة ({state.badScenes}: مهزوزة، مظلمة، مملة)
            </button>
          )}
        </div>
      )}

      {state.publish && (
        <div className="space-y-2 rounded-lg bg-white/5 p-2.5">
          <div className="text-xs font-bold text-slate-300">جاهز للنشر</div>
          {state.publish.title && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-white">{state.publish.title}</span>
              <CopyButton text={state.publish.title} />
            </div>
          )}
          {state.publish.description && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] text-slate-300">{state.publish.description}</span>
              <CopyButton text={state.publish.description} />
            </div>
          )}
          {state.publish.hashtags.length > 0 && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] text-sky-300" dir="auto">{state.publish.hashtags.join(' ')}</span>
              <CopyButton text={state.publish.hashtags.join(' ')} />
            </div>
          )}
          {state.thumbnailTime !== null && (
            <button type="button" onClick={() => onSeek(state.thumbnailTime!)} className="w-full rounded-md bg-white/10 py-1.5 text-[11px] text-slate-200">
              اذهب إلى أفضل لقطة للصورة المصغّرة ({formatTime(state.thumbnailTime, true)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Check, Loader2, Send, Undo2, Wand2, X } from 'lucide-react';
import { EditAction } from '../../editor/commandSpec';
import { describeAction } from '../../editor/commands';
import { cn } from '../../lib/utils';

const EXAMPLES = [
  'احذف أول 3 ثواني',
  'أضف انتقال تلاشي بين كل المقاطع',
  'أضف كابشن بنمط هورموزي مع إيموجي',
  'احذف الصمت من الفيديو',
  'سرّع المقطع الثاني مرتين',
  'اجعل الألوان سينمائية',
  'خفض صوت الموسيقى إلى 30%',
  'حوّل المقاس لتيك توك',
  'اجعل صوتي مثل الروبوت',
  'جمّد الإطار عند الثانية 2',
  'اعكس المقطع الأول',
  'قص المقاطع على إيقاع الموسيقى',
];

export interface CommandPlan {
  command: string;
  reply: string;
  actions: EditAction[];
}

export interface CommandState {
  busy: 'thinking' | 'applying' | null;
  status: string | null;
  progress: number | null;
  error: string | null;
  plan: CommandPlan | null;
  /** The last command that was applied, for the undo button. */
  done: string | null;
}

interface CommandPanelProps {
  state: CommandState;
  onAsk: (command: string) => void;
  onApply: () => void;
  onCancel: () => void;
  onUndo: () => void;
}

export function CommandPanel({ state, onAsk, onApply, onCancel, onUndo }: CommandPanelProps) {
  const [text, setText] = useState('');
  const steps = state.plan?.actions.map((a) => describeAction(a)) ?? [];
  const runnable = steps.some((s) => s !== null);

  const send = () => {
    const command = text.trim();
    if (!command || state.busy) return;
    onAsk(command);
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
        <Wand2 className="h-4 w-4 text-fuchsia-400" />
        اكتب ما تريد فعله بالفيديو
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={600}
          dir="auto"
          placeholder="مثلاً: احذف أول 3 ثواني وأضف موسيقى هادئة..."
          className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || !!state.busy}
          className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600 text-white disabled:opacity-40"
          aria-label="إرسال"
        >
          {state.busy === 'thinking' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 -scale-x-100" />}
        </button>
      </div>

      {!state.plan && !state.busy && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 active:bg-white/10"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {state.busy === 'thinking' && <p className="text-xs text-slate-400">جاري فهم الأمر...</p>}

      {state.plan && (
        <div className="space-y-2.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
          <p className="text-xs text-slate-400">«{state.plan.command}»</p>
          {state.plan.reply && <p className="text-sm text-slate-100">{state.plan.reply}</p>}
          {steps.length > 0 && (
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className={cn('flex gap-2 text-xs', s ? 'text-slate-200' : 'text-slate-500 line-through')}>
                  <span className="text-fuchsia-300">{i + 1}.</span>
                  {s ?? 'خطوة غير مدعومة وسيتم تجاهلها'}
                </li>
              ))}
            </ol>
          )}
          {state.busy === 'applying' ? (
            <div className="space-y-1.5">
              <p className="flex items-center gap-2 text-xs text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {state.status ?? 'جاري التنفيذ...'}
              </p>
              {state.progress !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(state.progress * 100)}%` }} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              {runnable && (
                <button
                  type="button"
                  onClick={() => {
                    onApply();
                    setText('');
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 py-2 text-sm font-bold text-white"
                >
                  <Check className="h-4 w-4" />
                  تنفيذ
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-sm text-slate-200"
              >
                <X className="h-4 w-4" />
                {runnable ? 'إلغاء' : 'حسناً'}
              </button>
            </div>
          )}
        </div>
      )}

      {state.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</p>}

      {state.done && !state.plan && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <span>تم: «{state.done}»</span>
          <button type="button" onClick={onUndo} className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-slate-200">
            <Undo2 className="h-3.5 w-3.5" />
            تراجع
          </button>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-500">
        يفهم الأوامر بالعربية والدارجة. يمكنك ذكر رقم المقطع، أو وقت محدد، أو كلمة قيلت في الفيديو إذا كان فيه كابشن.
      </p>
    </div>
  );
}

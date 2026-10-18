import React from 'react';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CLIP_ANIMS, EFFECTS, MASKS, SPEED_CURVES } from '../../editor/constants';
import { ChromaKey, ClipAnim, ClipAnimType, ClipEffect, ClipMask, CropRect, EffectType, MaskShape } from '../../editor/types';
import { ColorInput, Section, SliderRow } from './ui';

const pct = (v: number) => `${Math.round(v)}%`;
const chip = (active: boolean) =>
  cn('rounded-lg px-2 py-1.5 text-[11px] font-semibold transition', active ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10');

export function FlipButtons({ flipH, flipV, onChange }: { flipH: boolean; flipV?: boolean; onChange: (h: boolean, v: boolean) => void }) {
  return (
    <div className="flex gap-1.5">
      <button type="button" onClick={() => onChange(!flipH, !!flipV)} className={cn(chip(flipH), 'flex flex-1 items-center justify-center gap-1')}>
        <FlipHorizontal2 className="h-3.5 w-3.5" /> قلب أفقي
      </button>
      {flipV !== undefined && (
        <button type="button" onClick={() => onChange(flipH, !flipV)} className={cn(chip(flipV), 'flex flex-1 items-center justify-center gap-1')}>
          <FlipVertical2 className="h-3.5 w-3.5" /> قلب عمودي
        </button>
      )}
    </div>
  );
}

export function CropSection({
  crop,
  flipH,
  flipV,
  onCrop,
  onFlip,
  coalesce,
}: {
  crop: CropRect;
  flipH: boolean;
  flipV: boolean;
  onCrop: (c: CropRect, key?: string) => void;
  onFlip: (h: boolean, v: boolean) => void;
  coalesce: (name: string) => string;
}) {
  const left = Math.round(crop.x * 100);
  const top = Math.round(crop.y * 100);
  const right = Math.round((1 - crop.x - crop.w) * 100);
  const bottom = Math.round((1 - crop.y - crop.h) * 100);
  const set = (l: number, r: number, t: number, b: number, name: string) =>
    onCrop({ x: l / 100, y: t / 100, w: Math.max(0.05, 1 - (l + r) / 100), h: Math.max(0.05, 1 - (t + b) / 100) }, coalesce(name));
  const changed = left || top || right || bottom;
  return (
    <Section
      title="قص الإطار والقلب"
      action={
        changed ? (
          <button type="button" className="text-[11px] text-cyan-300 hover:underline" onClick={() => onCrop({ x: 0, y: 0, w: 1, h: 1 })}>
            إلغاء القص
          </button>
        ) : undefined
      }
    >
      <FlipButtons flipH={flipH} flipV={flipV} onChange={onFlip} />
      <SliderRow label="من اليمين" value={right} min={0} max={90 - left} format={pct} onChange={(v) => set(left, v, top, bottom, 'cr')} />
      <SliderRow label="من اليسار" value={left} min={0} max={90 - right} format={pct} onChange={(v) => set(v, right, top, bottom, 'cl')} />
      <SliderRow label="من الأعلى" value={top} min={0} max={90 - bottom} format={pct} onChange={(v) => set(left, right, v, bottom, 'ct')} />
      <SliderRow label="من الأسفل" value={bottom} min={0} max={90 - top} format={pct} onChange={(v) => set(left, right, top, v, 'cb')} />
    </Section>
  );
}

export function ClipAnimSection({
  animIn,
  animOut,
  onChange,
  onPreview,
}: {
  animIn: ClipAnim;
  animOut: ClipAnim;
  onChange: (which: 'animIn' | 'animOut', a: ClipAnim) => void;
  onPreview: (part: 'in' | 'out') => void;
}) {
  const row = (which: 'animIn' | 'animOut', anim: ClipAnim, title: string) => (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-slate-400">{title}</p>
      <div className="grid grid-cols-3 gap-1">
        {CLIP_ANIMS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={chip(anim.type === a.id)}
            onClick={() => {
              onChange(which, { ...anim, type: a.id as ClipAnimType });
              if (a.id !== 'none') onPreview(which === 'animIn' ? 'in' : 'out');
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {anim.type !== 'none' && (
        <SliderRow label="المدة" value={anim.duration} min={0.2} max={2} step={0.1} format={(v) => `${v.toFixed(1)}ث`} onChange={(v) => onChange(which, { ...anim, duration: v })} />
      )}
    </div>
  );
  return (
    <Section title="حركة دخول وخروج المقطع">
      {row('animIn', animIn, 'دخول')}
      {row('animOut', animOut, 'خروج')}
    </Section>
  );
}

export function EffectSection({ effect, onChange, coalesce }: { effect: ClipEffect | null; onChange: (e: ClipEffect | null, key?: string) => void; coalesce: (n: string) => string }) {
  return (
    <Section title="تأثيرات الفيديو">
      <div className="grid grid-cols-4 gap-1">
        <button type="button" className={chip(!effect)} onClick={() => onChange(null)}>
          بدون
        </button>
        {EFFECTS.map((e) => (
          <button key={e.id} type="button" className={chip(effect?.type === e.id)} onClick={() => onChange({ type: e.id as EffectType, intensity: effect?.intensity ?? 0.6 })}>
            {e.label}
          </button>
        ))}
      </div>
      {effect && (
        <SliderRow label="القوة" value={Math.round(effect.intensity * 100)} min={5} max={100} format={pct} onChange={(v) => onChange({ ...effect, intensity: v / 100 }, coalesce('fx'))} />
      )}
    </Section>
  );
}

export function MaskSection({ mask, onChange, coalesce }: { mask: ClipMask | null; onChange: (m: ClipMask | null, key?: string) => void; coalesce: (n: string) => string }) {
  return (
    <Section title="القناع">
      <div className="grid grid-cols-3 gap-1">
        <button type="button" className={chip(!mask)} onClick={() => onChange(null)}>
          بدون
        </button>
        {MASKS.map((m) => (
          <button key={m.id} type="button" className={chip(mask?.shape === m.id)} onClick={() => onChange({ shape: m.id as MaskShape, size: mask?.size ?? 0.8 })}>
            {m.label}
          </button>
        ))}
      </div>
      {mask && <SliderRow label="الحجم" value={Math.round(mask.size * 100)} min={10} max={150} format={pct} onChange={(v) => onChange({ ...mask, size: v / 100 }, coalesce('mask'))} />}
    </Section>
  );
}

export function ChromaSection({ chroma, onChange, coalesce }: { chroma: ChromaKey | null; onChange: (c: ChromaKey | null, key?: string) => void; coalesce: (n: string) => string }) {
  return (
    <Section
      title="الشاشة الخضراء (إزالة لون)"
      action={
        <input
          type="checkbox"
          checked={!!chroma}
          onChange={(e) => onChange(e.target.checked ? { color: '#00ff00', similarity: 0.4, smoothness: 0.2 } : null)}
          className="h-4 w-4 accent-cyan-400"
        />
      }
    >
      {chroma ? (
        <>
          <div className="flex items-center gap-1.5">
            {['#00ff00', '#00b140', '#0047bb', '#ffffff', '#000000'].map((c) => (
              <button key={c} type="button" onClick={() => onChange({ ...chroma, color: c })} className={cn('h-6 w-6 rounded-full ring-2', chroma.color === c ? 'ring-cyan-400' : 'ring-white/20')} style={{ background: c }} />
            ))}
          </div>
          <ColorInput label="اللون المراد إزالته" value={chroma.color} onChange={(v) => onChange({ ...chroma, color: v }, coalesce('ck'))} />
          <SliderRow label="الدقة" value={Math.round(chroma.similarity * 100)} min={0} max={100} format={pct} onChange={(v) => onChange({ ...chroma, similarity: v / 100 }, coalesce('cs'))} />
          <SliderRow label="نعومة الحواف" value={Math.round(chroma.smoothness * 100)} min={0} max={100} format={pct} onChange={(v) => onChange({ ...chroma, smoothness: v / 100 }, coalesce('cm'))} />
        </>
      ) : (
        <p className="text-[11px] text-slate-500">فعّلها لإزالة الخلفية الخضراء أو الزرقاء من الفيديو.</p>
      )}
    </Section>
  );
}

function CurveIcon({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 40},${18 - (p / max) * 16}`).join(' ');
  return (
    <svg viewBox="0 0 40 20" className="h-4 w-10" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points={d} strokeLinejoin="round" />
    </svg>
  );
}

export function SpeedCurveSection({ curve, onChange }: { curve: string | null; onChange: (c: string | null) => void }) {
  return (
    <Section title="منحنى السرعة">
      <div className="grid grid-cols-4 gap-1">
        <button type="button" className={chip(!curve)} onClick={() => onChange(null)}>
          ثابت
        </button>
        {SPEED_CURVES.map((c) => (
          <button key={c.id} type="button" className={cn(chip(curve === c.id), 'flex flex-col items-center gap-0.5')} onClick={() => onChange(c.id)}>
            <CurveIcon points={c.points} />
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">يسرّع ويبطّئ أجزاء المقطع دون تغيير مدته. في الفيديو المُصدَّر تتغير طبقة الصوت مع السرعة.</p>
    </Section>
  );
}

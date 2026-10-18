import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Copy, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ASPECT_SIZES,
  FILTER_PRESETS,
  FONTS,
  MAX_IMAGE_DURATION,
  NEUTRAL_ADJUSTMENTS,
  SPEED_PRESETS,
  TEXT_ANIMS_IN,
  TEXT_ANIMS_OUT,
  TRANSITIONS,
  presetAdjustments,
} from '../../editor/constants';
import { clipDuration } from '../../editor/timeline';
import { Adjustments, AspectRatio, AudioClip, MainClip, MediaAsset, Project, TextClip, TransitionType } from '../../editor/types';
import { ColorInput, Section, Segmented, SliderRow } from './ui';

type Patch<T> = (fn: (item: T) => T, coalesceKey?: string) => void;

interface Actions {
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ActionsBar({ onSplit, onDuplicate, onDelete }: Actions) {
  const btn = 'flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-slate-300 hover:bg-white/10';
  return (
    <div className="flex gap-1 border-b border-white/5 p-2">
      <button type="button" className={btn} onClick={onSplit}><Scissors className="h-4 w-4" />تقسيم</button>
      <button type="button" className={btn} onClick={onDuplicate}><Copy className="h-4 w-4" />تكرار</button>
      <button type="button" className={cn(btn, 'hover:text-red-300')} onClick={onDelete}><Trash2 className="h-4 w-4" />حذف</button>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v)}%`;
const secs = (v: number) => `${v.toFixed(1)}ث`;

export function ClipInspector({ clip, asset, patch, actions }: { clip: MainClip; asset: MediaAsset; patch: Patch<MainClip>; actions: Actions }) {
  const k = (name: string) => `${clip.id}-${name}`;
  const setAdjust = (key: keyof Adjustments, v: number) =>
    patch((c) => ({ ...c, adjust: { ...c.adjust, [key]: v } }), k(`adj-${key}`));
  const adjRow = (key: keyof Adjustments, label: string, min: number, max: number, step = 1, fmt?: (v: number) => string) => (
    <SliderRow
      key={key}
      label={label}
      value={clip.adjust[key]}
      min={min}
      max={max}
      step={step}
      format={fmt}
      onChange={(v) => setAdjust(key, v)}
      onReset={() => setAdjust(key, NEUTRAL_ADJUSTMENTS[key])}
    />
  );
  const isVideo = asset.kind === 'video';

  return (
    <div>
      <ActionsBar {...actions} />
      {isVideo ? (
        <Section title="السرعة">
          <div className="flex flex-wrap gap-1">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch((c) => ({ ...c, speed: s }))}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums',
                  clip.speed === s ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {s}x
              </button>
            ))}
          </div>
          <SliderRow
            label="سرعة مخصصة"
            value={clip.speed}
            min={0.25}
            max={4}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => patch((c) => ({ ...c, speed: v }), k('speed'))}
            onReset={() => patch((c) => ({ ...c, speed: 1 }))}
          />
          <p className="text-[11px] text-slate-500">المدة الناتجة: {secs(clipDuration(clip))}</p>
        </Section>
      ) : (
        <Section title="المدة">
          <SliderRow
            label="مدة عرض الصورة"
            value={clip.outPoint}
            min={0.5}
            max={Math.min(MAX_IMAGE_DURATION, 30)}
            step={0.1}
            format={secs}
            onChange={(v) => patch((c) => ({ ...c, outPoint: v }), k('dur'))}
          />
        </Section>
      )}

      {isVideo && (
        <Section
          title="الصوت"
          action={
            <button
              type="button"
              onClick={() => patch((c) => ({ ...c, muted: !c.muted }))}
              className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[11px]', clip.muted ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-slate-300')}
            >
              {clip.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {clip.muted ? 'مكتوم' : 'كتم'}
            </button>
          }
        >
          {!asset.hasAudio && <p className="text-[11px] text-slate-500">هذا المقطع لا يحتوي على صوت.</p>}
          <SliderRow
            label="مستوى الصوت"
            value={Math.round(clip.volume * 100)}
            min={0}
            max={100}
            format={pct}
            onChange={(v) => patch((c) => ({ ...c, volume: v / 100 }), k('vol'))}
          />
        </Section>
      )}

      <Section title="الإطار والموضع">
        <Segmented
          options={[
            { id: 'contain', label: 'احتواء' },
            { id: 'cover', label: 'ملء الشاشة' },
          ]}
          value={clip.fit}
          onChange={(fit) => patch((c) => ({ ...c, fit }))}
        />
        <SliderRow label="تكبير" value={clip.zoom} min={0.5} max={3} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => patch((c) => ({ ...c, zoom: v }), k('zoom'))} onReset={() => patch((c) => ({ ...c, zoom: 1 }))} />
        <SliderRow label="أفقي" value={Math.round(clip.offsetX * 100)} min={-100} max={100} format={pct}
          onChange={(v) => patch((c) => ({ ...c, offsetX: v / 100 }), k('ox'))} onReset={() => patch((c) => ({ ...c, offsetX: 0 }))} />
        <SliderRow label="عمودي" value={Math.round(clip.offsetY * 100)} min={-100} max={100} format={pct}
          onChange={(v) => patch((c) => ({ ...c, offsetY: v / 100 }), k('oy'))} onReset={() => patch((c) => ({ ...c, offsetY: 0 }))} />
        <SliderRow label="دوران" value={clip.rotation} min={-180} max={180} format={(v) => `${v}°`}
          onChange={(v) => patch((c) => ({ ...c, rotation: v }), k('rot'))} onReset={() => patch((c) => ({ ...c, rotation: 0 }))} />
        <p className="text-[11px] text-slate-500">يمكنك أيضاً سحب المقطع مباشرة داخل المعاينة.</p>
      </Section>

      <Section title="الفلتر">
        <select
          value={clip.filterId}
          onChange={(e) => patch((c) => ({ ...c, filterId: e.target.value, adjust: presetAdjustments(e.target.value) }))}
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs"
        >
          {FILTER_PRESETS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </Section>

      <Section
        title="تعديلات الألوان"
        action={
          <button type="button" className="text-[11px] text-cyan-300 hover:underline"
            onClick={() => patch((c) => ({ ...c, filterId: 'none', adjust: { ...NEUTRAL_ADJUSTMENTS } }))}>
            إعادة الكل
          </button>
        }
      >
        {adjRow('brightness', 'السطوع', 0, 200, 1, pct)}
        {adjRow('contrast', 'التباين', 0, 200, 1, pct)}
        {adjRow('saturation', 'التشبع', 0, 200, 1, pct)}
        {adjRow('warmth', 'الدفء', -100, 100)}
        {adjRow('hue', 'تدرج اللون', -180, 180, 1, (v) => `${v}°`)}
        {adjRow('sepia', 'بني قديم', 0, 100, 1, pct)}
        {adjRow('grayscale', 'رمادي', 0, 100, 1, pct)}
        {adjRow('blur', 'ضبابية', 0, 20, 0.5)}
        {adjRow('vignette', 'تظليل الأطراف', 0, 100, 1, pct)}
      </Section>
    </div>
  );
}

export function TextInspector({ text, patch, actions }: { text: TextClip; patch: Patch<TextClip>; actions: Actions }) {
  const k = (name: string) => `${text.id}-${name}`;
  return (
    <div>
      <ActionsBar {...actions} />
      <Section title="النص">
        <textarea
          value={text.text}
          dir="auto"
          rows={3}
          onChange={(e) => patch((t) => ({ ...t, text: e.target.value }), k('text'))}
          className="w-full resize-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
        />
        <select
          value={text.font}
          onChange={(e) => patch((t) => ({ ...t, font: e.target.value }))}
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs"
          style={{ fontFamily: `"${text.font}"` }}
        >
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>
          ))}
        </select>
        <SliderRow label="الحجم" value={text.fontSize} min={20} max={260} onChange={(v) => patch((t) => ({ ...t, fontSize: v }), k('size'))} />
        <div className="flex gap-2">
          <Segmented
            className="flex-1"
            options={[
              { id: 'right', label: <AlignRight className="mx-auto h-3.5 w-3.5" /> },
              { id: 'center', label: <AlignCenter className="mx-auto h-3.5 w-3.5" /> },
              { id: 'left', label: <AlignLeft className="mx-auto h-3.5 w-3.5" /> },
            ]}
            value={text.align}
            onChange={(align) => patch((t) => ({ ...t, align }))}
          />
          <button
            type="button"
            onClick={() => patch((t) => ({ ...t, bold: !t.bold }))}
            className={cn('rounded-lg px-3 text-xs font-black', text.bold ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300')}
          >
            B
          </button>
        </div>
      </Section>

      <Section title="الألوان">
        <ColorInput label="لون النص" value={text.color} onChange={(v) => patch((t) => ({ ...t, color: v }), k('color'))} />
        <ColorInput label="لون الحدود" value={text.strokeColor} onChange={(v) => patch((t) => ({ ...t, strokeColor: v }), k('stroke'))} />
        <SliderRow label="سماكة الحدود" value={text.strokeWidth} min={0} max={16} onChange={(v) => patch((t) => ({ ...t, strokeWidth: v }), k('sw'))} />
        <label className="flex items-center justify-between text-[11px] text-slate-400">
          <span>خلفية النص</span>
          <span className="flex items-center gap-2">
            {text.background && (
              <input
                type="color"
                value={text.background.startsWith('#') ? text.background : '#000000'}
                onChange={(e) => patch((t) => ({ ...t, background: e.target.value }), k('bg'))}
                className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            )}
            <input
              type="checkbox"
              checked={!!text.background}
              onChange={(e) => patch((t) => ({ ...t, background: e.target.checked ? '#000000' : null }))}
              className="h-4 w-4 accent-cyan-400"
            />
          </span>
        </label>
        <label className="flex items-center justify-between text-[11px] text-slate-400">
          <span>ظل</span>
          <input type="checkbox" checked={text.shadow} onChange={(e) => patch((t) => ({ ...t, shadow: e.target.checked }))} className="h-4 w-4 accent-cyan-400" />
        </label>
      </Section>

      <Section title="الحركة">
        <label className="block text-[11px] text-slate-400">
          دخول
          <select value={text.animIn} onChange={(e) => patch((t) => ({ ...t, animIn: e.target.value as TextClip['animIn'] }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
            {TEXT_ANIMS_IN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-slate-400">
          خروج
          <select value={text.animOut} onChange={(e) => patch((t) => ({ ...t, animOut: e.target.value as TextClip['animOut'] }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
            {TEXT_ANIMS_OUT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
      </Section>

      <Section title="الموضع والتوقيت">
        <SliderRow label="أفقي" value={Math.round(text.x * 100)} min={0} max={100} format={pct} onChange={(v) => patch((t) => ({ ...t, x: v / 100 }), k('x'))} />
        <SliderRow label="عمودي" value={Math.round(text.y * 100)} min={0} max={100} format={pct} onChange={(v) => patch((t) => ({ ...t, y: v / 100 }), k('y'))} />
        <SliderRow label="المدة" value={text.duration} min={0.3} max={30} step={0.1} format={secs} onChange={(v) => patch((t) => ({ ...t, duration: v }), k('dur'))} />
        <p className="text-[11px] text-slate-500">اسحب النص داخل المعاينة لتغيير مكانه.</p>
      </Section>
    </div>
  );
}

export function AudioInspector({ audio, asset, patch, actions }: { audio: AudioClip; asset?: MediaAsset; patch: Patch<AudioClip>; actions: Actions }) {
  const k = (name: string) => `${audio.id}-${name}`;
  const len = audio.outPoint - audio.inPoint;
  return (
    <div>
      <ActionsBar {...actions} />
      <Section title={asset?.name ?? 'صوت'}>
        <SliderRow label="مستوى الصوت" value={Math.round(audio.volume * 100)} min={0} max={100} format={pct}
          onChange={(v) => patch((a) => ({ ...a, volume: v / 100 }), k('vol'))} />
        <SliderRow label="ظهور تدريجي" value={audio.fadeIn} min={0} max={Math.min(10, len / 2)} step={0.1} format={secs}
          onChange={(v) => patch((a) => ({ ...a, fadeIn: v }), k('fi'))} />
        <SliderRow label="اختفاء تدريجي" value={audio.fadeOut} min={0} max={Math.min(10, len / 2)} step={0.1} format={secs}
          onChange={(v) => patch((a) => ({ ...a, fadeOut: v }), k('fo'))} />
        <p className="text-[11px] text-slate-500">المدة: {secs(len)} · اسحب الأطراف في الخط الزمني للقص.</p>
      </Section>
    </div>
  );
}

export function TransitionInspector({
  clip,
  onChange,
}: {
  clip: MainClip;
  onChange: (fn: (c: MainClip) => MainClip, coalesceKey?: string) => void;
}) {
  return (
    <div>
      <Section title="الانتقال">
        <div className="grid grid-cols-2 gap-1.5">
          {TRANSITIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange((c) => ({ ...c, transition: { ...c.transition, type: t.id as TransitionType } }))}
              className={cn(
                'rounded-lg px-2 py-2 text-[11px] font-semibold',
                clip.transition.type === t.id ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {clip.transition.type !== 'none' && (
          <SliderRow
            label="مدة الانتقال"
            value={clip.transition.duration}
            min={0.2}
            max={2}
            step={0.1}
            format={secs}
            onChange={(v) => onChange((c) => ({ ...c, transition: { ...c.transition, duration: v } }), `${clip.id}-trdur`)}
          />
        )}
      </Section>
    </div>
  );
}

export function ProjectInspector({
  project,
  onChange,
}: {
  project: Project;
  onChange: (fn: (p: Project) => Project, coalesceKey?: string) => void;
}) {
  return (
    <div>
      <Section title="مقاس الفيديو">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(ASPECT_SIZES) as AspectRatio[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange((p) => ({ ...p, aspect: a }))}
              className={cn(
                'rounded-lg px-2 py-2 text-right text-[11px]',
                project.aspect === a ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              )}
            >
              <span className="block font-bold" dir="ltr">{a}</span>
              <span className="opacity-80">{ASPECT_SIZES[a].label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="الخلفية">
        <ColorInput label="لون الخلفية" value={project.background} onChange={(v) => onChange((p) => ({ ...p, background: v }), 'bg')} />
        <div className="flex gap-1.5">
          {['#000000', '#ffffff', '#0f172a', '#1e1b4b', '#14532d', '#7f1d1d'].map((c) => (
            <button key={c} type="button" onClick={() => onChange((p) => ({ ...p, background: c }))}
              className="h-6 w-6 rounded-full ring-1 ring-white/20" style={{ background: c }} />
          ))}
        </div>
      </Section>
      <div className="px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        حدد أي عنصر في الخط الزمني لتعديل خصائصه.
        <br />
        اختصارات: مسافة = تشغيل · S = تقسيم · Delete = حذف · Ctrl+Z = تراجع · Ctrl+D = تكرار
      </div>
    </div>
  );
}

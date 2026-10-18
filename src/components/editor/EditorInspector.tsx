import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Copy, Loader2, Scissors, Trash2, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ASPECT_SIZES,
  FILTER_PRESETS,
  FONTS,
  MAX_IMAGE_DURATION,
  MOTION_PRESETS,
  NEUTRAL_ADJUSTMENTS,
  OVERLAY_ANIMS,
  SPEED_PRESETS,
  TEXT_ANIMS_IN,
  TEXT_ANIMS_OUT,
  TRANSITIONS,
  presetAdjustments,
} from '../../editor/constants';
import { baseTransform, clipDuration, motionFromPreset } from '../../editor/timeline';
import { Adjustments, AspectRatio, AudioClip, MainClip, MediaAsset, OverlayClip, OverlayShape, Project, TextClip, TransitionType } from '../../editor/types';
import { ColorInput, Section, Segmented, SliderRow } from './ui';
import { AnimChip, FilterThumb, MotionThumb, TransitionThumb } from './previews';

type Patch<T> = (fn: (item: T) => T, coalesceKey?: string) => void;

/** Plays the part of the selected item an edit affects, so the change is seen right away. */
type Preview = (part: 'in' | 'out' | 'whole') => void;

const tf = (t: { zoom: number; offsetX: number; offsetY: number; rotation: number }, base: { zoom: number }) =>
  `translate(${t.offsetX * 100}%, ${t.offsetY * 100}%) scale(${t.zoom / base.zoom}) rotate(${t.rotation}deg)`;

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

interface SilenceTool {
  busy: boolean;
  message: string | null;
  run: () => void;
}

export function ClipInspector({
  clip,
  asset,
  patch,
  actions,
  silence,
  frame,
  preview,
}: {
  clip: MainClip;
  asset: MediaAsset;
  patch: Patch<MainClip>;
  actions: Actions;
  silence: SilenceTool;
  /** The clip's current frame, for filter and motion previews. */
  frame?: string | null;
  preview: Preview;
}) {
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
                onClick={() => {
                  patch((c) => ({ ...c, speed: s }));
                  preview('whole');
                }}
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
          {asset.hasAudio && (
            <>
              <button
                type="button"
                disabled={silence.busy}
                onClick={silence.run}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500/15 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
              >
                {silence.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                حذف لحظات الصمت تلقائياً
              </button>
              {silence.message && <p className="text-[11px] text-slate-400">{silence.message}</p>}
            </>
          )}
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
        <p className="text-[11px] text-slate-500">داخل المعاينة: إصبع للتحريك، وإصبعان للتكبير والتدوير، وضغطتان سريعتان لإعادة الضبط. على الكمبيوتر: Ctrl + عجلة الفأرة للتكبير.</p>
      </Section>

      <Section title="حركة المقطع (إطارات مفتاحية)">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => patch((c) => ({ ...c, motion: null }))}
            className="text-center text-[10px] text-slate-300"
          >
            <div className={cn('aspect-square overflow-hidden rounded-md ring-2', !clip.motion ? 'ring-cyan-400' : 'ring-transparent')}>
              <MotionThumb src={frame ?? undefined} from="none" to="none" />
            </div>
            <span className="mt-0.5 block">بدون</span>
          </button>
          {MOTION_PRESETS.map((m) => {
            const motion = motionFromPreset({ ...clip, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }, m.id)!;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  patch((c) => ({ ...c, motion: motionFromPreset(c, m.id) }));
                  preview('whole');
                }}
                className="text-center text-[10px] text-slate-300"
              >
                <div className={cn('aspect-square overflow-hidden rounded-md ring-2', clip.motion?.preset === m.id ? 'ring-cyan-400' : 'ring-transparent')}>
                  <MotionThumb src={frame ?? undefined} from={tf(motion.from, { zoom: 1 })} to={tf(motion.to, { zoom: 1 })} />
                </div>
                <span className="mt-0.5 block">{m.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          حركة مخصصة: اضبط التكبير والموضع بالأعلى ثم احفظه كبداية، ثم اضبطه مرة أخرى واحفظه كنهاية.
        </p>
        <div className="flex gap-1.5">
          {(['from', 'to'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                patch((c) => {
                  const now = baseTransform(c);
                  const prev = c.motion ?? { preset: 'custom', from: now, to: now };
                  return { ...c, motion: { ...prev, preset: 'custom', [k]: now } };
                })
              }
              className="flex-1 rounded-lg bg-white/5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
            >
              {k === 'from' ? 'حفظ كإطار البداية' : 'حفظ كإطار النهاية'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="الفلتر">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTER_PRESETS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => patch((c) => ({ ...c, filterId: f.id, adjust: presetAdjustments(f.id) }))}
              className="w-14 shrink-0 text-center text-[10px] text-slate-300"
            >
              <div className={cn('aspect-square overflow-hidden rounded-md ring-2', clip.filterId === f.id ? 'ring-cyan-400' : 'ring-transparent')}>
                <FilterThumb src={frame} adjust={presetAdjustments(f.id)} />
              </div>
              <span className="mt-0.5 block truncate">{f.label}</span>
            </button>
          ))}
        </div>
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

export function TextInspector({ text, patch, actions, preview }: { text: TextClip; patch: Patch<TextClip>; actions: Actions; preview: Preview }) {
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
        <div className="grid grid-cols-2 gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => patch((t) => ({ ...t, font: f }))}
              className={cn(
                'rounded-lg px-2 py-1.5 text-center transition',
                text.font === f ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-400' : 'bg-white/5 text-slate-200 hover:bg-white/10'
              )}
            >
              <span className="block truncate text-base leading-tight" style={{ fontFamily: `"${f}", sans-serif`, fontWeight: text.bold ? 800 : 400 }}>
                أبجد Aa
              </span>
              <span className="block text-[9px] text-slate-400" dir="ltr">{f}</span>
            </button>
          ))}
        </div>
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

      <Section title="حركة الدخول">
        <div className="grid grid-cols-3 gap-1.5">
          {TEXT_ANIMS_IN.map((a) => (
            <AnimChip key={a.id} id={a.id} label={a.label} phase="in" active={text.animIn === a.id}
              onClick={() => { patch((t) => ({ ...t, animIn: a.id })); preview('in'); }} />
          ))}
        </div>
      </Section>
      <Section title="حركة الخروج">
        <div className="grid grid-cols-4 gap-1.5">
          {TEXT_ANIMS_OUT.map((a) => (
            <AnimChip key={a.id} id={a.id} label={a.label} phase="out" active={text.animOut === a.id}
              onClick={() => { patch((t) => ({ ...t, animOut: a.id })); preview('out'); }} />
          ))}
        </div>
      </Section>

      <Section title="الموضع والتوقيت">
        <SliderRow label="أفقي" value={Math.round(text.x * 100)} min={0} max={100} format={pct} onChange={(v) => patch((t) => ({ ...t, x: v / 100 }), k('x'))} />
        <SliderRow label="عمودي" value={Math.round(text.y * 100)} min={0} max={100} format={pct} onChange={(v) => patch((t) => ({ ...t, y: v / 100 }), k('y'))} />
        <SliderRow label="دوران" value={text.rotation} min={-180} max={180} format={(v) => `${v}°`}
          onChange={(v) => patch((t) => ({ ...t, rotation: v }), k('rot'))} onReset={() => patch((t) => ({ ...t, rotation: 0 }))} />
        <SliderRow label="المدة" value={text.duration} min={0.3} max={30} step={0.1} format={secs} onChange={(v) => patch((t) => ({ ...t, duration: v }), k('dur'))} />
        <p className="text-[11px] text-slate-500">على الهاتف: اسحب النص بإصبع لتحريكه، وبإصبعين لتكبيره وتدويره. ضغطتان سريعتان تعيدان الدوران.</p>
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

export function OverlayInspector({
  overlay,
  asset,
  patch,
  actions,
  preview,
}: {
  overlay: OverlayClip;
  asset?: MediaAsset;
  patch: Patch<OverlayClip>;
  actions: Actions;
  preview: Preview;
}) {
  const k = (name: string) => `${overlay.id}-${name}`;
  const chips = (phase: 'in' | 'out') => (
    <div className="grid grid-cols-4 gap-1.5">
      {OVERLAY_ANIMS.map((a) => (
        <AnimChip key={a.id} id={a.id} label={a.label} phase={phase} sample="🖼️"
          active={(phase === 'in' ? overlay.animIn : overlay.animOut) === a.id}
          onClick={() => {
            patch((o) => (phase === 'in' ? { ...o, animIn: a.id } : { ...o, animOut: a.id }));
            preview(phase);
          }} />
      ))}
    </div>
  );
  return (
    <div>
      <ActionsBar {...actions} />
      <Section title="الشكل">
        <Segmented<OverlayShape>
          options={[
            { id: 'rect', label: 'مستطيل' },
            { id: 'rounded', label: 'حواف دائرية' },
            { id: 'circle', label: 'دائرة' },
          ]}
          value={overlay.shape}
          onChange={(shape) => patch((o) => ({ ...o, shape }))}
        />
        <SliderRow label="الحجم" value={Math.round(overlay.scale * 100)} min={5} max={100} format={pct}
          onChange={(v) => patch((o) => ({ ...o, scale: v / 100 }), k('scale'))} />
        <SliderRow label="الشفافية" value={Math.round(overlay.opacity * 100)} min={0} max={100} format={pct}
          onChange={(v) => patch((o) => ({ ...o, opacity: v / 100 }), k('op'))} />
        <SliderRow label="دوران" value={overlay.rotation} min={-180} max={180} format={(v) => `${v}°`}
          onChange={(v) => patch((o) => ({ ...o, rotation: v }), k('rot'))} onReset={() => patch((o) => ({ ...o, rotation: 0 }))} />
      </Section>
      <Section title="الموضع">
        <SliderRow label="أفقي" value={Math.round(overlay.x * 100)} min={0} max={100} format={pct} onChange={(v) => patch((o) => ({ ...o, x: v / 100 }), k('x'))} />
        <SliderRow label="عمودي" value={Math.round(overlay.y * 100)} min={0} max={100} format={pct} onChange={(v) => patch((o) => ({ ...o, y: v / 100 }), k('y'))} />
        <div className="grid grid-cols-3 gap-1">
          {[
            ['أعلى يمين', 0.75, 0.2], ['أعلى', 0.5, 0.2], ['أعلى يسار', 0.25, 0.2],
            ['يمين', 0.75, 0.5], ['وسط', 0.5, 0.5], ['يسار', 0.25, 0.5],
            ['أسفل يمين', 0.75, 0.8], ['أسفل', 0.5, 0.8], ['أسفل يسار', 0.25, 0.8],
          ].map(([label, x, y]) => (
            <button key={label as string} type="button" onClick={() => patch((o) => ({ ...o, x: x as number, y: y as number }))}
              className="rounded-md bg-white/5 py-1.5 text-[10px] text-slate-300 hover:bg-white/10">
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">داخل المعاينة: إصبع للتحريك، وإصبعان للتكبير والتدوير.</p>
      </Section>
      <Section title="حركة الدخول">{chips('in')}</Section>
      <Section title="حركة الخروج">{chips('out')}</Section>
      {asset?.kind === 'video' && asset.hasAudio && (
        <Section
          title="الصوت"
          action={
            <button type="button" onClick={() => patch((o) => ({ ...o, muted: !o.muted }))}
              className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[11px]', overlay.muted ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-slate-300')}>
              {overlay.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {overlay.muted ? 'مكتوم' : 'كتم'}
            </button>
          }
        >
          <SliderRow label="مستوى الصوت" value={Math.round(overlay.volume * 100)} min={0} max={100} format={pct}
            onChange={(v) => patch((o) => ({ ...o, volume: v / 100 }), k('vol'))} />
        </Section>
      )}
    </div>
  );
}

export function TransitionInspector({
  clip,
  onChange,
  frames,
  preview,
}: {
  clip: MainClip;
  onChange: (fn: (c: MainClip) => MainClip, coalesceKey?: string) => void;
  frames: { a?: string; b?: string };
  preview: () => void;
}) {
  return (
    <div>
      <Section title="الانتقال">
        <div className="grid grid-cols-3 gap-1.5">
          {TRANSITIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onChange((c) => ({ ...c, transition: { ...c.transition, type: t.id as TransitionType } }));
                if (t.id !== 'none') preview();
              }}
              className="text-center text-[10px] text-slate-300"
            >
              <div className={cn('aspect-[3/4] overflow-hidden rounded-md ring-2', clip.transition.type === t.id ? 'ring-cyan-400' : 'ring-transparent')}>
                <TransitionThumb a={frames.a} b={frames.b} type={t.id} />
              </div>
              <span className="mt-0.5 block">{t.label}</span>
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

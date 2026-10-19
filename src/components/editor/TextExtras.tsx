import React from 'react';
import { cn } from '../../lib/utils';
import { TEXT_ANIMS_IN, TEXT_ANIMS_LOOP, TEXT_ANIMS_OUT, TEXT_BG_SHAPES } from '../../editor/constants';
import { FONT_GROUPS, FONT_LIST, FontGroup, ensureFonts } from '../../editor/fonts';
import { setTextKeyframe } from '../../editor/timeline';
import { TextClip } from '../../editor/types';
import { TextThumb } from './previews';
import { ColorInput, Section, Segmented, SliderRow } from './ui';

type Patch = (fn: (t: TextClip) => TextClip, coalesceKey?: string) => void;
type Preview = (part: 'in' | 'out' | 'whole') => void;

const pct = (v: number) => `${Math.round(v)}%`;
const chip = (active: boolean) =>
  cn('rounded-lg px-2 py-1.5 text-[11px] transition', active ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400' : 'bg-white/5 text-slate-300 hover:bg-white/10');

export function FontPicker({ text, patch }: { text: TextClip; patch: Patch }) {
  const current = FONT_LIST.find((f) => f.family === text.font);
  const [group, setGroup] = React.useState<FontGroup>(current?.group ?? 'modern');
  const fonts = FONT_LIST.filter((f) => f.group === group);
  // Fetch the group's fonts so each button shows its own lettering.
  React.useEffect(() => {
    ensureFonts(fonts.map((f) => f.family));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);
  const sample = /[؀-ۿ]/.test(text.text) || group !== 'latin' ? 'أبجد هوز' : 'Abc';
  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FONT_GROUPS.map((g) => (
          <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={cn(chip(group === g.id), 'shrink-0')}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {fonts.map((f) => (
          <button
            key={f.family}
            type="button"
            onClick={() => {
              ensureFonts([f.family]).then(() => patch((t) => ({ ...t, font: f.family })));
            }}
            className={cn(
              'rounded-lg px-2 py-1.5 text-center transition',
              text.font === f.family ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-400' : 'bg-white/5 text-slate-200 hover:bg-white/10'
            )}
          >
            <span className="block truncate text-lg leading-snug" style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: text.bold && f.weights.length > 1 ? 800 : 400 }}>
              {group === 'latin' ? 'Abc' : sample}
            </span>
            <span className="block text-[9px] text-slate-400">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A short version of the text, styled like it, for the animation previews. */
function sampleOf(text: TextClip): TextClip {
  const word = text.text.trim().split(/\s+/).slice(0, 2).join(' ') || 'نص';
  return {
    ...text,
    id: 'sample',
    text: word.length > 12 ? word.slice(0, 12) : word,
    words: undefined,
    keys: undefined,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    fontSize: 210,
    start: 0,
    animIn: 'none',
    animOut: 'none',
    animLoop: 'none',
  };
}

function AnimGrid<T extends string>({
  options,
  value,
  sample,
  make,
  loop,
  onPick,
}: {
  options: { id: T; label: string }[];
  value: T;
  sample: TextClip;
  make: (sample: TextClip, id: T) => TextClip;
  loop: number;
  onPick: (id: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a.id)}
          className={cn('flex flex-col items-center gap-1 rounded-lg p-1 text-[10px] transition', value === a.id ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400' : 'bg-white/5 text-slate-300 hover:bg-white/10')}
        >
          <span className="block aspect-[2/1] w-full overflow-hidden rounded">
            <TextThumb texts={[make(sample, a.id)]} loop={loop} width={800} height={400} still={loop * 0.7} />
          </span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function TextAnimSections({ text, patch, preview }: { text: TextClip; patch: Patch; preview: Preview }) {
  const sample = React.useMemo(() => sampleOf(text), [text.text, text.font, text.bold, text.color, text.strokeColor, text.strokeWidth, text.background, text.gradient, text.glow, text.extrude, text.bgShape]);
  return (
    <>
      <Section title="حركة الدخول">
        <AnimGrid
          options={TEXT_ANIMS_IN}
          value={text.animIn}
          sample={sample}
          loop={2.2}
          make={(s, id) => ({ ...s, duration: 2.2, animIn: id })}
          onPick={(id) => {
            patch((t) => ({ ...t, animIn: id }));
            preview('in');
          }}
        />
      </Section>
      <Section title="حركة الخروج">
        <AnimGrid
          options={TEXT_ANIMS_OUT}
          value={text.animOut}
          sample={sample}
          loop={2}
          make={(s, id) => ({ ...s, duration: 1.5, animOut: id })}
          onPick={(id) => {
            patch((t) => ({ ...t, animOut: id }));
            preview('out');
          }}
        />
      </Section>
      <Section title="حركة مستمرة">
        <AnimGrid
          options={TEXT_ANIMS_LOOP}
          value={text.animLoop ?? 'none'}
          sample={sample}
          loop={3}
          make={(s, id) => ({ ...s, duration: 3, animLoop: id })}
          onPick={(id) => {
            patch((t) => ({ ...t, animLoop: id }));
            preview('whole');
          }}
        />
      </Section>
    </>
  );
}

function Toggle({ label, on, onChange, children }: { label: string; on: boolean; onChange: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
      </label>
      {on && children && <div className="space-y-2 rounded-lg bg-white/[0.03] p-2">{children}</div>}
    </div>
  );
}

export function TextStyleSection({ text, patch }: { text: TextClip; patch: Patch }) {
  const k = (name: string) => `${text.id}-${name}`;
  return (
    <Section title="تأثيرات النص">
      <Toggle label="تدرّج لوني" on={!!text.gradient} onChange={(on) => patch((t) => ({ ...t, gradient: on ? '#f59e0b' : null }))}>
        <ColorInput label="اللون الثاني (أسفل)" value={text.gradient ?? '#f59e0b'} onChange={(v) => patch((t) => ({ ...t, gradient: v }), k('grad'))} />
      </Toggle>
      <Toggle label="توهج" on={!!text.glow} onChange={(on) => patch((t) => ({ ...t, glow: on ? '#22d3ee' : null }))}>
        <ColorInput label="لون التوهج" value={text.glow ?? '#22d3ee'} onChange={(v) => patch((t) => ({ ...t, glow: v }), k('glow'))} />
      </Toggle>
      <Toggle label="ظل" on={text.shadow} onChange={(on) => patch((t) => ({ ...t, shadow: on }))}>
        <ColorInput
          label="لون الظل"
          value={text.shadowColor?.startsWith('#') ? text.shadowColor : '#000000'}
          onChange={(v) => patch((t) => ({ ...t, shadowColor: v }), k('shc'))}
        />
        <SliderRow label="البعد" value={Math.round((text.shadowOffset ?? 0.05) * 100)} min={0} max={30} format={pct}
          onChange={(v) => patch((t) => ({ ...t, shadowOffset: v / 100 }), k('sho'))} />
        <SliderRow label="النعومة" value={Math.round((text.shadowBlur ?? 0.15) * 100)} min={0} max={100} format={pct}
          onChange={(v) => patch((t) => ({ ...t, shadowBlur: v / 100 }), k('shb'))} />
      </Toggle>
      <Toggle label="عمق ثلاثي الأبعاد" on={(text.extrude ?? 0) > 0} onChange={(on) => patch((t) => ({ ...t, extrude: on ? 0.08 : 0, extrudeColor: t.extrudeColor ?? '#7c3aed' }))}>
        <SliderRow label="العمق" value={Math.round((text.extrude ?? 0) * 100)} min={1} max={25} format={pct}
          onChange={(v) => patch((t) => ({ ...t, extrude: v / 100 }), k('ext'))} />
        <ColorInput label="لون العمق" value={text.extrudeColor ?? '#7c3aed'} onChange={(v) => patch((t) => ({ ...t, extrudeColor: v }), k('extc'))} />
      </Toggle>
      {text.background && (
        <div>
          <div className="mb-1 text-[11px] text-slate-400">شكل الخلفية</div>
          <Segmented options={TEXT_BG_SHAPES.map((b) => ({ id: b.id, label: b.label }))} value={text.bgShape ?? 'box'} onChange={(bgShape) => patch((t) => ({ ...t, bgShape }))} />
        </div>
      )}
      <SliderRow label="الشفافية" value={Math.round((text.opacity ?? 1) * 100)} min={10} max={100} format={pct}
        onChange={(v) => patch((t) => ({ ...t, opacity: v / 100 }), k('op'))} />
      <SliderRow label="تباعد الأسطر" value={Math.round((text.lineHeight ?? 1.3) * 100)} min={80} max={250} format={pct}
        onChange={(v) => patch((t) => ({ ...t, lineHeight: v / 100 }), k('lh'))} />
    </Section>
  );
}

export function TextKeyframesSection({ text, patch, progress }: { text: TextClip; patch: Patch; progress: number }) {
  const keys = text.keys ?? [];
  return (
    <Section title="إطارات مفتاحية (تحريك النص)">
      <p className="text-[11px] leading-relaxed text-slate-500">
        حرّك المؤشر، وضع النص في مكانه وحجمه، ثم أضف إطاراً. أضف إطاراً ثانياً في وقت آخر ليتحرك النص بينهما. بعد أول إطار، كل تحريك يُحفظ تلقائياً عند المؤشر.
      </p>
      <button
        type="button"
        onClick={() => patch((t) => ({ ...t, keys: setTextKeyframe(t, progress) }))}
        className="w-full rounded-lg bg-cyan-400/15 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/25"
      >
        ◆ إضافة إطار مفتاحي عند المؤشر ({Math.round(progress * 100)}%)
      </button>
      {keys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {keys.map((key, i) => (
            <span key={i} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] text-slate-300">
              ◆ {Math.round(key.at * 100)}%
              <button
                type="button"
                title="حذف الإطار"
                onClick={() =>
                  patch((t) => {
                    const left = (t.keys ?? []).filter((_, j) => j !== i);
                    return { ...t, keys: left.length ? left : undefined };
                  })
                }
                className="text-slate-500 hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={() => patch((t) => ({ ...t, keys: undefined }))} className="mr-auto text-[10px] text-slate-500 hover:text-red-300">
            حذف الكل
          </button>
        </div>
      )}
    </Section>
  );
}

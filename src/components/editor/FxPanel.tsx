import React from 'react';
import { Loader2, X, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FX_GROUPS, FxGroup, PRO_FX, fxDef, newFxLayer } from '../../editor/proFx';
import { onSegmenterReady, segmenterError, segmenterReady } from '../../editor/segment';
import { EffectItem, FxLayer } from '../../editor/types';
import { ClipFxThumb } from './previews';
import { ColorInput, Section, SliderRow } from './ui';

const pct = (v: number) => `${Math.round(v)}%`;
const chip = (active: boolean) =>
  cn('shrink-0 rounded-lg px-2.5 py-1.5 text-[11px]', active ? 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-400' : 'bg-white/5 text-slate-300');
const tile = (active: boolean) =>
  cn('flex flex-col items-center gap-1 rounded-lg p-1 text-[10px] transition', active ? 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-400' : 'bg-white/5 text-slate-300 hover:bg-white/10');

/** Re-renders when the person model finishes loading. */
function useSegmenterState() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const off = onSegmenterReady(() => setTick((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  return { ready: segmenterReady(), error: segmenterError() };
}

/** Grouped grid of every pro effect, each previewed live on a frame. */
export function FxPicker({ frame, active, onPick }: { frame?: string | null; active: (id: string) => boolean; onPick: (id: string) => void }) {
  const [group, setGroup] = React.useState<FxGroup>('particles');
  const seg = useSegmenterState();
  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FX_GROUPS.map((g) => (
          <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={chip(group === g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      {group === 'body' && !seg.ready && (
        <p className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-400">
          {seg.error ? (
            'تعذر تحميل نموذج الذكاء الاصطناعي على هذا المتصفح.'
          ) : (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> يُحمَّل نموذج فصل الشخص أول مرة فقط (حوالي 13 ميغابايت)...
            </>
          )}
        </p>
      )}
      <div className="grid grid-cols-4 gap-1">
        {PRO_FX.filter((f) => f.group === group).map((f) => (
          <button key={f.id} type="button" onClick={() => onPick(f.id)} className={tile(active(f.id))}>
            <span className="block aspect-square w-full overflow-hidden rounded">
              <ClipFxThumb src={frame} loop={3} patch={{ fx: [newFxLayer(f.id, 0.8)] }} />
            </span>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Settings for one effect layer. */
export function FxSettings({ layer, onChange, coalesce }: { layer: FxLayer; onChange: (l: FxLayer, key?: string) => void; coalesce: string }) {
  const def = fxDef(layer.type);
  const body = def?.group === 'body';
  return (
    <div className="space-y-2">
      <SliderRow label="القوة" value={Math.round(layer.intensity * 100)} min={5} max={100} format={pct} onChange={(v) => onChange({ ...layer, intensity: v / 100 }, `${coalesce}-i`)} />
      {!body && def?.group !== 'split' && (
        <SliderRow label="السرعة" value={Math.round((layer.speed ?? 1) * 100)} min={25} max={300} format={pct} onChange={(v) => onChange({ ...layer, speed: v / 100 }, `${coalesce}-s`)} />
      )}
      {def?.color && <ColorInput label="اللون" value={layer.color ?? def.color} onChange={(v) => onChange({ ...layer, color: v }, `${coalesce}-c`)} />}
    </div>
  );
}

/** A clip's or PiP's stack of pro effects: pick to add, then tune or remove each. */
export function ProFxSection({ layers, frame, onChange, onPreview, title = 'تأثيرات احترافية' }: { layers: FxLayer[]; frame?: string | null; onChange: (l: FxLayer[], key?: string) => void; onPreview: () => void; title?: string }) {
  return (
    <Section title={title}>
      {layers.length > 0 && (
        <div className="space-y-2">
          {layers.map((l, i) => (
            <div key={`${l.type}-${i}`} className="space-y-2 rounded-lg bg-amber-500/5 p-2 ring-1 ring-amber-400/20">
              <div className="flex items-center justify-between text-xs font-bold text-amber-100">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> {fxDef(l.type)?.label ?? l.type}
                </span>
                <button type="button" title="إزالة" onClick={() => onChange(layers.filter((_, j) => j !== i))} className="rounded p-0.5 text-slate-400 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <FxSettings layer={l} coalesce={`fx-${i}`} onChange={(n, key) => onChange(layers.map((x, j) => (j === i ? n : x)), key)} />
            </div>
          ))}
        </div>
      )}
      <FxPicker
        frame={frame}
        active={(id) => layers.some((l) => l.type === id)}
        onPick={(id) => {
          const exists = layers.findIndex((l) => l.type === id);
          onChange(exists >= 0 ? layers.filter((_, j) => j !== exists) : [...layers, newFxLayer(id)]);
          if (exists < 0) onPreview();
        }}
      />
      <p className="text-[10px] leading-relaxed text-slate-500">يمكن جمع عدة تأثيرات. اضغط على التأثير مرة أخرى لإزالته.</p>
    </Section>
  );
}

/** The effects panel: adds an effect to the effects track at the playhead. */
export function EffectsPanel({ frame, onAdd }: { frame?: string | null; onAdd: (type: string) => void }) {
  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        التأثير يُضاف في مسار التأثيرات عند المؤشر، ويُطبَّق على كل ما تحته (الفيديو والطبقات) طوال مدته. اسحب طرفيه في الخط الزمني لتغيير مدته.
      </p>
      <FxPicker frame={frame} active={() => false} onPick={onAdd} />
    </div>
  );
}

/** Inspector for an item on the effects track. */
export function EffectInspector({ item, patch, onDelete }: { item: EffectItem; patch: (fn: (e: EffectItem) => EffectItem, key?: string) => void; onDelete: () => void }) {
  return (
    <div>
      <Section
        title={fxDef(item.type)?.label ?? 'تأثير'}
        action={
          <button type="button" onClick={onDelete} className="text-[11px] text-slate-400 hover:text-red-300">
            حذف
          </button>
        }
      >
        <FxSettings layer={item} coalesce={`effect-${item.id}`} onChange={(l, key) => patch((e) => ({ ...e, ...l }), key)} />
        <SliderRow
          label="المدة"
          value={item.duration}
          min={0.3}
          max={60}
          step={0.1}
          format={(v) => `${v.toFixed(1)}ث`}
          onChange={(v) => patch((e) => ({ ...e, duration: v }), `effect-${item.id}-d`)}
        />
      </Section>
      <Section title="تغيير التأثير">
        <FxPicker frame={null} active={(id) => id === item.type} onPick={(type) => patch((e) => ({ ...e, ...newFxLayer(type, e.intensity), id: e.id, start: e.start, duration: e.duration }))} />
      </Section>
    </div>
  );
}


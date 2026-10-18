import React from 'react';
import { cn } from '../../lib/utils';

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-white/5 px-4 py-3.5 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold tracking-wide text-slate-300">{title}</h4>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface SliderRowProps {
  key?: React.Key;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onReset?: () => void;
}

export function SliderRow({ label, value, min, max, step = 1, format, onChange, onReset }: SliderRowProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <button
          type="button"
          onClick={onReset}
          disabled={!onReset}
          className="tabular-nums text-slate-200 enabled:hover:text-cyan-300"
          title={onReset ? 'إعادة الضبط' : undefined}
        >
          {format ? format(value) : value}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-cyan-400"
        dir="ltr"
      />
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex rounded-lg bg-white/5 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
            value === o.id ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/10'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-slate-500" dir="ltr">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent"
        />
      </span>
    </label>
  );
}

export function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active ? 'bg-cyan-400/15 text-cyan-300' : 'text-slate-300 enabled:hover:bg-white/10',
        danger && 'enabled:hover:bg-red-500/15 enabled:hover:text-red-300'
      )}
    >
      <Icon className="h-4 w-4" />
      {!compact && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

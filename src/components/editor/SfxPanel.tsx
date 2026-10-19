import React from 'react';
import { Loader2, Play, Plus, Search, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FreesoundHit, SFX_GROUPS, SFX_LIST, SfxGroup, freesoundFile, playPreview, renderSfx, searchFreesound } from '../../editor/sfx';

interface SfxPanelProps {
  /** Adds a built-in effect at the playhead. */
  onAddBuiltIn: (id: string) => Promise<void>;
  /** Adds a downloaded file at the playhead. */
  onAddFile: (file: File) => Promise<void>;
  /** Drops an effect on every cut or every text. */
  onAuto: (id: string, where: 'cuts' | 'texts') => Promise<void>;
}

const chip = (active: boolean) =>
  cn('shrink-0 rounded-lg px-2.5 py-1.5 text-[11px]', active ? 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-400' : 'bg-white/5 text-slate-300');

/** Freesound previews, decoded once for auditioning. */
const decoded = new Map<number, Promise<{ file: File; buffer: AudioBuffer }>>();
function loadHit(hit: FreesoundHit) {
  let p = decoded.get(hit.id);
  if (!p) {
    p = freesoundFile(hit).then(async (file) => ({ file, buffer: await new AudioContext().decodeAudioData(await file.arrayBuffer()) }));
    p.catch(() => decoded.delete(hit.id));
    decoded.set(hit.id, p);
  }
  return p;
}

export function SfxPanel({ onAddBuiltIn, onAddFile, onAuto }: SfxPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'builtin' | 'search'>('builtin');
  const [group, setGroup] = React.useState<SfxGroup>('transitions');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<FreesoundHit[] | null>(null);

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      if (done) setMessage(done);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'حدث خطأ.');
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 py-3 text-sm font-bold text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-500/25"
      >
        <Sparkles className="h-4 w-4" />
        مؤثرات صوتية
      </button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl bg-amber-500/5 p-3 ring-1 ring-amber-400/20">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
          <Sparkles className="h-4 w-4" />
          مؤثرات صوتية
        </span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-slate-400">
          إخفاء
        </button>
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setTab('builtin')} className={cn(chip(tab === 'builtin'), 'flex-1')}>
          مكتبة جاهزة
        </button>
        <button type="button" onClick={() => setTab('search')} className={cn(chip(tab === 'search'), 'flex-1')}>
          بحث (Freesound)
        </button>
      </div>

      {tab === 'builtin' ? (
        <>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {SFX_GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={chip(group === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SFX_LIST.filter((s) => s.group === group).map((s) => (
              <div key={s.id} className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                <button
                  type="button"
                  title="استماع"
                  onClick={() => renderSfx(s.id).then(playPreview)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-amber-200"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => run(s.id, () => onAddBuiltIn(s.id), `تمت إضافة "${s.label}" عند المؤشر.`)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-1 px-1 text-xs text-slate-200"
                >
                  <span className="truncate">{s.label}</span>
                  {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-white/5 pt-2">
            <div className="text-[11px] text-slate-400">إضافة تلقائية</div>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run('auto-cuts', () => onAuto('whoosh', 'cuts'), 'تمت إضافة "ووش" عند كل انتقال.')}
              className="w-full rounded-lg bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy === 'auto-cuts' ? '...' : '"ووش" عند كل انتقال بين المقاطع'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run('auto-texts', () => onAuto('pop', 'texts'), 'تمت إضافة "بوب" عند كل نص.')}
              className="w-full rounded-lg bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy === 'auto-texts' ? '...' : '"بوب" عند ظهور كل نص وملصق'}
            </button>
          </div>
        </>
      ) : (
        <>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!query.trim()) return;
              run('search', async () => setHits(await searchFreesound(query.trim())));
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              dir="auto"
              placeholder="مثلاً: تصفيق، ضحك، مطر، باب..."
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <button type="submit" disabled={!query.trim() || busy === 'search'} className="flex w-10 items-center justify-center rounded-lg bg-amber-500 text-slate-950 disabled:opacity-40" aria-label="بحث">
              {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </form>
          {hits && hits.length === 0 && <p className="text-[11px] text-slate-400">لا توجد نتائج. جرّب كلمة أخرى.</p>}
          {hits && hits.length > 0 && (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {hits.map((h) => (
                <div key={h.id} className="flex items-center gap-1.5 rounded-lg bg-white/5 p-1">
                  <button
                    type="button"
                    title="استماع"
                    onClick={() => run(`play-${h.id}`, async () => playPreview((await loadHit(h)).buffer))}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-amber-200"
                  >
                    {busy === `play-${h.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  </button>
                  <div className="min-w-0 flex-1" dir="ltr">
                    <div className="truncate text-[11px] text-slate-200">{h.name}</div>
                    <div className="text-[10px] text-slate-500">{h.duration.toFixed(1)}s · {h.user}</div>
                  </div>
                  <button
                    type="button"
                    title="إضافة"
                    onClick={() => run(`add-${h.id}`, async () => onAddFile((await loadHit(h)).file), 'تمت الإضافة عند المؤشر.')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-100"
                  >
                    {busy === `add-${h.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-slate-500">أصوات من Freesound بترخيص CC0 فقط: مجانية حتى للاستخدام التجاري وبدون ذكر المصدر.</p>
        </>
      )}
      {message && <p className="text-[11px] text-amber-200/80">{message}</p>}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Image as ImageIcon, Music, Type, VolumeX } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MAX_IMAGE_DURATION, MIN_CLIP_DURATION, PEAKS_PER_SECOND } from '../../editor/constants';
import { assignLanes, audioClipEnd, clamp, formatTime, snap } from '../../editor/timeline';
import {
  AudioClip,
  LaidOutClip,
  MainClip,
  MediaAsset,
  Project,
  Selection,
  TextClip,
} from '../../editor/types';

type Updater<T> = (id: string, fn: (item: T) => T, coalesceKey?: string) => void;

interface TimelineProps {
  project: Project;
  layout: LaidOutClip[];
  assets: Map<string, MediaAsset>;
  duration: number;
  time: number;
  playing: boolean;
  pxPerSec: number;
  onZoom: (pps: number) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSeek: (t: number) => void;
  onUpdateClip: Updater<MainClip>;
  onUpdateText: Updater<TextClip>;
  onUpdateAudio: Updater<AudioClip>;
  onReorder: (from: number, to: number) => void;
  onDropAsset: (assetId: string, time: number) => void;
  onAddText: () => void;
  onAddAudio: () => void;
}

const PAD = 16;
const RULER_H = 26;
const MAIN_H = 64;
const LANE_H = 30;
const SNAP_PX = 8;

function rulerStep(pps: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  return steps.find((s) => s * pps >= 70) ?? 300;
}

/** Window-level pointer drag that reports horizontal movement in pixels. */
function startDrag(
  e: React.PointerEvent,
  onMove: (dx: number) => void,
  onEnd?: (moved: boolean, dx: number) => void
) {
  e.stopPropagation();
  const startX = e.clientX;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    onMove(dx);
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onEnd?.(moved, ev.clientX - startX);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function Waveform({ peaks, from, to, width }: { peaks?: number[]; from: number; to: number; width: number }) {
  const path = useMemo(() => {
    if (!peaks?.length || width <= 0) return '';
    const bars = Math.max(1, Math.floor(width / 3));
    const a = from * PEAKS_PER_SECOND;
    const b = to * PEAKS_PER_SECOND;
    let d = '';
    for (let i = 0; i < bars; i++) {
      const idx = Math.floor(a + ((b - a) * i) / bars);
      const v = peaks[Math.min(peaks.length - 1, Math.max(0, idx))] ?? 0;
      const h = Math.max(1, v * 20);
      d += `M${i * 3 + 1} ${12 - h / 2}v${h}`;
    }
    return d;
  }, [peaks, from, to, width]);
  if (!path) return null;
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0.5 h-6" width={width} height={24} viewBox={`0 0 ${width} 24`} preserveAspectRatio="none">
      <path d={path} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function TrimHandle({ side, onPointerDown }: { side: 'start' | 'end'; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'absolute inset-y-0 z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center bg-white/90',
        side === 'start' ? 'left-0 rounded-l-[5px]' : 'right-0 rounded-r-[5px]'
      )}
    >
      <div className="h-4 w-0.5 rounded bg-slate-800" />
    </div>
  );
}

export function EditorTimeline(props: TimelineProps) {
  const {
    project, layout, assets, duration, time, playing, pxPerSec: pps, onZoom, selection, onSelect, onSeek,
    onUpdateClip, onUpdateText, onUpdateAudio, onReorder, onDropAsset, onAddText, onAddAudio,
  } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(800);
  const [reorder, setReorder] = useState<{ id: string; dx: number; target: number } | null>(null);
  const [dropHover, setDropHover] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Follow the playhead during playback.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = PAD + time * pps;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - 60;
  }, [time, playing, pps]);

  // Ctrl/Cmd + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoom(clamp(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 8, 400));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pps, onZoom]);

  const textLanes = useMemo(() => assignLanes(project.texts, (t) => [t.start, t.start + t.duration]), [project.texts]);
  const audioLanes = useMemo(() => assignLanes(project.audios, (a) => [a.start, audioClipEnd(a)]), [project.audios]);

  const contentWidth = PAD * 2 + Math.max((duration + 8) * pps, viewport);
  const timeAtClientX = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - PAD) / pps);
  };

  const snapPoints = useMemo(() => {
    const pts = [0, time];
    for (const lc of layout) pts.push(lc.start, lc.end);
    for (const t of project.texts) pts.push(t.start, t.start + t.duration);
    for (const a of project.audios) pts.push(a.start, audioClipEnd(a));
    return pts;
  }, [layout, project.texts, project.audios, time]);

  const scrub = (e: React.PointerEvent) => {
    onSeek(timeAtClientX(e.clientX));
    const move = (ev: PointerEvent) => onSeek(timeAtClientX(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- main track ----------
  const onMainPointerDown = (e: React.PointerEvent, lc: LaidOutClip) => {
    onSelect({ kind: 'clip', id: lc.clip.id });
    const centre = lc.start + lc.duration / 2;
    let target = lc.index;
    startDrag(
      e,
      (dx) => {
        const c = centre + dx / pps;
        target = 0;
        for (const other of layout) {
          if (other.clip.id !== lc.clip.id && other.start + other.duration / 2 < c) target++;
        }
        setReorder({ id: lc.clip.id, dx, target });
      },
      (moved) => {
        setReorder(null);
        if (moved && target !== lc.index) onReorder(lc.index, target);
      }
    );
  };

  const onMainTrim = (e: React.PointerEvent, lc: LaidOutClip, side: 'start' | 'end') => {
    onSelect({ kind: 'clip', id: lc.clip.id });
    const key = `trim-${lc.clip.id}-${performance.now()}`;
    const { inPoint: in0, outPoint: out0, speed } = lc.clip;
    const isImage = lc.asset.kind === 'image';
    const maxOut = isImage ? MAX_IMAGE_DURATION : lc.asset.duration;
    const minSrc = MIN_CLIP_DURATION * speed;
    startDrag(e, (dx) => {
      const dSrc = (dx / pps) * speed;
      onUpdateClip(lc.clip.id, (c) => {
        if (side === 'end') return { ...c, outPoint: clamp(out0 + dSrc, in0 + minSrc, maxOut) };
        if (isImage) return { ...c, outPoint: clamp(out0 - dSrc, minSrc, maxOut) };
        return { ...c, inPoint: clamp(in0 + dSrc, 0, out0 - minSrc) };
      }, key);
    });
  };

  // ---------- free tracks (text / audio) ----------
  const snapMove = (start: number, length: number, excludeId: string, items: { id: string; s: number; e: number }[]) => {
    const own = items.find((i) => i.id === excludeId);
    const pts = snapPoints.filter((p) => !own || (Math.abs(p - own.s) > 1e-6 && Math.abs(p - own.e) > 1e-6));
    const th = SNAP_PX / pps;
    const s1 = snap(start, pts, th);
    const e1 = snap(start + length, pts, th) - length;
    const best = Math.abs(s1 - start) <= Math.abs(e1 - start) && s1 !== start ? s1 : e1 !== start ? e1 : s1;
    return Math.max(0, best);
  };

  const onTextPointerDown = (e: React.PointerEvent, t: TextClip, mode: 'move' | 'start' | 'end') => {
    onSelect({ kind: 'text', id: t.id });
    const key = `text-${t.id}-${performance.now()}`;
    const items = project.texts.map((x) => ({ id: x.id, s: x.start, e: x.start + x.duration }));
    const th = SNAP_PX / pps;
    startDrag(e, (dx) => {
      const dt = dx / pps;
      onUpdateText(t.id, (x) => {
        if (mode === 'move') return { ...x, start: snapMove(t.start + dt, t.duration, t.id, items) };
        if (mode === 'end') {
          const end = snap(t.start + t.duration + dt, snapPoints, th);
          return { ...x, duration: Math.max(MIN_CLIP_DURATION, end - t.start) };
        }
        const end = t.start + t.duration;
        const start = clamp(snap(t.start + dt, snapPoints, th), 0, end - MIN_CLIP_DURATION);
        return { ...x, start, duration: end - start };
      }, key);
    });
  };

  const onAudioPointerDown = (e: React.PointerEvent, a: AudioClip, mode: 'move' | 'start' | 'end') => {
    onSelect({ kind: 'audio', id: a.id });
    const asset = assets.get(a.assetId);
    const key = `audio-${a.id}-${performance.now()}`;
    const items = project.audios.map((x) => ({ id: x.id, s: x.start, e: audioClipEnd(x) }));
    const len = a.outPoint - a.inPoint;
    const th = SNAP_PX / pps;
    startDrag(e, (dx) => {
      const dt = dx / pps;
      onUpdateAudio(a.id, (x) => {
        if (mode === 'move') return { ...x, start: snapMove(a.start + dt, len, a.id, items) };
        if (mode === 'end') {
          const end = snap(audioClipEnd(a) + dt, snapPoints, th);
          return { ...x, outPoint: clamp(a.inPoint + (end - a.start), a.inPoint + MIN_CLIP_DURATION, asset?.duration ?? a.outPoint) };
        }
        let shift = snap(a.start + dt, snapPoints, th) - a.start;
        shift = clamp(shift, Math.max(-a.inPoint, -a.start), len - MIN_CLIP_DURATION);
        return { ...x, start: a.start + shift, inPoint: a.inPoint + shift };
      }, key);
    });
  };

  const step = rulerStep(pps);
  const ticks: number[] = [];
  for (let s = 0; s <= (contentWidth - PAD) / pps; s += step) ticks.push(s);

  const textTrackH = textLanes.count * LANE_H + 8;
  const audioTrackH = audioLanes.count * LANE_H + 8;

  return (
    <div
      ref={scrollRef}
      dir="ltr"
      className={cn(
        'relative h-full select-none overflow-x-auto overflow-y-auto overscroll-contain bg-[#0e1117]',
        dropHover && 'ring-2 ring-inset ring-cyan-400/60'
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-asset-id')) {
          e.preventDefault();
          setDropHover(true);
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        setDropHover(false);
        const id = e.dataTransfer.getData('application/x-asset-id');
        if (id) {
          e.preventDefault();
          onDropAsset(id, timeAtClientX(e.clientX));
        }
      }}
    >
      <div className="relative" style={{ width: contentWidth, minHeight: '100%' }}>
        {/* Ruler */}
        <div
          className="sticky top-0 z-30 cursor-pointer touch-none border-b border-white/5 bg-[#0e1117]/95 backdrop-blur"
          style={{ height: RULER_H }}
          onPointerDown={scrub}
        >
          {ticks.map((s) => (
            <div key={s} className="absolute top-0 h-full" style={{ left: PAD + s * pps }}>
              <div className="h-2 w-px bg-slate-500" />
              <span className="absolute left-1 top-1.5 text-[10px] tabular-nums text-slate-500">{formatTime(s)}</span>
              {[1, 2, 3, 4].map((k) => (
                <div key={k} className="absolute top-0 h-1 w-px bg-slate-700" style={{ left: (step * pps * k) / 5 }} />
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-1.5 py-2" onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); scrub(e); } }}>
          {/* Text track */}
          <div className="relative" style={{ height: textTrackH }} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); scrub(e); } }}>
            {project.texts.length === 0 && (
              <button
                type="button"
                onClick={onAddText}
                className="absolute top-1 flex h-[26px] items-center gap-1.5 rounded-md border border-dashed border-fuchsia-400/30 px-3 text-[11px] text-fuchsia-300/80 hover:bg-fuchsia-500/10"
                style={{ left: PAD }}
              >
                <Type className="h-3.5 w-3.5" /> إضافة نص
              </button>
            )}
            {project.texts.map((t) => {
              const lane = textLanes.lanes.get(t.id) ?? 0;
              const selected = selection?.kind === 'text' && selection.id === t.id;
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => onTextPointerDown(e, t, 'move')}
                  className={cn(
                    'absolute flex cursor-grab touch-none items-center overflow-hidden rounded-md bg-fuchsia-600/80 text-[11px] font-semibold text-white active:cursor-grabbing',
                    selected ? 'ring-2 ring-white' : 'hover:bg-fuchsia-500/90'
                  )}
                  style={{ left: PAD + t.start * pps, width: Math.max(6, t.duration * pps), top: 4 + lane * LANE_H, height: LANE_H - 4 }}
                >
                  {selected && <TrimHandle side="start" onPointerDown={(e) => onTextPointerDown(e, t, 'start')} />}
                  <Type className="mx-1.5 h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate pr-3" dir="auto">{t.text || 'نص'}</span>
                  {selected && <TrimHandle side="end" onPointerDown={(e) => onTextPointerDown(e, t, 'end')} />}
                </div>
              );
            })}
          </div>

          {/* Main track */}
          <div className="relative" style={{ height: MAIN_H }} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); scrub(e); } }}>
            {layout.length === 0 && (
              <div
                className="absolute inset-y-0 flex items-center rounded-lg border border-dashed border-white/15 px-4 text-xs text-slate-500"
                style={{ left: PAD, right: PAD }}
              >
                اسحب مقاطع الفيديو أو الصور إلى هنا
              </div>
            )}
            {layout.map((lc) => {
              const selected = selection?.kind === 'clip' && selection.id === lc.clip.id;
              const isDragging = reorder?.id === lc.clip.id;
              const width = Math.max(4, lc.duration * pps);
              return (
                <div
                  key={lc.clip.id}
                  onPointerDown={(e) => onMainPointerDown(e, lc)}
                  className={cn(
                    'absolute inset-y-0 cursor-grab touch-none overflow-hidden rounded-md border-2 bg-slate-800 bg-repeat-x active:cursor-grabbing',
                    selected ? 'border-white' : 'border-slate-900 hover:border-slate-500',
                    isDragging && 'z-20 opacity-80 shadow-2xl'
                  )}
                  style={{
                    left: PAD + lc.start * pps,
                    width,
                    transform: isDragging ? `translateX(${reorder!.dx}px)` : undefined,
                    backgroundImage: lc.asset.thumbnail ? `url(${lc.asset.thumbnail})` : undefined,
                    backgroundSize: 'auto 100%',
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                  <div className="pointer-events-none absolute left-3.5 right-3.5 top-1 flex items-center gap-1 text-[10px] font-semibold text-white">
                    {lc.asset.kind === 'image' && <ImageIcon className="h-3 w-3 shrink-0" />}
                    {lc.clip.muted && <VolumeX className="h-3 w-3 shrink-0 text-red-300" />}
                    {lc.clip.speed !== 1 && <span className="rounded bg-amber-400 px-1 text-slate-900">{lc.clip.speed}x</span>}
                    {lc.clip.filterId !== 'none' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />}
                  </div>
                  <span className="pointer-events-none absolute bottom-1 left-3.5 text-[10px] tabular-nums text-white/90">
                    {lc.duration.toFixed(1)}s
                  </span>
                  {selected && <TrimHandle side="start" onPointerDown={(e) => onMainTrim(e, lc, 'start')} />}
                  {selected && <TrimHandle side="end" onPointerDown={(e) => onMainTrim(e, lc, 'end')} />}
                </div>
              );
            })}
            {reorder && (() => {
              const others = layout.filter((l) => l.clip.id !== reorder.id);
              const x = reorder.target < others.length ? others[reorder.target].start : layout[layout.length - 1].end;
              return <div className="absolute inset-y-[-4px] z-30 w-1 rounded bg-cyan-400" style={{ left: PAD + x * pps - 2 }} />;
            })()}
            {/* Transition buttons between clips */}
            {layout.slice(1).map((lc) => {
              const active = lc.clip.transition.type !== 'none';
              const selected = selection?.kind === 'transition' && selection.id === lc.clip.id;
              return (
                <button
                  key={`tr-${lc.clip.id}`}
                  type="button"
                  title="انتقال"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelect({ kind: 'transition', id: lc.clip.id })}
                  className={cn(
                    'absolute top-1/2 z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border shadow-lg transition-colors',
                    selected
                      ? 'border-white bg-cyan-400 text-slate-950'
                      : active
                        ? 'border-cyan-300 bg-cyan-500 text-slate-950'
                        : 'border-white/30 bg-slate-900/90 text-white hover:bg-slate-700'
                  )}
                  style={{ left: PAD + lc.start * pps }}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </button>
              );
            })}
          </div>

          {/* Audio track */}
          <div className="relative" style={{ height: audioTrackH }} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); scrub(e); } }}>
            {project.audios.length === 0 && (
              <button
                type="button"
                onClick={onAddAudio}
                className="absolute top-1 flex h-[26px] items-center gap-1.5 rounded-md border border-dashed border-emerald-400/30 px-3 text-[11px] text-emerald-300/80 hover:bg-emerald-500/10"
                style={{ left: PAD }}
              >
                <Music className="h-3.5 w-3.5" /> إضافة موسيقى
              </button>
            )}
            {project.audios.map((a) => {
              const asset = assets.get(a.assetId);
              const lane = audioLanes.lanes.get(a.id) ?? 0;
              const selected = selection?.kind === 'audio' && selection.id === a.id;
              const width = Math.max(6, (a.outPoint - a.inPoint) * pps);
              return (
                <div
                  key={a.id}
                  onPointerDown={(e) => onAudioPointerDown(e, a, 'move')}
                  className={cn(
                    'absolute cursor-grab touch-none overflow-hidden rounded-md bg-emerald-700/80 text-emerald-200 active:cursor-grabbing',
                    selected ? 'ring-2 ring-white' : 'hover:bg-emerald-600/80'
                  )}
                  style={{ left: PAD + a.start * pps, width, top: 4 + lane * LANE_H, height: LANE_H - 4 }}
                >
                  <Waveform peaks={asset?.peaks} from={a.inPoint} to={a.outPoint} width={width} />
                  <span className="pointer-events-none absolute left-3.5 top-0.5 max-w-[80%] truncate text-[10px] font-semibold text-white" dir="auto">
                    {asset?.name ?? 'صوت'}
                  </span>
                  {selected && <TrimHandle side="start" onPointerDown={(e) => onAudioPointerDown(e, a, 'start')} />}
                  {selected && <TrimHandle side="end" onPointerDown={(e) => onAudioPointerDown(e, a, 'end')} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Playhead */}
        <div className="pointer-events-none absolute bottom-0 top-0 z-40" style={{ left: PAD + time * pps }}>
          <div className="absolute -left-[6px] top-0 h-3 w-3 rotate-45 rounded-sm bg-white" />
          <div className="absolute -left-px top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
        </div>
      </div>
    </div>
  );
}

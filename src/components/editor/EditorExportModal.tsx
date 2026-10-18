import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { ExportCancelled, ExportOptions, exportProject } from '../../editor/exporter';
import { MediaAsset, Project } from '../../editor/types';
import { Segmented } from './ui';

interface Props {
  project: Project;
  assets: Map<string, MediaAsset>;
  onClose: () => void;
}

type Phase =
  | { kind: 'setup' }
  | { kind: 'running'; progress: number; stage: string }
  | { kind: 'done'; url: string; fileName: string; size: number; seconds: number }
  | { kind: 'error'; message: string };

export function EditorExportModal({ project, assets, onClose }: Props) {
  const [options, setOptions] = useState<ExportOptions>({ resolution: 1080, fps: 30, quality: 'high' });
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const signal = useRef({ cancelled: false });

  useEffect(() => {
    const s = signal.current;
    return () => {
      s.cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (phase.kind === 'done') URL.revokeObjectURL(phase.url);
    };
  }, [phase]);

  const start = async () => {
    signal.current = { cancelled: false };
    const startedAt = performance.now();
    setPhase({ kind: 'running', progress: 0, stage: 'بدء التصدير...' });
    try {
      const { blob, extension } = await exportProject(
        project,
        assets,
        options,
        (progress, stage) => setPhase({ kind: 'running', progress, stage }),
        signal.current
      );
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      setPhase({
        kind: 'done',
        url: URL.createObjectURL(blob),
        fileName: `video-${stamp}.${extension}`,
        size: blob.size,
        seconds: (performance.now() - startedAt) / 1000,
      });
    } catch (err) {
      if (err instanceof ExportCancelled) setPhase({ kind: 'setup' });
      else setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const running = phase.kind === 'running';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" dir="rtl">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#141821] shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h3 className="text-base font-bold text-white">تصدير الفيديو</h3>
          <button
            type="button"
            onClick={() => {
              signal.current.cancelled = true;
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {(phase.kind === 'setup' || phase.kind === 'error') && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">الدقة</p>
                <Segmented
                  options={[
                    { id: 720, label: '720p' },
                    { id: 1080, label: '1080p (Full HD)' },
                  ]}
                  value={options.resolution}
                  onChange={(resolution) => setOptions((o) => ({ ...o, resolution }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">معدل الإطارات</p>
                <Segmented
                  options={[
                    { id: 24, label: '24 fps' },
                    { id: 30, label: '30 fps' },
                    { id: 60, label: '60 fps' },
                  ]}
                  value={options.fps}
                  onChange={(fps) => setOptions((o) => ({ ...o, fps }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">الجودة</p>
                <Segmented
                  options={[
                    { id: 'medium', label: 'متوسطة' },
                    { id: 'high', label: 'عالية' },
                    { id: 'very-high', label: 'عالية جداً' },
                  ]}
                  value={options.quality}
                  onChange={(quality) => setOptions((o) => ({ ...o, quality }))}
                />
              </div>
              {phase.kind === 'error' && (
                <div className="flex gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{phase.message}</span>
                </div>
              )}
              <button
                type="button"
                onClick={start}
                className="w-full rounded-xl bg-gradient-to-l from-cyan-400 to-sky-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110"
              >
                بدء التصدير
              </button>
              <p className="text-center text-[11px] text-slate-500">تتم المعالجة بالكامل داخل متصفحك، ولا يُرفع الفيديو إلى أي خادم.</p>
            </>
          )}

          {running && (
            <div className="space-y-4 py-4 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-300" />
              <div>
                <p className="text-3xl font-black tabular-nums text-white">{Math.round(phase.progress * 100)}%</p>
                <p className="mt-1 text-xs text-slate-400">{phase.stage}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10" dir="ltr">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-[width]" style={{ width: `${phase.progress * 100}%` }} />
              </div>
              <p className="text-[11px] text-slate-500">لا تغلق هذه الصفحة حتى ينتهي التصدير.</p>
              <button
                type="button"
                onClick={() => {
                  signal.current.cancelled = true;
                }}
                className="rounded-lg bg-white/5 px-4 py-2 text-xs text-slate-300 hover:bg-white/10"
              >
                إلغاء
              </button>
            </div>
          )}

          {phase.kind === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                تم التصدير بنجاح في {phase.seconds.toFixed(0)} ثانية ({(phase.size / 1024 / 1024).toFixed(1)} MB)
              </div>
              <video src={phase.url} controls playsInline className="max-h-[45vh] w-full rounded-xl bg-black" />
              <a
                href={phase.url}
                download={phase.fileName}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-400 to-sky-500 py-3 text-sm font-bold text-slate-950 hover:brightness-110"
              >
                <Download className="h-4 w-4" />
                تحميل الفيديو
              </a>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'setup' })}
                className="w-full rounded-xl bg-white/5 py-2.5 text-xs text-slate-300 hover:bg-white/10"
              >
                تصدير بإعدادات أخرى
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

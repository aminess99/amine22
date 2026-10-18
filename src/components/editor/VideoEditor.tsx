import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Copy,
  Download,
  Film,
  FilePlus2,
  LayoutTemplate,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ASPECT_SIZES, DEFAULT_TRANSITION_DURATION, FONTS, TEXT_PRESETS, presetAdjustments } from '../../editor/constants';
import { loadAsset } from '../../editor/media';
import { loadFonts } from '../../editor/renderer';
import {
  audioClipEnd,
  clamp,
  createAudioClip,
  createMainClip,
  createOverlayClip,
  formatTime,
  getMainFrameState,
  layoutMainTrack,
  projectDuration,
  splitAudioClip,
  splitMainClip,
  splitOverlayClip,
  splitTextClip,
  uid,
} from '../../editor/timeline';
import { AspectRatio, AudioClip, MainClip, MediaAsset, OverlayClip, Project, Selection, TextClip, TransitionType } from '../../editor/types';
import { generateCaptions } from '../../editor/autoCaptions';
import { clearAll, loadSaved, saveAsset, saveProject } from '../../editor/persistence';
import { clipsFromRanges, findSpeechRanges } from '../../editor/silence';
import { applyTemplate } from '../../editor/templates';
import { useHistory } from '../../editor/useHistory';
import { usePreviewEngine } from '../../editor/usePreviewEngine';
import { EditorExportModal } from './EditorExportModal';
import { AudioInspector, ClipInspector, OverlayInspector, ProjectInspector, TextInspector, TransitionInspector } from './EditorInspector';
import { FiltersPanel, MediaPanel, StickersPanel, TemplatesPanel, TextPanel, TransitionsPanel } from './EditorPanels';
import { EditorTimeline } from './EditorTimeline';
import { ToolButton } from './ui';

type PanelId = 'media' | 'audio' | 'text' | 'stickers' | 'filters' | 'transitions' | 'templates' | 'edit';

const PANELS: { id: PanelId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'media', label: 'الوسائط', icon: Film },
  { id: 'audio', label: 'الصوت', icon: Music },
  { id: 'text', label: 'نصوص', icon: Type },
  { id: 'stickers', label: 'ملصقات', icon: Smile },
  { id: 'filters', label: 'فلاتر', icon: Sparkles },
  { id: 'transitions', label: 'انتقالات', icon: ArrowLeftRight },
  { id: 'templates', label: 'قوالب', icon: LayoutTemplate },
  { id: 'edit', label: 'تعديل', icon: SlidersHorizontal },
];

const INITIAL_PROJECT: Project = { aspect: '9:16', background: '#000000', clips: [], texts: [], audios: [], overlays: [] };

const replaceById = <T extends { id: string }>(list: T[], id: string, fn: (item: T) => T) =>
  list.map((item) => (item.id === id ? fn(item) : item));

interface VideoEditorProps {
  onBack?: () => void;
}

export function VideoEditor({ onBack }: VideoEditorProps) {
  const { state: project, update, undo, redo, reset, canUndo, canRedo } = useHistory<Project>(INITIAL_PROJECT);
  const [assetList, setAssetList] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<PanelId>('media');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [exporting, setExporting] = useState(false);
  const [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [silence, setSilence] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [captionState, setCaptionState] = useState<{ busy: boolean; status: string | null }>({ busy: false, status: null });

  const assets = useMemo(() => new Map(assetList.map((a) => [a.id, a])), [assetList]);
  const layout = useMemo(() => layoutMainTrack(project.clips, assets), [project.clips, assets]);
  const duration = useMemo(() => projectDuration(project, layout), [project, layout]);

  // ---------- preview sizing ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 300, h: 300 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const base = ASPECT_SIZES[project.aspect];
  const fit = Math.min(stage.w / base.width, stage.h / base.height);
  const cssW = Math.max(1, Math.floor(base.width * fit));
  const cssH = Math.max(1, Math.floor(base.height * fit));
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const previewScale = clamp((cssW * dpr) / base.width, 0.1, 1);

  const selectedId = selection?.kind === 'text' || selection?.kind === 'overlay' ? selection.id : null;
  const engine = usePreviewEngine({ canvasRef, project, assets, layout, duration, selectedId, previewScale });
  const { time, playing, toggle, seek, pause } = engine;

  useEffect(() => {
    loadFonts(FONTS);
  }, []);

  // Free object URLs when leaving the editor.
  const assetsRef = useRef(assetList);
  assetsRef.current = assetList;
  useEffect(() => () => assetsRef.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

  // ---------- autosave ----------
  useEffect(() => {
    let alive = true;
    loadSaved()
      .then((saved) => {
        if (!alive || !saved) return;
        setAssetList(saved.assets);
        reset(saved.project);
        if (saved.project.clips.length || saved.project.texts.length || saved.project.audios.length) {
          setNotice('تم استرجاع مشروعك المحفوظ.');
        }
      })
      .catch(() => {})
      .finally(() => alive && setRestored(true));
    return () => {
      alive = false;
    };
  }, [reset]);

  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      saveProject(project).catch(() => setNotice('تعذر الحفظ التلقائي في هذا المتصفح.'));
    }, 600);
    return () => window.clearTimeout(id);
  }, [project, restored]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const startNewProject = async () => {
    if (!confirmNew) {
      setConfirmNew(true);
      window.setTimeout(() => setConfirmNew(false), 3000);
      return;
    }
    setConfirmNew(false);
    pause();
    seek(0);
    await clearAll().catch(() => {});
    assetList.forEach((a) => URL.revokeObjectURL(a.url));
    setAssetList([]);
    setSelection(null);
    reset(INITIAL_PROJECT);
  };

  // ---------- mutations ----------
  const updateClip = useCallback(
    (id: string, fn: (c: MainClip) => MainClip, key?: string) => update((p) => ({ ...p, clips: replaceById(p.clips, id, fn) }), key),
    [update]
  );
  const updateText = useCallback(
    (id: string, fn: (t: TextClip) => TextClip, key?: string) => update((p) => ({ ...p, texts: replaceById(p.texts, id, fn) }), key),
    [update]
  );
  const updateAudio = useCallback(
    (id: string, fn: (a: AudioClip) => AudioClip, key?: string) => update((p) => ({ ...p, audios: replaceById(p.audios, id, fn) }), key),
    [update]
  );
  const updateOverlay = useCallback(
    (id: string, fn: (o: OverlayClip) => OverlayClip, key?: string) =>
      update((p) => ({ ...p, overlays: replaceById(p.overlays, id, fn) }), key),
    [update]
  );

  const addOverlay = useCallback(
    (asset: MediaAsset) => {
      const clip = createOverlayClip(asset, engine.getTime());
      update((p) => ({ ...p, overlays: [...p.overlays, clip] }));
      setSelection({ kind: 'overlay', id: clip.id });
    },
    [update, engine]
  );

  const addSticker = useCallback(
    (emoji: string) => {
      const text: TextClip = {
        ...TEXT_PRESETS[0].style,
        id: uid(),
        text: emoji,
        start: engine.getTime(),
        duration: 3,
        fontSize: 180,
        shadow: false,
        x: 0.5,
        y: 0.35,
        animIn: 'pop',
        animOut: 'pop',
      };
      update((p) => ({ ...p, texts: [...p.texts, text] }));
      setSelection({ kind: 'text', id: text.id });
    },
    [update, engine]
  );

  const removeSilence = useCallback(
    async (clipId: string) => {
      const lc = layout.find((l) => l.clip.id === clipId);
      if (!lc) return;
      setSilence({ busy: true, message: 'جاري تحليل الصوت...' });
      try {
        const ranges = await findSpeechRanges(lc.asset, lc.clip.inPoint, lc.clip.outPoint);
        const kept = ranges.reduce((sum, [a, b]) => sum + (b - a), 0);
        const removed = lc.clip.outPoint - lc.clip.inPoint - kept;
        if (!ranges.length) {
          setSilence({ busy: false, message: 'لم يتم العثور على كلام في هذا المقطع.' });
          return;
        }
        if (removed < 0.3) {
          setSilence({ busy: false, message: 'لا توجد لحظات صمت طويلة لحذفها.' });
          return;
        }
        const parts = clipsFromRanges(lc.clip, ranges);
        update((p) => ({ ...p, clips: p.clips.flatMap((c) => (c.id === clipId ? parts : [c])) }));
        setSilence({
          busy: false,
          message: `تم حذف ${(removed / lc.clip.speed).toFixed(1)} ثانية من الصمت وتقسيم المقطع إلى ${parts.length} أجزاء.`,
        });
      } catch {
        setSilence({ busy: false, message: 'تعذر قراءة صوت هذا المقطع.' });
      }
    },
    [layout, update]
  );

  const runCaptions = useCallback(
    async (wordsPerCaption: number) => {
      setCaptionState({ busy: true, status: 'جاري رفع الصوت وتفريغه، قد يستغرق ذلك دقيقة...' });
      try {
        const captions = await generateCaptions(layout, wordsPerCaption, (done, total) =>
          setCaptionState({ busy: true, status: `جاري التفريغ (${Math.min(done + 1, total)} من ${total})...` })
        );
        if (!captions.length) {
          setCaptionState({ busy: false, status: 'لم يتم العثور على كلام في الفيديو.' });
          return;
        }
        update((p) => ({ ...p, texts: [...p.texts, ...captions] }));
        setCaptionState({ busy: false, status: `تمت إضافة ${captions.length} سطر كابشن. حدد أي سطر لتعديل نصه أو شكله.` });
      } catch (err) {
        setCaptionState({ busy: false, status: err instanceof Error ? err.message : 'فشل التفريغ.' });
      }
    },
    [layout, update]
  );

  const addVisual = useCallback(
    (asset: MediaAsset, at?: number) => {
      const clip = createMainClip(asset);
      const t = at ?? engine.getTime();
      update((p) => {
        // Insert after the clip under the given time, or append.
        const lay = layoutMainTrack(p.clips, assets.has(asset.id) ? assets : new Map([...assets, [asset.id, asset]]));
        const hit = lay.find((l) => t >= l.start && t < l.end);
        const index = hit ? (t - hit.start < hit.duration / 2 && at !== undefined ? hit.index : hit.index + 1) : p.clips.length;
        const clips = [...p.clips];
        clips.splice(index, 0, clip);
        return { ...p, clips };
      });
      setSelection({ kind: 'clip', id: clip.id });
    },
    [update, assets, engine]
  );

  const addAudio = useCallback(
    (asset: MediaAsset, at?: number) => {
      const clip = createAudioClip(asset, at ?? engine.getTime());
      update((p) => ({ ...p, audios: [...p.audios, clip] }));
      setSelection({ kind: 'audio', id: clip.id });
    },
    [update, engine]
  );

  const addFiles = useCallback(
    async (files: File[], addToTimeline: boolean) => {
      if (!files.length) return;
      setLoading((n) => n + files.length);
      const loaded: MediaAsset[] = [];
      for (const file of files) {
        try {
          const asset = await loadAsset(file);
          loaded.push(asset);
          setAssetList((list) => [...list, asset]);
          saveAsset(asset).catch(() => setNotice('الملف كبير على مساحة الحفظ في المتصفح، ولن يُستعاد بعد إغلاق الصفحة.'));
        } catch (err) {
          setErrors((e) => [...e, `${file.name}: ${err instanceof Error ? err.message : 'فشل التحميل'}`]);
        } finally {
          setLoading((n) => n - 1);
        }
      }
      if (!addToTimeline || !loaded.length) return;
      const visuals = loaded.filter((a) => a.kind !== 'audio');
      const sounds = loaded.filter((a) => a.kind === 'audio');
      update((p) => ({
        ...p,
        clips: [...p.clips, ...visuals.map(createMainClip)],
        audios: [...p.audios, ...sounds.map((a) => createAudioClip(a, 0))],
      }));
      // Match the canvas to the first video's orientation when starting fresh.
      const first = visuals[0];
      if (first && project.clips.length === 0 && first.width && first.height) {
        const r = first.width / first.height;
        const aspect: AspectRatio = r > 1.2 ? '16:9' : r < 0.85 ? '9:16' : '1:1';
        update((p) => ({ ...p, aspect }), 'auto-aspect');
      }
    },
    [update, project.clips.length]
  );

  const addText = useCallback(
    (presetId: string) => {
      const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? TEXT_PRESETS[0];
      const start = engine.getTime();
      const text: TextClip = { ...preset.style, id: uid(), start, duration: 3, x: 0.5 };
      update((p) => ({ ...p, texts: [...p.texts, text] }));
      setSelection({ kind: 'text', id: text.id });
      setPanel('edit');
      loadFonts([text.font]);
    },
    [update, engine]
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'clip') update((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'text') update((p) => ({ ...p, texts: p.texts.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'audio') update((p) => ({ ...p, audios: p.audios.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'overlay') update((p) => ({ ...p, overlays: p.overlays.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'transition') updateClip(selection.id, (c) => ({ ...c, transition: { ...c.transition, type: 'none' } }));
    setSelection(null);
  }, [selection, update, updateClip]);

  const splitAtPlayhead = useCallback(() => {
    const t = engine.getTime();
    if (selection?.kind === 'text') {
      const text = project.texts.find((x) => x.id === selection.id);
      const parts = text && splitTextClip(text, t);
      if (parts) update((p) => ({ ...p, texts: p.texts.flatMap((x) => (x.id === text!.id ? parts : [x])) }));
      return;
    }
    if (selection?.kind === 'overlay') {
      const o = project.overlays.find((x) => x.id === selection.id);
      const parts = o && splitOverlayClip(o, t);
      if (parts) update((p) => ({ ...p, overlays: p.overlays.flatMap((x) => (x.id === o!.id ? parts : [x])) }));
      return;
    }
    if (selection?.kind === 'audio') {
      const a = project.audios.find((x) => x.id === selection.id);
      const parts = a && splitAudioClip(a, t);
      if (parts) update((p) => ({ ...p, audios: p.audios.flatMap((x) => (x.id === a!.id ? parts : [x])) }));
      return;
    }
    const lc =
      (selection?.kind === 'clip' && layout.find((l) => l.clip.id === selection.id && t > l.start && t < l.end)) ||
      layout.find((l) => t >= l.start && t < l.end);
    const parts = lc && splitMainClip(lc, t);
    if (!lc || !parts) return;
    update((p) => ({ ...p, clips: p.clips.flatMap((c) => (c.id === lc.clip.id ? parts : [c])) }));
    setSelection({ kind: 'clip', id: parts[1].id });
  }, [engine, selection, project.texts, project.audios, project.overlays, layout, update]);

  const duplicateSelection = useCallback(() => {
    if (selection?.kind === 'clip') {
      const copy = { ...project.clips.find((c) => c.id === selection.id)!, id: uid() };
      update((p) => {
        const i = p.clips.findIndex((c) => c.id === selection.id);
        const clips = [...p.clips];
        clips.splice(i + 1, 0, copy);
        return { ...p, clips };
      });
      setSelection({ kind: 'clip', id: copy.id });
    } else if (selection?.kind === 'text') {
      const src = project.texts.find((x) => x.id === selection.id);
      if (!src) return;
      const copy = { ...src, id: uid(), start: src.start + src.duration };
      update((p) => ({ ...p, texts: [...p.texts, copy] }));
      setSelection({ kind: 'text', id: copy.id });
    } else if (selection?.kind === 'audio') {
      const src = project.audios.find((x) => x.id === selection.id);
      if (!src) return;
      const copy = { ...src, id: uid(), start: audioClipEnd(src) };
      update((p) => ({ ...p, audios: [...p.audios, copy] }));
      setSelection({ kind: 'audio', id: copy.id });
    } else if (selection?.kind === 'overlay') {
      const src = project.overlays.find((x) => x.id === selection.id);
      if (!src) return;
      const copy = { ...src, id: uid(), x: Math.min(0.9, src.x + 0.05), y: Math.min(0.9, src.y + 0.05) };
      update((p) => ({ ...p, overlays: [...p.overlays, copy] }));
      setSelection({ kind: 'overlay', id: copy.id });
    }
  }, [selection, project, update]);

  const reorderClip = useCallback(
    (from: number, to: number) =>
      update((p) => {
        const clips = [...p.clips];
        const [moved] = clips.splice(from, 1);
        clips.splice(to, 0, moved);
        return { ...p, clips };
      }),
    [update]
  );

  const onDropAsset = useCallback(
    (assetId: string, at: number) => {
      const asset = assets.get(assetId);
      if (!asset) return;
      if (asset.kind === 'audio') addAudio(asset, at);
      else addVisual(asset, at);
    },
    [assets, addAudio, addVisual]
  );

  // The clip that panels (filters) act on: the selection, else the clip under the playhead.
  const targetClip = useMemo(() => {
    if (selection?.kind === 'clip') return layout.find((l) => l.clip.id === selection.id) ?? null;
    return getMainFrameState(layout, time).primary?.lc ?? null;
  }, [selection, layout, time]);

  // The cut that the transitions panel acts on.
  const targetCut = useMemo(() => {
    if (layout.length < 2) return null;
    if (selection?.kind === 'transition') return layout.find((l) => l.clip.id === selection.id) ?? null;
    if (selection?.kind === 'clip') {
      const lc = layout.find((l) => l.clip.id === selection.id);
      if (lc && lc.index > 0) return lc;
    }
    let best = layout[1];
    for (const lc of layout.slice(1)) if (Math.abs(lc.start - time) < Math.abs(best.start - time)) best = lc;
    return best;
  }, [selection, layout, time]);

  const applyTransition = (type: TransitionType) => {
    if (!targetCut) return;
    updateClip(targetCut.clip.id, (c) => ({ ...c, transition: { type, duration: c.transition.duration || DEFAULT_TRANSITION_DURATION } }));
    setSelection({ kind: 'transition', id: targetCut.clip.id });
    pause();
    seek(Math.max(0, targetCut.start - 0.8));
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (exporting) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (!mod && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'b' || e.key === 'س')) {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        seek(engine.getTime() + dir * (e.shiftKey ? 1 : 1 / 30));
      } else if (e.key === 'Home') {
        seek(0);
      } else if (e.key === 'End') {
        seek(duration);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, undo, redo, duplicateSelection, splitAtPlayhead, deleteSelection, seek, engine, duration, exporting]);

  // ---------- canvas interaction (drag texts / clips directly on the preview) ----------
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const toBase = (cx: number, cy: number) => ({
      x: ((cx - rect.left) / rect.width) * base.width,
      y: ((cy - rect.top) / rect.height) * base.height,
    });
    const p0 = toBase(e.clientX, e.clientY);
    const hit = [...engine.textBoundsRef.current].reverse().find((b) => p0.x >= b.x && p0.x <= b.x + b.w && p0.y >= b.y && p0.y <= b.y + b.h);
    const key = `canvas-${performance.now()}`;
    let onMove: ((dx: number, dy: number) => void) | null = null;

    if (hit?.kind === 'overlay') {
      const ov = project.overlays.find((o) => o.id === hit.id);
      if (!ov) return;
      setSelection({ kind: 'overlay', id: ov.id });
      onMove = (dx, dy) =>
        updateOverlay(ov.id, (o) => ({ ...o, x: clamp(ov.x + dx / base.width, 0, 1), y: clamp(ov.y + dy / base.height, 0, 1) }), key);
    } else if (hit) {
      const text = project.texts.find((t) => t.id === hit.id);
      if (!text) return;
      setSelection({ kind: 'text', id: text.id });
      onMove = (dx, dy) =>
        updateText(text.id, (t) => ({ ...t, x: clamp(text.x + dx / base.width, 0, 1), y: clamp(text.y + dy / base.height, 0, 1) }), key);
    } else {
      const lc = getMainFrameState(layout, engine.getTime()).primary?.lc;
      if (!lc) {
        setSelection(null);
        return;
      }
      setSelection({ kind: 'clip', id: lc.clip.id });
      const { offsetX, offsetY } = lc.clip;
      onMove = (dx, dy) =>
        updateClip(lc.clip.id, (c) => ({ ...c, offsetX: clamp(offsetX + dx / base.width, -1, 1), offsetY: clamp(offsetY + dy / base.height, -1, 1) }), key);
    }

    canvas.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY);
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) < 12) return;
      moved = true;
      onMove?.(dx, dy);
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  };

  // ---------- panels ----------
  const selectedClip = selection?.kind === 'clip' ? layout.find((l) => l.clip.id === selection.id) : undefined;
  const selectedText = selection?.kind === 'text' ? project.texts.find((t) => t.id === selection.id) : undefined;
  const selectedAudio = selection?.kind === 'audio' ? project.audios.find((a) => a.id === selection.id) : undefined;
  const selectedCut = selection?.kind === 'transition' ? layout.find((l) => l.clip.id === selection.id) : undefined;
  const selectedOverlay = selection?.kind === 'overlay' ? project.overlays.find((o) => o.id === selection.id) : undefined;

  const actions = { onSplit: splitAtPlayhead, onDuplicate: duplicateSelection, onDelete: deleteSelection };

  const inspector = selectedClip ? (
    <ClipInspector
      clip={selectedClip.clip}
      asset={selectedClip.asset}
      patch={(fn, key) => updateClip(selectedClip.clip.id, fn, key)}
      actions={actions}
      silence={{ ...silence, run: () => removeSilence(selectedClip.clip.id) }}
    />
  ) : selectedOverlay ? (
    <OverlayInspector
      overlay={selectedOverlay}
      asset={assets.get(selectedOverlay.assetId)}
      patch={(fn, key) => updateOverlay(selectedOverlay.id, fn, key)}
      actions={actions}
    />
  ) : selectedText ? (
    <TextInspector text={selectedText} patch={(fn, key) => updateText(selectedText.id, fn, key)} actions={actions} />
  ) : selectedAudio ? (
    <AudioInspector
      audio={selectedAudio}
      asset={assets.get(selectedAudio.assetId)}
      patch={(fn, key) => updateAudio(selectedAudio.id, fn, key)}
      actions={actions}
    />
  ) : selectedCut ? (
    <TransitionInspector clip={selectedCut.clip} onChange={(fn, key) => updateClip(selectedCut.clip.id, fn, key)} />
  ) : (
    <ProjectInspector project={project} onChange={update} />
  );

  const panelContent = (id: PanelId) => {
    switch (id) {
      case 'media':
        return (
          <MediaPanel
            assets={assetList}
            kinds={['video', 'image']}
            loading={loading}
            onFiles={(f) => addFiles(f, false)}
            onAdd={(a) => {
              addVisual(a);
              setSheetOpen(false);
            }}
            onOverlay={(a) => {
              addOverlay(a);
              setSheetOpen(false);
            }}
          />
        );
      case 'audio':
        return (
          <MediaPanel
            assets={assetList}
            kinds={['audio']}
            loading={loading}
            onFiles={(f) => addFiles(f, false)}
            onAdd={(a) => {
              addAudio(a);
              setSheetOpen(false);
            }}
          />
        );
      case 'text':
        return (
          <TextPanel
            onAdd={(id) => {
              addText(id);
              setSheetOpen(false);
            }}
            captions={{ ...captionState, run: runCaptions }}
          />
        );
      case 'stickers':
        return (
          <StickersPanel
            onAdd={(e) => {
              addSticker(e);
              setSheetOpen(false);
            }}
          />
        );
      case 'templates':
        return (
          <TemplatesPanel
            disabled={!project.clips.length}
            onApply={(id) => {
              update((p) => applyTemplate(p, assets, id));
              setNotice('تم تطبيق القالب. اضغط تشغيل للمشاهدة، أو تراجع بـ Ctrl+Z.');
              pause();
              seek(0);
              setSheetOpen(false);
            }}
          />
        );
      case 'filters':
        return (
          <FiltersPanel
            thumbnail={targetClip?.asset.thumbnail}
            currentId={targetClip?.clip.filterId ?? null}
            disabled={!targetClip}
            onApply={(fid) => targetClip && updateClip(targetClip.clip.id, (c) => ({ ...c, filterId: fid, adjust: presetAdjustments(fid) }))}
            onApplyAll={(fid) =>
              update((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, filterId: fid, adjust: presetAdjustments(fid) })) }))
            }
          />
        );
      case 'transitions':
        return (
          <TransitionsPanel
            currentType={targetCut?.clip.transition.type ?? null}
            disabled={!targetCut}
            onApply={applyTransition}
            onApplyAll={(type) =>
              update((p) => ({
                ...p,
                clips: p.clips.map((c, i) => (i === 0 ? c : { ...c, transition: { type, duration: c.transition.duration || DEFAULT_TRANSITION_DURATION } })),
              }))
            }
          />
        );
      case 'edit':
        return inspector;
    }
  };

  const openPanel = (id: PanelId) => {
    if (sheetOpen && panel === id) setSheetOpen(false);
    else {
      setPanel(id);
      setSheetOpen(true);
    }
  };

  const isEmpty = project.clips.length === 0 && project.texts.length === 0 && project.audios.length === 0 && project.overlays.length === 0;
  const desktopPanel: PanelId = panel === 'edit' ? 'media' : panel;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d12] text-slate-100" dir="rtl">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-[#10131a] px-2 sm:h-14 sm:px-4">
        {onBack && (
          <button
            type="button"
            onClick={() => {
              if (!isEmpty && !window.confirm('سيتم فقدان المشروع الحالي. هل تريد الخروج؟')) return;
              onBack();
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            <ArrowRight className="h-4 w-4" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-400 to-sky-600 text-slate-950">
            <Scissors className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-bold sm:inline">محرر الفيديو</span>
        </div>
        <div className="mx-auto flex items-center gap-1">
          <button
            type="button"
            onClick={startNewProject}
            title="مشروع جديد"
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors',
              confirmNew ? 'bg-red-500/20 text-red-200' : 'text-slate-300 hover:bg-white/10'
            )}
          >
            <FilePlus2 className="h-4 w-4" />
            {confirmNew ? <span>اضغط مجدداً للتأكيد</span> : <span className="hidden sm:inline">جديد</span>}
          </button>
          <ToolButton icon={Undo2} label="تراجع" compact onClick={undo} disabled={!canUndo} />
          <ToolButton icon={Redo2} label="إعادة" compact onClick={redo} disabled={!canRedo} />
          <select
            value={project.aspect}
            onChange={(e) => update((p) => ({ ...p, aspect: e.target.value as AspectRatio }))}
            className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs"
            dir="ltr"
            title="مقاس الفيديو"
          >
            {(Object.keys(ASPECT_SIZES) as AspectRatio[]).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={duration <= 0}
          onClick={() => {
            pause();
            setExporting(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-l from-cyan-400 to-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 enabled:hover:brightness-110 disabled:opacity-40 sm:px-4 sm:py-2"
        >
          <Download className="h-4 w-4" />
          تصدير
        </button>
      </header>

      {notice && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full bg-slate-800/95 px-4 py-2 text-xs text-white shadow-xl ring-1 ring-white/10">
          {notice}
        </div>
      )}

      {errors.length > 0 && (
        <div className="flex items-start gap-2 bg-red-500/15 px-4 py-2 text-xs text-red-200">
          <div className="flex-1 space-y-0.5">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>
          <button type="button" onClick={() => setErrors([])}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Left (start) panel – desktop */}
        <aside className="hidden w-[340px] shrink-0 border-l border-white/5 bg-[#10131a] lg:flex">
          <nav className="flex w-16 shrink-0 flex-col gap-1 border-l border-white/5 py-2">
            {PANELS.filter((p) => p.id !== 'edit').map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPanel(p.id)}
                  className={cn(
                    'mx-1.5 flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors',
                    desktopPanel === p.id ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {p.label}
                </button>
              );
            })}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto">{panelContent(desktopPanel)}</div>
        </aside>

        {/* Preview */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
            <div ref={stageRef} className="pointer-events-none absolute inset-3 sm:inset-6" />
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              className="relative touch-none rounded-sm shadow-2xl shadow-black/60 ring-1 ring-white/10"
              style={{ width: cssW, height: cssH }}
            />
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-400 to-sky-600 text-slate-950 shadow-xl shadow-cyan-500/20">
                    <Upload className="h-8 w-8" />
                  </div>
                  <h2 className="mb-2 text-lg font-bold text-white">ابدأ مشروعك الجديد</h2>
                  <p className="mb-5 text-xs leading-relaxed text-slate-400">
                    استورد مقاطع الفيديو والصور والموسيقى، ثم قصّها ورتبها وأضف النصوص والفلاتر والانتقالات وصدّر الفيديو بجودة عالية.
                  </p>
                  <label className="relative inline-block cursor-pointer rounded-xl bg-gradient-to-l from-cyan-400 to-sky-500 px-6 py-3 text-sm font-bold text-slate-950 hover:brightness-110">
                    {loading > 0 ? 'جاري التحميل...' : 'استيراد ملفات'}
                    <input
                      type="file"
                      accept="video/*,image/*,audio/*"
                      multiple
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={(e) => {
                        addFiles(Array.from(e.target.files ?? []), true);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Transport + tools */}
          <div className="flex shrink-0 items-center gap-1 border-y border-white/5 bg-[#10131a] px-2 py-1.5" dir="ltr">
            <div className="flex items-center gap-0.5" dir="rtl">
              <ToolButton icon={Scissors} label="تقسيم" onClick={splitAtPlayhead} disabled={!layout.length && !project.texts.length} />
              <ToolButton icon={Copy} label="تكرار" onClick={duplicateSelection} disabled={!selection || selection.kind === 'transition'} />
              <ToolButton icon={Trash2} label="حذف" danger onClick={deleteSelection} disabled={!selection} />
            </div>
            <div className="mx-auto flex items-center gap-1">
              <button type="button" onClick={() => seek(0)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="البداية">
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggle}
                disabled={duration <= 0}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-950 hover:scale-105 disabled:opacity-40"
                title="تشغيل / إيقاف (مسافة)"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
              </button>
              <button type="button" onClick={() => seek(duration)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="النهاية">
                <SkipForward className="h-4 w-4" />
              </button>
              <span className="ml-1 text-[11px] tabular-nums text-slate-400">
                <span className="text-white">{formatTime(time, true)}</span> / {formatTime(duration, true)}
              </span>
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <button type="button" onClick={() => setPxPerSec((p) => clamp(p / 1.4, 8, 400))} className="rounded p-1 text-slate-400 hover:bg-white/10" title="تصغير">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                min={Math.log(8)}
                max={Math.log(400)}
                step={0.01}
                value={Math.log(pxPerSec)}
                onChange={(e) => setPxPerSec(Math.exp(Number(e.target.value)))}
                className="w-24 accent-cyan-400"
              />
              <button type="button" onClick={() => setPxPerSec((p) => clamp(p * 1.4, 8, 400))} className="rounded p-1 text-slate-400 hover:bg-white/10" title="تكبير">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="h-[190px] shrink-0 sm:h-[230px]">
            <EditorTimeline
              project={project}
              layout={layout}
              assets={assets}
              duration={duration}
              time={time}
              playing={playing}
              pxPerSec={pxPerSec}
              onZoom={setPxPerSec}
              selection={selection}
              onSelect={(s) => {
                setSelection(s);
                if (s && window.innerWidth < 1024) {
                  setPanel('edit');
                }
              }}
              onSeek={(t) => {
                if (playing) pause();
                seek(t);
              }}
              onUpdateClip={updateClip}
              onUpdateText={updateText}
              onUpdateAudio={updateAudio}
              onUpdateOverlay={updateOverlay}
              onReorder={reorderClip}
              onDropAsset={onDropAsset}
              onAddText={() => addText('basic')}
              onAddAudio={() => openPanel('audio')}
            />
          </div>

          {/* Mobile bottom bar */}
          <nav className="flex shrink-0 overflow-x-auto border-t border-white/5 bg-[#10131a] pb-[env(safe-area-inset-bottom)] lg:hidden">
            {PANELS.map((p) => {
              const Icon = p.icon;
              const active = sheetOpen && panel === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPanel(p.id)}
                  className={cn('flex min-w-[52px] flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', active ? 'text-cyan-300' : 'text-slate-400')}
                >
                  <Icon className="h-5 w-5" />
                  {p.label}
                </button>
              );
            })}
          </nav>
        </main>

        {/* Inspector – desktop */}
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-r border-white/5 bg-[#10131a] lg:block">
          <div className="sticky top-0 z-10 border-b border-white/5 bg-[#10131a] px-4 py-3 text-xs font-bold text-slate-200">
            {selectedClip ? 'خصائص المقطع' : selectedOverlay ? 'خصائص الطبقة' : selectedText ? 'خصائص النص' : selectedAudio ? 'خصائص الصوت' : selectedCut ? 'الانتقال' : 'إعدادات المشروع'}
          </div>
          {inspector}
        </aside>
      </div>

      {/* Mobile sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end lg:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#141821] pb-[env(safe-area-inset-bottom)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-[#141821] px-4 py-3">
              <span className="text-sm font-bold">{PANELS.find((p) => p.id === panel)?.label}</span>
              <button type="button" onClick={() => setSheetOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            {panelContent(panel)}
          </div>
        </div>
      )}

      {exporting && <EditorExportModal project={project} assets={assets} onClose={() => setExporting(false)} />}
    </div>
  );
}

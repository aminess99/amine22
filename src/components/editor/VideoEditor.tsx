import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Clapperboard,
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
  StepBack,
  StepForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ASPECT_SIZES, CAPTION_STYLES, captionStyleFields, DEFAULT_TRANSITION_DURATION, TEXT_PRESETS, presetAdjustments } from '../../editor/constants';
import { computePeaks, extractVideoFrames, loadAsset } from '../../editor/media';
import { VOICE_EFFECTS, VoiceEffect, applyVoiceEffect, decodeFile, detectBeats, encodeWav } from '../../editor/audioTools';
import { reverseVideo } from '../../editor/reverse';
import { ensureFonts } from '../../editor/fonts';
import { templateTexts, TextTemplate } from '../../editor/textTemplates';
import {
  audioClipEnd,
  clamp,
  clipProgress,
  createAudioClip,
  createMainClip,
  createOverlayClip,
  formatTime,
  getMainFrameState,
  layoutMainTrack,
  projectDuration,
  retimeWords,
  setKeyframe,
  splitAudioClip,
  splitMainClip,
  splitOverlayClip,
  splitTextClip,
  uid,
  insertFreeze,
  beatCuts,
  retimeToCuts,
  setTextKeyframe,
  followCaptions,
  sourceTimeFor,
  textProgress,
  textTransformAt,
} from '../../editor/timeline';
import { AspectRatio, AudioClip, EffectItem, MainClip, MediaAsset, OverlayClip, Project, Selection, TextClip, TransitionType, VideoAnalysis } from '../../editor/types';
import { emojiFor, generateCaptions } from '../../editor/autoCaptions';
import { clearAll, loadSaved, saveAsset, saveProject } from '../../editor/persistence';
import { audioFromRanges, clipsFromRanges, findSpeechRanges } from '../../editor/silence';
import { applyTemplate } from '../../editor/templates';
import { useHistory } from '../../editor/useHistory';
import { commandContext, describeAction, executeActions, requestCommand } from '../../editor/commands';
import { synthesizeSpeech } from '../../editor/tts';
import { autoSfxTimes, sfxFile } from '../../editor/sfx';
import { fxDef, newFxLayer } from '../../editor/proFx';
import { BatchStatus, MAX_ANALYSIS_SECONDS, analyzeMany, batchFraction } from '../../editor/analysis';
import { MAX_AUTO_FOOTAGE, buildFromPlan, requestPlan, reviewEdit } from '../../editor/autoEdit';
import { transcribeAsset } from '../../editor/autoCaptions';
import { AutoEditBrief, AutoEditPlan } from '../../editor/autoEditSpec';
import { AutoEditModal, AutoEditReport, AutoEditStage } from './AutoEditModal';
import { videoFps } from '../../editor/refine';
import { EditAction } from '../../editor/commandSpec';
import {
  GestureDelta,
  applyClipGesture,
  applyOverlayGesture,
  applyTextGesture,
  gestureLabel,
  resetClipTransform,
} from '../../editor/gestures';
import { usePreviewEngine } from '../../editor/usePreviewEngine';
import { CommandPanel, CommandState } from './CommandPanel';
import { SfxPanel } from './SfxPanel';
import { EffectInspector, EffectsPanel } from './FxPanel';
import { AiPanel, AiPanelState, AiShort } from './AiPanel';
import { EditorExportModal } from './EditorExportModal';
import { AudioInspector, ClipInspector, OverlayInspector, ProjectInspector, TextInspector, TransitionInspector } from './EditorInspector';
import { CaptionManager, FiltersPanel, MediaPanel, StickersPanel, TemplatesPanel, TextPanel, TextToSpeech, TransitionsPanel, VoiceRecorder } from './EditorPanels';
import { EditorTimeline } from './EditorTimeline';
import { ToolButton } from './ui';
import { frameAt } from './previews';

type PanelId = 'media' | 'ai' | 'effects' | 'audio' | 'text' | 'stickers' | 'filters' | 'transitions' | 'templates' | 'edit';

const PANELS: { id: PanelId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'media', label: 'الوسائط', icon: Film },
  { id: 'ai', label: 'أوامر', icon: Wand2 },
  { id: 'audio', label: 'الصوت', icon: Music },
  { id: 'text', label: 'نصوص', icon: Type },
  { id: 'stickers', label: 'ملصقات', icon: Smile },
  { id: 'filters', label: 'فلاتر', icon: Sparkles },
  { id: 'transitions', label: 'انتقالات', icon: ArrowLeftRight },
  { id: 'effects', label: 'تأثيرات', icon: Zap },
  { id: 'templates', label: 'قوالب', icon: LayoutTemplate },
  { id: 'edit', label: 'تعديل', icon: SlidersHorizontal },
];

const INITIAL_PROJECT: Project = { aspect: '9:16', background: '#000000', clips: [], texts: [], audios: [], overlays: [] };

const replaceById = <T extends { id: string }>(list: T[], id: string, fn: (item: T) => T) =>
  list.map((item) => (item.id === id ? fn(item) : item));

interface VideoEditorProps {
  onBack?: () => void;
  /** Files picked on the home page, added to the timeline once the saved project loads. */
  initialFiles?: File[];
  /** Open the auto edit with the initial files instead of putting them on the timeline. */
  autoEdit?: boolean;
}

export function VideoEditor({ onBack, initialFiles, autoEdit }: VideoEditorProps) {
  const { state: project, update: rawUpdate, undo, redo, reset, canUndo, canRedo } = useHistory<Project>(INITIAL_PROJECT);
  // Every edit goes through here: when clips change, auto captions follow their speech.
  const assetsForCaptions = useRef<Map<string, MediaAsset>>(new Map());
  const update = useCallback(
    (fn: (p: Project) => Project, key?: string) => rawUpdate((p) => followCaptions(p, fn(p), assetsForCaptions.current), key),
    [rawUpdate]
  );
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
  const [captionState, setCaptionState] = useState<{ busy: boolean; status: string | null; progress: number | null }>({ busy: false, status: null, progress: null });

  const assets = useMemo(() => new Map<string, MediaAsset>(assetList.map((a) => [a.id, a])), [assetList]);
  assetsForCaptions.current = assets;
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
  // Phones report a pixel ratio of 3; past 2 the preview just costs more to draw each frame.
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const PREVIEW_MAX_SIDE = 1280;
  const previewScale = clamp(Math.min((cssW * dpr) / base.width, PREVIEW_MAX_SIDE / Math.max(base.width, base.height)), 0.1, 1);

  const selectedId = selection?.kind === 'text' || selection?.kind === 'overlay' ? selection.id : null;
  const engine = usePreviewEngine({ canvasRef, project, assets, layout, duration, selectedId, previewScale });
  const { time, playing, toggle, seek, pause, play, previewRange, captureFrame, subscribeFrame } = engine;

  // The time readout follows playback frame by frame without re-rendering the editor.
  // Frame rates of the videos on the main track, for frame stepping.
  const [fpsMap, setFpsMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    for (const lc of layout) {
      const a = lc.asset;
      if (a.kind !== 'video' || fpsMap.has(a.id)) continue;
      videoFps(a).then((f) => setFpsMap((m) => (m.has(a.id) ? m : new Map(m).set(a.id, f))));
    }
  }, [layout, fpsMap]);
  /** The clip on screen at t and the source frame it shows. */
  const frameUnder = (t: number) => {
    const lc = layout.find((l) => t >= l.start && t < l.end) ?? layout[layout.length - 1];
    const fps = lc && fpsMap.get(lc.asset.id);
    if (!lc || !fps) return null;
    const src = sourceTimeFor(lc, Math.min(t, lc.end - 1e-4));
    return { lc, fps, index: Math.floor(src * fps + 1e-6) };
  };
  /** Moves the playhead exactly one frame of the clip under it. */
  const stepFrameRef = useRef<(dir: 1 | -1) => void>(() => {});
  const stepFrame = (dir: 1 | -1) => {
    pause();
    const t = engine.getTime();
    const f = frameUnder(t);
    if (!f || f.lc.clip.freeze || f.lc.clip.speedCurve) {
      seek(clamp(t + dir / ((f?.fps ?? 30) * (f?.lc.clip.speed ?? 1)), 0, duration));
      return;
    }
    const { lc, fps, index } = f;
    // Aim a hair inside the target frame so rounding never lands on its neighbour.
    const src = (index + dir) / fps + 0.25 / fps;
    seek(clamp(lc.start + (src - lc.clip.inPoint) / lc.clip.speed, 0, duration));
  };
  stepFrameRef.current = stepFrame;

  const clockRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!playing) return;
    return subscribeFrame((t) => {
      if (clockRef.current) clockRef.current.textContent = formatTime(t, true);
    });
  }, [playing, subscribeFrame]);

  // Load the fonts the project's texts use (Google Fonts, on demand).
  const fontKey = [...new Set(project.texts.map((t) => t.font))].sort().join('|');
  useEffect(() => {
    if (fontKey) ensureFonts(fontKey.split('|'));
  }, [fontKey]);

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

  // Older saves (or a failed first attempt) may lack the timeline filmstrip; rebuild it in the background.
  useEffect(() => {
    if (!restored) return;
    const missing = assetList.filter((a) => a.kind === 'video' && !a.frames?.length);
    if (!missing.length) return;
    let alive = true;
    (async () => {
      for (const asset of missing) {
        const strip = await extractVideoFrames(asset.file, asset.duration).catch(() => null);
        if (!alive || !strip) continue;
        const updated = { ...asset, ...strip };
        setAssetList((list) => list.map((a) => (a.id === asset.id ? updated : a)));
        saveAsset(updated).catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
    // Only on restore: newly imported assets already carry their filmstrip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

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
  const updateEffect = useCallback(
    (id: string, fn: (e: EffectItem) => EffectItem, key?: string) => update((p) => ({ ...p, effects: replaceById(p.effects ?? [], id, fn) }), key),
    [update]
  );
  const addEffect = useCallback(
    (type: string) => {
      const start = engine.getTime();
      const item: EffectItem = { ...newFxLayer(type), id: uid(), start, duration: Math.max(1, Math.min(3, duration - start || 3)) };
      update((p) => ({ ...p, effects: [...(p.effects ?? []), item] }));
      setSelection({ kind: 'effect', id: item.id });
      setPanel('edit');
      previewRange(start, start + Math.min(3, item.duration));
    },
    [update, engine, duration, previewRange]
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
        rotation: 0,
        animIn: 'pop',
        animOut: 'pop',
      };
      update((p) => ({ ...p, texts: [...p.texts, text] }));
      setSelection({ kind: 'text', id: text.id });
      previewRange(text.start, text.start + 1);
    },
    [update, engine, previewRange]
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

  // ---------- clip tools: freeze frame, reverse, detach audio ----------
  const [clipTool, setClipTool] = useState<{ busy: string | null; message: string | null }>({ busy: null, message: null });

  const registerAsset = useCallback(async (file: File) => {
    const asset = await loadAsset(file);
    setAssetList((list) => [...list, asset]);
    saveAsset(asset).catch(() => {});
    return asset;
  }, []);

  const freezeFrame = useCallback(
    (clipId: string) => {
      const lc = layout.find((l) => l.clip.id === clipId);
      if (!lc) return;
      const t = clamp(engine.getTime(), lc.start, lc.end);
      const { clips, still } = insertFreeze(project.clips, lc, t);
      update((p) => ({ ...p, clips }));
      setSelection({ kind: 'clip', id: still.id });
      setClipTool({ busy: null, message: 'تمت إضافة إطار مجمّد لمدة ثانيتين، ويمكنك تغيير مدته من الأسفل.' });
    },
    [layout, engine, update, project.clips]
  );

  const reverseClip = useCallback(
    async (clipId: string) => {
      const lc = layout.find((l) => l.clip.id === clipId);
      if (!lc || lc.asset.kind !== 'video') return;
      setClipTool({ busy: 'reverse', message: 'جاري عكس المقطع... 0%' });
      try {
        const file = await reverseVideo(lc.asset.file, lc.clip.inPoint, lc.clip.outPoint, lc.asset.hasAudio, (p) =>
          setClipTool({ busy: 'reverse', message: `جاري عكس المقطع... ${Math.round(p * 100)}%` })
        );
        const asset = await registerAsset(file);
        updateClip(clipId, (c) => ({ ...c, assetId: asset.id, inPoint: 0, outPoint: asset.duration, speedCurve: null, freeze: null }));
        setClipTool({ busy: null, message: 'تم عكس المقطع. النسخة الأصلية ما زالت في مكتبة الوسائط.' });
      } catch (err) {
        setClipTool({ busy: null, message: err instanceof Error ? err.message : 'تعذر عكس المقطع.' });
      }
    },
    [layout, registerAsset, updateClip]
  );

  const extractAudio = useCallback(
    async (clipId: string) => {
      const lc = layout.find((l) => l.clip.id === clipId);
      if (!lc || lc.asset.kind !== 'video') return;
      if (!lc.asset.hasAudio) return setClipTool({ busy: null, message: 'هذا المقطع لا يحتوي على صوت.' });
      if (lc.clip.speed !== 1 || lc.clip.speedCurve || lc.clip.freeze) {
        return setClipTool({ busy: null, message: 'فصل الصوت يعمل على المقاطع بسرعتها الأصلية. أعد السرعة إلى 1x أولاً.' });
      }
      setClipTool({ busy: 'extract', message: null });
      let asset = lc.asset;
      if (!asset.peaks) {
        const peaks = await computePeaks(asset.file);
        asset = { ...asset, peaks };
        setAssetList((list) => list.map((a) => (a.id === asset.id ? asset : a)));
        saveAsset(asset).catch(() => {});
      }
      const audio: AudioClip = { ...createAudioClip(asset, lc.start), inPoint: lc.clip.inPoint, outPoint: lc.clip.outPoint, volume: lc.clip.volume };
      update((p) => ({ ...p, clips: replaceById(p.clips, clipId, (c) => ({ ...c, muted: true })), audios: [...p.audios, audio] }));
      setSelection({ kind: 'audio', id: audio.id });
      setClipTool({ busy: null, message: null });
    },
    [layout, update]
  );

  // ---------- audio tools: voice effects, beats ----------
  const [audioTool, setAudioTool] = useState<{ busy: string | null; message: string | null }>({ busy: null, message: null });

  const applyAudioEffect = useCallback(
    async (audioId: string, effect: VoiceEffect) => {
      const a = project.audios.find((x) => x.id === audioId);
      const asset = a && assets.get(a.assetId);
      if (!a || !asset) return;
      setAudioTool({ busy: effect, message: null });
      try {
        const buffer = await applyVoiceEffect(asset.file, a.inPoint, a.outPoint, effect);
        const label = VOICE_EFFECTS.find((v) => v.id === effect)?.label ?? effect;
        const processed = await registerAsset(encodeWav(buffer, `${asset.name.replace(/\.[^.]+$/, '')} - ${label}.wav`));
        updateAudio(audioId, (x) => ({ ...x, assetId: processed.id, inPoint: 0, outPoint: processed.duration }));
        setAudioTool({ busy: null, message: `تم تطبيق "${label}".` });
      } catch {
        setAudioTool({ busy: null, message: 'تعذر معالجة هذا الصوت.' });
      }
    },
    [project.audios, assets, registerAsset, updateAudio]
  );

  const findBeats = useCallback(
    async (audioId: string) => {
      const a = project.audios.find((x) => x.id === audioId);
      const asset = a && assets.get(a.assetId);
      if (!asset) return;
      setAudioTool({ busy: 'beats', message: null });
      try {
        const beats = await detectBeats(asset.file);
        const updated = { ...asset, beats };
        setAssetList((list) => list.map((x) => (x.id === asset.id ? updated : x)));
        saveAsset(updated).catch(() => {});
        setAudioTool({ busy: null, message: beats.length ? null : 'لم أجد إيقاعاً واضحاً في هذا الصوت.' });
      } catch {
        setAudioTool({ busy: null, message: 'تعذر تحليل هذا الصوت.' });
      }
    },
    [project.audios, assets]
  );

  /** Cuts the quiet parts out of a music/voice track; the pieces close up. */
  const removeAudioSilence = useCallback(
    async (audioId: string) => {
      const a = project.audios.find((x) => x.id === audioId);
      const asset = a && assets.get(a.assetId);
      if (!a || !asset) return;
      setAudioTool({ busy: 'silence', message: null });
      try {
        const ranges = await findSpeechRanges(asset, a.inPoint, a.outPoint);
        const removed = a.outPoint - a.inPoint - ranges.reduce((sum, [s, e]) => sum + (e - s), 0);
        if (!ranges.length) return setAudioTool({ busy: null, message: 'لم أجد صوتاً مسموعاً في هذا المسار.' });
        if (removed < 0.3) return setAudioTool({ busy: null, message: 'لا توجد لحظات صمت طويلة لحذفها.' });
        const parts = audioFromRanges(a, ranges);
        update((p) => ({ ...p, audios: p.audios.flatMap((x) => (x.id === audioId ? parts : [x])) }));
        setAudioTool({ busy: null, message: `تم حذف ${removed.toFixed(1)} ثانية من الصمت.` });
      } catch {
        setAudioTool({ busy: null, message: 'تعذر قراءة هذا الصوت.' });
      }
    },
    [project.audios, assets, update]
  );

  /** Re-times the main track so cuts land on every Nth beat of the selected music. */
  const syncToBeats = useCallback(
    (audioId: string, every: number) => {
      const a = project.audios.find((x) => x.id === audioId);
      const asset = a && assets.get(a.assetId);
      if (!a || !asset?.beats?.length) return;
      const cuts = beatCuts(a, asset.beats, every);
      update((p) => ({ ...p, clips: retimeToCuts(p.clips, assets, cuts) }));
      setAudioTool({ busy: null, message: 'تم قص المقاطع لتتبدل مع الإيقاع.' });
      pause();
      seek(0);
    },
    [project.audios, assets, update, pause, seek]
  );

  const moveOverlay = useCallback(
    (id: string, dir: 'up' | 'down') =>
      update((p) => {
        const i = p.overlays.findIndex((o) => o.id === id);
        const j = dir === 'up' ? i + 1 : i - 1;
        if (i < 0 || j < 0 || j >= p.overlays.length) return p;
        const overlays = [...p.overlays];
        [overlays[i], overlays[j]] = [overlays[j], overlays[i]];
        return { ...p, overlays };
      }),
    [update]
  );

  // ---------- voiceover ----------
  const recordStartRef = useRef(0);
  const onRecordStart = () => {
    recordStartRef.current = engine.getTime();
    engine.setMuted(true);
    play();
  };
  const onRecordStop = async (file: File | null) => {
    pause();
    engine.setMuted(false);
    if (!file) return;
    try {
      // Browser recordings carry no duration and seek poorly; store them as WAV.
      const decoded = await decodeFile(file);
      const asset = await registerAsset(encodeWav(decoded, file.name.replace(/\.[^.]+$/, '.wav')));
      addAudio(asset, recordStartRef.current);
    } catch {
      setErrors((e) => [...e, 'تعذر حفظ التسجيل الصوتي.']);
    }
  };

  const runCaptions = useCallback(
    async (wordsPerCaption: number, styleId: string, withEmoji: boolean) => {
      setCaptionState({ busy: true, status: 'جاري التحضير...', progress: 0 });
      try {
        const captions = await generateCaptions(layout, wordsPerCaption, styleId, withEmoji, (p) => {
          const part = p.clips > 1 ? ` (${p.clip} من ${p.clips})` : '';
          // Upload is the first half of the bar; the server's transcription the rest.
          if (p.stage === 'upload') {
            setCaptionState({ busy: true, status: `جاري رفع الصوت ${p.percent}%${part}`, progress: ((p.clip - 1) + p.percent / 200) / p.clips });
          } else {
            setCaptionState({ busy: true, status: `جاري التفريغ بالذكاء الاصطناعي${part}... قد يأخذ دقيقة إذا كان الخادم نائماً.`, progress: ((p.clip - 1) + 0.75) / p.clips });
          }
        });
        if (!captions.length) {
          setCaptionState({ busy: false, status: 'لم يتم العثور على كلام في الفيديو.', progress: null });
          return;
        }
        update((p) => ({ ...p, texts: [...p.texts, ...captions] }));
        setCaptionState({ busy: false, status: `تمت إضافة ${captions.length} سطر كابشن.`, progress: null });
        previewRange(captions[0].start, captions[0].start + 3);
      } catch (err) {
        setCaptionState({ busy: false, status: err instanceof Error ? err.message : 'فشل التفريغ.', progress: null });
      }
    },
    [layout, update, previewRange]
  );

  // ---------- bulk caption edits ----------
  const captionItems = useMemo(() => project.texts.filter((t) => t.words?.length).sort((a, b) => a.start - b.start), [project.texts]);
  const updateCaptions = useCallback(
    (fn: (t: TextClip) => TextClip, key?: string) => update((p) => ({ ...p, texts: p.texts.map((t) => (t.words?.length ? fn(t) : t)) }), key),
    [update]
  );
  const captionManager: CaptionManager = {
    items: captionItems,
    restyle: (styleId) => {
      updateCaptions((t) => ({ ...t, ...captionStyleFields(styleId) }));
      if (captionItems[0]) previewRange(captionItems[0].start, captionItems[0].start + 2.5);
    },
    setY: (y) => updateCaptions((t) => ({ ...t, y })),
    setSize: (percent) =>
      updateCaptions((t) => {
        const base = CAPTION_STYLES.find((c) => c.id === t.captionStyle)?.fontSize ?? 80;
        return { ...t, fontSize: Math.round((base * percent) / 100) };
      }, 'caption-size'),
    setEmoji: (on) => updateCaptions((t) => ({ ...t, emoji: on ? emojiFor(t.words ?? []) : undefined })),
    editLine: (id, text) => updateText(id, (t) => ({ ...t, text, words: t.words ? retimeWords(t.words, text) : undefined }), `caption-line-${id}`),
    deleteLine: (id) => update((p) => ({ ...p, texts: p.texts.filter((t) => t.id !== id) })),
    seek: (t) => {
      pause();
      seek(t + 0.01);
    },
    removeAll: () => update((p) => ({ ...p, texts: p.texts.filter((t) => !t.words?.length) })),
  };

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
    async (files: File[], addToTimeline: boolean): Promise<MediaAsset[]> => {
      if (!files.length) return [];
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
      if (!addToTimeline || !loaded.length) return loaded;
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
      return loaded;
    },
    [update, project.clips.length]
  );

  const initialAdded = useRef(false);
  useEffect(() => {
    if (!restored || initialAdded.current || !initialFiles?.length) return;
    initialAdded.current = true;
    if (autoEdit) {
      openAutoEdit([]);
      addFiles(initialFiles, false).then((loaded) => setAutoSelected(new Set(loaded.map((a) => a.id))));
      return;
    }
    if (project.clips.length) setNotice('أُضيفت ملفاتك إلى نهاية مشروعك الحالي. لبدء مشروع جديد استخدم "مشروع جديد".');
    addFiles(initialFiles, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, initialFiles]);

  const addText = useCallback(
    (presetId: string) => {
      const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? TEXT_PRESETS[0];
      const start = engine.getTime();
      const text: TextClip = { ...preset.style, id: uid(), start, duration: 3, x: 0.5, rotation: 0 };
      update((p) => ({ ...p, texts: [...p.texts, text] }));
      setSelection({ kind: 'text', id: text.id });
      setPanel('edit');
      previewRange(start, start + 1.3);
    },
    [update, engine, previewRange]
  );

  const addTemplate = useCallback(
    (tpl: TextTemplate) => {
      const start = engine.getTime();
      const texts = templateTexts(tpl, start);
      update((p) => ({ ...p, texts: [...p.texts, ...texts] }));
      setSelection({ kind: 'text', id: texts[0].id });
      setPanel('edit');
      previewRange(start, start + Math.min(3, Math.max(...texts.map((t) => t.start + t.duration)) - start));
    },
    [update, engine, previewRange]
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'clip') update((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'text') update((p) => ({ ...p, texts: p.texts.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'audio') update((p) => ({ ...p, audios: p.audios.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'overlay') update((p) => ({ ...p, overlays: p.overlays.filter((c) => c.id !== selection.id) }));
    if (selection.kind === 'effect') update((p) => ({ ...p, effects: (p.effects ?? []).filter((c) => c.id !== selection.id) }));
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
    if (type !== 'none') previewRange(Math.max(0, targetCut.start - 1), targetCut.start + 1);
  };

  // Frames either side of a cut, for transition previews.
  const cutFrames = (cut: typeof targetCut) => {
    if (!cut) return {};
    const prev = layout[cut.index - 1];
    return {
      a: prev ? frameAt(prev.asset, Math.max(prev.clip.inPoint, prev.clip.outPoint - 0.5)) : undefined,
      b: frameAt(cut.asset, cut.clip.inPoint + 0.2),
    };
  };

  // Plays the stretch of the selected item that an edit affects.
  const previewSelection = (part: 'in' | 'out' | 'whole') => {
    let start = 0;
    let end = 0;
    if (selection?.kind === 'clip') {
      const lc = layout.find((l) => l.clip.id === selection.id);
      if (!lc) return;
      // The project hasn't re-rendered yet, so estimate the clip span from the current layout.
      start = lc.start;
      end = lc.start + Math.min(3, lc.duration);
    } else if (selection?.kind === 'text') {
      const t = project.texts.find((x) => x.id === selection.id);
      if (!t) return;
      start = t.start;
      end = t.start + t.duration;
    } else if (selection?.kind === 'overlay') {
      const o = project.overlays.find((x) => x.id === selection.id);
      if (!o) return;
      start = o.start;
      end = o.start + o.outPoint - o.inPoint;
    } else return;
    if (part === 'in') previewRange(start, Math.min(end, start + 1.2));
    else if (part === 'out') previewRange(Math.max(start, end - 1.2), end);
    else previewRange(start, end);
  };

  // A clean still of the clip being filtered, taken from the live preview.
  const [clipFrame, setClipFrame] = useState<string | null>(null);
  const frameClipId = targetClip?.clip.id ?? null;
  useEffect(() => {
    if (!frameClipId || playing) return;
    const id = window.setTimeout(() => setClipFrame(captureFrame(frameClipId)), 300);
    return () => window.clearTimeout(id);
  }, [frameClipId, time, playing, captureFrame]);
  const filterFrame = clipFrame ?? (targetClip ? frameAt(targetClip.asset, targetClip.clip.inPoint) : undefined);

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
        if (e.shiftKey) seek(engine.getTime() + dir);
        else stepFrameRef.current(dir);
      } else if (e.key === 'Home') {
        seek(0);
      } else if (e.key === 'End') {
        seek(duration);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, undo, redo, duplicateSelection, splitAtPlayhead, deleteSelection, seek, engine, duration, exporting]);

  // ---------- canvas gestures ----------
  // One finger (or the mouse) moves the item under it; two fingers also scale and rotate it.
  // A double tap resets it. Each gesture is a single undo step.
  type GestureKind = 'clip' | 'text' | 'overlay';
  interface Gesture {
    kind: GestureKind;
    id: string;
    key: string;
    pointers: Map<number, { x: number; y: number }>;
    start: Map<number, { x: number; y: number }>;
    item0: MainClip | TextClip | OverlayClip;
    moved: boolean;
    multi: boolean;
  }
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [hud, setHud] = useState<string | null>(null);

  const findItem = (kind: GestureKind, id: string): MainClip | TextClip | OverlayClip | undefined => {
    const p = projectRef.current;
    if (kind === 'clip') return p.clips.find((c) => c.id === id);
    if (kind === 'text') return p.texts.find((t) => t.id === id);
    return p.overlays.find((o) => o.id === id);
  };

  const applyGesture = (kind: GestureKind, id: string, item0: MainClip | TextClip | OverlayClip, d: GestureDelta, key: string) => {
    let next: MainClip | TextClip | OverlayClip;
    if (kind === 'clip') {
      const lc = layout.find((l) => l.clip.id === id);
      next = applyClipGesture(item0 as MainClip, d, lc ? clipProgress(lc, engine.getTime()) : undefined);
      updateClip(id, () => next as MainClip, key);
    } else if (kind === 'text') {
      const t0 = item0 as TextClip;
      if (t0.keys?.length) {
        // Start from where the text is on screen now, and save the result as a keyframe there.
        const at = textProgress(t0, engine.getTime());
        const moved = applyTextGesture({ ...t0, ...textTransformAt(t0, at) }, d);
        next = { ...moved, keys: setTextKeyframe(moved, at) };
      } else next = applyTextGesture(t0, d);
      updateText(id, () => next as TextClip, key);
    } else {
      next = applyOverlayGesture(item0 as OverlayClip, d);
      updateOverlay(id, () => next as OverlayClip, key);
    }
    return next;
  };

  const resetItem = (kind: GestureKind, id: string) => {
    if (kind === 'clip') updateClip(id, resetClipTransform);
    else if (kind === 'text') updateText(id, (t) => ({ ...t, rotation: 0 }));
    else updateOverlay(id, (o) => ({ ...o, rotation: 0, scale: 0.4 }));
    setHud('إعادة الضبط');
    window.setTimeout(() => setHud(null), 700);
  };

  /** Hit-tests the preview; falls back to the main clip on screen. */
  const targetAt = (bx: number, by: number): { kind: GestureKind; id: string } | null => {
    const hit = [...engine.textBoundsRef.current].reverse().find((b) => bx >= b.x && bx <= b.x + b.w && by >= b.y && by <= b.y + b.h);
    if (hit) return { kind: hit.kind, id: hit.id };
    const lc = getMainFrameState(layout, engine.getTime()).primary?.lc;
    return lc ? { kind: 'clip', id: lc.clip.id } : null;
  };

  const rebaseline = (g: Gesture) => {
    g.item0 = findItem(g.kind, g.id) ?? g.item0;
    g.start = new Map(g.pointers);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    const pos = { x: e.clientX, y: e.clientY };
    const g = gestureRef.current;
    if (g) {
      // A second finger joins the gesture on the same item.
      g.pointers.set(e.pointerId, pos);
      g.multi = g.pointers.size > 1;
      rebaseline(g);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const target = targetAt(((pos.x - rect.left) / rect.width) * base.width, ((pos.y - rect.top) / rect.height) * base.height);
    if (!target) {
      setSelection(null);
      return;
    }
    setSelection({ kind: target.kind, id: target.id });
    const item0 = findItem(target.kind, target.id);
    if (!item0) return;
    gestureRef.current = {
      ...target,
      key: `gesture-${performance.now()}`,
      pointers: new Map([[e.pointerId, pos]]),
      start: new Map([[e.pointerId, pos]]),
      item0,
      moved: false,
      multi: false,
    };
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();
    const ids = [...g.start.keys()].filter((id) => g.pointers.has(id));
    let d: GestureDelta;
    if (ids.length >= 2) {
      const [a0, b0] = [g.start.get(ids[0])!, g.start.get(ids[1])!];
      const [a1, b1] = [g.pointers.get(ids[0])!, g.pointers.get(ids[1])!];
      const dist0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
      const dist1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
      const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x);
      const ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
      d = {
        dx: ((a1.x + b1.x) / 2 - (a0.x + b0.x) / 2) / rect.width,
        dy: ((a1.y + b1.y) / 2 - (a0.y + b0.y) / 2) / rect.height,
        scale: dist1 / dist0,
        rotation: ((ang1 - ang0) * 180) / Math.PI,
      };
    } else {
      const p0 = g.start.get(ids[0])!;
      const p1 = g.pointers.get(ids[0])!;
      if (!g.moved && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 6) return;
      d = { dx: (p1.x - p0.x) / rect.width, dy: (p1.y - p0.y) / rect.height, scale: 1, rotation: 0 };
    }
    g.moved = true;
    const next = applyGesture(g.kind, g.id, g.item0, d, g.key);
    if (g.multi) setHud(gestureLabel(next, g.kind));
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size > 0) {
      // Continue as a one-finger drag from where the remaining finger is.
      rebaseline(g);
      return;
    }
    gestureRef.current = null;
    setHud(null);
    if (g.moved || g.multi) return;
    const now = performance.now();
    const last = lastTapRef.current;
    if (last && last.id === g.id && now - last.time < 320) {
      lastTapRef.current = null;
      resetItem(g.kind, g.id);
    } else {
      lastTapRef.current = { id: g.id, time: now };
    }
  };

  // Ctrl/Cmd + wheel (and trackpad pinch, which arrives as one) scales the item under the cursor.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const target =
      selection && selection.kind !== 'audio' && selection.kind !== 'transition'
        ? { kind: selection.kind as GestureKind, id: selection.id }
        : targetAt(((e.clientX - rect.left) / rect.width) * base.width, ((e.clientY - rect.top) / rect.height) * base.height);
    if (!target) return;
    const item0 = findItem(target.kind, target.id);
    if (!item0) return;
    if (!selection) setSelection(target);
    const next = applyGesture(target.kind, target.id, item0, { dx: 0, dy: 0, scale: Math.exp(-e.deltaY * 0.01), rotation: 0 }, `wheel-${target.id}`);
    setHud(gestureLabel(next, target.kind));
    window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(null), 800);
  };
  const hudTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- panels ----------
  const selectedClip = selection?.kind === 'clip' ? layout.find((l) => l.clip.id === selection.id) : undefined;
  const selectedText = selection?.kind === 'text' ? project.texts.find((t) => t.id === selection.id) : undefined;
  const selectedAudio = selection?.kind === 'audio' ? project.audios.find((a) => a.id === selection.id) : undefined;
  const selectedCut = selection?.kind === 'transition' ? layout.find((l) => l.clip.id === selection.id) : undefined;
  const selectedOverlay = selection?.kind === 'overlay' ? project.overlays.find((o) => o.id === selection.id) : undefined;
  const selectedEffect = selection?.kind === 'effect' ? (project.effects ?? []).find((x) => x.id === selection.id) : undefined;

  const actions = { onSplit: splitAtPlayhead, onDuplicate: duplicateSelection, onDelete: deleteSelection };

  // ---------- editing commands ----------
  const [command, setCommand] = useState<CommandState>({ busy: null, status: null, progress: null, error: null, plan: null, done: null });
  const askCommand = async (text: string) => {
    setCommand((c) => ({ ...c, busy: 'thinking', status: null, progress: null, error: null, plan: null, done: null }));
    try {
      let res = await requestCommand(text, commandContext(project, assets, assetList, engine.getTime(), selection));
      // The request needs to see the video: watch it now, then ask again with what was seen.
      if (res.actions.some((a) => a.op === 'analyze')) {
        const updated = mainVideos.some((a) => !a.analysis)
          ? await analyzeMissing((status, progress) => setCommand((c) => ({ ...c, status, progress })))
          : new Map<string, MediaAsset>();
        if (updated.size) {
          setCommand((c) => ({ ...c, status: null, progress: null }));
          const nextAssets = new Map<string, MediaAsset>(assets);
          updated.forEach((a, id) => nextAssets.set(id, a));
          const library = assetList.map((a) => updated.get(a.id) ?? a);
          res = await requestCommand(text, commandContext(project, nextAssets, library, engine.getTime(), selection));
        }
        res = { ...res, actions: res.actions.filter((a) => a.op !== 'analyze') };
      }
      setCommand((c) => ({ ...c, busy: null, status: null, progress: null, plan: { command: text, ...res } }));
    } catch (err) {
      setCommand((c) => ({ ...c, busy: null, error: err instanceof Error ? err.message : 'تعذر تنفيذ الأمر.' }));
    }
  };
  /** Applies editor actions (from a command or an AI panel button) as one undo step. */
  const runActions = async (list: EditAction[], label: string) => {
    setCommand((c) => ({ ...c, busy: 'applying', status: null, progress: null, error: null }));
    try {
      const res = await executeActions(project, assets, assetList, list, {
        onStatus: (status, progress) => setCommand((c) => ({ ...c, status, progress })),
        registerAsset,
        saveAsset: (asset) => {
          setAssetList((list) => list.map((x) => (x.id === asset.id ? asset : x)));
          saveAsset(asset).catch(() => {});
        },
      });
      update(() => res.project);
      setCommand((c) => ({ ...c, busy: null, plan: null, done: label, error: res.notes.length ? [...new Set(res.notes)].join(' ') : null }));
      if (res.seek !== undefined) {
        pause();
        seek(res.seek);
      }
      if (res.play) play();
      if (res.export) setExporting(true);
      return res;
    } catch (err) {
      setCommand((c) => ({ ...c, busy: null, error: err instanceof Error ? err.message : 'فشل تنفيذ الأمر.' }));
      return null;
    }
  };
  const applyCommand = async () => {
    const plan = command.plan;
    if (!plan) return;
    const history = plan.actions.filter((a): a is Extract<EditAction, { op: 'undo' | 'redo' }> => a.op === 'undo' || a.op === 'redo');
    if (history.length && history.length === plan.actions.length) {
      for (const a of history) {
        const steps = Math.min(20, Math.max(1, Math.round(Number(a.steps) || 1)));
        for (let i = 0; i < steps; i++) (a.op === 'undo' ? undo : redo)();
      }
      setCommand((c) => ({ ...c, plan: null, done: null }));
      return;
    }
    await runActions(plan.actions.filter((a) => a.op !== 'undo' && a.op !== 'redo'), plan.command);
  };

  // ---------- AI video understanding ----------
  const [analysis, setAnalysis] = useState<{ busy: boolean; status: string | null; progress: number | null; error: string | null }>({ busy: false, status: null, progress: null, error: null });
  const mainVideos = useMemo(() => [...new Map(layout.filter((l) => l.asset.kind === 'video').map((l) => [l.asset.id, l.asset])).values()], [layout]);
  /** Analyses the main-track videos that haven't been yet; returns them updated, by id. */
  const analyzeMissing = (onProgress: (status: string, progress: number | null) => void) => analyzeAssets(mainVideos.filter((a) => !a.analysis), onProgress);
  /** Saves a finished analysis on its asset. */
  const storeAnalysis = async (asset: MediaAsset, analysis: VideoAnalysis) => {
    const updated = { ...asset, analysis, fps: await videoFps(asset) };
    setAssetList((list) => list.map((x) => (x.id === asset.id ? updated : x)));
    saveAsset(updated).catch(() => {});
    return updated;
  };
  /** Analyses the given videos (several at once); returns them updated, by id. Throws if any failed. */
  const analyzeAssets = async (targets: MediaAsset[], onProgress: (status: string, progress: number | null) => void) => {
    const done = new Map<string, MediaAsset>();
    const states = new Map<string, BatchStatus>();
    const report = () => {
      const list = [...states.values()];
      const watching = list.filter((x) => x.stage === 'thinking' || x.stage === 'upload').length;
      const finished = list.filter((x) => x.stage === 'done').length;
      const status = targets.length > 1 ? `تحليل ${targets.length} فيديوهات معاً: انتهى ${finished}${watching ? ` · يشاهد ${watching} الآن` : ''}` : 'الذكاء الاصطناعي يشاهد الفيديو...';
      onProgress(status, list.reduce((sum, x) => sum + batchFraction(x), 0) / Math.max(1, targets.length));
    };
    const { errors } = await analyzeMany(
      targets,
      (id, st) => {
        states.set(id, st);
        report();
      },
      async (asset, analysis) => {
        done.set(asset.id, await storeAnalysis(asset, analysis));
      }
    );
    if (errors.length) throw new Error(errors[0].message);
    return done;
  };
  const analyzeVideos = async () => {
    setAnalysis({ busy: true, status: null, progress: 0, error: null });
    try {
      await analyzeMissing((status, progress) => setAnalysis((a) => ({ ...a, status, progress })));
      setAnalysis({ busy: false, status: null, progress: null, error: null });
    } catch (err) {
      setAnalysis({ busy: false, status: null, progress: null, error: err instanceof Error ? err.message : 'تعذر تحليل الفيديو.' });
    }
  };
  // ---------- auto edit (montage) ----------
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoStage, setAutoStage] = useState<AutoEditStage>({ step: 'brief' });
  const [autoSelected, setAutoSelected] = useState<Set<string>>(new Set());
  const [autoNotes, setAutoNotes] = useState<string[]>([]);
  const autoBrief = useRef<AutoEditBrief | null>(null);
  const autoChosen = useRef<MediaAsset[]>([]);
  const openAutoEdit = (ids?: string[]) => {
    pause();
    setAutoSelected(new Set(ids ?? assetList.map((a) => a.id)));
    setAutoStage({ step: 'brief' });
    setAutoNotes([]);
    setAutoOpen(true);
  };
  const working = (status: string, progress: number | null = null) => setAutoStage({ step: 'working', status, progress });
  const planAutoEdit = async (brief: AutoEditBrief) => {
    autoBrief.current = brief;
    const notes: string[] = [];
    let chosen = assetList.filter((a) => autoSelected.has(a.id));
    // Watch every chosen video once (within the footage limit), several at a time; a failure skips that file only.
    let budget = MAX_AUTO_FOOTAGE;
    const todo: MediaAsset[] = [];
    for (const asset of chosen.filter((a) => a.kind === 'video' && !a.analysis)) {
      if (asset.duration > MAX_ANALYSIS_SECONDS || asset.duration > budget) {
        notes.push(`«${asset.name}» أطول من حد التحليل، فاستُخدم بدون مشاهدة.`);
        continue;
      }
      budget -= asset.duration;
      todo.push(asset);
    }
    // Videos where people may speak are also transcribed word by word: the plan is built from sentences.
    const mayTalk = (a: MediaAsset) => a.kind === 'video' && a.hasAudio && !a.transcript && (!a.analysis || a.analysis.events.some((e) => e.kind === 'speech'));
    const speechTodo = chosen.filter((a) => mayTalk(a) && a.duration <= MAX_ANALYSIS_SECONDS);
    const shown = [...new Map([...todo, ...speechTodo].map((a) => [a.id, a])).values()];
    if (shown.length) {
      const states = new Map<string, BatchStatus>(shown.map((a) => [a.id, { stage: 'waiting' }]));
      const show = () =>
        setAutoStage({
          step: 'working',
          status: shown.length > 1 ? `الذكاء الاصطناعي يشاهد ${shown.length} فيديوهات معاً` : 'الذكاء الاصطناعي يشاهد الفيديو',
          progress: [...states.values()].reduce((sum, x) => sum + batchFraction(x), 0) / shown.length,
          files: shown.map((asset) => ({ asset, status: states.get(asset.id)! })),
        });
      const set = (id: string, st: BatchStatus) => {
        states.set(id, st);
        show();
      };
      show();
      const updated = new Map<string, MediaAsset>();
      if (todo.length) {
        const { errors } = await analyzeMany(todo, set, async (asset, analysis) => {
          updated.set(asset.id, await storeAnalysis(asset, analysis));
        });
        for (const e of errors) notes.push(`تعذر تحليل «${e.asset.name}»: ${e.message}`);
      }
      // Two at a time; a video the AI found silent is skipped.
      const pending = speechTodo.map((a) => updated.get(a.id) ?? a).filter(mayTalk);
      for (const a of speechTodo) if (!pending.some((x) => x.id === a.id)) set(a.id, { stage: 'done' });
      const worker = async () => {
        for (let asset = pending.shift(); asset; asset = pending.shift()) {
          const target = asset;
          set(target.id, { stage: 'transcribe', percent: 0 });
          try {
            const words = await transcribeAsset(target, (percent) => set(target.id, { stage: 'transcribe', percent }), () => set(target.id, { stage: 'transcribe', percent: 100 }));
            const withWords = { ...(updated.get(target.id) ?? target), transcript: words };
            setAssetList((list) => list.map((x) => (x.id === target.id ? { ...x, transcript: words } : x)));
            saveAsset(withWords).catch(() => {});
            updated.set(target.id, withWords);
            set(target.id, { stage: 'done' });
          } catch (err) {
            notes.push(`تعذر تفريغ كلام «${target.name}»: ${err instanceof Error ? err.message : ''}`);
            set(target.id, { stage: 'error', message: err instanceof Error ? err.message : 'تعذر التفريغ.' });
          }
        }
      };
      await Promise.all([worker(), worker()]);
      chosen = chosen.map((a) => updated.get(a.id) ?? a);
    }
    autoChosen.current = chosen;
    setAutoNotes(notes);
    try {
      working('المخرج الذكي يكتب خطة الفيديو...');
      const plan = await requestPlan(brief, chosen);
      setAutoStage({ step: 'plan', plan });
    } catch (err) {
      setAutoStage({ step: 'error', message: err instanceof Error ? err.message : 'تعذر إعداد الخطة.' });
    }
  };
  const reviseAutoEdit = async (feedback: string) => {
    if (autoStage.step !== 'plan' || !autoBrief.current) return;
    const previous = autoStage.plan;
    working('يعدّل الخطة حسب طلبك...');
    try {
      setAutoStage({ step: 'plan', plan: await requestPlan(autoBrief.current, autoChosen.current, previous, feedback) });
    } catch (err) {
      setAutoStage({ step: 'plan', plan: previous });
      setAutoNotes((n) => [...n, err instanceof Error ? err.message : 'تعذر تعديل الخطة.']);
    }
  };
  const buildAutoEdit = async () => {
    if (autoStage.step !== 'plan' || !autoBrief.current) return;
    if (!isEmpty && !window.confirm('سيحل المونتاج الجديد محل ما في الخط الزمني الآن (يمكنك التراجع). متابعة؟')) return;
    const plan: AutoEditPlan = autoStage.plan;
    const brief = autoBrief.current;
    // Files made on the way (music, voice-over, sounds) join the map the reviewer and fixes use.
    const known = new Map<string, MediaAsset>(assets);
    const hooks = {
      registerAsset: async (file: File) => {
        const asset = await registerAsset(file);
        known.set(asset.id, asset);
        return asset;
      },
      saveAsset: (asset: MediaAsset) => {
        known.set(asset.id, asset);
        setAssetList((list) => list.map((x) => (x.id === asset.id ? asset : x)));
        saveAsset(asset).catch(() => {});
      },
    };
    let built;
    try {
      built = await buildFromPlan(plan, brief, autoChosen.current, { ...hooks, onStatus: (status, progress) => working(`ينفّذ المونتاج: ${status}`, progress) });
    } catch (err) {
      setAutoStage({ step: 'error', message: err instanceof Error ? err.message : 'تعذر تنفيذ المونتاج.' });
      return;
    }
    update(() => built.project);
    setSelection(null);
    const report: AutoEditReport = { title: plan.title, score: null, summary: '', issues: [], fixes: [], rounds: 0, scoreBeforeFixes: false, notes: [...new Set<string>(built.notes)] };

    // The reviewer watches the result and fixes what it finds; a second look only after big fixes.
    let current = built.project;
    for (let round = 1; brief.review && round <= 2; round++) {
      try {
        const library = [...known.values()];
        const verdict = await reviewEdit(current, known, library, plan, brief, (status, progress) =>
          working(`${round === 1 ? 'المراجعة الذكية' : 'مراجعة ثانية بعد الإصلاح'}: ${status}`, progress)
        );
        report.score = verdict.score;
        report.scoreBeforeFixes = false;
        report.summary = verdict.summary;
        report.issues.push(...verdict.issues);
        if (!verdict.actions.length) break;
        working('المراجع يطبّق الإصلاحات...', null);
        const fixed = await executeActions(current, known, library, verdict.actions, { ...hooks, onStatus: (status, progress) => working(`المراجع يطبّق الإصلاحات: ${status}`, progress) });
        current = fixed.project;
        update(() => current);
        report.rounds++;
        report.scoreBeforeFixes = true;
        report.fixes.push(...(verdict.actions.map((a: EditAction) => describeAction(a)).filter(Boolean) as string[]));
        report.notes.push(...fixed.notes);
        if (verdict.ready || verdict.actions.length < 3) break;
      } catch (err) {
        report.notes.push(`لم تكتمل المراجعة: ${err instanceof Error ? err.message : ''}`);
        break;
      }
    }
    report.notes = [...new Set<string>(report.notes)];
    seek(0);
    setAutoStage({ step: 'done', report });
  };


  const badScenesRef = useRef<[number, number][]>([]);
  // Analysis results moved onto the timeline (only the parts the clips use).
  const aiState = useMemo<AiPanelState>(() => {
    const shorts: AiShort[] = [];
    const bad: [number, number][] = [];
    let summary: string | null = null;
    let publish: AiPanelState['publish'] = null;
    let thumbnailTime: number | null = null;
    for (const lc of layout) {
      const a = lc.asset.analysis;
      if (!a) continue;
      const { inPoint, outPoint, speed } = lc.clip;
      const tl = (t: number) => lc.start + (Math.min(outPoint, Math.max(inPoint, t)) - inPoint) / speed;
      summary ??= a.summary || null;
      publish ??= a.title || a.hashtags.length ? { title: a.title, description: a.description, hashtags: a.hashtags } : null;
      if (thumbnailTime === null && a.thumbnailTime >= inPoint && a.thumbnailTime <= outPoint) thumbnailTime = tl(a.thumbnailTime);
      // A highlight can span several clips cut from the same video: map each end through the clip that shows it.
      const toTimeline = (src: number) => {
        const hit = layout.find((l) => l.asset.id === lc.asset.id && src >= l.clip.inPoint - 0.01 && src <= l.clip.outPoint + 0.01);
        return hit ? hit.start + (Math.min(hit.clip.outPoint, Math.max(hit.clip.inPoint, src)) - hit.clip.inPoint) / hit.clip.speed : null;
      };
      a.highlights.forEach((h, i) => {
        const key = `${lc.asset.id}-${i}`;
        if (shorts.some((x) => x.key === key)) return;
        const start = toTimeline(h.start);
        const end = toTimeline(h.end);
        if (start === null || end === null || end - start < 1) return;
        shorts.push({ key, start, end, title: h.title, reason: h.reason, score: h.score });
      });
      for (const sc of a.scenes) {
        if (sc.quality === 'good' || sc.end <= inPoint || sc.start >= outPoint) continue;
        const range: [number, number] = [tl(sc.start), tl(sc.end)];
        // Merge touching scenes so no part is deleted twice.
        const last = bad[bad.length - 1];
        if (last && range[0] <= last[1] + 0.01) last[1] = Math.max(last[1], range[1]);
        else bad.push(range);
      }
    }
    badScenesRef.current = bad;
    return {
      videos: mainVideos.map((a) => ({ id: a.id, name: a.name, analyzed: !!a.analysis })),
      ...analysis,
      summary,
      shorts: shorts.sort((x, y) => y.score - x.score).slice(0, 5),
      publish,
      thumbnailTime,
      badScenes: bad.length,
      canReframe: layout.some((l) => l.asset.analysis && l.asset.width > l.asset.height),
    };
  }, [layout, mainVideos, analysis]);

  const inspector = selectedClip ? (
    <ClipInspector
      clip={selectedClip.clip}
      asset={selectedClip.asset}
      progress={clipProgress(selectedClip, time)}
      patch={(fn, key) =>
        updateClip(
          selectedClip.clip.id,
          (c) => {
            const n = fn(c);
            // Auto-key: with hand-made keyframes, transform edits land on a keyframe at the playhead.
            const moved = n.zoom !== c.zoom || n.offsetX !== c.offsetX || n.offsetY !== c.offsetY || n.rotation !== c.rotation;
            return moved && n.motion?.preset === 'custom' ? { ...n, motion: setKeyframe(n, clipProgress(selectedClip, engine.getTime())) } : n;
          },
          key
        )
      }
      actions={actions}
      silence={{ ...silence, run: () => removeSilence(selectedClip.clip.id) }}
      frame={filterFrame}
      preview={previewSelection}
      tools={{
        ...clipTool,
        onFreeze: () => freezeFrame(selectedClip.clip.id),
        onReverse: () => reverseClip(selectedClip.clip.id),
        onExtractAudio: () => extractAudio(selectedClip.clip.id),
      }}
    />
  ) : selectedEffect ? (
    <EffectInspector item={selectedEffect} patch={(fn, key) => updateEffect(selectedEffect.id, fn, key)} onDelete={deleteSelection} />
  ) : selectedOverlay ? (
    <OverlayInspector
      overlay={selectedOverlay}
      asset={assets.get(selectedOverlay.assetId)}
      patch={(fn, key) => updateOverlay(selectedOverlay.id, fn, key)}
      actions={actions}
      preview={previewSelection}
      onLayer={(dir) => moveOverlay(selectedOverlay.id, dir)}
    />
  ) : selectedText ? (
    <TextInspector
      // With keyframes, the sliders show (and edit) where the text is at the playhead.
      text={selectedText.keys?.length ? { ...selectedText, ...textTransformAt(selectedText, textProgress(selectedText, time)) } : selectedText}
      progress={textProgress(selectedText, time)}
      patch={(fn, key) =>
        updateText(
          selectedText.id,
          (t) => {
            const at = textProgress(t, engine.getTime());
            const cur = t.keys?.length ? { ...t, ...textTransformAt(t, at) } : t;
            const n = fn(cur);
            // Auto-key: position/size/rotation edits land on a keyframe at the playhead.
            const moved = n.x !== cur.x || n.y !== cur.y || n.fontSize !== cur.fontSize || n.rotation !== cur.rotation;
            if (!t.keys?.length || n.keys !== t.keys) return n;
            return moved ? { ...n, keys: setTextKeyframe(n, at) } : { ...n, x: t.x, y: t.y, fontSize: t.fontSize, rotation: t.rotation };
          },
          key
        )
      }
      actions={actions}
      preview={previewSelection}
    />
  ) : selectedAudio ? (
    <AudioInspector
      audio={selectedAudio}
      asset={assets.get(selectedAudio.assetId)}
      patch={(fn, key) => updateAudio(selectedAudio.id, fn, key)}
      actions={actions}
      tools={{
        ...audioTool,
        onEffect: (e) => applyAudioEffect(selectedAudio.id, e),
        onDetectBeats: () => findBeats(selectedAudio.id),
        onBeatSync: (n) => syncToBeats(selectedAudio.id, n),
        onRemoveSilence: () => removeAudioSilence(selectedAudio.id),
      }}
    />
  ) : selectedCut ? (
    <TransitionInspector
      clip={selectedCut.clip}
      onChange={(fn, key) => updateClip(selectedCut.clip.id, fn, key)}
      frames={cutFrames(selectedCut)}
      preview={() => previewRange(Math.max(0, selectedCut.start - 1), selectedCut.start + 1)}
    />
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
            extra={
              <div className="space-y-2">
                <VoiceRecorder
                  onStart={() => {
                    setSheetOpen(false);
                    onRecordStart();
                  }}
                  onStop={onRecordStop}
                />
                <TextToSpeech
                  onCreate={async (text, voice, style) => {
                    const asset = await registerAsset(await synthesizeSpeech(text, voice, style));
                    addAudio(asset);
                    setSheetOpen(false);
                  }}
                />
                <SfxPanel
                  onAddBuiltIn={async (id) => addAudio(await registerAsset(await sfxFile(id)))}
                  onAddFile={async (file) => addAudio(await registerAsset(file))}
                  onAuto={async (id, where) => {
                    const moments = where === 'cuts' ? layout.slice(1).map((l) => l.start) : project.texts.filter((t) => !t.words?.length).map((t) => t.start);
                    if (!moments.length) throw new Error(where === 'cuts' ? 'أضف مقطعين على الأقل ليكون هناك انتقال.' : 'لا توجد نصوص أو ملصقات بعد.');
                    const asset = await registerAsset(await sfxFile(id));
                    const clips = autoSfxTimes(id, moments).map((t) => ({ ...createAudioClip(asset, t), volume: 0.8 }));
                    update((p) => ({ ...p, audios: [...p.audios, ...clips] }));
                  }}
                />
              </div>
            }
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
            onTemplate={(tpl) => {
              addTemplate(tpl);
              setSheetOpen(false);
            }}
            captions={{ ...captionState, run: runCaptions }}
            manager={captionManager}
          />
        );
      case 'ai':
        return (
          <>
          <AiPanel
            state={aiState}
            onAnalyze={analyzeVideos}
            onPreview={(a, b) => previewRange(a, b)}
            onShort={(sh) => runActions([{ op: 'make_short', start: sh.start, end: sh.end }], `مقطع قصير: ${sh.title}`)}
            onReframe={() => runActions([{ op: 'aspect', aspect: '9:16' }, { op: 'reframe', clips: 'all' }], 'تحويل إلى عمودي مع تأطير ذكي')}
            onRemoveBad={() =>
              runActions(
                badScenesRef.current.map(([start, end]) => ({ op: 'delete_range' as const, start, end })),
                'حذف اللقطات السيئة'
              )
            }
            onSeek={(t) => {
              pause();
              seek(t);
            }}
          />
          <CommandPanel
            state={command}
            onAsk={askCommand}
            onApply={applyCommand}
            onCancel={() => setCommand((c) => ({ ...c, plan: null }))}
            onUndo={() => {
              undo();
              setCommand((c) => ({ ...c, done: null }));
            }}
          />
          </>
        );
      case 'effects':
        return (
          <EffectsPanel
            frame={filterFrame}
            onAdd={(type) => {
              addEffect(type);
              setSheetOpen(false);
            }}
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
            frames={layout.slice(0, 3).map((lc) => frameAt(lc.asset, lc.clip.inPoint + 0.3)).filter((f): f is string => !!f)}
            onApply={(id) => {
              update((p) => applyTemplate(p, assets, id));
              setNotice('تم تطبيق القالب. يمكنك التراجع بـ Ctrl+Z.');
              setSheetOpen(false);
              previewRange(0, 6);
            }}
          />
        );
      case 'filters':
        return (
          <FiltersPanel
            thumbnail={filterFrame}
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
            frames={cutFrames(targetCut)}
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
          onClick={() => openAutoEdit()}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-l from-fuchsia-600 to-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-600/20 hover:brightness-110 sm:px-3 sm:py-2"
        >
          <Clapperboard className="h-4 w-4" />
          <span className="hidden sm:inline">مونتاج تلقائي</span>
          <span className="sm:hidden">مونتاج</span>
        </button>
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
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              className="relative touch-none rounded-sm shadow-2xl shadow-black/60 ring-1 ring-white/10"
              style={{ width: cssW, height: cssH }}
            />
            {hud && (
              <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs font-bold tabular-nums text-white" dir="ltr">
                {hud}
              </div>
            )}
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
              <button type="button" onClick={() => stepFrame(-1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="إطار للخلف (←)">
                <StepBack className="h-4 w-4" />
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
              <button type="button" onClick={() => stepFrame(1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="إطار للأمام (→)">
                <StepForward className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => seek(duration)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="النهاية">
                <SkipForward className="h-4 w-4" />
              </button>
              <span className="ml-1 text-[11px] tabular-nums text-slate-400">
                <span ref={clockRef} className="text-white">{formatTime(time, true)}</span> / {formatTime(duration, true)}
                {!playing && frameUnder(time) && <span className="mr-1.5 text-slate-500">· إطار {frameUnder(time)!.index}</span>}
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
              onUpdateEffect={updateEffect}
              effectLabel={(type) => fxDef(type)?.label ?? type}
              onReorder={reorderClip}
              onDropAsset={onDropAsset}
              onAddText={() => addText('basic')}
              onAddAudio={() => openPanel('audio')}
              subscribeFrame={subscribeFrame}
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
      {autoOpen && (
        <AutoEditModal
          library={assetList}
          selected={autoSelected}
          onToggle={(id) =>
            setAutoSelected((sel) => {
              const next = new Set(sel);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onAddFiles={(files) => addFiles(files, false).then((loaded) => setAutoSelected((sel) => new Set([...sel, ...loaded.map((a) => a.id)])))}
          loading={loading > 0}
          stage={autoStage}
          notes={autoNotes}
          onPlan={planAutoEdit}
          onRevise={reviseAutoEdit}
          onBuild={buildAutoEdit}
          onBack={() => setAutoStage({ step: 'brief' })}
          onRetry={() => autoBrief.current && planAutoEdit(autoBrief.current)}
          onExport={() => {
            setAutoOpen(false);
            pause();
            setExporting(true);
          }}
          onUndoFixes={() => {
            if (autoStage.step !== 'done') return;
            for (let i = 0; i < autoStage.report.rounds; i++) undo();
            setAutoOpen(false);
            setNotice('رجعتُ إلى المونتاج كما بُني قبل إصلاحات المراجعة.');
          }}
          onClose={() => {
            if (autoStage.step === 'working') return;
            setAutoOpen(false);
          }}
        />
      )}
    </div>
  );
}

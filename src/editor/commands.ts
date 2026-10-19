import { VOICE_EFFECTS, VoiceEffect, applyVoiceEffect, detectBeats, encodeWav } from './audioTools';
import { CaptionProgress, emojiFor, generateCaptions } from './autoCaptions';
import { ClipTarget, CommandResponse, EditAction } from './commandSpec';
import {
  ASPECT_SIZES,
  BLEND_MODES,
  CAPTION_STYLES,
  CLIP_ANIMS,
  EFFECTS,
  FILTER_PRESETS,
  MASKS,
  MIN_CLIP_DURATION,
  MOTION_PRESETS,
  OVERLAY_ANIMS,
  SPEED_CURVES,
  TEXT_PRESETS,
  TRANSITIONS,
  captionStyleFields,
  presetAdjustments,
} from './constants';
import { MAX_REVERSE_SECONDS, reverseVideo } from './reverse';
import { clipsFromRanges, findSpeechRanges } from './silence';
import {
  audioClipEnd,
  beatCuts,
  clamp,
  createAudioClip,
  createMainClip,
  createOverlayClip,
  formatTime,
  insertFreeze,
  layoutMainTrack,
  motionFromPreset,
  overlayEnd,
  retimeToCuts,
  splitMainClip,
  uid,
} from './timeline';
import { AspectRatio, AudioClip, BlendMode, ChromaKey, LaidOutClip, MainClip, MaskShape, MediaAsset, OverlayAnim, OverlayClip, Project, Selection, TextClip, TransitionType } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const isCaption = (t: TextClip) => !!t.words?.length;

/** What the model is told about the project: enough to resolve "clip 2" or "where I say hello". */
export function commandContext(project: Project, assets: Map<string, MediaAsset>, library: MediaAsset[], time: number, selection: Selection) {
  const layout = layoutMainTrack(project.clips, assets);
  const texts = project.texts.filter((t) => !isCaption(t));
  const captions = project.texts.filter(isCaption).sort((a, b) => a.start - b.start);
  const describeSelection = () => {
    if (!selection) return null;
    if (selection.kind === 'clip') return { clip: layout.findIndex((l) => l.clip.id === selection.id) + 1 };
    if (selection.kind === 'transition') return { cut: layout.findIndex((l) => l.clip.id === selection.id) + 1 };
    if (selection.kind === 'audio') return { audio: project.audios.findIndex((a) => a.id === selection.id) + 1 };
    if (selection.kind === 'text') {
      const t = project.texts.find((x) => x.id === selection.id);
      return t && isCaption(t) ? { caption: t.text } : { text: texts.findIndex((x) => x.id === selection.id) + 1 };
    }
    return { pip: project.overlays.findIndex((o) => o.id === selection.id) + 1 };
  };
  return {
    duration: r2(layout.length ? layout[layout.length - 1].end : 0),
    aspect: project.aspect,
    playhead: r2(time),
    selected: describeSelection(),
    clips: layout.map((lc) => ({
      n: lc.index + 1,
      type: lc.asset.kind,
      name: lc.asset.name.slice(0, 40),
      start: r2(lc.start),
      end: r2(lc.end),
      speed: lc.clip.speed,
      volume: lc.clip.muted ? 0 : r2(lc.clip.volume),
      has_sound: lc.asset.hasAudio,
      filter: lc.clip.filterId,
      transition_in: lc.index > 0 ? lc.clip.transition.type : undefined,
      effect: lc.clip.effect?.type,
      motion: lc.clip.motion?.preset,
    })),
    audios: project.audios.map((a, i) => ({
      n: i + 1,
      name: assets.get(a.assetId)?.name.slice(0, 40),
      start: r2(a.start),
      end: r2(audioClipEnd(a)),
      volume: r2(a.volume),
    })),
    texts: texts.map((t, i) => ({ n: i + 1, text: t.text.slice(0, 60), start: r2(t.start), end: r2(t.start + t.duration) })),
    captions: captions.slice(0, 400).map((t) => ({ start: r2(t.start), end: r2(t.start + t.duration), text: t.text })),
    caption_style: captions[0]?.captionStyle,
    pips: project.overlays.map((o, i) => ({
      n: i + 1,
      name: assets.get(o.assetId)?.name.slice(0, 40),
      start: r2(o.start),
      end: r2(overlayEnd(o)),
      x: r2(o.x),
      y: r2(o.y),
      scale: r2(o.scale),
      chroma: !!o.chroma,
    })),
    media: library.map((a, i) => ({ n: i + 1, type: a.kind, name: a.name.slice(0, 40), duration: r2(a.duration) })),
  };
}

export async function requestCommand(command: string, context: unknown): Promise<CommandResponse> {
  let res: Response;
  try {
    res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, context }),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت.');
  }
  if (res.status === 404 || res.status === 405) throw new Error('الأوامر الذكية تعمل على الموقع الكامل فقط.');
  if (res.status === 503) throw new Error('الأوامر الذكية تحتاج مفتاح OpenRouter في إعدادات الخادم.');
  if (res.status === 429) throw new Error('أرسلت أوامر كثيرة. انتظر دقيقة ثم حاول.');
  if (!res.ok) throw new Error('لم أفهم الأمر أو تعذر الرد. حاول بصيغة أخرى.');
  const data = await res.json();
  return { reply: String(data.reply ?? ''), actions: Array.isArray(data.actions) ? data.actions : [] };
}

// ---------------------------------------------------------------- reading model output safely

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
};
const optNum = (v: unknown, min: number, max: number) => (v === undefined || v === null ? undefined : num(v, min, max, NaN));
const label = (list: { id: string; label: string }[], id: unknown) => list.find((x) => x.id === id)?.label;
const known = (list: { id: string }[], id: unknown): id is string => typeof id === 'string' && list.some((x) => x.id === id);

const targetText = (t: ClipTarget | undefined, noun: string) =>
  t === 'all' ? `كل ${noun}` : Array.isArray(t) && t.length ? `${noun} ${t.join('، ')}` : noun;

/** A one-line Arabic description of an action, for the confirmation list. Null when it can't be done. */
export function describeAction(a: EditAction): string | null {
  const clips = 'clips' in a ? targetText(a.clips, 'المقاطع') : '';
  switch (a.op) {
    case 'delete_range':
      return `حذف الجزء من ${formatTime(num(a.start, 0, 1e5, 0), true)} إلى ${formatTime(num(a.end, 0, 1e5, 0), true)}`;
    case 'split':
      return `قص عند ${formatTime(num(a.time, 0, 1e5, 0), true)}`;
    case 'delete_clip':
      return `حذف ${clips}`;
    case 'move_clip':
      return `نقل المقطع ${a.clip} إلى المكان ${a.to}`;
    case 'duplicate_clip':
      return `تكرار المقطع ${a.clip}`;
    case 'speed':
      return `سرعة ${clips}: ${num(a.speed, 0.25, 4, 1)}x`;
    case 'clip_volume':
      return a.muted ? `كتم صوت ${clips}` : `صوت ${clips}: ${Math.round(num(a.volume, 0, 1, 1) * 100)}%`;
    case 'audio_volume': {
      const parts = [];
      if (a.volume !== undefined) parts.push(`${Math.round(num(a.volume, 0, 1, 1) * 100)}%`);
      if (a.fade_in) parts.push(`ظهور تدريجي ${a.fade_in}ث`);
      if (a.fade_out) parts.push(`اختفاء تدريجي ${a.fade_out}ث`);
      return `${targetText(a.audios, 'المسارات الصوتية')}: ${parts.join('، ')}`;
    }
    case 'filter':
      return known(FILTER_PRESETS, a.filter) ? `فلتر "${label(FILTER_PRESETS, a.filter)}" على ${clips}` : null;
    case 'adjust':
      return `تعديل الألوان في ${clips}`;
    case 'transition':
      return known(TRANSITIONS, a.type) ? `انتقال "${label(TRANSITIONS, a.type)}" ${a.cuts === 'all' ? 'بين كل المقاطع' : `قبل المقطع ${(a.cuts ?? []).join('، ')}`}` : null;
    case 'clip_anim':
      return `حركة دخول/خروج على ${clips}`;
    case 'effect':
      return a.effect === null ? `إزالة التأثير من ${clips}` : known(EFFECTS, a.effect) ? `تأثير "${label(EFFECTS, a.effect)}" على ${clips}` : null;
    case 'motion':
      return a.preset === null ? `إزالة حركة الكاميرا من ${clips}` : known(MOTION_PRESETS, a.preset) ? `حركة "${label(MOTION_PRESETS, a.preset)}" على ${clips}` : null;
    case 'speed_curve':
      return a.curve === null ? `إزالة منحنى السرعة من ${clips}` : known(SPEED_CURVES, a.curve) ? `منحنى سرعة "${label(SPEED_CURVES, a.curve)}" على ${clips}` : null;
    case 'transform':
      return `تعديل الحجم/الاتجاه في ${clips}`;
    case 'aspect':
      return a.aspect in ASPECT_SIZES ? `مقاس الفيديو ${a.aspect}` : null;
    case 'background':
      return `لون الخلفية ${a.color}`;
    case 'add_text':
      return typeof a.text === 'string' && a.text.trim() ? `إضافة نص "${a.text.slice(0, 30)}" عند ${formatTime(num(a.start, 0, 1e5, 0))}` : null;
    case 'delete_texts':
      return `حذف ${targetText(a.texts, 'النصوص')}`;
    case 'generate_captions':
      return `توليد كابشن تلقائي بنمط "${label(CAPTION_STYLES, a.style) ?? label(CAPTION_STYLES, 'hormozi')}"`;
    case 'caption_style':
      return known(CAPTION_STYLES, a.style) ? `نمط الكابشن: ${label(CAPTION_STYLES, a.style)}` : null;
    case 'caption_position':
      return `مكان الكابشن: ${num(a.y, 0, 1, 0.7) < 0.35 ? 'أعلى' : num(a.y, 0, 1, 0.7) < 0.65 ? 'الوسط' : 'أسفل'}`;
    case 'caption_size':
      return `حجم الكابشن ${num(a.percent, 50, 200, 100)}%`;
    case 'caption_emoji':
      return a.on ? 'إضافة إيموجي للكابشن' : 'إزالة إيموجي الكابشن';
    case 'delete_captions':
      return 'حذف كل الكابشن';
    case 'remove_silence':
      return `حذف الصمت من ${clips}`;
    case 'mask':
      return a.shape === null ? `إزالة القناع من ${clips}` : known(MASKS, a.shape) ? `قناع "${label(MASKS, a.shape)}" على ${clips}` : null;
    case 'chroma': {
      const target = a.pips ? targetText(a.pips, 'الفيديو فوق الفيديو') : clips;
      return a.off ? `إلغاء إزالة اللون من ${target}` : `إزالة اللون ${a.color ?? '#00ff00'} (شاشة خضراء) من ${target}`;
    }
    case 'freeze':
      return `تجميد الإطار عند ${formatTime(num(a.time, 0, 1e5, 0), true)} لمدة ${num(a.seconds, 0.5, 10, 2)} ث`;
    case 'reverse':
      return `عكس ${clips}`;
    case 'voice_effect': {
      if (!known(VOICE_EFFECTS, a.effect)) return null;
      const target = a.clips ? `صوت ${targetText(a.clips, 'المقاطع')}` : targetText(a.audios, 'المسارات الصوتية');
      return `تأثير "${label(VOICE_EFFECTS, a.effect)}" على ${target}`;
    }
    case 'beat_sync':
      return `قص المقاطع على إيقاع المسار الصوتي ${a.audio}${num(a.every, 1, 4, 1) > 1 ? ` (كل ${num(a.every, 1, 4, 1)} نبضات)` : ''}`;
    case 'add_media':
      return `إضافة الملف ${a.media} من الوسائط`;
    case 'add_pip':
      return `إضافة الملف ${a.media} كفيديو فوق الفيديو`;
    case 'pip':
      return `تعديل ${targetText(a.pips, 'الفيديو فوق الفيديو')}`;
    case 'delete_pip':
      return `حذف ${targetText(a.pips, 'الفيديو فوق الفيديو')}`;
    case 'seek':
      return `الانتقال إلى ${formatTime(num(a.time, 0, 1e5, 0))}`;
    case 'play':
      return 'تشغيل';
    case 'export':
      return 'فتح نافذة التصدير';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- applying

/** Removes [a, b) from the timeline and closes the gap; texts and overlays after it move back. */
export function rippleDelete(p: Project, assets: Map<string, MediaAsset>, a: number, b: number): Project {
  const layout = layoutMainTrack(p.clips, assets);
  const clips: MainClip[] = [];
  for (const lc of layout) {
    if (lc.end <= a || lc.start >= b) {
      clips.push(lc.clip);
      continue;
    }
    if (a - lc.start >= MIN_CLIP_DURATION) {
      const parts = splitMainClip(lc, a);
      if (parts) clips.push(parts[0]);
    }
    if (lc.end - b >= MIN_CLIP_DURATION) {
      const parts = splitMainClip(lc, b);
      if (parts) clips.push(clips.length && clips[clips.length - 1].id === lc.clip.id ? parts[1] : { ...parts[1], transition: lc.clip.transition });
    }
  }
  const gap = b - a;
  const shift = (t: number) => (t >= b ? t - gap : t > a ? a : t);
  const texts: TextClip[] = [];
  for (const t of p.texts) {
    const start = shift(t.start);
    const end = shift(t.start + t.duration);
    if (end - start < MIN_CLIP_DURATION) continue;
    if (t.words?.length) {
      const words = t.words.filter((w) => w.start < a || w.start >= b).map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) }));
      if (!words.length) continue;
      texts.push({ ...t, start, duration: end - start, words, text: words.map((w) => w.text).join(' ') });
    } else texts.push({ ...t, start, duration: end - start });
  }
  const moveStart = <T extends { start: number }>(x: T): T => (x.start >= b ? { ...x, start: x.start - gap } : x.start > a ? { ...x, start: a } : x);
  return {
    ...p,
    clips,
    texts,
    overlays: p.overlays.map(moveStart),
    audios: p.audios.map(moveStart),
  };
}

export interface ExecuteResult {
  project: Project;
  seek?: number;
  play?: boolean;
  export?: boolean;
  /** Steps that could not be done, explained in Arabic. */
  notes: string[];
}

export interface ExecuteHooks {
  onStatus: (message: string, progress: number | null) => void;
  /** Adds a generated file (reversed video, processed audio) to the media library. */
  registerAsset: (file: File) => Promise<MediaAsset>;
  /** Stores changed asset data (e.g. detected beats). */
  saveAsset: (asset: MediaAsset) => void;
}

const COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Applies the actions to a copy of the project. Clip numbers and times refer to the
 * project before the command, so structural edits run last, from the end backwards.
 */
export async function executeActions(
  start: Project,
  initialAssets: Map<string, MediaAsset>,
  library: MediaAsset[],
  actions: EditAction[],
  hooks: ExecuteHooks
): Promise<ExecuteResult> {
  const { onStatus } = hooks;
  // Grows as commands create files, so layouts see the new assets.
  const assets = new Map(initialAssets);
  const register = async (file: File) => {
    const asset = await hooks.registerAsset(file);
    assets.set(asset.id, asset);
    return asset;
  };
  const layout0 = layoutMainTrack(start.clips, assets);
  const clipIds = (t: ClipTarget | undefined): Set<string> => {
    if (t === 'all') return new Set(layout0.map((l) => l.clip.id));
    const list = Array.isArray(t) ? t : typeof t === 'number' ? [t] : [];
    return new Set(list.map((n) => layout0[Number(n) - 1]?.clip.id).filter(Boolean) as string[]);
  };
  const audioIds = (t: ClipTarget | undefined) =>
    new Set(t === 'all' ? start.audios.map((a) => a.id) : (Array.isArray(t) ? t : []).map((n) => start.audios[Number(n) - 1]?.id).filter(Boolean));
  const pipIds = (t: ClipTarget | undefined) =>
    new Set(t === 'all' ? start.overlays.map((o) => o.id) : (Array.isArray(t) ? t : []).map((n) => start.overlays[Number(n) - 1]?.id).filter(Boolean));
  const media = (n: unknown) => library[Number(n) - 1] as MediaAsset | undefined;
  const plainTexts0 = start.texts.filter((t) => !isCaption(t));
  const result: ExecuteResult = { project: start, notes: [] };
  const note = (msg: string) => result.notes.push(msg);
  let p = start;
  const editClips = (t: ClipTarget | undefined, fn: (c: MainClip) => MainClip) => {
    const ids = clipIds(t);
    p = { ...p, clips: p.clips.map((c) => (ids.has(c.id) ? fn(c) : c)) };
  };
  const editPips = (t: ClipTarget | undefined, fn: (o: OverlayClip) => OverlayClip) => {
    const ids = pipIds(t);
    p = { ...p, overlays: p.overlays.map((o) => (ids.has(o.id) ? fn(o) : o)) };
  };
  const chromaFrom = (a: Extract<EditAction, { op: 'chroma' }>, old: ChromaKey | null): ChromaKey | null =>
    a.off
      ? null
      : {
          color: typeof a.color === 'string' && COLOR.test(a.color) ? a.color : old?.color ?? '#00ff00',
          similarity: num(a.similarity, 0, 1, old?.similarity ?? 0.4),
          smoothness: num(a.smoothness, 0, 1, old?.smoothness ?? 0.2),
        };
  const editCaptions = (fn: (t: TextClip) => TextClip) => {
    p = { ...p, texts: p.texts.map((t) => (isCaption(t) ? fn(t) : t)) };
  };

  // 1. Property edits, in the order asked.
  for (const a of actions) {
    switch (a.op) {
      case 'speed': {
        const speed = num(a.speed, 0.25, 4, 1);
        editClips(a.clips, (c) => ({ ...c, speed, freeze: null }));
        break;
      }
      case 'clip_volume':
        editClips(a.clips, (c) => ({ ...c, volume: a.volume === undefined ? c.volume : num(a.volume, 0, 1, c.volume), muted: a.muted ?? (a.volume === 0 ? true : a.volume !== undefined ? false : c.muted) }));
        break;
      case 'audio_volume': {
        const ids = audioIds(a.audios);
        p = {
          ...p,
          audios: p.audios.map((x) => {
            if (!ids.has(x.id)) return x;
            const len = x.outPoint - x.inPoint;
            return {
              ...x,
              volume: a.volume === undefined ? x.volume : num(a.volume, 0, 1, x.volume),
              fadeIn: a.fade_in === undefined ? x.fadeIn : num(a.fade_in, 0, len / 2, 0),
              fadeOut: a.fade_out === undefined ? x.fadeOut : num(a.fade_out, 0, len / 2, 0),
            };
          }),
        };
        break;
      }
      case 'filter':
        if (known(FILTER_PRESETS, a.filter)) editClips(a.clips, (c) => ({ ...c, filterId: a.filter, adjust: presetAdjustments(a.filter) }));
        break;
      case 'adjust':
        editClips(a.clips, (c) => ({
          ...c,
          adjust: {
            ...c.adjust,
            brightness: optNum(a.brightness, 0, 200) ?? c.adjust.brightness,
            contrast: optNum(a.contrast, 0, 200) ?? c.adjust.contrast,
            saturation: optNum(a.saturation, 0, 200) ?? c.adjust.saturation,
            warmth: optNum(a.warmth, -100, 100) ?? c.adjust.warmth,
            vignette: optNum(a.vignette, 0, 100) ?? c.adjust.vignette,
            blur: optNum(a.blur, 0, 10) ?? c.adjust.blur,
          },
        }));
        break;
      case 'transition':
        if (known(TRANSITIONS, a.type)) {
          const duration = num(a.duration, 0.2, 2, 0.6);
          const first = layout0[0]?.clip.id;
          editClips(a.cuts, (c) => (c.id === first ? c : { ...c, transition: { type: a.type as TransitionType, duration } }));
        }
        break;
      case 'clip_anim': {
        const duration = num(a.duration, 0.2, 2, 0.5);
        editClips(a.clips, (c) => ({
          ...c,
          animIn: known(CLIP_ANIMS, a.in) ? { type: a.in as MainClip['animIn']['type'], duration } : c.animIn,
          animOut: known(CLIP_ANIMS, a.out) ? { type: a.out as MainClip['animOut']['type'], duration } : c.animOut,
        }));
        break;
      }
      case 'effect':
        if (a.effect === null) editClips(a.clips, (c) => ({ ...c, effect: null }));
        else if (known(EFFECTS, a.effect))
          editClips(a.clips, (c) => ({ ...c, effect: { type: a.effect as NonNullable<MainClip['effect']>['type'], intensity: num(a.intensity, 0.1, 1, 0.6) } }));
        break;
      case 'motion':
        if (a.preset === null) editClips(a.clips, (c) => ({ ...c, motion: null }));
        else if (known(MOTION_PRESETS, a.preset)) editClips(a.clips, (c) => ({ ...c, motion: motionFromPreset(c, a.preset as string) }));
        break;
      case 'speed_curve':
        if (a.curve === null || known(SPEED_CURVES, a.curve)) editClips(a.clips, (c) => ({ ...c, speedCurve: a.curve, freeze: null }));
        break;
      case 'transform':
        editClips(a.clips, (c) => ({
          ...c,
          zoom: optNum(a.zoom, 0.2, 5) ?? c.zoom,
          rotation: optNum(a.rotation, -360, 360) ?? c.rotation,
          fit: a.fit === 'cover' || a.fit === 'contain' ? a.fit : c.fit,
          flipH: typeof a.flip_h === 'boolean' ? a.flip_h : c.flipH,
          flipV: typeof a.flip_v === 'boolean' ? a.flip_v : c.flipV,
          motion: null,
        }));
        break;
      case 'aspect':
        if (a.aspect in ASPECT_SIZES) p = { ...p, aspect: a.aspect as AspectRatio };
        break;
      case 'background':
        if (/^#[0-9a-f]{6}$/i.test(a.color)) p = { ...p, background: a.color };
        break;
      case 'add_text': {
        if (typeof a.text !== 'string' || !a.text.trim()) break;
        const preset = TEXT_PRESETS.find((x) => x.id === a.preset) ?? TEXT_PRESETS[0];
        const text: TextClip = {
          ...preset.style,
          id: uid(),
          text: a.text.slice(0, 200),
          start: num(a.start, 0, 1e5, 0),
          duration: num(a.duration, 0.3, 600, 3),
          x: 0.5,
          y: optNum(a.y, 0.05, 0.95) ?? preset.style.y,
          rotation: 0,
        };
        if (typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color)) text.color = a.color;
        p = { ...p, texts: [...p.texts, text] };
        break;
      }
      case 'delete_texts': {
        const ids = new Set(a.texts === 'all' ? plainTexts0.map((t) => t.id) : (Array.isArray(a.texts) ? a.texts : []).map((n) => plainTexts0[Number(n) - 1]?.id));
        p = { ...p, texts: p.texts.filter((t) => !ids.has(t.id)) };
        break;
      }
      case 'mask':
        if (a.shape === null) editClips(a.clips, (c) => ({ ...c, mask: null }));
        else if (known(MASKS, a.shape)) editClips(a.clips, (c) => ({ ...c, mask: { shape: a.shape as MaskShape, size: num(a.size, 0.1, 1.5, c.mask?.size ?? 0.8) } }));
        break;
      case 'chroma':
        if (a.pips) editPips(a.pips, (o) => ({ ...o, chroma: chromaFrom(a, o.chroma) }));
        if (a.clips) editClips(a.clips, (c) => ({ ...c, chroma: chromaFrom(a, c.chroma) }));
        break;
      case 'add_pip': {
        const asset = media(a.media);
        if (!asset || asset.kind === 'audio') {
          note('لم أجد صورة أو فيديو بهذا الرقم في الوسائط.');
          break;
        }
        const o = createOverlayClip(asset, num(a.start, 0, 1e5, 0));
        o.x = num(a.x, 0, 1, o.x);
        o.y = num(a.y, 0, 1, o.y);
        o.scale = num(a.scale, 0.05, 1.5, o.scale);
        if (a.shape === 'rect' || a.shape === 'rounded' || a.shape === 'circle') o.shape = a.shape;
        if (a.chroma) o.chroma = { color: typeof a.chroma === 'string' && COLOR.test(a.chroma) ? a.chroma : '#00ff00', similarity: 0.4, smoothness: 0.2 };
        p = { ...p, overlays: [...p.overlays, o] };
        break;
      }
      case 'pip':
        editPips(a.pips, (o) => ({
          ...o,
          start: optNum(a.start, 0, 1e5) ?? o.start,
          x: optNum(a.x, 0, 1) ?? o.x,
          y: optNum(a.y, 0, 1) ?? o.y,
          scale: optNum(a.scale, 0.05, 1.5) ?? o.scale,
          rotation: optNum(a.rotation, -360, 360) ?? o.rotation,
          opacity: optNum(a.opacity, 0, 1) ?? o.opacity,
          shape: a.shape === 'rect' || a.shape === 'rounded' || a.shape === 'circle' ? a.shape : o.shape,
          blend: known(BLEND_MODES, a.blend) ? (a.blend as BlendMode) : o.blend,
          animIn: known(OVERLAY_ANIMS, a.anim_in) ? (a.anim_in as OverlayAnim) : o.animIn,
          animOut: known(OVERLAY_ANIMS, a.anim_out) ? (a.anim_out as OverlayAnim) : o.animOut,
          flipH: typeof a.flip_h === 'boolean' ? a.flip_h : o.flipH,
          volume: optNum(a.volume, 0, 1) ?? o.volume,
          muted: typeof a.muted === 'boolean' ? a.muted : o.muted,
        }));
        break;
      case 'delete_pip': {
        const ids = pipIds(a.pips);
        p = { ...p, overlays: p.overlays.filter((o) => !ids.has(o.id)) };
        break;
      }
      case 'seek':
        result.seek = num(a.time, 0, 1e5, 0);
        break;
      case 'play':
        result.play = true;
        break;
      case 'export':
        result.export = true;
        break;
    }
  }

  // 2. Splits, then 3. ripple deletes and freeze frames from the end backwards so earlier times stay valid.
  for (const a of actions) {
    if (a.op !== 'split') continue;
    const t = num(a.time, 0, 1e5, 0);
    const lc = layoutMainTrack(p.clips, assets).find((l) => t > l.start && t < l.end);
    const parts = lc && splitMainClip(lc, t);
    if (parts) p = { ...p, clips: p.clips.flatMap((c) => (c.id === lc.clip.id ? parts : [c])) };
  }
  const timed = actions
    .flatMap((a) =>
      a.op === 'delete_range'
        ? [{ at: num(a.start, 0, 1e5, 0), end: num(a.end, 0, 1e5, 0), freeze: 0 }]
        : a.op === 'freeze'
          ? [{ at: num(a.time, 0, 1e5, 0), end: 0, freeze: num(a.seconds, 0.5, 10, 2) }]
          : []
    )
    .filter((x) => x.freeze || x.end - x.at > 0.05)
    .sort((x, y) => y.at - x.at);
  for (const x of timed) {
    if (!x.freeze) {
      p = rippleDelete(p, assets, x.at, x.end);
      continue;
    }
    const layout = layoutMainTrack(p.clips, assets);
    const lc = layout.find((l) => x.at >= l.start && x.at < l.end) ?? layout[layout.length - 1];
    if (!lc) continue;
    p = { ...p, clips: insertFreeze(p.clips, lc, clamp(x.at, lc.start, lc.end), x.freeze).clips };
    // Everything after the frozen moment moves later.
    const push = <T extends { start: number }>(o: T): T => (o.start >= x.at ? { ...o, start: o.start + x.freeze } : o);
    p = { ...p, texts: p.texts.map((t) => (t.start >= x.at && t.words ? { ...push(t), words: t.words.map((w) => ({ ...w, start: w.start + x.freeze, end: w.end + x.freeze })) } : push(t))), overlays: p.overlays.map(push) };
  }

  // 4. Clip list changes, by id so earlier steps don't shift them.
  for (const a of actions) {
    if (a.op === 'delete_clip') {
      const ids = clipIds(a.clips);
      p = { ...p, clips: p.clips.filter((c) => !ids.has(c.id)) };
    } else if (a.op === 'duplicate_clip') {
      const id = layout0[Number(a.clip) - 1]?.clip.id;
      p = { ...p, clips: p.clips.flatMap((c) => (c.id === id ? [c, { ...c, id: uid() }] : [c])) };
    } else if (a.op === 'move_clip') {
      const id = layout0[Number(a.clip) - 1]?.clip.id;
      const from = p.clips.findIndex((c) => c.id === id);
      if (from < 0) continue;
      const clips = [...p.clips];
      const [moved] = clips.splice(from, 1);
      clips.splice(clamp(Math.round(Number(a.to)) - 1 || 0, 0, clips.length), 0, moved);
      p = { ...p, clips };
    } else if (a.op === 'add_media') {
      const asset = media(a.media);
      if (!asset) {
        note('لم أجد ملفاً بهذا الرقم في الوسائط.');
        continue;
      }
      if (asset.kind === 'audio') {
        p = { ...p, audios: [...p.audios, createAudioClip(asset, typeof a.at === 'number' ? Math.max(0, a.at) : 0)] };
        continue;
      }
      const clip = createMainClip(asset);
      const clips = [...p.clips];
      if (a.at === 'start') clips.unshift(clip);
      else if (typeof a.at === 'number' || a.at === 'playhead') {
        const t = typeof a.at === 'number' ? a.at : result.seek ?? 0;
        const hit = layoutMainTrack(p.clips, assets).find((l) => t >= l.start && t < l.end);
        clips.splice(hit ? hit.index + 1 : clips.length, 0, clip);
      } else clips.push(clip);
      p = { ...p, clips };
    }
  }

  // 5. Silence removal (decodes audio, so it is slow).
  const silenceIds = new Set(actions.flatMap((a) => (a.op === 'remove_silence' ? [...clipIds(a.clips)] : [])));
  if (silenceIds.size) {
    onStatus('جاري البحث عن الصمت...', null);
    const clips: MainClip[] = [];
    for (const c of p.clips) {
      const asset = assets.get(c.assetId);
      if (!silenceIds.has(c.id) || !asset || asset.kind !== 'video' || !asset.hasAudio || c.freeze) {
        clips.push(c);
        continue;
      }
      const ranges = await findSpeechRanges(asset, c.inPoint, c.outPoint);
      clips.push(...(ranges.length ? clipsFromRanges(c, ranges) : [c]));
    }
    p = { ...p, clips };
  }

  // Reverse: renders each clip's range backwards into a new file.
  const reverseIds = new Set(actions.flatMap((a) => (a.op === 'reverse' ? [...clipIds(a.clips)] : [])));
  for (const id of reverseIds) {
    const c = p.clips.find((x) => x.id === id);
    const asset = c && assets.get(c.assetId);
    if (!c || !asset || asset.kind !== 'video') continue;
    if (c.outPoint - c.inPoint > MAX_REVERSE_SECONDS) {
      note(`عكس الفيديو يعمل على مقاطع حتى ${MAX_REVERSE_SECONDS} ثانية.`);
      continue;
    }
    const file = await reverseVideo(asset.file, c.inPoint, c.outPoint, asset.hasAudio, (pr) => onStatus(`جاري عكس المقطع... ${Math.round(pr * 100)}%`, pr));
    const reversed = await register(file);
    p = { ...p, clips: p.clips.map((x) => (x.id === id ? { ...x, assetId: reversed.id, inPoint: 0, outPoint: reversed.duration, speedCurve: null, freeze: null } : x)) };
  }

  // Beat sync: cut the main track on the music's beats.
  for (const a of actions) {
    if (a.op !== 'beat_sync') continue;
    // Existing tracks keep their numbers; tracks added by this command follow them.
    const track = p.audios[Number(a.audio) - 1];
    let asset = track && assets.get(track.assetId);
    if (!track || !asset) {
      note('لم أجد المسار الصوتي المطلوب للمزامنة مع الإيقاع.');
      continue;
    }
    if (!asset.beats) {
      onStatus('جاري تحليل الإيقاع...', null);
      asset = { ...asset, beats: await detectBeats(asset.file) };
      assets.set(asset.id, asset);
      hooks.saveAsset(asset);
    }
    if (!asset.beats?.length) {
      note('لم أجد إيقاعاً واضحاً في هذا الصوت.');
      continue;
    }
    p = { ...p, clips: retimeToCuts(p.clips, assets, beatCuts(track, asset.beats, Math.round(num(a.every, 1, 4, 1)))) };
  }

  // Voice effects (after beat sync, so detached sound matches the final cut): on audio tracks, or on a video clip's sound after detaching it to a track.
  for (const a of actions) {
    if (a.op !== 'voice_effect' || !known(VOICE_EFFECTS, a.effect)) continue;
    const effect = a.effect as VoiceEffect;
    const targets = new Set(audioIds(a.audios));
    if (a.clips) {
      const ids = clipIds(a.clips);
      const detached: AudioClip[] = [];
      const detachedFrom = new Set<string>();
      for (const lc of layoutMainTrack(p.clips, assets)) {
        if (!ids.has(lc.clip.id) || lc.asset.kind !== 'video' || !lc.asset.hasAudio) continue;
        if (lc.clip.speed !== 1 || lc.clip.speedCurve || lc.clip.freeze) {
          note('تأثيرات الصوت على الفيديو تعمل على المقاطع بسرعتها الأصلية.');
          continue;
        }
        const track: AudioClip = { ...createAudioClip(lc.asset, lc.start), inPoint: lc.clip.inPoint, outPoint: lc.clip.outPoint, volume: lc.clip.volume };
        detached.push(track);
        detachedFrom.add(lc.clip.id);
        targets.add(track.id);
      }
      p = { ...p, clips: p.clips.map((c) => (detachedFrom.has(c.id) ? { ...c, muted: true } : c)), audios: [...p.audios, ...detached] };
    }
    const label = VOICE_EFFECTS.find((v) => v.id === effect)!.label;
    for (const id of targets) {
      const track = p.audios.find((x) => x.id === id);
      const asset = track && assets.get(track.assetId);
      if (!track || !asset) continue;
      onStatus(`جاري تطبيق "${label}" على الصوت...`, null);
      const buffer = await applyVoiceEffect(asset.file, track.inPoint, track.outPoint, effect);
      const processed = await register(encodeWav(buffer, `${asset.name.replace(/\.[^.]+$/, '')} - ${label}.wav`));
      p = { ...p, audios: p.audios.map((x) => (x.id === id ? { ...x, assetId: processed.id, inPoint: 0, outPoint: processed.duration } : x)) };
    }
  }

  // 6. Captions: delete, generate on the final cut, then restyle.
  if (actions.some((a) => a.op === 'delete_captions')) p = { ...p, texts: p.texts.filter((t) => !isCaption(t)) };
  const gen = actions.find((a): a is Extract<EditAction, { op: 'generate_captions' }> => a.op === 'generate_captions');
  if (gen) {
    const style = known(CAPTION_STYLES, gen.style) ? gen.style : 'hormozi';
    const layout: LaidOutClip[] = layoutMainTrack(p.clips, assets);
    const captions = await generateCaptions(layout, Math.round(num(gen.words_per_line, 1, 8, 3)), style, !!gen.emoji, (pr: CaptionProgress) =>
      pr.stage === 'upload'
        ? onStatus(`جاري رفع الصوت ${pr.percent}%`, ((pr.clip - 1) + pr.percent / 200) / pr.clips)
        : onStatus('جاري التفريغ بالذكاء الاصطناعي...', ((pr.clip - 1) + 0.75) / pr.clips)
    );
    // Regenerating replaces old captions instead of stacking a second set.
    p = { ...p, texts: [...p.texts.filter((t) => !isCaption(t)), ...captions] };
  }
  for (const a of actions) {
    if (a.op === 'caption_style' && known(CAPTION_STYLES, a.style)) editCaptions((t) => ({ ...t, ...captionStyleFields(a.style) }));
    else if (a.op === 'caption_position') editCaptions((t) => ({ ...t, y: num(a.y, 0.05, 0.95, t.y) }));
    else if (a.op === 'caption_size')
      editCaptions((t) => ({ ...t, fontSize: Math.round(((CAPTION_STYLES.find((c) => c.id === t.captionStyle)?.fontSize ?? 80) * num(a.percent, 50, 200, 100)) / 100) }));
    else if (a.op === 'caption_emoji') editCaptions((t) => ({ ...t, emoji: a.on ? emojiFor(t.words ?? []) : undefined }));
  }

  result.project = p;
  return result;
}

import { AUTO_STYLES, AutoEditBrief, AutoEditPlan, PlanBeat, PlanBroll, PlanSegment, PlanText, REVIEW_BLOCKED_OPS, ReviewResult } from './autoEditSpec';
import { detectBeats } from './audioTools';
import { EditAction } from './commandSpec';
import { connectionError, waitForJob } from './jobs';
import { ExecuteHooks, commandContext, executeActions } from './commands';
import { exportProject } from './exporter';
import { ASPECT_SIZES, CAPTION_STYLES, FILTER_PRESETS, MAX_IMAGE_DURATION, TEXT_PRESETS, TRANSITIONS, presetAdjustments } from './constants';
import { isProFx, newFxLayer } from './proFxCatalog';
import { fileSpeech, fitToSpeech } from './silence';
import { SFX_LIST, freesoundFile, searchFreesound } from './sfx';
import { TEXT_TEMPLATES, templateTexts } from './textTemplates';
import { beatCuts, createAudioClip, createMainClip, createOverlayClip, layoutMainTrack, overlayEnd, retimeToCuts, uid } from './timeline';
import { TTS_STYLES, TTS_VOICES } from './tts';
import { AspectRatio, AudioClip, MainClip, MediaAsset, OverlayClip, Project, TextClip, TransitionType } from './types';

/** Most footage one auto edit analyses, in seconds. */
export const MAX_AUTO_FOOTAGE = 10 * 60;

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const known = (list: { id: string }[], id: unknown): id is string => typeof id === 'string' && list.some((x) => x.id === id);

/** A spoken sentence of a file, from its transcript. Ids are "file.sentence", both from 1. */
export interface Sentence {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
}

type Word = NonNullable<MediaAsset['transcript']>[number];

/** Splits a transcript into sentences: at end punctuation, at pauses, or every ~20 words. */
export function sentencesOf(asset: MediaAsset, n: number): Sentence[] {
  const words = asset.transcript ?? [];
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ id: `${n}.${out.length + 1}`, start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' '), words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (/[.!?؟…]["»]?$/.test(w.text) || !next || next.start - w.end >= 0.7 || cur.length >= 20) flush();
  });
  flush();
  return out;
}

/** True when a video is mainly someone talking (enough transcribed speech for its length). */
export function isTalking(asset: MediaAsset): boolean {
  const words = asset.transcript ?? [];
  if (asset.kind !== 'video' || words.length < 15) return false;
  const spoken = words.reduce((sum, w) => sum + Math.max(0, w.end - w.start), 0);
  return spoken / Math.max(1, asset.duration) >= 0.25;
}

/** The library as the planner sees it: what each file is and, for analysed videos, what is in it. */
export function materialsContext(library: MediaAsset[]) {
  return library.map((a, i) => ({
    n: i + 1,
    type: a.kind,
    name: a.name.slice(0, 50),
    duration: a.kind === 'image' ? undefined : r2(a.duration),
    orientation: a.kind === 'audio' ? undefined : a.width > a.height * 1.1 ? 'landscape' : a.height > a.width * 1.1 ? 'portrait' : 'square',
    has_sound: a.kind === 'video' ? a.hasAudio : undefined,
    talking: isTalking(a) || undefined,
    speech: a.transcript?.length ? sentencesOf(a, i + 1).slice(0, 400).map((x) => ({ id: x.id, start: r2(x.start), end: r2(x.end), text: x.text })) : undefined,
    vision: a.analysis
      ? {
          summary: a.analysis.summary,
          scenes: a.analysis.scenes.slice(0, 50).map((s) => ({ start: r2(s.start), end: r2(s.end), what: s.description, quality: s.quality, interest: s.interest })),
          events: a.analysis.events.slice(0, 40).map((e) => ({ time: r2(e.time), what: e.label, kind: e.kind })),
          highlights: a.analysis.highlights.map((h) => ({ start: r2(h.start), end: r2(h.end), title: h.title, score: h.score })),
        }
      : undefined,
  }));
}

/** Asks the AI for a plan, or for a revised one when `previous` and `feedback` are given. */
export async function requestPlan(brief: AutoEditBrief, library: MediaAsset[], previous?: AutoEditPlan, feedback?: string): Promise<AutoEditPlan> {
  const style = AUTO_STYLES.find((s) => s.id === brief.style);
  const body = JSON.stringify({
    brief: { ...brief, style: style ? `${style.id}: ${style.hint}` : brief.style },
    materials: materialsContext(library),
    previous,
    feedback,
  });
  let res: Response | null = null;
  // Starting the job is quick; retry it once if the network blinks.
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    res = await fetch('/api/auto-edit/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => null);
    if (!res && attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!res) throw await connectionError();
  if (res.status === 404 || res.status === 405) throw new Error('المونتاج التلقائي يعمل على الموقع الكامل فقط.');
  if (res.status === 503) throw new Error('المونتاج التلقائي يحتاج مفتاح OpenRouter في إعدادات الخادم.');
  if (res.status === 429) throw new Error('طلبات كثيرة. انتظر دقيقة ثم حاول.');
  if (!res.ok) throw new Error('تعذر إعداد الخطة الآن. حاول مرة أخرى.');
  const data = await res.json();
  const raw = res.status === 202 && data.job ? await waitForJob(data.job) : data;
  const plan = validatePlan(raw, brief, library);
  if (!(plan.mode === 'talking' ? plan.beats.length : plan.segments.length))
    throw new Error('لم يتمكن الذكاء الاصطناعي من اختيار مشاهد من ملفاتك. أضف فيديوهات أو صوراً وحاول مرة أخرى.');
  return plan;
}

function planText(v: unknown): PlanText | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { template?: unknown; texts?: unknown };
  if (!known(TEXT_TEMPLATES, o.template)) return null;
  return { template: o.template, texts: Array.isArray(o.texts) ? o.texts.map((t) => str(t, 120)).filter(Boolean).slice(0, 4) : [] };
}

/** Finds a sentence by its id ("2.14"). */
function sentenceById(id: unknown, library: MediaAsset[]): Sentence | null {
  const m = typeof id === 'string' ? /^(\d+)\.(\d+)$/.exec(id.trim()) : null;
  if (!m) return null;
  const asset = library[Number(m[1]) - 1];
  return asset?.transcript?.length ? sentencesOf(asset, Number(m[1]))[Number(m[2]) - 1] ?? null : null;
}

/** Keeps only what can be built: real files, times inside them, known ids, one voice at a time. */
export function validatePlan(raw: unknown, brief: AutoEditBrief, library: MediaAsset[]): AutoEditPlan {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const segments: PlanSegment[] = [];
  for (const s of Array.isArray(p.segments) ? p.segments.slice(0, 80) : []) {
    const asset = library[Math.round(num(s?.media, 0)) - 1];
    if (!asset || asset.kind === 'audio') continue;
    let start = Math.max(0, num(s.start, 0));
    let end = num(s.end, start + 3);
    if (asset.kind === 'image') {
      end = clamp(end - start, 0.5, 15);
      start = 0;
    } else {
      end = Math.min(asset.duration, end);
      if (end - start < 0.3) continue;
    }
    segments.push({
      media: Math.round(num(s.media, 0)),
      start,
      end,
      why: str(s.why, 200),
      text: str(s.text, 80) || undefined,
      effect: isProFx(s.effect) ? s.effect : undefined,
      speed: clamp(num(s.speed, 1), 0.5, 2),
    });
  }
  // Beats: whole sentences of one file each; a beat mixing files is split where the file changes
  // (the on-screen title stays with its first part).
  const beats: PlanBeat[] = [];
  for (const b of Array.isArray(p.beats) ? p.beats.slice(0, 60) : []) {
    const ids: string[] = (Array.isArray(b?.sentences) ? b.sentences : []).filter((id: unknown) => sentenceById(id, library)).slice(0, 30);
    const runs: string[][] = [];
    for (const id of ids) {
      const run = runs[runs.length - 1];
      if (run && run[0].split('.')[0] === id.split('.')[0]) run.push(id);
      else runs.push([id]);
    }
    runs.forEach((run, i) => beats.push({ sentences: run, why: str(b.why, 200), text: i === 0 ? str(b.text, 60) || undefined : undefined }));
  }
  const visual = (n: unknown) => ['video', 'image'].includes(library[Math.round(num(n, 0)) - 1]?.kind ?? '');
  const broll: PlanBroll[] = [];
  for (const x of Array.isArray(p.broll) ? p.broll.slice(0, 40) : []) {
    const over = Math.round(num(x?.over, 0));
    if (over < 1 || over > beats.length || !visual(x.media)) continue;
    const asset = library[Math.round(num(x.media, 0)) - 1];
    const start = asset.kind === 'image' ? 0 : clamp(num(x.start, 0), 0, Math.max(0, asset.duration - 0.5));
    const end = asset.kind === 'image' ? clamp(num(x.end, 2.5) - num(x.start, 0), 1, 5) : clamp(num(x.end, start + 2.5), start + 0.5, asset.duration);
    broll.push({ over, media: Math.round(num(x.media, 0)), start, end, why: str(x.why, 200) });
  }
  const voice = p.voiceover && typeof p.voiceover === 'object' && brief.voiceover && str(p.voiceover.script, 2000) ? p.voiceover : null;
  // Talking mode needs its beats; a voice-over means the edit is built from the pictures.
  const mode: AutoEditPlan['mode'] = p.mode === 'talking' && beats.length && !voice ? 'talking' : segments.length ? 'visual' : beats.length && !voice ? 'talking' : 'visual';
  const audio = (n: unknown) => library[Math.round(num(n, 0)) - 1]?.kind === 'audio';
  const music = p.music && typeof p.music === 'object' && brief.music !== 'none' ? p.music : null;
  return {
    title: str(p.title, 100) || 'مونتاج',
    idea: str(p.idea, 600),
    hook: str(p.hook, 300),
    mode,
    beats: mode === 'talking' ? beats : [],
    broll: mode === 'talking' ? broll : [],
    segments: mode === 'visual' ? segments : [],
    transition: known(TRANSITIONS, p.transition) ? p.transition : mode === 'talking' ? 'none' : 'fade',
    filter: known(FILTER_PRESETS, p.filter) ? p.filter : null,
    text_preset: known(TEXT_PRESETS, p.text_preset) ? p.text_preset : TEXT_PRESETS[0].id,
    // Never two voices at once.
    original_audio: mode === 'talking' ? 'keep' : voice || p.original_audio === 'mute' ? 'mute' : 'keep',
    captions: {
      on: brief.captions && (mode === 'talking' || !!p.captions?.on),
      style: known(CAPTION_STYLES, p.captions?.style) ? p.captions.style : 'hormozi',
    },
    opening: planText(p.opening),
    ending: planText(p.ending),
    voiceover: voice && mode === 'visual'
      ? { script: str(voice.script, 2000), voice: known(TTS_VOICES, voice.voice) ? voice.voice : TTS_VOICES[0].id, style: known(TTS_STYLES, voice.style) ? voice.style : TTS_STYLES[0].id }
      : null,
    music: music
      ? audio(music.media)
        ? { media: Math.round(num(music.media, 0)), volume: clamp(num(music.volume, 0.3), 0.05, 1) }
        : brief.music === 'search' && str(music.query, 80)
          ? { query: str(music.query, 80), volume: clamp(num(music.volume, 0.3), 0.05, 1) }
          : null
      : null,
    sfx_on_cuts: known(SFX_LIST, p.sfx_on_cuts) ? p.sfx_on_cuts : null,
    publish: {
      caption: str(p.publish?.caption, 500),
      hashtags: Array.isArray(p.publish?.hashtags) ? p.publish.hashtags.map((h: unknown) => str(h, 40)).filter(Boolean).slice(0, 15) : [],
    },
  };
}

/** The sentences of a beat, in order. */
export function beatSentences(beat: PlanBeat, library: MediaAsset[]): Sentence[] {
  return beat.sentences.map((id) => sentenceById(id, library)).filter((x): x is Sentence => !!x);
}

/** Seconds the finished video lasts (before pauses are tightened). */
export function planDuration(plan: AutoEditPlan, library: MediaAsset[] = []) {
  if (plan.mode === 'talking') return plan.beats.reduce((sum, b) => sum + beatSentences(b, library).reduce((t, x) => t + (x.end - x.start), 0), 0);
  return plan.segments.reduce((sum, s) => sum + (s.end - s.start) / (s.speed ?? 1), 0);
}

const templateClips = (t: PlanText, start: number): TextClip[] => {
  const tpl = TEXT_TEMPLATES.find((x) => x.id === t.template)!;
  const clips = templateTexts(tpl, start);
  clips.forEach((c, i) => {
    if (t.texts[i]) c.text = t.texts[i];
  });
  return clips;
};

/**
 * Hesitation sounds a professional edit removes: only drawn-out sounds ("اممم",
 * "ممم", "اااا", "uh", "umm"), never short words that can carry meaning.
 */
export const FILLER = /^([اأآ]{2,}|[اأإ]?م{2,}|ه+م{2,}|uh+|um+|erm+|hmm+)[.,،!?؟…]*$/i;
/** Pauses longer than this inside a beat become jump cuts. */
const MAX_PAUSE = 0.6;

/**
 * The spans of a file to keep for some spoken words: jump cuts at long pauses and
 * around hesitations, each starting just before its first word and ending just
 * after its last one, without catching the neighbouring words of the transcript.
 */
export function speechSpans(words: Word[], all: Word[]): { start: number; end: number }[] {
  const spans: { start: number; end: number; first: Word; last: Word }[] = [];
  let skipped = false;
  for (const w of words) {
    if (FILLER.test(w.text.trim())) {
      skipped = true;
      continue;
    }
    const cur = spans[spans.length - 1];
    if (cur && !skipped && w.start - cur.last.end <= MAX_PAUSE) cur.last = w;
    else spans.push({ start: 0, end: 0, first: w, last: w });
    skipped = false;
  }
  return spans.map((sp) => {
    const i = all.indexOf(sp.first);
    const j = all.indexOf(sp.last);
    const before = i > 0 ? all[i - 1].end + 0.02 : 0;
    const after = j >= 0 && j < all.length - 1 ? all[j + 1].start - 0.02 : Infinity;
    return { start: Math.max(before, sp.first.start - 0.12), end: Math.min(after, sp.last.end + 0.18) };
  }).filter((x) => x.end - x.start >= 0.25);
}

/**
 * Builds the edit described by the plan as a new project. Talking mode: the
 * chosen sentences in order (jump cuts at pauses, alternating punch-in zoom),
 * with B-roll cutaways over them. Visual mode: the shots, cut in pauses and on
 * the music's beats. Then texts, music, voice-over, captions, reframing, sounds.
 */
export async function buildFromPlan(
  plan: AutoEditPlan,
  brief: AutoEditBrief,
  library: MediaAsset[],
  hooks: ExecuteHooks
): Promise<{ project: Project; notes: string[] }> {
  const notes: string[] = [];
  const assets = new Map(library.map((a) => [a.id, a]));
  const fast = brief.style === 'energetic';
  const talking = plan.mode === 'talking';
  const base = ASPECT_SIZES[brief.aspect as AspectRatio];

  // 1. Picture and speech.
  hooks.onStatus('ترتيب المشاهد...', 0.05);
  let clips: MainClip[] = [];
  // Seconds of quiet at each clip's start and end (timeline time), so transitions stay in the pauses.
  const quiet: { head: number; tail: number }[] = [];
  // Index of the first clip of each beat (talking) or shot (visual), for texts and B-roll.
  const firstClip: number[] = [];
  // Clips that get the punch-in zoom (every other cut in talking mode).
  const punched = new Set<string>();
  let wordCuts = 0;
  const finish = (clip: MainClip) => {
    clip.fit = 'cover';
    if (plan.filter) {
      clip.filterId = plan.filter;
      clip.adjust = presetAdjustments(plan.filter);
    }
    clips.push(clip);
  };
  if (talking) {
    for (const beat of plan.beats) {
      const sentences = beatSentences(beat, library);
      if (!sentences.length) continue;
      const media = Number(beat.sentences[0].split('.')[0]);
      const asset = library[media - 1];
      firstClip.push(clips.length);
      for (const span of speechSpans(sentences.flatMap((x) => x.words), asset.transcript ?? [])) {
        const clip = createMainClip(asset);
        clip.inPoint = span.start;
        clip.outPoint = Math.min(asset.duration, span.end);
        if (clips.length % 2) punched.add(clip.id);
        quiet.push({ head: 0.12, tail: 0.18 });
        finish(clip);
      }
    }
  } else {
    for (const s of plan.segments) {
      const asset = library[s.media - 1];
      const clip = createMainClip(asset);
      let head = Infinity;
      let tail = Infinity;
      if (asset.kind === 'image') clip.outPoint = Math.min(MAX_IMAGE_DURATION, s.end);
      else {
        let { start, end } = s;
        if (plan.original_audio === 'keep' && asset.hasAudio) {
          const fit = fitToSpeech(start, end, await fileSpeech(asset), asset.duration);
          ({ start, end, head, tail } = fit);
          if (fit.cutsWord) wordCuts++;
        }
        clip.inPoint = start;
        clip.outPoint = end;
        clip.speed = s.speed ?? 1;
        clip.muted = plan.original_audio === 'mute';
      }
      if (s.effect) clip.fx = [newFxLayer(s.effect, 0.7)];
      firstClip.push(clips.length);
      quiet.push({ head: head / clip.speed, tail: tail / clip.speed });
      finish(clip);
    }
  }
  // A transition spans half its length on each side of the cut: it must fit in the quiet there.
  // In talking mode only between beats; inside a beat the cuts are straight jump cuts.
  const beatStarts = new Set(firstClip);
  clips.forEach((clip, i) => {
    if (i === 0 || plan.transition === 'none' || (talking && !beatStarts.has(i))) return;
    const room = 2 * Math.min(quiet[i - 1].tail, quiet[i].head);
    const duration = Math.min(fast || talking ? 0.3 : 0.5, room);
    if (duration >= 0.2) clip.transition = { type: plan.transition as TransitionType, duration };
  });
  for (const c of clips) if (punched.has(c.id)) c.zoom = 1.12;
  if (wordCuts) notes.push(`لم أجد صمتاً قريباً في ${wordCuts} ${wordCuts === 1 ? 'مشهد' : 'مشاهد'}، فقد تنقطع كلمة هناك.`);

  // 2. Music. Without speech the shots are re-cut on its beats, like an editor would.
  let music: AudioClip | null = null;
  let total = layoutTotal(clips, assets);
  if (plan.music) {
    let asset: MediaAsset | undefined;
    if (plan.music.media) asset = library[plan.music.media - 1];
    else if (plan.music.query) {
      hooks.onStatus('البحث عن موسيقى مناسبة...', 0.15);
      try {
        const hits = await searchFreesound(plan.music.query, 'music');
        // Prefer a piece long enough for the whole video.
        const hit = hits.find((h) => h.duration >= total) ?? [...hits].sort((a, b) => b.duration - a.duration)[0];
        if (hit) asset = await hooks.registerAsset(await freesoundFile(hit));
        else notes.push('لم أجد موسيقى مناسبة في Freesound؛ يمكنك إضافة موسيقى من قسم الصوت.');
      } catch (err) {
        notes.push(err instanceof Error ? err.message : 'تعذر تحميل الموسيقى.');
      }
    }
    if (asset) {
      assets.set(asset.id, asset);
      music = createAudioClip(asset, 0);
      music.volume = plan.music.volume;
      const speech = talking || plan.voiceover || (plan.original_audio === 'keep' && clips.some((c) => assets.get(c.assetId)?.hasAudio));
      if (speech) music.duck = { level: 0.3 };
      else if (clips.length > 2) {
        hooks.onStatus('قص المشاهد على إيقاع الموسيقى...', 0.2);
        const beats = asset.beats ?? (await detectBeats(asset.file).catch(() => []));
        const cuts = beats.length ? beatCuts({ ...music, outPoint: asset.duration }, beats, fast ? 1 : 2) : [];
        if (cuts.length >= clips.length) {
          clips = retimeToCuts(clips, assets, cuts);
          total = layoutTotal(clips, assets);
        }
      }
      music.outPoint = Math.min(asset.duration, total);
      music.fadeIn = 0.5;
      music.fadeOut = Math.min(2, music.outPoint / 4);
    }
  }
  let project: Project = { aspect: brief.aspect as AspectRatio, background: '#000000', clips, texts: [], audios: music ? [music] : [], overlays: [], effects: [] };
  const layout = layoutMainTrack(clips, assets);

  // 3. Texts (above the captions), opening and ending; B-roll cutaways over the speech.
  const preset = TEXT_PRESETS.find((x) => x.id === plan.text_preset) ?? TEXT_PRESETS[0];
  const texts: TextClip[] = [];
  const items: { text?: string }[] = talking ? plan.beats : plan.segments;
  items.forEach((item, k) => {
    const lc = layout[firstClip[k]];
    if (!item.text || !lc) return;
    const start = lc.start + (k === 0 && plan.opening ? 1.2 : 0.15);
    const end = (layout[(firstClip[k + 1] ?? layout.length) - 1] ?? lc).end;
    const duration = Math.min(2.6, end - start - 0.1);
    if (duration < 0.6) return;
    texts.push({ ...preset.style, id: uid(), text: item.text, start, duration, x: 0.5, y: 0.22, rotation: 0, animIn: fast ? 'pop' : 'fade', animOut: 'fade' });
  });
  if (plan.opening) texts.push(...templateClips(plan.opening, 0));
  if (plan.ending) {
    const tpl = TEXT_TEMPLATES.find((x) => x.id === plan.ending!.template)!;
    texts.push(...templateClips(plan.ending, Math.max(0, total - tpl.duration - 0.2)));
  }
  const overlays: OverlayClip[] = [];
  for (const b of plan.broll) {
    const first = layout[firstClip[b.over - 1]];
    const last = layout[(firstClip[b.over] ?? layout.length) - 1];
    const asset = library[b.media - 1];
    if (!first || !last || !asset) continue;
    // Not over the hook's first second; one cutaway at a time.
    const start = Math.max(first.start + (b.over === 1 ? 1.2 : 0.4), overlays.length ? overlayEnd(overlays[overlays.length - 1]) + 0.8 : 0);
    const duration = Math.min(b.end - b.start, last.end - start - 0.3, 4);
    if (duration < 1) continue;
    const o = createOverlayClip(asset, start);
    o.inPoint = asset.kind === 'image' ? 0 : b.start;
    o.outPoint = o.inPoint + duration;
    Object.assign(o, { x: 0.5, y: 0.5, shape: 'rect', muted: true, volume: 0, animIn: 'fade', animOut: 'fade' });
    // Full screen: wide enough that the picture also covers the frame's height.
    o.scale = Math.max(1, (base.height * (asset.width || 1)) / (base.width * (asset.height || 1)));
    overlays.push(o);
  }
  project = { ...project, texts, overlays };

  // 4. The rest through the command engine: voice-over, reframing, sounds, captions.
  const actions: EditAction[] = [];
  if (plan.voiceover) actions.push({ op: 'tts', text: plan.voiceover.script, voice: plan.voiceover.voice, style: plan.voiceover.style, start: plan.opening ? 0.8 : 0.3 });
  const vertical = brief.aspect === '9:16' || brief.aspect === '4:5';
  const reframe = layout.filter((lc) => vertical && lc.asset.kind === 'video' && lc.asset.width > lc.asset.height && lc.asset.analysis).map((lc) => lc.index + 1);
  if (reframe.length) actions.push({ op: 'reframe', clips: reframe });
  if (plan.sfx_on_cuts && !talking && clips.length > 1) actions.push({ op: 'sfx', sound: plan.sfx_on_cuts, where: 'cuts', volume: 0.6 });
  if (plan.captions.on && plan.original_audio === 'keep' && layout.some((lc) => lc.asset.kind === 'video' && lc.asset.hasAudio))
    actions.push({ op: 'generate_captions', style: plan.captions.style, words_per_line: fast ? 2 : 3, emoji: fast });
  if (!actions.length) return { project, notes };
  const res = await executeActions(project, assets, [...library, ...[...assets.values()].filter((a) => !library.includes(a))], actions, hooks);
  // Reframing replaces the framing with keyframes; keep the punch-in on top of them.
  const result = {
    ...res.project,
    clips: res.project.clips.map((c) => (punched.has(c.id) && c.motion ? { ...c, motion: { ...c.motion, keys: c.motion.keys.map((k) => ({ ...k, tf: { ...k.tf, zoom: k.tf.zoom * 1.12 } })) } } : c)),
  };
  // The voice-over is generated last; say so when it runs past the picture.
  const voice = result.audios.find((a) => !project.audios.some((m) => m.id === a.id) && a.start < 1.5 && a.outPoint - a.inPoint > 1.5);
  if (plan.voiceover && voice && voice.start + voice.outPoint - voice.inPoint > total + 0.5)
    notes.push('التعليق الصوتي أطول من الفيديو قليلاً: قصّره من خصائص الصوت أو اطلب «اجعل الفيديو أطول».');
  return { project: result, notes: [...notes, ...res.notes] };
}

const layoutTotal = (clips: MainClip[], assets: Map<string, MediaAsset>) => {
  const l = layoutMainTrack(clips, assets);
  return l.length ? l[l.length - 1].end : 0;
};

/**
 * The AI reviewer: renders a light copy of the edit (360p, 2 fps, full sound),
 * lets the vision model watch it with the plan and the timeline, and returns
 * its verdict with fixes as editing actions.
 */
export async function reviewEdit(
  project: Project,
  assets: Map<string, MediaAsset>,
  library: MediaAsset[],
  plan: AutoEditPlan,
  brief: AutoEditBrief,
  onStatus: (status: string, progress: number | null) => void
): Promise<ReviewResult & { actions: EditAction[] }> {
  onStatus('تجهيز نسخة معاينة من المونتاج...', 0);
  const { blob, extension } = await exportProject(
    project,
    assets,
    { resolution: 360, fps: 2, quality: 'preview' },
    (p) => onStatus('تجهيز نسخة معاينة من المونتاج...', p * 0.5),
    { cancelled: false }
  );
  onStatus('المراجع الذكي يشاهد المونتاج...', 0.55);
  const form = new FormData();
  form.append('video', blob, `review.${extension}`);
  form.append(
    'context',
    JSON.stringify({
      brief: { ...brief, style: AUTO_STYLES.find((x) => x.id === brief.style)?.hint ?? brief.style },
      plan: { title: plan.title, idea: plan.idea, hook: plan.hook, segments: plan.segments.map((x) => ({ why: x.why, text: x.text })) },
      timeline: commandContext(project, assets, library, 0, null),
    })
  );
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    res = await fetch('/api/auto-edit/review', { method: 'POST', body: form }).catch(() => null);
    if (!res && attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!res) throw await connectionError();
  if (res.status === 503) throw new Error('المراجعة تحتاج مفتاح OpenRouter في إعدادات الخادم.');
  if (res.status === 429) throw new Error('طلبات كثيرة. انتظر دقيقة ثم أعد المراجعة.');
  if (!res.ok) throw new Error('تعذرت المراجعة الآن.');
  const data = await res.json();
  const raw = (res.status === 202 && data.job ? await waitForJob(data.job) : data) as Record<string, any>;
  const actions = (Array.isArray(raw?.actions) ? raw.actions : [])
    .filter((a: unknown) => !!a && typeof a === 'object' && typeof (a as { op?: unknown }).op === 'string' && !REVIEW_BLOCKED_OPS.has((a as { op: string }).op))
    .slice(0, 30) as EditAction[];
  return {
    score: clamp(num(raw?.score, 0), 0, 10),
    ready: !!raw?.ready,
    summary: str(raw?.summary, 600),
    issues: (Array.isArray(raw?.issues) ? raw.issues : [])
      .slice(0, 20)
      .map((x: any) => ({ time: Math.max(0, num(x?.time, 0)), problem: str(x?.problem, 200), fix: str(x?.fix, 200) }))
      .filter((x: { problem: string }) => x.problem),
    actions,
  };
}

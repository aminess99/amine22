import { AUTO_STYLES, AutoEditBrief, AutoEditPlan, PlanSegment, PlanText, REVIEW_BLOCKED_OPS, ReviewResult } from './autoEditSpec';
import { EditAction } from './commandSpec';
import { waitForJob } from './jobs';
import { ExecuteHooks, commandContext, executeActions } from './commands';
import { exportProject } from './exporter';
import { CAPTION_STYLES, FILTER_PRESETS, MAX_IMAGE_DURATION, TEXT_PRESETS, TRANSITIONS, presetAdjustments } from './constants';
import { isProFx, newFxLayer } from './proFxCatalog';
import { fileSpeech, fitToSpeech } from './silence';
import { SFX_LIST, freesoundFile, searchFreesound } from './sfx';
import { TEXT_TEMPLATES, templateTexts } from './textTemplates';
import { createAudioClip, createMainClip, layoutMainTrack, uid } from './timeline';
import { TTS_STYLES, TTS_VOICES } from './tts';
import { AspectRatio, MainClip, MediaAsset, Project, TextClip, TransitionType } from './types';

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

/** The library as the planner sees it: what each file is and, for analysed videos, what is in it. */
export function materialsContext(library: MediaAsset[]) {
  return library.map((a, i) => ({
    n: i + 1,
    type: a.kind,
    name: a.name.slice(0, 50),
    duration: a.kind === 'image' ? undefined : r2(a.duration),
    orientation: a.kind === 'audio' ? undefined : a.width > a.height * 1.1 ? 'landscape' : a.height > a.width * 1.1 ? 'portrait' : 'square',
    has_sound: a.kind === 'video' ? a.hasAudio : undefined,
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
  if (!res) throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت ثم اضغط «حاول مرة أخرى».');
  if (res.status === 404 || res.status === 405) throw new Error('المونتاج التلقائي يعمل على الموقع الكامل فقط.');
  if (res.status === 503) throw new Error('المونتاج التلقائي يحتاج مفتاح OpenRouter في إعدادات الخادم.');
  if (res.status === 429) throw new Error('طلبات كثيرة. انتظر دقيقة ثم حاول.');
  if (!res.ok) throw new Error('تعذر إعداد الخطة الآن. حاول مرة أخرى.');
  const data = await res.json();
  const raw = res.status === 202 && data.job ? await waitForJob(data.job) : data;
  const plan = validatePlan(raw, brief, library);
  if (!plan.segments.length) throw new Error('لم يتمكن الذكاء الاصطناعي من اختيار مشاهد من ملفاتك. أضف فيديوهات أو صوراً وحاول مرة أخرى.');
  return plan;
}

function planText(v: unknown): PlanText | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { template?: unknown; texts?: unknown };
  if (!known(TEXT_TEMPLATES, o.template)) return null;
  return { template: o.template, texts: Array.isArray(o.texts) ? o.texts.map((t) => str(t, 120)).filter(Boolean).slice(0, 4) : [] };
}

/** Keeps only what can be built: real files, times inside them, known ids. */
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
  const audio = (n: unknown) => library[Math.round(num(n, 0)) - 1]?.kind === 'audio';
  const music = p.music && typeof p.music === 'object' && brief.music !== 'none' ? p.music : null;
  const voice = p.voiceover && typeof p.voiceover === 'object' && brief.voiceover && str(p.voiceover.script, 2000) ? p.voiceover : null;
  return {
    title: str(p.title, 100) || 'مونتاج',
    idea: str(p.idea, 600),
    hook: str(p.hook, 300),
    segments,
    transition: known(TRANSITIONS, p.transition) ? p.transition : 'fade',
    filter: known(FILTER_PRESETS, p.filter) ? p.filter : null,
    text_preset: known(TEXT_PRESETS, p.text_preset) ? p.text_preset : TEXT_PRESETS[0].id,
    original_audio: p.original_audio === 'mute' ? 'mute' : 'keep',
    captions: {
      on: brief.captions && !!p.captions?.on,
      style: known(CAPTION_STYLES, p.captions?.style) ? p.captions.style : 'hormozi',
    },
    opening: planText(p.opening),
    ending: planText(p.ending),
    voiceover: voice
      ? { script: str(voice.script, 2000), voice: known(TTS_VOICES, voice.voice) ? voice.voice : TTS_VOICES[0].id, style: known(TTS_STYLES, voice.style) ? voice.style : TTS_STYLES[0].id }
      : null,
    music: music
      ? audio(music.media)
        ? { media: Math.round(num(music.media, 0)), volume: clamp(num(music.volume, 0.4), 0.05, 1) }
        : brief.music === 'search' && str(music.query, 80)
          ? { query: str(music.query, 80), volume: clamp(num(music.volume, 0.4), 0.05, 1) }
          : null
      : null,
    sfx_on_cuts: known(SFX_LIST, p.sfx_on_cuts) ? p.sfx_on_cuts : null,
    publish: {
      caption: str(p.publish?.caption, 500),
      hashtags: Array.isArray(p.publish?.hashtags) ? p.publish.hashtags.map((h: unknown) => str(h, 40)).filter(Boolean).slice(0, 15) : [],
    },
  };
}

/** Seconds the finished video lasts (before transitions overlap). */
export function planDuration(plan: AutoEditPlan) {
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
 * Builds the edit described by the plan as a new project: the shots in order,
 * then texts, music, voice-over, captions, reframing and sounds.
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

  // 1. Shots. Spoken footage is cut in pauses so no word is clipped.
  hooks.onStatus('ترتيب المشاهد...', 0.05);
  const clips: MainClip[] = [];
  // Seconds of quiet at each shot's start and end (timeline time), so transitions stay in the pauses.
  const quiet: { head: number; tail: number }[] = [];
  let wordCuts = 0;
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
    clip.fit = 'cover';
    if (plan.filter) {
      clip.filterId = plan.filter;
      clip.adjust = presetAdjustments(plan.filter);
    }
    if (s.effect) clip.fx = [newFxLayer(s.effect, 0.7)];
    quiet.push({ head: head / clip.speed, tail: tail / clip.speed });
    clips.push(clip);
  }
  // A transition spans half its length on each side of the cut: it must fit in the quiet there.
  // Where people talk right up to the cut, a straight cut is cleaner than an effect over the words.
  clips.forEach((clip, i) => {
    if (i === 0 || plan.transition === 'none') return;
    const room = 2 * Math.min(quiet[i - 1].tail, quiet[i].head);
    const duration = Math.min(fast ? 0.3 : 0.5, room);
    if (duration >= 0.2) clip.transition = { type: plan.transition as TransitionType, duration };
  });
  if (wordCuts) notes.push(`لم أجد صمتاً قريباً في ${wordCuts} ${wordCuts === 1 ? 'مشهد' : 'مشاهد'}، فقد تنقطع كلمة هناك.`);
  let project: Project = { aspect: brief.aspect as AspectRatio, background: '#000000', clips, texts: [], audios: [], overlays: [], effects: [] };
  const layout = layoutMainTrack(clips, assets);
  const total = layout.length ? layout[layout.length - 1].end : 0;

  // 2. Texts: one per shot that has one (above the captions), plus an opening and an ending.
  const preset = TEXT_PRESETS.find((x) => x.id === plan.text_preset) ?? TEXT_PRESETS[0];
  const texts: TextClip[] = [];
  plan.segments.forEach((s, i) => {
    const lc = layout[i];
    if (!s.text || !lc) return;
    const start = lc.start + (i === 0 && plan.opening ? 1.2 : 0.15);
    const duration = Math.min(2.6, lc.end - start - 0.1);
    if (duration < 0.6) return;
    texts.push({ ...preset.style, id: uid(), text: s.text, start, duration, x: 0.5, y: 0.22, rotation: 0, animIn: fast ? 'pop' : 'fade', animOut: 'fade' });
  });
  if (plan.opening) texts.push(...templateClips(plan.opening, 0));
  if (plan.ending) {
    const tpl = TEXT_TEMPLATES.find((x) => x.id === plan.ending!.template)!;
    texts.push(...templateClips(plan.ending, Math.max(0, total - tpl.duration - 0.2)));
  }
  project = { ...project, texts };

  // 3. Music under everything, quieter while anyone speaks.
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
      const music = createAudioClip(asset, 0);
      music.outPoint = Math.min(asset.duration, total);
      music.volume = plan.music.volume;
      music.fadeIn = 0.5;
      music.fadeOut = Math.min(2, music.outPoint / 4);
      const speech = (plan.original_audio === 'keep' && plan.segments.some((s) => library[s.media - 1]?.hasAudio)) || !!plan.voiceover;
      if (speech) music.duck = { level: 0.3 };
      project = { ...project, audios: [music] };
    }
  }

  // 4. The rest through the command engine: voice-over, captions, reframing, sounds.
  const actions: EditAction[] = [];
  if (plan.voiceover) actions.push({ op: 'tts', text: plan.voiceover.script, voice: plan.voiceover.voice, style: plan.voiceover.style, start: plan.opening ? 0.8 : 0.3 });
  const vertical = brief.aspect === '9:16' || brief.aspect === '4:5';
  const reframe = layout.filter((lc) => vertical && lc.asset.kind === 'video' && lc.asset.width > lc.asset.height && lc.asset.analysis).map((lc) => lc.index + 1);
  if (reframe.length) actions.push({ op: 'reframe', clips: reframe });
  if (plan.sfx_on_cuts && clips.length > 1) actions.push({ op: 'sfx', sound: plan.sfx_on_cuts, where: 'cuts', volume: 0.6 });
  if (plan.captions.on && plan.original_audio === 'keep' && layout.some((lc) => lc.asset.kind === 'video' && lc.asset.hasAudio))
    actions.push({ op: 'generate_captions', style: plan.captions.style, words_per_line: fast ? 2 : 3, emoji: fast });
  if (!actions.length) return { project, notes };
  const res = await executeActions(project, assets, [...library, ...[...assets.values()].filter((a) => !library.includes(a))], actions, hooks);
  // The voice-over is generated last; say so when it runs past the picture.
  const voice = res.project.audios.find((a) => !project.audios.some((m) => m.id === a.id) && a.start < 1.5 && a.outPoint - a.inPoint > 1.5);
  if (plan.voiceover && voice && voice.start + voice.outPoint - voice.inPoint > total + 0.5)
    notes.push('التعليق الصوتي أطول من الفيديو قليلاً: قصّره من خصائص الصوت أو اطلب «اجعل الفيديو أطول».');
  return { project: res.project, notes: [...notes, ...res.notes] };
}

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
  if (!res) throw new Error('تعذر الاتصال بالخادم للمراجعة.');
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

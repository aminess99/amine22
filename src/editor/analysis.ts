import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_VERY_LOW } from 'mediabunny';
import { aiPickFrames, refineCut, refineMotion, refineOnset, snapToFrame, snapToSilence, videoFps } from './refine';
import { MediaAsset, VideoAnalysis, VideoEvent, VideoScene } from './types';

export const MAX_ANALYSIS_SECONDS = 15 * 60;

export type AnalysisProgress = { stage: 'proxy' | 'upload' | 'refine'; percent: number } | { stage: 'thinking' };

/**
 * A small copy of the video for the vision model: 360p, 2 frames a second,
 * mono 16 kHz sound. A phone uploads a few MB instead of the whole file.
 */
async function makeProxy(asset: MediaAsset, onProgress: (p: number) => void): Promise<Blob> {
  try {
    const input = new Input({ source: new BlobSource(asset.file), formats: ALL_FORMATS });
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const portrait = asset.height > asset.width;
    const conversion = await Conversion.init({
      input,
      output,
      video: { ...(portrait ? { width: 360 } : { height: 360 }), frameRate: 2, codec: 'avc', bitrate: QUALITY_VERY_LOW, forceTranscode: true },
      audio: { numberOfChannels: 1, sampleRate: 16000, codec: 'aac', bitrate: 32000, forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('invalid');
    conversion.onProgress = (p) => onProgress(Math.round(p * 100));
    await conversion.execute();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('empty');
    return new Blob([buffer], { type: 'video/mp4' });
  } catch {
    // No encoder on this browser: send the original when it's small enough.
    if (asset.file.size <= 60 * 1024 * 1024) return asset.file;
    throw new Error('تعذر تجهيز الفيديو للتحليل على هذا المتصفح. جرّب فيديو أصغر أو متصفح Chrome.');
  }
}

function upload(blob: Blob, duration: number, onProgress: (p: AnalysisProgress) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/analyze');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress({ stage: 'upload', percent: Math.round((e.loaded / e.total) * 100) });
    xhr.upload.onload = () => onProgress({ stage: 'thinking' });
    xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم.'));
    xhr.onload = () => {
      if (xhr.status === 404 || xhr.status === 405) return reject(new Error('تحليل الفيديو يعمل على الموقع الكامل فقط.'));
      if (xhr.status === 503) return reject(new Error('تحليل الفيديو يحتاج مفتاح OpenRouter في إعدادات الخادم.'));
      if (xhr.status === 429) return reject(new Error('حللت فيديوهات كثيرة في وقت قصير. انتظر قليلاً ثم حاول.'));
      if (xhr.status === 413) return reject(new Error('الفيديو كبير جداً للتحليل.'));
      if (xhr.status < 200 || xhr.status >= 300 || !xhr.response) return reject(new Error('تعذر تحليل الفيديو الآن. حاول مرة أخرى.'));
      resolve(xhr.response);
    };
    const form = new FormData();
    form.append('duration', String(duration));
    form.append('video', blob, 'proxy.mp4');
    xhr.send(form);
  });
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const QUALITIES = new Set(['good', 'blurry', 'dark', 'shaky', 'boring']);
const KINDS = new Set(['cut', 'action', 'impact', 'expression', 'appear', 'text', 'gesture', 'speech']);

/** Validates the model's reply and keeps every time inside the video. */
function normalize(raw: any, duration: number): VideoAnalysis {
  const t = (v: unknown) => Math.min(duration, Math.max(0, num(v)));
  const scenes: VideoScene[] = (Array.isArray(raw?.scenes) ? raw.scenes : [])
    .map((s: any) => ({
      start: t(s?.start),
      end: t(s?.end),
      description: str(s?.description),
      quality: QUALITIES.has(s?.quality) ? s.quality : 'good',
      interest: Math.min(10, Math.max(0, num(s?.interest, 5))),
    }))
    .filter((s: VideoScene) => s.end > s.start)
    .sort((a: VideoScene, b: VideoScene) => a.start - b.start);
  const events: VideoEvent[] = (Array.isArray(raw?.events) ? raw.events : [])
    .map((e: any) => ({ time: t(e?.time), label: str(e?.label, 160), kind: KINDS.has(e?.kind) ? e.kind : 'action' }))
    .filter((e: VideoEvent) => e.label)
    .sort((a: VideoEvent, b: VideoEvent) => a.time - b.time)
    .slice(0, 80);
  const subject = (Array.isArray(raw?.subject) ? raw.subject : [])
    .map((p: any) => ({ time: t(p?.time), x: Math.min(1, Math.max(0, num(p?.x, 0.5))), y: Math.min(1, Math.max(0, num(p?.y, 0.5))) }))
    .sort((a: { time: number }, b: { time: number }) => a.time - b.time);
  const highlights = (Array.isArray(raw?.highlights) ? raw.highlights : [])
    .map((h: any) => ({ start: t(h?.start), end: t(h?.end), title: str(h?.title, 120), reason: str(h?.reason), score: Math.min(10, Math.max(0, num(h?.score, 5))) }))
    .filter((h: { start: number; end: number }) => h.end - h.start >= 3)
    .slice(0, 5);
  return {
    summary: str(raw?.summary, 800),
    scenes,
    events,
    subject,
    highlights,
    title: str(raw?.title, 150),
    description: str(raw?.description, 1500),
    hashtags: (Array.isArray(raw?.hashtags) ? raw.hashtags : []).map((h: unknown) => str(h, 40)).filter(Boolean).slice(0, 15),
    thumbnailTime: t(raw?.thumbnail_time),
  };
}

/**
 * Makes the model's second-level times frame-accurate: cuts from frame
 * differences, sounds from audio onsets, actions from motion peaks, looks and
 * appearances from a second look at the real frames; then snaps to frames.
 */
async function refine(asset: MediaAsset, a: VideoAnalysis, onProgress: (p: number) => void): Promise<VideoAnalysis> {
  const fps = await videoFps(asset);
  const snap = (t: number) => snapToFrame(t, fps);
  const total = a.scenes.length + a.events.length + a.highlights.length * 2 + 1;
  let done = 0;
  const tick = () => onProgress(Math.round((++done / total) * 100));

  // Scene boundaries land on the exact cut frame when there is one.
  const scenes = a.scenes.map((s) => ({ ...s }));
  for (let i = 1; i < scenes.length; i++) {
    const cut = await refineCut(asset, scenes[i].start).catch(() => null);
    const at = snap(cut ?? scenes[i].start);
    scenes[i].start = at;
    scenes[i - 1].end = at;
    tick();
  }
  if (scenes[0]) scenes[0].start = 0;

  const events: VideoEvent[] = [];
  const visual: { index: number; time: number; label: string }[] = [];
  for (const e of a.events) {
    let time: number | null = null;
    let refined: VideoEvent['refined'] = 'frame';
    if (e.kind === 'cut') {
      time = await refineCut(asset, e.time).catch(() => null);
      refined = 'cut';
    } else if (e.kind === 'impact' && asset.hasAudio) {
      time = await refineOnset(asset, e.time).catch(() => null);
      refined = 'onset';
    } else if (e.kind === 'action' || e.kind === 'gesture') {
      time = await refineMotion(asset, e.time).catch(() => null);
      refined = 'motion';
    } else if (e.kind === 'expression' || e.kind === 'appear' || e.kind === 'text') {
      visual.push({ index: events.length, time: e.time, label: e.label });
    }
    events.push(time === null ? { ...e, time: snap(e.time), refined: 'frame' } : { ...e, time: e.kind === 'impact' ? time : snap(time), refined });
    tick();
  }
  // One request for the moments only a look can place (a smile, someone appearing...).
  const picks = await aiPickFrames(asset, visual.slice(0, 12)).catch(() => []);
  picks.forEach((t, i) => {
    if (t !== null && t !== undefined) events[visual[i].index] = { ...events[visual[i].index], time: snap(t), refined: 'ai' };
  });

  // Highlights start and end in a pause, never mid-word.
  const highlights = [];
  for (const h of a.highlights) {
    const start = snap(await snapToSilence(asset, h.start));
    tick();
    const end = snap(await snapToSilence(asset, h.end));
    tick();
    highlights.push({ ...h, start, end: Math.max(end, start + 1) });
  }
  tick();
  return { ...a, scenes, events: events.sort((x, y) => x.time - y.time), highlights, thumbnailTime: snap(a.thumbnailTime) };
}

/** Analyses a video with the vision model and refines the result to frames. */
export async function analyzeVideo(asset: MediaAsset, onProgress: (p: AnalysisProgress) => void): Promise<VideoAnalysis> {
  if (asset.kind !== 'video') throw new Error('التحليل للفيديو فقط.');
  if (asset.duration > MAX_ANALYSIS_SECONDS) throw new Error(`تحليل الفيديو متاح حتى ${MAX_ANALYSIS_SECONDS / 60} دقيقة.`);
  onProgress({ stage: 'proxy', percent: 0 });
  const proxy = await makeProxy(asset, (percent) => onProgress({ stage: 'proxy', percent }));
  onProgress({ stage: 'upload', percent: 0 });
  const raw = await upload(proxy, asset.duration, onProgress);
  const analysis = normalize(raw, asset.duration);
  if (!analysis.scenes.length && !analysis.events.length) throw new Error('لم يتمكن الذكاء الاصطناعي من فهم هذا الفيديو. حاول مرة أخرى.');
  onProgress({ stage: 'refine', percent: 0 });
  return refine(asset, analysis, (percent) => onProgress({ stage: 'refine', percent }));
}

/** Progress as a short Arabic status line and a 0..1 bar position. */
export function progressText(p: AnalysisProgress): { text: string; bar: number | null } {
  switch (p.stage) {
    case 'proxy':
      return { text: `تجهيز نسخة خفيفة من الفيديو... ${p.percent}%`, bar: p.percent / 400 };
    case 'upload':
      return { text: `رفع الفيديو... ${p.percent}%`, bar: 0.25 + p.percent / 400 };
    case 'thinking':
      return { text: 'الذكاء الاصطناعي يشاهد الفيديو... قد يأخذ دقيقة.', bar: 0.6 };
    case 'refine':
      return { text: `تدقيق التوقيت على مستوى الإطار... ${p.percent}%`, bar: 0.75 + p.percent / 400 };
  }
}

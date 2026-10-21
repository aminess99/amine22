import { getWordEmoji } from '../lib/emojiMatcher';
import { TEXT_PRESETS, captionStyleFields } from './constants';
import { timelineTimeOf, uid } from './timeline';
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat, getFirstEncodableAudioCodec } from 'mediabunny';
import { connectionError, waitForJob } from './jobs';
import { LaidOutClip, MediaAsset, TextClip } from './types';

export interface Word {
  text: string;
  start: number;
  end: number;
}

export type CaptionProgress =
  | { stage: 'upload'; clip: number; clips: number; percent: number }
  | { stage: 'transcribe'; clip: number; clips: number };

/** Transcripts by source file, so restyling or regenerating doesn't upload and pay again. */
const transcripts = new WeakMap<File, Word[]>();

/** Largest file sent whole when the browser can't pull the sound out on its own. */
const MAX_RAW_UPLOAD = 20 * 1024 * 1024;

/**
 * Just the sound of a file, mono 16 kHz (speech needs no more): a ten-minute
 * video becomes a few MB instead of hundreds. Uses whichever audio encoder the
 * browser has; without one, only a small file goes as it is.
 */
async function speechAudio(file: File): Promise<Blob> {
  try {
    const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: 16000, bitrate: 32000 });
    if (!codec) throw new Error('no audio encoder');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const output = new Output({ format: codec === 'aac' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { numberOfChannels: 1, sampleRate: 16000, codec, bitrate: 32000, forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('invalid');
    await conversion.execute();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('empty');
    return new Blob([buffer], { type: codec === 'aac' ? 'audio/mp4' : 'audio/webm' });
  } catch {
    if (file.size <= MAX_RAW_UPLOAD) return file;
    throw new Error('هذا المتصفح لا يستطيع استخراج الصوت من هذا الفيديو الكبير. جرّب Chrome حديثاً أو فيديو أقصر.');
  }
}

/**
 * Word timings of a file's speech, in source seconds. Uses the transcript saved on
 * the asset or in this session when there is one; otherwise uploads the sound only.
 */
export async function transcribeAsset(asset: MediaAsset, onUpload: (percent: number) => void, onUploaded: () => void): Promise<Word[]> {
  if (asset.transcript) return asset.transcript;
  const cached = transcripts.get(asset.file);
  if (cached) return cached;
  const audio = await speechAudio(asset.file);
  const data = await new Promise<any>((resolve, reject) => {
    // XHR rather than fetch: it reports upload progress, which matters on slow phones.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/transcribe');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = onUploaded;
    xhr.onerror = () => connectionError().then(reject);
    xhr.onload = () => {
      const res = xhr.response;
      if (xhr.status === 404 || xhr.status === 405) return reject(new Error('خدمة التفريغ غير متاحة هنا. الكابشن التلقائي يعمل على الموقع الكامل فقط.'));
      if (xhr.status === 413) return reject(new Error('الملف كبير جداً للتفريغ.'));
      if (xhr.status < 200 || xhr.status >= 300 || !res) {
        console.error('Transcription failed:', xhr.status, res?.error);
        return reject(new Error('تعذر تشغيل خدمة التفريغ على الخادم حالياً. حاول مرة أخرى لاحقاً.'));
      }
      // The server transcribes in the background; wait for the words.
      if (xhr.status === 202 && res.job) {
        onUploaded();
        return resolve(waitForJob(res.job).catch(() => Promise.reject(new Error('تعذر تفريغ الكلام هذه المرة. حاول مرة أخرى.'))));
      }
      resolve(res);
    };
    const form = new FormData();
    form.append('async', '1');
    form.append('video', audio, audio === asset.file ? asset.file.name : `speech.${audio.type === 'audio/webm' ? 'webm' : 'm4a'}`);
    xhr.send(form);
  });
  const words: Word[] = [];
  for (const seg of data?.segments ?? []) for (const w of seg.words ?? []) words.push({ text: w.text, start: w.start, end: w.end });
  transcripts.set(asset.file, words);
  return words;
}

/** The first word in a caption that has a matching emoji. */
export function emojiFor(words: { text: string }[]): string | undefined {
  for (const w of words) {
    const e = getWordEmoji(w.text);
    if (e) return e;
  }
  return undefined;
}

/**
 * Transcribes every main-track video clip and turns the speech into timed
 * captions, mapped from source time onto the timeline.
 */
export async function generateCaptions(
  layout: LaidOutClip[],
  wordsPerCaption: number,
  /** A CAPTION_STYLES id. */
  styleId: string,
  withEmoji: boolean,
  onProgress: (p: CaptionProgress) => void
): Promise<TextClip[]> {
  const videos = layout.filter((lc) => lc.asset.kind === 'video' && lc.asset.hasAudio && !lc.clip.muted);
  if (!videos.length) throw new Error('لا يوجد مقطع فيديو فيه صوت لتفريغه.');

  const base = (TEXT_PRESETS.find((p) => p.id === 'subtitle') ?? TEXT_PRESETS[0]).style;
  const look = captionStyleFields(styleId);
  const captions: TextClip[] = [];

  for (let i = 0; i < videos.length; i++) {
    const lc = videos[i];
    onProgress({ stage: 'upload', clip: i + 1, clips: videos.length, percent: 0 });
    const all = await transcribeAsset(
      lc.asset,
      (percent) => onProgress({ stage: 'upload', clip: i + 1, clips: videos.length, percent }),
      () => onProgress({ stage: 'transcribe', clip: i + 1, clips: videos.length })
    );
    const { inPoint, outPoint } = lc.clip;
    const source = all.filter((w) => w.start >= inPoint - 0.02 && w.start < outPoint);
    // Through the clip's speed (and speed curve), so captions match what is heard.
    const words = source.map((w) => {
      const start = timelineTimeOf(lc, Math.max(w.start, inPoint)) ?? lc.start;
      return { text: w.text, start, end: Math.max(start, timelineTimeOf(lc, Math.min(w.end, outPoint)) ?? start) };
    });
    for (let j = 0; j < words.length; j += wordsPerCaption) {
      const group = words.slice(j, j + wordsPerCaption);
      const next = words[j + wordsPerCaption];
      const start = group[0].start;
      // Hold each caption until the next one starts (short gaps), so it doesn't flicker.
      const end = next && next.start - group[group.length - 1].end < 0.6 ? next.start : group[group.length - 1].end + 0.2;
      const duration = Math.max(0.2, Math.min(end, lc.end) - start);
      captions.push({
        ...base,
        ...look,
        id: uid(),
        text: group.map((w) => w.text).join(' '),
        start,
        duration,
        src: { assetId: lc.asset.id, words: source.slice(j, j + wordsPerCaption), hold: Math.max(0, start + duration - group[group.length - 1].end) },
        x: 0.5,
        y: styleId === 'cinematic' || styleId === 'plain' ? 0.84 : 0.72,
        rotation: 0,
        words: group,
        animIn: 'none',
        animOut: 'none',
        emoji: withEmoji ? emojiFor(group) : undefined,
      });
    }
  }
  return captions;
}

/**
 * Re-splits existing captions into lines of `wordsPerCaption` words, keeping each
 * word's timing and its link to the source speech. No new transcription.
 */
export function regroupCaptions(captions: TextClip[], wordsPerCaption: number): TextClip[] {
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  type Item = { word: { text: string; start: number; end: number }; src?: { text: string; start: number; end: number }; owner: TextClip };
  // Runs of words that can share a line: same source file, each caption timed word by word.
  const runs: Item[][] = [];
  let run: Item[] = [];
  let lastAsset: string | undefined;
  for (const c of sorted) {
    if (!c.words?.length) continue;
    const linked = !!c.src && c.src.words.length === c.words.length;
    const asset = linked ? c.src!.assetId : undefined;
    if (run.length && asset !== lastAsset) {
      runs.push(run);
      run = [];
    }
    lastAsset = asset;
    c.words.forEach((w, i) => run.push({ word: w, src: linked ? c.src!.words[i] : undefined, owner: c }));
  }
  if (run.length) runs.push(run);

  const out: TextClip[] = [];
  for (const items of runs) {
    for (let j = 0; j < items.length; j += wordsPerCaption) {
      const group = items.slice(j, j + wordsPerCaption);
      const next = items[j + wordsPerCaption];
      const first = group[0].owner;
      const lastWord = group[group.length - 1].word;
      // Hold until the next line when the pause is short, but never past the original caption's end.
      const limit = group[group.length - 1].owner.start + group[group.length - 1].owner.duration;
      const end = next && next.word.start - lastWord.end < 0.6 ? next.word.start : Math.min(limit, lastWord.end + 0.2);
      const start = group[0].word.start;
      const duration = Math.max(0.2, end - start);
      const words = group.map((g) => g.word);
      const linked = group.every((g) => g.src);
      out.push({
        ...first,
        id: uid(),
        text: words.map((w) => w.text).join(' '),
        start,
        duration,
        words,
        src: linked ? { assetId: first.src!.assetId, words: group.map((g) => g.src!), hold: Math.max(0, start + duration - lastWord.end) } : undefined,
        emoji: group.some((g) => g.owner.emoji) ? emojiFor(words) : undefined,
      });
    }
  }
  return out;
}

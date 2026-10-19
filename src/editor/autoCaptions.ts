import { getWordEmoji } from '../lib/emojiMatcher';
import { TEXT_PRESETS, captionStyleFields } from './constants';
import { timelineTimeOf, uid } from './timeline';
import { LaidOutClip, TextClip } from './types';

interface Word {
  text: string;
  start: number;
  end: number;
}

export type CaptionProgress =
  | { stage: 'upload'; clip: number; clips: number; percent: number }
  | { stage: 'transcribe'; clip: number; clips: number };

/** Transcripts by source file, so restyling or regenerating doesn't upload and pay again. */
const transcripts = new WeakMap<File, Word[]>();

/** Sends a file to the site's transcription endpoint and returns word timings in source seconds. */
function transcribe(file: File, onUpload: (percent: number) => void, onUploaded: () => void): Promise<Word[]> {
  const cached = transcripts.get(file);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    // XHR rather than fetch: it reports upload progress, which matters on slow phones.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/transcribe');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = onUploaded;
    xhr.onerror = () => reject(new Error('خدمة التفريغ غير متاحة هنا. الكابشن التلقائي يعمل على الموقع الكامل فقط.'));
    xhr.onload = () => {
      const data = xhr.response;
      if (xhr.status === 404 || xhr.status === 405) {
        reject(new Error('خدمة التفريغ غير متاحة هنا. الكابشن التلقائي يعمل على الموقع الكامل فقط.'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data) {
        console.error('Transcription failed:', xhr.status, data?.error);
        reject(new Error('تعذر تشغيل خدمة التفريغ على الخادم حالياً. حاول مرة أخرى لاحقاً.'));
        return;
      }
      const words: Word[] = [];
      for (const seg of data.segments ?? []) for (const w of seg.words ?? []) words.push({ text: w.text, start: w.start, end: w.end });
      transcripts.set(file, words);
      resolve(words);
    };
    const form = new FormData();
    form.append('video', file);
    xhr.send(form);
  });
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
    const all = await transcribe(
      lc.asset.file,
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

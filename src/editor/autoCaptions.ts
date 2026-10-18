import { CAPTION_STYLES, TEXT_PRESETS } from './constants';
import { uid } from './timeline';
import { LaidOutClip, TextClip } from './types';

interface Word {
  text: string;
  start: number;
  end: number;
}

/** Sends a file to the site's transcription endpoint and returns word timings in source seconds. */
async function transcribe(file: File): Promise<Word[]> {
  const form = new FormData();
  form.append('video', file);
  let res: Response;
  try {
    res = await fetch('/api/transcribe', { method: 'POST', body: form });
  } catch {
    throw new Error('خدمة التفريغ غير متاحة هنا. الكابشن التلقائي يعمل على الموقع الكامل فقط.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 404 || res.status === 405) {
    throw new Error('خدمة التفريغ غير متاحة هنا. الكابشن التلقائي يعمل على الموقع الكامل فقط.');
  }
  if (!res.ok || !data) {
    console.error('Transcription failed:', res.status, data?.error);
    throw new Error('تعذر تشغيل خدمة التفريغ على الخادم حالياً. حاول مرة أخرى لاحقاً.');
  }
  const words: Word[] = [];
  for (const seg of data.segments ?? []) for (const w of seg.words ?? []) words.push({ text: w.text, start: w.start, end: w.end });
  return words;
}

/**
 * Transcribes every main-track video clip and turns the speech into timed
 * subtitle text clips, mapped from source time onto the timeline.
 */
export async function generateCaptions(
  layout: LaidOutClip[],
  wordsPerCaption: number,
  /** A CAPTION_STYLES id for word-by-word highlighting, or 'plain' for a simple subtitle. */
  styleId: string,
  onProgress: (done: number, total: number) => void
): Promise<TextClip[]> {
  const videos = layout.filter((lc) => lc.asset.kind === 'video' && lc.asset.hasAudio && !lc.clip.muted);
  if (!videos.length) throw new Error('لا يوجد مقطع فيديو فيه صوت لتفريغه.');

  const cache = new Map<string, Word[]>();
  const plain = (TEXT_PRESETS.find((p) => p.id === 'subtitle') ?? TEXT_PRESETS[0]).style;
  const cs = CAPTION_STYLES.find((c) => c.id === styleId);
  const style = cs
    ? { ...plain, font: cs.font, color: cs.color, strokeColor: '#000000', strokeWidth: cs.stroke, background: null, fontSize: 76, bold: true, shadow: cs.stroke === 0, y: 0.72 }
    : plain;
  const captions: TextClip[] = [];

  for (let i = 0; i < videos.length; i++) {
    onProgress(i, videos.length);
    const lc = videos[i];
    if (!cache.has(lc.asset.id)) cache.set(lc.asset.id, await transcribe(lc.asset.file));
    const { inPoint, outPoint, speed } = lc.clip;
    const words = cache
      .get(lc.asset.id)!
      .filter((w) => w.end > inPoint && w.start < outPoint)
      .map((w) => ({
        text: w.text,
        start: lc.start + (Math.max(w.start, inPoint) - inPoint) / speed,
        end: lc.start + (Math.min(w.end, outPoint) - inPoint) / speed,
      }));
    for (let j = 0; j < words.length; j += wordsPerCaption) {
      const group = words.slice(j, j + wordsPerCaption);
      const next = words[j + wordsPerCaption];
      const start = group[0].start;
      // Hold each caption until the next one starts (short gaps), so it doesn't flicker.
      const end = next && next.start - group[group.length - 1].end < 0.6 ? next.start : group[group.length - 1].end + 0.2;
      captions.push({
        ...style,
        id: uid(),
        text: group.map((w) => w.text).join(' '),
        start,
        duration: Math.max(0.2, Math.min(end, lc.end) - start),
        x: 0.5,
        rotation: 0,
        ...(cs ? { words: group, highlight: { ...cs.highlight }, animIn: 'pop' as const, animOut: 'none' as const } : {}),
      });
    }
  }
  onProgress(videos.length, videos.length);
  return captions;
}

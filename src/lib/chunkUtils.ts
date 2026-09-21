import { CaptionSegment, CaptionWord } from '../types';

/**
 * Re-groups all caption segments into customized chunk sizes
 * (e.g. 1 word per chunk for TikTok fast pacing, 2-3 words, or 5-8 words).
 */
export function rechunkSegments(
  segments: CaptionSegment[],
  wordsPerChunk: number = 3
): CaptionSegment[] {
  if (!segments || segments.length === 0) return [];

  // 1. Flatten all words in chronological order
  const allWords: CaptionWord[] = [];
  for (const seg of segments) {
    for (const word of seg.words) {
      allWords.push(word);
    }
  }

  if (allWords.length === 0) return [];

  // Sort by start timestamp
  allWords.sort((a, b) => a.start - b.start);

  const newSegments: CaptionSegment[] = [];
  const chunkSize = Math.max(1, wordsPerChunk);

  for (let i = 0; i < allWords.length; i += chunkSize) {
    const chunkWords = allWords.slice(i, i + chunkSize);
    if (chunkWords.length === 0) continue;

    const start = chunkWords[0].start;
    const end = chunkWords[chunkWords.length - 1].end;

    newSegments.push({
      id: `chunk_${i}_${Math.random().toString(36).substring(7)}`,
      start,
      end,
      words: chunkWords,
    });
  }

  return newSegments;
}

/**
 * Normalizes word timestamps without adding a synthetic lead or shifting the
 * transcript ahead of the audio. The original word timing remains authoritative.
 */
export function autoAlignTimestamps(
  segments: CaptionSegment[],
  leadOffset: number = 0
): CaptionSegment[] {
  if (!segments || segments.length === 0) return [];

  return segments.map((seg) => {
    const alignedWords: CaptionWord[] = seg.words.map((w) => {
      let start = Math.max(0, Number((w.start + leadOffset).toFixed(3)));
      const end = Math.max(start + 0.05, Number((w.end + leadOffset).toFixed(3)));

      return {
        ...w,
        start,
        end,
      };
    });

    const segStart = alignedWords.length > 0 ? alignedWords[0].start : seg.start;
    const segEnd = alignedWords.length > 0 ? alignedWords[alignedWords.length - 1].end : seg.end;

    return {
      ...seg,
      start: segStart,
      end: segEnd,
      words: alignedWords,
    };
  });
}

/**
 * Shift all timestamps of a segment or entire transcript by a given delta (seconds)
 */
export function shiftTimestamps(
  segments: CaptionSegment[],
  deltaSeconds: number,
  targetSegmentId?: string
): CaptionSegment[] {
  return segments.map((seg) => {
    if (targetSegmentId && seg.id !== targetSegmentId) {
      return seg;
    }

    const shiftedWords: CaptionWord[] = seg.words.map((w) => ({
      ...w,
      start: Math.max(0, Number((w.start + deltaSeconds).toFixed(3))),
      end: Math.max(0.1, Number((w.end + deltaSeconds).toFixed(3))),
    }));

    return {
      ...seg,
      start: Math.max(0, Number((seg.start + deltaSeconds).toFixed(3))),
      end: Math.max(0.1, Number((seg.end + deltaSeconds).toFixed(3))),
      words: shiftedWords,
    };
  });
}

export interface CaptionWord {
  id: string;
  text: string;
  start: number;
  end: number;
  highlightColor?: string; // Custom word highlight color override
  customEmoji?: string; // Custom emoji attached to this word
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  words: CaptionWord[];
}

export type TemplateType =
  | 'hormozi'
  | 'beast'
  | 'ali_abdaal'
  | 'gadzhi'
  | 'jatho'
  | 'pop'
  | 'neon'
  | 'karaoke'
  | 'minimal'
  | 'cinematic'
  | 'comic'
  | 'classic';

export type AspectRatioType = '9:16' | '1:1' | '16:9' | '4:5';

export type WordsPerChunk = 1 | 2 | 3 | 5 | 8; // 1 = word-by-word, 2-3 = modern viral, 5+ = full sentence

export interface EditorSettings {
  template: TemplateType;
  primaryColor: string;
  outlineColor: string;
  backgroundColor: string;
  fontSize: number;
  fontFamily: string;
  yPosition: 'top' | 'middle' | 'bottom';
  yOffsetPercent?: number; // 0% to 100% from top of video for drag/custom positioning
  showEmojis?: boolean; // automatically detect emojis for key words
  wordsPerChunk?: WordsPerChunk; // number of words grouped per screen
  exportQuality?: '1080p' | '720p'; // export quality
  aspectRatio?: AspectRatioType;
  syncOffset?: number; // Timing sync offset in seconds (e.g. -0.2s to +0.2s)
}

export type AssetKind = 'video' | 'image' | 'audio';

export interface MediaAsset {
  id: string;
  kind: AssetKind;
  name: string;
  file: File;
  url: string;
  /** Seconds. Images use 0 because they have no natural duration. */
  duration: number;
  width: number;
  height: number;
  thumbnail?: string;
  /** Filmstrip for the timeline: small frames sampled every `frameInterval` seconds. Videos only. */
  frames?: string[];
  frameInterval?: number;
  hasAudio: boolean;
  /** Normalized (0..1) audio peaks, PEAKS_PER_SECOND per second. */
  peaks?: number[];
  /** Detected beat times in seconds (music). */
  beats?: number[];
  /** Frames per second of a video's picture, for frame stepping and snapping. */
  fps?: number;
  /** What the vision model saw in a video (source seconds, refined to frames). */
  analysis?: VideoAnalysis;
  /** Spoken words with their times (source seconds), once transcribed. */
  transcript?: { text: string; start: number; end: number }[];
}

export interface VideoScene {
  start: number;
  end: number;
  description: string;
  quality: 'good' | 'blurry' | 'dark' | 'shaky' | 'boring';
  interest: number;
}

export interface VideoEvent {
  time: number;
  label: string;
  kind: 'cut' | 'action' | 'impact' | 'expression' | 'appear' | 'text' | 'gesture' | 'speech';
  /** How the time was made frame-accurate. */
  refined?: 'cut' | 'motion' | 'onset' | 'ai' | 'frame';
}

export interface VideoHighlight {
  start: number;
  end: number;
  title: string;
  reason: string;
  score: number;
}

export interface VideoAnalysis {
  summary: string;
  scenes: VideoScene[];
  events: VideoEvent[];
  /** Main subject's position (fractions of the frame), about once a second. */
  subject: { time: number; x: number; y: number }[];
  highlights: VideoHighlight[];
  title: string;
  description: string;
  hashtags: string[];
  thumbnailTime: number;
}

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '3:4';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'fade-black'
  | 'fade-white'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'zoom-in'
  | 'wipe'
  | 'blur'
  | 'slide-down'
  | 'cover-left'
  | 'cover-right'
  | 'zoom-out'
  | 'cross-zoom'
  | 'spin'
  | 'circle'
  | 'diamond'
  | 'heart'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'clock'
  | 'blinds'
  | 'doors'
  | 'whip'
  | 'glitch'
  | 'flash'
  | 'shake'
  | 'squeeze';

export interface Transition {
  type: TransitionType;
  duration: number;
}

export interface Adjustments {
  brightness: number; // percent, 100 = neutral
  contrast: number; // percent, 100 = neutral
  saturation: number; // percent, 100 = neutral
  hue: number; // degrees
  blur: number; // px at base resolution
  sepia: number; // percent
  grayscale: number; // percent
  warmth: number; // -100 (cool) .. 100 (warm)
  vignette: number; // 0..100
}

/** Position/scale state of a clip's frame; animated between two keyframes. */
export interface FrameTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface Keyframe {
  /** Position through the clip, 0..1. */
  at: number;
  tf: FrameTransform;
}

export interface ClipMotion {
  /** Preset that produced the keyframes, for the UI ('custom' when set by hand). */
  preset: string;
  /** Sorted by `at`; at least two. */
  keys: Keyframe[];
}

export interface CropRect {
  x: number; // fractions of the source frame
  y: number;
  w: number;
  h: number;
}

export type ClipAnimType =
  | 'none'
  | 'fade'
  | 'zoom-in'
  | 'zoom-out'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'spin'
  | 'shake'
  | 'pop'
  | 'bounce'
  | 'drop'
  | 'rise'
  | 'swing'
  | 'roll'
  | 'elastic'
  | 'whip-left'
  | 'whip-right';

export interface ClipAnim {
  type: ClipAnimType;
  duration: number;
}

export type EffectType =
  | 'shake'
  | 'zoom-pulse'
  | 'flash'
  | 'glitch'
  | 'rgb-split'
  | 'vhs'
  | 'strobe'
  | 'earthquake'
  | 'heartbeat'
  | 'bounce'
  | 'sway'
  | 'flicker'
  | 'blur-pulse'
  | 'bw-pulse'
  | 'rainbow'
  | 'invert'
  | 'old-film'
  | 'dreamy'
  | 'zoom-shake';

export interface ClipEffect {
  type: EffectType;
  intensity: number; // 0..1
}

export type MaskShape = 'circle' | 'rounded' | 'heart' | 'star' | 'band' | 'triangle' | 'hexagon' | 'diamond' | 'oval' | 'arch';

export interface ClipMask {
  shape: MaskShape;
  size: number; // 0.1..1.5, relative to the frame
}

export interface ChromaKey {
  color: string;
  similarity: number; // 0..1
  smoothness: number; // 0..1
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'difference'
  | 'soft-light';

/** A clip on the main (sequential) video track. */
export interface MainClip {
  id: string;
  assetId: string;
  /** Source in/out points in seconds. For images these just define the duration. */
  inPoint: number;
  outPoint: number;
  speed: number;
  volume: number; // 0..1
  muted: boolean;
  fit: 'contain' | 'cover';
  zoom: number;
  offsetX: number; // fraction of canvas width
  offsetY: number; // fraction of canvas height
  rotation: number; // degrees
  filterId: string;
  adjust: Adjustments;
  /** Transition from the previous clip into this one. Ignored on the first clip. */
  transition: Transition;
  /** Animates the frame transform across the clip; null keeps it static. */
  motion: ClipMotion | null;
  crop: CropRect;
  flipH: boolean;
  flipV: boolean;
  animIn: ClipAnim;
  animOut: ClipAnim;
  effect: ClipEffect | null;
  mask: ClipMask | null;
  chroma: ChromaKey | null;
  /** When set, the clip holds the frame at `inPoint` for this many seconds (a freeze frame). */
  freeze: number | null;
  /** Speed curve preset id; redistributes speed across the clip without changing its length. */
  speedCurve: string | null;
  /** Stacked pro effects (shaders, particles, body), applied in order. */
  fx?: FxLayer[];
}

/** One pro effect in a stack: a PRO_FX id with its settings. */
export interface FxLayer {
  type: string;
  intensity: number; // 0..1
  speed?: number; // 1 = normal
  color?: string;
}

/** An effect on the effects track: applies to everything under it (not texts) for a time. */
export interface EffectItem extends FxLayer {
  id: string;
  start: number;
  duration: number;
}

export type OverlayShape = 'rect' | 'rounded' | 'circle';
export type OverlayAnim = 'none' | 'fade' | 'pop' | 'slide-up';

/** A picture-in-picture image or video placed above the main track. */
export interface OverlayClip {
  id: string;
  assetId: string;
  start: number;
  inPoint: number;
  outPoint: number;
  x: number; // 0..1, centre
  y: number; // 0..1, centre
  scale: number; // width as a fraction of the canvas width
  rotation: number;
  opacity: number; // 0..1
  shape: OverlayShape;
  volume: number;
  muted: boolean;
  animIn: OverlayAnim;
  animOut: OverlayAnim;
  blend: BlendMode;
  flipH: boolean;
  chroma: ChromaKey | null;
  /** Stacked pro effects (e.g. remove background to cut the person out). */
  fx?: FxLayer[];
}

export type TextAnimIn =
  | 'none'
  | 'fade'
  | 'pop'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'
  | 'zoom-in'
  | 'typewriter'
  | 'words'
  | 'wipe'
  | 'bounce'
  | 'elastic'
  | 'blur'
  | 'spin'
  | 'flip'
  | 'drop'
  | 'stamp'
  | 'glitch'
  | 'neon';
export type TextAnimOut =
  | 'none'
  | 'fade'
  | 'pop'
  | 'slide-down'
  | 'slide-up'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'
  | 'wipe'
  | 'blur'
  | 'spin'
  | 'flip'
  | 'fall'
  | 'glitch';
/** Motion that repeats for as long as the text is on screen. */
export type TextAnimLoop = 'none' | 'pulse' | 'shake' | 'wave' | 'float' | 'glow' | 'swing' | 'heartbeat' | 'rainbow' | 'flicker' | 'bounce' | 'jelly';
export type TextBgShape = 'box' | 'pill' | 'banner' | 'outline';

/** Position/size/rotation of a text at a point through its duration (0..1). */
export interface TextKeyframe {
  at: number;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
}

export interface TextClip {
  id: string;
  start: number;
  duration: number;
  text: string;
  font: string;
  fontSize: number; // px at base resolution
  bold: boolean;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  background: string | null;
  shadow: boolean;
  align: 'left' | 'center' | 'right';
  x: number; // 0..1, center of the text block
  y: number; // 0..1
  rotation: number; // degrees
  animIn: TextAnimIn;
  animOut: TextAnimOut;
  /** Word timings (timeline seconds) for animated captions; plain text when absent. */
  words?: { text: string; start: number; end: number }[];
  /** How the spoken word stands out in a word-timed caption. */
  highlight?: CaptionHighlight;
  /** CAPTION_STYLES id the caption was styled with. */
  captionStyle?: string;
  /** Emoji shown above the caption. */
  emoji?: string;
  /**
   * Where an auto caption's words are in the source video, so the caption follows
   * the speech when clips are trimmed, moved or sped up. `hold` is how long the
   * caption stays after its last word.
   */
  src?: { assetId: string; words: { text: string; start: number; end: number }[]; hold: number };
  // Fields added later; absent means the default noted.
  animLoop?: TextAnimLoop; // 'none'
  /** Second fill colour: the text fades from `color` (top) to this (bottom). */
  gradient?: string | null;
  /** Coloured glow around the letters. */
  glow?: string | null;
  shadowColor?: string; // 'rgba(0,0,0,0.6)'
  /** Shadow distance and blur as fractions of the font size. */
  shadowOffset?: number; // 0.05
  shadowBlur?: number; // 0.15
  /** 3D depth as a fraction of the font size (0 = flat). */
  extrude?: number;
  extrudeColor?: string;
  bgShape?: TextBgShape; // 'box'
  opacity?: number; // 1
  lineHeight?: number; // 1.3
  /** Hand-set keyframes; when present they drive x, y, fontSize and rotation. */
  keys?: TextKeyframe[];
}

export type CaptionHighlightStyle =
  | 'none'
  | 'color'
  | 'box'
  | 'pop'
  | 'karaoke'
  | 'beast'
  | 'neon'
  | 'single'
  | 'underline'
  | 'bubble'
  | 'gradient'
  | 'comic'
  | 'reveal'
  | 'bounce'
  | 'outline'
  | 'marker'
  | 'fire'
  | 'shadow'
  | 'spotlight'
  | 'wave'
  | 'slide'
  | 'glitch';

export interface CaptionHighlight {
  style: CaptionHighlightStyle;
  color: string;
}

export interface AudioClip {
  id: string;
  assetId: string;
  start: number;
  inPoint: number;
  outPoint: number;
  volume: number; // 0..1
  fadeIn: number;
  fadeOut: number;
  /** Auto-ducking: quieter (to `level` of its volume) while someone speaks. */
  duck?: { level: number };
}

export interface Project {
  aspect: AspectRatio;
  background: string;
  clips: MainClip[];
  texts: TextClip[];
  audios: AudioClip[];
  overlays: OverlayClip[];
  /** The effects track. */
  effects?: EffectItem[];
}

export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'effect'; id: string }
  | { kind: 'transition'; id: string } // id of the clip the transition leads into
  | null;

export interface LaidOutClip {
  clip: MainClip;
  asset: MediaAsset;
  index: number;
  start: number;
  end: number;
  duration: number;
  /** Effective duration of the incoming transition (0 when none). */
  transitionIn: number;
}

export interface FrameRef {
  lc: LaidOutClip;
  sourceTime: number;
  /** Timeline seconds since the clip's start (negative/over-long inside transition handles). */
  localTime: number;
}

export interface MainFrameState {
  /** The clip whose time range contains t. Its audio is the one heard in preview. */
  primary: FrameRef | null;
  from: FrameRef | null;
  to: FrameRef | null;
  transition: TransitionType;
  progress: number;
}

export interface TextBounds {
  id: string;
  kind: 'text' | 'overlay';
  x: number;
  y: number;
  w: number;
  h: number;
}

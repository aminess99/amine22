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
  /** Normalized (0..1) audio peaks, PEAKS_PER_SECOND per second. Audio assets only. */
  peaks?: number[];
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
  | 'blur';

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

export interface ClipMotion {
  /** Preset that produced the keyframes, for the UI ('custom' when set by hand). */
  preset: string;
  from: FrameTransform;
  to: FrameTransform;
}

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
}

export type TextAnimIn = 'none' | 'fade' | 'pop' | 'slide-up' | 'zoom' | 'typewriter';
export type TextAnimOut = 'none' | 'fade' | 'pop' | 'slide-down';

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
}

export interface Project {
  aspect: AspectRatio;
  background: string;
  clips: MainClip[];
  texts: TextClip[];
  audios: AudioClip[];
  overlays: OverlayClip[];
}

export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'overlay'; id: string }
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

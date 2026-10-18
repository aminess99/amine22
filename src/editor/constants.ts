import { Adjustments, AspectRatio, BlendMode, ClipAnimType, EffectType, FrameTransform, MaskShape, OverlayAnim, TextAnimIn, TextAnimOut, TextClip, TransitionType } from './types';

export const PEAKS_PER_SECOND = 20;
export const DEFAULT_IMAGE_DURATION = 3;
export const MAX_IMAGE_DURATION = 600;
export const MIN_CLIP_DURATION = 0.1;

export const ASPECT_SIZES: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '9:16': { width: 1080, height: 1920, label: 'تيك توك / ريلز' },
  '16:9': { width: 1920, height: 1080, label: 'يوتيوب' },
  '1:1': { width: 1080, height: 1080, label: 'مربع' },
  '4:5': { width: 1080, height: 1350, label: 'منشور إنستغرام' },
  '3:4': { width: 1080, height: 1440, label: 'عمودي' },
};

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  warmth: 0,
  vignette: 0,
};

export interface FilterPreset {
  id: string;
  label: string;
  adjust: Partial<Adjustments>;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'بدون', adjust: {} },
  { id: 'vivid', label: 'حيوي', adjust: { saturation: 145, contrast: 112 } },
  { id: 'warm', label: 'دافئ', adjust: { warmth: 45, saturation: 110 } },
  { id: 'cool', label: 'بارد', adjust: { warmth: -45, brightness: 104 } },
  { id: 'bw', label: 'أبيض وأسود', adjust: { grayscale: 100, contrast: 115 } },
  { id: 'sepia', label: 'بني قديم', adjust: { sepia: 80, contrast: 105 } },
  { id: 'vintage', label: 'كلاسيكي', adjust: { sepia: 35, saturation: 80, contrast: 90, vignette: 45 } },
  { id: 'dramatic', label: 'درامي', adjust: { contrast: 140, saturation: 85, brightness: 92, vignette: 55 } },
  { id: 'fade', label: 'باهت', adjust: { contrast: 80, saturation: 75, brightness: 110 } },
  { id: 'cinema', label: 'سينمائي', adjust: { contrast: 118, saturation: 90, warmth: -15, vignette: 40 } },
  { id: 'sunset', label: 'غروب', adjust: { warmth: 70, saturation: 125, hue: -8 } },
  { id: 'dream', label: 'حالم', adjust: { brightness: 112, blur: 1.5, saturation: 115 } },
];

export function filterPreset(id: string): FilterPreset {
  return FILTER_PRESETS.find((f) => f.id === id) ?? FILTER_PRESETS[0];
}

export function presetAdjustments(id: string): Adjustments {
  return { ...NEUTRAL_ADJUSTMENTS, ...filterPreset(id).adjust };
}

export const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'تلاشي' },
  { id: 'fade-black', label: 'تلاشي للأسود' },
  { id: 'fade-white', label: 'وميض أبيض' },
  { id: 'slide-left', label: 'انزلاق يسار' },
  { id: 'slide-right', label: 'انزلاق يمين' },
  { id: 'slide-up', label: 'انزلاق لأعلى' },
  { id: 'zoom-in', label: 'تكبير' },
  { id: 'wipe', label: 'مسح' },
  { id: 'blur', label: 'ضبابي' },
];

export const DEFAULT_TRANSITION_DURATION = 0.6;

export const FONTS = [
  'Cairo',
  'Tajawal',
  'Almarai',
  'Rubik',
  'Anton',
  'Montserrat',
  'Playfair Display',
  'Cinzel',
  'Inter',
  'Roboto',
];

export const TEXT_ANIMS_IN: { id: TextAnimIn; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'ظهور تدريجي' },
  { id: 'pop', label: 'قفزة' },
  { id: 'slide-up', label: 'صعود' },
  { id: 'zoom', label: 'تصغير' },
  { id: 'typewriter', label: 'آلة كاتبة' },
];

export const TEXT_ANIMS_OUT: { id: TextAnimOut; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'اختفاء تدريجي' },
  { id: 'pop', label: 'انكماش' },
  { id: 'slide-down', label: 'هبوط' },
];

type TextStyle = Omit<TextClip, 'id' | 'start' | 'duration' | 'x' | 'y' | 'rotation'> & { y: number };

export const TEXT_PRESETS: { id: string; label: string; style: TextStyle }[] = [
  {
    id: 'basic',
    label: 'نص عادي',
    style: {
      text: 'اكتب نصك هنا', font: 'Cairo', fontSize: 72, bold: true, color: '#ffffff',
      strokeColor: '#000000', strokeWidth: 0, background: null, shadow: true, align: 'center',
      y: 0.5, animIn: 'fade', animOut: 'fade',
    },
  },
  {
    id: 'title',
    label: 'عنوان كبير',
    style: {
      text: 'عنوان رئيسي', font: 'Rubik', fontSize: 120, bold: true, color: '#ffffff',
      strokeColor: '#000000', strokeWidth: 8, background: null, shadow: false, align: 'center',
      y: 0.3, animIn: 'pop', animOut: 'fade',
    },
  },
  {
    id: 'subtitle',
    label: 'ترجمة',
    style: {
      text: 'سطر الترجمة', font: 'Tajawal', fontSize: 60, bold: true, color: '#ffffff',
      strokeColor: '#000000', strokeWidth: 0, background: 'rgba(0,0,0,0.65)', shadow: false, align: 'center',
      y: 0.8, animIn: 'none', animOut: 'none',
    },
  },
  {
    id: 'highlight',
    label: 'تمييز أصفر',
    style: {
      text: 'معلومة مهمة', font: 'Almarai', fontSize: 80, bold: true, color: '#111111',
      strokeColor: '#000000', strokeWidth: 0, background: '#facc15', shadow: false, align: 'center',
      y: 0.62, animIn: 'slide-up', animOut: 'fade',
    },
  },
  {
    id: 'neon',
    label: 'نيون',
    style: {
      text: 'NEON', font: 'Montserrat', fontSize: 110, bold: true, color: '#f0abfc',
      strokeColor: '#a21caf', strokeWidth: 4, background: null, shadow: true, align: 'center',
      y: 0.45, animIn: 'zoom', animOut: 'pop',
    },
  },
  {
    id: 'typewriter',
    label: 'آلة كاتبة',
    style: {
      text: 'يُكتب حرفاً بحرف...', font: 'Cairo', fontSize: 64, bold: false, color: '#ffffff',
      strokeColor: '#000000', strokeWidth: 0, background: null, shadow: true, align: 'center',
      y: 0.5, animIn: 'typewriter', animOut: 'fade',
    },
  },
  {
    id: 'classic',
    label: 'كلاسيكي',
    style: {
      text: 'Cinematic', font: 'Cinzel', fontSize: 96, bold: true, color: '#fde68a',
      strokeColor: '#000000', strokeWidth: 0, background: null, shadow: true, align: 'center',
      y: 0.5, animIn: 'fade', animOut: 'fade',
    },
  },
  {
    id: 'impact',
    label: 'قوي',
    style: {
      text: 'WOW!', font: 'Anton', fontSize: 150, bold: false, color: '#facc15',
      strokeColor: '#000000', strokeWidth: 10, background: null, shadow: false, align: 'center',
      y: 0.4, animIn: 'pop', animOut: 'pop',
    },
  },
];

export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

/** Two-keyframe motion presets, expressed relative to the clip's own transform. */
export const MOTION_PRESETS: { id: string; label: string; from: Partial<FrameTransform>; to: Partial<FrameTransform> }[] = [
  { id: 'zoom-in', label: 'تقريب بطيء', from: {}, to: { zoom: 1.25 } },
  { id: 'zoom-out', label: 'إبعاد بطيء', from: { zoom: 1.25 }, to: {} },
  { id: 'pan-left', label: 'تحريك لليسار', from: { zoom: 1.2, offsetX: 0.08 }, to: { zoom: 1.2, offsetX: -0.08 } },
  { id: 'pan-right', label: 'تحريك لليمين', from: { zoom: 1.2, offsetX: -0.08 }, to: { zoom: 1.2, offsetX: 0.08 } },
  { id: 'pan-up', label: 'تحريك لأعلى', from: { zoom: 1.2, offsetY: 0.06 }, to: { zoom: 1.2, offsetY: -0.06 } },
  { id: 'pan-down', label: 'تحريك لأسفل', from: { zoom: 1.2, offsetY: -0.06 }, to: { zoom: 1.2, offsetY: 0.06 } },
  { id: 'punch', label: 'تقريب سريع', from: { zoom: 1 }, to: { zoom: 1.5 } },
  { id: 'spin', label: 'دوران خفيف', from: { zoom: 1.15, rotation: -4 }, to: { zoom: 1.15, rotation: 4 } },
];

export const OVERLAY_ANIMS: { id: OverlayAnim; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'تلاشي' },
  { id: 'pop', label: 'قفزة' },
  { id: 'slide-up', label: 'انزلاق' },
];

export const STICKERS: { group: string; items: string[] }[] = [
  { group: 'وجوه', items: ['😂', '😍', '🔥', '😎', '🤯', '😭', '🥳', '😱', '🤔', '👀', '🙌', '👏'] },
  { group: 'رموز', items: ['❤️', '💯', '⭐', '✨', '⚡', '💥', '✅', '❌', '⚠️', '💡', '🎯', '🚀'] },
  { group: 'أسهم وأشكال', items: ['⬅️', '➡️', '⬆️', '⬇️', '↩️', '🔴', '🟡', '🟢', '🔵', '⬛', '⭕', '🔻'] },
  { group: 'مناسبات', items: ['🎉', '🎁', '🎂', '🌙', '🕌', '🏆', '📍', '📢', '🛒', '💰', '📸', '🎬'] },
];

export const CLIP_ANIMS: { id: ClipAnimType; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'تلاشي' },
  { id: 'zoom-in', label: 'تكبير' },
  { id: 'zoom-out', label: 'تصغير' },
  { id: 'slide-left', label: 'من اليمين' },
  { id: 'slide-right', label: 'من اليسار' },
  { id: 'slide-up', label: 'من الأسفل' },
  { id: 'slide-down', label: 'من الأعلى' },
  { id: 'spin', label: 'دوران' },
  { id: 'shake', label: 'اهتزاز' },
];

export const EFFECTS: { id: EffectType; label: string }[] = [
  { id: 'shake', label: 'اهتزاز' },
  { id: 'zoom-pulse', label: 'نبض' },
  { id: 'flash', label: 'وميض' },
  { id: 'glitch', label: 'تشويش' },
  { id: 'rgb-split', label: 'فصل ألوان' },
  { id: 'vhs', label: 'شريط قديم' },
  { id: 'strobe', label: 'ستروب' },
];

export const MASKS: { id: MaskShape; label: string }[] = [
  { id: 'circle', label: 'دائرة' },
  { id: 'rounded', label: 'مستطيل' },
  { id: 'heart', label: 'قلب' },
  { id: 'star', label: 'نجمة' },
  { id: 'band', label: 'شريط' },
];

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'source-over', label: 'عادي' },
  { id: 'screen', label: 'تفتيح (Screen)' },
  { id: 'multiply', label: 'تعتيم (Multiply)' },
  { id: 'overlay', label: 'تراكب' },
  { id: 'soft-light', label: 'ضوء ناعم' },
  { id: 'lighten', label: 'الأفتح' },
  { id: 'darken', label: 'الأغمق' },
  { id: 'color-dodge', label: 'توهج' },
  { id: 'difference', label: 'فرق' },
];

/** Speed multipliers at evenly spaced points through the clip; normalised so the clip keeps its length. */
export const SPEED_CURVES: { id: string; label: string; points: number[] }[] = [
  { id: 'montage', label: 'مونتاج', points: [1.6, 0.5, 1.6, 0.5, 1.6] },
  { id: 'hero', label: 'بطل', points: [1.5, 1.5, 0.25, 1.5, 1.5] },
  { id: 'bullet', label: 'رصاصة', points: [2, 0.3, 0.3, 0.3, 2] },
  { id: 'jump-cut', label: 'قفزة', points: [0.4, 2.5, 0.4, 2.5, 0.4] },
  { id: 'flash-in', label: 'تسارع', points: [0.3, 0.6, 1, 2, 3] },
  { id: 'flash-out', label: 'تباطؤ', points: [3, 2, 1, 0.6, 0.3] },
];

export const CAPTION_STYLES: { id: string; label: string; font: string; color: string; stroke: number; highlight: { style: 'color' | 'box' | 'pop' | 'karaoke'; color: string } }[] = [
  { id: 'hormozi', label: 'هورموزي', font: 'Rubik', color: '#ffffff', stroke: 8, highlight: { style: 'color', color: '#facc15' } },
  { id: 'box', label: 'صندوق', font: 'Cairo', color: '#ffffff', stroke: 0, highlight: { style: 'box', color: '#7c3aed' } },
  { id: 'pop', label: 'قفزة', font: 'Almarai', color: '#ffffff', stroke: 6, highlight: { style: 'pop', color: '#22d3ee' } },
  { id: 'karaoke', label: 'كاريوكي', font: 'Tajawal', color: '#94a3b8', stroke: 4, highlight: { style: 'karaoke', color: '#ffffff' } },
];

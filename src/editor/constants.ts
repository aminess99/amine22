import { Adjustments, AspectRatio, BlendMode, CaptionHighlight, ClipAnimType, EffectType, FrameTransform, MaskShape, OverlayAnim, TextAnimIn, TextAnimLoop, TextAnimOut, TextBgShape, TextClip, TransitionType } from './types';

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
  { id: 'teal-orange', label: 'تركواز وبرتقالي', adjust: { contrast: 115, saturation: 120, warmth: 25, hue: -6, vignette: 25 } },
  { id: 'moody', label: 'كئيب', adjust: { brightness: 88, contrast: 125, saturation: 70, warmth: -20, vignette: 60 } },
  { id: 'golden', label: 'ساعة ذهبية', adjust: { warmth: 60, brightness: 106, saturation: 118, contrast: 105 } },
  { id: 'summer', label: 'صيفي', adjust: { brightness: 108, saturation: 135, warmth: 30 } },
  { id: 'winter', label: 'شتوي', adjust: { warmth: -60, saturation: 80, brightness: 108, contrast: 95 } },
  { id: 'night', label: 'ليلي', adjust: { brightness: 75, contrast: 120, warmth: -50, saturation: 85, vignette: 50 } },
  { id: 'neon', label: 'نيون', adjust: { saturation: 190, contrast: 130, hue: 15 } },
  { id: 'pastel', label: 'باستيل', adjust: { saturation: 70, brightness: 115, contrast: 85 } },
  { id: 'matte', label: 'مطفي', adjust: { contrast: 82, brightness: 104, saturation: 90, sepia: 8 } },
  { id: 'film', label: 'فيلم', adjust: { contrast: 110, saturation: 85, sepia: 15, warmth: 10, vignette: 35 } },
  { id: 'polaroid', label: 'بولارويد', adjust: { brightness: 110, contrast: 90, saturation: 85, warmth: 20, sepia: 12 } },
  { id: 'kodak', label: 'كوداك', adjust: { warmth: 35, contrast: 112, saturation: 112, sepia: 6 } },
  { id: 'noir', label: 'نوار', adjust: { grayscale: 100, contrast: 160, brightness: 90, vignette: 70 } },
  { id: 'silver', label: 'فضي', adjust: { grayscale: 100, brightness: 112, contrast: 95 } },
  { id: 'faded-bw', label: 'أبيض وأسود باهت', adjust: { grayscale: 100, contrast: 80, brightness: 110 } },
  { id: 'cyber', label: 'سايبر', adjust: { hue: 180, saturation: 140, contrast: 120 } },
  { id: 'purple', label: 'بنفسجي', adjust: { hue: -40, saturation: 130, warmth: -10 } },
  { id: 'rose', label: 'وردي', adjust: { hue: -18, warmth: 20, saturation: 115, brightness: 106 } },
  { id: 'forest', label: 'غابة', adjust: { hue: 25, saturation: 120, warmth: -10, contrast: 108 } },
  { id: 'desert', label: 'صحراوي', adjust: { warmth: 75, sepia: 20, saturation: 110, contrast: 108 } },
  { id: 'ocean', label: 'محيط', adjust: { hue: 12, warmth: -40, saturation: 125 } },
  { id: 'retro', label: 'ريترو', adjust: { sepia: 40, saturation: 120, contrast: 115, hue: -10, vignette: 30 } },
  { id: 'hdr', label: 'HDR', adjust: { contrast: 135, saturation: 125, brightness: 102, vignette: 20 } },
  { id: 'soft', label: 'ناعم', adjust: { contrast: 88, brightness: 108, blur: 0.6 } },
  { id: 'bright', label: 'مشرق', adjust: { brightness: 120, saturation: 110 } },
  { id: 'food', label: 'طعام', adjust: { warmth: 30, saturation: 130, contrast: 110, brightness: 105 } },
  { id: 'portrait', label: 'بورتريه', adjust: { warmth: 15, saturation: 95, contrast: 105, brightness: 106, vignette: 25 } },
  { id: 'dramatic-bw', label: 'درامي أبيض وأسود', adjust: { grayscale: 100, contrast: 145, vignette: 60 } },
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
  { id: 'slide-down', label: 'انزلاق لأسفل' },
  { id: 'cover-left', label: 'تغطية يسار' },
  { id: 'cover-right', label: 'تغطية يمين' },
  { id: 'zoom-out', label: 'تصغير' },
  { id: 'cross-zoom', label: 'تكبير متقاطع' },
  { id: 'spin', label: 'دوران' },
  { id: 'circle', label: 'دائرة' },
  { id: 'diamond', label: 'معيّن' },
  { id: 'heart', label: 'قلب' },
  { id: 'wipe-right', label: 'مسح من اليمين' },
  { id: 'wipe-up', label: 'مسح لأعلى' },
  { id: 'wipe-down', label: 'مسح لأسفل' },
  { id: 'clock', label: 'ساعة' },
  { id: 'blinds', label: 'ستائر' },
  { id: 'doors', label: 'أبواب' },
  { id: 'whip', label: 'سحب سريع' },
  { id: 'glitch', label: 'تشويش' },
  { id: 'flash', label: 'وميض' },
  { id: 'shake', label: 'اهتزاز' },
  { id: 'squeeze', label: 'ضغط' },
];

export const DEFAULT_TRANSITION_DURATION = 0.6;

export const TEXT_ANIMS_IN: { id: TextAnimIn; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'ظهور' },
  { id: 'pop', label: 'قفزة' },
  { id: 'slide-up', label: 'صعود' },
  { id: 'slide-down', label: 'نزول' },
  { id: 'slide-left', label: 'من اليمين' },
  { id: 'slide-right', label: 'من اليسار' },
  { id: 'zoom', label: 'تصغير' },
  { id: 'zoom-in', label: 'تكبير' },
  { id: 'typewriter', label: 'آلة كاتبة' },
  { id: 'words', label: 'كلمة بكلمة' },
  { id: 'wipe', label: 'مسح' },
  { id: 'bounce', label: 'ارتداد' },
  { id: 'elastic', label: 'مطاطي' },
  { id: 'blur', label: 'ضبابي' },
  { id: 'spin', label: 'دوران' },
  { id: 'flip', label: 'قلب' },
  { id: 'drop', label: 'سقوط' },
  { id: 'stamp', label: 'ختم' },
  { id: 'glitch', label: 'تشويش' },
  { id: 'neon', label: 'نيون' },
];

export const TEXT_ANIMS_OUT: { id: TextAnimOut; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'اختفاء' },
  { id: 'pop', label: 'انكماش' },
  { id: 'slide-down', label: 'هبوط' },
  { id: 'slide-up', label: 'صعود' },
  { id: 'slide-left', label: 'لليسار' },
  { id: 'slide-right', label: 'لليمين' },
  { id: 'zoom', label: 'تكبير' },
  { id: 'wipe', label: 'مسح' },
  { id: 'blur', label: 'ضبابي' },
  { id: 'spin', label: 'دوران' },
  { id: 'flip', label: 'قلب' },
  { id: 'fall', label: 'سقوط' },
  { id: 'glitch', label: 'تشويش' },
];

export const TEXT_ANIMS_LOOP: { id: TextAnimLoop; label: string }[] = [
  { id: 'none', label: 'بدون' },
  { id: 'pulse', label: 'نبض' },
  { id: 'heartbeat', label: 'نبض قلب' },
  { id: 'shake', label: 'اهتزاز' },
  { id: 'wave', label: 'موجة' },
  { id: 'float', label: 'طفو' },
  { id: 'bounce', label: 'قفز' },
  { id: 'swing', label: 'تأرجح' },
  { id: 'jelly', label: 'جيلي' },
  { id: 'glow', label: 'توهج' },
  { id: 'flicker', label: 'وميض' },
  { id: 'rainbow', label: 'قوس قزح' },
];

export const TEXT_BG_SHAPES: { id: TextBgShape; label: string }[] = [
  { id: 'box', label: 'مستطيل' },
  { id: 'pill', label: 'كبسولة' },
  { id: 'banner', label: 'شريط' },
  { id: 'outline', label: 'إطار' },
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
  { id: 'zoom-in-big', label: 'تقريب كبير', from: {}, to: { zoom: 1.6 } },
  { id: 'zoom-out-big', label: 'إبعاد كبير', from: { zoom: 1.6 }, to: {} },
  { id: 'diag-down', label: 'قطري لأسفل', from: { zoom: 1.25, offsetX: 0.06, offsetY: 0.05 }, to: { zoom: 1.25, offsetX: -0.06, offsetY: -0.05 } },
  { id: 'diag-up', label: 'قطري لأعلى', from: { zoom: 1.25, offsetX: -0.06, offsetY: -0.05 }, to: { zoom: 1.25, offsetX: 0.06, offsetY: 0.05 } },
  { id: 'tilt-left', label: 'ميلان يسار', from: { zoom: 1.15, rotation: 0 }, to: { zoom: 1.2, rotation: -6 } },
  { id: 'tilt-right', label: 'ميلان يمين', from: { zoom: 1.15, rotation: 0 }, to: { zoom: 1.2, rotation: 6 } },
  { id: 'push-up', label: 'دفع لأعلى', from: { zoom: 1 }, to: { zoom: 1.3, offsetY: 0.05 } },
  { id: 'drift', label: 'انجراف', from: { zoom: 1.1, offsetX: -0.03 }, to: { zoom: 1.12, offsetX: 0.03 } },
  { id: 'rotate-zoom', label: 'دوران وتقريب', from: { zoom: 1 }, to: { zoom: 1.35, rotation: 10 } },
  { id: 'unwind', label: 'فك الدوران', from: { zoom: 1.35, rotation: -10 }, to: {} },
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
  { group: 'أيدي', items: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '🙏', '💪', '👉', '👈', '👆', '👇'] },
  { group: 'قلوب', items: ['💖', '💕', '💔', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💘', '💝'] },
  { group: 'طعام', items: ['🍕', '🍔', '🍟', '🌮', '🍩', '🍰', '🍫', '☕', '🍵', '🥤', '🍉', '🍓'] },
  { group: 'طبيعة', items: ['☀️', '🌈', '🌊', '🌸', '🌴', '🍀', '❄️', '🔥', '⛈️', '🌍', '🌻', '🦋'] },
  { group: 'رياضة', items: ['⚽', '🏀', '🎾', '🏋️', '🏃', '🚴', '🥇', '🎮', '🎯', '🏁', '⛳', '🥊'] },
  { group: 'سفر', items: ['✈️', '🚗', '🏖️', '🏔️', '🗺️', '🧳', '🏨', '🚀', '🚢', '🏝️', '🗽', '🕋'] },
  { group: 'تقنية', items: ['📱', '💻', '⌚', '🎧', '📷', '🎥', '🔋', '💾', '🖥️', '🕹️', '📡', '🤖'] },
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
  { id: 'pop', label: 'قفزة' },
  { id: 'bounce', label: 'ارتداد' },
  { id: 'drop', label: 'سقوط' },
  { id: 'rise', label: 'صعود' },
  { id: 'swing', label: 'تأرجح' },
  { id: 'roll', label: 'تدحرج' },
  { id: 'elastic', label: 'مطاطي' },
  { id: 'whip-left', label: 'سحب يسار' },
  { id: 'whip-right', label: 'سحب يمين' },
];

export const EFFECTS: { id: EffectType; label: string }[] = [
  { id: 'shake', label: 'اهتزاز' },
  { id: 'zoom-pulse', label: 'نبض' },
  { id: 'flash', label: 'وميض' },
  { id: 'glitch', label: 'تشويش' },
  { id: 'rgb-split', label: 'فصل ألوان' },
  { id: 'vhs', label: 'شريط قديم' },
  { id: 'strobe', label: 'ستروب' },
  { id: 'earthquake', label: 'زلزال' },
  { id: 'zoom-shake', label: 'تقريب واهتزاز' },
  { id: 'heartbeat', label: 'نبض قلب' },
  { id: 'bounce', label: 'نطّ' },
  { id: 'sway', label: 'تمايل' },
  { id: 'flicker', label: 'رمش' },
  { id: 'blur-pulse', label: 'ضبابية نابضة' },
  { id: 'bw-pulse', label: 'أبيض وأسود نابض' },
  { id: 'rainbow', label: 'قوس قزح' },
  { id: 'invert', label: 'عكس الألوان' },
  { id: 'old-film', label: 'فيلم قديم' },
  { id: 'dreamy', label: 'حلم' },
];

export const MASKS: { id: MaskShape; label: string }[] = [
  { id: 'circle', label: 'دائرة' },
  { id: 'rounded', label: 'مستطيل' },
  { id: 'heart', label: 'قلب' },
  { id: 'star', label: 'نجمة' },
  { id: 'band', label: 'شريط' },
  { id: 'triangle', label: 'مثلث' },
  { id: 'hexagon', label: 'سداسي' },
  { id: 'diamond', label: 'معيّن' },
  { id: 'oval', label: 'بيضاوي' },
  { id: 'arch', label: 'نافذة' },
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
  { id: 'slow-mid', label: 'بطء في الوسط', points: [2, 1.2, 0.3, 1.2, 2] },
  { id: 'fast-mid', label: 'سرعة في الوسط', points: [0.5, 1.5, 3, 1.5, 0.5] },
  { id: 'pulse', label: 'نبض', points: [2, 0.4, 2, 0.4, 2, 0.4, 2] },
  { id: 'ramp-up', label: 'تصاعد', points: [0.5, 0.7, 1, 1.5, 2.2] },
  { id: 'ramp-down', label: 'تنازل', points: [2.2, 1.5, 1, 0.7, 0.5] },
];

export interface CaptionStyle {
  id: string;
  label: string;
  font: string;
  fontSize: number;
  bold: boolean;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  background: string | null;
  highlight: CaptionHighlight;
}

/** Word-timed caption looks, shared by auto captions, the restyle panel and their previews. */
export const CAPTION_STYLES: CaptionStyle[] = [
  { id: 'plain', label: 'ترجمة', font: 'Tajawal', fontSize: 62, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: 'rgba(0,0,0,0.65)', highlight: { style: 'none', color: '#ffffff' } },
  { id: 'hormozi', label: 'هورموزي', font: 'Rubik', fontSize: 84, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: false, background: null, highlight: { style: 'color', color: '#facc15' } },
  { id: 'beast', label: 'MrBeast', font: 'Rubik', fontSize: 96, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 10, shadow: true, background: null, highlight: { style: 'beast', color: '#facc15' } },
  { id: 'single', label: 'كلمة واحدة', font: 'Rubik', fontSize: 120, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 10, shadow: true, background: null, highlight: { style: 'single', color: '#facc15' } },
  { id: 'box', label: 'صندوق', font: 'Cairo', fontSize: 76, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'box', color: '#7c3aed' } },
  { id: 'pop', label: 'قفزة', font: 'Almarai', fontSize: 78, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, shadow: false, background: null, highlight: { style: 'pop', color: '#22d3ee' } },
  { id: 'karaoke', label: 'كاريوكي', font: 'Tajawal', fontSize: 76, bold: true, color: '#94a3b8', strokeColor: '#000000', strokeWidth: 4, shadow: false, background: null, highlight: { style: 'karaoke', color: '#ffffff' } },
  { id: 'neon', label: 'نيون', font: 'Cairo', fontSize: 78, bold: true, color: '#f5d0fe', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: null, highlight: { style: 'neon', color: '#e879f9' } },
  { id: 'underline', label: 'تسطير', font: 'Almarai', fontSize: 74, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'underline', color: '#f97316' } },
  { id: 'bubble', label: 'فقاعة', font: 'Cairo', fontSize: 70, bold: true, color: '#111827', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: null, highlight: { style: 'bubble', color: '#facc15' } },
  { id: 'gradient', label: 'تدرّج', font: 'Rubik', fontSize: 82, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, shadow: false, background: null, highlight: { style: 'gradient', color: '#f472b6' } },
  { id: 'comic', label: 'كوميك', font: 'Rubik', fontSize: 84, bold: true, color: '#fde047', strokeColor: '#000000', strokeWidth: 9, shadow: false, background: null, highlight: { style: 'comic', color: '#fb923c' } },
  { id: 'cinematic', label: 'سينمائي', font: 'Tajawal', fontSize: 56, bold: false, color: '#f8fafc', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'none', color: '#ffffff' } },
  { id: 'reveal', label: 'ظهور الكلمات', font: 'Cairo', fontSize: 80, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 7, shadow: false, background: null, highlight: { style: 'reveal', color: '#facc15' } },
  { id: 'bounce', label: 'قفز', font: 'Rubik', fontSize: 86, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: false, background: null, highlight: { style: 'bounce', color: '#4ade80' } },
  { id: 'outline', label: 'مفرّغ', font: 'Lalezar', fontSize: 96, bold: false, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: null, highlight: { style: 'outline', color: '#ffffff' } },
  { id: 'marker', label: 'قلم تحديد', font: 'Almarai', fontSize: 76, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 5, shadow: false, background: null, highlight: { style: 'marker', color: '#eab308' } },
  { id: 'fire', label: 'نار', font: 'Lalezar', fontSize: 98, bold: false, color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: false, background: null, highlight: { style: 'fire', color: '#f97316' } },
  { id: 'shadow3d', label: 'ظل ثلاثي', font: 'Rubik', fontSize: 90, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'shadow', color: '#ec4899' } },
  { id: 'spotlight', label: 'تسليط', font: 'Tajawal', fontSize: 82, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 4, shadow: true, background: null, highlight: { style: 'spotlight', color: '#ffffff' } },
  { id: 'wave', label: 'موجة', font: 'Changa', fontSize: 80, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, shadow: false, background: null, highlight: { style: 'wave', color: '#38bdf8' } },
  { id: 'slide', label: 'صعود', font: 'Cairo', fontSize: 80, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'slide', color: '#a3e635' } },
  { id: 'glitch', label: 'تشويش', font: 'Changa', fontSize: 84, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 5, shadow: false, background: null, highlight: { style: 'glitch', color: '#22d3ee' } },
  { id: 'green', label: 'أخضر قوي', font: 'Lalezar', fontSize: 96, bold: false, color: '#ffffff', strokeColor: '#000000', strokeWidth: 9, shadow: false, background: null, highlight: { style: 'color', color: '#22c55e' } },
  { id: 'minimal', label: 'بسيط', font: 'Readex Pro', fontSize: 64, bold: true, color: '#94a3b8', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'karaoke', color: '#ffffff' } },
  { id: 'ruqaa', label: 'رقعة', font: 'Aref Ruqaa', fontSize: 88, bold: true, color: '#fef3c7', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'color', color: '#f59e0b' } },
  { id: 'kufi-box', label: 'كوفي أحمر', font: 'Reem Kufi', fontSize: 78, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: true, background: null, highlight: { style: 'box', color: '#dc2626' } },
  { id: 'pink-pop', label: 'وردي', font: 'Baloo Bhaijaan 2', fontSize: 84, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, shadow: false, background: null, highlight: { style: 'pop', color: '#f472b6' } },
  { id: 'gold-karaoke', label: 'كاريوكي ذهبي', font: 'Amiri', fontSize: 86, bold: true, color: '#a8a29e', strokeColor: '#000000', strokeWidth: 3, shadow: true, background: null, highlight: { style: 'karaoke', color: '#fbbf24' } },
  { id: 'news', label: 'أخبار', font: 'Tajawal', fontSize: 62, bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: 'rgba(185,28,28,0.92)', highlight: { style: 'none', color: '#ffffff' } },
  { id: 'yellow-sub', label: 'ترجمة صفراء', font: 'Cairo', fontSize: 70, bold: true, color: '#facc15', strokeColor: '#000000', strokeWidth: 5, shadow: false, background: null, highlight: { style: 'none', color: '#facc15' } },
  { id: 'bubble-blue', label: 'فقاعة زرقاء', font: 'Cairo', fontSize: 70, bold: true, color: '#0f172a', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: null, highlight: { style: 'bubble', color: '#38bdf8' } },
  { id: 'neon-green', label: 'نيون أخضر', font: 'Reem Kufi', fontSize: 80, bold: true, color: '#dcfce7', strokeColor: '#000000', strokeWidth: 0, shadow: false, background: null, highlight: { style: 'neon', color: '#4ade80' } },
];

/** The look fields a caption style sets on a text clip (position and timing are left alone). */
export function captionStyleFields(id: string) {
  const cs = CAPTION_STYLES.find((c) => c.id === id) ?? CAPTION_STYLES[1];
  return {
    captionStyle: cs.id,
    font: cs.font,
    fontSize: cs.fontSize,
    bold: cs.bold,
    color: cs.color,
    strokeColor: cs.strokeColor,
    strokeWidth: cs.strokeWidth,
    shadow: cs.shadow,
    background: cs.background,
    highlight: { ...cs.highlight },
  };
}

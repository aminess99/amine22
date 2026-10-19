import { FxLayer } from './types';

/** The pro effects catalog (no browser code, so the server can build prompts from it). */

export type FxGroup = 'lens' | 'distort' | 'light' | 'retro' | 'art' | 'motion' | 'particles' | 'split' | 'body';

export const FX_GROUPS: { id: FxGroup; label: string }[] = [
  { id: 'body', label: 'الجسم (ذكاء اصطناعي)' },
  { id: 'particles', label: 'جزيئات' },
  { id: 'light', label: 'أضواء' },
  { id: 'lens', label: 'عدسة' },
  { id: 'distort', label: 'تشويه' },
  { id: 'retro', label: 'ريترو' },
  { id: 'art', label: 'فني' },
  { id: 'motion', label: 'حركة' },
  { id: 'split', label: 'تقسيم الشاشة' },
];

export interface ProFxDef {
  id: string;
  label: string;
  group: FxGroup;
  /** Default colour for effects that use one. */
  color?: string;
}

export const PRO_FX: ProFxDef[] = [
  // body (person segmentation)
  { id: 'bg-remove', label: 'إزالة الخلفية', group: 'body' },
  { id: 'bg-blur', label: 'تمويه الخلفية', group: 'body' },
  { id: 'bg-color', label: 'خلفية ملونة', group: 'body', color: '#22c55e' },
  { id: 'bg-bw', label: 'لون الشخص فقط', group: 'body' },
  { id: 'body-glow', label: 'توهج حول الشخص', group: 'body', color: '#22d3ee' },
  { id: 'body-outline', label: 'إطار ملصق', group: 'body', color: '#ffffff' },
  { id: 'clone', label: 'نسخ الشخص', group: 'body' },
  // particles
  { id: 'snow', label: 'ثلج', group: 'particles' },
  { id: 'rain', label: 'مطر', group: 'particles' },
  { id: 'confetti', label: 'قصاصات', group: 'particles' },
  { id: 'hearts', label: 'قلوب', group: 'particles', color: '#ec4899' },
  { id: 'sparkles', label: 'لمعان', group: 'particles', color: '#fff7cc' },
  { id: 'bokeh', label: 'بوكيه', group: 'particles' },
  { id: 'fireworks', label: 'ألعاب نارية', group: 'particles' },
  { id: 'dust', label: 'غبار فيلم', group: 'particles' },
  { id: 'light-rays', label: 'أشعة ضوء', group: 'particles' },
  { id: 'stars', label: 'نجوم', group: 'particles', color: '#ffffff' },
  { id: 'bubbles', label: 'فقاعات', group: 'particles' },
  { id: 'petals', label: 'بتلات', group: 'particles' },
  // light
  { id: 'bloom', label: 'توهج', group: 'light' },
  { id: 'neon-edges', label: 'حواف نيون', group: 'light', color: '#22d3ee' },
  { id: 'light-leak', label: 'تسرّب ضوء', group: 'light' },
  { id: 'lens-flare', label: 'وهج عدسة', group: 'light' },
  // lens
  { id: 'fisheye', label: 'عين السمكة', group: 'lens' },
  { id: 'mirror', label: 'مرآة', group: 'lens' },
  { id: 'kaleido', label: 'كاليدوسكوب', group: 'lens' },
  { id: 'magnify', label: 'عدسة مكبرة', group: 'lens' },
  // distort
  { id: 'ripple', label: 'تموّج', group: 'distort' },
  { id: 'swirl', label: 'دوامة', group: 'distort' },
  { id: 'wave', label: 'موجة', group: 'distort' },
  { id: 'pixelate', label: 'بكسلة', group: 'distort' },
  // retro
  { id: 'film-grain', label: 'حبيبات فيلم', group: 'retro' },
  { id: 'crt', label: 'شاشة قديمة', group: 'retro' },
  { id: 'vhs-pro', label: 'VHS', group: 'retro' },
  // art
  { id: 'cartoon', label: 'كرتون', group: 'art' },
  { id: 'halftone', label: 'نقاط طباعة', group: 'art' },
  { id: 'duotone', label: 'لونان', group: 'art', color: '#f472b6' },
  { id: 'thermal', label: 'حراري', group: 'art' },
  { id: 'sketch', label: 'رسم بالقلم', group: 'art' },
  { id: 'posterize', label: 'ملصق', group: 'art' },
  // motion
  { id: 'motion-blur', label: 'ضبابية حركة', group: 'motion' },
  { id: 'radial-blur', label: 'تقريب ضبابي', group: 'motion' },
  { id: 'chromatic', label: 'انحراف لوني', group: 'motion' },
  // split
  { id: 'split-2', label: 'نسختان', group: 'split' },
  { id: 'split-3', label: '3 نسخ', group: 'split' },
  { id: 'split-4', label: '4 نسخ', group: 'split' },
  { id: 'split-9', label: '9 نسخ', group: 'split' },
];

export const fxDef = (id: string) => PRO_FX.find((f) => f.id === id);
export const isProFx = (id: unknown): id is string => typeof id === 'string' && PRO_FX.some((f) => f.id === id);

/** A new effect layer with sensible defaults. */
export function newFxLayer(type: string, intensity = 0.7): FxLayer {
  return { type, intensity, speed: 1, color: fxDef(type)?.color };
}

import { TEXT_PRESETS } from './constants';
import { uid } from './timeline';
import { TextClip } from './types';

/** One text of a template; timing is relative to where the template is dropped. */
type TemplateItem = Partial<Omit<TextClip, 'id' | 'start'>> & { text: string; delay?: number };

export interface TextTemplate {
  id: string;
  label: string;
  group: TemplateGroup;
  duration: number;
  items: TemplateItem[];
}

export type TemplateGroup = 'titles' | 'social' | 'info' | 'quotes' | 'offers';

export const TEMPLATE_GROUPS: { id: TemplateGroup; label: string }[] = [
  { id: 'titles', label: 'عناوين' },
  { id: 'social', label: 'سوشيال' },
  { id: 'info', label: 'معلومات' },
  { id: 'quotes', label: 'اقتباسات' },
  { id: 'offers', label: 'عروض' },
];

const BLACK = '#000000';
const WHITE = '#ffffff';

export const TEXT_TEMPLATES: TextTemplate[] = [
  // ---- titles
  { id: 'big-pop', label: 'عنوان قفزة', group: 'titles', duration: 3, items: [{ text: 'عنوان رائع', font: 'Lalezar', fontSize: 150, strokeWidth: 10, strokeColor: BLACK, extrude: 0.08, extrudeColor: '#7c3aed', animIn: 'pop', animOut: 'pop', animLoop: 'pulse' }] },
  { id: 'neon-sign', label: 'لافتة نيون', group: 'titles', duration: 3, items: [{ text: 'نيون', font: 'Reem Kufi', fontSize: 150, color: '#fdf4ff', glow: '#e879f9', animIn: 'neon', animOut: 'fade', animLoop: 'flicker' }] },
  { id: 'gold-3d', label: 'ذهبي ثلاثي', group: 'titles', duration: 3, items: [{ text: 'ذهبي', font: 'Rakkas', fontSize: 170, color: '#fde047', gradient: '#f59e0b', extrude: 0.12, extrudeColor: '#78350f', animIn: 'drop', animOut: 'fall' }] },
  { id: 'cinema', label: 'سينمائي', group: 'titles', duration: 3.5, items: [{ text: 'في يوم من الأيام', font: 'Amiri', fontSize: 110, bold: true, shadow: true, shadowBlur: 0.4, shadowOffset: 0, animIn: 'blur', animOut: 'blur' }] },
  { id: 'glitch', label: 'تشويش', group: 'titles', duration: 3, items: [{ text: 'تشويش', font: 'Changa', fontSize: 140, animIn: 'glitch', animOut: 'glitch' }] },
  { id: 'ruqaa', label: 'خط رقعة', group: 'titles', duration: 3, items: [{ text: 'بسم الله نبدأ', font: 'Aref Ruqaa', fontSize: 130, color: '#fff7ed', shadow: true, animIn: 'wipe', animOut: 'fade' }] },
  { id: 'kufi-stamp', label: 'ختم كوفي', group: 'titles', duration: 3, items: [{ text: 'حصري', font: 'Kufam', fontSize: 120, background: '#dc2626', rotation: -6, animIn: 'stamp', animOut: 'fade' }] },
  { id: 'gradient-wave', label: 'تدرّج متموج', group: 'titles', duration: 3, items: [{ text: 'موجة ألوان', font: 'Blaka', fontSize: 140, color: '#22d3ee', gradient: '#a855f7', animIn: 'elastic', animOut: 'zoom', animLoop: 'wave' }] },
  { id: 'rainbow', label: 'قوس قزح', group: 'titles', duration: 3, items: [{ text: 'رائع جداً', font: 'Jomhuria', fontSize: 200, strokeWidth: 6, strokeColor: BLACK, animIn: 'bounce', animOut: 'pop', animLoop: 'rainbow' }] },
  {
    id: 'two-line', label: 'عنوان وسطر', group: 'titles', duration: 3.5, items: [
      { text: 'العنوان الرئيسي', font: 'Cairo', fontSize: 110, y: 0.46, strokeWidth: 6, strokeColor: BLACK, animIn: 'slide-up', animOut: 'fade' },
      { text: 'اكتب العنوان الفرعي هنا', font: 'Tajawal', fontSize: 56, color: '#e2e8f0', y: 0.54, delay: 0.3, animIn: 'words', animOut: 'fade' },
    ],
  },

  // ---- social
  { id: 'subscribe', label: 'اشترك', group: 'social', duration: 3, items: [{ text: 'اشترك الآن 🔔', font: 'Cairo', fontSize: 70, background: '#dc2626', bgShape: 'pill', y: 0.82, animIn: 'pop', animOut: 'pop', animLoop: 'pulse' }] },
  { id: 'follow', label: 'تابعني', group: 'social', duration: 3, items: [{ text: 'تابعني للمزيد 👆', font: 'Almarai', fontSize: 66, background: '#111827', bgShape: 'pill', y: 0.84, animIn: 'slide-up', animOut: 'slide-down', animLoop: 'bounce' }] },
  { id: 'like', label: 'لايك', group: 'social', duration: 3, items: [{ text: '❤️ لايك', font: 'Cairo', fontSize: 72, background: '#ec4899', bgShape: 'pill', y: 0.8, animIn: 'elastic', animOut: 'pop', animLoop: 'heartbeat' }] },
  { id: 'wait-end', label: 'انتظر للنهاية', group: 'social', duration: 3, items: [{ text: 'انتظر للنهاية ⏳', font: 'Lalezar', fontSize: 100, color: '#facc15', strokeWidth: 8, strokeColor: BLACK, y: 0.18, animIn: 'stamp', animOut: 'fade', animLoop: 'shake' }] },
  { id: 'comment', label: 'اكتب تعليقك', group: 'social', duration: 3, items: [{ text: 'اكتب رأيك في التعليقات 💬', font: 'Almarai', fontSize: 58, color: '#111827', background: WHITE, bgShape: 'pill', shadow: false, y: 0.8, animIn: 'slide-left', animOut: 'slide-right' }] },
  { id: 'link-bio', label: 'الرابط في البايو', group: 'social', duration: 3, items: [{ text: 'الرابط في البايو 🔗', font: 'Changa', fontSize: 66, background: '#2563eb', bgShape: 'banner', y: 0.85, animIn: 'wipe', animOut: 'wipe' }] },
  { id: 'part', label: 'الجزء 2', group: 'social', duration: 2.5, items: [{ text: 'الجزء 2', font: 'Rakkas', fontSize: 120, background: '#7c3aed', y: 0.15, animIn: 'flip', animOut: 'flip' }] },

  // ---- info
  {
    id: 'lower-third', label: 'اسم ولقب', group: 'info', duration: 4, items: [
      { text: 'محمد أحمد', font: 'Cairo', fontSize: 70, background: '#0ea5e9', bgShape: 'banner', shadow: false, y: 0.77, animIn: 'slide-left', animOut: 'slide-right' },
      { text: 'صانع محتوى', font: 'Tajawal', fontSize: 44, color: '#0f172a', background: WHITE, shadow: false, y: 0.835, delay: 0.25, animIn: 'slide-left', animOut: 'slide-right' },
    ],
  },
  { id: 'location', label: 'الموقع', group: 'info', duration: 3, items: [{ text: '📍 الدار البيضاء', font: 'Almarai', fontSize: 60, background: 'rgba(0,0,0,0.55)', bgShape: 'pill', y: 0.12, animIn: 'fade', animOut: 'fade' }] },
  {
    id: 'step', label: 'خطوة', group: 'info', duration: 3.5, items: [
      { text: '1', font: 'Lalezar', fontSize: 170, color: '#facc15', strokeWidth: 8, strokeColor: BLACK, y: 0.4, animIn: 'pop', animOut: 'fade' },
      { text: 'الخطوة الأولى', font: 'Cairo', fontSize: 72, y: 0.52, delay: 0.2, animIn: 'words', animOut: 'fade' },
    ],
  },
  {
    id: 'tip', label: 'نصيحة', group: 'info', duration: 4, items: [
      { text: '💡 نصيحة', font: 'Kufam', fontSize: 66, color: '#fde047', y: 0.3, animIn: 'pop', animOut: 'fade', animLoop: 'glow' },
      { text: 'اكتب نصيحتك هنا', font: 'Tajawal', fontSize: 56, background: 'rgba(0,0,0,0.6)', y: 0.38, delay: 0.3, animIn: 'typewriter', animOut: 'fade' },
    ],
  },
  { id: 'date', label: 'تاريخ', group: 'info', duration: 3, items: [{ text: '١٨ أكتوبر ٢٠٢٦', font: 'Reem Kufi', fontSize: 70, background: WHITE, bgShape: 'outline', y: 0.15, animIn: 'wipe', animOut: 'fade' }] },
  {
    id: 'breaking', label: 'عاجل', group: 'info', duration: 4, items: [
      { text: 'عاجل', font: 'Cairo', fontSize: 64, background: '#dc2626', shadow: false, y: 0.8, animIn: 'pop', animOut: 'fade', animLoop: 'flicker' },
      { text: 'اكتب الخبر هنا', font: 'Tajawal', fontSize: 54, background: '#111827', bgShape: 'banner', shadow: false, y: 0.87, delay: 0.2, animIn: 'wipe', animOut: 'wipe' },
    ],
  },

  // ---- quotes
  {
    id: 'quote', label: 'اقتباس', group: 'quotes', duration: 4.5, items: [
      { text: '«اكتب الاقتباس هنا»', font: 'Amiri', fontSize: 84, bold: true, lineHeight: 1.5, y: 0.47, animIn: 'words', animOut: 'fade' },
      { text: '— اسم القائل', font: 'Tajawal', fontSize: 44, color: '#cbd5e1', y: 0.58, delay: 0.9, animIn: 'fade', animOut: 'fade' },
    ],
  },
  { id: 'wisdom', label: 'حكمة', group: 'quotes', duration: 4, items: [{ text: 'العلم نور', font: 'Scheherazade New', fontSize: 110, bold: true, color: '#fef3c7', glow: '#f59e0b', animIn: 'blur', animOut: 'fade' }] },
  { id: 'note', label: 'ملاحظة', group: 'quotes', duration: 4, items: [{ text: 'ملاحظة مهمة', font: 'Noto Naskh Arabic', fontSize: 64, bold: true, color: '#111827', background: '#fef08a', shadow: false, rotation: -3, animIn: 'typewriter', animOut: 'fade' }] },
  { id: 'handwritten', label: 'بخط اليد', group: 'quotes', duration: 3.5, items: [{ text: 'يوم جميل', font: 'Marhey', fontSize: 110, bold: true, animIn: 'wipe', animOut: 'fade', animLoop: 'float' }] },
  { id: 'nastaliq', label: 'نستعليق', group: 'quotes', duration: 4, items: [{ text: 'الصبر مفتاح الفرج', font: 'Noto Nastaliq Urdu', fontSize: 80, lineHeight: 2, shadow: true, animIn: 'fade', animOut: 'fade' }] },

  // ---- offers
  { id: 'sale', label: 'تخفيض', group: 'offers', duration: 3, items: [{ text: 'تخفيض 50%', font: 'Lalezar', fontSize: 140, background: '#dc2626', rotation: -4, animIn: 'stamp', animOut: 'pop', animLoop: 'pulse' }] },
  {
    id: 'price', label: 'السعر', group: 'offers', duration: 3.5, items: [
      { text: 'السعر', font: 'Tajawal', fontSize: 56, y: 0.43, animIn: 'fade', animOut: 'fade' },
      { text: '99 درهم', font: 'Rakkas', fontSize: 140, color: '#facc15', extrude: 0.08, extrudeColor: '#92400e', y: 0.52, delay: 0.2, animIn: 'bounce', animOut: 'pop' },
    ],
  },
  { id: 'new', label: 'جديد', group: 'offers', duration: 3, items: [{ text: 'جديد ✨', font: 'Changa', fontSize: 90, color: '#111827', background: '#a3e635', bgShape: 'pill', shadow: false, animIn: 'elastic', animOut: 'pop', animLoop: 'jelly' }] },
  { id: 'limited', label: 'عرض محدود', group: 'offers', duration: 3, items: [{ text: 'عرض لفترة محدودة ⏰', font: 'Cairo', fontSize: 62, background: '#7c3aed', bgShape: 'banner', glow: '#c4b5fd', y: 0.2, animIn: 'wipe', animOut: 'fade', animLoop: 'glow' }] },
  {
    id: 'countdown', label: 'عدّ تنازلي', group: 'offers', duration: 3, items: [
      { text: '3', font: 'Lalezar', fontSize: 280, strokeWidth: 10, strokeColor: BLACK, duration: 1, animIn: 'pop', animOut: 'zoom' },
      { text: '2', font: 'Lalezar', fontSize: 280, strokeWidth: 10, strokeColor: BLACK, delay: 1, duration: 1, animIn: 'pop', animOut: 'zoom' },
      { text: '1', font: 'Lalezar', fontSize: 280, strokeWidth: 10, strokeColor: BLACK, delay: 2, duration: 1, animIn: 'pop', animOut: 'zoom' },
    ],
  },
];

/** The texts a template adds at a timeline time. */
export function templateTexts(tpl: TextTemplate, start: number): TextClip[] {
  const base = TEXT_PRESETS[0].style;
  return tpl.items.map(({ delay = 0, ...item }) => ({
    ...base,
    background: null,
    animIn: 'fade',
    animOut: 'fade',
    y: 0.5,
    ...item,
    id: uid(),
    start: start + delay,
    duration: item.duration ?? Math.max(0.5, tpl.duration - delay),
    x: item.x ?? 0.5,
    rotation: item.rotation ?? 0,
  }));
}

/** How long a template stays on screen in total. */
export const templateLength = (tpl: TextTemplate) => Math.max(...tpl.items.map((i) => (i.delay ?? 0) + (i.duration ?? tpl.duration - (i.delay ?? 0))));

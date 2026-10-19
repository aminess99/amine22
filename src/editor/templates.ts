import { DEFAULT_TRANSITION_DURATION, TEXT_PRESETS, presetAdjustments } from './constants';
import { cssFilter } from './renderer';
import { motionFromPreset, uid } from './timeline';
import { MediaAsset, Project, TextClip, TransitionType } from './types';

export interface ProjectTemplate {
  id: string;
  label: string;
  description: string;
  colors: [string, string];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'slideshow', label: 'عرض صور', description: 'كل صورة 2.5 ثانية مع تقريب وتلاشي وعنوان', colors: ['#0ea5e9', '#6366f1'] },
  { id: 'reels', label: 'ريلز سريع', description: 'ألوان حيوية وانتقالات تكبير سريعة وعنوان قوي', colors: ['#f43f5e', '#f59e0b'] },
  { id: 'cinematic', label: 'سينمائي', description: 'مقاس 16:9 وألوان سينمائية وانتقال للأسود', colors: ['#111827', '#b45309'] },
  { id: 'memories', label: 'ذكريات', description: 'طابع كلاسيكي ووميض أبيض ونص بآلة كاتبة', colors: ['#a16207', '#fde68a'] },
  { id: 'vlog', label: 'فلوق', description: 'ألوان دافئة وانتقالات سحب سريع', colors: ['#f97316', '#facc15'] },
  { id: 'travel', label: 'سفر', description: 'ألوان تركواز وبرتقالي وحركة كاميرا وانتقال دائري', colors: ['#0d9488', '#f97316'] },
  { id: 'gaming', label: 'ألعاب', description: 'ألوان نيون وانتقالات تشويش سريعة', colors: ['#7c3aed', '#22d3ee'] },
  { id: 'wedding', label: 'زفاف', description: 'ناعم وحالم مع انتقال قلب', colors: ['#f9a8d4', '#fef3c7'] },
  { id: 'sport', label: 'رياضة', description: 'تباين عالٍ وانتقالات اهتزاز وتقريب', colors: ['#dc2626', '#111827'] },
  { id: 'product', label: 'منتج', description: 'مشرق ونظيف بمقاس مربع وانتقال تغطية', colors: ['#e2e8f0', '#0ea5e9'] },
  { id: 'food', label: 'طبخ', description: 'ألوان شهية وتقريب بطيء', colors: ['#ea580c', '#84cc16'] },
  { id: 'noir', label: 'نوار', description: 'أبيض وأسود درامي وتلاشي للأسود', colors: ['#000000', '#6b7280'] },
];

interface Recipe {
  filter: string;
  transition: TransitionType;
  transitionDuration: number;
  motions: string[];
  imageDuration?: number;
  aspect?: Project['aspect'];
  title: { preset: string; text: string; duration: number };
}

const RECIPES: Record<string, Recipe> = {
  slideshow: { filter: 'none', transition: 'fade', transitionDuration: 0.8, motions: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'], imageDuration: 2.5, title: { preset: 'title', text: 'ألبومي', duration: 2.5 } },
  reels: { filter: 'vivid', transition: 'zoom-in', transitionDuration: 0.35, motions: ['punch'], imageDuration: 1.2, title: { preset: 'impact', text: 'شاهد للنهاية!', duration: 2 } },
  cinematic: { filter: 'cinema', transition: 'fade-black', transitionDuration: 1, motions: ['zoom-in', 'pan-right'], imageDuration: 4, aspect: '16:9', title: { preset: 'classic', text: 'Cinematic', duration: 3 } },
  memories: { filter: 'vintage', transition: 'fade-white', transitionDuration: 0.7, motions: ['zoom-in', 'zoom-out'], imageDuration: 3, title: { preset: 'typewriter', text: 'أجمل اللحظات...', duration: 3.5 } },
  vlog: { filter: 'golden', transition: 'whip', transitionDuration: 0.35, motions: ['drift', 'zoom-in'], imageDuration: 2, aspect: '9:16', title: { preset: 'highlight', text: 'يومي معكم', duration: 2.5 } },
  travel: { filter: 'teal-orange', transition: 'circle', transitionDuration: 0.6, motions: ['pan-left', 'diag-up', 'pan-right', 'zoom-in-big'], imageDuration: 2.5, title: { preset: 'title', text: 'رحلتي', duration: 3 } },
  gaming: { filter: 'cyber', transition: 'glitch', transitionDuration: 0.3, motions: ['punch', 'rotate-zoom'], imageDuration: 1.2, title: { preset: 'neon', text: 'GAME ON', duration: 2 } },
  wedding: { filter: 'dream', transition: 'heart', transitionDuration: 0.9, motions: ['zoom-in', 'drift'], imageDuration: 3.5, title: { preset: 'classic', text: 'يوم العمر', duration: 3.5 } },
  sport: { filter: 'hdr', transition: 'shake', transitionDuration: 0.3, motions: ['punch', 'zoom-in-big'], imageDuration: 1, title: { preset: 'impact', text: 'لا تستسلم!', duration: 2 } },
  product: { filter: 'bright', transition: 'cover-left', transitionDuration: 0.45, motions: ['zoom-in', 'push-up'], imageDuration: 2, aspect: '1:1', title: { preset: 'title', text: 'جديدنا', duration: 2.5 } },
  food: { filter: 'food', transition: 'fade', transitionDuration: 0.5, motions: ['zoom-in', 'diag-down'], imageDuration: 2.5, title: { preset: 'highlight', text: 'وصفة اليوم', duration: 3 } },
  noir: { filter: 'noir', transition: 'fade-black', transitionDuration: 1, motions: ['zoom-out', 'pan-left'], imageDuration: 3.5, title: { preset: 'classic', text: 'الحكاية', duration: 3 } },
};

/** Restyles the clips already on the timeline and adds the template's title. */
export function applyTemplate(project: Project, assets: Map<string, MediaAsset>, templateId: string): Project {
  const r = RECIPES[templateId];
  if (!r) return project;
  const clips = project.clips.map((c, i) => {
    const asset = assets.get(c.assetId);
    const base = {
      ...c,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      fit: 'cover' as const,
      filterId: r.filter,
      adjust: presetAdjustments(r.filter),
      outPoint: asset?.kind === 'image' && r.imageDuration ? r.imageDuration : c.outPoint,
      transition: { type: i === 0 ? ('none' as const) : r.transition, duration: r.transitionDuration || DEFAULT_TRANSITION_DURATION },
    };
    return { ...base, motion: motionFromPreset(base, r.motions[i % r.motions.length]) };
  });
  const preset = TEXT_PRESETS.find((p) => p.id === r.title.preset) ?? TEXT_PRESETS[0];
  const title: TextClip = { ...preset.style, id: uid(), text: r.title.text, start: 0, duration: r.title.duration, x: 0.5, rotation: 0 };
  return { ...project, aspect: r.aspect ?? project.aspect, clips, texts: [...project.texts, title] };
}

/** What a template's thumbnail needs to show: its colour treatment and title look. */
export function templatePreview(templateId: string) {
  const r = RECIPES[templateId];
  const preset = TEXT_PRESETS.find((p) => p.id === r?.title.preset) ?? TEXT_PRESETS[0];
  return {
    filter: cssFilter(presetAdjustments(r?.filter ?? 'none'), 0.25),
    title: {
      text: r?.title.text ?? '',
      font: preset.style.font,
      color: preset.style.color,
      stroke: preset.style.strokeWidth ? preset.style.strokeColor : '',
    },
  };
}

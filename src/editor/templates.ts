import { DEFAULT_TRANSITION_DURATION, TEXT_PRESETS, presetAdjustments } from './constants';
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
  const title: TextClip = { ...preset.style, id: uid(), text: r.title.text, start: 0, duration: r.title.duration, x: 0.5 };
  return { ...project, aspect: r.aspect ?? project.aspect, clips, texts: [...project.texts, title] };
}

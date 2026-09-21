import React, { useState } from 'react';
import { 
  Sparkles, 
  MoveRight, 
  Music, 
  Zap, 
  Layers, 
  Flame,
  Award,
  Palette,
  LayoutTemplate,
  MonitorPlay,
  Type,
  SmilePlus,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { EditorSettings, TemplateType } from '../types';

interface TemplateSidebarProps {
  settings: EditorSettings;
  onSettingsChange: (settings: EditorSettings) => void;
}

interface TemplatePreset {
  id: TemplateType;
  name: string;
  category: 'viral' | 'creator' | 'minimal' | 'fun';
  tag: string;
  badge?: string;
  description: string;
  icon: any;
  defaultFont: string;
  defaultPrimary: string;
  previewClass: string;
  previewText: string;
}

const TEMPLATES: TemplatePreset[] = [
  { 
    id: 'hormozi', 
    name: 'Alex Hormozi 2.0', 
    category: 'viral',
    tag: 'Viral Master',
    badge: 'الأكثر طلباً',
    description: 'خط عريض حاد، تناوب ألوان متعددة (أصفر/أخضر/سماوي)، وتمايل الكلمة المنطوقة.', 
    icon: Zap,
    defaultFont: 'Cairo',
    defaultPrimary: '#FFDE59',
    previewClass: 'text-amber-400 font-black tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,1)] uppercase -rotate-1',
    previewText: 'GROW YOUR BRAND 🚀'
  },
  { 
    id: 'beast', 
    name: 'MrBeast 3D Impact', 
    category: 'viral',
    tag: 'High Energy',
    badge: '3D Pop',
    description: 'حدود ثلاثية الأبعاد بارزة مع تكبير فوري وظل أسود عميق لكل كلمة.', 
    icon: Sparkles,
    defaultFont: 'Anton',
    defaultPrimary: '#00F0FF',
    previewClass: 'text-cyan-400 font-black tracking-tighter drop-shadow-[2px_3px_0px_#000] uppercase scale-105',
    previewText: '100% REAL RESULTS! 💥'
  },
  { 
    id: 'ali_abdaal', 
    name: 'Ali Abdaal Highlighter', 
    category: 'creator',
    tag: 'Clean Pro',
    badge: 'هايلايتر',
    description: 'مربع تمييز أصفر ساطع يغلف الكلمة النشطة بحواف ناعمة وسهولة قراءة فائقة.', 
    icon: Award,
    defaultFont: 'Tajawal',
    defaultPrimary: '#FEE047',
    previewClass: 'bg-amber-300 text-slate-950 px-2 py-0.5 rounded font-black text-[11px]',
    previewText: 'Smart Productivity 💡'
  },
  { 
    id: 'gadzhi', 
    name: 'Iman Gadzhi Luxury', 
    category: 'creator',
    tag: 'Aesthetic Serif',
    badge: 'VIP',
    description: 'خط سيريف فاخر بظلال سينمائية دافئة وإضاءة ذهبية مستوحاة من ريلز الأعمال الفاخرة.', 
    icon: Flame,
    defaultFont: 'Playfair Display',
    defaultPrimary: '#F6E05E',
    previewClass: 'italic font-serif text-amber-200 drop-shadow-[0_0_12px_rgba(246,224,94,0.6)] font-semibold',
    previewText: 'Unfair Advantage ✨'
  },
  { 
    id: 'jatho', 
    name: 'Devin Jatho Cyber', 
    category: 'viral',
    tag: 'Cyberpunk',
    badge: 'Tech',
    description: 'صندوق زجاجي داكن مع توهج نيون أزرق عالي التباين وخط عصري مخصص للمحتوى التقني.', 
    icon: Layers,
    defaultFont: 'Rubik',
    defaultPrimary: '#00F0FF',
    previewClass: 'border border-cyan-400/80 bg-slate-950/80 text-cyan-300 px-2 py-0.5 rounded-lg font-mono text-[10px] shadow-[0_0_8px_rgba(6,182,212,0.5)]',
    previewText: 'AI SYSTEMS AUTOMATION ⚡'
  },
  { 
    id: 'pop', 
    name: 'One-Word TikTok Pop', 
    category: 'fun',
    tag: 'Reels Fast',
    badge: 'سريع',
    description: 'كلمة واحدة عملاقة في منتصف الشاشة مع ارتداد ديناميكي فوري لكل نبرة صوت.', 
    icon: MoveRight,
    defaultFont: 'Cairo',
    defaultPrimary: '#FB7185',
    previewClass: 'text-rose-400 font-black uppercase text-xs tracking-wider scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]',
    previewText: 'BOOM! 🎯'
  },
  { 
    id: 'comic', 
    name: 'Comic Bubble Pop', 
    category: 'fun',
    tag: 'Playful',
    badge: 'جديد',
    description: 'أسلوب الكوميكس الكرتوني الممتع بحدود سوداء سميكة وألوان نضرة ملفتة للانتباه.', 
    icon: SmilePlus,
    defaultFont: 'Rubik',
    defaultPrimary: '#38BDF8',
    previewClass: 'text-sky-300 font-black border-2 border-black bg-yellow-400 text-black px-2 py-0.5 rounded-xl text-[10px] shadow-[2px_2px_0px_#000]',
    previewText: 'WOW EFFECT! 🎨'
  },
  { 
    id: 'karaoke', 
    name: 'Karaoke Wave Flow', 
    category: 'creator',
    tag: 'Smooth Sync',
    description: 'تتبع سلس متناغم يضيء كل كلمة منطوقة بتناغم زمني كامل، مثالي للمقاطع الهادئة والبودكاست.', 
    icon: Music,
    defaultFont: 'Almarai',
    defaultPrimary: '#34D399',
    previewClass: 'text-emerald-400 font-bold bg-black/60 px-2 py-0.5 rounded-full border border-emerald-500/30 text-[10px]',
    previewText: 'تتبع الكلمات بسلاسة 🎵'
  },
  { 
    id: 'neon', 
    name: 'Neon Laser Pulse', 
    category: 'viral',
    tag: 'Glow Effect',
    description: 'إشعاع نيون سينمائي كثيف بتوهج متعدد الطبقات حول النصوص لجذب النظر في الثواني الأولى.', 
    icon: Palette,
    defaultFont: 'Cairo',
    defaultPrimary: '#E879F9',
    previewClass: 'text-white font-black drop-shadow-[0_0_12px_#E879F9] text-xs',
    previewText: 'NEON IMPACT 🔥'
  },
  { 
    id: 'minimal', 
    name: 'Podcast Frosted Pill', 
    category: 'minimal',
    tag: 'Clean Minimal',
    description: 'كبسولة زجاجية داكنة خفيفة وشفافة لحفظ راحة العين وتركيز المشاهد على محتوى الفيديو.', 
    icon: LayoutTemplate,
    defaultFont: 'Almarai',
    defaultPrimary: '#818CF8',
    previewClass: 'bg-black/80 border border-white/20 text-white px-2.5 py-0.5 rounded-full font-medium text-[10px]',
    previewText: 'بودكاست هادئ واحترافي'
  },
  { 
    id: 'cinematic', 
    name: 'Documentary Classic', 
    category: 'minimal',
    tag: 'Story Sub',
    description: 'ترجمة راقية للأفلام الوثائقية والقصص مع تباعد متوازن وظلال ناعمة غير مشتتة.', 
    icon: MonitorPlay,
    defaultFont: 'Tajawal',
    defaultPrimary: '#FFFFFF',
    previewClass: 'text-slate-100 font-medium tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,1)] text-[10px]',
    previewText: 'وثائقيات وترجمة كلاسيكية'
  },
];

export function TemplateSidebar({ settings, onSettingsChange }: TemplateSidebarProps) {
  const [filter, setFilter] = useState<'all' | 'viral' | 'creator' | 'minimal' | 'fun'>('all');

  const filteredTemplates = TEMPLATES.filter(
    t => filter === 'all' || t.category === filter
  );

  const handleSelectTemplate = (tmpl: TemplatePreset) => {
    onSettingsChange({
      ...settings,
      template: tmpl.id,
      // Keep user's chosen font if already set, otherwise use template default
      fontFamily: settings.fontFamily || tmpl.defaultFont || 'Cairo',
      primaryColor: tmpl.defaultPrimary || settings.primaryColor,
    });
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto bg-slate-950/60 p-3 sm:p-4 space-y-3 custom-scrollbar">
      
      {/* Quick Font Selector right inside Templates tab */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-sm shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Type className="w-3.5 h-3.5 text-indigo-400" />
            <span>نوع الخط (Font Family)</span>
          </span>
          <span className="text-[10px] text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
            {settings.fontFamily || 'Cairo'}
          </span>
        </div>
        <select 
          value={settings.fontFamily || 'Cairo'}
          onChange={(e) => onSettingsChange({ ...settings, fontFamily: e.target.value })}
          className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700/80 px-2.5 py-1.5 cursor-pointer outline-none focus:border-indigo-500 transition-colors font-sans"
        >
          <option value="Cairo">Cairo (خط القاهرة - عريض وريلز ممتاز)</option>
          <option value="Tajawal">Tajawal (تجوال - أنيق وعصري)</option>
          <option value="Almarai">Almarai (المراعي - ناعم وسلس)</option>
          <option value="Rubik">Rubik (روبيك - عريض وقوي)</option>
          <option value="Playfair Display">Playfair Display (فاخر وسيريف)</option>
          <option value="Anton">Anton (عريض ضخم 3D)</option>
          <option value="Montserrat">Montserrat (عصري هندسي)</option>
          <option value="Cinzel">Cinzel (سينمائي فاخر)</option>
          <option value="Inter">Inter (كلاسيكي نظيف)</option>
          <option value="Space Mono">Space Mono (تقني سايبر)</option>
        </select>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'viral', label: '🔥 ريلز وفيروسي' },
          { id: 'creator', label: '💡 صناع المحتوى' },
          { id: 'fun', label: '⚡ حركي وسريع' },
          { id: 'minimal', label: '🎬 كلاسيكي وهادئ' },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id as any)}
            className={cn(
              "px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all border shrink-0",
              filter === cat.id
                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Templates List */}
      <div className="space-y-2.5 flex-1">
        {filteredTemplates.map((tmpl) => {
          const Icon = tmpl.icon;
          const isActive = settings.template === tmpl.id;
          
          return (
            <button
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl)}
              className={cn(
                "w-full flex flex-col gap-2 p-3.5 rounded-2xl text-right transition-all duration-200 border relative overflow-hidden group select-none",
                isActive 
                  ? "bg-gradient-to-br from-indigo-950/60 to-slate-900/90 border-indigo-500 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-400/50" 
                  : "bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700"
              )}
            >
              {/* Header: Icon + Title + Badges */}
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    "p-2 rounded-xl shrink-0 transition-colors shadow-sm",
                    isActive ? "bg-indigo-600 text-white shadow-indigo-600/30" : "bg-slate-800 text-slate-400 group-hover:text-indigo-300"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "font-bold text-xs sm:text-sm tracking-tight",
                        isActive ? "text-white font-extrabold" : "text-slate-200 group-hover:text-white"
                      )}>
                        {tmpl.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium block">
                      {tmpl.tag} • {tmpl.defaultFont}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {tmpl.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                      {tmpl.badge}
                    </span>
                  )}
                  {isActive && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-[11px] text-slate-400 leading-relaxed text-right line-clamp-2">
                {tmpl.description}
              </p>

              {/* Live Mini Preview Box */}
              <div className="w-full mt-0.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/60 flex items-center justify-center overflow-hidden">
                <div className={tmpl.previewClass}>
                  {tmpl.previewText}
                </div>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Layers, 
  Play, 
  Check, 
  ArrowRight, 
  Flame, 
  Tv, 
  Mic, 
  Smile, 
  Sliders
} from 'lucide-react';
import { TemplateType } from '../../types';
import { cn } from '../../lib/utils';

interface TemplatesPageProps {
  onSelectTemplateToTry: (templateId: TemplateType) => void;
  onGoToStudio: () => void;
}

interface TemplateShowcaseItem {
  id: TemplateType;
  name: string;
  creator: string;
  category: 'viral' | 'business' | 'creative' | 'minimal';
  badge?: string;
  description: string;
  sampleWords: { text: string; active?: boolean }[];
  styleSnippet: {
    fontFamily: string;
    primaryColor: string;
    bg?: string;
    activeWordColor?: string;
    outline?: string;
  };
  recommendedFor: string;
}

export function TemplatesPage({ onSelectTemplateToTry, onGoToStudio }: TemplatesPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'viral' | 'business' | 'creative' | 'minimal'>('all');
  const [activeWordIndex, setActiveWordIndex] = useState(1);

  // Cycling active word for animated preview effect
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveWordIndex((prev) => (prev + 1) % 4);
    }, 1100);
    return () => clearInterval(timer);
  }, []);

  const templatesList: TemplateShowcaseItem[] = [
    {
      id: 'hormozi',
      name: 'أليكس هرمز (Hormozi Viral)',
      creator: 'Alex Hormozi',
      category: 'viral',
      badge: 'الأكثر شعبية 🔥',
      description: 'أسلوب فيروسي عالي الطاقة بكلمات باللون الأصفر والأخضر الفسفوري مع حدود سوداء بارزة وتأثير بروز للكلمة النشطة.',
      sampleWords: [
        { text: 'هذه' },
        { text: 'الاستراتيجية' },
        { text: 'تضاعف' },
        { text: 'أرباحك!' }
      ],
      styleSnippet: {
        fontFamily: 'Cairo, sans-serif',
        primaryColor: '#FFFFFF',
        activeWordColor: '#FACC15', // Yellow
        outline: '3px solid #000'
      },
      recommendedFor: 'فيديوهات إنستغرام ريلز، تيك توك، ونصائح البيزنس المباشرة.'
    },
    {
      id: 'beast',
      name: 'مستر بيست (MrBeast Impact)',
      creator: 'MrBeast',
      category: 'viral',
      badge: 'أعلى جذب انتباه ⚡',
      description: 'خط ضخم عريض (Anton/Cairo) بألوان مشعة ناصعة، مصمم لرفع معدل المشاهدة ومنع التمرير (Stop Scroll).',
      sampleWords: [
        { text: 'تحدي' },
        { text: 'مليون' },
        { text: 'دولار' },
        { text: 'مجنون!' }
      ],
      styleSnippet: {
        fontFamily: 'Cairo, sans-serif',
        primaryColor: '#FBBF24',
        activeWordColor: '#EF4444', // Bright Red
        outline: '4px solid #000'
      },
      recommendedFor: 'فيديوهات المقالب، التحديات، والافتتاحيات السريعة (Hooks).'
    },
    {
      id: 'ali_abdaal',
      name: 'علي عبد العال (Ali Abdaal)',
      creator: 'Ali Abdaal',
      category: 'business',
      badge: 'أنيق ومرتب 📚',
      description: 'أسلوب هادئ وأنيق بمحاذاة راقية وخلفية مريحة للعين، مخصص للإنتاجية والمحتوى التعليمي طويل الأمد.',
      sampleWords: [
        { text: 'كيف' },
        { text: 'تتحكم' },
        { text: 'في' },
        { text: 'وقتك؟' }
      ],
      styleSnippet: {
        fontFamily: 'Tajawal, sans-serif',
        primaryColor: '#F8FAFC',
        bg: 'rgba(15, 23, 42, 0.75)',
        activeWordColor: '#60A5FA'
      },
      recommendedFor: 'بودكاست، محتوى الكتب والإنتاجية، والفيديوهات المعرفية.'
    },
    {
      id: 'gadzhi',
      name: 'إيمان قادجي (Iman Gadzhi Luxury)',
      creator: 'Iman Gadzhi',
      category: 'business',
      badge: 'فاخر وسينمائي 💎',
      description: 'طابع كلاسيكي فاخر (Cinzel / Playfair) مع تدرجات ذهبية ناعمة يعكس الفخامة ومحتوى الأعمال الراقية.',
      sampleWords: [
        { text: 'قواعد' },
        { text: 'النجاح' },
        { text: 'المالي' },
        { text: 'الحقيقي' }
      ],
      styleSnippet: {
        fontFamily: 'Playfair Display, Cairo, serif',
        primaryColor: '#E2E8F0',
        activeWordColor: '#F59E0B' // Amber Gold
      },
      recommendedFor: 'ريلز ريادة الأعمال، الثروة، وتطوير الذات الراقي.'
    },
    {
      id: 'karaoke',
      name: 'كاريوكي الإضاءة (Karaoke Highlight)',
      creator: 'Dynamic Flow',
      category: 'creative',
      badge: 'متابعة سلسة 🎤',
      description: 'يتحرك الضوء كلمة بكلمة مع التحدث بانسيابية عالية تمنح المشاهد إحساساً ممتعاً بمتابعة المحادثة.',
      sampleWords: [
        { text: 'اسمع' },
        { text: 'لهذه' },
        { text: 'القصة' },
        { text: 'العجيبة' }
      ],
      styleSnippet: {
        fontFamily: 'Cairo, sans-serif',
        primaryColor: '#94A3B8',
        activeWordColor: '#38BDF8'
      },
      recommendedFor: 'قصص البودكاست، الفيديوهات الصوتية، والروايات القصيرة.'
    },
    {
      id: 'comic',
      name: 'كوميك كوميدي (Comic & Fun)',
      creator: 'Fun Creators',
      category: 'creative',
      badge: 'مرح وفكاهي 🎨',
      description: 'ألوان زاهية وخطوط كرتونية مرحة تضفي حيوية ومرحاً وتناسب الفيديوهات الفكاهية واليوميات.',
      sampleWords: [
        { text: 'موقف' },
        { text: 'مضحك' },
        { text: 'جداً' },
        { text: '😂' }
      ],
      styleSnippet: {
        fontFamily: 'Rubik, sans-serif',
        primaryColor: '#FFFFFF',
        activeWordColor: '#F43F5E' // Pink Red
      },
      recommendedFor: 'فيديوهات اليوميات، الضحك، والريلز الترفيهي.'
    },
    {
      id: 'minimal',
      name: 'المينيمال البسيط (Clean Minimal)',
      creator: 'Minimalist',
      category: 'minimal',
      description: 'نصوص نظيفة جداً وخالية من أي تشويش بصري، تضع التركيز الكامل على وجه المتحدث والفيديو.',
      sampleWords: [
        { text: 'البساطة' },
        { text: 'هي' },
        { text: 'سر' },
        { text: 'الوضوح' }
      ],
      styleSnippet: {
        fontFamily: 'Tajawal, sans-serif',
        primaryColor: '#FFFFFF'
      },
      recommendedFor: 'مقابلات العمل، لينكد إن، والمحتوى التقني الدقيق.'
    },
    {
      id: 'pop',
      name: 'بوب المنبثق (Bold Pop)',
      creator: 'Viral Pop',
      category: 'viral',
      badge: 'ديناميكي 💥',
      description: 'تأثير ارتداد خفيف وتكبير لكل كلمة جديدة لتنبيه عين المشاهد وزيادة وقت المشاهدة (Watch Time).',
      sampleWords: [
        { text: 'انتبه' },
        { text: 'لهذا' },
        { text: 'السر' },
        { text: 'الآن!' }
      ],
      styleSnippet: {
        fontFamily: 'Cairo, sans-serif',
        primaryColor: '#FFFFFF',
        activeWordColor: '#10B981' // Emerald
      },
      recommendedFor: 'فيديوهات التحفيز، الإعلانات الممولة، ومحتوى الترويج.'
    },
    {
      id: 'neon',
      name: 'نيون متوهج (Cyber Neon)',
      creator: 'Futuristic',
      category: 'creative',
      description: 'توهج سيبراني ناصع باللون السماوي والوردي المشع يلائم محتوى التقنية، الجيمنج، والذكاء الاصطناعي.',
      sampleWords: [
        { text: 'مستقبل' },
        { text: 'الذكاء' },
        { text: 'الاصطناعي' },
        { text: 'هنا' }
      ],
      styleSnippet: {
        fontFamily: 'Space Mono, Cairo, sans-serif',
        primaryColor: '#06B6D4',
        activeWordColor: '#EC4899'
      },
      recommendedFor: 'فيديوهات التقنية، البرمجة، والعملات الرقمية والذكاء الاصطناعي.'
    },
    {
      id: 'cinematic',
      name: 'السينمائي الكلاسيكي (Subtle Cinema)',
      creator: 'Film Style',
      category: 'minimal',
      description: 'خط عريض بتدرج رمادي سينمائي مع شريط سفلي خفيف، مستوحى من ترجمة الأفلام العالمية الحائزة على جوائز.',
      sampleWords: [
        { text: 'في' },
        { text: 'تلك' },
        { text: 'اللحظة' },
        { text: 'تغيرت' }
      ],
      styleSnippet: {
        fontFamily: 'Merriweather, Cairo, serif',
        primaryColor: '#F1F5F9',
        bg: 'rgba(0,0,0,0.6)'
      },
      recommendedFor: 'الأفلام الوثائقية، السرد التاريخي، والمقاطع الدرامية.'
    }
  ];

  const filteredTemplates = selectedCategory === 'all' 
    ? templatesList 
    : templatesList.filter(t => t.category === selectedCategory);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Page Header */}
      <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>مكتبة القوالب الفيروسية المصممة للريلز وتيك توك</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          اختر القالب المثالي لمحتواك <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
            بنقرة واحدة وتعديل غير محدود
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          جميع القوالب تدعم الخطوط العربية بالكامل (Cairo, Tajawal, Almarai, Rubik) مع تتبع حي للكلمة، تحكم كامل بالألوان والتأثيرات، وتصدير بجودة فائقة.
        </p>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
          {[
            { id: 'all', label: 'جميع القوالب (12)' },
            { id: 'viral', label: 'أنماط فيروسية وريلز' },
            { id: 'business', label: 'بودكاست وبيزنس' },
            { id: 'creative', label: 'مرح وإبداعي' },
            { id: 'minimal', label: 'مينيمال وهادئ' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                selectedCategory === cat.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-500"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-3xl bg-slate-900/90 border border-slate-800/80 overflow-hidden shadow-xl hover:border-slate-700 transition-all duration-300 flex flex-col justify-between group"
          >
            {/* Top Interactive Canvas Mockup */}
            <div className="relative h-48 bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6 border-b border-slate-800/60 overflow-hidden">
              {/* Radial glow background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />

              {/* Badge */}
              {tpl.badge && (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 z-10">
                  {tpl.badge}
                </div>
              )}

              {/* Mockup Reel Preview Box */}
              <div 
                className="relative z-10 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-center"
                style={{
                  backgroundColor: tpl.styleSnippet.bg || 'transparent',
                }}
              >
                {tpl.sampleWords.map((word, idx) => {
                  const isActive = idx === activeWordIndex;
                  return (
                    <span
                      key={idx}
                      className={cn(
                        "text-lg sm:text-xl font-black transition-all duration-200 transform",
                        isActive ? "scale-110" : "scale-100 opacity-80"
                      )}
                      style={{
                        fontFamily: tpl.styleSnippet.fontFamily,
                        color: isActive 
                          ? (tpl.styleSnippet.activeWordColor || tpl.styleSnippet.primaryColor) 
                          : tpl.styleSnippet.primaryColor,
                        textShadow: isActive ? '0 2px 10px rgba(0,0,0,0.8)' : '0 1px 4px rgba(0,0,0,0.6)'
                      }}
                    >
                      {word.text}
                    </span>
                  );
                })}
              </div>

              <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 font-mono">
                مستوحى من: {tpl.creator}
              </div>
            </div>

            {/* Template Info & Action */}
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors">
                  {tpl.name}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {tpl.description}
                </p>
                
                <div className="pt-2 text-[11px] text-indigo-300 flex items-start gap-1.5">
                  <span className="font-bold shrink-0">مثالي لـ:</span>
                  <span className="text-slate-300">{tpl.recommendedFor}</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTemplateToTry(tpl.id)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>استخدم القالب في الاستوديو</span>
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Bottom CTA Banner */}
      <div className="mt-16 rounded-3xl bg-gradient-to-r from-indigo-900/60 via-purple-900/50 to-slate-900 border border-indigo-500/30 p-8 sm:p-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-black text-white">
          هل تريد تخصيص ألوانك وخطك الخاص؟
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
          يمكنك تغيير الخط، حجم النصوص، مكان الكابشن (سفلي، وسطي، علوي)، وإضافة إيموجيز لكل كلمة بشكل مستقل داخل محرر الكابشن.
        </p>
        <button
          onClick={onGoToStudio}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs sm:text-sm shadow-xl transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>فتح الاستوديو ورفع فيديو الآن</span>
        </button>
      </div>

    </div>
  );
}

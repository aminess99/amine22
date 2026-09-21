import React from 'react';
import { 
  Zap, 
  Sparkles, 
  Clock, 
  Sliders, 
  Type, 
  Smile, 
  FileCode, 
  Film, 
  CheckCircle2, 
  Volume2, 
  ArrowLeft,
  Share2,
  ShieldCheck
} from 'lucide-react';

interface FeaturesPageProps {
  onGoToStudio: () => void;
}

export function FeaturesPage({ onGoToStudio }: FeaturesPageProps) {
  const steps = [
    {
      num: '01',
      title: 'رفع الفيديو أو الصوت',
      desc: 'اسحب وأفلت أي ملف فيديو أو صوت (MP4, MOV, WebM) حتى 150MB بصوت واضح من هاتفك أو حاسوبك.',
      badge: 'فوري وآمن'
    },
    {
      num: '02',
      title: 'التفريغ التلقائي بالميلي ثانية',
      desc: 'يقوم الذكاء الاصطناعي بتحليل الموجات الصوتية العربية وتحديد توقيت كل كلمة بدقة فائقة متطابقة مع الشفاه.',
      badge: 'دعم اللهجات العربية'
    },
    {
      num: '03',
      title: 'التصميم وتخصيص القوالب',
      desc: 'اختر قالبك المفضل، نسق الألوان والخطوط (Cairo, Tajawal, إلخ)، أضف إيموجيز، وقم بتعديل أي كلمة بنقرة زر.',
      badge: 'معاينة حية 100%'
    },
    {
      num: '04',
      title: 'التصدير بجودة سينمائية 4K',
      desc: 'احصل على فيديو MP4 عالي النقاء بدون علامات مائية وبصوت استوديو 320kbps، أو قم بتحميل ملفات SRT و VTT.',
      badge: 'جاهز للنشر مباشرة'
    }
  ];

  const features = [
    {
      icon: Clock,
      title: 'توقيت دقيق على مستوى الكلمة (Word-Level Sync)',
      desc: 'على عكس الترجمات التقليدية التي تعرض جملاً كاملة مملة، نقوم بحساب توقيت ظهور واختفاء كل كلمة بمفردها لإنشاء حركة نصوص ديناميكية تشد انتباه المشاهدين في التيك توك والريلز.',
      tag: 'ميزة أساسية ⚡'
    },
    {
      icon: Type,
      title: 'أفضل حزمة خطوط عربية مصممة للريلز',
      desc: 'مكتبة خطوط منتقاة بعناية تشمل خطوط Cairo العريضة، وTajawal الأنيقة، وAlmarai، وRubik، مع محاذاة RTL دقيقة وحسابات دقيقة لحجم النص وأبعاد الفيديو.',
      tag: 'عربي 100% 🇸🇦'
    },
    {
      icon: Smile,
      title: 'اكتشاف وتوليد الإيموجيز تلقائياً',
      desc: 'يقوم المحرك باكتشاف الكلمات الدالة والعاطفية وربطها تلقائياً بأيقونات إيموجي متحركة متوافقة، مع إمكانية استبدال أو تخصيص أي إيموجي تريده.',
      tag: 'تفاعل أعلى 🚀'
    },
    {
      icon: Sliders,
      title: 'التحكم في تجميع الكلمات (Chunking)',
      desc: 'حدد عدد الكلمات في كل شاشة: كلمة واحدة لتأثير الهرموزي الفيروسي، أو 2-3 كلمات للقراءة السلسة، أو 5 كلمات للمحتوى التعليمي الهادئ.',
      tag: 'مرونة كاملة 🎛️'
    },
    {
      icon: FileCode,
      title: 'تصدير ملفات الترجمة (SRT / VTT / ASS)',
      desc: 'هل تستخدم Premiere Pro، DaVinci Resolve، أو CapCut؟ يمكنك تصدير تفريغ الفيديو بصيغ SRT القياسية، أو ملفات ASS المزودة بالتنسيقات والألوان لاستيرادها في برامج المونتاج.',
      tag: 'للمونتيرين المحترفين 🎬'
    },
    {
      icon: Volume2,
      title: 'صوت نقي 320kbps وترميز سينمائي H.264',
      desc: 'نظام دمج صوتي متطور يعزل المسار الصوتي الأصلي دون تشويش أو ضغط مهدر، مع ترميز فيديو بـ CRF 15 يضمن خلو الفيديو من البكسلة والضبابية.',
      tag: 'جودة استوديو 🎧'
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <Zap className="w-4 h-4 text-indigo-400" />
          <span>المميزات والتقنيات المتقدمة في AI Video Captioner</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          كل ما يحتاجه صانع المحتوى <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
            لإنتاج فيديوهات تتصدر صفحات الاكسبلور
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          تعرف على آلية عمل المنصة والميزات التكنولوجية التي تجعل فيديوهاتك أكثر احترافية ومتابعة من قبل الجمهور العربي والعالمي.
        </p>
      </div>

      {/* 4-Step Process */}
      <div className="mb-20">
        <div className="text-center mb-10">
          <h2 className="text-xl sm:text-2xl font-black text-white">كيف تعمل المنصة في 4 خطوات بسيطة؟</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">من الفيديو الخام إلى فيديو فيروزي جاهز للنشر في أقل من 60 ثانية</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/60 transition-all shadow-lg"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-black text-indigo-400 font-mono">{step.num}</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {step.badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-800/60 flex items-center text-[11px] text-indigo-300 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-1.5" />
                <span>معالجة تلقائية بالكامل</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Deep Dive Grid */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-black text-white">مميزات مصممة خصيصاً للمحتوى العربي</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">تغلّب على عقبات تعريب الكابشن وتنسيق الاتجاه من اليمين لليسار (RTL)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {feat.tag}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>

                <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>دقة واختبار مكثف على مختلف الأجهزة</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ready to Start CTA */}
      <div className="rounded-3xl bg-slate-900 border border-indigo-500/30 p-8 sm:p-12 text-center space-y-5 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent pointer-events-none" />
        
        <h2 className="text-2xl sm:text-3xl font-black text-white">
          جاهز لتجربة الكابشن الاحترافي على فيديوهاتك؟
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
          لا تحتاج إلى تسجيل معقد أو إدخال بطاقات ائتمانية. ارفع الفيديو وابدأ التعديل والتصدير مجاناً وفوراً.
        </p>

        <button
          onClick={onGoToStudio}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>ابدأ الآن بتفريغ فيديو مجاناً</span>
        </button>
      </div>

    </div>
  );
}

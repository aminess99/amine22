import React, { useState } from 'react';
import { 
  HelpCircle, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Volume2, 
  Download, 
  Layers, 
  FileCode, 
  AlertTriangle, 
  Sparkles,
  Mail,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface HelpCenterPageProps {
  onGoToContact: () => void;
  onGoToStudio: () => void;
}

interface FAQItem {
  q: string;
  a: string;
  category: 'transcription' | 'export' | 'styles' | 'nle' | 'troubleshoot';
}

export function HelpCenterPage({ onGoToContact, onGoToStudio }: HelpCenterPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({ 0: true, 1: true });

  const toggleItem = (index: number) => {
    setOpenItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const faqs: FAQItem[] = [
    {
      category: 'transcription',
      q: 'كيف يتعرف الذكاء الاصطناعي على الكلمات العربية وما مدى دقته؟',
      a: 'تعتمد المنصة على أحدث نماذج التعرف الصوتي المخصصة للغة العربية (Speech-to-Text) بما في ذلك الفصحى واللهجات الدارجة الشائعة (الخليجية، المصرية، الشامية، وغيرها). يقوم النظام بربط كل كلمة بموجتها الصوتية وتحديد بدايتها ونهايتها بالميلي ثانية مع نسبة دقة تفوق 96% في التسجيلات النقية.'
    },
    {
      category: 'transcription',
      q: 'كيف أحصل على أعلى دقة تفريغ صوتي بنسبة 100%؟',
      a: 'للحصول على أفضل نتيجة، احرص على: (1) التحدث بوضوح أمام الميكروفون دون ضوضاء خلفية صاخبة، (2) تجنب تداخل صوت الموسيقى الصاخبة مع نبرة الكلام أثناء التسجيل الأصلي، (3) عدم التحدث بسرعة مفرطة تتداخل فيها الحروف.'
    },
    {
      category: 'transcription',
      q: 'هل يمكنني تصحيح أي كلمة أو تعديل توقيتها يدوياً؟',
      a: 'نعم بكل تأكيد! في محرر الاستوديو، يمكنك النقر المباشر على أي كلمة في الشريط الزمني أو قائمة الكلمات لتعديل نصها، أو تغيير توقيت بدئها ونهايتها، أو إضافة إيموجي مخصص لها، أو تغيير لون تمييزها.'
    },
    {
      category: 'export',
      q: 'لماذا كان الفيديو يظهر بجودة أقل سابقاً وكيف تم علاج المشكلة؟',
      a: 'قامت المنصة بترقية محرك التصدير كلياً ليعتمد معيار H.264 Lossless مع معدل بت فائق 35Mbps وقيمة CRF 15، مع دمج مسار الصوت الأصلي مباشرة دون أي ضغط مشوش بمعدل 320kbps AAC. كما يمكنك الاختيار بين جودة Ultra FHD أو الدقة الأصلية للفيديو (حتى 4K).'
    },
    {
      category: 'export',
      q: 'ما هي صيغ الفيديو المدعومة للرفع والتصدير؟',
      a: 'تدعم المنصة رفع صيغ MP4, MOV, WebM, M4V حتى حجم 150MB. ويتم التصدير بصيغة MP4 العالمية المتوافقة مباشرة مع جميع منصات التواصل (Instagram Reels, TikTok, YouTube Shorts, X, LinkedIn).'
    },
    {
      category: 'export',
      q: 'هل تضع المنصة أي علامات مائية (Watermarks) على الفيديو المُصدّر؟',
      a: 'لا! جميع الفيديوهات المُصدرة من المنصة نظيفة تماماً وبدون أي شعار أو علامة مائية، وتكون ملكاً كاملاً لك لاستخدامها تجارياً ونشرها على قنواتك.'
    },
    {
      category: 'styles',
      q: 'هل الخطوط العربية مدعومة في جميع القوالب؟',
      a: 'نعم، المنصة تدعم خطوط Cairo, Tajawal, Almarai, Rubik وغيرها مع دعم كامل للاتجاه من اليمين لليسار (RTL)، ومحاذاة الشاشات الرأسية (9:16) والمربعة (1:1) والأفقية (16:9).'
    },
    {
      category: 'styles',
      q: 'كيف يمكنني نقل مكان الكابشن إلى أعلى أو وسط الفيديو؟',
      a: 'في لوحة "التخصيص" بالاستوديو، ستجد خيار "الموقع الرأسي" (سفلي، وسطي، علوي)، بالإضافة إلى إمكانية سحب الكابشن بالماوس وتحديد ارتفاعه بالنسبة المئوية بحرية تامة لتفادي شريط أزرار تيك توك أو إنستغرام.'
    },
    {
      category: 'nle',
      q: 'كيف أستخدم الترجمات في برامج المونتاج مثل Premiere Pro أو CapCut أو DaVinci؟',
      a: 'يمكنك من زر خيارات الترجمة في الاستوديو تحميل ملفات: (1) ملف .SRT وهو الصيغة القياسية للترجمات المدعومة في كل البرامج، (2) ملف .VTT للويب، (3) ملف .ASS الذي يحتوي على التنسيقات والألوان وحركات النصوص المتقدمة.'
    },
    {
      category: 'troubleshoot',
      q: 'ماذا أفعل إذا ظهرت رسالة "فشل استخراج الصوت" أو خطأ في الرفع؟',
      a: 'تأكد من أن صيغة الملف هي MP4 أو MOV عادية، وأن حجم الملف لا يتجاوز 150MB، وأن الفيديو يحتوي على مسار صوتي فعلي. يمكنك استخدام متصفح حديث مثل Chrome أو Safari أو Edge وتحديث الصفحة ثم إعادة المحاولة.'
    },
    {
      category: 'troubleshoot',
      q: 'ماذا أفعل إذا كان التصدير يتوقف قبل الوصول إلى 100%؟',
      a: 'تأكد من عدم إغلاق علامة تبويب المتصفح أثناء التصدير لأن المتصفح يقوم برندرة الإطارات محلياً. إذا كان جهازك بطيئاً، يمكنك اختيار جودة "عالي قياسي" أو "متوازن" من نافذة التصدير لتسريع المعالجة.'
    }
  ];

  const categories = [
    { id: 'all', label: 'جميع الأسئلة' },
    { id: 'transcription', label: 'التفريغ والصوت' },
    { id: 'export', label: 'التصدير والجودة' },
    { id: 'styles', label: 'التصميم والخطوط' },
    { id: 'nle', label: 'برامج المونتاج' },
    { id: 'troubleshoot', label: 'حل المشكلات' },
  ];

  const filteredFaqs = faqs.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesQuery = searchQuery.trim() === '' || 
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.a.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          <span>مركز المساعدة والأسئلة الشائعة (FAQ)</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          كيف يمكننا <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">مساعدتك اليوم؟</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300">
          إجابات واضحة وحلول سريعة لأبرز الاستفسارات حول تفريغ الصوت، جودة الفيديو، القوالب، وتصدير الملفات.
        </p>

        {/* Search Bar */}
        <div className="relative max-w-lg mx-auto pt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في الأسئلة الشائعة (مثال: جودة، صوت، كابكت، خطوط...)"
            className="w-full bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-2xl pl-4 pr-11 py-3.5 text-xs sm:text-sm text-white placeholder-slate-400 outline-none shadow-xl transition-all"
          />
          <Search className="w-5 h-5 text-slate-400 absolute right-4 top-[26px]" />
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeCategory === c.id
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-500"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* FAQs Accordion */}
      <div className="space-y-3.5">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, idx) => {
            const isOpen = !!openItems[idx];
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(idx)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-right gap-4 hover:bg-slate-850/60 transition-colors"
                >
                  <span className="font-bold text-sm sm:text-base text-white">
                    {faq.q}
                  </span>
                  <div className="p-1 rounded-lg bg-slate-800 text-slate-400 shrink-0">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 mt-1">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 p-6 rounded-3xl bg-slate-900/40 border border-slate-800">
            <p className="text-sm text-slate-400">لم نتمكن من العثور على سؤال يطابق بحثك "{searchQuery}".</p>
            <button
              onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
              className="mt-3 text-xs text-indigo-400 font-bold hover:underline"
            >
              عرض جميع الأسئلة
            </button>
          </div>
        )}
      </div>

      {/* Audio Recording Pro Tips Banner */}
      <div className="mt-14 p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-sm sm:text-base">
          <Volume2 className="w-5 h-5" />
          <span>نصائح ذهبية لصناع المحتوى لتسجيل صوت فائق النقاء:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
          <div className="flex items-start gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>ضع الميكروفون على بعد 10 إلى 15 سم من فمك لتجنب صدى الغرفة وهواء الحروف الانفجارية.</span>
          </div>
          <div className="flex items-start gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>أضف الموسيقى التصويرية الهادئة في المونتاج النهائي وليس أثناء التسجيل الصوتي المباشر.</span>
          </div>
          <div className="flex items-start gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>تحدث بنبرة واثقة ومخارج حروف واضحة لتحصل على تفريغ دقيق بنسبة 100% دون أي تعديل يدوي.</span>
          </div>
          <div className="flex items-start gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>استخدم صيغة MP4 أو MOV القياسية بدقة 1080p أو 4K للحصول على أعلى صفاء بصري.</span>
          </div>
        </div>
      </div>

      {/* Still need help? Contact Us */}
      <div className="mt-12 text-center p-8 rounded-3xl bg-gradient-to-tr from-indigo-950/40 to-slate-900 border border-indigo-500/20 space-y-4">
        <h3 className="font-bold text-base sm:text-lg text-white">لم تجد إجابة لاستفسارك؟</h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          فريق الدعم الفني جاهز لمساعدتك في أي استفسار حول استخدام المنصة أو اقتراح ميزات جديدة.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={onGoToContact}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Mail className="w-4 h-4" />
            <span>التواصل مع الدعم الفني</span>
          </button>
          <button
            onClick={onGoToStudio}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
          >
            <span>العودة للاستوديو وتجربة فيديو</span>
          </button>
        </div>
      </div>

    </div>
  );
}

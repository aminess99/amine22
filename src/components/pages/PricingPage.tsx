import React, { useState } from 'react';
import { 
  Check, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Crown, 
  Film, 
  ArrowRight, 
  HelpCircle,
  Clock,
  Download,
  Flame,
  Star,
  CheckCircle2,
  Lock,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface PricingPageProps {
  onGoToStudio: () => void;
  onGoToContact?: () => void;
}

export function PricingPage({ onGoToStudio, onGoToContact }: PricingPageProps) {
  const { user, openAuthModal } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const plans = [
    {
      id: 'free',
      name: 'التجريبية (مجاناً)',
      badge: 'ابدأ الآن',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      description: 'لتجربة دقة التفريغ الصوتي وجودة القوالب بنفسك قبل الترقية.',
      priceMonthly: 0,
      priceYearly: 0,
      period: 'مجاناً للأبد',
      videoCount: '3 فيديوهات شهرياً',
      features: [
        '3 فيديوهات شهرياً (حتى 60 ثانية للفيديو)',
        'تفريغ صوتي عربي فائق الدقة بالذكاء الاصطناعي',
        'الوصول لـ 4 قوالب أساسية',
        'تصدير بجودة SD/HD مع علامة مائية صغيرة',
        'محرر النصوص المتقدم وتوقيت الكلمات'
      ],
      ctaText: 'ابدأ مجاناً الآن',
      popular: false,
      buttonVariant: 'secondary' as const
    },
    {
      id: 'starter',
      name: 'صانع المحتوى (Starter)',
      badge: 'الأوفر للمبتدئين',
      badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      description: 'مثالية لصناع المحتوى والمسوقين الذين ينشرون بانتظام على تيك توك وريلز.',
      priceMonthly: 9,
      priceYearly: 7, // $7/mo billed annually
      period: 'لكل شهر',
      videoCount: '25 فيديو شهرياً',
      features: [
        '25 فيديو شهرياً (تصل حتى 3 دقائق للفيديو)',
        'تصدير فائق الوضوح Full HD 1080p',
        'بدون أي علامة مائية إطلاقاً',
        'الوصول الكامل لجميع القوالب الفيروسية (Hormozi, Beast, etc.)',
        'تنزيل ملفات الترجمة (.SRT و .VTT) بنقرة واحدة',
        'تعديل وتلوين كل كلمة على حدة مع إيموجي تلقائي',
        'حفظ المشاريع سحابياً في حسابك'
      ],
      ctaText: 'اشترك في باقة Starter',
      popular: false,
      buttonVariant: 'default' as const
    },
    {
      id: 'pro',
      name: 'المحترف (Pro)',
      badge: 'الأكثر طلباً واختياراً ⭐',
      badgeColor: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
      description: 'الخيار الأفضل لصناع المحتوى المحترفين الذين يشاركون فيديوهات يومية.',
      priceMonthly: 19,
      priceYearly: 14, // $14/mo billed annually
      period: 'لكل شهر',
      videoCount: '70 فيديو شهرياً',
      features: [
        '70 فيديو شهرياً (فيديوهات ريلز، تيك توك، وبودكاست)',
        'تصدير سينمائي فائق الجودة 4K Ultra HD',
        'رندرة بأعلى سرعة وأولوية معالجة قصوى',
        'جميع مميزات باقة Starter بدون قيود',
        'تخصيص كامل للألوان والخطوط ومكان الكابشن',
        'تحميل سريع وفوري مع سيرفرات معالجة سريعة',
        'دعم فني ذو أولوية خاصة'
      ],
      ctaText: 'اشترك في باقة Pro',
      popular: true,
      buttonVariant: 'primary' as const
    },
    {
      id: 'agency',
      name: 'الوكالات والأعمال (Agency)',
      badge: 'إنتاج غير محدود',
      badgeColor: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
      description: 'للشركات، الوكالات الإعلانية، ومحرري الفيديو الذين ينتجون لعدة عملاء.',
      priceMonthly: 49,
      priceYearly: 39,
      period: 'لكل شهر',
      videoCount: '250 فيديو شهرياً',
      features: [
        '250 فيديو شهرياً بجودة 4K',
        'معالجة فيديوهات بودكاست طويلة حتى 20 دقيقة',
        'دعم العمل الجماعي ومشاريع متعددة',
        'إمكانية تصدير بالجملة (Batch Exports)',
        'تخصيص خطوط وهوية بصرية مخصصة للعلامة التجارية',
        'مدير حساب مخصص ودعم عبر واتساب على مدار الساعة'
      ],
      ctaText: 'تواصل مع فريق الأعمال',
      popular: false,
      buttonVariant: 'purple' as const
    }
  ];

  const faqs = [
    {
      q: 'هل يمكنني تجربة الخدمة مجاناً قبل الاشتراك؟',
      a: 'نعم بكل تأكيد! نوفر باقة مجانية تتيح لك تجربة 3 فيديوهات شهرياً مع كافة أدوات الذكاء الاصطناعي والتفريغ الصوتي العربي لاختبار الدقة قبل أي دفع.'
    },
    {
      q: 'ما هي طرق الدفع المتاحة لديكم؟',
      a: 'ندعم الدفع الآمن ببطاقات Visa و MasterCard و Mada و Apple Pay، بالإضافة إلى إمكانية الدفع عبر PayPal.'
    },
    {
      q: 'هل يمكنني إلغاء اشتراكي في أي وقت؟',
      a: 'نعم، يمكنك إلغاء التجديد التلقائي بضغطة زر واحدة من لوحة التحكم في أي وقت دون أي شروط أو رسوم خفية، وسيظل حسابك نشطاً حتى نهاية الفترة المدفوعة.'
    },
    {
      q: 'هل الفيديوهات المصدرة خالية من العلامة المائية؟',
      a: 'نعم! جميع الباقات المدفوعة (Starter و Pro و Agency) تصدر لك فيديوهات نقية تماماً بدون أي علامة مائية أو شعار.'
    },
    {
      q: 'هل تفريغ اللهجات العربية مدعوم بدقة؟',
      a: 'نعم، يعتمد نموذجنا على أحدث نماذج التفريغ الصوتي التي تم تدريبها على آلاف الساعات من اللهجات العربية المتنوعة (الخليجية، المصرية، الشامية، المغاربية، والفصحى) مع توقيت ظهور الكلمات بدقة ميلي ثانية.'
    },
    {
      q: 'ماذا يحدث إذا احتجت لفيديوهات إضافية في الشهر؟',
      a: 'يمكنك ترقية باقتك في أي وقت بدفع فارق السعر فقط، أو شراء حزم فيديوهات إضافية فورية حسب استخدامك.'
    }
  ];

  const handlePlanAction = (planId: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    // Direct to studio or checkout flow
    onGoToStudio();
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-16 animate-in fade-in duration-300" dir="rtl">
      
      {/* Hero Heading */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>خطط تسعير بسيطة ومناسبة لجميع صناع المحتوى</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          استثمر في انتشار محتواك بأقل من <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">سعر كوب قهوة</span>
        </h1>

        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          جميع الباقات تشمل تفريغاً صوتياً فائق الدقة باللغة العربية، توقيتاً تلقائياً، وقوالب مشاهير صناع المحتوى الأكثر مشاهدة على تيك توك وإنستغرام ريلز.
        </p>

        {/* Billing Cycle Toggle */}
        <div className="pt-4 flex items-center justify-center gap-3">
          <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                billingCycle === 'monthly'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              الدفع الشهري
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer relative",
                billingCycle === 'yearly'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <span>الدفع السنوي</span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold">
                وفر 25%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {plans.map((plan) => {
          const isYearly = billingCycle === 'yearly';
          const price = isYearly ? plan.priceYearly : plan.priceMonthly;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 border",
                plan.popular 
                  ? "bg-gradient-to-b from-slate-900 via-indigo-950/20 to-slate-900 border-indigo-500/60 shadow-2xl shadow-indigo-500/15 lg:-translate-y-2" 
                  : "bg-slate-900/90 border-slate-800 hover:border-slate-700/80 shadow-xl"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-[11px] font-black tracking-wide shadow-md flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>الأكثر شيوعاً وقيمة</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-white">{plan.name}</h3>
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border", plan.badgeColor)}>
                      {plan.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 min-h-[36px] leading-relaxed">
                    {plan.description}
                  </p>
                </div>

                {/* Price Display */}
                <div className="py-4 border-y border-slate-800/80">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white tracking-tight">
                      ${price}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {plan.priceMonthly === 0 ? '' : isYearly ? '/ شهر (فاتورة سنوية)' : '/ شهرياً'}
                    </span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg">
                    <Film className="w-3.5 h-3.5" />
                    <span>{plan.videoCount}</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-slate-300">ما الذي تشمله الباقة:</p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6 mt-6 border-t border-slate-800/60">
                <button
                  onClick={() => handlePlanAction(plan.id)}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-lg",
                    plan.popular
                      ? "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30"
                      : plan.buttonVariant === 'purple'
                      ? "bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200"
                      : "bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white"
                  )}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Highlights */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 space-y-6">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-black text-white">لماذا منصتنا هي الخيار الأذكى للمحتوى العربي؟</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            صممنا المنصة خصيصاً لمشاكل صناع المحتوى العرب التي تتجاهلها التطبيقات الغربية.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
          <div className="p-5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-2.5 text-right">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">دقة استثنائية في العامية والفصحى</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              تفهم المنصة سياق الكلام العربي والتشكيل واللهجات المتداولة بدون أخطاء إملائية مضحكة أو تقطيع غير منطقي للجمل.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-2.5 text-right">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">رندرة فورية وتصدير بجودة 4K</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              بفضل محرك المعالجة المتطور لدينا، يتم تصدير الفيديوهات بأعلى جودة وتوافق مع خوارزميات إنستغرام وتيك توك للحصول على أعلى وصول.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-2.5 text-right">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">أمان وخصوصية تامة لملفاتك</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              فيديوهاتك ومشاريعك مشفرة ومحمية بالكامل، ولا يتم استخدام محتواك لتدريب أي نماذج عامة أو مشاركته مع أي طرف ثالث.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-black text-white">الأسئلة الشائعة حول الخطط والأسعار</h2>
          <p className="text-xs sm:text-sm text-slate-400">كل ما تحتاج معرفته عن الاشتراكات، الإلغاء، والدفع.</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div 
              key={i}
              className="bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden transition-colors"
            >
              <button
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full p-4 sm:p-5 text-right flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-white hover:text-indigo-300 transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                <span className="text-indigo-400 text-lg font-black shrink-0">
                  {activeFaq === i ? '−' : '+'}
                </span>
              </button>
              {activeFaq === i && (
                <div className="p-4 sm:p-5 pt-0 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 bg-slate-900/40">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Conversion Banner */}
      <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900 border border-indigo-500/30 text-center space-y-4 shadow-2xl">
        <h2 className="text-2xl sm:text-3xl font-black text-white">
          جاهز لتحويل فيديوهاتك إلى محتوى فيروسي يخطف الأنظار؟
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
          جرب المنصة الآن مجاناً بدون الحاجة لبطاقة بنكية، واكتشف بنفسك سهولة ودقة العمل.
        </p>
        <div className="pt-2">
          <button
            onClick={onGoToStudio}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-xs sm:text-sm font-extrabold transition-all shadow-xl shadow-indigo-600/30 active:scale-95 cursor-pointer inline-flex items-center gap-2"
          >
            <span>ابدأ تجربة الاستوديو مجاناً الآن</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      </div>

    </div>
  );
}

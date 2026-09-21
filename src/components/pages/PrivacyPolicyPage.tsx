import React from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  EyeOff, 
  Server, 
  FileText, 
  Calendar,
  CheckCircle2,
  Mail
} from 'lucide-react';

interface PrivacyPolicyPageProps {
  onGoToContact: () => void;
}

export function PrivacyPolicyPage({ onGoToContact }: PrivacyPolicyPageProps) {
  const lastUpdated = "20 سبتمبر 2026";

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>حماية البيانات والخصوصية الرقمية</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
          سياسة الخصوصية وأمان البيانات
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 flex items-center justify-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span>آخر تحديث: {lastUpdated}</span>
        </p>
      </div>

      {/* Highlights Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-white mb-1">حذف تلقائي للملفات</h4>
            <p className="text-[11px] text-slate-400">تُحذف الملفات الصوتية المؤقتة تلقائياً من خوادمنا بمجرد إتمام التصدير.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
          <EyeOff className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-white mb-1">لا بيع للبيانات</h4>
            <p className="text-[11px] text-slate-400">فيديوهاتك ومحتواك ملك خاص لك 100% ولا نشاركها إطلاقاً مع أطراف ثالثة.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-white mb-1">اتصال مشفر بالكامل</h4>
            <p className="text-[11px] text-slate-400">تشفير متطور من طرف لطرف (HTTPS / TLS 1.3) لحماية نقل الوسائط بأمان.</p>
          </div>
        </div>
      </div>

      {/* Policy Content Body */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 space-y-8 text-slate-300 text-xs sm:text-sm leading-relaxed">
        
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">1.</span>
            <span>مقدمة والتزامنا الراسخ بحماية خصوصيتك</span>
          </h2>
          <p>
            في <strong>AI Video Captioner</strong>، ندرك تماماً أهمية سرية المحتوى الرقمي وفيديوهات صناع المحتوى والشركات. تهدف سياسة الخصوصية هذه إلى توضيح كيفية تعاملنا مع الملفات التي ترفعها، والبيانات الفنية المعالجة أثناء تشغيل الأداة، والضمانات الصارمة التي نطبقها لمنع أي وصول غير مصرح به.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">2.</span>
            <span>ما هي البيانات التي نقوم بمعالجتها؟</span>
          </h2>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pr-2">
            <li><strong>ملفات الفيديو والصوت:</strong> يتم رفع الفيديو مؤقتاً بغرض استخراج المسار الصوتي وتحليله بواسطة الذكاء الاصطناعي لتوليد الكلمات ومطابقتها زمنياً.</li>
            <li><strong>نصوص الكابشن والترجمات:</strong> يتم تخزين التعديلات (مثل تصحيح الكلمات، وتغيير الألوان، ونوع الخط) داخل جلسة المتصفح الخاصة بك (Local Session) لتسهيل تعديلها.</li>
            <li><strong>البيانات التقنية غير المحددة للهوية:</strong> معلومات المتصفح، أبعاد الشاشة، وسرعة المعالجة لتحسين أداء الرندرة التلقائية ومنع الأخطاء الفنية.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">3.</span>
            <span>سياسة الاحتفاظ بالملفات والحذف الدوري</span>
          </h2>
          <p>
            نحن <strong>لا نحتفظ</strong> بفيديوهاتك على خوادمنا بعد الانتهاء من المعالجة. يتم تنفيذ عمليات تنظيف دورية (Automated Cleanup Cron) تقوم بحذف جميع الملفات الصوتية والفيديوهات المرفوعة فور اكتمال عملية التصدير أو بعد انقضاء جلسة العمل. لا يتم استخدام فيديوهاتك لتدريب نماذج ذكاء اصطناعي عامة بدون إذن صريح.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">4.</span>
            <span>ملفات تعريف الارتباط (Cookies) والتخزين المحلي</span>
          </h2>
          <p>
            نستخدم التخزين المحلي للمتصفح (Local Storage) لحفظ إعدادات التخصيص المفضلة لديك (مثل القالب الافتراضي، حجم الخط، واختيار الألوان)، بحيث تظل إعداداتك مفعلة في المرة القادمة التي تفتح فيها الموقع، دون تتبع أنشطتك على أي مواقع خارجية.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">5.</span>
            <span>التوافق مع المعايير الدولية (GDPR & CCPA)</span>
          </h2>
          <p>
            نلتزم بالمبادئ الأساسية لحماية الخصوصية الرقمية: الحق في معرفة البيانات المعالجة، الحق في سحب الملفات، والحق في الحذف الفوري. ونظراً لأن المنصة لا تشترط جمع بطاقات هوية أو معلومات بنكية لإنتاج الكابشن، فإن مستوى الخصوصية لديك يظل في أعلى درجاته.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">6.</span>
            <span>التواصل والاستفسارات المتعلقة بالخصوصية</span>
          </h2>
          <p>
            إذا كان لديك أي سؤال أو طلب خاص بخصوص حماية بياناتك ومحتواك، يمكنك التواصل معنا مباشرة عبر نموذج الدعم أو البريد الإلكتروني المخصص للخصوصية.
          </p>
          <div className="pt-2">
            <button
              onClick={onGoToContact}
              className="inline-flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 underline"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>مراسلة فريق أمان البيانات والدعم الفني</span>
            </button>
          </div>
        </section>

      </div>

    </div>
  );
}

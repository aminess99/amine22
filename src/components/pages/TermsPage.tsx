import React from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Scale, 
  ShieldAlert, 
  Copyright,
  ArrowRight
} from 'lucide-react';

interface TermsPageProps {
  onGoToStudio: () => void;
}

export function TermsPage({ onGoToStudio }: TermsPageProps) {
  const lastUpdated = "20 سبتمبر 2026";

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <Scale className="w-4 h-4 text-indigo-400" />
          <span>الاتفاقية القانونية وحقوق الاستخدام</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
          شروط الاستخدام والخدمة (Terms of Service)
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 flex items-center justify-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span>تاريخ السريان: {lastUpdated}</span>
        </p>
      </div>

      {/* Quick Summary Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 mb-10 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>ملخص سريع ومبسط للحقوق والشروط:</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            <Copyright className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>أنت المالك الحصري الكامل للفيديو والكابشن والمحتوى المُصدّر.</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>حرية استخدام المحتوى تجارياً في الإعلانات ومنصات التواصل.</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>يُحظر رفع أي محتوى ينتهك حقوق النشر أو يخالف الآداب العامة.</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>إمكانية تصدير نصوص الترجمة SRT و VTT دون أي قيود.</span>
          </div>
        </div>
      </div>

      {/* Main Legal Clauses */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 space-y-8 text-slate-300 text-xs sm:text-sm leading-relaxed">
        
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">1.</span>
            <span>قبول الشروط والأحكام</span>
          </h2>
          <p>
            باستخدامك لمنصة <strong>AI Video Captioner</strong> أو رفع أي ملفات وسائط إليها، فإنك توافق على الالتزام الكامل بشروط هذه الاتفاقية. إذا كنت لا توافق على أي بند من هذه الشروط، يُرجى الامتناع عن استخدام الخدمة.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">2.</span>
            <span>حقوق الملكية الفكرية والتراخيص التجارية</span>
          </h2>
          <p>
            تظل جميع حقوق الملكية الفكرية ومحتوى الفيديوهات التي ترفعها ملكاً خالصاً لك أو للجهة التي تمثلها. لا تكتسب المنصة أي حقوق ملكية على فيديوهاتك. وتمنحك المنصة ترخيصاً تجارياً شاملاً وغير حصري ودائماً لاستخدام الفيديوهات المُصدرة، والترجمات، وملفات SRT/VTT/ASS في أي قنوات ربحية، إعلانات، أو منصات نشر.
          </p>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">3.</span>
            <span>الاستخدام المقبول ومسؤولية المستخدم</span>
          </h2>
          <p>
            أنت تقر وتتعهد بأنك تمتلك الحقوق والتراخيص اللازمة لأي مادة تقوم برفعها، وتلتزم بعدم استخدام المنصة لأي من الأغراض التالية:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pr-2">
            <li>رفع مواد تحرض على العنف أو الكراهية أو التمييز بأي شكل من الأشكال.</li>
            <li>انتهاك حقوق الملكية الفكرية أو العلامات التجارية الخاصة بأشخاص أو شركات أخرى.</li>
            <li>محاولة اختراق الخوادم أو إرسال هجمات حرمان الخدمة (DoS) أو التلاعب ببرمجيات المنصة.</li>
            <li>استغلال المنصة لنشر برمجيات ضارة أو وسائط احتيالية.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">4.</span>
            <span>دقة الذكاء الاصطناعي وإخلاء المسؤولية</span>
          </h2>
          <p>
            تعتمد نتائج التفريغ الصوتي والتوقيت التلقائي على خوارزميات الذكاء الاصطناعي ومعالجة الإشارات الصوتية. ورغم دقة النماذج العالية، إلا أنها قد تتأثر بلهجة المتحدث، ضوضاء الخلفية، أو جودة الميكروفون. تتيح المنصة محرر نصوص تفاعلي متكامل لتعديل الكلمات قبل التصدير، وتتحمل أنت وحدك مسؤولية التدقيق النهائي للنصوص قبل النشر.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400 font-mono">5.</span>
            <span>تعديل الشروط والخدمة</span>
          </h2>
          <p>
            نحتفظ بالحق في تحديث أو تعديل هذه الشروط في أي وقت لمواكبة التحديثات الفنية والقانونية. استمرارك في استخدام المنصة بعد نشر التحديثات يعتبر قبولاً منك بالشروط المعدلة.
          </p>
        </section>

      </div>

      {/* Return to App CTA */}
      <div className="mt-10 text-center">
        <button
          onClick={onGoToStudio}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
        >
          <span>العودة للاستوديو وتجربة المنصة</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}

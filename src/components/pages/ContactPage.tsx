import React, { useState } from 'react';
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  MessageSquare, 
  Clock, 
  Server, 
  HelpCircle, 
  Sparkles,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ContactPageProps {
  onGoToHelp: () => void;
}

export function ContactPage({ onGoToHelp }: ContactPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<'support' | 'feature' | 'business' | 'other'>('support');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة قبل الإرسال.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setErrorMessage('يرجى إدخال عنوان بريد إلكتروني صالح.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 900);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <Mail className="w-4 h-4 text-indigo-400" />
          <span>مركز الدعم الفني وخدمة العملاء</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          تواصل معنا <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
            يسعدنا سماع استفسارك واقتراحاتك
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300">
          سواء كان لديك استفسار فني حول التصدير، أو اقتراح قالب جديد، أو رغبة في شراكة، فريقنا جاهز للرد عليك خلال ساعات.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Direct Info & System Status */}
        <div className="space-y-5 lg:col-span-1">
          
          {/* Quick Contact Card */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>قنوات التواصل المباشر</span>
            </h3>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/60 space-y-1">
                <span className="text-slate-400 block text-[11px]">البريد الإلكتروني المباشر:</span>
                <a 
                  href="mailto:support@captionsai.app"
                  className="font-mono text-indigo-300 font-bold hover:underline dir-ltr text-left block"
                >
                  support@captionsai.app
                </a>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/60 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>زمن الرد والاستجابة:</span>
                </div>
                <p className="font-bold text-white">خلال أقل من 24 ساعة في أيام العمل</p>
              </div>
            </div>
          </div>

          {/* System Health Status Widget */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>حالة الخوادم والأنظمة (System Status)</span>
              </h3>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-slate-800/50">
                <span className="text-slate-400">محرك التعرف الصوتي (Speech AI):</span>
                <span className="text-emerald-400 font-bold">يعمل بكفاءة 100%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-slate-800/50">
                <span className="text-slate-400">سيرفر معالجة الفيديو (FFmpeg Lossless):</span>
                <span className="text-emerald-400 font-bold">يعمل بكفاءة 100%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-slate-800/50">
                <span className="text-slate-400">رندرة الخطوط العربية والألوان:</span>
                <span className="text-emerald-400 font-bold">متصل ومحدث</span>
              </div>
            </div>
          </div>

          {/* Quick FAQ Link */}
          <div className="p-5 rounded-3xl bg-indigo-950/30 border border-indigo-500/20 text-xs space-y-2">
            <div className="flex items-center gap-2 text-indigo-300 font-bold">
              <HelpCircle className="w-4 h-4" />
              <span>هل تبحث عن إجابة فورية؟</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              قد تجد حلاً فورياً لمشكلتك أو استفسارك في صفحة الأسئلة الشائعة دون الحاجة للانتظار.
            </p>
            <button
              onClick={onGoToHelp}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
            >
              تصفح الأسئلة الشائعة الآن
            </button>
          </div>

        </div>

        {/* Right Column: Contact Form */}
        <div className="lg:col-span-2">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden">
            
            {isSubmitted ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white">تم استلام رسالتك بنجاح!</h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                  شكراً لتواصلك معنا يا {name}. سيقوم أحد أفراد فريق الدعم الفني بمراجعة رسالتك والرد عليك عبر بريدك الإلكتروني (<span className="font-mono text-indigo-300">{email}</span>) في أقرب وقت.
                </p>
                <button
                  onClick={() => {
                    setIsSubmitted(false);
                    setMessage('');
                  }}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  إرسال رسالة أخرى
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">أرسل استفسارك أو اقتراحك</h2>
                  <p className="text-xs text-slate-400">يسعدنا تلقي ملاحظاتك لتحسين المحرر باستمرار.</p>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">الاسم الكريم *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: أحمد محمد"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">البريد الإلكتروني *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">نوع الاستفسار</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'support', label: 'دعم فني وتصدير' },
                      { id: 'feature', label: 'اقتراح ميزة / قالب' },
                      { id: 'business', label: 'شراكة تجارية' },
                      { id: 'other', label: 'استفسار عام' },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setCategory(item.id as any)}
                        className={cn(
                          "py-2 px-2 rounded-xl text-center text-[11px] font-bold border transition-all cursor-pointer",
                          category === item.id
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/50"
                            : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">تفاصيل الرسالة أو المشكلة *</label>
                  <textarea
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="اكتب استفسارك بالتفصيل... إذا كانت هناك مشكلة في تصدير فيديو، يُرجى ذكر نوع الفيديو والمتصفح المستخدم."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>إرسال الرسالة إلى الدعم الفني</span>
                    </>
                  )}
                </button>
              </form>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}

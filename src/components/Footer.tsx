import React from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Layers, 
  Zap, 
  HelpCircle, 
  Mail, 
  FileText, 
  Film,
  CheckCircle2,
  Heart
} from 'lucide-react';
import { PageTab } from './Navbar';

interface FooterProps {
  onNavigate: (page: PageTab) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const handleNav = (page: PageTab) => {
    onNavigate(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="w-full border-t border-slate-800/80 bg-slate-950 text-slate-400 text-xs mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-black text-base shadow-md shadow-indigo-600/30">
                C
              </div>
              <span className="font-extrabold text-base text-white">
                AI Video Captioner
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              منصة سحابية متقدمة لتفريغ وتصميم نصوص الكابشن المتحركة للفيديوهات القصيرة والبودكاست بدقة ميلي ثانية، مع دعم كامل للغة العربية وقوالب مشاهير صناع المحتوى.
            </p>
            <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>جاهز للاستخدام الفوري بدون تثبيت برامج</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-xs">الأقسام والصفحات</h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => handleNav('editor')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  <span>محرر الفيديو</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('studio')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Film className="w-3.5 h-3.5 text-indigo-400" />
                  <span>استوديو الكابشن (رفع الفيديو)</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('templates')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>معرض القوالب والأنماط</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('features')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-indigo-400" />
                  <span>المميزات ومحرك المعالجة</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('pricing')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5 text-amber-300 hover:text-amber-200 font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>باقات الأسعار والاشتراكات</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('help')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                  <span>مركز المساعدة والأسئلة الشائعة</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Policies */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-xs">السياسات والشروط</h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => handleNav('privacy')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>سياسة الخصوصية وأمان البيانات</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('terms')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>شروط الاستخدام وحقوق الملكية</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleNav('contact')}
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span>تواصل مع الدعم الفني</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Compatibility & Formats */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-xs">التوافق وصيغ التصدير</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              يدعم فيديوهات Reels، TikTok، Shorts، و LinkedIn. تصدير مباشر بصيغة MP4 H.264 بدقة Full HD و 4K، مع إمكانية تحميل ملفات الترجمة SRT, VTT, ASS لبرامج Premiere Pro و DaVinci Resolve و CapCut.
            </p>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                MP4 H.264
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                320kbps AAC
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                SRT / VTT / ASS
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                Cairo & Tajawal
              </span>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} AI Video Captioner. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-2">
            <span>مصمم خصيصاً لصناع المحتوى والمسوقين في العالم العربي</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-semibold">الخوادم تعمل بكفاءة 100%</span>
          </div>
        </div>

      </div>
    </footer>
  );
}

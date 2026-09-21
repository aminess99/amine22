import React, { useState } from 'react';
import { 
  Download, 
  X, 
  Sparkles, 
  Sliders, 
  Film, 
  Check, 
  HelpCircle, 
  Volume2, 
  Zap,
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ExportQualityOptions } from '../lib/clientVideoExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartExport: (options: ExportQualityOptions) => void;
  isExporting: boolean;
  exportProgress: number;
  videoFileName: string;
  exportError?: string | null;
}

export function ExportModal({
  isOpen,
  onClose,
  onStartExport,
  isExporting,
  exportProgress,
  videoFileName,
  exportError
}: ExportModalProps) {
  const [resolution, setResolution] = useState<'original' | '1080p' | '720p'>('original');
  const [qualityLevel, setQualityLevel] = useState<'ultra' | 'high' | 'balanced'>('ultra');
  const [fps, setFps] = useState<30 | 60>(60);
  const [mode, setMode] = useState<'server_turbo' | 'client_canvas'>('client_canvas');
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleExport = () => {
    onStartExport({
      resolution,
      qualityLevel,
      fps,
      mode
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        dir="rtl" 
        className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm sm:text-base flex items-center gap-1.5">
                <span>تصدير الفيديو بأعلى جودة</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  4K / FHD
                </span>
              </h2>
              <p className="text-slate-400 text-xs truncate max-w-[260px] sm:max-w-xs">
                {videoFileName}
              </p>
            </div>
          </div>

          {!isExporting && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">

          {exportError && !isExporting && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-300 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-red-200 block mb-0.5">حدث خطأ أثناء التصدير</span>
                <span className="text-[11px] leading-relaxed">{exportError}</span>
              </div>
            </div>
          )}

          {/* Active Export Progress Screen */}
          {isExporting ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-5 text-center">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    className="stroke-slate-800"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    className="stroke-indigo-500 transition-all duration-300"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * exportProgress) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute font-black text-xl text-white">
                  {exportProgress}%
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-bold text-base text-white">
                  {exportProgress < 75 
                    ? "جاري معالجة الفيديو والخطوط العربية بتزامن فوري..." 
                    : exportProgress < 95 
                    ? "جاري حفظ الصوت الأصلي بجودة استوديو 320kbps..." 
                    : "اكتمل التصدير! جاري حفظ الملف..."}
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  تزامن صوتي فوري 100% مع الصورة وبدون أي تأخير أو تقطيع.
                </p>
              </div>

              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Engine Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>محرك التصدير (Export Engine)</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    تزامن صوتي فوري ⚡
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Canvas WYSIWYG (Recommended & 100% Preview Match) */}
                  <button
                    type="button"
                    onClick={() => setMode('client_canvas')}
                    className={cn(
                      "p-3 rounded-2xl border text-right transition-all duration-200 flex flex-col justify-between relative",
                      mode === 'client_canvas'
                        ? "bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500/50"
                        : "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">محرك الاستوديو (WYSIWYG)</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          🌟 مطابق 100%
                        </span>
                      </div>
                      {mode === 'client_canvas' && (
                        <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-300 leading-relaxed block">
                      الموصى به: يُصدر بالضبط وبشكل متطابق كل ما تراه في المعاينة (الخطوط العربية المتصلة، البطاقات الزجاجية، والإيموجي) مع صوت أصلي نقي.
                    </span>
                  </button>

                  {/* Option 2: Server Turbo */}
                  <button
                    type="button"
                    onClick={() => setMode('server_turbo')}
                    className={cn(
                      "p-3 rounded-2xl border text-right transition-all duration-200 flex flex-col justify-between relative",
                      mode === 'server_turbo'
                        ? "bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500/50"
                        : "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">محرك Turbo السحابي</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⚡ فائق السرعة
                        </span>
                      </div>
                      {mode === 'server_turbo' && (
                        <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-300 leading-relaxed block">
                      معالجة سحابية عبر السيرفر للفيديوهات الطويلة، مع دمج فوري وتزامن صوتي.
                    </span>
                  </button>
                </div>
              </div>

              {/* Quality Profile Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>مستوى الجودة والنقاء (Quality Profile)</span>
                  <span className="text-[11px] text-indigo-400 font-semibold">معدل بت فائق 35Mbps</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'ultra',
                      title: 'سينمائي فائق',
                      subtitle: 'CRF 15 • 35Mbps',
                      tag: 'أعلى دقة 🌟',
                      desc: 'بدون أي تشويش أو ضياع تفاصيل'
                    },
                    {
                      id: 'high',
                      title: 'عالي قياسي',
                      subtitle: 'CRF 18 • 22Mbps',
                      tag: 'متوازن ⚡',
                      desc: 'جودة ممتازة وسرعة تصدير'
                    },
                    {
                      id: 'balanced',
                      title: 'حجم خفيف',
                      subtitle: 'CRF 21 • 12Mbps',
                      tag: 'سريع 📦',
                      desc: 'ملف أخف للمشاركة السريعة'
                    }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setQualityLevel(item.id as any)}
                      className={cn(
                        "p-3 rounded-2xl border text-right transition-all duration-200 flex flex-col justify-between relative",
                        qualityLevel === item.id
                          ? "bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500/50"
                          : "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        {qualityLevel === item.id && (
                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-indigo-300 font-bold block mb-1">{item.subtitle}</span>
                      <span className="text-[10px] text-slate-400 leading-tight">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution & FPS Settings */}
              <div className="grid grid-cols-2 gap-3">
                {/* Resolution */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">أبعاد الفيديو (Resolution)</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="original">الدقة الأصلية للفيديو (حتى 4K)</option>
                    <option value="1080p">Full HD (1080p) - موصى به للريلز</option>
                    <option value="720p">HD (720p) - خفيف وسريع</option>
                  </select>
                </div>

                {/* FPS */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">معدل الإطارات (Frame Rate)</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none cursor-pointer"
                  >
                    <option value={60}>60 إطار/ثانية (سلاسة فائقة للكلمات)</option>
                    <option value={30}>30 إطار/ثانية (القياسي المعتمد)</option>
                  </select>
                </div>
              </div>

              {/* Quality Features Guarantee */}
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>ضمان الجودة الاحترافية والنقاء:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>صوت أصلي نقي 320kbps AAC بدون تشويش</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>ترميز H.264 متوافق مع إنستغرام وتيك توك</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>خطوط عربية حادة (High-Quality Antialiasing)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>تطابق دقيق 100% مع المعاينة التفاعلية</span>
                  </div>
                </div>
              </div>

              {/* Explanatory Collapsible: Why was quality lower previously? */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    <span>لماذا قد تتأثر الجودة أثناء التصدير وكيف تم حلها؟</span>
                  </span>
                  {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showExplanation && (
                  <div className="p-3.5 pt-0 text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/60 mt-1 space-y-1.5">
                    <p>
                      <strong>1. معدل البت والترميز:</strong> سابقاً كانت متصفحات الويب تطبق معدل بت افتراضي منخفض (2.5Mbps). تم الآن رفع معدل البت إلى <strong>35Mbps</strong> مع ترميز سينمائي <strong>CRF 15</strong> للحفاظ على كل تفصيلة في الفيديو الأصلي.
                    </p>
                    <p>
                      <strong>2. نعومة الخطوط العربية:</strong> تم تفعيل محرك التنعيم عالي الدقة (High-DPI Smoothing) لمنع أي حواف خشنة في الكلمات.
                    </p>
                    <p>
                      <strong>3. سلامة الصوت:</strong> يتم دمج مسار الصوت الأصلي مباشرة دون أي إعادة ضغط مشوشة بجودة استوديو 320kbps.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Action Footer */}
        {!isExporting && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-colors"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>بدء التصدير بالجودة الفائقة (MP4)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

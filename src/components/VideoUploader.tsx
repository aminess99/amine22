import { Upload, Video, AlertCircle, Sparkles, CheckCircle2, HelpCircle, ShieldCheck, Play, Zap, FileText, X, Layers, UserCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '../lib/utils';
import { PageTab } from './Navbar';
import { useAuth } from '../context/AuthContext';

interface VideoUploaderProps {
  onVideoSelect: (file: File) => void;
  onNavigate?: (page: PageTab) => void;
}

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

export function VideoUploader({ onVideoSelect, onNavigate }: VideoUploaderProps) {
  const { user, openAuthModal } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'faq' | 'privacy' | 'terms' | null>(null);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setErrorMessage(null);

    if (fileRejections && fileRejections.length > 0) {
      const rej = fileRejections[0];
      if (rej.file.size > MAX_FILE_SIZE) {
        setErrorMessage("حجم الفيديو يتجاوز 150MB. يرجى اختيار ملف أصغر لضمان سرعة المعالجة واستقرار السيرفر.");
      } else {
        setErrorMessage("يرجى اختيار ملف فيديو صالح بصيغة MP4 أو MOV أو WebM.");
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage("حجم الفيديو يتجاوز 150MB. يرجى اختيار ملف أصغر.");
        return;
      }
      onVideoSelect(file);
    }
  }, [onVideoSelect]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.webm', '.m4v']
    },
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1
  } as any);

  // Generate an instant demo video with audio for testing without needing a local file
  const handleTryDemoVideo = async () => {
    try {
      setIsGeneratingDemo(true);
      setErrorMessage(null);

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas not supported");

      const stream = canvas.captureStream(30);

      // Create audio context for demo narration tone
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const combined = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
      const recorder = new MediaRecorder(combined, { mimeType: mime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const durationSec = 4;
      let frame = 0;
      const totalFrames = durationSec * 30;

      recorder.start();

      const drawDemoFrame = () => {
        if (frame >= totalFrames) {
          recorder.stop();
          return;
        }

        // Animated gradient background
        const grad = ctx.createLinearGradient(0, 0, 720, 1280);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e1b4b');
        grad.addColorStop(1, '#312e81');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 720, 1280);

        // Center card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.roundRect(80, 400, 560, 480, 32);
        ctx.fill();

        // Icon circle
        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.arc(360, 520, 50, 0, Math.PI * 2);
        ctx.fill();

        // Arabic text in canvas
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('فيديو تجريبي للاختبار', 360, 640);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '24px sans-serif';
        ctx.fillText('جرب القوالب والألوان والنصوص المتحركة', 360, 700);

        // Progress bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(140, 760, 440, 8);
        ctx.fillStyle = '#818cf8';
        ctx.fillRect(140, 760, (frame / totalFrames) * 440, 8);

        frame++;
        requestAnimationFrame(drawDemoFrame);
      };

      drawDemoFrame();

      recorder.onstop = () => {
        try {
          osc.stop();
          audioCtx.close();
        } catch (e) {}

        const blob = new Blob(chunks, { type: mime });
        const ext = mime.includes('mp4') ? '.mp4' : '.webm';
        const demoFile = new File([blob], `demo_sample_video${ext}`, { type: mime });
        setIsGeneratingDemo(false);
        onVideoSelect(demoFile);
      };

    } catch (err: any) {
      console.error(err);
      setIsGeneratingDemo(false);
      setErrorMessage("تعذر إنشاء الفيديو التجريبي، يرجى رفع ملف فيديو من جهازك.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[85vh] px-4 py-8">
      <div className="max-w-3xl w-full">
        
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>الذكاء الاصطناعي لتوليد وتصميم الكابشن الاحترافي للفيديو</span>
            </div>

            {user ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>مرحباً، {user.displayName || user.email?.split('@')[0]} (حسابك نشط)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <span>سجل دخولك لحفظ مشاريعك تلقائياً</span>
              </button>
            )}
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            حول كلام الفيديو إلى <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">نصوص متحركة وفيروسية</span>
          </h1>
          
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            تفريغ صوتي فائق الدقة باللغة العربية، توقيت تلقائي لكل كلمة، وقوالب ريلز وتيك توك جاهزة للتصدير بدقة عالية بنقرة واحدة.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            "relative flex flex-col items-center justify-center p-10 sm:p-14 w-full rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden group shadow-2xl",
            isDragActive ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]" : "border-slate-700/80 bg-slate-900/90 hover:border-indigo-500/60 hover:bg-slate-900",
            (isDragReject || errorMessage) && "border-red-500/50 bg-red-500/5"
          )}
        >
          <input {...getInputProps()} />
          
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center gap-5 text-center">
            <div className={cn(
              "p-5 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 transition-transform duration-300 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white shadow-lg",
              isDragActive && "animate-bounce bg-indigo-500 text-white"
            )}>
              <Upload className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <p className="text-lg sm:text-2xl font-bold text-white">
                {isDragActive ? "أفلت ملف الفيديو هنا للبدء..." : "اسحب وأفلت الفيديو أو انقر للاختيار"}
              </p>
              <p className="text-xs sm:text-sm text-slate-400">
                يدعم MP4, MOV, WebM (فيديوهات ريلز، تيك توك، بودكاست، شورتس)
              </p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-xs text-slate-400">
              <span className="bg-slate-800/90 border border-slate-700/70 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-indigo-400" />
                حتى 150MB
              </span>
              <span className="bg-slate-800/90 border border-slate-700/70 px-3 py-1.5 rounded-xl text-slate-300">
                بدون علامات مائية
              </span>
              <span className="bg-slate-800/90 border border-slate-700/70 px-3 py-1.5 rounded-xl text-slate-300">
                دعم كامل للعربية
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleTryDemoVideo}
            disabled={isGeneratingDemo}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-800/50 px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            {isGeneratingDemo ? (
              <span className="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
            )}
            <span>ليس لديك فيديو جاهز؟ جرب فيديو نموذجي فوري</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('templates')}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>استكشف القوالب الـ 12 المتاحة</span>
            </button>
          )}
        </div>

        {/* Trust & Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-10">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
            <Zap className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-white">تفريغ دقيق لكل كلمة</h2>
              <p className="text-xs text-slate-400 mt-1">تزامن دقيق بالميلي ثانية مع الشفاه وحركة الكلام.</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-white">قوالب فيروسية شهيرة</h2>
              <p className="text-xs text-slate-400 mt-1">أنماط Hormozi و MrBeast و Dev و Modern جاهزة.</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-white">خصوصية وأمان 100%</h2>
              <p className="text-xs text-slate-400 mt-1">معالجة فورية وتصدير عالي النقاء بدون علامات مائية.</p>
            </div>
          </div>
        </div>

        {/* Informational Footer Links for Trust & SEO */}
        <div className="mt-12 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>AI Video Captioner — منصة تصميم الكابشن الاحترافي</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate && onNavigate('pricing')}
              className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 font-bold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>الأسعار والباقات</span>
            </button>
            <button
              onClick={() => onNavigate ? onNavigate('help') : setActiveModal('faq')}
              className="hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>الأسئلة الشائعة</span>
            </button>
            <button
              onClick={() => onNavigate ? onNavigate('privacy') : setActiveModal('privacy')}
              className="hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>سياسة الخصوصية</span>
            </button>
            <button
              onClick={() => onNavigate ? onNavigate('terms') : setActiveModal('terms')}
              className="hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>شروط الاستخدام</span>
            </button>
          </div>
        </div>

      </div>

      {/* Info Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-right max-h-[85vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-5 left-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {activeModal === 'faq' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-indigo-400" />
                  الأسئلة الشائعة (FAQ)
                </h3>
                <div className="space-y-3 text-xs sm:text-sm text-slate-300">
                  <div className="p-3 bg-slate-800/60 rounded-xl">
                    <p className="font-bold text-white mb-1">كيف يتم التعرف على الصوت وتوليد الكلمات؟</p>
                    <p className="text-slate-400">تستخدم المنصة أحدث نماذج الذكاء الاصطناعي لتحليل الموجات الصوتية بدقة متناهية وإعطاء بداية ونهاية لكل كلمة بدقة أجزاء من الثانية.</p>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-xl">
                    <p className="font-bold text-white mb-1">هل يمكنني تعديل الكلمات أو الخطوط يدوياً؟</p>
                    <p className="text-slate-400">نعم، يمكنك النقر على أي كلمة لتعديل نصها، وتغيير نوع الخط (Cairo, Tajawal, Anton, إلخ)، الحجم، اللون، والتأثيرات بحرية كاملة.</p>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-xl">
                    <p className="font-bold text-white mb-1">ما هي صيغة الفيديو بعد التصدير؟</p>
                    <p className="text-slate-400">يتم تصدير الفيديو بصيغة MP4 (H.264) قياسية عالية الجودة متوافقة مباشرة مع إنستغرام، تيك توك، ويوتيوب بدون فقدان نقاء الصوت.</p>
                  </div>
                </div>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  سياسة الخصوصية
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  نحن نحترم خصوصيتك بالكامل. يتم استخدام الفيديوهات المرفوعة حصرياً لمعالجة التفريغ الصوتي وتوليد النصوص، ولا يتم بيع أو مشاركة أي بيانات أو محتوى مع أطراف ثالثة.
                </p>
                <p className="text-xs sm:text-sm text-slate-400">
                  تُحذف الملفات المؤقتة دورياً من السيرفر بمجرد إتمام التصدير بنجاح.
                </p>
              </div>
            )}

            {activeModal === 'terms' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  شروط الاستخدام
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  من خلال استخدامك لهذه الخدمة، فإنك تقر بامتلاكك لحقوق المحتوى الذي تقوم برفعه ومعالجته، وتوافق على عدم استخدام المنصة لإنتاج أو نشر أي محتوى ينتهك القوانين أو حقوق الملكية الفكرية.
                </p>
              </div>
            )}

            <button
              onClick={() => setActiveModal(null)}
              className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

    </div>
  );
}


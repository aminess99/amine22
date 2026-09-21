import React, { useEffect, useRef, useState } from 'react';
import { CaptionSegment, CaptionWord, EditorSettings, TemplateType } from '../types';
import { CaptionOverlay } from './CaptionOverlay';
import { TemplateSidebar } from './TemplateSidebar';
import { StyleSidebar } from './StyleSidebar';
import { TranscriptionSidebar } from './TranscriptionSidebar';
import { Timeline } from './Timeline';
import { WordInspectorModal } from './WordInspectorModal';
import { 
  LayoutTemplate, 
  AlignLeft, 
  Download, 
  FileText, 
  AlertCircle, 
  Check, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Sparkles,
  Sliders,
  ChevronLeft,
  Play,
  User as UserIcon,
  CloudCheck,
  Save,
  Cloud,
  Plus,
  Upload,
  FileUp,
  ExternalLink,
  RotateCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveProjectToFirestore } from '../lib/firebaseProjects';
import { cn } from '../lib/utils';
import { generateAss, generateSrt, generateVtt, parseSrt } from '../lib/assGenerator';
import { rechunkSegments, autoAlignTimestamps, shiftTimestamps } from '../lib/chunkUtils';
import { exportVideoViaCanvas, ExportQualityOptions } from '../lib/clientVideoExporter';
import { ExportModal } from './ExportModal';

import { SavedProject } from '../lib/firebaseProjects';

interface CaptionEditorProps {
  videoFile: File;
  onBack: () => void;
  initialTemplate?: TemplateType;
  initialProject?: SavedProject | null;
}

export function CaptionEditor({ videoFile, onBack, initialTemplate, initialProject }: CaptionEditorProps) {
  const { user, openAuthModal } = useAuth();
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [segments, setSegments] = useState<CaptionSegment[]>(initialProject?.segments || []);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const createdUrlRef = useRef<string | null>(null);

  const [settings, setSettings] = useState<EditorSettings>(
    initialProject?.settings || {
      template: initialTemplate || 'hormozi',
      primaryColor: '#FFDE59',
      outlineColor: '#000000',
      backgroundColor: 'transparent',
      fontSize: 48,
      fontFamily: 'Cairo',
      yPosition: 'bottom',
      aspectRatio: '9:16',
      wordsPerChunk: 3,
      showEmojis: true,
      syncOffset: 0,
    }
  );

  const [activeTab, setActiveTab] = useState<'templates' | 'transcript' | 'style'>('templates');

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isCreditsDepleted, setIsCreditsDepleted] = useState<boolean>(false);
  const srtInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedSrt, setCopiedSrt] = useState(false);
  const [copiedVtt, setCopiedVtt] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [sessionVideoId, setSessionVideoId] = useState<string | null>(null);

  // Inspector state for single-word fine tuning
  const [inspectingWord, setInspectingWord] = useState<CaptionWord | null>(null);
  const [inspectingSegmentId, setInspectingSegmentId] = useState<string | null>(null);

  // Cloud Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const handleSaveProject = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    try {
      setIsSaving(true);
      const projId = await saveProjectToFirestore(user.uid, {
        id: currentProjectId || undefined,
        videoName: videoFile.name,
        template: settings.template,
        captionCount: segments.length,
        duration: duration || 0,
        segments: segments,
        settings: settings
      });
      setCurrentProjectId(projId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const rawSegmentsRef = useRef<CaptionSegment[]>([]);

  // Split a segment into two at given word index
  const handleSplitSegment = (segmentId: string, wordIndex: number) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === segmentId);
      if (idx === -1) return prev;
      const target = prev[idx];
      if (wordIndex <= 0 || wordIndex >= target.words.length) return prev;

      const firstWords = target.words.slice(0, wordIndex);
      const secondWords = target.words.slice(wordIndex);

      const firstSeg: CaptionSegment = {
        id: `seg_${Math.random().toString(36).substring(7)}`,
        start: firstWords[0].start,
        end: firstWords[firstWords.length - 1].end,
        words: firstWords,
      };

      const secondSeg: CaptionSegment = {
        id: `seg_${Math.random().toString(36).substring(7)}`,
        start: secondWords[0].start,
        end: secondWords[secondWords.length - 1].end,
        words: secondWords,
      };

      const newSegs = [...prev];
      newSegs.splice(idx, 1, firstSeg, secondSeg);
      return newSegs;
    });
  };

  // Merge segment with next
  const handleMergeWithNext = (segmentId: string) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === segmentId);
      if (idx === -1 || idx === prev.length - 1) return prev;

      const current = prev[idx];
      const next = prev[idx + 1];

      const mergedSeg: CaptionSegment = {
        id: current.id,
        start: current.start,
        end: next.end,
        words: [...current.words, ...next.words],
      };

      const newSegs = [...prev];
      newSegs.splice(idx, 2, mergedSeg);
      return newSegs;
    });
  };

  // Initialize and load video safely
  useEffect(() => {
    if (!videoFile) return;

    setVideoError(null);
    setIsConverting(false);

    if (createdUrlRef.current) {
      URL.revokeObjectURL(createdUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(videoFile);
    createdUrlRef.current = objectUrl;
    setVideoUrl(objectUrl);

    // Run AI Transcription automatically if no segments already loaded
    if (!initialProject || !initialProject.segments || initialProject.segments.length === 0) {
      transcribeVideo(videoFile);
    } else {
      rawSegmentsRef.current = initialProject.segments;
    }

    return () => {
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
      }
    };
  }, [videoFile]);

  // Video fallback error handler
  const handleVideoError = async () => {
    if (!videoFile || isConverting) return;
    setIsConverting(true);
    setVideoError("جارٍ تحويل الفيديو إلى صيغة MP4 متوافقة مع المتصفح...");

    try {
      const formData = new FormData();
      formData.append('video', videoFile);

      const res = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('فشل تحويل الفيديو في السيرفر.');
      }

      const blob = await res.blob();
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
      }
      const convertedUrl = URL.createObjectURL(blob);
      createdUrlRef.current = convertedUrl;
      setVideoUrl(convertedUrl);
      setVideoError(null);
    } catch (err: any) {
      console.error("Convert error:", err);
      setVideoError("تعذر تشغيل الفيديو في المتصفح. يرجى تجربة ملف MP4 قياسي (H.264).");
    } finally {
      setIsConverting(false);
    }
  };

  // Transcription caller with auto-alignment
  const transcribeVideo = async (file: File) => {
    setIsTranscribing(true);
    setTranscriptionError(null);
    setIsCreditsDepleted(false);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        const text = await response.text();
        console.error("Non-JSON response from server:", text);
      }

      if (!response.ok) {
        if (data?.videoId) {
          setSessionVideoId(data.videoId);
        }
        if (data?.creditsDepleted || response.status === 402) {
          setIsCreditsDepleted(true);
        }
        throw new Error(data?.error || `فشل الاتصال بخدمة التعرف الصوتي (${response.status})`);
      }

      if (!data) {
        throw new Error("استجابة غير متوقعة من السيرفر.");
      }

      if (data.videoId) {
        setSessionVideoId(data.videoId);
      }

      if (data.creditsDepleted) {
        setIsCreditsDepleted(true);
        setTranscriptionError(data.warning || "رصيد حساب Google AI Studio مستنفد (Prepayment credits depleted). يمكنك تجربة القوالب مع كابشن تجريبي فوري أو استيراد ملف SRT أو كتابة النصوص يدوياً.");
        return;
      }

      if (data.noSpeechFound) {
        setTranscriptionError(data.warning || "لم يتم العثور على أي كلام منطوق في الفيديو. يمكنك إضافة كابشن تجريبي أو استيراد SRT.");
        return;
      }

      if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
        rawSegmentsRef.current = data.segments;
        
        // Chunk and auto-align timestamps automatically for 100% sync
        const chunked = rechunkSegments(data.segments, settings.wordsPerChunk || 3);
        const aligned = autoAlignTimestamps(chunked);
        setSegments(aligned);
      } else {
        throw new Error('لم يتم العثور على نصوص منطوقة في الفيديو.');
      }
    } catch (error: any) {
      console.error('Transcription failed:', error);
      setTranscriptionError(error.message || 'حدث خطأ أثناء استخراج الصوت والكلام.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateSampleCaptions = () => {
    const vidDuration = duration > 0 ? duration : 10;
    const step = Math.max(2, vidDuration / 4);
    const sampleSentences = [
      "مرحباً بك في أسرع محرر كابشن بالذكاء الاصطناعي 🚀",
      "قوالب ريلز وتيك توك متحركة احترافية بنقرة واحدة ✨",
      "ألوان وتدرجات براقة وتأثيرات هورموزي نارية 🔥",
      "صدّر فيديوهاتك بجودة فائقة 1080p و 4K فوراً 🎬"
    ];

    const newSegs: CaptionSegment[] = [];
    sampleSentences.forEach((sentence, idx) => {
      const segStart = Number((idx * step).toFixed(2));
      const segEnd = Number(Math.min(vidDuration, (idx + 1) * step).toFixed(2));
      if (segStart >= vidDuration) return;

      const wordsArr = sentence.split(' ').filter(Boolean);
      const wordDur = Math.max(0.2, (segEnd - segStart) / wordsArr.length);
      const words: CaptionWord[] = wordsArr.map((w, wIdx) => ({
        id: 'w_' + Math.random().toString(36).substring(7),
        text: w,
        start: Number((segStart + wIdx * wordDur).toFixed(2)),
        end: Number((segStart + (wIdx + 1) * wordDur).toFixed(2)),
      }));

      newSegs.push({
        id: 'seg_' + Math.random().toString(36).substring(7),
        start: segStart,
        end: segEnd,
        words
      });
    });

    rawSegmentsRef.current = newSegs;
    setSegments(newSegs);
    setTranscriptionError(null);
  };

  const handleImportSrtFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseSrt(content);
        if (parsed.length > 0) {
          rawSegmentsRef.current = parsed;
          const chunked = rechunkSegments(parsed, settings.wordsPerChunk || 3);
          const aligned = autoAlignTimestamps(chunked);
          setSegments(aligned);
          setTranscriptionError(null);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddManualSegment = () => {
    const start = Number(currentTime.toFixed(2));
    const end = Number((currentTime + 2.5).toFixed(2));
    const newSeg: CaptionSegment = {
      id: 'seg_' + Math.random().toString(36).substring(7),
      start,
      end,
      words: [
        { id: 'w_' + Math.random().toString(36).substring(7), text: 'اكتب', start: start, end: Number((start + 0.8).toFixed(2)) },
        { id: 'w_' + Math.random().toString(36).substring(7), text: 'نصك', start: Number((start + 0.8).toFixed(2)), end: Number((start + 1.6).toFixed(2)) },
        { id: 'w_' + Math.random().toString(36).substring(7), text: 'هنا', start: Number((start + 1.6).toFixed(2)), end: end },
      ]
    };
    setSegments(prev => [...prev, newSeg].sort((a, b) => a.start - b.start));
    setTranscriptionError(null);
    setActiveTab('transcript');
  };

  // Keep track of current video time accurately via requestAnimationFrame
  useEffect(() => {
    let animFrameId: number;
    const update = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animFrameId = requestAnimationFrame(update);
    };

    animFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handlePlaybackRateChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const handleSettingsChange = (newSettings: EditorSettings) => {
    if (newSettings.wordsPerChunk !== settings.wordsPerChunk) {
      const base = rawSegmentsRef.current.length > 0 ? rawSegmentsRef.current : segments;
      const rechunked = rechunkSegments(base, newSettings.wordsPerChunk);
      const aligned = autoAlignTimestamps(rechunked);
      setSegments(aligned);
    }
    setSettings(newSettings);
  };

  // Open single-word inspector
  const handleOpenWordInspector = (word: CaptionWord, segmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInspectingWord(word);
    setInspectingSegmentId(segmentId);
  };

  // Update single word in state
  const handleUpdateWord = (segmentId: string, wordId: string, updates: Partial<CaptionWord>) => {
    setSegments(prev =>
      prev.map(seg => {
        if (seg.id !== segmentId) return seg;
        return {
          ...seg,
          words: seg.words.map(w => w.id === wordId ? { ...w, ...updates } : w)
        };
      })
    );
  };

  // Subtitles download handlers
  const handleDownloadSrt = () => {
    const srtContent = generateSrt(segments);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoFile.name.replace(/\.[^/.]+$/, "")}_captions.srt`;
    a.click();
    URL.revokeObjectURL(url);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  const handleDownloadVtt = () => {
    const vttContent = generateVtt(segments);
    const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoFile.name.replace(/\.[^/.]+$/, "")}_captions.vtt`;
    a.click();
    URL.revokeObjectURL(url);
    setCopiedVtt(true);
    setTimeout(() => setCopiedVtt(false), 2000);
  };

  // Video Export Handler (100% WYSIWYG match + Full Pristine Audio + Universal H.264 MP4)
  const handleServerExport = async (options?: ExportQualityOptions) => {
    setIsExporting(true);
    setExportProgress(5);
    setExportError(null);

    try {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }

      if (!videoRef.current) {
        throw new Error("عنصر الفيديو غير متوفر");
      }

      const mode = options?.mode || 'server_turbo';

      // 1. Turbo Server Export: Ultra-fast FFmpeg ASS burn-in with 100% original audio & full Arabic fonts
      if (mode === 'server_turbo') {
        try {
          setExportProgress(15);
          const width = videoRef.current?.videoWidth || 1080;
          const height = videoRef.current?.videoHeight || 1920;
          const assContent = generateAss(segments, settings, width, height);

          const formData = new FormData();
          formData.append('ass', assContent);
          if (sessionVideoId) {
            formData.append('videoId', sessionVideoId);
          }
          if (!sessionVideoId || videoFile.size < 60 * 1024 * 1024) {
            formData.append('video', videoFile);
          }
          formData.append('filename', videoFile.name);
          formData.append('quality', options?.resolution || '1080p');

          setExportProgress(35);
          const exportRes = await fetch('/api/export', {
            method: 'POST',
            body: formData,
          });

          if (exportRes.ok) {
            setExportProgress(90);
            const blob = await exportRes.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `captioned_${videoFile.name.replace(/\.[^/.]+$/, "")}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

            setExportProgress(100);
            setTimeout(() => {
              setIsExporting(false);
              setIsExportModalOpen(false);
              setExportProgress(0);
            }, 1000);
            return;
          } else {
            const errData = await exportRes.json().catch(() => null);
            console.warn("Server turbo export failed with:", errData, "falling back to Canvas rendering...");
          }
        } catch (serverErr) {
          console.warn("Server turbo export error, falling back to Canvas rendering:", serverErr);
        }
      }

      // 2. Render pixel-perfect canvas frames with identical styles, fonts, Arabic RTL, and emojis
      setExportProgress(20);
      const canvasBlob = await exportVideoViaCanvas(
        videoRef.current,
        segments,
        settings,
        (pct) => setExportProgress(Math.min(75, Math.max(20, Math.round(20 + pct * 0.55)))),
        options
      );

      setExportProgress(80);

      let exportedSuccessfully = false;

      // 3. Remux on server with the original pristine audio track into standard H.264 MP4
      try {
        const formData = new FormData();
        formData.append('video', canvasBlob, 'canvas.webm');
        
        // If sessionVideoId exists, server already has the original video on disk (avoids heavy re-uploading)
        if (sessionVideoId) {
          formData.append('videoId', sessionVideoId);
        }
        if (!sessionVideoId || videoFile.size < 60 * 1024 * 1024) {
          formData.append('originalVideo', videoFile);
        }
        formData.append('filename', videoFile.name);
        formData.append('quality', options?.qualityLevel || 'ultra');
        if (videoRef.current?.duration) {
          formData.append('duration', String(videoRef.current.duration));
        }

        const remuxResponse = await fetch('/api/remux', {
          method: 'POST',
          body: formData,
        });

        if (remuxResponse.ok) {
          setExportProgress(95);
          const finalMp4Blob = await remuxResponse.blob();
          const downloadUrl = URL.createObjectURL(finalMp4Blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `captioned_${videoFile.name.replace(/\.[^/.]+$/, "")}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
          exportedSuccessfully = true;
        } else {
          console.warn(`Server remux returned status ${remuxResponse.status}, falling back to direct client video export.`);
        }
      } catch (networkOrServerErr) {
        console.warn("Server remux failed (network/timeout/Failed to fetch), using instant direct client export fallback:", networkOrServerErr);
      }

      // 4. Resilient Fallback: If server remux failed or connection dropped ("Failed to fetch"), download the high-res client canvas video directly
      if (!exportedSuccessfully) {
        setExportProgress(95);
        const downloadUrl = URL.createObjectURL(canvasBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        const fileExt = canvasBlob.type.includes('mp4') ? 'mp4' : 'webm';
        a.download = `captioned_${videoFile.name.replace(/\.[^/.]+$/, "")}.${fileExt}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        exportedSuccessfully = true;
      }

      setExportProgress(100);
      setTimeout(() => {
        setIsExporting(false);
        setIsExportModalOpen(false);
        setExportProgress(0);
      }, 1200);

    } catch (err: any) {
      console.error("Export error:", err);
      setExportError(err.message || "حدث خطأ أثناء تصدير الفيديو.");
      setIsExporting(false);
    }
  };

  // Dynamic aspect ratio container styling
  const aspectRatioClass = 
    settings.aspectRatio === '9:16' ? 'aspect-[9/16]' :
    settings.aspectRatio === '1:1' ? 'aspect-square' :
    settings.aspectRatio === '4:5' ? 'aspect-[4/5]' :
    settings.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] w-full bg-slate-950 text-white overflow-hidden select-none font-sans">
      
      {/* Primary Video Workspace */}
      <main className="flex-1 flex flex-col min-h-0 bg-slate-950 overflow-hidden relative border-b lg:border-b-0 lg:border-r border-slate-800/80">
        
        {/* Sleek Top Navigation Bar */}
        <header className="h-12 sm:h-14 bg-slate-900/90 border-b border-slate-800/80 px-3 sm:px-5 flex items-center justify-between z-20 shrink-0 backdrop-blur-md">
          
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
              title="رجوع لاختيار فيديو آخر"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">رجوع</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/25">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h1 className="text-white font-bold text-xs sm:text-sm leading-tight">Captions AI</h1>
              </div>
            </div>
          </div>

          {/* Subtitle Downloads & Video Export */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80">
              <button
                onClick={handleDownloadSrt}
                disabled={segments.length === 0}
                className={cn(
                  "px-2 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1",
                  copiedSrt ? "bg-emerald-500/20 text-emerald-300" : "text-slate-300 hover:text-white hover:bg-slate-700/60"
                )}
                title="تنزيل ملف ترجمة .SRT"
              >
                {copiedSrt ? <Check className="w-3 h-3 text-emerald-400" /> : <FileText className="w-3 h-3 text-indigo-400" />}
                <span>SRT</span>
              </button>
              <button
                onClick={handleDownloadVtt}
                disabled={segments.length === 0}
                className={cn(
                  "px-2 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1",
                  copiedVtt ? "bg-emerald-500/20 text-emerald-300" : "text-slate-300 hover:text-white hover:bg-slate-700/60"
                )}
                title="تنزيل ملف ترجمة .VTT"
              >
                {copiedVtt ? <Check className="w-3 h-3 text-emerald-400" /> : <FileText className="w-3 h-3 text-purple-400" />}
                <span>VTT</span>
              </button>
            </div>

            {/* Save Project to Cloud */}
            <button
              onClick={handleSaveProject}
              disabled={isSaving || segments.length === 0}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer",
                saveSuccess
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-800/90 hover:bg-slate-750 border-slate-700 text-slate-200 hover:text-white"
              )}
              title={user ? "حفظ المشروع والترجمات في حسابك السحابي" : "سجل الدخول لحفظ المشروع"}
            >
              {isSaving ? (
                <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span className="hidden sm:inline">
                {isSaving ? "جاري الحفظ..." : saveSuccess ? "تم الحفظ!" : "حفظ المشروع"}
              </span>
            </button>

            <button 
              onClick={() => setIsExportModalOpen(true)}
              disabled={isExporting}
              className={cn(
                "px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 active:scale-95 cursor-pointer",
                isExporting 
                  ? "bg-slate-700 text-slate-300 cursor-wait" 
                  : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/30"
              )}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? `تصدير... ${exportProgress}%` : "تصدير الفيديو (FHD/4K)"}</span>
            </button>

            {/* Auth / Account status in Editor */}
            {!user ? (
              <button
                type="button"
                onClick={openAuthModal}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                title="تسجيل الدخول لحفظ مشاريعك سحابياً"
              >
                <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>دخول</span>
              </button>
            ) : (
              <div 
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-semibold"
                title={`مسجل باسم ${user.displayName || user.email}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="max-w-[70px] truncate">{user.displayName?.split(' ')[0] || 'حسابي'}</span>
              </div>
            )}
          </div>
        </header>

        {exportError && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between text-xs text-red-300 z-20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{exportError}</span>
            </div>
            <button 
              onClick={() => setExportError(null)}
              className="text-red-400 hover:text-red-200 underline text-xs"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Video Canvas Stage: Dominates screen space cleanly */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden flex items-center justify-center p-2 sm:p-5">
          
          <div 
            className={cn(
              "relative h-full max-h-full bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 group cursor-pointer flex items-center justify-center transition-all duration-200 @container",
              aspectRatioClass
            )}
            onClick={togglePlay}
          >
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={handleVideoError}
                loop
                playsInline
                muted={isMuted}
                autoPlay
              />
            )}

            {/* Quick Floating Actions */}
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors backdrop-blur-md shadow"
                title={isMuted ? "تشغيل الصوت" : "كتم الصوت"}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-300" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              <button
                onClick={() => setIsFullscreenPreview(prev => !prev)}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors backdrop-blur-md shadow"
                title={isFullscreenPreview ? "إظهار لوحة التحكم" : "تكبير المعاينة"}
              >
                {isFullscreenPreview ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-200" />}
              </button>
            </div>
            
            {/* Play prompt overlay when paused */}
            {!isPlaying && !isConverting && !videoError && (
              <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Play className="w-5 h-5 sm:w-7 sm:h-7 text-white fill-white ml-0.5" />
                </div>
              </div>
            )}

            {/* WYSIWYG Captions Overlay with container-responsive font sizes */}
            <CaptionOverlay 
              segments={segments} 
              currentTime={currentTime} 
              settings={settings}
              onPositionChange={(percent) => setSettings(s => ({ ...s, yOffsetPercent: percent }))}
              onWordClick={handleOpenWordInspector}
              videoWidth={videoRef.current?.videoWidth || 1080}
              videoHeight={videoRef.current?.videoHeight || 1920}
            />

            {/* Converting Video Loading State */}
            {isConverting && (
              <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center z-30 px-6 text-center">
                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-2" />
                <p className="text-white font-semibold text-xs">جارٍ معالجة صيغة الفيديو...</p>
              </div>
            )}

            {/* Transcribing State */}
            {isTranscribing && (
              <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-md flex flex-col items-center justify-center z-30 px-6 text-center pointer-events-none">
                <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-3" />
                <p className="text-white font-bold text-xs sm:text-sm">توليد النصوص والترجمة بالذكاء الاصطناعي...</p>
                <p className="text-slate-400 text-[11px] mt-0.5">مزامنة الكلمات والإيموجي بدقة</p>
              </div>
            )}

            {/* Hidden SRT File Input */}
            <input 
              type="file"
              ref={srtInputRef}
              accept=".srt,.vtt"
              className="hidden"
              onChange={handleImportSrtFile}
            />

            {/* Error State */}
            {transcriptionError && !isTranscribing && (
              <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center z-30 px-5 text-center overflow-y-auto py-6">
                <div className={cn(
                  "w-11 h-11 flex items-center justify-center rounded-2xl mb-3 shadow-lg",
                  isCreditsDepleted ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                )}>
                  {isCreditsDepleted ? <AlertCircle className="w-6 h-6" /> : <span className="text-xl font-bold">!</span>}
                </div>
                
                <p className="text-white font-bold text-sm sm:text-base mb-1.5">
                  {isCreditsDepleted ? "نفاد رصيد الذكاء الاصطناعي (AI Credits)" : "تعذر التفريغ التلقائي"}
                </p>
                <p className="text-slate-300 text-xs max-w-sm leading-relaxed mb-4">
                  {transcriptionError}
                </p>

                <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 max-w-md w-full">
                  <button 
                    type="button"
                    onClick={handleGenerateSampleCaptions}
                    className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>توليد كابشن تجريبي فوري للبدء</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => srtInputRef.current?.click()}
                    className="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>استيراد ملف ترجمة (.SRT)</span>
                  </button>

                  <button 
                    type="button"
                    onClick={handleAddManualSegment}
                    className="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>إضافة نصوص يدوياً</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-800/80">
                  {isCreditsDepleted && (
                    <a
                      href="https://ai.studio/projects"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      <span>شحن الرصيد في Google AI Studio</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  <button 
                    type="button"
                    onClick={() => transcribeVideo(videoFile)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>إعادة المحاولة</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compact Scrubber Timeline */}
        <Timeline
          duration={duration}
          currentTime={currentTime}
          segments={segments}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          onTogglePlay={togglePlay}
          onWordClick={handleOpenWordInspector}
          playbackRate={playbackRate}
          onPlaybackRateChange={handlePlaybackRateChange}
        />

      </main>

      {/* Editor Side / Bottom Sheet Panel */}
      <aside className={cn(
        "bg-slate-900 flex flex-col shrink-0 z-20 transition-all duration-200",
        isFullscreenPreview 
          ? "hidden" 
          : "h-[40dvh] lg:h-full w-full lg:w-[410px]"
      )}>
        
        {/* Navigation Tabs Header: 3 sleek tabs */}
        <div className="flex p-1.5 bg-slate-900 border-b border-slate-800/80 shrink-0 gap-1.5">
          
          <button 
            onClick={() => setActiveTab('templates')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'templates' 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" 
                : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span>القوالب</span>
          </button>

          <button 
            onClick={() => setActiveTab('transcript')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'transcript' 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" 
                : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>النصوص ({segments.length})</span>
          </button>

          <button 
            onClick={() => setActiveTab('style')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'style' 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" 
                : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>التنسيق</span>
          </button>

        </div>
        
        {/* Active Tab Panel */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'templates' && (
            <TemplateSidebar settings={settings} onSettingsChange={handleSettingsChange} />
          )}

          {activeTab === 'transcript' && (
            <TranscriptionSidebar 
              segments={segments} 
              currentTime={currentTime} 
              syncOffset={settings.syncOffset || 0}
              onSeek={handleSeek}
              onSplitSegment={handleSplitSegment}
              onMergeWithNext={handleMergeWithNext}
              onWordClick={handleOpenWordInspector}
              onSyncOffsetChange={(offset) => setSettings(s => ({ ...s, syncOffset: offset }))}
              onAutoAlign={() => setSegments(prev => autoAlignTimestamps(prev))}
              onShiftSegment={(segmentId, delta) => setSegments(prev => shiftTimestamps(prev, delta, segmentId))}
              onAddSegment={handleAddManualSegment}
              onGenerateSampleCaptions={handleGenerateSampleCaptions}
              onImportSrtClick={() => srtInputRef.current?.click()}
              onWordEdit={(segmentId, wordId, newText) => {
                setSegments(prevSegments => 
                  prevSegments.map(seg => {
                    if (seg.id !== segmentId) return seg;
                    return {
                      ...seg,
                      words: seg.words.map(w => w.id === wordId ? { ...w, text: newText } : w)
                    };
                  })
                );
              }}
            />
          )}

          {activeTab === 'style' && (
            <StyleSidebar settings={settings} onSettingsChange={handleSettingsChange} />
          )}
        </div>
      </aside>

      {/* Quick Word Inspector Modal */}
      {inspectingWord && inspectingSegmentId && (
        <WordInspectorModal
          word={inspectingWord}
          segmentId={inspectingSegmentId}
          onClose={() => {
            setInspectingWord(null);
            setInspectingSegmentId(null);
          }}
          onUpdateWord={handleUpdateWord}
          onPlayRange={(start, end) => {
            if (videoRef.current) {
              videoRef.current.currentTime = start;
              videoRef.current.play().catch(() => {});
              setIsPlaying(true);
            }
          }}
        />
      )}

      {/* Export Quality Options & Progress Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportError(null);
        }}
        onStartExport={(options) => handleServerExport(options)}
        isExporting={isExporting}
        exportProgress={exportProgress}
        videoFileName={videoFile.name}
        exportError={exportError}
      />

    </div>
  );
}

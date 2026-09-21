import { AlignLeft, Clock, Edit2, Check, Scissors, Merge, Search, Sparkles, Palette, Play, FastForward, Rewind, RefreshCw, Wand2, Sliders, Plus, FileUp } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { CaptionSegment, CaptionWord } from '../types';

interface TranscriptionSidebarProps {
  segments: CaptionSegment[];
  currentTime: number;
  syncOffset?: number;
  onSeek: (time: number) => void;
  onWordEdit?: (segmentId: string, wordId: string, newText: string) => void;
  onSplitSegment?: (segmentId: string, wordIndex: number) => void;
  onMergeWithNext?: (segmentId: string) => void;
  onWordClick?: (word: CaptionWord, segmentId: string, e: React.MouseEvent) => void;
  onSyncOffsetChange?: (offset: number) => void;
  onAutoAlign?: () => void;
  onShiftSegment?: (segmentId: string, delta: number) => void;
  onAddSegment?: () => void;
  onGenerateSampleCaptions?: () => void;
  onImportSrtClick?: () => void;
}

export function TranscriptionSidebar({ 
  segments, 
  currentTime, 
  syncOffset = 0,
  onSeek, 
  onWordEdit,
  onSplitSegment,
  onMergeWithNext,
  onWordClick,
  onSyncOffsetChange,
  onAutoAlign,
  onShiftSegment,
  onAddSegment,
  onGenerateSampleCaptions,
  onImportSrtClick
}: TranscriptionSidebarProps) {
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSyncControls, setShowSyncControls] = useState<boolean>(true);

  const effectiveTime = Math.max(0, currentTime + syncOffset);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handleStartEdit = (e: React.MouseEvent, word: CaptionWord) => {
    e.stopPropagation();
    setEditingWordId(word.id);
    setEditingText(word.text);
  };

  const handleSaveEdit = (segmentId: string, wordId: string) => {
    if (onWordEdit && editingText.trim()) {
      onWordEdit(segmentId, wordId, editingText.trim());
    }
    setEditingWordId(null);
  };

  const filteredSegments = segments.filter(seg => {
    if (!searchQuery.trim()) return true;
    const fullText = seg.words.map(w => w.text).join(' ').toLowerCase();
    return fullText.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto relative bg-slate-900/40">
      
      {/* Header with Search & Sync Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-md z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <AlignLeft className="w-4 h-4 text-indigo-400" />
            <span>تعديل ومزامنة التفريغ الصوتي</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-full">
            {segments.reduce((acc, s) => acc + s.words.length, 0)} كلمة
          </span>
        </div>

        {/* Global Speech-to-Word Sync Panel */}
        <div className="bg-gradient-to-r from-indigo-950/70 to-slate-900 border border-indigo-500/30 rounded-2xl p-3 space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>مزامنة النطق وعرض الكلمات (Sync)</span>
            </div>
            
            {onAutoAlign && (
              <button
                onClick={onAutoAlign}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 shadow transition-all active:scale-95"
                title="محاذاة توقيت جميع الكلمات تلقائياً وإزالة فجوات التأخير"
              >
                <Wand2 className="w-3 h-3" />
                <span>مزامنة ذكية تلقائية</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[11px]">فرق التوقيت العام:</span>
              <span className={cn(
                "px-2 py-0.5 rounded font-mono text-[11px] font-bold",
                syncOffset === 0 ? "bg-slate-800 text-slate-300" : syncOffset > 0 ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30" : "bg-amber-950 text-amber-300 border border-amber-500/30"
              )}>
                {syncOffset > 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}
              </span>
            </div>

            {onSyncOffsetChange && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSyncOffsetChange(Number((syncOffset - 0.1).toFixed(2)))}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono transition-colors"
                  title="تقديم ظهور الكلمات 0.1 ثانية"
                >
                  -0.1s
                </button>
                <button
                  onClick={() => onSyncOffsetChange(0)}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-[10px] transition-colors"
                  title="إعادة ضبط المزامنة للصفر"
                >
                  0.0s
                </button>
                <button
                  onClick={() => onSyncOffsetChange(Number((syncOffset + 0.1).toFixed(2)))}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono transition-colors"
                  title="تأخير ظهور الكلمات 0.1 ثانية"
                >
                  +0.1s
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث في الكلمات والنصوص..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="p-4 flex-1 space-y-3 sm:space-y-4">
        {segments.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-800/30 rounded-2xl border border-slate-800 flex flex-col items-center">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5" />
            </div>
            <p className="text-white text-xs font-bold mb-1">لا توجد نصوص بعد</p>
            <p className="text-slate-400 text-[11px] max-w-xs mb-4">
              يمكنك إضافة أسطر كابشن يدوياً، أو توليد كابشن تجريبي جاهز لتجربة القوالب والتحريك، أو استيراد ملف SRT.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {onGenerateSampleCaptions && (
                <button
                  type="button"
                  onClick={onGenerateSampleCaptions}
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>توليد كابشن تجريبي فوري</span>
                </button>
              )}
              {onAddSegment && (
                <button
                  type="button"
                  onClick={onAddSegment}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>إضافة سطر كابشن يدوي (+)</span>
                </button>
              )}
              {onImportSrtClick && (
                <button
                  type="button"
                  onClick={onImportSrtClick}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>استيراد ملف ترجمة (.SRT)</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            لا توجد نتائج تطابق بحثك
          </div>
        ) : (
          <>
            {filteredSegments.map((segment, segIdx) => {
            const isSegmentActive = effectiveTime >= segment.start - 0.1 && effectiveTime <= segment.end + 0.3;
            
            return (
              <div 
                key={segment.id} 
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl transition-all border",
                  isSegmentActive 
                    ? "bg-slate-800/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30" 
                    : "bg-slate-850/40 border-slate-800/80 hover:bg-slate-800/40"
                )}
              >
                {/* Segment Header */}
                <div className="flex items-center justify-between mb-2.5 text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSeek(segment.start)}
                      className="flex items-center gap-1 font-mono text-slate-300 hover:text-indigo-400 transition-colors"
                      title="تشغيل من بداية هذا السطر"
                    >
                      <Play className="w-3 h-3 fill-current text-indigo-400" />
                      <span>{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                    </button>

                    {/* Segment Specific Timing Shift Nudge */}
                    {onShiftSegment && (
                      <div className="flex items-center gap-0.5 mr-1">
                        <button
                          onClick={() => onShiftSegment(segment.id, -0.1)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
                          title="تقديم توقيت هذا المقطع -0.1s"
                        >
                          -0.1s
                        </button>
                        <button
                          onClick={() => onShiftSegment(segment.id, +0.1)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
                          title="تأخير توقيت هذا المقطع +0.1s"
                        >
                          +0.1s
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {isSegmentActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold mr-1 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        <span>يتم نطقه الآن</span>
                      </span>
                    )}
                    {segIdx < segments.length - 1 && onMergeWithNext && (
                      <button
                        type="button"
                        onClick={() => onMergeWithNext(segment.id)}
                        className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-800 hover:bg-indigo-600/40 text-slate-300 hover:text-white transition-colors flex items-center gap-1"
                        title="دمج مع السطر التالي"
                      >
                        <Merge className="w-3 h-3" />
                        <span>دمج</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Words list */}
                <div className="leading-relaxed flex flex-wrap gap-1.5 items-center">
                  {segment.words.map((word, wordIdx) => {
                    const isWordActive = isSegmentActive && effectiveTime >= word.start - 0.05 && (
                      wordIdx === segment.words.length - 1 
                        ? effectiveTime <= word.end + 0.25 
                        : effectiveTime < segment.words[wordIdx + 1].start - 0.05
                    );
                    const isEditing = editingWordId === word.id;
                    
                    if (isEditing) {
                      return (
                        <div key={word.id} className="inline-flex items-center gap-1 bg-indigo-950 border border-indigo-500 rounded-lg px-1.5 py-0.5 z-10 shadow-lg">
                          <input
                            autoFocus
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(segment.id, word.id);
                              if (e.key === 'Escape') setEditingWordId(null);
                            }}
                            className="bg-transparent text-white text-xs sm:text-sm font-medium outline-none w-20 text-center"
                          />
                          <button
                            onClick={() => handleSaveEdit(segment.id, word.id)}
                            className="p-1 hover:bg-indigo-600 text-emerald-400 hover:text-white rounded transition-colors"
                            title="حفظ التعديل"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={word.id}
                        className="group relative inline-flex items-center"
                      >
                        <button
                          type="button"
                          onClick={(e) => onWordClick?.(word, segment.id, e)}
                          className={cn(
                            "text-xs sm:text-sm font-semibold px-2 py-1 rounded-xl transition-all flex items-center gap-1",
                            isWordActive 
                              ? "bg-indigo-600 text-white shadow-md scale-105 ring-1 ring-indigo-400" 
                              : "text-slate-200 hover:bg-slate-700/80 hover:text-white",
                            word.highlightColor && "border border-amber-400/50"
                          )}
                          style={{
                            color: isWordActive ? '#ffffff' : (word.highlightColor || undefined)
                          }}
                        >
                          <span>{word.text}</span>
                          {word.customEmoji && (
                            <span className="text-xs">{word.customEmoji}</span>
                          )}
                        </button>

                        {/* Inline word split/edit button on hover */}
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg p-0.5 flex items-center gap-0.5 z-20 shadow-xl transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(e, word)}
                            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded"
                            title="تعديل نص الكلمة"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {wordIdx < segment.words.length - 1 && onSplitSegment && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSplitSegment(segment.id, wordIdx);
                              }}
                              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-amber-400 rounded"
                              title="تقسيم السطر من هنا"
                            >
                              <Scissors className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {onAddSegment && (
            <button
              type="button"
              onClick={onAddSegment}
              className="w-full py-2.5 px-3 border border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-800/30 hover:bg-slate-800/60 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>إضافة سطر كابشن جديد (+)</span>
            </button>
          )}
        </>
        )}
      </div>
    </div>
  );
}

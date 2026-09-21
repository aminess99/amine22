import React, { useRef, useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, ZoomIn, ZoomOut, Sparkles, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import { CaptionSegment, CaptionWord } from '../types';
import { cn } from '../lib/utils';

interface TimelineProps {
  duration: number;
  currentTime: number;
  segments: CaptionSegment[];
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onWordClick?: (word: CaptionWord, segmentId: string, e: React.MouseEvent) => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
}

export function Timeline({
  duration,
  currentTime,
  segments,
  isPlaying,
  onSeek,
  onTogglePlay,
  onWordClick,
  playbackRate = 1,
  onPlaybackRateChange
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const calculateTimeFromX = (clientX: number) => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = x / rect.width;
    return percent * duration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingScrubber(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const time = calculateTimeFromX(e.clientX);
    onSeek(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrubber) {
      const time = calculateTimeFromX(e.clientX);
      onSeek(time);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrubber) {
      setIsDraggingScrubber(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full bg-slate-900/95 border-t border-slate-800/80 flex flex-col select-none shrink-0 z-10">
      
      {/* Sleek Compact Main Bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2">
        
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center shrink-0"
          title={isPlaying ? "إيقاف مؤقت (مسافة)" : "تشغيل (مسافة)"}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        {/* Timecode */}
        <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-300 shrink-0">
          <span className="text-indigo-400">{formatTime(currentTime)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTime(duration)}</span>
        </div>

        {/* Sleek Interactive Track with Word Markers */}
        <div 
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex-1 h-6 relative flex items-center cursor-pointer group touch-none"
        >
          {/* Background Track */}
          <div className="w-full h-2 bg-slate-800 rounded-full relative overflow-hidden group-hover:h-2.5 transition-all">
            {/* Played Fill */}
            <div 
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            
            {/* Active Word Segments on Track */}
            {duration > 0 && segments.map((seg) => {
              const segLeft = (seg.start / duration) * 100;
              const segWidth = ((seg.end - seg.start) / duration) * 100;
              return (
                <div
                  key={seg.id}
                  className="absolute top-0 bottom-0 bg-indigo-300/30 border-l border-r border-indigo-400/40 pointer-events-none"
                  style={{ left: `${segLeft}%`, width: `${Math.max(0.5, segWidth)}%` }}
                />
              );
            })}
          </div>

          {/* Scrubber Playhead Handle */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 shadow-md group-hover:scale-115 transition-transform pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Jump buttons */}
        <div className="hidden sm:flex items-center gap-1 shrink-0 text-slate-400">
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 3))}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="إرجاع 3 ثوانٍ"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSeek(Math.min(duration, currentTime + 3))}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="تقديم 3 ثوانٍ"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Expand Waveform Toggle */}
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          className={cn(
            "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shrink-0",
            isExpanded ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40" : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
          )}
          title={isExpanded ? "إخفاء المسار الصوتي الكامل" : "إظهار المسار الصوتي والكلمات"}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">{isExpanded ? "المسار" : "المسار الصوتي"}</span>
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>

      {/* Optional Expanded Waveform Track (When User Wants Advanced Precision) */}
      {isExpanded && (
        <div className="px-3 sm:px-5 pb-3 pt-1 border-t border-slate-800/60 flex flex-col gap-2 bg-slate-950/60 animate-in fade-in slide-in-from-top-2 duration-150">
          
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span>المسار التفصيلي للكلمات (Audio & Words Track)</span>
            </div>

            {onPlaybackRateChange && (
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg">
                {[1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => onPlaybackRateChange(rate)}
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] font-mono rounded font-semibold transition-all",
                      playbackRate === rate ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Word Chips Lane */}
          <div className="h-10 bg-slate-900/90 rounded-xl border border-slate-800/80 p-1 flex items-center gap-1 overflow-x-auto relative scrollbar-none">
            {segments.flatMap(seg => seg.words.map(w => {
              const isWordActive = currentTime >= w.start - 0.05 && currentTime <= w.end + 0.1;
              return (
                <button
                  key={w.id}
                  onClick={(e) => {
                    onSeek(w.start);
                    onWordClick?.(w, seg.id, e);
                  }}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 shrink-0 border",
                    isWordActive 
                      ? "bg-indigo-600 text-white border-indigo-400 shadow-md scale-105" 
                      : "bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white"
                  )}
                  style={{
                    color: isWordActive ? '#ffffff' : (w.highlightColor || undefined)
                  }}
                >
                  <span>{w.text}</span>
                  {w.customEmoji && <span className="text-xs">{w.customEmoji}</span>}
                </button>
              );
            }))}
          </div>

        </div>
      )}

    </div>
  );
}

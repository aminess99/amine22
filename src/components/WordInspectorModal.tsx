import React, { useState } from 'react';
import { X, Sparkles, Palette, Clock, Check, Trash2, Smile, Play, FastForward, Rewind } from 'lucide-react';
import { CaptionWord } from '../types';
import { cn } from '../lib/utils';

interface WordInspectorModalProps {
  word: CaptionWord | null;
  segmentId: string | null;
  onClose: () => void;
  onUpdateWord: (segmentId: string, wordId: string, updates: Partial<CaptionWord>) => void;
  onPlayRange?: (start: number, end: number) => void;
}

const PRESET_HIGHLIGHT_COLORS = [
  { name: 'Default', value: undefined, hex: 'bg-white' },
  { name: 'Yellow', value: '#FFDE59', hex: 'bg-[#FFDE59]' },
  { name: 'Neon Green', value: '#00FF66', hex: 'bg-[#00FF66]' },
  { name: 'Cyan Blue', value: '#00F0FF', hex: 'bg-[#00F0FF]' },
  { name: 'Vibrant Red', value: '#FF4D4D', hex: 'bg-[#FF4D4D]' },
  { name: 'Purple Pop', value: '#D946EF', hex: 'bg-[#D946EF]' },
  { name: 'Sunset Orange', value: '#FF9900', hex: 'bg-[#FF9900]' },
];

const POPULAR_VIRAL_EMOJIS = ['🔥', '🚀', '💡', '💰', '🤯', '⚡', '👑', '🎯', '😱', '👀', '💯', '✨', '🏆', '💎', '🤫', '📈'];

export function WordInspectorModal({
  word,
  segmentId,
  onClose,
  onUpdateWord,
  onPlayRange
}: WordInspectorModalProps) {
  if (!word || !segmentId) return null;

  const [text, setText] = useState(word.text);
  const [start, setStart] = useState(word.start);
  const [end, setEnd] = useState(word.end);

  const handleSaveText = () => {
    if (text.trim()) {
      onUpdateWord(segmentId, word.id, { text: text.trim(), start, end });
      onClose();
    }
  };

  const handleColorSelect = (colorValue: string | undefined) => {
    onUpdateWord(segmentId, word.id, { highlightColor: colorValue });
  };

  const handleEmojiSelect = (emoji: string) => {
    if (word.customEmoji === emoji) {
      onUpdateWord(segmentId, word.id, { customEmoji: undefined });
    } else {
      onUpdateWord(segmentId, word.id, { customEmoji: emoji });
    }
  };

  const nudgeStart = (delta: number) => {
    const newStart = Math.max(0, Number((start + delta).toFixed(3)));
    setStart(newStart);
    onUpdateWord(segmentId, word.id, { start: newStart });
  };

  const nudgeEnd = (delta: number) => {
    const newEnd = Math.max(start + 0.1, Number((end + delta).toFixed(3)));
    setEnd(newEnd);
    onUpdateWord(segmentId, word.id, { end: newEnd });
  };

  const handlePlayWord = () => {
    if (onPlayRange) {
      onPlayRange(Math.max(0, start - 0.05), end + 0.1);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">تخصيص ومزامنة الكلمة</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Word Text Edit */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">نص الكلمة</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveText()}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500 transition-colors"
                autoFocus
              />
              <button
                onClick={handleSaveText}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>
          </div>

          {/* Quick Word Audio Test */}
          {onPlayRange && (
            <button
              onClick={handlePlayWord}
              className="w-full py-2 px-3 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400" />
              <span>الاستماع لنطق الكلمة الآن ({start.toFixed(2)}s - {end.toFixed(2)}s)</span>
            </button>
          )}

          {/* Word Highlight Color */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>لون التمييز (Highlight Color)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_HIGHLIGHT_COLORS.map((c) => {
                const isSelected = word.highlightColor === c.value || (!word.highlightColor && !c.value);
                return (
                  <button
                    key={c.name}
                    onClick={() => handleColorSelect(c.value)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-transform flex items-center justify-center border-2",
                      c.hex,
                      isSelected ? "scale-115 border-indigo-400 ring-2 ring-indigo-400/40" : "border-slate-700 hover:scale-105"
                    )}
                    title={c.name}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Viral Emojis Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <div className="flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                <span>إيموجي مخصص فوق الكلمة</span>
              </div>
              {word.customEmoji && (
                <button
                  onClick={() => onUpdateWord(segmentId, word.id, { customEmoji: undefined })}
                  className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>إزالة</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-8 gap-1.5 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
              {POPULAR_VIRAL_EMOJIS.map((emoji) => {
                const isSelected = word.customEmoji === emoji;
                return (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiSelect(emoji)}
                    className={cn(
                      "h-8 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-115 active:scale-95",
                      isSelected ? "bg-indigo-600/30 border border-indigo-500 shadow-sm" : "hover:bg-slate-800"
                    )}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Precise Time Fine-Tuning & Nudge */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>دقة توقيت النطق (ثوانٍ)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>البداية (Start)</span>
                  <span className="font-mono text-indigo-300">{start.toFixed(2)}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => nudgeStart(-0.1)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                    title="تقديم 0.1 ثانية"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() => nudgeStart(-0.05)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                  >
                    -0.05s
                  </button>
                  <button
                    onClick={() => nudgeStart(+0.05)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                  >
                    +0.05s
                  </button>
                  <button
                    onClick={() => nudgeStart(+0.1)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                    title="تأخير 0.1 ثانية"
                  >
                    +0.1s
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>النهاية (End)</span>
                  <span className="font-mono text-indigo-300">{end.toFixed(2)}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => nudgeEnd(-0.1)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                    title="تقديم 0.1 ثانية"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() => nudgeEnd(-0.05)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                  >
                    -0.05s
                  </button>
                  <button
                    onClick={() => nudgeEnd(+0.05)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                  >
                    +0.05s
                  </button>
                  <button
                    onClick={() => nudgeEnd(+0.1)}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                    title="تأخير 0.1 ثانية"
                  >
                    +0.1s
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

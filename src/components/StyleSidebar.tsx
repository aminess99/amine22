import React from 'react';
import { Sliders, Type, Palette, Smartphone, Square, Tv, Smile, AlignVerticalSpaceAround } from 'lucide-react';
import { cn } from '../lib/utils';
import { AspectRatioType, EditorSettings, WordsPerChunk } from '../types';

interface StyleSidebarProps {
  settings: EditorSettings;
  onSettingsChange: (settings: EditorSettings) => void;
}

const ASPECT_RATIOS: { id: AspectRatioType; label: string; sub: string; icon: any }[] = [
  { id: '9:16', label: '9:16', sub: 'TikTok / Reels / Shorts', icon: Smartphone },
  { id: '1:1', label: '1:1', sub: 'Instagram Post', icon: Square },
  { id: '4:5', label: '4:5', sub: 'Portrait Post', icon: Smartphone },
  { id: '16:9', label: '16:9', sub: 'YouTube Wide', icon: Tv },
];

export function StyleSidebar({ settings, onSettingsChange }: StyleSidebarProps) {
  return (
    <div className="flex flex-col h-full w-full overflow-y-auto bg-slate-900/40 p-3.5 sm:p-5 space-y-4 sm:space-y-5">
      
      {/* Aspect Ratio Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span>أبعاد الفيديو (Aspect Ratio)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ASPECT_RATIOS.map((ratio) => {
            const Icon = ratio.icon;
            const isSelected = (settings.aspectRatio || '9:16') === ratio.id;
            return (
              <button
                key={ratio.id}
                onClick={() => onSettingsChange({ ...settings, aspectRatio: ratio.id })}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-xl border text-left transition-all",
                  isSelected 
                    ? "bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/50" 
                    : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-indigo-400" : "text-slate-500")} />
                <div className="overflow-hidden">
                  <div className="text-xs font-bold leading-tight">{ratio.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{ratio.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Family */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-indigo-400" />
            <span>نوع الخط (Arabic & Viral Fonts)</span>
          </label>
          <span className="text-[10px] text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
            {settings.fontFamily || 'Cairo'}
          </span>
        </div>

        {/* Quick 1-Click Viral Fonts Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'Cairo', label: 'Cairo', ar: 'القاهرة' },
            { id: 'Tajawal', label: 'Tajawal', ar: 'تجوال' },
            { id: 'Rubik', label: 'Rubik', ar: 'روبيك' },
            { id: 'Almarai', label: 'Almarai', ar: 'المراعي' },
            { id: 'Anton', label: 'Anton', ar: 'أنطون' },
            { id: 'Playfair Display', label: 'Playfair', ar: 'سيريف' },
          ].map((f) => {
            const isSelected = (settings.fontFamily || 'Cairo') === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSettingsChange({ ...settings, fontFamily: f.id })}
                className={cn(
                  "p-1.5 rounded-lg border text-center transition-all flex flex-col items-center justify-center",
                  isSelected
                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm ring-1 ring-indigo-400"
                    : "bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white"
                )}
                style={{ fontFamily: `"${f.id}", sans-serif` }}
              >
                <span className="text-xs font-bold leading-tight">{f.label}</span>
                <span className="text-[10px] opacity-75">{f.ar}</span>
              </button>
            );
          })}
        </div>

        <select 
          value={settings.fontFamily || 'Cairo'}
          onChange={(e) => onSettingsChange({ ...settings, fontFamily: e.target.value })}
          className="w-full bg-slate-800 text-white text-xs rounded-xl border border-slate-700 px-3 py-2 cursor-pointer outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="Cairo">Cairo (خط القاهرة - الأكثر استخداماً بالريلز)</option>
          <option value="Tajawal">Tajawal (تجوال - أنيق وسهل القراءة)</option>
          <option value="Almarai">Almarai (المراعي - خط عربي عصري ناعم)</option>
          <option value="Rubik">Rubik (روبيك - عريض وقوي للتيك توك)</option>
          <option value="Playfair Display">Playfair Display (سيريف فاخر - Iman Gadzhi)</option>
          <option value="Anton">Anton (Bold Viral 3D Impact - MrBeast)</option>
          <option value="Montserrat">Montserrat (Modern Geometry)</option>
          <option value="Cinzel">Cinzel (Luxury Cinematic)</option>
          <option value="Inter">Inter (Clean Modern Sans)</option>
          <option value="Space Mono">Space Mono (Cyber Tech)</option>
        </select>
      </div>

      {/* Words Pacing */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <label className="font-semibold text-slate-300">معدل الكلمات في الشاشة</label>
          <span className="text-indigo-400 font-bold text-[11px]">
            {settings.wordsPerChunk === 1 ? '1 كلمة (Word Pop)' :
             settings.wordsPerChunk === 2 ? 'كلمتان (Reels Viral)' :
             settings.wordsPerChunk === 3 ? '3 كلمات (موصى به)' :
             settings.wordsPerChunk === 5 ? '5 كلمات (Classic)' : 'جمل كاملة'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {([1, 2, 3, 5, 8] as WordsPerChunk[]).map((count) => (
            <button
              key={count}
              onClick={() => onSettingsChange({ ...settings, wordsPerChunk: count })}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-all border",
                settings.wordsPerChunk === count
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                  : "bg-slate-800/60 text-slate-400 border-slate-750 hover:bg-slate-800 hover:text-white"
              )}
            >
              {count === 1 ? '1' : count === 2 ? '2' : count === 3 ? '3' : count === 5 ? '5' : '8+'}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size Slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <label className="font-semibold text-slate-300">حجم الخط الأساسي</label>
          <span className="text-white font-mono bg-slate-800 px-2 py-0.5 rounded text-[11px]">{settings.fontSize}px</span>
        </div>
        <input 
          type="range" 
          min="24" 
          max="80" 
          value={settings.fontSize}
          onChange={(e) => onSettingsChange({ ...settings, fontSize: Number(e.target.value) })}
          className="w-full accent-indigo-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
        />
      </div>

      {/* Subtitle Vertical Position */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <AlignVerticalSpaceAround className="w-3.5 h-3.5 text-indigo-400" />
          <span>موضع النص الرأسي (Position)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['top', 'middle', 'bottom'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => onSettingsChange({ ...settings, yPosition: pos, yOffsetPercent: pos === 'top' ? 18 : pos === 'middle' ? 50 : 80 })}
              className={cn(
                "py-1.5 text-xs font-semibold rounded-xl border transition-all",
                settings.yPosition === pos
                  ? "bg-indigo-600 text-white border-indigo-500"
                  : "bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white"
              )}
            >
              {pos === 'top' ? 'أعلى الشاشة' : pos === 'middle' ? 'المنتصف' : 'أسفل الشاشة'}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">لون النص الأساسي</label>
          <div className="flex items-center gap-2 bg-slate-800/70 p-1.5 rounded-xl border border-slate-700">
            <input 
              type="color" 
              value={settings.primaryColor}
              onChange={(e) => onSettingsChange({ ...settings, primaryColor: e.target.value })}
              className="w-7 h-7 rounded-lg bg-transparent cursor-pointer border-0"
            />
            <span className="text-xs text-white font-mono">{settings.primaryColor}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">لون الحدود (Stroke)</label>
          <div className="flex items-center gap-2 bg-slate-800/70 p-1.5 rounded-xl border border-slate-700">
            <input 
              type="color" 
              value={settings.outlineColor}
              onChange={(e) => onSettingsChange({ ...settings, outlineColor: e.target.value })}
              className="w-7 h-7 rounded-lg bg-transparent cursor-pointer border-0"
            />
            <span className="text-xs text-white font-mono">{settings.outlineColor}</span>
          </div>
        </div>
      </div>

      {/* AI Emojis Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/70">
        <div className="flex items-center gap-2">
          <Smile className="w-4 h-4 text-amber-400" />
          <div>
            <div className="text-xs font-bold text-white">إيموجي الذكاء الاصطناعي (Auto Emojis)</div>
            <div className="text-[10px] text-slate-400">ظهور تلقائي للإيموجي المعبر فوق الكلمات المهمة</div>
          </div>
        </div>
        <button
          onClick={() => onSettingsChange({ ...settings, showEmojis: !settings.showEmojis })}
          className={cn(
            "w-10 h-6 rounded-full transition-colors relative p-0.5",
            settings.showEmojis !== false ? "bg-indigo-600" : "bg-slate-700"
          )}
        >
          <div className={cn(
            "w-5 h-5 rounded-full bg-white transition-transform",
            settings.showEmojis !== false ? "translate-x-4" : "translate-x-0"
          )} />
        </button>
      </div>

    </div>
  );
}

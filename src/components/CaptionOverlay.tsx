import { AnimatePresence, motion } from 'motion/react';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { CaptionSegment, CaptionWord, EditorSettings } from '../types';
import { getWordEmoji } from '../lib/emojiMatcher';

interface CaptionOverlayProps {
  segments: CaptionSegment[];
  currentTime: number;
  settings: EditorSettings;
  onPositionChange?: (percent: number) => void;
  onWordClick?: (word: CaptionWord, segmentId: string, e: React.MouseEvent) => void;
  videoWidth?: number;
  videoHeight?: number;
}

/**
 * Calculates the active word index within a segment smoothly,
 * ensuring continuous word transitions without gaps or premature highlighting.
 */
export function getActiveWordIndex(words: CaptionWord[], effectiveTime: number, segmentStart: number): number {
  if (!words || words.length === 0) return -1;
  if (effectiveTime < segmentStart) return -1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wStart = w.start;
    const nextStart = i < words.length - 1 ? words[i + 1].start : w.end;

    if (effectiveTime >= wStart && effectiveTime < nextStart) {
      return i;
    }
  }

  if (effectiveTime >= words[words.length - 1].start && effectiveTime < words[words.length - 1].end) {
    return words.length - 1;
  }

  return -1;
}

export function CaptionOverlay({ 
  segments, 
  currentTime, 
  settings, 
  onPositionChange,
  onWordClick
}: CaptionOverlayProps) {
  const syncOffset = settings.syncOffset || 0;
  const effectiveTime = Math.max(0, currentTime + syncOffset);

  // Find current active segment
  const activeSegment = useMemo(() => {
    if (!segments || segments.length === 0) return null;
    return segments.find(s => effectiveTime >= s.start - 0.15 && effectiveTime <= s.end + 0.35);
  }, [segments, effectiveTime]);

  const safeAreaRef = useRef<HTMLDivElement>(null);
  const fitContentRef = useRef<HTMLDivElement>(null);
  const [captionScale, setCaptionScale] = useState(1);

  // Keep the complete caption group on one visual line when the preview is
  // small. Scale the group as a whole instead of letting individual words
  // wrap into an unintended stacked layout.
  useLayoutEffect(() => {
    if (!activeSegment) {
      setCaptionScale(1);
      return;
    }

    const safeArea = safeAreaRef.current;
    const fitContent = fitContentRef.current;
    if (!safeArea || !fitContent) return;

    const measure = () => {
      const safeWidth = safeArea.getBoundingClientRect().width;
      const styles = window.getComputedStyle(safeArea);
      const horizontalPadding =
        parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const availableWidth = Math.max(1, safeWidth - horizontalPadding);
      const naturalWidth = Math.max(1, fitContent.scrollWidth);
      const nextScale = Math.min(1, availableWidth / naturalWidth);

      setCaptionScale(prev => Math.abs(prev - nextScale) < 0.002 ? prev : nextScale);
    };

    measure();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null;
    resizeObserver?.observe(safeArea);
    resizeObserver?.observe(fitContent);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeSegment?.id, settings.template, settings.fontFamily, settings.fontSize, segments.length]);

  if (!activeSegment) return null;

  // Calculate vertical position (percent from top)
  const defaultPercent = settings.yPosition === 'top' ? 18 : settings.yPosition === 'middle' ? 50 : 80;
  const currentPercent = typeof settings.yOffsetPercent === 'number' ? settings.yOffsetPercent : defaultPercent;

  return (
    <div 
      dir="auto" 
      className="absolute inset-0 pointer-events-none overflow-hidden z-20 flex flex-col items-center justify-start @container"
      style={{ fontFamily: `"${settings.fontFamily || 'Cairo'}", sans-serif` }}
    >
      <div 
        ref={safeAreaRef}
        className="w-full flex justify-center absolute left-0 right-0 px-3 sm:px-8 transition-transform duration-75"
        style={{
          top: `${currentPercent}%`,
          transform: 'translateY(-50%)'
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            ref={fitContentRef}
            key={activeSegment.id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="caption-fit-content w-full flex justify-center cursor-grab active:cursor-grabbing pointer-events-auto select-none"
            style={{
              width: 'max-content',
              maxWidth: 'none',
              flex: '0 0 auto',
              transform: `scale(${captionScale})`,
              transformOrigin: 'center center',
            }}
            drag={Boolean(onPositionChange) ? "y" : false}
            dragConstraints={{ top: -220, bottom: 220 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (onPositionChange) {
                const deltaPercent = (info.offset.y / 600) * 100;
                const newPercent = Math.min(92, Math.max(10, Math.round(currentPercent + deltaPercent)));
                onPositionChange(newPercent);
              }
            }}
          >
            <TemplateRenderer 
              segment={activeSegment} 
              effectiveTime={effectiveTime} 
              settings={settings} 
              onWordClick={onWordClick}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TemplateRenderer({
  segment,
  effectiveTime,
  settings,
  onWordClick
}: {
  segment: CaptionSegment;
  effectiveTime: number;
  settings: EditorSettings;
  onWordClick?: (word: CaptionWord, segmentId: string, e: React.MouseEvent) => void;
}) {
  const { template, primaryColor = '#FFDE59', outlineColor = '#000000', fontFamily, showEmojis = true, fontSize = 48 } = settings;
  const activeWordIdx = getActiveWordIndex(segment.words, effectiveTime, segment.start);
  const activeFont = `"${fontFamily || 'Cairo'}", sans-serif`;

  // Responsive font size using container query + viewport fallback
  const fontRatio = fontSize / 48;
  const responsiveBase = `clamp(${Math.round(16 * fontRatio)}px, ${Number((7.0 * fontRatio).toFixed(2))}cqw, ${fontSize}px)`;
  const responsiveSmall = `clamp(${Math.round(14 * fontRatio)}px, ${Number((6.0 * fontRatio).toFixed(2))}cqw, ${Math.round(fontSize * 0.9)}px)`;
  const responsiveBig = `clamp(${Math.round(22 * fontRatio)}px, ${Number((10.0 * fontRatio).toFixed(2))}cqw, ${Math.round(fontSize * 1.45)}px)`;

  // 1. ALEX HORMOZI 2.0 (Kinetic multi-color + bounce + tilt)
  if (template === 'hormozi') {
    const viralPalette = ['#FFDE59', '#54B435', '#00F0FF', '#FF5757', '#FFDE59'];

    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2 sm:gap-x-3 gap-y-1.5 w-full max-w-[95%] sm:max-w-[88%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const wordColor = word.highlightColor || viralPalette[i % viralPalette.length];
          const emoji = word.customEmoji || (showEmojis ? getWordEmoji(word.text) : null);

          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              initial={false}
              animate={{
                scale: isActive ? 1.2 : 1,
                rotate: isActive ? (i % 2 === 0 ? -3 : 3) : 0,
                y: isActive ? -4 : 0
              }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="inline-flex items-center gap-1 uppercase font-black tracking-tight cursor-pointer hover:opacity-95 active:scale-95"
              style={{
                color: isActive ? wordColor : (word.highlightColor || '#FFFFFF'),
                fontSize: responsiveBase,
                WebkitTextStroke: `${Math.max(2, Math.round(fontSize * 0.08))}px ${outlineColor}`,
                paintOrder: 'stroke fill',
                textShadow: '0 4px 12px rgba(0,0,0,0.85)',
                fontFamily: activeFont,
                fontWeight: 900,
              }}
            >
              <span>{word.text}</span>
              {emoji && isActive && (
                <span className="text-xl sm:text-3xl not-italic ml-0.5 filter drop-shadow-md animate-bounce">{emoji}</span>
              )}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 2. MR BEAST (Layered 3D Pop & Heavy Extrusion)
  if (template === 'beast') {
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2 sm:gap-x-3 gap-y-1.5 w-full max-w-[95%] sm:max-w-[90%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const emoji = word.customEmoji || (showEmojis ? getWordEmoji(word.text) : null);
          const activeColor = word.highlightColor || '#00F0FF';
          
          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              initial={false}
              animate={{ 
                scale: isActive ? 1.25 : 1, 
                y: isActive ? -5 : 0
              }}
              transition={{ type: "spring", stiffness: 550, damping: 18 }}
              className={cn(
                "inline-flex items-center gap-1 uppercase font-black tracking-tighter cursor-pointer select-none",
                isActive ? "z-10" : ""
              )}
              style={{
                color: isActive ? activeColor : (word.highlightColor || '#FFFFFF'),
                fontSize: responsiveBase,
                WebkitTextStroke: `${Math.max(3, Math.round(fontSize * 0.11))}px #000000`,
                paintOrder: 'stroke fill',
                textShadow: '3px 4px 0px #000000, 4px 6px 0px rgba(0,0,0,0.7)',
                fontFamily: activeFont,
                fontWeight: 900,
              }}
            >
              <span>{word.text}</span>
              {emoji && isActive && (
                <span className="text-xl sm:text-3xl not-italic animate-bounce">{emoji}</span>
              )}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 3. ALI ABDAAL (Modern Clean Yellow Highlighter Badge)
  if (template === 'ali_abdaal') {
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 w-full max-w-[95%] sm:max-w-[85%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const highlightColor = word.highlightColor || '#FEE047';

          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              animate={{
                scale: isActive ? 1.08 : 1,
              }}
              transition={{ duration: 0.1 }}
              className={cn(
                "inline-block font-extrabold px-2 py-0.5 rounded-lg transition-all cursor-pointer",
                isActive ? "text-slate-950 shadow-xl" : "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
              )}
              style={{
                backgroundColor: isActive ? highlightColor : (word.highlightColor ? word.highlightColor + '33' : 'transparent'),
                fontSize: responsiveSmall,
                fontFamily: activeFont,
                fontWeight: 800,
              }}
            >
              {word.text}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 4. IMAN GADZHI (Luxury Editorial Serif & Gold Glow)
  if (template === 'gadzhi') {
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1.5 w-full max-w-[90%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const activeColor = word.highlightColor || '#F6E05E';

          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              animate={{
                scale: isActive ? 1.12 : 1,
              }}
              className="inline-block italic font-bold tracking-wide cursor-pointer transition-colors"
              style={{
                color: isActive ? activeColor : (word.highlightColor || '#F8FAFC'),
                textShadow: isActive 
                  ? `0 0 20px ${activeColor}, 0 0 10px ${activeColor}, 0 2px 6px rgba(0,0,0,0.9)` 
                  : '0 2px 8px rgba(0,0,0,0.95)',
                fontSize: responsiveSmall,
                fontFamily: activeFont,
                fontWeight: 700,
              }}
            >
              {word.text}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 5. DEVIN JATHO (Glassmorphic Tech Cyber Card)
  if (template === 'jatho') {
    const activeWord = activeWordIdx !== -1 ? segment.words[activeWordIdx] : null;
    const activeEmoji = activeWord ? (activeWord.customEmoji || (showEmojis ? getWordEmoji(activeWord.text) : null)) : null;

    return (
      <div className="flex flex-col items-center gap-2">
        {activeEmoji && (
          <span className="text-2xl sm:text-4xl animate-bounce drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]">{activeEmoji}</span>
        )}
        <div 
          className="bg-slate-950/90 border border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)] px-4 sm:px-7 py-2 sm:py-2.5 rounded-2xl flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 backdrop-blur-xl"
        >
          {segment.words.map((word, i) => {
            const isActive = i === activeWordIdx;
            const activeCol = word.highlightColor || '#00F0FF';
            return (
              <span
                key={word.id}
                onClick={(e) => onWordClick?.(word, segment.id, e)}
                className={cn(
                  "font-black tracking-wide uppercase transition-all cursor-pointer",
                  isActive 
                    ? "drop-shadow-[0_0_14px_rgba(6,182,212,1)] scale-110" 
                    : ""
                )}
                style={{
                  color: isActive ? activeCol : (word.highlightColor || 'rgba(255, 255, 255, 0.9)'),
                  fontSize: responsiveSmall,
                  fontFamily: activeFont,
                  fontWeight: 900,
                }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // 6. COMIC BUBBLE POP (Playful Yellow Badge & Thick Outline)
  if (template === 'comic') {
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 w-full max-w-[92%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const comicColor = word.highlightColor || (isActive ? '#FDE047' : '#FFFFFF');
          const emoji = word.customEmoji || (showEmojis ? getWordEmoji(word.text) : null);

          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              animate={{
                scale: isActive ? 1.22 : 1,
                rotate: isActive ? (i % 2 === 0 ? 3 : -3) : 0,
              }}
              transition={{ type: "spring", stiffness: 600, damping: 16 }}
              className="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-xl cursor-pointer"
              style={{
                backgroundColor: isActive ? '#000000' : 'transparent',
                color: comicColor,
                fontSize: responsiveBase,
                WebkitTextStroke: isActive ? 'none' : '2px #000000',
                paintOrder: 'stroke fill',
                boxShadow: isActive ? '3px 3px 0px #000000' : 'none',
                fontFamily: activeFont,
                fontWeight: 900,
              }}
            >
              <span>{word.text}</span>
              {emoji && isActive && <span className="text-xl sm:text-2xl ml-0.5">{emoji}</span>}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 7. ONE WORD POP (Giant Central TikTok Impact)
  if (template === 'pop') {
    const activeWord = activeWordIdx !== -1 ? segment.words[activeWordIdx] : segment.words[0];
    if (!activeWord) return null;

    const emoji = activeWord.customEmoji || (showEmojis ? getWordEmoji(activeWord.text) : null);
    const activeColor = activeWord.highlightColor || '#FB7185';

    return (
      <div 
        onClick={(e) => onWordClick?.(activeWord, segment.id, e)}
        className="flex flex-col items-center justify-center cursor-pointer select-none"
      >
        {emoji && (
          <motion.span
            initial={{ scale: 0.5, y: 10 }}
            animate={{ scale: 1.25, y: 0 }}
            className="text-4xl sm:text-6xl mb-2 filter drop-shadow-xl"
          >
            {emoji}
          </motion.span>
        )}
        <motion.div
          key={activeWord.id}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.15, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 18 }}
          className="font-black uppercase tracking-wider text-center"
          style={{
            fontSize: responsiveBig,
            color: activeColor,
            WebkitTextStroke: `${Math.max(3, Math.round(fontSize * 0.12))}px ${outlineColor}`,
            paintOrder: 'stroke fill',
            textShadow: '0 8px 24px rgba(0,0,0,0.9)',
            fontFamily: activeFont,
            fontWeight: 900,
          }}
        >
          {activeWord.text}
        </motion.div>
      </div>
    );
  }

  // 8. CLEAN MINIMAL PODCAST PILL
  if (template === 'minimal') {
    return (
      <div className="bg-black/75 backdrop-blur-md px-4 sm:px-6 py-1.5 sm:py-2 rounded-full flex flex-wrap justify-center items-center gap-x-2 border border-white/15 shadow-2xl">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const activeColor = word.highlightColor || '#818CF8';
          return (
            <span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              className={cn(
                "font-bold transition-all cursor-pointer",
                isActive ? "font-extrabold scale-105" : ""
              )}
              style={{
                color: isActive ? activeColor : (word.highlightColor || 'rgba(255, 255, 255, 0.85)'),
                fontSize: responsiveSmall,
                fontFamily: activeFont,
                fontWeight: 800,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  // 9. KARAOKE WAVE
  if (template === 'karaoke') {
    return (
      <div className="bg-black/80 backdrop-blur-lg px-4 sm:px-6 py-2 sm:py-2.5 rounded-2xl flex flex-wrap justify-center items-center gap-x-2 border border-white/10 shadow-2xl">
        {segment.words.map((word, i) => {
          const isPassed = activeWordIdx !== -1 && i < activeWordIdx;
          const isActive = i === activeWordIdx;
          const activeColor = word.highlightColor || '#34D399';

          return (
            <span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              className={cn(
                "font-black transition-all cursor-pointer",
                isActive ? "scale-110 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" : ""
              )}
              style={{
                color: isActive 
                  ? activeColor 
                  : (word.highlightColor || (isPassed ? '#FFFFFF' : 'rgba(148, 163, 184, 0.6)')),
                fontSize: responsiveBase,
                fontFamily: activeFont,
                fontWeight: 900,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  // 10. NEON LASER GLOW
  if (template === 'neon') {
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1.5 w-full max-w-[90%] text-center">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const glowColor = word.highlightColor || '#E879F9';

          return (
            <motion.span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              animate={{ scale: isActive ? 1.15 : 1 }}
              className="font-black transition-all cursor-pointer tracking-wide"
              style={{
                color: word.highlightColor || '#FFFFFF',
                fontSize: responsiveBase,
                fontFamily: activeFont,
                fontWeight: 900,
                textShadow: isActive 
                  ? `0 0 24px ${glowColor}, 0 0 12px ${glowColor}, 0 0 4px #FFFFFF`
                  : `0 0 6px ${glowColor}`,
              }}
            >
              {word.text}
            </motion.span>
          );
        })}
      </div>
    );
  }

  // 11. CINEMATIC DOCUMENTARY
  if (template === 'cinematic') {
    return (
      <div className="bg-black/60 backdrop-blur-sm px-4 py-1.5 rounded-lg flex flex-wrap justify-center items-center gap-x-2 text-center max-w-[90%]">
        {segment.words.map((word, i) => {
          const isActive = i === activeWordIdx;
          const activeColor = word.highlightColor || '#FFFFFF';
          return (
            <span
              key={word.id}
              onClick={(e) => onWordClick?.(word, segment.id, e)}
              className={cn(
                "font-semibold tracking-wide cursor-pointer transition-colors",
                isActive ? "font-bold drop-shadow-md text-white" : "text-slate-300"
              )}
              style={{
                color: isActive ? activeColor : (word.highlightColor || 'rgba(203, 213, 225, 0.75)'),
                fontSize: responsiveSmall,
                fontFamily: activeFont,
                fontWeight: 700,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  // 12. CLASSIC SUBTITLES
  return (
    <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 w-full max-w-[90%] text-center">
      {segment.words.map((word, i) => {
        const isActive = i === activeWordIdx;
        const activeColor = word.highlightColor || primaryColor || '#FFDE59';
        return (
          <span
            key={word.id}
            onClick={(e) => onWordClick?.(word, segment.id, e)}
            className="font-bold cursor-pointer transition-colors"
            style={{
              fontSize: responsiveBase,
              color: isActive ? activeColor : (word.highlightColor || '#FFFFFF'),
              WebkitTextStroke: `${Math.max(2, Math.round(fontSize * 0.08))}px ${outlineColor}`,
              paintOrder: 'stroke fill',
              textShadow: '0 2px 8px rgba(0,0,0,0.9)',
              fontFamily: activeFont,
              fontWeight: 800,
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}

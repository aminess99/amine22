import { CaptionSegment, EditorSettings } from '../types';
import { getWordEmoji } from './emojiMatcher';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// Convert hex #RRGGBB to standard ASS BGR hex (BBGGRR) for \c, \1c, \3c, \4c override tags
function hexToAssBgr(hex: string): string {
  if (!hex) return 'FFFFFF';
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length < 6) return 'FFFFFF';
  const r = hex.substring(0, 2);
  const g = hex.substring(2, 4);
  const b = hex.substring(4, 6);
  return `${b}${g}${r}`;
}

// Convert hex #RRGGBB to standard ASS color &HAABBGGRR& for style declarations
function hexToAssColor(hex: string, alpha: string = '00'): string {
  const bgr = hexToAssBgr(hex);
  return `&H${alpha}${bgr}&`;
}

// Generates an ASS bezier curve rounded rectangle vector path starting at (0,0) with width w, height h, radius r
function makeRoundRectAssPath(w: number, h: number, r: number): string {
  const x0 = 0, y0 = 0;
  const x1 = r, y1 = r;
  const x2 = w - r, y2 = h - r;
  const x3 = w, y3 = h;
  const k = Math.round(0.5522847498 * r);
  return `m ${Math.round(x1)} ${Math.round(y0)} l ${Math.round(x2)} ${Math.round(y0)} b ${Math.round(x2 + k)} ${Math.round(y0)} ${Math.round(x3)} ${Math.round(y1 - k)} ${Math.round(x3)} ${Math.round(y1)} l ${Math.round(x3)} ${Math.round(y2)} b ${Math.round(x3)} ${Math.round(y2 + k)} ${Math.round(x2 + k)} ${Math.round(y3)} ${Math.round(x2)} ${Math.round(y3)} l ${Math.round(x1)} ${Math.round(y3)} b ${Math.round(x1 - k)} ${Math.round(y3)} ${Math.round(x0)} ${Math.round(y2 + k)} ${Math.round(x0)} ${Math.round(y2)} l ${Math.round(x0)} ${Math.round(y1)} b ${Math.round(x0)} ${Math.round(y1 - k)} ${Math.round(x1 - k)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y0)}`;
}

// Helper to clean emojis, invisible bidi markers, brackets, and unsupported symbols in ASS subtitles to avoid libass [ ] tofu boxes
function cleanTextForAss(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{E000}-\u{F8FF}]/gu, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\u061C\uFEFF\u00AD\uFFF9-\uFFFF\u00A0\u2060-\u206F]/g, '')
    .replace(/[\[\]{}|\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateAss(
  segments: CaptionSegment[], 
  settings: EditorSettings, 
  videoWidth: number = 1080, 
  videoHeight: number = 1920
): string {
  const { template, primaryColor, outlineColor, fontFamily, yPosition, fontSize: webFontSize, showEmojis } = settings;
  const primBgr = hexToAssBgr(primaryColor || '#00F0FF');
  const outBgr = hexToAssBgr(outlineColor || '#000000');
  const primColor = hexToAssColor(primaryColor || '#00F0FF');
  const outColor = hexToAssColor(outlineColor || '#000000');

  // Strip off fallback fonts (e.g. "'Cairo', sans-serif" -> "Cairo")
  let cleanFontName = (fontFamily || 'Cairo').split(',')[0].replace(/['"]/g, '').trim();
  const fontNameMap: Record<string, string> = {
    'Inter': 'Inter',
    'Anton': 'Anton',
    'Roboto': 'Roboto',
    'Merriweather': 'Merriweather Light 18pt',
    'Space Mono': 'Space Mono',
    'Tajawal': 'Tajawal',
    'Cairo': 'Cairo',
    'Almarai': 'Almarai',
    'Rubik': 'Rubik',
    'Montserrat': 'Montserrat',
    'Playfair Display': 'Playfair Display',
    'Cinzel': 'Cinzel'
  };
  const fontName = fontNameMap[cleanFontName] || cleanFontName || 'Cairo';

  // Responsive scale matching preview container height (600px preview -> videoHeight)
  const scale = videoHeight / 600;
  const baseFontSize = Math.max(26, Math.round((webFontSize || 48) * (scale * 0.48)));

  // Exact vertical center percentage
  const defaultPercent = yPosition === 'top' ? 18 : yPosition === 'middle' ? 50 : 80;
  const currentPercent = typeof settings.yOffsetPercent === 'number' ? settings.yOffsetPercent : defaultPercent;

  // Exact pixel center coordinates on the video frame
  const posX = Math.round(videoWidth / 2);
  const posY = Math.round((currentPercent / 100) * videoHeight);

  // Template-specific style parameters
  let borderStyle = 1; // 1 = outline + drop shadow
  let outlineWidth = Math.max(3, Math.round(baseFontSize * 0.08));
  let shadowDepth = Math.max(2, Math.round(baseFontSize * 0.04));
  let backColor = '&H80000000&'; // 50% transparent black
  let styleOutlineColor = outColor;
  let actualFontSize = baseFontSize;

  if (template === 'hormozi') {
    actualFontSize = baseFontSize;
    outlineWidth = Math.max(4, Math.round(baseFontSize * 0.09));
    shadowDepth = Math.max(3, Math.round(baseFontSize * 0.05));
    styleOutlineColor = outColor;
  } else if (template === 'beast') {
    actualFontSize = Math.round(baseFontSize * 1.05);
    outlineWidth = Math.max(6, Math.round(baseFontSize * 0.12));
    shadowDepth = Math.max(4, Math.round(baseFontSize * 0.08));
    styleOutlineColor = outColor;
  } else if (template === 'ali_abdaal') {
    actualFontSize = Math.round(baseFontSize * 0.95);
    outlineWidth = 2;
    shadowDepth = 2;
    styleOutlineColor = outColor;
  } else if (template === 'gadzhi') {
    actualFontSize = Math.round(baseFontSize * 0.92);
    outlineWidth = 1;
    shadowDepth = 4;
    styleOutlineColor = hexToAssColor('#000000', '80');
  } else if (template === 'jatho') {
    actualFontSize = Math.round(baseFontSize * 0.95);
    borderStyle = 1;
    outlineWidth = Math.max(3, Math.round(baseFontSize * 0.07));
    shadowDepth = Math.max(3, Math.round(baseFontSize * 0.05));
    styleOutlineColor = outColor;
  } else if (template === 'pop') {
    actualFontSize = Math.round(baseFontSize * 1.8);
    outlineWidth = Math.max(4, Math.round(baseFontSize * 0.08));
    shadowDepth = 0;
    styleOutlineColor = outColor;
  } else if (template === 'minimal') {
    actualFontSize = Math.round(baseFontSize * 0.85);
    outlineWidth = 2;
    shadowDepth = 1;
    styleOutlineColor = outColor;
  } else if (template === 'karaoke') {
    actualFontSize = baseFontSize;
    outlineWidth = Math.max(3, Math.round(baseFontSize * 0.08));
    shadowDepth = 2;
    styleOutlineColor = outColor;
  } else if (template === 'neon') {
    actualFontSize = baseFontSize;
    outlineWidth = 2;
    shadowDepth = Math.max(6, Math.round(baseFontSize * 0.08));
    styleOutlineColor = primColor;
  } else if (template === 'cinematic') {
    actualFontSize = Math.round(baseFontSize * 0.8);
    outlineWidth = 1;
    shadowDepth = 2;
    styleOutlineColor = hexToAssColor('#000000', '80');
  } else if (template === 'classic') {
    actualFontSize = baseFontSize;
    outlineWidth = Math.max(3, Math.round(baseFontSize * 0.07));
    shadowDepth = 2;
    styleOutlineColor = outColor;
  }

  const head = `[Script Info]
Title: Dynamic Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${actualFontSize},${primColor},&H000000FF&,${styleOutlineColor},${backColor},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDepth},5,20,20,20,1
Style: BoxBg,${fontName},${actualFontSize},&H00FFFFFF&,&H000000FF&,&H00000000&,&H00000000&,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = '';

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    if (!seg.words || seg.words.length === 0) continue;
    const orderedWords = seg.words;

    // POP Style: one word displayed per timestamp with explosive pop zoom animation
    if (template === 'pop') {
      for (const w of seg.words) {
        const cleanText = cleanTextForAss(w.text);
        if (!cleanText) continue;
        const popAnim = `\\fad(70,50)\\fscx70\\fscy70\\frz-3\\t(0,90,\\fscx118\\fscy118\\frz0)\\t(90,160,\\fscx105\\fscy105)`;
        const wBgr = hexToAssBgr(w.highlightColor || primaryColor || '#00F0FF');
        events += `Dialogue: 0,${formatTime(w.start)},${formatTime(w.end)},Default,,0,0,0,,{\\an5\\pos(${posX},${posY})\\c&H${wBgr}&${popAnim}}${cleanText}\n`;
      }
      continue;
    }

    const segmentStart = seg.start;
    const segmentEnd = seg.end;

    // For Jatho or Boxed styles: Draw the frosted rounded rectangle card on Layer 0
    if (template === 'jatho' || template === 'minimal' || template === 'ali_abdaal') {
      const fullText = seg.words.map(w => cleanTextForAss(w.text)).filter(Boolean).join(' ');
      const charCount = fullText.length;
      const isArabic = /[\u0600-\u06FF]/.test(fullText);
      const charFactor = isArabic ? 0.62 : 0.58;
      const approxTextWidth = Math.max(actualFontSize * 3.5, charCount * actualFontSize * charFactor);
      const padX = Math.round(actualFontSize * 0.95);
      const boxW = Math.min(Math.round(videoWidth * 0.92), Math.round(approxTextWidth + padX * 2));
      const boxH = Math.round(actualFontSize * 2.05);
      const r = Math.min(26, Math.max(14, Math.round(actualFontSize * 0.38)));
      const boxX = Math.round(posX - boxW / 2);
      const boxY = Math.round(posY - boxH / 2);
      const boxPath = makeRoundRectAssPath(boxW, boxH, r);
      
      const boxBorderBgr = template === 'jatho' ? primBgr : template === 'ali_abdaal' ? hexToAssBgr('#FEE047') : hexToAssBgr('#4A5568');
      const boxFillBgr = template === 'ali_abdaal' ? hexToAssBgr('#FDE047') : '170602';
      const boxFillAlpha = template === 'ali_abdaal' ? '10' : '20'; // 10 = ~94% opaque, 20 = ~88% opaque
      const boxBordWidth = template === 'jatho' ? 3 : 2;

      events += `Dialogue: 0,${formatTime(segmentStart)},${formatTime(segmentEnd)},BoxBg,,0,0,0,,{\\an7\\pos(${boxX},${boxY})\\p1\\bord${boxBordWidth}\\3c&H${boxBorderBgr}&\\3a&H00&\\1c&H${boxFillBgr}&\\1a&H${boxFillAlpha}&\\shad0}${boxPath}{\\p0}\n`;
    }

    for (let i = 0; i < seg.words.length; i++) {
      const activeWord = seg.words[i];
      let startEventTime = activeWord.start;
      let endEventTime = activeWord.end;

      if (i === 0 && startEventTime > segmentStart) {
        startEventTime = segmentStart;
      }
      if (i === seg.words.length - 1 && endEventTime < segmentEnd) {
        endEventTime = segmentEnd;
      }
      if (i < seg.words.length - 1) {
        endEventTime = seg.words[i + 1].start;
      }

      const isFirstWord = i === 0;
      const isLastWord = i === seg.words.length - 1;
      let fadeTag = '';
      if (isFirstWord && isLastWord) {
        fadeTag = '\\fad(110,90)';
      } else if (isFirstWord) {
        fadeTag = '\\fad(110,0)';
      } else if (isLastWord) {
        fadeTag = '\\fad(0,90)';
      }

      let lineText = '';

      if (template === 'hormozi') {
        const viralColors = [primBgr, hexToAssBgr('#00D7FF'), hexToAssBgr('#88FF00'), hexToAssBgr('#FFF000'), hexToAssBgr('#FF5757')];
        lineText = orderedWords.map((w, idx) => {
          const isWordActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';
          
          if (isWordActive) {
            const wordColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : (primaryColor ? primBgr : viralColors[idx % viralColors.length]);
            return `{\\c&H${wordColorBgr}&\\3c&H${outBgr}&}${cleanText}{\\c&HFFFFFF&\\3c&H${outBgr}&}`;
          } else {
            const baseColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : 'FFFFFF';
            return `{\\c&H${baseColorBgr}&\\3c&H${outBgr}&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'beast') {
        lineText = orderedWords.map((w) => {
          const isWordActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          if (isWordActive) {
            const wordColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
            return `{\\c&H${wordColorBgr}&\\3c&H${outBgr}&}${cleanText}{\\c&HFFFFFF&\\3c&H${outBgr}&}`;
          } else {
            const baseColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : 'FFFFFF';
            return `{\\c&H${baseColorBgr}&\\3c&H${outBgr}&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'ali_abdaal') {
        lineText = orderedWords.map((w) => {
          const isWordActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          if (isWordActive) {
            return `{\\c&H020617&\\3c&HFFFFFF&}${cleanText}{\\c&H020617&\\3c&HFFFFFF&}`;
          } else {
            return `{\\c&H1E293B&\\3c&HFFFFFF&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'gadzhi') {
        lineText = orderedWords.map((w) => {
          const isWordActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const activeColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
          if (isWordActive) {
            return `{\\c&H${activeColorBgr}&\\4c&H${activeColorBgr}&\\shad6\\blur3}${cleanText}{\\shad2\\blur0\\c&HFCFAF7&}`;
          } else {
            return `{\\c&HFCFAF7&\\shad2}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'jatho') {
        lineText = orderedWords.map((w) => {
          const isWordActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const activeColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;

          if (isWordActive) {
            return `{\\c&H${activeColorBgr}&\\3c&H${outBgr}&\\4c&H${activeColorBgr}&\\shad5\\blur2}${cleanText}{\\c&HFFFFFF&\\3c&H${outBgr}&\\shad2\\blur0}`;
          } else {
            const inactiveColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : 'FFFFFF';
            return `{\\c&H${inactiveColorBgr}&\\3c&H${outBgr}&\\shad2}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'karaoke') {
        lineText = orderedWords.map(w => {
          const isPast = w.end <= activeWord.start;
          const isActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const activeColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
          
          if (isActive) {
            return `{\\c&H${activeColorBgr}&\\3c&H${outBgr}&}${cleanText}{\\c&H808080&\\3c&H${outBgr}&}`;
          } else if (isPast) {
            return `{\\c&HFFFFFF&\\3c&H${outBgr}&}${cleanText}`;
          } else {
            return `{\\c&H808080&\\3c&H${outBgr}&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'minimal') {
        lineText = orderedWords.map(w => {
          const isActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const activeColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
          if (isActive) {
            return `{\\c&H${activeColorBgr}&\\3c&H${outBgr}&}${cleanText}{\\c&HEFEFEF&\\3c&H${outBgr}&}`;
          } else {
            return `{\\c&HEFEFEF&\\3c&H${outBgr}&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'neon') {
        lineText = orderedWords.map(w => {
          const isActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const glowColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
          if (isActive) {
            return `{\\c&HFFFFFF&\\3c&H${glowColorBgr}&\\4c&H${glowColorBgr}&\\shad6\\blur3}${cleanText}{\\shad3\\blur1}`;
          } else {
            return `{\\c&HFFFFFF&\\3c&H${glowColorBgr}&\\4c&H${glowColorBgr}&\\shad3\\blur1}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      } else if (template === 'cinematic') {
        lineText = orderedWords.map(w => {
          const isActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const wordColorBgr = isActive ? (w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr) : 'D0D0D0';
          return `{\\c&H${wordColorBgr}&\\3c&H${outBgr}&}${cleanText}`;
        }).filter(Boolean).join(' ');
      } else {
        // Classic
        lineText = orderedWords.map(w => {
          const isActive = w.id === activeWord.id;
          const cleanText = cleanTextForAss(w.text);
          if (!cleanText) return '';

          const activeColorBgr = w.highlightColor ? hexToAssBgr(w.highlightColor) : primBgr;
          if (isActive) {
            return `{\\c&H${activeColorBgr}&\\3c&H${outBgr}&}${cleanText}{\\c&HFFFFFF&\\3c&H${outBgr}&}`;
          } else {
            return `{\\c&HFFFFFF&\\3c&H${outBgr}&}${cleanText}`;
          }
        }).filter(Boolean).join(' ');
      }

      const layer = (template === 'jatho' || template === 'minimal' || template === 'ali_abdaal') ? 1 : 0;
      events += `Dialogue: ${layer},${formatTime(startEventTime)},${formatTime(endEventTime)},Default,,0,0,0,,{\\an5\\pos(${posX},${posY})${fadeTag}}${lineText}\n`;
    }
  }

  return head + events;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function generateSrt(segments: CaptionSegment[]): string {
  let srt = '';
  let counter = 1;

  for (const seg of segments) {
    const text = seg.words.map(w => w.text).join(' ').trim();
    if (!text) continue;

    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.end);

    srt += `${counter}\n${start} --> ${end}\n${text}\n\n`;
    counter++;
  }

  return srt;
}

export function generateVtt(segments: CaptionSegment[]): string {
  let vtt = 'WEBVTT\n\n';

  for (const seg of segments) {
    const text = seg.words.map(w => w.text).join(' ').trim();
    if (!text) continue;

    const start = formatSrtTime(seg.start).replace(',', '.');
    const end = formatSrtTime(seg.end).replace(',', '.');

    vtt += `${start} --> ${end}\n${text}\n\n`;
  }

  return vtt;
}

export function parseSrt(srtContent: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    const timeLine = lines[0].includes('-->') ? lines[0] : lines[1];
    const textLines = lines[0].includes('-->') ? lines.slice(1) : lines.slice(2);
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const parseTime = (tStr: string) => {
      const parts = tStr.replace(',', '.').split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
      return 0;
    };

    const startSec = parseTime(startStr);
    const endSec = parseTime(endStr);
    const rawText = textLines.join(' ').replace(/<[^>]*>/g, '').trim();
    if (!rawText) continue;

    const wordsArr = rawText.split(/\s+/).filter(Boolean);
    if (wordsArr.length === 0) continue;

    const dur = Math.max(0.2, endSec - startSec);
    const wordDur = dur / wordsArr.length;

    const words = wordsArr.map((w, idx) => ({
      id: 'w_' + Math.random().toString(36).substring(7),
      text: w,
      start: Number((startSec + idx * wordDur).toFixed(3)),
      end: Number((startSec + (idx + 1) * wordDur).toFixed(3))
    }));

    segments.push({
      id: 'seg_' + Math.random().toString(36).substring(7),
      start: startSec,
      end: endSec,
      words
    });
  }

  return segments;
}

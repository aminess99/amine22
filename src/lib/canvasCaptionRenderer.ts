import { CaptionSegment, CaptionWord, EditorSettings } from '../types';
import { getWordEmoji } from './emojiMatcher';

function isRTLText(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}

/**
 * Calculates the active word index within a segment smoothly,
 * ensuring continuous word transitions without gaps or premature highlighting.
 */
function getActiveWordIndex(words: CaptionWord[], effectiveTime: number, segmentStart: number): number {
  if (!words || words.length === 0) return -1;
  if (effectiveTime < segmentStart) return -1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wStart = w.start;
    const wEnd = Math.max(wStart, w.end);

    if (effectiveTime >= wStart && effectiveTime < wEnd) {
      return i;
    }
  }

  return -1;
}

/**
 * Draws the active caption segment onto an HTML5 Canvas context.
 * This exact function is used for both real-time UI canvas preview and video export rendering,
 * guaranteeing 100% visual parity (WYSIWYG) including full Arabic/RTL text direction support.
 */
export function drawCaptionsOnCanvas(
  ctx: CanvasRenderingContext2D,
  segments: CaptionSegment[],
  currentTime: number,
  settings: EditorSettings,
  canvasWidth: number,
  canvasHeight: number
) {
  if (!segments || segments.length === 0) return;

  const syncOffset = settings.syncOffset || 0;
  const effectiveTime = Math.max(0, currentTime + syncOffset);

  // Find the active segment for the current effective timestamp
  const activeSegment = segments.find(s => effectiveTime >= s.start - 0.15 && effectiveTime <= s.end + 0.35);
  if (!activeSegment || !activeSegment.words || activeSegment.words.length === 0) return;

  const activeWordIdx = getActiveWordIndex(activeSegment.words, effectiveTime, activeSegment.start);

  const { template, primaryColor, outlineColor, fontFamily, yPosition, fontSize: webFontSize, showEmojis } = settings;

  // Scale relative to reference canvas height (600px preview -> canvasHeight)
  const scale = canvasHeight / 600;
  const baseFontSize = Math.max(24, Math.round((webFontSize || 48) * (scale * 0.48)));

  // Calculate vertical center Y coordinate
  const defaultPercent = yPosition === 'top' ? 18 : yPosition === 'middle' ? 50 : 80;
  const currentPercent = typeof settings.yOffsetPercent === 'number' ? settings.yOffsetPercent : defaultPercent;
  const centerY = (currentPercent / 100) * canvasHeight;
  const centerX = canvasWidth / 2;

  // Parse font family name
  const cleanFont = (fontFamily || 'Cairo').split(',')[0].replace(/['"]/g, '').trim();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  switch (template) {
    case 'hormozi':
      renderHormozi(ctx, activeSegment, activeWordIdx, primaryColor, outlineColor, cleanFont, baseFontSize, centerX, centerY, showEmojis);
      break;
    case 'beast':
      renderMrBeast(ctx, activeSegment, activeWordIdx, primaryColor, outlineColor, cleanFont, baseFontSize, centerX, centerY, showEmojis);
      break;
    case 'ali_abdaal':
      renderAliAbdaal(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    case 'gadzhi':
      renderGadzhi(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    case 'jatho':
      renderJatho(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY, showEmojis);
      break;
    case 'comic':
      renderComic(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY, showEmojis);
      break;
    case 'pop':
      renderPop(ctx, activeSegment, activeWordIdx, primaryColor, outlineColor, cleanFont, baseFontSize, centerX, centerY, showEmojis);
      break;
    case 'minimal':
      renderCleanMinimal(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    case 'karaoke':
      renderKaraoke(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    case 'neon':
      renderNeon(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    case 'cinematic':
      renderCinematic(ctx, activeSegment, activeWordIdx, primaryColor, cleanFont, baseFontSize, centerX, centerY);
      break;
    default:
      renderClassic(ctx, activeSegment, activeWordIdx, primaryColor, outlineColor, cleanFont, baseFontSize, centerX, centerY);
      break;
  }

  ctx.restore();
}

/**
 * Calculates start X positions for words respecting RTL (Arabic) vs LTR (English)
 */
function computeWordPositions(
  wordWidths: number[],
  spaceWidth: number,
  centerX: number,
  isRtl: boolean
): { totalWidth: number; positions: number[] } {
  const totalWidth = wordWidths.reduce((acc, w) => acc + w, 0) + (wordWidths.length - 1) * spaceWidth;
  const positions: number[] = [];

  if (isRtl) {
    let currentX = centerX + totalWidth / 2;
    for (let i = 0; i < wordWidths.length; i++) {
      const wWidth = wordWidths[i];
      const posX = currentX - wWidth;
      positions.push(posX);
      currentX -= wWidth + spaceWidth;
    }
  } else {
    let currentX = centerX - totalWidth / 2;
    for (let i = 0; i < wordWidths.length; i++) {
      positions.push(currentX);
      currentX += wordWidths[i] + spaceWidth;
    }
  }

  return { totalWidth, positions };
}

// 1. ALEX HORMOZI 2.0
function renderHormozi(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  outlineColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  showEmojis?: boolean
) {
  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const colors = [primaryColor || '#FFDE59', '#54B435', '#00F0FF', '#FF5757', '#FFDE59'];

  const activeWord = activeWordIdx !== -1 ? words[activeWordIdx] : null;
  const emoji = activeWord ? (activeWord.customEmoji || (showEmojis ? getWordEmoji(activeWord.text) : null)) : null;

  ctx.font = `900 ${fontSize}px "${fontName}", sans-serif`;
  const spaceWidth = ctx.measureText(' ').width;

  const wordMetrics = words.map((w, idx) => {
    const isActive = idx === activeWordIdx;
    const wordFontSize = isActive ? Math.round(fontSize * 1.2) : fontSize;
    ctx.font = `900 ${wordFontSize}px "${fontName}", sans-serif`;
    const width = ctx.measureText(w.text).width;
    return { width, wordFontSize };
  });

  const wordWidths = wordMetrics.map(m => m.width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);
  const strokeWidth = Math.max(4, Math.round(fontSize * 0.12));

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const { width, wordFontSize } = wordMetrics[idx];
    const posX = positions[idx];
    const wordCenter = posX + width / 2;

    ctx.save();
    ctx.font = `900 ${wordFontSize}px "${fontName}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isActive) {
      const rot = (idx % 2 === 0 ? -3 : 3) * (Math.PI / 180);
      ctx.translate(wordCenter, centerY - 4);
      ctx.rotate(rot);

      ctx.lineWidth = strokeWidth * 1.4;
      ctx.strokeStyle = outlineColor || '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(word.text, 0, 0);

      ctx.fillStyle = word.highlightColor || colors[idx % colors.length];
      ctx.fillText(word.text, 0, 0);
    } else {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = outlineColor || '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(word.text, wordCenter, centerY);

      ctx.fillStyle = word.highlightColor || '#FFFFFF';
      ctx.fillText(word.text, wordCenter, centerY);
    }
    ctx.restore();
  });

  if (emoji) {
    ctx.save();
    ctx.font = `${Math.round(fontSize * 1.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, centerX, centerY - fontSize * 1.25);
    ctx.restore();
  }
}

// 2. MR BEAST 3D IMPACT
function renderMrBeast(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  outlineColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  showEmojis?: boolean
) {
  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);

  const activeWord = activeWordIdx !== -1 ? words[activeWordIdx] : null;
  const emoji = activeWord ? (activeWord.customEmoji || (showEmojis ? getWordEmoji(activeWord.text) : null)) : null;

  ctx.font = `900 ${fontSize}px "${fontName}", sans-serif`;
  const spaceWidth = ctx.measureText(' ').width;

  const wordMetrics = words.map((w, idx) => {
    const isActive = idx === activeWordIdx;
    const wordFontSize = isActive ? Math.round(fontSize * 1.25) : fontSize;
    ctx.font = `900 ${wordFontSize}px "${fontName}", sans-serif`;
    const width = ctx.measureText(w.text).width;
    return { width, wordFontSize };
  });

  const wordWidths = wordMetrics.map(m => m.width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);
  const strokeWidth = Math.max(5, Math.round(fontSize * 0.16));

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const { width, wordFontSize } = wordMetrics[idx];
    const posX = positions[idx];
    const wordCenter = posX + width / 2;
    const yPos = isActive ? centerY - 5 : centerY;

    ctx.save();
    ctx.font = `900 ${wordFontSize}px "${fontName}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 3D Layered drop extrusion
    ctx.lineWidth = strokeWidth + 2;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(word.text, wordCenter + 4, yPos + 6);
    ctx.strokeText(word.text, wordCenter + 2, yPos + 3);

    // Front Stroke
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = outlineColor || '#000000';
    ctx.lineJoin = 'round';
    ctx.strokeText(word.text, wordCenter, yPos);

    // Fill
    ctx.fillStyle = isActive ? (word.highlightColor || primaryColor || '#00F0FF') : '#FFFFFF';
    ctx.fillText(word.text, wordCenter, yPos);
    ctx.restore();
  });

  if (emoji) {
    ctx.save();
    ctx.font = `${Math.round(fontSize * 1.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(emoji, centerX, centerY - fontSize * 1.3);
    ctx.restore();
  }
}

// 3. ALI ABDAAL (Highlighter Box)
function renderAliAbdaal(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  const actualSize = Math.round(fontSize * 0.95);
  ctx.font = `800 ${actualSize}px "${fontName}", sans-serif`;

  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const wWidth = wordWidths[idx];
    const posX = positions[idx];

    if (isActive) {
      ctx.save();
      const highlightColor = word.highlightColor || primaryColor || '#FEE047';
      ctx.fillStyle = highlightColor;
      const hPadX = actualSize * 0.25;
      const hHeight = actualSize * 1.25;
      const boxY = centerY - hHeight / 2;

      ctx.beginPath();
      ctx.roundRect(posX - hPadX, boxY, wWidth + hPadX * 2, hHeight, 8);
      ctx.fill();
      ctx.restore();

      // Sharp black text on top of bright highlighter box
      ctx.save();
      ctx.fillStyle = '#020617';
      ctx.fillText(word.text, posX, centerY);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = word.highlightColor || '#FFFFFF';
      ctx.fillText(word.text, posX, centerY);
      ctx.restore();
    }
  });
}

// 4. IMAN GADZHI (Luxury Editorial Serif & Glow)
function renderGadzhi(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  const actualSize = Math.round(fontSize * 0.92);
  ctx.font = `700 italic ${actualSize}px "${fontName || 'Playfair Display'}", serif, sans-serif`;

  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const activeColor = word.highlightColor || primaryColor || '#F6E05E';
    const posX = positions[idx];

    ctx.save();
    if (isActive) {
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 22;
      ctx.fillStyle = activeColor;
      ctx.fillText(word.text, posX, centerY);

      ctx.shadowBlur = 10;
      ctx.fillText(word.text, posX, centerY);
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(word.text, posX, centerY);
    }
    ctx.restore();
  });
}

// 5. DEVIN JATHO (Glowing Cyber Container)
function renderJatho(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  showEmojis?: boolean
) {
  const actualSize = Math.round(fontSize * 0.92);
  ctx.font = `900 ${actualSize}px "${fontName}", sans-serif`;

  const words = segment.words;
  if (!words || words.length === 0) return;

  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);

  const canvasWidth = centerX * 2;
  const maxLineWidth = Math.min(canvasWidth * 0.8, 650);

  // Group words into lines for clean wrapped display if text is long or multiline
  interface LineData {
    words: { word: CaptionWord; idx: number; width: number }[];
    lineWidth: number;
  }

  const lines: LineData[] = [];
  let currentLine: LineData = { words: [], lineWidth: 0 };

  words.forEach((word, idx) => {
    const cleanWordText = word.text.replace(/\n/g, '').trim();
    const cleanWidth = ctx.measureText(cleanWordText).width;
    const testWidth = currentLine.words.length === 0 ? cleanWidth : currentLine.lineWidth + spaceWidth + cleanWidth;
    const isExplicitBreak = word.text.includes('\n');

    if ((testWidth > maxLineWidth && currentLine.words.length >= 1) || isExplicitBreak) {
      if (currentLine.words.length > 0) {
        lines.push(currentLine);
      }
      currentLine = {
        words: [{ word: { ...word, text: cleanWordText }, idx, width: cleanWidth }],
        lineWidth: cleanWidth
      };
    } else {
      currentLine.words.push({ word: { ...word, text: cleanWordText }, idx, width: cleanWidth });
      currentLine.lineWidth = testWidth;
    }
  });

  if (currentLine.words.length > 0) {
    lines.push(currentLine);
  }

  const maxTextWidth = Math.max(...lines.map(l => l.lineWidth), 20);
  const padX = actualSize * 0.95;
  const padY = actualSize * 0.45;
  const lineHeight = actualSize * 1.35;
  const totalTextHeight = lines.length * lineHeight;

  const boxWidth = maxTextWidth + padX * 2;
  const boxHeight = totalTextHeight + padY * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;
  const radius = Math.min(24, Math.max(16, Math.round(actualSize * 0.42)));
  const cyberColor = primaryColor || '#00F0FF';

  // Frosted dark background box with cyber neon stroke
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.strokeStyle = cyberColor;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = cyberColor;
  ctx.shadowBlur = 20;

  ctx.beginPath();
  drawRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  let activeEmoji: string | null = null;
  const startY = centerY - (totalTextHeight / 2) + (lineHeight / 2);

  lines.forEach((line, lineIdx) => {
    const lineY = startY + lineIdx * lineHeight;
    const lineWordWidths = line.words.map(item => item.width);
    const { positions } = computeWordPositions(lineWordWidths, spaceWidth, centerX, isRtl);

    line.words.forEach((item, posIdx) => {
      const isActive = item.idx === activeWordIdx;
      if (isActive) {
        activeEmoji = item.word.customEmoji || (showEmojis ? getWordEmoji(item.word.text) : null);
      }
      const posX = positions[posIdx];

      ctx.save();
      if (isActive) {
        const activeColor = item.word.highlightColor || cyberColor;
        ctx.fillStyle = activeColor;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 18;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(item.word.text, posX, lineY);
      ctx.restore();
    });
  });

  if (activeEmoji) {
    ctx.save();
    ctx.font = `${Math.round(actualSize * 1.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = cyberColor;
    ctx.shadowBlur = 14;
    ctx.fillText(activeEmoji, centerX, boxY - actualSize * 0.6);
    ctx.restore();
  }
}

// 6. COMIC BUBBLE POP
function renderComic(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  showEmojis?: boolean
) {
  const actualSize = Math.round(fontSize * 0.95);
  ctx.font = `900 ${actualSize}px "${fontName || 'Rubik'}", sans-serif`;

  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const posX = positions[idx];
    const wWidth = wordWidths[idx];

    ctx.save();
    if (isActive) {
      const hPad = actualSize * 0.25;
      const hHeight = actualSize * 1.25;
      const boxY = centerY - hHeight / 2;

      // Black backing box with shadow
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.roundRect(posX - hPad + 2, boxY + 3, wWidth + hPad * 2, hHeight, 10);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.roundRect(posX - hPad, boxY, wWidth + hPad * 2, hHeight, 10);
      ctx.fill();

      ctx.fillStyle = word.highlightColor || '#FDE047';
      ctx.fillText(word.text, posX, centerY);
    } else {
      ctx.lineWidth = Math.max(3, Math.round(actualSize * 0.1));
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(word.text, posX, centerY);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(word.text, posX, centerY);
    }
    ctx.restore();
  });
}

// 7. ONE WORD POP
function renderPop(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  outlineColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  showEmojis?: boolean
) {
  const activeWord = activeWordIdx !== -1 ? segment.words[activeWordIdx] : segment.words[0];
  if (!activeWord) return;

  const emoji = activeWord.customEmoji || (showEmojis ? getWordEmoji(activeWord.text) : null);
  const bigSize = Math.round(fontSize * 1.5);
  ctx.font = `900 ${bigSize}px "${fontName}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const strokeWidth = Math.max(6, Math.round(bigSize * 0.14));

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = outlineColor || '#000000';
  ctx.lineJoin = 'round';
  ctx.strokeText(activeWord.text, centerX, centerY);

  ctx.fillStyle = activeWord.highlightColor || primaryColor || '#FB7185';
  ctx.fillText(activeWord.text, centerX, centerY);
  ctx.restore();

  if (emoji) {
    ctx.save();
    ctx.font = `${Math.round(bigSize * 1.15)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(emoji, centerX, centerY - bigSize * 0.9);
    ctx.restore();
  }
}

// 8. CLEAN MINIMAL PODCAST PILL
function renderCleanMinimal(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  const actualSize = Math.round(fontSize * 0.88);
  ctx.font = `700 ${actualSize}px "${fontName}", sans-serif`;

  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { totalWidth, positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  const padX = actualSize * 0.9;
  const padY = actualSize * 0.45;
  const boxWidth = totalWidth + padX * 2;
  const boxHeight = actualSize * 1.55 + padY * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;
  const radius = Math.round(boxHeight * 0.45);

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const posX = positions[idx];
    ctx.fillStyle = isActive ? (word.highlightColor || primaryColor || '#818CF8') : '#FFFFFF';
    ctx.fillText(word.text, posX, centerY);
  });
}

// 9. KARAOKE WAVE
function renderKaraoke(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  ctx.font = `800 ${fontSize}px "${fontName}", sans-serif`;
  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { totalWidth, positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  const padX = fontSize * 0.85;
  const padY = fontSize * 0.45;
  const boxWidth = totalWidth + padX * 2;
  const boxHeight = fontSize * 1.6 + padY * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(boxHeight * 0.35));
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const isPast = activeWordIdx !== -1 && idx < activeWordIdx;
    const posX = positions[idx];

    ctx.save();
    if (isActive) {
      const activeCol = word.highlightColor || primaryColor || '#34D399';
      ctx.fillStyle = activeCol;
      ctx.shadowColor = activeCol;
      ctx.shadowBlur = 14;
    } else if (isPast) {
      ctx.fillStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = '#64748B';
    }

    ctx.fillText(word.text, posX, centerY);
    ctx.restore();
  });
}

// 10. NEON LASER GLOW
function renderNeon(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  ctx.font = `900 ${fontSize}px "${fontName}", sans-serif`;
  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const glowColor = word.highlightColor || primaryColor || '#E879F9';
    const posX = positions[idx];

    ctx.save();
    if (isActive) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(word.text, posX, centerY);

      ctx.shadowBlur = 14;
      ctx.fillText(word.text, posX, centerY);
    } else {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(word.text, posX, centerY);
    }
    ctx.restore();
  });
}

// 11. CINEMATIC DOCUMENTARY
function renderCinematic(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  const actualSize = Math.round(fontSize * 0.85);
  ctx.font = `600 ${actualSize}px "${fontName || 'Tajawal'}", sans-serif`;

  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { totalWidth, positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  const padX = actualSize * 0.7;
  const padY = actualSize * 0.35;
  const boxWidth = totalWidth + padX * 2;
  const boxHeight = actualSize * 1.45 + padY * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.restore();

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const posX = positions[idx];
    ctx.fillStyle = isActive ? (word.highlightColor || primaryColor || '#FDE68A') : '#F1F5F9';
    ctx.fillText(word.text, posX, centerY);
  });
}

// 12. CLASSIC SUBTITLES
function renderClassic(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  activeWordIdx: number,
  primaryColor: string,
  outlineColor: string,
  fontName: string,
  fontSize: number,
  centerX: number,
  centerY: number
) {
  ctx.font = `800 ${fontSize}px "${fontName}", sans-serif`;
  const words = segment.words;
  const fullText = words.map(w => w.text).join(' ');
  const isRtl = isRTLText(fullText);
  const spaceWidth = ctx.measureText(' ').width;
  const wordWidths = words.map(w => ctx.measureText(w.text).width);
  const { positions } = computeWordPositions(wordWidths, spaceWidth, centerX, isRtl);

  words.forEach((word, idx) => {
    const isActive = idx === activeWordIdx;
    const posX = positions[idx];

    ctx.save();
    ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.08));
    ctx.strokeStyle = outlineColor || '#000000';
    ctx.lineJoin = 'round';
    ctx.strokeText(word.text, posX, centerY);

    ctx.fillStyle = isActive ? (word.highlightColor || primaryColor) : '#FFFFFF';
    ctx.fillText(word.text, posX, centerY);
    ctx.restore();
  });
}

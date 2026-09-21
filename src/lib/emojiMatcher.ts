// Intelligent keyword-to-emoji mapping supporting both Arabic and English viral speech terms

const EMOJI_DICTIONARY: Record<string, string> = {
  // Time & Productivity
  'وقت': '⏳',
  'وقتك': '⏳',
  'ساعة': '⏱️',
  'دقائق': '⌛',
  'يوم': '☀️',
  'تضيع': '⚠️',
  'تضييع': '🛑',
  'ركز': '🎯',
  'تركيز': '🎯',
  'هدف': '🎯',
  'أهداف': '🎯',
  'سر': '🔑',
  'أسرار': '🔑',
  'time': '⏳',
  'focus': '🎯',
  'waste': '⚠️',
  'stop': '🛑',
  'secret': '🔑',
  
  // Money & Wealth & Business
  'فلوس': '💰',
  'مال': '💵',
  'دولار': '💵',
  'أموال': '💸',
  'أرباح': '📈',
  'ربح': '📈',
  'تجارة': '💼',
  'مشروع': '🚀',
  'بزنس': '💼',
  'غني': '🤑',
  'ثراء': '💎',
  'شراء': '🛒',
  'money': '💰',
  'rich': '🤑',
  'cash': '💵',
  'profit': '📈',
  'business': '💼',

  // Fire / Mindset / Emotions
  'نار': '🔥',
  'حماس': '🔥',
  'فكرة': '💡',
  'أفكار': '💡',
  'عقل': '🧠',
  'تفكير': '🧠',
  'ذكاء': '🧠',
  'قوة': '💪',
  'طاقة': '⚡',
  'سريع': '⚡',
  'سرعة': '⚡',
  'نجاح': '🏆',
  'فوز': '🏆',
  'ناجح': '🏆',
  'بطل': '👑',
  'ملك': '👑',
  'خطأ': '❌',
  'صحيح': '✅',
  'مهم': '⭐',
  'مجان': '🎁',
  'مجانا': '🎁',
  'حب': '❤️',
  'قلب': '❤️',
  'fire': '🔥',
  'idea': '💡',
  'brain': '🧠',
  'strong': '💪',
  'energy': '⚡',
  'win': '🏆',
  'king': '👑',
  'free': '🎁',
  'love': '❤️',
  'warning': '⚠️'
};

/**
 * Returns an emoji if the word matches a viral emotion/concept, or null
 */
export function getWordEmoji(rawWord: string): string | null {
  if (!rawWord) return null;
  // Clean punctuation and normalize
  const clean = rawWord
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()؟?!،]/g, '')
    .trim();

  // Direct match
  if (EMOJI_DICTIONARY[clean]) {
    return EMOJI_DICTIONARY[clean];
  }

  // Root or substring match for Arabic prefixes (الـ, بـ, كـ, فـ, وـ)
  const strippedPrefix = clean.replace(/^(ال|و|ف|ب|ك|ل)/, '');
  if (EMOJI_DICTIONARY[strippedPrefix]) {
    return EMOJI_DICTIONARY[strippedPrefix];
  }

  return null;
}

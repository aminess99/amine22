/** Gemini TTS voices offered in the editor (a subset of the model's prebuilt voices). */
export const TTS_VOICES: { id: string; label: string; hint: string }[] = [
  { id: 'Kore', label: 'كور', hint: 'أنثى · واثق' },
  { id: 'Zephyr', label: 'زفير', hint: 'أنثى · مشرق' },
  { id: 'Aoede', label: 'إيودي', hint: 'أنثى · هادئ' },
  { id: 'Leda', label: 'ليدا', hint: 'أنثى · شبابي' },
  { id: 'Puck', label: 'باك', hint: 'ذكر · حيوي' },
  { id: 'Charon', label: 'شارون', hint: 'ذكر · إخباري' },
  { id: 'Fenrir', label: 'فنرير', hint: 'ذكر · متحمس' },
  { id: 'Orus', label: 'أوروس', hint: 'ذكر · رصين' },
];

export const TTS_STYLES: { id: string; label: string; instructions: string }[] = [
  { id: 'natural', label: 'طبيعي', instructions: '' },
  { id: 'excited', label: 'متحمس', instructions: 'Speak with energy and excitement, like a social media creator.' },
  { id: 'calm', label: 'هادئ', instructions: 'Speak calmly and warmly, at a relaxed pace.' },
  { id: 'news', label: 'مذيع', instructions: 'Speak clearly and confidently, like a news presenter.' },
  { id: 'story', label: 'حكواتي', instructions: 'Speak like a storyteller, with expressive pauses.' },
  { id: 'whisper', label: 'همس', instructions: 'Whisper softly.' },
];

export const MAX_TTS_CHARS = 2000;

/** Turns text into speech on the server and returns it as a WAV file. */
export async function synthesizeSpeech(text: string, voice: string, styleId: string): Promise<File> {
  const instructions = TTS_STYLES.find((s) => s.id === styleId)?.instructions ?? '';
  let res: Response;
  try {
    res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, instructions }),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت.');
  }
  if (res.status === 404 || res.status === 405) throw new Error('تحويل النص إلى صوت يعمل على الموقع الكامل فقط.');
  if (res.status === 503) throw new Error('تحويل النص إلى صوت يحتاج مفتاح OpenRouter في إعدادات الخادم.');
  if (res.status === 429) throw new Error('طلبات كثيرة. انتظر دقيقة ثم حاول.');
  if (!res.ok) throw new Error('تعذر توليد الصوت. حاول مرة أخرى.');
  const blob = await res.blob();
  const name = text.trim().slice(0, 24).replace(/[\\/:*?"<>|\n]/g, ' ');
  return new File([blob], `صوت - ${name}.wav`, { type: 'audio/wav' });
}

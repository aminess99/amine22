import { encodeWav } from './audioTools';

/**
 * Built-in sound effects, synthesised in the browser with Web Audio, so they
 * need no files and carry no licence terms.
 */
export interface SfxDef {
  id: string;
  label: string;
  group: SfxGroup;
  duration: number;
  /** Seconds from the start to the loudest moment; placed on a cut, the peak lands on it. */
  lead?: number;
  build: (ctx: OfflineAudioContext) => void;
}

export type SfxGroup = 'transitions' | 'hits' | 'alerts' | 'fun';

export const SFX_GROUPS: { id: SfxGroup; label: string }[] = [
  { id: 'transitions', label: 'انتقالات' },
  { id: 'hits', label: 'ضربات' },
  { id: 'alerts', label: 'تنبيهات' },
  { id: 'fun', label: 'مرح' },
];

const SR = 44100;

function noise(ctx: OfflineAudioContext, seconds: number): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Attack/decay gain envelope starting at `at`. */
function env(ctx: OfflineAudioContext, at: number, attack: number, decay: number, peak = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

function tone(ctx: OfflineAudioContext, type: OscillatorType, freq: number, at: number, attack: number, decay: number, peak = 0.6, endFreq?: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + attack + decay);
  const g = env(ctx, at, attack, decay, peak);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + attack + decay + 0.02);
}

/** Filtered noise whose band sweeps between two frequencies. */
function sweep(ctx: OfflineAudioContext, from: number, to: number, at: number, attack: number, decay: number, peak = 0.9, q = 1.2) {
  const n = noise(ctx, attack + decay + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  const g = env(ctx, at, attack, decay, peak);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(at);
}

function burst(ctx: OfflineAudioContext, at: number, length: number, type: BiquadFilterType, freq: number, peak = 0.8) {
  const n = noise(ctx, length + 0.02);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = env(ctx, at, 0.002, length, peak);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(at);
}

export const SFX_LIST: SfxDef[] = [
  // transitions
  { id: 'whoosh', label: 'ووش', group: 'transitions', duration: 0.8, lead: 0.35, build: (c) => sweep(c, 300, 4000, 0, 0.35, 0.4) },
  { id: 'swoosh', label: 'سوش', group: 'transitions', duration: 0.6, lead: 0.15, build: (c) => sweep(c, 5000, 400, 0, 0.15, 0.4, 0.9, 2) },
  { id: 'swipe', label: 'سحب سريع', group: 'transitions', duration: 0.35, lead: 0.05, build: (c) => sweep(c, 1200, 6000, 0, 0.05, 0.25, 0.8, 3) },
  {
    id: 'riser', label: 'صعود توتر', group: 'transitions', duration: 2.2, lead: 1.9, build: (c) => {
      sweep(c, 200, 6000, 0, 1.9, 0.2, 0.7, 4);
      tone(c, 'sawtooth', 80, 0, 1.9, 0.2, 0.15, 900);
    },
  },
  {
    id: 'reverse', label: 'سحب عكسي', group: 'transitions', duration: 1.2, lead: 1.05, build: (c) => {
      const n = noise(c, 1.2);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400, 0);
      f.frequency.exponentialRampToValueAtTime(8000, 1.05);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.9, 1.05);
      g.gain.linearRampToValueAtTime(0, 1.1);
      n.connect(f).connect(g).connect(c.destination);
      n.start(0);
    },
  },

  // hits
  {
    id: 'boom', label: 'بوم', group: 'hits', duration: 1.6, build: (c) => {
      tone(c, 'sine', 120, 0, 0.005, 1.4, 1, 35);
      burst(c, 0, 0.25, 'lowpass', 300, 0.7);
    },
  },
  {
    id: 'impact', label: 'ضربة', group: 'hits', duration: 0.8, build: (c) => {
      tone(c, 'sine', 90, 0, 0.003, 0.5, 0.9, 40);
      burst(c, 0, 0.12, 'bandpass', 1800, 0.9);
    },
  },
  { id: 'punch', label: 'لكمة', group: 'hits', duration: 0.35, build: (c) => { tone(c, 'triangle', 180, 0, 0.002, 0.18, 0.9, 60); burst(c, 0, 0.06, 'highpass', 2500, 0.6); } },
  {
    id: 'heartbeat', label: 'نبض قلب', group: 'hits', duration: 1.2, build: (c) => {
      tone(c, 'sine', 70, 0, 0.01, 0.18, 0.9, 45);
      tone(c, 'sine', 65, 0.22, 0.01, 0.22, 0.7, 40);
    },
  },
  {
    id: 'glitch', label: 'تشويش', group: 'hits', duration: 0.6, build: (c) => {
      for (let i = 0; i < 9; i++) {
        const at = i * 0.06 + Math.random() * 0.02;
        if (i % 2) burst(c, at, 0.03, 'bandpass', 800 + Math.random() * 4000, 0.7);
        else tone(c, 'square', 200 + Math.random() * 1500, at, 0.002, 0.04, 0.25);
      }
    },
  },

  // alerts
  { id: 'ding', label: 'دينغ', group: 'alerts', duration: 1.4, build: (c) => { tone(c, 'sine', 1320, 0, 0.005, 1.2, 0.5); tone(c, 'sine', 2640, 0, 0.005, 0.6, 0.15); } },
  { id: 'notify', label: 'إشعار', group: 'alerts', duration: 0.6, build: (c) => { tone(c, 'sine', 880, 0, 0.005, 0.18, 0.45); tone(c, 'sine', 1175, 0.13, 0.005, 0.35, 0.45); } },
  {
    id: 'success', label: 'نجاح', group: 'alerts', duration: 1, build: (c) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, i * 0.08, 0.005, 0.5, 0.35));
    },
  },
  { id: 'error', label: 'خطأ', group: 'alerts', duration: 0.6, build: (c) => { tone(c, 'square', 220, 0, 0.005, 0.18, 0.2); tone(c, 'square', 165, 0.2, 0.005, 0.3, 0.2); } },
  { id: 'click', label: 'نقرة', group: 'alerts', duration: 0.1, build: (c) => burst(c, 0, 0.02, 'highpass', 3000, 0.8) },
  {
    id: 'shutter', label: 'كاميرا', group: 'alerts', duration: 0.35, build: (c) => {
      burst(c, 0, 0.03, 'bandpass', 3500, 0.9);
      burst(c, 0.09, 0.05, 'bandpass', 2200, 0.8);
    },
  },
  {
    id: 'typing', label: 'كتابة', group: 'alerts', duration: 1.6, build: (c) => {
      let at = 0;
      while (at < 1.45) {
        burst(c, at, 0.015, 'bandpass', 2500 + Math.random() * 2500, 0.5 + Math.random() * 0.3);
        at += 0.07 + Math.random() * 0.1;
      }
    },
  },
  {
    id: 'tick', label: 'تكتكة ساعة', group: 'alerts', duration: 2, build: (c) => {
      for (let i = 0; i < 4; i++) burst(c, i * 0.5, 0.012, 'bandpass', i % 2 ? 2000 : 2800, 0.8);
    },
  },

  // fun
  { id: 'pop', label: 'بوب', group: 'fun', duration: 0.2, build: (c) => tone(c, 'sine', 700, 0, 0.003, 0.1, 0.8, 180) },
  { id: 'boing', label: 'بوينغ', group: 'fun', duration: 0.8, build: (c) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, 0);
      o.frequency.exponentialRampToValueAtTime(600, 0.6);
      const lfo = c.createOscillator();
      lfo.frequency.value = 18;
      const depth = c.createGain();
      depth.gain.value = 40;
      lfo.connect(depth).connect(o.frequency);
      const g = env(c, 0, 0.01, 0.65, 0.6);
      o.connect(g).connect(c.destination);
      o.start(0);
      lfo.start(0);
      o.stop(0.7);
      lfo.stop(0.7);
    },
  },
  { id: 'coin', label: 'عملة', group: 'fun', duration: 0.5, build: (c) => { tone(c, 'square', 988, 0, 0.003, 0.07, 0.25); tone(c, 'square', 1319, 0.07, 0.003, 0.35, 0.25); } },
  { id: 'laser', label: 'ليزر', group: 'fun', duration: 0.35, build: (c) => tone(c, 'square', 1800, 0, 0.003, 0.3, 0.25, 180) },
  { id: 'jump', label: 'قفزة', group: 'fun', duration: 0.35, build: (c) => tone(c, 'square', 260, 0, 0.005, 0.28, 0.22, 780) },
  {
    id: 'sparkle', label: 'سحر', group: 'fun', duration: 1.2, build: (c) => {
      for (let i = 0; i < 10; i++) tone(c, 'sine', 1800 + Math.random() * 2500, i * 0.07 + Math.random() * 0.03, 0.003, 0.35, 0.18);
    },
  },
  { id: 'fail', label: 'فشل', group: 'fun', duration: 1.6, build: (c) => [392, 370, 349, 330].forEach((f, i) => tone(c, 'sawtooth', f, i * 0.32, 0.01, i === 3 ? 0.9 : 0.28, 0.18, i === 3 ? 300 : undefined)) },
];

const rendered = new Map<string, Promise<AudioBuffer>>();

/** Renders a built-in effect (once) to an audio buffer. */
export function renderSfx(id: string): Promise<AudioBuffer> {
  const def = SFX_LIST.find((s) => s.id === id);
  if (!def) return Promise.reject(new Error('Unknown sound'));
  let p = rendered.get(id);
  if (!p) {
    const ctx = new OfflineAudioContext(1, Math.ceil(def.duration * SR), SR);
    def.build(ctx);
    p = ctx.startRendering();
    rendered.set(id, p);
  }
  return p;
}

/** A built-in effect as a WAV file for the media library. */
export async function sfxFile(id: string): Promise<File> {
  const def = SFX_LIST.find((s) => s.id === id)!;
  return encodeWav(await renderSfx(id), `مؤثر - ${def.label}.wav`);
}

let previewCtx: AudioContext | null = null;
let previewSource: AudioBufferSourceNode | null = null;

/** Plays a sound for auditioning, stopping any earlier preview. */
export function playPreview(buffer: AudioBuffer) {
  previewCtx ??= new AudioContext();
  previewSource?.stop();
  const src = previewCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(previewCtx.destination);
  src.start();
  previewSource = src;
}

// ---------------------------------------------------------------- Freesound

export interface FreesoundHit {
  id: number;
  name: string;
  duration: number;
  user: string;
}

/** Searches Freesound (CC0 sounds only) through the site's server. */
export async function searchFreesound(query: string): Promise<FreesoundHit[]> {
  let res: Response;
  try {
    res = await fetch(`/api/sfx/search?q=${encodeURIComponent(query)}`);
  } catch {
    throw new Error('تعذر الاتصال بالخادم.');
  }
  if (res.status === 404 || res.status === 405) throw new Error('البحث في Freesound يعمل على الموقع الكامل فقط.');
  if (res.status === 503) throw new Error('البحث في Freesound يحتاج مفتاح FREESOUND_API_KEY في إعدادات الخادم.');
  if (res.status === 429) throw new Error('طلبات كثيرة. انتظر دقيقة ثم حاول.');
  if (!res.ok) throw new Error('تعذر البحث الآن. حاول مرة أخرى.');
  return (await res.json()).results ?? [];
}

/** Downloads a Freesound sound's MP3 preview as a file. */
export async function freesoundFile(hit: Pick<FreesoundHit, 'id' | 'name'>): Promise<File> {
  const res = await fetch(`/api/sfx/file/${hit.id}`);
  if (!res.ok) throw new Error('تعذر تحميل الصوت.');
  const blob = await res.blob();
  return new File([blob], `${hit.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40)}.mp3`, { type: 'audio/mpeg' });
}

/** Where an effect goes for "every cut" or "every text", already shifted so its peak lands on the moment. */
export function autoSfxTimes(id: string, moments: number[]): number[] {
  const lead = SFX_LIST.find((s) => s.id === id)?.lead ?? 0;
  return [...new Set(moments.map((t) => Math.max(0, Math.round((t - lead) * 1000) / 1000)))];
}

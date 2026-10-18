import { timeStretch } from './timeStretch';

export type VoiceEffect = 'deep' | 'chipmunk' | 'robot' | 'echo' | 'radio' | 'reverb' | 'denoise' | 'normalize';

export const VOICE_EFFECTS: { id: VoiceEffect; label: string }[] = [
  { id: 'denoise', label: 'تقليل الضوضاء' },
  { id: 'normalize', label: 'رفع الصوت' },
  { id: 'deep', label: 'صوت عميق' },
  { id: 'chipmunk', label: 'صوت رفيع' },
  { id: 'robot', label: 'روبوت' },
  { id: 'echo', label: 'صدى' },
  { id: 'reverb', label: 'قاعة' },
  { id: 'radio', label: 'راديو' },
];

const SAMPLE_RATE = 48000;

export async function decodeFile(file: File, sampleRate = SAMPLE_RATE): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, sampleRate);
  return ctx.decodeAudioData(await file.arrayBuffer());
}

function slice(buffer: AudioBuffer, from: number, to: number): Float32Array[] {
  const a = Math.max(0, Math.floor(from * buffer.sampleRate));
  const b = Math.min(buffer.length, Math.ceil(to * buffer.sampleRate));
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice(a, Math.max(a + 1, b)));
}

function toBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const out = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate });
  channels.forEach((d, c) => out.copyToChannel(d, c));
  return out;
}

/** Changes pitch by `factor` while keeping the length: stretch, then resample back. */
function pitchShift(channels: Float32Array[], sampleRate: number, factor: number): Float32Array[] {
  const stretched = timeStretch(channels, sampleRate, 1 / factor);
  const len = channels[0].length;
  return stretched.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = i * factor;
      const j = Math.floor(x);
      const f = x - j;
      out[i] = (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? 0) * f;
    }
    return out;
  });
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

/** Renders a filter graph over the audio offline. */
async function renderGraph(
  input: AudioBuffer,
  extraSeconds: number,
  build: (ctx: OfflineAudioContext, source: AudioNode) => AudioNode
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil((input.duration + extraSeconds) * input.sampleRate), input.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = input;
  build(ctx, src).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

function normalize(buffer: AudioBuffer, target = 0.9): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak < 1e-4) return buffer;
  const gain = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return buffer;
}

/** Gentle noise reduction: rumble and hiss filters, then a soft gate on the quiet parts. */
async function denoise(input: AudioBuffer): Promise<AudioBuffer> {
  const filtered = await renderGraph(input, 0, (ctx, src) => {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const hum = ctx.createBiquadFilter();
    hum.type = 'notch';
    hum.frequency.value = 50;
    src.connect(hp).connect(hum).connect(lp);
    return lp;
  });
  // Estimate the noise floor from the quietest 10% of 20 ms windows and gate below it.
  const win = Math.floor(filtered.sampleRate * 0.02);
  const mono = filtered.getChannelData(0);
  const levels: number[] = [];
  for (let i = 0; i < mono.length; i += win) {
    let sum = 0;
    for (let j = i; j < Math.min(mono.length, i + win); j++) sum += mono[j] * mono[j];
    levels.push(Math.sqrt(sum / win));
  }
  const floor = [...levels].sort((a, b) => a - b)[Math.floor(levels.length * 0.1)] ?? 0;
  const threshold = floor * 2.5;
  let gain = 1;
  for (let c = 0; c < filtered.numberOfChannels; c++) {
    const d = filtered.getChannelData(c);
    gain = 1;
    for (let w = 0; w < levels.length; w++) {
      const target = levels[w] > threshold ? 1 : 0.15;
      for (let j = w * win; j < Math.min(d.length, (w + 1) * win); j++) {
        gain += (target - gain) * 0.002;
        d[j] *= gain;
      }
    }
  }
  return filtered;
}

/** Applies a voice effect to a source range and returns the processed audio. */
export async function applyVoiceEffect(file: File, from: number, to: number, effect: VoiceEffect): Promise<AudioBuffer> {
  const decoded = await decodeFile(file);
  const input = toBuffer(slice(decoded, from, to), decoded.sampleRate);
  const rate = input.sampleRate;
  switch (effect) {
    case 'normalize':
      return normalize(input);
    case 'denoise':
      return normalize(await denoise(input), 0.85);
    case 'deep':
      return toBuffer(pitchShift(slice(input, 0, input.duration), rate, 0.75), rate);
    case 'chipmunk':
      return toBuffer(pitchShift(slice(input, 0, input.duration), rate, 1.45), rate);
    case 'robot':
      return renderGraph(input, 0, (ctx, src) => {
        // Ring modulation: multiply the voice by a low sine.
        const ring = ctx.createGain();
        ring.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.frequency.value = 55;
        osc.connect(ring.gain);
        osc.start();
        src.connect(ring);
        const out = ctx.createGain();
        out.gain.value = 1.6;
        ring.connect(out);
        return out;
      });
    case 'echo':
      return renderGraph(input, 1.5, (ctx, src) => {
        const out = ctx.createGain();
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.28;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.4;
        src.connect(out);
        src.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(out);
        return out;
      });
    case 'reverb':
      return renderGraph(input, 2.5, (ctx, src) => {
        const out = ctx.createGain();
        const conv = ctx.createConvolver();
        conv.buffer = impulse(ctx, 2.2, 3);
        const wet = ctx.createGain();
        wet.gain.value = 0.45;
        src.connect(out);
        src.connect(conv).connect(wet).connect(out);
        return out;
      });
    case 'radio':
      return renderGraph(input, 0, (ctx, src) => {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1700;
        band.Q.value = 0.9;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = Math.tanh(3 * x);
        }
        shaper.curve = curve;
        const out = ctx.createGain();
        out.gain.value = 0.8;
        src.connect(band).connect(shaper).connect(out);
        return out;
      });
  }
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV file. */
export function encodeWav(buffer: AudioBuffer, name: string): File {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + length));
  const write = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new File([view], name, { type: 'audio/wav' });
}

/**
 * Finds beats: onsets in the low end (kick drums), picked against an adaptive
 * threshold with a minimum spacing. Returns source times in seconds.
 */
export async function detectBeats(file: File): Promise<number[]> {
  const decoded = await decodeFile(file, 22050);
  const lowpassed = await renderGraph(decoded, 0, (ctx, src) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    src.connect(lp);
    return lp;
  });
  const data = lowpassed.getChannelData(0);
  const rate = lowpassed.sampleRate;
  const hop = 512;
  const energies: number[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + hop; j++) sum += data[j] * data[j];
    energies.push(Math.log(1e-6 + sum));
  }
  const flux = energies.map((e, i) => (i === 0 ? 0 : Math.max(0, e - energies[i - 1])));
  const frameSec = hop / rate;
  const windowFrames = Math.round(0.6 / frameSec);
  const minGap = 0.28;
  const beats: number[] = [];
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
    const a = Math.max(0, i - windowFrames);
    const b = Math.min(flux.length, i + windowFrames);
    let mean = 0;
    for (let j = a; j < b; j++) mean += flux[j];
    mean /= b - a;
    let variance = 0;
    for (let j = a; j < b; j++) variance += (flux[j] - mean) ** 2;
    const std = Math.sqrt(variance / (b - a));
    if (flux[i] > mean + 1.4 * std && flux[i] > 0.3) {
      const t = i * frameSec;
      if (!beats.length || t - beats[beats.length - 1] >= minGap) beats.push(t);
    }
  }
  return beats;
}

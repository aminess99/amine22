/**
 * WSOLA time stretching: changes audio speed without changing its pitch.
 * Overlapping Hann-windowed frames are read from the input at `rate` times
 * the output hop, and each frame is nudged within a small search window to
 * the offset that best continues the previous frame's waveform.
 */
export function timeStretch(input: Float32Array[], sampleRate: number, rate: number): Float32Array[] {
  if (Math.abs(rate - 1) < 1e-3) return input.map((c) => c.slice());
  const frame = Math.round(sampleRate * 0.04);
  const hop = frame >> 1;
  const search = Math.round(sampleRate * 0.012);
  const inLen = input[0]?.length ?? 0;
  const outLen = Math.max(1, Math.floor(inLen / rate));
  const output = input.map(() => new Float32Array(outLen + frame));
  const norm = new Float32Array(outLen + frame);

  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));

  // Mono mix used only for finding the best overlap offset.
  const mono = new Float32Array(inLen);
  for (const ch of input) for (let i = 0; i < inLen; i++) mono[i] += ch[i] / input.length;

  let prevPos = 0;
  for (let outPos = 0; outPos < outLen; outPos += hop) {
    const nominal = Math.round(outPos * rate);
    let best = nominal;
    if (outPos > 0) {
      // The ideal continuation of the previously copied frame starts at prevPos + hop.
      const natural = prevPos + hop;
      let bestScore = -Infinity;
      const lo = Math.max(0, nominal - search);
      const hi = Math.min(inLen - frame, nominal + search);
      for (let cand = lo; cand <= hi; cand += 2) {
        let score = 0;
        for (let i = 0; i < hop; i += 4) {
          const a = natural + i < inLen ? mono[natural + i] : 0;
          score += a * mono[cand + i];
        }
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
    best = Math.max(0, Math.min(best, inLen - 1));
    for (let c = 0; c < input.length; c++) {
      const src = input[c];
      const dst = output[c];
      for (let i = 0; i < frame && best + i < inLen; i++) dst[outPos + i] += src[best + i] * win[i];
    }
    for (let i = 0; i < frame; i++) norm[outPos + i] += win[i];
    prevPos = best;
  }

  return output.map((ch) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-3 ? ch[i] / norm[i] : 0;
    return out;
  });
}

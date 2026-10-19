import type { ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * Person segmentation in the browser (MediaPipe selfie segmenter). The model
 * and runtime load on first use; until then body effects draw the frame as is.
 */

export const BODY_TYPES = new Set(['bg-remove', 'bg-blur', 'bg-color', 'bg-bw', 'body-glow', 'body-outline', 'clone']);

const MODEL_URL = '/models/selfie_segmenter.tflite';
/** Segmentation runs on a small copy of the frame; the mask is scaled back up softly. */
const MASK_SIDE = 256;

let segmenter: ImageSegmenter | null = null;
let loading: Promise<void> | null = null;
let loadError: string | null = null;
const listeners = new Set<() => void>();

export const segmenterReady = () => !!segmenter;
export const segmenterError = () => loadError;
/** Called once the model is ready, so previews can redraw. */
export function onSegmenterReady(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadSegmenter(): Promise<void> {
  if (segmenter) return Promise.resolve();
  loading ??= (async () => {
    try {
      // Loaded only when needed: the runtime is large, and the server shares this module graph.
      const [{ ImageSegmenter }, loader, binary] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
      ]);
      const fileset = { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default };
      const make = (delegate: 'GPU' | 'CPU') =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      segmenter = await make('GPU').catch(() => make('CPU'));
      listeners.forEach((fn) => fn());
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      console.error('Segmentation model failed to load:', err);
      loading = null;
    }
  })();
  return loading;
}

let small: HTMLCanvasElement | null = null;
const cache = new Map<string, HTMLCanvasElement>();

/**
 * A canvas whose alpha is the person (1) vs background (0), at MASK_SIDE size,
 * or null while the model is loading. `key` identifies the frame for caching.
 */
export function personMask(src: CanvasImageSource, w: number, h: number, key: string): HTMLCanvasElement | null {
  if (!segmenter) {
    loadSegmenter();
    return null;
  }
  const hit = key ? cache.get(key) : undefined;
  if (hit) return hit;
  const scale = MASK_SIDE / Math.max(w, h);
  const mw = Math.max(1, Math.round(w * scale));
  const mh = Math.max(1, Math.round(h * scale));
  small ??= document.createElement('canvas');
  if (small.width !== mw || small.height !== mh) {
    small.width = mw;
    small.height = mh;
  }
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(src, 0, 0, mw, mh);
  let result;
  try {
    result = segmenter.segment(small);
  } catch (err) {
    console.warn('Segmentation failed:', err);
    return null;
  }
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    return null;
  }
  const conf = mask.getAsFloat32Array();
  const out = document.createElement('canvas');
  out.width = mask.width;
  out.height = mask.height;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(mask.width, mask.height);
  for (let i = 0; i < conf.length; i++) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    // Sharpen the soft edge a little so hair and shoulders don't look ghostly.
    img.data[i * 4 + 3] = Math.max(0, Math.min(255, (conf[i] - 0.2) * 1.6 * 255));
  }
  octx.putImageData(img, 0, 0);
  result.close();
  if (key) {
    cache.set(key, out);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return out;
}

let work: HTMLCanvasElement | null = null;
let person: HTMLCanvasElement | null = null;
let extra: HTMLCanvasElement | null = null;
const sized = (c: HTMLCanvasElement | null, w: number, h: number) => {
  const canvas = c ?? document.createElement('canvas');
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return canvas;
};

/**
 * Applies one body effect to a frame of w×h; returns a canvas with the result,
 * or null while the model loads (the caller then shows the frame unchanged).
 */
export function applyBodyEffect(
  src: CanvasImageSource,
  w: number,
  h: number,
  type: string,
  intensity: number,
  color: string,
  key: string,
  /** Leave the background out (combined with "remove background"). */
  cutout = false
): HTMLCanvasElement | null {
  const mask = personMask(src, w, h, key);
  if (!mask) return null;
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  person = sized(person, w, h);
  const pctx = person.getContext('2d')!;
  pctx.clearRect(0, 0, w, h);
  pctx.globalCompositeOperation = 'source-over';
  pctx.drawImage(src, 0, 0, w, h);
  pctx.globalCompositeOperation = 'destination-in';
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(mask, 0, 0, w, h);
  pctx.globalCompositeOperation = 'source-over';

  work = sized(work, w, h);
  const ctx = work.getContext('2d')!;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const k = Math.max(0.05, Math.min(1, intensity));
  const unit = Math.min(w, h);
  switch (type) {
    case 'bg-remove':
      ctx.drawImage(person, 0, 0);
      break;
    case 'bg-blur':
      ctx.filter = `blur(${Math.round(unit * 0.03 * k)}px)`;
      ctx.drawImage(src, -unit * 0.04, -unit * 0.04, w + unit * 0.08, h + unit * 0.08);
      ctx.filter = 'none';
      ctx.drawImage(person, 0, 0);
      break;
    case 'bg-color':
      ctx.fillStyle = color || '#22c55e';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(src, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(person, 0, 0);
      break;
    case 'bg-bw':
      ctx.filter = `grayscale(${Math.round(100 * k)}%) brightness(${1 - 0.25 * k})`;
      ctx.drawImage(src, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.drawImage(person, 0, 0);
      break;
    case 'body-glow':
    case 'body-outline': {
      // A coloured silhouette, grown (outline) or blurred (glow), behind the person.
      extra = sized(extra, w, h);
      const ectx = extra.getContext('2d')!;
      ectx.clearRect(0, 0, w, h);
      const grow = unit * (type === 'body-outline' ? 0.012 : 0.02) * (0.4 + k);
      if (type === 'body-glow') ectx.filter = `blur(${Math.round(grow)}px)`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ectx.drawImage(mask, Math.cos(a) * grow, Math.sin(a) * grow, w, h);
      }
      ectx.filter = 'none';
      ectx.globalCompositeOperation = 'source-in';
      ectx.fillStyle = color || (type === 'body-glow' ? '#22d3ee' : '#ffffff');
      ectx.fillRect(0, 0, w, h);
      ectx.globalCompositeOperation = 'source-over';
      if (!cutout) ctx.drawImage(src, 0, 0, w, h);
      if (type === 'body-glow' && !cutout) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(extra, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(person, 0, 0);
      break;
    }
    case 'clone': {
      if (!cutout) ctx.drawImage(src, 0, 0, w, h);
      const shift = w * 0.28 * (0.5 + k * 0.5);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(person, -shift, 0);
      ctx.drawImage(person, shift, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(person, 0, 0);
      break;
    }
    default:
      ctx.drawImage(src, 0, 0, w, h);
  }
  ctx.restore();
  return work;
}

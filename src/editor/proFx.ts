import { runShaders, SHADER_TYPES } from './gl';
import { drawParticles, PARTICLE_TYPES } from './particles';
import { applyBodyEffect, BODY_TYPES, loadSegmenter } from './segment';
import { FxLayer, Project } from './types';

export { FX_GROUPS, PRO_FX, fxDef, isProFx, newFxLayer } from './proFxCatalog';
export type { FxGroup, ProFxDef } from './proFxCatalog';

/** Effects run at most this big; the result is scaled to fit when drawn. */
const MAX_SIDE = 1280;

/**
 * Runs a stack's body and shader effects over a frame. Returns the processed
 * canvas and its size, or null when nothing applies (or the model is loading).
 * `key` names the source frame for the person-mask cache ('' = don't cache).
 */
export function processFrame(src: CanvasImageSource, w: number, h: number, layers: FxLayer[], time: number, key: string): { canvas: HTMLCanvasElement; w: number; h: number } | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  let current: CanvasImageSource = src;
  let out: HTMLCanvasElement | null = null;
  // Body effects need the original picture to find the person. "Remove background"
  // combines with one look around the person (glow, outline, clone) on a clear background.
  const bodies = layers.filter((l) => BODY_TYPES.has(l.type));
  if (bodies.length) {
    const cutout = bodies.some((l) => l.type === 'bg-remove');
    const look = bodies.find((l) => l.type !== 'bg-remove') ?? bodies[0];
    const res = applyBodyEffect(current, pw, ph, look.type, look.intensity, look.color ?? '', key ? `${key}@${pw}` : '', cutout && look.type !== 'bg-remove');
    if (res) current = out = res;
  }
  const shaders = layers.filter((l) => SHADER_TYPES.has(l.type));
  if (shaders.length) {
    const res = runShaders(
      current as TexImageSource,
      pw,
      ph,
      shaders.map((l) => ({ type: l.type, intensity: l.intensity, speed: l.speed ?? 1, color: l.color ?? '#ffffff' })),
      time
    );
    if (res) out = res;
  }
  return out ? { canvas: out, w: pw, h: ph } : null;
}

/** Particle layers, drawn over a W×H area at time t. */
export function drawParticleLayers(ctx: CanvasRenderingContext2D, layers: FxLayer[], t: number, W: number, H: number) {
  for (const l of layers) if (PARTICLE_TYPES.has(l.type)) drawParticles(ctx, l.type, t, W, H, l.intensity, l.speed ?? 1, l.color ?? '');
}

export const hasFx = (layers: FxLayer[] | undefined) => !!layers?.length;

/** Starts loading the person model when the project uses a body effect; resolves when ready. */
export function prepareFx(project: Project): Promise<void> {
  const all = [
    ...project.clips.flatMap((c) => c.fx ?? []),
    ...project.overlays.flatMap((o) => o.fx ?? []),
    ...(project.effects ?? []),
  ];
  return all.some((l) => BODY_TYPES.has(l.type)) ? loadSegmenter() : Promise.resolve();
}

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ASPECT_SIZES } from './constants';
import { filmstripFrame } from './media';
import { renderFrame } from './renderer';
import { audioClipEnd, audioGainAt, clamp, getMainFrameState, overlayEnd, sourceTimeFor } from './timeline';
import { FrameRef, LaidOutClip, MediaAsset, Project, TextBounds } from './types';

interface EngineInput {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  project: Project;
  assets: Map<string, MediaAsset>;
  layout: LaidOutClip[];
  duration: number;
  selectedId: string | null;
  /** Preview canvas pixels per base pixel. */
  previewScale: number;
}

const DRIFT_PLAYING = 0.3;
/** While playing, the held-frame copy is refreshed at most this often (it costs a draw). */
const HOLD_REFRESH_MS = 400;
const HOLD_MAX_SIDE = 720;

/** Clips starting this soon are pre-seeked so the cut doesn't wait on a seek. */
const PRELOAD_AHEAD = 1.5;
const DRIFT_PAUSED = 0.02;
const START_TOLERANCE = 0.12;

function syncMedia(el: HTMLMediaElement, target: number, playing: boolean, rate: number, frozen: boolean) {
  if (playing && !frozen) {
    if (el.playbackRate !== rate) el.playbackRate = rate;
    if (el.paused) {
      // A pre-seeked element is already in place; seeking it again would stall the start.
      if (Math.abs(el.currentTime - target) > START_TOLERANCE) el.currentTime = target;
      el.play().catch(() => {});
    } else if (Math.abs(el.currentTime - target) > DRIFT_PLAYING) {
      el.currentTime = target;
    }
    return;
  }
  if (!el.paused) el.pause();
  if (!el.seeking && Math.abs(el.currentTime - target) > DRIFT_PAUSED) el.currentTime = target;
}

/**
 * Drives the live preview: owns one media element per clip, keeps them in sync
 * with a wall-clock timeline, and paints every animation frame to the canvas.
 */
export function usePreviewEngine(input: EngineInput) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const latest = useRef(input);
  latest.current = input;
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const clockRef = useRef({ wall: 0, media: 0 });
  const textBoundsRef = useRef<TextBounds[]>([]);
  const frameListeners = useRef(new Set<(t: number) => void>());

  const holderRef = useRef<HTMLDivElement | null>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const overlayVideos = useRef(new Map<string, HTMLVideoElement>());

  // A seeking or still-loading <video> has no frame to draw, which used to flash the
  // background. Each video keeps a copy of the last frame it showed to draw instead,
  // and a clip that has never shown a frame borrows the nearest filmstrip still.
  const held = useRef(new Map<string, { canvas: HTMLCanvasElement; mediaTime: number; at: number }>());
  const stills = useRef(new Map<string, HTMLImageElement>());

  const videoFrame = (key: string, v: HTMLVideoElement | undefined, asset: MediaAsset, sourceTime: number, playing: boolean): CanvasImageSource | null => {
    const hold = held.current.get(key);
    if (v && v.readyState >= 2 && v.videoWidth) {
      const now = performance.now();
      const stale = !hold || (hold.mediaTime !== v.currentTime && (!playing || now - hold.at > HOLD_REFRESH_MS));
      if (stale && !v.seeking) {
        const scale = Math.min(1, HOLD_MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
        const canvas = hold?.canvas ?? document.createElement('canvas');
        const w = Math.max(1, Math.round(v.videoWidth * scale));
        const h = Math.max(1, Math.round(v.videoHeight * scale));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        canvas.getContext('2d')?.drawImage(v, 0, 0, w, h);
        held.current.set(key, { canvas, mediaTime: v.currentTime, at: now });
      }
      if (!v.seeking) return v;
    }
    if (hold) return hold.canvas;
    const src = filmstripFrame(asset, sourceTime);
    if (!src) return null;
    let img = stills.current.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      stills.current.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  };

  useEffect(() => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(holder);
    holderRef.current = holder;
    const vids = videos.current;
    const auds = audios.current;
    const ovs = overlayVideos.current;
    return () => {
      for (const el of [...vids.values(), ...auds.values(), ...ovs.values()]) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      vids.clear();
      auds.clear();
      ovs.clear();
      holder.remove();
    };
  }, []);

  // Create/destroy media elements as clips come and go.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const wantedVideos = new Set<string>();
    for (const lc of input.layout) {
      if (lc.asset.kind === 'video') {
        wantedVideos.add(lc.clip.id);
        if (!videos.current.has(lc.clip.id)) {
          const v = document.createElement('video');
          v.src = lc.asset.url;
          v.preload = 'auto';
          v.playsInline = true;
          v.muted = true;
          v.currentTime = lc.clip.inPoint;
          holder.appendChild(v);
          videos.current.set(lc.clip.id, v);
        }
      } else if (lc.asset.kind === 'image' && !images.current.has(lc.asset.id)) {
        const img = new Image();
        img.src = lc.asset.url;
        images.current.set(lc.asset.id, img);
      }
    }
    for (const [id, el] of videos.current) {
      if (!wantedVideos.has(id)) {
        el.pause();
        el.remove();
        videos.current.delete(id);
        held.current.delete(id);
      }
    }

    const wantedOverlays = new Set<string>();
    for (const o of input.project.overlays) {
      const asset = input.assets.get(o.assetId);
      if (!asset) continue;
      if (asset.kind === 'image') {
        if (!images.current.has(asset.id)) {
          const img = new Image();
          img.src = asset.url;
          images.current.set(asset.id, img);
        }
        continue;
      }
      wantedOverlays.add(o.id);
      if (!overlayVideos.current.has(o.id)) {
        const v = document.createElement('video');
        v.src = asset.url;
        v.preload = 'auto';
        v.playsInline = true;
        v.muted = true;
        v.currentTime = o.inPoint;
        holder.appendChild(v);
        overlayVideos.current.set(o.id, v);
      }
    }
    for (const [id, el] of overlayVideos.current) {
      if (!wantedOverlays.has(id)) {
        el.pause();
        el.remove();
        overlayVideos.current.delete(id);
        held.current.delete(`ov:${id}`);
      }
    }

    const wantedAudios = new Set<string>();
    for (const a of input.project.audios) {
      const asset = input.assets.get(a.assetId);
      if (!asset) continue;
      wantedAudios.add(a.id);
      if (!audios.current.has(a.id)) {
        const el = document.createElement('audio');
        el.src = asset.url;
        el.preload = 'auto';
        holder.appendChild(el);
        audios.current.set(a.id, el);
      }
    }
    for (const [id, el] of audios.current) {
      if (!wantedAudios.has(id)) {
        el.pause();
        el.remove();
        audios.current.delete(id);
      }
    }
  }, [input.layout, input.project.audios, input.project.overlays, input.assets]);

  const currentTime = () => {
    if (!playingRef.current) return timeRef.current;
    return clockRef.current.media + (performance.now() - clockRef.current.wall) / 1000;
  };

  const stopAtRef = useRef<number | null>(null);

  /** Called every animation frame during playback, without re-rendering React. */
  const subscribeFrame = useCallback((fn: (t: number) => void) => {
    frameListeners.current.add(fn);
    return () => {
      frameListeners.current.delete(fn);
    };
  }, []);

  const pause = useCallback(() => {
    stopAtRef.current = null;
    timeRef.current = clamp(currentTime(), 0, latest.current.duration);
    playingRef.current = false;
    setPlaying(false);
    setTime(timeRef.current);
  }, []);

  const play = useCallback(() => {
    stopAtRef.current = null;
    if (latest.current.duration <= 0) return;
    if (timeRef.current >= latest.current.duration - 0.02) timeRef.current = 0;
    clockRef.current = { wall: performance.now(), media: timeRef.current };
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [pause, play]);

  const seek = useCallback((t: number) => {
    const next = clamp(t, 0, latest.current.duration);
    timeRef.current = next;
    clockRef.current = { wall: performance.now(), media: next };
    setTime(next);
  }, []);

  /**
   * Plays a short stretch so a just-applied effect can be seen, then stops.
   * Deferred a moment so a project change made in the same event is rendered first.
   */
  const previewRange = useCallback(
    (from: number, to: number) => {
      window.setTimeout(() => {
        seek(from);
        play();
        stopAtRef.current = to;
      }, 80);
    },
    [seek, play]
  );

  /** A small still of a clip's current frame, without effects, for panel previews. */
  const captureFrame = useCallback((clipId: string, maxSize = 220): string | null => {
    const lc = latest.current.layout.find((l) => l.clip.id === clipId);
    if (!lc) return null;
    const src: HTMLVideoElement | HTMLImageElement | undefined =
      lc.asset.kind === 'image' ? images.current.get(lc.asset.id) : videos.current.get(clipId);
    if (!src) return null;
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
    if (!w || !h || (src instanceof HTMLVideoElement && src.readyState < 2)) return null;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    try {
      canvas.getContext('2d')?.drawImage(src, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.75);
    } catch {
      return null;
    }
  }, []);

  // Keep the playhead in range when the project gets shorter.
  useEffect(() => {
    if (timeRef.current > input.duration) seek(input.duration);
  }, [input.duration, seek]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { canvasRef, project, layout, duration, selectedId, previewScale, assets } = latest.current;
      let t = currentTime();
      const isPlaying = playingRef.current;
      const stopAt = Math.min(duration, stopAtRef.current ?? duration);
      if (isPlaying && t >= stopAt) {
        t = stopAt;
        timeRef.current = stopAt;
        stopAtRef.current = null;
        playingRef.current = false;
        setPlaying(false);
        setTime(stopAt);
      }
      const playNow = playingRef.current;

      // While playing, the clock follows the clip being heard rather than the wall clock.
      // Phones decode slower than real time now and then; seeking the video to catch up
      // would stall it again, so the timeline waits for the video instead.
      let state = getMainFrameState(layout, t);
      if (playNow && state.primary && state.primary.lc.asset.kind === 'video') {
        const lc = state.primary.lc;
        const el = videos.current.get(lc.clip.id);
        const raw = lc.clip.inPoint + (t - lc.start) * lc.clip.speed;
        const frozen = Math.abs(raw - state.primary.sourceTime) > 1e-3;
        if (el && !el.paused && !el.seeking && el.readyState >= 3 && !frozen) {
          const videoT = lc.start + (el.currentTime - lc.clip.inPoint) / lc.clip.speed;
          if (Math.abs(videoT - t) < 1 && videoT >= lc.start && videoT < lc.end) {
            // Never step backwards: if the video is still catching up (a clip that just
            // started), hold the clock where it is until the video passes it.
            const prev = timeRef.current;
            t = Math.max(videoT, Math.min(t, prev));
            clockRef.current = { wall: performance.now(), media: t };
            state = getMainFrameState(layout, t);
          }
        }
      }
      if (playNow) {
        // React state is left alone during playback (re-rendering the editor every frame
        // stutters phones); the playhead and clock follow through these listeners instead.
        timeRef.current = t;
        for (const fn of frameListeners.current) fn(t);
      }

      // --- sync main track video elements
      const visible = new Map<string, FrameRef>();
      if (state.from) visible.set(state.from.lc.clip.id, state.from);
      if (state.to) visible.set(state.to.lc.clip.id, state.to);
      const byId = new Map<string, LaidOutClip>(layout.map((l: LaidOutClip) => [l.clip.id, l]));
      for (const [id, el] of videos.current) {
        const ref = visible.get(id);
        if (!ref) {
          if (!el.paused) el.pause();
          // Park the next clip on the first frame it will show. With a transition it
          // appears half a transition before its cut, so that is where it must wait.
          const lc = byId.get(id);
          const visibleFrom = lc ? lc.start - lc.transitionIn / 2 : 0;
          if (lc && visibleFrom > t && visibleFrom - t <= PRELOAD_AHEAD && !el.seeking) {
            const first = sourceTimeFor(lc, visibleFrom);
            if (Math.abs(el.currentTime - first) > 0.04) el.currentTime = first;
          }
          continue;
        }
        const clip = ref.lc.clip;
        const raw = clip.inPoint + (t - ref.lc.start) * clip.speed;
        const frozen = Math.abs(raw - ref.sourceTime) > 1e-3;
        const isPrimary = state.primary?.lc.clip.id === id;
        el.muted = !isPrimary || clip.muted || !ref.lc.asset.hasAudio;
        el.volume = clamp(clip.volume, 0, 1);
        syncMedia(el, ref.sourceTime, playNow, clip.speed, frozen);
      }

      // --- sync audio track elements
      for (const a of project.audios) {
        const el = audios.current.get(a.id);
        if (!el) continue;
        const active = t >= a.start && t < audioClipEnd(a);
        if (!active) {
          if (!el.paused) el.pause();
          continue;
        }
        el.volume = clamp(audioGainAt(a, t), 0, 1);
        syncMedia(el, a.inPoint + (t - a.start), playNow, 1, false);
      }

      // --- sync overlay videos
      for (const o of project.overlays) {
        const el = overlayVideos.current.get(o.id);
        if (!el) continue;
        if (t < o.start || t >= overlayEnd(o)) {
          if (!el.paused) el.pause();
          continue;
        }
        el.muted = o.muted || !assets.get(o.assetId)?.hasAudio;
        el.volume = clamp(o.volume, 0, 1);
        syncMedia(el, o.inPoint + (t - o.start), playNow, 1, false);
      }

      // --- paint
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const size = ASPECT_SIZES[project.aspect];
      const w = Math.round(size.width * previewScale);
      const h = Math.round(size.height * previewScale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
      textBoundsRef.current = renderFrame(ctx, {
        width: size.width,
        height: size.height,
        project,
        layout,
        time: t,
        selectedId: playNow ? null : selectedId,
        getOverlayFrame: (o) => {
          const asset = assets.get(o.assetId);
          if (asset?.kind === 'image') {
            const img = images.current.get(asset.id);
            return img && img.complete && img.naturalWidth ? img : null;
          }
          if (!asset) return null;
          return videoFrame(`ov:${o.id}`, overlayVideos.current.get(o.id), asset, o.inPoint + (t - o.start), playNow);
        },
        getFrame: (ref) => {
          if (ref.lc.asset.kind === 'image') {
            const img = images.current.get(ref.lc.asset.id);
            return img && img.complete && img.naturalWidth ? img : null;
          }
          return videoFrame(ref.lc.clip.id, videos.current.get(ref.lc.clip.id), ref.lc.asset, ref.sourceTime, playNow);
        },
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { time, playing, play, pause, toggle, seek, previewRange, captureFrame, subscribeFrame, textBoundsRef, getTime: () => timeRef.current };
}

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ASPECT_SIZES } from './constants';
import { renderFrame } from './renderer';
import { audioClipEnd, audioGainAt, clamp, getMainFrameState, overlayEnd } from './timeline';
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

const DRIFT_PLAYING = 0.25;
const DRIFT_PAUSED = 0.02;

function syncMedia(el: HTMLMediaElement, target: number, playing: boolean, rate: number, frozen: boolean) {
  if (playing && !frozen) {
    if (el.playbackRate !== rate) el.playbackRate = rate;
    if (el.paused) {
      el.currentTime = target;
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

  const holderRef = useRef<HTMLDivElement | null>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const overlayVideos = useRef(new Map<string, HTMLVideoElement>());

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

  const pause = useCallback(() => {
    timeRef.current = clamp(currentTime(), 0, latest.current.duration);
    playingRef.current = false;
    setPlaying(false);
    setTime(timeRef.current);
  }, []);

  const play = useCallback(() => {
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

  // Keep the playhead in range when the project gets shorter.
  useEffect(() => {
    if (timeRef.current > input.duration) seek(input.duration);
  }, [input.duration, seek]);

  useEffect(() => {
    let raf = 0;
    let lastUiUpdate = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const { canvasRef, project, layout, duration, selectedId, previewScale, assets } = latest.current;
      let t = currentTime();
      const isPlaying = playingRef.current;
      if (isPlaying && t >= duration) {
        t = duration;
        timeRef.current = duration;
        playingRef.current = false;
        setPlaying(false);
        setTime(duration);
      } else if (isPlaying) {
        timeRef.current = t;
        if (now - lastUiUpdate > 30) {
          lastUiUpdate = now;
          setTime(t);
        }
      }
      const playNow = playingRef.current;

      // --- sync main track video elements
      const state = getMainFrameState(layout, t);
      const visible = new Map<string, FrameRef>();
      if (state.from) visible.set(state.from.lc.clip.id, state.from);
      if (state.to) visible.set(state.to.lc.clip.id, state.to);
      for (const [id, el] of videos.current) {
        const ref = visible.get(id);
        if (!ref) {
          if (!el.paused) el.pause();
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
          const v = overlayVideos.current.get(o.id);
          return v && v.readyState >= 2 ? v : null;
        },
        getFrame: (ref) => {
          if (ref.lc.asset.kind === 'image') {
            const img = images.current.get(ref.lc.asset.id);
            return img && img.complete && img.naturalWidth ? img : null;
          }
          const v = videos.current.get(ref.lc.clip.id);
          return v && v.readyState >= 2 ? v : null;
        },
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { time, playing, play, pause, toggle, seek, textBoundsRef, getTime: () => timeRef.current };
}

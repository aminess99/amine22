import { CaptionSegment, EditorSettings } from '../types';
import { drawCaptionsOnCanvas } from './canvasCaptionRenderer';

export interface ExportQualityOptions {
  resolution?: 'original' | '1080p' | '720p';
  fps?: 30 | 60;
  qualityLevel?: 'ultra' | 'high' | 'balanced';
}

/**
 * Exports video frames with captions into a single video blob.
 * Uses a dedicated offscreen video element to guarantee zero interference
 * with the editor UI video player and ensures full resource cleanup.
 */
export async function exportVideoViaCanvas(
  sourceVideoElement: HTMLVideoElement,
  segments: CaptionSegment[],
  settings: EditorSettings,
  onProgress: (percent: number) => void,
  options?: ExportQualityOptions
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    let offscreenVideo: HTMLVideoElement | null = null;
    let audioCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let canvasStream: MediaStream | null = null;
    let timeoutId: any = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (e) {
          // ignore
        }
      }

      if (canvasStream) {
        try {
          canvasStream.getTracks().forEach(t => t.stop());
        } catch (e) {
          // ignore
        }
      }

      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          audioCtx.close().catch(() => {});
        } catch (e) {
          // ignore
        }
      }

      if (offscreenVideo) {
        try {
          offscreenVideo.pause();
          if (offscreenVideo.parentNode) {
            offscreenVideo.parentNode.removeChild(offscreenVideo);
          }
          offscreenVideo.onended = null;
          offscreenVideo.onerror = null;
          offscreenVideo.onseeked = null;
          offscreenVideo.removeAttribute('src');
          offscreenVideo.load();
        } catch (e) {
          // ignore
        }
        offscreenVideo = null;
      }
    };

    try {
      // 1. Ensure all custom web fonts (Cairo, Tajawal, etc.) are loaded
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (e) {
          console.warn("Fonts ready check ignored:", e);
        }
      }

      // 2. Compute exact canvas dimensions from source video element
      let sourceWidth = sourceVideoElement.videoWidth;
      let sourceHeight = sourceVideoElement.videoHeight;

      if (!sourceWidth || !sourceHeight) {
        sourceWidth = settings.aspectRatio === '16:9' ? 1920 : settings.aspectRatio === '1:1' ? 1080 : 1080;
        sourceHeight = settings.aspectRatio === '16:9' ? 1080 : settings.aspectRatio === '1:1' ? 1080 : 1920;
      }

      const aspect = sourceWidth / sourceHeight;
      let targetWidth = sourceWidth;
      let targetHeight = sourceHeight;

      if (options?.resolution === '720p') {
        if (aspect < 1) {
          targetWidth = 720;
          targetHeight = Math.round(720 / aspect);
        } else {
          targetHeight = 720;
          targetWidth = Math.round(720 * aspect);
        }
      } else if (options?.resolution === '1080p') {
        if (aspect < 1) {
          targetWidth = 1080;
          targetHeight = Math.round(1080 / aspect);
        } else {
          targetHeight = 1080;
          targetWidth = Math.round(1080 * aspect);
        }
      }

      // Ensure dimensions are even numbers (required by H.264 & VP9 encoders)
      targetWidth = Math.round(targetWidth / 2) * 2;
      targetHeight = Math.round(targetHeight / 2) * 2;

      // 3. Create high-res offscreen render canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { 
        alpha: false,
        desynchronized: false 
      });

      if (!ctx) {
        throw new Error('تعذر تهيئة محرك رسم الفيديو Canvas.');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 4. Create an offscreen video element attached to DOM (required by browsers for hardware decoding & callbacks)
      const videoSrc = sourceVideoElement.src || sourceVideoElement.currentSrc;
      if (!videoSrc) {
        throw new Error('رابط مصدر الفيديو غير متوفر.');
      }

      offscreenVideo = document.createElement('video');
      offscreenVideo.crossOrigin = 'anonymous';
      offscreenVideo.muted = true; // Offscreen playback is visual; audio piped through WebAudio
      offscreenVideo.playsInline = true;
      offscreenVideo.preload = 'auto';
      offscreenVideo.style.position = 'fixed';
      offscreenVideo.style.bottom = '0px';
      offscreenVideo.style.right = '0px';
      offscreenVideo.style.width = '160px';
      offscreenVideo.style.height = '90px';
      offscreenVideo.style.opacity = '0.001';
      offscreenVideo.style.pointerEvents = 'none';
      offscreenVideo.style.zIndex = '-9999';
      document.body.appendChild(offscreenVideo);
      offscreenVideo.src = videoSrc;

      // Wait for offscreen video metadata to load
      await new Promise<void>((res, rej) => {
        if (!offscreenVideo) return rej(new Error('فيديو غير مهيأ'));
        if (offscreenVideo.readyState >= 1) {
          res();
          return;
        }
        const onLoaded = () => {
          offscreenVideo?.removeEventListener('loadedmetadata', onLoaded);
          offscreenVideo?.removeEventListener('error', onError);
          res();
        };
        const onError = () => {
          offscreenVideo?.removeEventListener('loadedmetadata', onLoaded);
          offscreenVideo?.removeEventListener('error', onError);
          // Fallback: continue anyway if readyState allows
          res();
        };
        offscreenVideo.addEventListener('loadedmetadata', onLoaded);
        offscreenVideo.addEventListener('error', onError);
      });

      const videoDuration = offscreenVideo.duration || sourceVideoElement.duration || 10;
      if (videoDuration <= 0 || isNaN(videoDuration)) {
        throw new Error('تعذر تحديد مدة الفيديو بدقة.');
      }

      // 5. Setup canvas stream and recorder
      const targetFps = options?.fps || 30;
      canvasStream = canvas.captureStream ? canvas.captureStream(targetFps) : (canvas as any).mozCaptureStream(targetFps);

      // Web Audio API: Route original audio track into canvasStream so local download is never mute!
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass && offscreenVideo) {
          audioCtx = new AudioCtxClass();
          const sourceNode = audioCtx.createMediaElementSource(offscreenVideo);
          const destNode = audioCtx.createMediaStreamDestination();
          sourceNode.connect(destNode);
          // Do not connect to audioCtx.destination to prevent double sound/echo for user
          if (destNode.stream && destNode.stream.getAudioTracks().length > 0) {
            canvasStream.addTrack(destNode.stream.getAudioTracks()[0]);
            offscreenVideo.muted = false; // un-mute so element plays into the WebAudio graph
          }
        }
      } catch (audioErr) {
        console.warn("Direct WebAudio capture note (server remux will handle pristine audio):", audioErr);
        // Fallback: clone track from source element if available
        try {
          if (sourceVideoElement && 'captureStream' in sourceVideoElement) {
            const srcStream = (sourceVideoElement as any).captureStream();
            if (srcStream && srcStream.getAudioTracks().length > 0) {
              canvasStream.addTrack(srcStream.getAudioTracks()[0].clone());
            }
          }
        } catch (e) {}
      }

      // Determine best supported MIME type
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
        mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }

      const qualityLevel = options?.qualityLevel || 'ultra';
      const targetBitrate = qualityLevel === 'ultra' ? 35000000 : qualityLevel === 'high' ? 22000000 : 12000000;

      recorder = new MediaRecorder(canvasStream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        videoBitsPerSecond: targetBitrate,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      let isFinished = false;
      const finishRecording = async () => {
        if (isFinished) return;
        isFinished = true;
        isRecording = false;

        try {
          onProgress(100);

          if (recorder && recorder.state !== 'inactive') {
            try {
              if (typeof recorder.requestData === 'function') {
                recorder.requestData();
              }
            } catch (e) {}

            await new Promise((r) => setTimeout(r, 100));

            recorder.onstop = () => {
              const outputBlob = new Blob(chunks, { type: mimeType });
              cleanup();
              resolve(outputBlob);
            };

            try {
              recorder.stop();
            } catch (e) {
              const outputBlob = new Blob(chunks, { type: mimeType });
              cleanup();
              resolve(outputBlob);
            }
          } else {
            const outputBlob = new Blob(chunks, { type: mimeType });
            cleanup();
            resolve(outputBlob);
          }
        } catch (err) {
          console.error("Error during finishRecording:", err);
          const outputBlob = new Blob(chunks, { type: mimeType });
          cleanup();
          resolve(outputBlob);
        }
      };

      recorder.onerror = (e) => {
        cleanup();
        reject(new Error('حدث خطأ أثناء تسجيل إطارات الفيديو.'));
      };

      // Reset currentTime to 0 and wait for seeked to paint first frame
      offscreenVideo.currentTime = 0;
      await new Promise<void>((seekRes) => {
        if (!offscreenVideo) return seekRes();
        const onSeek = () => {
          offscreenVideo?.removeEventListener('seeked', onSeek);
          seekRes();
        };
        offscreenVideo.addEventListener('seeked', onSeek);
        setTimeout(seekRes, 300);
      });

      // Paint initial zero frame
      ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
      drawCaptionsOnCanvas(ctx, segments, 0, settings, canvas.width, canvas.height);

      let isRecording = true;
      let recorderStarted = false;

      const renderLoop = () => {
        if (!isRecording || isFinished || !offscreenVideo) return;

        // 1. Draw source video frame
        ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);

        // 2. Draw pixel-perfect captions on top
        drawCaptionsOnCanvas(ctx, segments, offscreenVideo.currentTime, settings, canvas.width, canvas.height);

        const currentProg = Math.min(99, Math.round((offscreenVideo.currentTime / videoDuration) * 100));
        onProgress(currentProg);

        if (offscreenVideo.ended || offscreenVideo.currentTime >= videoDuration) {
          isRecording = false;
          finishRecording();
        } else if (!offscreenVideo.paused) {
          let scheduled = false;
          if ('requestVideoFrameCallback' in offscreenVideo) {
            try {
              (offscreenVideo as any).requestVideoFrameCallback(renderLoop);
              scheduled = true;
            } catch (e) {}
          }
          if (!scheduled) {
            requestAnimationFrame(renderLoop);
          }
        }
      };

      offscreenVideo.onended = () => {
        if (isRecording && !isFinished) {
          isRecording = false;
          finishRecording();
        }
      };

      // Start video playback and recorder concurrently on the exact first frame
      const startCapture = () => {
        if (recorderStarted) return;
        recorderStarted = true;
        try {
          recorder.start(100);
        } catch (e) {
          console.warn("Recorder start notice:", e);
        }
        renderLoop();
      };

      offscreenVideo.addEventListener('play', startCapture, { once: true });
      offscreenVideo.addEventListener('timeupdate', startCapture, { once: true });

      try {
        await offscreenVideo.play();
        startCapture();
      } catch (playErr) {
        console.warn("Offscreen video play notice:", playErr);
        startCapture();
      }

      // Maximum safety timeout (video length + 10s) to prevent any hang
      timeoutId = setTimeout(() => {
        if (isRecording && !isFinished) {
          console.warn("Safety timeout reached during export, concluding capture.");
          isRecording = false;
          finishRecording();
        }
      }, (videoDuration + 10) * 1000);

    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}


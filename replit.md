# AI Video Captioner

## Run

- Runtime: Node.js 22
- Development command: `npm run dev`
- The Express server listens on `0.0.0.0:5000` and serves the Vite app.
- Video exports use WebCodecs with the original video's audio remuxed on the server. MediaRecorder remains only as a compatibility fallback if WebCodecs is unavailable.

## AI configuration

Transcription uses the local `faster-whisper` Python worker with the `small` model and Arabic word timestamps. The model is downloaded and cached on its first use. Set `FASTER_WHISPER_MODEL=base` when lower resource use is more important than Arabic accuracy. OpenRouter remains an optional fallback when the local worker cannot run.
## Video editor

The "محرر الفيديو" page (`src/components/editor/`, engine in `src/editor/`) is a browser-only multi-track editor: a sequential main track for video and image clips (trim, split, reorder, speed, filters, color adjustments, transitions), a text track with animations, and a music track with fades. The preview and the exporter share one canvas renderer (`src/editor/renderer.ts`). Export decodes frames with Mediabunny, mixes audio with an `OfflineAudioContext`, and encodes MP4 (H.264/AAC) through WebCodecs, falling back to VP9/Opus when H.264 is unavailable.

Phase 3 additions: autosave to IndexedDB (`src/editor/persistence.ts`), a picture-in-picture overlay track, emoji stickers (text clips), two-keyframe clip motion, silence removal (`src/editor/silence.ts`), pitch-preserving speed changes in export (WSOLA, `src/editor/timeStretch.ts`), one-click project templates (`src/editor/templates.ts`), and auto captions that reuse `/api/transcribe` (`src/editor/autoCaptions.ts`).

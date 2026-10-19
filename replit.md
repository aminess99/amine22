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

## Deploy on Render

`render.yaml` defines a Node web service (`npm ci && npm run build`, then `npm start`, health check `/api/health`). Set `OPENROUTER_API_KEY` in the Render dashboard. When that key is present, transcription uses OpenRouter first and the local faster-whisper model only as a fallback; set `TRANSCRIBE_ENGINE=whisper` to keep the local model first on hosts that can run it.

Editing commands (the editor's "أوامر" panel) post the request and a summary of the project to `/api/command`, which asks `COMMAND_MODEL` (default `google/gemini-2.5-flash`) through OpenRouter for a list of editor actions. The prompt and action list live in `src/editor/commandSpec.ts`; the client applies them in `src/editor/commands.ts` as one undo step.

Text to speech (the audio panel's "تحويل نص إلى صوت", or the `tts` command) posts to `/api/tts`, which calls OpenRouter's `/api/v1/audio/speech` with `TTS_MODEL` (default `google/gemini-3.8-flash-lite-tts`). Gemini TTS only returns raw 24 kHz 16-bit mono PCM, so the server adds a WAV header before sending it to the browser.

Sound effects: the audio panel's "مؤثرات صوتية" has 25 built-in effects synthesised with Web Audio (`src/editor/sfx.ts`, no files or licences) and a Freesound search. `/api/sfx/search` and `/api/sfx/file/:id` call the Freesound API with `FREESOUND_API_KEY`, return CC0 sounds only (the file route re-checks the licence), and serve the MP3 preview. Arabic searches are translated to English keywords with `COMMAND_MODEL`.

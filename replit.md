# AI Video Captioner

## Run

- Runtime: Node.js 22
- Development command: `npm run dev`
- The Express server listens on `0.0.0.0:5000` and serves the Vite app.
- Video exports use WebCodecs with the original video's audio remuxed on the server. MediaRecorder remains only as a compatibility fallback if WebCodecs is unavailable.

## AI configuration

Transcription uses the local `faster-whisper` Python worker with the `small` model and Arabic word timestamps. The model is downloaded and cached on its first use. Set `FASTER_WHISPER_MODEL=base` when lower resource use is more important than Arabic accuracy. OpenRouter remains an optional fallback when the local worker cannot run.
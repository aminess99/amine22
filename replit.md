# AI Video Captioner

## Run

- Runtime: Node.js 22
- Development command: `npm run dev`
- The Express server listens on `0.0.0.0:5000` and serves the Vite app.
- Video exports use a deterministic Remotion React composition with the original video's audio. The previous real-time canvas recorder remains only as a compatibility fallback if Chromium cannot start.

## AI configuration

Transcription requires this Replit Secret:

- `OPENROUTER_API_KEY`

The default audio-capable model is `google/gemini-2.5-flash`. Set the optional `OPENROUTER_MODEL` environment variable to choose another OpenRouter model that supports audio input. The interface can run without the secret, but transcription requests will return a configuration error.
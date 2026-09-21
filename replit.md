# AI Video Captioner

## Run

- Runtime: Node.js 22
- Development command: `npm run dev`
- The Express server listens on `0.0.0.0:5000` and serves the Vite app.

## Optional AI configuration

Transcription requires at least one Replit Secret:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

The interface can run without these secrets, but AI transcription requests will return a configuration error.
---
name: Local Arabic transcription
description: The caption pipeline uses a local faster-whisper worker for Arabic word timestamps, with cloud fallback only when local inference fails.
---

Use faster-whisper with the small model and CPU int8 inference as the default transcription engine. Keep word timestamps uncalibrated when they come from the local engine; only apply the legacy speech-bound calibration to the cloud fallback. The base model remains an explicit speed/resource fallback.

**Why:** The local engine provides stable, sequential Arabic word boundaries without the collapsed final-word timestamps seen in the cloud response.

**How to apply:** Preserve the existing audio extraction and caption chunking, validate the returned word timestamps, and keep the cloud path as an explicit fallback so a model/runtime failure is reported rather than silently treated as no speech.
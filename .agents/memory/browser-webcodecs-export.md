---
name: Browser WebCodecs export
description: Export architecture for deterministic browser-side caption rendering.
---

Use WebCodecs-backed encoding for rendered video frames and keep the source audio untouched until server-side remux. The video-only intermediate must preserve its real media timestamps and retain its actual container extension when uploaded.

**Why:** MediaRecorder captures wall-clock timing and can introduce offsets or drift; re-encoding audio in the browser adds another independent clock. WebCodecs gives explicit frame timestamps while server remux preserves the original audio timeline.

**How to apply:** Treat WebCodecs as the primary export path, keep a clearly isolated MediaRecorder fallback for unsupported browsers, and verify the final MP4 has both streams with matching duration.
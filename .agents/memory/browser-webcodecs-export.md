---
name: Browser WebCodecs export
description: Export architecture for deterministic browser-side caption rendering.
---

Use WebCodecs-backed encoding for rendered video frames and keep the source audio untouched until server-side remux. The video-only intermediate must preserve its real media timestamps and retain its actual container extension when uploaded. Always await muxer finalization before reading the output buffer, and handle the source video's `ended` event because a final frame callback is not guaranteed.

**Why:** MediaRecorder captures wall-clock timing and can introduce offsets or drift; re-encoding audio in the browser adds another independent clock. WebCodecs gives explicit frame timestamps while server remux preserves the original audio timeline. Reading a buffer before finalization or waiting only for a final frame callback can make a valid export appear to stop.

**How to apply:** Treat WebCodecs as the primary export path, keep a clearly isolated MediaRecorder fallback for unsupported browsers, and verify the final MP4 has both streams with matching duration. When the user confirms a constant caption delay, apply the small sync correction to both preview and export through the shared settings offset rather than changing individual word timestamps.
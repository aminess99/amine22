---
name: Caption timing boundaries
description: Durable timing rules for preview and export caption synchronization.
---

Use the video's presented frame time (`mediaTime` when available) as the preview clock, and treat caption segment boundaries as exact. Do not add trailing grace windows or early-start offsets to compensate for gaps; those windows make every short caption chunk visibly late.

**Why:** A previous preview implementation kept the previous segment for hundreds of milliseconds after its end and animated the next segment in, which looked like cumulative drift even though the media clock itself was advancing correctly.

**How to apply:** Keep preview and canvas/export timing on the same exact segment/word boundary rules. If transcript timestamps stretch over the source audio, calibrate them against detected speech bounds rather than adding a fixed UI offset.
---
name: Shared caption renderer
description: The editor preview and Remotion export must render captions through the same React component and load the selected local font before frame rendering.
---

The preview and export must share one caption component and one settings contract. A separate Canvas renderer can produce visually different fonts, word grouping, sizing, and animation even when timestamps are identical.

**Why:** The real-time export path stayed synchronized but did not consistently match the selected font and word presentation because it used a separate Canvas implementation.

**How to apply:** When adding a caption template, font, or word pacing option, update the shared React caption component first and verify it through both the editor preview and Remotion export.
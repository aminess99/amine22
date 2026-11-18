#!/usr/bin/env python3
"""Word-level transcription with faster-whisper.

Usage:
  python3 transcribe.py in.(wav|mp3|mp4) out.json [--lang ar] [--model small] [--prompt "..."]

out.json: {"language", "duration", "words": [{"w","s","e"}], "segments": [{"text","s","e"}]}
--prompt helps with product names / dialect spelling (e.g. "منتج, الدفع عند الاستلام").
"""
import argparse, json, subprocess
import numpy as np
from faster_whisper import WhisperModel

p = argparse.ArgumentParser()
p.add_argument("inp"); p.add_argument("out")
p.add_argument("--lang", default=None)
p.add_argument("--model", default="small")
p.add_argument("--prompt", default=None)
p.add_argument("--no-vad", action="store_true", help="keep everything (VAD can drop a fast first sentence)")
a = p.parse_args()

# Decode with ffmpeg (avoids PyAV version issues): 16 kHz mono float32.
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.inp, "-vn", "-ac", "1", "-ar", "16000",
                      "-f", "f32le", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(raw, np.float32)

m = WhisperModel(a.model, compute_type="int8")
segs, info = m.transcribe(audio, language=a.lang, word_timestamps=True, vad_filter=not a.no_vad,
                          initial_prompt=a.prompt)
words, segments = [], []
for s in segs:
    segments.append({"text": s.text.strip(), "s": round(s.start, 3), "e": round(s.end, 3)})
    words += [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for w in s.words]
json.dump({"language": info.language, "duration": round(len(audio) / 16000, 3),
           "words": words, "segments": segments}, open(a.out, "w"), ensure_ascii=False, indent=1)
for s in segments:
    print(f"[{s['s']:6.2f}-{s['e']:6.2f}] {s['text']}")

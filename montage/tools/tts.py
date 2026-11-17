#!/usr/bin/env python3
"""Generate a voiceover with Gemini TTS through OpenRouter.

Usage:
  python3 tts.py "النص" out.wav [--voice Kore] [--style "بحماس، بلهجة جزائرية"] [--model ...]
  python3 tts.py @script.txt out.wav ...      (read the text from a file)

The OpenRouter key is injected by the session's network proxy; OPENROUTER_API_KEY
is only used when running elsewhere.
"""
import argparse, json, os, struct, sys, urllib.request

p = argparse.ArgumentParser()
p.add_argument("text")
p.add_argument("out")
p.add_argument("--voice", default="Kore")
p.add_argument("--style", default="")
p.add_argument("--model", default=os.environ.get("TTS_MODEL", "google/gemini-3.8-flash-lite-tts"))
a = p.parse_args()

text = open(a.text[1:], encoding="utf-8").read().strip() if a.text.startswith("@") else a.text
body = {"model": a.model, "input": text, "voice": a.voice, "response_format": "pcm"}
if a.style:
    body["instructions"] = a.style
req = urllib.request.Request(
    "https://openrouter.ai/api/v1/audio/speech",
    data=json.dumps(body).encode(),
    headers={
        "Authorization": "Bearer " + os.environ.get("OPENROUTER_API_KEY", "proxy-injected"),
        "Content-Type": "application/json",
    },
)
try:
    data = urllib.request.urlopen(req, timeout=180).read()
except urllib.error.HTTPError as e:
    sys.exit(f"TTS failed: {e.code} {e.read()[:500].decode(errors='replace')}")

if data[:4] != b"RIFF":  # raw 24 kHz 16-bit mono PCM -> add a WAV header
    sr = 24000
    data = (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)
open(a.out, "wb").write(data)
print(f"wrote {a.out} ({len(data)} bytes)")

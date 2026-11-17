#!/usr/bin/env python3
"""Tighten a voiceover: shorten every pause to a natural gap, trim the start/end.

Usage:
  python3 remove_silence.py in.(wav|mp3|m4a|mp4) out.wav [--gap 0.18] [--min 0.30] [--db -35]

  --gap  length a pause is shortened to (seconds); 0.12-0.25 sounds natural for ads
  --min  only pauses longer than this are touched
  --db   anything quieter than this counts as silence (raise to -30 for noisy audio)
Writes out.wav plus out.cuts.json (the kept spans), so captions/edits can follow the cuts.
"""
import argparse, json, re, subprocess

p = argparse.ArgumentParser()
p.add_argument("inp"); p.add_argument("out")
p.add_argument("--gap", type=float, default=0.18)
p.add_argument("--min", type=float, default=0.30)
p.add_argument("--db", type=float, default=-35)
a = p.parse_args()

dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                     "-of", "csv=p=0", a.inp]).decode())
log = subprocess.run(["ffmpeg", "-nostats", "-i", a.inp, "-vn", "-af",
                      f"silencedetect=noise={a.db}dB:d={min(a.min, 0.1)}", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
if len(ends) < len(starts):
    ends.append(dur)

keep, cur = [], 0.0
pad = a.gap / 2
for s, e in zip(starts, ends):
    leading, trailing = s <= 0.05, e >= dur - 0.05
    if leading:                       # trim the start, keep a tiny breath
        cur = max(0.0, e - 0.05); continue
    if trailing:                      # trim the end
        keep.append((cur, min(dur, s + 0.08))); cur = None; break
    if e - s < a.min:
        continue
    keep.append((cur, s + pad)); cur = e - pad
if cur is not None:
    keep.append((cur, dur))
keep = [(round(s, 3), round(e, 3)) for s, e in keep if e - s > 0.02]

parts = "".join(f"[0:a]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,"
                f"afade=t=out:st={max(0, e - s - 0.01):.3f}:d=0.01[a{i}];"
                for i, (s, e) in enumerate(keep))
fc = parts + "".join(f"[a{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1[out]"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.inp, "-filter_complex", fc,
                "-map", "[out]", "-ar", "48000", a.out], check=True)
new = sum(e - s for s, e in keep)
json.dump({"source": a.inp, "keep": keep}, open(a.out.rsplit(".", 1)[0] + ".cuts.json", "w"))
print(f"{dur:.2f}s -> {new:.2f}s  ({len(keep)} spans, removed {dur - new:.2f}s)")

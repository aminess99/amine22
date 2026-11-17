#!/usr/bin/env python3
"""Mix a voiceover over background music with sidechain ducking, normalised to -14 LUFS.

Usage:
  python3 mix.py voice.wav music.mp3 out.wav [--start 61.4] [--tail 2.5] [--bed -20]

  --start  where to start inside the music (see music/LIBRARY.md)
  --tail   seconds of music after the voice ends (the CTA screen); music rises there
  --bed    music level under the voice, in dB relative to the voice
"""
import argparse, subprocess

p = argparse.ArgumentParser()
p.add_argument("voice"); p.add_argument("music"); p.add_argument("out")
p.add_argument("--start", type=float, default=0.0)
p.add_argument("--tail", type=float, default=2.5)
p.add_argument("--bed", type=float, default=-20)
a = p.parse_args()

vd = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "csv=p=0", a.voice]).decode())
total = vd + a.tail
fade = min(1.0, a.tail)
music_gain = a.bed + 8  # ducking takes ~8 dB more off while the voice speaks
fc = (
    f"[0:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,"
    f"apad=whole_dur={total},asplit=2[v][sc];"
    f"[1:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16,"
    f"atrim=0:{total},asetpts=PTS-STARTPTS,volume={music_gain}dB,"
    f"volume=enable='gte(t,{vd + 0.15:.2f})':volume=7dB,"  # music rises on the CTA
    f"afade=t=in:d=0.3,afade=t=out:st={total - fade:.2f}:d={fade}[m];"
    f"[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[md];"
    f"[v][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=11[out]"
)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.voice, "-ss", str(a.start), "-i", a.music,
                "-filter_complex", fc, "-map", "[out]", "-ar", "48000", a.out], check=True)
print(f"wrote {a.out} ({total:.2f}s)")

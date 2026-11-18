#!/usr/bin/env python3
"""Export a montage project (projects/<name>/build.py) to the Remotion project in montage/remotion.

Usage:  python3 export_remotion.py ../projects/p03_neck_massager_c [--id neck-massager-c]

Writes montage/remotion/public/projects/<id>/timeline.json and copies the media it uses
(source clips, voice, music, sound effects, product still) next to it. All times are seconds.
"""
import argparse, importlib.util, json, os, shutil, subprocess, sys

p = argparse.ArgumentParser()
p.add_argument("project")
p.add_argument("--id", default=None)
a = p.parse_args()

proj = os.path.abspath(a.project)
spec = importlib.util.spec_from_file_location("build", os.path.join(proj, "build.py"))
B = importlib.util.module_from_spec(spec); sys.argv = ["build.py"]; spec.loader.exec_module(B)

ROOT = B.ROOT
pid = a.id or os.path.basename(proj).split("_", 1)[1].replace("_", "-")
OUTD = os.path.join(ROOT, "montage/remotion/public/projects", pid)
MED = os.path.join(OUTD, "media"); os.makedirs(MED, exist_ok=True)
rel = lambda name: f"projects/{pid}/media/{name}"
r3 = lambda x: round(float(x), 3)

def copy(src, name):
    dst = os.path.join(MED, name)
    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
        shutil.copy(src, dst)
    return rel(name)

def loud(src, name, lufs=-16):
    """Loudness-normalised WAV copy, so volumes in the timeline mean the same thing for every file."""
    dst = os.path.join(MED, name)
    codec = ["-c:a", "libmp3lame", "-b:a", "192k"] if name.endswith(".mp3") else []
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"loudnorm=I={lufs}:TP=-1.5",
                    "-ar", "48000", "-ac", "2"] + codec + [dst], check=True)
    return rel(name)

def speed_for(src, sin, d, maxlen):
    avail = B.dur(B.SRC[src]) - sin - 0.05
    want = min(avail, maxlen or avail)
    return r3(min(1.5, want / d) if maxlen else min(1.0, want / d))

media = {k: copy(v, f"{k}.mp4") for k, v in B.SRC.items()}

# ---- shots
shots = []
for x in B.SHOTS:
    kind, s, e = x[0], x[1], x[2]
    d = (round(e * B.FPS) - round(s * B.FPS)) / B.FPS
    if kind == "one":
        src, sin, z = x[3], x[4], x[5]
        if z[0] == "kb":
            zoom = {"kind": "linear", "from": z[1], "to": z[2], "fx": 0.5, "fy": 0.5}
        elif z[0] == "push":
            zoom = {"kind": "linear", "from": z[1], "to": z[2], "fx": z[3], "fy": z[4]}
        else:  # dolly-in from wide, eased over ~1 s
            zoom = {"kind": "dolly", "from": 1.0, "to": z[1], "fx": z[2], "fy": z[3], "seconds": r3(min(1.1, d * 0.75))}
        shots.append({"type": "one", "from": r3(s), "to": r3(e), "src": media[src], "srcIn": sin,
                      "speed": speed_for(src, sin, d, x[6] if len(x) > 6 else None), "zoom": zoom})
    elif kind == "split":
        panels = []
        for src, sin, fy, ml in x[3:5]:
            # same framing as the ffmpeg build: width fills, crop around fy of the height
            off = min(max(fy * B.H - B.H / 4, 0), B.H / 2)
            panels.append({"src": media[src], "srcIn": sin, "speed": speed_for(src, sin, d, ml),
                           "posY": r3(off / (B.H / 2))})
        shots.append({"type": "split", "from": r3(s), "to": r3(e), "top": panels[0], "bottom": panels[1]})

# ---- captions (karaoke chunks; text and timing exactly as in the ffmpeg build)
caps = []
cut_edges = [r3(x[1]) for x in B.SHOTS]
for ch in B.chunks(B.END_IDX):
    end = B.words[ch[-1] + 1]["s"] if ch[-1] + 1 < len(B.words) else B.words[ch[-1]]["e"]
    y = 960 if any(a0 - 0.01 <= B.words[ch[0]]["s"] < b0 for a0, b0 in B.SPLIT_TIMES) else 1215
    ws = []
    for n, i in enumerate(ch):
        t = B.SHOW[i]
        if i == ch[-1] and t[-1] in "،.":
            t = t.strip("،.")
        ws.append({"text": t, "from": r3(B.words[i]["s"]),
                   "to": r3(B.words[i + 1]["s"] if n + 1 < len(ch) else end)})
    caps.append({"from": ws[0]["from"], "to": ws[-1]["to"], "y": y, "words": ws})

# ---- audio
label, mfile, mstart = B.MUSICS[0]
voice = loud(B.VOICE, "voice.wav")
music = loud(os.path.join(ROOT, "montage/music", mfile), f"music_{label}.mp3")
speech = []
for w in B.words[:B.END_IDX + 10]:
    if speech and w["s"] - speech[-1][1] < 0.35:
        speech[-1][1] = r3(w["e"])
    else:
        speech.append([r3(w["s"]), r3(w["e"])])
sfx = []
for path, at, gain in B.sfx():
    name = os.path.basename(path)
    sfx.append({"src": copy(path, f"sfx_{name}"), "at": r3(at), "volume": r3(gain)})

# ---- end card: product still from the clean c1 shot
still = os.path.join(MED, "product.jpg")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1.30", "-i", B.SRC["c1"], "-frames:v", "1", "-q:v", "3", still], check=True)

tl = {
    "id": pid, "fps": B.FPS, "width": B.W, "height": B.H, "duration": r3(B.TOTAL),
    "style": {"font": "Cairo", "captionSize": 84, "stroke": 8, "activeColor": B.YELLOW, "textColor": "#FFFFFF",
              "saturation": 1.12, "contrast": 1.04},
    "shots": shots,
    "flash": {"at": r3(B.words[B.REVEAL]["s"]), "seconds": 0.07},
    "captions": caps,
    "audio": {
        "voice": {"src": voice, "volume": 1.0},
        "music": {"src": music, "startAt": mstart, "underVoice": 0.32, "betweenPhrases": 0.55,
                  "endCard": 0.85, "fadeOut": 1.0},
        "speech": speech,
        "sfx": sfx,
    },
    "endCard": {
        "from": r3(B.END_CARD),
        "title": [{"text": "مساج الرقبة", "color": "#FFFFFF"}, {"text": "والكتف", "color": B.YELLOW}],
        "subtitle": "بأصابع تدليك وحرارة",
        "image": rel("product.jpg"),
        "button": "اطلبه الحين",
        "line": [{"text": "التوصيل", "color": "#FFFFFF"}, {"text": "مجاني", "color": B.YELLOW},
                 {"text": "•", "color": "#FFFFFF"}, {"text": "الدفع عند", "color": "#FFFFFF"},
                 {"text": "الاستلام", "color": B.YELLOW}],
        "badge": "الكمية محدودة",
        "colors": {"top": "#082E22", "bottom": "#165E40", "button": B.YELLOW, "badge": "#E11D48"},
    },
}
json.dump(tl, open(os.path.join(OUTD, "timeline.json"), "w"), ensure_ascii=False, indent=1)
# Root.tsx holds every ad's timeline inline, so Remotion Studio can save edits made in its props panel.
import glob
RR = os.path.join(ROOT, "montage/remotion")
comps = []
for f in sorted(glob.glob(os.path.join(RR, "public/projects/*/timeline.json"))):
    t = json.load(open(f))
    body = json.dumps(t, ensure_ascii=False, indent="\t")
    body = "\n".join("\t\t\t" + ln if i else ln for i, ln in enumerate(body.splitlines()))
    comps.append(f"""\t\t<Composition
\t\t\tid="{t['id']}"
\t\t\tcomponent={{Ad}}
\t\t\tschema={{timelineSchema}}
\t\t\tfps={{{t['fps']}}}
\t\t\twidth={{{t['width']}}}
\t\t\theight={{{t['height']}}}
\t\t\tdurationInFrames={{{round(t['duration'] * t['fps'])}}}
\t\t\tcalculateMetadata={{({{props}}: {{props: Timeline}}) => ({{durationInFrames: Math.round(props.duration * props.fps)}})}}
\t\t\tdefaultProps={{{body}}}
\t\t/>""")
root = """// Generated by montage/tools/export_remotion.py. Each ad's timeline is inline so that
// Remotion Studio can save what you change in the props panel (Save button) straight into this file.
import React from 'react';
import {Composition, continueRender, delayRender, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {Ad} from './Ad';
import {timelineSchema, type Timeline} from './schema';

const fontHandle = delayRender('Loading Cairo');
loadFont({family: 'Cairo', url: staticFile('fonts/Cairo.ttf'), weight: '700'})
\t.then(() => continueRender(fontHandle))
\t.catch((err) => {
\t\tconsole.error(err);
\t\tcontinueRender(fontHandle);
\t});

export const RemotionRoot: React.FC = () => (
\t<>
""" + "\n".join(comps) + """
\t</>
);
"""
open(os.path.join(RR, "src/Root.tsx"), "w").write(root)
print("wrote", os.path.join(OUTD, "timeline.json"), f"({len(shots)} shots, {len(caps)} captions, {len(sfx)} sfx)")

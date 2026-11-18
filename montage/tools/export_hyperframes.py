#!/usr/bin/env python3
"""Export an ad to a HyperFrames project (editable in HyperFrames Studio's timeline).

Usage:  python3 export_hyperframes.py neck-massager-c

Reads the ad's Remotion timeline (montage/remotion/public/projects/<id>/timeline.json, made by
export_remotion.py) and writes montage/hyperframes/<id>/ with index.html + assets/.
Every shot, caption group, sound effect, the voice and the music is its own clip on the timeline.
"""
import html, json, os, shutil, subprocess, sys

pid = sys.argv[1]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
RM = os.path.join(ROOT, "montage/remotion/public")
tl = json.load(open(os.path.join(RM, "projects", pid, "timeline.json")))
OUT = os.path.join(ROOT, "montage/hyperframes", pid)
A = os.path.join(OUT, "assets"); os.makedirs(os.path.join(A, "fonts"), exist_ok=True)
os.makedirs(os.path.join(A, "vendor"), exist_ok=True)
W, H, DUR = tl["width"], tl["height"], tl["duration"]
r3 = lambda x: f"{x:.3f}".rstrip("0").rstrip(".")
esc = html.escape

def is_hdr_or_hevc(path):
    info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                           "stream=codec_name,color_transfer", "-of", "csv=p=0", path],
                          capture_output=True, text=True).stdout
    return any(k in info for k in ("hevc", "arib-std-b67", "smpte2084"))

def asset(rel_src):
    """Copy a media file into assets/ (HDR or HEVC video is tone-mapped to SDR H.264) and return its path."""
    name = os.path.basename(rel_src)
    src, dst = os.path.join(RM, rel_src), os.path.join(A, name)
    if os.path.exists(dst):
        return f"assets/{name}"
    if name.endswith(".mp4") and is_hdr_or_hevc(src):
        vf = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
              "zscale=t=bt709:m=bt709:r=tv,format=yuv420p")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "18",
                        "-preset", "medium", "-c:a", "aac", "-movflags", "+faststart", dst], check=True)
    else:
        shutil.copy(src, dst)
    return f"assets/{name}"

shutil.copy(os.path.join(RM, "fonts/Cairo.ttf"), os.path.join(A, "fonts/Cairo.ttf"))
GSAP = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("GSAP_JS")
if GSAP:
    shutil.copy(GSAP, os.path.join(A, "vendor/gsap.min.js"))

# ---- music with the ducking baked in (voice as the sidechain), so the timeline has one music clip
voice_src = os.path.join(RM, tl["audio"]["voice"]["src"])
music_src = os.path.join(RM, tl["audio"]["music"]["src"])
vd = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "csv=p=0", voice_src]).decode())
m = tl["audio"]["music"]
fc = (f"[0:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={DUR}[sc];"
      f"[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{DUR},asetpts=PTS-STARTPTS,volume=1dB,"
      f"volume=enable='gte(t,{tl['endCard']['from'] + 0.15:.2f})':volume=7dB,"
      f"afade=t=in:d=0.3,afade=t=out:st={DUR - m['fadeOut']:.2f}:d={m['fadeOut']}[m];"
      f"[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[md]")
music_out = os.path.join(A, "music_ducked.mp3")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", voice_src, "-ss", str(m["startAt"]), "-i", music_src,
                "-filter_complex", fc, "-map", "[md]", "-c:a", "libmp3lame", "-b:a", "192k", music_out], check=True)

# ---- clips
body, script, z = [], [], 1
for i, s in enumerate(tl["shots"]):
    n = i + 1
    d = s["to"] - s["from"]
    timing = f'data-start="{r3(s["from"])}" data-duration="{r3(d)}"'
    if s["type"] == "one":
        zm = s["zoom"]
        body.append(f'''      <div id="shot{n}-zoom" class="zoom" style="z-index:{z}">
        <video id="shot{n}" class="clip shot" {timing} data-track-index="0"
          data-media-start="{r3(s["srcIn"])}" data-playback-rate="{r3(s["speed"])}"
          src="{asset(s["src"])}" muted playsinline></video>
      </div>''')
        t_end = zm.get("seconds", d) if zm["kind"] == "dolly" else d
        ease = "power3.out" if zm["kind"] == "dolly" else "none"
        # same framing as the ffmpeg/Remotion builds: a crop window centred on the focus point, clamped to the picture
        def off(zv):
            x = min(max(zm["fx"] * W * zv - W / 2, 0), W * zv - W)
            y = min(max(zm["fy"] * H * zv - H / 2, 0), H * zv - H)
            return round(-x, 1), round(-y, 1)
        (x0, y0), (x1, y1) = off(zm["from"]), off(zm["to"])
        script.append(f'      gsap.set("#shot{n}-zoom", {{ transformOrigin: "0 0" }});\n'
                      f'      tl.fromTo("#shot{n}-zoom", {{ scale: {zm["from"]}, x: {x0}, y: {y0} }}, '
                      f'{{ scale: {zm["to"]}, x: {x1}, y: {y1}, duration: {r3(t_end)}, ease: "{ease}" }}, {r3(s["from"])});')
    else:  # split screen: two half-height panels and a white divider
        for k, (key, top) in enumerate((("top", 0), ("bottom", H // 2))):
            p = s[key]
            body.append(f'''      <div id="shot{n}-{key}-panel" class="panel" style="top:{top}px;z-index:{z}">
        <video id="shot{n}-{key}" class="clip" {timing} data-track-index="{k}"
          data-media-start="{r3(p["srcIn"])}" data-playback-rate="{r3(p["speed"])}"
          src="{asset(p["src"])}" muted playsinline style="object-position:50% {p["posY"] * 100:.0f}%"></video>
      </div>''')
        body.append(f'      <div id="shot{n}-divider" class="clip divider" {timing} data-track-index="2" style="z-index:{z + 1}"></div>')
    z += 2

f = tl["flash"]
body.append(f'      <div id="flash" class="clip flash" data-start="{r3(f["at"])}" data-duration="{r3(f["seconds"])}" data-track-index="2" style="z-index:{z}"></div>')
z += 1

# ---- end card: its own scene (compositions/endcard.html), one clip on the timeline
ec = tl["endCard"]; ecd = DUR - ec["from"]
runs = lambda rs: "".join(f'<span style="color:{r["color"]}">{esc(r["text"])}</span>' for r in rs)
body.append(f'''      <div id="endcard" data-composition-id="endcard" data-composition-src="compositions/endcard.html"
        data-start="{r3(ec["from"])}" data-duration="{r3(ecd)}" data-track-index="1" data-track-kind="graphics"
        data-width="{W}" data-height="{H}" style="z-index:{z}"></div>''')
pulses = max(1, int(ecd * 1.6 * 2))  # finite yoyo instead of repeat:-1 (deterministic)
ENDCARD = f'''<template>
  <style>
    @font-face {{ font-family: "Cairo"; src: url("assets/fonts/Cairo.ttf") format("truetype"); font-weight: 700; }}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "Cairo", sans-serif; font-weight: 700;
      background: linear-gradient(180deg, {ec["colors"]["top"]}, {ec["colors"]["bottom"]}); }}
    #ec-glow {{ position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(80, 190, 130, 0.35), transparent 60%); }}
    #ec-title, #ec-line {{ position: absolute; left: 0; width: 100%; display: flex; justify-content: center; direction: rtl; }}
    #ec-title {{ top: 120px; font-size: 86px; gap: 24px; }}
    #ec-line {{ top: 1640px; font-size: 46px; gap: 13px; }}
    #ec-subtitle {{ position: absolute; top: 250px; left: 0; width: 100%; text-align: center; color: #fff; font-size: 50px; }}
    #ec-card {{ position: absolute; left: 152px; top: 362px; width: 776px; height: 1016px; border-radius: 46px; background: #fff; padding: 8px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); }}
    #ec-card-inner {{ width: 100%; height: 100%; border-radius: 40px; overflow: hidden; }}
    #ec-image {{ width: 100%; height: 100%; object-fit: cover; }}
    #ec-button-row, #ec-badge-row {{ position: absolute; left: 0; width: 100%; display: flex; justify-content: center; }}
    #ec-button-row {{ top: 1440px; }}
    #ec-button {{ background: {ec["colors"]["button"]}; color: #111; font-size: 76px; padding: 14px 70px; border-radius: 999px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4); }}
    #ec-badge-row {{ top: 1745px; }}
    #ec-badge {{ background: {ec["colors"]["badge"]}; color: #fff; font-size: 40px; padding: 6px 40px; border-radius: 999px; }}
    #ec-flash {{ position: absolute; inset: 0; background: #fff; opacity: 0; }}
  </style>
  <div id="root" data-composition-id="endcard" data-width="{W}" data-height="{H}">
    <div id="ec-glow"></div>
    <div id="ec-title">{runs(ec["title"])}</div>
    <div id="ec-subtitle">{esc(ec["subtitle"])}</div>
    <div id="ec-card"><div id="ec-card-inner"><img id="ec-image" src="{asset(ec["image"])}" alt="" /></div></div>
    <div id="ec-button-row"><div id="ec-button">{esc(ec["button"])}</div></div>
    <div id="ec-line">{runs(ec["line"])}</div>
    <div id="ec-badge-row"><div id="ec-badge">{esc(ec["badge"])}</div></div>
    <div id="ec-flash"></div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.fromTo("#ec-image", {{ scale: 1 }}, {{ scale: 1.08, duration: {r3(ecd)}, ease: "none" }}, 0);
    tl.fromTo("#ec-button", {{ scale: 1 }}, {{ scale: 1.05, duration: 0.3125, ease: "sine.inOut", yoyo: true, repeat: {pulses - 1} }}, 0);
    tl.fromTo("#ec-flash", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.12, ease: "none" }}, 0);
    window.__timelines["endcard"] = tl;
  </script>
</template>
'''
z += 1

# ---- captions: one scene on the captions track; the spoken word turns active-colour while it is said
st = tl["style"]
cap_end = max(c["to"] for c in tl["captions"])
body.append(f'''      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html"
        data-start="0" data-duration="{r3(cap_end)}" data-track-index="3" data-track-kind="captions"
        data-width="{W}" data-height="{H}" style="z-index:{z + 1}"></div>''')
groups, cscript = [], []
for k, c in enumerate(tl["captions"]):
    n = k + 1
    words = "".join(f'<span id="cap{n}-w{j + 1}" class="w">{esc(w["text"])}</span>' for j, w in enumerate(c["words"]))
    groups.append(f'    <div id="cap{n}" class="clip group" data-start="{r3(c["from"])}" data-duration="{r3(c["to"] - c["from"])}" '
                  f'style="top:{c["y"]}px"><div id="cap{n}-text" class="cap-text">{words}</div></div>')
    cscript.append(f'    tl.fromTo("#cap{n}-text", {{ scale: 0.78 }}, {{ scale: 1.06, duration: 0.09, ease: "power2.out" }}, {r3(c["from"])})'
                   f'.to("#cap{n}-text", {{ scale: 1, duration: 0.07, ease: "power1.out" }}, {r3(c["from"] + 0.09)});')
    for j, w in enumerate(c["words"]):
        cscript.append(f'    tl.set("#cap{n}-w{j + 1}", {{ color: "{st["activeColor"]}" }}, {r3(w["from"])})'
                       f'.set("#cap{n}-w{j + 1}", {{ color: "{st["textColor"]}" }}, {r3(w["to"])});')
size = st["captionSize"]
NL = chr(10)
CAPTIONS = f'''<template>
  <style>
    @font-face {{ font-family: "Cairo"; src: url("assets/fonts/Cairo.ttf") format("truetype"); font-weight: 700; }}
    #root {{ position: absolute; inset: 0; overflow: visible; font-family: "Cairo", sans-serif; font-weight: 700; }}
    .group {{ position: absolute; left: 0; width: 100%; height: 0; overflow: visible; }}
    .cap-text {{
      position: absolute; left: 0; width: 100%; top: {-round(size * 0.65)}px; transform-origin: 50% 50%;
      display: flex; justify-content: center; gap: {round(size * 0.26)}px; direction: rtl;
      font-size: {size}px; line-height: 1.25; color: {st["textColor"]};
      -webkit-text-stroke: {st["stroke"] * 2}px #000; paint-order: stroke fill;
      text-shadow: 0 6px 10px rgba(0, 0, 0, 0.45);
    }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{NL.join(groups)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{NL.join(cscript)}
    window.__timelines["captions"] = tl;
  </script>
</template>
'''
z += 2

# ---- audio
v = tl["audio"]["voice"]
body.append(f'      <audio id="voice" class="clip" data-start="0" data-duration="{r3(vd)}" data-track-index="4" data-volume="{v["volume"]}" src="{asset(v["src"])}"></audio>')
body.append(f'      <audio id="music" class="clip" data-start="0" data-duration="{r3(DUR)}" data-track-index="5" data-volume="1" src="assets/music_ducked.mp3"></audio>')
sfx_lanes = []
for k, x in enumerate(tl["audio"]["sfx"]):
    sp = asset(x["src"])
    sd = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                        "-of", "csv=p=0", os.path.join(OUT, sp)]).decode())
    sd = min(sd, DUR - x["at"])
    lane = 0  # overlapping effects go on the next sfx track
    while any(l == lane and x["at"] < e and s0 < x["at"] + sd for l, s0, e in sfx_lanes):
        lane += 1
    sfx_lanes.append((lane, x["at"], x["at"] + sd))
    body.append(f'      <audio id="sfx{k + 1}" class="clip" data-start="{r3(x["at"])}" data-duration="{r3(sd)}" data-track-index="{6 + lane}" data-volume="{x["volume"]}" src="{sp}"></audio>')

gsap_tag = ('<script src="assets/vendor/gsap.min.js"></script>' if GSAP else
            '<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>')
page = f'''<!doctype html>
<html lang="ar" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    {gsap_tag}
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #000; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
      .zoom {{ position: absolute; inset: 0; overflow: hidden; }}
      .zoom video, .panel video {{ position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }}
      .panel {{ position: absolute; left: 0; width: {W}px; height: {H // 2}px; overflow: hidden; }}
      .divider {{ position: absolute; left: 0; top: {H // 2 - 4}px; width: {W}px; height: 8px; background: #fff; }}
      .flash {{ position: absolute; inset: 0; background: rgba(255, 255, 255, 0.55); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{r3(DUR)}" data-width="{W}" data-height="{H}">
{chr(10).join(body)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
{chr(10).join(script)}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
'''
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
os.makedirs(os.path.join(OUT, "compositions"), exist_ok=True)
open(os.path.join(OUT, "compositions/captions.html"), "w", encoding="utf-8").write(CAPTIONS)
open(os.path.join(OUT, "compositions/endcard.html"), "w", encoding="utf-8").write(ENDCARD)
json.dump({"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
           "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
           "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
           "media": {"autoProxy": True}}, open(os.path.join(OUT, "hyperframes.json"), "w"), indent=2)
json.dump({"name": pid, "private": True, "type": "module",
           "scripts": {"dev": "npx --yes hyperframes@0.9.9 preview", "check": "npx --yes hyperframes@0.9.9 check",
                       "render": "npx --yes hyperframes@0.9.9 render"}},
          open(os.path.join(OUT, "package.json"), "w"), indent=2)
print("wrote", os.path.join(OUT, "index.html"), f"({len(tl['shots'])} shots, {len(tl['captions'])} captions, {len(tl['audio']['sfx'])} sfx)")

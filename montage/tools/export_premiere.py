#!/usr/bin/env python3
"""Export an ad as a Premiere Pro project (Final Cut Pro 7 XML, "xmeml" v4) plus its media.

Usage:  python3 export_premiere.py neck-massager-c ../projects/p03_neck_massager_c

Needs: the ad's Remotion timeline (export_remotion.py), its HyperFrames assets (export_hyperframes.py,
for the ducked music) and the rendered shots in <project>/out/tmp (build.py).
Writes montage/exports/premiere/<id>/ with <id>.xml, media/, captions.srt, and a zip next to it.

Tracks:  V1 shots + end card | V2 karaoke captions (transparent PNGs)
         A1 voice | A2 music (ducked) | A3, A4 sound effects (level baked into each file)
"""
import json, os, shutil, subprocess, sys
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFilter, ImageFont

pid, proj = sys.argv[1], os.path.abspath(sys.argv[2])
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
RM = os.path.join(ROOT, "montage/remotion/public")
HF = os.path.join(ROOT, "montage/hyperframes", pid, "assets")
tl = json.load(open(os.path.join(RM, "projects", pid, "timeline.json")))
OUT = os.path.join(ROOT, "montage/exports/premiere", pid)
MED = os.path.join(OUT, "media")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(os.path.join(MED, "captions"))
FPS, W, H = tl["fps"], tl["width"], tl["height"]
fr = lambda s: round(s * FPS)
TOTAL = fr(tl["duration"])

def probe_dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", p]).decode())

# ------------------------------------------------------------------ media
video = []  # (name, start_frame, end_frame)
tmp = os.path.join(proj, "out/tmp")
for i, s in enumerate(tl["shots"]):
    name = f"{i + 1:02d}_shot.mp4"
    shutil.copy(os.path.join(tmp, f"shot{i:02d}.mp4"), os.path.join(MED, name))
    video.append((name, fr(s["from"]), fr(s["to"])))
shutil.copy(os.path.join(tmp, "endcard.mp4"), os.path.join(MED, f"{len(video) + 1:02d}_endcard.mp4"))
video.append((f"{len(video) + 1:02d}_endcard.mp4", fr(tl["endCard"]["from"]), TOTAL))

audio = []  # (track, name, start_frame, end_frame)
shutil.copy(os.path.join(RM, tl["audio"]["voice"]["src"]), os.path.join(MED, "voice.wav"))
audio.append((1, "voice.wav", 0, min(TOTAL, fr(probe_dur(os.path.join(MED, "voice.wav"))))))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(HF, "music_ducked.mp3"), "-ar", "48000",
                os.path.join(MED, "music.wav")], check=True)
audio.append((2, "music.wav", 0, TOTAL))
lanes = []
for k, x in enumerate(tl["audio"]["sfx"]):
    base = os.path.basename(x["src"]).replace("sfx_", "")
    name = f"sfx{k + 1:02d}_{base}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(RM, x["src"]), "-af", f"volume={x['volume']}",
                    "-ar", "48000", "-ac", "2", os.path.join(MED, name)], check=True)
    s0 = fr(x["at"]); s1 = min(TOTAL, s0 + fr(probe_dur(os.path.join(MED, name))))
    lane = 0
    while any(l == lane and s0 < e and b < s1 for l, b, e in lanes):
        lane += 1
    lanes.append((lane, s0, s1))
    audio.append((3 + lane, name, s0, s1))

# ------------------------------------------------------------------ karaoke captions as transparent PNGs
st = tl["style"]
font = ImageFont.truetype(os.path.join(RM, "fonts/Cairo.ttf"), st["captionSize"], layout_engine=ImageFont.Layout.RAQM)
stroke, gap = st["stroke"], round(st["captionSize"] * 0.26)

def caption_png(words, active, y, path):
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    boxes = [d0.textbbox((0, 0), w, font=font, direction="rtl", language="ar", stroke_width=stroke) for w in words]
    widths = [b[2] - b[0] for b in boxes]
    total = sum(widths) + gap * (len(words) - 1)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = (W + total) / 2                       # right-to-left: first word on the right
    for j, (w, b) in enumerate(zip(words, boxes)):
        x -= widths[j]
        d.text((x - b[0], y - (b[1] + b[3]) / 2), w, font=font, direction="rtl", language="ar",
               fill=st["activeColor"] if j == active else st["textColor"], stroke_width=stroke, stroke_fill="black")
        x -= gap
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    shadow.putalpha(im.getchannel("A").point(lambda v: v * 0.45))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5)), (0, 6)); out.alpha_composite(im)
    out.save(path)

caps = []  # (name, start_frame, end_frame)
srt = []
for k, c in enumerate(tl["captions"]):
    words = [w["text"] for w in c["words"]]
    for j, w in enumerate(c["words"]):
        name = f"captions/cap{k + 1:02d}_{j + 1}.png"
        caption_png(words, j, c["y"], os.path.join(MED, name))
        a, b = fr(w["from"]), fr(w["to"])
        if b > a:
            caps.append((name, a, b))
    ts = lambda s: f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{int(s % 60):02d},{int(round(s % 1 * 1000)):03d}"
    srt.append(f"{k + 1}\n{ts(c['from'])} --> {ts(c['to'])}\n{' '.join(words)}\n")
open(os.path.join(OUT, "captions.srt"), "w", encoding="utf-8").write("\n".join(srt))

# ------------------------------------------------------------------ xmeml
files, fid = {}, [0]
RATE = f"<rate><timebase>{FPS}</timebase><ntsc>FALSE</ntsc></rate>"

def file_xml(name, kind):
    """First use writes the full <file>; later uses reference it by id (as Premiere expects)."""
    if name in files:
        return f'<file id="{files[name]}"/>'
    fid[0] += 1; files[name] = f"file-{fid[0]}"
    path = os.path.join(MED, name)
    if kind == "still":
        dur, media = 108000, (f"<media><video><samplecharacteristics>{RATE}<width>{W}</width><height>{H}</height>"
                              f"</samplecharacteristics></video></media>")
    elif kind == "video":
        dur = fr(probe_dur(path))
        media = (f"<media><video><samplecharacteristics>{RATE}<width>{W}</width><height>{H}</height>"
                 f"<pixelaspectratio>square</pixelaspectratio></samplecharacteristics></video></media>")
    else:
        dur = fr(probe_dur(path))
        media = ("<media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate>"
                 "</samplecharacteristics><channelcount>2</channelcount></audio></media>")
    return (f'<file id="{files[name]}"><name>{escape(os.path.basename(name))}</name>'
            f"<pathurl>media/{escape(name)}</pathurl>{RATE}<duration>{dur}</duration>{media}</file>")

cid = [0]
def clip(name, start, end, kind, still=False):
    cid[0] += 1
    n = end - start
    extra = ("<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>"
             if kind == "audio" else "")
    return (f'<clipitem id="clipitem-{cid[0]}"><name>{escape(os.path.basename(name))}</name><enabled>TRUE</enabled>'
            f"<duration>{108000 if still else n}</duration>{RATE}<start>{start}</start><end>{end}</end>"
            f"<in>0</in><out>{n}</out>{file_xml(name, 'still' if still else kind)}{extra}"
            + ("<stillframe>TRUE</stillframe>" if still else "") + "</clipitem>")

v1 = "".join(clip(n, a, b, "video") for n, a, b in video)
v2 = "".join(clip(n, a, b, "video", still=True) for n, a, b in caps)
atracks = {}
for t, n, a, b in audio:
    atracks.setdefault(t, []).append(clip(n, a, b, "audio"))
a_xml = "".join(f'<track premiereTrackType="Stereo">{"".join(atracks[t])}<enabled>TRUE</enabled><locked>FALSE</locked></track>'
                for t in sorted(atracks))
xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<name>{escape(pid)}</name>
<duration>{TOTAL}</duration>
{RATE}
<timecode>{RATE}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
<media>
<video>
<format><samplecharacteristics>{RATE}<width>{W}</width><height>{H}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance><colordepth>24</colordepth></samplecharacteristics></format>
<track>{v1}<enabled>TRUE</enabled><locked>FALSE</locked></track>
<track>{v2}<enabled>TRUE</enabled><locked>FALSE</locked></track>
</video>
<audio>
<numOutputChannels>2</numOutputChannels>
<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
{a_xml}
</audio>
</media>
</sequence>
</xmeml>
'''
open(os.path.join(OUT, f"{pid}.xml"), "w", encoding="utf-8").write(xml)
open(os.path.join(OUT, "README.txt"), "w", encoding="utf-8").write(
    "Premiere Pro: File > Import > " + pid + ".xml\n"
    "If Premiere asks to locate media: click Locate, open the media folder next to the XML,\n"
    "pick the file it asks for, and Premiere links the rest.\n"
    "V1 shots + end card | V2 karaoke captions (PNG) | A1 voice | A2 music | A3+ sound effects.\n"
    "captions.srt: plain captions (File > Import) if you prefer Premiere's own caption styling.\n")
zp = shutil.make_archive(OUT, "zip", os.path.dirname(OUT), pid)
print("wrote", os.path.join(OUT, f"{pid}.xml"), f"| {len(video)} video clips, {len(caps)} caption stills, "
      f"{len(audio)} audio clips | zip {os.path.getsize(zp) / 1e6:.1f} MB")

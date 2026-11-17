#!/usr/bin/env python3
"""Neck & shoulder massager — Saudi market ad (9:16, ~28 s).

Run from this folder:  python3 build.py
Sources are listed in SRC (the uploaded TikTok clips). Output: out/final.mp4
"""
import json, os, subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../.."))
TOOLS = os.path.join(ROOT, "montage/tools")
FONT = os.path.join(ROOT, "fonts/Cairo.ttf")
UP = "/root/.claude/uploads/9dbe307d-529d-547b-9933-313f1c4066df"
SRC = {
    "c1": f"{UP}/085914c0-TikDownloader.io_7613881382707809544_hd.mp4",
    "c2": f"{UP}/0038ac36-TikDownloader.io_7584457909514390814_hd.mp4",
    "c3": f"{UP}/cd3f6bea-download_1.mp4",
    "c4": f"{UP}/da4ac898-TikDownloader.io_7627082649663753490.mp4",
    "c5": f"{UP}/f9cca6d8-TikDownloader.io_7660454460392557854.mp4",
}
OUT = os.path.join(HERE, "out"); TMP = os.path.join(OUT, "tmp")
os.makedirs(TMP, exist_ok=True)
W, H, FPS = 1080, 1920, 30
VOICE = os.path.join(HERE, "vo_Fenrir_tight.wav")
MUSIC, MUSIC_START = os.path.join(ROOT, "montage/music/m1_promo_energetic_123bpm.mp3"), 61.37
words = json.load(open(os.path.join(HERE, "words_Fenrir.json")))["words"]
VO_END = json.load(open(os.path.join(HERE, "words_Fenrir.json")))["duration"]
END_CARD = words[43]["s"]          # "اطلبها الحين" -> end card
TOTAL = round(VO_END + 2.6, 2)

YELLOW, GREEN, DARK, ORANGE = "#FFD60A", "#16A34A", "#0B3B2C", "#FF6A13"

def sh(cmd):
    subprocess.run(cmd, check=True)

# ---------------------------------------------------------------- shots
# (timeline start, end, source, source in-point, zoom from, zoom to)
t = lambda i: words[i]["s"]
SHOTS = [
    (0.00, 1.30, "c4", 15.10, 1.10, 1.02),   # hook: fingers wiggling at camera
    (1.30, t(6), "c5", 3.85, 1.00, 1.07),    # placing it on a tense neck
    (t(6), t(9), "c3", 16.40, 1.00, 1.08),   # product reveal (pink pads)
    (t(9), t(13), "c4", 0.05, 1.04, 1.00),   # kneading the neck like hands
    (t(13), t(16), "c2", 1.95, 1.00, 1.08),  # silicone fingers close-up
    (t(16), t(20), "c2", 7.95, 1.06, 1.00),  # kneading, relaxed
    (t(20), t(23), "c1", 1.97, 1.00, 1.10),  # heat glow
    (t(23), t(27), "c5", 9.00, 1.06, 1.00),  # lying down, relaxing
    (t(27), t(29), "c3", 26.00, 1.00, 1.06), # strapping it on
    (t(29), t(31), "c1", 9.35, 1.00, 1.06),  # at home
    (t(31), t(33), "c3", 30.40, 1.05, 1.00), # on the go
    (t(33), t(34), "c4", 5.00, 1.00, 1.05),  # neck
    (t(34), t(35), "c3", 36.30, 1.00, 1.05), # shoulder
    (t(35), t(36), "c5", 12.40, 1.00, 1.05), # back
    (t(36), t(38), "c2", 4.60, 1.00, 1.06),  # legs
    (t(38), END_CARD, "c4", 5.90, 1.00, 1.08),  # on the neck, logo side
]

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", path]).decode())

def render_shot(i, s, e, src, sin, z0, z1):
    d = e - s
    path = SRC[src]
    avail = dur(path) - sin - 0.05
    speed = min(1.0, avail / d)               # slow down only if the source is too short
    out = f"{TMP}/shot{i:02d}.mp4"
    zoom = f"({z0}+({z1}-{z0})*t/{d:.3f})"
    vf = (f"setpts=(PTS-STARTPTS)/{speed:.4f},fps={FPS},"
          f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"scale=w='2*trunc({W}*{zoom}/2)':h='2*trunc({H}*{zoom}/2)':eval=frame,"
          f"crop={W}:{H},eq=saturation=1.12:contrast=1.04,format=yuv420p")
    sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{sin}", "-i", path, "-t", f"{d:.3f}",
        "-vf", vf, "-an", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out])
    return out

# ---------------------------------------------------------------- graphics
def font(sz):
    return ImageFont.truetype(FONT, sz, layout_engine=ImageFont.Layout.RAQM)

def text_size(txt, f):
    l, t_, r, b = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), txt, font=f, direction="rtl", language="ar")
    return r - l, b - t_, l, t_

def runs_image(runs, sz, stroke=0, stroke_fill="black", gap=None):
    """Right-to-left sequence of (text, colour) runs as one transparent image."""
    f = font(sz); gap = gap if gap is not None else int(sz * 0.28)
    ms = [text_size(r, f) for r, _ in runs]
    wtot = sum(m[0] for m in ms) + gap * (len(runs) - 1) + 2 * stroke + 8
    htot = int(sz * 1.6) + 2 * stroke
    im = Image.new("RGBA", (wtot, htot), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x = wtot - stroke - 4
    for (txt, col), (w, h, l, t_) in zip(runs, ms):
        x -= w
        d.text((x - l, (htot - sz * 1.0) / 2 - sz * 0.25), txt, font=f, fill=col, direction="rtl",
               language="ar", stroke_width=stroke, stroke_fill=stroke_fill)
        x -= gap
    return im

def capsule(text, sz, bg, fg, pad=(44, 18), icon=None):
    f = font(sz); w, h, l, t_ = text_size(text, f)
    ic = int(sz * 1.15) if icon else 0
    cw, ch = w + 2 * pad[0] + (ic + 18 if icon else 0), int(sz * 1.55) + 2 * pad[1] - 10
    im = Image.new("RGBA", (cw + 16, ch + 16), (0, 0, 0, 0))
    sh_ = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh_).rounded_rectangle((8, 12, cw + 8, ch + 12), ch // 2, fill=(0, 0, 0, 110))
    im = Image.alpha_composite(im, sh_.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((4, 4, cw + 4, ch + 4), ch // 2, fill=bg)
    tx = cw + 4 - pad[0] - (ic + 18 if icon else 0) - w
    d.text((tx - l, 4 + (ch - sz * 1.0) / 2 - sz * 0.25), text, font=f, fill=fg, direction="rtl", language="ar")
    if icon:  # icon sits on the right (start of an RTL line)
        cx, cy, r = cw + 4 - pad[0] - ic // 2, 4 + ch // 2, ic // 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fg if icon == "check" else "white")
        if icon == "check":
            d.line([(cx - r * .45, cy), (cx - r * .1, cy + r * .4), (cx + r * .5, cy - r * .4)],
                   fill=bg, width=max(4, sz // 9), joint="curve")
        elif icon == "fire":
            d.polygon([(cx, cy - r * .7), (cx + r * .45, cy + r * .1), (cx + r * .3, cy + r * .55),
                       (cx - r * .3, cy + r * .55), (cx - r * .45, cy + r * .1)], fill=bg)
        elif icon == "dot":
            d.ellipse((cx - r * .4, cy - r * .4, cx + r * .4, cy + r * .4), fill=bg)
    return im

def save(im, name):
    p = f"{TMP}/{name}.png"; im.save(p); return p

# (png, start, end, x or None=centered, y, anim)
OV = []
def add(im, name, s, e, y, x=None, anim="up"):
    OV.append((save(im, name), s, e, x, y, anim))

hook = runs_image([("رقبتك", "white"), ("متشنجة؟", YELLOW)], 112, stroke=9)
add(hook, "hook", 0.05, t(6), 330, anim="pop")
add(capsule("تدليك يشبه اليد الحقيقية", 58, YELLOW, "#111111", icon="dot"), "b1", t(9) + .05, t(13), 300)
add(capsule("سيليكون ناعم ومرن", 58, "white", DARK, icon="check"), "b2", t(13) + .05, t(20), 300)
add(capsule("حرارة مريحة للعضلات", 58, ORANGE, "white", icon="fire"), "b3", t(20) + .05, t(27), 300)
add(capsule("يُلبس في ثواني", 58, YELLOW, "#111111", icon="dot"), "b4", t(27) + .05, t(33), 300)
for k, (lbl, wi) in enumerate([("الرقبة", 33), ("الكتوف", 34), ("الظهر", 35), ("الرجلين", 36)]):
    im = capsule(lbl, 58, "white", GREEN, icon="check")
    add(im, f"chk{k}", words[wi]["s"] + .03, t(38), 250 + k * 118, x=W - 70 - im.width, anim="left")
add(capsule("توصيل مجاني", 56, GREEN, "white", icon="check"), "d1", t(38) + .05, END_CARD, 290)
add(capsule("الدفع عند الاستلام", 56, YELLOW, "#111111", icon="check"), "d2", t(40) + .05, END_CARD, 420)

# ---------------------------------------------------------------- end card
def end_card():
    d = TOTAL - END_CARD
    bg = Image.new("RGB", (W, H), DARK); px = ImageDraw.Draw(bg)
    for y in range(H):  # vertical gradient
        k = y / H
        px.line([(0, y), (W, y)], fill=(int(8 + 14 * k), int(46 + 48 * k), int(34 + 30 * k)))
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((90, 380, 990, 1400), fill=120)
    bg = Image.composite(Image.new("RGB", (W, H), (60, 160, 110)), bg, glow.filter(ImageFilter.GaussianBlur(160)))
    bg = bg.convert("RGBA")
    t1 = runs_image([("مساج", "white"), ("الرقبة", "white"), ("والكتف", YELLOW)], 86, stroke=0)
    bg.alpha_composite(t1, ((W - t1.width) // 2, 120))
    t2 = runs_image([("بأصابع", "white"), ("تدليك", "white"), ("وحرارة", "white")], 50)
    bg.alpha_composite(t2, ((W - t2.width) // 2, 255))
    # card frame + shadow (video goes inside: 760x1000 at 160,370)
    shd = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shd).rounded_rectangle((150, 380, 930, 1390), 48, fill=(0, 0, 0, 150))
    bg.alpha_composite(shd.filter(ImageFilter.GaussianBlur(18)))
    ImageDraw.Draw(bg).rounded_rectangle((152, 362, 928, 1378), 46, fill="white")
    line = runs_image([("التوصيل", "white"), ("مجاني", YELLOW), ("•", "white"), ("الدفع", "white"),
                       ("عند", "white"), ("الاستلام", YELLOW)], 46)
    bg.alpha_composite(line, ((W - line.width) // 2, 1640))
    lim = capsule("الكمية محدودة", 40, "#E11D48", "white")
    bg.alpha_composite(lim, ((W - lim.width) // 2, 1740))
    bgp = save(bg, "end_bg")
    mask = Image.new("L", (760, 1000), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, 759, 999), 40, fill=255)
    maskp = save(mask, "end_mask")
    btn = capsule("اطلبه الحين", 76, YELLOW, "#111111", pad=(70, 22), icon="dot")
    btnp = save(btn, "end_btn")
    out = f"{TMP}/endcard.mp4"
    fc = (f"[1:v]setpts=PTS-STARTPTS,fps={FPS},scale=760:-2,crop=760:1000,eq=saturation=1.12,format=rgba[cv];"
          f"[2:v]format=gray[m];[cv][m]alphamerge[card];"
          f"[0:v][card]overlay=160:370[a];"
          f"[3:v]format=rgba,scale=w='2*trunc(iw*(1+0.05*sin(2*PI*1.6*t))/2)':h=-2:eval=frame[b];"
          f"[a][b]overlay=x='(W-w)/2':y='1500-h/2':eval=frame,"
          f"fade=in:st=0:d=0.12:color=white,format=yuv420p[v]")
    sh(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", f"{d:.3f}", "-i", bgp,
        "-ss", "14.8", "-t", f"{d:.3f}", "-i", SRC["c4"], "-loop", "1", "-t", f"{d:.3f}", "-i", maskp,
        "-loop", "1", "-t", f"{d:.3f}", "-i", btnp, "-filter_complex", fc, "-map", "[v]",
        "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out])
    return out

# ---------------------------------------------------------------- captions (ASS)
CAPS = [  # (first word, last word, text, highlighted words)
    (0, 1, "رقبتك وكتوفك", []), (2, 2, "متشنجة", ["متشنجة"]), (3, 5, "من الجوال والدوام؟", ["الجوال"]),
    (6, 8, "جرّب هالمساج الذكي", ["الذكي"]), (9, 10, "يدلّكك كأنها", []), (11, 12, "يدين حقيقية!", ["يدين"]),
    (13, 15, "أصابع سيليكون ناعمة", ["سيليكون"]), (16, 17, "تعجن العضلات", ["تعجن"]),
    (18, 19, "وتفك الشد", ["الشد"]), (20, 22, "وفيه حرارة دافية", ["حرارة"]), (23, 24, "تريّح العضلات", []),
    (25, 26, "وتحسّسك بالراحة", ["بالراحة"]), (27, 28, "تلبسها بثواني", ["بثواني"]),
    (29, 30, "وتستخدمها بالبيت", ["بالبيت"]), (31, 32, "أو بالمكتب", ["بالمكتب"]),
    (33, 33, "للرقبة", ["للرقبة"]), (34, 34, "الكتوف", ["الكتوف"]), (35, 35, "الظهر", ["الظهر"]),
    (36, 37, "وحتى الرجلين", ["الرجلين"]), (38, 39, "التوصيل مجاني", ["مجاني"]),
    (40, 42, "والدفع عند الاستلام", ["الاستلام"]),
]
def captions():
    for k, (a, b, txt, hls) in enumerate(CAPS):
        st, e = words[a]["s"], words[b]["e"]
        if b + 1 < len(words):
            e = min(e, words[b + 1]["s"])
        runs = [(w, YELLOW if w.strip("؟!،.") in hls else "white") for w in txt.split()]
        im = runs_image(runs, 100, stroke=10, gap=26)
        sh_ = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh_.alpha_composite(im)
        shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
        shadow.putalpha(im.getchannel("A").point(lambda v: v * 0.5))
        out = Image.new("RGBA", (im.width + 12, im.height + 12), (0, 0, 0, 0))
        out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5)), (6, 10)); out.alpha_composite(im, (0, 0))
        add(out, f"cap{k:02d}", st, e, 1215, anim="cap")

# ---------------------------------------------------------------- sound effects
def sfx():
    whoosh = f"{TMP}/whoosh.wav"; pop = f"{TMP}/pop.wav"; ding = f"{TMP}/ding.wav"
    sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=0.35:c=pink:a=0.6", "-af",
        "highpass=f=600,lowpass=f=6000,afade=t=in:d=0.15:curve=exp,afade=t=out:st=0.15:d=0.2,volume=0.7", "-ar", "48000", whoosh])
    sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=520:d=0.12", "-af",
        "vibrato=f=0.1,asetrate=48000*1.6,aresample=48000,afade=t=out:st=0.02:d=0.1,volume=0.9", pop])
    sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=1568:d=0.35", "-f", "lavfi", "-i", "sine=f=2093:d=0.35",
        "-filter_complex", "[0][1]amix=2,afade=t=out:st=0.01:d=0.33:curve=exp,volume=0.8", "-ar", "48000", ding])
    hits = [(whoosh, x[1]) for x in OV if x[0].endswith(("b1.png", "b2.png", "b3.png", "b4.png", "d1.png", "d2.png"))]
    hits += [(ding, x[1]) for x in OV if "chk" in x[0]]
    hits += [(whoosh, t(6) - 0.12), (pop, END_CARD)]
    return hits

# ---------------------------------------------------------------- build
def main():
    shots = [render_shot(i, *s) for i, s in enumerate(SHOTS)]
    shots.append(end_card())
    lst = f"{TMP}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in shots))
    base = f"{TMP}/base.mp4"
    sh(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", base])

    # overlays + captions + reveal flash
    captions()
    args = ["ffmpeg", "-v", "error", "-y", "-i", base]
    fc, last = [], "[0:v]"
    for k, (png, s, e, x, y, anim) in enumerate(OV):
        d = e - s
        args += ["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", png]
        chain = f"[{k + 1}:v]format=rgba"
        if anim in ("cap", "pop"):  # scale pop: 78% -> 106% -> 100%
            sc = "if(lt(t,0.09),0.78+t*3.1,if(lt(t,0.16),1.06-(t-0.09)*0.86,1))"
            chain += f",scale=w='2*trunc(iw*{sc}/2)':h='2*trunc(ih*{sc}/2)':eval=frame"
        if anim != "cap":
            chain += ",fade=in:st=0:d=0.12:alpha=1"
        chain += f",fade=out:st={max(0, d - 0.06):.3f}:d=0.06:alpha=1,setpts=PTS+{s:.3f}/TB[o{k}]"
        fc.append(chain)
        p = f"max(0,1-(t-{s:.3f})/0.15)"
        xs = "(W-w)/2" if x is None else (f"{x}+60*{p}" if anim == "left" else f"{x}")
        ys = {"up": f"{y}+50*{p}", "cap": f"{y}-h/2", "pop": f"{y}+h/2-h"}.get(anim, f"{y}")
        fc.append(f"{last}[o{k}]overlay=x='{xs}':y='{ys}':eof_action=pass:eval=frame[v{k}]")
        last = f"[v{k}]"
    fc.append(f"{last}drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=fill:enable='between(t,{t(6):.2f},{t(6) + 0.07:.2f})',"
              f"format=yuv420p[vout]")
    vid = f"{TMP}/video.mp4"
    sh(args + ["-filter_complex", ";".join(fc), "-map", "[vout]", "-t", f"{TOTAL}", "-r", str(FPS),
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", vid])

    # audio: voice + ducked music, then sound effects
    mix = f"{TMP}/mix.wav"
    sh(["python3", f"{TOOLS}/mix.py", VOICE, MUSIC, mix, "--start", str(MUSIC_START), "--tail", f"{TOTAL - VO_END:.2f}"])
    hits = sfx()
    a = ["ffmpeg", "-v", "error", "-y", "-i", mix] + sum([["-i", h] for h, _ in hits], [])
    fa = [f"[{i + 1}:a]adelay={int(s * 1000)}|{int(s * 1000)},volume=0.22[s{i}]" for i, (_, s) in enumerate(hits)]
    fa.append("[0:a]" + "".join(f"[s{i}]" for i in range(len(hits))) + f"amix=inputs={len(hits) + 1}:normalize=0,"
              f"alimiter=limit=0.89[a]")
    aud = f"{TMP}/audio.wav"
    sh(a + ["-filter_complex", ";".join(fa), "-map", "[a]", "-t", f"{TOTAL}", "-ar", "48000", aud])

    final = f"{OUT}/final.mp4"
    sh(["ffmpeg", "-v", "error", "-y", "-i", vid, "-i", aud, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final])
    print("done:", final, f"{TOTAL}s")

if __name__ == "__main__":
    main()

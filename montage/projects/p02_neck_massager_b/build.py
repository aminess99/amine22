#!/usr/bin/env python3
"""Neck & shoulder massager, version B (new script) — Saudi market ad (9:16, ~26 s).

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
    "c5": f"{UP}/f9cca6d8-TikDownloader.io_7660454460392557854.mp4",
}
OUT = os.path.join(HERE, "out"); TMP = os.path.join(OUT, "tmp")
os.makedirs(TMP, exist_ok=True)
W, H, FPS = 1080, 1920, 30
VOICE = os.path.join(HERE, "vo_tight.wav")
MUSIC, MUSIC_START = os.path.join(ROOT, "montage/music/m1_promo_energetic_123bpm.mp3"), 61.37
words = json.load(open(os.path.join(HERE, "words.json")))["words"]
VO_END = json.load(open(os.path.join(HERE, "words.json")))["duration"]
END_CARD = words[49]["s"]          # "اطلبه الحين" -> end card
REVEAL = 8                          # word index of "شوف هذا المساج"
TOTAL = round(VO_END + 2.6, 2)

YELLOW, GREEN, DARK, ORANGE = "#FFD60A", "#16A34A", "#0B3B2C", "#FF6A13"

def sh(cmd):
    subprocess.run(cmd, check=True)

# ---------------------------------------------------------------- shots
t = lambda i: words[i]["s"]
# single: ("one", start, end, src, in, zoom) with zoom = ("kb", from, to) or ("dolly", max, fx, fy)
# split : ("split", start, end, (src, in, fy), (src, in, fy))          top / bottom
# grid  : ("grid", start, end, [(src, in, appear_word), ...x4])          RTL order: TR, TL, BR, BL
# Rules: one complete action per shot, kept inside its source scene (last field = scene time left);
# clean backgrounds only. c3 and c4 (shop footage, 576p, shaky, cluttered) are excluded.
SHOTS = [
    ("one", 0.00, t(8), "c5", 3.50, ("push", 1.32, 1.42, 0.50, 0.66), 2.88),   # hands to a tired neck, puts it on
    ("one", t(8), t(11), "c1", 1.00, ("dolly", 1.30, 0.50, 0.45), 0.95),     # reveal: product, heat pads glowing
    ("one", t(11), t(13), "c2", 1.95, ("dolly", 1.35, 0.50, 0.45), 1.46),    # fingers moving
    ("one", t(13), t(17), "c5", 9.10, ("kb", 1.00, 1.06), 3.05),             # kneads like a masseur (peak 10.7)
    ("split", t(17), t(24), ("c2", 7.92, 0.45, 2.63), ("c5", 6.45, 0.68, 2.30)),  # neck & shoulders, two angles
    ("one", t(24), t(27), "c1", 1.99, ("dolly", 1.45, 0.50, 0.60), 1.02),    # heat glow
    ("one", t(27), t(29), "c1", 10.59, ("kb", 1.00, 1.05), 1.09),            # relaxed, lying down
    ("one", t(29), t(33), "c5", 0.10, ("kb", 1.00, 1.05), 1.95),             # puts it on in seconds (whole action)
    ("one", t(33), t(35), "c1", 5.05, ("kb", 1.05, 1.00), 1.23),             # relaxing
    ("split", t(35), t(38), ("c1", 9.35, 0.40, 1.20), ("c1", 11.72, 0.55, 0.89)),  # home / office
    ("split", t(38), t(44), ("c5", 12.22, 0.55, 1.88), ("c2", 4.45, 0.50, 3.40)),  # back / legs
    ("one", t(44), t(46), "c5", 2.10, ("kb", 1.00, 1.06), 1.35),             # free delivery
    ("one", t(46), END_CARD, "c1", 14.02, ("kb", 1.00, 1.06), 1.03),         # cash on delivery
]
SPLIT_TIMES = [(x[1], x[2]) for x in SHOTS if x[0] in ("split", "grid")]

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", path]).decode())

def src_in(src, sin, d, maxlen=None):
    """Input args + the speed needed so the source (or its first maxlen s) covers d seconds."""
    avail = dur(SRC[src]) - sin - 0.05
    want = min(avail, maxlen or avail)
    speed = min(1.5, want / d) if maxlen else min(1.0, want / d)
    return ["-ss", f"{sin}", "-i", SRC[src]], speed

def base_chain(k, speed, d):
    return f"[{k}:v]setpts=(PTS-STARTPTS)/{speed:.4f},fps={FPS},trim=duration={d:.3f},setpts=PTS-STARTPTS"

def zoom_chain(pw, ph, zoom, d):
    """Cover pw x ph, then Ken Burns or an eased dolly-in onto a focus point."""
    if zoom[0] == "kb":
        z, fx, fy = f"({zoom[1]}+({zoom[2]}-{zoom[1]})*t/{d:.3f})", 0.5, 0.5
    elif zoom[0] == "push":  # tight framing on a focus point, slow push-in
        z, fx, fy = f"({zoom[1]}+({zoom[2]}-{zoom[1]})*t/{d:.3f})", zoom[3], zoom[4]
    else:
        T = min(1.1, d * 0.75)
        z, fx, fy = f"(1+({zoom[1]}-1)*(1-pow(1-min(1,t/{T:.3f}),3)))", zoom[2], zoom[3]
    return (f"scale={pw}:{ph}:force_original_aspect_ratio=increase,crop={pw}:{ph},"
            f"scale=w='2*trunc({pw}*{z}/2)':h='2*trunc({ph}*{z}/2)':eval=frame,"
            f"crop={pw}:{ph}:x='max(0,min(iw-{pw},{fx}*iw-{pw}/2))':y='max(0,min(ih-{ph},{fy}*ih-{ph}/2))'")

def panel_chain(pw, ph, fy):
    """Cover a panel, keeping the focus height fy of the source."""
    return (f"scale={pw}:-2,scale={pw}:{ph}:force_original_aspect_ratio=increase,"
            f"crop={pw}:{ph}:x=(iw-{pw})/2:y='max(0,min(ih-{ph},{fy}*ih-{ph}/2))'")

LOOK = "eq=saturation=1.12:contrast=1.04"
ENC = ["-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p"]

def render_shot(i, shot):
    kind, s, e = shot[0], shot[1], shot[2]
    nf = round(e * FPS) - round(s * FPS); d = nf / FPS   # frame-exact cuts, no drift
    out = f"{TMP}/shot{i:02d}.mp4"
    if kind == "one":
        src, sin, zoom = shot[3:6]
        inp, sp = src_in(src, sin, d, shot[6] if len(shot) > 6 else None)
        fc = f"{base_chain(0, sp, d)},{zoom_chain(W, H, zoom, d)},{LOOK}[v]"
    elif kind == "split":
        inp, parts = [], []
        for k, (src, sin, fy, ml) in enumerate(shot[3:5]):
            a_, sp = src_in(src, sin, d, ml); inp += a_
            parts.append(f"{base_chain(k, sp, d)},{panel_chain(W, H // 2, fy)}[p{k}]")
        fc = ";".join(parts) + f";[p0][p1]vstack,drawbox=x=0:y={H // 2 - 4}:w={W}:h=8:color=white:t=fill,{LOOK}[v]"
    else:  # grid: panels appear one by one with their word
        inp, parts = [], []
        pos = [(W // 2, 0), (0, 0), (W // 2, H // 2), (0, H // 2)]
        last = "[bg]"
        parts.append(f"color=c=#101010:s={W}x{H}:r={FPS}:d={d:.3f}[bg]")
        for k, (src, sin, wi, ml) in enumerate(shot[3]):
            at = max(0.0, words[wi]["s"] - s); vis = d - at
            inp += ["-ss", f"{sin}", "-t", f"{ml:.3f}", "-i", SRC[src]]
            parts.append(f"[{k}:v]setpts=PTS-STARTPTS,fps={FPS},{panel_chain(W // 2, H // 2, 0.5)},"
                         f"tpad=stop_mode=clone:stop_duration={vis + 1:.3f},trim=duration={vis:.3f},"
                         f"setpts=PTS-STARTPTS+{at:.3f}/TB,fade=in:st={at:.3f}:d=0.08:color=white[p{k}]")
            parts.append(f"{last}[p{k}]overlay={pos[k][0]}:{pos[k][1]}:enable='gte(t,{at:.3f})'[g{k}]")
            last = f"[g{k}]"
        fc = ";".join(parts) + (f";{last}drawbox=x={W // 2 - 4}:y=0:w=8:h={H}:color=white:t=fill,"
                                f"drawbox=x=0:y={H // 2 - 4}:w={W}:h=8:color=white:t=fill,{LOOK}[v]")
    sh(["ffmpeg", "-v", "error", "-y"] + inp + ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(nf)] + ENC + [out])
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
    fc = (f"[1:v]trim=end_frame=1,loop=loop=-1:size=1,setpts=N/{FPS}/TB,fps={FPS},trim=duration={d:.3f},"
          f"scale=w='2*trunc(760*(1.0+0.08*t/{d:.3f})/2)':h=-2:eval=frame,crop=760:1000:x=(iw-760)/2:y=(ih-1000)/2+60,"
          f"eq=saturation=1.12,format=rgba[cv];"
          f"[2:v]format=gray[m];[cv][m]alphamerge[card];"
          f"[0:v][card]overlay=160:370[a];"
          f"[3:v]format=rgba,scale=w='2*trunc(iw*(1+0.05*sin(2*PI*1.6*t))/2)':h=-2:eval=frame[b];"
          f"[a][b]overlay=x='(W-w)/2':y='1500-h/2':eval=frame,"
          f"fade=in:st=0:d=0.12:color=white,format=yuv420p[v]")
    sh(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", f"{d:.3f}", "-i", bgp,
        "-ss", "1.30", "-i", SRC["c1"], "-loop", "1", "-t", f"{d:.3f}", "-i", maskp,
        "-loop", "1", "-t", f"{d:.3f}", "-i", btnp, "-filter_complex", fc, "-map", "[v]",
        "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out])
    return out

# ---------------------------------------------------------------- captions (ASS)
# What is shown for each spoken word (Whisper hears the Saudi "g" for qaf etc.; show correct spelling).
SHOW = ("يومك كله على الجوال والمكتب، وآخره رقبتك تعبانة؟ شوف هذا المساج، أصابعه تتحرك مثل يد المدلّك "
        "بالضبط! يعجن الرقبة والكتوف، ويفك الشد اللي فيها. وفيه حرارة دافية تريّح العضلات. تحطه على "
        "رقبتك بثواني، وترتاح وأنت بالبيت أو بالمكتب. وتقدر تستخدمه على الظهر والرجلين بعد. التوصيل "
        "مجاني، والدفع عند الاستلام. اطلبه الحين!").split()
assert len(SHOW) == len(words), (len(SHOW), len(words))
CAP_SIZE, ACTIVE = 84, YELLOW

FUNC = {"على", "مثل", "اللي", "أو", "من", "في", "عند", "هذا"}

def chunks(last_word):
    """2-3 words per caption; break at punctuation and at split-screen cuts; never end on a small word."""
    edges = {round(x, 3) for a0, b0 in SPLIT_TIMES for x in (a0, b0)}
    out, cur = [], []
    for i in range(last_word):
        cur.append(i)
        text = " ".join(SHOW[j] for j in cur)
        nxt = round(words[i + 1]["s"], 3) if i + 1 < len(words) else None
        if len(cur) == 3 or SHOW[i][-1] in "،.؟!" or len(text) > 15 or nxt in edges:
            out.append(cur); cur = []
    if cur: out.append(cur)
    fixed = []
    for ch in out:  # move a trailing small word to the next caption
        if fixed and fixed[-1][-1] + 1 == ch[0] and len(fixed[-1]) > 1 and SHOW[fixed[-1][-1]] in FUNC \
                and len(ch) < 3 and round(words[ch[0]]["s"], 3) not in edges:
            ch = [fixed[-1].pop()] + ch
        fixed.append(ch)
    return fixed

def captions():
    """Karaoke: the chunk pops in, then each word turns yellow while it is spoken."""
    for k, ch in enumerate(chunks(49)):
        end = words[ch[-1] + 1]["s"] if ch[-1] + 1 < len(words) else words[ch[-1]]["e"]
        y = 960 if any(a0 - 0.01 <= words[ch[0]]["s"] < b0 for a0, b0 in SPLIT_TIMES) else 1215
        for n, i in enumerate(ch):
            st = words[i]["s"]; en = words[i + 1]["s"] if n + 1 < len(ch) else end
            runs = [(SHOW[j].strip("،.؟!") if j == ch[-1] and SHOW[j][-1] in "،." else SHOW[j],
                     ACTIVE if j == i else "white") for j in ch]
            im = runs_image(runs, CAP_SIZE, stroke=8, gap=22)
            shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
            shadow.putalpha(im.getchannel("A").point(lambda v: v * 0.5))
            out = Image.new("RGBA", (im.width + 12, im.height + 12), (0, 0, 0, 0))
            out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5)), (6, 10)); out.alpha_composite(im, (0, 0))
            add(out, f"cap{k:02d}_{n}", st, en, y, anim="cap" if n == 0 else "hold")

# ---------------------------------------------------------------- sound effects
SFX = os.path.join(ROOT, "montage/sfx")
GAIN = {"whoosh": 0.85, "riser": 0.40, "impact": 0.60, "pop": 0.50, "ding": 0.45, "click": 0.40}

def sfx():
    """(file, time, gain) for every effect, following the edit."""
    f = lambda n: os.path.join(SFX, n + ".wav")
    hits = [(f("impact"), 0.0, GAIN["impact"] * 0.7)]                       # hook lands
    hits += [(f("riser"), max(0, t(REVEAL) - 0.8), GAIN["riser"])]              # build into the reveal
    for x in SHOTS:
        if x[0] == "split" or (x[0] == "one" and x[5][0] == "dolly" and x[1] > 0):
            hits.append((f("whoosh"), max(0, x[1] - 0.15), GAIN["whoosh"]))
        elif x[1] > 0 and x[0] == "one":
            hits.append((f("click"), x[1], GAIN["click"] * 0.6))           # plain cuts: soft tick
        if x[0] == "grid":
            hits += [(f("pop"), words[wi]["s"], GAIN["pop"] * 0.8) for _, _, wi, _ in x[3]]
            hits += [(f("ding"), words[x[3][-1][2]]["s"] + 0.05, GAIN["ding"])]
    hits += [(f("impact"), END_CARD, GAIN["impact"]), (f("pop"), END_CARD + 0.05, GAIN["pop"]),
             (f("ding"), END_CARD + 0.35, GAIN["ding"])]
    return hits

MUSICS = [  # (label, file, start) - one final video per track so the client can pick
    ("m1", "m1_promo_energetic_123bpm.mp3", 61.37),
    ("m2", "m2_upbeat_fun_118bpm.mp3", 44.68),
    ("m3", "m3_promo_medium_103bpm.mp3", 1.76),
]

# ---------------------------------------------------------------- build
def main():
    shots = [render_shot(i, x) for i, x in enumerate(SHOTS)]
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
        if anim not in ("cap", "hold"):
            chain += ",fade=in:st=0:d=0.12:alpha=1"
        chain += f",setpts=PTS+{s:.3f}/TB[o{k}]"
        fc.append(chain)
        p = f"max(0,1-(t-{s:.3f})/0.15)"
        xs = "(W-w)/2" if x is None else (f"{x}+60*{p}" if anim == "left" else f"{x}")
        ys = {"up": f"{y}+50*{p}", "cap": f"{y}-h/2", "hold": f"{y}-h/2", "pop": f"{y}+h/2-h"}.get(anim, f"{y}")
        fc.append(f"{last}[o{k}]overlay=x='{xs}':y='{ys}':eof_action=pass:eval=frame[v{k}]")
        last = f"[v{k}]"
    fc.append(f"{last}drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=fill:enable='between(t,{t(REVEAL):.2f},{t(REVEAL) + 0.07:.2f})',"
              f"format=yuv420p[vout]")
    vid = f"{TMP}/video.mp4"
    sh(args + ["-filter_complex", ";".join(fc), "-map", "[vout]", "-t", f"{TOTAL}", "-r", str(FPS),
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", vid])

    # audio: voice + ducked music (one version per track), then sound effects
    hits = sfx()
    for label, mfile, mstart in MUSICS:
        mix = f"{TMP}/mix_{label}.wav"
        sh(["python3", f"{TOOLS}/mix.py", VOICE, os.path.join(ROOT, "montage/music", mfile), mix,
            "--start", str(mstart), "--tail", f"{TOTAL - VO_END:.2f}", "--bed", "-7"])
        a_ = ["ffmpeg", "-v", "error", "-y", "-i", mix] + sum([["-i", h] for h, _, _ in hits], [])
        fa = [f"[{i + 1}:a]aresample=48000,adelay={int(s_ * 1000)}|{int(s_ * 1000)},volume={g}[s{i}]"
              for i, (_, s_, g) in enumerate(hits)]
        fa.append("[0:a]" + "".join(f"[s{i}]" for i in range(len(hits))) +
                  f"amix=inputs={len(hits) + 1}:normalize=0,alimiter=limit=0.89[a]")
        aud = f"{TMP}/audio_{label}.wav"
        sh(a_ + ["-filter_complex", ";".join(fa), "-map", "[a]", "-t", f"{TOTAL}", "-ar", "48000", aud])
        final = f"{OUT}/final_{label}.mp4"
        sh(["ffmpeg", "-v", "error", "-y", "-i", vid, "-i", aud, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final])
        print("done:", final)

if __name__ == "__main__":
    main()

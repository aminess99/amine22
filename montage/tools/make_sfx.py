#!/usr/bin/env python3
"""Synthesise the ad sound-effect kit (no licences needed) into montage/sfx/.

whoosh  - air swoosh for zoom-ins / split screens
riser   - 0.8 s rising swell that lands on a reveal
impact  - deep boom + click for the hook and the end card
pop     - bubbly pop for panels / CTA button
ding    - bright bell for list items / prices
click   - short tick for fast cuts
All are peak-normalised to -1 dBFS, 48 kHz stereo.
"""
import os, numpy as np, wave

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
t_ = lambda d: np.arange(int(SR * d)) / SR

def save(name, x, width=0.0):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    l = x; r = np.roll(x, int(width * SR)) if width else x
    st = (np.stack([l, r], 1) * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())

def sweep_filter(noise, f0, f1, q=2.5):
    """Band-pass with a moving centre (state-variable filter)."""
    out = np.zeros_like(noise); low = band = 0.0
    fc = np.geomspace(f0, f1, len(noise))
    for i, x in enumerate(noise):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        high = x - low - band / q; band += f * high; low += f * band
        out[i] = band
    return out

# whoosh: noise swept low->high->low with a bell envelope
d = 0.45; t = t_(d); n = rng.standard_normal(len(t))
env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2.2
w = sweep_filter(n, 350, 3800) * env
w[len(w) // 2:] = sweep_filter(n[len(w) // 2:], 3800, 900)[: len(w) - len(w) // 2] * env[len(w) // 2:]
save("whoosh", w, width=0.004)

# riser: noise + rising tone, swelling to the end
d = 0.8; t = t_(d); env = (t / d) ** 2.5
tone = np.sin(2 * np.pi * np.cumsum(np.geomspace(180, 900, len(t))) / SR)
save("riser", (sweep_filter(rng.standard_normal(len(t)), 300, 6000) * 0.8 + tone * 0.35) * env, width=0.006)

# impact: pitch-dropping sub boom + transient click + short noise tail
d = 0.9; t = t_(d)
boom = np.sin(2 * np.pi * np.cumsum(np.geomspace(110, 38, len(t))) / SR) * np.exp(-t * 5.5)
click = rng.standard_normal(len(t)) * np.exp(-t * 90)
save("impact", boom * 1.0 + click * 0.35 + sweep_filter(rng.standard_normal(len(t)), 2000, 400) * np.exp(-t * 9) * 0.25)

# pop: fast downward sine chirp
d = 0.14; t = t_(d)
save("pop", np.sin(2 * np.pi * np.cumsum(np.geomspace(1100, 260, len(t))) / SR) * np.exp(-t * 32))

# ding: bell partials with exponential decay
d = 0.9; t = t_(d); f = 1760
bell = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * dk) for k, a, dk in
           [(1, 1.0, 4.5), (2.0, 0.5, 6), (2.76, 0.35, 8), (5.4, 0.2, 12)])
save("ding", bell * (1 - np.exp(-t * 900)))

# click: tiny filtered tick
d = 0.05; t = t_(d)
save("click", sweep_filter(rng.standard_normal(len(t)), 4000, 2500) * np.exp(-t * 150))
print("wrote", sorted(os.listdir(OUT)))

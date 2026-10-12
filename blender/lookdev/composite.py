"""Turn a rendered pass file into the pencil drawing.

    BPY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13
    $BPY blender/lookdev/composite.py out/passes/a-1440x900.exr [more.exr ...] [--out DIR]

Runs on Blender's bundled Python (numpy + OpenImageIO), outside Blender, so the drawing can be
re-tuned in seconds without re-rendering. For every input it writes <DIR>/<name>.png (8-bit sRGB,
default DIR = blender/lookdev/out).

Steps
  1. tone      Image pass (emission = tone ** 2.2) -> display tone, 1 = paper
  2. air       fade tone toward paper with depth (soft atmospheric perspective)
  3. graphite  darkness d = 1 - tone is laid down as graphite on toothy paper: modulated by a
               fine paper-tooth noise and a faint diagonal stroke texture, so flat greys read as
               shading rather than as print
  4. ink       Freestyle alpha, broken a little by the same paper tooth (pencil on paper never
               covers 100 %), slightly softened, then combined with the shading in transmittance
  5. paper     paper colour with a very low-frequency mottle; graphite colour for the marks

The noise is a fixed function of pixel position and the frame size (seeded), so consecutive
animation frames share the same paper.
"""
import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa: E402

P = dict(
    air_near=45.0, air_far=260.0, air_max=0.82,      # depth fade (m) and max fade to paper
    tone_gamma=1.0,                                  # >1 lightens the shading overall
    shade_gain=0.85,                                  # scales all shading darkness
    tooth=0.16,                                      # paper tooth strength on shading
    stroke=0.07,                                     # diagonal stroke texture strength on shading
    ink_gain=0.95, ink_tooth=0.12, ink_soft=0.3,     # ink opacity, tooth break-up, blur (px @900)
    mottle=0.012,                                    # paper colour variation
)


def read_layers(path):
    inp = oiio.ImageInput.open(path)
    if inp is None:
        raise IOError(oiio.geterror())
    layers = {}
    sub = 0
    while inp.seek_subimage(sub, 0):
        spec = inp.spec()
        px = inp.read_image(sub, 0, 0, spec.nchannels, oiio.FLOAT)
        for i, ch in enumerate(spec.channelnames):
            layers[ch] = px[:, :, i]
        sub += 1
    inp.close()
    return layers


def get(layers, *names):
    for n in names:
        if n in layers:
            return layers[n]
        for k in layers:
            if k.endswith(n):
                return layers[k]
    raise KeyError(f"{names} not in {sorted(layers)}")


def to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def value_noise(h, w, cell, seed, aspect=(1.0, 1.0), angle=0.0):
    """Smooth value noise with feature size `cell` px, optionally stretched along `angle`."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ca, sa = np.cos(angle), np.sin(angle)
    u = (xx * ca + yy * sa) / (cell * aspect[0])
    v = (-xx * sa + yy * ca) / (cell * aspect[1])
    u -= u.min()
    v -= v.min()
    gw, gh = int(u.max()) + 3, int(v.max()) + 3
    g = rng.random((gh, gw)).astype(np.float32)
    iu, iv = np.floor(u).astype(np.int32), np.floor(v).astype(np.int32)
    fu, fv = u - iu, v - iv
    fu = fu * fu * (3 - 2 * fu)
    fv = fv * fv * (3 - 2 * fv)
    a = g[iv, iu]
    b = g[iv, iu + 1]
    c = g[iv + 1, iu]
    d = g[iv + 1, iu + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def blur(img, sigma):
    if sigma <= 0.05:
        return img
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 0, img)
    return np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 1, out)


def paper_fields(h, w):
    s = h / 900.0
    tooth = (0.6 * value_noise(h, w, 0.9 * s, 11) + 0.3 * value_noise(h, w, 1.8 * s, 12)
             + 0.1 * value_noise(h, w, 5.0 * s, 13))
    tooth = (tooth - tooth.mean()) / (tooth.std() + 1e-6)
    stroke = value_noise(h, w, 1.6 * s, 21, aspect=(1.0, 14.0), angle=np.radians(-58))
    stroke = (stroke - stroke.mean()) / (stroke.std() + 1e-6)
    mottle = value_noise(h, w, 160 * s, 31) - 0.5
    return tooth, stroke, mottle


def composite(path, out_dir):
    L = read_layers(path)
    img = np.stack([get(L, "Image.R", "R"), get(L, "Image.G", "G"), get(L, "Image.B", "B")], -1)
    h, w, _ = img.shape
    tone = to_srgb(img).mean(-1)
    depth = get(L, "Depth.V", "Depth.Z", "Z")
    fs_a = get(L, "Freestyle.A")
    fs_rgb = np.stack([get(L, "Freestyle.R"), get(L, "Freestyle.G"), get(L, "Freestyle.B")], -1)
    s = h / 900.0
    # 1-2: tone and atmosphere
    tone = np.clip(tone, 0, 1) ** (1.0 / P["tone_gamma"])
    t = np.clip((depth - P["air_near"]) / (P["air_far"] - P["air_near"]), 0, 1)
    t = t * t * (3 - 2 * t) * P["air_max"]
    t[depth > 5e3] = 1.0
    tone = tone + (1 - tone) * t
    # 3: graphite shading
    tooth, stroke, mottle = paper_fields(h, w)
    d = (1 - tone) * P["shade_gain"]
    grain = 1 + P["tooth"] * tooth * np.clip(d * 4, 0, 1) + P["stroke"] * stroke * np.clip(d * 3, 0, 1)
    d = np.clip(d * np.clip(grain, 0.2, 2.0), 0, 1)
    # 4: ink. Freestyle colour is premultiplied; its luminance tells how far it faded to paper
    a = np.clip(fs_a, 0, 1)
    ink_lum = to_srgb(np.divide(fs_rgb, np.maximum(a[..., None], 1e-4))).mean(-1)
    ink_dark = np.clip((P_PAPER_L - ink_lum) / (P_PAPER_L - P_INK_L), 0, 1)
    a = blur(a, P["ink_soft"] * s)
    a = a * np.clip(1 + P["ink_tooth"] * tooth, 0.35, 1.3) * P["ink_gain"]
    ink = np.clip(a * ink_dark, 0, 1)
    dark = 1 - (1 - d) * (1 - ink)
    # 5: paper and graphite colours
    paper = np.array(C.PAPER, np.float32) / 255.0
    graph = np.array(C.GRAPHITE, np.float32) / 255.0
    pap = paper[None, None, :] * (1 + P["mottle"] * mottle[..., None])
    out = pap * (1 - dark[..., None]) + graph[None, None, :] * dark[..., None]
    out8 = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    name = os.path.splitext(os.path.basename(path))[0]
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, name + ".png")
    o = oiio.ImageOutput.create(dst)
    o.open(dst, oiio.ImageSpec(w, h, 3, oiio.UINT8))
    o.write_image(out8)
    o.close()
    print(f"[composite] {dst}")
    return dst


P_PAPER_L = float(np.mean(np.array(C.PAPER) / 255.0))
P_INK_L = float(np.mean(np.array(C.GRAPHITE) / 255.0))


def main():
    argv = sys.argv[1:]
    out_dir = C.OUT
    if "--out" in argv:
        i = argv.index("--out")
        out_dir = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    for p in argv:
        composite(p, out_dir)


if __name__ == "__main__":
    main()

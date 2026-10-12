"""Compression test for the pre-rendered ride frames.

    python3 blender/lookdev/encode_test.py [--sizes 1440x900,390x844] [--frames 24]

Needs Pillow + numpy (for the grayscale conversion and crops) and the cwebp / dwebp, avifenc /
avifdec and ssimulacra2 command-line tools (Homebrew: webp, libavif, jpeg-xl).

Input:  blender/lookdev/out/ride{00..23}-<W>x<H>.png (the composited 8-bit masters)
Output: blender/lookdev/out/compress/<W>x<H>/<variant>/... encoded files, decoded PNGs and
        100 % crops of a hairline-dense region, plus results-<W>x<H>.md / .json with mean bytes
        per frame and mean / worst SSIMULACRA2 against the master.

Variants
  webp-q<Q>       cwebp -q Q -m 6 -sharp_yuv -preset drawing        (colour)
  webp-gray-q<Q>  the same from a single-channel (luma) master
  avif-q<Q>       avifenc -q Q -s 4 --yuv 420                          (colour)
  avif-gray-q<Q>  avifenc -q Q -s 4 --yuv 400                          (monochrome)
Grayscale variants are scored against the grayscale master: the drawing is neutral graphite on
a warm paper, and the warm tint can be restored in the page (paper-coloured background with
mix-blend-mode: multiply) at no byte cost.
"""
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WEBP_Q = [50, 60, 70, 80, 90]
AVIF_Q = [40, 50, 60, 70, 80]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(" ".join(cmd) + "\n" + r.stderr)
    return r.stdout


def ssim2(ref, dist):
    out = run(["ssimulacra2", ref, dist]).strip().split()
    return float(out[-1])


def gray_master(src, dst):
    if not os.path.exists(dst):
        Image.open(src).convert("L").save(dst, optimize=True)
    return dst


def job(args):
    variant, src, gsrc, work, name = args
    kind, q = variant.rsplit("-q", 1)
    q = int(q)
    gray = "gray" in kind
    inp = gsrc if gray else src
    ref = gsrc if gray else src
    os.makedirs(work, exist_ok=True)
    if kind.startswith("webp"):
        enc = os.path.join(work, name + ".webp")
        run(["cwebp", "-quiet", "-q", str(q), "-m", "6", "-sharp_yuv", "-preset", "drawing", inp, "-o", enc])
        dec = os.path.join(work, name + ".png")
        run(["dwebp", "-quiet", enc, "-o", dec])
    else:
        enc = os.path.join(work, name + ".avif")
        run(["avifenc", "-q", str(q), "-s", "4", "--yuv", "400" if gray else "420", "-j", "2", inp, enc])
        dec = os.path.join(work, name + ".png")
        run(["avifdec", enc, dec])
    score = ssim2(ref, dec)
    return variant, name, os.path.getsize(enc), score, dec


def crop_box(w, h):
    """A 360 x 240 window over the densest hairlines (upper left facades in the ride view)."""
    cw, ch = int(360 * h / 900), int(240 * h / 900)
    return (int(w * 0.05), int(h * 0.12), int(w * 0.05) + cw, int(h * 0.12) + ch)


def main():
    argv = sys.argv[1:]
    sizes = ["1440x900", "390x844"]
    nfr = 24
    if "--sizes" in argv:
        sizes = argv[argv.index("--sizes") + 1].split(",")
    if "--frames" in argv:
        nfr = int(argv[argv.index("--frames") + 1])
    for size in sizes:
        w, h = (int(v) for v in size.split("x"))
        root = os.path.join(OUT, "compress", size)
        os.makedirs(root, exist_ok=True)
        masters = [os.path.join(OUT, f"ride{k:02d}-{size}.png") for k in range(nfr)]
        masters = [m for m in masters if os.path.exists(m)]
        if not masters:
            print("no masters for", size)
            continue
        gdir = os.path.join(root, "gray-master")
        os.makedirs(gdir, exist_ok=True)
        gm = [gray_master(m, os.path.join(gdir, os.path.basename(m))) for m in masters]
        png_bytes = sum(os.path.getsize(m) for m in masters) / len(masters)
        variants = ([f"webp-q{q}" for q in WEBP_Q] + [f"webp-gray-q{q}" for q in WEBP_Q] +
                    [f"avif-q{q}" for q in AVIF_Q] + [f"avif-gray-q{q}" for q in AVIF_Q])
        jobs = []
        for v in variants:
            for m, g in zip(masters, gm):
                jobs.append((v, m, g, os.path.join(root, v), os.path.splitext(os.path.basename(m))[0]))
        res = {}
        with cf.ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4) // 2)) as ex:
            for (v, name, nbytes, score, dec) in ex.map(job, jobs):
                res.setdefault(v, []).append((name, nbytes, score, dec))
        table = []
        box = crop_box(w, h)
        cdir = os.path.join(root, "crops")
        os.makedirs(cdir, exist_ok=True)
        Image.open(masters[0]).crop(box).save(os.path.join(cdir, "master.png"))
        for v in variants:
            rows = res[v]
            b = [r[1] for r in rows]
            sc = [r[2] for r in rows]
            table.append({"variant": v, "bytes_mean": float(np.mean(b)), "bytes_total": int(np.sum(b)),
                          "ssimulacra2_mean": float(np.mean(sc)), "ssimulacra2_min": float(np.min(sc))})
            first = sorted(rows)[0]
            Image.open(first[3]).crop(box).save(os.path.join(cdir, v + ".png"))
        with open(os.path.join(OUT, f"compress-{size}.json"), "w") as f:
            json.dump({"size": size, "frames": len(masters), "png_bytes_mean": png_bytes, "rows": table}, f, indent=1)
        lines = [f"| variant | bytes/frame | KB/frame | SSIMULACRA2 mean | min |", "|---|---:|---:|---:|---:|"]
        for r in table:
            lines.append(f"| {r['variant']} | {r['bytes_mean']:.0f} | {r['bytes_mean'] / 1024:.1f} | "
                         f"{r['ssimulacra2_mean']:.1f} | {r['ssimulacra2_min']:.1f} |")
        lines.append(f"| PNG master (8-bit) | {png_bytes:.0f} | {png_bytes / 1024:.1f} | - | - |")
        md = "\n".join(lines)
        with open(os.path.join(OUT, f"compress-{size}.md"), "w") as f:
            f.write(md + "\n")
        print(f"== {size} ({len(masters)} frames)\n{md}\n")


if __name__ == "__main__":
    if not shutil.which("cwebp") or not shutil.which("avifenc") or not shutil.which("ssimulacra2"):
        raise SystemExit("needs cwebp/dwebp, avifenc/avifdec and ssimulacra2 on PATH")
    main()

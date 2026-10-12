"""Encode the composited ride frames and write public/media/ride/manifest.json (the contract in
docs/plans/ride-frames-format.md, rev 2: per-variant cameras).

    python3 blender/production/encode_manifest.py [--variants l,p] [--jobs 6] [--dry]

Input:  blender/production/out/frames/<v>/<iiii>.png (8-bit gray, 1 = paper) + out/section.json
Output: public/media/ride/<v>/<iiii>.avif   grayscale (4:0:0) q60, q70 within +-3 frames of a stop
        public/media/ride/<v>/<iiii>.webp   q80 fallback
        public/media/ride/manifest.json
Needs avifenc and cwebp on PATH. --dry writes the manifest with zero byte counts and no images.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
DST = os.path.join(REPO, "public", "media", "ride")
VARIANTS = {"l": {"w": 1600, "h": 1000, "fov": 58}, "p": {"w": 780, "h": 1688, "fov": 58}}


def coarse_to_fine(n):
    """Every 64th frame, then the midpoints at 32, 16, ... 1: each index exactly once."""
    order, seen = [], set()
    step = 64
    while step >= 1:
        for i in range(0, n, step):
            if i not in seen:
                seen.add(i)
                order.append(i)
        step //= 2
    if n - 1 not in seen:
        order.insert(1, n - 1)
    assert sorted(order) == list(range(n))
    return order


def encode(job):
    v, i, q = job
    src = os.path.join(OUT, "frames", v, f"{i:04d}.png")
    d = os.path.join(DST, v)
    a, w = os.path.join(d, f"{i:04d}.avif"), os.path.join(d, f"{i:04d}.webp")
    subprocess.run(["avifenc", "-q", str(q), "-s", "4", "--yuv", "400", "-j", "2", src, a], check=True,
                   capture_output=True)
    subprocess.run(["cwebp", "-quiet", "-q", "80", "-m", "6", "-sharp_yuv", "-preset", "drawing", src, "-o", w],
                   check=True, capture_output=True)
    return v, os.path.getsize(a), os.path.getsize(w)


def main():
    argv = sys.argv[1:]
    variants = argv[argv.index("--variants") + 1].split(",") if "--variants" in argv else ["l", "p"]
    jobs_n = int(argv[argv.index("--jobs") + 1]) if "--jobs" in argv else 6
    dry = "--dry" in argv
    with open(os.path.join(OUT, "section.json")) as f:
        sec = json.load(f)
    frames = sec["frames"]
    n = len(frames)
    stops = sec["stopFrames"]
    near_stop = {i for s in stops for i in range(s - 3, s + 4) if 0 <= i < n}
    bytes_ = {v: {"avif": 0, "webp": 0} for v in VARIANTS}
    if not dry:
        for v in variants:
            os.makedirs(os.path.join(DST, v), exist_ok=True)
        jobs = [(v, i, 70 if i in near_stop else 60) for v in variants for i in range(n)]
        with ThreadPoolExecutor(max_workers=jobs_n) as ex:
            for (v, a, w) in ex.map(encode, jobs):
                bytes_[v]["avif"] += a
                bytes_[v]["webp"] += w
    man = {
        "version": 1,
        "count": n,
        "p": [round(frames[0]["p"], 6), round(frames[-1]["p"], 6)],
        "pAt": [round(f["p"], 6) for f in frames],
        "variants": VARIANTS,
        "formats": ["avif", "webp"],
        "bytes": bytes_,
        "camera": {v: [{"pos": [round(c, 5) for c in f["pos"]],
                        "quat": [round(c, 7) for c in f["quatP" if v == "p" else "quat"]]} for f in frames]
                   for v in ("l", "p")},
        "order": coarse_to_fine(n),
    }
    os.makedirs(DST, exist_ok=True)
    with open(os.path.join(DST, "manifest.json"), "w") as f:
        json.dump(man, f, separators=(",", ":"))
    print(f"[manifest] {n} frames -> {os.path.join(DST, 'manifest.json')}; bytes {json.dumps(bytes_)}")


if __name__ == "__main__":
    main()

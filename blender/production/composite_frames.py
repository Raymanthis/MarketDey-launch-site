"""Composite production passes into gray-on-white frames (the paper tint lives in the page's CSS).

    BPY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13
    $BPY blender/production/composite_frames.py [--variants l,p] [--frames 0-399] [--jobs 4]

Reads out/passes/<v>/<iiii>.exr, writes out/frames/<v>/<iiii>.png (8-bit gray, 1 = paper).
Atmospheric fade follows the section's fog: none while looking down from the map height, fading in
over the tilt (near 60 + (1 - e1) * 3000 m, far 290 + (1 - e1) * 6000 m, as in the section).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lookdev"))
OUT = os.path.join(HERE, "out")


def sstep(a, b, v):
    t = min(1.0, max(0.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def one(job):
    v, i, e = job
    import composite as K
    e1 = sstep(0, 1, e)
    K.P.update(white=True, air_near=45.0 + (1 - e1) * 3000, air_far=260.0 + (1 - e1) * 6000)
    src = os.path.join(OUT, "passes", v, f"{i:04d}.exr")
    if not os.path.exists(src):
        return None
    return K.composite(src, os.path.join(OUT, "frames", v))


def main():
    argv = sys.argv[1:]
    variants = ["l", "p"]
    jobs_n = 4
    with open(os.path.join(OUT, "section.json")) as f:
        frames = json.load(f)["frames"]
    todo = list(range(len(frames)))
    if "--variants" in argv:
        variants = argv[argv.index("--variants") + 1].split(",")
    if "--jobs" in argv:
        jobs_n = int(argv[argv.index("--jobs") + 1])
    if "--frames" in argv:
        spec, todo = argv[argv.index("--frames") + 1], []
        for part in spec.split(","):
            if "-" in part:
                a, b = part.split("-")
                todo += list(range(int(a), int(b) + 1))
            else:
                todo.append(int(part))
    jobs = [(v, i, frames[i]["e"]) for v in variants for i in todo]
    with ProcessPoolExecutor(max_workers=jobs_n) as ex:
        for r in ex.map(one, jobs):
            pass
    print(f"[composite_frames] {len(jobs)} frames")


if __name__ == "__main__":
    main()

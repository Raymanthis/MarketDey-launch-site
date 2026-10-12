"""Render production frames of city.blend: EEVEE tone layer + Freestyle ink layer -> EXR passes.

    blender -b --factory-startup -P blender/production/render_frames.py -- --frames 0-399 [--variants l,p]
        [--frames 0,28,110]  [--samples 64]  [--skip-existing]

Camera i comes from section.json frames[i] (the section's camera at pAt[i], Three.js scene
coordinates), converted to Blender; the portrait variant uses frames[i].quatP (contract rev 2). The city root is scaled in z by frames[i].grow, as the section
scales `city` during the tilt. Writes out/passes/<variant>/<iiii>.exr; then
`$BPY blender/lookdev/composite.py --white ...` turns them into frames over white paper.
"""
import json
import math
import os
import sys
import time

import bpy
from mathutils import Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lookdev"))
import materials  # noqa: E402
import render as R  # noqa: E402

OUT = os.path.join(HERE, "out")
VARIANTS = {"l": (1600, 1000), "p": (780, 1688)}
Q_THREE_TO_BLENDER = Quaternion((1, 0, 0), math.radians(90))


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"frames": None, "variants": ["l", "p"], "samples": 64, "skip": False}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == "--frames":
            spec = argv[i + 1]
            fr = []
            for part in spec.split(","):
                if "-" in part:
                    a, b = part.split("-")
                    fr += list(range(int(a), int(b) + 1))
                else:
                    fr.append(int(part))
            o["frames"] = fr
            i += 2
        elif k == "--variants":
            o["variants"] = argv[i + 1].split(",")
            i += 2
        elif k == "--samples":
            o["samples"] = int(argv[i + 1])
            i += 2
        elif k == "--worker":           # i/n: render every n-th frame starting at i (parallel workers)
            o["worker"] = tuple(int(x) for x in argv[i + 1].split("/"))
            i += 2
        elif k == "--skip-existing":
            o["skip"] = True
            i += 1
        else:
            i += 1
    return o


def set_camera(scene, fr, variant="l"):
    cam = scene.camera
    if cam is None:
        cd = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cd)
        scene.collection.objects.link(cam)
        scene.camera = cam
    p = fr["pos"]
    cam.location = Vector((p[0], -p[2], p[1]))
    qx, qy, qz, qw = fr["quatP"] if variant == "p" and "quatP" in fr else fr["quat"]
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = Q_THREE_TO_BLENDER @ Quaternion((qw, qx, qy, qz))
    cd = cam.data
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24.0
    cd.lens = 12.0 / math.tan(math.radians(58.0) / 2)
    cd.clip_start = 0.1
    cd.clip_end = 700.0


def main():
    o = args()
    with open(os.path.join(OUT, "section.json")) as f:
        sec = json.load(f)
    frames = sec["frames"]
    todo = o["frames"] if o["frames"] is not None else list(range(len(frames)))
    if o.get("worker"):
        wi, wn = o["worker"]
        todo = todo[wi::wn]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "city.blend"))
    scene = bpy.context.scene
    R.setup_render(scene, o["samples"])
    R.setup_world(scene)
    R.setup_sun(scene)
    scene.render.threads_mode = "AUTO"          # all cores (Freestyle itself is single-threaded)
    root = bpy.data.objects["city"]
    times = {}
    for v in o["variants"]:
        w, h = VARIANTS[v]
        scene.render.resolution_x, scene.render.resolution_y = w, h
        R.setup_freestyle(scene, h / 900.0)
        materials.set_pixel_scale(2.0 * math.tan(math.radians(58.0) / 2) / h)
        d = os.path.join(OUT, "passes", v)
        os.makedirs(d, exist_ok=True)
        for i in todo:
            name = f"{i:04d}"
            if o["skip"] and os.path.exists(os.path.join(d, name + ".exr")):
                continue
            fr = frames[i]
            set_camera(scene, fr, v)
            root.scale = (1.0, 1.0, fr["grow"])
            R.setup_compositor(scene, d, name)
            t0 = time.time()
            bpy.ops.render.render(write_still=False)
            dt = time.time() - t0
            times.setdefault(v, []).append(dt)
            print(f"[frame] {v}/{name} p={fr['p']:.5f} {dt:.1f} s", flush=True)
    for v, ts in times.items():
        print(f"[frames-summary] {v}: {len(ts)} frames, mean {sum(ts) / len(ts):.1f} s, max {max(ts):.1f} s")


if __name__ == "__main__":
    main()

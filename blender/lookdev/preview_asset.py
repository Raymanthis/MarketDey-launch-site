"""Turntable-style look-dev of one asset in the full pencil look (fast iteration on models).

    blender -b --factory-startup -P blender/lookdev/preview_asset.py -- keke [--size 960x600]
    BPY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13
    $BPY blender/lookdev/composite.py blender/lookdev/out/passes/pv-keke-*.exr

Assets: sedan, suv, danfo, keke, okada, almond, palm, people. Renders three views (front
three-quarter, side, rear three-quarter) at eye height on a plain road.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import geo  # noqa: E402
import materials  # noqa: E402
import render as R  # noqa: E402


def build(asset):
    import trees
    import vehicles
    if asset == "sedan":
        vehicles.sedan("pv", (0, 0, 0), 0.0)
        return 4.8, (0, 2.4, 0.7)
    if asset == "suv":
        vehicles.sedan("pv", (0, 0, 0), 0.0, paint="paint_mid", suv=True)
        return 4.8, (0, 2.4, 0.8)
    if asset == "danfo":
        vehicles.danfo("pv", (0, 0, 0), 0.0)
        return 4.6, (0, 2.3, 1.0)
    if asset == "keke":
        vehicles.keke("pv", (0, 0, 0), 0.0)
        return 2.7, (0, 0.0, 0.85)
    if asset == "okada":
        M = vehicles.okada("pv", (0, 0, 0), 0.0)
        return 2.0, (0, 0.6, 0.7), [("rider_m", tuple(M @ Vector((0, 0.3, -0.07))), math.pi)]
    if asset == "almond":
        trees.almond("pv", 0, 0, 1.0, seed=3)
        return 9.0, (0, 0, 4.0)
    if asset == "neem":
        trees.rounded_tree("pv", 0, 0, 1.0, seed=5)
        return 9.0, (0, 0, 4.0)
    if asset == "palm":
        trees.oil_palm("pv", 0, 0, 8.4, seed=2)
        return 10.0, (0, 0, 5.0)
    if asset == "people":
        return 6.0, (0, 0, 0.9), [(n, (-2.6 + i * 0.75, 0, 0.002), 0.0) for i, n in enumerate(
            ["walker_m", "trader_f", "stand_m", "talk_f", "walker_f", "walker_m2", "seated_m"])]
    raise SystemExit("unknown asset " + asset)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    asset = argv[0]
    size = (960, 600)
    if "--size" in argv:
        size = tuple(int(v) for v in argv[argv.index("--size") + 1].split("x"))
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    mats = materials.build_all()
    res = build(asset)
    extent, target = res[0], Vector(res[1])
    people = res[2] if len(res) > 2 else []
    G = geo.get("ground", "nolines")
    G.box((-30, -30, -0.3), (30, 30, 0.0), mat="road")
    geo.finalize(mats)
    if people:
        import build_scene
        build_scene.add_people(people)
    scene = bpy.context.scene
    R.setup_render(scene, 32)
    R.setup_world(scene)
    R.setup_sun(scene)
    w, h = size
    scene.render.resolution_x, scene.render.resolution_y = w, h
    R.setup_freestyle(scene, h / 900.0)
    materials.set_pixel_scale(2.0 * math.tan(math.radians(C.FOV) / 2) / h)
    d = extent * 0.8 + 1.6
    views = {"front": (0.55, 0.85), "side": (1.0, 0.0), "rear": (0.6, -0.8)}
    os.makedirs(C.PASSES, exist_ok=True)
    for name, (vx, vy) in views.items():
        pos = target + Vector((vx, vy, 0)).normalized() * d
        pos.z = 1.6 if extent < 7 else 1.75
        R.setup_camera(scene, {"pos": tuple(pos), "target": tuple(target)})
        R.setup_compositor(scene, C.PASSES, f"pv-{asset}-{name}")
        bpy.ops.render.render(write_still=False)
        print(f"[preview] {asset} {name}")


if __name__ == "__main__":
    main()

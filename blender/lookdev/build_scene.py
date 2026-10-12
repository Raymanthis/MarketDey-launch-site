"""Build the look-development street and save blender/lookdev/out/scene.blend.

    blender -b --factory-startup -P blender/lookdev/build_scene.py

Street block, buildings, poles and wires (street.py), trees (trees.py), vehicles
(vehicles.py) and the MakeHuman pedestrians from blender/assets/people/people.blend.
All randomness is seeded.
"""
import math
import os
import sys
import time

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import geo  # noqa: E402
import materials  # noqa: E402
import street  # noqa: E402

try:
    import trees  # noqa: E402
except ImportError:
    trees = None
try:
    import vehicles  # noqa: E402
except ImportError:
    vehicles = None

PEOPLE_BLEND = os.path.join(C.REPO, "blender", "assets", "people", "people.blend")
BASE = street.BASE


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials, bpy.data.node_groups):
        for d in list(coll):
            coll.remove(d)


def poles_and_wires():
    lp = [(-5.3, 8.0), (-5.3, 39.6), (-5.3, 92.0)]
    arms = [street.pole("pole0", *lp[0]), street.pole("pole1", *lp[1], transformer=True),
            street.pole("pole2", *lp[2], lamp=True)]
    arm_r = street.pole("pole3", 5.1, 71.0, h=8.6, cross_dir=-1)
    for span in range(2):
        a, b = arms[span][2.4], arms[span + 1][2.4]
        for k, idx in enumerate((0, 1, 3)):
            street.wire(f"wire_p{span}{k}", street.catenary(a[idx], b[idx], sag=0.7 + 0.15 * k + 0.1 * span, n=40))
    a, b = arms[1][1.7], arms[2][1.7]
    street.wire("wire_t0", street.catenary(a[0], b[0], 1.5, 48, tangle=0.18, seed=3))
    street.wire("wire_t1", street.catenary(a[0] + Vector((0.05, 0, -0.03)), b[0] + Vector((0.04, 0, 0.02)), 1.65, 48,
                                            tangle=0.22, seed=8))
    street.wire("wire_x0", street.catenary(arms[1][2.4][3], arm_r[2.4][0], 0.9, 40, tangle=0.05, seed=5))
    # service drops from pole1 to the buildings either side, and one across the street
    street.wire("wire_d0", street.catenary(arms[1][1.7][1], Vector((-6.2, 47.5, BASE + 5.8)), 0.4, 24, seed=6))
    street.wire("wire_d2", street.catenary(arms[1][2.4][3], Vector((6.0, 45.5, BASE + 6.2)), 0.6, 30, tangle=0.04, seed=9))
    street.wire("wire_d3", street.catenary(arms[1][2.4][2], Vector((6.0, 36.0, BASE + 9.0)), 0.5, 30, seed=10))
    street.wire("wire_d1", street.catenary(arms[0][1.7][1], Vector((-6.2, 13.0, BASE + 5.2)), 0.35, 24, seed=7))
    # an earlier span arriving from behind the camera, so wires cross the sky in shot (a)
    street.wire("wire_b0", street.catenary(Vector((-5.0, -34.0, 8.9)), arms[0][2.4][0], 0.8, 40))
    street.wire("wire_b1", street.catenary(Vector((-5.6, -34.0, 8.9)), arms[0][2.4][1], 0.85, 40))
    street.wire("wire_b2", street.catenary(Vector((-4.1, -34.0, 8.9)), arms[0][2.4][3], 0.9, 40))


def add_people(placements):
    if not os.path.exists(PEOPLE_BLEND):
        print("[build] people.blend missing, skipping people")
        return
    with bpy.data.libraries.load(PEOPLE_BLEND, link=False) as (src, dst):
        dst.meshes = list(src.meshes)
    mats = {m.name: m for m in bpy.data.materials}
    coll = bpy.data.collections["figures"]
    for (name, pos, heading) in placements:
        me = bpy.data.meshes.get(name)
        if me is None:
            print("[build] no person", name)
            continue
        # people.blend carries placeholder materials named by tone class: swap in ours
        for i, m in enumerate(me.materials):
            base = m.name.split(".")[0] if m else "top"
            me.materials[i] = mats.get(base, mats["top"])
        ob = bpy.data.objects.new(name + "_" + str(len(coll.objects)), me)
        ob.location = Vector(pos)
        ob.rotation_euler = (0, 0, heading)
        coll.objects.link(ob)


def main():
    t0 = time.time()
    clear()
    mats = materials.build_all()
    infos = street.build_block()
    poles_and_wires()
    street.bench("bench0", 6.15, 78.6)
    street.kiosk("kiosk0", -5.2, 67.0, 1)
    import random
    srng = random.Random(21)
    for k, yy in enumerate((45.6, 48.6)):
        street.umbrella_stall(f"umb{k}", 5.2, yy, srng)
    people = [
        # (person, position, heading). A person faces -Y at heading 0; heading pi faces +Y.
        ("trader_f", (4.7, 33.0, BASE + 0.002), 0.0),
        ("stand_m", (5.7, 42.2, BASE + 0.002), math.pi / 2),
        ("walker_m2", (-4.7, 41.0, BASE + 0.002), math.pi),
        ("talk_f", (-4.2, 66.6, BASE + 0.002), -math.pi / 2 + 0.3),
        ("walker_f", (5.0, 58.0, BASE + 0.002), 0.0),
        ("walker_m", (4.75, 39.4, BASE + 0.002), 0.15),          # shot (b) foreground pedestrian
        ("seated_m", (6.05, 78.6, BASE - 0.43), math.pi / 2),     # on the bench by the shop
    ]
    if trees:
        trees.build_all()
    if vehicles:
        people += vehicles.build_all()
    stats = geo.finalize(mats)
    add_people(people)
    os.makedirs(C.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=C.BLEND, compress=True)
    print(f"[build_scene] {stats['objects']} objects, faces {stats['faces_in']} -> {stats['faces_out']}, "
          f"{time.time() - t0:.1f} s -> {C.BLEND}")


if __name__ == "__main__":
    main()

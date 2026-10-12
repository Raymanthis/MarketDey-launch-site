"""Build the production street from the section export and save blender/production/out/city.blend.

    node blender/production/export_section.mjs
    blender -b --factory-startup -P blender/production/build_city.py

Reuses the look-development builders (blender/lookdev/) for facades, trees, vehicles, people and
materials; city.py places everything where the section places it.
"""
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import city  # noqa: E402
import geo  # noqa: E402
import materials  # noqa: E402
import street  # noqa: E402

BLEND = os.path.join(city.OUT, "city.blend")


def main():
    t0 = time.time()
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    city.load()
    mats = materials.build_all()
    street.FL = 3.0                    # the section's storey height
    street.BASE = 0.0
    street.CLUTTER.update(ac=(1, 3), dish=0.3, tiles=0.35)
    street.SIGN_HOOK = city.sign_hook
    root = bpy.data.objects.new("city", None)        # scaled in z during the tilt (city.scale.y)
    bpy.context.scene.collection.objects.link(root)
    geo.PARENT = root
    city.build_road()
    nb = city.place_buildings()
    city.build_landmarks()
    city.place_poles()
    city.place_lamps()
    city.place_trees()
    nv = city.place_vehicles()
    npl, nst, npk = city.place_street_life()
    t1 = time.time()
    stats = geo.finalize(mats)
    geo.PARENT = None
    city.build_ground()
    nt = city.make_lettering(root)
    npp = city.add_people(root)
    # road surfaces and ground are not part of the growing city
    for name in ("asphalt", "far_ground", "verge_ground", "patches", "road_paint"):
        ob = bpy.data.objects.get(name)
        if ob is not None:
            ob.parent = None
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    print(f"[build_city] {nb} buildings, {nv}+{npk} vehicles, {nst} extra stalls, {npp} people, {nt} signs; "
          f"{stats['objects']} objects, {stats['faces_out']} faces; build {t1 - t0:.1f} s + finalize {time.time() - t1:.1f} s"
          f" -> {BLEND}")


if __name__ == "__main__":
    main()

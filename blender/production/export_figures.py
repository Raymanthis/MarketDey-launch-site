"""Export only the street's vehicles and people (for the site's ?ride=hybrid mode).

    blender -b --factory-startup blender/production/out/city.blend -P blender/production/export_figures.py
    blender -b ... -P blender/production/export_figures.py -- --only lite

Hybrid mode draws the buildings, road, trees and signage as the procedural line art and takes
only the figures from Blender. Same pipeline as export_glb.py (flat palette colours baked per
face, no normals or textures, gltfpack + meshopt), but with far more triangles per figure now
that the buildings are not in the file:

  vehicles  every veh* (the section's own vehicles), xp* (parked) and ok* (okadas): planar
            dissolve, then a gentle collapse; all parts of one vehicle joined into one node
            (per-vehicle frustum culling).
  people    the 8 shared person meshes collapse-decimated once (instanced on the site).

Node `figures` holds everything; it is added to the site's growing `city` group. Writes
public/media/street/figures.glb (desktop) and figures-lite.glb (phones).
"""
import math
import os
import re
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_glb as E  # noqa: E402

VEHICLES = ("veh", "xp", "ok")
# Fills sit close to paper so the figures read as line drawings like the buildings, with the ink
# outline doing the work. People get their own near-paper palette (6-12 % darker than paper at most,
# a warm tint for skin so it never reads as bare paper); vehicles keep 40 % of their tone.
PAPER = np.array([0xF7, 0xF5, 0xEF], np.float32) / 255
TONE_KEEP = {"vehicles": 0.4}
PEOPLE_TONES = {
    "skin": "#e4d8c8", "hair": "#d8d4cb", "shoes": "#d8d4cb", "top": "#f7f5ef", "cloth_light": "#f2f0e8",
    "bottom": "#e6e4dd", "cloth_dark": "#e1dfd7", "basin": "#ebe7dc", "goods": "#e6e0d1",
}


def bake_people(me):
    """Per-face people tone (PEOPLE_TONES by material, unknown -> paper) with a very soft sun term."""
    n = len(me.polygons)
    nr = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("normal", nr)
    mi = np.empty(n, np.int32)
    me.polygons.foreach_get("material_index", mi)
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_total", lt)
    tones = np.array([[int(PEOPLE_TONES.get(m.name if m else "", "#f7f5ef")[k:k + 2], 16) / 255 for k in (1, 3, 5)]
                      for m in me.materials] or [[0.97, 0.96, 0.94]], np.float32)
    h = 0.5 + 0.5 * (nr.reshape(n, 3) @ np.array(E.SUN, np.float32))
    srgb = np.clip(tones[np.clip(mi, 0, len(tones) - 1)] * (0.95 + 0.05 * h)[:, None], 0, 1)
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    rgba = np.concatenate([lin, np.ones((n, 1), np.float32)], axis=1)
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", np.repeat(rgba, lt, axis=0).astype(np.float32).ravel())
    me.color_attributes.active_color = ca


def toward_paper(me, keep):
    ca = me.color_attributes.get("Col")
    if ca is None or not len(ca.data):
        return
    c = np.empty(len(ca.data) * 4, np.float32)
    ca.data.foreach_get("color", c)
    c = c.reshape(-1, 4)
    lin = np.clip(c[:, :3], 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    srgb = PAPER + (srgb - PAPER) * keep
    c[:, :3] = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    ca.data.foreach_set("color", c.ravel())
VARIANTS = {
    # people: triangles per person mesh; vehicles: (min tris, collapse ratio) per joined vehicle
    "desktop": dict(out="figures.glb", person=4200, vehicle=(1400, 0.62)),
    "lite": dict(out="figures-lite.glb", person=1500, vehicle=(500, 0.3)),
}


def vehicle_tag(name):
    m = re.match(r"^((?:veh|xp|ok)\d+)", name)
    return m.group(1) if m else None


def build(name, cfg):
    bpy.ops.wm.revert_mainfile()
    scene = bpy.context.scene
    fill = bpy.data.materials.new("fill")
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render]
    people = [o for o in meshes if o.name.startswith(E.PEOPLE)]
    vehicles = [o for o in meshes if vehicle_tag(o.name)]
    keep = set(map(id, people + vehicles))
    for o in [o for o in meshes if id(o) not in keep]:
        bpy.data.objects.remove(o, do_unlink=True)

    done = {}
    for o in people:
        key = o.data.name
        if key not in done:
            r = min(1.0, cfg["person"] / max(1, E.tris_of(o.data)))
            me = E.apply_decimate(o, decimate_type="COLLAPSE", ratio=r, use_collapse_triangulate=True)
            me.name = "person_" + key
            done[key] = me
        o.data = done[key]
    for me in done.values():
        bake_people(me)
        me.materials.clear()
        me.materials.append(fill)
        me.polygons.foreach_set("material_index", np.zeros(len(me.polygons), np.int32))

    groups = {}
    for o in vehicles:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data = E.apply_decimate(o, decimate_type="DISSOLVE", angle_limit=math.radians(0.5), delimit={"MATERIAL"},
                                  use_dissolve_boundaries=False)
        E.bake_colours(o, world=True)
        toward_paper(o.data, TONE_KEEP["vehicles"])
        E.unparent_keep(o)
        E.apply_transform(o)
        groups.setdefault(vehicle_tag(o.name), []).append(o)
    lim, ratio = cfg["vehicle"]
    joined = []
    for tag, obs in sorted(groups.items()):
        v = E.join(obs, tag)
        if v is None:
            continue
        n = E.tris_of(v.data)
        if n > lim:
            want = max(ratio * n, lim)
            v.data = E.apply_decimate(v, decimate_type="COLLAPSE", ratio=want / n, use_collapse_triangulate=True)
        E.set_single_material(v, fill)
        joined.append(v)

    root = bpy.data.objects.new("figures", None)
    scene.collection.objects.link(root)
    for o in joined:
        o.parent = root
    for o in people:
        E.unparent_keep(o)
        o.parent = root
        o.name = "p_" + o.name
    for o in list(scene.objects):
        if o not in set(joined + people + [root]):
            bpy.data.objects.remove(o, do_unlink=True)

    vt = sum(E.tris_of(o.data) for o in joined)
    pu = sum(E.tris_of(me) for me in done.values())
    pd = sum(E.tris_of(o.data) for o in people)
    E.log(f"{name}: {len(joined)} vehicles {vt:,} tris; people {len(people)} x {[E.tris_of(m) for m in done.values()]} "
          f"-> unique {vt + pu:,}, drawn {vt + pd:,}")
    os.makedirs(E.RAW_DIR, exist_ok=True)
    raw = os.path.join(E.RAW_DIR, cfg["out"].replace(".glb", "-raw.glb"))
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format="GLB", use_selection=False, export_yup=True, export_apply=False,
        export_normals=False, export_texcoords=False, export_tangents=False, export_materials="EXPORT",
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_attributes=False,
        export_animations=False, export_cameras=False, export_lights=False, export_extras=False)
    return raw, vt + pu, vt + pd


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    report = []
    for name, cfg in VARIANTS.items():
        if only and name != only:
            continue
        raw, uniq, drawn = build(name, cfg)
        out = os.path.join(E.PUB_DIR, cfg["out"])
        size = E.compress(raw, out)
        report.append((name, uniq, drawn, size, out))
    for name, uniq, drawn, size, out in report:
        E.log(f"RESULT {name}: {uniq:,} unique tris, {drawn:,} drawn tris, {size:,} bytes ({size / 1048576:.2f} MB) -> {out}")


if __name__ == "__main__":
    main()

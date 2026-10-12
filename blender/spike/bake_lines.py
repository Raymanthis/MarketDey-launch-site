"""★0 sketch spike: bake block.blend into the browser line format.

    blender -b --factory-startup -P blender/spike/bake_lines.py

Writes, per docs/plans/sketch-spike-format.md:
    public/media/spike/lines.bin   int16-quantised segments, 14-byte stride, Y-up
    public/media/spike/lines.json  header (count, bounds, classes, features)
    public/media/spike/fills.glb   white occluder geometry (no materials), Y-up
    public/media/spike/camera.json 20 frames dollying down the driving lane

Which edges are exported depends on each object's `bake_mode` prop (set by build_block.py):
    edges       boundary edges, creases with dihedral > 25 deg, material boundaries, loose edges
    smooth      round things (poles, people, wheels, trunks, pipes): boundary, creases > 60 deg,
                plus silhouettes as seen from the camera at frame 10 (a baked, view-dependent
                approximation; faceted cylinders would otherwise export every facet edge)
    centerline  objects made only of thin quads (grille bars, slats, corrugations, joints, leaf
                strokes): one segment per quad, between the midpoints of its two short edges
    curve       wires: the catenary polyline stored in the 'polyline' prop
    none        occluders only (canopy volumes, ground)
Coplanar triangulation / quad-split edges drop out by the angle test; exact duplicates
(either direction, 1 mm grid) are removed globally.
"""
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

CREASE = math.radians(25.0)
CREASE_SMOOTH = math.radians(60.0)


def obj_bmesh(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    if ob.matrix_world != ob.matrix_world.Identity(4):
        bm.transform(ob.matrix_world)
    bm.normal_update()
    return bm


def edges_mode(ob, eye=None, crease=CREASE):
    bm = obj_bmesh(ob)
    out = []
    for e in bm.edges:
        lf = e.link_faces
        keep = False
        if len(lf) < 2 or len(lf) > 2:
            keep = True
        else:
            f1, f2 = lf[0], lf[1]
            if f1.material_index != f2.material_index:
                keep = True
            elif f1.normal.angle(f2.normal, 0.0) > crease:
                keep = True
            elif eye is not None:
                s1 = f1.normal.dot(eye - f1.calc_center_median())
                s2 = f2.normal.dot(eye - f2.calc_center_median())
                keep = (s1 > 0) != (s2 > 0)
        if keep:
            a, b = e.verts[0].co, e.verts[1].co
            out.append((a.x, a.y, a.z, b.x, b.y, b.z))
    bm.free()
    return out


def centerline_mode(ob):
    bm = obj_bmesh(ob)
    out = []
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        if len(vs) != 4:
            continue
        el = [((vs[i] - vs[(i + 1) % 4]).length, i) for i in range(4)]
        # the two short edges are opposite each other in a strip quad: (0,2) or (1,3)
        if el[0][0] + el[2][0] <= el[1][0] + el[3][0]:
            i, j = 0, 2
        else:
            i, j = 1, 3
        a = (vs[i] + vs[(i + 1) % 4]) * 0.5
        b = (vs[j] + vs[(j + 1) % 4]) * 0.5
        out.append((a.x, a.y, a.z, b.x, b.y, b.z))
    bm.free()
    return out


def curve_mode(ob):
    pts = json.loads(ob["polyline"])
    return [tuple(pts[i]) + tuple(pts[i + 1]) for i in range(len(pts) - 1)]


def bake():
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=C.BLEND)
    fr = C.camera_frames()[C.RENDER_FRAME]
    eye = Vector(C.three_to_blender(fr["pos"]))
    segs, cls_ids, feat_ids = [], [], []
    per_mode = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH" or "bake_mode" not in ob:
            continue
        mode = ob["bake_mode"]
        if mode == "none":
            continue
        if mode == "edges":
            s = edges_mode(ob)
        elif mode == "smooth":
            s = edges_mode(ob, eye=eye, crease=CREASE_SMOOTH)
        elif mode == "centerline":
            s = centerline_mode(ob)
        elif mode == "curve":
            s = curve_mode(ob)
        else:
            raise ValueError(f"{ob.name}: unknown bake_mode {mode}")
        ci = C.CLASSES.index(ob["line_class"])
        fi = C.FEATURES.index(ob["feature"])
        segs.extend(s)
        cls_ids.extend([ci] * len(s))
        feat_ids.extend([fi] * len(s))
        per_mode[mode] = per_mode.get(mode, 0) + len(s)
    S = np.array(segs, dtype=np.float64).reshape(-1, 6)
    ci = np.array(cls_ids, dtype=np.uint8)
    fi = np.array(feat_ids, dtype=np.uint8)
    # Blender Z-up -> Three Y-up: (x, y, z) -> (x, z, -y)
    T = np.empty_like(S)
    for k in (0, 3):
        T[:, k + 0] = S[:, k + 0]
        T[:, k + 1] = S[:, k + 2]
        T[:, k + 2] = -S[:, k + 1]
    # drop degenerate, dedupe (direction-independent, 1 mm grid)
    ln = np.linalg.norm(T[:, :3] - T[:, 3:], axis=1)
    ok = ln > 0.003
    T, ci, fi = T[ok], ci[ok], fi[ok]
    q = np.round(T * 1000).astype(np.int64)
    a, b = q[:, :3], q[:, 3:]
    first = (a[:, 0] < b[:, 0]) | ((a[:, 0] == b[:, 0]) & ((a[:, 1] < b[:, 1]) | ((a[:, 1] == b[:, 1]) & (a[:, 2] <= b[:, 2]))))
    key = np.where(first[:, None], np.hstack([a, b]), np.hstack([b, a]))
    _, uniq = np.unique(key, axis=0, return_index=True)
    uniq.sort()
    n_before = len(T)
    T, ci, fi = T[uniq], ci[uniq], fi[uniq]
    # bounds + quantise
    pts = T.reshape(-1, 3)
    mn = np.floor(pts.min(axis=0) * 100 - 1) / 100
    mx = np.ceil(pts.max(axis=0) * 100 + 1) / 100
    mn = [round(float(v), 2) for v in mn]
    mx = [round(float(v), 2) for v in mx]
    mn_a, mx_a = np.array(mn), np.array(mx)
    Q = np.round((pts - mn_a) / (mx_a - mn_a) * 65535.0 - 32768.0)
    Q = np.clip(Q, -32768, 32767).astype("<i2").reshape(-1, 6)
    rec = np.zeros(len(Q), dtype=[("p", "<i2", (6,)), ("c", "u1"), ("f", "u1")])
    rec["p"], rec["c"], rec["f"] = Q, ci, fi
    assert rec.dtype.itemsize == 14
    os.makedirs(C.MEDIA, exist_ok=True)
    bin_path = os.path.join(C.MEDIA, "lines.bin")
    rec.tofile(bin_path)
    header = {
        "version": 1,
        "count": int(len(rec)),
        "min": mn,
        "max": mx,
        "stride": 14,
        "classes": C.CLASSES,
        "features": C.FEATURES,
    }
    with open(os.path.join(C.MEDIA, "lines.json"), "w") as f:
        json.dump(header, f, indent=2)
        f.write("\n")
    with open(os.path.join(C.MEDIA, "camera.json"), "w") as f:
        json.dump({"fov": C.FOV, "frames": C.camera_frames()}, f, indent=1)
        f.write("\n")
    print(f"[bake] segments: {n_before} raw -> {len(rec)} after dedupe; by mode {per_mode}")
    for i, c in enumerate(C.CLASSES):
        print(f"[bake]   class {c:9s} {int((ci == i).sum()):7d}")
    for i, c in enumerate(C.FEATURES):
        n = int((fi == i).sum())
        if n:
            print(f"[bake]   feature {c:9s} {n:7d}")
    print(f"[bake] bounds min {mn} max {mx}")
    export_fills()
    print(f"[bake] done in {time.time() - t0:.1f} s")


def export_fills():
    bm = bmesh.new()
    n_src = 0
    for ob in bpy.data.objects:
        if ob.type != "MESH" or not ob.get("fill"):
            continue
        tmp = obj_bmesh(ob)
        me = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        n_src += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.001)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("fills")
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    for p in me.polygons:
        p.material_index = 0
    scene = bpy.data.scenes.new("fills_export")
    ob = bpy.data.objects.new("fills", me)
    scene.collection.objects.link(ob)
    bpy.context.window.scene = scene
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    path = os.path.join(C.MEDIA, "fills.glb")
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
              export_materials="NONE", export_normals=False, export_texcoords=False,
              export_apply=False, export_extras=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print("[bake] gltf option fallback:", e)
        for k in ("export_texcoords", "export_extras", "export_cameras", "export_lights"):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    print(f"[bake] fills.glb: {n_src} source objects, {len(me.vertices)} verts, {len(me.polygons)} tris, "
          f"{os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    bake()

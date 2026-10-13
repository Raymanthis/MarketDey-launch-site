"""Export the production street (out/city.blend) as real-time glTF for the site's ?ride=model mode.

    blender -b --factory-startup blender/production/out/city.blend -P blender/production/export_glb.py
    blender -b ... -P blender/production/export_glb.py -- --only lite      # one variant

Works on the loaded file in memory and never saves it (each variant reverts to the file on disk).
Per variant:

  1. reduce   people (8 shared meshes) and almond canopies are collapse-decimated to a fixed
              triangle budget; everything else gets a planar dissolve (removes the coplanar splits
              the booleans leave) and, for the lite file, a collapse pass on heavy objects.
              Sub-centimetre objects are dropped (the lite file also drops shop lettering).
  2. colour   every face gets one flat fill colour: its material's pencil albedo
              (blender/lookdev/materials.py SPECS) quantised to a 12-tone paper palette, times a
              very soft baked sun term. Stored as COLOR_0 (linear floats); no normals, no UVs,
              no textures. The site draws the ink lines in a screen-space edge pass.
  3. group    node `city` (grows during the tilt): static geometry split face-by-face into chunks
              of CHUNK metres of road (frustum culling), `wires` (drawn without edge detection) and
              the people as shared meshes (-> EXT_mesh_gpu_instancing). Node `ground`: the
              unparented road surfaces and ground, which do not grow.
  4. compress Blender glTF export (+Y up: Blender (x, y, z) -> three (x, z, -y), the inverse of
              city.py's three_to_blender), then `npx @gltf-transform/cli instance` and
              `npx gltfpack` (EXT_meshopt_compression, float positions, 8-bit colours). Both are
              fetched by npx at pinned versions; nothing is added to package.json.

Outputs: public/media/street/city.glb (desktop) and city-lite.glb (phones); raw exports stay in
blender/production/out/glb/. Prints triangle counts (unique and drawn) and byte sizes.
"""
import math
import os
import subprocess
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "blender", "lookdev"))
sys.path.insert(0, HERE)
import city  # noqa: E402
from materials import SPECS  # noqa: E402

RAW_DIR = os.path.join(HERE, "out", "glb")
PUB_DIR = os.path.join(REPO, "public", "media", "street")
CHUNK = 50.0            # metres of road per chunk

# 12-tone fill palette (sRGB). Paper family for walls/roofs, ink for ink-geometry, site green.
PALETTE = {
    "paper": "#f7f5ef", "t1": "#eeebe3", "t2": "#e4e0d6", "t3": "#d7d2c7", "t4": "#c6c0b4",
    "t5": "#aea89b", "t6": "#8f897d", "t7": "#625d53", "ink": "#2a2823",
    "green": "#4f772d", "foliage": "#e0e4cf", "canopy": "#f2e7bb",
}
TONE_OVERRIDE = {
    "gate_green": "green", "foliage": "foliage", "foliage_dark": "foliage", "canopy_yellow": "canopy",
    "Material": "paper", "paint": "t3",     # road paint is a flat decal: its tone is all that shows
}
SHADE_MUL = {"foliage_dark": 0.94}      # second canopy tone without a 13th palette entry
FLAT_TONES = {"ink", "green"}           # never shaded
SUN = Vector((-0.42, -0.5, 0.76)).normalized()

VARIANTS = {
    # out file; triangles per person mesh / canopy / leaf-card object; wire ratio; objects smaller
    # than `drop` metres are removed; statics: (min tris, collapse ratio) for the front row
    # (< FRONT m from the road centreline) and for everything behind it; lettering ratio (0 = drop)
    "desktop": dict(out="city.glb", person=520, canopy=1800, voxel=0.28, wires=0.3, drop=0.03,
                    front=(250, 0.32), back=(120, 0.15), lettering=0.25, keep_bars_front=True),
    "lite": dict(out="city-lite.glb", person=260, canopy=600, voxel=0.4, wires=0.15, drop=0.12,
                 front=(16, 0.09), back=(16, 0.05), lettering=0.0, keep_bars_front=False),
}
FRONT = 15.0
# never collapse-decimated in the front row (thin posts, columns and rebar turn into spikes):
# unfinished buildings, lean-to/veranda posts (*_p), pole shafts (pole*_s).
# Landmarks (lm*) are never collapsed anywhere, except the goods on the stalls.
KEEP_SHAPE = ("un",)
PEOPLE = ("walker", "trader", "talk", "stand", "rider", "driver", "seated")


def log(*a):
    print("[export_glb]", *a, flush=True)


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5))


def tone_name(mat_name):
    if mat_name in TONE_OVERRIDE:
        return TONE_OVERRIDE[mat_name]
    a = SPECS.get(mat_name, {}).get("albedo", 0.9)
    for t, lim in (("paper", 0.95), ("t1", 0.89), ("t2", 0.83), ("t3", 0.75), ("t4", 0.65), ("t5", 0.5), ("t6", 0.38), ("t7", 0.26)):
        if a >= lim:
            return t
    return "ink"


def tris_of(me):
    n = len(me.polygons)
    if not n:
        return 0
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_total", lt)
    return int((lt - 2).sum())


def apply_decimate(ob, **kw):
    md = ob.modifiers.new("dec", "DECIMATE")
    for k, v in kw.items():
        setattr(md, k, v)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(md)
    return me


def bake_colours(ob, world=True):
    """One COLOR_0 value per face corner: palette tone x soft sun term (normals in world space)."""
    me = ob.data
    n = len(me.polygons)
    if not n:
        return
    nr = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("normal", nr)
    nr = nr.reshape(n, 3)
    if world:
        m3 = np.array(ob.matrix_world.to_3x3().inverted_safe().transposed(), np.float32)
        nr = nr @ m3.T
        nr /= np.maximum(np.linalg.norm(nr, axis=1, keepdims=True), 1e-9)
    mi = np.empty(n, np.int32)
    me.polygons.foreach_get("material_index", mi)
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_total", lt)
    tones = np.zeros((max(1, len(me.materials)), 3), np.float32)
    flat = np.zeros(max(1, len(me.materials)), bool)
    mul = np.ones(max(1, len(me.materials)), np.float32)
    for i, m in enumerate(me.materials):
        nm = m.name if m else "Material"
        t = tone_name(nm)
        tones[i] = [int(PALETTE[t][k:k + 2], 16) / 255 for k in (1, 3, 5)]
        flat[i] = t in FLAT_TONES
        mul[i] = SHADE_MUL.get(nm, 1.0)
    mi = np.clip(mi, 0, len(tones) - 1)
    h = 0.5 + 0.5 * (nr @ np.array(SUN, np.float32))
    shade = np.where(flat[mi], 1.0, (0.84 + 0.16 * h) * mul[mi])
    srgb = np.clip(tones[mi] * shade[:, None], 0, 1)
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    rgba = np.concatenate([lin, np.ones((n, 1), np.float32)], axis=1)
    corner = np.repeat(rgba, lt, axis=0).astype(np.float32)
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", corner.ravel())
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = 0


def join(obs, name):
    obs = [o for o in obs if o.type == "MESH" and len(o.data.polygons)]
    if not obs:
        return None
    for o in obs:
        if o.data.users > 1:
            o.data = o.data.copy()
    with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs, selected_objects=obs):
        bpy.ops.object.join()
    ob = obs[0]
    ob.name = name
    ob.data.name = name
    return ob


def unparent_keep(ob):
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw


def apply_transform(ob):
    ob.data.transform(ob.matrix_world)
    ob.matrix_world.identity()


def set_single_material(ob, mat):
    me = ob.data
    me.materials.clear()
    me.materials.append(mat)
    if len(me.polygons):
        me.polygons.foreach_set("material_index", np.zeros(len(me.polygons), np.int32))


def road_kd():
    city.load()
    PX, PZ = city.PX, city.PZ
    kd = KDTree(len(PX))
    for i, (x, z) in enumerate(zip(PX, PZ)):
        kd.insert((x, -z, 0.0), i)
    kd.balance()
    return kd, city.D["road"]["S0"], city.D["road"]["DS"]


def split_by_chunk(ob, kd, S0, DS, prefix="chunk"):
    """Split one big world-space mesh into chunk objects by each face's road station."""
    me = ob.data
    n = len(me.polygons)
    cen = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("center", cen)
    cen = cen.reshape(n, 3)
    ids = np.empty(n, np.int32)
    for i in range(n):
        _, idx, _ = kd.find((float(cen[i, 0]), float(cen[i, 1]), 0.0))
        ids[i] = int(((S0 + idx * DS) - S0) // CHUNK)
    nv, nl = len(me.vertices), len(me.loops)
    V = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", V)
    V = V.reshape(nv, 3)
    ls = np.empty(n, np.int32)
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    LV = np.empty(nl, np.int32)
    me.loops.foreach_get("vertex_index", LV)
    C = np.empty(nl * 4, np.float32)
    me.color_attributes["Col"].data.foreach_get("color", C)
    C = C.reshape(nl, 4)
    poly_of_loop = np.repeat(np.arange(n), lt)
    res = []
    for c in sorted(set(ids.tolist())):
        pm = ids == c
        lm = pm[poly_of_loop]
        lv = LV[lm]
        used, inv = np.unique(lv, return_inverse=True)
        sub = bpy.data.meshes.new(f"{prefix}_{c:02d}")
        sub.vertices.add(len(used))
        sub.vertices.foreach_set("co", V[used].ravel())
        sub.loops.add(len(lv))
        sub.loops.foreach_set("vertex_index", inv.astype(np.int32))
        tot = lt[pm]
        sub.polygons.add(len(tot))
        sub.polygons.foreach_set("loop_start", (np.cumsum(tot) - tot).astype(np.int32))
        sub.update(calc_edges=True)
        ca = sub.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        ca.data.foreach_set("color", C[lm].ravel())
        sub.color_attributes.active_color = ca
        sub.color_attributes.render_color_index = 0
        o = bpy.data.objects.new(f"{prefix}_{c:02d}", sub)
        bpy.context.scene.collection.objects.link(o)
        res.append(o)
    bpy.data.objects.remove(ob, do_unlink=True)
    return res


def build_variant(name, cfg, kd, S0, DS):
    t0 = time.time()
    bpy.ops.wm.revert_mainfile()
    scene = bpy.context.scene
    fill = bpy.data.materials.new("fill")
    city_root = bpy.data.objects["city"]
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render]
    stats = {"in": sum(tris_of(o.data) for o in meshes)}

    def is_person(o):
        return o.name.startswith(PEOPLE)

    people = [o for o in meshes if is_person(o)]
    canopies = [o for o in meshes if o.name.endswith(("_leaves", "_cards"))]
    ground = [o for o in meshes if o.parent is None]
    wires = [o for o in meshes if o.name == "wires"]
    taken = set(map(id, people + canopies + ground + wires))
    statics = [o for o in meshes if id(o) not in taken]
    dropped = 0

    # drop sub-detail (and shop lettering on the lite file)
    for o in list(statics):
        small = max(o.dimensions) < cfg["drop"]
        letter = cfg["lettering"] <= 0 and o.name.startswith("sign_txt")
        if small or letter:
            statics.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
            dropped += 1

    # people: decimate each shared mesh once, every instance keeps pointing at it
    done = {}
    for o in people:
        key = o.data.name
        if key not in done:
            src = o.data
            n = tris_of(src)
            r = min(1.0, cfg["person"] / max(1, n))
            me = apply_decimate(o, decimate_type="COLLAPSE", ratio=r, use_collapse_triangulate=True)
            me.name = "person_" + key
            done[key] = me
        o.data = done[key]
    for me in done.values():
        tmp = bpy.data.objects.new("tmp_bake", me)
        scene.collection.objects.link(tmp)
        bake_colours(tmp, world=False)
        bpy.data.objects.remove(tmp, do_unlink=True)
        me.materials.clear()
        me.materials.append(fill)
        me.polygons.foreach_set("material_index", np.zeros(len(me.polygons), np.int32))

    # canopies (leaf masses and leaf cards): collapse to a fixed budget
    # Leaf cards decimate into paper shards: they go, and the leaf masses are voxel-remeshed into
    # closed blobs first, so the canopy reads as soft clumps with a clean inked silhouette.
    for o in [o for o in canopies if o.name.endswith("_cards")]:
        canopies.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
        dropped += 1
    for o in canopies:
        md = o.modifiers.new("remesh", "REMESH")
        md.mode, md.voxel_size, md.use_smooth_shade = "VOXEL", cfg["voxel"], False
        dg = bpy.context.evaluated_depsgraph_get()
        mats = list(o.data.materials)
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.remove(md)
        me.materials.clear()
        me.materials.append(mats[-1] if mats else None)   # remesh drops material indices: one canopy tone
        o.data = me
        r = min(1.0, cfg["canopy"] / max(1, tris_of(o.data)))
        o.data = apply_decimate(o, decimate_type="COLLAPSE", ratio=r, use_collapse_triangulate=True)
    for o in wires:
        o.data = apply_decimate(o, decimate_type="COLLAPSE", ratio=cfg["wires"], use_collapse_triangulate=True)

    # statics + ground: planar dissolve (material boundaries kept), then a collapse pass on heavy
    # statics, harder behind the front row (seen from the road only past the front buildings)
    # (the ground is left alone: dissolving the long curved road ribbons gives huge, slightly
    # non-planar n-gons whose triangulation pokes through the paint)
    bars = []
    for o in statics:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data = apply_decimate(o, decimate_type="DISSOLVE", angle_limit=math.radians(0.5), delimit={"MATERIAL"},
                                use_dissolve_boundaries=False)
        c = o.matrix_world @ (sum((Vector(b) for b in o.bound_box), Vector()) / 8)
        o["_front"] = kd.find((c.x, c.y, 0.0))[2] < FRONT
        wares = "_wares" in o.name or o.name.endswith("_goods")
        thin = o.name.startswith(KEEP_SHAPE) or o.name.endswith("_p") or (o.name.startswith("pole") and o.name.endswith("_s"))
        if (o.name.startswith("lm") and not wares) or (o["_front"] and thin):
            continue
        if o.name.startswith("sign_txt"):
            lim, ratio = 0, cfg["lettering"]
        else:
            lim, ratio = cfg["front"] if o["_front"] else cfg["back"]
        n0 = tris_of(o.data)
        if ratio < 1 and n0 > lim:
            want = max(ratio * n0, lim)
            o.data = apply_decimate(o, decimate_type="COLLAPSE", ratio=want / n0, use_collapse_triangulate=True)
            # arrays of separate bars (grilles, railings, fence spikes) do not collapse: keep them
            # in the desktop front row and on landmarks, drop them everywhere else
            if tris_of(o.data) > 1.5 * want and not o.name.startswith("lm") and \
                    not (o.get("_front") and cfg["keep_bars_front"]):
                bars.append(o)
    for o in bars:
        statics.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    dropped += len(bars)

    cat = {"canopies": sum(tris_of(o.data) for o in canopies), "ground": sum(tris_of(o.data) for o in ground),
           "wires": sum(tris_of(o.data) for o in wires), "lettering": 0, "front": 0, "back": 0}
    for o in statics:
        k = "lettering" if o.name.startswith("sign_txt") else "front" if o.get("_front") else "back"
        cat[k] += tris_of(o.data)
    log(f"{name}: by category " + ", ".join(f"{k} {v:,}" for k, v in cat.items()))
    if os.environ.get("EXPORT_DEBUG"):
        top = sorted(((tris_of(o.data), o.name) for o in statics), reverse=True)[:25]
        log(f"{name}: heaviest statics {top}")

    # colours in world space, then everything static into one world-space mesh
    for o in statics + canopies + ground + wires:
        bake_colours(o, world=True)
    for o in statics + canopies + wires:
        unparent_keep(o)
        apply_transform(o)
    big = join(statics + canopies, "static")
    chunks = split_by_chunk(big, kd, S0, DS) if big else []
    for o in chunks:
        set_single_material(o, fill)
    wire_ob = join(wires, "wires")
    if wire_ob:
        set_single_material(wire_ob, fill)
    for o in ground:
        apply_transform(o)
    # ground in road chunks too: positions are quantised per mesh, and one 1.2 km mesh would put
    # the road paint (3 mm above the asphalt) on a 2 cm grid; the far slab stays one mesh
    far = [o for o in ground if o.name == "far_ground"]
    near_g = join([o for o in ground if o.name != "far_ground"], "ground_all")
    g_obs = (split_by_chunk(near_g, kd, S0, DS, "ground") if near_g else []) + far
    for o in g_obs:
        set_single_material(o, fill)

    # hierarchy: city/{chunk_*, wires, people}, ground/ground_mesh
    city_root.matrix_world.identity()
    for o in chunks + ([wire_ob] if wire_ob else []):
        o.parent = city_root
    g_root = bpy.data.objects.new("ground", None)
    scene.collection.objects.link(g_root)
    for o in g_obs:
        o.parent = g_root
    for o in people:
        o.name = "p_" + o.name
    keep = set(chunks + people + [city_root, g_root] + g_obs + ([wire_ob] if wire_ob else []))
    for o in list(scene.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    uniq = sum(tris_of(o.data) for o in chunks) + (tris_of(wire_ob.data) if wire_ob else 0) + \
        sum(tris_of(o.data) for o in g_obs) + sum(tris_of(me) for me in done.values())
    drawn = uniq - sum(tris_of(me) for me in done.values()) + sum(tris_of(o.data) for o in people)
    log(f"{name}: in {stats['in']:,} tris -> unique {uniq:,}, drawn {drawn:,} "
        f"(people {len(people)} x {[tris_of(m) for m in done.values()]}, chunks {len(chunks)}, dropped {dropped}) "
        f"in {time.time() - t0:.1f} s")

    os.makedirs(RAW_DIR, exist_ok=True)
    raw = os.path.join(RAW_DIR, cfg["out"].replace(".glb", "-raw.glb"))
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format="GLB", use_selection=False, export_yup=True, export_apply=False,
        export_normals=False, export_texcoords=False, export_tangents=False, export_materials="EXPORT",
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_attributes=False,
        export_animations=False, export_cameras=False, export_lights=False, export_extras=False)
    log(f"{name}: raw {os.path.getsize(raw):,} bytes -> {raw}")
    return raw, uniq, drawn


def compress(raw, out):
    """EXT_mesh_gpu_instancing for the shared people meshes (gltf-transform), then gltfpack:
    meshopt compression, 8-bit colours, float positions (16-bit grids put the 3 mm road paint
    and the kerb edges on a visible staircase), named nodes kept. gltfpack lifts the instanced
    batches to the scene root; the site moves them back under `city`."""
    os.makedirs(PUB_DIR, exist_ok=True)
    tmp = raw.replace("-raw.glb", "-inst.glb")
    subprocess.run(["npx", "--yes", "@gltf-transform/cli@4.5.1", "instance", raw, tmp, "--min", "2"], check=True, cwd=REPO)
    subprocess.run(["npx", "--yes", "gltfpack@1.3.0", "-i", tmp, "-o", out, "-cc", "-kn", "-vpf", "-vc", "8"], check=True, cwd=REPO)
    return os.path.getsize(out)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    kd, S0, DS = road_kd()
    report = []
    for name, cfg in VARIANTS.items():
        if only and name != only:
            continue
        raw, uniq, drawn = build_variant(name, cfg, kd, S0, DS)
        out = os.path.join(PUB_DIR, cfg["out"])
        size = compress(raw, out)
        report.append((name, uniq, drawn, size, out))
    for name, uniq, drawn, size, out in report:
        log(f"RESULT {name}: {uniq:,} unique tris, {drawn:,} drawn tris, {size:,} bytes ({size / 1048576:.2f} MB) -> {out}")


if __name__ == "__main__":
    main()

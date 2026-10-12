"""Build the street's pedestrians from MakeHuman CC0 assets with MPFB, pose them, and save
them as plain meshes to blender/assets/people/people.blend.

    BLENDER_USER_RESOURCES="$PWD/blender/assets/vendor/mpfb-extension/blender-user" \
        blender -b --factory-startup -P blender/lookdev/make_people.py [-- --sheet]

MPFB (GPL-3 tool) and the MakeHuman system assets (CC0) are vendor downloads, see
blender/ASSETS.md for the one-time setup. The output meshes are CC0-derived and need neither at
build time: build_scene.py only appends people.blend.

Each person is one mesh object at the origin, facing -Y, feet on z = 0, with material slots named
for tone classes (skin, top, bottom, shoes, hair, cloth_light, cloth_dark, basin, goods).
Poses are rotations about armature-space axes through each bone's head, applied parent first,
so they read as "swing the thigh forward 24 degrees" rather than in each bone's roll frame.
With --sheet it also renders a workbench contact sheet to blender/lookdev/out/people-sheet.png.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

PEOPLE_DIR = os.path.join(C.REPO, "blender", "assets", "people")
PEOPLE_BLEND = os.path.join(PEOPLE_DIR, "people.blend")

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService  # noqa: E402

UD = LocationService.get_user_data()
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# --------------------------------------------------------------------------------------------
# poses: lists of (bone, axis, degrees), applied in order. The figure faces -Y, so a negative
# rotation about +X swings a hanging limb forward; +Y lowers the left arm, -Y the right arm.
# --------------------------------------------------------------------------------------------
ARMS_DOWN = [("upperarm_l", Y, 43), ("upperarm_r", Y, -43), ("lowerarm_l", Y, 3), ("lowerarm_r", Y, -3),
             ("thigh_l", Y, 4), ("thigh_r", Y, -4)]


def walk(stride=1.0, arm=1.0):
    s, a = stride, arm
    return ARMS_DOWN + [
        ("pelvis", Z, 4 * s),
        ("spine_02", Z, -6 * s), ("spine_01", X, 3),
        ("thigh_l", X, -24 * s), ("calf_l", X, 6 * s), ("foot_l", X, -6 * s),
        ("thigh_r", X, 15 * s), ("calf_r", X, 26 * s), ("foot_r", X, 14 * s),
        ("upperarm_l", X, 14 * a), ("lowerarm_l", X, -6 * a),
        ("upperarm_r", X, -16 * a), ("lowerarm_r", X, -14 * a),
        ("head", X, -2),
    ]


def stand(weight_left=True):
    k = 1 if weight_left else -1
    return ARMS_DOWN + [
        ("pelvis", Y, 3 * k), ("spine_02", Y, -3 * k),
        ("thigh_l" if weight_left else "thigh_r", Y, 2 * k),
        ("thigh_r" if weight_left else "thigh_l", X, -6), ("calf_r" if weight_left else "calf_l", X, 10),
        ("thigh_r" if weight_left else "thigh_l", Y, 4 * k),
        ("lowerarm_l", X, -6), ("lowerarm_r", X, -8),
    ]


def akimbo():
    """Standing, one hand on the hip."""
    return stand() + [("upperarm_l", Y, -30), ("upperarm_l", X, 12), ("lowerarm_l", Y, -75), ("lowerarm_l", X, 20)]


def head_load(stride=0.8):
    """Walking with the right hand up steadying a basin on the head."""
    p = walk(stride, arm=0.6)
    return p + [("upperarm_r", Y, 125), ("upperarm_r", X, -6), ("lowerarm_r", Y, 55)]


def seated(hands_fwd=True, knee=88):
    p = ARMS_DOWN + [("thigh_l", X, -knee), ("thigh_r", X, -knee), ("calf_l", X, knee - 2), ("calf_r", X, knee - 2),
                     ("thigh_l", Z, -4), ("thigh_r", Z, 4)]
    if hands_fwd:
        p += [("upperarm_l", X, -45), ("upperarm_r", X, -45), ("lowerarm_l", X, -25), ("lowerarm_r", X, -25),
              ("upperarm_l", Z, 10), ("upperarm_r", Z, -10)]
    return p


def rider():
    """Okada rider: astride the seat (hips 0.92 m), feet back on the pegs, hands forward on the
    bars, a slight forward lean. (+X tilts an upright bone forward, -X swings a hanging one.)"""
    return ARMS_DOWN + [
        ("thigh_l", X, -55), ("thigh_r", X, -55), ("calf_l", X, 75), ("calf_r", X, 75),
        ("thigh_l", Y, 9), ("thigh_r", Y, -9), ("calf_l", Y, -9), ("calf_r", Y, 9),
        ("spine_01", X, 12), ("head", X, -10),
        ("upperarm_l", X, -48), ("upperarm_r", X, -48), ("lowerarm_l", X, -28), ("lowerarm_r", X, -28),
        ("upperarm_l", Z, 12), ("upperarm_r", Z, -12)]


def talk():
    return stand(False) + [("upperarm_l", X, -25), ("lowerarm_l", X, -60), ("head", Z, 12)]


# --------------------------------------------------------------------------------------------
# cast
# --------------------------------------------------------------------------------------------
def macro(gender, age=0.5, weight=0.5, muscle=0.5, height=0.5, prop=0.6):
    return {"gender": gender, "age": age, "muscle": muscle, "weight": weight, "proportions": prop,
            "height": height, "cupsize": 0.5, "firmness": 0.5,
            "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0}}


# name: (macro, clothes, hair, pose, extras, tones {asset: tone})
CAST = {
    "walker_m": (macro(1.0, 0.45, 0.45, 0.55, 0.6), ["male_casualsuit02", "shoes02"], "short02", walk(1.0), [],
                 {"male_casualsuit02": "top"}),
    "trader_f": (macro(0.0, 0.55, 0.65, 0.5, 0.45), ["female_elegantsuit01", "shoes06"], None, head_load(0.6),
                 ["wrapper", "basin"], {"female_elegantsuit01": "top"}),
    "stand_m": (macro(1.0, 0.6, 0.6, 0.5, 0.55), ["male_casualsuit06", "shoes05"], "short04", stand(), [],
                {"male_casualsuit06": "top"}),
    "talk_f": (macro(0.0, 0.4, 0.5, 0.5, 0.5), ["female_casualsuit01", "shoes03"], None, talk(), ["headtie"],
               {"female_casualsuit01": "top"}),
    "walker_f": (macro(0.0, 0.35, 0.45, 0.5, 0.55), ["female_elegantsuit01", "shoes06"], None, walk(0.6, 0.8),
                 ["wrapper", "headtie"], {"female_elegantsuit01": "top"}),
    "walker_m2": (macro(1.0, 0.3, 0.4, 0.5, 0.5), ["male_casualsuit04", "shoes04"], "short01", walk(0.9, 1.1), [],
                  {"male_casualsuit04": "top"}),
    "rider_m": (macro(1.0, 0.4, 0.5, 0.6, 0.55), ["male_worksuit01", "shoes02"], "short02", rider(), [],
                {"male_worksuit01": "top"}),
    "seated_m": (macro(1.0, 0.65, 0.6, 0.5, 0.5), ["male_casualsuit05", "shoes01"], "short04", seated(False), [],
                 {"male_casualsuit05": "top"}),
    "driver_m": (macro(1.0, 0.5, 0.55, 0.55, 0.5), ["male_casualsuit03", "shoes02"], "short01",
                 seated(True, knee=82) + [("spine_01", X, 6)], [], {"male_casualsuit03": "top"}),
}


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures):
        for d in list(coll):
            if not d.use_fake_user:
                coll.remove(d)


def apply_pose(rig, ops):
    bpy.context.view_layer.update()
    for (name, axis, deg) in ops:
        pb = rig.pose.bones[name]
        head = pb.matrix.to_translation()
        R = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-head)
        pb.matrix = R @ pb.matrix
        bpy.context.view_layer.update()


def island_ids(bm):
    """Face index -> connected-component id (faces sharing an edge)."""
    bm.faces.ensure_lookup_table()
    ids = [-1] * len(bm.faces)
    cur = 0
    for f0 in bm.faces:
        if ids[f0.index] >= 0:
            continue
        stack = [f0]
        ids[f0.index] = cur
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if ids[g.index] < 0:
                        ids[g.index] = cur
                        stack.append(g)
        cur += 1
    return ids


def curl_fingers(rig, deg=(28, 38, 25)):
    """Relaxed hands: curl every finger joint about its own bending axis (bone-local X)."""
    from mathutils import Quaternion
    for side in ("l", "r"):
        for f in ("index", "middle", "ring", "pinky"):
            for j, d in enumerate(deg):
                pb = rig.pose.bones.get(f"{f}_0{j + 1}_{side}")
                if pb:
                    pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(d + (6 if f == "pinky" else 0)))
        pb = rig.pose.bones.get(f"thumb_02_{side}")
        if pb:
            pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(15))
    bpy.context.view_layer.update()


def bake(obj):
    """Apply all modifiers (masks, armature) and return a plain mesh object."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.transform(obj.matrix_world)
    out = bpy.data.objects.new(obj.name + "_baked", me)
    bpy.context.scene.collection.objects.link(out)
    return out


def tone_material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m


def skin_points(body):
    """Useful landmarks from the baked body: hip ring, ankle height, head top."""
    vs = [v.co for v in body.data.vertices]
    top = max(v.z for v in vs)
    return {"top": top, "verts": vs}


def ring_at(vs, z, dz=0.03, xlim=0.24):
    """Bounding ellipse of the body slice at height z, ignoring the arms (|x| > xlim)."""
    pts = [v for v in vs if abs(v.z - z) < dz and abs(v.x) < xlim]
    if not pts:
        return Vector((0, 0, z)), 0.15, 0.1
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    return Vector(((x0 + x1) / 2, (y0 + y1) / 2, z)), (x1 - x0) / 2, (y1 - y0) / 2


def hull_ring(vs, z, ease, n=28, dz=0.025, xlim=0.24):
    """Ring around the convex hull of the body slice at z, offset outward by `ease`, sampled at n
    equal angles about the hull centroid (so consecutive rings loft cleanly)."""
    pts = [(v.x, v.y) for v in vs if abs(v.z - z) < dz and abs(v.x) < xlim]
    if len(pts) < 3:
        return None
    pts = sorted(set((round(x, 4), round(y, 4)) for x, y in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    ring = []
    for i in range(n):
        a = 2 * math.pi * i / n
        d = (math.cos(a), math.sin(a))
        best = 0.05
        for j in range(len(hull)):
            p, q = hull[j], hull[(j + 1) % len(hull)]
            # ray (cx,cy)+t*d against segment p-q
            ex, ey = q[0] - p[0], q[1] - p[1]
            den = d[0] * ey - d[1] * ex
            if abs(den) < 1e-9:
                continue
            t = ((p[0] - cx) * ey - (p[1] - cy) * ex) / den
            u = ((p[0] - cx) * d[1] - (p[1] - cy) * d[0]) / den
            if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                best = max(best, t)
        ring.append(best + ease)
    # light smoothing so folds read as cloth, not as the hull's facets
    sm = [(ring[i - 1] + 2 * ring[i] + ring[(i + 1) % n]) / 4 for i in range(n)]
    return [Vector((cx + math.cos(2 * math.pi * i / n) * sm[i], cy + math.sin(2 * math.pi * i / n) * sm[i], z)) for i in range(n)]


def add_extras(bm_out, body_vs, head_vs, extras, mats, top):
    """Wrapper skirt, head-tie and head basin as simple lofted solids around the baked body."""
    def m(name):
        if name not in mats:
            mats.append(name)
        return mats.index(name)

    def loft(rings, mat, cap_top=True, cap_bot=True):
        n = len(rings[0])
        vs = [[bm_out.verts.new(p) for p in r] for r in rings]
        for j in range(len(rings) - 1):
            for i in range(n):
                f = bm_out.faces.new([vs[j][i], vs[j][(i + 1) % n], vs[j + 1][(i + 1) % n], vs[j + 1][i]])
                f.material_index = mat
                f.smooth = True
        if cap_bot:
            f = bm_out.faces.new(list(reversed(vs[0])))
            f.material_index = mat
        if cap_top:
            f = bm_out.faces.new(vs[-1])
            f.material_index = mat

    def ellipse(c, rx, ry, n=24, phase=0.0):
        return [Vector((c.x + math.cos(2 * math.pi * i / n + phase) * rx, c.y + math.sin(2 * math.pi * i / n + phase) * ry, c.z))
                for i in range(n)]

    rng = random.Random(len(body_vs))
    if "wrapper" in extras:
        # a fitted ankle-length wrapper: each ring is the slice of the legs at that height plus a
        # little ease, so it follows the stride instead of standing like a barrel
        rings = []
        for (fz, ease, xl) in ((0.60, 0.012, 0.2), (0.56, 0.016, 0.22), (0.50, 0.02, 0.24), (0.42, 0.024, 0.24),
                               (0.32, 0.04, 0.24), (0.22, 0.05, 0.24), (0.13, 0.055, 0.24), (0.075, 0.06, 0.24)):
            r = hull_ring(body_vs, top * fz, ease, 28, 0.025, xl)
            if r:
                rings.append(r)
        loft(rings, m("cloth_dark"))
        # the tucked fold at the waist
        r0 = hull_ring(body_vs, top * 0.6, 0.022, 28, 0.02, 0.2)
        if r0:
            loft([[p + Vector((0, 0, -0.012)) for p in r0], [p + Vector((0, 0, 0.032)) for p in r0]], m("cloth_dark"))
    if "headtie" in extras:
        c, rx, ry = ring_at(head_vs, top - 0.06, 0.015, 0.14)
        rings = []
        # forehead band, flaring crown, set back a little; folds as a gentle wave in z
        for k, (dz, sc, back) in enumerate(((-0.07, 1.06, 0.0), (-0.04, 1.16, 0.008), (-0.01, 1.21, 0.016),
                                            (0.022, 1.13, 0.022), (0.045, 0.86, 0.026), (0.056, 0.4, 0.026))):
            r = ellipse(Vector((c.x, c.y + back, top + dz)), rx * sc, ry * sc, n=24, phase=0.25 * k)
            r = [p + Vector((0, 0, 0.008 * math.sin(i * 2.0 + k * 1.3))) for i, p in enumerate(r)]
            rings.append(r)
        loft(rings, m("cloth_light"))
    if "basin" in extras:
        c = Vector((0, 0.0, top + 0.03))
        mat = m("basin")
        rings = [ellipse(c, 0.07, 0.07), ellipse(c + Vector((0, 0, 0.02)), 0.18, 0.18),
                 ellipse(c + Vector((0, 0, 0.13)), 0.29, 0.29), ellipse(c + Vector((0, 0, 0.15)), 0.31, 0.31)]
        loft(rings, mat)
        # goods heaped in the basin: oranges / tomatoes as small spheres
        gm = m("goods")
        for i in range(19):
            a = rng.uniform(0, 2 * math.pi)
            r = 0.22 * math.sqrt(rng.random())
            cc = c + Vector((math.cos(a) * r, math.sin(a) * r, 0.15 + 0.06 * (1 - r / 0.22) + rng.uniform(0, 0.03)))
            rr = rng.uniform(0.04, 0.05)
            sph = [ellipse(cc + Vector((0, 0, rr * math.cos(math.pi * j / 6))), rr * math.sin(math.pi * j / 6) + 1e-4,
                           rr * math.sin(math.pi * j / 6) + 1e-4, n=10) for j in range(1, 6)]
            loft(sph, gm)
        # a head pad (kata) under the basin
        loft([ellipse(Vector((0, 0, top - 0.01)), 0.08, 0.08, 12), ellipse(Vector((0, 0, top + 0.035)), 0.09, 0.09, 12)],
             m("cloth_light"))


def build_person(name, spec):
    mac, clothes, hair, pose, extras, tones = spec
    if "wrapper" in extras:
        # hands hang clear of the wrapper's ease
        pose = pose + [("upperarm_l", Y, -7), ("upperarm_r", Y, 7)]
    clear()
    body = HumanService.create_human(macro_detail_dict=mac, scale=0.1)
    rig = HumanService.add_builtin_rig(body, "game_engine")
    parts = []
    for c in clothes:
        f = os.path.join(UD, "clothes", c, c + ".mhclo")
        parts.append((c, HumanService.add_mhclo_asset(f, body, asset_type="Clothes", subdiv_levels=0)))
    if hair:
        f = os.path.join(UD, "hair", hair, hair + ".mhclo")
        parts.append((hair, HumanService.add_mhclo_asset(f, body, asset_type="Hair", subdiv_levels=0)))
    for b in rig.pose.bones:
        b.rotation_mode = "QUATERNION"
    apply_pose(rig, pose)
    curl_fingers(rig)
    # bake every mesh with its modifiers, assign tone-class materials, join into one object
    mats = []

    def slot(tone):
        if tone not in mats:
            mats.append(tone)
        return mats.index(tone)

    baked = []
    for (asset, ob) in [("body", body)] + parts:
        if ob is None:
            continue
        b = bake(ob)
        if asset == "body":
            tone = "skin"
        elif asset == hair:
            tone = "hair"
        elif asset.startswith("shoes"):
            tone = "shoes"
        else:
            tone = tones.get(asset, "top")
        baked.append((b, tone, asset))
    # clothes from MakeHuman come as one mesh per suit; split shirt from trousers by height so
    # the material boundary draws the waist line
    out_bm = bmesh.new()
    body_vs = None
    top = 0.0
    for (b, tone, asset) in baked:
        me = b.data
        bm = bmesh.new()
        bm.from_mesh(me)
        if asset == "body":
            body_vs = []
            top = max(v.co.z for v in bm.verts)
        if asset != hair:
            # landmarks for the wrapper: clothes and shoes everywhere, bare skin only below the
            # knees, so hanging hands never widen the waist rings
            body_vs += [v.co.copy() for v in bm.verts if asset != "body" or v.co.z < top * 0.36]
        if asset == "body":
            head_vs = [v.co.copy() for v in bm.verts if v.co.z > top - 0.3]
        # suits are shirt + trousers (or blouse + skirt) as separate mesh islands: give each
        # island one tone by where it sits, so the waist line follows the garment's real hem
        island = island_ids(bm)
        zsum, cnt = {}, {}
        for f in bm.faces:
            k = island[f.index]
            zsum[k] = zsum.get(k, 0.0) + f.calc_center_median().z
            cnt[k] = cnt.get(k, 0) + 1
        lower = "cloth_dark" if asset.startswith("female_elegant") else "bottom"
        for f in bm.faces:
            t = tone
            if tone == "top" and not asset.startswith("male_work"):
                k = island[f.index]
                t = "top" if zsum[k] / cnt[k] > top * 0.55 else lower
            f.material_index = slot(t)
            f.smooth = True
        tmp = bpy.data.meshes.new("tmp")
        bm.to_mesh(tmp)
        bm.free()
        out_bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    add_extras(out_bm, body_vs, head_vs, extras, mats, top)
    me = bpy.data.meshes.new(name)
    out_bm.to_mesh(me)
    out_bm.free()
    for t in mats:
        me.materials.append(tone_material(t))
    for (b, _, _) in baked:
        bpy.data.objects.remove(b, do_unlink=True)
    for o in [o for o in bpy.data.objects]:
        bpy.data.objects.remove(o, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    ob["height"] = top
    return ob


def main():
    sheet = "--sheet" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    results = {}
    for name, spec in CAST.items():
        if only and name not in only:
            continue
        ob = build_person(name, spec)
        # keep the mesh alive across clear(): fake user
        ob.data.use_fake_user = True
        results[name] = ob.data
        print(f"[people] {name}: {len(ob.data.vertices)} verts, h={ob['height']:.2f} m")
        bpy.data.objects.remove(ob, do_unlink=True)
    # final file: one object per person
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for d in list(bpy.data.armatures):
        bpy.data.armatures.remove(d)
    coll = bpy.data.collections.new("people")
    bpy.context.scene.collection.children.link(coll)
    for i, (name, me) in enumerate(results.items()):
        me.use_fake_user = False
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    os.makedirs(PEOPLE_DIR, exist_ok=True)
    if not only:
        bpy.ops.wm.save_as_mainfile(filepath=PEOPLE_BLEND, compress=True)
        print(f"[people] saved {PEOPLE_BLEND} ({os.path.getsize(PEOPLE_BLEND) / 1e6:.1f} MB)")
    if sheet:
        render_sheet(coll)


def render_sheet(coll):
    s = bpy.context.scene
    obs = list(coll.objects)
    for i, ob in enumerate(obs):
        ob.location.x = i * 1.0
    s.render.engine = "BLENDER_WORKBENCH"
    s.display.shading.light = "STUDIO"
    s.display.shading.color_type = "MATERIAL"
    for mat in bpy.data.materials:
        v = {"skin": 0.25, "hair": 0.1, "shoes": 0.15, "top": 0.8, "bottom": 0.45, "cloth_dark": 0.35,
             "cloth_light": 0.9, "basin": 0.6, "goods": 0.5}.get(mat.name, 0.7)
        mat.diffuse_color = (v, v, v, 1)
    os.makedirs(C.OUT, exist_ok=True)
    for k, (loc, rot, sx) in enumerate((((len(obs) / 2 - 0.5, -9, 0.95), (90, 0, 0), 0), ((len(obs) / 2 - 0.5 + 6.4, -6.4, 0.95), (90, 0, 45), 1))):
        cd = bpy.data.cameras.new("c")
        cd.type = "ORTHO"
        cd.ortho_scale = len(obs) * 1.05
        c = bpy.data.objects.new("c", cd)
        s.collection.objects.link(c)
        c.location = loc
        c.rotation_euler = [math.radians(v) for v in rot]
        s.camera = c
        s.render.resolution_x, s.render.resolution_y = 200 * len(obs), 520
        s.render.filepath = os.path.join(C.OUT, f"people-sheet{k}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

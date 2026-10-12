"""The production street, built from the section's own geometry (blender/production/out/section.json).

Frames
  Three.js scene (x, y up, z)  ->  Blender (x, -z, y).
  Street frame at station s, lateral offset lat (the section's setT(s, lat)): local x = lateral
  (positive = right of the direction of travel), local y = forward along the road, z = up.
  local_M(TX, TZ, TR) maps that local frame into Blender world.

Everything the section places (buildings by kind, poles, trees, lamps, vehicles, side roads,
patches, the five landmarks) is placed here at the same spot and size; the detail is ours.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
LOOKDEV = os.path.join(REPO, "blender", "lookdev")
sys.path.insert(0, LOOKDEV)
import geo  # noqa: E402
import street  # noqa: E402
from geo import facade_frame, get  # noqa: E402

OUT = os.path.join(HERE, "out")
SECTION = os.path.join(OUT, "section.json")

D = None            # section.json
PX = PZ = PT = None


def load():
    global D, PX, PZ, PT
    with open(SECTION) as f:
        D = json.load(f)
    PX, PZ, PT = D["road"]["PX"], D["road"]["PZ"], D["road"]["PT"]
    return D


def fr(s):
    S0, DS = D["road"]["S0"], D["road"]["DS"]
    f = min(max((s - S0) / DS, 0), len(PX) - 1.001)
    i = int(math.floor(f))
    u = f - i
    return (PX[i] + (PX[i + 1] - PX[i]) * u, PZ[i] + (PZ[i + 1] - PZ[i]) * u, PT[i] + (PT[i + 1] - PT[i]) * u)


def local_M(TX, TZ, TR, z=0.0):
    return Matrix.Translation((TX, -TZ, z)) @ Matrix.Rotation(-TR, 4, "Z")


def M_at(s, lat=0.0, z=0.0):
    x, zz, t = fr(s)
    return local_M(x + math.cos(t) * lat, zz + math.sin(t) * lat, t, z)


def wpt(s, lat, h=0.0):
    """World point (Blender) at station s, lateral lat, height h."""
    x, z, t = fr(s)
    return Vector((x + math.cos(t) * lat, -(z + math.sin(t) * lat), h))


def three_to_blender(p):
    return Vector((p[0], -p[2], p[1]))


# ----------------------------------------------------------------------------------------------
# sweeps along the road
# ----------------------------------------------------------------------------------------------
def ribbon(b, s0, s1, lat0, lat1, z0, z1, mat, step=1.0, uv=False):
    """A closed box swept along the road centreline between stations s0..s1 (one manifold)."""
    n = max(1, int(math.ceil((s1 - s0) / step)))
    rings = []
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        rings.append([wpt(s, lat0, z0), wpt(s, lat1, z0), wpt(s, lat1, z1), wpt(s, lat0, z1)])
    vs = [[b.bm.verts.new(p) for p in r] for r in rings]
    mi = b.m(mat)
    for j in range(n):
        for k in range(4):
            f = b.bm.faces.new([vs[j][k], vs[j][(k + 1) % 4], vs[j + 1][(k + 1) % 4], vs[j + 1][k]])
            f.material_index = mi
            if uv:
                sa = s0 + (s1 - s0) * j / n
                sb = s0 + (s1 - s0) * (j + 1) / n
                lv = (lat0, lat1, lat1, lat0)[k], (lat1, lat1, lat0, lat0)[k]
                for lp, (u, v) in zip(f.loops, ((sa, lv[0]), (sa, lv[1]), (sb, lv[1]), (sb, lv[0]))):
                    lp[b.uv].uv = (u, v)
    for r, rev in ((vs[0], True), (vs[-1], False)):
        f = b.bm.faces.new(list(reversed(r)) if rev else r)
        f.material_index = mi


def side_cuts(sd):
    """Station intervals where side road `sd` (+1 right, -1 left) cuts the verge."""
    return sorted((s - 3.9, s + 3.9) for (s, side) in D["SIDES"] if side == sd)


def runs(a, b, cuts):
    out, cur = [], a
    for (c0, c1) in cuts:
        if c1 < cur or c0 > b:
            continue
        if c0 > cur:
            out.append((cur, c0))
        cur = max(cur, c1)
    if cur < b:
        out.append((cur, b))
    return out


def build_road():
    S0, SMAX = D["road"]["S0"], D["road"]["SMAX"]
    geo.CURRENT_MATRIX = None
    A = get("asphalt", "nolines")
    ribbon(A, S0, SMAX, -3.62, 3.62, -0.32, -0.15, "road_uv", step=1.0, uv=True)
    Gd = get("verge_ground", "nolines")
    Mk = get("road_paint", "fine")
    for sd in (-1, 1):
        L = lambda a: sd * a  # noqa: E731
        lo = lambda a, b: (min(L(a), L(b)), max(L(a), L(b)))  # noqa: E731
        for (a, b) in runs(S0, SMAX, side_cuts(sd)):
            K = get(f"kerb_{sd}_{int(a)}", "lines")
            ribbon(K, a, b, *lo(3.6, 3.76), -0.7, 0.06, "kerb", step=1.0)
            ribbon(K, a, b, *lo(4.28, 4.45), -0.7, 0.0, "kerb", step=1.0)
            ribbon(Gd, a, b, *lo(3.76, 4.28), -0.75, -0.62, "channel", step=2.0)
            # drain cover slabs: runs of 1-6 m (the map draws 45 % of 6 m bays)
            rng = random.Random(int(a * 7) + sd)
            s = a + 2
            while s < b - 2:
                if rng.random() < 0.45:
                    ln = min(b - 1 - s, rng.choice([1.2, 2.4, 3.6, 6.0]))
                    if ln > 0.6:
                        Sb = get(f"slab_{sd}_{int(s * 10)}", "lines")
                        ribbon(Sb, s, s + ln, *lo(3.7, 4.34), -0.02, 0.09, "slab", step=0.6)
                s += 6
        # side roads: asphalt + low kerbs from the drain out to 60 m
        for (s, side) in D["SIDES"]:
            if side != sd:
                continue
            geo.CURRENT_MATRIX = M_at(s)
            Sr = get(f"side_{s}", "nolines")
            Sr.box((L(3.6) if sd > 0 else L(70), -3.9, -0.32), (L(70) if sd > 0 else L(3.6), 3.9, -0.15), mat="road")
            for y in (-3.9, 3.9):
                Kb = get(f"side_kerb_{s}_{y}", "lines")
                Kb.box((min(L(4.45), L(70)), y - 0.12 if y > 0 else y, -0.3), (max(L(4.45), L(70)), y if y > 0 else y + 0.12, 0.02),
                       mat="kerb")
            geo.CURRENT_MATRIX = None
    # centre dashes every 7 m (3 m long) as in the map; edge lines 0.3 m inside the kerbs
    s = S0 + 4
    while s < SMAX - 4:
        _paint_strip(Mk, s, s + 3, -0.06, 0.06)
        s += 7
    for sd in (-1, 1):
        _paint_strip(Mk, S0, SMAX, *sorted((sd * 3.3, sd * 3.42)), step=2.0)
    # zebra at s = 197
    for i in range(9):
        x = -3.4 + i * 0.85
        _paint_strip(Mk, 195.75, 198.25, x - 0.25, x + 0.25, step=2.5)
    # patches (forecourts, market ground) as earth
    P = get("patches", "nolines")
    for q in D["patches"]:
        P.poly([Vector((x, -z, 0.004)) for (x, z) in q], "earth")
    Gr = get("far_ground", "nolines")
    Gr.box((-600, -600, -0.9), (600, 600, -0.8), mat="ground")


def build_ground():
    """The ground at z = 0 everywhere except the road corridor and the side roads: a big slab
    with the corridor cut out by a manifold boolean (so curves never fold over the road)."""
    S0, SMAX = D["road"]["S0"], D["road"]["SMAX"]
    geo.CURRENT_MATRIX = None
    gb = bmesh.new()
    lo, hi = Vector((min(PX) - 150, -max(PZ) - 150, -0.32)), Vector((max(PX) + 150, -min(PZ) + 150, 0.0))
    bmesh.ops.create_cube(gb, size=1.0, matrix=Matrix.Translation((lo + hi) / 2) @ Matrix.Diagonal((*(hi - lo), 1.0)))
    me = bpy.data.meshes.new("ground")
    gb.to_mesh(me)
    gb.free()
    ground = bpy.data.objects.new("ground", me)
    bpy.context.scene.collection.objects.link(ground)
    cut = geo.MB("ground_cut", "nolines")
    ribbon(cut, S0 - 2, SMAX + 2, -4.45, 4.45, -2, 2, "ground", step=1.0)
    for (s, side) in D["SIDES"]:
        x, z, t = fr(s)
        M = local_M(x, z, t)
        a, b = (4.0, 80.0) if side > 0 else (-80.0, -4.0)
        cut.box((a, -3.9, -2), (b, 3.9, 2), M=M, mat="ground")
    cme = bpy.data.meshes.new("ground_cut")
    bmesh.ops.recalc_face_normals(cut.bm, faces=cut.bm.faces[:])
    cut.bm.to_mesh(cme)
    cut.bm.free()
    cob = bpy.data.objects.new("ground_cut", cme)
    bpy.context.scene.collection.objects.link(cob)
    # union the cutter's own pieces first, then subtract
    geo.apply_union(cob)
    md = ground.modifiers.new("cut", "BOOLEAN")
    md.operation, md.solver, md.object = "DIFFERENCE", "MANIFOLD", cob
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ground.evaluated_get(dg), depsgraph=dg)
    ground.modifiers.remove(md)
    ground.data = me2
    bpy.data.objects.remove(cob, do_unlink=True)
    me2.materials.clear()
    me2.materials.append(bpy.data.materials["verge"])
    bpy.context.scene.collection.objects.unlink(ground)
    geo.ensure_collections()["nolines"].objects.link(ground)
    print(f"[city] ground: {len(me2.polygons)} faces")


def _paint_strip(b, s0, s1, l0, l1, step=1.0):
    n = max(1, int(math.ceil((s1 - s0) / step)))
    pts = []
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        pts.append((wpt(s, l0, -0.147), wpt(s, l1, -0.147)))
    vs = [(b.bm.verts.new(a), b.bm.verts.new(c)) for (a, c) in pts]
    mi = b.m("paint")
    for i in range(n):
        f = b.bm.faces.new([vs[i][0], vs[i][1], vs[i + 1][1], vs[i + 1][0]])
        f.material_index = mi


# ----------------------------------------------------------------------------------------------
# the section's placements
# ----------------------------------------------------------------------------------------------
def rec_M(r):
    return local_M(r["TX"], r["TZ"], r["TR"])


def facade_M(sd, xn, length):
    """Facade frame in the street frame for a building whose road face is at lateral sd*xn and
    which spans local y in [-length/2, length/2]."""
    if sd > 0:
        return facade_frame((xn, -length / 2, 0.0), (-1, 0, 0))
    return facade_frame((-xn, length / 2, 0.0), (1, 0, 0))


def place_buildings(far_detail=False):
    count = 0
    for k, r in enumerate(D["rec"]):
        kind = r["kind"]
        if kind not in ("storey", "shopRow", "bungalow", "container", "unfinished"):
            continue
        rng = random.Random(9000 + k)
        geo.CURRENT_MATRIX = rec_M(r)
        tag = f"{kind[:2]}{k:03d}"
        sd, xn, ln = r["sd"], r["xn"], r["len"]
        if kind == "storey":
            M = facade_M(sd, xn, ln)
            street.building_at(tag, M, ln, r["floors"], r["w"], rng, roof="flat",
                               detail=r["det"] or far_detail, over={"shop": True} if r["det"] else None)
        elif kind == "shopRow":
            M = facade_M(sd, xn + 1.9, ln)
            street.building_at(tag, M, ln, 1, 4.2, rng, roof="flat",
                               over={"shop": True, "canopy": True, "ac": 0, "blade": False})
        elif kind == "bungalow":
            bungalow_at(tag, facade_M(sd, xn, ln), ln, r["w"], rng, r["det"])
        elif kind == "container":
            container_at(tag, facade_M(sd, xn, ln), ln, rng)
        elif kind == "unfinished":
            unfinished_at(tag, facade_M(sd, xn, ln), ln, r["w"], rng)
        count += 1
    geo.CURRENT_MATRIX = None
    return count


def bungalow_at(tag, M, length, w, rng, det=True):
    """Compound: block wall on the street line with a steel gate, bungalow set 4.4 m back."""
    fa = street.Fa(tag, M, wall=rng.choice(["wall_b", "wall_c", "block"]))
    S = fa.S
    hw, gw = 1.9, 3.0
    zg = (rng.random() - 0.5) * (length - gw - 2) * 0.6 + length / 2
    for (a0, a1) in ((0.0, zg - gw / 2), (zg + gw / 2, length)):
        if a1 - a0 > 0.3:
            fa.box(S, (a0, -0.26, 0), (a1, 0, hw))
            fa.box(S, (a0 - 0.02, -0.3, hw - 0.01), (a1 + 0.02, 0.04, hw + 0.07), "trim")
    for a in (0.25, zg - gw / 2 - 0.25, zg + gw / 2 + 0.25, length - 0.25):
        fa.box(S, (a - 0.25, -0.38, 0), (a + 0.25, 0.12, hw + 0.3), "wall")
        fa.box(S, (a - 0.31, -0.44, hw + 0.29), (a + 0.31, 0.18, hw + 0.41), "trim")
    # side and back walls of the compound
    fa.box(S, (0, -w + 0.26, 0), (0.26, -0.25, hw))
    fa.box(S, (length - 0.26, -w + 0.26, 0), (length, -0.25, hw))
    # gate: two leaves, sheet below, bars above with spikes
    for (s0, s1) in ((zg - gw / 2 + 0.02, zg - 0.02), (zg + 0.02, zg + gw / 2 - 0.02)):
        S.frame(M, s0, 0.08, s1, 2.05, 0.06, -0.12, -0.06, "metal_dark")
        fa.box(S, (s0 + 0.05, -0.115, 0.12), (s1 - 0.05, -0.1, 1.0), "metal_dark")
        fa.box(S, (s0 + 0.05, -0.12, 0.98), (s1 - 0.05, -0.06, 1.04), "metal_dark")
        n = int((s1 - s0) / 0.13)
        for i in range(1, n):
            aa = s0 + (s1 - s0) * i / n
            fa.bar((aa, -0.09, 1.04), (aa, -0.09, 2.0), 0.016)
            fa.bar((aa, -0.09, 2.0), (aa, -0.09, 2.0 + (0.22 if i % 2 else 0.12)), 0.012)
    if rng.random() < 0.5:
        n = int(length / 0.03)
        pts = [fa.w((length * i / n + 0.05 * math.sin(i * 0.9), -0.13 + 0.17 * math.cos(i * 0.9), hw + 0.3 + 0.17 * math.sin(i * 0.9)))
               for i in range(n + 1)]
        fa.K.tube(pts, 0.004, n=4, mat="wire")
    # the house
    hf, H = 4.4, 3.3
    Wb, Db = length - 1.4, max(3.0, w - hf - 0.3)
    hb = street.Fa(tag + "h", M @ Matrix.Translation((0.7, -hf, 0)), wall=rng.choice(street.WALL_TONES))
    hb.box(hb.S, (0, -Db, 0), (Wb, 0, H))
    hb.box(hb.S, (-0.03, -0.01, 0), (Wb + 0.03, 0.06, 0.45), "plinth")
    street.gable_roof(hb, Wb, Db, H, rise=1.6, over=0.5)
    nb = max(2, round(Wb / 2.8))
    for i in range(nb):
        ac = (i + 0.5) * Wb / nb
        if i == nb // 2:
            hb.window(ac - 0.5, 0.45, 1.0, 2.2, "door", grille="bars", sunshade=False)
        else:
            hb.window(ac - 0.65, 1.1, 1.3, 1.4, "louvre", grille="bars" if rng.random() < 0.8 else None,
                      sunshade=rng.random() < 0.5)
    # veranda posts
    for i in range(nb + 1):
        a = 0.2 + (Wb - 0.4) * i / nb
        hb.box(hb.S, (a - 0.15, 1.4, 0), (a + 0.15, 1.7, H - 0.02), "wall")
    hb.box(hb.S, (-0.3, -0.01, H - 0.3), (Wb + 0.3, 1.8, H - 0.02), "trim")
    if det and rng.random() < 0.4:
        a, d = Wb - 1.4, -Db + 1.4
        for (da, dd) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            hb.box(hb.S, (a + da - 0.05, d + dd - 0.05, H), (a + da + 0.05, d + dd + 0.05, H + 2.3), "metal")
        hb.box(hb.S, (a - 0.65, d - 0.65, H + 2.29), (a + 0.65, d + 0.65, H + 2.4), "metal")
        T = get(tag + "_tank", "lines", smooth=True)
        c = hb.w((a, d, H + 2.402))
        T.cyl(c, c + Vector((0, 0, 1.3)), 0.68, n=24, mat="plastic")
        T.cyl(c + Vector((0, 0, 1.3)), c + Vector((0, 0, 1.45)), 0.68, 0.24, n=24, mat="plastic")


def container_at(tag, M, length, rng):
    """A 20 ft container shop on blocks, doors open as a counter, lean-to canopy, sign on top."""
    fa = street.Fa(tag, M, wall="sheet_ox")
    S = fa.S
    w, hh = 2.45, 2.6
    for a in (0.4, length - 0.4):
        fa.box(S, (a - 0.2, -w + 0.1, 0), (a + 0.2, -0.1, 0.22), "block")
    fa.box(S, (0, -w, 0.2), (length, 0, 0.2 + hh), "sheet_ox")
    a0, a1 = length / 2 - 1.4, length / 2 + 1.4
    fa.box(S, (a0, -0.6, 0.75), (a1, 0.02, 2.4), "shop_dark")
    fa.box(S, (a0 - 0.05, -0.01, 0.7), (a1 + 0.05, 0.45, 0.8), "wood")
    for k in range(3):
        fa.box(S, (a0 + 0.05, -0.55, 1.3 + 0.38 * k), (a1 - 0.05, -0.3, 1.33 + 0.38 * k), "wood")
    G = get(tag + "_goods", "fine", smooth=True)
    gr = random.Random(len(tag))
    for k in range(2):
        a = a0 + 0.15
        while a < a1 - 0.15:
            G.cyl(fa.w((a, -0.42, 1.33 + 0.38 * k)), fa.w((a, -0.42, 1.33 + 0.38 * k + gr.uniform(0.12, 0.25))), 0.04, n=8,
                  mat="plastic")
            a += gr.uniform(0.1, 0.18)
    # the doors swung open flat against the front
    for (b0, b1) in ((a0 - 1.2, a0 - 0.02), (a1 + 0.02, a1 + 1.2)):
        fa.box(S, (b0, 0.0, 0.25), (b1, 0.05, 2.7), "sheet_ox")
    fa.canopy(-0.1, length + 0.1, 3.0, 1.4, sign=False, posts=True)
    fa.signboard(0.3, length - 0.3, 3.15, 3.85, -0.5)


def unfinished_at(tag, M, length, w, rng):
    """Columns with rebar starters, a first-floor slab, part-built blockwork and a sand heap."""
    fa = street.Fa(tag, M, wall="concrete")
    S = fa.S
    nb = max(2, round(length / 3.6))
    for i in range(nb + 1):
        a = 0.2 + (length - 0.4) * i / nb
        for d in (-0.2, -w / 2, -w + 0.2):
            fa.box(S, (a - 0.15, d - 0.15, 0), (a + 0.15, d + 0.15, 3.0), "concrete")
            fa.box(S, (a - 0.15, d - 0.15, 3.2), (a + 0.15, d + 0.15, 4.0), "concrete")
            for (da, dd) in ((-0.07, -0.07), (0.07, -0.07), (0.07, 0.07), (-0.07, 0.07)):
                fa.bar((a + da, d + dd, 4.0), (a + da * 2.5, d + dd * 2.5, 5.3), 0.012, "rust")
    fa.box(S, (0, -w, 3.0), (length, 0, 3.22), "concrete")
    for i in range(nb):
        if rng.random() < 0.35:
            continue
        a0 = 0.35 + (length - 0.4) * i / nb
        a1 = 0.05 + (length - 0.4) * (i + 1) / nb
        fa.box(S, (a0, -0.31, 0), (a1, -0.09, 0.8 + rng.random() * 1.8), "block")
    T = get(tag + "_heap", "lines", smooth=True)
    c = fa.w((length * 0.7, 1.4, 0.0))
    rings = []
    for (r, z) in ((1.1, 0.0), (0.8, 0.45), (0.35, 0.85), (0.05, 0.95)):
        rings.append([c + Vector((math.cos(2 * math.pi * i / 18) * r * 1.2, math.sin(2 * math.pi * i / 18) * r, z))
                      for i in range(18)])
    T.loft(rings, True, "earth", smooth=True)


# ----------------------------------------------------------------------------------------------
# poles, wires, lamps, trees
# ----------------------------------------------------------------------------------------------
def place_poles():
    poles = [r for r in D["rec"] if r["kind"] == "pole"]
    tops = []
    rng = random.Random(77)
    for k, r in enumerate(poles):
        M = rec_M(r)
        geo.CURRENT_MATRIX = M
        arms = street.pole(f"pole{k:02d}", r["x"], 0.0, h=9.3, transformer=rng.random() < 0.35, lamp=False)
        geo.CURRENT_MATRIX = None
        tops.append({kk: [M @ v for v in vv] for kk, vv in arms.items()})
    # the section's spans: consecutive poles closer than 50 m get 4 top + 2 lower wires
    s_of = [_station_of(r) for r in poles]
    for i in range(len(poles) - 1):
        if s_of[i + 1] - s_of[i] > 50:
            continue
        a, b = tops[i], tops[i + 1]
        for j in range(4):
            street.wire(f"w{i}_{j}", street.catenary(a[2.4][j], b[2.4][j], 0.75 + j * 0.08, 40, tangle=0.04 * (j == 3), seed=i * 7 + j))
        for j in range(2):
            street.wire(f"wl{i}_{j}", street.catenary(a[1.7][j], b[1.7][j], 0.6, 40, tangle=0.12, seed=i * 5 + j))
    # service drops to the buildings, some across the street (as the map draws them)
    for i, (r, t) in enumerate(zip(poles, tops)):
        s = s_of[i]
        street.wire(f"d{i}a", street.catenary(t[2.4][0], wpt(s + 3, -9.0, 5.6), 0.4, 24, seed=i))
        if i % 2 == 0:
            street.wire(f"d{i}b", street.catenary(t[2.4][3], wpt(s - 5, 8.7, 6.2), 0.9, 40, seed=i + 50))
        if i % 3 == 1:
            street.wire(f"d{i}c", street.catenary(t[2.4][3], wpt(s + 6, 8.7, 5.4), 1.2, 40, tangle=0.05, seed=i + 90))
        # facade cables run along the building fronts from where the drops land
        street.wire(f"f{i}", [wpt(s + 3 + k * 0.5, -8.83, 5.6 - 0.02 * math.sin(k)) for k in range(14)], r=0.006)


def _station_of(r):
    """Road station of a recorded placement (closest centreline point to its frame origin)."""
    best, bs = 1e18, 0
    S0, DS = D["road"]["S0"], D["road"]["DS"]
    for i in range(0, len(PX), 2):
        d = (PX[i] - r["TX"]) ** 2 + (PZ[i] - r["TZ"]) ** 2
        if d < best:
            best, bs = d, S0 + i * DS
    return bs


def place_lamps():
    for k, r in enumerate(r for r in D["rec"] if r["kind"] == "lamp"):
        geo.CURRENT_MATRIX = rec_M(r)
        S = get(f"lamp{k}", "lines", union=True)
        x = r["x"]
        S.box((x - 0.2, -0.2, 0), (x + 0.2, 0.2, 0.5), mat="concrete")
        S.cyl((x, 0, 0.49), (x, 0, 6.2), 0.07, 0.05, n=12, mat="metal")
        S.seg_box((x, 0, 6.15), (x - 1.6, 0, 6.5), 0.06, mat="metal")
        S.box((x - 2.15, -0.2, 6.3), (x - 1.25, 0.2, 6.52), mat="metal")
        geo.CURRENT_MATRIX = None


def place_trees():
    import trees
    trs = [r for r in D["rec"] if r["kind"] == "tree"]
    for k, r in enumerate(trs):
        rng = random.Random(500 + k)
        sph = D["FILL"]["sph"][r["fl"]["sph"]]
        scale = max(0.75, min(1.15, sph[3] / 1.9))
        geo.CURRENT_MATRIX = rec_M(r)
        x = r["x"]
        roll = rng.random()
        if roll < 0.55:
            trees.almond(f"alm{k}", x, 0.0, scale, seed=31 + k)
        elif roll < 0.8:
            trees.rounded_tree(f"rnd{k}", x, 0.0, scale * 0.9, seed=41 + k)
        else:
            trees.oil_palm(f"palm{k}", x, 0.0, 8.0 + rng.random() * 1.5, seed=51 + k)
        geo.CURRENT_MATRIX = None


# ----------------------------------------------------------------------------------------------
# vehicles
# ----------------------------------------------------------------------------------------------
VEH_LEN = {"car": 4.8, "suv": 4.79, "danfo": 4.57, "keke": 0.0, "okada": 1.3}
PAINTS = ["paint_light", "paint_mid", "paint_dark", "paint_light", "paint_mid"]


def vehicle(tag, model, centre, front, rng):
    """centre: Blender world point; front: unit 2D (Blender) facing direction."""
    import vehicles
    h = math.atan2(-front.x, front.y)
    L = VEH_LEN[model]
    pos = Vector((centre.x, centre.y, 0.0)) - Vector((front.x, front.y, 0)) * L / 2
    pos.z = -0.15 if abs(_lat_of(centre)) < 3.6 else 0.0
    geo.COLL_OVERRIDE = "figures"
    if model in ("car", "suv"):
        vehicles.sedan(tag, tuple(pos), h, paint=rng.choice(PAINTS), suv=model == "suv")
    elif model == "danfo":
        vehicles.danfo(tag, tuple(pos), h)
    elif model == "keke":
        vehicles.keke(tag, tuple(pos), h, paint=rng.choice(["keke", "keke", "paint_mid"]))
    elif model == "okada":
        M = vehicles.okada(tag, tuple(pos), h)
        geo.COLL_OVERRIDE = None
        return M
    geo.COLL_OVERRIDE = None
    return None


def _lat_of(p):
    """Signed lateral offset of a Blender point from the centreline (approx, nearest point)."""
    best, bi = 1e18, 0
    for i in range(0, len(PX), 2):
        d = (PX[i] - p.x) ** 2 + (-PZ[i] - p.y) ** 2
        if d < best:
            best, bi = d, i
    t = PT[bi]
    return (p.x - PX[bi]) * math.cos(t) + (-p.y - PZ[bi]) * math.sin(t)


PEOPLE = []   # (name, world position, heading)


def place_vehicles():
    rng = random.Random(4242)
    n = 0
    for k, r in enumerate(r for r in D["rec"] if r["kind"] == "veh"):
        centre = Vector((r["TX"], -r["TZ"], 0))
        front = Vector((r["TS"], r["TC"])).normalized()
        model = r["model"]
        if model == "car":
            model = "suv" if rng.random() < 0.35 else "car"
        vehicle(f"veh{k:02d}", model, centre, front, rng)
        if model == "keke" and abs(r["lat"]) < 4:
            # moving keke: a driver aboard
            PEOPLE.append(("driver_m", centre + Vector((front.x, front.y, 0)) * 0.32, math.atan2(-front.x, front.y) + math.pi, 0.0))
        n += 1
    return n


# ----------------------------------------------------------------------------------------------
# lettering on every signboard
# ----------------------------------------------------------------------------------------------
SHOP_NAMES = [
    "MAMA PUT", "POS", "PHARMACY", "GOD'S GRACE\nSTORES", "VULCANIZER", "CHEMIST",
    "EFE PROVISIONS", "ONOME FASHION\nHOUSE", "BLESSED\nELECTRONICS", "PHOTOCOPY &\nLAMINATION",
    "BARBING SALOON", "HAIR SALON", "OGHENE AUTO\nSPARE PARTS", "TRUST GOD\nBUSINESS CENTRE",
    "FRESH FISH", "TAILORING", "PHONE & ACCESSORIES", "RICE & BEANS", "PUREWATER", "PATENT\nMEDICINE STORE",
    "EBI BUILDING\nMATERIALS", "NO CONDITION\nIS PERMANENT", "AMAKA KITCHEN", "PRINTING PRESS",
]
SIGNS = []        # (text, world matrix of the board face centre, width, height)
_sign_i = [0]


def sign_hook(fa, a0, a1, h0, h1, d_face, text=None):
    w, h = a1 - a0, h1 - h0
    if w < 0.8 or h < 0.2:
        return
    if text is None:
        name = SHOP_NAMES[_sign_i[0] % len(SHOP_NAMES)]
        _sign_i[0] += 1
    else:
        name = text
    if h < 0.45:
        name = name.replace("\n", " ")
    CM = geo.CURRENT_MATRIX if geo.CURRENT_MATRIX is not None else Matrix.Identity(4)
    # text x along -a (reads left-to-right from the street), y up, normal +d
    R = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))).transposed()
    Mw = CM @ fa.M @ Matrix.Translation(((a0 + a1) / 2, d_face + 0.004, (h0 + h1) / 2)) @ R
    SIGNS.append((name, Mw, w * 0.86, h * 0.72))


def make_lettering(parent=None):
    """Turn SIGNS into flat ink-lettering meshes (Blender's built-in font, thickened a touch)."""
    coll = geo.ensure_collections()["nolines"]
    mat = bpy.data.materials["lettering"]
    n = 0
    for (text, Mw, w, h) in SIGNS:
        cu = bpy.data.curves.new("sign", "FONT")
        cu.body = text
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        lines = text.count("\n") + 1
        longest = max(len(t) for t in text.split("\n"))
        size = min(h / (lines * 1.05), w / max(1, longest * 0.62))
        cu.size = size
        cu.offset = size * 0.035
        cu.space_line = 0.95
        ob = bpy.data.objects.new("sign_txt", cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.curves.remove(cu)
        me.materials.append(mat)
        tob = bpy.data.objects.new("sign_txt", me)
        coll.objects.link(tob)
        if parent is not None:
            tob.parent = parent
        tob.matrix_basis = Mw
        n += 1
    return n


# ----------------------------------------------------------------------------------------------
# the five landmarks (each in the street frame at its station: x lateral, y forward = -map z)
# ----------------------------------------------------------------------------------------------
def Y(z_map):
    return -z_map


def lm_filling_station():
    """1, right, s = 40: yellow canopy over two pump islands, a kiosk shop, a price pylon."""
    geo.CURRENT_MATRIX = M_at(40)
    x = 11.0
    S = get("lm1_canopy", "lines", union=True)
    # canopy: a bright fascia (the "yellow canopy": the lightest value in the scene, crisp
    # outline) with a dark lower lip, a soffit under it, on four clad columns
    S.box((x - 5.5, -3.5, 4.95), (x + 5.5, 3.5, 5.75), mat="canopy_yellow")
    S.box((x - 5.53, -3.53, 4.85), (x + 5.53, 3.53, 4.97), mat="canopy_band")
    S.box((x - 5.38, -3.38, 4.7), (x + 5.38, 3.38, 4.86), mat="soffit")
    for (p, q) in ((-4.5, -2.8), (4.5, -2.8), (-4.5, 2.8), (4.5, 2.8)):
        S.box((x + p - 0.22, q - 0.22, 0.0), (x + p + 0.22, q + 0.22, 4.71), mat="canopy_yellow")
        S.box((x + p - 0.28, q - 0.28, 0.0), (x + p + 0.28, q + 0.28, 1.0), mat="canopy_band")
    S.box((x - 3.0, -0.7, 0.0), (x + 3.0, 0.7, 0.25), mat="kerb")                     # pump island
    # soffit: panel joints (ink) and eight recessed light boxes
    K = get("lm1_k", "nolines")
    for k in range(1, 12):
        K.seg_box((x - 5.38 + k * 0.9, -3.38, 4.695), (x - 5.38 + k * 0.9, 3.38, 4.695), 0.02, 0.006, mat="metal_dark")
    for yy in (-1.7, 0.0, 1.7):
        K.seg_box((x - 5.38, yy, 4.695), (x + 5.38, yy, 4.695), 0.02, 0.006, mat="metal_dark")
    Lt = get("lm1_lights", "fine")
    for xx in (-3.6, -1.2, 1.2, 3.6):
        for yy in (-1.6, 1.6):
            Lt.box((x + xx - 0.45, yy - 0.2, 4.64), (x + xx + 0.45, yy + 0.2, 4.701), mat="lamp")
    # pumps: two-tone body, header with grade label, display window, two nozzle holsters with
    # hoses looping from the header down to the nozzles
    F = get("lm1_pumps", "figures", union=True)
    Fd = get("lm1_pump_det", "figures", smooth=True)
    for o in (-1.8, 1.8):
        F.box((x + o - 0.45, -0.32, 0.25), (x + o + 0.45, 0.32, 1.35), mat="fuel_pump")
        F.box((x + o - 0.42, -0.3, 1.34), (x + o + 0.42, 0.3, 1.9), mat="trim")
        F.box((x + o - 0.47, -0.34, 1.89), (x + o + 0.47, 0.34, 2.25), mat="canopy_yellow")
        for sd in (-1, 1):
            yf = sd * 0.302
            F.box((x + o - 0.3, yf - 0.02 if sd > 0 else yf - 0.012, 1.42), (x + o + 0.3, yf + 0.012 if sd < 0 else yf + 0.02, 1.82), mat="vglass")
            F.box((x + o - 0.22, yf - 0.02 if sd > 0 else yf - 0.02, 0.55), (x + o + 0.22, yf + 0.02, 1.12), mat="metal_dark")
            for hx in (-0.36, 0.36):
                # holster on the side, nozzle in it, hose from the header
                F.box((x + o + hx - 0.06, sd * 0.32 - 0.05, 1.05), (x + o + hx + 0.06, sd * 0.32 + 0.07 * sd, 1.25), mat="metal_dark")
                Fd.tube([Vector((x + o + hx, sd * 0.4, 1.2)), Vector((x + o + hx, sd * 0.47, 1.05)), Vector((x + o + hx, sd * 0.43, 0.95))],
                        0.03, 0.022, n=8, mat="tyre")
                K.tube([Vector((x + o + hx * 0.6, sd * 0.33, 2.0)), Vector((x + o + hx * 1.3, sd * 0.55, 1.4)),
                        Vector((x + o + hx * 1.25, sd * 0.62, 0.7)), Vector((x + o + hx * 1.05, sd * 0.5, 0.45)),
                        Vector((x + o + hx, sd * 0.43, 1.0))], 0.016, n=6, mat="ink")
        pf_ = facade_frame((x + o - 0.47, 0.342, 0), (0, 1, 0))
        _text_on(pf_, "PMS" if o < 0 else "AGO", 0.47, 0.8, 2.07, 0, 0.0, 0.24)
        pb_ = facade_frame((x + o + 0.47, -0.342, 0), (0, -1, 0))
        _text_on(pb_, "PMS" if o < 0 else "AGO", 0.47, 0.8, 2.07, 0, 0.0, 0.24)
    # kiosk shop behind, with roof slab, louvre window, door, AC
    M = facade_frame((x + 5.5, Y(-1) + 2.0, 0.0), (-1, 0, 0))
    fa = street.Fa("lm1_shop", M, wall="wall")
    fa.box(fa.S, (0, -5, 0), (4, 0, 3.2))
    fa.box(fa.S, (-0.3, -5.3, 3.19), (4.3, 0.3, 3.55), "trim")
    fa.window(0.3, 1.0, 1.6, 1.3, "louvre", grille="bars", sunshade=False)
    fa.window(2.3, 0.0, 1.0, 2.3, "door", grille=None, sunshade=False)
    fa.signboard(0.4, 3.6, 2.45, 3.0, 0.05)
    # price pylon at the forecourt edge
    P = get("lm1_pylon", "lines", union=True)
    P.box((x - 4.55, Y(-8) - 0.15, 0), (x - 4.25, Y(-8) + 0.15, 5.65), mat="metal")
    P.box((x - 4.6, Y(-8) - 1.0, 5.6), (x - 4.2, Y(-8) + 1.0, 8.2), mat="canopy_yellow")
    P.box((x - 4.64, Y(-8) - 1.04, 7.55), (x - 4.16, Y(-8) + 1.04, 7.7), mat="canopy_band")
    geo.CURRENT_MATRIX = M_at(40)
    # lettering: the fascia, all four faces, and the pylon's product / price boards
    for (org, n, ln) in (((x - 5.5, -3.5, 0), (-1, 0, 0), 7.0), ((x + 5.5, 3.5, 0), (1, 0, 0), 7.0),
                         ((x + 5.5, -3.5, 0), (0, -1, 0), 11.0), ((x - 5.5, 3.5, 0), (0, 1, 0), 11.0)):
        _text_on(facade_frame(org, n), "FILLING STATION", ln / 2, ln * 0.82, 5.35, 0, 0.0, 0.5)
    pyl = facade_frame((x - 4.64, Y(-8) - 0.9, 0), (-1, 0, 0))
    for i, t in enumerate(("PMS  ₦ 650", "DPK  ₦ 1100", "AGO  ₦ 1200")):
        _text_on(pyl, t, 0.9, 1.8, 6.15 + i * 0.5, 0.0, 0.0, 0.3, size=0.26)
    _text_on(pyl, "FUEL", 0.9, 1.8, 7.95, 0.0, 0.0, 0.35, size=0.34)
    geo.CURRENT_MATRIX = None
    PEOPLE.append(("stand_m", M_at(40) @ Vector((x - 1.0, 0.9, 0.25)), _h_local(40, -math.pi / 2), 0.0))


def _h_local(s, h_local):
    """World heading for a person whose local heading (street frame) is h_local."""
    return h_local - fr(s)[2]


def _text_on(Mf, text, a_c, w, h_c, _unused, d, h, size=None):
    """Lettering on a facade frame Mf (local to CURRENT_MATRIX), centred at (a_c, h_c)."""
    CM = geo.CURRENT_MATRIX if geo.CURRENT_MATRIX is not None else Matrix.Identity(4)
    R = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))).transposed()
    Mw = CM @ Mf @ Matrix.Translation((a_c, d + 0.012, h_c)) @ R
    SIGNS.append((text, Mw, w, h if size is None else size))


def lm_water_tank():
    """2, left, s = 100: a tall tank on a braced four-leg tower behind a fence."""
    geo.CURRENT_MATRIX = M_at(100)
    x, z = -12.0, 0.0
    S = get("lm2_tower", "lines", union=True)
    legs = [(-1.6, -1.6), (1.6, -1.6), (1.6, 1.6), (-1.6, 1.6)]
    for (p, q) in legs:
        S.box((x + p - 0.15, q - 0.15, 0), (x + p + 0.15, q + 0.15, 9.0), mat="concrete")
    for y in (3.2, 6.0):
        for i in range(4):
            (p1, q1), (p2, q2) = legs[i], legs[(i + 1) % 4]
            S.seg_box((x + p1, q1, y), (x + p2, q2, y), 0.22, 0.25, mat="concrete")
    S.box((x - 2.2, -2.2, 9.0), (x + 2.2, 2.2, 9.3), mat="concrete")
    K = get("lm2_k", "nolines")
    for i in range(4):
        (p1, q1), (p2, q2) = legs[i], legs[(i + 1) % 4]
        for (y0, y1) in ((0.4, 3.2), (3.2, 6.0), (6.0, 8.8)):
            K.seg_box((x + p1, q1, y0), (x + p2, q2, y1), 0.04, mat="metal_dark")
            K.seg_box((x + p2, q2, y0), (x + p1, q1, y1), 0.04, mat="metal_dark")
    # railing round the platform
    for t in range(9):
        u = -2.2 + 4.4 * t / 8
        for (a, b) in (((x + u, -2.2), (x + u, -2.2)), ((x + u, 2.2), (x + u, 2.2)), ((x - 2.2, u), (x - 2.2, u)), ((x + 2.2, u), (x + 2.2, u))):
            K.seg_box((a[0], a[1], 9.3), (a[0], a[1], 10.3), 0.03, mat="metal_dark")
    for (a, b) in (((-2.2, -2.2), (2.2, -2.2)), ((2.2, -2.2), (2.2, 2.2)), ((2.2, 2.2), (-2.2, 2.2)), ((-2.2, 2.2), (-2.2, -2.2))):
        K.seg_box((x + a[0], a[1], 10.3), (x + b[0], b[1], 10.3), 0.045, mat="metal_dark")
    T = get("lm2_tank", "lines", smooth=True)
    T.cyl((x, 0, 9.3), (x, 0, 12.9), 2.6, n=40, mat="plastic")
    T.cyl((x, 0, 12.9), (x, 0, 13.85), 2.65, 0.3, n=40, mat="plastic")
    R = get("lm2_ribs", "fine", smooth=True)
    for y in (10.2, 11.1, 12.0):
        R.cyl((x, 0, y), (x, 0, y + 0.06), 2.63, n=40, mat="plastic")
    # ladder up one leg
    for sd in (-0.3, 0.3):
        K.seg_box((x + 1.85, sd, 0), (x + 1.85, sd, 9.0), 0.05, mat="metal_dark")
    for y in [0.4 * i for i in range(1, 23)]:
        K.seg_box((x + 1.85, -0.3, y), (x + 1.85, 0.3, y), 0.03, mat="metal_dark")
    # fence along the street in front: block piers, low wall, mesh panels
    F = get("lm2_fence", "lines", union=True)
    xf = x + 4.2
    for i in range(-5, 6):
        F.box((xf - 0.15, i * 0.9 * 1.0 - 0.15, 0), (xf + 0.15, i * 0.9 + 0.15, 1.9), mat="wall")
    F.box((xf - 0.1, -4.6, 0), (xf + 0.1, 4.6, 0.5), mat="block")
    for z_ in [-4.5 + 0.15 * i for i in range(61)]:
        K.seg_box((xf, z_, 0.5), (xf, z_, 1.8), 0.008, mat="metal_dark")
    for y in (0.6, 1.2, 1.8):
        K.seg_box((xf, -4.5, y), (xf, 4.5, y), 0.02, mat="metal_dark")
    geo.CURRENT_MATRIX = None


def lm_umbrellas():
    """3, right, s = 160: a row of six market umbrellas with tables and traders."""
    geo.CURRENT_MATRIX = M_at(160)
    rng = random.Random(160)
    street.BASE = 0.0
    for i in range(6):
        x, z = 7.6 + (i % 2) * 0.6, 8 - i * 3.2
        street.umbrella_stall(f"lm3_u{i}", x, Y(z), rng)
        if i % 2 == 0:
            PEOPLE.append(("seated_m" if i == 2 else "trader_f", M_at(160) @ Vector((x + 0.9, Y(z) + 0.3, -0.43 if i == 2 else 0.0)),
                           _h_local(160, math.pi / 2), 0.0))
    geo.CURRENT_MATRIX = None


def lm_church():
    """4, left, s = 215: St Paul's: white nave, blue pitched roof, arched windows, a tower."""
    geo.CURRENT_MATRIX = M_at(215)
    x = -14.0
    S = get("lm4_nave", "lines", union=True)
    S.box((x - 4, -6, 0), (x + 4, 6, 5.0), mat="church_wall")
    S.box((x - 4.05, -6.05, 0), (x + 4.05, 6.05, 0.55), mat="plinth")
    # arched windows on the street side (x + 4) and the gable
    G = get("lm4_glass", "nolines")
    for zz in (-4.5, -2.25, 0.0, 2.25, 4.5):
        _arch(S, G, (x + 4.0, Y(zz)), "x+", 0.9, 1.2, 2.4)
    for xx in (x - 1.5, x - 3.0):
        _arch(S, G, (xx, Y(6.0)), "y-", 1.0, 1.5, 2.2)
    R = get("lm4_roof", "lines", union=True)
    prof = [(4.4, 4.95), (0.0, 8.2), (-4.4, 4.95), (-4.4, 4.8), (0.0, 8.05), (4.4, 4.8)]
    R.prism([Vector((x + a, Y(-6.3), h)) for (a, h) in prof], Vector((0, Y(6.3) - Y(-6.3), 0)), "roof_blue")
    # gable walls up to the roof
    for zz in (-6.0, 6.0):
        S.prism([Vector((x - 4, Y(zz) - 0.01 if zz > 0 else Y(zz) + 0.01, 4.99)), Vector((x, Y(zz), 8.0)),
                 Vector((x + 4, Y(zz), 4.99))][::1], Vector((0, 0.2 if zz > 0 else -0.2, 0)), "church_wall")
    # tower at the front corner
    tx, tz = x + 3.6, 5.2
    T = get("lm4_tower", "lines", union=True)
    T.box((tx - 1.3, Y(tz) - 1.3, 0), (tx + 1.3, Y(tz) + 1.3, 9.0), mat="church_wall")
    for y in (5.0, 7.6):
        T.box((tx - 1.36, Y(tz) - 1.36, y), (tx + 1.36, Y(tz) + 1.36, y + 0.16), mat="trim")
    _arch(T, G, (tx + 1.3, Y(tz)), "x+", 1.0, 5.9, 1.5)
    _arch(T, G, (tx, Y(tz) - 1.3), "y-", 1.0, 5.9, 1.5)
    _arch(T, G, (tx, Y(tz) - 1.3), "y-", 1.3, 0.0, 2.6)
    _arch(T, G, (tx + 1.3, Y(tz)), "x+", 0.6, 2.6, 1.4)
    Rt = get("lm4_spire", "lines")
    apex = Vector((tx, Y(tz), 11.6))
    base = [Vector((tx + a, Y(tz) + b, 9.0)) for (a, b) in ((-1.45, -1.45), (1.45, -1.45), (1.45, 1.45), (-1.45, 1.45))]
    vs = Rt.verts(base + [apex])
    Rt.faces(vs, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [3, 2, 1, 0]], "roof_blue")
    C = get("lm4_cross", "lines", union=True)
    C.box((tx - 0.05, Y(tz) - 0.05, 11.55), (tx + 0.05, Y(tz) + 0.05, 13.0), mat="metal_dark")
    C.box((tx - 0.05, Y(tz) - 0.4, 12.5), (tx + 0.05, Y(tz) + 0.4, 12.6), mat="metal_dark")
    # fence wall with piers along the street, a name board at the gate
    F = get("lm4_fence", "lines", union=True)
    for (a, b) in ((-8.5, -1.8), (1.8, 8.5)):
        F.box((x + 5.27, Y(b), 0), (x + 5.53, Y(a), 1.5), mat="church_wall")
        F.box((x + 5.22, Y(b) - 0.02, 1.49), (x + 5.58, Y(a) + 0.02, 1.58), mat="trim")
    for zz in (-8.5, -1.8, 1.8, 8.5):
        F.box((x + 5.17, Y(zz) - 0.22, 0), (x + 5.63, Y(zz) + 0.22, 1.85), mat="church_wall")
        F.box((x + 5.12, Y(zz) - 0.28, 1.84), (x + 5.68, Y(zz) + 0.28, 1.95), mat="trim")
    B = get("lm4_board", "lines", union=True)
    for zz in (-3.2, -0.6):
        B.box((x + 6.2, Y(zz) - 0.05, 0), (x + 6.3, Y(zz) + 0.05, 2.2), mat="metal")
    B.box((x + 6.32, Y(-3.4), 1.3), (x + 6.4, Y(-0.4), 2.4), mat="sign")
    bf = facade_frame((x + 6.4, Y(-3.4), 0), (1, 0, 0))
    _text_on(bf, "ST PAUL'S\nANGLICAN CHURCH", 1.5, 2.6, 1.85, 0, 0.0, 0.8)
    geo.CURRENT_MATRIX = None


def _arch(S, G, at, face, w, y0, hh):
    """Round-headed opening: a frame proud of the wall and a dark glazed panel, on face x+ or y-."""
    (ax, ay) = at
    r = w / 2
    pts = [(-r, y0), (r, y0)] + [(math.cos(math.pi * k / 10) * r, y0 + hh - r + math.sin(math.pi * k / 10) * r)
                                  for k in range(11)]
    if face == "x+":
        P = lambda u, h, d: Vector((ax + d, ay - u, h))  # noqa: E731
    else:
        P = lambda u, h, d: Vector((ax + u, ay - d, h))  # noqa: E731
    G.poly([P(u, h, 0.012) for (u, h) in pts], "glass_shop")
    for k in range(len(pts)):
        (u0, h0), (u1, h1) = pts[k], pts[(k + 1) % len(pts)]
        S.seg_box(P(u0, h0, 0.04), P(u1, h1, 0.04), 0.09, 0.09, mat="trim")


def lm_market_gate():
    """5, left, s = 245: green gate pillars, a lintel with a painted arch, stalls behind."""
    geo.CURRENT_MATRIX = M_at(245)
    x = -6.4
    S = get("lm5_gate", "lines", union=True)
    for o in (-5, 5):
        S.box((x - 0.75, Y(o) - 0.75, 0), (x + 0.75, Y(o) + 0.75, 0.6), mat="gate_green")
        S.box((x - 0.6, Y(o) - 0.6, 0.59), (x + 0.6, Y(o) + 0.6, 6.4), mat="gate_green")
        S.box((x - 0.8, Y(o) - 0.8, 6.39), (x + 0.8, Y(o) + 0.8, 6.75), mat="trim")
        S.box((x - 0.25, Y(o) - 0.25, 8.33), (x + 0.25, Y(o) + 0.25, 8.85), mat="gate_green")
        S.cyl((x, Y(o), 8.84), (x, Y(o), 9.4), 0.08, 0.02, n=10, mat="gate_green")
        # recessed panel on the street face of each pillar
        S.box((x + 0.58, Y(o) - 0.38, 1.0), (x + 0.64, Y(o) + 0.38, 5.9), mat="gate_paint")
    S.box((x - 0.6, Y(5.7), 6.75), (x + 0.6, Y(-5.7), 8.35), mat="gate_green")
    S.box((x + 0.59, Y(4.3), 7.0), (x + 0.66, Y(-4.3), 8.1), mat="gate_paint")
    # the painted arch: a real arched member under the lintel, painted light
    A = get("lm5_arch", "lines", union=True)
    n = 24
    for k in range(n):
        t0, t1 = math.pi * k / n, math.pi * (k + 1) / n
        p0 = Vector((x + 0.3, Y(-4.4 * math.cos(t0)), 4.2 + 2.5 * math.sin(t0)))
        p1 = Vector((x + 0.3, Y(-4.4 * math.cos(t1)), 4.2 + 2.5 * math.sin(t1)))
        A.seg_box(p0, p1, 0.5, 0.3, up=(1, 0, 0), mat="gate_paint")
    for o in (-4.4, 4.4):
        A.box((x + 0.05, Y(o) - 0.15, 4.0), (x + 0.55, Y(o) + 0.15, 4.25), mat="gate_paint")
    gf = facade_frame((x + 0.66, Y(-4.3), 0), (1, 0, 0))
    _text_on(gf, "CENTRAL MARKET  SAPELE", 4.3, 8.0, 7.55, 0, 0.0, 0.62)
    # lock-up stalls lining the lane behind the gate (5 each side), awnings, wares
    rng = random.Random(245)
    lane = 3.2
    for i in range(5):
        for j in (-1, 1):
            sx, d = x - 9 - i * 6.6, 4.4
            sz, fz = j * (lane + d / 2), j * lane
            stall = street.Fa(f"lm5_st{i}{j}", facade_frame((sx - 2.8 if j > 0 else sx + 2.8, Y(fz), 0.0),
                                                                (0, 1 if j > 0 else -1, 0)), wall="wall_c")
            stall.box(stall.S, (0, -d, 0), (5.6, 0, 2.5))
            stall.shutter(0.4, 5.2, 0.0, 2.2, dark=rng.random() < 0.4) if rng.random() < 0.35 else \
                stall.box(stall.S, (0.4, -0.6, 0.0), (5.2, 0.01, 2.2), "shop_dark")
            stall.canopy(-0.1, 5.7, 2.55, 1.6, sign=True, posts=True)
            stall.box(stall.S, (0.5, 0.0, 0), (5.1, 0.7, 0.9), "wood")
            G = get(f"lm5_wares{i}{j}", "fine", smooth=True)
            for o in (0.9, 2.0, 3.1, 4.2):
                G.cyl(stall.w((o, 0.35, 0.902)), stall.w((o, 0.35, 1.05)), 0.32, 0.36, n=16, mat="basin")
                for _ in range(5):
                    G.ellipsoid(stall.w((o + rng.uniform(-0.18, 0.18), 0.35 + rng.uniform(-0.18, 0.18), 1.1)),
                                0.06, 0.06, 0.055, 8, 5, mat="goods")
    # bunting over the lane
    K = get("lm5_bunting", "nolines")
    for xx in [x - 10.5 - 6.6 * k for k in range(5)]:
        pts = [Vector((xx, Y(-lane - 0.3 + (2 * lane + 0.6) * t / 12), 3.8 - 0.55 * math.sin(math.pi * t / 12))) for t in range(13)]
        K.tube(pts, 0.006, n=4, mat="wire")
        for t in range(1, 12):
            p = pts[t]
            K.poly([p + Vector((0, 0.2, 0)), p + Vector((0, -0.2, 0)), p + Vector((0, 0, -0.42))], "gate_paint" if t % 2 else "gate_green")
    geo.CURRENT_MATRIX = None
    # the crowd at the gate and in the lane
    M = M_at(245)
    crowd = [("walker_m", (x - 2.0, Y(1.5)), math.pi / 2), ("trader_f", (x - 4.5, Y(-1.2)), -math.pi / 2),
             ("walker_f", (x - 7.5, Y(0.8)), math.pi / 2), ("stand_m", (x - 11, Y(-2.0)), 0.3),
             ("talk_f", (x - 11.6, Y(-1.4)), math.pi), ("walker_m2", (x - 15, Y(0.5)), -math.pi / 2),
             ("trader_f", (x - 20, Y(-1.8)), math.pi / 2), ("walker_m", (x - 24, Y(1.0)), -math.pi / 2),
             ("walker_f", (x + 1.5, Y(-6.5)), 0.0), ("stand_m", (x + 1.2, Y(7.0)), math.pi)]
    for (nm, (lx, ly), hl) in crowd:
        PEOPLE.append((nm, M @ Vector((lx, ly, 0.0)), _h_local(245, hl), 0.0))


def build_landmarks():
    street.BASE = 0.0
    lm_filling_station()
    lm_water_tank()
    lm_umbrellas()
    lm_church()
    lm_market_gate()


# ----------------------------------------------------------------------------------------------
# street life: pedestrians, extra stalls and parked vehicles (denser toward the market)
# ----------------------------------------------------------------------------------------------
def _occupied():
    pts = []
    for r in D["rec"]:
        if r["kind"] in ("veh", "pole", "tree", "lamp"):
            pts.append(Vector((r["TX"], -r["TZ"])))
    for i, s in enumerate(D["LS"]):
        pts.append(wpt(s, 8.0 * D["LSD"][i]).xy)
    for s in D["SB"]:
        pass
    return pts


def place_street_life():
    """Pedestrians on both walks all the way, umbrella stalls and parked okadas / kekes / cars on
    the verges from s = 120 on, a crowd near the market. Avoids the section's own placements and
    the landmark sites and keeps clear of the signboard posts (SB, drawn live by the site)."""
    import vehicles
    rng = random.Random(2026)
    occ = _occupied()
    sb_keep = [(s, D["LSD"][i]) for i, s in enumerate(D["SB"])]
    lm_keep = [(s, D["LSD"][i]) for i, s in enumerate(D["LS"])]

    def free(s, lat, r=1.4):
        p = wpt(s, lat).xy
        if any((p - q).length < r for q in occ):
            return False
        for (ss, sd) in sb_keep:
            if abs(s - ss) < 4 and lat * sd > 0:
                return False
        for (ss, sd) in lm_keep:
            if abs(s - ss) < 7 and lat * sd > 0:
                return False
        for (ss, sd) in D["SIDES"]:
            if abs(s - ss) < 5 and lat * sd > 0:
                return False
        return True

    walkers = ["walker_m", "walker_f", "walker_m2", "trader_f", "talk_f", "stand_m"]
    n_people = n_stalls = n_parked = 0
    s = -40.0
    while s < 300:
        dens = 0.35 + 0.65 * min(1.0, max(0.0, (s - 100) / 120))      # people per metre-ish
        for sd in (-1, 1):
            if rng.random() < dens * 0.5:
                lat = sd * rng.uniform(5.0, 8.2)
                if free(s, lat, 0.9):
                    x, z, t = fr(s)
                    fwd = rng.random() < 0.5
                    h = -t + (math.pi if fwd else 0.0) + rng.uniform(-0.25, 0.25)
                    nm = rng.choice(walkers)
                    PEOPLE.append((nm, wpt(s, lat, 0.0), h, 0.0))
                    occ.append(wpt(s, lat).xy)
                    n_people += 1
        if s > 100 and rng.random() < 0.08 + 0.12 * (s > 170):
            sd = rng.choice((-1, 1))
            lat = sd * rng.uniform(5.6, 6.6)
            if free(s, lat, 2.2):
                geo.CURRENT_MATRIX = M_at(s, lat)
                street.umbrella_stall(f"xs{n_stalls}", 0.0, 0.0, rng)
                geo.CURRENT_MATRIX = None
                PEOPLE.append(("trader_f" if rng.random() < 0.6 else "stand_m", wpt(s + 0.9, lat + sd * 0.6, 0.0),
                               -fr(s)[2] + (math.pi / 2 if sd > 0 else -math.pi / 2), 0.0))
                occ.append(wpt(s, lat).xy)
                n_stalls += 1
        if s > 60 and rng.random() < 0.08 + 0.14 * (s > 150):
            sd = rng.choice((-1, 1))
            lat = sd * 6.0
            model = rng.choice(["okada", "okada", "keke", "car"])
            if free(s, lat, 3.0):
                x, z, t = fr(s)
                front = Vector((math.sin(t), math.cos(t))) * (1 if rng.random() < 0.7 else -1)
                vehicle(f"xp{n_parked}", model, wpt(s, lat), front, rng)
                occ.append(wpt(s, lat).xy)
                n_parked += 1
        s += 2.0
    # a few okadas riding in the traffic lanes
    for k, (s0, lat, back) in enumerate(((52, 1.7, False), (128, -1.9, True), (176, 2.0, False), (226, 1.8, False))):
        x, z, t = fr(s0)
        front = Vector((math.sin(t), math.cos(t))) * (-1 if back else 1)
        M = vehicle(f"ok{k}", "okada", wpt(s0, lat), front, rng)
        if M is not None:
            PEOPLE.append(("rider_m", M @ Vector((0, 0.3, -0.07)), math.atan2(-front.x, front.y) + math.pi, 0.0))
    return n_people, n_stalls, n_parked


def add_people(parent=None):
    blend = os.path.join(REPO, "blender", "assets", "people", "people.blend")
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.meshes = list(src.meshes)
    mats = {m.name: m for m in bpy.data.materials}
    for me in [m for m in bpy.data.meshes if m.name in ("walker_m", "walker_f", "walker_m2", "trader_f", "talk_f", "stand_m",
                                                         "seated_m", "rider_m", "driver_m")]:
        for i, m in enumerate(me.materials):
            base = m.name.split(".")[0] if m else "top"
            me.materials[i] = mats.get(base, mats["top"])
    coll = geo.ensure_collections()["figures"]
    rng = random.Random(99)
    for k, (name, pos, h, dz) in enumerate(PEOPLE):
        me = bpy.data.meshes.get(name)
        if me is None:
            continue
        ob = bpy.data.objects.new(f"{name}_{k}", me)
        z = pos.z + dz
        lat = _lat_of(pos)
        if abs(lat) < 3.6 and name == "driver_m":
            z += -0.15
        ob.location = (pos.x, pos.y, z)
        ob.rotation_euler = (0, 0, h)
        sc = rng.uniform(0.95, 1.05)
        ob.scale = (sc * (-1 if rng.random() < 0.5 else 1), sc, sc)
        coll.objects.link(ob)
        if parent is not None:
            ob.parent = parent
    return len(PEOPLE)

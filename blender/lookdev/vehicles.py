"""Vehicles for the look-development street, modelled from real proportions.

Car-like bodies (sedan, SUV, danfo) are subdivision cages: a ring of 8 half-profile points per
station, mirrored, lofted along the length and smoothed with two Catmull-Clark levels. Edge
loops sit at the belt line, the roof and every pillar, so the glass is a set of cage faces
(material boundary, drawn once by Freestyle and rounded by the subdivision). Wheel arches are
cut with a manifold boolean after the body is smoothed. Wheels are a tyre torus, a dished rim
and a hub.

Reference dimensions (m):
  sedan  Toyota Camry XV40      L 4.80  W 1.82  H 1.47  wheelbase 2.78
  SUV    Toyota Highlander XU40 L 4.79  W 1.91  H 1.76  wheelbase 2.79
  danfo  VW T3 Transporter      L 4.57  W 1.85  H 1.95  wheelbase 2.46 (yellow, black stripes)
  keke   Bajaj RE               L 2.64  W 1.30  H 1.71  wheelbase 2.00, front track 0, rear 1.15
  okada  Bajaj Boxer 150        L 1.98  W 0.77  H 1.07  wheelbase 1.29, 17" wheels

Local frame: +Y forward, +X right, ground at z = 0. place() turns that into the street.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import geo
from geo import get, place

BASE = 0.0   # vehicles stand on the road (z = 0)


# ----------------------------------------------------------------------------------------------
# cage bodies
# ----------------------------------------------------------------------------------------------
def ring(prof):
    """Half profile [(x, z)...] from bottom centre to roof centre -> full closed ring (x mirrored)."""
    right = [(x, z) for (x, z) in prof]
    left = [(-x, z) for (x, z) in reversed(prof[1:-1])]
    return right + left


def cage_body(name, M, stations, glass, paint="paint_light", arches=(), arch_r=0.4, coll="lines",
              extra_mats=None, levels=2):
    """stations: [(y, half_profile)], all profiles the same length n.
    glass: set of (station_index, segment_index) cage faces that are glass, segment index along
    the half ring (mirrored automatically). extra_mats: {(station, seg): material}."""
    n = len(stations[0][1])
    rings = []
    for (y, prof) in stations:
        r = ring(prof)
        rings.append([Vector((x, y, z)) for (x, z) in r])
    m = len(rings[0])                           # full ring length = 2n - 2
    bm = bmesh.new()
    vs = [[bm.verts.new(M @ p) for p in r] for r in rings]
    mats = [paint, "vglass"] + sorted(set((extra_mats or {}).values()))
    mat_index = {nm: i for i, nm in enumerate(mats)}

    def seg_of(i):
        # ring index i (0..m-1) -> half-profile segment index (mirrored)
        return i if i < n - 1 else (m - 1 - i)
    for j in range(len(rings) - 1):
        for i in range(m):
            f = bm.faces.new([vs[j][i], vs[j][(i + 1) % m], vs[j + 1][(i + 1) % m], vs[j + 1][i]])
            s = seg_of(i)
            nm = paint
            if (j, s) in glass:
                nm = "vglass"
            if extra_mats and (j, s) in extra_mats:
                nm = extra_mats[(j, s)]
            f.material_index = mat_index[nm]
            f.smooth = True
    for r, rev in ((vs[0], True), (vs[-1], False)):
        f = bm.faces.new(list(reversed(r)) if rev else r)
        f.material_index = mat_index[paint]
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # creases: every paint/glass boundary is held sharp, so subdivision rounds the window
    # outlines along the cage loops instead of shrinking each pane into a blob; the belt line
    # gets a half crease for a defined shoulder
    cr = bm.edges.layers.float.new("crease_edge")
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) == 2 and fs[0].material_index != fs[1].material_index:
            e[cr] = 1.0
    for j in range(len(rings) - 1):
        for i in (4, m - 4):
            e = bm.edges.get((vs[j][i], vs[j + 1][i]))
            if e is not None and e[cr] < 0.5:
                e[cr] = 0.5
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for nm in mats:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new("subsurf", "SUBSURF")
    md.levels = md.render_levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    ob.modifiers.remove(md)
    ob.data = me2
    bpy.data.meshes.remove(me)
    if arches:
        cut_arches(ob, M, arches, arch_r)
    bpy.context.scene.collection.objects.unlink(ob)
    geo.ensure_collections()[coll].objects.link(ob)
    return ob


def cut_arches(ob, M, arches, r):
    """Boolean-subtract wheel-arch cylinders (axis X) from a smoothed body (manifold solver)."""
    cut = bmesh.new()
    for (y, zc) in arches:
        c = Vector((0, y, zc))
        nseg = 32
        p0 = [M @ (c + Vector((-1.5, math.cos(2 * math.pi * i / nseg) * r, math.sin(2 * math.pi * i / nseg) * r)))
              for i in range(nseg)]
        p1 = [M @ (c + Vector((1.5, math.cos(2 * math.pi * i / nseg) * r, math.sin(2 * math.pi * i / nseg) * r)))
              for i in range(nseg)]
        a = [cut.verts.new(p) for p in p0]
        b = [cut.verts.new(p) for p in p1]
        for i in range(nseg):
            cut.faces.new([a[i], a[(i + 1) % nseg], b[(i + 1) % nseg], b[i]])
        cut.faces.new(list(reversed(a)))
        cut.faces.new(b)
    bmesh.ops.recalc_face_normals(cut, faces=cut.faces[:])
    cme = bpy.data.meshes.new("arch_cut")
    cut.to_mesh(cme)
    cut.free()
    cob = bpy.data.objects.new("arch_cut", cme)
    bpy.context.scene.collection.objects.link(cob)
    md = ob.modifiers.new("arches", "BOOLEAN")
    md.operation = "DIFFERENCE"
    md.solver = "MANIFOLD"
    md.object = cob
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    ob.modifiers.remove(md)
    old = ob.data
    ob.data = me2
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(cob, do_unlink=True)
    bpy.data.meshes.remove(cme)


def wheel(tag, M, c, r, w, rim_r=None, axis=1, spokes=5, coll="fine"):
    """Tyre (lofted torus section) + dished rim + hub, axle along local X."""
    T = get(tag, coll, smooth=True)
    c = Vector(c)
    rim_r = rim_r or r * 0.62
    n = 36
    # tyre cross-section (radius, x offset) around the torus
    sec = [(rim_r, -w * 0.42), (r - 0.03, -w * 0.5), (r, -w * 0.38), (r + 0.004, 0.0), (r, w * 0.38),
           (r - 0.03, w * 0.5), (rim_r, w * 0.42), (rim_r - 0.01, 0.0)]
    rings = []
    for (rr, dx) in sec:
        rings.append([M @ (c + Vector((dx * axis, math.cos(2 * math.pi * i / n) * rr, math.sin(2 * math.pi * i / n) * rr)))
                      for i in range(n)])
    # loft the closed torus: connect sections cyclically
    vs = [[T.bm.verts.new(p) for p in rg] for rg in rings]
    ti = T.m("tyre")
    for j in range(len(vs)):
        j1 = (j + 1) % len(vs)
        for i in range(n):
            f = T.bm.faces.new([vs[j][i], vs[j][(i + 1) % n], vs[j1][(i + 1) % n], vs[j1][i]])
            f.material_index = ti
            f.smooth = True
    # rim: a shallow dish facing outward with spokes
    R = get(tag + "_rim", coll, smooth=False)
    out = Vector((axis * w * 0.36, 0, 0))
    R.cyl(M @ (c + out * 0.2), M @ (c + out), rim_r - 0.012, rim_r * 0.92, n=n, mat="rim")
    R.cyl(M @ (c + out), M @ (c + out * 1.15), rim_r * 0.3, rim_r * 0.24, n=16, mat="chrome")
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        d = Vector((0, math.cos(a), math.sin(a)))
        R.seg_box(M @ (c + out * 1.02 + d * rim_r * 0.28), M @ (c + out * 1.02 + d * rim_r * 0.86), 0.035 * r / 0.33,
                  0.02, up=tuple(M.to_3x3() @ Vector((1, 0, 0))), mat="rim")


# ----------------------------------------------------------------------------------------------
# sedan / SUV / danfo
# ----------------------------------------------------------------------------------------------
def _prof(w, zb, zm, zbelt, wg, zg, zroof, deck=None):
    """8-point half profile. deck=z for hood/boot stations (greenhouse collapsed onto the deck)."""
    if deck is not None:
        return [(0.0, zb), (w - 0.14, zb), (w, zb + 0.16), (w + 0.01, zm), (w - 0.02, min(zbelt, deck - 0.04)),
                (w - 0.12, deck), (w * 0.5, deck + 0.025), (0.0, deck + 0.035)]
    return [(0.0, zb), (w - 0.14, zb), (w, zb + 0.16), (w + 0.01, zm), (w - 0.02, zbelt),
            (wg, zg), (wg - 0.14, zroof), (0.0, zroof + 0.02)]


def sedan(tag, pos, heading, paint="paint_light", suv=False):
    """Saloon or SUV from the parametric section bodies in carbody.py."""
    import carbody
    M = place(pos, heading)
    carbody.build_car(tag, M, "suv" if suv else "sedan", paint)
    return M


def danfo(tag, pos, heading):
    """VW T3 'danfo' minibus: yellow with two black waist stripes, sliding door, roof rack."""
    M = place(pos, heading)
    W = 0.925
    S = [
        (0.00, _prof(W - 0.06, 0.4, 0.62, 0.96, W - 0.08, 1.86, 1.92)),
        (0.08, _prof(W, 0.36, 0.64, 1.0, W - 0.03, 1.74, 1.95)),
        (0.3, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (0.62, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (1.55, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (1.68, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (2.85, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (2.98, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (3.6, _prof(W, 0.34, 0.65, 1.02, W - 0.04, 1.72, 1.96)),
        (3.78, _prof(W, 0.34, 0.65, 1.02, W - 0.05, 1.72, 1.95)),
        (4.18, _prof(W, 0.34, 0.65, 1.0, W - 0.07, 1.7, 1.86)),
        (4.48, _prof(W - 0.01, 0.36, 0.64, 0.98, W - 0.1, 1.06, 1.1)),
        (4.57, _prof(W - 0.06, 0.4, 0.6, 0.86, W - 0.16, 0.92, 0.95)),
    ]
    # side glass in bands 3, 5, 7, 9 (2, 4, 6, 8 are pillars); windscreen in band 10
    glass = {(3, 4), (5, 4), (7, 4), (9, 4), (10, 5), (10, 6)}
    extra = {}
    body = cage_body(tag + "_body", M, S, glass, "danfo", arches=[(0.9, 0.35), (3.36, 0.35)], arch_r=0.43,
                     extra_mats=extra)
    # black waist stripes: thin strips 2 mm proud of each flank
    K = get(tag + "_stripes", "nolines")
    for sg in (-1, 1):
        x = sg * (W + 0.016)
        for (z0, z1) in ((0.86, 0.93), (0.98, 1.01)):
            K.poly([M @ Vector((x, 0.12, z0)), M @ Vector((x, 4.3, z0)), M @ Vector((x, 4.3, z1)), M @ Vector((x, 0.12, z1))][::(1 if sg > 0 else -1)],
                   "stripe")
    for y in (0.9, 3.36):
        for sg in (-1, 1):
            wheel(f"{tag}_w{int(y * 10)}{'L' if sg < 0 else 'R'}", M, (sg * (W - 0.16), y, 0.33), 0.33, 0.2, axis=sg,
                  spokes=0)
    Gl = get(tag + "_rearglass", "fine")
    Gl.poly([M @ Vector((0.72, -0.004, 1.2)), M @ Vector((-0.72, -0.004, 1.2)), M @ Vector((-0.72, -0.004, 1.74)),
             M @ Vector((0.72, -0.004, 1.74))], "vglass")
    D = get(tag + "_det", "fine")
    # front: two rectangular lamps, grille slats panel, bumper, spare-wheel-free face
    for sg in (-1, 1):
        D.box(M @ Vector((sg * 0.5, 4.5, 0.66)), M @ Vector((sg * 0.82, 4.58, 0.8)), mat="lamp")
        D.box(M @ Vector((sg * (W - 0.02), 3.55, 1.06)), M @ Vector((sg * (W + 0.16), 3.68, 1.22)), mat="paint_dark")
        D.box(M @ Vector((sg * 0.5, -0.04, 0.82)), M @ Vector((sg * 0.84, 0.02, 1.0)), mat="lamp")
    D.box(M @ Vector((-0.42, 4.53, 0.62)), M @ Vector((0.42, 4.6, 0.84)), mat="under")
    D.box(M @ Vector((-0.92, 4.5, 0.36)), M @ Vector((0.92, 4.66, 0.5)), mat="paint_dark")
    D.box(M @ Vector((-0.92, -0.1, 0.38)), M @ Vector((0.92, 0.06, 0.52)), mat="paint_dark")
    D.box(M @ Vector((-0.25, 4.62, 0.37)), M @ Vector((0.25, 4.68, 0.49)), mat="plate")
    # sliding-door track and handle on the kerb side, roof rack rails
    D.box(M @ Vector((W - 0.01, 1.7, 1.03)), M @ Vector((W + 0.02, 2.85, 1.05)), mat="metal_dark")
    D.box(M @ Vector((W - 0.01, 1.62, 1.09)), M @ Vector((W + 0.04, 1.72, 1.12)), mat="chrome")
    Rk = get(tag + "_rack", "nolines")
    for x in (-0.75, 0.75):
        Rk.seg_box(M @ Vector((x, 0.4, 2.12)), M @ Vector((x, 3.7, 2.12)), 0.03, mat="ink")
        for y in (0.5, 1.6, 2.7, 3.6):
            Rk.seg_box(M @ Vector((x, y, 1.95)), M @ Vector((x, y, 2.12)), 0.025, mat="ink")
    for y in (0.6, 1.2, 1.8, 2.4, 3.0, 3.6):
        Rk.seg_box(M @ Vector((-0.75, y, 2.12)), M @ Vector((0.75, y, 2.12)), 0.022, mat="ink")
    U = get(tag + "_under", "nolines")
    U.box(M @ Vector((-W + 0.1, 0.2, 0.18)), M @ Vector((W - 0.1, 4.4, 0.36)), mat="under")
    return M


# ----------------------------------------------------------------------------------------------
# keke napep (Bajaj RE)
# ----------------------------------------------------------------------------------------------
def rrect(w, h, r, n=4):
    """Rounded rectangle (u, v) around the origin, counter-clockwise from the bottom middle."""
    pts = []
    for (cu, cv, a0) in ((w - r, -h + r, -90), (w - r, h - r, 0), (-w + r, h - r, 90), (-w + r, -h + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cu + math.cos(a) * r, cv + math.sin(a) * r))
    return pts


def sweep_yz(b, M, path, section, mat, caps=True):
    """Sweep a section (u across X, v along the path normal) along a path in the YZ plane."""
    rings = []
    for i, (y, z) in enumerate(path):
        if i == 0:
            t = Vector((0, path[1][0] - y, path[1][1] - z))
        elif i == len(path) - 1:
            t = Vector((0, y - path[i - 1][0], z - path[i - 1][1]))
        else:
            t = Vector((0, path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]))
        t.normalize()
        nrm = Vector((0, -t.z, t.y))            # in-plane normal (up when moving along -y)
        if nrm.z < 0:
            nrm = -nrm
        sec = section(i) if callable(section) else section
        rings.append([M @ (Vector((u, y, z)) + nrm * v) for (u, v) in sec])
    return b.loft(rings, caps, mat, smooth=True)


def keke(tag, pos, heading, paint="keke", roof="canvas", stripe="paint_mid"):
    """Bajaj RE: L 2.64, W 1.30, H 1.71; front axle y +0.98, rear axle y -1.02 (track 1.15)."""
    M = place(pos, heading)
    M3 = M.to_3x3()
    V = lambda x, y, z: M @ Vector((x, y, z))  # noqa: E731
    B = get(tag + "_body", "lines", smooth=True)
    P = get(tag + "_panels", "lines", union=True)
    Rf = get(tag + "_roof", "lines", smooth=True)
    D = get(tag + "_det", "fine", smooth=True)
    G = get(tag + "_glass", "fine")
    K = get(tag + "_k", "nolines")
    yr, yf, wr = -1.02, 0.98, 0.225
    W = 0.65
    # --- passenger tub: floor, rear panel and two side panels whose front edge sweeps down
    #     into the floor (the open "D" doorway), each a closed prism, fused into one solid
    side = [(-1.32, 0.42), (-1.32, 1.0), (-0.48, 1.0), (-0.3, 0.985), (-0.17, 0.93), (-0.08, 0.82),
            (-0.03, 0.66), (-0.02, 0.48), (-0.02, 0.34)]
    # bottom edge back to the rear wheel, then the arch over it (centre y -1.02, r 0.3)
    a0 = math.degrees(math.asin((0.34 - wr) / 0.3))
    a1 = 180 - math.degrees(math.asin((0.42 - wr) / 0.3))
    for k in range(13):
        a = math.radians(a0 + (a1 - a0) * k / 12)
        side.append((yr + math.cos(a) * 0.3, wr + math.sin(a) * 0.3))
    for sg in (-1, 1):
        x0, x1 = sg * (W - 0.035), sg * W
        P.prism_lr([V(x0, y, z) for (y, z) in side], [V(x1, y, z) for (y, z) in side], mat=paint)
    P.box(V(-W, -1.32, 0.42), V(W, -1.285, 1.0), mat=paint)                      # rear panel
    P.box(V(-0.47, -1.32, 0.29), V(0.47, -0.02, 0.36), mat="under")              # tub floor
    # rolled top rail along the panel edges
    rail = [(-1.31, 1.0), (-0.48, 1.0), (-0.3, 0.985), (-0.17, 0.93), (-0.08, 0.82), (-0.03, 0.66), (-0.02, 0.5)]
    for sg in (-1, 1):
        D.tube([V(sg * (W - 0.017), y, z + 0.006) for (y, z) in rail], 0.02, n=8, mat=paint)
    D.tube([V(-W + 0.02, -1.305, 1.006), V(W - 0.02, -1.305, 1.006)], 0.02, n=8, mat=paint)
    # colour band along the flanks (decal strip 3 mm proud)
    for sg in (-1, 1):
        x = sg * (W + 0.003)
        pts = [V(x, -1.3, 0.62), V(x, -0.05, 0.62), V(x, -0.04, 0.7), V(x, -1.3, 0.7)]
        K.poly(pts if sg > 0 else pts[::-1], stripe)
    # --- driver's floor and the nose: lofted rounded sections, narrowing to the front
    P.box(V(-0.47, -0.05, 0.29), V(0.47, 0.62, 0.36), mat="under")
    noses = [(0.5, 0.52, 0.3, 1.0, 0.12), (0.72, 0.5, 0.31, 1.06, 0.13), (0.95, 0.44, 0.36, 1.05, 0.14),
             (1.15, 0.36, 0.44, 1.0, 0.13), (1.27, 0.28, 0.52, 0.94, 0.1), (1.315, 0.2, 0.58, 0.88, 0.07)]
    rings = []
    for (y, hw, z0, z1, r) in noses:
        rings.append([V(u, y, (z0 + z1) / 2 + v) for (u, v) in rrect(hw, (z1 - z0) / 2, r, 4)])
    B.loft(rings, True, paint, smooth=True)
    # dashboard cowl behind the windscreen
    B.box(V(-0.5, 0.55, 0.98), V(0.5, 0.86, 1.06), mat="paint_dark")
    # headlamp, indicators, front plate
    D.cyl(V(0, 1.27, 0.86), V(0, 1.33, 0.86), 0.085, 0.09, n=20, mat="chrome")
    D.cyl(V(0, 1.33, 0.86), V(0, 1.335, 0.86), 0.072, n=20, mat="lamp")
    for sg in (-1, 1):
        D.ellipsoid(V(sg * 0.3, 1.16, 0.99), 0.035, 0.03, 0.025, 10, 6, mat="lamp")
    D.box(V(-0.16, 1.27, 0.6), V(0.16, 1.31, 0.7), mat="plate")
    # front fork and mudguard over the single front wheel
    for sg in (-1, 1):
        D.cyl(V(sg * 0.07, yf, wr), V(sg * 0.06, yf - 0.12, 0.62), 0.022, n=8, mat="metal_dark")
    arc = [(yf + math.cos(math.radians(a)) * (wr + 0.05), wr + math.sin(math.radians(a)) * (wr + 0.05))
           for a in range(-20, 200, 20)]
    sweep_yz(D, M, arc, rrect(0.075, 0.006, 0.005, 1), paint)
    # --- windscreen: glass in a frame, one wiper
    ws = [(-0.47, 0.97, 1.05), (0.47, 0.97, 1.05), (0.46, 0.87, 1.68), (-0.46, 0.87, 1.68)]
    G.poly([V(*p) for p in ws], "vglass")
    for sg in (-1, 1):
        D.seg_box(V(sg * 0.49, 0.975, 1.03), V(sg * 0.48, 0.865, 1.72), 0.035, mat="paint_dark")
    D.seg_box(V(-0.49, 0.98, 1.05), V(0.49, 0.98, 1.05), 0.035, mat="paint_dark")
    K.seg_box(V(-0.18, 0.985, 1.08), V(0.1, 0.96, 1.42), 0.008, mat="ink")
    for sg in (-1, 1):                                                           # mirrors
        K.seg_box(V(sg * 0.49, 0.95, 1.3), V(sg * 0.62, 0.98, 1.38), 0.012, mat="metal_dark")
        D.ellipsoid(V(sg * 0.65, 0.98, 1.42), 0.055, 0.02, 0.075, 12, 6, mat="paint_dark")
    # --- roof canopy: a thin rounded shell swept over the cab and down the back
    path = [(0.98, 1.66), (0.9, 1.725), (0.6, 1.75), (-0.6, 1.76), (-0.95, 1.745), (-1.16, 1.69), (-1.28, 1.56),
            (-1.33, 1.38), (-1.34, 1.16), (-1.335, 1.0)]

    def roof_sec(i):
        w = 0.66 if 1 <= i <= 6 else (0.6 if i == 0 else 0.655)
        return rrect(w, 0.025, 0.02, 3)
    sweep_yz(Rf, M, path, roof_sec, roof)
    # side curtains over the rear quarters (closed canvas with a small window)
    for sg in (-1, 1):
        x0, x1 = sg * (W - 0.012), sg * (W + 0.005)
        q = [(-1.31, 1.0), (-0.78, 1.0), (-0.78, 1.73), (-1.16, 1.69), (-1.28, 1.56), (-1.31, 1.38)]
        Rf.prism_lr([V(x0, y, z) for (y, z) in q], [V(x1, y, z) for (y, z) in q], mat=roof)
        win = [(-1.18, 1.22), (-0.86, 1.22), (-0.86, 1.52), (-1.12, 1.52)]
        pw = [V(sg * (W + 0.009), y, z) for (y, z) in win]
        G.poly(pw if sg > 0 else pw[::-1], "vglass")
    rw = [V(0.3, -1.352, 1.2), V(-0.3, -1.352, 1.2), V(-0.28, -1.345, 1.42), V(0.28, -1.345, 1.42)]
    G.poly(rw, "vglass")
    # B-pillars and grab rails
    for sg in (-1, 1):
        D.cyl(V(sg * (W - 0.02), -0.4, 1.0), V(sg * (W - 0.02), -0.4, 1.74), 0.02, n=8, mat="metal_dark")
        D.cyl(V(sg * 0.5, 0.86, 1.06), V(sg * 0.5, 0.86, 1.72), 0.016, n=8, mat="metal_dark")
        K.seg_box(V(sg * (W - 0.02), -0.4, 1.4), V(sg * (W - 0.02), -0.78, 1.4), 0.02, mat="metal_dark")
    # --- seats: driver's saddle on a pedestal, rear bench with backrest for three
    D.box(V(-0.2, 0.14, 0.36), V(0.2, 0.46, 0.68), mat="paint_dark")              # seat box
    D.box(V(-0.24, 0.12, 0.68), V(0.24, 0.5, 0.78), mat="seat")
    D.box(V(-0.24, 0.06, 0.78), V(0.24, 0.13, 1.0), mat="seat")                   # low backrest
    B.box(V(-0.6, -1.0, 0.36), V(0.6, -0.5, 0.64), mat="paint_dark")
    D.box(V(-0.6, -1.02, 0.64), V(0.6, -0.46, 0.76), mat="seat")
    D.box(V(-0.6, -1.26, 0.76), V(0.6, -1.12, 1.3), mat="seat")
    # handlebar on a steering column
    D.cyl(V(0, 0.92, 0.6), V(0, 0.8, 1.08), 0.03, n=8, mat="metal_dark")
    D.tube([V(-0.36, 0.7, 1.13), V(-0.15, 0.79, 1.1), V(0.15, 0.79, 1.1), V(0.36, 0.7, 1.13)], 0.017, n=8,
           mat="metal_dark")
    for sg in (-1, 1):
        D.cyl(V(sg * 0.36, 0.7, 1.13), V(sg * 0.42, 0.68, 1.14), 0.022, n=8, mat="seat")
    # tail lamps, plate, spare wheel on the back
    for sg in (-1, 1):
        D.box(V(sg * 0.4, -1.345, 0.74), V(sg * 0.57, -1.315, 0.86), mat="lamp")
    D.box(V(-0.18, -1.35, 0.44), V(0.18, -1.315, 0.56), mat="plate")
    Ms = M @ Matrix.Translation((0, -1.4, 0.78)) @ Matrix.Rotation(math.pi / 2, 4, "Z")
    wheel(tag + "_spare", Ms, (0, 0, 0), 0.2, 0.1, axis=-1, spokes=0)
    D.box(V(-0.04, -1.36, 0.74), V(0.04, -1.31, 0.82), mat="metal_dark")
    # wheels: front single, rear pair under the tub
    wheel(tag + "_wf", M, (0, yf, wr), wr, 0.11, axis=1, spokes=0)
    for sg in (-1, 1):
        wheel(f"{tag}_wr{'L' if sg < 0 else 'R'}", M, (sg * 0.575, yr, wr), wr, 0.12, axis=sg, spokes=0)
    return M


# ----------------------------------------------------------------------------------------------
# okada (Bajaj Boxer-type motorcycle)
# ----------------------------------------------------------------------------------------------
def spoked_wheel(tag, M, y, r, tw, rim_r):
    """Motorcycle wheel: thin tyre, rim, drum hub and 36 crossed wire spokes (ink)."""
    T = get(tag, "fine", smooth=True)
    n = 40
    c = Vector((0, y, r))
    sec = [(rim_r + 0.008, -tw * 0.42), (r - 0.025, -tw * 0.5), (r, -tw * 0.3), (r + 0.003, 0.0), (r, tw * 0.3),
           (r - 0.025, tw * 0.5), (rim_r + 0.008, tw * 0.42), (rim_r, 0.0)]
    vs = []
    for (rr, dx) in sec:
        vs.append([T.bm.verts.new(M @ (c + Vector((dx, math.cos(2 * math.pi * i / n) * rr, math.sin(2 * math.pi * i / n) * rr))))
                   for i in range(n)])
    ti = T.m("tyre")
    for j in range(len(vs)):
        j1 = (j + 1) % len(vs)
        for i in range(n):
            f = T.bm.faces.new([vs[j][i], vs[j][(i + 1) % n], vs[j1][(i + 1) % n], vs[j1][i]])
            f.material_index = ti
            f.smooth = True
    Rm = get(tag + "_rim", "fine", smooth=True)
    Rm.cyl(M @ (c + Vector((-0.012, 0, 0))), M @ (c + Vector((0.012, 0, 0))), rim_r + 0.006, n=n, mat="chrome")
    Rm.cyl(M @ (c + Vector((-0.055, 0, 0))), M @ (c + Vector((0.055, 0, 0))), 0.065, n=20, mat="metal")
    K = get(tag + "_spokes", "nolines")
    for k in range(36):
        a = 2 * math.pi * k / 36
        sx = 0.045 if k % 2 else -0.045
        h = c + Vector((sx, math.cos(a) * 0.05, math.sin(a) * 0.05))
        e = c + Vector((0, math.cos(a + 0.35 * (1 if k % 4 < 2 else -1)) * rim_r, math.sin(a + 0.35 * (1 if k % 4 < 2 else -1)) * rim_r))
        K.seg_box(M @ h, M @ e, 0.0035, mat="metal_dark")


def okada(tag, pos, heading):
    """Bajaj Boxer 150: wheelbase 1.29, 17-inch wheels (r 0.29), seat 0.80, bars 0.75 wide."""
    M = place(pos, heading)
    V = lambda x, y, z: M @ Vector((x, y, z))  # noqa: E731
    S = get(tag + "_solid", "lines", smooth=True)
    F = get(tag + "_frame", "fine", smooth=True)
    yr, yf, r = 0.0, 1.29, 0.29
    spoked_wheel(tag + "_wr", M, yr, r, 0.08, 0.215)
    spoked_wheel(tag + "_wf", M, yf, r, 0.07, 0.215)
    # front fork (26 degree rake) with gaiters, top yoke, headlamp with a small cowl, speedo
    top = (yf - (0.93 - r) * math.tan(math.radians(26)), 0.93)
    for sg in (-1, 1):
        F.cyl(V(sg * 0.075, yf, r), V(sg * 0.075, yf + (top[0] - yf) * 0.45, r + (top[1] - r) * 0.45), 0.027, n=10,
              mat="metal")
        F.cyl(V(sg * 0.075, yf + (top[0] - yf) * 0.45, r + (top[1] - r) * 0.45), V(sg * 0.075, *top), 0.019, n=10,
              mat="chrome")
    S.box(V(-0.11, top[0] - 0.05, top[1] - 0.02), V(0.11, top[0] + 0.05, top[1] + 0.02), mat="metal_dark")
    S.cyl(V(0, top[0] + 0.09, top[1] - 0.06), V(0, top[0] + 0.15, top[1] - 0.06), 0.09, 0.095, n=24, mat="paint_dark")
    S.cyl(V(0, top[0] + 0.15, top[1] - 0.06), V(0, top[0] + 0.155, top[1] - 0.06), 0.08, n=24, mat="lamp")
    S.cyl(V(0, top[0] - 0.02, top[1] + 0.03), V(0, top[0] - 0.04, top[1] + 0.09), 0.05, n=16, mat="paint_dark")
    # handlebar (swept back), grips, levers, mirrors on stalks
    hb = [V(-0.37, top[0] - 0.1, 1.07), V(-0.2, top[0] - 0.02, 1.04), V(0.2, top[0] - 0.02, 1.04), V(0.37, top[0] - 0.1, 1.07)]
    F.tube(hb, 0.012, n=8, mat="chrome")
    for sg in (-1, 1):
        F.cyl(V(sg * 0.29, top[0] - 0.07, 1.06), V(sg * 0.39, top[0] - 0.11, 1.075), 0.017, n=10, mat="seat")
        F.cyl(V(sg * 0.2, top[0] - 0.03, 1.045), V(sg * 0.25, top[0] - 0.0, 1.27), 0.006, n=6, mat="metal_dark")
        F.ellipsoid(V(sg * 0.26, top[0] + 0.0, 1.31), 0.05, 0.012, 0.04, 12, 6, mat="paint_dark")
    # front mudguard hugging the wheel
    arc = [(yf + math.cos(math.radians(a)) * (r + 0.04), r + math.sin(math.radians(a)) * (r + 0.04))
           for a in range(15, 165, 15)]
    sweep_yz(S, M, arc, rrect(0.06, 0.005, 0.004, 1), "paint_dark")
    # fuel tank: a teardrop loft with knee recesses
    tank = [(0.95, 0.07, 0.05, 0.865), (0.9, 0.125, 0.085, 0.87), (0.8, 0.15, 0.1, 0.86), (0.68, 0.145, 0.095, 0.845),
            (0.58, 0.115, 0.075, 0.82), (0.52, 0.07, 0.045, 0.8)]
    rings = []
    for (y, w, h, zc) in tank:
        rings.append([V(math.cos(2 * math.pi * i / 20) * w * (0.86 if abs(math.cos(2 * math.pi * i / 20)) > 0.8 and
                                                                 math.sin(2 * math.pi * i / 20) < 0 else 1.0),
                        y, zc + math.sin(2 * math.pi * i / 20) * h) for i in range(20)])
    S.loft(rings, True, "paint_mid", smooth=True)
    # seat: long flat padded loft
    seat = [(0.56, 0.08, 0.03, 0.79), (0.5, 0.12, 0.045, 0.795), (0.25, 0.13, 0.05, 0.8), (0.0, 0.125, 0.05, 0.8),
            (-0.12, 0.11, 0.045, 0.795), (-0.18, 0.07, 0.03, 0.785)]
    rings = [[V(math.cos(2 * math.pi * i / 18) * w, y, zc + math.sin(2 * math.pi * i / 18) * h) for i in range(18)]
             for (y, w, h, zc) in seat]
    S.loft(rings, True, "seat", smooth=True)
    # side covers under the seat, rear fender and tail lamp, carrier rack
    S.box(V(-0.12, 0.18, 0.56), V(0.12, 0.5, 0.75), mat="paint_mid")
    arc = [(yr + math.cos(math.radians(a)) * (r + 0.05), r + math.sin(math.radians(a)) * (r + 0.05))
           for a in range(60, 185, 15)]
    sweep_yz(S, M, arc, rrect(0.065, 0.005, 0.004, 1), "paint_dark")
    S.box(V(-0.06, -0.3, 0.68), V(0.06, -0.24, 0.76), mat="lamp")
    K = get(tag + "_k", "nolines")
    for sg in (-1, 1):
        K.seg_box(V(sg * 0.12, 0.05, 0.84), V(sg * 0.12, -0.32, 0.85), 0.014, mat="metal_dark")
        K.seg_box(V(sg * 0.12, -0.32, 0.85), V(sg * 0.12, -0.28, 0.72), 0.014, mat="metal_dark")
    for y in (-0.1, -0.2, -0.32):
        K.seg_box(V(-0.12, y, 0.85), V(0.12, y, 0.85), 0.012, mat="metal_dark")
    # engine: crankcase, finned cylinder inclined forward, carburettor
    S.box(V(-0.13, 0.42, 0.22), V(0.13, 0.78, 0.47), mat="metal")
    cyl_a, cyl_b = Vector((0, 0.74, 0.45)), Vector((0, 0.88, 0.66))
    S.cyl(M @ cyl_a, M @ cyl_b, 0.065, n=16, mat="metal")
    for k in range(6):
        p = cyl_a.lerp(cyl_b, 0.15 + 0.13 * k)
        F.cyl(M @ (p - (cyl_b - cyl_a).normalized() * 0.006), M @ (p + (cyl_b - cyl_a).normalized() * 0.006), 0.1, n=16,
              mat="metal")
    # frame: down tube and backbone, swingarm, rear shocks, foot pegs, kickstand
    F.tube([V(0, top[0] - 0.02, top[1] - 0.05), V(0, 0.92, 0.72), V(0, 0.84, 0.48)], 0.024, n=10, mat="paint_dark")
    F.tube([V(0, top[0] - 0.04, top[1] - 0.02), V(0, 0.7, 0.8), V(0, 0.4, 0.72), V(0, 0.05, 0.74)], 0.022, n=10,
           mat="paint_dark")
    for sg in (-1, 1):
        F.cyl(V(sg * 0.1, 0.44, 0.34), V(sg * 0.1, yr, r), 0.02, n=8, mat="paint_dark")
        F.cyl(V(sg * 0.11, yr + 0.06, r + 0.04), V(sg * 0.11, 0.03, 0.74), 0.022, n=10, mat="chrome")
        F.cyl(V(sg * 0.06, 0.46, 0.33), V(sg * 0.2, 0.46, 0.33), 0.012, n=6, mat="metal_dark")
    S.box(V(-0.145, 0.02, 0.27), V(-0.12, 0.5, 0.36), mat="paint_dark")              # chain guard
    F.cyl(V(-0.1, 0.4, 0.3), V(-0.14, 0.45, 0.02), 0.01, n=6, mat="metal_dark")      # kickstand
    # exhaust down from the cylinder head, under the engine, back to the muffler (right side)
    F.tube([V(0.03, 0.9, 0.6), V(0.08, 0.95, 0.45), V(0.12, 0.85, 0.22), V(0.15, 0.4, 0.22), V(0.17, 0.15, 0.3)], 0.022,
           n=10, mat="chrome")
    F.cyl(V(0.17, 0.2, 0.3), V(0.18, -0.25, 0.37), 0.045, 0.05, n=16, mat="chrome")
    return M


def build_all():
    """Place the street's vehicles; returns extra (person, pos, heading) placements for riders."""
    people = []
    sedan("car0", (2.45, 30.5, 0.0), 0.0, paint="paint_light")
    sedan("car1", (-2.5, 61.0, 0.0), math.pi, paint="paint_mid", suv=True)
    sedan("car2", (2.5, 97.0, 0.0), 0.0, paint="paint_dark")
    danfo("danfo0", (-1.6, 50.0, 0.0), math.pi)
    keke("keke0", (2.62, 40.6, 0.0), 0.06)                 # parked at the kerb: shot (b)
    keke("keke1", (-1.5, 88.0, 0.0), math.pi, paint="paint_mid")
    people.append(("driver_m", (-1.5, 88.0 - 0.32, 0.0), 0.0))
    okM = okada("okada0", (0.9, 56.0, 0.0), math.pi)
    # the rider faces the bike's +Y: a person faces -Y at heading 0, so heading = bike + pi
    people.append(("rider_m", tuple(okM @ Vector((0, 0.3, -0.07))), math.pi + math.pi))
    return people

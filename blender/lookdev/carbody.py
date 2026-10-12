"""Parametric car bodies: a dense loft of designed cross-sections plus projected decals.

A body is described the way a car designer sketches one: a side view (sill, belt line, roof or
deck height along the length), a plan view (half width along the length) and a cross-section
recipe (rounded sill, full side, shoulder, tumblehome up to the roof). section(y) evaluates the
recipe at any station, so the body is a smooth loft with one station every 6 cm, smooth shaded:
Freestyle sees its silhouettes, not facets.

Glass, lamps and panel seams are decals: polygons given in side view (y, z) or plan view
(x, y), projected onto the body surface and lifted 4 mm off it. Glass and lamps sit in the
`fine` collection so their outlines are inked once; seams are thin dark ribbons in `nolines`.
Wheel arches are cut with the manifold boolean.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import geo


def _interp(table, y):
    """Piecewise smooth interpolation of [(y, v)...] (smoothstep between keys)."""
    if y <= table[0][0]:
        return table[0][1]
    for (y0, v0), (y1, v1) in zip(table, table[1:]):
        if y <= y1:
            t = (y - y0) / max(1e-9, y1 - y0)
            t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return table[-1][1]


class Body:
    """keys: dict of tables over y: zb (sill), w (half width), belt (shoulder z), top (roof or deck
    z at the centre line), wt (half width of the roof / deck top), gh (1 = greenhouse, 0 = deck)."""

    def __init__(s, L, keys, n_side=7, n_top=6):
        s.L, s.k = L, keys
        s.n_side, s.n_top = n_side, n_top

    def p(s, name, y):
        return _interp(s.k[name], y)

    def section(s, y):
        """Half profile (x, z) from bottom centre to top centre."""
        zb, w, belt = s.p("zb", y), s.p("w", y), s.p("belt", y)
        top, wt, gh = s.p("top", y), s.p("wt", y), s.p("gh", y)
        rb = min(0.14, (belt - zb) * 0.3)
        pts = [(0.0, zb), (w * 0.55, zb), (w - rb, zb + 0.01)]
        # rounded sill
        for k in range(1, 4):
            a = math.radians(-90 + 90 * k / 3)
            pts.append((w - rb + math.cos(a) * rb, zb + rb + math.sin(a) * rb))
        zmax = zb + (belt - zb) * 0.55
        pts += [(w + 0.012, zmax), (w + 0.004, belt - (belt - zb) * 0.15), (w - 0.012, belt - 0.01)]
        # above the shoulder: greenhouse (tumblehome to the roof) blended with a flat deck
        g_side = [(w - 0.045, belt + 0.03), (wt + 0.05, top - 0.09), (wt - 0.02, top - 0.035),
                  (wt * 0.55, top - 0.008), (0.0, top)]
        d_side = [(w - 0.05, belt + 0.012), (w - 0.13, belt + 0.03), (w * 0.62, belt + 0.045),
                  (w * 0.3, belt + 0.052), (0.0, belt + 0.055)]
        for (gx, gz), (dx, dz) in zip(g_side, d_side):
            pts.append((dx + (gx - dx) * gh, dz + (gz - dz) * gh))
        return pts

    def side_x(s, y, z):
        """x on the body side (positive half) at height z for station y."""
        sec = s.section(y)
        best = None
        for (x0, z0), (x1, z1) in zip(sec, sec[1:]):
            if (z0 - z) * (z1 - z) <= 0 and abs(z1 - z0) > 1e-6:
                t = (z - z0) / (z1 - z0)
                x = x0 + (x1 - x0) * t
                if best is None or x > best:
                    best = x
        return best if best is not None else sec[len(sec) // 2][0]

    def top_z(s, y, x):
        """z on the upper surface at lateral offset |x| for station y."""
        sec = s.section(y)
        x = abs(x)
        best = None
        for (x0, z0), (x1, z1) in zip(sec, sec[1:]):
            if (x0 - x) * (x1 - x) <= 0 and abs(x1 - x0) > 1e-6:
                t = (x - x0) / (x1 - x0)
                z = z0 + (z1 - z0) * t
                if best is None or z > best:
                    best = z
        return best if best is not None else sec[-1][1]

    def mesh(s, name, M, mat, step=0.04, coll="lines", arches=(), arch_r=0.4):
        ys = [0.0]
        while ys[-1] < s.L - 1e-6:
            ys.append(min(s.L, ys[-1] + step))
        bm = bmesh.new()
        rings = []
        for y in ys:
            half = s.section(y)
            full = half + [(-x, z) for (x, z) in reversed(half[1:-1])]
            rings.append([bm.verts.new(M @ Vector((x, y, z))) for (x, z) in full])
        m = len(rings[0])
        for j in range(len(rings) - 1):
            for i in range(m):
                f = bm.faces.new([rings[j][i], rings[j][(i + 1) % m], rings[j + 1][(i + 1) % m], rings[j + 1][i]])
                f.smooth = True
        for r, rev in ((rings[0], True), (rings[-1], False)):
            f = bm.faces.new(list(reversed(r)) if rev else r)
            f.smooth = True
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(bpy.data.materials[mat])
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if arches:
            import vehicles
            vehicles.cut_arches(ob, M, arches, arch_r)
        bpy.context.scene.collection.objects.unlink(ob)
        geo.ensure_collections()[geo.coll_for(coll)].objects.link(ob)
        if geo.PARENT is not None:
            ob.parent = geo.PARENT
        return ob

    # ------------------------------------------------------------------ decals
    def _fan(s, b, outline, project, mat, rings=5):
        """Mesh a polygon (given in 2D design coords) as a fan of concentric rings around its
        centroid, every vertex projected onto the body: the decal hugs the curved surface
        instead of cutting chords through it."""
        cx = sum(p[0] for p in outline) / len(outline)
        cy = sum(p[1] for p in outline) / len(outline)
        n = len(outline)
        grid = [[b.bm.verts.new(project(cx, cy))]]
        for k in range(1, rings + 1):
            t = k / rings
            grid.append([b.bm.verts.new(project(cx + (u - cx) * t, cy + (v - cy) * t)) for (u, v) in outline])
        mi = b.m(mat)
        faces = []
        for i in range(n):
            faces.append([grid[0][0], grid[1][i], grid[1][(i + 1) % n]])
        for k in range(1, rings):
            for i in range(n):
                faces.append([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % n], grid[k][(i + 1) % n]])
        for f in faces:
            try:
                fc = b.bm.faces.new(f)
                fc.material_index = mi
                fc.smooth = True
            except ValueError:
                pass

    @staticmethod
    def _densify(poly, subdiv):
        pts = []
        for (a0, b0), (a1, b1) in zip(poly, poly[1:] + poly[:1]):
            for k in range(subdiv):
                t = k / subdiv
                pts.append((a0 + (a1 - a0) * t, b0 + (b1 - b0) * t))
        return pts

    def _inside(s, y, x, z):
        half = s.section(y)
        ring = half + [(-a, c) for (a, c) in reversed(half[1:-1])]
        ins = False
        for (x0, z0), (x1, z1) in zip(ring, ring[1:] + ring[:1]):
            if (z0 > z) != (z1 > z):
                xi = x0 + (z - z0) * (x1 - x0) / (z1 - z0)
                if xi > x:
                    ins = not ins
        return ins

    def end_y(s, x, z, front=True):
        """y of the body surface at (x, z) seen from the front (or rear), by bisection."""
        if front:
            lo, hi = s.L - 0.7, s.L          # inside at lo, outside at hi
        else:
            lo, hi = 0.7, 0.0
        if not s._inside(lo, x, z):
            return None
        for _ in range(30):
            mid = (lo + hi) / 2
            if s._inside(mid, x, z):
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def end_decal(s, b, M, poly_xz, mat, front=True, lift=0.006, subdiv=8):
        pts = s._densify(poly_xz, subdiv)
        if not front:
            pts = pts[::-1]
        sg = 1 if front else -1

        def proj(x, z):
            y = s.end_y(x, z, front)
            if y is None:
                y = s.L if front else 0.0
            return M @ Vector((x, y + sg * lift, z))
        s._fan(b, pts, proj, mat)

    def side_decal(s, b, M, poly_yz, mat, lift=0.006, both=True, subdiv=8):
        """Polygon in side view (y, z), projected on the flank(s)."""
        pts = s._densify(poly_yz, subdiv)
        for sg in ((1, -1) if both else (1,)):
            outline = pts if sg > 0 else pts[::-1]
            s._fan(b, outline, lambda y, z, sg=sg: M @ Vector((sg * (s.side_x(y, z) + lift), y, z)), mat)

    def top_decal(s, b, M, poly_xy, mat, lift=0.006, subdiv=8):
        pts = s._densify(poly_xy, subdiv)
        s._fan(b, pts, lambda x, y: M @ Vector((x, y, s.top_z(y, x) + lift)), mat)

    def side_seam(s, K, M, pts_yz, width=0.006, lift=0.003):
        for sg in (1, -1):
            for (y0, z0), (y1, z1) in zip(pts_yz, pts_yz[1:]):
                a = M @ Vector((sg * (s.side_x(y0, z0) + lift), y0, z0))
                c = M @ Vector((sg * (s.side_x(y1, z1) + lift), y1, z1))
                K.seg_box(a, c, width, 0.002, up=tuple(M.to_3x3() @ Vector((sg, 0, 0))), mat="under")


# ----------------------------------------------------------------------------------------------
# concrete bodies
# ----------------------------------------------------------------------------------------------
def camry():
    """Toyota Camry XV40-like saloon: L 4.80, W 1.82, H 1.47, wheelbase 2.78 (axles 1.07 / 3.85)."""
    L = 4.8
    k = {
        "zb": [(0.0, 0.42), (0.18, 0.3), (0.55, 0.22), (4.3, 0.22), (4.62, 0.3), (4.8, 0.42)],
        "w": [(0.0, 0.8), (0.1, 0.88), (0.35, 0.905), (4.4, 0.905), (4.7, 0.88), (4.8, 0.8)],
        "belt": [(0.0, 0.7), (0.05, 0.92), (0.16, 1.0), (0.6, 1.02), (1.1, 1.02), (3.6, 0.99), (4.45, 0.88),
                 (4.72, 0.82), (4.8, 0.7)],
        "top": [(1.0, 1.05), (1.8, 1.42), (2.25, 1.47), (2.75, 1.47), (3.1, 1.43), (3.66, 1.04)],
        "wt": [(1.0, 0.82), (1.8, 0.66), (3.1, 0.66), (3.66, 0.82)],
        "gh": [(0.96, 0.0), (1.06, 1.0), (3.6, 1.0), (3.7, 0.0)],
    }
    return Body(L, k), (1.07, 3.85), 0.325


def highlander():
    """Toyota Highlander XU40-like SUV: L 4.79, W 1.91, H 1.76, axles 1.03 / 3.82."""
    L = 4.79
    k = {
        "zb": [(0.0, 0.5), (0.2, 0.38), (0.5, 0.33), (4.3, 0.33), (4.6, 0.4), (4.79, 0.52)],
        "w": [(0.0, 0.8), (0.12, 0.9), (0.45, 0.95), (4.2, 0.95), (4.6, 0.9), (4.79, 0.78)],
        "belt": [(0.0, 0.8), (0.08, 1.0), (0.3, 1.06), (3.5, 1.05), (4.35, 0.98), (4.66, 0.88), (4.79, 0.76)],
        "top": [(0.0, 1.08), (0.12, 1.58), (0.5, 1.72), (2.8, 1.75), (3.15, 1.62), (3.62, 1.1)],
        "wt": [(0.1, 0.8), (0.5, 0.74), (3.15, 0.74), (3.62, 0.86)],
        "gh": [(0.02, 0.0), (0.1, 1.0), (3.55, 1.0), (3.66, 0.0)],
    }
    return Body(L, k), (1.03, 3.82), 0.37


def build_car(tag, M, kind="sedan", paint="paint_light"):
    from vehicles import wheel
    body, axles, wr = camry() if kind == "sedan" else highlander()
    body.mesh(tag + "_body", M, paint, arches=[(axles[0], wr * 0.95), (axles[1], wr * 0.95)], arch_r=wr + 0.075)
    G = geo.get(tag + "_glass", "fine")
    D = geo.get(tag + "_det", "fine", smooth=True)
    K = geo.get(tag + "_seams", "nolines")
    L = body.L
    if kind == "sedan":
        belt = 1.02
        # daylight openings: rear door + quarter glass, front door glass (side view y, z)
        G_rear = [(1.86, belt + 0.03), (2.6, belt + 0.03), (2.6, 1.38), (2.2, 1.40), (1.98, 1.36)]
        G_front = [(2.72, belt + 0.03), (3.52, belt + 0.0), (3.06, 1.36), (2.72, 1.39)]
        for poly in (G_rear, G_front):
            body.side_decal(G, M, poly, "vglass")
        # windscreen and rear window (plan view x, y)
        body.top_decal(G, M, [(-0.7, 3.6), (0.7, 3.6), (0.6, 3.1), (-0.6, 3.1)], "vglass")
        body.top_decal(G, M, [(-0.62, 1.78), (0.62, 1.78), (0.72, 1.12), (-0.72, 1.12)], "vglass")
        doors = [[(1.83, 0.3), (1.83, belt + 0.03)], [(2.66, 0.28), (2.66, 1.39)], [(3.56, 0.3), (3.56, belt)]]
        shut = [(0.25, 1.0), (0.98, 1.03)]
    else:
        belt = 1.07
        G_rear = [(0.36, belt + 0.03), (0.8, belt + 0.03), (0.8, 1.62), (0.42, 1.6)]
        G_mid = [(0.9, belt + 0.03), (1.8, belt + 0.03), (1.8, 1.66), (0.9, 1.66)]
        G_front = [(1.95, belt + 0.03), (3.45, belt + 0.0), (3.05, 1.62), (1.95, 1.66)]
        for poly in (G_rear, G_mid, G_front):
            body.side_decal(G, M, poly, "vglass")
        body.top_decal(G, M, [(-0.72, 3.56), (0.72, 3.56), (0.66, 3.18), (-0.66, 3.18)], "vglass")
        doors = [[(1.86, 0.4), (1.86, 1.67)], [(0.86, 0.45), (0.86, 1.67)], [(3.5, 0.4), (3.5, belt)]]
        shut = None
        # tailgate glass on the near-vertical back: a plan-view decal does not fit, use a solid pane
        G.poly([M @ Vector((-0.66, 0.06, 1.2)), M @ Vector((0.66, 0.06, 1.2)), M @ Vector((0.6, 0.13, 1.58)),
                M @ Vector((-0.6, 0.13, 1.58))], "vglass")
        Rk = geo.get(tag + "_rails", "fine", smooth=True)
        for sg in (-1, 1):
            Rk.tube([M @ Vector((sg * 0.62, 0.6, 1.73)), M @ Vector((sg * 0.62, 0.7, 1.78)),
                     M @ Vector((sg * 0.62, 2.7, 1.79)), M @ Vector((sg * 0.62, 2.85, 1.75))], 0.018, n=8,
                    mat="metal_dark")
    for d in doors:
        body.side_seam(K, M, d)
    # door handles, mirrors
    for sg in (-1, 1):
        for yh in ((2.3, 3.25) if kind == "sedan" else (1.4, 2.5)):
            x = body.side_x(yh, belt - 0.08) + 0.012
            D.box((sg * (x - 0.01), yh, belt - 0.1), (sg * (x + 0.015), yh + 0.17, belt - 0.065), M,
                  mat="chrome")
        ym = 3.4 if kind == "sedan" else 3.3
        x = body.side_x(ym, belt + 0.05)
        mp = [Vector((sg * (x - 0.02), ym, belt + 0.02)), Vector((sg * (x + 0.17), ym + 0.06, belt + 0.05))]
        D.ellipsoid(M @ ((mp[0] + mp[1]) / 2 + Vector((0, 0, 0.06))), 0.1, 0.06, 0.065, 12, 6, mat="paint_dark")
    # lamps, grille, intake and plates as decals on the nose and tail
    zf = body.p("belt", L - 0.1)
    zr = body.p("belt", 0.1)
    for sg in (-1, 1):
        lamp = [(sg * 0.42, zf - 0.17), (sg * 0.78, zf - 0.12), (sg * 0.8, zf - 0.04), (sg * 0.46, zf - 0.07)]
        body.end_decal(D, M, lamp if sg > 0 else lamp[::-1], "lamp", front=True)
        tail = [(sg * 0.5, zr - 0.22), (sg * 0.82, zr - 0.2), (sg * 0.84, zr - 0.06), (sg * 0.52, zr - 0.05)]
        body.end_decal(D, M, tail if sg > 0 else tail[::-1], "lamp", front=False)
    body.end_decal(D, M, [(-0.36, zf - 0.2), (0.36, zf - 0.2), (0.4, zf - 0.07), (-0.4, zf - 0.07)], "under")
    body.end_decal(D, M, [(-0.55, 0.36), (0.55, 0.36), (0.5, 0.5), (-0.5, 0.5)], "under")
    body.end_decal(D, M, [(-0.25, 0.52), (0.25, 0.52), (0.25, 0.63), (-0.25, 0.63)], "plate")
    body.end_decal(D, M, [(-0.25, zr - 0.36), (0.25, zr - 0.36), (0.25, zr - 0.24), (-0.25, zr - 0.24)], "plate",
                   front=False)
    # bumper split lines
    for (yy, zz) in ((L - 0.02, 0.62), (0.02, 0.62)):
        pass
    hw = body.p("w", axles[0]) - 0.11
    for y in axles:
        for sg in (-1, 1):
            wheel(f"{tag}_w{int(y * 10)}{'L' if sg < 0 else 'R'}", M, (sg * hw, y, wr), wr, 0.215, axis=sg, spokes=5)

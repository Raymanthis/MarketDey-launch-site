"""★0 sketch spike: build a ~140 m Delta State street block, procedurally, in bpy/bmesh.

    blender -b --factory-startup -P blender/spike/build_block.py

Writes blender/spike/out/block.blend. Built in Blender Z-up; the street runs along +Y
(Three.js -Z), road centreline x = 0, from y = -10 to y = 132.

Every object carries custom props:
    line_class  structure | detail | fine
    feature     one of common.FEATURES
    bake_mode   edges | smooth | centerline | foliage | curve   (how bake_lines.py reads it)
    fill        1 if it goes into fills.glb (white occluders)
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

FL = 3.2          # storey height
BASE = 0.15       # walkway / building base level
R = random.Random(11)

BOXF = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
BUILDERS = {}


# ======================================================================================
# mesh builder
# ======================================================================================

class MB:
    def __init__(s, name, cls, feat, mode="edges", fill=False, smooth=False, props=None, coll=None):
        s.name, s.cls, s.feat, s.mode, s.fill, s.smooth = name, cls, feat, mode, fill, smooth
        s.coll = coll or cls
        s.props = props or {}
        s.bm = bmesh.new()

    def verts(s, pts):
        return [s.bm.verts.new(tuple(p)) for p in pts]

    def faces(s, vs, idxs, mat=0):
        for f in idxs:
            try:
                fc = s.bm.faces.new([vs[i] for i in f])
                fc.material_index = mat
            except ValueError:
                pass

    def box(s, lo, hi, M=None, mat=0):
        x0, x1 = sorted((lo[0], hi[0]))
        y0, y1 = sorted((lo[1], hi[1]))
        z0, z1 = sorted((lo[2], hi[2]))
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        if M is not None:
            c = [M @ Vector(p) for p in c]
        s.faces(s.verts(c), BOXF, mat)

    def obox(s, center, ax, ay, az, M=None, mat=0):
        """Oriented box: centre + three half-axis vectors."""
        c, ax, ay, az = Vector(center), Vector(ax), Vector(ay), Vector(az)
        pts = []
        for sz in (-1, 1):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pts.append(c + ax * sx + ay * sy + az * sz)
        if M is not None:
            pts = [M @ p for p in pts]
        s.faces(s.verts(pts), BOXF, mat)

    def poly(s, pts, mat=0):
        s.faces(s.verts(pts), [list(range(len(pts)))], mat)

    def fin(s, p0, p1, off, mat=0):
        p0, p1, off = Vector(p0), Vector(p1), Vector(off)
        s.poly([p0, p1, p1 + off, p0 + off], mat)

    def prism(s, pts, vec, mat=0, caps=True):
        a = [Vector(p) for p in pts]
        b = [p + Vector(vec) for p in a]
        n = len(a)
        idx = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        if caps:
            idx += [list(range(n))[::-1], list(range(n, 2 * n))]
        s.faces(s.verts(a + b), idx, mat)

    def prism_lr(s, left, right, mat=0):
        n = len(left)
        idx = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        idx += [list(range(n))[::-1], list(range(n, 2 * n))]
        s.faces(s.verts(list(left) + list(right)), idx, mat)

    def loft(s, rings, caps=True, mat=0, closed=True):
        m, n = len(rings), len(rings[0])
        vs = s.verts([p for r in rings for p in r])
        idx = []
        span = n if closed else n - 1
        for j in range(m - 1):
            for i in range(span):
                idx.append([j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i])
        if caps and closed:
            idx.append(list(range(n))[::-1])
            idx.append([(m - 1) * n + i for i in range(n)])
        s.faces(vs, idx, mat)

    def cyl(s, p0, p1, r0, r1=None, n=8, caps=True, mat=0):
        p0, p1 = Vector(p0), Vector(p1)
        r1 = r0 if r1 is None else r1
        ax = (p1 - p0).normalized()
        u = ax.orthogonal().normalized()
        v = ax.cross(u)

        def ring(c, r):
            return [c + (u * math.cos(2 * math.pi * i / n) + v * math.sin(2 * math.pi * i / n)) * r
                    for i in range(n)]
        s.loft([ring(p0, r0), ring(p1, r1)], caps, mat)

    def tube(s, pts, r0, r1=None, n=8, caps=True):
        pts = [Vector(p) for p in pts]
        r1 = r0 if r1 is None else r1
        rings, prev = [], None
        for i, p in enumerate(pts):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == len(pts) - 1:
                t = pts[-1] - pts[-2]
            else:
                t = pts[i + 1] - pts[i - 1]
            t.normalize()
            u = t.orthogonal().normalized() if prev is None else (prev - t * prev.dot(t)).normalized()
            prev = u
            v = t.cross(u)
            r = r0 + (r1 - r0) * i / (len(pts) - 1)
            rings.append([p + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r
                          for k in range(n)])
        s.loft(rings, caps)

    def ellipsoid(s, c, rx, ry, rz, nu=10, nv=6):
        c = Vector(c)
        rings = []
        for j in range(1, nv):
            th = math.pi * j / nv
            z, rr = math.cos(th), math.sin(th)
            rings.append([c + Vector((rr * math.cos(2 * math.pi * i / nu) * rx,
                                      rr * math.sin(2 * math.pi * i / nu) * ry, z * rz))
                          for i in range(nu)])
        s.loft(rings, True)

    def disc(s, c, r, n=16, mat=0):
        c = Vector(c)
        s.poly([c + Vector((math.cos(2 * math.pi * i / n) * r, math.sin(2 * math.pi * i / n) * r, 0))
                for i in range(n)], mat)


def get(name, cls, feat, mode="edges", fill=False, smooth=False, props=None, coll=None):
    b = BUILDERS.get(name)
    if b is None:
        b = BUILDERS[name] = MB(name, cls, feat, mode, fill, smooth, props, coll)
    return b


def frame(origin, n):
    """Local frame: a along the wall, d out of the wall (normal n), h up. det = +1."""
    n = Vector(n).normalized()
    t = n.cross(Vector((0, 0, 1)))
    return Matrix(((t.x, n.x, 0, origin[0]),
                   (t.y, n.y, 0, origin[1]),
                   (t.z, n.z, 1, origin[2]),
                   (0, 0, 0, 1)))


def place(pos, heading):
    return Matrix.Translation(Vector(pos)) @ Matrix.Rotation(heading, 4, "Z")


# ======================================================================================
# facade modules (all coordinates local: a along wall, d outward, h up)
# ======================================================================================

class Fa:
    def __init__(s, tag, M, feat="building"):
        s.M, s.M3 = M, M.to_3x3()
        s.S = get(tag + "_s", "structure", feat, fill=True)
        s.D = get(tag + "_d", "detail", feat)
        s.F = get(tag + "_f", "fine", feat)
        s.L = get(tag + "_l", "fine", feat, mode="centerline")
        s.Ld = get(tag + "_ld", "detail", feat, mode="centerline")
        s.P = get(tag + "_p", "detail", feat, smooth=True)

    def box(s, b, lo, hi, mat=0):
        b.box(lo, hi, s.M, mat)

    def fin(s, b, p0, p1, off):
        b.fin(s.M @ Vector(p0), s.M @ Vector(p1), s.M3 @ Vector(off))

    def w(s, p):
        return s.M @ Vector(p)

    def ring(s, b, a0, h0, a1, h1, d0, d1, t):
        s.box(b, (a0, d0, h0), (a1, d1, h0 + t))
        s.box(b, (a0, d0, h1 - t), (a1, d1, h1))
        s.box(b, (a0, d0, h0 + t), (a0 + t, d1, h1 - t))
        s.box(b, (a1 - t, d0, h0 + t), (a1, d1, h1 - t))

    def hatch(s, a0, h0, a1, h1, d=0.003, step=0.07, slope=1.0, jitter=0.15, rng=None):
        """Illustrator's shadow hatching: parallel diagonal strokes clipped to a wall rect."""
        rng = rng or R
        hh = h1 - h0
        if a1 - a0 < 0.05 or hh < 0.05:
            return
        k = -int(hh * abs(slope) / step) - 1
        while True:
            a_start = a0 + k * step
            if a_start > a1:
                break
            k += 1
            # line: a = a_start + slope * (h - h0), clipped to [a0, a1] x [h0, h1]
            ta, tb = 0.0, hh
            if slope > 0:
                ta = max(ta, (a0 - a_start) / slope)
                tb = min(tb, (a1 - a_start) / slope)
            else:
                ta = max(ta, (a1 - a_start) / slope)
                tb = min(tb, (a0 - a_start) / slope)
            if tb - ta < 0.04:
                continue
            ja, jb = rng.uniform(0, jitter) * (tb - ta), rng.uniform(0, jitter) * (tb - ta)
            ta, tb = ta + ja, tb - jb
            s.fin(s.L, (a_start + slope * ta, d, h0 + ta), (a_start + slope * tb, d, h0 + tb), (0, 0.01, 0))

    def rectfins(s, b, a0, h0, a1, h1, d, dd):
        o = (0, dd, 0)
        s.fin(b, (a0, d, h0), (a1, d, h0), o)
        s.fin(b, (a1, d, h0), (a1, d, h1), o)
        s.fin(b, (a1, d, h1), (a0, d, h1), o)
        s.fin(b, (a0, d, h1), (a0, d, h0), o)

    # ---------------------------------------------------------------- windows
    def grille(s, a0, h0, a1, h1, kind="bars"):
        d = 0.085
        s.ring(s.F, a0 - 0.04, h0 - 0.04, a1 + 0.04, h1 + 0.04, 0.06, 0.11, 0.03)
        o = (0, 0.025, 0)
        if kind == "bars":
            n = max(2, int((a1 - a0) / 0.11))
            for i in range(1, n):
                a = a0 + (a1 - a0) * i / n
                s.fin(s.L, (a, d, h0), (a, d, h1), o)
            for k in (0.33, 0.66):
                h = h0 + (h1 - h0) * k
                s.fin(s.L, (a0, d, h), (a1, d, h), o)
        else:  # diamond lattice
            n = max(2, int((a1 - a0) / 0.28))
            step = (a1 - a0) / n
            hh = h1 - h0
            for i in range(-int(hh / step) - 1, n + 1):
                for sgn in (1, -1):
                    # line a = a0 + i*step + sgn*(h-h0), clipped to rect
                    pts = []
                    for hh_ in (0.0, hh):
                        pts.append((a0 + i * step + sgn * hh_, h0 + hh_))
                    (pa, ph), (qa, qh) = pts
                    # clip param t in [0,1] so that a in [a0,a1]
                    t0, t1 = 0.0, 1.0
                    da = qa - pa
                    for lim, sign in ((a0, 1), (a1, -1)):
                        if abs(da) < 1e-9:
                            continue
                        t = (lim - pa) / da
                        if (da > 0) == (sign > 0):
                            t0 = max(t0, t)
                        else:
                            t1 = min(t1, t)
                    if t1 - t0 < 0.05:
                        continue
                    A = (pa + da * t0, d, ph + (qh - ph) * t0)
                    B = (pa + da * t1, d, ph + (qh - ph) * t1)
                    s.fin(s.L, A, B, o)
            s.fin(s.L, (a0, d, (h0 + h1) / 2), (a1, d, (h0 + h1) / 2), o)

    def window(s, a0, h0, ww, wh, kind="casement", grille=None, sunshade=True, rng=R):
        a1, h1, t = a0 + ww, h0 + wh, 0.07
        s.ring(s.D, a0, h0, a1, h1, 0.0, 0.05, t)
        s.box(s.D, (a0 - 0.08, 0, h0 - 0.09), (a1 + 0.08, 0.14, h0))
        if kind == "casement":
            npan = 3 if ww > 1.5 else 2
            for i in range(1, npan):
                a = a0 + ww * i / npan
                s.box(s.D, (a - 0.025, 0, h0 + t), (a + 0.025, 0.04, h1 - t))
            ht = h1 - 0.42
            s.box(s.D, (a0 + t, 0, ht - 0.025), (a1 - t, 0.04, ht + 0.025))
            # glazing beads (fine): small inner rectangles per pane
            for i in range(npan):
                pa0 = a0 + t + (ww - 2 * t) * i / npan + 0.04
                pa1 = a0 + t + (ww - 2 * t) * (i + 1) / npan - 0.04
                s.rectfins(s.L, pa0, h0 + t + 0.04, pa1, ht - 0.06, 0.012, 0.01)
        elif kind == "louvre":
            am = (a0 + a1) / 2
            s.box(s.D, (am - 0.03, 0, h0 + t), (am + 0.03, 0.04, h1 - t))
            pitch = 0.085
            nb = int((wh - 2 * t) / pitch)
            for k in range(nb):
                z = h0 + t + (k + 0.5) * pitch
                for (b0, b1) in ((a0 + t, am - 0.03), (am + 0.03, a1 - t)):
                    s.F.poly([s.w((b0, 0.005, z - 0.035)), s.w((b1, 0.005, z - 0.035)),
                              s.w((b1, 0.045, z + 0.03)), s.w((b0, 0.045, z + 0.03))])
        elif kind == "door":
            am = (a0 + a1) / 2
            s.box(s.D, (am - 0.025, 0, h0 + t), (am + 0.025, 0.04, h1 - t))
            for (b0, b1) in ((a0 + t + 0.08, am - 0.1), (am + 0.1, a1 - t - 0.08)):
                s.rectfins(s.L, b0, h0 + 0.15, b1, h0 + 0.9, 0.01, 0.012)
                s.rectfins(s.L, b0, h0 + 1.05, b1, h1 - 0.2, 0.01, 0.012)
        if grille:
            s.grille(a0 + 0.03, h0 + 0.03 if kind != "door" else h0 + 1.0, a1 - 0.03, h1 - 0.03, grille)
        if sunshade:
            s.hatch(a0 + t, h1 - 0.38, a1 - t, h1 - t, d=0.006, step=0.06)
            s.box(s.D, (a0 - 0.22, 0, h1 + 0.12), (a1 + 0.22, 0.42, h1 + 0.22))
            s.box(s.F, (a0 - 0.22, 0.38, h1 + 0.04), (a1 + 0.22, 0.42, h1 + 0.12))

    # ---------------------------------------------------------------- balcony
    def balcony(s, a0, a1, hf, kind, bd=1.1):
        s.box(s.D, (a0 - 0.12, 0, hf - 0.16), (a1 + 0.12, bd, hf + 0.08))
        s.box(s.F, (a0 - 0.12, bd - 0.04, hf - 0.24), (a1 + 0.12, bd, hf - 0.16))
        top = hf + 1.05
        if kind == "rail":
            for (pa, pd) in ((a0 - 0.1, bd - 0.05), (a1 + 0.05, bd - 0.05)):
                s.box(s.D, (pa, pd, hf + 0.08), (pa + 0.05, pd + 0.05, top))
            s.box(s.D, (a0 - 0.12, bd - 0.07, top), (a1 + 0.12, bd + 0.01, top + 0.06))
            s.box(s.D, (a0 - 0.12, 0, top), (a0 - 0.06, bd, top + 0.06))
            s.box(s.D, (a1 + 0.06, 0, top), (a1 + 0.12, bd, top + 0.06))
            s.box(s.F, (a0 - 0.1, bd - 0.05, hf + 0.2), (a1 + 0.1, bd - 0.02, hf + 0.24))
            n = int((a1 - a0) / 0.13)
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                s.fin(s.L, (a, bd - 0.035, hf + 0.08), (a, bd - 0.035, top), (0.02, 0, 0))
            for a in (a0 - 0.09, a1 + 0.09):
                m = int(bd / 0.13)
                for i in range(1, m):
                    dd = bd * i / m
                    s.fin(s.L, (a, dd, hf + 0.08), (a, dd, top), (0, 0.02, 0))
        else:  # solid balustrade with pierced openings
            s.box(s.D, (a0 - 0.12, bd - 0.12, hf + 0.08), (a1 + 0.12, bd, top))
            s.box(s.D, (a0 - 0.12, 0, hf + 0.08), (a0, bd, top))
            s.box(s.D, (a1, 0, hf + 0.08), (a1 + 0.12, bd, top))
            s.box(s.D, (a0 - 0.16, bd - 0.16, top), (a1 + 0.16, bd + 0.04, top + 0.07))
            n = max(2, int((a1 - a0) / 0.45))
            for i in range(n):
                b0 = a0 + (a1 - a0) * i / n + 0.08
                b1 = a0 + (a1 - a0) * (i + 1) / n - 0.08
                s.rectfins(s.L, b0, hf + 0.3, b1, top - 0.2, bd + 0.001, 0.01)
                s.fin(s.L, (b0, bd + 0.001, hf + 0.3), (b1, bd + 0.001, top - 0.2), (0, 0.01, 0))

    # ---------------------------------------------------------------- shutters
    def shutter(s, a0, a1, h0, h1):
        s.box(s.D, (a0 - 0.06, 0, h0), (a0, 0.07, h1))
        s.box(s.D, (a1, 0, h0), (a1 + 0.06, 0.07, h1))
        s.box(s.D, (a0 - 0.08, 0, h1), (a1 + 0.08, 0.3, h1 + 0.3))
        s.box(s.D, (a0, 0, h0), (a1, 0.06, h0 + 0.08))
        h = h0 + 0.08
        while h < h1 - 0.03:
            h += 0.085
            s.fin(s.L, (a0, 0.025, h), (a1, 0.025, h), (0, 0.02, 0))
        am = (a0 + a1) / 2
        s.box(s.F, (am - 0.12, 0.06, h0 + 0.12), (am + 0.12, 0.09, h0 + 0.18))
        s.box(s.F, (a0 + 0.25, 0.06, h0 + 0.05), (a0 + 0.35, 0.1, h0 + 0.14))

    def glazed(s, a0, a1, h0, h1):
        s.ring(s.D, a0, h0, a1, h1, 0, 0.06, 0.08)
        n = 3 if a1 - a0 > 2.4 else 2
        for i in range(1, n):
            a = a0 + (a1 - a0) * i / n
            s.box(s.D, (a - 0.035, 0, h0 + 0.08), (a + 0.035, 0.05, h1 - 0.08))
        ht = h1 - 0.5
        s.box(s.D, (a0 + 0.08, 0, ht - 0.03), (a1 - 0.08, 0.05, ht + 0.03))
        s.box(s.D, (a0 + 0.08, 0, h0 + 0.5), (a1 - 0.08, 0.05, h0 + 0.56))
        # dark interior: dense vertical-ish hatching behind the glass
        s.hatch(a0 + 0.08, h0 + 0.56, a1 - 0.08, ht - 0.03, d=0.004, step=0.06, slope=0.18, jitter=0.25)
        # display goods in the window (fine shelf lines)
        for k in range(3):
            hh = h0 + 0.75 + k * 0.42
            if hh < ht - 0.1:
                s.fin(s.L, (a0 + 0.12, 0.004, hh), (a1 - 0.12, 0.004, hh), (0, 0.01, 0))

    def signboard(s, a0, a1, h0, h1, d):
        s.box(s.D, (a0, d, h0), (a1, d + 0.06, h1))
        s.ring(s.F, a0 + 0.06, h0 + 0.06, a1 - 0.06, h1 - 0.06, d + 0.06, d + 0.09, 0.03)

    def canopy(s, a0, a1, ch, cd, ribbed=True, sign=True, posts=True):
        p = [(0, 0, ch), (0, cd, ch - 0.28), (0, cd, ch - 0.36), (0, 0, ch - 0.08)]
        pts = [s.w((a0, d, h)) for (_, d, h) in p]
        s.S.prism(pts, s.M3 @ Vector((a1 - a0, 0, 0)))
        if ribbed:
            a = a0 + 0.1
            while a < a1:
                s.fin(s.L, (a, 0.02, ch + 0.005), (a, cd, ch - 0.275), (0, 0, 0.025))
                a += 0.19
        if sign:
            s.signboard(a0 + 0.05, a1 - 0.05, ch - 0.45, ch + 0.35, cd)
        else:
            s.box(s.D, (a0, cd, ch - 0.5), (a1, cd + 0.05, ch - 0.25))
        if posts:
            for a in (a0 + 0.15, a1 - 0.2):
                s.box(s.D, (a, cd - 0.12, 0), (a + 0.08, cd - 0.04, ch - 0.33))

    def ac_unit(s, a, h):
        s.box(s.D, (a, 0.12, h), (a + 0.8, 0.42, h + 0.55))
        for k in range(1, 10):
            hh = h + 0.04 + k * 0.047
            s.fin(s.L, (a + 0.06, 0.421, hh), (a + 0.5, 0.421, hh), (0, 0.01, 0))
        s.rectfins(s.L, a + 0.55, h + 0.08, a + 0.75, h + 0.47, 0.421, 0.01)
        for aa in (a + 0.1, a + 0.62):
            s.box(s.F, (aa, 0, h - 0.06), (aa + 0.04, 0.42, h))
        # condensate pipe
        s.P.tube([s.w((a + 0.7, 0.2, h)), s.w((a + 0.7, 0.2, h - 0.4)), s.w((a + 0.7, 0.06, h - 0.55))], 0.012, n=6)

    def drainpipe(s, a, H):
        pts = [s.w((a, 0.1, 0.0)), s.w((a, 0.1, H - 0.6)), s.w((a, 0.25, H - 0.3)), s.w((a, 0.25, H + 0.15))]
        s.P.tube(pts, 0.05, n=8)
        h = 1.4
        while h < H - 0.8:
            s.box(s.F, (a - 0.07, 0, h), (a + 0.07, 0.16, h + 0.04))
            h += 1.6
        s.P.cyl(s.w((a, 0.25, H + 0.15)), s.w((a, 0.25, H + 0.35)), 0.07, 0.12, n=8)


def gable_roof(fa, W, Dp, H, rise, over=0.45):
    """Pitched roof spanning a in [0,W], ridge parallel to the facade."""
    prof = [(over, H - 0.05), (-Dp / 2, H + rise), (-Dp - over, H - 0.05), (-Dp - over, H - 0.18),
            (-Dp / 2, H + rise - 0.13), (over, H - 0.18)]
    pts = [fa.w((-0.3, d, h)) for (d, h) in prof]
    fa.S.prism(pts, fa.M3 @ Vector((W + 0.6, 0, 0)))
    # corrugations on the street-facing slope, eave fascia, ridge cap
    a = -0.2
    sl = Vector((-Dp / 2 - over, rise + 0.05))
    nrm = Vector((-sl.y, sl.x)).normalized() * -1  # outward (up/forward)
    nrm = Vector((sl.y, -sl.x)).normalized()
    if nrm.y < 0:
        nrm = -nrm
    while a < W + 0.3:
        fa.fin(fa.L, (a, over - 0.02, H - 0.04), (a, -Dp / 2 + 0.05, H + rise - 0.02),
               (0, nrm.x * 0.03, nrm.y * 0.03))
        a += 0.22
    fa.box(fa.D, (-0.3, over - 0.04, H - 0.32), (W + 0.3, over + 0.03, H - 0.02))
    fa.D.cyl(fa.w((-0.32, -Dp / 2, H + rise + 0.02)), fa.w((W + 0.32, -Dp / 2, H + rise + 0.02)), 0.08, n=6)


def building(tag, side, y0, W, floors, setback, rng, Dp=12.0, side_walls=(), roof=None):
    xf = 6.0 + setback
    if side < 0:
        M = frame((-xf, y0 + W, BASE), (1, 0, 0))
    else:
        M = frame((xf, y0, BASE), (-1, 0, 0))
    fa = Fa(tag, M)
    H = floors * FL
    roof = roof or ("pitched" if floors == 2 and rng.random() < 0.65 else "flat")
    st = dict(
        shop=rng.random() < 0.82,
        canopy=rng.random() < 0.75,
        win=rng.choice(["casement", "louvre", "mixed", "mixed"]),
        grille=rng.random() < 0.8,
        gkind=rng.choice(["bars", "bars", "diamond"]),
        sunshade=rng.random() < 0.65,
        balc=[f for f in range(1, floors) if rng.random() < 0.5],
        bkind=rng.choice(["rail", "solid"]),
        breeze=rng.random() < 0.5,
        ac=rng.randint(0, 2),
        blade=rng.random() < 0.35,
    )
    top = H + (0.95 if roof == "flat" else 0.0)
    fa.box(fa.S, (0, -Dp, 0), (W, 0, top))
    # plinth, corner pilasters, floor bands
    fa.box(fa.D, (-0.03, 0, 0), (W + 0.03, 0.06, 0.4))
    fa.box(fa.D, (0, 0, 0.4), (0.28, 0.08, H))
    fa.box(fa.D, (W - 0.28, 0, 0.4), (W, 0.08, H))
    for f in range(1, floors):
        fa.box(fa.D, (-0.06, 0, f * FL - 0.12), (W + 0.06, 0.14, f * FL + 0.1))
    if roof == "flat":
        fa.box(fa.D, (-0.1, 0, H - 0.12), (W + 0.1, 0.18, H + 0.1))
        fa.box(fa.D, (-0.06, -0.25, top), (W + 0.06, 0.08, top + 0.1))
        if st["breeze"]:
            n = int((W - 1.0) / 0.42)
            for i in range(n):
                a = 0.5 + i * (W - 1.0) / n
                fa.rectfins(fa.L, a + 0.04, H + 0.25, a + 0.34, H + 0.75, 0.001, 0.012)
                fa.fin(fa.L, (a + 0.04, 0.001, H + 0.25), (a + 0.34, 0.001, H + 0.75), (0, 0.012, 0))
                fa.fin(fa.L, (a + 0.34, 0.001, H + 0.25), (a + 0.04, 0.001, H + 0.75), (0, 0.012, 0))
    else:
        gable_roof(fa, W, Dp, H, rise=min(2.4, Dp * 0.2))

    # ---- ground floor
    ch = 2.75
    if st["shop"]:
        nb = max(1, round(W / 3.6))
        bw = W / nb
        for i in range(nb + 1):
            a = i * bw
            fa.box(fa.D, (max(0, a - 0.15), 0, 0.4), (min(W, a + 0.15), 0.1, ch + 0.1))
        for i in range(nb):
            a0, a1 = i * bw + 0.25, (i + 1) * bw - 0.25
            k = rng.random()
            if k < 0.5:
                fa.shutter(a0, a1, 0.0, 2.4)
            elif k < 0.7:
                fa.shutter(a0, a1, 1.55, 2.4)
                fa.glazed(a0 + 0.1, a1 - 0.1, 0.0, 1.5)
            else:
                fa.glazed(a0, a1, 0.0, 2.5)
        if st["canopy"]:
            fa.canopy(0.0, W, ch + 0.25, rng.uniform(1.1, 1.6), ribbed=rng.random() < 0.7,
                      sign=True, posts=rng.random() < 0.5)
        else:
            for i in range(nb):
                fa.signboard(i * bw + 0.3, (i + 1) * bw - 0.3, 2.8, 3.05, 0.1)
    else:
        nb = max(2, int(W / 3.0))
        bw = W / nb
        for i in range(nb):
            ac = (i + 0.5) * bw
            if i == nb // 2:
                fa.window(ac - 0.55, 0.0, 1.1, 2.3, "door", grille=st["gkind"], sunshade=True)
            else:
                fa.window(ac - 0.7, 1.0, 1.4, 1.3, "casement", grille=st["gkind"], sunshade=st["sunshade"])
    # ---- upper floors
    for f in range(1, floors):
        hf = f * FL
        nb = max(1, int(W / 2.9))
        bw = W / nb
        balc = f in st["balc"] and nb >= 2
        if balc:
            i0 = rng.randint(0, max(0, nb - 2))
            i1 = min(nb - 1, i0 + rng.randint(1, 2))
        for i in range(nb):
            ac = (i + 0.5) * bw
            if balc and i0 <= i <= i1:
                fa.window(ac - 0.5, hf + 0.1, 1.0, 2.25, "door", grille=None, sunshade=False)
                continue
            kind = st["win"] if st["win"] != "mixed" else rng.choice(["casement", "louvre"])
            ww = min(1.8, bw * 0.58)
            wh = 1.45 if kind == "casement" else 1.25
            fa.window(ac - ww / 2, hf + 0.9, ww, wh, kind,
                      grille=st["gkind"] if (st["grille"] and rng.random() < 0.85) else None,
                      sunshade=st["sunshade"])
        if balc:
            fa.balcony(i0 * bw + 0.25, (i1 + 1) * bw - 0.25, hf, st["bkind"])
    # ---- services
    fa.drainpipe(W - 0.45 if rng.random() < 0.5 else 0.45, H)
    for k in range(st["ac"] if floors > 1 else 0):
        f = rng.randint(1, floors - 1)
        nb = max(1, int(W / 2.9))
        bw = W / nb
        i = rng.randint(0, nb - 1)
        fa.ac_unit((i + 0.5) * bw + min(1.8, bw * 0.58) / 2 + 0.15, f * FL + 0.5)
    if st["blade"] and floors > 2:
        a = 0.4
        fa.box(fa.D, (a - 0.04, 0, FL + 0.6), (a + 0.04, 1.3, FL + 0.66))
        fa.box(fa.D, (a - 0.05, 0.25, FL + 0.6 + 0.06), (a + 0.05, 1.25, FL + 2.3))
        fa.ring(fa.F, a + 0.05, FL + 0.75, a + 0.07, FL + 2.2, 0.32, 1.18, 0.04)
    # ---- side walls visible down the street
    for sw in side_walls:
        side_facade(tag + "_sw", side, xf, y0, W, Dp, floors, sw, st, rng, roof)
    return dict(tag=tag, side=side, y0=y0, W=W, xf=xf, H=H, top=top, Dp=Dp, roof=roof, M=M)


def side_facade(tag, side, xf, y0, W, Dp, floors, which, st, rng, roof):
    """Windows on the gable wall facing -Y (which='near') or +Y (which='far')."""
    if which == "near":
        if side < 0:
            M = frame((-xf, y0, BASE), (0, -1, 0))
        else:
            M = frame((xf + Dp, y0, BASE), (0, -1, 0))
    else:
        if side < 0:
            M = frame((-xf - Dp, y0 + W, BASE), (0, 1, 0))
        else:
            M = frame((xf, y0 + W, BASE), (0, 1, 0))
    fa = Fa(tag + which[0], M)
    for f in range(1, floors):
        fa.box(fa.D, (0, 0, f * FL - 0.1), (Dp, 0.08, f * FL + 0.08))
    for f in range(0, floors):
        nb = max(1, int(Dp / 3.4))
        for i in range(nb):
            a = (i + 0.5) * Dp / nb
            if f == 0 and rng.random() < 0.5:
                continue
            fa.window(a - 0.55, f * FL + 1.0, 1.1, 1.2, rng.choice(["louvre", "casement"]),
                      grille="bars" if rng.random() < 0.7 else None, sunshade=rng.random() < 0.5)


def compound_wall(tag, side, ya, yb, rng, house=True):
    """Block wall with piers, coping and a steel gate; optional bungalow behind."""
    xf = 6.3
    W = yb - ya
    if W < 1.5:
        return
    if side < 0:
        M = frame((-xf, yb, BASE), (1, 0, 0))
    else:
        M = frame((xf, ya, BASE), (-1, 0, 0))
    fa = Fa(tag, M, "general")
    hw = 2.1
    bare = rng.random() < 0.5
    coil = rng.random() < 0.6
    gate = W > 5.5
    g0, g1 = (W / 2 - 1.6, W / 2 + 1.6) if gate else (W, W)
    for (s0, s1) in ((0, g0), (g1, W)):
        if s1 - s0 > 0.2:
            fa.box(fa.S, (s0, -0.2, 0), (s1, 0, hw))
            fa.box(fa.D, (s0 - 0.03, -0.24, hw), (s1 + 0.03, 0.04, hw + 0.08))
            if bare:   # unplastered sandcrete blockwork: 450 x 225 courses, staggered joints
                h, row = 0.225, 0
                while h < hw - 0.05:
                    fa.fin(fa.L, (s0, 0.001, h), (s1, 0.001, h), (0, 0.01, 0))
                    h += 0.225
                    row += 1
                for r_ in range(int(hw / 0.225) + 1):
                    a_ = s0 + (0.225 if r_ % 2 else 0.0) + 0.45
                    while a_ < s1 - 0.05:
                        fa.fin(fa.L, (a_, 0.001, r_ * 0.225), (a_, 0.001, min(hw, (r_ + 1) * 0.225)), (0, 0.01, 0))
                        a_ += 0.45
            else:      # plastered: a band and a few cracks
                fa.fin(fa.L, (s0, 0.001, 0.45), (s1, 0.001, 0.45), (0, 0.01, 0))
                for _ in range(int((s1 - s0) / 3) + 1):
                    a_, h_ = rng.uniform(s0, s1), rng.uniform(0.5, hw - 0.3)
                    for _k in range(3):
                        a2, h2 = a_ + rng.uniform(-0.25, 0.25), h_ - rng.uniform(0.1, 0.3)
                        fa.fin(fa.L, (a_, 0.001, h_), (a2, 0.001, h2), (0, 0.01, 0))
                        a_, h_ = a2, h2
            # razor-wire coil along the coping
            if coil:
                n = int((s1 - s0) / 0.025)
                prev = None
                for i in range(n + 1):
                    t = i / max(1, n)
                    ph = (s1 - s0) * t / 0.14 * 2 * math.pi
                    p = (s0 + (s1 - s0) * t + 0.05 * math.sin(ph), -0.1 + 0.2 * math.cos(ph), hw + 0.3 + 0.2 * math.sin(ph))
                    if prev is not None:
                        fa.fin(fa.L, prev, p, (0, 0, 0.008))
                    prev = p
    a = 0.0
    piers = [0.0, W] + ([g0, g1] if gate else [])
    n = int(W / 3.0)
    piers += [W * i / max(1, n) for i in range(1, n)]
    for a in piers:
        if gate and g0 + 0.2 < a < g1 - 0.2:
            continue
        fa.box(fa.D, (a - 0.2, -0.3, 0), (a + 0.2, 0.08, hw + 0.3))
        fa.box(fa.D, (a - 0.25, -0.35, hw + 0.3), (a + 0.25, 0.13, hw + 0.38))
    if gate:
        for (s0, s1) in ((g0 + 0.2, W / 2 - 0.02), (W / 2 + 0.02, g1 - 0.2)):
            fa.ring(fa.D, s0, 0.05, s1, hw + 0.1, -0.1, -0.05, 0.06)
            fa.box(fa.D, (s0, -0.1, 1.0), (s1, -0.05, 1.06))
            n = int((s1 - s0) / 0.12)
            for i in range(1, n):
                aa = s0 + (s1 - s0) * i / n
                fa.fin(fa.L, (aa, -0.075, 0.1), (aa, -0.075, hw + 0.05), (0.015, 0, 0))
                fa.fin(fa.L, (aa, -0.075, hw + 0.05), (aa, -0.075, hw + 0.25), (0.015, 0, 0))
    if house and W > 4.0:
        # bungalow set back 4 m behind the wall
        Wb = W - 1.2
        hb = Fa(tag + "h", M @ Matrix.Translation((0.6, -4.5, 0)), "building")
        hb.box(hb.S, (0, -9, 0), (Wb, 0, 3.0))
        gable_roof(hb, Wb, 9, 3.0, 1.8, over=0.6)
        nb = max(1, int(Wb / 3.0))
        for i in range(nb):
            hb.window((i + 0.5) * Wb / nb - 0.6, 1.0, 1.2, 1.2, "louvre", grille="bars", sunshade=False)


# ======================================================================================
# street
# ======================================================================================

def street(y_start=-10.0, y_end=132.0):
    S = get("road_s", "structure", "general", fill=True)
    D = get("road_d", "detail", "general")
    Ld = get("road_ld", "detail", "general", mode="centerline")
    L = get("road_l", "fine", "general", mode="centerline")
    F = get("road_f", "fine", "general")
    S.box((-3.5, y_start, -0.3), (3.5, y_end, 0.0))
    # cross street at the far end
    S.box((-30, y_end - 9, -0.3), (30, y_end, 0.0))
    for side in (-1, 1):
        def X(x):
            return side * x
        # kerb / culvert / walkway
        S.box((X(3.5), y_start, -0.55), (X(3.66), y_end - 9, 0.2))           # kerb wall
        S.box((X(3.95), y_start, -0.55), (X(4.1), y_end - 9, BASE))          # back wall
        S.box((X(3.66), y_start, -0.6), (X(3.95), y_end - 9, -0.5))          # channel floor
        S.box((X(4.1), y_start, -0.3), (X(6.3), y_end - 9, BASE))            # walkway
        D.box((X(3.48), y_start, 0.2), (X(3.68), y_end - 9, 0.23))           # kerb cap
        # culvert slabs at intervals
        y = y_start + 3
        while y < y_end - 12:
            ln = R.choice([1.2, 2.4, 3.6])
            D.box((X(3.62), y, BASE), (X(4.0), y + ln, BASE + 0.1))
            for k in range(1, int(ln / 0.6)):
                L.fin((X(3.62), y + k * 0.6, BASE + 0.101), (X(4.0), y + k * 0.6, BASE + 0.101), (0, 0.02, 0))
            y += ln + R.uniform(4, 10)
        # walkway paving joints
        y = y_start
        while y < y_end - 9:
            L.poly([(X(4.1), y, BASE + 0.003), (X(6.3), y, BASE + 0.003),
                    (X(6.3), y + 0.02, BASE + 0.003), (X(4.1), y + 0.02, BASE + 0.003)])
            y += 1.0
        L.poly([(X(5.2), y_start, BASE + 0.003), (X(5.22), y_start, BASE + 0.003),
                (X(5.22), y_end - 9, BASE + 0.003), (X(5.2), y_end - 9, BASE + 0.003)])
        # edge line
        Ld.poly([(X(3.15), y_start, 0.004), (X(3.27), y_start, 0.004),
                 (X(3.27), y_end - 9, 0.004), (X(3.15), y_end - 9, 0.004)])
    # asphalt paving seams (long perspective lines, as in the reference)
    for xs in (-1.8, 1.75):
        L.poly([(xs, y_start, 0.003), (xs + 0.02, y_start, 0.003), (xs + 0.02, y_end - 10, 0.003), (xs, y_end - 10, 0.003)])
    for xs in (-3.38, 3.36):
        L.poly([(xs, y_start, 0.003), (xs + 0.02, y_start, 0.003), (xs + 0.02, y_end - 10, 0.003), (xs, y_end - 10, 0.003)])
    # dashed centreline
    y = y_start
    while y < y_end - 10:
        Ld.poly([(-0.06, y, 0.004), (0.06, y, 0.004), (0.06, y + 3.0, 0.004), (-0.06, y + 3.0, 0.004)])
        y += 7.0
    # zebra crossing
    for i in range(9):
        x0 = -3.0 + i * 0.7
        D.poly([(x0, 66, 0.004), (x0 + 0.42, 66, 0.004), (x0 + 0.42, 69.5, 0.004), (x0, 69.5, 0.004)])
    # stop line at the junction
    D.poly([(-3.4, y_end - 10.5, 0.004), (3.4, y_end - 10.5, 0.004),
            (3.4, y_end - 10.2, 0.004), (-3.4, y_end - 10.2, 0.004)])
    # manholes
    for (mx, my) in ((-1.8, 14.0), (1.2, 52.0)):
        D.disc((mx, my, 0.006), 0.42, 24)
        F.disc((mx, my, 0.012), 0.34, 24)
        for k in range(-2, 3):
            L.poly([(mx - 0.28, my + k * 0.1, 0.014), (mx + 0.28, my + k * 0.1, 0.014),
                    (mx + 0.28, my + k * 0.1 + 0.015, 0.014), (mx - 0.28, my + k * 0.1 + 0.015, 0.014)])
    # asphalt patches and cracks
    rng = random.Random(5)
    for _ in range(9):
        cx, cy = rng.uniform(-3, 3), rng.uniform(0, 115)
        n = rng.randint(5, 8)
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = rng.uniform(0.4, 1.1)
            pts.append((cx + math.cos(a) * r * 1.4, cy + math.sin(a) * r * 2.2, 0.003))
        F.poly(pts)
    for _ in range(14):
        x, y = rng.uniform(-3.2, 3.2), rng.uniform(0, 120)
        a = rng.uniform(0, math.pi)
        for k in range(rng.randint(2, 4)):
            a += rng.uniform(-0.6, 0.6)
            ln = rng.uniform(0.4, 1.2)
            x2, y2 = x + math.cos(a) * ln, y + math.sin(a) * ln
            L.poly([(x, y, 0.003), (x2, y2, 0.003), (x2 + 0.01, y2 + 0.01, 0.003), (x + 0.01, y + 0.01, 0.003)])
            x, y = x2, y2


# ======================================================================================
# poles and wires
# ======================================================================================

WIRES = []


def pole(tag, x, y, h=9.2, transformer=False, lamp=False, cross_dir=1):
    P = get(tag + "_p", "structure", "general", fill=True, smooth=True)
    D = get(tag + "_d", "detail", "general")
    F = get(tag + "_f", "fine", "general")
    Fs = get(tag + "_fs", "fine", "general", smooth=True)
    P.cyl((x, y, 0), (x, y, h), 0.16, 0.1, n=10)
    arms = {}
    for (z, ln) in ((h - 0.35, 2.3), (h - 1.25, 1.6)):
        D.box((x - ln / 2, y - 0.05, z - 0.06), (x + ln / 2, y + 0.05, z + 0.06))
        # diagonal braces
        D.fin((x, y + 0.06, z - 0.6), (x - ln * 0.3, y + 0.06, z - 0.06), (0, 0.04, 0))
        D.fin((x, y + 0.06, z - 0.6), (x + ln * 0.3, y + 0.06, z - 0.06), (0, 0.04, 0))
        offs = [-ln / 2 + 0.12, -0.35, 0.35, ln / 2 - 0.12] if ln > 2 else [-ln / 2 + 0.12, ln / 2 - 0.12]
        tops = []
        for o in offs:
            px = x + o
            Fs.cyl((px, y, z + 0.06), (px, y, z + 0.12), 0.012, n=6, caps=False)
            for k in range(3):
                zz = z + 0.12 + k * 0.05
                Fs.cyl((px, y, zz), (px, y, zz + 0.035), 0.055 - k * 0.008, 0.03, n=10)
            tops.append(Vector((px, y, z + 0.3)))
        arms[round(ln, 1)] = tops
    # step bolts
    for k in range(8):
        zz = 2.5 + k * 0.45
        F.box((x - 0.18 if k % 2 else x + 0.1, y - 0.015, zz), (x - 0.1 if k % 2 else x + 0.18, y + 0.015, zz + 0.03))
    if transformer:
        T = get(tag + "_t", "detail", "general", smooth=True, fill=True)
        T.cyl((x + 0.45, y, h - 3.2), (x + 0.45, y, h - 2.2), 0.32, n=14)
        T.cyl((x + 0.45, y, h - 2.2), (x + 0.45, y, h - 2.1), 0.34, 0.2, n=14)
        for k in range(10):
            a = -math.pi / 2 + math.pi * k / 9
            cx, cy = x + 0.45 + math.cos(a) * 0.33, y + math.sin(a) * 0.33
            F.fin((cx, cy, h - 3.1), (cx, cy, h - 2.3), (math.cos(a) * 0.06, math.sin(a) * 0.06, 0))
        D.box((x, y - 0.06, h - 3.3), (x + 0.2, y + 0.06, h - 3.2))
        for k in range(3):
            Fs.cyl((x + 0.35 + k * 0.1, y, h - 2.1), (x + 0.35 + k * 0.1, y, h - 1.9), 0.03, n=6)
    if lamp:
        Fs2 = get(tag + "_lp", "detail", "general", smooth=True)
        s = cross_dir
        pts = [(x, y, h - 2.0), (x + s * 0.6, y, h - 1.5), (x + s * 1.6, y, h - 1.25), (x + s * 2.2, y, h - 1.3)]
        Fs2.tube(pts, 0.04, n=8)
        D.box((x + s * 2.0 - 0.3, y - 0.14, h - 1.45), (x + s * 2.0 + 0.3, y + 0.14, h - 1.3))
    return arms


def catenary(p0, p1, sag, n, tangle=0.0, seed=0):
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1.xy - p0.xy).length
    lo, hi = 0.01 * L, 1000.0 * L
    for _ in range(80):
        c = 0.5 * (lo + hi)
        if c * (math.cosh(L / (2 * c)) - 1) > sag:
            lo = c
        else:
            hi = c
    side = Vector((-(p1.y - p0.y), p1.x - p0.x, 0)).normalized() if L > 0 else Vector((1, 0, 0))
    rng = random.Random(seed)
    ph = rng.uniform(0, 6.28)
    pts = []
    for i in range(n + 1):
        t = i / n
        p = p0.lerp(p1, t)
        u = (t - 0.5) * L
        p.z += c * (math.cosh(u / c) - math.cosh(L / (2 * c)))
        if tangle:
            env = 4 * t * (1 - t)
            p += side * tangle * env * math.sin(ph + t * 9.0)
            p.z += tangle * 0.5 * env * math.cos(ph * 1.3 + t * 13.0)
        pts.append(p)
    return pts


def wire(name, pts, cls="detail", r=0.02):
    """Thin tube mesh for Freestyle; the exact polyline is kept in the 'polyline' prop for the bake
    (Freestyle ignores curve objects, so wires must be meshes)."""
    b = get(name, cls, "wire", mode="curve", smooth=True,
            props={"polyline": json.dumps([[round(c, 4) for c in p] for p in pts])})
    b.tube(pts, r, n=6, caps=False)
    WIRES.append(name)


# ======================================================================================
# trees
# ======================================================================================

def almond(tag, x, y, scale=1.0, seed=1):
    rng = random.Random(seed)
    T = get(tag + "_t", "structure", "tree", fill=True, smooth=True)
    Bf = get(tag + "_b", "detail", "tree", smooth=True)
    tiers = []
    lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
    top = 7.2 * scale
    trunk = [Vector((x, y, 0)) + lean * (z / top) ** 1.5 + Vector((0, 0, z)) for z in
             [0, 1.5 * scale, 3 * scale, 4.5 * scale, 6 * scale, top]]
    T.tube(trunk, 0.26 * scale, 0.07 * scale, n=10)
    # canopy tiers: white occluders only (no lines); the leaves are drawn as stroke fins
    F = get(tag + "_c", "fine", "tree", mode="none", fill=True, coll="occluders")
    Lf = get(tag + "_lf", "fine", "tree", mode="centerline")
    eye = Vector((-1.2, 20.0, 1.75))
    spec = [(2.9, 3.1, 0.42), (4.0, 2.7, 0.4), (5.0, 2.1, 0.36), (6.0, 1.4, 0.32), (6.8, 0.8, 0.3)]
    for (z, r, th) in spec:
        z *= scale
        r *= scale
        c = Vector((x, y, z)) + lean * (z / top) ** 1.5
        nbr = 5
        a0 = rng.uniform(0, 6.28)
        for k in range(nbr):
            a = a0 + 2 * math.pi * k / nbr + rng.uniform(-0.3, 0.3)
            d = Vector((math.cos(a), math.sin(a), 0))
            Bf.tube([c, c + d * r * 0.45 + Vector((0, 0, 0.12)), c + d * r * 0.85 + Vector((0, 0, 0.3))],
                    0.07 * scale, 0.025, n=6)
        n = 30
        rim = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r * (0.82 + 0.18 * math.sin(a * 3 + seed) * 0.5 + rng.uniform(-0.08, 0.1))
            if i % 2:
                rr *= 0.93
            rim.append((c.x + math.cos(a) * rr, c.y + math.sin(a) * rr * 0.92, c.z + th * 0.15 + rng.uniform(-0.05, 0.05)))
        bot = [Vector(p) + (Vector((c.x, c.y, p[2])) - Vector(p)) * 0.18 + Vector((0, 0, -th)) for p in rim]
        topr = [Vector(p) + (Vector((c.x, c.y, p[2])) - Vector(p)) * 0.25 + Vector((0, 0, th * 0.55)) for p in rim]
        F.loft([bot, [Vector(p) for p in rim], topr], caps=True)
        tiers.append([c.x, c.y, c.z, r, th])
        leaf_strokes(Lf, rng, c, r, th, eye)
    Lf.props["foliage"] = json.dumps({"type": "almond", "seed": seed, "tiers": tiers})


def leaf_strokes(Lf, rng, c, r, th, eye):
    """Clustered short curved strokes over one canopy tier (rim-heavy, some top/underside)."""
    down = Vector((0, 0, -1))
    for _ in range(int(34 * r)):
        a = rng.uniform(0, 2 * math.pi)
        u = rng.random()
        tang = Vector((-math.sin(a), math.cos(a), 0))
        rad = Vector((math.cos(a), math.sin(a), 0))
        if u < 0.6:
            rr = r * rng.uniform(0.78, 1.02)
            z = c.z + rng.uniform(-th * 0.9, th * 0.3)
            droop = 0.5
        elif u < 0.8:
            rr = r * math.sqrt(rng.uniform(0.05, 0.75))
            z = c.z + th * 0.15 + th * 0.55 * (1 - (rr / r) ** 2) + 0.03
            droop = 0.25
        else:
            rr = r * math.sqrt(rng.uniform(0.25, 0.9))
            z = c.z - th - 0.03
            droop = 1.4
        cc = Vector((c.x + math.cos(a) * rr, c.y + math.sin(a) * rr * 0.92, z))
        base = rng.uniform(-0.5, 0.5)
        for _j in range(rng.randint(4, 8)):
            p = cc + tang * rng.uniform(-0.32, 0.32) + Vector((0, 0, rng.uniform(-0.1, 0.1))) + rad * rng.uniform(-0.08, 0.08)
            ang = base + rng.uniform(-0.45, 0.45)
            d = (tang * math.cos(ang) + down * (math.sin(ang) * 0.5 + droop * 0.5) + rad * rng.uniform(-0.25, 0.25)).normalized()
            ln = rng.uniform(0.15, 0.32)
            p1 = p + d * ln * 0.5
            p2 = p + d * ln + down * ln * 0.22
            for (q0, q1) in ((p, p1), (p1, p2)):
                off = (q1 - q0).cross(eye - q0)
                if off.length < 1e-6:
                    continue
                Lf.fin(q0, q1, off.normalized() * 0.012)


def palm(tag, x, y, h=8.5, seed=2):
    rng = random.Random(seed)
    T = get(tag + "_t", "structure", "tree", fill=True, smooth=True)
    Rg = get(tag + "_r", "fine", "tree", smooth=True)
    Sp = get(tag + "_s", "detail", "tree", smooth=True)
    Lf = get(tag + "_l", "fine", "tree", mode="centerline")
    bend = Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.6, 0.6), 0))
    pts = [Vector((x, y, 0)) + bend * (t * t) + Vector((0, 0, h * t)) for t in [i / 8 for i in range(9)]]
    T.tube(pts, 0.24, 0.17, n=10)
    for k in range(1, 26):
        t = k / 26.5
        p = Vector((x, y, 0)) + bend * (t * t) + Vector((0, 0, h * t))
        q = Vector((x, y, 0)) + bend * ((t + 0.01) ** 2) + Vector((0, 0, h * (t + 0.01)))
        r = 0.24 + (0.17 - 0.24) * t + 0.012
        Rg.cyl(p, q, r, n=12, caps=True)
    crown = pts[-1]
    T.ellipsoid(crown + Vector((0, 0, 0.15)), 0.32, 0.32, 0.45, 10, 6)
    nf = 15
    for k in range(nf):
        az = 2 * math.pi * k / nf + rng.uniform(-0.15, 0.15)
        elev = rng.uniform(-0.2, 0.75)
        Lr = rng.uniform(3.0, 4.2)
        dvec = Vector((math.cos(az), math.sin(az), 0))
        spine = []
        for i in range(13):
            t = i / 12
            p = crown + Vector((0, 0, 0.3)) + dvec * (Lr * t * math.cos(elev * (1 - t))) \
                + Vector((0, 0, Lr * t * math.sin(elev) * (1 - t) - 1.4 * t * t))
            spine.append(p)
        Sp.tube(spine, 0.035, 0.008, n=4)
        side = dvec.cross(Vector((0, 0, 1))).normalized()
        for i in range(2, 12):
            p = spine[i]
            t = i / 12
            ln = 0.75 * math.sin(math.pi * min(1.0, t * 1.1)) + 0.15
            tang = (spine[i + 1] - spine[i - 1]).normalized()
            for sgn in (1, -1):
                for j in range(1):
                    q = p + tang * 0.05
                    tip = q + (side * sgn * 0.85 + tang * 0.45 + Vector((0, 0, -0.55))).normalized() * ln
                    w = side * 0.012
                    Lf.poly([q - w, q + w, tip + w * 0.3, tip - w * 0.3])


# ======================================================================================
# vehicles
# ======================================================================================

def wheel(b, M, c, axis, r=0.32, w=0.2, hub=True):
    c = Vector(c)
    ax = Vector(axis).normalized()
    b.cyl(M @ (c - ax * w / 2), M @ (c + ax * w / 2), r, n=16)
    if hub:
        b.cyl(M @ (c + ax * w / 2), M @ (c + ax * (w / 2 + 0.015)), r * 0.62, n=12)


def car(tag, pos, heading, kind="sedan"):
    M = place(pos, heading)
    M3 = M.to_3x3()
    S = get(tag + "_s", "structure", "vehicle", fill=True)
    D = get(tag + "_d", "detail", "vehicle")
    L = get(tag + "_l", "fine", "vehicle", mode="centerline")
    Wl = get(tag + "_w", "detail", "vehicle", smooth=True, fill=True)
    hw = 0.88
    suv = kind == "suv"
    belt = 1.05 if suv else 0.95
    ylen = 4.6 if suv else 4.45
    wr = 0.36 if suv else 0.32
    yc1, yc2 = 0.9, ylen - 0.95
    bz = 0.34 if suv else 0.30

    def arch(yc):
        return [(yc + math.cos(math.pi - math.pi * k / 8) * (wr + 0.08),
                 wr + 0.02 + math.sin(math.pi - math.pi * k / 8) * (wr + 0.08)) for k in range(9)]
    prof = [(0.05, bz)] + arch(yc1) + arch(yc2) + [(ylen - 0.05, bz), (ylen, 0.55), (ylen - 0.03, 0.74),
                                                    (ylen - 0.25, belt - 0.08), (ylen - 1.15, belt),
                                                    (1.0 if not suv else 0.35, belt + 0.02),
                                                    (0.22, belt - 0.03), (0.0, belt - 0.16), (0.0, 0.42)]
    S.prism_lr([M @ Vector((-hw, py, pz)) for (py, pz) in prof], [M @ Vector((hw, py, pz)) for (py, pz) in prof])
    if suv:
        cab = [(0.35, belt + 0.02), (0.5, 1.72), (ylen - 1.6, 1.74), (ylen - 1.1, belt)]
    else:
        cab = [(1.0, belt + 0.02), (1.6, 1.43), (ylen - 1.6, 1.45), (ylen - 1.15, belt)]
    top_z = cab[1][1]

    def xin(pz):
        return hw - 0.05 - (pz - belt) / (top_z - belt) * 0.17
    S.prism_lr([M @ Vector((-xin(pz), py, pz)) for (py, pz) in cab], [M @ Vector((xin(pz), py, pz)) for (py, pz) in cab])
    # side windows (plates just proud of the cabin side)
    ya, yb = cab[0][0], cab[3][0]
    split = (cab[1][0] + cab[2][0]) / 2
    for sgn in (-1, 1):
        for (w0, w1) in ((ya + 0.25, split - 0.06), (split + 0.06, yb - 0.25)):
            z0, z1 = belt + 0.06, top_z - 0.07
            # clip to the slanted A/C pillars
            def ylo(z):
                return ya + (cab[1][0] - ya) * (z - belt) / (top_z - belt) + 0.12
            def yhi(z):
                return yb + (cab[2][0] - yb) * (z - belt) / (top_z - belt) - 0.12
            pts = [(max(w0, ylo(z0)), z0), (min(w1, yhi(z0)), z0), (min(w1, yhi(z1)), z1), (max(w0, ylo(z1)), z1)]
            D.poly([M @ Vector((sgn * (xin(pz) + 0.006), py, pz)) for (py, pz) in pts][::(1 if sgn > 0 else -1)])
        # door seams and handles
        for ys in (cab[0][0] + 0.2, split, cab[3][0] - 0.05):
            L.fin(M @ Vector((sgn * (hw + 0.004), ys, bz + 0.12)), M @ Vector((sgn * (hw + 0.004), ys, belt - 0.02)),
                  M3 @ Vector((sgn * 0.01, 0, 0)))
        for yh in (split - 0.35, yb - 0.4):
            D.box(M @ Vector((sgn * hw, yh, belt - 0.15)), M @ Vector((sgn * (hw + 0.03), yh + 0.2, belt - 0.11)))
        # mirror
        D.box(M @ Vector((sgn * hw, yb - 0.15, belt + 0.02)), M @ Vector((sgn * (hw + 0.18), yb + 0.02, belt + 0.17)))
        # body side crease line
        L.fin(M @ Vector((sgn * (hw + 0.004), 0.15, belt - 0.25)), M @ Vector((sgn * (hw + 0.004), ylen - 0.2, belt - 0.27)),
              M3 @ Vector((sgn * 0.01, 0, 0)))
    # windscreen / rear window plates
    for (p0, p1) in ((cab[3], cab[2]), (cab[0], cab[1])):
        y0_, z0_ = p0
        y1_, z1_ = p1
        e = 0.08
        q = []
        for (t, xs) in ((0.08, -1), (0.08, 1), (0.9, 1), (0.9, -1)):
            yy = y0_ + (y1_ - y0_) * t
            zz = z0_ + (z1_ - z0_) * t
            q.append(M @ Vector((xs * (xin(zz) - e), yy + (0.01 if p0 is cab[3] else -0.01), zz + 0.01)))
        D.poly(q)
    # lights, bumpers, grille, plate
    yf = ylen
    for sgn in (-1, 1):
        D.box(M @ Vector((sgn * 0.5, yf - 0.06, 0.64)), M @ Vector((sgn * 0.82, yf + 0.0, 0.76)))
        D.box(M @ Vector((sgn * 0.52, -0.02, belt - 0.24)), M @ Vector((sgn * 0.82, 0.03, belt - 0.1)))
    D.box(M @ Vector((-0.9, yf - 0.1, 0.3)), M @ Vector((0.9, yf + 0.06, 0.5)))
    D.box(M @ Vector((-0.9, -0.06, 0.32)), M @ Vector((0.9, 0.1, 0.52)))
    for k in range(5):
        zz = 0.56 + k * 0.035
        L.fin(M @ Vector((-0.42, yf + 0.003, zz)), M @ Vector((0.42, yf + 0.003, zz)), M3 @ Vector((0, 0.01, 0)))
    D.box(M @ Vector((-0.26, yf + 0.06, 0.34)), M @ Vector((0.26, yf + 0.08, 0.46)))
    D.box(M @ Vector((-0.26, -0.08, 0.6)), M @ Vector((0.26, -0.06, 0.72)))
    # hood / boot shut lines
    L.fin(M @ Vector((-hw + 0.05, yc2 - 0.75, belt + 0.004)), M @ Vector((hw - 0.05, yc2 - 0.75, belt + 0.004)),
          M3 @ Vector((0, 0, 0.01)))
    for (yy,) in ((yc1,), (yc2,)):
        for sgn in (-1, 1):
            wheel(Wl, M, (sgn * (hw - 0.12), yy, wr), (sgn, 0, 0), r=wr, w=0.22)


def keke(tag, pos, heading):
    M = place(pos, heading)
    S = get(tag + "_s", "structure", "vehicle", fill=True)
    D = get(tag + "_d", "detail", "vehicle")
    L = get(tag + "_l", "fine", "vehicle", mode="centerline")
    Wl = get(tag + "_w", "detail", "vehicle", smooth=True, fill=True)
    P = get(tag + "_p", "detail", "vehicle", smooth=True)
    hw = 0.62
    # rear passenger tub
    prof = [(0.0, 0.32), (0.0, 0.95), (0.15, 1.02), (1.45, 1.0), (1.45, 0.32)]
    S.prism_lr([M @ Vector((-hw, py, pz)) for (py, pz) in prof], [M @ Vector((hw, py, pz)) for (py, pz) in prof])
    # front cowl, tapering
    cw = [(1.45, 0.32), (1.45, 1.08), (2.05, 1.1), (2.4, 0.62), (2.35, 0.4)]

    def cx(py):
        return hw - (py - 1.45) / 0.95 * 0.3
    S.prism_lr([M @ Vector((-cx(py), py, pz)) for (py, pz) in cw], [M @ Vector((cx(py), py, pz)) for (py, pz) in cw])
    # roof and posts
    S.box(M @ Vector((-0.68, -0.1, 1.78)), M @ Vector((0.68, 2.15, 1.86)))
    D.box(M @ Vector((-0.7, -0.12, 1.72)), M @ Vector((0.7, 2.17, 1.78)))
    for (px, py, pz) in ((-0.6, 0.05, 1.0), (0.6, 0.05, 1.0), (-0.42, 2.02, 1.1), (0.42, 2.02, 1.1)):
        P.cyl(M @ Vector((px, py, pz)), M @ Vector((px * 1.05, py, 1.73)), 0.03, n=6)
    # windscreen frame + wiper
    D.box(M @ Vector((-0.42, 1.98, 1.12)), M @ Vector((0.42, 2.06, 1.18)))
    D.box(M @ Vector((-0.42, 1.98, 1.65)), M @ Vector((0.42, 2.06, 1.72)))
    L.fin(M @ Vector((-0.2, 2.07, 1.2)), M @ Vector((0.05, 2.07, 1.55)), M.to_3x3() @ Vector((0, 0.01, 0)))
    # side canvas openings (rails), passenger bench, grab bar
    for sgn in (-1, 1):
        D.box(M @ Vector((sgn * hw, 0.1, 1.28)), M @ Vector((sgn * (hw + 0.03), 1.4, 1.32)))
        L.fin(M @ Vector((sgn * (hw + 0.003), 0.1, 0.7)), M @ Vector((sgn * (hw + 0.003), 1.4, 0.7)),
              M.to_3x3() @ Vector((sgn * 0.01, 0, 0)))
        L.fin(M @ Vector((sgn * (cx(1.8) + 0.003), 1.6, 0.45)), M @ Vector((sgn * (cx(1.8) + 0.003), 2.2, 0.85)),
              M.to_3x3() @ Vector((sgn * 0.01, 0, 0)))
    D.box(M @ Vector((-0.55, 0.15, 1.0)), M @ Vector((0.55, 0.6, 1.12)))
    D.box(M @ Vector((-0.55, 0.12, 1.12)), M @ Vector((0.55, 0.22, 1.55)))
    # rear: lights, number plate, spare wheel
    for sgn in (-1, 1):
        D.box(M @ Vector((sgn * 0.42, -0.03, 0.75)), M @ Vector((sgn * 0.58, 0.0, 0.88)))
    D.box(M @ Vector((-0.2, -0.03, 0.45)), M @ Vector((0.2, 0.0, 0.6)))
    wheel(Wl, M, (0, -0.12, 1.15), (0, 1, 0), r=0.22, w=0.1, hub=False)
    # headlamp, handlebar
    P.cyl(M @ Vector((0, 2.38, 0.95)), M @ Vector((0, 2.44, 0.95)), 0.09, n=10)
    P.tube([M @ Vector((-0.35, 1.8, 1.25)), M @ Vector((0, 1.9, 1.2)), M @ Vector((0.35, 1.8, 1.25))], 0.02, n=6)
    # wheels
    for (px, py) in ((-0.66, 0.5), (0.66, 0.5), (0.0, 2.15)):
        wheel(Wl, M, (px, py, 0.24), (1, 0, 0), r=0.24, w=0.13)
    P.tube([M @ Vector((0, 2.15, 0.24)), M @ Vector((0, 2.2, 0.6)), M @ Vector((0, 2.1, 0.95))], 0.025, n=6)


def okada(tag, pos, heading):
    M = place(pos, heading)
    D = get(tag + "_d", "detail", "vehicle")
    Wl = get(tag + "_w", "detail", "vehicle", smooth=True, fill=True)
    P = get(tag + "_p", "detail", "vehicle", smooth=True)
    for py in (0.0, 1.32):
        wheel(Wl, M, (0, py, 0.3), (1, 0, 0), r=0.3, w=0.09, hub=True)
    V = lambda x, y, z: M @ Vector((x, y, z))  # noqa: E731
    # forks, frame, exhaust, handlebar
    for sgn in (-1, 1):
        P.cyl(V(sgn * 0.06, 1.32, 0.3), V(sgn * 0.06, 1.12, 0.95), 0.022, n=6)
    P.tube([V(0, 1.1, 0.95), V(0, 0.75, 0.82), V(0, 0.2, 0.75), V(0, 0.0, 0.3)], 0.03, n=6)
    P.tube([V(0, 1.05, 0.9), V(0, 0.75, 0.42), V(0, 0.35, 0.4)], 0.028, n=6)
    P.tube([V(0.14, 0.75, 0.35), V(0.16, 0.3, 0.35), V(0.17, -0.15, 0.45)], 0.04, 0.035, n=8)
    P.tube([V(-0.36, 1.02, 1.08), V(-0.15, 1.1, 1.02), V(0.15, 1.1, 1.02), V(0.36, 1.02, 1.08)], 0.016, n=6)
    D.obox(V(0, 0.82, 0.85), M.to_3x3() @ Vector((0.13, 0, 0)), M.to_3x3() @ Vector((0, 0.2, -0.05)),
           M.to_3x3() @ Vector((0, 0.03, 0.1)))
    D.box(V(-0.14, 0.15, 0.8), V(0.14, 0.62, 0.9))
    D.box(V(-0.15, 0.4, 0.28), V(0.15, 0.75, 0.58))
    D.box(V(-0.12, -0.12, 0.82), V(0.12, 0.15, 0.86))
    P.cyl(V(0, 1.2, 0.98), V(0, 1.28, 0.98), 0.08, n=10)
    D.box(V(-0.16, -0.05, 0.38), V(0.16, 0.08, 0.5))  # rear mudguard
    D.box(V(-0.08, 1.2, 0.6), V(0.08, 1.48, 0.64))   # front mudguard
    return M


# ======================================================================================
# people
# ======================================================================================

def walk_pose(s=0.6):
    a = 0.38 * s
    J = {"pelvis": (0, 0, 0.94), "chest": (0, 0.02, 1.47), "head": (0, 0.03, 1.65)}
    for side, sg in (("L", -1), ("R", 1)):
        aa = a * (1 if side == "L" else -1)
        hip = Vector((sg * 0.1, 0, 0.92))
        knee = hip + Vector((0, 0.45 * math.sin(aa), -0.45 * math.cos(aa)))
        bend = 0.35 if aa < 0 else 0.05
        ank = knee + Vector((0, 0.43 * math.sin(aa - bend), -0.43 * math.cos(aa - bend)))
        toe = ank + Vector((0, 0.17, -0.04))
        sh = Vector((sg * 0.2, 0.01, 1.42))
        el = sh + Vector((sg * 0.04, -0.28 * math.sin(aa), -0.28 * math.cos(aa)))
        wr = el + Vector((sg * 0.02, -0.26 * math.sin(aa) + 0.08, -0.25 * math.cos(aa)))
        J.update({"hip" + side: hip, "knee" + side: knee, "ank" + side: ank, "toe" + side: toe,
                  "sh" + side: sh, "el" + side: el, "wr" + side: wr})
    return J


def stand_pose(arms="side"):
    J = walk_pose(0.0)
    if arms == "akimbo":
        for side, sg in (("L", -1), ("R", 1)):
            J["el" + side] = Vector((sg * 0.38, -0.02, 1.15))
            J["wr" + side] = Vector((sg * 0.18, 0.04, 0.98))
    if arms == "head":   # both hands up steadying a head load
        for side, sg in (("L", -1), ("R", 1)):
            J["el" + side] = Vector((sg * 0.34, 0.05, 1.62))
            J["wr" + side] = Vector((sg * 0.22, 0.05, 1.86))
    return J


def ride_pose(seat_z=0.9, seat_y=0.42, bar_y=1.05, bar_z=1.05):
    J = {"pelvis": (0, seat_y, seat_z + 0.05), "chest": (0, seat_y + 0.2, seat_z + 0.55),
         "head": (0, seat_y + 0.27, seat_z + 0.74)}
    for side, sg in (("L", -1), ("R", 1)):
        hip = Vector((sg * 0.12, seat_y, seat_z + 0.05))
        knee = Vector((sg * 0.2, seat_y + 0.42, seat_z + 0.02))
        ank = Vector((sg * 0.2, seat_y + 0.36, 0.38))
        toe = ank + Vector((0, 0.16, -0.03))
        sh = Vector((sg * 0.2, seat_y + 0.22, seat_z + 0.5))
        el = Vector((sg * 0.3, seat_y + 0.45, seat_z + 0.3))
        wr = Vector((sg * 0.34, bar_y, bar_z))
        J.update({"hip" + side: hip, "knee" + side: knee, "ank" + side: ank, "toe" + side: toe,
                  "sh" + side: sh, "el" + side: el, "wr" + side: wr})
    return J


def person(b, M, J, scale=1.0, wrapper=False, load=None, cap=False, fine=None):
    def P(k):
        return M @ (Vector(J[k]) * scale)
    pel, che, hd = Vector(J["pelvis"]), Vector(J["chest"]), Vector(J["head"])
    rings = []
    for (t, rx, ry) in ((0.0, 0.17, 0.11), (0.3, 0.15, 0.1), (0.72, 0.19, 0.12), (1.0, 0.2, 0.1)):
        c = pel.lerp(che, t)
        rings.append([M @ ((c + Vector((math.cos(2 * math.pi * i / 10) * rx, math.sin(2 * math.pi * i / 10) * ry, 0))) * scale)
                      for i in range(10)])
    b.loft(rings, True)
    b.cyl(M @ ((che + Vector((0, 0, -0.01))) * scale), M @ ((che.lerp(hd, 0.55)) * scale), 0.05 * scale, n=8)
    hc = M @ (hd * scale)
    b.ellipsoid(hc, 0.1 * scale, 0.11 * scale, 0.125 * scale, 10, 7)
    for sd in ("L", "R"):
        if not wrapper:
            b.tube([P("hip" + sd), P("knee" + sd)], 0.075 * scale, 0.055 * scale, n=8)
        b.tube([P("knee" + sd), P("ank" + sd)], 0.052 * scale, 0.04 * scale, n=8)
        b.tube([P("ank" + sd), P("toe" + sd)], 0.045 * scale, 0.04 * scale, n=6)
        b.tube([P("sh" + sd), P("el" + sd)], 0.048 * scale, 0.04 * scale, n=8)
        b.tube([P("el" + sd), P("wr" + sd)], 0.038 * scale, 0.032 * scale, n=8)
    if wrapper:
        w = []
        base = pel + Vector((0, 0, 0.08))
        for (dz, rx, ry) in ((0.0, 0.16, 0.12), (-0.2, 0.21, 0.15), (-0.6, 0.24, 0.18), (-0.82, 0.25, 0.19)):
            c = base + Vector((0, 0.01, dz))
            w.append([M @ ((c + Vector((math.cos(2 * math.pi * i / 12) * rx, math.sin(2 * math.pi * i / 12) * ry, 0))) * scale)
                      for i in range(12)])
        b.loft(w, True)
    if cap:
        b.cyl(M @ ((hd + Vector((0, 0, 0.07))) * scale), M @ ((hd + Vector((0, 0, 0.13))) * scale), 0.11 * scale, 0.1 * scale, n=10)
        b.box(M @ ((hd + Vector((-0.08, 0.06, 0.07))) * scale), M @ ((hd + Vector((0.08, 0.2, 0.085))) * scale))
    if load == "basin":
        top = hd + Vector((0, 0, 0.14))
        b.cyl(M @ (top * scale), M @ ((top + Vector((0, 0, 0.16))) * scale), 0.22 * scale, 0.34 * scale, n=16)
        if fine is not None:
            rng = random.Random(4)
            for _ in range(14):
                c = top + Vector((rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), 0.2 + rng.uniform(0, 0.08)))
                fine.ellipsoid(M @ (c * scale), 0.055 * scale, 0.055 * scale, 0.05 * scale, 6, 4)
    elif load == "bag":
        wr = Vector(J["wrR"])
        b.box(M @ ((wr + Vector((-0.04, -0.15, -0.38))) * scale), M @ ((wr + Vector((0.08, 0.15, -0.02))) * scale))


# ======================================================================================
# street furniture
# ======================================================================================

def kiosk(tag, cx, cy, facing):
    """facing: +1 opens toward +X (left walkway kiosk faces road)."""
    M = frame((cx + facing * 0.75, cy - facing * 1.0, BASE), (facing, 0, 0))
    fa = Fa(tag, M, "general")
    W, Dp, H = 2.0, 1.5, 2.3
    fa.box(fa.S, (0, -Dp, 0), (W, 0, H))
    fa.box(fa.D, (-0.05, -Dp - 0.05, 0), (W + 0.05, 0.05, 0.12))
    fa.ring(fa.D, 0.15, 0.95, W - 0.15, 2.0, 0.0, 0.05, 0.06)
    fa.box(fa.D, (0.05, 0, 0.88), (W - 0.05, 0.45, 0.95))
    for k in range(3):
        fa.fin(fa.L, (0.25, 0.005, 1.25 + k * 0.25), (W - 0.25, 0.005, 1.25 + k * 0.25), (0, 0.01, 0))
    # goods on the shelves / counter (fine)
    rng = random.Random(9)
    G = get(tag + "_g", "fine", "general", smooth=True)
    for k in range(3):
        a = 0.3
        while a < W - 0.3:
            h = 1.25 + k * 0.25
            G.cyl(fa.w((a, 0.03, h)), fa.w((a, 0.03, h + rng.uniform(0.12, 0.2))), 0.03, n=6)
            a += rng.uniform(0.09, 0.16)
    for i in range(5):
        a = 0.3 + i * 0.32
        fa.box(fa.F, (a, 0.1, 0.95), (a + 0.25, 0.35, 0.95 + rng.uniform(0.08, 0.2)))
    # hinged flap awning on two struts
    fa.S.prism([fa.w((-0.05, 0.0, 2.08)), fa.w((-0.05, 0.9, 1.85)), fa.w((-0.05, 0.9, 1.81)), fa.w((-0.05, 0.0, 2.04))],
               fa.M3 @ Vector((W + 0.1, 0, 0)))
    for a in (0.1, W - 0.1):
        fa.fin(fa.Ld, (a, 0.05, 1.3), (a, 0.85, 1.85), (0.02, 0, 0))
    # roof sheet
    fa.S.prism([fa.w((-0.25, 0.35, H + 0.12)), fa.w((-0.25, -Dp - 0.3, H + 0.02)),
                fa.w((-0.25, -Dp - 0.3, H - 0.02)), fa.w((-0.25, 0.35, H + 0.08))], fa.M3 @ Vector((W + 0.5, 0, 0)))
    a = -0.2
    while a < W + 0.25:
        fa.fin(fa.L, (a, 0.34, H + 0.125), (a, -Dp - 0.28, H + 0.025), (0, 0, 0.02))
        a += 0.15
    # signboard on top
    fa.signboard(0.1, W - 0.1, H + 0.2, H + 0.75, 0.2)
    fa.box(fa.D, (0.3, 0.15, H + 0.1), (0.36, 0.21, H + 0.2))
    fa.box(fa.D, (W - 0.36, 0.15, H + 0.1), (W - 0.3, 0.21, H + 0.2))
    # side panel seams
    for a in (0.0,):
        pass


def umbrella_stall(tag, x, y, rng):
    U = get(tag + "_u", "detail", "general", fill=True)
    Rb = get(tag + "_r", "fine", "general", smooth=True)
    D = get(tag + "_d", "detail", "general")
    F = get(tag + "_f", "fine", "general")
    P = get(tag + "_p", "detail", "general", smooth=True)
    z0 = BASE
    apex = Vector((x, y, z0 + 2.55))
    n, r, rim_z = 8, 1.25, z0 + 2.05
    rim = [Vector((x + math.cos(2 * math.pi * i / n) * r, y + math.sin(2 * math.pi * i / n) * r, rim_z)) for i in range(n)]
    vs = U.verts([apex] + rim)
    for i in range(n):
        try:
            f = U.bm.faces.new([vs[0], vs[1 + i], vs[1 + (i + 1) % n]])
            f.material_index = i % 2
        except ValueError:
            pass
    # valance
    for i in range(n):
        p, q = rim[i], rim[(i + 1) % n]
        U.poly([p, q, q + Vector((0, 0, -0.16)), p + Vector((0, 0, -0.16))], mat=i % 2)
    for p in rim:
        Rb.tube([apex + Vector((0, 0, -0.05)), apex.lerp(p, 0.5) + Vector((0, 0, -0.07)), p + Vector((0, 0, -0.02))], 0.008, n=4)
    P.cyl((x, y, z0), (x, y, apex.z), 0.022, n=8)
    P.cyl((x, y, z0), (x, y, z0 + 0.06), 0.2, 0.14, n=10)
    # table and wares
    tx, ty = x - 0.25, y
    D.box((tx - 0.45, ty - 0.6, z0 + 0.78), (tx + 0.45, ty + 0.6, z0 + 0.82))
    for (lx, ly) in ((-0.4, -0.55), (0.4, -0.55), (-0.4, 0.55), (0.4, 0.55)):
        D.box((tx + lx - 0.02, ty + ly - 0.02, z0), (tx + lx + 0.02, ty + ly + 0.02, z0 + 0.78))
    F.box((tx - 0.4, ty - 0.55, z0 + 0.25), (tx + 0.4, ty + 0.55, z0 + 0.27))
    for k in range(rng.randint(3, 5)):
        cx, cy = tx + rng.uniform(-0.3, 0.3), ty + rng.uniform(-0.45, 0.45)
        kind = rng.random()
        if kind < 0.4:   # tomato pyramid
            for j in range(4):
                for q in range(4 - j):
                    P.ellipsoid((cx + (q - (3 - j) / 2) * 0.07, cy, z0 + 0.86 + j * 0.06), 0.035, 0.035, 0.032, 6, 4)
        elif kind < 0.75:  # basin
            P.cyl((cx, cy, z0 + 0.82), (cx, cy, z0 + 0.95), 0.14, 0.2, n=12)
        else:  # crate
            D.box((cx - 0.15, cy - 0.12, z0 + 0.82), (cx + 0.15, cy + 0.12, z0 + 1.0))
            for j in range(1, 3):
                F.fin((cx + 0.151, cy - 0.12, z0 + 0.82 + j * 0.06), (cx + 0.151, cy + 0.12, z0 + 0.82 + j * 0.06), (0.005, 0, 0))
    # stool
    D.box((x + 0.45, y - 0.15, z0 + 0.42), (x + 0.75, y + 0.15, z0 + 0.46))
    for (lx, ly) in ((0.47, -0.13), (0.71, -0.13), (0.47, 0.11), (0.71, 0.11)):
        D.box((x + lx, y + ly, z0), (x + lx + 0.03, y + ly + 0.03, z0 + 0.42))


def water_tank(b_info, a, d):
    fa = Fa(b_info["tag"] + "_tank", b_info["M"], "building")
    top = b_info["H"]
    for (da, dd) in ((-0.8, -0.8), (0.8, -0.8), (0.8, 0.8), (-0.8, 0.8)):
        fa.box(fa.D, (a + da - 0.06, d + dd - 0.06, top), (a + da + 0.06, d + dd + 0.06, top + 2.0))
    for h in (top + 0.7, top + 1.4):
        fa.box(fa.F, (a - 0.8, d - 0.84, h), (a + 0.8, d - 0.78, h + 0.05))
        fa.box(fa.F, (a - 0.8, d + 0.78, h), (a + 0.8, d + 0.84, h + 0.05))
    for sgn in (-1, 1):
        fa.fin(fa.Ld, (a - 0.8, d + sgn * 0.82, top + 0.1), (a + 0.8, d + sgn * 0.82, top + 1.4), (0, 0.03, 0))
        fa.fin(fa.Ld, (a + 0.8, d + sgn * 0.82, top + 0.1), (a - 0.8, d + sgn * 0.82, top + 1.4), (0, 0.03, 0))
    fa.box(fa.D, (a - 0.95, d - 0.95, top + 2.0), (a + 0.95, d + 0.95, top + 2.12))
    T = get(b_info["tag"] + "_tk", "detail", "building", smooth=True, fill=True)
    c0 = fa.w((a, d, top + 2.12))
    T.cyl(c0, c0 + Vector((0, 0, 1.55)), 0.82, n=20)
    T.cyl(c0 + Vector((0, 0, 1.55)), c0 + Vector((0, 0, 1.75)), 0.82, 0.25, n=20)
    T.cyl(c0 + Vector((0, 0, 1.75)), c0 + Vector((0, 0, 1.85)), 0.25, n=12)
    Rg = get(b_info["tag"] + "_tr", "fine", "building", smooth=True)
    for k in range(1, 5):
        z = 0.3 * k + 0.05
        Rg.cyl(c0 + Vector((0, 0, z)), c0 + Vector((0, 0, z + 0.03)), 0.835, n=20)
    P = get(b_info["tag"] + "_tp", "detail", "building", smooth=True)
    P.tube([c0 + fa.M3 @ Vector((0, 0.8, 0.15)), c0 + fa.M3 @ Vector((0, 1.1, 0.0)),
            fa.w((a, d + 1.1, top + 0.05)), fa.w((a, 0.2, top + 0.05)), fa.w((a, 0.25, top - 0.4))], 0.035, n=6)


def rooftop_sign(b_info, a0, a1):
    fa = Fa(b_info["tag"] + "_rs", b_info["M"], "building")
    top = b_info["top"]
    for a in (a0 + 0.3, a1 - 0.3, (a0 + a1) / 2):
        fa.box(fa.D, (a - 0.05, -0.6, top), (a + 0.05, -0.5, top + 1.2))
        fa.fin(fa.Ld, (a, -0.55, top + 1.2), (a, -1.6, top), (0.03, 0, 0))
    fa.box(fa.D, (a0, -0.6, top + 1.1), (a1, -0.5, top + 2.6))
    fa.ring(fa.F, a0 + 0.08, top + 1.18, a1 - 0.08, top + 2.52, -0.5, -0.47, 0.04)


# ======================================================================================
# scene
# ======================================================================================

def layout_side(side, specs, y_from=-8.0, y_to=121.0, seed=0):
    rng = random.Random(100 + seed)
    total = sum(s[0] for s in specs)
    gap_avg = (y_to - y_from - total) / (len(specs) - 1)
    y = y_from
    out = []
    for i, (W, floors, setback) in enumerate(specs):
        out.append((y, W, floors, setback))
        y += W + max(1.5, gap_avg + rng.uniform(-2.5, 2.5))
    # stretch to land the last one at y_to
    last_end = out[-1][0] + out[-1][1]
    k = (y_to - y_from) / (last_end - y_from)
    res = []
    for (y0, W, f, sb) in out:
        res.append((y_from + (y0 - y_from) * k, W, f, sb))
    return res


def build():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
        for d in list(coll):
            coll.remove(d)
    left = layout_side(-1, [(10, 2, 0.6), (14, 3, 0.0), (9, 2, 1.2), (16, 4, 0.3), (11, 3, 0.0), (12, 2, 1.0), (13, 3, 0.4)], seed=1)
    right = layout_side(1, [(12, 3, 0.2), (8, 2, 1.5), (15, 4, 0.0), (10, 3, 0.8), (13, 2, 0.0), (9, 3, 1.0), (14, 4, 0.5)], seed=2)
    infos = []
    print("[layout] L", [(round(a, 1), w) for a, w, _, _ in left])
    print("[layout] R", [(round(a, 1), w) for a, w, _, _ in right])
    for side, lay, pre in ((-1, left, "L"), (1, right, "R")):
        prev_end = -10.0
        for i, (y0, W, floors, sb) in enumerate(lay):
            rng = random.Random(1000 + i * 7 + (0 if side < 0 else 500))
            gap = y0 - prev_end
            sw = ("near",) if (gap > 1.0 and y0 > 10) else ()
            info = building(f"{pre}{i:02d}", side, y0, W, floors, sb, rng, Dp=rng.uniform(10, 14), side_walls=sw)
            infos.append(info)
            if gap > 1.5 and i > 0:
                compound_wall(f"{pre}W{i:02d}", side, prev_end + 0.2, y0 - 0.2, rng, house=gap > 5)
            prev_end = y0 + W
    # far closing buildings across the junction (facing the camera, -Y)
    for k, (x_end, W, floors) in enumerate(((16.0, 13.0, 3), (2.5, 11.0, 4), (-9.0, 12.0, 2))):
        rng = random.Random(77 + k)
        M = frame((x_end, 133.5, BASE), (0, -1, 0))
        fa = Fa(f"F{k}", M)
        H = floors * FL
        fa.box(fa.S, (0, -10, 0), (W, 0, H + 0.9))
        fa.box(fa.D, (-0.1, 0, H - 0.12), (W + 0.1, 0.18, H + 0.1))
        for f in range(floors):
            nb = int(W / 2.9)
            for i in range(nb):
                ac = (i + 0.5) * W / nb
                if f == 0:
                    fa.shutter(ac - 1.1, ac + 1.1, 0, 2.4)
                else:
                    fa.window(ac - 0.7, f * FL + 0.9, 1.4, 1.4, rng.choice(["casement", "louvre"]), grille="bars")
            if f:
                fa.box(fa.D, (-0.06, 0, f * FL - 0.12), (W + 0.06, 0.14, f * FL + 0.1))
        fa.canopy(0, W, 3.0, 1.3, sign=True, posts=False)

    # water tank + rooftop sign
    flat = [b for b in infos if b["roof"] == "flat"]
    tank_b = next(b for b in flat if b["side"] > 0 and 40 < b["y0"] < 90)
    water_tank(tank_b, tank_b["W"] * 0.65, -tank_b["Dp"] * 0.35)
    sign_b = next(b for b in flat if b["side"] < 0 and 50 < b["y0"] < 110 and b is not tank_b)
    rooftop_sign(sign_b, 1.0, min(sign_b["W"] - 1.0, 7.0))

    street()
    G = get("ground", "structure", "general", mode="none", fill=False, coll="occluders")
    G.box((-80, -30, -0.4), (80, 220, -0.02))

    # poles + wires
    lp = [(-5.3, 8.0), (-5.3, 50.0), (-5.3, 92.0)]
    arms = [pole("pole0", *lp[0]), pole("pole1", *lp[1], transformer=True), pole("pole2", *lp[2], lamp=True)]
    arm_r = pole("pole3", 5.1, 71.0, h=8.6, cross_dir=-1)
    for span in range(2):
        a, b = arms[span][2.3], arms[span + 1][2.3]
        for k, idx in enumerate((0, 1, 3)):
            pts = catenary(a[idx], b[idx], sag=0.7 + 0.15 * k + 0.1 * span, n=16, tangle=0.0)
            wire(f"wire_p{span}{k}", pts)
    # telecom pair, tangled, on the lower arm of span 1
    a, b = arms[1][1.6], arms[2][1.6]
    wire("wire_t0", catenary(a[0], b[0], 1.5, 16, tangle=0.18, seed=3))
    wire("wire_t1", catenary(a[0] + Vector((0.05, 0, -0.03)), b[0] + Vector((0.04, 0, 0.02)), 1.65, 16, tangle=0.22, seed=8))
    # crossing the street: pole1 -> right pole, and pole2 -> right building service drop
    wire("wire_x0", catenary(arms[1][2.3][3], arm_r[2.3][0], 0.9, 12, tangle=0.05, seed=5))
    rb = min((b for b in infos if b["side"] > 0), key=lambda b: abs(b["y0"] + b["W"] / 2 - 100.0))
    yd = min(max(100.0, rb["y0"] + 1.0), rb["y0"] + rb["W"] - 1.0)
    drop = Vector((rb["xf"] + 0.05, yd, BASE + rb["H"] - 0.6))
    wire("wire_x1", catenary(arms[2][1.6][1], drop, 0.8, 12, tangle=0.08, seed=6))

    # trees
    almond("almond0", -5.0, 34.0, 1.0, seed=3)
    almond("almond1", 5.2, 88.0, 0.95, seed=7)
    palm("palm0", 5.4, 57.0, 8.6, seed=2)
    palm("palm1", -5.4, 112.0, 9.2, seed=5)

    # vehicles
    car("car0", (2.45, 31.0, 0.0), 0.0, "sedan")
    car("car1", (-2.5, 64.0, 0.0), math.pi, "suv")
    keke("keke0", (1.5, 46.0, 0.0), 0.0)
    okM = okada("okada0", (0.9, 55.0, 0.0), math.pi)

    # people
    Pp = get("people", "detail", "person", smooth=True, fill=True)
    Pf = get("people_f", "fine", "person", smooth=True)
    person(Pp, place((4.6, 33.0, BASE), math.pi), stand_pose("head") | walk_pose(0.5) | {k: v for k, v in stand_pose("head").items() if k.startswith(("el", "wr"))},
           1.0, wrapper=True, load="basin", fine=Pf)
    person(Pp, place((5.75, 42.0, BASE), math.pi / 2), stand_pose("akimbo"), 0.97, wrapper=True)
    person(Pp, place((-4.6, 41.0, BASE), 0.0), walk_pose(0.8), 1.04, cap=True, load="bag")
    person(Pp, place((-3.95, 66.4, BASE), -math.pi / 2 + 0.2), stand_pose("side"), 1.0)
    person(Pp, okM, ride_pose(), 1.0, cap=False)

    # street furniture
    kiosk("kiosk0", -5.2, 67.0, 1)
    srng = random.Random(21)
    for k, yy in enumerate((38.5, 41.5, 44.5)):
        umbrella_stall(f"umb{k}", 5.15, yy, srng)

    finalize()


def make_mats():
    mats = []
    for name in ("paper_a", "paper_b"):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1, 1, 1, 1)
        em.inputs["Strength"].default_value = 1.0
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(em.outputs[0], out.inputs[0])
        m.diffuse_color = (1, 1, 1, 1)
        mats.append(m)
    return mats


def finalize():
    scene = bpy.context.scene
    colls = {}
    for c in C.CLASSES + ["occluders"]:
        col = bpy.data.collections.new(c)
        scene.collection.children.link(col)
        colls[c] = col
    mats = make_mats()
    n_obj = 0
    for b in BUILDERS.values():
        if len(b.bm.faces) == 0 and len(b.bm.edges) == 0:
            b.bm.free()
            continue
        bmesh.ops.recalc_face_normals(b.bm, faces=b.bm.faces[:])
        me = bpy.data.meshes.new(b.name)
        b.bm.to_mesh(me)
        b.bm.free()
        me.materials.append(mats[0])
        me.materials.append(mats[1])
        if b.smooth:
            for p in me.polygons:
                p.use_smooth = True
        ob = bpy.data.objects.new(b.name, me)
        colls[b.coll].objects.link(ob)
        ob["line_class"] = b.cls
        ob["feature"] = b.feat
        ob["bake_mode"] = "smooth" if (b.smooth and b.mode == "edges") else b.mode
        ob["fill"] = int(b.fill)
        for k, v in b.props.items():
            ob[k] = v
        n_obj += 1
    os.makedirs(C.OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=C.BLEND, compress=True)
    nv = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
    nf = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"[build_block] {n_obj} objects, {nv} verts, {nf} faces -> {C.BLEND}")


if __name__ == "__main__":
    build()

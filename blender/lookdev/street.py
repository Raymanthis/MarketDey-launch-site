"""Buildings, compound walls, the street section, poles and wires (Blender Z-up, street along +Y).

Ported from blender/spike/build_block.py with the clean-geometry rules from geo.py:
 * every building is ONE union object (shell + plinth + pilasters + bands + frames + sills +
   hoods + balconies + shutters + canopy + signboards), so each visible edge exists once;
 * glass is separate, unlined, slightly behind the frame face;
 * grille bars, balusters, gate bars, razor wire and wires are thin dark ink geometry;
 * slats, corrugations, joints and block courses are material line textures;
 * anything that sits on a surface floats 2 mm above it, so its base edge is visible exactly
   once and never z-fights with the surface below.
"""
import math
import random

from mathutils import Matrix, Vector

import geo
from geo import facade_frame, get

FL = 3.2          # storey height
BASE = 0.15       # walkway level
LIFT = 0.002      # gap above a supporting surface
WALK_IN, WALK_OUT = 4.1, 9.0   # walkway runs under the building fronts so they sit on it
R = random.Random(11)

WALL_TONES = ["wall", "wall", "wall_b", "wall_c", "wall_b", "wall_d"]
# called as SIGN_HOOK(fa, a0, a1, h0, h1, d_face) for every signboard (production adds lettering)
SIGN_HOOK = None


class Fa:
    """Facade-local builder: a along the wall, d out of the wall, h up (origin at the base)."""

    def __init__(s, tag, M, coll="lines", wall="wall", axis="y"):
        s.M, s.M3 = M, M.to_3x3()
        s.tag = tag
        s.wall = wall
        # corrugation / sheet texture direction for sheets running perpendicular to the wall
        s.sheet = "sheet_y" if axis == "y" else "sheet_x"
        s.S = get(tag + "_s", coll, union=True)          # the one solid
        s.G = get(tag + "_g", "nolines")                 # glass
        s.K = get(tag + "_k", "nolines")                 # ink geometry
        s.P = get(tag + "_p", "fine", smooth=True)       # pipes, round bits

    def box(s, b, lo, hi, mat=None):
        b.box(lo, hi, s.M, mat or s.wall)

    def w(s, p):
        return s.M @ Vector(p)

    def bar(s, p0, p1, w=0.014, mat="ink"):
        s.K.seg_box(s.w(p0), s.w(p1), w, mat=mat)

    def glass(s, a0, h0, a1, h1, d=0.025, mat="glass"):
        s.G.quad_uv([s.w((a0, d, h0)), s.w((a1, d, h0)), s.w((a1, d, h1)), s.w((a0, d, h1))], mat)

    # ---------------------------------------------------------------- windows
    def grille(s, a0, h0, a1, h1, kind="bars"):
        d = 0.09
        e = 0.03
        for (p, q) in (((a0 - e, d, h0 - e), (a1 + e, d, h0 - e)), ((a0 - e, d, h1 + e), (a1 + e, d, h1 + e)),
                       ((a0 - e, d, h0 - e), (a0 - e, d, h1 + e)), ((a1 + e, d, h0 - e), (a1 + e, d, h1 + e))):
            s.bar(p, q, 0.022)
        if kind == "bars":
            n = max(2, int((a1 - a0) / 0.12))
            for i in range(1, n):
                a = a0 + (a1 - a0) * i / n
                s.bar((a, d, h0 - e), (a, d, h1 + e), 0.014)
            for k in (0.34, 0.67):
                h = h0 + (h1 - h0) * k
                s.bar((a0 - e, d + 0.012, h), (a1 + e, d + 0.012, h), 0.012)
        else:  # diamond lattice
            n = max(2, int((a1 - a0) / 0.3))
            step = (a1 - a0) / n
            hh = h1 - h0
            for i in range(-int(hh / step) - 1, n + 1):
                for sgn in (1, -1):
                    pa, ph = a0 + i * step, h0
                    qa, qh = a0 + i * step + sgn * hh, h1
                    t0, t1 = 0.0, 1.0
                    da = qa - pa
                    for lim, lower in ((a0, True), (a1, False)):
                        if abs(da) < 1e-9:
                            continue
                        t = (lim - pa) / da
                        if (da > 0) == lower:
                            t0 = max(t0, t)
                        else:
                            t1 = min(t1, t)
                    if t1 - t0 < 0.03:
                        continue
                    A = (pa + da * t0, d + (0.006 if sgn > 0 else -0.006), ph + (qh - ph) * t0)
                    B = (pa + da * t1, d + (0.006 if sgn > 0 else -0.006), ph + (qh - ph) * t1)
                    s.bar(A, B, 0.012)
            s.bar((a0 - e, d, (h0 + h1) / 2), (a1 + e, d, (h0 + h1) / 2), 0.014)

    def window(s, a0, h0, ww, wh, kind="casement", grille=None, sunshade=True):
        a1, h1, t = a0 + ww, h0 + wh, 0.07
        S = s.S
        S.frame(s.M, a0, h0, a1, h1, t, 0.0, 0.06, "trim")
        s.box(S, (a0 - 0.08, 0.0, h0 - 0.09), (a1 + 0.08, 0.14, h0 + 0.01), "trim")   # sill
        if kind == "casement":
            npan = 3 if ww > 1.5 else 2
            for i in range(1, npan):
                a = a0 + ww * i / npan
                s.box(S, (a - 0.025, 0, h0 + t - 0.01), (a + 0.025, 0.045, h1 - t + 0.01), "trim")
            ht = h1 - 0.42
            s.box(S, (a0 + t - 0.01, 0, ht - 0.025), (a1 - t + 0.01, 0.045, ht + 0.025), "trim")
            s.glass(a0 + t, h0 + t, a1 - t, h1 - t)
        elif kind == "louvre":
            am = (a0 + a1) / 2
            s.box(S, (am - 0.03, 0, h0 + t - 0.01), (am + 0.03, 0.045, h1 - t + 0.01), "trim")
            s.glass(a0 + t, h0 + t, a1 - t, h1 - t, mat="glass_louvre")
        elif kind == "door":
            am = (a0 + a1) / 2
            s.box(S, (am - 0.025, 0, h0 + t - 0.01), (am + 0.025, 0.045, h1 - t + 0.01), "trim")
            s.box(S, (a0 + t - 0.01, 0, h0 + 0.95), (a1 - t + 0.01, 0.045, h0 + 1.02), "trim")
            # panelled lower leaves (solid), glazed upper leaves
            s.box(S, (a0 + t - 0.005, 0, h0 + t - 0.005), (a1 - t + 0.005, 0.02, h0 + 0.955), "wall_d")
            s.glass(a0 + t, h0 + 1.02, a1 - t, h1 - t)
        if grille:
            s.grille(a0 + 0.04, h0 + 0.04 if kind != "door" else h0 + 1.04, a1 - 0.04, h1 - 0.04, grille)
        if sunshade:
            s.box(S, (a0 - 0.22, 0, h1 + 0.1), (a1 + 0.22, 0.44, h1 + 0.2), s.wall)
            s.box(S, (a0 - 0.22, 0.38, h1 + 0.03), (a1 + 0.22, 0.44, h1 + 0.11), s.wall)

    # ---------------------------------------------------------------- balcony
    def balcony(s, a0, a1, hf, kind, bd=1.1):
        S = s.S
        s.box(S, (a0 - 0.12, -0.01, hf - 0.16), (a1 + 0.12, bd, hf + 0.08), s.wall)
        s.box(S, (a0 - 0.12, bd - 0.05, hf - 0.24), (a1 + 0.12, bd, hf - 0.15), s.wall)
        top = hf + 1.05
        if kind == "rail":
            for (pa, pd) in ((a0 - 0.12, bd - 0.06), (a1 + 0.06, bd - 0.06)):
                s.box(S, (pa, pd, hf + 0.07), (pa + 0.06, pd + 0.06, top + 0.01), "trim")
            s.box(S, (a0 - 0.12, bd - 0.07, top), (a1 + 0.12, bd + 0.01, top + 0.06), "trim")
            s.box(S, (a0 - 0.12, -0.01, top), (a0 - 0.06, bd - 0.06, top + 0.06), "trim")
            s.box(S, (a1 + 0.06, -0.01, top), (a1 + 0.12, bd - 0.06, top + 0.06), "trim")
            s.bar((a0 - 0.1, bd - 0.035, hf + 0.22), (a1 + 0.1, bd - 0.035, hf + 0.22), 0.03, "metal_dark")
            n = int((a1 - a0) / 0.12)
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                s.bar((a, bd - 0.035, hf + 0.08), (a, bd - 0.035, top), 0.016)
            for a in (a0 - 0.09, a1 + 0.09):
                m = int(bd / 0.12)
                for i in range(1, m):
                    dd = bd * i / m
                    s.bar((a, dd, hf + 0.08), (a, dd, top), 0.016)
        else:   # solid balustrade with pierced (dark) openings
            s.box(S, (a0 - 0.12, bd - 0.12, hf + 0.07), (a1 + 0.12, bd, top), s.wall)
            s.box(S, (a0 - 0.12, -0.01, hf + 0.07), (a0, bd - 0.1, top), s.wall)
            s.box(S, (a1, -0.01, hf + 0.07), (a1 + 0.12, bd - 0.1, top), s.wall)
            s.box(S, (a0 - 0.16, bd - 0.16, top - 0.01), (a1 + 0.16, bd + 0.04, top + 0.07), "trim")
            n = max(2, int((a1 - a0) / 0.5))
            for i in range(n):
                b0 = a0 + (a1 - a0) * i / n + 0.1
                b1 = a0 + (a1 - a0) * (i + 1) / n - 0.1
                s.box(S, (b0, bd - 0.005, hf + 0.35), (b1, bd + 0.012, top - 0.25), "breeze")

    # ---------------------------------------------------------------- shopfronts
    def shutter(s, a0, a1, h0, h1, dark=False):
        S = s.S
        s.box(S, (a0 - 0.07, -0.01, h0), (a0, 0.08, h1), "metal")
        s.box(S, (a1, -0.01, h0), (a1 + 0.07, 0.08, h1), "metal")
        s.box(S, (a0 - 0.1, -0.01, h1 - 0.02), (a1 + 0.1, 0.32, h1 + 0.32), "metal")      # roll box
        s.box(S, (a0 - 0.005, -0.01, h0), (a1 + 0.005, 0.035, h1), "shutter_dark" if dark else "shutter")
        s.box(S, (a0, -0.01, h0), (a1, 0.06, h0 + 0.07), "metal")                          # bottom rail
        am = (a0 + a1) / 2
        s.box(S, (am - 0.12, 0.03, h0 + 0.14), (am + 0.12, 0.07, h0 + 0.2), "metal_dark")  # handle
        s.box(S, (a0 + 0.25, 0.03, h0 + 0.06), (a0 + 0.36, 0.08, h0 + 0.16), "metal_dark")  # padlock hasp

    def glazed(s, a0, a1, h0, h1):
        S = s.S
        S.frame(s.M, a0, h0, a1, h1, 0.08, -0.01, 0.07, "metal")
        n = 3 if a1 - a0 > 2.4 else 2
        for i in range(1, n):
            a = a0 + (a1 - a0) * i / n
            s.box(S, (a - 0.035, -0.01, h0 + 0.07), (a + 0.035, 0.055, h1 - 0.07), "metal")
        ht = h1 - 0.5
        s.box(S, (a0 + 0.07, -0.01, ht - 0.03), (a1 - 0.07, 0.055, ht + 0.03), "metal")
        s.box(S, (a0 + 0.07, -0.01, h0 + 0.48), (a1 - 0.07, 0.055, h0 + 0.56), "metal")
        s.box(S, (a0 + 0.07, -0.01, h0 + 0.07), (a1 - 0.07, 0.02, h0 + 0.49), "wall_d")    # kick panel
        s.glass(a0 + 0.08, h0 + 0.56, a1 - 0.08, ht - 0.03, 0.02, "glass_shop")
        s.glass(a0 + 0.08, ht + 0.03, a1 - 0.08, h1 - 0.08, 0.02, "glass")

    def signboard(s, a0, a1, h0, h1, d):
        S = s.S
        s.box(S, (a0, d - 0.01, h0), (a1, d + 0.06, h1), "sign")
        S.frame(s.M, a0 - 0.03, h0 - 0.03, a1 + 0.03, h1 + 0.03, 0.05, d + 0.0, d + 0.085, "sign_frame")
        if SIGN_HOOK is not None:
            SIGN_HOOK(s, a0, a1, h0, h1, d + 0.062)

    def canopy(s, a0, a1, ch, cd, sign=True, posts=True):
        S = s.S
        prof = [(-0.01, ch + 0.02), (cd, ch - 0.26), (cd, ch - 0.33), (-0.01, ch - 0.05)]
        pts = [s.w((a0, d, h)) for (d, h) in prof]
        S.prism(pts, s.M3 @ Vector((a1 - a0, 0, 0)), s.sheet)
        # fascia board along the front edge
        s.box(S, (a0, cd - 0.02, ch - 0.48), (a1, cd + 0.03, ch - 0.24), s.wall)
        if sign:
            s.signboard(a0 + 0.15, a1 - 0.15, ch - 0.22, ch + 0.5, cd - 0.04)
        if posts:
            for a in (a0 + 0.15, a1 - 0.23):
                s.box(S, (a, cd - 0.13, -0.01), (a + 0.08, cd - 0.05, ch - 0.3), "metal")

    def ac_unit(s, a, h):
        S = s.S
        s.box(S, (a, 0.12, h), (a + 0.8, 0.44, h + 0.56), "ac")
        for aa in (a + 0.1, a + 0.62):
            s.box(S, (aa, -0.01, h - 0.06), (aa + 0.05, 0.42, h + 0.002), "metal")
        s.P.tube([s.w((a + 0.7, 0.2, h)), s.w((a + 0.7, 0.2, h - 0.4)), s.w((a + 0.7, 0.06, h - 0.55))], 0.012, n=6,
                 mat="metal")

    def drainpipe(s, a, H):
        pts = [s.w((a, 0.1, 0.0)), s.w((a, 0.1, H - 0.6)), s.w((a, 0.25, H - 0.3)), s.w((a, 0.25, H + 0.15))]
        s.P.tube(pts, 0.05, n=10, mat="metal")
        h = 1.4
        while h < H - 0.8:
            s.box(s.S, (a - 0.07, -0.01, h), (a + 0.07, 0.07, h + 0.04), "metal")
            h += 1.6


def gable_roof(fa, W, Dp, H, rise, over=0.45):
    """Pitched roof spanning a in [0, W], ridge parallel to the facade (one closed prism)."""
    prof = [(over, H - 0.05), (-Dp / 2, H + rise), (-Dp - over, H - 0.05), (-Dp - over, H - 0.2),
            (-Dp / 2, H + rise - 0.15), (over, H - 0.2)]
    pts = [fa.w((-0.3, d, h)) for (d, h) in prof]
    fa.S.prism(pts, fa.M3 @ Vector((W + 0.6, 0, 0)), fa.sheet)
    fa.box(fa.S, (-0.3, over - 0.05, H - 0.34), (W + 0.3, over + 0.03, H - 0.04), "trim")    # fascia
    fa.P.cyl(fa.w((-0.32, -Dp / 2, H + rise + 0.03)), fa.w((W + 0.32, -Dp / 2, H + rise + 0.03)), 0.08, n=8,
             mat="metal")


def building(tag, side, y0, W, floors, setback, rng, Dp=12.0, side_walls=(), roof=None):
    xf = 6.0 + setback
    if side < 0:
        M = facade_frame((-xf, y0 + W, BASE + LIFT), (1, 0, 0))
    else:
        M = facade_frame((xf, y0, BASE + LIFT), (-1, 0, 0))
    info = building_at(tag, M, W, floors, Dp, rng, roof=roof)
    for sw in side_walls:
        side_facade(tag + "_sw", side, xf, y0, W, Dp, floors, sw, rng, info["fa"].wall)
    info.update(side=side, y0=y0, xf=xf)
    return info


# extra facade clutter, raised by production (AC units per floor, satellite dishes, tiles)
CLUTTER = {"ac": (0, 2), "dish": 0.0, "tiles": 0.0, "open_roof": 0.0}


def building_at(tag, M, W, floors, Dp, rng, roof=None, detail=True):
    """A 2-4 storey street building whose facade frame is M (a along the wall, d out, h up), body
    behind the facade (d < 0). detail=False gives the plain massing used for back rows."""
    fa = Fa(tag, M, wall=rng.choice(WALL_TONES))
    H = floors * FL
    if not detail:
        S = fa.S
        fa.box(S, (0, -Dp, 0), (W, 0, H + 0.9))
        fa.box(S, (-0.06, -0.25, H + 0.89), (W + 0.06, 0.08, H + 1.0), "trim")
        for f in range(1, floors):
            fa.box(S, (-0.05, -0.01, f * FL - 0.1), (W + 0.05, 0.1, f * FL + 0.08), "trim")
        for f in range(floors):
            nb = max(1, int(W / 3.0))
            for i in range(nb):
                ac = (i + 0.5) * W / nb
                S.frame(M, ac - 0.6, f * FL + 0.9, ac + 0.6, f * FL + 2.2, 0.07, -0.01, 0.05, "trim")
                fa.glass(ac - 0.53, f * FL + 0.97, ac + 0.53, f * FL + 2.13, 0.02, "glass_louvre")
        return dict(tag=tag, W=W, H=H, top=H + 0.9, Dp=Dp, roof="flat", M=M, fa=fa)
    roof = roof or ("pitched" if floors == 2 and rng.random() < 0.65 else "flat")
    st = dict(
        shop=rng.random() < 0.82, canopy=rng.random() < 0.75,
        win=rng.choice(["casement", "louvre", "mixed", "mixed"]),
        grille=rng.random() < 0.8, gkind=rng.choice(["bars", "bars", "diamond"]),
        sunshade=rng.random() < 0.65,
        balc=[f for f in range(1, floors) if rng.random() < 0.5], bkind=rng.choice(["rail", "solid"]),
        breeze=rng.random() < 0.5, ac=rng.randint(0, 2), blade=rng.random() < 0.35,
    )
    top = H + (0.95 if roof == "flat" else 0.0)
    S = fa.S
    fa.box(S, (0, -Dp, 0), (W, 0, top))
    fa.box(S, (-0.03, -0.01, 0), (W + 0.03, 0.06, 0.4), "plinth")
    fa.box(S, (0, -0.01, 0.39), (0.28, 0.08, H), fa.wall)
    fa.box(S, (W - 0.28, -0.01, 0.39), (W, 0.08, H), fa.wall)
    for f in range(1, floors):
        fa.box(S, (-0.06, -0.01, f * FL - 0.12), (W + 0.06, 0.14, f * FL + 0.1), "trim")
    if roof == "flat":
        fa.box(S, (-0.1, -0.01, H - 0.12), (W + 0.1, 0.18, H + 0.1), "trim")
        fa.box(S, (-0.06, -0.25, top - 0.01), (W + 0.06, 0.08, top + 0.1), "trim")
        if st["breeze"]:
            fa.box(S, (0.5, -0.01, H + 0.22), (W - 0.5, 0.012, H + 0.78), "breeze")
    else:
        gable_roof(fa, W, Dp, H, rise=min(2.4, Dp * 0.2))
    # ---- ground floor
    ch = 2.75
    if st["shop"]:
        nb = max(1, round(W / 3.6))
        bw = W / nb
        for i in range(nb + 1):
            a = i * bw
            fa.box(S, (max(0, a - 0.15), -0.01, 0.39), (min(W, a + 0.15), 0.1, ch + 0.1), fa.wall)
        for i in range(nb):
            a0, a1 = i * bw + 0.25, (i + 1) * bw - 0.25
            k = rng.random()
            if k < 0.5:
                fa.shutter(a0, a1, 0.0, 2.4, dark=rng.random() < 0.3)
            elif k < 0.7:
                fa.shutter(a0, a1, 1.55, 2.4)
                fa.glazed(a0 + 0.1, a1 - 0.1, 0.0, 1.5)
            else:
                fa.glazed(a0, a1, 0.0, 2.5)
        if st["canopy"]:
            fa.canopy(0.0, W, ch + 0.25, rng.uniform(1.1, 1.6), sign=True, posts=rng.random() < 0.5)
        else:
            for i in range(nb):
                fa.signboard(i * bw + 0.3, (i + 1) * bw - 0.3, 2.8, 3.1, 0.1)
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
    if W > 9 and rng.random() < 0.6:
        fa.drainpipe(W / 2 + rng.uniform(-1, 1), H)
    n_ac = st["ac"] + rng.randint(*CLUTTER["ac"])
    for k in range(n_ac if floors > 1 else 0):
        f = rng.randint(1, floors - 1)
        nb = max(1, int(W / 2.9))
        bw = W / nb
        i = rng.randint(0, nb - 1)
        a = (i + 0.5) * bw + min(1.8, bw * 0.58) / 2 + 0.15
        if a + 0.8 < W - 0.3:
            fa.ac_unit(a, f * FL + 0.5)
    if st["blade"] and floors > 2:
        a = 0.4
        fa.box(S, (a - 0.04, -0.01, FL + 0.6), (a + 0.04, 1.3, FL + 0.66), "metal")
        fa.box(S, (a - 0.05, 0.25, FL + 0.66), (a + 0.05, 1.25, FL + 2.3), "sign")
    if roof == "flat" and rng.random() < CLUTTER["dish"]:
        dish(fa, W * rng.uniform(0.2, 0.8), -1.2, top + 0.1)
    if rng.random() < CLUTTER["tiles"]:
        for i in range(max(1, round(W / 3.6)) + 1):
            a = i * W / max(1, round(W / 3.6))
            fa.box(S, (max(0, a - 0.16), -0.01, 0.0), (min(W, a + 0.16), 0.115, 2.85), "tile")
    return dict(tag=tag, W=W, H=H, top=top, Dp=Dp, roof=roof, M=M, fa=fa)


def dish(fa, a, d, h):
    """Satellite dish on a short mast (dish facing up-and-out)."""
    fa.P.cyl(fa.w((a, d, h)), fa.w((a, d, h + 1.0)), 0.025, n=8, mat="metal")
    c = fa.w((a, d + 0.25, h + 1.15))
    n = (fa.M3 @ Vector((0, 0.8, 0.6))).normalized()
    u = n.orthogonal().normalized()
    v = n.cross(u)
    rings = []
    for (r, dz) in ((0.02, -0.12), (0.25, -0.07), (0.42, 0.0), (0.43, 0.02)):
        rings.append([c + n * dz + (u * math.cos(2 * math.pi * i / 20) + v * math.sin(2 * math.pi * i / 20)) * r
                      for i in range(20)])
    fa.P.loft(rings, True, "trim")
    fa.P.seg_box(c, c + n * 0.45, 0.02, mat="metal")


def side_facade(tag, side, xf, y0, W, Dp, floors, which, rng, wall):
    """Windows on the gable wall facing -Y (near) or +Y (far). Joins the building's own union
    object via a shared builder name so frames fuse into the shell."""
    if which == "near":
        M = facade_frame((-xf, y0, BASE + LIFT), (0, -1, 0)) if side < 0 else facade_frame((xf + Dp, y0, BASE + LIFT), (0, -1, 0))
    else:
        M = facade_frame((-xf - Dp, y0 + W, BASE + LIFT), (0, 1, 0)) if side < 0 else facade_frame((xf, y0 + W, BASE + LIFT), (0, 1, 0))
    base_tag = tag[:-3]
    fa = Fa(base_tag, M, wall=wall, axis="x")
    for f in range(1, floors):
        fa.box(fa.S, (0, -0.01, f * FL - 0.1), (Dp, 0.08, f * FL + 0.08), "trim")
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
    M = facade_frame((-xf, yb, BASE + LIFT), (1, 0, 0)) if side < 0 else facade_frame((xf, ya, BASE + LIFT), (-1, 0, 0))
    bare = rng.random() < 0.5
    fa = Fa(tag, M, wall="block" if bare else rng.choice(["wall_b", "wall_c"]))
    S = fa.S
    hw = 2.1
    coil = rng.random() < 0.6
    gate = W > 5.5
    g0, g1 = (W / 2 - 1.6, W / 2 + 1.6) if gate else (W, W)
    for (s0, s1) in ((0, g0), (g1, W)):
        if s1 - s0 > 0.2:
            fa.box(S, (s0, -0.2, 0), (s1, 0, hw))
            fa.box(S, (s0 - 0.03, -0.24, hw - 0.01), (s1 + 0.03, 0.04, hw + 0.08), "trim")
            if not bare:
                fa.box(S, (s0, -0.01, 0), (s1, 0.015, 0.45), "plinth")
            if coil:
                n = int((s1 - s0) / 0.03)
                pts = []
                for i in range(n + 1):
                    t = i / max(1, n)
                    ph = (s1 - s0) * t / 0.16 * 2 * math.pi
                    pts.append(fa.w((s0 + (s1 - s0) * t + 0.05 * math.sin(ph), -0.1 + 0.2 * math.cos(ph),
                                     hw + 0.32 + 0.2 * math.sin(ph))))
                fa.K.tube(pts, 0.004, n=4, caps=True, mat="wire")
                for a in [s0 + 0.2 + k * 2.5 for k in range(int((s1 - s0) / 2.5) + 1)]:
                    if a < s1:
                        fa.bar((a, -0.1, hw + 0.08), (a, -0.1, hw + 0.55), 0.012)
    piers = [0.0, W] + ([g0, g1] if gate else [])
    n = int(W / 3.0)
    piers += [W * i / max(1, n) for i in range(1, n)]
    for a in sorted(set(round(p, 3) for p in piers)):
        if gate and g0 + 0.2 < a < g1 - 0.2:
            continue
        fa.box(S, (a - 0.2, -0.3, 0), (a + 0.2, 0.08, hw + 0.3), "wall" if bare else fa.wall)
        fa.box(S, (a - 0.25, -0.35, hw + 0.29), (a + 0.25, 0.13, hw + 0.38), "trim")
    if gate:
        for (s0, s1) in ((g0 + 0.2, W / 2 - 0.02), (W / 2 + 0.02, g1 - 0.2)):
            S.frame(M, s0, 0.05, s1, hw + 0.1, 0.06, -0.11, -0.05, "metal_dark")
            fa.box(S, (s0 + 0.05, -0.11, 0.98), (s1 - 0.05, -0.05, 1.04), "metal_dark")
            fa.box(S, (s0 + 0.05, -0.1, 0.1), (s1 - 0.05, -0.085, 0.98), "metal_dark")    # sheet lower half
            n = int((s1 - s0) / 0.12)
            for i in range(1, n):
                aa = s0 + (s1 - s0) * i / n
                fa.bar((aa, -0.08, 1.04), (aa, -0.08, hw + 0.06), 0.016)
                fa.bar((aa, -0.08, hw + 0.06), (aa, -0.08, hw + 0.28), 0.012)
    if house and W > 4.0:
        Wb = W - 1.2
        hb = Fa(tag + "h", M @ Matrix.Translation((0.6, -4.5, 0)), wall=rng.choice(WALL_TONES))
        hb.box(hb.S, (0, -9, 0), (Wb, 0, 3.0))
        gable_roof(hb, Wb, 9, 3.0, 1.8, over=0.6)
        nb = max(1, int(Wb / 3.0))
        for i in range(nb):
            hb.window((i + 0.5) * Wb / nb - 0.6, 1.0, 1.2, 1.2, "louvre", grille="bars", sunshade=False)


# ======================================================================================
# street section
# ======================================================================================

def street(y_start=-12.0, y_end=132.0):
    S = get("road_s", "lines", union=True)
    Mk = get("road_marks", "fine")
    yb = y_end - 9
    S.box((-3.5, y_start, -0.3), (3.5, y_end, 0.0), mat="road")
    S.box((-40, y_end - 9, -0.3), (40, y_end + 1.5, 0.0), mat="road")
    for side in (-1, 1):
        def X(x):
            return side * x
        S.box((X(3.5), y_start, -0.55), (X(3.66), yb, 0.22), mat="kerb")            # kerb wall
        S.box((X(3.95), y_start, -0.55), (X(4.1), yb, BASE), mat="kerb")            # back wall
        S.box((X(3.6), y_start, -0.62), (X(4.0), yb, -0.5), mat="channel")          # channel floor
        S.box((X(4.05), y_start, -0.3), (X(WALK_OUT), yb, BASE), mat="walk")        # walkway
        # culvert cover slabs at intervals
        y = y_start + 3
        while y < yb - 3:
            ln = R.choice([1.2, 1.8, 2.4, 3.6])
            S.box((X(3.6), y, BASE - 0.02), (X(4.02), y + ln, BASE + 0.1), mat="slab")
            y += ln + R.uniform(4, 10)
    # far walkways across the junction
    S.box((-40, y_end + 1.5, -0.3), (40, y_end + 4.5, BASE), mat="walk")
    # painted markings: single faces 3 mm above the road, outlined once by their borders
    z = 0.003

    def rect(x0, y0, x1, y1):
        Mk.poly([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], "paint")
    y = y_start
    while y < yb - 2:
        rect(-0.06, y, 0.06, y + 3.0)
        y += 7.0
    for side in (-1, 1):
        rect(side * 3.27 if side < 0 else 3.15, y_start, side * 3.15 if side < 0 else 3.27, yb)
    for i in range(9):
        x0 = -3.0 + i * 0.7
        rect(x0, 66, x0 + 0.42, 69.5)
    rect(-3.4, yb - 1.5, 3.4, yb - 1.2)
    # manholes
    for (mx, my) in ((-1.8, 14.0), (1.2, 52.0)):
        Mk.poly([(mx + math.cos(2 * math.pi * i / 32) * 0.42, my + math.sin(2 * math.pi * i / 32) * 0.42, z)
                 for i in range(32)], "metal_dark")
    # far ground (no lines), slightly below everything
    G = get("ground", "nolines")
    G.box((-200, -60, -0.5), (200, 400, -0.32), mat="ground")


# ======================================================================================
# poles and wires
# ======================================================================================

def pole(tag, x, y, h=9.2, transformer=False, lamp=False, cross_dir=1):
    S = get(tag + "_s", "lines", union=True, smooth=False)
    F = get(tag + "_f", "fine", smooth=True)
    S.cyl((x, y, BASE + LIFT), (x, y, h), 0.15, 0.1, n=16, mat="concrete")
    arms = {}
    for (z, ln) in ((h - 0.35, 2.4), (h - 1.25, 1.7)):
        S.box((x - ln / 2, y - 0.05, z - 0.06), (x + ln / 2, y + 0.05, z + 0.06), mat="metal")
        for sg in (-1, 1):
            S.seg_box((x, y + 0.075, z - 0.6), (x + sg * ln * 0.3, y + 0.075, z - 0.02), 0.04, 0.012, up=(0, 1, 0),
                      mat="metal")
        offs = [-ln / 2 + 0.12, -0.35, 0.35, ln / 2 - 0.12] if ln > 2 else [-ln / 2 + 0.12, ln / 2 - 0.12]
        tops = []
        for o in offs:
            px = x + o
            F.cyl((px, y, z + 0.06), (px, y, z + 0.13), 0.012, n=6, mat="metal")
            for k in range(3):
                zz = z + 0.13 + k * 0.05
                F.cyl((px, y, zz), (px, y, zz + 0.038), 0.055 - k * 0.008, 0.032, n=12, mat="trim")
            tops.append(Vector((px, y, z + 0.3)))
        arms[round(ln, 1)] = tops
    if transformer:
        F.cyl((x + 0.48, y, h - 3.2), (x + 0.48, y, h - 2.2), 0.32, n=20, mat="metal")
        F.cyl((x + 0.48, y, h - 2.2), (x + 0.48, y, h - 2.1), 0.34, 0.22, n=20, mat="metal")
        for k in range(3):
            F.cyl((x + 0.38 + k * 0.1, y, h - 2.1), (x + 0.38 + k * 0.1, y, h - 1.9), 0.03, n=8, mat="trim")
        S.box((x, y - 0.06, h - 3.32), (x + 0.24, y + 0.06, h - 3.2), mat="metal")
        S.box((x, y - 0.06, h - 2.42), (x + 0.24, y + 0.06, h - 2.3), mat="metal")
        # fuse box lower on the pole
        S.box((x - 0.2, y - 0.16, 2.2), (x + 0.2, y - 0.1, 2.75), mat="metal")
    if lamp:
        s = cross_dir
        pts = [(x, y, h - 2.0), (x + s * 0.6, y, h - 1.5), (x + s * 1.6, y, h - 1.25), (x + s * 2.2, y, h - 1.3)]
        F.tube(pts, 0.04, n=10, mat="metal")
        S.box((x + s * 2.0 - 0.3, y - 0.14, h - 1.45), (x + s * 2.0 + 0.3, y + 0.14, h - 1.3), mat="metal")
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


def wire(name, pts, r=0.005):
    """Cables are 10 mm tubes: thin enough that their two silhouettes fall within one pixel
    beyond ~4 m, so Freestyle inks each as a single hairline."""
    W = get("wires", "wires", smooth=True)
    W.tube(pts, r, n=6, caps=True, mat="wire")


# ======================================================================================
# street furniture
# ======================================================================================

def kiosk(tag, cx, cy, facing):
    """facing +1 opens toward +X (a left-walkway kiosk faces the road)."""
    M = facade_frame((cx + facing * 0.75, cy - facing * 1.0, BASE + LIFT), (facing, 0, 0))
    fa = Fa(tag, M, wall="wall_c")
    S = fa.S
    W, Dp, H = 2.0, 1.5, 2.3
    fa.box(S, (0, -Dp, 0), (W, 0, H))
    fa.box(S, (-0.05, -Dp - 0.05, 0), (W + 0.05, 0.05, 0.12), "plinth")
    S.frame(M, 0.12, 0.92, W - 0.12, 2.02, 0.08, -0.01, 0.06, "trim")
    fa.box(S, (0.12, -0.6, 0.93), (W - 0.12, 0.0, 1.0), "shop_dark")        # dark inside the hatch
    fa.box(S, (0.05, -0.01, 0.86), (W - 0.05, 0.46, 0.94), "wood")          # counter
    # goods on the counter (fine) and shelves seen inside (dark recess with lighter goods)
    rng = random.Random(9)
    G = get(tag + "_goods", "fine", smooth=True)
    for k in range(2):
        a = 0.3
        while a < W - 0.3:
            h = 1.3 + k * 0.32
            G.cyl(fa.w((a, -0.3, h)), fa.w((a, -0.3, h + rng.uniform(0.12, 0.2))), 0.035, n=8, mat="plastic")
            a += rng.uniform(0.1, 0.17)
    for k in range(2):
        fa.box(S, (0.13, -0.59, 1.28 + k * 0.32), (W - 0.13, -0.3, 1.3 + k * 0.32), "wood")
    for i in range(5):
        a = 0.3 + i * 0.32
        G.box(fa.w((a, 0.1, 0.94)), fa.w((a + 0.24, 0.34, 0.94 + rng.uniform(0.08, 0.2))), mat="plastic")
    # hinged flap awning on two struts
    S.prism([fa.w((-0.05, 0.0, 2.1)), fa.w((-0.05, 0.92, 1.86)), fa.w((-0.05, 0.92, 1.81)), fa.w((-0.05, 0.0, 2.05))],
            fa.M3 @ Vector((W + 0.1, 0, 0)), "metal")
    for a in (0.1, W - 0.1):
        fa.bar((a, 0.05, 1.3), (a, 0.88, 1.84), 0.02, "metal_dark")
    S.prism([fa.w((-0.25, 0.35, H + 0.12)), fa.w((-0.25, -Dp - 0.3, H + 0.02)),
             fa.w((-0.25, -Dp - 0.3, H - 0.03)), fa.w((-0.25, 0.35, H + 0.07))], fa.M3 @ Vector((W + 0.5, 0, 0)), "sheet_y")
    fa.signboard(0.1, W - 0.1, H + 0.2, H + 0.75, 0.15)
    for a in (0.3, W - 0.36):
        fa.box(S, (a, 0.15, H + 0.05), (a + 0.06, 0.21, H + 0.21), "metal")


def umbrella_stall(tag, x, y, rng):
    U = get(tag + "_u", "lines", smooth=False)
    F = get(tag + "_f", "fine", smooth=True)
    S = get(tag + "_s", "lines", union=True)
    K = get(tag + "_k", "nolines")
    z0 = BASE + LIFT
    apex = Vector((x, y, z0 + 2.5))
    n, r, rim_z = 8, 1.25, z0 + 2.02
    rim = [Vector((x + math.cos(2 * math.pi * i / n) * r, y + math.sin(2 * math.pi * i / n) * r, rim_z)) for i in range(n)]
    # canopy: one closed thin shell (top cone + valance + inner cone 12 mm below)
    inner = [p + Vector((0, 0, -0.012)) for p in rim]
    hem = [p + Vector((0, 0, -0.16)) for p in rim]
    hem_in = [p + (Vector((x, y, p.z)) - p).normalized() * 0.012 for p in hem]
    vs = U.verts([apex] + rim + hem + hem_in + inner + [apex + Vector((0, 0, -0.012))])
    A, Rm, Hm, Hi, In, Ai = 0, 1, 1 + n, 1 + 2 * n, 1 + 3 * n, 1 + 4 * n
    for i in range(n):
        j = (i + 1) % n
        mat = "umbrella" if i % 2 else "umbrella_b"
        U.faces(vs, [[A, Rm + i, Rm + j]], mat)
        U.faces(vs, [[Rm + i, Hm + i, Hm + j, Rm + j]], mat)
        U.faces(vs, [[Hm + i, Hi + i, Hi + j, Hm + j]], mat)
        U.faces(vs, [[Hi + i, In + i, In + j, Hi + j]], mat)
        U.faces(vs, [[Ai, In + j, In + i]], mat)
    for p in rim:
        K.tube([apex + Vector((0, 0, -0.03)), apex.lerp(p, 0.5) + Vector((0, 0, -0.06)), p + Vector((0, 0, -0.03))],
               0.006, n=4, mat="metal_dark")
    F.cyl((x, y, z0), (x, y, apex.z - 0.01), 0.022, n=8, mat="metal")
    F.cyl((x, y, z0), (x, y, z0 + 0.06), 0.2, 0.14, n=12, mat="metal_dark")
    tx, ty = x - 0.25, y
    S.box((tx - 0.45, ty - 0.6, z0 + 0.78), (tx + 0.45, ty + 0.6, z0 + 0.82), mat="wood")
    for (lx, ly) in ((-0.4, -0.55), (0.4, -0.55), (-0.4, 0.55), (0.4, 0.55)):
        S.box((tx + lx - 0.02, ty + ly - 0.02, z0), (tx + lx + 0.02, ty + ly + 0.02, z0 + 0.79), mat="wood")
    S.box((tx - 0.42, ty - 0.57, z0 + 0.25), (tx + 0.42, ty + 0.57, z0 + 0.27), mat="wood")
    for k in range(rng.randint(3, 5)):
        cx, cy = tx + rng.uniform(-0.28, 0.28), ty + rng.uniform(-0.42, 0.42)
        kind = rng.random()
        if kind < 0.4:      # tomato pyramid
            for j in range(4):
                for q in range(4 - j):
                    F.ellipsoid((cx + (q - (3 - j) / 2) * 0.07, cy, z0 + 0.86 + j * 0.06), 0.035, 0.035, 0.032, 8, 5,
                                mat="goods")
        elif kind < 0.75:   # basin
            F.cyl((cx, cy, z0 + 0.822), (cx, cy, z0 + 0.95), 0.14, 0.2, n=16, mat="basin")
        else:               # crate
            S.box((cx - 0.15, cy - 0.12, z0 + 0.82), (cx + 0.15, cy + 0.12, z0 + 1.0), mat="wood")
    S.box((x + 0.45, y - 0.15, z0 + 0.42), (x + 0.75, y + 0.15, z0 + 0.46), mat="plastic")
    for (lx, ly) in ((0.47, -0.13), (0.71, -0.13), (0.47, 0.11), (0.71, 0.11)):
        S.box((x + lx, y + ly, z0), (x + lx + 0.03, y + ly + 0.03, z0 + 0.43), mat="plastic")


def bench(tag, x, y, length=1.8, axis="y"):
    """Plank bench on block legs (seat 0.45 m), long side along the street."""
    S = get(tag, "lines", union=True)
    z0 = BASE + LIFT
    hl = length / 2
    S.box((x - 0.18, y - hl, z0 + 0.41), (x + 0.18, y + hl, z0 + 0.46), mat="wood")
    for yy in (y - hl + 0.15, y + hl - 0.15):
        S.box((x - 0.15, yy - 0.1, z0), (x + 0.15, yy + 0.1, z0 + 0.415), mat="block")


def water_tank(b_info, a, d):
    fa = b_info["fa"]
    top = b_info["H"]
    S = fa.S
    for (da, dd) in ((-0.8, -0.8), (0.8, -0.8), (0.8, 0.8), (-0.8, 0.8)):
        fa.box(S, (a + da - 0.06, d + dd - 0.06, top - 0.01), (a + da + 0.06, d + dd + 0.06, top + 2.01), "metal")
    for h in (top + 0.7, top + 1.4):
        fa.box(S, (a - 0.8, d - 0.84, h), (a + 0.8, d - 0.78, h + 0.05), "metal")
        fa.box(S, (a - 0.8, d + 0.78, h), (a + 0.8, d + 0.84, h + 0.05), "metal")
    fa.box(S, (a - 0.95, d - 0.95, top + 2.0), (a + 0.95, d + 0.95, top + 2.12), "metal")
    T = get(b_info["tag"] + "_tank", "lines", smooth=True)
    c0 = fa.w((a, d, top + 2.122))
    T.cyl(c0, c0 + Vector((0, 0, 1.55)), 0.82, n=28, mat="plastic")
    T.cyl(c0 + Vector((0, 0, 1.55)), c0 + Vector((0, 0, 1.75)), 0.82, 0.25, n=28, mat="plastic")
    T.cyl(c0 + Vector((0, 0, 1.75)), c0 + Vector((0, 0, 1.85)), 0.25, n=16, mat="plastic")
    fa.P.tube([c0 + fa.M3 @ Vector((0, 0.8, 0.15)), c0 + fa.M3 @ Vector((0, 1.1, 0.0)),
               fa.w((a, d + 1.1, top + 0.05)), fa.w((a, 0.2, top + 0.05)), fa.w((a, 0.25, top - 0.4))], 0.035, n=8,
              mat="metal")


def rooftop_sign(b_info, a0, a1):
    fa = b_info["fa"]
    top = b_info["top"]
    S = fa.S
    for a in (a0 + 0.3, a1 - 0.3, (a0 + a1) / 2):
        fa.box(S, (a - 0.05, -0.6, top - 0.01), (a + 0.05, -0.5, top + 1.2), "metal")
        S.seg_box(fa.w((a, -0.55, top + 1.15)), fa.w((a, -1.6, top + 0.01)), 0.05, 0.05, mat="metal")
    fa.box(S, (a0, -0.62, top + 1.1), (a1, -0.48, top + 2.6), "sign")
    S.frame(fa.M, a0 - 0.04, top + 1.06, a1 + 0.04, top + 2.64, 0.07, -0.47, -0.43, "sign_frame")


# ======================================================================================
# layout
# ======================================================================================

def layout_side(side, specs, y_from=-8.0, y_to=121.0, seed=0):
    rng = random.Random(100 + seed)
    total = sum(s[0] for s in specs)
    gap_avg = (y_to - y_from - total) / (len(specs) - 1)
    y = y_from
    out = []
    for (W, floors, setback) in specs:
        out.append((y, W, floors, setback))
        y += W + max(1.5, gap_avg + rng.uniform(-2.5, 2.5))
    last_end = out[-1][0] + out[-1][1]
    k = (y_to - y_from) / (last_end - y_from)
    return [(y_from + (y0 - y_from) * k, W, f, sb) for (y0, W, f, sb) in out]


def build_block():
    left = layout_side(-1, [(10, 2, 0.6), (14, 3, 0.0), (9, 2, 1.2), (16, 4, 0.3), (11, 3, 0.0), (12, 2, 1.0), (13, 3, 0.4)], seed=1)
    right = layout_side(1, [(12, 3, 0.2), (8, 2, 1.5), (15, 4, 0.0), (10, 3, 0.8), (13, 2, 0.0), (9, 3, 1.0), (14, 4, 0.5)], seed=2)
    infos = []
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
        M = facade_frame((x_end, 136.0, BASE + LIFT), (0, -1, 0))
        fa = Fa(f"F{k}", M, wall=rng.choice(WALL_TONES), axis="x")
        H = floors * FL
        fa.box(fa.S, (0, -10, 0), (W, 0, H + 0.9))
        fa.box(fa.S, (-0.1, -0.01, H - 0.12), (W + 0.1, 0.18, H + 0.1), "trim")
        for f in range(floors):
            nb = int(W / 2.9)
            for i in range(nb):
                ac = (i + 0.5) * W / nb
                if f == 0:
                    fa.shutter(ac - 1.1, ac + 1.1, 0, 2.4)
                else:
                    fa.window(ac - 0.7, f * FL + 0.9, 1.4, 1.4, rng.choice(["casement", "louvre"]), grille="bars")
            if f:
                fa.box(fa.S, (-0.06, -0.01, f * FL - 0.12), (W + 0.06, 0.14, f * FL + 0.1), "trim")
        fa.canopy(0, W, 3.0, 1.3, sign=True, posts=False)
    flat = [b for b in infos if b["roof"] == "flat"]
    tank_b = next(b for b in flat if b["side"] > 0 and 40 < b["y0"] < 90)
    water_tank(tank_b, tank_b["W"] * 0.65, -tank_b["Dp"] * 0.35)
    sign_b = next(b for b in flat if b["side"] < 0 and 50 < b["y0"] < 110 and b is not tank_b)
    rooftop_sign(sign_b, 1.0, min(sign_b["W"] - 1.0, 7.0))
    street()
    return infos

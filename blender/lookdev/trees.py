"""Trees for the look-development street: tropical almond (Terminalia catappa) and oil palm.

Almond: the pagoda habit that makes it recognisable — a straight trunk with whorls of almost
horizontal branches, each tier carrying a flat, lumpy mass of leaves. Each tier is a handful of
leaf clumps (displaced, flattened spheres) in the `foliage` collection: the tonal pass shades
them as soft grey volume (lit tops, dark undersides, cast shadows), and Freestyle draws only
their outer and overlapping contours with the scalloped foliage line style, so there is no
scribble. Trunk and limbs are inked normally; the limbs show below each tier.

Oil palm: a stout trunk with old frond bases, a crown of arching fronds. Rachises are thin
solids; leaflets are thin dark blades in `nolines`, so each leaflet is one tapered stroke.
"""
import math
import random

from mathutils import Vector, noise

from geo import get

BASE = 0.15


def _blob(b, c, rx, ry, rz, seed, nu=22, nv=12, amp=0.16, mat="foliage"):
    """A lumpy leaf clump: a flattened sphere displaced by low-frequency noise (smooth shaded)."""
    c = Vector(c)
    rings = []
    off = Vector((seed * 7.31, seed * 3.17, seed * 1.93))
    for j in range(1, nv):
        th = math.pi * j / nv
        z, rr = math.cos(th), math.sin(th)
        ring = []
        for i in range(nu):
            ph = 2 * math.pi * i / nu
            d = Vector((rr * math.cos(ph), rr * math.sin(ph), z))
            n = noise.noise(d * 1.6 + off) * 0.7 + noise.noise(d * 3.4 + off * 1.7) * 0.3
            k = 1.0 + amp * n
            # flatter underside, rounder top, like a leaf tier
            kz = 0.75 if z < 0 else 1.0
            ring.append(c + Vector((d.x * rx * k, d.y * ry * k, d.z * rz * k * kz)))
        rings.append(ring)
    b.loft(rings, True, mat, smooth=True)


def leaf_cards(C, c, rx, ry, rz, rng, n, size=0.17):
    """Small leaf quads scattered over a clump's surface, poking a little outward. Each card lies
    nearly tangent to the clump (normal close to the clump's own), so it takes the clump's tone
    instead of flashing light or dark; in the tonal pass the cards break the silhouette into
    leaves. They are never inked, but they occlude the clump outline, so it comes out broken."""
    c = Vector(c)
    for _ in range(n):
        # biased to the sides and top, where the silhouette is
        u, v = rng.uniform(0, 2 * math.pi), math.acos(rng.uniform(-0.45, 0.9))
        d = Vector((math.sin(v) * math.cos(u), math.sin(v) * math.sin(u), math.cos(v)))
        p = c + Vector((d.x * rx, d.y * ry, d.z * rz)) * rng.uniform(0.96, 1.08)
        nrm = Vector((d.x / rx, d.y / ry, d.z / rz)).normalized()
        nrm = (nrm + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.2, 0.35)))).normalized()
        a = nrm.orthogonal().normalized()
        rot = rng.uniform(0, 2 * math.pi)
        a = (a * math.cos(rot) + nrm.cross(a) * math.sin(rot)).normalized()
        b = nrm.cross(a).normalized()
        s = size * rng.uniform(0.7, 1.25)
        # a pointed leaf: long axis a, half width 0.3
        q = [p - a * s * 0.5, p + b * s * 0.16, p + a * s * 0.5, p - b * s * 0.16]
        C.poly(q, "foliage" if nrm.z > -0.1 else "foliage_dark")


def almond(tag, x, y, scale=1.0, seed=1):
    """Tropical almond: straight trunk, three irregular tiers of near-horizontal limbs, each
    carrying overlapping flat leaf masses, and a small crown on top."""
    rng = random.Random(seed)
    T = get(tag + "_trunk", "lines", smooth=True)
    Lb = get(tag + "_limbs", "fine", smooth=True)
    Fo = get(tag + "_leaves", "foliage", smooth=True)
    Lc = get(tag + "_cards", "nolines")
    top = 7.6 * scale
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))

    def axis(z):
        return Vector((x, y, BASE)) + lean * (z / top) ** 1.6 + Vector((0, 0, z))
    T.tube([axis(z) for z in (0.0, 0.8, 1.8, 3.0, 4.4, 5.8, 7.0, top)], 0.23 * scale, 0.06 * scale, n=14,
           mat="bark")
    T.cyl(axis(0.0) + Vector((0, 0, 0.002)), axis(0.35), 0.34 * scale, 0.24 * scale, n=14, mat="bark")
    tiers = [(2.9, 3.4), (4.5, 2.9), (5.9, 2.2), (7.0, 1.3)]
    for k, (z, reach) in enumerate(tiers):
        z = (z + rng.uniform(-0.15, 0.15)) * scale
        reach *= scale
        c = axis(z)
        nb = 5 if k < 3 else 3
        a0 = rng.uniform(0, 2 * math.pi)
        for i in range(nb):
            a = a0 + 2 * math.pi * i / nb + rng.uniform(-0.35, 0.35)
            d = Vector((math.cos(a), math.sin(a), 0))
            ln = reach * rng.uniform(0.7, 1.0)
            p1 = c + d * ln * 0.5 + Vector((0, 0, 0.1 * scale))
            p2 = c + d * ln * 0.95 + Vector((0, 0, 0.28 * scale))
            Lb.tube([c, p1, p2], 0.08 * scale * (1 - 0.15 * k), 0.022 * scale, n=8, mat="bark")
            for j, f in enumerate((0.45, 0.8)):
                side = d.cross(Vector((0, 0, 1))) * rng.uniform(-0.3, 0.3) * ln
                pc = c + d * ln * f + side + Vector((0, 0, (0.25 + rng.uniform(-0.1, 0.15)) * scale))
                r = rng.uniform(0.75, 1.15) * (1.15 - 0.15 * k) * scale
                rz = r * rng.uniform(0.3, 0.42)
                _blob(Fo, pc, r * 1.1, r * 0.95, rz, seed * 100 + k * 10 + i * 2 + j, amp=0.25,
                      mat="foliage" if (i + j) % 3 else "foliage_dark")
                leaf_cards(Lc, pc, r * 1.1, r * 0.95, rz, rng, int(260 * r * r), size=0.2 * scale)
            # a drooping clump hanging under the tier edge
            if rng.random() < 0.5:
                pc = c + d * ln * 0.95 + Vector((0, 0, -0.1 * scale))
                r = rng.uniform(0.45, 0.65) * scale
                _blob(Fo, pc, r, r, r * 0.55, seed * 1000 + k * 10 + i, amp=0.25, mat="foliage_dark")
                leaf_cards(Lc, pc, r, r, r * 0.55, rng, int(220 * r * r), size=0.2 * scale)
        rc = reach * 0.42
        _blob(Fo, c + Vector((0, 0, 0.3 * scale)), rc, rc, 0.35 * scale, seed * 100 + k * 10 + 9, amp=0.22)
        leaf_cards(Lc, c + Vector((0, 0, 0.3 * scale)), rc, rc, 0.35 * scale, rng, int(180 * rc * rc), size=0.2 * scale)


def rounded_tree(tag, x, y, scale=1.0, seed=5):
    """A broad rounded shade tree (neem / mango habit): short trunk forking into three limbs and
    a dome of overlapping leaf masses."""
    rng = random.Random(seed)
    T = get(tag + "_trunk", "lines", smooth=True)
    Fo = get(tag + "_leaves", "foliage", smooth=True)
    Lc = get(tag + "_cards", "nolines")
    base = Vector((x, y, BASE))
    fork = base + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 2.3 * scale))
    T.tube([base, base + Vector((0, 0, 1.2 * scale)), fork], 0.3 * scale, 0.2 * scale, n=14, mat="bark")
    T.cyl(base + Vector((0, 0, 0.002)), base + Vector((0, 0, 0.4)), 0.42 * scale, 0.3 * scale, n=14, mat="bark")
    ends = []
    for i in range(3):
        a = 2 * math.pi * i / 3 + rng.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        e = fork + d * 1.6 * scale + Vector((0, 0, 2.2 * scale))
        T.tube([fork, fork + d * 0.7 * scale + Vector((0, 0, 1.0 * scale)), e], 0.17 * scale, 0.07 * scale, n=10,
               mat="bark")
        ends.append(e)
    centre = fork + Vector((0, 0, 2.3 * scale))
    for k in range(16):
        u = rng.uniform(0, 2 * math.pi)
        v = rng.uniform(0.0, 1.25)
        d = Vector((math.sin(v) * math.cos(u), math.sin(v) * math.sin(u), math.cos(v)))
        pc = centre + Vector((d.x * 2.6, d.y * 2.6, d.z * 1.7)) * scale
        r = rng.uniform(1.0, 1.5) * scale
        _blob(Fo, pc, r, r, r * 0.75, seed * 50 + k, amp=0.28, mat="foliage" if d.z > 0.3 else "foliage_dark")
        leaf_cards(Lc, pc, r, r, r * 0.75, rng, int(220 * r * r), size=0.2 * scale)


def oil_palm(tag, x, y, h=8.0, seed=2):
    rng = random.Random(seed)
    T = get(tag + "_trunk", "lines", smooth=True)
    R = get(tag + "_rachis", "fine", smooth=True)
    Lf = get(tag + "_leaflets", "nolines")
    bend = Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.5, 0.5), 0))

    def axis(t):
        return Vector((x, y, BASE)) + bend * (t * t) + Vector((0, 0, h * t))
    pts = [axis(i / 10) for i in range(11)]
    T.tube(pts, 0.34, 0.3, n=16, mat="palm_trunk")
    # old frond bases spiralling up the upper trunk: short dark ink stubs, never outlined
    Kb = get(tag + "_stubs", "nolines")
    for k in range(46):
        t = 0.45 + 0.53 * k / 46
        a = k * 2.39996
        p = axis(t)
        d = Vector((math.cos(a), math.sin(a), 0))
        Kb.seg_box(p + d * 0.26, p + d * 0.44 + Vector((0, 0, 0.2)), 0.05, 0.03, mat="bark_dark")
    crown = axis(1.0)
    T.ellipsoid(crown + Vector((0, 0, 0.2)), 0.5, 0.5, 0.65, 14, 8, mat="palm")
    nf = 26
    for k in range(nf):
        az = k * 2.39996 + rng.uniform(-0.1, 0.1)
        elev = rng.uniform(-0.35, 0.9) if k > 4 else rng.uniform(0.9, 1.25)
        Lr = rng.uniform(3.4, 4.6)
        dvec = Vector((math.cos(az), math.sin(az), 0))
        spine = []
        for i in range(15):
            t = i / 14
            p = crown + Vector((0, 0, 0.35)) + dvec * (Lr * t * math.cos(elev * (1 - t * 0.8))) \
                + Vector((0, 0, Lr * t * math.sin(elev) * (1 - t * 0.6) - 1.5 * t * t))
            spine.append(p)
        R.tube(spine, 0.045, 0.01, n=6, mat="palm")
        side = dvec.cross(Vector((0, 0, 1))).normalized()
        for i in range(2, 14):
            p = spine[i]
            t = i / 14
            ln = 0.95 * math.sin(math.pi * min(1.0, t * 1.08)) + 0.2
            tang = (spine[i + 1] - spine[i - 1]).normalized()
            for sgn in (1, -1):
                for j in range(2):          # oil-palm leaflets come in irregular pairs/planes
                    q = p + tang * (0.06 * j)
                    up = 0.35 if j == 0 else -0.25
                    tip = q + (side * sgn * 0.85 + tang * 0.5 + Vector((0, 0, up - 0.35))).normalized() * ln \
                        * rng.uniform(0.85, 1.05)
                    w = side * 0.018
                    n = (tip - q).cross(Vector((0, 0, 1)))
                    if n.length < 1e-6:
                        continue
                    wv = n.normalized() * 0.02
                    mid = q.lerp(tip, 0.45) + Vector((0, 0, 0.04))
                    Lf.poly([q - wv * 0.4, mid - wv, tip, mid + wv, q + wv * 0.4], "palm")


def build_all():
    almond("almond0", -4.9, 47.5, 1.0, seed=3)
    rounded_tree("neem0", 5.6, 24.0, 0.85, seed=5)
    almond("almond1", 5.25, 88.0, 0.95, seed=7)
    almond("almond2", -5.2, 103.0, 0.85, seed=11)
    oil_palm("palm0", 5.5, 57.0, 8.4, seed=2)
    oil_palm("palm1", -5.5, 116.0, 9.0, seed=5)
    oil_palm("palm2", -5.7, 53.0, 9.4, seed=8)

"""Mesh builder for the look-development street.

Every builder (MB) becomes one Blender object in one of the line collections:

  lines     solid forms: silhouettes, borders and creases are inked by Freestyle
  fine      small solids (pipes, insulators, wheels): inked with the fine line style
  foliage   canopy masses: inked with the scalloped foliage style
  nolines   glass, painted markings, ink-geometry (grille bars, wires, balusters), ground:
            shaded in the tonal pass only, never inked

Two rules keep every visible edge drawn exactly once:

  * union=True builders are made of closed boxes/prisms that may overlap freely (a frame on a
    wall, a sill under a frame, a pilaster on a shell). finalize() fuses each one into a single
    manifold with Geometry Nodes Mesh Boolean (Manifold solver, every loose part as its own
    operand), so there are no coplanar faces, no hidden internal faces and no z-fighting
    slivers. Coplanar splits left by the boolean are 180 degree "creases" Freestyle ignores.
  * Thin things that an illustrator draws as a single stroke (grille bars, balusters, wires,
    razor wire, palm leaflets) are real thin geometry in `nolines` with a dark material, so the
    tonal pass draws them as one anti-aliased dark stroke whose width follows perspective.
    Repeating surface lines (shutter slats, paving joints, corrugations, block courses) are
    procedural line textures in the materials, faded with distance.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

BOXF = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
BUILDERS = {}
COLLECTIONS = ("lines", "fine", "foliage", "nolines")


class MB:
    def __init__(s, name, coll="lines", smooth=False, union=False, props=None, subsurf=0):
        assert coll in COLLECTIONS, coll
        s.name, s.coll, s.smooth, s.union, s.subsurf = name, coll, smooth, union, subsurf
        s.props = props or {}
        s.bm = bmesh.new()
        s.uv = s.bm.loops.layers.uv.new("UVMap")
        s.crease = None
        s.mats = []
        s.marks = []   # (v0, v1) vertex pairs to mark as Freestyle edges after building

    # ------------------------------------------------------------------ materials
    def m(s, name):
        if name not in s.mats:
            s.mats.append(name)
        return s.mats.index(name)

    # ------------------------------------------------------------------ primitives
    def verts(s, pts):
        return [s.bm.verts.new(tuple(p)) for p in pts]

    def faces(s, vs, idxs, mat="wall", smooth=None, uvs=None):
        mi = s.m(mat)
        out = []
        for k, f in enumerate(idxs):
            try:
                fc = s.bm.faces.new([vs[i] for i in f])
            except ValueError:
                continue
            fc.material_index = mi
            fc.smooth = s.smooth if smooth is None else smooth
            if uvs is not None:
                for lp, uv in zip(fc.loops, uvs[k]):
                    lp[s.uv].uv = uv
            out.append(fc)
        return out

    def box(s, lo, hi, M=None, mat="wall"):
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

    def obox(s, center, ax, ay, az, M=None, mat="wall"):
        c, ax, ay, az = Vector(center), Vector(ax), Vector(ay), Vector(az)
        pts = []
        for sz in (-1, 1):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pts.append(c + ax * sx + ay * sy + az * sz)
        if M is not None:
            pts = [M @ p for p in pts]
        s.faces(s.verts(pts), BOXF, mat)

    def seg_box(s, p0, p1, w, h=None, up=(0, 0, 1), mat="ink"):
        """Square/rect bar from p0 to p1 (used for thin ink geometry)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        if d.length < 1e-5:
            return
        t = d.normalized()
        u = Vector(up)
        if abs(t.dot(u)) > 0.95:
            u = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
        a = t.cross(u).normalized()
        b = a.cross(t).normalized()
        hw, hh = w / 2, (h if h is not None else w) / 2
        c = (p0 + p1) / 2
        s.obox(c, a * hw, t * (d.length / 2), b * hh, mat=mat)

    def poly(s, pts, mat="wall", uv=None):
        return s.faces(s.verts(pts), [list(range(len(pts)))], mat, uvs=[uv] if uv else None)

    def quad_uv(s, pts, mat="glass"):
        return s.poly(pts, mat, uv=[(0, 0), (1, 0), (1, 1), (0, 1)])

    def prism(s, pts, vec, mat="wall", caps=True):
        a = [Vector(p) for p in pts]
        b = [p + Vector(vec) for p in a]
        n = len(a)
        idx = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        if caps:
            idx += [list(range(n))[::-1], list(range(n, 2 * n))]
        s.faces(s.verts(a + b), idx, mat)

    def prism_lr(s, left, right, mat="wall"):
        n = len(left)
        idx = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        idx += [list(range(n))[::-1], list(range(n, 2 * n))]
        s.faces(s.verts(list(left) + list(right)), idx, mat)

    def loft(s, rings, caps=True, mat="wall", closed=True, smooth=None):
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
        return s.faces(vs, idx, mat, smooth=smooth)

    def cyl(s, p0, p1, r0, r1=None, n=12, caps=True, mat="wall"):
        p0, p1 = Vector(p0), Vector(p1)
        r1 = r0 if r1 is None else r1
        ax = (p1 - p0).normalized()
        u = ax.orthogonal().normalized()
        v = ax.cross(u)

        def ring(c, r):
            return [c + (u * math.cos(2 * math.pi * i / n) + v * math.sin(2 * math.pi * i / n)) * r for i in range(n)]
        s.loft([ring(p0, r0), ring(p1, r1)], caps, mat)

    def tube(s, pts, r0, r1=None, n=8, caps=True, mat="wall"):
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
            r = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
            rings.append([p + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r for k in range(n)])
        s.loft(rings, caps, mat)

    def ellipsoid(s, c, rx, ry, rz, nu=12, nv=8, mat="wall"):
        c = Vector(c)
        rings = []
        for j in range(1, nv):
            th = math.pi * j / nv
            z, rr = math.cos(th), math.sin(th)
            rings.append([c + Vector((rr * math.cos(2 * math.pi * i / nu) * rx, rr * math.sin(2 * math.pi * i / nu) * ry, z * rz))
                          for i in range(nu)])
        s.loft(rings, True, mat)

    def frame(s, M, a0, h0, a1, h1, t, d0, d1, mat="trim", tb=None):
        """Closed rectangular picture frame in facade-local (a, d, h) coordinates: one manifold
        (outer and inner rectangles, front, back and both reveals), so its corners are clean.
        tb: optional different thickness for the bottom rail."""
        tb = t if tb is None else tb
        o = [(a0, h0), (a1, h0), (a1, h1), (a0, h1)]
        i_ = [(a0 + t, h0 + tb), (a1 - t, h0 + tb), (a1 - t, h1 - t), (a0 + t, h1 - t)]
        P = lambda a, d, h: M @ Vector((a, d, h))  # noqa: E731
        vs = s.verts([P(a, d0, h) for a, h in o] + [P(a, d0, h) for a, h in i_] +
                     [P(a, d1, h) for a, h in o] + [P(a, d1, h) for a, h in i_])
        # 0-3 outer back, 4-7 inner back, 8-11 outer front, 12-15 inner front
        idx = []
        for k in range(4):
            k1 = (k + 1) % 4
            idx.append([8 + k, 8 + k1, 12 + k1, 12 + k])     # front ring
            idx.append([k1, k, 4 + k, 4 + k1])               # back ring
            idx.append([k, k1, 8 + k1, 8 + k])               # outer side
            idx.append([4 + k1, 4 + k, 12 + k, 12 + k1])     # inner reveal
        s.faces(vs, idx, mat)

    def mark(s, p0, p1):
        """Remember a polyline whose edges should be Freestyle edge-marked (exact vertices)."""
        s.marks.append((tuple(p0), tuple(p1)))


def get(name, coll="lines", smooth=False, union=False, props=None, subsurf=0):
    b = BUILDERS.get(name)
    if b is None:
        b = BUILDERS[name] = MB(name, coll, smooth, union, props, subsurf)
    return b


def facade_frame(origin, n):
    """Local frame: a along the wall, d out of the wall (normal n), h up. det = +1."""
    n = Vector(n).normalized()
    t = n.cross(Vector((0, 0, 1)))
    return Matrix(((t.x, n.x, 0, origin[0]),
                   (t.y, n.y, 0, origin[1]),
                   (t.z, n.z, 1, origin[2]),
                   (0, 0, 0, 1)))


def place(pos, heading):
    return Matrix.Translation(Vector(pos)) @ Matrix.Rotation(heading, 4, "Z")


# ----------------------------------------------------------------------------------------------
# finalize
# ----------------------------------------------------------------------------------------------
_UNION_NG = None


def union_group():
    global _UNION_NG
    if _UNION_NG is not None:
        return _UNION_NG
    ng = bpy.data.node_groups.new("union_islands", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    isl = ng.nodes.new("GeometryNodeInputMeshIsland")
    sp = ng.nodes.new("GeometryNodeSplitToInstances")
    sp.domain = "FACE"
    mb = ng.nodes.new("GeometryNodeMeshBoolean")
    mb.operation = "UNION"
    mb.solver = "MANIFOLD"
    ng.links.new(gi.outputs[0], sp.inputs["Geometry"])
    ng.links.new(isl.outputs["Island Index"], sp.inputs["Group ID"])
    ng.links.new(sp.outputs[0], mb.inputs["Mesh"])
    ng.links.new(mb.outputs[0], go.inputs[0])
    _UNION_NG = ng
    return ng


def apply_union(ob):
    md = ob.modifiers.new("union", "NODES")
    md.node_group = union_group()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.remove(md)
    ob.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)
    return me


def finalize(mats, scene=None):
    """Turn every builder into an object. `mats` maps material name -> bpy material."""
    scene = scene or bpy.context.scene
    colls = {}
    for c in COLLECTIONS:
        col = bpy.data.collections.get(c) or bpy.data.collections.new(c)
        if col.name not in scene.collection.children:
            scene.collection.children.link(col)
        colls[c] = col
    stats = {"objects": 0, "faces_in": 0, "faces_out": 0}
    for b in list(BUILDERS.values()):
        if len(b.bm.faces) == 0:
            b.bm.free()
            continue
        bmesh.ops.recalc_face_normals(b.bm, faces=b.bm.faces[:])
        stats["faces_in"] += len(b.bm.faces)
        me = bpy.data.meshes.new(b.name)
        b.bm.to_mesh(me)
        b.bm.free()
        for name in b.mats:
            me.materials.append(mats[name])
        ob = bpy.data.objects.new(b.name, me)
        colls[b.coll].objects.link(ob)
        if b.union:
            me = apply_union(ob)
        if b.subsurf:
            md = ob.modifiers.new("subsurf", "SUBSURF")
            md.levels = md.render_levels = b.subsurf
        if b.marks:
            mark_edges(ob, b.marks)
        for k, v in b.props.items():
            ob[k] = v
        stats["objects"] += 1
        stats["faces_out"] += len(ob.data.polygons)
    BUILDERS.clear()
    return stats


def mark_edges(ob, marks, tol=1e-4):
    """Freestyle-mark mesh edges whose two vertices both lie on one of the marked segments."""
    me = ob.data
    attr = me.attributes.get("freestyle_edge") or me.attributes.new("freestyle_edge", "BOOLEAN", "EDGE")
    segs = [(Vector(a), Vector(b)) for a, b in marks]

    def on(p, a, b):
        ab = b - a
        L = ab.length
        if L < 1e-9:
            return False
        t = (p - a).dot(ab) / (L * L)
        if t < -1e-3 or t > 1 + 1e-3:
            return False
        return (a + ab * t - p).length < tol
    for e in me.edges:
        p, q = me.vertices[e.vertices[0]].co, me.vertices[e.vertices[1]].co
        for a, b in segs:
            if on(p, a, b) and on(q, a, b):
                attr.data[e.index].value = True
                break

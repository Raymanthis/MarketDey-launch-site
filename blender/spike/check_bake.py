"""★0 sketch spike: read the baked line buffer back and sanity-check it.

    blender -b --factory-startup -P blender/spike/check_bake.py        (uses Blender's numpy)
    python3 blender/spike/check_bake.py                                 (any Python with numpy)

Prints count, bounds, per-class / per-feature counts, and writes to blender/spike/out/:
    bake-topdown.png            plan view of every segment (x right, -z up), coloured by class
    preview-bake-1440x900.png   perspective raster of the segments from camera frame 10,
    preview-bake-390x844.png    occluded by fills.glb (depth-tested), 1 px lines faded with distance
"""
import json
import math
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402


def load_lines():
    hdr = json.load(open(os.path.join(C.MEDIA, "lines.json")))
    raw = np.fromfile(os.path.join(C.MEDIA, "lines.bin"), dtype=np.uint8)
    assert hdr["stride"] == 14 and raw.size == hdr["count"] * 14, "size/stride mismatch"
    rec = raw.reshape(-1, 14)
    q = rec[:, :12].copy().view("<i2").reshape(-1, 6).astype(np.float64)
    cls, feat = rec[:, 12], rec[:, 13]
    mn = np.array(hdr["min"] * 2)
    mx = np.array(hdr["max"] * 2)
    P = mn + (q + 32768.0) / 65535.0 * (mx - mn)
    return hdr, P, cls, feat


def load_glb(path):
    data = open(path, "rb").read()
    magic, _ver, _len = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67
    off, js, binc = 12, None, None
    while off < len(data):
        ln, typ = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + ln]
        if typ == 0x4E4F534A:
            js = json.loads(chunk)
        elif typ == 0x004E4942:
            binc = chunk
        off += 8 + ln
    comp = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
    ncomp = {"SCALAR": 1, "VEC3": 3}

    def acc(i):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        dt = np.dtype(comp[a["componentType"]])
        n = a["count"] * ncomp[a["type"]]
        return np.frombuffer(binc, dtype=dt, count=n, offset=start).reshape(a["count"], -1)
    tris = []
    for node in js["nodes"]:
        if "mesh" not in node:
            continue
        for prim in js["meshes"][node["mesh"]]["primitives"]:
            pos = acc(prim["attributes"]["POSITION"]).astype(np.float64)
            idx = acc(prim["indices"]).reshape(-1).astype(np.int64)
            t = np.array(node.get("translation", [0, 0, 0]))
            tris.append((pos + t)[idx].reshape(-1, 3, 3))
    return np.concatenate(tris)


class Cam:
    def __init__(s, frame, W, H):
        s.pos = np.array(frame["pos"], float)
        f = np.array(frame["target"], float) - s.pos
        s.fwd = f / np.linalg.norm(f)
        r = np.cross(s.fwd, [0, 1, 0])
        s.right = r / np.linalg.norm(r)
        s.up = np.cross(s.right, s.fwd)
        s.W, s.H = W, H
        s.f = (H / 2) / math.tan(math.radians(C.FOV) / 2)

    def to_cam(s, p):
        d = p - s.pos
        return np.stack([d @ s.right, d @ s.up, d @ s.fwd], axis=-1)

    def proj(s, c):
        return np.stack([s.W / 2 + c[..., 0] / c[..., 2] * s.f, s.H / 2 - c[..., 1] / c[..., 2] * s.f], axis=-1)


NEAR = 0.1


def depth_buffer(cam, tris):
    W, H = cam.W, cam.H
    zb = np.full((H, W), np.inf)
    ct = cam.to_cam(tris)  # (n,3,3)
    for tri in ct:
        z = tri[:, 2]
        if (z < NEAR).all():
            continue
        polys = [tri]
        if (z < NEAR).any():   # clip against the near plane (Sutherland-Hodgman)
            out = []
            for i in range(3):
                a, b = tri[i], tri[(i + 1) % 3]
                ina, inb = a[2] >= NEAR, b[2] >= NEAR
                if ina:
                    out.append(a)
                if ina != inb:
                    t = (NEAR - a[2]) / (b[2] - a[2])
                    out.append(a + (b - a) * t)
            polys = [np.array([out[0], out[i], out[i + 1]]) for i in range(1, len(out) - 1)]
        for p in polys:
            s = cam.proj(p)
            x0, x1 = int(max(0, math.floor(s[:, 0].min()))), int(min(W - 1, math.ceil(s[:, 0].max())))
            y0, y1 = int(max(0, math.floor(s[:, 1].min()))), int(min(H - 1, math.ceil(s[:, 1].max())))
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = s
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
            w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
            w2 = 1 - w0 - w1
            m = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not m.any():
                continue
            iz = w0 / p[0, 2] + w1 / p[1, 2] + w2 / p[2, 2]
            z = 1.0 / np.where(m, iz, 1.0)
            sub = zb[y0:y1 + 1, x0:x1 + 1]
            np.minimum(sub, np.where(m, z, np.inf), out=sub)
    return zb


def raster_preview(P, cls, cam, zb, path):
    W, H = cam.W, cam.H
    a, b = cam.to_cam(P[:, :3]), cam.to_cam(P[:, 3:])
    keep = (a[:, 2] > NEAR) | (b[:, 2] > NEAR)
    a, b, cl = a[keep], b[keep], cls[keep]
    # clip to the near plane
    for (u, v) in ((a, b), (b, a)):
        m = u[:, 2] < NEAR
        t = (NEAR - u[m, 2]) / (v[m, 2] - u[m, 2])
        u[m] = u[m] + (v[m] - u[m]) * t[:, None]
    sa, sb = cam.proj(a), cam.proj(b)
    ln = np.linalg.norm(sb - sa, axis=1)
    vis = ((np.minimum(sa[:, 0], sb[:, 0]) < W) & (np.maximum(sa[:, 0], sb[:, 0]) >= 0)
           & (np.minimum(sa[:, 1], sb[:, 1]) < H) & (np.maximum(sa[:, 1], sb[:, 1]) >= 0))
    a, b, cl, ln = a[vis], b[vis], cl[vis], ln[vis]
    n = np.clip(np.ceil(ln * 1.5).astype(np.int64) + 1, 2, 6000)
    idx = np.repeat(np.arange(len(a)), n)
    start = np.repeat(np.cumsum(n) - n, n)
    t = (np.arange(idx.size) - start) / np.repeat(n - 1, n)
    pc = a[idx] + (b[idx] - a[idx]) * t[:, None]
    s = cam.proj(pc)
    px, py = np.floor(s[:, 0]).astype(np.int64), np.floor(s[:, 1]).astype(np.int64)
    inb = (px >= 0) & (px < W) & (py >= 0) & (py < H)
    px, py, z, c = px[inb], py[inb], pc[inb, 2], cl[idx][inb]
    zref = zb[py, px]
    visible = z <= zref * 1.004 + 0.04
    px, py, z, c = px[visible], py[visible], z[visible], c[visible]
    fade = np.clip((z - C.FADE_START) / (C.FADE_END - C.FADE_START), 0, 1)
    weight = np.array([1.0, 0.8, 0.55])[c]
    alpha = (1 - fade) * weight
    A = np.zeros((H, W))
    np.maximum.at(A, (py, px), alpha)
    paper, ink = np.array(C.PAPER, float), np.array(C.INK, float)
    img = paper[None, None, :] * (1 - A[..., None]) + ink[None, None, :] * A[..., None]
    C.write_png(path, np.clip(img, 0, 255).astype(np.uint8))
    return int(visible.sum())


def topdown(P, cls, path, scale=6.0):
    x0, x1, z0, z1 = -32.0, 32.0, -146.0, 12.0
    W, H = int((x1 - x0) * scale), int((z1 - z0) * scale)
    img = np.zeros((H, W, 3)) + np.array(C.PAPER, float)
    colours = np.array([[20, 20, 20], [40, 90, 200], [200, 90, 40]], float)
    for ci in (2, 1, 0):
        sel = P[cls == ci]
        if not len(sel):
            continue
        ax, az, bx, bz = sel[:, 0], sel[:, 2], sel[:, 3], sel[:, 5]
        ln = np.hypot(bx - ax, bz - az) * scale
        n = np.clip(np.ceil(ln).astype(np.int64) + 1, 2, 4000)
        idx = np.repeat(np.arange(len(sel)), n)
        start = np.repeat(np.cumsum(n) - n, n)
        t = (np.arange(idx.size) - start) / np.repeat(n - 1, n)
        x = ax[idx] + (bx[idx] - ax[idx]) * t
        z = az[idx] + (bz[idx] - az[idx]) * t
        px = ((x - x0) * scale).astype(np.int64)
        py = ((z - z0) * scale).astype(np.int64)
        m = (px >= 0) & (px < W) & (py >= 0) & (py < H)
        img[py[m], px[m]] = colours[ci]
    C.write_png(path, img.astype(np.uint8))


def main():
    hdr, P, cls, feat = load_lines()
    pts = P.reshape(-1, 3)
    print(f"[check] count {hdr['count']}  (lines.bin {hdr['count'] * 14} bytes)")
    print(f"[check] header bounds min {hdr['min']} max {hdr['max']}")
    print(f"[check] data bounds   min {np.round(pts.min(0), 3).tolist()} max {np.round(pts.max(0), 3).tolist()}")
    step = (np.array(hdr["max"]) - np.array(hdr["min"])) / 65535 * 1000
    print(f"[check] quantisation step (mm) x/y/z {np.round(step, 2).tolist()}")
    for i, c in enumerate(hdr["classes"]):
        print(f"[check]   class   {c:9s} {int((cls == i).sum()):7d}")
    for i, f in enumerate(hdr["features"]):
        print(f"[check]   feature {f:9s} {int((feat == i).sum()):7d}")
    seg_len = np.linalg.norm(P[:, :3] - P[:, 3:], axis=1)
    print(f"[check] segment length m: min {seg_len.min():.3f} median {np.median(seg_len):.3f} max {seg_len.max():.1f}")
    assert cls.max() < len(hdr["classes"]) and feat.max() < len(hdr["features"])
    os.makedirs(C.OUT, exist_ok=True)
    topdown(P, cls, os.path.join(C.OUT, "bake-topdown.png"))
    cam_frames = json.load(open(os.path.join(C.MEDIA, "camera.json")))
    assert len(cam_frames["frames"]) == C.N_FRAMES and cam_frames["fov"] == C.FOV
    tris = load_glb(os.path.join(C.MEDIA, "fills.glb"))
    print(f"[check] fills.glb triangles {len(tris)}; bounds min {np.round(tris.reshape(-1, 3).min(0), 2).tolist()} "
          f"max {np.round(tris.reshape(-1, 3).max(0), 2).tolist()}")
    fr = cam_frames["frames"][C.RENDER_FRAME]
    for (W, H) in ((1440, 900), (390, 844)):
        cam = Cam(fr, W, H)
        zb = depth_buffer(cam, tris)
        out = os.path.join(C.OUT, f"preview-bake-{W}x{H}.png")
        n = raster_preview(P, cls, cam, zb, out)
        print(f"[check] preview {W}x{H}: {n} visible samples -> {out}")


if __name__ == "__main__":
    main()

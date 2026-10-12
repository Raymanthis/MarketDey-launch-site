"""Shared constants and helpers for the ★0 sketch spike (Blender side).

Pure Python (+ optional numpy for the raster helpers) so it can be imported both from
Blender scripts and from plain Python.

Frames of reference (see docs/plans/sketch-spike-format.md):
  Three.js  : Y up, street runs toward -Z.
  Blender   : Z up, street runs toward +Y.
  Blender (X, Y, Z) -> Three (X, Z, -Y);  Three (x, y, z) -> Blender (x, -z, y).
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
MEDIA = os.path.join(REPO, "public", "media", "spike")
BLEND = os.path.join(OUT, "block.blend")

CLASSES = ["structure", "detail", "fine"]
FEATURES = ["general", "building", "vehicle", "tree", "wire", "person", "landmark"]

PAPER_HEX = "#f7f5ef"
INK_HEX = "#2a2823"
PAPER = (0xF7, 0xF5, 0xEF)
INK = (0x2A, 0x28, 0x23)

FOV = 58.0              # vertical, degrees
N_FRAMES = 20
RENDER_FRAME = 10       # 0-based index into camera.json "frames"
FADE_START, FADE_END = 40.0, 260.0
# Freestyle thickness (px at 900 px image height), per class multiplier
THICK_NEAR, THICK_FAR = 2.2, 0.5
THICK_NEAR_DIST, THICK_FAR_DIST = 4.0, 150.0
CLASS_WEIGHT = {"structure": 1.0, "detail": 0.72, "fine": 0.48}


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def three_to_blender(p):
    x, y, z = p
    return (x, -z, y)


def blender_to_three(p):
    x, y, z = p
    return (x, z, -y)


def camera_frames(n=N_FRAMES):
    """20 frames dollying down the driving lane, Three.js coords."""
    frames = []
    for i in range(n):
        z = -40.0 * i / (n - 1)
        y = 1.75 + 0.03 * math.sin(2.0 * math.pi * i / 10.0)
        frames.append({
            "pos": [-1.2, round(y, 4), round(z, 4) + 0.0],
            "target": [-1.2, 1.6, round(z - 60.0, 4)],
        })
    return frames


# --------------------------------------------------------------------------------------
# tiny raster helpers (numpy) used by check_bake.py
# --------------------------------------------------------------------------------------

def write_png(path, arr):
    """arr: numpy uint8 array HxWx3."""
    h, w, _ = arr.shape
    raw = b"".join(b"\x00" + arr[y].tobytes() for y in range(h))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 6))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)

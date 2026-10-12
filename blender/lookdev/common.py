"""Shared constants for the look-development pass (Blender side and plain-Python side).

Pure Python, so it can be imported from Blender scripts, from Blender's bundled Python
(composite.py) and from a normal Python (encode_test.py).

Frames of reference (same as blender/spike):
  Three.js : Y up, street runs toward -Z.
  Blender  : Z up, street runs toward +Y.
  Blender (X, Y, Z) -> Three (X, Z, -Y);  Three (x, y, z) -> Blender (x, -z, y).
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
PASSES = os.path.join(OUT, "passes")
BLEND = os.path.join(OUT, "scene.blend")
VENDOR = os.path.join(REPO, "blender", "assets", "vendor")
DOCS_OUT = os.path.join(REPO, "docs", "plans", "lookdev")

FOV = 58.0            # vertical, degrees, for every size
EYE = 1.75            # eye height (m) for the street camera
SIZES = [(1440, 900), (390, 844)]

# Paper and graphite, sRGB 0-255
PAPER = (246, 244, 238)
GRAPHITE = (44, 43, 41)


def three_to_blender(p):
    x, y, z = p
    return (x, -z, y)


def spike_frames(n=20):
    """The spike's 20-frame dolly (Three.js coords), kept verbatim so shot (a) matches frame 10."""
    frames = []
    for i in range(n):
        z = -40.0 * i / (n - 1)
        y = EYE + 0.03 * math.sin(2.0 * math.pi * i / 10.0)
        frames.append({"pos": [-1.2, round(y, 4), round(z, 4) + 0.0],
                       "target": [-1.2, 1.6, round(z - 60.0, 4)]})
    return frames


def _spike_shot(i):
    fr = spike_frames()[i]
    return {"pos": three_to_blender(fr["pos"]), "target": three_to_blender(fr["target"])}


# Shots in Blender coordinates (street along +Y, road centreline x = 0, walkways at |x| 4.1-6.3).
SHOTS = {
    # (a) same framing as the spike's camera frame 10
    "a": _spike_shot(10),
    # (b) close pass on the right lane beside a shopfront: pedestrian + parked keke in front
    "b": {"pos": (1.0, 36.6, EYE), "target": (5.0, 45.5, 1.35)},
    # (c) looking up at a power pole with a transformer, wires against the sky, almond + palm
    "c": {"pos": (1.2, 37.5, EYE), "target": (-3.2, 52.0, 6.6)},
}


def ride_shot(k, step=0.5, start_y=15.0):
    """Frame k of the compression-test dolly: 0.5 m steps along the driving lane, looking ahead."""
    y = start_y + k * step
    return {"pos": (-1.2, y, EYE + 0.03 * math.sin(2.0 * math.pi * y / 6.0)), "target": (-1.2, y + 60.0, 1.6)}

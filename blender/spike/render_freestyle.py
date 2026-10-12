"""★0 sketch spike: Freestyle still of block.blend from camera frame 10.

    blender -b --factory-startup -P blender/spike/render_freestyle.py [-- --sizes 1440x900,390x844]

Writes blender/spike/out/freestyle-<W>x<H>.png and prints wall-clock seconds per frame.
Look: white emission surfaces on paper #f7f5ef, ink #2a2823 lines whose thickness falls
with camera distance (2.2 px near -> 0.5 px far at 900 px height, scaled by image height),
fading in colour and alpha to paper between 40 m and 260 m (site fog is 60-290).
"""
import math
import os
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sizes = ["1440x900", "390x844"]
    frame = C.RENDER_FRAME
    i = 0
    while i < len(argv):
        if argv[i] == "--sizes":
            sizes = argv[i + 1].split(",")
            i += 1
        elif argv[i] == "--frame":
            frame = int(argv[i + 1])
            i += 1
        i += 1
    return [tuple(int(v) for v in s.split("x")) for s in sizes], frame


# Fade-to-paper ranges per class: structure follows the site fog; detail and fine drop out
# sooner, which acts as distance LOD and keeps the far end from turning to grey mush.
FADE = {"structure": (C.FADE_START, C.FADE_END), "detail": (C.FADE_START, 200.0), "fine": (25.0, 130.0)}


def lin(rgb):
    return tuple(C.srgb_to_linear(c) for c in rgb)


def setup_camera(scene, frame_idx):
    fr = C.camera_frames()[frame_idx]
    pos = Vector(C.three_to_blender(fr["pos"]))
    tgt = Vector(C.three_to_blender(fr["target"]))
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 24.0
    cam_data.lens = 12.0 / math.tan(math.radians(C.FOV) / 2)
    cam_data.clip_start = 0.1
    cam_data.clip_end = 400.0
    scene.camera = cam
    return cam


def setup_world(scene):
    w = bpy.data.worlds.new("paper")
    scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = lin(C.PAPER) + (1.0,)
    bg.inputs["Strength"].default_value = 1.0
    w.color = lin(C.PAPER)


def setup_render(scene):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    try:
        scene.eevee.taa_render_samples = 4
    except AttributeError:
        pass
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_percentage = 100


def setup_freestyle(scene, px_scale):
    r = scene.render
    r.use_freestyle = True
    r.line_thickness_mode = "ABSOLUTE"
    r.line_thickness = 1.0
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(130.0)
    fs.use_culling = True
    fs.use_smoothness = True
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    ink, paper = lin(C.INK), lin(C.PAPER)
    for cls in C.CLASSES:
        ls = fs.linesets.new(cls)
        ls.select_by_visibility = True
        ls.visibility = "VISIBLE"
        ls.select_by_edge_types = True
        ls.select_by_collection = True
        ls.collection = bpy.data.collections[cls]
        ls.collection_negation = "INCLUSIVE"
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True
        ls.select_material_boundary = True
        ls.select_external_contour = True
        ls.select_contour = cls == "structure"
        st = bpy.data.linestyles.new("ink_" + cls)
        ls.linestyle = st
        st.color = ink
        st.alpha = 1.0
        base = C.THICK_NEAR * C.CLASS_WEIGHT[cls] * px_scale
        st.thickness = base
        st.thickness_position = "CENTER"
        st.caps = "BUTT"
        st.chaining = "PLAIN"
        st.use_same_object = True
        # thickness falls with distance
        tm = st.thickness_modifiers.new("dist", "DISTANCE_FROM_CAMERA")
        tm.blend = "MULTIPLY"
        tm.range_min, tm.range_max = C.THICK_NEAR_DIST, C.THICK_FAR_DIST
        tm.value_min, tm.value_max = 1.0, C.THICK_FAR / C.THICK_NEAR
        # mild calligraphy (pressure variation by stroke direction)
        cm = st.thickness_modifiers.new("cal", "CALLIGRAPHY")
        cm.blend = "MULTIPLY"
        cm.orientation = math.radians(60)
        cm.thickness_min, cm.thickness_max = 0.75, 1.15
        cm.influence = 0.6
        # colour + alpha fade to paper
        col = st.color_modifiers.new("fade", "DISTANCE_FROM_CAMERA")
        col.blend = "MIX"
        f0, f1 = FADE[cls]
        col.range_min, col.range_max = f0, f1
        el = col.color_ramp.elements
        el[0].color = ink + (1.0,)
        el[1].color = paper + (1.0,)
        al = st.alpha_modifiers.new("fade", "DISTANCE_FROM_CAMERA")
        al.blend = "MULTIPLY"
        al.range_min, al.range_max = f0, f1
        al.mapping = "LINEAR"
        al.invert = True
        # slight hand wobble + overshoot
        gm = st.geometry_modifiers.new("noise", "PERLIN_NOISE_1D")
        gm.frequency = 8.0
        gm.amplitude = 0.35 * px_scale
        gm.octaves = 2
        bs = st.geometry_modifiers.new("over", "BACKBONE_STRETCHER")
        bs.backbone_length = 1.5 * px_scale


def main():
    sizes, frame_idx = args()
    bpy.ops.wm.open_mainfile(filepath=C.BLEND)
    scene = bpy.context.scene
    setup_render(scene)
    setup_world(scene)
    setup_camera(scene, frame_idx)
    results = []
    for (w, h) in sizes:
        scene.render.resolution_x, scene.render.resolution_y = w, h
        setup_freestyle(scene, h / 900.0)
        out = os.path.join(C.OUT, f"freestyle-{w}x{h}.png")
        scene.render.filepath = out
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        dt = time.time() - t0
        results.append((w, h, dt, out))
        print(f"[freestyle] {w}x{h}: {dt:.1f} s/frame -> {out}", flush=True)
    for (w, h, dt, out) in results:
        print(f"[freestyle-summary] {w}x{h} {dt:.2f}s {out}")


if __name__ == "__main__":
    main()

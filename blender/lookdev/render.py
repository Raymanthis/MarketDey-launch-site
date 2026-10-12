"""Render the tonal pass and the Freestyle ink of scene.blend to a multilayer EXR per shot/size.

    blender -b --factory-startup -P blender/lookdev/render.py -- --shots a,b,c [--sizes 1440x900,390x844]
    blender -b --factory-startup -P blender/lookdev/render.py -- --ride 0-23 --sizes 1440x900

Writes blender/lookdev/out/passes/<shot>-<W>x<H>.exr with the layers Image (tone, emission),
Freestyle (ink RGBA) and Depth, then composite.py turns that into the drawing. Prints wall-clock
seconds per frame.

Ink, per lineset (all thicknesses in px at 900 px image height, scaled to the frame height):
  outline   silhouettes, borders and the external contour of solid objects   1.6 px near
  crease    creases that are not outlines                                    1.0 px near
  material  material boundaries that are neither                            0.7 px near
  fine      everything on small solids (pipes, insulators, goods, people)    0.85 px near
  foliage   canopy outlines, scalloped and broken                            1.1 px near
  wires     overhead cables                                                  0.75 px near
Thickness falls with camera distance (x1 at 4 m to x0.32 at 140 m) and tapers at stroke ends;
colour and alpha fade toward paper with distance. A little Perlin wobble (0.3 px) and a
calligraphic pressure term keep the lines from looking plotted.
"""
import math
import os
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import materials  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"shots": [], "sizes": C.SIZES, "ride": None, "samples": 64, "tag": ""}
    i = 0
    while i < len(argv):
        k = argv[i]
        v = argv[i + 1] if i + 1 < len(argv) else None
        if k == "--shots":
            o["shots"] = v.split(",")
        elif k == "--sizes":
            o["sizes"] = [tuple(int(x) for x in s.split("x")) for s in v.split(",")]
        elif k == "--ride":
            a, b = v.split("-")
            o["ride"] = (int(a), int(b))
        elif k == "--samples":
            o["samples"] = int(v)
        elif k == "--tag":
            o["tag"] = v
        elif k == "--cam":   # name=px,py,pz,tx,ty,tz  (ad-hoc preview camera)
            nm, vals = v.split("=")
            f = [float(x) for x in vals.split(",")]
            o.setdefault("cams", []).append((nm, {"pos": tuple(f[:3]), "target": tuple(f[3:])}))
        i += 2
    if not o["shots"] and not o["ride"] and not o.get("cams"):
        o["shots"] = ["a", "b", "c"]
    return o


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


INK = tuple(lin(c) for c in C.GRAPHITE)
PAPER = tuple(lin(c) for c in C.PAPER)


def setup_camera(scene, shot):
    cam = scene.camera
    if cam is None:
        cd = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cd)
        scene.collection.objects.link(cam)
        scene.camera = cam
    pos, tgt = Vector(shot["pos"]), Vector(shot["target"])
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    cd = cam.data
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24.0
    cd.lens = 12.0 / math.tan(math.radians(C.FOV) / 2)
    cd.clip_start = 0.1
    cd.clip_end = 600.0
    return cam


def setup_world(scene):
    w = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 1.0


def setup_sun(scene):
    sun = bpy.data.objects.get("sun")
    if sun is None:
        ld = bpy.data.lights.new("sun", "SUN")
        sun = bpy.data.objects.new("sun", ld)
        scene.collection.objects.link(sun)
    ld = sun.data
    ld.energy = 2.6
    ld.angle = math.radians(2.0)
    try:
        ld.use_shadow = True
        ld.shadow_jitter = True
    except AttributeError:
        pass
    # afternoon sun from behind-left of the street axis, fairly high
    d = Vector((-0.42, -0.52, 0.74)).normalized()   # direction TO the sun
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()


def setup_render(scene, samples):
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    ee = scene.eevee
    ee.taa_render_samples = samples
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 8
    ee.use_raytracing = False
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    r.film_transparent = False
    r.resolution_percentage = 100
    r.use_compositing = True
    # Two view layers. "tone" renders everything with EEVEE (no ink); "ink" renders only the
    # inked collections and runs Freestyle there. The thin ink geometry, glass and leaf cards in
    # `nolines` are tens of thousands of tiny faces that Freestyle would otherwise put in its
    # view map: excluding them from the ink layer makes a frame ~10x faster.
    tone = scene.view_layers[0]
    tone.name = "tone"
    tone.use_pass_combined = True
    tone.use_pass_z = True
    tone.use_freestyle = False
    ink = scene.view_layers.get("ink") or scene.view_layers.new("ink")
    ink.use_pass_combined = True
    ink.use_freestyle = True
    ink.freestyle_settings.as_render_pass = True
    for lc in ink.layer_collection.children:
        lc.exclude = lc.name == "nolines"
    r.use_freestyle = True


def curve_points(mapping, pts):
    c = mapping.curves[0]
    while len(c.points) > 2:
        c.points.remove(c.points[-1])
    c.points[0].location = pts[0]
    c.points[1].location = pts[-1]
    for p in pts[1:-1]:
        c.points.new(*p)
    mapping.update()


LINESETS = {
    # name: (collections, types, excluded types, thickness px @900, fade range m, wobble px)
    "outline": (("lines",), ("silhouette", "border", "external_contour"), (), 1.6, (70.0, 260.0), 0.3),
    "crease": (("lines",), ("crease",), ("silhouette", "border", "external_contour"), 1.0, (55.0, 220.0), 0.22),
    "material": (("lines",), ("material_boundary",), ("silhouette", "border", "external_contour", "crease"), 0.7,
                 (35.0, 160.0), 0.18),
    "fine": (("fine",), ("silhouette", "border", "external_contour", "crease", "material_boundary"), (), 0.85,
             (40.0, 170.0), 0.2),
    "wires": (("wires",), ("silhouette", "border", "external_contour"), (), 0.75, (90.0, 320.0), 0.12),
    # foliage: only the outline of each tree's whole leaf mass (contour), never clump-by-clump
    "foliage": (("foliage",), ("silhouette", "external_contour"), (), 1.1, (60.0, 240.0), 0.0),
}


def setup_freestyle(scene, px_scale):
    vl = scene.view_layers["ink"]
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(140.0)
    fs.use_culling = True
    fs.use_smoothness = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 1.0
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    for name, (colls, types, excl, thick, fade, wobble) in LINESETS.items():
        for coll in colls:
            if coll not in bpy.data.collections:
                continue
            ls = fs.linesets.new(f"{name}_{coll}")
            ls.select_by_visibility = True
            ls.visibility = "VISIBLE"
            ls.select_by_edge_types = True
            ls.select_by_collection = True
            ls.collection = bpy.data.collections[coll]
            ls.collection_negation = "INCLUSIVE"
            ls.edge_type_negation = "INCLUSIVE"
            ls.edge_type_combination = "AND" if excl else "OR"
            for t in ("silhouette", "border", "crease", "material_boundary", "external_contour", "contour",
                      "edge_mark", "suggestive_contour", "ridge_valley"):
                setattr(ls, "select_" + t, t in types or t in excl)
                setattr(ls, "exclude_" + t, t in excl)
            st = bpy.data.linestyles.new("ink_" + name)
            ls.linestyle = st
            style(st, name, thick * px_scale, fade, wobble * px_scale)


def style(st, name, thick, fade, wobble):
    st.color = INK
    st.alpha = 0.92
    st.thickness = thick
    st.thickness_position = "CENTER"
    st.caps = "ROUND"
    st.chaining = "PLAIN"
    st.use_same_object = True
    st.use_chain_count = False
    # thinner with distance
    tm = st.thickness_modifiers.new("dist", "DISTANCE_FROM_CAMERA")
    tm.blend = "MULTIPLY"
    tm.range_min, tm.range_max = 4.0, 140.0
    tm.value_min, tm.value_max = 1.0, 0.32
    tm.mapping = "CURVE"
    curve_points(tm.curve, [(0.0, 1.0), (0.25, 0.62), (1.0, 0.0)])
    # pencil pressure: taper both ends of every stroke
    ta = st.thickness_modifiers.new("taper", "ALONG_STROKE")
    ta.blend = "MULTIPLY"
    ta.mapping = "CURVE"
    ta.value_min, ta.value_max = 0.45, 1.0
    curve_points(ta.curve, [(0.0, 0.0), (0.12, 1.0), (0.88, 1.0), (1.0, 0.0)])
    # a touch of calligraphy: verticals slightly heavier than horizontals
    cm = st.thickness_modifiers.new("cal", "CALLIGRAPHY")
    cm.blend = "MULTIPLY"
    cm.orientation = math.radians(75)
    cm.thickness_min, cm.thickness_max = 0.82, 1.1
    cm.influence = 0.5
    # colour and alpha fade to paper with distance
    f0, f1 = fade
    col = st.color_modifiers.new("fade", "DISTANCE_FROM_CAMERA")
    col.blend = "MIX"
    col.range_min, col.range_max = f0, f1
    el = col.color_ramp.elements
    el[0].color = INK + (1.0,)
    el[1].color = tuple(0.55 * a + 0.45 * b for a, b in zip(INK, PAPER)) + (1.0,)
    al = st.alpha_modifiers.new("fade", "DISTANCE_FROM_CAMERA")
    al.blend = "MULTIPLY"
    al.range_min, al.range_max = f0 * 0.6, f1
    al.mapping = "LINEAR"
    al.invert = True
    if name == "foliage":
        # scalloped leafy edge: small regular bumps plus irregular ones
        sd = st.geometry_modifiers.new("scallop", "SINUS_DISPLACEMENT")
        sd.wavelength = 4.5 * thick / 1.2
        sd.amplitude = 1.1 * thick / 1.2
        pn = st.geometry_modifiers.new("leafy", "PERLIN_NOISE_1D")
        pn.frequency = 22.0
        pn.amplitude = 1.2 * thick / 1.2
        pn.octaves = 3
        pn.seed = 3
        # only the longer contour runs survive: the mass outline, not every lobe
        st.use_length_min = True
        st.length_min = 14.0 * thick / 1.1
        # broken, pressure-varying strokes
        an = st.alpha_modifiers.new("broken", "NOISE")
        an.blend = "MULTIPLY"
        an.amplitude = 0.7
        an.period = 18.0
        tn = st.thickness_modifiers.new("press", "NOISE")
        tn.blend = "MULTIPLY"
        tn.amplitude = 0.6
        tn.period = 12.0
    elif wobble > 0:
        gm = st.geometry_modifiers.new("wobble", "PERLIN_NOISE_1D")
        gm.frequency = 6.0
        gm.amplitude = wobble
        gm.octaves = 2


def setup_compositor(scene, out_dir, name):
    ng = bpy.data.node_groups.get("lookdev_out") or bpy.data.node_groups.new("lookdev_out", "CompositorNodeTree")
    ng.nodes.clear()
    scene.compositing_node_group = ng
    rl = ng.nodes.new("CompositorNodeRLayers")
    rl.layer = "tone"
    ri = ng.nodes.new("CompositorNodeRLayers")
    ri.layer = "ink"
    fo = ng.nodes.new("CompositorNodeOutputFile")
    fo.directory = out_dir + os.sep
    fo.file_name = name
    fo.format.file_format = "OPEN_EXR_MULTILAYER"
    fo.format.color_depth = "16"
    fo.format.exr_codec = "ZIP"
    for nm, typ in (("Image", "RGBA"), ("Freestyle", "RGBA"), ("Depth", "FLOAT")):
        fo.file_output_items.new(typ, nm)
        ng.links.new((ri if nm == "Freestyle" else rl).outputs[nm], fo.inputs[nm])
    return fo


def main():
    o = args()
    bpy.ops.wm.open_mainfile(filepath=C.BLEND)
    scene = bpy.context.scene
    setup_render(scene, o["samples"])
    setup_world(scene)
    setup_sun(scene)
    jobs = []
    for s in o["shots"]:
        jobs.append((s, C.SHOTS[s]))
    jobs += o.get("cams", [])
    if o["ride"]:
        a, b = o["ride"]
        for k in range(a, b + 1):
            jobs.append((f"ride{k:02d}", C.ride_shot(k)))
    os.makedirs(C.PASSES, exist_ok=True)
    results = []
    for (w, h) in o["sizes"]:
        scene.render.resolution_x, scene.render.resolution_y = w, h
        setup_freestyle(scene, h / 900.0)
        materials.set_pixel_scale(2.0 * math.tan(math.radians(C.FOV) / 2) / h)
        for (name, shot) in jobs:
            if h > w and "target_portrait" in shot:
                shot = dict(shot, target=shot["target_portrait"], pos=shot.get("pos_portrait", shot["pos"]))
            setup_camera(scene, shot)
            base = f"{name}{o['tag']}-{w}x{h}"
            setup_compositor(scene, C.PASSES, base)
            t0 = time.time()
            bpy.ops.render.render(write_still=False)
            dt = time.time() - t0
            results.append((name, w, h, dt))
            print(f"[render] {base}: {dt:.1f} s", flush=True)
    for (name, w, h, dt) in results:
        print(f"[render-summary] {name} {w}x{h} {dt:.2f}s")


if __name__ == "__main__":
    main()

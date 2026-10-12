"""Tonal materials for the pencil pass.

Every surface is an Emission shader whose value is the *pencil tone* (display value, 1 = paper):

    tone = albedo x line_texture x light_curve(L) x mix(1, AO, k)

L is the lighting a white diffuse surface receives at that point (sun + sky, with EEVEE's
shadows), read through Shader to RGB. The light curve compresses it into the narrow, light value
range of a pencil drawing: sunlit faces stay paper-white, shade and cast shadow become soft
greys, recesses go darker. Emission is gamma-encoded (tone ** 2.2) so the Standard view
transform writes the tone itself.

Line textures (shutter slats, paving joints, corrugations, block courses) are procedural: a line
every `period` metres along a world or object axis, kept about one pixel wide (the global
"px" value is set per render to metres-per-pixel at 1 m distance) and faded out with distance so
they never alias into moire.
"""
import bpy

# name: dict(albedo, ao, lines=[(axis, period, width, fade_end, strength, offset)], kind)
#   axis: "X" "Y" "Z" world axes, "OX" "OY" "OZ" object axes, "U" "V" uv, "BLOCK" staggered
SPECS = {
    # walls and trims
    "wall": dict(albedo=0.95), "wall_b": dict(albedo=0.89), "wall_c": dict(albedo=0.83),
    "wall_d": dict(albedo=0.77), "trim": dict(albedo=0.98), "plinth": dict(albedo=0.72),
    "sign": dict(albedo=0.99, kind="sign"), "sign_frame": dict(albedo=0.8),
    "shutter": dict(albedo=0.86, lines=[("Z", 0.085, 0.006, 30.0, 0.55, 0.0)]),
    "shutter_dark": dict(albedo=0.66, lines=[("Z", 0.085, 0.006, 30.0, 0.5, 0.0)]),
    "sheet_x": dict(albedo=0.86, lines=[("X", 0.152, 0.008, 35.0, 0.5, 0.0)]),
    "sheet_y": dict(albedo=0.86, lines=[("Y", 0.152, 0.008, 35.0, 0.5, 0.0)]),
    "sheet_ox": dict(albedo=0.84, lines=[("OX", 0.152, 0.008, 35.0, 0.5, 0.0)]),
    "roof_dark": dict(albedo=0.6),
    "breeze": dict(albedo=0.9, kind="breeze"),
    "block": dict(albedo=0.86, kind="block"),
    "glass": dict(kind="glass", albedo=0.72), "glass_shop": dict(kind="glass", albedo=0.56),
    "glass_louvre": dict(kind="glass", albedo=0.7, lines=[("Z", 0.1, 0.009, 25.0, 0.6, 0.0)]),
    "shop_dark": dict(albedo=0.34, ao=0.0, kind="flat"),
    "ac": dict(albedo=0.92, lines=[("Z", 0.05, 0.006, 15.0, 0.5, 0.0)]),
    # street
    "road": dict(albedo=0.95, ao=0.6, lines=[("X", 1.75, 0.02, 70.0, 0.22, 0.875)]), "paint": dict(albedo=1.0, ao=0.3), "kerb": dict(albedo=0.9),
    "walk": dict(albedo=0.93, lines=[("Y", 0.9, 0.012, 45.0, 0.45, 0.0)]),
    "channel": dict(albedo=0.42), "slab": dict(albedo=0.84, lines=[("Y", 0.6, 0.01, 30.0, 0.5, 0.0)]),
    "ground": dict(albedo=0.95, ao=0.0),
    "concrete": dict(albedo=0.82), "metal": dict(albedo=0.72), "metal_dark": dict(albedo=0.46),
    "ink": dict(albedo=0.2, kind="flat", ao=0.0), "wire": dict(albedo=0.3, kind="flat", ao=0.0),
    "rust": dict(albedo=0.6),
    # nature
    "bark": dict(albedo=0.56), "bark_dark": dict(albedo=0.36),
    "palm_trunk": dict(albedo=0.6, lines=[("Z", 0.11, 0.012, 30.0, 0.5, 0.0)]), "foliage": dict(albedo=0.8, kind="foliage"),
    "foliage_dark": dict(albedo=0.68, kind="foliage"), "palm": dict(albedo=0.5),
    # vehicles
    "paint_light": dict(albedo=0.96), "paint_mid": dict(albedo=0.78), "paint_dark": dict(albedo=0.5),
    "danfo": dict(albedo=0.9), "stripe": dict(albedo=0.28, kind="flat"), "keke": dict(albedo=0.82),
    "tyre": dict(albedo=0.24), "rim": dict(albedo=0.82), "chrome": dict(albedo=0.94),
    "vglass": dict(kind="glass", albedo=0.52), "lamp": dict(albedo=0.97), "seat": dict(albedo=0.34),
    "canvas": dict(albedo=0.62), "plate": dict(albedo=0.99), "under": dict(albedo=0.3, kind="flat"),
    # people
    "skin": dict(albedo=0.44), "hair": dict(albedo=0.2), "top": dict(albedo=0.94), "bottom": dict(albedo=0.58),
    "shoes": dict(albedo=0.32), "cloth_light": dict(albedo=0.95), "cloth_dark": dict(albedo=0.6),
    "basin": dict(albedo=0.8), "goods": dict(albedo=0.62),
    # misc
    "wood": dict(albedo=0.7), "umbrella": dict(albedo=0.93), "umbrella_b": dict(albedo=0.7),
    "plastic": dict(albedo=0.9),
}

# Light curve: input is L/2 (a sunlit ground plane reaches ~1), output multiplies the albedo.
LIGHT_CURVE = [(0.0, 0.42), (0.12, 0.6), (0.26, 0.74), (0.4, 0.84), (0.55, 0.93), (0.68, 0.985), (0.85, 1.0)]

_GROUPS = {}


def _new_group(name):
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    return ng


def light_group():
    """Group: (AO strength) -> light factor x AO factor."""
    if "lighting" in _GROUPS:
        return _GROUPS["lighting"]
    ng = _new_group("pencil_lighting")
    ng.interface.new_socket("AO strength", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.interface.new_socket("Factor", in_out="OUTPUT", socket_type="NodeSocketFloat")
    N = ng.nodes
    L = ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    dif = N.new("ShaderNodeBsdfDiffuse")
    dif.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = N.new("ShaderNodeShaderToRGB")
    L.new(dif.outputs[0], s2r.inputs[0])
    bw = N.new("ShaderNodeRGBToBW")
    L.new(s2r.outputs["Color"], bw.inputs[0])
    half = N.new("ShaderNodeMath")
    half.operation = "MULTIPLY"
    half.inputs[1].default_value = 0.5
    L.new(bw.outputs[0], half.inputs[0])
    ramp = N.new("ShaderNodeValToRGB")
    ramp.name = "light_curve"
    ramp.color_ramp.interpolation = "B_SPLINE"
    els = ramp.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, v = LIGHT_CURVE[0]
    els[0].color = (v, v, v, 1)
    for pos, v in LIGHT_CURVE[1:]:
        e = els.new(pos)
        e.color = (v, v, v, 1)
    L.new(half.outputs[0], ramp.inputs[0])
    lum = N.new("ShaderNodeRGBToBW")
    L.new(ramp.outputs[0], lum.inputs[0])
    ao = N.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.9
    aomix = N.new("ShaderNodeMix")
    aomix.data_type = "FLOAT"
    aomix.inputs["A"].default_value = 1.0
    L.new(ao.outputs["AO"], aomix.inputs["B"])
    L.new(gi.outputs[0], aomix.inputs["Factor"])
    # soften AO: ao' = 1 - (1 - ao) * strength handled by the mix; then multiply
    mul = N.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    L.new(lum.outputs[0], mul.inputs[0])
    L.new(aomix.outputs["Result"], mul.inputs[1])
    L.new(mul.outputs[0], go.inputs[0])
    _GROUPS["lighting"] = ng
    return ng


def lines_group():
    """Group: (coord, period, width, fade end, strength) -> factor (1 = no line, darker on lines).

    Distance from the nearest line d = |fract(coord/period + 0.5) - 0.5| * period. The drawn
    half-width is max(width/2, 0.6 px) in metres at the shading point, with a 1 px soft edge; the
    whole texture fades out between 40 % and 100 % of `fade end` (view distance)."""
    if "lines" in _GROUPS:
        return _GROUPS["lines"]
    ng = _new_group("pencil_lines")
    for nm in ("Coord", "Period", "Width", "Fade end", "Strength"):
        ng.interface.new_socket(nm, in_out="INPUT", socket_type="NodeSocketFloat")
    ng.interface.new_socket("Factor", in_out="OUTPUT", socket_type="NodeSocketFloat")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")

    def op(o, a=None, b=None, c=None):
        n = N.new("ShaderNodeMath")
        n.operation = o
        for k, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                L.new(v, n.inputs[k])
        return n.outputs[0]
    cam = N.new("ShaderNodeCameraData")
    dist = cam.outputs["View Distance"]
    px = N.new("ShaderNodeValue")
    px.name = "px"
    px.label = "px"
    px.outputs[0].default_value = 0.00123
    pix = op("MULTIPLY", dist, px.outputs[0])            # metres per pixel here
    u = op("DIVIDE", gi.outputs["Coord"], gi.outputs["Period"])
    f = op("FRACT", op("ADD", u, 0.5))
    d = op("MULTIPLY", op("ABSOLUTE", op("SUBTRACT", f, 0.5)), gi.outputs["Period"])
    hw = op("MAXIMUM", op("MULTIPLY", gi.outputs["Width"], 0.5), op("MULTIPLY", pix, 0.6))
    # mask = 1 - smoothstep(hw - pix/2, hw + pix/2, d)
    lo = op("SUBTRACT", hw, op("MULTIPLY", pix, 0.5))
    hi = op("ADD", hw, op("MULTIPLY", pix, 0.5))
    t = op("DIVIDE", op("SUBTRACT", d, lo), op("SUBTRACT", hi, lo))
    t = op("MINIMUM", op("MAXIMUM", t, 0.0), 1.0)
    mask = op("SUBTRACT", 1.0, t)
    # a line much thinner than a pixel is drawn lighter, not wider (coverage)
    cover = op("MINIMUM", op("DIVIDE", gi.outputs["Width"], op("MAXIMUM", pix, 1e-6)), 1.0)
    cover = op("MAXIMUM", cover, 0.35)
    fe = gi.outputs["Fade end"]
    fade = op("SUBTRACT", 1.0, op("DIVIDE", op("SUBTRACT", dist, op("MULTIPLY", fe, 0.4)), op("MULTIPLY", fe, 0.6)))
    fade = op("MINIMUM", op("MAXIMUM", fade, 0.0), 1.0)
    k = op("MULTIPLY", op("MULTIPLY", op("MULTIPLY", mask, fade), gi.outputs["Strength"]), cover)
    L.new(op("SUBTRACT", 1.0, k), go.inputs[0])
    _GROUPS["lines"] = ng
    return ng


def _coord(N, L, axis):
    if axis in ("X", "Y", "Z"):
        tc = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(tc.outputs["Position"], sep.inputs[0])
        return sep.outputs[axis]
    if axis in ("OX", "OY", "OZ"):
        tc = N.new("ShaderNodeTexCoord")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(tc.outputs["Object"], sep.inputs[0])
        return sep.outputs[axis[1]]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["UV"], sep.inputs[0])
    return sep.outputs["X" if axis == "U" else "Y"]


def make(name, spec):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    L.new(em.outputs[0], out.inputs["Surface"])
    kind = spec.get("kind", "lit")
    alb = spec["albedo"]

    def op(o, a, b):
        n = N.new("ShaderNodeMath")
        n.operation = o
        for k, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                L.new(v, n.inputs[k])
        return n.outputs[0]

    val = N.new("ShaderNodeValue")
    val.outputs[0].default_value = alb
    tone = val.outputs[0]
    # procedural surface textures
    if kind == "glass":
        # dark at the sill, lighter toward the head, with one soft diagonal reflection band
        tc = N.new("ShaderNodeTexCoord")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(tc.outputs["UV"], sep.inputs[0])
        grad = op("MULTIPLY", sep.outputs["Y"], 0.16)
        diag = op("ADD", op("MULTIPLY", sep.outputs["X"], 0.8), sep.outputs["Y"])
        band = op("SINE", op("MULTIPLY", diag, 3.6), 0)
        band = op("MULTIPLY", op("MAXIMUM", band, 0.0), 0.12)
        tone = op("ADD", op("ADD", tone, grad), band)
        tone = op("MINIMUM", tone, 0.97)
    if kind == "foliage":
        # clumps of leaves: a little value break-up so a mass doesn't read as a flat blob
        tc = N.new("ShaderNodeTexCoord")
        vor = N.new("ShaderNodeTexVoronoi")
        vor.feature = "SMOOTH_F1"
        vor.inputs["Scale"].default_value = 3.2
        L.new(tc.outputs["Object"], vor.inputs["Vector"])
        dv = op("MULTIPLY", op("SUBTRACT", vor.outputs["Distance"], 0.5), -0.14)
        tone = op("ADD", tone, dv)
    if kind == "block":
        # 450 x 225 sandcrete blocks with staggered joints, world Y (along the street) and Z
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Position"], sep.inputs[0])
        lg = lines_group()
        g1 = N.new("ShaderNodeGroup")
        g1.node_tree = lg
        L.new(sep.outputs["Z"], g1.inputs["Coord"])
        for k, v in (("Period", 0.225), ("Width", 0.012), ("Fade end", 30.0), ("Strength", 0.55)):
            g1.inputs[k].default_value = v
        row = op("FLOOR", op("DIVIDE", sep.outputs["Z"], 0.225), 0)
        stag = op("MULTIPLY", op("MODULO", row, 2.0), 0.225)
        g2 = N.new("ShaderNodeGroup")
        g2.node_tree = lg
        L.new(op("ADD", op("ADD", sep.outputs["Y"], sep.outputs["X"]), stag), g2.inputs["Coord"])
        for k, v in (("Period", 0.45), ("Width", 0.012), ("Fade end", 30.0), ("Strength", 0.5)):
            g2.inputs[k].default_value = v
        tone = op("MULTIPLY", op("MULTIPLY", tone, g1.outputs[0]), g2.outputs[0])
    if kind == "sign":
        # illegible hand-painted lettering: two rows of irregular dashes, lighter than ink
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Position"], sep.inputs[0])
        along = op("ADD", sep.outputs["X"], sep.outputs["Y"])
        fz = op("FRACT", op("DIVIDE", sep.outputs["Z"], 0.17), 0)
        row = op("MULTIPLY", op("GREATER_THAN", fz, 0.42), op("LESS_THAN", fz, 0.62))
        nz = N.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 1.0
        cx = N.new("ShaderNodeCombineXYZ")
        L.new(op("MULTIPLY", along, 11.0), cx.inputs["X"])
        L.new(op("FLOOR", op("DIVIDE", sep.outputs["Z"], 0.17), 0), cx.inputs["Y"])
        L.new(cx.outputs[0], nz.inputs["Vector"])
        dash = op("GREATER_THAN", nz.outputs["Fac"], 0.5)
        tone = op("MULTIPLY", tone, op("SUBTRACT", 1.0, op("MULTIPLY", op("MULTIPLY", row, dash), 0.3)))
    if kind == "breeze":
        # breeze-block screen: square openings that read dark
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Position"], sep.inputs[0])
        a = op("ADD", sep.outputs["X"], sep.outputs["Y"])
        fa = op("ABSOLUTE", op("SUBTRACT", op("FRACT", op("DIVIDE", a, 0.2), 0), 0.5), 0)
        fz = op("ABSOLUTE", op("SUBTRACT", op("FRACT", op("DIVIDE", sep.outputs["Z"], 0.2), 0), 0.5), 0)
        hole = op("MULTIPLY", op("LESS_THAN", fa, 0.3), op("LESS_THAN", fz, 0.3))
        tone = op("MULTIPLY", tone, op("SUBTRACT", 1.0, op("MULTIPLY", hole, 0.55)))
    for (axis, period, width, fade_end, strength, offset) in spec.get("lines", []):
        g = N.new("ShaderNodeGroup")
        g.node_tree = lines_group()
        c = _coord(N, L, axis)
        if offset:
            c = op("ADD", c, offset)
        L.new(c, g.inputs["Coord"])
        g.inputs["Period"].default_value = period
        g.inputs["Width"].default_value = width
        g.inputs["Fade end"].default_value = fade_end
        g.inputs["Strength"].default_value = strength
        tone = op("MULTIPLY", tone, g.outputs[0])
    if kind in ("lit", "foliage", "block", "breeze", "sign"):
        lg = N.new("ShaderNodeGroup")
        lg.node_tree = light_group()
        lg.inputs["AO strength"].default_value = spec.get("ao", 0.85)
        tone = op("MULTIPLY", tone, lg.outputs[0])
    elif kind == "glass":
        # glass is not lit, but deep reveals and cast shadows still darken it a little
        lg = N.new("ShaderNodeGroup")
        lg.node_tree = light_group()
        lg.inputs["AO strength"].default_value = 0.6
        sh = op("ADD", op("MULTIPLY", lg.outputs[0], 0.35), 0.65)
        tone = op("MULTIPLY", tone, sh)
    gam = op("POWER", op("MAXIMUM", tone, 0.0), 2.2)
    comb = N.new("ShaderNodeCombineXYZ")
    for k in ("X", "Y", "Z"):
        L.new(gam, comb.inputs[k])
    L.new(comb.outputs[0], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    m.diffuse_color = (alb, alb, alb, 1)
    return m


def build_all():
    return {name: make(name, spec) for name, spec in SPECS.items()}


def set_pixel_scale(px):
    """px: metres per pixel at 1 m view distance for the current render size."""
    ng = bpy.data.node_groups.get("pencil_lines")
    if ng:
        ng.nodes["px"].outputs[0].default_value = px

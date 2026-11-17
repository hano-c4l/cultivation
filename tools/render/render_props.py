"""
Renders the static props of the maps (trees, rocks, pillars, crystals, lanterns...) into one atlas (phase 4j). Run it inside Blender through tools/render/run.mjs
(the config names this script in `script`):

  blender --background --factory-startup --python render_props.py -- <config.json> <out dir> <art root>

Every prop is built in code (primitives, displaced spheres, bent tubes) in metres with its foot at the origin, toon-shaded with the ink outline of the characters and
rendered once with the same isometric camera, so a prop and a figure standing next to each other have the same scale (1 m = 45 px along a tile axis, 39 px up).
Props that the maps tint (rocks, pillars) are neutral grey; the others keep their own colours. Writes props.png + props.json (a Phaser atlas whose frames are
named `<style>_<variant>`, all in a PROP_FRAME box anchored at the foot), report.json, contact.png, log.txt and done.marker.
"""
import bpy, sys, os, json, math, time, traceback, random
import numpy as np
from mathutils import Matrix, Vector, noise
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:]
CFG_PATH, OUT, ART = ARGS[0], ARGS[1], ARGS[2]
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
LOG = open(os.path.join(OUT, "log.txt"), "w", encoding="utf-8")


def log(*a):
    LOG.write(" ".join(str(x) for x in a) + "\n")
    LOG.flush()


def check(cond, msg):
    if not cond:
        raise RuntimeError(msg)


CFG = json.load(open(CFG_PATH, encoding="utf-8"))
F = CFG["frame"]
ANCHOR = CFG["anchor"]
PPM = 64.0 / math.sqrt(2)
MATS = {}
OUTLINE = None
PROP_K = 1.0  # the size factor of the prop being built (its outline is thinned by it so that the line stays the same width on screen)


def toon(name, rgb, levels=(0.62, 0.86, 1.0), tints=((0.8, 0.86, 1.0), (0.95, 0.97, 1.0), (1, 1, 1))):
    """A flat three-step toon material of one colour (cool shadows), cached by name."""
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    while len(ramp.color_ramp.elements) < len(levels):
        ramp.color_ramp.elements.new(0.5)
    for i, e in enumerate(ramp.color_ramp.elements):
        e.position = i / len(levels) if i else 0.0
        e.color = (levels[i] * tints[i][0], levels[i] * tints[i][1], levels[i] * tints[i][2], 1)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
    nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    MATS[name] = mat
    return mat


def glow(name, rgb):
    """An unshaded emissive colour (embers, lantern light)."""
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (rgb[0], rgb[1], rgb[2], 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    MATS[name] = mat
    return mat


def hexrgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def finish(ob, mat, flat=False, outline=True, thickness=None):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = not flat
    if outline:
        ob.data.materials.append(OUTLINE)
        sol = ob.modifiers.new("outline", "SOLIDIFY")
        sol.thickness = (thickness if thickness is not None else CFG["outlinePx"]) / PPM / PROP_K
        sol.offset = 1.0
        sol.use_flip_normals = True
        sol.material_offset = 1
        sol.use_rim = False
    return ob


def displace(ob, amount, seed, scale=1.6):
    me = ob.data
    for v in me.vertices:
        n = noise.noise(Vector((v.co.x * scale + seed, v.co.y * scale + seed * 0.7, v.co.z * scale - seed * 0.3)))
        v.co += v.co.normalized() * n * amount
    me.update()


def blob(c, r, squash=(1, 1, 1), mat=None, seed=0, rough=0.0, detail=2, flat=False, rot=0.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=r, location=c)
    ob = bpy.context.active_object
    ob.scale = squash
    ob.rotation_euler = (0, 0, rot)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if rough:
        displace(ob, rough * r, seed)
    return finish(ob, mat, flat)


def cyl(c, r0, r1, h, mat, seg=10, flat=False, tilt=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=h, location=(c[0], c[1], c[2] + h / 2), end_fill_type="NGON")
    ob = bpy.context.active_object
    ob.rotation_euler = tilt
    return finish(ob, mat, flat)


def tube(points, r0, r1, mat, seg=8, flat=False):
    """A tube along a polyline (a trunk, a branch), tapering from r0 to r1, closed by a cap at each end."""
    import bmesh
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        p = Vector(p)
        t = (Vector(points[min(i + 1, n - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        u = t.cross(Vector((0, 1, 0)))
        if u.length < 1e-3:
            u = t.cross(Vector((1, 0, 0)))
        u.normalize()
        v = t.cross(u).normalized()
        r = r0 + (r1 - r0) * i / (n - 1)
        rings.append([bm.verts.new(p + u * math.cos(a / seg * math.tau) * r + v * math.sin(a / seg * math.tau) * r) for a in range(seg)])
    for i in range(n - 1):
        for a in range(seg):
            a2 = (a + 1) % seg
            bm.faces.new((rings[i][a], rings[i][a2], rings[i + 1][a2], rings[i + 1][a]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("tube")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tube", me)
    bpy.context.collection.objects.link(ob)
    return finish(ob, mat, flat)


def box(c, size, mat, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(c[0], c[1], c[2] + size[2] / 2))
    ob = bpy.context.active_object
    ob.scale = size
    ob.rotation_euler = (0, 0, rot)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(ob, mat, True)


# ---------------------------------------------------------------- the props (metres, the foot at the origin) ----------------------------------------------------------------
def m(name, hexcol, k=1.0):
    c = hexrgb(hexcol)
    return toon(name, [min(1.4, c[0] * k), min(1.4, c[1] * k), min(1.4, c[2] * k)])


def build_tree(v, rnd):
    bark = m("bark", "#6b5238")
    bark_d = m("bark_d", "#4a3828")
    if v in (0, 1, 3):  # a broad crown (v 3: plum blossom)
        h = 2.6 + rnd.random() * 0.8
        lean = (rnd.random() - 0.5) * 0.5
        tube([(0, 0, -0.1), (lean * 0.3, 0, h * 0.35), (lean, 0.05, h * 0.7), (lean * 1.2, 0.05, h)], 0.3, 0.14, bark)
        tube([(lean * 0.7, 0, h * 0.62), (lean * 0.7 + 0.8, 0.3, h * 0.95), (lean * 0.7 + 1.3, 0.4, h * 1.2)], 0.1, 0.05, bark_d, seg=6)
        tube([(lean * 0.7, 0, h * 0.6), (lean * 0.7 - 0.8, -0.2, h * 0.9), (lean * 0.7 - 1.2, -0.3, h * 1.15)], 0.1, 0.05, bark_d, seg=6)
        cols = {0: ("#3f7d52", "#52a064", "#6fbf7e"), 1: ("#4a7a4a", "#6a9a52", "#9ab868"), 3: ("#e8b4c4", "#f4cfd9", "#fbe6ec")}[v]
        mats = [m("leaf%d_%d" % (v, i), c) for i, c in enumerate(cols)]
        top = h + 0.7
        spots = [(0, 0, top + 0.5, 1.7), (1.5, 0.4, top - 0.2, 1.3), (-1.4, -0.3, top - 0.35, 1.25), (0.3, 1.2, top - 0.5, 1.1), (-0.5, -1.1, top - 0.6, 1.0), (0.4, -0.2, top + 1.4, 1.1)]
        for i, (x, y, z, r) in enumerate(spots):
            blob((x + lean, y, z), r, (1.0, 1.0, 0.82), mats[i % 2 if i < 5 else 2], seed=i * 3 + v, rough=0.18, detail=2)
    elif v == 2:  # a pine of stacked skirts
        tube([(0, 0, -0.1), (0.05, 0, 1.6)], 0.28, 0.2, bark)
        mats = [m("pine%d" % i, c) for i, c in enumerate(("#2f5f46", "#3d7358", "#4f8a68"))]
        for i in range(5):
            r = 1.9 - i * 0.32
            z = 1.1 + i * 0.95
            displace(cyl((0, 0, z), r, 0.05, 1.7, mats[i % 3], seg=9, flat=True), 0.05, i * 5)
    return


def build_bush(v, rnd):
    mats = [m("bush%d" % i, c) for i, c in enumerate(("#3d7a4c", "#58a064", "#7cbf80"))]
    for i, (x, y, z, r) in enumerate([(-0.5, 0, 0.45, 0.6), (0.5, 0.1, 0.42, 0.55), (0, -0.1, 0.8, 0.62), (-0.1, 0.4, 0.4, 0.5), (0.2, -0.45, 0.4, 0.45)]):
        blob((x, y, z), r, (1, 1, 0.85), mats[i % 3], seed=i + v * 4, rough=0.15)
    if v % 2 == 0:
        pink = m("flower", "#f08aa8")
        for x, y, z in [(0.55, -0.4, 0.75), (-0.7, -0.3, 0.7), (0.0, -0.6, 0.6), (0.7, 0.3, 0.9)]:
            blob((x, y, z), 0.09, mat=pink, detail=1)


def build_stump(v, rnd):
    bark = m("stumpbark", "#6b5238")
    cut = m("stumpcut", "#d8b878")
    cyl((0, 0, 0), 0.62, 0.5, 0.55, bark, seg=12)
    top = cyl((0, 0, 0.55), 0.5, 0.5, 0.03, cut, seg=12)
    for a in range(5):
        ang = a / 5 * math.tau + v
        tube([(math.cos(ang) * 0.45, math.sin(ang) * 0.45, 0.25), (math.cos(ang) * 0.85, math.sin(ang) * 0.85, 0.02)], 0.12, 0.05, bark, seg=6)


def rocky(v, rnd, scale, n=1, flat_col="#9a9a9a", detail=2):
    out = []
    mat = m("rock" + flat_col, flat_col)
    for i in range(n):
        r = scale * (1.0 if i == 0 else 0.45 + rnd.random() * 0.25)
        x, y = (0, 0) if i == 0 else ((rnd.random() - 0.5) * min(scale * 2.2, 2.4), (rnd.random() - 0.5) * min(scale * 2.0, 1.4))  # the companions stay near, so the frame has room below the foot
        blob((x, y, r * 0.5), r, (1.1 + rnd.random() * 0.2, 0.95 + rnd.random() * 0.2, 0.7 + rnd.random() * 0.15), mat, seed=i * 7 + v * 13, rough=0.3, detail=detail, flat=True, rot=rnd.random() * 3)


def build_rock(v, rnd):
    rocky(v, rnd, 0.85, 2 if v % 2 else 1)


def build_boulder(v, rnd):
    rocky(v, rnd, 1.6, 3)


def build_pillar(v, rnd):
    mat = m("rock#9a9a9a", "#9a9a9a")
    mat2 = m("rock#bdbdbd", "#bdbdbd")
    h = 3.4 + v * 0.45
    cone = cyl((0, 0, 0), 0.8, 0.12, h, mat, seg=6, flat=True)
    displace(cone, 0.06, v * 3)
    cyl((0.7, 0.3, 0), 0.4, 0.06, h * 0.45, mat2, seg=5, flat=True)
    cyl((-0.6, -0.2, 0), 0.35, 0.05, h * 0.35, mat2, seg=5, flat=True)


def build_crystal(v, rnd):
    mats = [m("cry%d" % i, c) for i, c in enumerate(("#7fc4ee", "#a8dcf8", "#5aa0d8"))]
    for i, (x, y, h, r) in enumerate([(0, 0, 3.0 + v * 0.3, 0.55), (0.8, 0.3, 2.0, 0.4), (-0.7, 0.2, 2.3, 0.45), (0.2, -0.7, 1.5, 0.35), (-0.3, 0.8, 1.7, 0.32)]):
        tilt = ((rnd.random() - 0.5) * 0.35, (rnd.random() - 0.5) * 0.35, 0)
        body = cyl((x, y, 0), r, r, h * 0.8, mats[i % 3], seg=6, flat=True, tilt=tilt)
        cyl((x + tilt[1] * h * 0.8 * -1, y + tilt[0] * h * 0.8, h * 0.8), r, 0.02, h * 0.3, mats[(i + 1) % 3], seg=6, flat=True, tilt=tilt)


def build_ember(v, rnd):
    rocky(v, rnd, 0.9, 1, flat_col="#4a3d3a")
    hot = glow("hot", (1.0, 0.45, 0.12))
    for i in range(3):
        a = i * 2.1 + v
        blob((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.55), 0.1, (1, 1, 0.5), hot, detail=1, flat=True)


def build_bamboo(v, rnd):
    stalk = m("bamboo", "#78b050")
    node = m("bamboo_n", "#4a7a34")
    leaf = m("bleaf", "#5a9a42")
    for i, (x, y, h) in enumerate([(-0.35, 0.1, 4.4), (0.0, -0.2, 5.4 + v * 0.2), (0.4, 0.15, 4.7), (0.2, 0.55, 3.9), (-0.2, -0.5, 4.1)]):
        lean = (rnd.random() - 0.5) * 0.3
        tube([(x, y, -0.05), (x + lean * 0.5, y, h * 0.5), (x + lean, y, h)], 0.13, 0.08, stalk, seg=8)
        for k in range(1, int(h / 0.9)):
            blob((x + lean * (k * 0.9 / h), y, k * 0.9), 0.16, (1, 1, 0.22), node, detail=1)
        for s in (-1, 1):
            for j in range(3):
                z = h - 0.2 - j * 0.35
                tube([(x + lean, y, z), (x + lean + s * 0.5, y + 0.1, z + 0.1), (x + lean + s * 0.95, y + 0.1, z - 0.25)], 0.07, 0.01, leaf, seg=4, flat=True)


def build_lantern(v, rnd):
    stone = m("lstone", "#aaa49b")
    roof = m("lroof", "#6e675e")
    lit = glow("lamp", (1.0, 0.86, 0.5))
    box((0, 0, 0), (0.9, 0.9, 0.25), stone)
    cyl((0, 0, 0.25), 0.2, 0.16, 1.0, stone, seg=8)
    box((0, 0, 1.25), (0.62, 0.62, 0.12), stone)
    box((0, 0, 1.37), (0.4, 0.4, 0.5), lit)
    cyl((0, 0, 1.87), 0.62, 0.05, 0.55, roof, seg=4, flat=True, tilt=(0, 0, math.pi / 4))
    blob((0, 0, 2.45), 0.1, mat=stone, detail=1)


def build_jade(v, rnd):
    mat = m("jade", "#5fbf8f")
    core = m("jadecore", "#cdf5e0")
    rocky(v, rnd, 0.95, 1, flat_col="#5fbf8f")
    blob((0.1, -0.15, 0.7), 0.35, (1, 1, 0.8), core, seed=v, rough=0.2, flat=True)

# ---------------------------------------------------------------- the flight pháp bảo (what a rider stands on; they point along +X and are turned to each heading) ----------------------------------------------------------------
def loft(rings, mat, flat=True, outline=True, thickness=None):
    """A skin over a row of rings (each the same number of points), closed by a cap at each end: blades, petals, feathers."""
    import bmesh
    bm = bmesh.new()
    vs = [[bm.verts.new(Vector(q)) for q in ring] for ring in rings]
    n = len(vs[0])
    for i in range(len(vs) - 1):
        for a in range(n):
            a2 = (a + 1) % n
            bm.faces.new((vs[i][a], vs[i][a2], vs[i + 1][a2], vs[i + 1][a]))
    bm.faces.new(vs[0][::-1])
    bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("loft")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("loft", me)
    bpy.context.collection.objects.link(ob)
    return finish(ob, mat, flat, outline, thickness)


def lin(c):
    """An sRGB colour as the linear value Blender wants, so a flight pháp bảo comes out in the colour that was written."""
    return [x ** 2.2 for x in c]


def mf(name, hexcol):
    return toon(name, lin(hexrgb(hexcol)), levels=(0.66, 0.95, 1.0), tints=((0.9, 0.84, 0.96), (1, 1, 1), (1, 1, 1)))


def gf(name, rgb):
    return glow(name, lin(rgb))


LEAF = ((0.0, 0.3), (0.25, 1.0), (0.65, 0.85), (1.0, 0.04))


def blade(root, direction, length, width, mat, thick=0.03, profile=LEAF, curl=0.0, cup=0.0, up=(0, 0, 1), flat=True, outline=True):
    """A flat leaf from `root` along `direction`: a petal, a feather, a fin. `curl` lifts its tip, `cup` lifts its two edges."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-3:
        side = d.cross(Vector((0, 1, 0)))
    side.normalize()
    n = side.cross(d).normalized()
    rings = []
    for s_, wf in profile:
        c = Vector(root) + d * length * s_ + n * curl * length * s_ * s_
        w = width * wf
        rings.append([c - side * w / 2 + n * cup * w, c - n * thick / 2, c + side * w / 2 + n * cup * w, c + n * thick / 2])
    return loft(rings, mat, flat, outline)


def ball(c, r, mat, squash=(1, 1, 1), outline=True, detail=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=r, location=c)
    ob = bpy.context.active_object
    ob.scale = squash
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, mat, False, outline)


def build_fly_sword(v, rnd):
    steel = mf("fs_steel", "#cfe4f0")
    edge = mf("fs_edge", "#8fb8d0")
    gold = mf("fs_gold", "#e8c25a")
    wrap = mf("fs_wrap", "#7a2a2a")
    red = mf("fs_red", "#d8403c")
    lit = gf("fs_lit", (0.75, 1.0, 1.0))
    z, th = 0.17, 0.08
    # the blade: a wide diamond section with a darker bevel under it, narrowing to the point
    for (mat_, wk, zk) in ((edge, 1.0, -0.012), (steel, 0.72, 0.012)):
        rings = []
        for x, w in ((-0.74, 0.38), (-0.5, 0.46), (0.95, 0.4), (1.3, 0.28), (1.62, 0.01)):
            w *= wk
            rings.append([(x, -w / 2, z + zk), (x, 0, z + zk - th / 2), (x, w / 2, z + zk), (x, 0, z + zk + th / 2)])
        loft(rings, mat_, outline=(wk == 1.0))
    # the fuller: a line of spirit light down the middle, and three runes
    loft([[(x, -0.014, z + 0.05), (x, 0, z + 0.046), (x, 0.014, z + 0.05), (x, 0, z + 0.06)] for x in (-0.55, 1.25)], lit, outline=False)
    for x in (-0.25, 0.2, 0.65):
        loft([[(x + dx, -0.07, z + 0.035), (x + dx, 0, z + 0.03), (x + dx, 0.07, z + 0.035), (x + dx, 0, z + 0.058)] for dx in (-0.02, 0.02)], lit, outline=False)
    # the guard: two wings sweeping forward, a jewel in the middle
    for k in (-1, 1):
        blade((-0.78, 0, z), (0.55, k, 0.0), 0.5, 0.22, gold, thick=0.09, profile=((0, 1.0), (0.5, 0.8), (1.0, 0.1)))
    ball((-0.78, 0, z), 0.11, gold, (1.0, 1.0, 0.8))
    ball((-0.76, 0, z + 0.07), 0.055, gf("fs_jewel", (0.3, 0.95, 0.85)), outline=False)
    # the hilt, its rings and the pommel
    tube([(-0.84, 0, z), (-1.22, 0, z)], 0.055, 0.05, wrap)
    for x in (-0.93, -1.03, -1.13):
        tube([(x - 0.012, 0, z), (x + 0.012, 0, z)], 0.064, 0.064, gold)
    ball((-1.27, 0, z), 0.085, gold, (1.1, 1.0, 1.0))
    # the tassel streams out behind
    tube([(-1.33, 0, z), (-1.45, 0.05, z - 0.02), (-1.56, -0.04, z + 0.02), (-1.66, 0.03, z - 0.04)], 0.024, 0.014, red, seg=6)
    ball((-1.45, 0.05, z - 0.02), 0.05, gold)
    for dy in (-0.06, 0.0, 0.06):
        tube([(-1.66, 0.03, z - 0.04), (-1.78, 0.03 + dy, z - 0.07), (-1.9, 0.03 + dy * 2.2, z - 0.05)], 0.024, 0.008, red, seg=5)


def build_fly_cloud(v, rnd):
    lv = dict(levels=(0.74, 0.9, 1.0), tints=((0.8, 0.9, 1.0), (0.93, 0.97, 1.0), (1, 1, 1)))
    white = toon("fc_white", [1.0, 1.0, 1.0], **lv)
    pale = toon("fc_pale", [0.86, 0.93, 1.0], **lv)
    # a flat-topped bank of billows, bigger in the middle, with a tail of shrinking billows curling away at each side
    ball((0, 0, 0.06), 0.62, white, (1.25, 1.05, 0.3), detail=3)
    for i, (x, y, r) in enumerate(((0.72, 0.1, 0.36), (0.45, 0.5, 0.34), (-0.1, 0.62, 0.36), (-0.62, 0.38, 0.33), (-0.8, -0.12, 0.36), (-0.4, -0.55, 0.34), (0.15, -0.64, 0.36), (0.62, -0.38, 0.32))):
        ball((x, y, 0.05 + 0.02 * (i % 2)), r, pale if i % 2 else white, (1.0, 1.0, 0.55), detail=3)
    for x, y, r in ((0.3, 0.15, 0.3), (-0.3, -0.1, 0.32), (-0.05, 0.3, 0.26)):
        ball((x, y, 0.14), r, white, (1.1, 1.0, 0.45), detail=3)
    for k in (-1, 1):
        for j, (x, y, r) in enumerate(((-1.05, 0.42, 0.26), (-1.36, 0.5, 0.21), (-1.6, 0.44, 0.16), (-1.72, 0.3, 0.12), (-1.7, 0.17, 0.085))):
            ball((x, y * k, 0.05 + 0.015 * j), r, white if j % 2 else pale, (1.0, 1.0, 0.6), detail=3)
    for j, (x, y, r) in enumerate(((1.0, -0.05, 0.24), (1.24, -0.12, 0.18), (1.42, -0.06, 0.13), (1.5, 0.06, 0.09))):
        ball((x, y, 0.05 + 0.015 * j), r, pale if j % 2 else white, (1.0, 1.0, 0.6), detail=3)


def build_fly_lotus(v, rnd):
    deep = mf("fl_deep", "#ee86b8")
    mid = mf("fl_mid", "#f9b4d4")
    pale = mf("fl_pale", "#fff0f6")
    pod = mf("fl_pod", "#d9b84a")
    seed = mf("fl_seed", "#8a9a3a")
    leaf = mf("fl_leaf", "#4f9a6a")
    prof = ((0.0, 0.45), (0.3, 1.0), (0.7, 0.8), (1.0, 0.03))
    # two round leaves float under it, then three rings of petals opening outward, and the seed pod the rider stands on
    for a, r in ((0.6, 0.75), (3.6, 0.7)):
        cyl((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.0), r, r * 0.96, 0.03, leaf, seg=14)
    for ring, (n, length, width, mat_, z, lift, curl, off) in enumerate(((11, 0.98, 0.5, deep, 0.05, 0.1, 0.28, 0.0), (9, 0.74, 0.44, mid, 0.09, 0.3, 0.34, 0.3), (7, 0.5, 0.34, pale, 0.12, 0.6, 0.3, 0.1))):
        for i in range(n):
            a = off + i / n * math.tau
            blade((math.cos(a) * 0.2, math.sin(a) * 0.2, z), (math.cos(a), math.sin(a), lift), length, width, mat_, thick=0.035, profile=prof, curl=curl, cup=0.22)
    cyl((0, 0, 0.1), 0.3, 0.36, 0.14, pod, seg=14)
    for i in range(7):
        a = i / 7 * math.tau
        ball((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.245), 0.045, seed, outline=False, detail=1)
    ball((0, 0, 0.245), 0.05, seed, outline=False, detail=1)


def build_fly_plain(v, rnd):
    jade = mf("fp_jade", "#7fd0b0")
    gold = mf("fp_gold", "#e8c25a")
    lit = gf("fp_lit", (0.8, 1.0, 0.95))
    cyl((0, 0, 0.1), 0.72, 0.68, 0.07, gold, seg=8)
    cyl((0, 0, 0.13), 0.6, 0.58, 0.06, jade, seg=24)
    cyl((0, 0, 0.19), 0.2, 0.2, 0.012, lit, seg=16).modifiers.clear()
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        ball((math.cos(a) * 0.64, math.sin(a) * 0.64, 0.17), 0.05, gold, detail=1)
        loft([[(math.cos(a + da) * r, math.sin(a + da) * r, 0.192) for da in (-0.12, 0.12)] + [(math.cos(a + da) * (r + 0.03), math.sin(a + da) * (r + 0.03), 0.196) for da in (0.12, -0.12)] for r in (0.34, 0.37)], lit, outline=False)


def build_fly_phoenix(v, rnd):
    gold = mf("fx_gold", "#ffd257")
    amber = mf("fx_amber", "#ff9a2e")
    flame = mf("fx_flame", "#f0602a")
    crimson = mf("fx_crimson", "#cf2f2c")
    beak = mf("fx_beak", "#f6e08a")
    eye = gf("fx_eye", (0.1, 0.06, 0.05))
    teal = gf("fx_teal", (0.3, 0.95, 0.9))
    ramp = (gold, gold, amber, amber, flame, flame, crimson, crimson, crimson)
    # the body lies along +X with a flat back; the neck rises to a crested head
    ball((-0.05, 0, 0.08), 0.3, amber, (1.75, 0.85, 0.62))
    ball((0.05, 0, 0.12), 0.24, gold, (1.5, 0.75, 0.55))
    tube([(0.38, 0, 0.1), (0.62, 0, 0.22), (0.8, 0, 0.42), (0.9, 0, 0.6)], 0.14, 0.085, gold, seg=8)
    ball((0.95, 0, 0.66), 0.12, gold, (1.2, 0.95, 0.95))
    tube([(1.05, 0, 0.66), (1.2, 0, 0.62), (1.3, 0, 0.56)], 0.05, 0.006, beak, seg=6)
    for k in (-1, 1):
        ball((1.0, 0.09 * k, 0.69), 0.025, eye, outline=False, detail=1)
    for i, (lift, ln) in enumerate(((0.9, 0.42), (0.55, 0.5), (0.25, 0.44))):
        blade((0.9, 0, 0.74), (-1.0, 0, lift), ln, 0.09, crimson if i != 1 else flame, thick=0.03, curl=0.25, up=(0, 1, 0))
    # each wing: an arm swept out and a little back, a row of long flight feathers behind it (gold at the root, crimson at the tip) and a row of short coverts over them
    for k in (-1, 1):
        sh = Vector((0.22, 0.2 * k, 0.16))
        tip = Vector((0.12, 1.12 * k, 0.34))
        tube([sh, sh.lerp(tip, 0.5) + Vector((0.08, 0, 0.03)), tip], 0.085, 0.04, gold, seg=6)
        for i in range(9):
            t = i / 8
            root = sh.lerp(tip, t) + Vector((0, 0, -0.01))
            d = Vector((-1.0 + 0.9 * t * t, k * (0.12 + 1.0 * t), 0.02 + 0.08 * t))
            blade(root, d, 0.5 + 0.34 * math.sin(math.pi * (0.2 + 0.8 * t)), 0.2, ramp[i], thick=0.03, curl=0.06)
        for i in range(6):
            t = (i + 0.4) / 6.5
            root = sh.lerp(tip, t) + Vector((0, 0, 0.03))
            d = Vector((-1.0 + 0.8 * t * t, k * (0.1 + 0.8 * t), 0.06))
            blade(root, d, 0.28 + 0.06 * math.sin(math.pi * t), 0.19, gold if i < 3 else amber, thick=0.03)
    # the tail: five long plumes fanned behind, each ending in an eye of light
    for i, a in enumerate((-0.5, -0.25, 0.0, 0.25, 0.5)):
        ln = 1.05 if i == 2 else 0.92 if i in (1, 3) else 0.76
        wig = 0.07 * (1 if i % 2 else -1)
        base = Vector((-0.5, 0.1 * a, 0.08))
        pts = [base + Vector((-math.cos(a) * ln * s_, math.sin(a) * ln * s_ + wig * math.sin(s_ * math.pi * 1.5), 0.2 * s_ * s_ - 0.05 * s_)) for s_ in (0, 0.3, 0.6, 0.85, 1.0)]
        tube(pts, 0.07, 0.03, (flame, amber, crimson, amber, flame)[i], seg=6)
        blade(pts[-1], pts[-1] - pts[-2], 0.22, 0.17, (gold, crimson, gold, crimson, gold)[i], thick=0.03, profile=((0, 0.3), (0.5, 1.0), (1.0, 0.1)))
        ball(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.11 + Vector((0, 0, 0.02)), 0.035, teal, outline=False, detail=1)
    for a in (-0.7, -0.35, 0.0, 0.35, 0.7):
        blade((-0.42, 0.12 * a, 0.1), (-math.cos(a), math.sin(a), 0.04), 0.36, 0.15, gold, thick=0.03)


def dragon_mats():
    return mf("fd_gold", "#eab533"), mf("fd_dark", "#b9791c"), mf("fd_belly", "#fff0b4"), mf("fd_red", "#de4a34"), mf("fd_horn", "#f3ecd2")


def build_fly_dseg(v, rnd, legs=False):
    gold, dark, belly, red, horn = dragon_mats()
    # one length of the body: a scaled back, a pale belly, two bands of scale shadow and a flame of fin on the spine
    ball((0, 0, 0), 0.2, gold, (1.35, 1.0, 1.0))
    ball((0, 0, -0.06), 0.17, belly, (1.3, 0.8, 0.85), outline=False)
    for x in (-0.11, 0.09):
        tube([(x - 0.012, 0, 0.012), (x + 0.012, 0, 0.012)], 0.2, 0.2, dark, seg=12).modifiers.clear()
    blade((0.1, 0, 0.16), (-1.0, 0, 0.75), 0.3, 0.13, red, thick=0.035, up=(0, 1, 0), profile=((0, 1.0), (0.5, 0.7), (1.0, 0.05)))
    if legs:
        for k in (-1, 1):
            knee = Vector((0.1, 0.3 * k, -0.02))
            foot = Vector((0.24, 0.36 * k, -0.24))
            tube([(0.0, 0.14 * k, -0.04), knee, foot], 0.085, 0.05, gold, seg=6)
            for da in (-0.5, 0.0, 0.5):
                tube([foot, foot + Vector((0.13 * math.cos(da), 0.13 * math.sin(da) * 1.0 + 0.02 * k, -0.07))], 0.028, 0.004, horn, seg=5)
            blade((0.05, 0.22 * k, 0.02), (-1.0, 0.5 * k, 0.5), 0.2, 0.08, red, thick=0.03)


def build_fly_dleg(v, rnd):
    build_fly_dseg(v, rnd, legs=True)


def build_fly_dhead(v, rnd):
    gold, dark, belly, red, horn = dragon_mats()
    white = gf("fd_white", (1.0, 0.98, 0.9))
    pupil = gf("fd_pupil", (0.75, 0.1, 0.08))
    # the mane first (it lies behind): flames swept back round the neck
    for a, lift, ln in ((-1.0, 0.1, 0.4), (-0.5, 0.35, 0.5), (0.0, 0.6, 0.56), (0.5, 0.35, 0.5), (1.0, 0.1, 0.4), (-0.75, -0.2, 0.34), (0.75, -0.2, 0.34)):
        blade((-0.12, 0.14 * math.sin(a), 0.06 + 0.06 * math.cos(a)), (-1.0, 0.75 * math.sin(a), lift), ln, 0.16, red, thick=0.04, curl=0.15)
    ball((0, 0, 0.02), 0.25, gold, (1.15, 1.0, 0.9))
    ball((0.32, 0, 0.0), 0.17, gold, (1.55, 0.92, 0.72))  # the snout
    ball((0.27, 0, -0.13), 0.13, belly, (1.6, 0.85, 0.42))  # the jaw
    ball((0.53, 0, 0.03), 0.085, dark, (1.0, 1.25, 0.8))  # the nose
    for k in (-1, 1):
        ball((0.57, 0.05 * k, 0.07), 0.03, dark, detail=1)
        ball((0.14, 0.17 * k, 0.12), 0.075, dark, (1.4, 0.7, 0.7))  # the brow
        ball((0.17, 0.2 * k, 0.07), 0.05, white, outline=False, detail=1)
        ball((0.2, 0.235 * k, 0.07), 0.026, pupil, outline=False, detail=1)
        # an antler: a main beam sweeping back and a tine off it
        tube([(-0.02, 0.12 * k, 0.2), (-0.2, 0.2 * k, 0.4), (-0.42, 0.24 * k, 0.5), (-0.62, 0.22 * k, 0.66)], 0.045, 0.012, horn, seg=6)
        tube([(-0.2, 0.2 * k, 0.4), (-0.22, 0.3 * k, 0.56), (-0.3, 0.36 * k, 0.68)], 0.032, 0.008, horn, seg=6)
        # a whisker: out from the lip, curling up and back
        tube([(0.46, 0.11 * k, -0.02), (0.72, 0.26 * k, 0.02), (0.74, 0.46 * k, 0.16), (0.52, 0.6 * k, 0.26), (0.3, 0.62 * k, 0.2)], 0.024, 0.006, belly, seg=5)
        tube([(0.42, 0.1 * k, -0.2), (0.4, 0.12 * k, -0.27)], 0.022, 0.003, horn, seg=5)  # a fang
        blade((0.0, 0.2 * k, -0.02), (-0.8, k, -0.1), 0.26, 0.12, red, thick=0.035)  # the cheek fin
    for dy in (-0.05, 0.0, 0.05):
        blade((0.2, dy, -0.17), (-0.5, dy * 6, -1.0), 0.24, 0.07, red, thick=0.03, up=(0, 1, 0))  # the beard


def build_fly_dtail(v, rnd):
    gold, dark, belly, red, horn = dragon_mats()
    tube([(0.3, 0, 0), (0.0, 0, 0.0), (-0.28, 0, 0.02)], 0.15, 0.05, gold, seg=8)
    for a, ln in ((-0.9, 0.34), (-0.45, 0.46), (0.0, 0.56), (0.45, 0.46), (0.9, 0.34)):
        blade((-0.22, 0, 0.02), (-math.cos(a), math.sin(a), 0.12), ln, 0.16, red, thick=0.035, curl=0.2)



BUILDERS = {"tree": build_tree, "bush": build_bush, "stump": build_stump, "rock": build_rock, "boulder": build_boulder, "pillar": build_pillar,
            "crystal": build_crystal, "ember": build_ember, "bamboo": build_bamboo, "lantern": build_lantern, "jade": build_jade,
            "sword": build_fly_sword, "cloud": build_fly_cloud, "lotus": build_fly_lotus, "plain": build_fly_plain, "phoenix": build_fly_phoenix,
            "dhead": build_fly_dhead, "dseg": build_fly_dseg, "dleg": build_fly_dleg, "dtail": build_fly_dtail}


def main():
    global OUTLINE
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = F
    scene.render.resolution_percentage = 100
    el = math.radians(CFG["elevationDeg"])
    az = math.radians(CFG["azimuthDeg"])
    OUTLINE = bpy.data.materials.new("outline")
    OUTLINE.use_nodes = True
    nt = OUTLINE.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*CFG["outline"], 1)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], o.inputs["Surface"])
    OUTLINE.use_backface_culling = True

    T = Vector((math.cos(az), math.sin(az), 0))
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = F / PPM
    cd.shift_y = (ANCHOR[1] - F / 2) / F
    cd.shift_x = (ANCHOR[0] - F / 2) / F * -1
    cd.clip_start, cd.clip_end = 0.1, 100
    cam = bpy.data.objects.new("cam", cd)
    scene.collection.objects.link(cam)
    pos = Vector((math.cos(el) * T.x, math.cos(el) * T.y, math.sin(el))) * 20
    cam.location = pos
    cam.rotation_euler = (-pos).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    bpy.context.view_layer.update()
    c = world_to_camera_view(scene, cam, Vector((0, 0, 0)))
    check(abs(c.x * F - ANCHOR[0]) < 0.6 and abs((1 - c.y) * F - ANCHOR[1]) < 0.6, "origin lands at (%.1f, %.1f), wanted %s" % (c.x * F, (1 - c.y) * F, ANCHOR))

    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.5, 0.5, 0.55, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    sd = bpy.data.lights.new("sun", "SUN")
    sd.energy = 3.0
    sun = bpy.data.objects.new("sun", sd)
    scene.collection.objects.link(sun)
    R = (cam.matrix_world.to_3x3() @ Vector((1, 0, 0)))
    R.z = 0
    R.normalize()
    sun.rotation_euler = (-R * 0.6 + T * 0.5 + Vector((0, 0, 0.8))).normalized().to_track_quat("Z", "Y").to_euler()
    engine = next(e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items if e.identifier.startswith("BLENDER_EEVEE"))
    r = scene.render
    r.engine = engine
    r.film_transparent = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"
    scene.eevee.taa_render_samples = 32

    frames, clips, sizes = {}, [], {}
    t0 = time.time()
    keep = {cam, sun}
    for style, count in CFG["styles"].items():
        for v in range(count):
            rnd = random.Random(sum(map(ord, style)) * 31 + v * 977)
            global PROP_K
            PROP_K = CFG.get("scales", {}).get(style, 1.0)
            before = set(bpy.data.objects)
            BUILDERS[style](v, rnd)
            made = [ob for ob in bpy.data.objects if ob not in before]
            if CFG.get("turn"):
                # a prop that is turned: variant v of n faces the ground heading v/n of a turn, measured on screen (0 to the right, a quarter turn towards the viewer)
                ga = v / count * math.tau
                d = R * math.cos(ga) + T * math.sin(ga)
                bpy.context.view_layer.update()
                mat_ = Matrix.Rotation(math.atan2(d.y, d.x), 4, "Z") @ Matrix.Scale(PROP_K, 4)
                for ob in made:
                    ob.matrix_world = mat_ @ ob.matrix_world
            else:
                for ob in made:
                    ob.location = ob.location * PROP_K
                    ob.scale = (PROP_K, PROP_K, PROP_K)
            path = os.path.join(OUT, "frames", "%s_%d.png" % (style, v))
            r.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            img.colorspace_settings.name = "Non-Color"
            img.alpha_mode = "STRAIGHT"
            buf = np.empty(F * F * 4, dtype=np.float32)
            img.pixels.foreach_get(buf)
            bpy.data.images.remove(img)
            arr = buf.reshape(F, F, 4)
            name = "%s_%d" % (style, v)
            frames[name] = arr
            al = arr[:, :, 3] > 0.05
            edges = [n for n, hit in (("bottom", al[0, :].any()), ("top", al[-1, :].any()), ("left", al[:, 0].any()), ("right", al[:, -1].any())) if hit]
            if edges:
                clips.append({"frame": name, "edges": edges})
            ys = np.nonzero(al.any(axis=1))[0]
            xs = np.nonzero(al.any(axis=0))[0]
            sizes[name] = {"w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)} if len(ys) else {"w": 0, "h": 0}
            for ob in [ob for ob in bpy.data.objects if ob not in keep]:
                bpy.data.objects.remove(ob, do_unlink=True)
            for me in [me for me in bpy.data.meshes if me.users == 0]:
                bpy.data.meshes.remove(me)
        log("rendered %s x%d, %.0fs" % (style, count, time.time() - t0))

    # ---- pack (each frame cut to its opaque box) ----
    rects = []
    for name, arr in frames.items():
        al = arr[:, :, 3] > 0.02
        ys = np.nonzero(al.any(axis=1))[0]
        xs = np.nonzero(al.any(axis=0))[0]
        if len(ys) == 0:
            rects.append((name, 0, 0, 1, 1, None))
            continue
        y_lo, y_hi, x_lo, x_hi = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
        rects.append((name, x_lo, F - 1 - y_hi, x_hi - x_lo + 1, y_hi - y_lo + 1, (y_lo, y_hi)))
    order = sorted(range(len(rects)), key=lambda i: (-rects[i][4], -rects[i][3]))

    def shelves(width):
        x = y = row_h = 0
        spots = {}
        for i in order:
            w, h = rects[i][3] + 2, rects[i][4] + 2
            if x + w > width:
                x, y, row_h = 0, y + row_h, 0
            spots[i] = (x, y)
            x += w
            row_h = max(row_h, h)
        return spots, y + row_h

    best = None
    for width in range(256, CFG["atlasMaxPx"] + 1, 32):
        if width < max(r_[3] for r_ in rects) + 2:
            continue
        spots, height = shelves(width)
        if height <= CFG["atlasMaxPx"] and (best is None or width * height < best[0] * best[1]):
            best = (width, height, spots)
    check(best is not None, "the props do not fit one %d px page" % CFG["atlasMaxPx"])
    W, H, spots = best
    atlas = np.zeros((H, W, 4), dtype=np.float32)
    jframes = {}
    for i, (name, x_lo, top, w, h, ys) in enumerate(rects):
        px, py = spots[i]
        if ys is not None:
            y_lo, y_hi = ys
            atlas[H - (py + 1) - h:H - (py + 1), px + 1:px + 1 + w, :] = frames[name][y_lo:y_hi + 1, x_lo:x_lo + w, :]
        jframes[name] = {"frame": {"x": px + 1, "y": py + 1, "w": w, "h": h}, "rotated": False, "trimmed": True, "spriteSourceSize": {"x": x_lo, "y": top, "w": w, "h": h}, "sourceSize": {"w": F, "h": F}}

    def save_array(arr, path):
        im = bpy.data.images.new("tmp", width=arr.shape[1], height=arr.shape[0], alpha=True)
        im.colorspace_settings.name = "Non-Color"
        im.alpha_mode = "STRAIGHT"
        im.pixels.foreach_set(arr.ravel())
        im.filepath_raw = path
        im.file_format = "PNG"
        im.save()
        bpy.data.images.remove(im)

    name = CFG["name"]
    save_array(atlas, os.path.join(OUT, name + ".png"))
    json.dump({"frames": jframes, "meta": {"image": name + ".png", "size": {"w": W, "h": H}, "scale": "1"}}, open(os.path.join(OUT, name + ".json"), "w"))
    json.dump({"atlas": name, "image": name + ".png", "data": name + ".json", "frame": {"w": F, "h": F}, "anchor": {"x": ANCHOR[0], "y": ANCHOR[1]}, "sizes": sizes}, open(os.path.join(OUT, name + ".props.json"), "w"), indent=2)

    # contact sheet: every prop beside a 1.8 m x 1.2 figure mark (a bar 85 px tall) on its tile
    cols = CFG.get("contactCols", 8)
    rows = (len(frames) + cols - 1) // cols
    sheet = np.zeros((rows * F // 2, cols * F // 2, 4), dtype=np.float32)
    sheet[:, :, :3] = 0.5
    sheet[:, :, 3] = 1.0
    for i, (nme, arr) in enumerate(frames.items()):
        small = arr[::2, ::2, :]
        y0 = (rows - 1 - i // cols) * (F // 2)
        x0 = (i % cols) * (F // 2)
        cell = sheet[y0:y0 + F // 2, x0:x0 + F // 2, :]
        a_ = small[:, :, 3:4]
        cell[:, :, :3] = small[:, :, :3] * a_ + cell[:, :, :3] * (1 - a_)
        bx = x0 + ANCHOR[0] // 2 + 40
        sheet[y0 + (F - ANCHOR[1]) // 2:y0 + (F - ANCHOR[1]) // 2 + 42, bx:bx + 3, :3] = (1.0, 0.3, 0.3)
    save_array(sheet, os.path.join(OUT, "contact.png"))
    json.dump({"atlas": {"w": W, "h": H, "frames": len(frames)}, "clips": clips, "sizes": sizes, "seconds": round(time.time() - t0, 1), "blender": bpy.app.version_string}, open(os.path.join(OUT, "report.json"), "w"), indent=2)
    log("atlas %dx%d, %d props, %d touch the box edge" % (W, H, len(frames), len(clips)))


try:
    main()
    open(os.path.join(OUT, "done.marker"), "w").write("ok")
except BaseException:
    tb = traceback.format_exc()
    log(tb)
    open(os.path.join(OUT, "done.marker"), "w").write("error\n" + tb)

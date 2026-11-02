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
        x, y = (0, 0) if i == 0 else ((rnd.random() - 0.5) * scale * 2.2, (rnd.random() - 0.5) * scale * 2.0)
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


BUILDERS = {"tree": build_tree, "bush": build_bush, "stump": build_stump, "rock": build_rock, "boulder": build_boulder, "pillar": build_pillar,
            "crystal": build_crystal, "ember": build_ember, "bamboo": build_bamboo, "lantern": build_lantern, "jade": build_jade}


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
            for ob in [ob for ob in bpy.data.objects if ob not in before]:
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
    cols = 8
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

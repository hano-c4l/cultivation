"""
Renders one rigged glb into a sprite atlas (phase 4b). Run it inside Blender through tools/render/run.mjs:

  blender --background --factory-startup --python render_sprites.py -- <config.json> <out dir> <art root>

The config names its sources relative to the art root (the folder outside the repo that holds the downloaded packs): the rigged model, optionally an
animation file (an FBX whose actions are applied to the model, for rigs that share bone names) and optionally a hairstyle glTF. A config can
"extends" another one (a shallow merge, `anims` and `materials` merged by key).
A "weapon" (an FBX parented to a hand bone) can be added; with `holdout` (the default) every other mesh becomes a holdout, so the frames
hold only the parts of the weapon that the body does not hide: that layer is drawn on top of the body sprite, which plays the same animation. The atlas
is trimmed (each frame cut to its opaque box and packed), the frame names and the source size stay the same, so layers line up.
An outfit (a glTF of modular clothing parts skinned to the same bone names) can be dressed on the model; with `headOnly` the model's own body is
cut away below the neck, so that only its head shows and the clothes do not clip with a bare body.

Writes into <out dir>: frames/*.png (raw frames), <name>.png + <name>.json (atlas, Phaser JSON hash), <name>.sprite.json (the manifest entry),
contact.png (a sheet to look at), report.json, log.txt and, last of all, done.marker holding "ok" or "error" and the traceback.

Every geometric assumption is asserted with numbers (camera, directions, animation actually moving): a wrong setup stops the run instead of
producing 264 plausible-looking wrong frames. The raw frames and the atlas are never written inside the repo.
"""
import bpy, sys, os, json, math, re, time, traceback
import numpy as np
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:]
CFG_PATH, OUT, ART = ARGS[0], ARGS[1], ARGS[2]
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
LOG = open(os.path.join(OUT, "log.txt"), "w", encoding="utf-8")


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.write(s + "\n")
    LOG.flush()


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def load_config(path):
    cfg = json.load(open(path, encoding="utf-8"))
    base = cfg.pop("extends", None)
    if base:
        merged = load_config(base if os.path.isabs(base) else os.path.join(os.path.dirname(path), base))
        for k, v in cfg.items():
            if k in ("anims", "materials", "palette", "source") and isinstance(v, dict):
                merged[k] = {**merged.get(k, {}), **v}
            else:
                merged[k] = v
        return merged
    return cfg


def art(rel):
    return os.path.join(ART, *rel.split("/"))


def main():
    cfg = load_config(CFG_PATH)
    if cfg.get("onlyAnims"):
        cfg["anims"] = {k: v for k, v in cfg["anims"].items() if k in cfg["onlyAnims"]}  # a quick look at a few animations
    F = cfg["frame"]
    anchor = cfg["anchor"]
    el = math.radians(cfg["elevationDeg"])
    az = math.radians(cfg["azimuthDeg"])
    # 1 tile = tileMetres; a tile is 64 px wide, so the ground runs 64/sqrt(2) px per metre along a tile axis.
    ppm = 64.0 / math.sqrt(2) / cfg["tileMetres"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = cfg["source"]
    if src.get("actions"):
        # an animation file: only its actions are wanted (they drive any rig with the same bone names)
        bpy.ops.import_scene.fbx(filepath=art(src["actions"]))
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for a in bpy.data.actions:
            a.use_fake_user = True
            for fc in [f for f in a.fcurves if f.data_path in ("location", "rotation_euler", "rotation_quaternion", "scale")]:
                a.fcurves.remove(fc)  # object-level motion would fight the ground placement done below
    if src["model"].lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=art(src["model"]))
    else:
        bpy.ops.import_scene.gltf(filepath=art(src["model"]))
    rig = bpy.data.objects[cfg["rigName"]] if cfg.get("rigName") else next(o for o in bpy.data.objects if o.type == "ARMATURE")
    if cfg.get("stripObjectCurves"):
        for a in bpy.data.actions:  # the pack animates the armature object itself (scale, location): that would fight the size and the ground placement done below
            for fc in [f for f in a.fcurves if f.data_path in ("location", "rotation_euler", "rotation_quaternion", "scale")]:
                a.fcurves.remove(fc)
        rig.location = (0, 0, 0)  # the pack puts the rig above the ground (the placement below sets the location itself and would drop the figure into it)
    if cfg.get("eyesToBone"):
        # a pack that ships the eyes on a rig of their own (animated by nothing): hang them on a bone of the main rig where they stand now, so they follow the head
        bpy.context.view_layer.update()
        for other in [o for o in bpy.data.objects if o.type == "ARMATURE" and o is not rig]:
            for child in [c for c in bpy.data.objects if c.parent is other]:
                for m in [m for m in child.modifiers if m.type == "ARMATURE"]:
                    child.modifiers.remove(m)
                world = child.matrix_world.copy()
                child.parent = rig
                child.parent_type = "BONE"
                child.parent_bone = cfg["eyesToBone"]
                child.matrix_world = world
            bpy.data.objects.remove(other, do_unlink=True)
    for name in cfg.get("removeObjects", []):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    if src.get("outfit"):
        before_o = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=art(src["outfit"]))
        for o in [o for o in bpy.data.objects if o not in before_o]:
            if o.type == "MESH" and o.modifiers and o.modifiers[0].type == "ARMATURE":
                o.parent = rig
                o.modifiers[0].object = rig
        for o in [o for o in bpy.data.objects if o not in before_o and (o.type == "ARMATURE" or o.name.startswith("Icosphere"))]:
            bpy.data.objects.remove(o, do_unlink=True)
    if cfg.get("headOnly"):
        # keep the vertices the head and neck bones own (weight 0.5 or more) and drop the rest of the body
        import bmesh
        bodyobj = bpy.data.objects[cfg["bodyMesh"]]
        keep = {g.index for g in bodyobj.vertex_groups if g.name in cfg["headBones"]}
        bm = bmesh.new()
        bm.from_mesh(bodyobj.data)
        lay = bm.verts.layers.deform.active
        drop = [v for v in bm.verts if sum(w for gi, w in v[lay].items() if gi in keep) < 0.5]
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
        bm.to_mesh(bodyobj.data)
        bm.free()
        log("body cut to the head: %d vertices dropped" % len(drop))
    if src.get("hair"):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=art(src["hair"]))
        for o in [o for o in bpy.data.objects if o not in before]:
            if o.type == "MESH" and o.modifiers and o.modifiers[0].type == "ARMATURE":
                o.parent = rig  # the hair is skinned to the same bone names: point it at the model's skeleton
                o.modifiers[0].object = rig
        for o in [o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"]:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in bpy.data.objects if o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o, do_unlink=True)  # every pack ships a little reference sphere
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = F  # before the camera maths: world_to_camera_view and the lens shift read the aspect
    scene.render.resolution_percentage = 100
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    body = bpy.data.objects[cfg["bodyMesh"]]
    rig.rotation_mode = "XYZ"  # the importer leaves objects in quaternion mode, where rotation_euler would do nothing
    ad = rig.animation_data or rig.animation_data_create()
    for t in list(ad.nla_tracks):  # the importer stashes every action in an NLA track; they would fight the one assigned below
        ad.nla_tracks.remove(t)

    # ---- the direction the model faces, from its own rest pose (heel -> toe) ----
    if cfg.get("forward"):
        fwd = Vector((cfg["forward"][0], cfg["forward"][1], 0))  # a model with no feet to read it from: the world direction it faces as imported
    else:
        b0, b1 = (rig.data.bones[n] for n in cfg["forwardBones"])
        fwd = rig.matrix_world.to_3x3() @ (b1.head_local - b0.head_local)
    fwd.z = 0
    check(fwd.length > 0.01, "cannot tell which way the model faces")
    fwd.normalize()
    log("model forward", tuple(round(x, 3) for x in fwd))

    # ---- materials: two colours, toon-shaded, plus an inverted-hull outline ----
    pal = cfg["palette"]
    levels = cfg["toonLevels"]

    def toon(mat, rgb, vertex=False, image=None):
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        # one stop per toon level; the stops are the shade multipliers
        while len(ramp.color_ramp.elements) < len(levels):
            ramp.color_ramp.elements.new(0.5)
        for i, e in enumerate(ramp.color_ramp.elements):
            e.position = i / len(levels) if i else 0.0
            e.color = (levels[i], levels[i], levels[i], 1)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        mix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1)
        if image is not None:
            # the clothes keep the colours of their texture; the base colour tints them
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = image
            tex.interpolation = "Linear"
            tmix = nt.nodes.new("ShaderNodeMix")
            tmix.data_type = "RGBA"
            tmix.blend_type = "MULTIPLY"
            tmix.inputs[0].default_value = 1.0
            tmix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1)
            nt.links.new(tex.outputs["Color"], tmix.inputs[6])
            nt.links.new(tmix.outputs[2], mix.inputs[7])
        if vertex:
            # the mesh paints its own regions (skin, suit...) in its vertex colours: they multiply the base colour
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vmix = nt.nodes.new("ShaderNodeMix")
            vmix.data_type = "RGBA"
            vmix.blend_type = "MULTIPLY"
            vmix.inputs[0].default_value = 1.0
            vmix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1)
            nt.links.new(vc.outputs["Color"], vmix.inputs[6])
            nt.links.new(vmix.outputs[2], mix.inputs[7])
        emit = nt.nodes.new("ShaderNodeEmission")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
        nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    mats = cfg.get("materials", {})
    done = set()
    for mesh in meshes:
        for slot in mesh.material_slots:
            m = slot.material
            if m.name in done:
                continue
            done.add(m.name)
            key = re.sub(r"\.\d{3}$", "", m.name)  # a second import of the same material is named "<name>.001"
            spec = mats.get(key)
            rgb = spec["color"] if isinstance(spec, dict) else pal.get(key)
            if rgb is None and cfg.get("autoColors"):
                rgb = list(m.diffuse_color)[:3]  # the pack's own colour for the material, times the species tint
                if m.use_nodes and m.node_tree:
                    for nd in m.node_tree.nodes:
                        if nd.type == "BSDF_PRINCIPLED":
                            rgb = list(nd.inputs["Base Color"].default_value)[:3]
                tint = cfg["autoColors"] if isinstance(cfg["autoColors"], list) else [1, 1, 1]
                rgb = [rgb[0] * tint[0], rgb[1] * tint[1], rgb[2] * tint[2]]
            check(rgb is not None, "no colour for material %s" % m.name)
            image = None
            if isinstance(spec, dict) and spec.get("texture") and m.node_tree:
                for nd in m.node_tree.nodes:
                    if nd.type == "TEX_IMAGE" and nd.image and "BaseColor" in nd.image.name:
                        image = nd.image
                        break
                check(image is not None, "material %s has no BaseColor texture" % m.name)
            toon(m, rgb, bool(isinstance(spec, dict) and spec.get("vertexColor")), image)
    outline = bpy.data.materials.new("outline")
    outline.use_nodes = True
    nt = outline.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*pal["outline"], 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    outline.use_backface_culling = True
    fs = cfg["figureScale"]  # a person of 1.8 m would be 70 px tall; scaled down so a lying body (the death animation) and raised arms stay inside the box
    rig.scale = (fs, fs, fs)
    outline_names = cfg.get("outlineMeshes", [cfg["bodyMesh"]])
    if outline_names == "all":
        outline_names = [o.name for o in meshes if o.name not in cfg.get("noOutline", [])]
    for name in outline_names:
        mesh = bpy.data.objects[name]
        n_slots = len(mesh.material_slots)
        for _ in range(n_slots):  # the shell uses material index + offset, so the outline material must cover every index
            mesh.data.materials.append(outline)
        sol = mesh.modifiers.new("outline", "SOLIDIFY")  # after the Armature modifier, so it follows the pose
        check(list(mesh.modifiers).index(sol) > 0 and mesh.modifiers[0].type == "ARMATURE", "the outline must come after the Armature modifier (%s: %s)" % (mesh.name, [m.type for m in mesh.modifiers]))
        sol.thickness = cfg["outlinePx"] / ppm / fs  # in the mesh's own units
        sol.offset = 1.0
        sol.use_flip_normals = True
        sol.material_offset = n_slots
        sol.use_rim = False
        if mesh is body:
            body_sol = sol

    # ---- a weapon in the hand ----
    weapon_objs = []
    wcfg = cfg.get("weapon")
    if wcfg:
        before_w = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=art(wcfg["model"]))
        new = [o for o in bpy.data.objects if o not in before_w]
        weapon_objs = [o for o in new if o.type == "MESH"]
        check(weapon_objs, "the weapon file has no mesh")
        for o in [o for o in new if o.type != "MESH"]:
            bpy.data.objects.remove(o, do_unlink=True)
        for w in weapon_objs:
            w.parent = rig
            w.parent_type = "BONE"
            w.parent_bone = wcfg["bone"]
            w.matrix_parent_inverse = Matrix.Identity(4)
            # the file's own size is unknown (units differ between packs): scale so that the longest side is `length` metres in the world
            w.scale = (1, 1, 1)
            bpy.context.view_layer.update()
            dims = tuple(w.dimensions)
            bb = [tuple(c) for c in w.bound_box]
            log("weapon mesh %s: dimensions %s, local box x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f" % (w.name, tuple(round(d, 3) for d in dims), min(b[0] for b in bb), max(b[0] for b in bb), min(b[1] for b in bb), max(b[1] for b in bb), min(b[2] for b in bb), max(b[2] for b in bb)))
            if wcfg.get("length"):
                wcfg["scale"] = wcfg["length"] / (max(dims) * fs)
            w.rotation_mode = "XYZ"
            w.location = wcfg.get("location", [0, 0, 0])
            w.rotation_euler = [math.radians(a) for a in wcfg.get("rotationDeg", [0, 0, 0])]
            k = wcfg.get("scale", 1.0)
            w.scale = (k, k, k)
            for slot in w.material_slots:
                m = slot.material
                col = list(m.diffuse_color)[:3]
                if m.use_nodes and m.node_tree:
                    for nd in m.node_tree.nodes:
                        if nd.type == "BSDF_PRINCIPLED":
                            col = list(nd.inputs["Base Color"].default_value)[:3]
                tint = wcfg.get("tint", [1, 1, 1])
                toon(m, [col[0] * tint[0], col[1] * tint[1], col[2] * tint[2]])
            n_w = len(w.material_slots)
            for _ in range(n_w):
                w.data.materials.append(outline)
            wsol = w.modifiers.new("outline", "SOLIDIFY")
            wsol.thickness = cfg["outlinePx"] / ppm / fs / k
            wsol.offset = 1.0
            wsol.use_flip_normals = True
            wsol.material_offset = n_w
            wsol.use_rim = False
        if cfg.get("holdout", True):
            for o in meshes:
                o.is_holdout = True  # the body hides the parts of the weapon behind it, and is itself not drawn in this layer
        log("weapon %s on %s, holdout %s" % (wcfg["model"], wcfg["bone"], cfg.get("holdout", True)))

    # ---- camera ----
    T = Vector((math.cos(az), math.sin(az), 0))  # on the ground, toward the viewer = down the screen
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = F / ppm
    cam_data.shift_y = (anchor[1] - F / 2) / F
    cam_data.shift_x = (anchor[0] - F / 2) / F * -1  # an anchor right of centre moves the view left
    cam_data.clip_start, cam_data.clip_end = 0.1, 100
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    pos = Vector((math.cos(el) * T.x, math.cos(el) * T.y, math.sin(el))) * 20
    cam.location = pos
    cam.rotation_euler = (-pos).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    bpy.context.view_layer.update()
    R = (cam.matrix_world.to_3x3() @ Vector((1, 0, 0)))
    R.z = 0
    R.normalize()
    tile_x = ((R + T) / math.sqrt(2)).normalized()   # world direction of tile +x (screen: right and down)
    tile_y = ((-R + T) / math.sqrt(2)).normalized()  # tile +y (screen: left and down)

    def to_px(p):
        c = world_to_camera_view(scene, cam, Vector(p))
        return Vector((c.x * F, (1 - c.y) * F))

    o_px = to_px((0, 0, 0))
    check(abs(o_px.x - anchor[0]) < 0.6 and abs(o_px.y - anchor[1]) < 0.6, "origin lands at %s, wanted %s" % (tuple(o_px), anchor))
    dx = to_px(tile_x * cfg["tileMetres"]) - o_px
    dy = to_px(tile_y * cfg["tileMetres"]) - o_px
    check(abs(dx.x - 32) < 0.6 and abs(dx.y - 16) < 0.6, "tile +x projects to %s, wanted (32, 16)" % (tuple(dx),))
    check(abs(dy.x + 32) < 0.6 and abs(dy.y - 16) < 0.6, "tile +y projects to %s, wanted (-32, 16)" % (tuple(dy),))
    log("camera ok: origin", tuple(round(v, 2) for v in o_px), "tile x", tuple(round(v, 2) for v in dx), "tile y", tuple(round(v, 2) for v in dy))

    # ---- light and render settings (the model turns, the light and the camera never do) ----
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.5, 0.5, 0.55, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    toward_light = (-R * 0.6 + T * 0.5 + Vector((0, 0, 0.8))).normalized()  # from upper left, a little in front
    sun.rotation_euler = toward_light.to_track_quat("Z", "Y").to_euler()
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    engine = next(e for e in engines if e.startswith("BLENDER_EEVEE"))
    r = scene.render
    r.engine = engine
    r.resolution_x = r.resolution_y = F
    r.resolution_percentage = 100
    r.film_transparent = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"
    scene.eevee.taa_render_samples = 32
    log("engine", engine, "blender", bpy.app.version_string)

    # ---- the ground: the lowest point of the figure in the first idle pose stands on z = 0 (the same lift for every frame of the sprite) ----
    first = bpy.data.actions[cfg.get("actionPrefix", "") + next(iter(cfg["anims"].values()))["action"]]
    ad.action = first
    if hasattr(ad, "action_slot") and first.slots:
        ad.action_slot = first.slots[0]
    scene.frame_set(int(first.frame_range[0]))
    bpy.context.view_layer.update()
    lowest = 1e9
    for mesh in meshes:
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
        mw = np.array(ev.matrix_world)
        if len(co):
            lowest = min(lowest, float((co.reshape(-1, 3) @ mw[2, :3] + mw[2, 3]).min()))
    lift = -(lowest - body_sol.thickness * fs)  # the outline shell is not a part of the foot
    log("lifting the figure by %.3f m so its feet stand on the ground" % lift)

    # ---- render every animation, direction and frame ----
    frames = {}      # name -> raw frame array (bottom-up RGBA floats)
    meta = {}        # anim -> {frames, fps, loop}
    clips = []       # frames with opaque pixels touching the edge of the box
    drift = {}
    t0 = time.time()
    for anim, a in cfg["anims"].items():
        act = bpy.data.actions[cfg.get("actionPrefix", "") + a["action"]]
        ad.action = act
        if hasattr(ad, "action_slot") and act.slots:
            ad.action_slot = act.slots[0]
        start, end = act.frame_range
        if a.get("range"):  # only a part of the action (fractions of it): Sword_Attack is a wind-up swing, a reset and then the real forward slash
            span0 = end - start
            start, end = start + span0 * a["range"][0], start + span0 * a["range"][1]
        n = a["frames"]
        span = end - start
        times = [start + i * span / n for i in range(n)] if a["loop"] else [start + i * span / (n - 1) for i in range(n)]
        duration = span / cfg["sourceFps"]
        fps = max(1, min(60, round((n if a["loop"] else n - 1) / duration))) if duration > 0 else 6
        meta[anim] = {"frames": n, "fps": fps, "loop": a["loop"]}
        # the pose must really change between frames, or the whole animation would be one T-pose
        posed = []
        for t in (times[0], times[n // 2]):
            scene.frame_set(int(t), subframe=t - int(t))
            bpy.context.view_layer.update()
            posed.append([tuple(pb.matrix.translation) for pb in rig.pose.bones])
        moved = max(sum(abs(u - v) for u, v in zip(p, q)) for p, q in zip(posed[0], posed[1]))
        log("animation %s (%s) moves up to %.4f m between two samples" % (anim, a["action"], moved))
        check(moved > 1e-4, "animation %s does not move (%s)" % (anim, a["action"]))  # identical poses would give exactly 0
        # Root motion is cancelled: the hips stay over the same ground point for the whole animation (the game moves the actor, the sprite stays put).
        scene.frame_set(int(times[0]), subframe=times[0] - int(times[0]))
        bpy.context.view_layer.update()
        hips = rig.pose.bones[cfg.get("hipsBone", "DEF-hips")]
        h0 = hips.matrix.translation.copy()
        worst_drift = 0.0
        for d, vec in enumerate(cfg["directions"]):
            g = (tile_x * vec[0] + tile_y * vec[1]).normalized()
            rig.rotation_euler = (0, 0, math.atan2(g.y, g.x) - math.atan2(fwd.y, fwd.x))
            bpy.context.view_layer.update()
            # direction check: one metre ahead of the model must go the way the tile vector goes on screen
            ahead = rig.matrix_world.to_3x3() @ fwd
            sv = to_px(ahead) - o_px
            want = Vector((vec[0] - vec[1], (vec[0] + vec[1]) / 2.0))
            ang = math.degrees(math.acos(max(-1, min(1, sv.normalized().dot(want.normalized())))))
            check(ang < 2.0, "direction %d: the model's front points %.1f degrees off the wanted screen heading" % (d, ang))
            for i, t in enumerate(times):
                scene.frame_set(int(t), subframe=t - int(t))
                bpy.context.view_layer.update()
                h = hips.matrix.translation
                worst_drift = max(worst_drift, math.hypot(h.x - h0.x, h.y - h0.y))
                rig.location = -(Matrix.Rotation(rig.rotation_euler.z, 3, "Z") @ Vector((h.x - h0.x, h.y - h0.y, 0)) * fs) + Vector((0, 0, lift))
                if weapon_objs and d == 0:  # how far ahead of the hand the blade points, per frame (1 = straight out in front, -1 = straight back)
                    w0 = weapon_objs[0]
                    hand = (rig.matrix_world @ rig.pose.bones[wcfg["bone"]].head)
                    tips = [w0.matrix_world @ Vector(c) for c in w0.bound_box]
                    tip = max(tips, key=lambda v: (v - hand).length)
                    bv = (tip - hand).normalized()
                    log("blade %s %02d: forward %.2f up %.2f" % (anim, i, bv.dot(ahead), bv.z))
                name = "%s_%d_%02d" % (anim, d, i)
                path = os.path.join(OUT, "frames", name + ".png")
                r.filepath = path
                bpy.ops.render.render(write_still=True)
                img = bpy.data.images.load(path)
                img.colorspace_settings.name = "Non-Color"
                img.alpha_mode = "STRAIGHT"
                buf = np.empty(F * F * 4, dtype=np.float32)
                img.pixels.foreach_get(buf)
                bpy.data.images.remove(img)
                arr = buf.reshape(F, F, 4)
                frames[name] = arr
                al = arr[:, :, 3] > 0.05
                edges = [n_ for n_, hit in (("bottom", al[0, :].any()), ("top", al[-1, :].any()), ("left", al[:, 0].any()), ("right", al[:, -1].any())) if hit]
                if edges:
                    clips.append({"frame": name, "edges": edges})
        rig.location = (0, 0, lift)
        log("root motion removed for %s: up to %.2f m of drift" % (anim, worst_drift))
        log("rendered %s: %d frames x %d directions, %.1f fps, %.0fs elapsed" % (anim, n, len(cfg["directions"]), fps, time.time() - t0))

    # ---- how tall the figure stands (idle frames): the game puts the name above this ----
    head = 0
    for name, arr in frames.items():
        if not name.startswith("idle_"):
            continue
        ys = np.nonzero(arr[:, :, 3] > 0.05)[0]
        if len(ys):
            head = max(head, anchor[1] - (F - 1 - int(ys.max())))
    check(head > 8 or wcfg, "could not measure the height of the figure")
    log("head is %d px above the feet" % head)

    # ---- the atlas: every frame cut to its opaque box, 1 px of clear border, packed in shelves on the narrowest page that is shortest ----
    rects = []  # (name, x0, top, w, h) of the opaque box in the frame (top-down), or a 1 x 1 clear pixel when nothing is drawn
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
    for width in range(128, cfg["atlasMaxPx"] + 1, 32):
        if width < max(r[3] for r in rects) + 2:
            continue
        spots, height = shelves(width)
        if height <= cfg["atlasMaxPx"] and (best is None or width * height < best[0] * best[1]):
            best = (width, height, spots)
    check(best is not None, "%d frames do not fit one %d px page" % (len(rects), cfg["atlasMaxPx"]))
    W, H, spots = best
    atlas = np.zeros((H, W, 4), dtype=np.float32)
    jframes = {}
    for i, (name, x_lo, top, w, h, ys) in enumerate(rects):
        px, py = spots[i]
        if ys is not None:
            y_lo, y_hi = ys
            crop = frames[name][y_lo:y_hi + 1, x_lo:x_lo + w, :]
            y0 = H - (py + 1) - h  # the arrays are bottom-up
            atlas[y0:y0 + h, px + 1:px + 1 + w, :] = crop
        jframes[name] = {"frame": {"x": px + 1, "y": py + 1, "w": w, "h": h}, "rotated": False, "trimmed": True, "spriteSourceSize": {"x": x_lo, "y": top, "w": w, "h": h}, "sourceSize": {"w": F, "h": F}}
    log("atlas %dx%d for %d frames (%.0f%% of the untrimmed %dx%d)" % (W, H, len(rects), 100.0 * W * H / (F * F * len(rects)), F, F))
    img_name = cfg["name"] + ".png"

    def save_array(arr, path):
        im = bpy.data.images.new("tmp", width=arr.shape[1], height=arr.shape[0], alpha=True)
        im.colorspace_settings.name = "Non-Color"
        im.alpha_mode = "STRAIGHT"
        im.pixels.foreach_set(arr.ravel())
        im.filepath_raw = path
        im.file_format = "PNG"
        im.save()
        bpy.data.images.remove(im)

    save_array(atlas, os.path.join(OUT, img_name))
    json.dump({"frames": jframes, "meta": {"image": img_name, "size": {"w": W, "h": H}, "scale": "1"}}, open(os.path.join(OUT, cfg["name"] + ".json"), "w"))
    json.dump({"key": cfg["spriteKey"], "atlas": cfg["name"], "image": img_name, "data": cfg["name"] + ".json", "frame": {"w": F, "h": F}, "anchor": {"x": anchor[0], "y": anchor[1]}, "head": head, "anims": meta},
              open(os.path.join(OUT, cfg["name"] + ".sprite.json"), "w"), indent=2)

    # ---- a contact sheet to look at: the middle frame of each animation in the 8 directions, 2x, with the 64x32 tile under the feet ----
    anim_names = list(cfg["anims"].keys())
    sheet = np.full((len(anim_names) * F, len(cfg["directions"]) * F, 4), 1.0, dtype=np.float32)
    sheet[:, :, :3] = 0.36
    for ri, an in enumerate(anim_names):
        for d in range(len(cfg["directions"])):
            cell = np.zeros((F, F, 4), dtype=np.float32)
            cell[:, :, :3] = 0.36
            cell[:, :, 3] = 1.0
            for (ax, ay), (bx, by) in (((0, -16), (32, 0)), ((32, 0), (0, 16)), ((0, 16), (-32, 0)), ((-32, 0), (0, -16))):  # the tile diamond, bottom-up rows
                for s in range(33):
                    px = int(round(anchor[0] + ax + (bx - ax) * s / 32))
                    py = int(round((F - anchor[1]) + ay + (by - ay) * s / 32))
                    if 0 <= px < F and 0 <= py < F:
                        cell[py, px, :3] = 0.6
            fr = frames["%s_%d_%02d" % (an, d, cfg["anims"][an]["frames"] // 2)]
            a_ = fr[:, :, 3:4]
            cell[:, :, :3] = fr[:, :, :3] * a_ + cell[:, :, :3] * (1 - a_)
            y0 = (len(anim_names) - 1 - ri) * F
            sheet[y0:y0 + F, d * F:(d + 1) * F, :] = cell
    sheet = np.repeat(np.repeat(sheet, 2, axis=0), 2, axis=1)
    save_array(sheet, os.path.join(OUT, "contact.png"))

    json.dump({"atlas": {"w": W, "h": H, "frames": len(rects)}, "clips": clips, "anims": meta, "seconds": round(time.time() - t0, 1), "blender": bpy.app.version_string, "engine": engine},
              open(os.path.join(OUT, "report.json"), "w"), indent=2)
    log("atlas %dx%d, %d frames, %d frames touch the box edge" % (W, H, len(rects), len(clips)))


try:
    main()
    open(os.path.join(OUT, "done.marker"), "w").write("ok")
except BaseException:
    tb = traceback.format_exc()
    log(tb)
    open(os.path.join(OUT, "done.marker"), "w").write("error\n" + tb)

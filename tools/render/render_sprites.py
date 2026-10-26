"""
Renders one rigged glb into a sprite atlas (phase 4b). Run it inside Blender through tools/render/run.mjs:

  blender --background --factory-startup --python render_sprites.py -- <config.json> <model.glb> <out dir>

Writes into <out dir>: frames/*.png (raw frames), <name>.png + <name>.json (atlas, Phaser JSON hash), <name>.sprite.json (the manifest entry),
contact.png (a sheet to look at), report.json, log.txt and, last of all, done.marker holding "ok" or "error" and the traceback.

Every geometric assumption is asserted with numbers (camera, directions, animation actually moving): a wrong setup stops the run instead of
producing 264 plausible-looking wrong frames. The raw frames and the atlas are never written inside the repo.
"""
import bpy, sys, os, json, math, time, traceback
import numpy as np
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:]
CFG_PATH, GLB, OUT = ARGS[0], ARGS[1], ARGS[2]
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
LOG = open(os.path.join(OUT, "log.txt"), "w", encoding="utf-8")


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.write(s + "\n")
    LOG.flush()


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    cfg = json.load(open(CFG_PATH, encoding="utf-8"))
    F = cfg["frame"]
    anchor = cfg["anchor"]
    el = math.radians(cfg["elevationDeg"])
    az = math.radians(cfg["azimuthDeg"])
    # 1 tile = tileMetres; a tile is 64 px wide, so the ground runs 64/sqrt(2) px per metre along a tile axis.
    ppm = 64.0 / math.sqrt(2) / cfg["tileMetres"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = F  # before the camera maths: world_to_camera_view and the lens shift read the aspect
    scene.render.resolution_percentage = 100
    for name in cfg["removeObjects"]:
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    check(len(meshes) == 1, "expected exactly one mesh, got %s" % [m.name for m in meshes])
    body = meshes[0]
    rig.rotation_mode = "XYZ"  # the importer leaves objects in quaternion mode, where rotation_euler would do nothing
    ad = rig.animation_data
    for t in list(ad.nla_tracks):  # the importer stashes every action in an NLA track; they would fight the one assigned below
        ad.nla_tracks.remove(t)

    # ---- the direction the model faces, from its own rest pose (heel -> toe) ----
    b0, b1 = (rig.data.bones[n] for n in cfg["forwardBones"])
    fwd = rig.matrix_world.to_3x3() @ (b1.head_local - b0.head_local)
    fwd.z = 0
    check(fwd.length > 0.01, "cannot tell which way the model faces")
    fwd.normalize()
    log("model forward", tuple(round(x, 3) for x in fwd))

    # ---- materials: two colours, toon-shaded, plus an inverted-hull outline ----
    pal = cfg["palette"]
    levels = cfg["toonLevels"]

    def toon(mat, rgb):
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
        emit = nt.nodes.new("ShaderNodeEmission")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
        nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    for slot in body.material_slots:
        rgb = pal.get(slot.material.name)
        check(rgb is not None, "no palette entry for material %s" % slot.material.name)
        toon(slot.material, rgb)
    n_slots = len(body.material_slots)
    outline = bpy.data.materials.new("outline")
    outline.use_nodes = True
    nt = outline.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*pal["outline"], 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    outline.use_backface_culling = True
    for _ in range(n_slots):  # the shell uses material index + offset, so the outline material must cover every index
        body.data.materials.append(outline)
    sol = body.modifiers.new("outline", "SOLIDIFY")  # after the Armature modifier, so it follows the pose
    check(list(body.modifiers).index(sol) > 0 and body.modifiers[0].type == "ARMATURE", "the outline must come after the Armature modifier")
    fs = cfg["figureScale"]  # a person of 1.8 m would be 70 px tall; scaled down so a lying body (the death animation) and raised arms stay inside the box
    rig.scale = (fs, fs, fs)
    sol.thickness = cfg["outlinePx"] / ppm / fs  # in the mesh's own units
    sol.offset = 1.0
    sol.use_flip_normals = True
    sol.material_offset = n_slots
    sol.use_rim = False

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
    first = bpy.data.actions[next(iter(cfg["anims"].values()))["action"]]
    ad.action = first
    if hasattr(ad, "action_slot") and first.slots:
        ad.action_slot = first.slots[0]
    scene.frame_set(int(first.frame_range[0]))
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    mw = np.array(ev.matrix_world)
    zw = co.reshape(-1, 3) @ mw[2, :3] + mw[2, 3]
    lift = -float(zw.min() - sol.thickness * fs)  # the outline shell is not a part of the foot
    log("lifting the figure by %.3f m so its feet stand on the ground" % lift)

    # ---- render every animation, direction and frame ----
    frames = {}      # name -> raw frame array (bottom-up RGBA floats)
    meta = {}        # anim -> {frames, fps, loop}
    clips = []       # frames with opaque pixels touching the edge of the box
    drift = {}
    t0 = time.time()
    for anim, a in cfg["anims"].items():
        act = bpy.data.actions[a["action"]]
        ad.action = act
        if hasattr(ad, "action_slot") and act.slots:
            ad.action_slot = act.slots[0]
        start, end = act.frame_range
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
        hips = rig.pose.bones["DEF-hips"]
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

    # ---- the atlas ----
    cols = cfg["atlasMaxPx"] // F
    names = list(frames.keys())
    rows = -(-len(names) // cols)
    check(rows * F <= cfg["atlasMaxPx"], "%d frames do not fit one %d px page" % (len(names), cfg["atlasMaxPx"]))
    W, H = cols * F, rows * F
    atlas = np.zeros((H, W, 4), dtype=np.float32)
    jframes = {}
    for k, name in enumerate(names):
        c, rw = k % cols, k // cols
        x, y_top = c * F, rw * F
        y0 = H - y_top - F  # the arrays are bottom-up
        atlas[y0:y0 + F, x:x + F, :] = frames[name]
        jframes[name] = {"frame": {"x": x, "y": y_top, "w": F, "h": F}, "rotated": False, "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F}, "sourceSize": {"w": F, "h": F}}
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
    json.dump({"key": cfg["spriteKey"], "atlas": cfg["name"], "image": img_name, "data": cfg["name"] + ".json", "frame": {"w": F, "h": F}, "anchor": {"x": anchor[0], "y": anchor[1]}, "anims": meta},
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

    json.dump({"atlas": {"w": W, "h": H, "frames": len(names)}, "clips": clips, "anims": meta, "seconds": round(time.time() - t0, 1), "blender": bpy.app.version_string, "engine": engine},
              open(os.path.join(OUT, "report.json"), "w"), indent=2)
    log("atlas %dx%d, %d frames, %d frames touch the box edge" % (W, H, len(names), len(clips)))


try:
    main()
    open(os.path.join(OUT, "done.marker"), "w").write("ok")
except BaseException:
    tb = traceback.format_exc()
    log(tb)
    open(os.path.join(OUT, "done.marker"), "w").write("error\n" + tb)

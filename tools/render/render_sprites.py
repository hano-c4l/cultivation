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



# ---- generated clothing (a robe built from rings and tubes, skinned by hand to the rig's own bones) ----
def _clamp01(x):
    return max(0.0, min(1.0, x))


def add_generated(rig, spec):
    """
    Dresses the rig in a long xianxia robe made in code: a flared skirt, a wrapped top, wide sleeves, a sash with two ribbons and trims. Every vertex
    gets its weights from where it is (height along the spine, side for the legs, distance along the arm), so it moves with the body; the rest pose is a T-pose.
    `spec` has `parts` (a list of names) and the materials `robe`, `trim`, `sash`; sizes scale with `scale`.
    """
    import bmesh
    B = rig.data.bones
    head = lambda n: B[n].head_local
    spine = [("pelvis", head("pelvis").z), ("spine_01", head("spine_01").z), ("spine_02", head("spine_02").z), ("spine_03", head("spine_03").z), ("neck_01", head("neck_01").z)]
    waist = head("pelvis").z + 0.03
    hem = spec.get("hemZ", 0.16)
    k = spec.get("scale", 1.0)  # a wider body (the male one) widens the garments

    def spine_w(z):
        if z <= spine[0][1]:
            return {"pelvis": 1.0}
        for (b0, z0), (b1, z1) in zip(spine, spine[1:]):
            if z <= z1:
                t = (z - z0) / (z1 - z0)
                return {b0: 1 - t, b1: t}
        return {"neck_01": 1.0}

    def leg_w(x, t, down):
        """The skirt: the pelvis near the waist, the thighs (by side) further down."""
        side_l = _clamp01(0.5 + x / 0.16)
        leg = down * t
        return {"pelvis": 1 - leg, "thigh_l": leg * side_l, "thigh_r": leg * (1 - side_l)}

    def build(name, mat, pts, faces, weights):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        bm.verts.ensure_lookup_table()
        for f in faces:
            try:
                bm.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = rig
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        me.materials.append(mat)
        groups = {}
        for i, w in enumerate(weights):
            tot = sum(w.values())
            check(tot > 0, "%s: vertex %d has no weight" % (name, i))
            for bone, val in w.items():
                if val <= 1e-4:
                    continue
                g = groups.get(bone) or ob.vertex_groups.new(name=bone)
                groups[bone] = g
                g.add([i], val / tot, "REPLACE")
        return ob

    def ring_faces(n_rings, n_seg):
        faces = []
        for r in range(n_rings - 1):
            for a in range(n_seg):
                a2 = (a + 1) % n_seg
                faces.append((r * n_seg + a, r * n_seg + a2, (r + 1) * n_seg + a2, (r + 1) * n_seg + a))
        return faces

    def lathe(name, mat, zs, rx_of, ry_of, cx, cy, weight_of, n_seg=24):
        pts, ws = [], []
        for zi, z in enumerate(zs):
            t = zi / (len(zs) - 1)
            for a in range(n_seg):
                ang = a / n_seg * math.tau
                x = cx + math.cos(ang) * rx_of(t)
                y = cy + math.sin(ang) * ry_of(t)
                pts.append((x, y, z))
                ws.append(weight_of(x, z, t))
        return build(name, mat, pts, ring_faces(len(zs), n_seg), ws)

    def tube(name, mat, axis_pts, radius_of, weight_of, n_seg=14):
        pts, ws = [], []
        for ti, (px, py, pz) in enumerate(axis_pts):
            t = ti / (len(axis_pts) - 1)
            r = radius_of(t)
            for a in range(n_seg):
                ang = a / n_seg * math.tau
                pts.append((px, py + math.cos(ang) * r, pz + math.sin(ang) * r))
                ws.append(weight_of(px, t))
        return build(name, mat, pts, ring_faces(len(axis_pts), n_seg), ws)

    robe, trim, sash = spec["robe"], spec["trim"], spec["sash"]
    parts = spec.get("parts", [])
    cy = 0.03
    if "skirt" in parts:
        zs = [waist - (waist - hem) * i / 9 for i in range(10)]
        f0, f1 = spec.get("flare0", 0.19), spec.get("flare1", 0.40)
        flare = lambda t: f0 * k + (f1 * k - f0 * k) * (t ** spec.get("flareCurve", 1.0))
        lathe("XianSkirt", robe, zs, flare, lambda t: flare(t) * 0.86, 0.0, cy, lambda x, z, t: leg_w(x, t, spec.get("skirtLeg", 0.62)))
        lathe("XianHem", trim, [hem + spec.get("hemBand", 0.04), hem - 0.005], lambda t: f1 * k + 0.012, lambda t: (f1 * k + 0.012) * 0.86, 0.0, cy, lambda x, z, t: leg_w(x, 1.0, spec.get("skirtLeg", 0.62)))
    if "top" in parts:
        top_z = head("neck_01").z - 0.02
        zs = [waist - 0.02 + (top_z - waist + 0.02) * i / 7 for i in range(8)]
        prof = lambda t: (0.15 + 0.06 * math.sin(t * math.pi * 0.8)) * k * (1.0 - 0.45 * max(0.0, t - 0.82) / 0.18)  # a waist, then the chest
        lathe("XianTop", robe, zs, prof, lambda t: prof(t) * 0.78, 0.0, 0.02, lambda x, z, t: spine_w(z))
        lathe("XianCollar", trim, [top_z + 0.02, top_z - 0.06], lambda t: 0.095 * k, lambda t: 0.085 * k, 0.0, 0.035, lambda x, z, t: {"neck_01": 0.7, "spine_03": 0.3})
    if "mantle" in parts:
        # a shoulder mantle over the top: a short wide cape on the shoulders (grand robes)
        top_z = head("neck_01").z - 0.02
        zs = [top_z - 0.02 - 0.2 * i / 6 for i in range(7)]
        prof = lambda t: (0.13 + 0.14 * math.sin(t * math.pi * 0.5)) * k
        lathe("XianMantle", trim, zs, prof, lambda t: prof(t) * 0.8, 0.0, 0.03, lambda x, z, t: spine_w(z))
    if "sash" in parts:
        lathe("XianSash", sash, [waist + 0.07, waist - 0.02], lambda t: 0.168 * k, lambda t: 0.168 * k * 0.8, 0.0, 0.02, lambda x, z, t: {"pelvis": 0.6, "spine_01": 0.4})
        for sx in (-1, 1):
            # two ribbons hanging from the sash at the back, flowing with the legs
            n = 8
            pts, ws = [], []
            for i in range(n):
                t = i / (n - 1)
                z = waist - 0.02 - t * 0.5
                for dx in (-0.03, 0.03):
                    x = sx * 0.09 + dx
                    pts.append((x, 0.2 * k + 0.02 * t, z))
                    ws.append(leg_w(x, t, 0.5))
            faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(n - 1)]
            build("XianRibbon", sash, pts, faces, ws)
    if "sleeves" in parts:
        for side, sx in (("l", 1), ("r", -1)):
            ua, la = head("upperarm_" + side), head("lowerarm_" + side)
            end_x = abs(head("hand_" + side).x) - 0.025
            xs = [sx * (0.10 + (end_x - 0.10) * i / 8) for i in range(9)]
            axis = [(x, ua.y, ua.z) for x in xs]
            cuff_w = spec.get("cuff", 0.07)
            ru = lambda t: (0.05 + 0.024 * min(1.0, t * 2.0) - 0.008 * t + cuff_w * max(0.0, (t - 0.7) / 0.3) ** 1.6) * k  # thin at the shoulder (no ridge on the top), wide only toward the cuff
            elbow = abs(la.x)

            def w_arm(x, t, side=side, elbow=elbow):
                d = abs(x)
                u = _clamp01((d - (elbow - 0.06)) / 0.12)
                return {"upperarm_" + side: 1 - u, "lowerarm_" + side: u, "clavicle_" + side: 0.35 * _clamp01(1 - d / 0.2)}

            tube("XianSleeve_" + side, spec.get("sleeve") or robe, axis, ru, w_arm)
            cuff = [(sx * (end_x - 0.05 + 0.05 * i / 2), ua.y, ua.z) for i in range(3)]
            tube("XianCuff_" + side, trim, cuff, lambda t: (0.075 + cuff_w) * k + 0.006, w_arm)
    if "bun" in parts:
        # a hair knot on top of the head with a gold pin through it, and two long ribbons falling down the back
        hh, ht = head("Head"), B["Head"].tail_local
        r = spec.get("bunRadius", 0.08)
        bz, by = ht.z + 0.01, hh.y + 0.045
        hair_mat, pin_mat = spec.get("hairpiece") or sash, sash
        lathe("XianBun", hair_mat, [bz - r + 2 * r * i / 8 for i in range(9)], lambda t: r * math.sin(math.pi * t) + 0.002, lambda t: (r * math.sin(math.pi * t) + 0.002) * 0.9, 0.0, by, lambda x, z, t: {"Head": 1.0}, n_seg=14)
        tube("XianPin", pin_mat, [(-0.14 + 0.28 * i / 4, by, bz + 0.005) for i in range(5)], lambda t: 0.011, lambda x, t: {"Head": 1.0}, n_seg=8)
        for sx in (-1, 1):
            n = 9
            pts, ws = [], []
            for i in range(n):
                t = i / (n - 1)
                z = bz - 0.03 - t * (bz - waist + 0.25)
                for dx in (-0.025, 0.025):
                    x = sx * (0.05 + 0.05 * t) + dx
                    y = by + (0.17 * k - by) * min(1.0, t * 1.6)
                    pts.append((x, y, z))
                    ws.append({"Head": 1.0} if t < 0.12 else spine_w(z))
            faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(n - 1)]
            build("XianHairRibbon", hair_mat, pts, faces, ws)
    def sweep_y(name, mat, centers, rx_of, rz_of, weight_of, n_seg=12):
        """A tube along the y axis (a foot: heel to toe) with an oval section in x/z, rounded at both ends."""
        pts, ws = [], []
        for ti, (px, py, pz) in enumerate(centers):
            t = ti / (len(centers) - 1)
            cap = max(0.18, math.sin(math.pi * t) ** 0.5)
            for a in range(n_seg):
                ang = a / n_seg * math.tau
                pts.append((px + math.cos(ang) * rx_of(t) * cap, py, pz + math.sin(ang) * rz_of(t) * cap))
                ws.append(weight_of(py, t))
        return build(name, mat, pts, ring_faces(len(centers), n_seg), ws)

    def ball(name, mat, c, r, weights, n=7):
        lathe(name, mat, [c.z - r + 2 * r * i / (n - 1) for i in range(n)], lambda t: r * math.sin(math.pi * t) + 0.003, lambda t: r * math.sin(math.pi * t) + 0.003, c.x, c.y, lambda x, z, t: weights, n_seg=10)

    if "hands" in parts:
        for s in ("l", "r"):
            c = (head("hand_" + s) + B["hand_" + s].tail_local) * 0.5
            ball("GenHand_" + s, spec["skin"], c, 0.05 * k, {"hand_" + s: 1.0})
    if "legs" in parts:
        for s in ("l", "r"):
            th, ca, fo = head("thigh_" + s), head("calf_" + s), head("foot_" + s)
            zs = [th.z - 0.02 - (th.z - 0.02 - fo.z - 0.05) * i / 9 for i in range(10)]
            radius = lambda t: (0.088 - 0.036 * t) * k

            def w_leg(x, z, t, s=s, ca=ca):
                u = _clamp01((ca.z + 0.06 - z) / 0.12)
                return {"thigh_" + s: 1 - u, "calf_" + s: u}

            lathe("GenLeg_" + s, spec["legwear"], zs, radius, radius, th.x, th.y, w_leg)
    if "boots" in parts:
        for s in ("l", "r"):
            ca, fo, ba = head("calf_" + s), head("foot_" + s), B["ball_" + s]
            top = fo.z + spec.get("bootHeight", 0.2)
            zs = [top - (top - fo.z + 0.02) * i / 7 for i in range(8)]
            radius = lambda t: (0.056 - 0.006 * t) * k

            def w_shaft(x, z, t, s=s, fo=fo):
                u = _clamp01((fo.z + 0.06 - z) / 0.08)
                return {"calf_" + s: 1 - u, "foot_" + s: u}

            lathe("GenBoot_" + s, spec["boot"], zs, radius, radius, fo.x, fo.y, w_shaft)
            heel, toe = fo.y + 0.06, ba.tail_local.y - 0.025
            sweep_y("GenBootFoot_" + s, spec["boot"], [(fo.x, heel + (toe - heel) * i / 6, fo.z - 0.02) for i in range(7)], lambda t: 0.052 * k, lambda t: 0.05 * k,
                    lambda y, t, s=s: {"foot_" + s: 1 - 0.7 * t, "ball_" + s: 0.7 * t})
    def tube3(name, mat, centers, radius_of, weights, n_seg=8):
        """A tube along any polyline (a horn, a feather, a spike): rings perpendicular to the path, closed at the tip by a radius that shrinks to nothing."""
        pts, ws = [], []
        n = len(centers)
        for i, c in enumerate(centers):
            t = (centers[min(i + 1, n - 1)] - centers[max(i - 1, 0)]).normalized()
            u = t.cross(Vector((0, 1, 0)))
            if u.length < 1e-3:
                u = t.cross(Vector((1, 0, 0)))
            u.normalize()
            v = t.cross(u).normalized()
            r = radius_of(i / (n - 1))
            for a in range(n_seg):
                ang = a / n_seg * math.tau
                pts.append(tuple(c + u * math.cos(ang) * r + v * math.sin(ang) * r))
                ws.append(weights)
        return build(name, mat, pts, ring_faces(n, n_seg), ws)

    if "top" in parts:
        # the crossed collar of a Chinese robe: a trim band from the left of the neck, over the chest, to the right of the waist (the front is -y)
        top_z = head("neck_01").z - 0.02
        pts_c = []
        for i in range(9):
            t = i / 8
            z = top_z - 0.02 - (top_z - waist - 0.02) * t
            x = (-0.05 + 0.15 * t) * k
            pf = (0.15 + 0.06 * math.sin((1 - t) * math.pi * 0.8)) * k * (1.0 - 0.45 * max(0.0, (1 - t) - 0.82) / 0.18)
            pts_c.append(Vector((x, 0.02 - pf * 0.78 * math.sqrt(max(0.05, 1 - (x / pf) ** 2)) - 0.004, z)))
        tube3("XianCollarV", trim, pts_c, lambda t: 0.014 * k, {"spine_02": 0.5, "spine_01": 0.5})
    hat_ids = [i for i in range(10) if "hat%d" % i in parts]
    if hat_ids:
        # the ten hats of the game, in 3D, each one on the top of the head; one tonal material (the game tints the whole hat by its set) and a second, darker one for bands and gems
        hh, ht = head("Head"), B["Head"].tail_local
        top = ht.z - 0.015
        cy = hh.y + 0.005
        hm, hd = spec["hat"], spec.get("hatTrim") or spec["hat"]
        W = {"Head": 1.0}
        V = lambda x, y, z: Vector((x, y, z))

        def band(nm, mat, z0, z1, rx, ry=None, y0=0.0):
            lathe(nm, mat, [z1, z0], lambda t: rx, lambda t: (ry or rx * 0.94), 0.0, cy + y0, lambda x, z, t: W, n_seg=24)

        def gem(nm, mat, x, y, z, r):
            ball(nm, mat, V(x, y, z), r, W)

        for hid in hat_ids:
            P = "GenHat%d_" % hid
            if hid == 0:  # a wide bamboo hat
                brim = spec.get("hatRadius", 0.25) * k
                lathe(P + "brim", hm, [top + 0.035, top - 0.005], lambda t: brim, lambda t: brim * 0.96, 0.0, cy, lambda x, z, t: W, n_seg=28)
                lathe(P + "cone", hm, [top + 0.03 + 0.14 * i / 9 for i in range(10)], lambda t: brim * 0.58 * (1 - t) ** 0.8 + 0.004, lambda t: brim * 0.56 * (1 - t) ** 0.8 + 0.004, 0.0, cy, lambda x, z, t: W, n_seg=28)
                band(P + "ring", hd, top + 0.0, top + 0.04, brim * 0.58)
            elif hid == 1:  # a scholar's cap with two wings
                lathe(P + "cap", hm, [top + 0.16, top + 0.02], lambda t: 0.085 + 0.015 * t, lambda t: 0.08 + 0.014 * t, 0.0, cy, lambda x, z, t: W, n_seg=4)
                band(P + "band", hd, top + 0.02, top + 0.055, 0.1)
                gem(P + "jade", hd, 0.0, cy - 0.1, top + 0.04, 0.016)
                for sx in (-1, 1):
                    tube3(P + "wing%d" % sx, hm, [V(sx * 0.09, cy + 0.04, top + 0.06), V(sx * 0.17, cy + 0.04, top + 0.065), V(sx * 0.25, cy + 0.04, top + 0.07)], lambda t: 0.028 * (1 - t * 0.6) + 0.004, W, n_seg=6)
            elif hid == 2:  # a crown of five points with pearls
                band(P + "band", hm, top - 0.01, top + 0.045, 0.105)
                for j in range(5):
                    a = (j / 5) * math.tau + math.pi / 2
                    x, y = math.cos(a) * 0.1, math.sin(a) * 0.095
                    tube3(P + "pt%d" % j, hm, [V(x, cy + y, top + 0.04), V(x, cy + y, top + 0.09), V(x, cy + y, top + 0.125)], lambda t: 0.022 * (1 - t) + 0.003, W, n_seg=5)
                    gem(P + "pearl%d" % j, hd, x, cy + y, top + 0.13, 0.014)
                gem(P + "ruby", hd, 0.0, cy - 0.105, top + 0.02, 0.018)
            elif hid == 3:  # a hair crown: a gold cap, a round bun and a pin
                lathe(P + "cap", hm, [top + 0.07 - 0.07 * i / 5 for i in range(6)], lambda t: 0.04 + 0.075 * t, lambda t: 0.04 + 0.07 * t, 0.0, cy, lambda x, z, t: W, n_seg=18)
                ball(P + "bun", hd, V(0.0, cy, top + 0.105), 0.062, W)
                tube3(P + "pin", hm, [V(-0.15, cy, top + 0.105), V(0.0, cy, top + 0.105), V(0.15, cy, top + 0.105)], lambda t: 0.011 * (1 - abs(t - 0.5) * 0.4), W, n_seg=6)
                gem(P + "pinjade", hd, 0.15, cy, top + 0.105, 0.016)
            elif hid == 4:  # a crest of five plumes
                band(P + "band", hd, top - 0.005, top + 0.04, 0.103)
                for j in range(5):
                    f = (j - 2) / 2
                    ang = f * 0.75
                    path = [V(math.sin(ang) * s * 0.17, cy - 0.04 * (1 - abs(f)) + 0.02 * s, top + 0.03 + math.cos(ang) * s * 0.2) for s in (0.0, 0.25, 0.5, 0.75, 1.0)]
                    tube3(P + "plume%d" % j, hm, path, lambda t: 0.03 * math.sin(math.pi * (0.2 + 0.7 * t)) * (1 - 0.3 * t) + 0.003, W, n_seg=6)
            elif hid == 5:  # a silk headband with a jewel and two ribbons
                band(P + "band", hm, top - 0.045, top - 0.005, 0.104, 0.099)
                gem(P + "jewel", hd, 0.0, cy - 0.105, top - 0.03, 0.02)
                for sx in (-1, 1):
                    path = [V(sx * 0.102, cy + 0.03, top - 0.03 - 0.07 * s) for s in range(5)]
                    path = [V(p.x + sx * 0.02 * i, p.y + 0.02 * i, p.z) for i, p in enumerate(path)]
                    tube3(P + "ribbon%d" % sx, hd, path, lambda t: 0.014 * (1 - t * 0.5) + 0.003, W, n_seg=6)
            elif hid == 6:  # an iron helm: dome, band, nose guard and ridge
                lathe(P + "dome", hm, [top + 0.115 - 0.13 * i / 9 for i in range(10)], lambda t: 0.12 * math.sin(math.pi * 0.5 * t) + 0.003, lambda t: 0.114 * math.sin(math.pi * 0.5 * t) + 0.003, 0.0, cy, lambda x, z, t: W, n_seg=22)
                band(P + "band", hd, top - 0.015, top + 0.02, 0.121, 0.115)
                tube3(P + "nose", hd, [V(0.0, cy - 0.118, top + 0.02), V(0.0, cy - 0.125, top - 0.05), V(0.0, cy - 0.12, top - 0.09)], lambda t: 0.012 * (1 - t * 0.4) + 0.003, W, n_seg=5)
                tube3(P + "ridge", hd, [V(0.0, cy - 0.1 + 0.2 * s / 6, top + 0.108 + 0.025 * math.sin(math.pi * s / 6)) for s in range(7)], lambda t: 0.014 * math.sin(math.pi * t) + 0.004, W, n_seg=5)
            elif hid == 7:  # a lotus crown: a band and a ring of petals
                band(P + "band", hd, top - 0.01, top + 0.03, 0.102)
                for j in range(8):
                    a = (j / 8) * math.tau
                    x, y = math.cos(a), math.sin(a)
                    path = [V(x * (0.1 + 0.025 * s), cy + y * (0.095 + 0.025 * s), top + 0.03 + 0.085 * s - 0.01 * s * s) for s in (0.0, 0.3, 0.6, 1.0)]
                    tube3(P + "petal%d" % j, hm, path, lambda t: 0.03 * math.sin(math.pi * (0.1 + 0.8 * t)) + 0.003, W, n_seg=6)
                gem(P + "heart", hd, 0.0, cy, top + 0.06, 0.03)
            elif hid == 8:  # a dragon crown: two curved horns and a spine
                band(P + "band", hd, top - 0.005, top + 0.04, 0.104)
                for sx in (-1, 1):
                    path = [V(sx * (0.07 + 0.045 * s + 0.03 * s * s), cy + 0.03 * s, top + 0.04 + 0.14 * s - 0.02 * s * s) for s in (0.0, 0.25, 0.5, 0.75, 1.0)]
                    tube3(P + "horn%d" % sx, hm, path, lambda t: 0.026 * (1 - t) ** 0.8 + 0.004, W, n_seg=6)
                tube3(P + "spine", hd, [V(0.0, cy - 0.06 + 0.12 * s / 5, top + 0.04 + 0.05 * math.sin(math.pi * s / 5)) for s in range(6)], lambda t: 0.018 * math.sin(math.pi * t) + 0.004, W, n_seg=5)
                gem(P + "eye", hm, 0.0, cy - 0.104, top + 0.018, 0.016)
            elif hid == 9:  # a phoenix tiara: a fan of flame feathers
                band(P + "band", hd, top - 0.005, top + 0.04, 0.104)
                for j in range(7):
                    f = (j - 3) / 3
                    ang = f * 0.95
                    ln = 0.2 - 0.07 * abs(f)
                    path = [V(math.sin(ang) * s * ln * 0.9, cy - 0.05 + 0.02 * s, top + 0.035 + math.cos(ang) * s * ln) for s in (0.0, 0.25, 0.5, 0.75, 1.0)]
                    tube3(P + "flame%d" % j, hm, path, lambda t: 0.028 * math.sin(math.pi * (0.15 + 0.75 * t)) + 0.003, W, n_seg=6)
                gem(P + "ruby", hd, 0.0, cy - 0.105, top + 0.02, 0.02)
    log("generated clothing: %s" % ", ".join(parts))


def main():
    cfg = load_config(CFG_PATH)
    if cfg.get("onlyAnims"):
        cfg["anims"] = {k: v for k, v in cfg["anims"].items() if k in cfg["onlyAnims"]}  # a quick look at a few animations
    F = cfg["frame"]
    anchor = cfg["anchor"]
    el = math.radians(cfg["elevationDeg"])
    az = math.radians(cfg["azimuthDeg"])
    # 1 tile = tileMetres; a tile is 64 px wide, so the ground runs 64/sqrt(2) px per metre along a tile axis.
    pixel_scale = cfg.get("pixelScale", 1.0)  # rendered at this many times the pixels it shows (frame, anchor and outlinePx are then in the bigger pixels); the sprite is drawn at 1/pixelScale
    ppm = 64.0 / math.sqrt(2) / cfg["tileMetres"] * pixel_scale

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
    if cfg.get("generated"):
        g = cfg["generated"]
        roles = ("robe", "trim", "sash", "sleeve", "hairpiece", "skin", "legwear", "boot", "hat", "hatTrim")
        names = [g[k] for k in roles if g.get(k)]
        gm = {n: bpy.data.materials.new(n) for n in dict.fromkeys(names)}
        add_generated(rig, {**g, **{k: gm[g[k]] for k in roles if g.get(k)}})
    if cfg.get("passes"):
        # every mesh belongs to one slot of the paper doll (body, hair, bun, robe, hat; the belt, the cuffs and the boots are part of the robe layer): by name for what the script generated, the hair by its name, the rest is the body
        prefixes = [("XianSkirt", "robe"), ("XianHem", "robe"), ("XianTop", "robe"), ("XianCollar", "robe"), ("XianSleeve", "robe"), ("XianMantle", "robe"), ("GenLeg", "robe"), ("XianSash", "robe"), ("XianRibbon", "robe"),
                    ("XianCuff", "robe"), ("XianBun", "bun"), ("XianPin", "bun"), ("XianHairRibbon", "hair"), ("GenHand", "body"), ("GenBoot", "robe")]
        for o in [o for o in bpy.data.objects if o.type == "MESH"]:
            hat = re.match(r"GenHat(\d+)_", o.name)
            o["slot"] = ("h_" + hat.group(1)) if hat else next((s for p, s in prefixes if o.name.startswith(p)), "hair" if o.name.startswith("Hair") else "body")
        log("slots: " + ", ".join("%s=%s" % (o.name, o["slot"]) for o in bpy.data.objects if o.type == "MESH"))
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = F  # before the camera maths: world_to_camera_view and the lens shift read the aspect
    scene.render.resolution_percentage = 100
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    body = bpy.data.objects[cfg["bodyMesh"]]
    rig.rotation_mode = "XYZ"  # the importer leaves objects in quaternion mode, where rotation_euler would do nothing
    ad = rig.animation_data or rig.animation_data_create()
    for t in list(ad.nla_tracks):  # the importer stashes every action in an NLA track; they would fight the one assigned below
        ad.nla_tracks.remove(t)
    if cfg.get("headScale"):
        # a larger head (stylised proportions): the Head bone grows around its base; the hair and the generated hair pieces follow it
        hb = rig.pose.bones["Head"]
        hb.scale = (cfg["headScale"],) * 3

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

    def toon(mat, rgb, vertex=False, image=None, pattern=None):
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
        shade_tints = cfg.get("shadeTints")  # per-level colour of the shade (cool ink-blue shadows instead of plain grey)
        for i, e in enumerate(ramp.color_ramp.elements):
            e.position = i / len(levels) if i else 0.0
            t = shade_tints[i] if shade_tints else (1, 1, 1)
            e.color = (levels[i] * t[0], levels[i] * t[1], levels[i] * t[2], 1)
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
        shaded = mix.outputs[2]
        if pattern:
            # woven cloth: soft bands (folds, a brocade) multiply the colour; `scale` bands per metre along x, `strength` how dark the dark bands get, `angle` turns them (degrees, about the vertical)
            tc = nt.nodes.new("ShaderNodeTexCoord")
            mp = nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (pattern.get("scale", 24.0), pattern.get("scaleY", pattern.get("scale", 24.0)), pattern.get("scaleZ", 1.0))
            mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(pattern.get("angle", 0.0)))
            wave = nt.nodes.new("ShaderNodeTexWave")
            wave.wave_type = pattern.get("type", "BANDS")
            wave.bands_direction = "X"
            wave.wave_profile = pattern.get("profile", "SIN")
            wave.inputs["Scale"].default_value = 1.0
            wave.inputs["Distortion"].default_value = pattern.get("distortion", 2.0)
            wave.inputs["Detail"].default_value = 1.0
            pr = nt.nodes.new("ShaderNodeValToRGB")
            pr.color_ramp.elements[0].color = (1 - pattern.get("strength", 0.12),) * 3 + (1,)
            pr.color_ramp.elements[1].color = (1, 1, 1, 1)
            pat = nt.nodes.new("ShaderNodeMix")
            pat.data_type = "RGBA"
            pat.blend_type = "MULTIPLY"
            pat.inputs[0].default_value = 1.0
            nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
            nt.links.new(wave.outputs["Fac"], pr.inputs["Fac"])
            nt.links.new(mix.outputs[2], pat.inputs[6])
            nt.links.new(pr.outputs["Color"], pat.inputs[7])
            shaded = pat.outputs[2]
        mist = cfg.get("groundInk")  # ink-wash: the colour fades toward ink near the ground, like mist soaking the hem
        if mist:
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            rng = nt.nodes.new("ShaderNodeMapRange")
            rng.inputs["From Min"].default_value = 0.0
            rng.inputs["From Max"].default_value = mist["height"]
            rng.inputs["To Min"].default_value = mist["strength"]
            rng.inputs["To Max"].default_value = 0.0
            fade = nt.nodes.new("ShaderNodeMix")
            fade.data_type = "RGBA"
            fade.inputs[7].default_value = (*mist["color"], 1)
            nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
            nt.links.new(sep.outputs["Z"], rng.inputs["Value"])
            nt.links.new(rng.outputs["Result"], fade.inputs[0])
            nt.links.new(shaded, fade.inputs[6])
            nt.links.new(fade.outputs[2], emit.inputs["Color"])
        else:
            nt.links.new(shaded, emit.inputs["Color"])
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
            toon(m, rgb, bool(isinstance(spec, dict) and spec.get("vertexColor")), image, spec.get("pattern") if isinstance(spec, dict) else None)
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
    def attach_weapon(wcfg, slot=None, length_scale=1.0):
        before_w = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=art(wcfg["model"]))
        new = [o for o in bpy.data.objects if o not in before_w]
        weapon_objs_local = [o for o in new if o.type == "MESH"]
        check(weapon_objs_local, "the weapon file has no mesh")
        for o in [o for o in new if o.type != "MESH"]:
            bpy.data.objects.remove(o, do_unlink=True)
        for w in weapon_objs_local:
            w.parent = rig
            if slot:
                w["slot"] = slot
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
                wcfg["scale"] = wcfg["length"] * length_scale / (max(dims) * fs)
            w.rotation_mode = "XYZ"
            w.location = wcfg.get("location", [0, 0, 0])
            w.rotation_euler = [math.radians(a) for a in wcfg.get("rotationDeg", [0, 0, 0])]
            k = wcfg.get("scale", 1.0)
            # `width` widens the blade (a saber is broader than a sword) and `thickness` deepens it: the multiples apply to the two shorter sides of the mesh
            long_axis = max(range(3), key=lambda i: dims[i])
            mult = [1.0, 1.0, 1.0]
            short_axes = [i for i in range(3) if i != long_axis]
            short_axes.sort(key=lambda i: -dims[i])
            mult[short_axes[0]] = wcfg.get("width", 1.0)
            mult[short_axes[1]] = wcfg.get("thickness", 1.0)
            w.scale = (k * mult[0], k * mult[1], k * mult[2])
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
        return weapon_objs_local

    weapon_objs = []
    wcfg = cfg.get("weapon")
    if wcfg:
        weapon_objs = attach_weapon(wcfg)
        if cfg.get("holdout", True):
            for o in meshes:
                o.is_holdout = True  # the body hides the parts of the weapon behind it, and is itself not drawn in this layer
        log("weapon %s on %s, holdout %s" % (wcfg["model"], wcfg["bone"], cfg.get("holdout", True)))

    if cfg.get("weaponSet"):
        # every weapon family of the game in the one scene, each its own slot (`w_<family>`), for layers drawn over the body (the length is in world metres: a bigger figure needs longer weapons)
        table = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), cfg["weaponSet"]), encoding="utf-8"))
        for family, w in table["weapons"].items():
            attach_weapon({"model": table["pack"] + "/" + w["file"], "bone": w["bone"], "length": w["length"], "width": w.get("width", 1.0), "thickness": w.get("thickness", 1.0), "location": w["location"], "rotationDeg": w["rotationDeg"]}, "w_" + family, cfg.get("weaponLengthScale", 1.0))
        log("weapons: " + ", ".join(table["weapons"]))

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
    check(abs(dx.x - 32 * pixel_scale) < 0.6 and abs(dx.y - 16 * pixel_scale) < 0.6, "tile +x projects to %s, wanted (%g, %g)" % (tuple(dx), 32 * pixel_scale, 16 * pixel_scale))
    check(abs(dy.x + 32 * pixel_scale) < 0.6 and abs(dy.y - 16 * pixel_scale) < 0.6, "tile +y projects to %s, wanted (%g, %g)" % (tuple(dy), -32 * pixel_scale, 16 * pixel_scale))
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
    def lowest_point():
        low = 1e9
        for mesh in meshes:
            ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get("co", co)
            ev.to_mesh_clear()
            mw = np.array(ev.matrix_world)
            if len(co):
                low = min(low, float((co.reshape(-1, 3) @ mw[2, :3] + mw[2, 3]).min()))
        return low

    lift = -(lowest_point() - body_sol.thickness * fs)  # the outline shell is not a part of the foot
    log("lifting the figure by %.3f m so its feet stand on the ground" % lift)

    # ---- a hand-made pose over an action (meditation: no clip of the library sits cross-legged) ----
    pose_m_inv = rig.matrix_world.to_3x3().inverted()  # taken now, before any direction turns the object
    pose_fwd = fwd.copy()

    def apply_pose(spec):
        """Aims bones in the model's own frame, from the hips out. spec: {"hipsDrop": metres, "sideBone": "thigh_{s}", "bones": {"thigh_{s}": [forward, side, up], ...}}; {s} is l or r
        and the side component is mirrored for the right side. Each bone turns about its head to point along the vector; the bones below it follow."""
        f_arm = (pose_m_inv @ pose_fwd).normalized()
        up_arm = (pose_m_inv @ Vector((0, 0, 1))).normalized()
        pb = rig.pose.bones
        side_l = (pb[spec["sideBone"].format(s="l")].head - pb[spec["sideBone"].format(s="r")].head)
        side_l = (side_l - f_arm * side_l.dot(f_arm) - up_arm * side_l.dot(up_arm)).normalized()
        hips_pb = pb[cfg.get("hipsBone", "DEF-hips")]
        hips_pb.matrix = Matrix.Translation(-up_arm * spec.get("hipsDrop", 0.0)) @ hips_pb.matrix
        bpy.context.view_layer.update()
        for base, vec in spec["bones"].items():
            for sign, suffix in ((1, "l"), (-1, "r")):
                b = pb[base.format(s=suffix)]
                target = (f_arm * vec[0] + side_l * (sign * vec[1]) + up_arm * vec[2]).normalized()
                cur = (b.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
                rot = cur.rotation_difference(target).to_matrix().to_4x4()
                head = b.head.copy()
                b.matrix = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ b.matrix
                bpy.context.view_layer.update()

    # ---- render every animation, direction and frame ----
    frames = {}      # name -> raw frame array (bottom-up RGBA floats)
    meta = {}        # anim -> {frames, fps, loop}
    clips = []       # frames with opaque pixels touching the edge of the box
    drift = {}
    t0 = time.time()
    passes = cfg.get("passes") or [{"name": None}]
    if cfg.get("onlyPasses"):
        passes = [q for q in passes if q["name"] in cfg["onlyPasses"]]  # a quick re-render of a few layers
    slots_present = {o["slot"] for o in bpy.data.objects if o.type == "MESH" and "slot" in o}
    all_frames = {}
    for pdef in passes:
        if pdef["name"] is not None:
            draw = set(pdef["draw"])
            skip = set(pdef.get("exclude", []))
            for o in [o for o in bpy.data.objects if o.type == "MESH"]:
                s = o["slot"]
                on_top = s.startswith(("h_", "w_"))  # hats and weapons are layers over the body: they are held out by the body, and hold nothing out themselves
                o.hide_render = s in skip or (on_top and s not in draw) or (bool(pdef.get("noHoldout")) and s not in draw)
                o.is_holdout = (s not in draw) and not o.hide_render and not on_top and not pdef.get("noHoldout")
            log("pass %s: draw %s, exclude %s" % (pdef["name"], sorted(draw), sorted(skip)))
        frames = {}
        clips = []
        for anim, a in cfg["anims"].items():
            act = bpy.data.actions[cfg.get("actionPrefix", "") + a["action"]]
            ad.action = act
            if hasattr(ad, "action_slot") and act.slots:
                ad.action_slot = act.slots[0]
            snap = None
            if a.get("pose"):
                # the animation would put the bones back on every update: pose the first frame, keep the values and drop the action
                scene.frame_set(int(act.frame_range[0]))
                bpy.context.view_layer.update()
                apply_pose(a["pose"])
                snap = {pb_.name: (pb_.location.copy(), pb_.rotation_quaternion.copy(), pb_.scale.copy()) for pb_ in rig.pose.bones}
                ad.action = None
                rig.location = (0, 0, 0)
                rig.rotation_euler = (0, 0, 0)
                bpy.context.view_layer.update()
                lift_a = -(lowest_point() - body_sol.thickness * fs)  # a seated figure sits on the ground: its own lowest point, not the standing feet's
                log("pose %s: lifting by %.3f m instead of %.3f" % (anim, lift_a, lift))
            else:
                lift_a = lift

            def set_frame(t):
                if snap is None:
                    scene.frame_set(int(t), subframe=t - int(t))
                else:
                    for pb_ in rig.pose.bones:
                        pb_.location, pb_.rotation_quaternion, pb_.scale = (v.copy() for v in snap[pb_.name])
                bpy.context.view_layer.update()

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
                set_frame(t)
                posed.append([tuple(pb.matrix.translation) for pb in rig.pose.bones])
            moved = max(sum(abs(u - v) for u, v in zip(p, q)) for p, q in zip(posed[0], posed[1]))
            log("animation %s (%s) moves up to %.4f m between two samples" % (anim, a["action"], moved))
            check(moved > 1e-4 or a.get("pose"), "animation %s does not move (%s)" % (anim, a["action"]))  # identical poses would give exactly 0
            # Root motion is cancelled: the hips stay over the same ground point for the whole animation (the game moves the actor, the sprite stays put).
            set_frame(times[0])
            hips = rig.pose.bones[cfg.get("hipsBone", "DEF-hips")]
            h0 = hips.matrix.translation.copy()
            worst_drift = 0.0
            for d, vec in enumerate(cfg["directions"]):
                if cfg.get("onlyDirs") is not None and d not in cfg["onlyDirs"]:
                    continue  # a test render of a few directions
                g = (tile_x * vec[0] + tile_y * vec[1]).normalized()
                yaw = math.atan2(g.y, g.x) - math.atan2(fwd.y, fwd.x)
                rig.rotation_euler = (0, 0, yaw)
                bpy.context.view_layer.update()
                # direction check: one metre ahead of the model must go the way the tile vector goes on screen
                ahead = rig.matrix_world.to_3x3() @ fwd
                sv = to_px(ahead) - o_px
                want = Vector((vec[0] - vec[1], (vec[0] + vec[1]) / 2.0))
                ang = math.degrees(math.acos(max(-1, min(1, sv.normalized().dot(want.normalized())))))
                check(ang < 2.0, "direction %d: the model's front points %.1f degrees off the wanted screen heading" % (d, ang))
                for i, t in enumerate(times):
                    set_frame(t)
                    h = hips.matrix.translation
                    worst_drift = max(worst_drift, math.hypot(h.x - h0.x, h.y - h0.y))
                    rig.location = -(Matrix.Rotation(yaw, 3, "Z") @ Vector((h.x - h0.x, h.y - h0.y, 0)) * fs) + Vector((0, 0, lift_a))
                    proc = a.get("proc")
                    if proc:
                        # a procedural move for a model with no such animation: the whole figure lunges (attack), is pushed back (hit) or falls on its side (die) as the sprite plays
                        q = i / max(1, n - 1)
                        ease = q * q * (3 - 2 * q)
                        ahead_w = (Matrix.Rotation(yaw, 3, "Z") @ fwd).normalized()
                        side_w = ahead_w.cross(Vector((0, 0, 1))).normalized()
                        kind = proc["type"]
                        rot = Matrix.Rotation(yaw, 3, "Z")
                        if kind == "fall":
                            rot = Matrix.Rotation(math.radians(proc.get("roll", 88)) * ease, 3, ahead_w) @ rot
                            rig.location += Vector((0, 0, proc.get("drop", 0.0) * ease * fs))
                        elif kind == "lunge":
                            bump = math.sin(math.pi * q)
                            rot = Matrix.Rotation(math.radians(-proc.get("pitch", 14)) * bump, 3, side_w) @ rot
                            rig.location += ahead_w * (proc.get("dist", 0.45) * bump * fs)
                        elif kind == "recoil":
                            back = (1 - q) ** 2
                            rot = Matrix.Rotation(math.radians(proc.get("pitch", 12)) * back, 3, side_w) @ rot
                            rig.location -= ahead_w * (proc.get("dist", 0.25) * back * fs)
                        rig.rotation_euler = rot.to_euler("XYZ")
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
            rig.location = (0, 0, lift_a)
            log("root motion removed for %s: up to %.2f m of drift" % (anim, worst_drift))
            log("rendered %s: %d frames x %d directions, %.1f fps, %.0fs elapsed" % (anim, n, len(cfg["directions"]), fps, time.time() - t0))

        all_frames[pdef["name"]] = (frames, clips)
    for pdef in passes:
        frames, clips = all_frames[pdef["name"]]
        pname = cfg["name"] + ("_" + pdef["name"] if pdef["name"] else "")
        pkey = cfg["spriteKey"] + ("." + pdef["name"] if pdef["name"] else "")
        # ---- how tall the figure stands (idle frames): the game puts the name above this ----
        head = 0
        head_sit = 0
        for name, arr in frames.items():
            if not name.startswith(("idle_", "sit_")):
                continue
            ys = np.nonzero(arr[:, :, 3] > 0.05)[0]
            if len(ys):
                h_px = anchor[1] - (F - 1 - int(ys.max()))
                if name.startswith("idle_"):
                    head = max(head, h_px)
                else:
                    head_sit = max(head_sit, h_px)
        check(head > 8 or wcfg or pdef["name"] not in (None, "body"), "could not measure the height of the figure")
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
        img_name = pname + ".png"

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
        json.dump({"frames": jframes, "meta": {"image": img_name, "size": {"w": W, "h": H}, "scale": "1"}}, open(os.path.join(OUT, pname + ".json"), "w"))
        json.dump({"key": pkey, "atlas": pname, "image": img_name, "data": pname + ".json", "frame": {"w": F, "h": F}, "anchor": {"x": anchor[0], "y": anchor[1]}, "head": head, **({"headSit": head_sit} if head_sit else {}), **({"scale": round(1.0 / pixel_scale, 4)} if pixel_scale != 1.0 else {}), "anims": meta},
                  open(os.path.join(OUT, pname + ".sprite.json"), "w"), indent=2)

    # ---- a contact sheet to look at: the middle frame of each animation in the 8 directions, 2x, with the 64x32 tile under the feet ----
    sets = cfg.get("previewSets") or {"": [q["name"] for q in passes]}
    for set_name, set_passes in sets.items():
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
                key = "%s_%d_%02d" % (an, d, cfg["anims"][an]["frames"] // 2)
                fr = np.zeros((F, F, 4), dtype=np.float32)
                for pd_ in [q for q in passes if q["name"] in set_passes and q["name"] in all_frames]:  # the layers on top of each other (the paper doll), each multiplied by its preview colour as the game will tint it
                    lf = all_frames[pd_["name"]][0].get(key)
                    if lf is None:
                        continue  # a test render of a few directions
                    tint = np.array(cfg.get("previewTints", {}).get(pd_["name"], [1, 1, 1]), dtype=np.float32)
                    la = lf[:, :, 3:4]
                    fr[:, :, :3] = lf[:, :, :3] * tint * la + fr[:, :, :3] * (1 - la)
                    fr[:, :, 3:4] = la + fr[:, :, 3:4] * (1 - la)
                a_ = fr[:, :, 3:4]
                cell[:, :, :3] = fr[:, :, :3] * a_ + cell[:, :, :3] * (1 - a_)
                y0 = (len(anim_names) - 1 - ri) * F
                sheet[y0:y0 + F, d * F:(d + 1) * F, :] = cell
        sheet = np.repeat(np.repeat(sheet, 2, axis=0), 2, axis=1)
        save_array(sheet, os.path.join(OUT, "contact.png" if not set_name else "contact_%s.png" % set_name))

    json.dump({"atlas": {"w": W, "h": H, "frames": len(rects)}, "clips": {(k or "all"): v[1] for k, v in all_frames.items()}, "anims": meta, "seconds": round(time.time() - t0, 1), "blender": bpy.app.version_string, "engine": engine},
              open(os.path.join(OUT, "report.json"), "w"), indent=2)
    log("done: %d pass(es), %d frames touch the box edge" % (len(passes), sum(len(v[1]) for v in all_frames.values())))


try:
    main()
    open(os.path.join(OUT, "done.marker"), "w").write("ok")
except BaseException:
    tb = traceback.format_exc()
    log(tb)
    open(os.path.join(OUT, "done.marker"), "w").write("error\n" + tb)

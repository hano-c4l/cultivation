"""
Draws the brocade motifs of the robes (a dragon on the skirt, a phoenix on the back, a cloud medallion on the chest) as PNGs with alpha.
Run: python tools/render/motifs.py (writes tools/render/motifs/*.png). The renderer multiplies a motif into the robe colour: the fill is white
(the cloth shows lighter there, since the plain cloth is darkened), the outline and the details are grey (darker than the cloth).
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "motifs")
S = 1024          # the size of a motif
AA = 2            # drawn at 2x, then shrunk
FILL, LINE = 255, 110


def bez(p0, p1, p2, p3, n=60):
    return [((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
             (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1]) for t in (i / n for i in range(n + 1))]


def stroke(d, pts, width_of, fill, n_extra=0):
    """A stroke along `pts` whose width at fraction t is width_of(t), made of discs."""
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        r = width_of(i / max(1, n - 1)) / 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def two_tone(draw_fn):
    """Draws the shape twice: slightly fatter in the line colour, then in the fill, so the shape gets an outline."""
    im = Image.new("LA", (S * AA, S * AA), (0, 0))
    base = Image.new("L", (S * AA, S * AA), 0)
    draw_fn(ImageDraw.Draw(base), 0)
    grown = base.filter(ImageFilter.MaxFilter(2 * 7 * AA // 2 * 2 + 1))
    out = Image.new("LA", (S * AA, S * AA), (0, 0))
    out.paste((LINE, 255), mask=grown)
    out.paste((FILL, 255), mask=base)
    return out


def scale_arcs(d, pts, width_of, step=5):
    """Fish-scale arcs along a body: small crescents in the line colour."""
    for i in range(2, len(pts) - 2, step):
        (x0, y0), (x1, y1) = pts[i - 1], pts[i + 1]
        ang = math.atan2(y1 - y0, x1 - x0)
        w = width_of(i / (len(pts) - 1)) * 0.36
        for k in (-1, 0, 1):
            cx = pts[i][0] + math.cos(ang + math.pi / 2) * w * k * 0.9
            cy = pts[i][1] + math.sin(ang + math.pi / 2) * w * k * 0.9
            r = w * 0.5
            a0 = math.degrees(ang) - 70
            d.arc((cx - r, cy - r, cx + r, cy + r), a0, a0 + 140, fill=LINE, width=max(2, int(w * 0.12)))


def cloud(d, cx, cy, r, fill=FILL):
    """A cloud curl (tuong van): a head of three discs and a curling tail."""
    for dx, dy, rr in ((-0.55, 0.1, 0.55), (0.0, -0.15, 0.7), (0.6, 0.1, 0.5)):
        d.ellipse((cx + dx * r - rr * r, cy + dy * r - rr * r, cx + dx * r + rr * r, cy + dy * r + rr * r), fill=fill)
    tail = bez((cx + 0.9 * r, cy + 0.2 * r), (cx + 1.8 * r, cy + 0.3 * r), (cx + 2.0 * r, cy - 0.7 * r), (cx + 1.4 * r, cy - 0.6 * r))
    stroke(d, tail, lambda t: r * 0.5 * (1 - 0.7 * t), fill)


def dragon():
    def shape(d, _):
        # the body: an S down the middle, thick at the shoulders, thin at the tail
        spine = bez((0.50 * S * AA, 0.90 * S * AA), (0.16 * S * AA, 0.74 * S * AA), (0.86 * S * AA, 0.50 * S * AA), (0.44 * S * AA, 0.26 * S * AA), 120)
        spine += bez((0.44 * S * AA, 0.26 * S * AA), (0.30 * S * AA, 0.17 * S * AA), (0.42 * S * AA, 0.08 * S * AA), (0.60 * S * AA, 0.06 * S * AA), 60)
        wd = lambda t: S * AA * (0.020 + 0.085 * math.sin(min(1.0, t * 1.15) * math.pi * 0.5) ** 0.8 * (1 - 0.88 * max(0.0, t - 0.55) / 0.45)) * 2
        wd2 = lambda t: wd(1 - t)
        stroke(d, spine, wd2, 255)
        # the head, at the bottom of the S (the dragon looks up): a jaw, a snout, horns, a mane, whiskers
        hx, hy = spine[0]
        return None

    # a simpler, bolder composition: the dragon is drawn head-up with the S going down, so the S is mirrored in y
    def shape2(d, _):
        A = S * AA
        spine = bez((0.50 * A, 0.30 * A), (0.14 * A, 0.42 * A), (0.88 * A, 0.58 * A), (0.46 * A, 0.74 * A), 120)
        spine += bez((0.46 * A, 0.74 * A), (0.30 * A, 0.84 * A), (0.42 * A, 0.94 * A), (0.64 * A, 0.95 * A), 60)
        wd = lambda t: A * (0.035 + 0.10 * (1 - t) ** 0.7)
        stroke(d, spine, wd, 255)
        hx, hy = spine[0]
        # the head: a skull and a long snout turned to the left, an eye, two horns, a flame mane
        d.ellipse((hx - 0.085 * A, hy - 0.095 * A, hx + 0.085 * A, hy + 0.075 * A), fill=255)
        snout = bez((hx - 0.03 * A, hy - 0.04 * A), (hx - 0.10 * A, hy - 0.10 * A), (hx - 0.18 * A, hy - 0.08 * A), (hx - 0.24 * A, hy - 0.05 * A))
        stroke(d, snout, lambda t: A * 0.075 * (1 - 0.45 * t), 255)
        jaw = bez((hx - 0.02 * A, hy + 0.03 * A), (hx - 0.08 * A, hy + 0.07 * A), (hx - 0.15 * A, hy + 0.06 * A), (hx - 0.21 * A, hy + 0.03 * A))
        stroke(d, jaw, lambda t: A * 0.045 * (1 - 0.5 * t), 255)
        for sgn in (1, -1):
            horn = bez((hx + 0.01 * A, hy - 0.08 * A), (hx + 0.05 * A, hy - 0.17 * A), (hx + 0.10 * A, hy - 0.2 * A + sgn * 0.0 * A), (hx + 0.16 * A, hy - 0.17 * A))
            stroke(d, horn, lambda t: A * 0.032 * (1 - 0.8 * t), 255)
            break
        for i in range(5):  # the mane: flames streaming back
            fl = bez((hx + 0.06 * A, hy - 0.03 * A + i * 0.022 * A), (hx + 0.12 * A, hy - 0.05 * A + i * 0.03 * A), (hx + 0.18 * A, hy + i * 0.035 * A), (hx + 0.26 * A, hy + 0.02 * A + i * 0.04 * A))
            stroke(d, fl, lambda t: A * 0.028 * (1 - 0.85 * t), 255)
        for sgn in (1, -1):  # two long whiskers
            wh = bez((hx - 0.2 * A, hy - 0.02 * A), (hx - 0.3 * A, hy - 0.09 * A * sgn), (hx - 0.36 * A, hy + 0.04 * A * sgn), (hx - 0.44 * A, hy - 0.02 * A * sgn))
            stroke(d, wh, lambda t: A * 0.016 * (1 - 0.8 * t), 255)
        # the legs, two claws each, at the two bends
        for idx, sgn in ((38, 1), (92, -1)):
            x, y = spine[idx]
            for k in (-1, 1):
                leg = bez((x, y), (x + sgn * 0.08 * A, y + k * 0.05 * A), (x + sgn * 0.14 * A, y + k * 0.1 * A), (x + sgn * 0.2 * A, y + k * 0.1 * A))
                stroke(d, leg, lambda t: A * 0.034 * (1 - 0.5 * t), 255)
                for c in (-1, 0, 1):
                    cx, cy = x + sgn * 0.2 * A, y + k * 0.1 * A
                    d.polygon([(cx, cy), (cx + sgn * 0.045 * A, cy + (c * 0.035 + 0.01) * A), (cx + sgn * 0.0 * A, cy + (c * 0.035 + 0.03) * A)], fill=255)
        for i in range(8, len(spine) - 6, 9):  # the spikes on the back
            x, y = spine[i]
            (x0, y0), (x1, y1) = spine[i - 1], spine[i + 1]
            ang = math.atan2(y1 - y0, x1 - x0) - math.pi / 2
            r0 = wd(i / (len(spine) - 1)) / 2
            d.polygon([(x + math.cos(ang) * r0, y + math.sin(ang) * r0), (x + math.cos(ang + 0.5) * (r0 + 0.04 * A), y + math.sin(ang + 0.5) * (r0 + 0.04 * A)), (x + math.cos(ang + 0.9) * r0, y + math.sin(ang + 0.9) * r0)], fill=255)
        return spine, wd

    A = S * AA
    holder = {}

    def draw(d, _):
        holder["spine"], holder["wd"] = shape2(d, _)

    im = two_tone(draw)
    d = ImageDraw.Draw(im)
    spine, wd = holder["spine"], holder["wd"]
    scale_arcs(d, spine, wd)
    hx, hy = spine[0]
    d.ellipse((hx - 0.02 * A, hy - 0.05 * A, hx + 0.012 * A, hy - 0.02 * A), fill=(LINE, 255))  # the eye
    # clouds around, behind the dragon
    cl = Image.new("LA", (A, A), (0, 0))
    cd = ImageDraw.Draw(cl)
    for x, y, r in ((0.16, 0.2, 0.06), (0.82, 0.34, 0.07), (0.2, 0.62, 0.05), (0.82, 0.78, 0.06), (0.62, 0.12, 0.045), (0.14, 0.9, 0.05)):
        cloud(cd, x * A, y * A, r * A, (LINE + 40, 255))
    cl.alpha_composite(im)
    return cl


def phoenix():
    A = S * AA

    def draw(d, _):
        # the body: an oval leaning forward, a long neck curving to a small head, a crest, a fan of long tail feathers
        body = bez((0.50 * A, 0.62 * A), (0.40 * A, 0.50 * A), (0.40 * A, 0.38 * A), (0.50 * A, 0.28 * A))
        stroke(d, body, lambda t: A * (0.20 - 0.14 * t), 255)
        neck = bez((0.50 * A, 0.34 * A), (0.56 * A, 0.24 * A), (0.46 * A, 0.16 * A), (0.50 * A, 0.10 * A))
        stroke(d, neck, lambda t: A * (0.07 - 0.035 * t), 255)
        d.ellipse((0.46 * A, 0.055 * A, 0.545 * A, 0.12 * A), fill=255)
        d.polygon([(0.46 * A, 0.075 * A), (0.40 * A, 0.088 * A), (0.46 * A, 0.10 * A)], fill=255)  # the beak
        for i in range(4):  # the crest
            cr = bez((0.50 * A, 0.06 * A), (0.52 * A + i * 0.01 * A, 0.0), (0.56 * A + i * 0.02 * A, 0.0), (0.58 * A + i * 0.03 * A, 0.04 * A + i * 0.01 * A))
            stroke(d, cr, lambda t: A * 0.018 * (1 - 0.8 * t), 255)
        for sgn in (-1, 1):  # the wings
            wing = bez((0.50 * A, 0.40 * A), (0.50 * A + sgn * 0.20 * A, 0.30 * A), (0.50 * A + sgn * 0.40 * A, 0.34 * A), (0.50 * A + sgn * 0.44 * A, 0.52 * A))
            stroke(d, wing, lambda t: A * (0.10 - 0.07 * t), 255)
            for j in range(5):
                fe = bez((0.50 * A + sgn * (0.17 + 0.05 * j) * A, 0.40 * A + j * 0.01 * A), (0.50 * A + sgn * (0.28 + 0.04 * j) * A, 0.50 * A), (0.50 * A + sgn * (0.34 + 0.02 * j) * A, 0.60 * A), (0.50 * A + sgn * (0.34 + 0.02 * j) * A, 0.70 * A + j * 0.02 * A))
                stroke(d, fe, lambda t: A * 0.034 * (1 - 0.8 * t), 255)
        for j in range(7):  # the tail: long feathers, each ending in an eye
            sgn = -1 if j % 2 else 1
            off = (j // 2) * 0.07 * sgn
            tl = bez((0.50 * A, 0.60 * A), (0.50 * A + sgn * 0.12 * A, 0.72 * A), (0.50 * A + off * A + sgn * 0.06 * A, 0.86 * A), (0.50 * A + off * A * 1.4, 0.96 * A - (j // 2) * 0.03 * A))
            stroke(d, tl, lambda t: A * 0.045 * (1 - 0.65 * t), 255)
            ex, ey = tl[-8]
            d.ellipse((ex - 0.02 * A, ey - 0.026 * A, ex + 0.02 * A, ey + 0.026 * A), fill=0)

    im = two_tone(draw)
    d = ImageDraw.Draw(im)
    d.ellipse((0.5 * A - 0.045 * A, 0.0 * A + 0.07 * A, 0.5 * A - 0.025 * A, 0.0 * A + 0.09 * A), fill=(LINE, 255))
    return im


def medallion():
    """A round cloud medallion for the chest: a ring, a curl of clouds, a dot in the middle."""
    A = S * AA

    def draw(d, _):
        c = A / 2
        d.ellipse((c - 0.44 * A, c - 0.44 * A, c + 0.44 * A, c + 0.44 * A), fill=255)
        d.ellipse((c - 0.32 * A, c - 0.32 * A, c + 0.32 * A, c + 0.32 * A), fill=0)
        for k in range(4):
            ang = k * math.pi / 2
            x, y = c + math.cos(ang) * 0.19 * A, c + math.sin(ang) * 0.19 * A
            cloud(d, x, y, 0.07 * A)
        d.ellipse((c - 0.05 * A, c - 0.05 * A, c + 0.05 * A, c + 0.05 * A), fill=255)

    return two_tone(draw)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("dragon", dragon), ("phoenix", phoenix), ("medallion", medallion)):
        im = fn().resize((S, S), Image.LANCZOS)
        im.save(os.path.join(OUT, name + ".png"))
        print("wrote", name)
    sheet = Image.new("RGBA", (S * 3, S), (150, 110, 90, 255))
    for i, name in enumerate(("dragon", "phoenix", "medallion")):
        im = Image.open(os.path.join(OUT, name + ".png")).convert("RGBA")
        sheet.alpha_composite(im, (i * S, 0))
    sheet.resize((S * 3 // 2, S // 2)).save(os.path.join(OUT, "preview.png"))


if __name__ == "__main__":
    sys.exit(main())

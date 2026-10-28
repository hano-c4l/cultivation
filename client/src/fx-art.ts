import Phaser from "phaser";

/**
 * The small drawings every skill effect is built from, painted once on canvas (no art files): white shapes with soft edges that a tint colours
 * (a Canvas renderer ignores tints, so there they stay white). `map-layer.ts` generates its textures the same way.
 */
export const FX_TEX = { glow: "fx_glow", ring: "fx_ring", star: "fx_star", petal: "fx_petal", shard: "fx_shard", wisp: "fx_wisp", rune: "fx_rune", crescent: "fx_crescent", ray: "fx_ray" } as const;

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: Paint): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  paint(ctx, w, h);
  tex.refresh();
}

/** A soft radial blob: white in the middle, nothing at the edge. */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, core: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(core, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

export function ensureFxTextures(scene: Phaser.Scene): void {
  make(scene, FX_TEX.glow, 64, 64, (c) => blob(c, 32, 32, 32, 0.25));
  make(scene, FX_TEX.wisp, 64, 64, (c) => blob(c, 32, 32, 30, 0.05));
  make(scene, FX_TEX.ring, 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(0.82, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(64, 64, 62, 0, Math.PI * 2);
    c.fill();
  });
  // a four-pointed sparkle with a soft heart
  make(scene, FX_TEX.star, 48, 48, (c) => {
    blob(c, 24, 24, 12, 0.3);
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(24, 1);
    c.quadraticCurveTo(26, 22, 47, 24);
    c.quadraticCurveTo(26, 26, 24, 47);
    c.quadraticCurveTo(22, 26, 1, 24);
    c.quadraticCurveTo(22, 22, 24, 1);
    c.fill();
  });
  make(scene, FX_TEX.petal, 32, 20, (c) => {
    const g = c.createLinearGradient(0, 10, 32, 10);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0.8)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(1, 10);
    c.bezierCurveTo(8, -3, 24, 0, 31, 10);
    c.bezierCurveTo(24, 20, 8, 23, 1, 10);
    c.fill();
  });
  make(scene, FX_TEX.shard, 16, 40, (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(8, 0);
    c.lineTo(15, 26);
    c.lineTo(8, 40);
    c.lineTo(1, 26);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.45)";
    c.beginPath();
    c.moveTo(8, 4);
    c.lineTo(8, 36);
    c.lineTo(1, 26);
    c.closePath();
    c.fill();
  });
  // a streak: thin and bright in the middle, fading at both ends (a sword-light, a beam segment)
  make(scene, FX_TEX.ray, 128, 16, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(100, 2);
    c.lineTo(128, 8);
    c.lineTo(100, 14);
    c.closePath();
    c.fill();
  });
  // a sword-qi crescent: the sweep of a blade, thick in the middle
  make(scene, FX_TEX.crescent, 160, 80, (c) => {
    const g = c.createLinearGradient(0, 0, 160, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0.15)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(4, 76);
    c.bezierCurveTo(30, 4, 130, 4, 156, 40);
    c.bezierCurveTo(120, 18, 50, 24, 4, 76);
    c.fill();
  });
  // the formation circle of a cultivator: rings, eight trigram bars, a star inside
  make(scene, FX_TEX.rune, 256, 256, (c) => {
    c.translate(128, 128);
    c.strokeStyle = "#fff";
    c.lineCap = "round";
    const ring = (r: number, w: number, a = 1): void => {
      c.globalAlpha = a;
      c.lineWidth = w;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    };
    ring(122, 5);
    ring(112, 2, 0.8);
    ring(78, 3);
    ring(70, 1.5, 0.7);
    c.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i / 8) * Math.PI * 2);
      c.lineWidth = 4;
      // a trigram: three bars at the rim, some broken (the pattern differs round the circle)
      for (let b = 0; b < 3; b++) {
        const y = -108 + b * 9;
        const broken = (i >> b) & 1;
        c.beginPath();
        if (broken) {
          c.moveTo(-14, -y);
          c.lineTo(-3, -y);
          c.moveTo(3, -y);
          c.lineTo(14, -y);
          c.moveTo(-14, y - 2);
          c.lineTo(-3, y - 2);
          c.moveTo(3, y - 2);
          c.lineTo(14, y - 2);
        } else {
          c.moveTo(-14, y);
          c.lineTo(14, y);
        }
        c.stroke();
      }
      c.restore();
    }
    // the star of eight points, then a lotus of petals in the middle
    c.lineWidth = 2;
    c.globalAlpha = 0.9;
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 66 : 30;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.stroke();
    c.globalAlpha = 0.8;
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i / 8) * Math.PI * 2);
      c.beginPath();
      c.moveTo(0, -4);
      c.quadraticCurveTo(10, -18, 0, -30);
      c.quadraticCurveTo(-10, -18, 0, -4);
      c.stroke();
      c.restore();
    }
    c.globalAlpha = 0.35;
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(0, 0, 66, 0, Math.PI * 2);
    c.fill();
  });
}

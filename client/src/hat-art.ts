import type Phaser from "phaser";
import { HAT_SHAPES } from "@game/shared";

/**
 * The hats drawn on a head (one of HAT_SHAPES, chosen by the worn hat's set): each is a small light shape that the scene multiplies by the set's colour, so
 * the same six pictures give many looks. Drawn once on canvas, no art files; the picture's bottom edge sits on the top of the head. Every picture is symmetric
 * and seen from a little above, so a turn of the head never needs a flip or a squash.
 */
export const HAT_TEX = (shape: number): string => `hat_${shape}`;
/** The front ornament of a hat shape (see ORN). */
export const HAT_ORN_TEX = (shape: number): string => `hat_orn_${shape}`;

type Paint = (c: CanvasRenderingContext2D) => void;

const W = 40;
const H = 36;
const INK = "#3b3040";

const lit = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [at, col] of stops) g.addColorStop(at, col);
  return g;
};

const SHAPES: readonly Paint[] = [
  // 0: a wide bamboo hat: a round brim seen from above with a cone rising from it, woven lines and a chin cord
  (c) => {
    c.lineJoin = "round";
    c.fillStyle = lit(c, 0, 24, 0, 32, [[0, "#f6ecd0"], [1, "#cbb67c"]]);
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    c.ellipse(20, 26, 19, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = lit(c, 8, 4, 32, 4, [[0, "#d9c690"], [0.45, "#fbf3da"], [1, "#c9b274"]]);
    c.beginPath();
    c.moveTo(5, 25);
    c.quadraticCurveTo(14, 20, 20, 3);
    c.quadraticCurveTo(26, 20, 35, 25);
    c.quadraticCurveTo(20, 31, 5, 25);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(107,90,48,0.55)";
    c.lineWidth = 1;
    for (const k of [0.3, 0.55, 0.8]) {
      const y = 25 - 20 * (1 - k) * 1.05;
      c.beginPath();
      c.moveTo(20 - 15 * k, y);
      c.quadraticCurveTo(20, y + 4, 20 + 15 * k, y);
      c.stroke();
    }
    c.strokeStyle = "#a63c3c";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(6, 27);
    c.quadraticCurveTo(5, 32, 8, 34);
    c.moveTo(34, 27);
    c.quadraticCurveTo(35, 32, 32, 34);
    c.stroke();
  },
  // 1: a scholar's cap: a tall square-topped cap with a gold band and jade clasp, two long wings at the sides
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    for (const k of [-1, 1]) {
      c.fillStyle = lit(c, 20, 0, 20 + k * 18, 0, [[0, "#f4f0e6"], [1, "#c9c4d8"]]);
      c.beginPath();
      c.moveTo(20 + k * 8, 20);
      c.lineTo(20 + k * 19, 17);
      c.lineTo(20 + k * 19, 23);
      c.lineTo(20 + k * 8, 24);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = lit(c, 10, 0, 30, 0, [[0, "#d8d4e6"], [0.5, "#fbf8ee"], [1, "#d0ccde"]]);
    c.beginPath();
    c.moveTo(10, 28);
    c.lineTo(11, 8);
    c.quadraticCurveTo(20, 3, 29, 8);
    c.lineTo(30, 28);
    c.quadraticCurveTo(20, 33, 10, 28);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = lit(c, 0, 22, 0, 30, [[0, "#f0cd6a"], [1, "#b8892a"]]);
    c.beginPath();
    c.moveTo(10, 23);
    c.quadraticCurveTo(20, 28, 30, 23);
    c.lineTo(30, 28);
    c.quadraticCurveTo(20, 33, 10, 28);
    c.closePath();
    c.fill();
    c.stroke();
  },
  // 2: a crown: a gold band with five rising points, each tipped with a pearl, a red gem in front
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = "#6a4a0c";
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 0, 4, 0, 32, [[0, "#fff1b0"], [0.5, "#f0c850"], [1, "#b8851a"]]);
    c.beginPath();
    c.moveTo(6, 30);
    c.lineTo(5, 12);
    c.lineTo(12, 19);
    c.lineTo(15, 7);
    c.lineTo(20, 17);
    c.lineTo(25, 7);
    c.lineTo(28, 19);
    c.lineTo(35, 12);
    c.lineTo(34, 30);
    c.quadraticCurveTo(20, 36, 6, 30);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ffffff";
    for (const [x, y] of [[5, 11], [15, 6], [25, 6], [35, 11], [20, 15]] as const) {
      c.beginPath();
      c.arc(x, y, 2.1, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  },
  // 3: a hair crown: a round bun in a gold cap with a jade pin through it level across (the same from both sides)
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    const bun = c.createRadialGradient(16, 13, 1, 20, 17, 12);
    bun.addColorStop(0, "#ffffff");
    bun.addColorStop(1, "#bcbccc");
    c.fillStyle = bun;
    c.beginPath();
    c.ellipse(20, 17, 10, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = lit(c, 0, 24, 0, 33, [[0, "#f0cd6a"], [1, "#b8892a"]]);
    c.beginPath();
    c.moveTo(11, 26);
    c.quadraticCurveTo(20, 22, 29, 26);
    c.lineTo(28, 31);
    c.quadraticCurveTo(20, 34, 12, 31);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "#5fd0a4";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(3, 15);
    c.lineTo(37, 15);
    c.stroke();
    c.strokeStyle = "#d4fff0";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(5, 14);
    c.lineTo(35, 14);
    c.stroke();
    c.fillStyle = "#e8c24a";
    for (const x of [3, 37]) {
      c.beginPath();
      c.arc(x, 15, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  },
  // 4: a feathered crest: five plumes fanned out of a gold band
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = "#7a3a2a";
    c.lineWidth = 1.2;
    for (const [rot, len] of [[-0.8, 17], [-0.4, 22], [0, 26], [0.4, 22], [0.8, 17]] as const) {
      c.save();
      c.translate(20, 28);
      c.rotate(rot);
      c.fillStyle = lit(c, 0, 0, 0, -len, [[0, "#ffb85a"], [0.55, "#fff0c0"], [1, "#ffffff"]]);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-6.5, -len * 0.5, 0, -len);
      c.quadraticCurveTo(6.5, -len * 0.5, 0, 0);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(0, -2);
      c.lineTo(0, -len + 3);
      c.stroke();
      c.restore();
    }
    c.strokeStyle = "#6a4a0c";
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 0, 26, 0, 34, [[0, "#f0cd6a"], [1, "#b8892a"]]);
    c.beginPath();
    c.moveTo(9, 29);
    c.quadraticCurveTo(20, 25, 31, 29);
    c.lineTo(30, 34);
    c.quadraticCurveTo(20, 36, 10, 34);
    c.closePath();
    c.fill();
    c.stroke();
  },
  // 5: a headband: a silk band round the brow with a jewel in front and a ribbon hanging at each side
  (c) => {
    c.lineJoin = "round";
    c.lineCap = "round";
    for (const k of [-1, 1]) {
      c.strokeStyle = "#e8e8f2";
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(20 + k * 17, 24);
      c.quadraticCurveTo(20 + k * 22, 29, 20 + k * 18, 34);
      c.stroke();
    }
    c.fillStyle = lit(c, 0, 18, 0, 31, [[0, "#ffffff"], [1, "#c9c9dc"]]);
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(3, 24);
    c.quadraticCurveTo(20, 17, 37, 24);
    c.lineTo(37, 30);
    c.quadraticCurveTo(20, 36, 3, 30);
    c.closePath();
    c.fill();
    c.stroke();
  },
  // 6: an iron helm: a steel dome with a band, a nose guard and a ridge along the top
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 8, 4, 32, 4, [[0, "#9aa4b4"], [0.45, "#f0f4fa"], [1, "#8a94a6"]]);
    c.beginPath();
    c.moveTo(7, 28);
    c.quadraticCurveTo(6, 6, 20, 5);
    c.quadraticCurveTo(34, 6, 33, 28);
    c.quadraticCurveTo(20, 33, 7, 28);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = lit(c, 0, 22, 0, 32, [[0, "#c8a24a"], [1, "#7a5a14"]]);
    c.beginPath();
    c.moveTo(7, 24);
    c.quadraticCurveTo(20, 29, 33, 24);
    c.lineTo(33, 28.5);
    c.quadraticCurveTo(20, 33.5, 7, 28.5);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(60,60,80,0.7)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(20, 6);
    c.lineTo(20, 24);
    c.stroke();
  },
  // 7: a lotus crown: a gold band with a ring of pink petals
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = "#7a3a5a";
    c.lineWidth = 1.2;
    for (const [x, h, rot] of [[8, 14, -0.7], [14, 19, -0.3], [20, 22, 0], [26, 19, 0.3], [32, 14, 0.7]] as const) {
      c.save();
      c.translate(x, 27);
      c.rotate(rot);
      c.fillStyle = lit(c, 0, 0, 0, -h, [[0, "#ffd0e8"], [1, "#fff6fb"]]);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-6, -h * 0.5, 0, -h);
      c.quadraticCurveTo(6, -h * 0.5, 0, 0);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.strokeStyle = "#6a4a0c";
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 0, 24, 0, 33, [[0, "#f6dc7a"], [1, "#b8892a"]]);
    c.beginPath();
    c.moveTo(6, 27);
    c.quadraticCurveTo(20, 23, 34, 27);
    c.lineTo(33, 32);
    c.quadraticCurveTo(20, 35, 7, 32);
    c.closePath();
    c.fill();
    c.stroke();
  },
  // 8: a dragon crown: a dark gold band with two curved horns and a spine between them
  (c) => {
    c.lineJoin = "round";
    c.lineCap = "round";
    c.strokeStyle = "#e8e0c0";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(11, 26);
    c.quadraticCurveTo(3, 14, 9, 3);
    c.moveTo(29, 26);
    c.quadraticCurveTo(37, 14, 31, 3);
    c.stroke();
    c.strokeStyle = "#3b3040";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(12.5, 26);
    c.quadraticCurveTo(5, 14, 10.5, 4);
    c.moveTo(27.5, 26);
    c.quadraticCurveTo(35, 14, 29.5, 4);
    c.stroke();
    c.fillStyle = "#c0382a";
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(16, 26);
    c.lineTo(20, 10);
    c.lineTo(24, 26);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "#6a4a0c";
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 0, 24, 0, 33, [[0, "#c8a24a"], [1, "#5a4012"]]);
    c.beginPath();
    c.moveTo(7, 27);
    c.quadraticCurveTo(20, 23, 33, 27);
    c.lineTo(32, 32);
    c.quadraticCurveTo(20, 35, 8, 32);
    c.closePath();
    c.fill();
    c.stroke();
  },
  // 9: a phoenix tiara: a fan of flame feathers rising from a red and gold band
  (c) => {
    c.lineJoin = "round";
    c.strokeStyle = "#7a2a1a";
    c.lineWidth = 1.2;
    for (const [rot, len, col] of [[-1, 15, "#ff9a3c"], [-0.55, 21, "#ffcf5a"], [0, 25, "#ff6a3a"], [0.55, 21, "#ffcf5a"], [1, 15, "#ff9a3c"]] as const) {
      c.save();
      c.translate(20, 28);
      c.rotate(rot);
      c.fillStyle = lit(c, 0, 0, 0, -len, [[0, "#d8302a"], [0.5, col], [1, "#fff0b0"]]);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-5.5, -len * 0.5, 0, -len);
      c.quadraticCurveTo(5.5, -len * 0.5, 0, 0);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.strokeStyle = "#6a4a0c";
    c.lineWidth = 1.4;
    c.fillStyle = lit(c, 0, 25, 0, 34, [[0, "#e8483a"], [1, "#8a1a1a"]]);
    c.beginPath();
    c.moveTo(8, 28);
    c.quadraticCurveTo(20, 24, 32, 28);
    c.lineTo(31, 33);
    c.quadraticCurveTo(20, 36, 9, 33);
    c.closePath();
    c.fill();
    c.stroke();
  },
];

/**
 * The part of a hat that sits at its front (a clasp, a gem, a tuft): drawn apart in its own colours, so the scene can carry it round the hat as the figure turns and
 * the hat seems to turn with the head. One small picture for each shape.
 */
const jewel = (c: CanvasRenderingContext2D, from: string, to: string, edge: string, r = 4): void => {
  const g = c.createRadialGradient(6, 6, 0.5, 7, 7, r + 1);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  c.fillStyle = g;
  c.strokeStyle = edge;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(7, 7, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
};
const tuft = (c: CanvasRenderingContext2D, fill: string, edge: string): void => {
  c.fillStyle = fill;
  c.strokeStyle = edge;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(7, 13);
  c.quadraticCurveTo(0, 8, 4, 1);
  c.quadraticCurveTo(7, 5, 10, 1);
  c.quadraticCurveTo(14, 8, 7, 13);
  c.fill();
  c.stroke();
};
const ORN: readonly Paint[] = [
  (c) => jewel(c, "#ff9a8a", "#c83a3a", INK, 3.4), // 0: a red tassel knot
  (c) => jewel(c, "#e8fff4", "#3fb88a", INK, 4), // 1: a jade clasp
  (c) => jewel(c, "#ffb0a0", "#c8202a", "#6a4a0c", 4.2), // 2: a red gem
  (c) => jewel(c, "#e8fff4", "#3fb88a", INK, 3.6), // 3: a jade bead
  (c) => tuft(c, "#ffd36a", "#8a5a14"), // 4: a golden plume
  (c) => jewel(c, "#d8f6ff", "#2a9ae0", "#e8c24a", 4), // 5: a blue jewel
  (c) => tuft(c, "#d8302a", "#5a1010"), // 6: a red plume
  (c) => tuft(c, "#ff9ac8", "#7a3a5a"), // 7: a pink lotus bud
  (c) => jewel(c, "#ffffff", "#9fd8ff", "#5a7a9a", 4), // 8: a pearl
  (c) => jewel(c, "#ffd0c0", "#b01820", "#f2c24a", 4.2), // 9: a ruby
];


/** Draws one hat (and its front ornament, to the lower right of it) on a 2D canvas: the Admin's preview of a shape. */
export function paintHat(shape: number, c: CanvasRenderingContext2D): void {
  SHAPES[shape % SHAPES.length]!(c);
  c.save();
  c.translate(W - 8, H - 12);
  ORN[shape % ORN.length]!(c);
  c.restore();
}

export function ensureHatTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < HAT_SHAPES; i++) {
    const key = HAT_TEX(i);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, W, H);
    if (!tex) continue;
    SHAPES[i % SHAPES.length]!(tex.getContext());
    tex.refresh();
    const orn = scene.textures.createCanvas(HAT_ORN_TEX(i), 14, 14);
    if (!orn) continue;
    ORN[i % ORN.length]!(orn.getContext());
    orn.refresh();
  }
}

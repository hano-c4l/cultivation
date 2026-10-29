import Phaser from "phaser";
import { HAT_SHAPES } from "@game/shared";

/**
 * The hats drawn on a head (one of HAT_SHAPES, chosen by the worn hat's set): each is a small light shape that the scene multiplies by the set's colour, so
 * the same six pictures give many looks. Drawn once on canvas, no art files; the picture's bottom edge sits on the top of the head.
 */
export const HAT_TEX = (shape: number): string => `hat_${shape}`;

type Paint = (c: CanvasRenderingContext2D) => void;

const SHAPES: readonly Paint[] = [
  // 0: a wide bamboo hat, a cone over a brim
  (c) => {
    c.fillStyle = "#f4ead0";
    c.strokeStyle = "#6b5a30";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(2, 20);
    c.lineTo(15, 4);
    c.lineTo(28, 20);
    c.quadraticCurveTo(15, 25, 2, 20);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(8, 14);
    c.lineTo(22, 14);
    c.stroke();
  },
  // 1: a scholar's cap, flat on top with two wings behind it
  (c) => {
    c.fillStyle = "#f4f0e6";
    c.strokeStyle = "#4a4a5a";
    c.lineWidth = 1.5;
    c.fillRect(8, 6, 14, 12);
    c.strokeRect(8, 6, 14, 12);
    c.fillRect(1, 11, 8, 4);
    c.strokeRect(1, 11, 8, 4);
    c.fillRect(21, 11, 8, 4);
    c.strokeRect(21, 11, 8, 4);
    c.fillStyle = "#c8a24a";
    c.fillRect(8, 15, 14, 3);
  },
  // 2: a crown of five points
  (c) => {
    c.fillStyle = "#f8e8a8";
    c.strokeStyle = "#7a5a14";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(4, 22);
    c.lineTo(4, 8);
    c.lineTo(10, 15);
    c.lineTo(15, 4);
    c.lineTo(20, 15);
    c.lineTo(26, 8);
    c.lineTo(26, 22);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#e0503a";
    c.beginPath();
    c.arc(15, 16, 2.5, 0, Math.PI * 2);
    c.fill();
  },
  // 3: a hair bun with a long jade pin
  (c) => {
    c.fillStyle = "#f2f2f2";
    c.strokeStyle = "#3a3a4a";
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(15, 15, 8, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = "#7fe0b8";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(4, 8);
    c.lineTo(27, 18);
    c.stroke();
  },
  // 4: a crest of three tall feathers
  (c) => {
    for (const [x, h, rot] of [[8, 14, -0.35], [15, 20, 0], [22, 14, 0.35]] as const) {
      c.save();
      c.translate(x, 24);
      c.rotate(rot);
      c.fillStyle = "#fff4d8";
      c.strokeStyle = "#8a3a2a";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-5, -h * 0.5, 0, -h);
      c.quadraticCurveTo(5, -h * 0.5, 0, 0);
      c.fill();
      c.stroke();
      c.restore();
    }
  },
  // 5: a headband with a round jewel and two ribbons
  (c) => {
    c.fillStyle = "#f0f0f6";
    c.strokeStyle = "#4a4a6a";
    c.lineWidth = 1.5;
    c.fillRect(3, 14, 24, 5);
    c.strokeRect(3, 14, 24, 5);
    c.fillStyle = "#7ad0ff";
    c.beginPath();
    c.arc(15, 16, 4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = "#f0f0f6";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(27, 17);
    c.quadraticCurveTo(30, 22, 27, 27);
    c.moveTo(27, 17);
    c.quadraticCurveTo(32, 20, 31, 26);
    c.stroke();
  },
];

export function ensureHatTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < HAT_SHAPES; i++) {
    const key = HAT_TEX(i);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, 34, 30);
    if (!tex) continue;
    SHAPES[i % SHAPES.length]!(tex.getContext());
    tex.refresh();
  }
}

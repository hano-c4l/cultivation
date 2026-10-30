import Phaser from "phaser";
import type { FlightStyle } from "@game/shared";

/**
 * What a rider of the flight pháp bảo stands on, drawn once on canvas (no art files, in the style of the xianxia cultivators: a flying sword, a cloud,
 * a lotus). Each is wider than tall, seen from a raised angle, and glows a little so it reads as spirit light and not as a prop.
 */
export const FLIGHT_TEX: Readonly<Record<FlightStyle, string>> = { plain: "fly_plain", sword: "fly_sword", cloud: "fly_cloud", lotus: "fly_lotus", phoenix: "fly_phoenix", dragon: "fly_dragon" };
/** The pieces the dragon of Luyện Hư is built from (it is laid out joint by joint in the scene). */
export const DRAGON_SEG = "fly_dragon_seg";
export const DRAGON_HEAD = "fly_dragon_head";
export const DRAGON_TAIL = "fly_dragon_tail";
/** A puff of the cloud the dragon rides on (a few of them, along its body). */
export const DRAGON_MIST = "fly_dragon_mist";
/** The colour of the spirit light that trails behind each. */
export const FLIGHT_GLOW: Readonly<Record<FlightStyle, number>> = { plain: 0x9fe8ff, sword: 0xbfe9ff, cloud: 0xe8f6ff, lotus: 0xffc6e6, phoenix: 0xff9a4a, dragon: 0xffe27a };
/**
 * Whether a style turns to face where it flies (the others are round, or drawn the same from every side), and the way the picture points before it is turned (radians on the
 * picture: 0 is to the right, -PI/2 is up). `flip` mirrors a picture that would be upside down when it points left (it has a top and a bottom).
 */
export const FLIGHT_TURNS: Readonly<Partial<Record<FlightStyle, { points: number; flip: boolean; tail: number }>>> = {
  sword: { points: 0, flip: true, tail: 50 },
  dragon: { points: 0, flip: true, tail: 70 },
  phoenix: { points: -Math.PI / 2, flip: false, tail: 34 },
};
/** How much bigger than the others each is drawn: the two highest realms ride something grand. */
export const FLIGHT_SCALE: Readonly<Record<FlightStyle, number>> = { plain: 1, sword: 1, cloud: 1, lotus: 1, phoenix: 1.3, dragon: 1.55 };

type Paint = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: Paint): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  paint(tex.getContext(), w, h);
  tex.refresh();
}

function halo(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: string, a: number): void {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function ensureFlightTextures(scene: Phaser.Scene): void {
  make(scene, FLIGHT_TEX.plain, 48, 24, (c) => {
    halo(c, 24, 12, 22, 10, "159,232,255", 0.85);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(24, 12, 18, 7, 0, 0, Math.PI * 2);
    c.stroke();
  });
  // a flying sword: a long jade-steel blade, a golden guard and tassel, a pale glow under it
  make(scene, FLIGHT_TEX.sword, 112, 40, (c) => {
    halo(c, 56, 24, 52, 12, "150,220,255", 0.55);
    c.save();
    c.translate(56, 20);
    c.rotate(-0.12);
    const blade = c.createLinearGradient(0, -5, 0, 5);
    blade.addColorStop(0, "#f4fbff");
    blade.addColorStop(0.5, "#b8dcef");
    blade.addColorStop(1, "#6fa3c0");
    c.fillStyle = blade;
    c.strokeStyle = "#3a5f78";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-46, 0);
    c.lineTo(-40, -5);
    c.lineTo(34, -5);
    c.lineTo(52, 0);
    c.lineTo(34, 5);
    c.lineTo(-40, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-36, 0);
    c.lineTo(44, 0);
    c.stroke();
    // the guard and the hilt
    c.fillStyle = "#e6c35a";
    c.strokeStyle = "#7a5a14";
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(-40, 0, 3.5, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#7a2f2f";
    c.fillRect(-60, -2.5, 18, 5);
    // a tassel trailing from the pommel
    c.strokeStyle = "#d94b4b";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-60, 0);
    c.quadraticCurveTo(-68, 6, -74, 3);
    c.stroke();
    c.restore();
  });
  // a cloud: three soft billows with a lit top, drifting wisps at the edge
  make(scene, FLIGHT_TEX.cloud, 96, 44, (c) => {
    halo(c, 48, 26, 46, 14, "225,244,255", 0.45);
    const puff = (x: number, y: number, r: number, a: number): void => {
      const g = c.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.7, `rgba(226,242,255,${a * 0.9})`);
      g.addColorStop(1, "rgba(190,222,248,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    };
    puff(26, 26, 14, 0.95);
    puff(48, 22, 17, 1);
    puff(70, 26, 14, 0.95);
    puff(38, 30, 12, 0.85);
    puff(60, 30, 12, 0.85);
    puff(10, 30, 7, 0.6);
    puff(88, 30, 7, 0.6);
  });
  // a lotus: two rings of pointed petals seen from above, pink at the tips, with a golden heart
  make(scene, FLIGHT_TEX.lotus, 88, 44, (c) => {
    halo(c, 44, 24, 42, 14, "255,198,230", 0.5);
    c.translate(44, 24);
    c.scale(1, 0.46);
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? 10 : 8;
      const r = ring === 0 ? 40 : 27;
      for (let i = 0; i < n; i++) {
        c.save();
        c.rotate((i / n) * Math.PI * 2 + ring * 0.3);
        const g = c.createLinearGradient(0, 0, r, 0);
        g.addColorStop(0, "#fff5fa");
        g.addColorStop(1, ring === 0 ? "#f7a6cf" : "#ffd0e8");
        c.fillStyle = g;
        c.strokeStyle = "rgba(160,70,120,0.7)";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(r * 0.5, -r * 0.34, r, 0);
        c.quadraticCurveTo(r * 0.5, r * 0.34, 0, 0);
        c.fill();
        c.stroke();
        c.restore();
      }
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 11);
    g.addColorStop(0, "#fff6b8");
    g.addColorStop(1, "#e6a82a");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 10, 0, Math.PI * 2);
    c.fill();
  });
  // a phoenix (Hóa Thần): wings spread flat like a fan of flame feathers, a long tail, a crested head, a hot glow
  make(scene, FLIGHT_TEX.phoenix, 144, 64, (c) => {
    halo(c, 72, 34, 70, 22, "255,150,70", 0.55);
    const wing = (dir: number): void => {
      c.save();
      c.translate(72, 32);
      c.scale(dir, 1);
      for (let i = 0; i < 7; i++) {
        c.save();
        c.rotate(-0.1 + i * 0.13);
        const len = 56 - i * 3.5;
        const g = c.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, "#fff0b0");
        g.addColorStop(0.5, "#ff9a3c");
        g.addColorStop(1, "#d8302a");
        c.fillStyle = g;
        c.strokeStyle = "rgba(120,30,20,0.8)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(4, 0);
        c.quadraticCurveTo(len * 0.5, -7, len, -1);
        c.quadraticCurveTo(len * 0.55, 6, 4, 3);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
      }
      c.restore();
    };
    wing(1);
    wing(-1);
    // the body, the tail and the head
    c.fillStyle = "#ffcf5a";
    c.strokeStyle = "#8a3a14";
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(72, 34, 9, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    for (let i = -2; i <= 2; i++) {
      c.strokeStyle = i === 0 ? "#ffe9a0" : "#ff7a3a";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(72, 46);
      c.quadraticCurveTo(72 + i * 7, 56, 72 + i * 11, 62);
      c.stroke();
    }
    c.fillStyle = "#ffe9a0";
    c.strokeStyle = "#8a3a14";
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(72, 18, 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#e8602a";
    c.beginPath();
    c.moveTo(66, 14);
    c.lineTo(72, 3);
    c.lineTo(78, 14);
    c.closePath();
    c.fill();
    c.fillStyle = "#f2b22a";
    c.beginPath();
    c.moveTo(70, 20);
    c.lineTo(72, 27);
    c.lineTo(74, 20);
    c.closePath();
    c.fill();
  });
  // the dragon's glow (Luyện Hư): a round golden halo only; the banks of cloud under it are separate puffs (DRAGON_MIST) laid out along the body, so they turn with it
  make(scene, FLIGHT_TEX.dragon, 176, 72, (c) => {
    halo(c, 88, 36, 84, 30, "255,226,122", 0.4);
  });
  make(scene, DRAGON_MIST, 56, 36, (c) => {
    const g = c.createRadialGradient(28, 18, 1, 28, 18, 26);
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(200,225,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(28, 18, 26, 16, 0, 0, Math.PI * 2);
    c.fill();
  });
  // one scale-covered joint of the body: a lit golden ball with a darker belly, a ring of scales and a red spine on top (seen from any side it reads as round)
  make(scene, DRAGON_SEG, 30, 34, (c) => {
    c.fillStyle = "#e0583a";
    c.strokeStyle = "#6a3a0c";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(10, 11);
    c.lineTo(15, 1);
    c.lineTo(20, 11);
    c.closePath();
    c.fill();
    c.stroke();
    const g = c.createRadialGradient(12, 17, 1, 15, 22, 13);
    g.addColorStop(0, "#fff3b8");
    g.addColorStop(0.45, "#f0b830");
    g.addColorStop(1, "#9a5a14");
    c.fillStyle = g;
    c.strokeStyle = "#5a300a";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(15, 21, 11.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(110,60,10,0.5)";
    c.lineWidth = 1;
    for (const r of [5, 8.5]) {
      c.beginPath();
      c.arc(15, 21, r, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    }
  });
  // the head, pointing right: jaw, nose, two horns, whiskers, a red eye and the pearl it chases
  make(scene, DRAGON_HEAD, 76, 50, (c) => {
    const g = c.createLinearGradient(0, 14, 0, 40);
    g.addColorStop(0, "#ffe9a0");
    g.addColorStop(0.55, "#f0b830");
    g.addColorStop(1, "#a8661a");
    c.lineJoin = "round";
    c.strokeStyle = "#e8e0c0"; // horns
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(16, 18);
    c.quadraticCurveTo(8, 6, 16, 2);
    c.moveTo(24, 16);
    c.quadraticCurveTo(20, 4, 30, 2);
    c.stroke();
    c.fillStyle = g;
    c.strokeStyle = "#5a300a";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(6, 20);
    c.quadraticCurveTo(24, 10, 46, 17);
    c.quadraticCurveTo(58, 20, 60, 26);
    c.quadraticCurveTo(56, 33, 44, 33);
    c.quadraticCurveTo(24, 40, 6, 34);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "#5a300a"; // the mouth line and the nostril
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(28, 29);
    c.quadraticCurveTo(46, 31, 58, 27);
    c.stroke();
    c.fillStyle = "#5a300a";
    c.beginPath();
    c.arc(54, 21, 1.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff6d0";
    c.beginPath();
    c.ellipse(34, 22, 5, 3.6, -0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d8302a";
    c.beginPath();
    c.arc(35, 22, 2.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffe9a0"; // whiskers
    c.lineWidth = 1.6;
    for (const k of [-1, 1]) {
      c.beginPath();
      c.moveTo(52, 27 + k * 2);
      c.quadraticCurveTo(66, 27 + k * 12, 74, 27 + k * 6);
      c.stroke();
    }
    c.fillStyle = "#e0583a"; // the mane behind the head
    c.beginPath();
    c.moveTo(8, 20);
    c.lineTo(0, 16);
    c.lineTo(5, 26);
    c.lineTo(0, 34);
    c.lineTo(9, 32);
    c.closePath();
    c.fill();
  });
  // the tail's tip: a small curled flame of fin
  make(scene, DRAGON_TAIL, 30, 20, (c) => {
    c.fillStyle = "#e0583a";
    c.strokeStyle = "#6a3a0c";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, 10);
    c.quadraticCurveTo(12, 0, 28, 2);
    c.quadraticCurveTo(18, 8, 26, 12);
    c.quadraticCurveTo(14, 12, 28, 19);
    c.quadraticCurveTo(10, 20, 0, 10);
    c.closePath();
    c.fill();
    c.stroke();
  });
}

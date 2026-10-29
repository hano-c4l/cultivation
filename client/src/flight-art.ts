import Phaser from "phaser";
import type { FlightStyle } from "@game/shared";

/**
 * What a rider of the flight pháp bảo stands on, drawn once on canvas (no art files, in the style of the xianxia cultivators: a flying sword, a cloud,
 * a lotus). Each is wider than tall, seen from a raised angle, and glows a little so it reads as spirit light and not as a prop.
 */
export const FLIGHT_TEX: Readonly<Record<FlightStyle, string>> = { plain: "fly_plain", sword: "fly_sword", cloud: "fly_cloud", lotus: "fly_lotus", phoenix: "fly_phoenix", dragon: "fly_dragon" };
/** The colour of the spirit light that trails behind each. */
export const FLIGHT_GLOW: Readonly<Record<FlightStyle, number>> = { plain: 0x9fe8ff, sword: 0xbfe9ff, cloud: 0xe8f6ff, lotus: 0xffc6e6, phoenix: 0xff9a4a, dragon: 0xffe27a };
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
  // a dragon (Luyện Hư): a long golden serpent in loops, scaled and spined, with a horn, whiskers and a pearl, coiling over a bed of cloud
  make(scene, FLIGHT_TEX.dragon, 176, 72, (c) => {
    halo(c, 88, 40, 84, 24, "255,226,122", 0.5);
    const cloud = (x: number, y: number, r: number): void => {
      const g = c.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.8)");
      g.addColorStop(1, "rgba(200,225,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const [x, y, r] of [[30, 58, 16], [62, 62, 18], [100, 60, 18], [140, 58, 16]] as const) cloud(x, y, r);
    // the body: a wave drawn as a thick stroke, then a lighter belly line and scale ticks along it
    const wave = (t: number): [number, number] => [18 + t * 120, 38 + Math.sin(t * Math.PI * 3) * 14 * (1 - t * 0.35)];
    const stroke = (w: number, style: string | CanvasGradient, from: number, to: number): void => {
      c.strokeStyle = style;
      c.lineWidth = w;
      c.lineCap = "round";
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = from + ((to - from) * i) / 60;
        const [x, y] = wave(t);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    };
    const body = c.createLinearGradient(0, 20, 0, 56);
    body.addColorStop(0, "#ffe9a0");
    body.addColorStop(0.5, "#f0b830");
    body.addColorStop(1, "#b8741a");
    stroke(15, "#6a3a0c", 0, 1);
    stroke(12, body, 0, 1);
    stroke(4, "rgba(255,250,215,0.85)", 0.04, 0.96);
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const [x, y] = wave(t);
      c.strokeStyle = "rgba(110,60,10,0.55)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x, y - 6 + t * 2);
      c.lineTo(x + 3, y + 6 - t * 2);
      c.stroke();
      if (i % 2 === 0) {
        c.fillStyle = "#e0583a"; // the spine
        c.beginPath();
        c.moveTo(x - 2, y - 6);
        c.lineTo(x + 1, y - 12 + t * 3);
        c.lineTo(x + 3, y - 6);
        c.closePath();
        c.fill();
      }
    }
    // the head at the end of the wave: jaw, horn, eye, whiskers and the pearl it chases
    const [hx, hy] = wave(1);
    c.fillStyle = "#f6c64a";
    c.strokeStyle = "#6a3a0c";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(hx - 8, hy - 8);
    c.quadraticCurveTo(hx + 14, hy - 14, hx + 28, hy - 2);
    c.quadraticCurveTo(hx + 14, hy + 8, hx - 8, hy + 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "#e8e0c0";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(hx - 6, hy - 9);
    c.quadraticCurveTo(hx - 14, hy - 22, hx - 4, hy - 26);
    c.stroke();
    c.strokeStyle = "#ffe9a0";
    c.lineWidth = 1.5;
    for (const dy of [-3, 4]) {
      c.beginPath();
      c.moveTo(hx + 24, hy + dy);
      c.quadraticCurveTo(hx + 36, hy + dy + (dy > 0 ? 10 : -10), hx + 42, hy + dy + (dy > 0 ? 4 : -4));
      c.stroke();
    }
    c.fillStyle = "#d8302a";
    c.beginPath();
    c.arc(hx + 8, hy - 3, 2.6, 0, Math.PI * 2);
    c.fill();
    const pearl = c.createRadialGradient(hx + 52, hy - 8, 0, hx + 52, hy - 8, 8);
    pearl.addColorStop(0, "#ffffff");
    pearl.addColorStop(1, "#9fd8ff");
    c.fillStyle = pearl;
    c.beginPath();
    c.arc(hx + 52, hy - 8, 6, 0, Math.PI * 2);
    c.fill();
  });
}

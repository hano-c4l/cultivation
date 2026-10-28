import Phaser from "phaser";
import type { FlightStyle } from "@game/shared";

/**
 * What a rider of the flight pháp bảo stands on, drawn once on canvas (no art files, in the style of the xianxia cultivators: a flying sword, a cloud,
 * a lotus). Each is wider than tall, seen from a raised angle, and glows a little so it reads as spirit light and not as a prop.
 */
export const FLIGHT_TEX: Readonly<Record<FlightStyle, string>> = { plain: "fly_plain", sword: "fly_sword", cloud: "fly_cloud", lotus: "fly_lotus" };
/** The colour of the spirit light that trails behind each. */
export const FLIGHT_GLOW: Readonly<Record<FlightStyle, number>> = { plain: 0x9fe8ff, sword: 0xbfe9ff, cloud: 0xe8f6ff, lotus: 0xffc6e6 };

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
}

/**
 * The qi round a cultivator: a thin smoke that follows the outline of the figure (over the head and down both sides, never under the feet).
 * Its colour is that of the realm (the theme's `realmColors`) and it grows stronger with the realm and, inside a realm, with the stage: a pale thread
 * at the first stage, the full colour and a thicker band at the last. This file is only the numbers and the drawing; the scene calls it every frame.
 */
import type Phaser from "phaser";

export interface QiStyle {
  /** 0xRRGGBB. */
  color: number;
  /** Opacity of the soft band under the line (0..1); the line itself is drawn about twice as strong. */
  alpha: number;
  /** Width of the line in pixels. */
  width: number;
}

const WHITE = 0xffffff;

function mix(a: number, b: number, k: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - k) + ((b >> shift) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** `#rrggbb` as a number (anything else is white). */
function hexOf(c: string | undefined): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(c ?? "");
  return m ? parseInt(m[1]!, 16) : WHITE;
}

/** The cultivation level `realm * 10 + stage` as its two parts (a stage runs 1 to 9). */
export function qiParts(lv: number): { realm: number; stage: number } {
  return { realm: Math.max(0, Math.floor(lv / 10)), stage: Math.min(9, Math.max(1, lv % 10 || 1)) };
}

/** What the qi of a cultivator at `lv` looks like, from the realm colours of the theme (the last colour serves any higher realm). */
export function qiStyleOf(lv: number, realmColors: readonly string[]): QiStyle {
  const { realm, stage } = qiParts(lv);
  const s = (stage - 1) / 8;
  const base = hexOf(realmColors[Math.min(realm, Math.max(0, realmColors.length - 1))]);
  return {
    color: mix(WHITE, base, 0.35 + 0.65 * s), // pale at the first stage, the realm's own colour at the last
    alpha: 0.1 + 0.4 * Math.min(1, (realm * 9 + stage - 1) / 35), // one climb over all the levels, so a new realm never starts paler than the last stage before it
    width: 2 + 0.7 * Math.min(realm, 4) + s,
  };
}

const TWO_PI = Math.PI * 2;
const SEGMENTS = 30;
/** The arc runs from the lower left (120 degrees, y down) over the head to the lower right (420 degrees = 60): the 60 degrees at the feet stay open. */
const FROM = (120 * Math.PI) / 180;
const SPAN = (300 * Math.PI) / 180;

/**
 * Draws the qi round a figure whose feet are at (x, y) and whose head is `height` px above them. `t` is the time in seconds (the smoke waves and a few
 * brighter wisps travel along it); the band fades out at both ends and is never drawn under the feet.
 */
export function drawQiAura(g: Phaser.GameObjects.Graphics, x: number, y: number, height: number, t: number, style: QiStyle): void {
  const cy = y - height * 0.5;
  const ry = height * 0.5 + 8;
  const rx = 21;
  const pts: Array<{ x: number; y: number; k: number }> = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = FROM + (i / SEGMENTS) * SPAN;
    const wob = Math.sin(a * 3 + t * 1.6) * 2.6 + Math.sin(a * 5 - t * 2.3) * 1.4;
    const drift = Math.sin(a * 2 + t * 0.9) * 2;
    pts.push({ x: x + Math.cos(a) * (rx + wob), y: cy + Math.sin(a) * (ry + wob) + drift, k: Math.pow(Math.sin((Math.PI * i) / SEGMENTS), 0.6) });
  }
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    const k = (p.k + q.k) / 2;
    g.lineStyle(style.width * 3.2, style.color, style.alpha * 0.5 * k).lineBetween(p.x, p.y, q.x, q.y);
    g.lineStyle(style.width, style.color, Math.min(0.85, style.alpha * 2.2) * k).lineBetween(p.x, p.y, q.x, q.y);
  }
  // a few brighter wisps slide along the outline
  for (let w = 0; w < 3; w++) {
    const f = (t * 0.16 + w / 3) % 1;
    const i = Math.floor(f * SEGMENTS);
    const p = pts[i];
    const q = pts[Math.min(SEGMENTS, i + 2)];
    if (p && q) g.lineStyle(style.width * 1.2, WHITE, Math.min(0.9, style.alpha * 2.6) * p.k).lineBetween(p.x, p.y, q.x, q.y);
  }
}

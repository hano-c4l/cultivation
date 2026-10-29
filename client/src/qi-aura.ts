/**
 * The qi round a cultivator: a light smoke that rises off the body, thickest at the sides and over the head and never from the feet, so it reads as
 * a haze round the figure and not as a ring. Its colour is that of the realm (the theme's `realmColors`) and it grows richer with the realm and, inside a
 * realm, with the stage: a few pale wisps at the first stage, a denser, fuller coloured haze at the last. This file is only the numbers; the scene
 * releases the puffs (`Effects.puff("qi", ...)`) at the rate given here.
 */

export interface QiStyle {
  /** 0xRRGGBB. */
  color: number;
  /** Wisps released per second. */
  rate: number;
  /** Wisps released together at each release (a higher realm puffs bigger clouds). */
  burst: number;
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

/** What the qi of a cultivator at `lv` is like, from the realm colours of the theme (the last colour serves any higher realm). */
export function qiStyleOf(lv: number, realmColors: readonly string[]): QiStyle {
  const { realm, stage } = qiParts(lv);
  const s = (stage - 1) / 8;
  const base = hexOf(realmColors[Math.min(realm, Math.max(0, realmColors.length - 1))]);
  const climb = Math.min(1, (realm * 9 + stage - 1) / 35); // one climb over all the levels, so a new realm never starts thinner than the last stage before it
  return {
    color: mix(WHITE, base, 0.35 + 0.65 * s), // pale at the first stage, the realm's own colour at the last
    rate: 3 + 9 * climb,
    burst: realm >= 2 ? 2 : 1,
  };
}

/**
 * Where one wisp starts: a random point in the haze round a figure whose feet are at (x, y) and whose head is `height` px above them. The angle runs from
 * a little under the waist on one side, over the head, to the same on the other side (never the feet); the distance from the body varies so the haze is ragged.
 */
export function qiSpawnPoint(x: number, y: number, height: number, random: () => number = Math.random): { x: number; y: number } {
  const theta = ((-25 + random() * 230) * Math.PI) / 180; // from -25 degrees (right, a little low) over the top to 205 degrees (left, a little low)
  const f = 0.85 + random() * 0.4;
  const rx = 15 * f;
  const ry = (height * 0.5 + 4) * f;
  return { x: x + Math.cos(theta) * rx, y: y - height * 0.5 - Math.sin(theta) * ry };
}

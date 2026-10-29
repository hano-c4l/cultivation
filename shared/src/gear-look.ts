import { ALL_ROOTS } from "./character";
import { equipmentInfo, STAGES_PER_REALM_FOR_LOOK } from "./equipment-data";
import { tuning } from "./tuning";

/**
 * How the worn gear changes the way a figure is drawn (docs/PHASE2.md 2o): the sprites of the body and the weapon are the same ones, but each piece colours them
 * and adds its own touch, so a sword is not every sword and two robes of different sets are not alike. The server only sends small numbers (what the piece is);
 * the colours and the shapes are the client's, from the tuning `gearLooks` (an admin can repaint them).
 *   w   the weapon: `1 + realm * 10 + element` (element 0 none, 1.. in the order of ALL_ROOTS): tints the weapon sprite
 *   r   the robe: `1 + realm * 9 + (bậc - 1)`: tints the body sprite, one colour for each set
 *   h   the hat: the same number: its colour, and (modulo the number of shapes) the shape drawn on the head
 *   b   the boots: the same number: the colour of the dust they raise
 */
export interface GearLook {
  w?: number;
  r?: number;
  h?: number;
  b?: number;
}

/** The shapes of hat the client draws; the number is how many, so a look number picks one. */
export const HAT_SHAPES = 6;

const setNo = (realm: number, tier: number): number => 1 + realm * STAGES_PER_REALM_FOR_LOOK + Math.max(0, tier - 1);

/** The look of the worn weapon, robe, hat and boots (a broken piece does not count); undefined when none of them is worn. */
export function gearLookOf(equipped: readonly { slot: string; type: string; dur?: number }[]): GearLook | undefined {
  const out: GearLook = {};
  for (const e of equipped) {
    if (e.dur !== undefined && e.dur <= 0) continue;
    const info = equipmentInfo(e.type);
    if (!info) continue;
    if (e.slot === "weapon" && info.kind === "weapon") out.w = 1 + info.realm * 10 + (info.element ? ALL_ROOTS.indexOf(info.element as never) + 1 : 0);
    else if (e.slot === "robe" && info.kind === "robe") out.r = setNo(info.realm, info.tier);
    else if (e.slot === "hat" && info.kind === "hat") out.h = setNo(info.realm, info.tier);
    else if (e.slot === "boots" && info.kind === "boots") out.b = setNo(info.realm, info.tier);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** What a weapon look number says: the realm and the element key (null: none). */
export function weaponLookParts(w: number): { realm: number; element: string | null } {
  const n = Math.max(0, Math.trunc(w) - 1);
  const e = n % 10;
  return { realm: Math.floor(n / 10), element: e > 0 ? (ALL_ROOTS[e - 1] ?? null) : null };
}

const pick = (list: readonly string[], n: number): string | undefined => (list.length > 0 ? list[(Math.max(1, Math.trunc(n)) - 1) % list.length] : undefined);

/** The colours (`#rrggbb`) a look number gives, from the tuning; undefined where the tuning names none. */
export function weaponTintOf(w: number): string | undefined {
  const { realm, element } = weaponLookParts(w);
  const t = tuning().gearLooks;
  const base = element ? t.weapon[element] : t.weapon.none;
  if (!base) return undefined;
  // A higher realm is brighter: every realm lifts the colour towards white a little.
  const k = Math.min(0.5, realm * 0.08);
  const n = parseInt(base.slice(1), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * k);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
export const robeTintOf = (r: number): string | undefined => pick(tuning().gearLooks.robe, r);
export const hatTintOf = (h: number): string | undefined => pick(tuning().gearLooks.hat, h);
export const bootsTintOf = (b: number): string | undefined => pick(tuning().gearLooks.boots, b);
/** The shape (0..HAT_SHAPES-1) of the hat a look number gives. */
export const hatShapeOf = (h: number): number => (Math.max(1, Math.trunc(h)) - 1) % HAT_SHAPES;

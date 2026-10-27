import type { SkillDef } from "@game/shared";

/** The kinds of skill effect: one drawing for each, shared by every skill of the kind (a skill can be given its own later by listing it in SKILL_FX). */
export type SkillFx = "melee" | "ranged" | "cone" | "blink" | "buff" | "heal";

/**
 * Which effect a skill uses. A listed id (or the template it comes from: `tram_2` is the template `tram`) wins; otherwise the kind of the skill decides:
 * a teleport blinks, a buff and a heal have their own, and an attack is a bolt thrown at the target unless its template is listed as close combat.
 * The cone has no player skill yet (only the boss's cone, which the server announces by itself); a skill gets it by being listed here.
 */
const SKILL_FX: Readonly<Record<string, SkillFx>> = {
  chuong: "melee", // Linh Chưởng: a palm strike
  tram: "melee", // Cương Trảm: a slash
  ngu_kiem_tram: "melee",
  chi: "ranged", // Phi Chỉ: a finger of force thrown from afar
};

/** The id of the template a skill id comes from: `tram_2` -> `tram`, `hoa_4` -> `hoa`. */
const templateOf = (id: string): string => id.replace(/_\d+$/, "");

export function skillFxOf(def: SkillDef | undefined): SkillFx {
  if (!def) return "ranged";
  if (def.fx) return def.fx; // an admin picked the effect
  const listed = SKILL_FX[def.id] ?? SKILL_FX[templateOf(def.id)];
  if (listed) return listed;
  switch (def.kind) {
    case "teleport":
      return "blink";
    case "buff":
      return "buff";
    case "heal":
      return "heal";
    default:
      return "ranged";
  }
}

export const ELEMENT_COLOR: Readonly<Record<string, number>> = {
  kim: 0xf2d16b,
  moc: 0x6fcf6f,
  thuy: 0x5aa9ff,
  hoa: 0xff7a45,
  tho: 0xc49a5a,
  loi: 0xc58bff,
  bang: 0x9ee7ff,
  phong: 0xb8f5c0,
};
export const BUFF_COLOR: Readonly<Record<string, number>> = { attack: 0xff6b6b, defense: 0x6bb6ff, dodge: 0x8ff0a4 };
export const NEUTRAL = 0xe8e4d8;


/**
 * The effect of a plain attack (no skill): a swing when the two stand close (as the ground is seen on screen: a tile is about 45 px), a thrown
 * bolt when they are further apart. `screenDist` is the distance between them in pixels on screen.
 */
export const BASIC_MELEE_MAX_PX = 130;
export function basicFxOf(screenDist: number): "melee" | "ranged" {
  return screenDist <= BASIC_MELEE_MAX_PX ? "melee" : "ranged";
}

/** Plain attacks of players are pale gold, those of monsters red. */
export const BASIC_COLOR = { player: 0xf4ecd0, monster: 0xff8a7a } as const;

/** How an element's attack looks: each has its own shape (the colour comes from `ELEMENT_COLOR`); anything else is the plain glowing orb. */
export type ElementStyle = "kim" | "moc" | "thuy" | "hoa" | "tho" | "loi" | "bang" | "phong" | "plain";
const ELEMENT_STYLES: readonly ElementStyle[] = ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"];
export function elementStyleOf(element: string | undefined): ElementStyle {
  return ELEMENT_STYLES.find((e) => e === element) ?? "plain";
}

/** A plain ranged attack of someone holding a bow is an arrow; every other attack from afar is a bolt. */
export function basicProjectileOf(weapon: string | undefined, byMonster: boolean): "arrow" | "bolt" {
  return !byMonster && weapon === "cung" ? "arrow" : "bolt";
}

/**
 * Whether a `look` update is a weapon being put on (and so gets its flash): the weapon family is now set and was not the same a moment ago.
 * Taking it off, a broken weapon, and updates that only change the outfit show nothing.
 */
export function weaponEquipped(before: string | undefined, now: string | undefined): boolean {
  return now !== undefined && now !== before;
}

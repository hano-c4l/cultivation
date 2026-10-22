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


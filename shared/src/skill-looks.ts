import { tuning, DEFAULT_TUNING } from "./tuning";
import type { SkillDef } from "./skills";

/** The drawings a skill can be given (the client has one for each; see `client/src/fx.ts`). */
export const SKILL_LOOKS = ["spell", "palm", "slash", "finger", "sword", "orb", "great", "aura", "dome", "flames", "wind", "seal", "furnace", "bell", "lotus", "phoenix", "blink"] as const;
export type SkillLook = (typeof SKILL_LOOKS)[number];

const templateOf = (id: string): string => id.replace(/_\d+$/, "");

/**
 * How a skill is drawn: the tuning `skillLooks` by its id, then its template, then its gear family (`pb_kim_2` is `pb`); a skill with none is drawn by
 * its kind (an attack is the spell of its element, a buff an aura, a heal a lotus, a teleport a blink).
 */
export function skillLookOf(def: Pick<SkillDef, "id" | "kind">): SkillLook {
  const t = tuning().skillLooks;
  const d = DEFAULT_TUNING.skillLooks;
  const family = def.id.replace(/^(pb|bm)_.*/, "$1");
  const named = t?.[def.id] ?? d[def.id] ?? t?.[templateOf(def.id)] ?? d[templateOf(def.id)] ?? t?.[family] ?? d[family];
  if (named && (SKILL_LOOKS as readonly string[]).includes(named)) return named as SkillLook;
  return def.kind === "buff" ? "aura" : def.kind === "heal" ? "lotus" : def.kind === "teleport" ? "blink" : "spell";
}

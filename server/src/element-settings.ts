import { setElementTuning } from "@game/shared";
import { getSetting } from "./settings";

/** Copies the mutant-element game settings into the shared element tuning (settings are cached, so this is cheap to call often). */
export async function applyElementSettings(db: D1Database): Promise<void> {
  const [chance, skill, gear, drop] = await Promise.all([
    getSetting(db, "mutant_root_chance"),
    getSetting(db, "mutant_skill_bonus"),
    getSetting(db, "mutant_gear_bonus"),
    getSetting(db, "mutant_gear_drop"),
  ]);
  setElementTuning({ mutantRootChancePermille: chance, mutantSkillBonusPct: skill, mutantGearBonusPct: gear, mutantGearDropPermille: drop });
}

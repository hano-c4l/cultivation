import { constitutionEffects, gearAffinity, type CharacterSheet, type WearerCtx } from "@game/shared";
import { getCatalog } from "./constitution-store";

/** Who wears the gear, as the server counts them: gender, level, base stats, and what they resonate with (root and constitution). */
export function wearerOfSheet(sheet: CharacterSheet): WearerCtx {
  return {
    gender: sheet.gender,
    realm: sheet.realm,
    stage: sheet.stage,
    base: sheet.base,
    affinity: gearAffinity(sheet.roots, constitutionEffects(getCatalog(), sheet.constitution, sheet.constitutionTier)),
  };
}

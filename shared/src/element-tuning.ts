import type { SpiritualRoot } from "./character";

/**
 * Everything about the element table that is meant to be tuned later from an admin screen, in one object: who overcomes whom,
 * the damage factors, and the extra strength of the mutant elements (Lôi, Băng, Phong). The server loads the three
 * `mutant_*` game settings into it (see server/src/element-settings.ts); the client uses the defaults until the welcome
 * message carries them.
 */
export interface ElementTuning {
  /** `overcomes[a]` lists the elements that `a` overcomes (khắc). */
  overcomes: Record<SpiritualRoot, readonly SpiritualRoot[]>;
  /** Damage factor when the attacker overcomes more elements than the target does, and when it is the other way round. */
  overcomeMult: number;
  overcomeByMult: number;
  /** Chance (per thousand) that a new single-element (đơn linh căn) character has a mutant element instead of a plain one. */
  mutantRootChancePermille: number;
  /** Extra percent damage of skills of a mutant element. */
  mutantSkillBonusPct: number;
  /** Extra percent strength of gear whose element matches the wearer's mutant element (ordinary matching gear gets AFFINITY_BONUS). */
  mutantGearBonusPct: number;
  /** Chance (per thousand) that a dropped piece of gear has a mutant element. */
  mutantGearDropPermille: number;
}

export const DEFAULT_ELEMENT_TUNING: ElementTuning = {
  overcomes: {
    kim: ["moc", "phong"],
    moc: ["tho"],
    tho: ["thuy", "loi"],
    thuy: ["hoa"],
    hoa: ["kim", "bang", "phong"],
    loi: ["thuy", "moc"],
    bang: ["thuy", "moc"],
    phong: ["tho"],
  },
  overcomeMult: 1.2,
  overcomeByMult: 0.8,
  mutantRootChancePermille: 100,
  mutantSkillBonusPct: 10,
  mutantGearBonusPct: 25,
  mutantGearDropPermille: 30,
};

let current: ElementTuning = DEFAULT_ELEMENT_TUNING;

export function elementTuning(): ElementTuning {
  return current;
}

/** Replaces the live tuning (keeps the defaults for anything left out). */
export function setElementTuning(next: Partial<ElementTuning>): void {
  current = { ...DEFAULT_ELEMENT_TUNING, ...next };
}

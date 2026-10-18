import { equipmentInfo, slotKind, isEquipSlot } from "./equipment-data";
import { SKILLS } from "./skills";

/** The slice of a worn piece this needs: where it is worn, what it is and its durability (absent: never wears out). */
export interface WornPiece {
  slot: string;
  type: string;
  dur?: number;
}

/** A skill a worn piece grants, with the realm and grade (root-grade scale 0..) of the piece that grants it. */
export interface GearSkillInfo {
  id: string;
  realm: number;
  /** Bậc 1..9 of the piece within its realm. */
  tier: number;
  grade: number;
}

const KNOWN = new Set(SKILLS.filter((s) => s.gear).map((s) => s.id));

/**
 * Skills granted by what the character wears right now, each with the realm and grade of the piece behind it. A broken piece
 * (0 durability) grants nothing. When two pieces grant the same skill the better one (higher realm, then grade) counts.
 * Order follows SKILLS.
 */
export function gearSkillInfo(worn: readonly WornPiece[]): GearSkillInfo[] {
  const best = new Map<string, GearSkillInfo>();
  const give = (id: string, realm: number, tier: number, grade: number) => {
    if (!KNOWN.has(id)) return;
    const have = best.get(id);
    const better = !have || realm > have.realm || (realm === have.realm && (tier > have.tier || (tier === have.tier && grade > have.grade)));
    if (better) best.set(id, { id, realm, tier, grade });
  };
  for (const w of worn) {
    if (!isEquipSlot(w.slot) || (w.dur !== undefined && w.dur <= 0)) continue;
    const kind = slotKind(w.slot);
    const info = equipmentInfo(w.type);
    if (!info) continue;
    const grade = Math.max(0, info.grade - 1);
    if (kind === "flight") {
      give("pt_thuan_di", info.realm, info.tier, grade);
      give("pt_phong_than", info.realm, info.tier, grade);
    } else if (kind === "bonded") {
      give("bm_ho_the", info.realm, info.tier, grade);
      give("bm_hoi_sinh", info.realm, info.tier, grade);
      if (info.element) give(`bm_${info.element}`, info.realm, info.tier, grade);
    } else if (kind === "charm" && info.element) {
      // Each of the four slots has its own skill, so two pieces of one element give two skills.
      give(`pb_${info.element}_${w.slot.slice(5)}`, info.realm, info.tier, grade);
    }
  }
  return SKILLS.filter((s) => best.has(s.id)).map((s) => best.get(s.id)!);
}

/** Just the ids of gearSkillInfo. */
export function gearSkillIds(worn: readonly WornPiece[]): string[] {
  return gearSkillInfo(worn).map((g) => g.id);
}

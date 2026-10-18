import { equipmentInfo, slotKind, isEquipSlot } from "./equipment-data";
import { SKILLS, type GearSkillSource } from "./skills";

/** The slice of a worn piece this needs: where it is worn, what it is and its durability (absent: never wears out). */
export interface WornPiece {
  slot: string;
  type: string;
  dur?: number;
}

const KNOWN = new Set(SKILLS.filter((s) => s.gear).map((s) => s.id));

/** Skills granted by what the character wears right now. A broken piece (0 durability) grants nothing. Order follows SKILLS. */
export function gearSkillIds(worn: readonly WornPiece[]): string[] {
  const ids = new Set<string>();
  for (const w of worn) {
    if (!isEquipSlot(w.slot) || (w.dur !== undefined && w.dur <= 0)) continue;
    const kind = slotKind(w.slot);
    const info = equipmentInfo(w.type);
    if (!info) continue;
    const source: GearSkillSource | null = kind === "charm" ? "charm" : kind === "bonded" ? "bonded" : kind === "flight" ? "flight" : null;
    if (!source) continue;
    if (source === "flight") {
      ids.add("pt_thuan_di");
      ids.add("pt_phong_than");
    } else if (source === "bonded") {
      ids.add("bm_ho_the");
      ids.add("bm_hoi_sinh");
      if (info.element) ids.add(`bm_${info.element}`);
    } else if (info.element) {
      ids.add(`pb_${info.element}`);
    }
  }
  return SKILLS.filter((s) => ids.has(s.id) && KNOWN.has(s.id)).map((s) => s.id);
}

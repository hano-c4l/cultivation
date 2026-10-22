import { gearSetName } from "./gear-names";
import { equipmentInfo, refineLevelOf, slotKind, isEquipSlot } from "./equipment-data";
import { levelIndex } from "./progression";
import { STAGES_PER_REALM } from "./progression-data";
import { SKILLS } from "./skills";

/** The slice of a worn piece this needs: where it is worn, what it is, its durability (absent: never wears out) and, for the bonded artifact, its trained level. */
export interface WornPiece {
  slot: string;
  type: string;
  dur?: number;
  lv?: number;
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
      // The bonded artifact grows with its owner: its skills follow the trained level, not the level it was made at.
      const lv = Math.max(refineLevelOf(info, w.lv), levelIndex(info.realm, info.tier));
      const realm = Math.floor(lv / STAGES_PER_REALM);
      const tier = (lv % STAGES_PER_REALM) + 1;
      give("bm_ho_the", realm, tier, grade);
      give("bm_hoi_sinh", realm, tier, grade);
      if (info.element) give(`bm_${info.element}`, realm, tier, grade);
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

/**
 * The skills of worn pháp bảo are named after the set of the piece that grants them (Lăng Y Kim Quang, Bạch Thi Thuấn Di...), so
 * the name follows the gear. Everything else keeps the name it has. The client keeps the sets of what is worn up to date.
 */
const GEAR_SKILL_SUFFIX: Readonly<Record<string, string>> = {
  bm_ho_the: "Hộ Thể",
  bm_hoi_sinh: "Hồi Sinh",
  pt_thuan_di: "Thuấn Di",
  pt_phong_than: "Phong Thân Quyết",
};
const ELEMENT_VI: Readonly<Record<string, string>> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ", loi: "Lôi", bang: "Băng", phong: "Phong" };

let wornSets = new Map<string, string>();

/** Remembers which set each worn pháp bảo skill comes from (call it whenever the worn gear changes). */
export function setWornSkillSets(worn: readonly WornPiece[]): void {
  wornSets = new Map(gearSkillInfo(worn).map((g) => [g.id, gearSetName(g.realm, g.tier)]));
}

/** The name to show for a skill: pháp bảo skills carry the set name of the piece that gives them. */
export function skillDisplayName(def: { id: string; nameVi: string; source: string }): string {
  if (def.source !== "gear") return def.nameVi;
  const set = wornSets.get(def.id);
  if (!set) return def.nameVi;
  const fixed = GEAR_SKILL_SUFFIX[def.id];
  if (fixed) return `${set} ${fixed}`;
  const m = /^(pb|bm)_([a-z]+)/.exec(def.id);
  const el = m ? ELEMENT_VI[m[2]!] : undefined;
  if (!m || !el) return def.nameVi;
  return `${set} ${el} ${m[1] === "pb" ? "Quang" : "Kích"}`;
}

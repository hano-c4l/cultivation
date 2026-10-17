import { EQUIP_STAT_KEYS, REALMS, STAGES_PER_REALM, STAT_DEFS, equipTierTag, equipmentInfo, getItemDef, scaledStats, type EquipStatKey } from "@game/shared";
import { vi } from "./locales/vi";

/** "+12 Công kích" style text for one stat; rates are percentage points. */
export function statText(key: EquipStatKey, value: number): string {
  const rate = key === "critRate" || key === "dodgeRate";
  return `+${value}${rate ? "%" : ""} ${vi.equip.statNames[key]}`;
}

/** Small round icon for a piece's element (white rim, fill by ngũ hành), or null when it has none. */
export function elementDot(type: string): HTMLElement | null {
  const element = equipmentInfo(type)?.element;
  if (!element) return null;
  const dot = document.createElement("span");
  dot.className = `elem-dot elem-${element}`;
  dot.title = vi.equip.element(vi.roots[element] ?? vi.equip.variantElements[element] ?? element);
  return dot;
}

/** Durability for a one-line row: "63/100", or the infinity sign for gear that never wears out. */
export function durabilityShort(dur?: number, max?: number): string {
  return dur === undefined || max === undefined ? "∞" : `${dur}/${max}`;
}

/** The kind of an item for the details: "Vũ khí · Kiếm", "Nhẫn", "Đan dược", "Nguyên liệu"... */
export function itemTypeText(type: string): string {
  const info = equipmentInfo(type);
  if (info) {
    const weapon = info.weaponType ? vi.equip.weaponTypes[info.weaponType] : undefined;
    return `${vi.equip.kinds[info.kind] ?? info.kind}${weapon ? ` · ${weapon}` : ""}`;
  }
  const category = getItemDef(type)?.category;
  return (category && vi.inventory.categories[category]) || "";
}

/** Realm and bậc of a piece of gear ("Luyện Khí 1"), or null for items without one. */
export function itemTierText(type: string): string | null {
  const info = equipmentInfo(type);
  return info ? `${REALMS[info.realm]?.nameVi ?? ""} ${info.tier}` : null;
}

/** The small tag for a cell or row ("LK1"), or null for items without a realm. */
export function itemTierTag(type: string): string | null {
  const info = equipmentInfo(type);
  return info ? equipTierTag(info) : null;
}

/** Durability as "63/100 (63%)", or the never-wears-out note. */
export function durabilityText(dur?: number, max?: number): string {
  if (dur === undefined || max === undefined) return vi.equip.unbreakable;
  return dur <= 0 ? vi.equip.broken : vi.equip.durability(dur, max);
}

/** The description lines of a piece of gear: stats at its current durability, requirements, style and durability. */
export function equipLines(type: string, dur?: number, max?: number): string[] {
  const info = equipmentInfo(type);
  if (!info) return [];
  const lines: string[] = [];
  const full = info.stats;
  const now = scaledStats(info, dur, max);
  for (const key of EQUIP_STAT_KEYS) {
    if (full[key] <= 0) continue;
    lines.push(now[key] === full[key] ? statText(key, now[key]) : `${statText(key, now[key])} (${vi.equip.of(full[key])})`);
  }
  lines.push(durabilityText(dur, max));
  const req: string[] = [];
  if (info.req.level !== null) {
    const lv = info.req.level;
    req.push(vi.equip.reqLevel(REALMS[Math.floor(lv / STAGES_PER_REALM)]?.nameVi ?? "", (lv % STAGES_PER_REALM) + 1));
  }
  if (info.req.stat) req.push(`${STAT_DEFS.find((d) => d.key === info.req.stat!.key)?.nameVi ?? info.req.stat.key} ≥ ${info.req.stat.value}`);
  lines.push(req.length > 0 ? `${vi.equip.requires}: ${req.join(", ")}` : vi.equip.noRequirement);
  lines.push(vi.equip.styles[info.style] ?? "");
  if (info.element) lines.push(vi.equip.element(vi.roots[info.element] ?? vi.equip.variantElements[info.element] ?? info.element));
  return lines;
}

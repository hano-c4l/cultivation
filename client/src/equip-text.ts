import { EQUIP_STAT_KEYS, REALMS, STAGES_PER_REALM, STAT_DEFS, equipmentInfo, scaledStats, type EquipStatKey } from "@game/shared";
import { vi } from "./locales/vi";

/** "+12 Công kích" style text for one stat; rates are percentage points. */
export function statText(key: EquipStatKey, value: number): string {
  const rate = key === "critRate" || key === "dodgeRate";
  return `+${value}${rate ? "%" : ""} ${vi.equip.statNames[key]}`;
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
  return lines;
}

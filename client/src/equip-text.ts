import { resonanceBonus, EQUIP_RATE_KEYS, EQUIP_STAT_KEYS, REALMS, resonates, type WearerCtx, refineExpNeeded, refineLevelOf, STAGES_PER_REALM, STAT_DEFS, equipTierTag, equipmentInfo, getItemDef, scaledStats, type EquipStatKey } from "@game/shared";
import { vi } from "./locales/vi";

/** "+12 Công kích" style text for one stat; rates are percentage points. */
export function statText(key: EquipStatKey, value: number): string {
  return `+${value}${EQUIP_RATE_KEYS.includes(key) ? "%" : ""} ${vi.equip.statNames[key]}`;
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
export function itemTierText(type: string, lv?: number): string | null {
  const info = equipmentInfo(type);
  if (!info) return null;
  // A trained pháp bảo bản mệnh shows the level it has reached, not the one it was made at.
  if (info.kind === "bonded") {
    const level = refineLevelOf(info, lv);
    return `${REALMS[Math.floor(level / STAGES_PER_REALM)]?.nameVi ?? ""} ${(level % STAGES_PER_REALM) + 1}`;
  }
  return `${REALMS[info.realm]?.nameVi ?? ""} ${info.tier}`;
}

/** The small tag for a cell or row ("LK1"), or null for items without a realm. */
export function itemTierTag(type: string, lv?: number): string | null {
  const info = equipmentInfo(type);
  if (!info) return null;
  if (info.kind === "bonded") {
    const level = refineLevelOf(info, lv);
    return equipTierTag({ realm: Math.floor(level / STAGES_PER_REALM), tier: (level % STAGES_PER_REALM) + 1 });
  }
  return equipTierTag(info);
}

/** The realm index behind itemTierTag (to colour the tag by realm), or null for items without one. */
export function itemTierRealm(type: string, lv?: number): number | null {
  const info = equipmentInfo(type);
  if (!info) return null;
  return info.kind === "bonded" ? Math.floor(refineLevelOf(info, lv) / STAGES_PER_REALM) : info.realm;
}

/** CSS class that colours a realm tag ("LK", "TC1"...) by its realm. */
export function realmClass(realm: number | null | undefined): string {
  return realm === null || realm === undefined ? "" : `realm-${Math.min(Math.max(Math.trunc(realm), 0), 3)}`;
}

/** Durability as "63/100 (63%)", or the never-wears-out note. */
export function durabilityText(dur?: number, max?: number): string {
  if (dur === undefined || max === undefined) return vi.equip.unbreakable;
  return dur <= 0 ? vi.equip.broken : vi.equip.durability(dur, max);
}

/** "+5 Công kích, +5 Sinh lực" at the current durability; a stat that wore down shows its maximum too. */
function statsText(type: string, dur?: number, max?: number, lv?: number, mult = 1): string {
  const info = equipmentInfo(type);
  if (!info) return "";
  const full = scaledStats(info, undefined, undefined, lv, mult);
  const now = scaledStats(info, dur, max, lv, mult);
  const parts: string[] = [];
  for (const key of EQUIP_STAT_KEYS) {
    if (full[key] <= 0) continue;
    parts.push(now[key] === full[key] ? statText(key, now[key]) : `${statText(key, now[key])} (${vi.equip.of(full[key])})`);
  }
  return parts.join(", ");
}

/** "Luyện Khí tầng 1, Căn cốt ≥ 8", or null when the piece asks nothing. */
function requirementText(type: string): string | null {
  const info = equipmentInfo(type);
  if (!info) return null;
  const req: string[] = [];
  if (info.req.level !== null) {
    const lv = info.req.level;
    req.push(vi.equip.reqLevel(REALMS[Math.floor(lv / STAGES_PER_REALM)]?.nameVi ?? "", (lv % STAGES_PER_REALM) + 1));
  }
  if (info.req.stat) req.push(`${STAT_DEFS.find((d) => d.key === info.req.stat!.key)?.nameVi ?? info.req.stat.key} ≥ ${info.req.stat.value}`);
  return req.length > 0 ? req.join(", ") : null;
}

/** Short one-paragraph description of a piece of gear for the equipment chooser: stats, durability, requirement (no style, the list is already filtered). */
export function equipLines(type: string, dur?: number, max?: number, lv?: number): string[] {
  if (!equipmentInfo(type)) return [];
  const req = requirementText(type);
  return [statsText(type, dur, max, lv), durabilityText(dur, max), ...(req ? [`${vi.equip.requires}: ${req}`] : [])];
}

/** The element name for display ("Thủy"), or null. */
function elementName(type: string): string | null {
  const element = equipmentInfo(type)?.element;
  return element ? (vi.roots[element] ?? vi.equip.variantElements[element] ?? element) : null;
}

/**
 * The details of an item, one layout everywhere (bag, equipment window, comparison):
 *   (element icon) Name (Nam/Nữ when the piece is made for one sex)
 *   Type · Family · Realm bậc · Hệ X
 *   Độ hiếm: R · Phẩm cấp
 *   Chỉ số: ...            (gear)      or the description (other items)
 *   Độ bền: ...            (gear)
 *   Yêu cầu: ...           (gear, only when it asks something)
 */
export function describeItem(type: string, opts: { dur?: number; max?: number; qty?: number; lv?: number; xp?: number; wearer?: WearerCtx } = {}): HTMLElement {
  const box = document.createElement("div");
  box.className = "item-desc";
  const def = getItemDef(type);
  const info = equipmentInfo(type);
  const line = (text: string) => {
    const d = document.createElement("div");
    d.className = "id-line";
    d.textContent = text;
    box.append(d);
  };

  const name = document.createElement("b");
  const dot = elementDot(type);
  if (dot) name.append(dot);
  const sex = info && info.style !== "u" ? ` (${vi.equip.sexNames[info.style]})` : "";
  name.append(`${def?.nameVi ?? type}${sex}${opts.qty && opts.qty > 1 ? ` × ${opts.qty}` : ""}`);
  box.append(name);

  const element = elementName(type);
  line([itemTypeText(type), itemTierText(type, opts.lv), element ? vi.equip.elementShort(element) : null].filter(Boolean).join(" · "));
  if (def) line(`${vi.inventory.rarityLabel}: ${vi.inventory.rarities[def.rarity]} · ${vi.inventory.grades[def.grade] ?? def.grade}`);
  if (info) {
    // Gear that suits the wearer (its element is their root's or their constitution's, or its weapon family is) gives more.
    const suits = resonates(info, opts.wearer?.affinity);
    line(`${vi.equip.statsLabel}: ${statsText(type, opts.dur, opts.max, opts.lv, suits ? 1 + resonanceBonus(info, opts.wearer?.affinity) : 1)}`);
    if (suits) line(vi.equip.resonates(Math.round(resonanceBonus(info, opts.wearer?.affinity) * 100)));
    // The pháp bảo bản mệnh trains on its own EXP, up to the level of its owner.
    if (info.kind === "bonded") line(vi.equip.refine(opts.xp ?? 0, refineExpNeeded(refineLevelOf(info, opts.lv))));
    line(durabilityText(opts.dur, opts.max));
    const req = requirementText(type);
    if (req) line(`${vi.equip.requires}: ${req}`);
  } else if (def?.descVi) {
    line(def.descVi);
  }
  return box;
}

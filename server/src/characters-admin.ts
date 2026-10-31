import { ALL_ROOTS, CURRENCIES, parseRoots, type SpiritualRoot, MUTANT_ROOTS, ROOT_GRADES, SPIRITUAL_ROOTS, equipmentInfo, getItemDef, isGender, validateCharacterName, isCurrency, isEquipmentType, planAdd, planRemove, getSkill, applyOps, type BagOp, maxSkillLevel, skillGrade, refineLevelOf, ENHANCE_MAX, REALMS, type BagItem, type EquippedItem } from "@game/shared";
import { closeListingsOf } from "./market";
import { removeCharacter as removeSectMember } from "./sect";
import { logStatement } from "./admin-log";
import { applyCurrencyDelta } from "./economy";
import { commitBagOps, loadBag } from "./inventory";
import { getConstitutionCatalog } from "./constitution-catalog";
import { STAND_IN_ROOT } from "./characters";
import { rollGear } from "./gear-master";
import { getItemOverlays } from "./items-live";

/**
 * The admin side of a character (docs/PHASE3.md 3m-b). A MapRoom is the only writer of an online character, so an edit works like this: "Sửa" puts the
 * character under REVIEW (the account cannot log in for 30 minutes, the admin's sessions-and-kick happen in accounts-admin), and every change below is refused
 * unless that admin's review is still running, checked inside the same batch as the change. "Xong" ends the review. Money goes through the currency
 * statements (so the totals stay right), items through the bag operations.
 */
export const CHARACTER_LOG_SCREEN = "Nhân vật";
export const REVIEW_MS = 30 * 60_000;
/** The most pieces of gear one "add" puts in the bag. */
export const MAX_GEAR_AT_ONCE = 50;

interface Row {
  id: string;
  account_id: string;
  email: string;
  name: string;
  gender: string;
  realm: number;
  stage: number;
  exp: number;
  potential_points: number;
  stat_can_cot: number;
  stat_than_phap: number;
  stat_ngo_tinh: number;
  stat_linh_luc: number;
  stat_than_thuc: number;
  stat_phuc_duyen: number;
  map_id: string;
  sat_khi: number;
  sat_nhan: number;
  anh_hung: number;
  review_until: number | null;
  review_by: string | null;
  constitution: string;
  constitution_tier: number;
  roots: string;
  spiritual_root: string;
  root_grade: number;
}

export const STAT_FIELDS = { canCot: "stat_can_cot", thanPhap: "stat_than_phap", ngoTinh: "stat_ngo_tinh", linhLuc: "stat_linh_luc", thanThuc: "stat_than_thuc", phucDuyen: "stat_phuc_duyen" } as const;

export interface CharacterView {
  id: string;
  accountId: string;
  email: string;
  name: string;
  gender: string;
  realm: number;
  stage: number;
  exp: number;
  potentialPoints: number;
  stats: Record<keyof typeof STAT_FIELDS, number>;
  map: string;
  satKhi: number;
  satNhan: number;
  anhHung: number;
  constitution: string;
  constitutionTier: number;
  /** The elements of the spiritual root, main one first (a mutant root is a single one: loi, bang or phong). */
  roots: string[];
  rootGrade: number;
  review: { by: string; until: number } | null;
  wallet: Record<string, number>;
  items: Array<Pick<BagItem, "id" | "type" | "qty" | "tab" | "cell" | "dur" | "max" | "lv" | "en">>;
  equipped: Array<Pick<EquippedItem, "id" | "type" | "slot" | "dur" | "max" | "lv" | "en">>;
  /** `maxLevel`: the highest mastery level this skill can reach for this character (the grade decides whether thần thông is open). */
  skills: Array<{ id: string; source: string; realm: number; level: number; maxLevel: number }>;
}

export async function getCharacterView(db: D1Database, id: string, now = Date.now()): Promise<CharacterView | null> {
  const r = await db
    .prepare(
      "SELECT c.id, c.account_id, a.email, c.name, c.gender, c.realm, c.stage, c.exp, c.potential_points, c.stat_can_cot, c.stat_than_phap, c.stat_ngo_tinh, c.stat_linh_luc, c.stat_than_thuc, c.stat_phuc_duyen, c.map_id, c.sat_khi, c.sat_nhan, c.anh_hung, c.review_until, c.review_by, c.constitution, c.constitution_tier, c.roots, c.spiritual_root, c.root_grade FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.id = ?",
    )
    .bind(id)
    .first<Row>();
  if (!r) return null;
  const [wallet, bag, skills] = await Promise.all([
    db.prepare("SELECT currency, balance FROM currency_balances WHERE character_id = ?").bind(id).all<{ currency: string; balance: number }>(),
    loadBag(db, id),
    db.prepare("SELECT skill_id, source, realm, level FROM character_skills WHERE character_id = ? ORDER BY learned_at, skill_id").bind(id).all<{ skill_id: string; source: string; realm: number; level: number }>(),
  ]);
  return {
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    name: r.name,
    gender: r.gender,
    realm: r.realm,
    stage: r.stage,
    exp: r.exp,
    potentialPoints: r.potential_points,
    stats: { canCot: r.stat_can_cot, thanPhap: r.stat_than_phap, ngoTinh: r.stat_ngo_tinh, linhLuc: r.stat_linh_luc, thanThuc: r.stat_than_thuc, phucDuyen: r.stat_phuc_duyen },
    map: r.map_id,
    satKhi: r.sat_khi,
    satNhan: r.sat_nhan,
    anhHung: r.anh_hung,
    constitution: r.constitution,
    constitutionTier: r.constitution_tier,
    roots: parseRoots(r.roots, r.spiritual_root as SpiritualRoot),
    rootGrade: r.root_grade,
    review: r.review_until !== null && r.review_until > now && r.review_by ? { by: r.review_by, until: r.review_until } : null,
    wallet: Object.fromEntries(wallet.results.map((w) => [w.currency, w.balance])),
    items: bag.items.map((i) => ({ id: i.id, type: i.type, qty: i.qty, tab: i.tab, cell: i.cell, ...(i.dur !== undefined ? { dur: i.dur, max: i.max } : {}), ...(i.lv !== undefined ? { lv: i.lv } : {}), ...(i.en ? { en: i.en } : {}) })),
    equipped: bag.equipped.map((e) => ({ id: e.id, type: e.type, slot: e.slot, ...(e.dur !== undefined ? { dur: e.dur, max: e.max } : {}), ...(e.lv !== undefined ? { lv: e.lv } : {}), ...(e.en ? { en: e.en } : {}) })),
    skills: skills.results.map((s) => ({ id: s.skill_id, source: s.source, realm: s.realm, level: s.level, maxLevel: maxLevelOf(s.skill_id, r.root_grade) })),
  };
}

/** The highest mastery level a skill can reach for a character of this root grade (a skill the code no longer knows: the lowest cap). */
function maxLevelOf(skillId: string, rootGrade: number): number {
  const def = getSkill(skillId);
  return def ? maxSkillLevel(skillGrade(def, rootGrade)) : 0;
}

export type CharacterResult = { ok: true; kicked?: boolean } | { ok: false; error: "invalid" | "not_found" | "not_reviewing" | "reviewed_by_other" | "unchanged" | "full" | "funds" | "busy" | "unknown_item" | "name_taken" | "equipped" | "gender" | "mutant_alone" };

/** Fails the batch unless this admin's review of the character is still running. */
export const reviewGuard = (db: D1Database, id: string, admin: string, now: number) =>
  db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND review_by = ? AND review_until > ?)").bind(id, admin, now);

export async function reviewing(db: D1Database, id: string, admin: string, now: number): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM characters WHERE id = ? AND review_by = ? AND review_until > ?").bind(id, admin, now).first());
}

/** Puts the character under review. `onStart` kicks that character (and no other) out of the game (accounts-admin); it runs after the review is set so nobody can slip back in. */
export async function startReview(db: D1Database, admin: string, id: string, onStart: (accountId: string, characterId: string) => Promise<boolean>, now = Date.now()): Promise<CharacterResult> {
  const c = await db.prepare("SELECT id, account_id, name, review_until, review_by FROM characters WHERE id = ?").bind(id).first<{ id: string; account_id: string; name: string; review_until: number | null; review_by: string | null }>();
  if (!c) return { ok: false, error: "not_found" };
  if (c.review_until !== null && c.review_until > now && c.review_by && c.review_by !== admin) return { ok: false, error: "reviewed_by_other" };
  await db.batch([
    // Only the character is shut out (login and the game both refuse a character under review): the account's sessions stay, so an admin who edits a character of
    // their own account, or whose own session is playing another one, is not logged out.
    db.prepare("UPDATE characters SET review_until = ?, review_by = ? WHERE id = ?").bind(now + REVIEW_MS, admin, id),
    logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Bắt đầu sửa nhân vật «${c.name}»` }, now),
  ]);
  return { ok: true, kicked: await onStart(c.account_id, id) };
}

export async function endReview(db: D1Database, admin: string, id: string, now = Date.now()): Promise<CharacterResult> {
  const c = await db.prepare("SELECT name, review_until FROM characters WHERE id = ?").bind(id).first<{ name: string; review_until: number | null }>();
  if (!c) return { ok: false, error: "not_found" };
  if (c.review_until === null) return { ok: false, error: "unchanged" };
  await db.batch([
    db.prepare("UPDATE characters SET review_until = NULL, review_by = NULL WHERE id = ?").bind(id),
    logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Xong sửa nhân vật «${c.name}»` }, now),
  ]);
  return { ok: true };
}

const intIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export interface StatsInput {
  realm: number;
  stage: number;
  exp: number;
  potentialPoints: number;
  stats: Record<keyof typeof STAT_FIELDS, number>;
}

export async function editStats(db: D1Database, admin: string, id: string, input: StatsInput, realms: number, now = Date.now()): Promise<CharacterResult> {
  const stats = input?.stats as Record<string, unknown> | undefined;
  if (!input || !intIn(input.realm, 0, realms - 1) || !intIn(input.stage, 1, 9) || !intIn(input.exp, 0, 1_000_000_000_000) || !intIn(input.potentialPoints, 0, 1_000_000) || !stats || !(Object.keys(STAT_FIELDS) as Array<keyof typeof STAT_FIELDS>).every((k) => intIn(stats[k], 0, 100_000))) return { ok: false, error: "invalid" };
  const before = await getCharacterView(db, id, now);
  if (!before) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const changed: string[] = [];
  if (before.realm !== input.realm || before.stage !== input.stage) changed.push(`cảnh giới ${before.realm}-${before.stage} → ${input.realm}-${input.stage}`);
  if (before.exp !== input.exp) changed.push(`EXP ${before.exp} → ${input.exp}`);
  if (before.potentialPoints !== input.potentialPoints) changed.push(`điểm tiềm năng ${before.potentialPoints} → ${input.potentialPoints}`);
  for (const k of Object.keys(STAT_FIELDS) as Array<keyof typeof STAT_FIELDS>) if (before.stats[k] !== input.stats[k]) changed.push(`${k} ${before.stats[k]} → ${input.stats[k]}`);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db
        .prepare("UPDATE characters SET realm = ?, stage = ?, exp = ?, potential_points = ?, stat_can_cot = ?, stat_than_phap = ?, stat_ngo_tinh = ?, stat_linh_luc = ?, stat_than_thuc = ?, stat_phuc_duyen = ?, vitals = NULL, updated_at = ? WHERE id = ?")
        .bind(input.realm, input.stage, input.exp, input.potentialPoints, input.stats.canCot, input.stats.thanPhap, input.stats.ngoTinh, input.stats.linhLuc, input.stats.thanThuc, input.stats.phucDuyen, now, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Sửa nhân vật «${before.name}»: ${changed.join(", ")}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

export function mapGuard(err: unknown): CharacterResult {
  if (String(err).includes("inv_guard")) return { ok: false, error: "not_reviewing" };
  console.error("character edit failed", err);
  return { ok: false, error: "busy" };
}

/** Adds or takes away money (a non-zero whole number) through the currency statements, as an Admin-group entry with this admin as the actor. */
export async function adjustMoney(db: D1Database, admin: string, id: string, currency: unknown, delta: unknown, now = Date.now()): Promise<CharacterResult> {
  if (!isCurrency(currency) || !CURRENCIES.includes(currency) || typeof delta !== "number" || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000_000) return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name FROM characters WHERE id = ?").bind(id).first<{ name: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  try {
    const r = await applyCurrencyDelta(db, { characterId: id, currency, delta, reason: "admin_adjust:character", actor: admin }, [
      reviewGuard(db, id, admin, now),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `${delta > 0 ? "Cộng" : "Trừ"} ${Math.abs(delta)} ${currency} cho «${c.name}»` }, now),
    ]);
    if (r.status === "insufficient") return { ok: false, error: "funds" };
    if (r.status !== "applied") return { ok: false, error: "busy" };
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

export async function addItem(db: D1Database, admin: string, id: string, item: unknown, qty: unknown, now = Date.now()): Promise<CharacterResult> {
  if (typeof item !== "string" || !intIn(qty, 1, 9999)) return { ok: false, error: "invalid" };
  await getItemOverlays(db); // items an admin made are not in the code's catalogue
  const def = getItemDef(item);
  if (!def || def.disabled || isEquipmentType(item)) return { ok: false, error: "unknown_item" };
  const c = await db.prepare("SELECT name FROM characters WHERE id = ?").bind(id).first<{ name: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const bag = await loadBag(db, id);
  const ops = planAdd(bag.items, bag.tabs, item, qty, () => crypto.randomUUID());
  if (!ops) return { ok: false, error: "full" };
  const r = await commitBagOps(db, id, ops, { now, extra: [reviewGuard(db, id, admin, now), logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Thêm ${qty} ${def.nameVi} (${item}) cho «${c.name}»` }, now)] });
  return r === "ok" ? { ok: true } : { ok: false, error: "busy" };
}

/**
 * Adds a piece of gear to the bag the way the merchant sells it: full durability and the stats rolled from the master table (`rollGear`), one new instance. A piece
 * made for the other gender is refused (a gendered piece carries its style in the id), a piece that cannot exist (`equipmentInfo`) is refused.
 */
export async function addEquipment(db: D1Database, admin: string, id: string, type: unknown, now = Date.now(), qty: unknown = 1): Promise<CharacterResult> {
  const info = typeof type === "string" ? equipmentInfo(type) : undefined;
  if (typeof type !== "string" || !info) return { ok: false, error: "unknown_item" };
  if (!intIn(qty, 1, MAX_GEAR_AT_ONCE)) return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name, gender FROM characters WHERE id = ?").bind(id).first<{ name: string; gender: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if ((info.style === "m" && c.gender !== "male") || (info.style === "f" && c.gender !== "female")) return { ok: false, error: "gender" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const bag = await loadBag(db, id);
  const max = info.maxDurability;
  // One new instance each, with its own roll; all in one batch, so either all of them are added or (a full bag) none.
  let items = bag.items;
  const ops: BagOp[] = [];
  for (let n = 0; n < qty; n++) {
    const rs = max != null ? await rollGear(db, type) : undefined;
    const one = planAdd(items, bag.tabs, type, 1, () => crypto.randomUUID(), max != null ? { dur: max, max, ...(rs ? { rs } : {}) } : undefined);
    if (!one) return { ok: false, error: "full" };
    items = applyOps(items, one);
    ops.push(...one);
  }
  const r = await commitBagOps(db, id, ops, { now, extra: [reviewGuard(db, id, admin, now), logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Thêm ${qty > 1 ? `${qty} ` : ""}trang bị ${info.nameVi} (${type}) cho «${c.name}»` }, now)] });
  return r === "ok" ? { ok: true } : { ok: false, error: "busy" };
}

/** Takes a whole stack out of the bag (a worn piece has to be taken off first: the player does that, or the admin removes it after). */
export async function removeItem(db: D1Database, admin: string, id: string, instanceId: unknown, now = Date.now()): Promise<CharacterResult> {
  if (typeof instanceId !== "string") return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name FROM characters WHERE id = ?").bind(id).first<{ name: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const bag = await loadBag(db, id);
  const it = bag.items.find((i) => i.id === instanceId);
  if (!it) return { ok: false, error: "not_found" };
  const ops = planRemove(bag.items, bag.tabs, { tab: it.tab, cell: it.cell });
  if (!ops) return { ok: false, error: "invalid" };
  const r = await commitBagOps(db, id, ops, { now, extra: [reviewGuard(db, id, admin, now), logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Lấy ${it.qty} ${getItemDef(it.type)?.nameVi ?? it.type} (${it.type}) của «${c.name}»` }, now)] });
  return r === "ok" ? { ok: true } : { ok: false, error: "busy" };
}

export async function addSkill(db: D1Database, admin: string, id: string, skillId: unknown, now = Date.now()): Promise<CharacterResult> {
  const skill = typeof skillId === "string" ? getSkill(skillId) : undefined;
  if (!skill) return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name FROM characters WHERE id = ?").bind(id).first<{ name: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  if (await db.prepare("SELECT 1 AS x FROM character_skills WHERE character_id = ? AND skill_id = ?").bind(id, skill.id).first()) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("INSERT INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES (?, ?, ?, 'learned', ?)").bind(id, skill.id, now, skill.realm),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Thêm kỹ năng ${skill.nameVi} (${skill.id}) cho «${c.name}»` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

/** Removes a skill and clears it from the hotbar. */
export async function removeSkill(db: D1Database, admin: string, id: string, skillId: unknown, now = Date.now()): Promise<CharacterResult> {
  if (typeof skillId !== "string") return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name, hotbar FROM characters WHERE id = ?").bind(id).first<{ name: string; hotbar: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  if (!(await db.prepare("SELECT 1 AS x FROM character_skills WHERE character_id = ? AND skill_id = ?").bind(id, skillId).first())) return { ok: false, error: "not_found" };
  let hotbar = c.hotbar;
  try {
    const list: unknown = JSON.parse(c.hotbar);
    if (Array.isArray(list)) hotbar = JSON.stringify(list.map((s) => (s === `s:${skillId}` ? "" : s)));
  } catch {
    // keep it as it is
  }
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("DELETE FROM character_skills WHERE character_id = ? AND skill_id = ?").bind(id, skillId),
      db.prepare("UPDATE characters SET hotbar = ? WHERE id = ?").bind(hotbar, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Lấy kỹ năng ${skillId} của «${c.name}»` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

/** Sets the mastery level of a skill the character has (its points toward the next level start again from 0). */
export async function setSkillLevel(db: D1Database, admin: string, id: string, skillId: unknown, level: unknown, now = Date.now()): Promise<CharacterResult> {
  const def = typeof skillId === "string" ? getSkill(skillId) : undefined;
  if (!def || typeof level !== "number" || !Number.isInteger(level) || level < 0) return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name, root_grade FROM characters WHERE id = ?").bind(id).first<{ name: string; root_grade: number }>();
  if (!c) return { ok: false, error: "not_found" };
  if (level > maxSkillLevel(skillGrade(def, c.root_grade))) return { ok: false, error: "invalid" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const row = await db.prepare("SELECT level FROM character_skills WHERE character_id = ? AND skill_id = ?").bind(id, def.id).first<{ level: number }>();
  if (!row) return { ok: false, error: "not_found" };
  if (row.level === level) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("UPDATE character_skills SET level = ?, mastery = 0 WHERE character_id = ? AND skill_id = ?").bind(level, id, def.id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Đổi cấp kỹ năng ${def.nameVi} (${def.id}) của «${c.name}»: ${row.level} → ${level}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

export interface ItemEditInput {
  /** The upgrade level from the blacksmith, 0..ENHANCE_MAX. */
  en?: number;
  /** The trained level of a pháp bảo bản mệnh (a flat level index); its EXP towards the next one starts again from 0. */
  lv?: number;
  /** The durability now, 0..its maximum. */
  dur?: number;
}

/** Edits one piece of gear of the character, in the bag or worn: the upgrade level, the trained level of a bonded pháp bảo, the durability. */
export async function editItem(db: D1Database, admin: string, id: string, instanceId: unknown, input: ItemEditInput, now = Date.now()): Promise<CharacterResult> {
  if (typeof instanceId !== "string" || !input || typeof input !== "object") return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name FROM characters WHERE id = ?").bind(id).first<{ name: string }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const bag = await loadBag(db, id);
  const it = bag.items.find((i) => i.id === instanceId) ?? bag.equipped.find((e) => e.id === instanceId);
  const info = it ? equipmentInfo(it.type) : undefined;
  if (!it || !info) return { ok: false, error: "not_found" };
  const sets: string[] = [];
  const binds: unknown[] = [];
  const said: string[] = [];
  if (input.en !== undefined) {
    if (!intIn(input.en, 0, ENHANCE_MAX)) return { ok: false, error: "invalid" };
    if (input.en !== (it.en ?? 0)) {
      sets.push("enhance_level = ?");
      binds.push(input.en);
      said.push(`cường hóa +${it.en ?? 0} → +${input.en}`);
    }
  }
  if (input.lv !== undefined) {
    if (info.kind !== "bonded" || !intIn(input.lv, 0, REALMS.length * 9 - 1)) return { ok: false, error: "invalid" };
    if (input.lv !== refineLevelOf(info, it.lv)) {
      sets.push("refine_level = ?", "refine_exp = 0");
      binds.push(input.lv);
      said.push(`tinh luyện ${refineLevelOf(info, it.lv)} → ${input.lv}`);
    }
  }
  if (input.dur !== undefined) {
    if (it.max === undefined || !intIn(input.dur, 0, it.max)) return { ok: false, error: "invalid" };
    if (input.dur !== it.dur) {
      sets.push("durability = ?");
      binds.push(input.dur);
      said.push(`độ bền ${it.dur} → ${input.dur}`);
    }
  }
  if (sets.length === 0) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare(`UPDATE item_instances SET ${sets.join(", ")} WHERE id = ? AND owner_character_id = ?`).bind(...binds, instanceId, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Sửa ${getItemDef(it.type)?.nameVi ?? it.type} (${it.type}) của «${c.name}»: ${said.join(", ")}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

export interface ProfileInput {
  name: string;
  gender: string;
  satKhi: number;
  satNhan: number;
  anhHung: number;
}

/** Name, gender and the three PvP scores. The name keeps the creation rules (and stays unique); gender is refused while anything is worn (gear is made for one gender). */
export async function editProfile(db: D1Database, admin: string, id: string, input: ProfileInput, now = Date.now()): Promise<CharacterResult> {
  const name = validateCharacterName(input?.name);
  if (!input || !name || !isGender(input.gender) || !intIn(input.satKhi, 0, 1000) || !intIn(input.satNhan, 0, 100_000) || !intIn(input.anhHung, 0, 100_000)) return { ok: false, error: "invalid" };
  const before = await getCharacterView(db, id, now);
  if (!before) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const changed: string[] = [];
  if (before.name !== name) changed.push(`tên «${before.name}» → «${name}»`);
  if (before.gender !== input.gender) {
    if (before.equipped.length > 0) return { ok: false, error: "equipped" };
    changed.push(`giới tính ${before.gender} → ${input.gender}`);
  }
  if (before.satKhi !== input.satKhi) changed.push(`sát khí ${before.satKhi} → ${input.satKhi}`);
  if (before.satNhan !== input.satNhan) changed.push(`sát nhân ${before.satNhan} → ${input.satNhan}`);
  if (before.anhHung !== input.anhHung) changed.push(`anh hùng ${before.anhHung} → ${input.anhHung}`);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("UPDATE characters SET name = ?, gender = ?, sat_khi = ?, sat_nhan = ?, anh_hung = ?, updated_at = ? WHERE id = ?").bind(name, input.gender, input.satKhi, input.satNhan, input.anhHung, now, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Sửa nhân vật «${before.name}»: ${changed.join(", ")}` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE") && String(err).includes("name")) return { ok: false, error: "name_taken" };
    return mapGuard(err);
  }
  return { ok: true };
}

/**
 * Deletes a character as far as the game and the player can tell, but keeps its row: the ledger tables forbid deleting rows, and the money history has to stay
 * for any later investigation. Its name is freed (the row stays on its account, which may now make another character), and
 * `deleted_at` hides it from the rankings, gifts and the maps' counts. Needs the admin's own review to be running (so the character is not in the game).
 * Everything it owns (bag, mail, skills, quests) stays with the row and cannot be reached.
 */
export async function deleteCharacter(db: D1Database, admin: string, id: string, confirmName: unknown, now = Date.now()): Promise<CharacterResult> {
  const before = await getCharacterView(db, id, now);
  if (!before) return { ok: false, error: "not_found" };
  if (confirmName !== before.name) return { ok: false, error: "invalid" }; // the admin types the name again
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("UPDATE characters SET name = ?, deleted_at = ?, review_until = NULL, review_by = NULL, updated_at = ? WHERE id = ?").bind(`~${id}`, now, now, id),
      db.prepare("UPDATE sessions SET character_id = NULL WHERE character_id = ?").bind(id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Xóa nhân vật «${before.name}» (${id}) của ${before.email}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  // Vạn Bảo Lâu: take its open listings down (a standing top bidder is refunded by mail).
  await closeListingsOf(db, id, now).catch((err) => console.error("market close failed", id, err));
  await removeSectMember(db, id, now).catch((err) => console.error("sect removal failed", id, err));
  return { ok: true };
}

/** The constitution and its tier (checked against the catalogue in D1). Clears `vitals` like the other stat edits: the maximums change. */
export async function editConstitution(db: D1Database, admin: string, id: string, constitution: unknown, tier: unknown, now = Date.now()): Promise<CharacterResult> {
  if (typeof constitution !== "string" || !intIn(tier, 1, 99)) return { ok: false, error: "invalid" };
  const catalog = await getConstitutionCatalog(db, now);
  const def = catalog.constitutions.find((c) => c.id === constitution);
  if (!def || tier > Math.max(def.tiers.length, 1)) return { ok: false, error: "invalid" };
  const before = await getCharacterView(db, id, now);
  if (!before) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  if (before.constitution === constitution && before.constitutionTier === tier) return { ok: false, error: "unchanged" };
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("UPDATE characters SET constitution = ?, constitution_tier = ?, vitals = NULL, updated_at = ? WHERE id = ?").bind(constitution, tier, now, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Sửa thể chất của «${before.name}»: ${before.constitution}/${before.constitutionTier} → ${constitution}/${tier}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

/**
 * The elements of the spiritual root and its grade (phẩm cấp). One to five distinct plain elements, or a single mutant one (Lôi, Băng, Phong: they never
 * come with others); the first is the main element. The column `spiritual_root` only holds a plain element (a CHECK), so a mutant main element keeps its
 * stand-in there. Stored HP/MP are cleared (the maximums change). The potential points and the root skills the character already got stay as they are.
 */
export async function editRoots(db: D1Database, admin: string, id: string, roots: unknown, grade: unknown, now = Date.now()): Promise<CharacterResult> {
  if (!Array.isArray(roots) || roots.length < 1 || roots.length > SPIRITUAL_ROOTS.length || !roots.every((r): r is SpiritualRoot => typeof r === "string" && (ALL_ROOTS as readonly string[]).includes(r)) || new Set(roots).size !== roots.length) return { ok: false, error: "invalid" };
  if (!intIn(grade, 0, ROOT_GRADES.length - 1)) return { ok: false, error: "invalid" };
  const mutant = roots.some((r) => (MUTANT_ROOTS as readonly string[]).includes(r));
  if (mutant && roots.length !== 1) return { ok: false, error: "mutant_alone" };
  const before = await getCharacterView(db, id, now);
  if (!before) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  if (before.rootGrade === grade && before.roots.join() === roots.join()) return { ok: false, error: "unchanged" };
  const main = roots[0]!;
  const plain = (SPIRITUAL_ROOTS as readonly string[]).includes(main) ? main : (STAND_IN_ROOT[main] ?? "thuy");
  try {
    await db.batch([
      reviewGuard(db, id, admin, now),
      db.prepare("UPDATE characters SET roots = ?, spiritual_root = ?, root_grade = ?, vitals = NULL, updated_at = ? WHERE id = ?").bind(roots.join(","), plain, grade, now, id),
      logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `Sửa linh căn của «${before.name}»: ${before.roots.join("+")} phẩm ${before.rootGrade} → ${roots.join("+")} phẩm ${grade}` }, now),
    ]);
  } catch (err) {
    return mapGuard(err);
  }
  return { ok: true };
}

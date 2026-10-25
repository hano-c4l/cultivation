import { CURRENCIES, getItemDef, isCurrency, isEquipmentType, planAdd, planRemove, getSkill, type BagItem, type EquippedItem } from "@game/shared";
import { logStatement } from "./admin-log";
import { applyCurrencyDelta } from "./economy";
import { commitBagOps, loadBag } from "./inventory";

/**
 * The admin side of a character (docs/PHASE3.md 3m-b). A MapRoom is the only writer of an online character, so an edit works like this: "Sửa" puts the
 * character under REVIEW (the account cannot log in for 30 minutes, the admin's sessions-and-kick happen in accounts-admin), and every change below is refused
 * unless that admin's review is still running, checked inside the same batch as the change. "Xong" ends the review. Money goes through the currency
 * statements (so the totals stay right), items through the bag operations.
 */
export const CHARACTER_LOG_SCREEN = "Nhân vật";
export const REVIEW_MS = 30 * 60_000;

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
  review: { by: string; until: number } | null;
  wallet: Record<string, number>;
  items: Array<Pick<BagItem, "id" | "type" | "qty" | "tab" | "cell">>;
  equipped: Array<Pick<EquippedItem, "id" | "type" | "slot">>;
  skills: Array<{ id: string; source: string; realm: number; level: number }>;
}

export async function getCharacterView(db: D1Database, id: string, now = Date.now()): Promise<CharacterView | null> {
  const r = await db
    .prepare(
      "SELECT c.id, c.account_id, a.email, c.name, c.gender, c.realm, c.stage, c.exp, c.potential_points, c.stat_can_cot, c.stat_than_phap, c.stat_ngo_tinh, c.stat_linh_luc, c.stat_than_thuc, c.stat_phuc_duyen, c.map_id, c.sat_khi, c.sat_nhan, c.anh_hung, c.review_until, c.review_by FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.id = ?",
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
    review: r.review_until !== null && r.review_until > now && r.review_by ? { by: r.review_by, until: r.review_until } : null,
    wallet: Object.fromEntries(wallet.results.map((w) => [w.currency, w.balance])),
    items: bag.items.map((i) => ({ id: i.id, type: i.type, qty: i.qty, tab: i.tab, cell: i.cell })),
    equipped: bag.equipped.map((e) => ({ id: e.id, type: e.type, slot: e.slot })),
    skills: skills.results.map((s) => ({ id: s.skill_id, source: s.source, realm: s.realm, level: s.level })),
  };
}

export type CharacterResult = { ok: true; kicked?: boolean } | { ok: false; error: "invalid" | "not_found" | "not_reviewing" | "reviewed_by_other" | "unchanged" | "full" | "funds" | "busy" | "unknown_item" };

/** Fails the batch unless this admin's review of the character is still running. */
const reviewGuard = (db: D1Database, id: string, admin: string, now: number) =>
  db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND review_by = ? AND review_until > ?)").bind(id, admin, now);

async function reviewing(db: D1Database, id: string, admin: string, now: number): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM characters WHERE id = ? AND review_by = ? AND review_until > ?").bind(id, admin, now).first());
}

/** Puts the character under review. `onStart` ends its sessions and kicks it out of the game (accounts-admin); it runs after the review is set so nobody can slip back in. */
export async function startReview(db: D1Database, admin: string, id: string, onStart: (accountId: string, characterId: string) => Promise<boolean>, now = Date.now()): Promise<CharacterResult> {
  const c = await db.prepare("SELECT id, account_id, name, review_until, review_by FROM characters WHERE id = ?").bind(id).first<{ id: string; account_id: string; name: string; review_until: number | null; review_by: string | null }>();
  if (!c) return { ok: false, error: "not_found" };
  if (c.review_until !== null && c.review_until > now && c.review_by && c.review_by !== admin) return { ok: false, error: "reviewed_by_other" };
  await db.batch([
    db.prepare("UPDATE characters SET review_until = ?, review_by = ? WHERE id = ?").bind(now + REVIEW_MS, admin, id),
    db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(c.account_id),
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

function mapGuard(err: unknown): CharacterResult {
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

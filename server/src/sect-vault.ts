import { SECT_RANK, assignPieces, disbandShares, getItemDef, isTradable, splitLinh, stackLimit, vaultPoints, vaultSlotsOf, type BagOp, type SectCfg, type SectError, type SectVaultItemView } from "@game/shared";
import { applyCurrencyDelta } from "./economy";
import { guard as itemGuard, wearOf, type BagState } from "./inventory";
import { actorGuard, mailStatement } from "./market";
import { acceptOf, earnStatements, memberOf, sectById, vnDay, type SectResult } from "./sect";

/**
 * The sect warehouse (docs/PHASE5.md, 5c-3). A stack in it is in escrow exactly like a market listing: the item row stays with the member who put it in, in no cell
 * and no slot, and a `sect_vault` row points at it. Everything that leaves (the leader takes it out, a member buys it off the shelf, a closing sect hands it round) is a
 * guarded batch that changes the owner and mails the item, so a bag in another room is never touched from here.
 */
const HOUR_MS = 3_600_000;

const guard = (db: D1Database, badIf: string, ...args: unknown[]): D1PreparedStatement => db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE ${badIf}`).bind(...args);
const logStatement = (db: D1Database, sectId: string, actor: string | null, action: string, target: string | null, detail: string, now: number): D1PreparedStatement =>
  db.prepare("INSERT INTO sect_log (id, sect_id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), sectId, actor, action, target, detail, now);

function isGuardFailure(err: unknown): boolean {
  return /inv_guard|idx_sect_|sect_vault|sect_members|sects\.|CHECK constraint|idx_items_/.test(String(err));
}

interface VaultRow {
  item_id: string;
  sect_id: string;
  depositor_id: string;
  item_type: string;
  qty: number;
  points: number;
  created_at: number;
  shelf_currency: "linh_thach" | "cong_hien" | null;
  shelf_price: number | null;
}

const nameOf = (type: string): string => getItemDef(type)?.nameVi ?? type;

/** The warehouse of a sect for its window, newest first. */
export async function vaultViews(db: D1Database, sectId: string): Promise<SectVaultItemView[]> {
  const { results } = await db
    .prepare(
      "SELECT v.item_id AS id, v.item_type AS type, v.qty AS qty, v.shelf_currency AS cur, v.shelf_price AS price, c.name AS by, i.durability, i.max_durability, i.refine_level, i.refine_exp, i.rolled_stats, i.enhance_level " +
        "FROM sect_vault v JOIN characters c ON c.id = v.depositor_id JOIN item_instances i ON i.id = v.item_id WHERE v.sect_id = ? ORDER BY v.created_at DESC, v.item_id LIMIT 400",
    )
    .bind(sectId)
    .all<{ id: string; type: string; qty: number; cur: "linh_thach" | "cong_hien" | null; price: number | null; by: string; durability: number | null; max_durability: number | null; refine_level: number | null; refine_exp: number | null; rolled_stats: string | null; enhance_level: number | null }>();
  return results.map((r) => ({ id: r.id, type: r.type, qty: r.qty, by: r.by, carry: { ...wearOf(r) }, ...(r.cur && r.price ? { shelf: { currency: r.cur, price: r.price } } : {}) }));
}

export async function setAccept(db: D1Database, cfg: SectCfg, p: { actorId: string; cats: Record<string, number>; minGrade: number; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  const clean = acceptOf(cfg, JSON.stringify({ cats: p.cats, minGrade: p.minGrade }));
  try {
    await db.batch([
      guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND leader_id = ?)", me.sect_id, p.actorId),
      db.prepare("UPDATE sects SET accept = ? WHERE id = ?").bind(JSON.stringify(clean), me.sect_id),
      logStatement(db, me.sect_id, p.actorId, "accept", null, JSON.stringify(clean), p.now),
    ]);
  } catch (err) {
    if (isGuardFailure(err)) return { ok: false, reason: "gone" };
    throw err;
  }
  return { ok: true, sectId: me.sect_id };
}

/** A member puts `qty` of a bag item in the warehouse: the stack leaves the bag and the cống hiến it is worth (within the day's cap) is earned, in one batch. */
export async function putItem(
  db: D1Database,
  cfg: SectCfg,
  p: { characterId: string; bag: BagState; itemId: string; qty: number; now: number },
): Promise<SectResult<{ sectId: string; points: number; credited: number; ops: BagOp[] }>> {
  const me = await memberOf(db, p.characterId);
  if (!me) return { ok: false, reason: "no_sect" };
  const sect = await sectById(db, me.sect_id);
  if (!sect) return { ok: false, reason: "gone" };
  const item = p.bag.items.find((i) => i.id === p.itemId);
  const def = item ? getItemDef(item.type) : undefined;
  if (!item || !def || def.disabled || !Number.isInteger(p.qty) || p.qty < 1 || p.qty > item.qty) return { ok: false, reason: "invalid" };
  if (def.untradable) return { ok: false, reason: "untradable" };
  if (stackLimit(item.type) === 1 && p.qty !== 1) return { ok: false, reason: "invalid" };
  const points = vaultPoints(cfg, acceptOf(cfg, sect.accept), def, p.qty);
  if (points <= 0) return { ok: false, reason: "value" };
  const slots = vaultSlotsOf(cfg, sect.level);
  const held = (await db.prepare("SELECT COUNT(*) AS n FROM sect_vault WHERE sect_id = ?").bind(sect.id).first<{ n: number }>())?.n ?? 0;
  if (held >= slots) return { ok: false, reason: "vault_full" };
  const day = vnDay(p.now);
  const used = me.vault_day === day ? me.vault_points : 0;
  const credited = Math.max(0, Math.min(points, cfg.vault.dailyCap - used));
  const whole = p.qty === item.qty;
  const stored = whole ? item.id : crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    actorGuard(db, p.characterId, p.now),
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ?)", p.characterId, sect.id),
    guard(db, "(SELECT COUNT(*) FROM sect_vault WHERE sect_id = ?) >= ?", sect.id, slots),
    // the day's cap read from the row is checked again here, so two deposits at once cannot both slip under it
    guard(db, "EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND (CASE WHEN vault_day = ? THEN vault_points ELSE 0 END) + ? > ?) AND ? > 0", p.characterId, day, credited, cfg.vault.dailyCap, credited),
    itemGuard(db, p.characterId, item.id, { qty: item.qty, tab: item.tab, cell: item.cell, slot: null }),
  ];
  let ops: BagOp[];
  if (whole) {
    statements.push(db.prepare("UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE id = ? AND owner_character_id = ?").bind(item.id, p.characterId));
    ops = [{ op: "remove", id: item.id, qty: item.qty }];
  } else {
    statements.push(
      db.prepare("UPDATE item_instances SET qty = ? WHERE id = ? AND owner_character_id = ?").bind(item.qty - p.qty, item.id, p.characterId),
      db.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) VALUES (?, ?, ?, ?, ?)").bind(stored, p.characterId, item.type, p.qty, p.now),
    );
    ops = [{ op: "setqty", id: item.id, from: item.qty, to: item.qty - p.qty }];
  }
  statements.push(
    db.prepare("INSERT INTO sect_vault (item_id, sect_id, depositor_id, item_type, qty, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(stored, sect.id, p.characterId, item.type, p.qty, credited, p.now),
    db.prepare("UPDATE sect_members SET vault_points = (CASE WHEN vault_day = ? THEN vault_points ELSE 0 END) + ?, vault_day = ? WHERE character_id = ?").bind(day, credited, day, p.characterId),
    ...earnStatements(db, cfg, p.characterId, sect.id, credited, credited * cfg.vault.expPerPoint),
    logStatement(db, sect.id, p.characterId, "put", null, `${item.type} x${p.qty} +${credited}`, p.now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    if (isGuardFailure(err)) return { ok: false, reason: "busy" };
    throw err;
  }
  return { ok: true, sectId: sect.id, points, credited, ops };
}

async function rowOf(db: D1Database, itemId: string): Promise<VaultRow | null> {
  return db.prepare("SELECT * FROM sect_vault WHERE item_id = ?").bind(itemId).first<VaultRow>();
}

/** The statements that hand a warehouse stack over to `to` by mail (the owner changes, the stack leaves the warehouse). */
function handOverStatements(db: D1Database, v: VaultRow, to: string, subject: string, now: number): D1PreparedStatement[] {
  return [
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_vault WHERE item_id = ? AND sect_id = ?)", v.item_id, v.sect_id),
    itemGuard(db, v.depositor_id, v.item_id, { tab: null, cell: null, slot: null }),
    db.prepare("UPDATE item_instances SET owner_character_id = ? WHERE id = ? AND owner_character_id = ?").bind(to, v.item_id, v.depositor_id),
    mailStatement(db, to, subject, now, { itemId: v.item_id }),
    db.prepare("DELETE FROM sect_vault WHERE item_id = ?").bind(v.item_id),
  ];
}

/** The leader takes a stack out of the warehouse and sends it to a member of the sect (themselves too) by mail. */
export async function takeItem(db: D1Database, p: { actorId: string; itemId: string; to: string; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  const row = await rowOf(db, p.itemId);
  if (!row || row.sect_id !== me.sect_id) return { ok: false, reason: "item" };
  const target = await memberOf(db, p.to);
  if (!target || target.sect_id !== me.sect_id) return { ok: false, reason: "gone" };
  try {
    await db.batch([
      guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ? AND rank >= ?)", p.actorId, me.sect_id, SECT_RANK.leader),
      guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ?)", p.to, me.sect_id),
      ...handOverStatements(db, row, p.to, `Tông môn: ${nameOf(row.item_type)}${row.qty > 1 ? ` x${row.qty}` : ""}`, p.now),
      logStatement(db, me.sect_id, p.actorId, "take", p.to, `${row.item_type} x${row.qty}`, p.now),
    ]);
  } catch (err) {
    if (isGuardFailure(err)) return { ok: false, reason: "busy" };
    throw err;
  }
  return { ok: true, sectId: me.sect_id };
}

/** The leader puts a stack on the shop shelf (Linh Thạch or cống hiến) or takes it off (`currency` null). */
export async function setShelf(db: D1Database, p: { actorId: string; itemId: string; currency: "linh_thach" | "cong_hien" | null; price: number; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  const row = await rowOf(db, p.itemId);
  if (!row || row.sect_id !== me.sect_id) return { ok: false, reason: "item" };
  if (p.currency !== null && !isTradable(row.item_type)) return { ok: false, reason: "untradable" };
  if (p.currency !== null && (!Number.isInteger(p.price) || p.price < 1 || p.price > 1_000_000_000)) return { ok: false, reason: "invalid" };
  try {
    await db.batch([
      guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ? AND rank >= ?)", p.actorId, me.sect_id, SECT_RANK.leader),
      db.prepare("UPDATE sect_vault SET shelf_currency = ?, shelf_price = ? WHERE item_id = ? AND sect_id = ?").bind(p.currency, p.currency === null ? null : p.price, p.itemId, me.sect_id),
      guard(db, "NOT EXISTS (SELECT 1 FROM sect_vault WHERE item_id = ? AND sect_id = ?)", p.itemId, me.sect_id),
      logStatement(db, me.sect_id, p.actorId, p.currency ? "shelf" : "unshelf", null, `${row.item_type} ${p.currency ?? ""} ${p.currency ? p.price : ""}`.trim(), p.now),
    ]);
  } catch (err) {
    if (isGuardFailure(err)) return { ok: false, reason: "busy" };
    throw err;
  }
  return { ok: true, sectId: me.sect_id };
}

/**
 * A member buys a shelf stack. For Linh Thạch the price goes into the sect's fund; for cống hiến it is taken from the member's. The stack comes by mail. Two buyers (or a buyer
 * and the leader taking it out) at once: the guard on the shelf row lets only one through.
 */
export async function buyShelf(db: D1Database, p: { buyerId: string; itemId: string; now: number }): Promise<SectResult<{ sectId: string; currency: "linh_thach" | "cong_hien"; balance: number | null }>> {
  const me = await memberOf(db, p.buyerId);
  if (!me) return { ok: false, reason: "no_sect" };
  const row = await rowOf(db, p.itemId);
  if (!row || row.sect_id !== me.sect_id || !row.shelf_currency || !row.shelf_price) return { ok: false, reason: "item" };
  const { shelf_currency: currency, shelf_price: price } = row;
  const hand = [
    // the shelf row must still be as it was read (the price too)
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_vault WHERE item_id = ? AND sect_id = ? AND shelf_currency = ? AND shelf_price = ?)", row.item_id, row.sect_id, currency, price),
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ?)", p.buyerId, me.sect_id),
    ...handOverStatements(db, row, p.buyerId, `Tông môn: đã mua ${nameOf(row.item_type)}${row.qty > 1 ? ` x${row.qty}` : ""}`, p.now),
    logStatement(db, me.sect_id, p.buyerId, "shelf_buy", null, `${row.item_type} ${currency} ${price}`, p.now),
  ];
  try {
    if (currency === "linh_thach") {
      const res = await applyCurrencyDelta(db, { characterId: p.buyerId, currency: "linh_thach", delta: -price, reason: "sect:shelf", actor: "system" }, [...hand, db.prepare("UPDATE sects SET fund = fund + ? WHERE id = ?").bind(price, me.sect_id)]);
      if (res.status === "insufficient") return { ok: false, reason: "funds" };
      if (res.status !== "applied") return { ok: false, reason: "busy" };
      return { ok: true, sectId: me.sect_id, currency, balance: res.balance };
    }
    if (me.contribution < price) return { ok: false, reason: "poor" };
    await db.batch([...hand, db.prepare("UPDATE sect_members SET contribution = contribution - ? WHERE character_id = ?").bind(price, p.buyerId)]); // the CHECK on contribution throws when it cannot pay
    return { ok: true, sectId: me.sect_id, currency, balance: null };
  } catch (err) {
    if (isGuardFailure(err)) return { ok: false, reason: "busy" };
    throw err;
  }
}

interface CloseMember {
  id: string;
  rank: number;
  total: number;
}

/**
 * Closes a sect in ONE batch: the stacks of the warehouse and the Linh Thạch of the fund go where `moves` and `gifts` say (mail), everyone gets the wait, and the sect is gone.
 * The guards compare what was read (the fund, the stacks, the members) with what is there now; any change in between (a deposit, a donation, a join) throws, and the caller reads again.
 */
export async function closeBatch(
  db: D1Database,
  cfg: SectCfg,
  p: { sectId: string; sectName: string; actor: string | null; leaderId: string | null; fund: number; vaultIds: string[]; memberIds: string[]; moves: Array<{ item: string; to: string; name: string; qty: number; origin?: string }>; gifts: Array<{ to: string; amount: number }>; waitFor: string[]; now: number },
): Promise<SectError | null> {
  const moves = JSON.stringify(p.moves.map((m) => ({ ...m, mail: crypto.randomUUID(), subject: `Tông môn ${p.sectName} giải tán: ${m.name}` })));
  const gifts = JSON.stringify(
    p.gifts.map((g) => ({ mail: `sect:${crypto.randomUUID()}`, to: g.to, subject: `Tông môn ${p.sectName} giải tán: chia quỹ`, gift: JSON.stringify({ linh_thach: g.amount, items: [], reason: "sect:disband" }) })),
  );
  const statements: D1PreparedStatement[] = [
    guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND fund = ?)", p.sectId, p.fund),
    // the very stacks and members that were read, no more and no fewer (a count alone would let a stack that left and another that came in cancel out)
    guard(db, "(SELECT COUNT(*) FROM sect_vault WHERE sect_id = ?) <> ?", p.sectId, p.vaultIds.length),
    guard(db, "(SELECT COUNT(*) FROM sect_vault WHERE sect_id = ? AND item_id IN (SELECT value FROM json_each(?))) <> ?", p.sectId, JSON.stringify(p.vaultIds), p.vaultIds.length),
    guard(db, "(SELECT COUNT(*) FROM sect_members WHERE sect_id = ?) <> ?", p.sectId, p.memberIds.length),
    guard(db, "(SELECT COUNT(*) FROM sect_members WHERE sect_id = ? AND character_id IN (SELECT value FROM json_each(?))) <> ?", p.sectId, JSON.stringify(p.memberIds), p.memberIds.length),
    guard(
      db,
      "(SELECT COUNT(*) FROM sect_vault v JOIN item_instances i ON i.id = v.item_id WHERE v.sect_id = ? AND i.cell IS NULL AND i.equip_slot IS NULL AND i.owner_character_id = v.depositor_id) <> ?",
      p.sectId,
      p.vaultIds.length,
    ),
  ];
  if (p.leaderId) statements.push(guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND leader_id = ?)", p.sectId, p.leaderId));
  if (p.moves.length > 0) {
    statements.push(
      // a stack (or the first piece of a split one) keeps its row: new owner, and the quantity of its piece
      db
        .prepare(
          "UPDATE item_instances SET owner_character_id = (SELECT json_extract(j.value, '$.to') FROM json_each(?) j WHERE json_extract(j.value, '$.item') = item_instances.id), " +
            "qty = (SELECT json_extract(j.value, '$.qty') FROM json_each(?) j WHERE json_extract(j.value, '$.item') = item_instances.id) " +
            "WHERE id IN (SELECT json_extract(value, '$.item') FROM json_each(?) WHERE json_extract(value, '$.origin') IS NULL)",
        )
        .bind(moves, moves, moves),
      // the other pieces of a split stack are new rows of the same kind
      db
        .prepare(
          "INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) SELECT json_extract(j.value, '$.item'), json_extract(j.value, '$.to'), " +
            "(SELECT item_type FROM item_instances WHERE id = json_extract(j.value, '$.origin')), json_extract(j.value, '$.qty'), ? FROM json_each(?) j WHERE json_extract(j.value, '$.origin') IS NOT NULL",
        )
        .bind(p.now, moves),
      db
        .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, gift, expires_at, created_at) SELECT json_extract(value, '$.mail'), json_extract(value, '$.to'), json_extract(value, '$.subject'), '', json_extract(value, '$.item'), NULL, NULL, ? FROM json_each(?)")
        .bind(p.now, moves),
    );
  }
  if (p.gifts.length > 0) {
    statements.push(
      db
        .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, gift, expires_at, created_at) SELECT json_extract(value, '$.mail'), json_extract(value, '$.to'), json_extract(value, '$.subject'), '', NULL, json_extract(value, '$.gift'), NULL, ? FROM json_each(?)")
        .bind(p.now, gifts),
    );
  }
  statements.push(
    db.prepare("DELETE FROM sect_vault WHERE sect_id = ?").bind(p.sectId),
    db.prepare("INSERT OR REPLACE INTO sect_cooldown (character_id, until) SELECT character_id, ? FROM sect_members WHERE sect_id = ? AND character_id IN (SELECT value FROM json_each(?))").bind(p.now + cfg.rejoinHours * HOUR_MS, p.sectId, JSON.stringify(p.waitFor)),
    db.prepare("DELETE FROM sect_requests WHERE sect_id = ?").bind(p.sectId),
    db.prepare("DELETE FROM character_skills WHERE source = 'sect' AND character_id IN (SELECT character_id FROM sect_members WHERE sect_id = ?)").bind(p.sectId), // the skills of the sect go with it
    db.prepare("DELETE FROM sect_members WHERE sect_id = ?").bind(p.sectId),
    db.prepare("DELETE FROM sects WHERE id = ?").bind(p.sectId),
    logStatement(db, p.sectId, p.actor, "disband", null, p.sectName, p.now),
  );
  try {
    await db.batch(statements);
    return null;
  } catch (err) {
    if (isGuardFailure(err)) return "busy";
    throw err;
  }
}

/**
 * The leader closes the sect. `leader`: the fund and every stack go to the leader. `share`: they are divided by cống hiến (the shares of `disbandShares`: the leader and the
 * deputies get their fixed parts, the rest follows each member's total). Everything arrives by mail; the sect, its warehouse and its members are gone in the same batch.
 */
export async function disbandSect(db: D1Database, cfg: SectCfg, p: { actorId: string; mode: "leader" | "share"; now: number }): Promise<SectResult<{ sectId: string; members: string[]; name: string; recipients: string[] }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const sect = await sectById(db, me.sect_id);
    if (!sect) return { ok: false, reason: "gone" };
    const members = (await db.prepare("SELECT character_id AS id, rank, contribution_total AS total FROM sect_members WHERE sect_id = ?").bind(sect.id).all<CloseMember>()).results;
    const vault = (await db.prepare("SELECT * FROM sect_vault WHERE sect_id = ?").bind(sect.id).all<VaultRow>()).results;
    const shares = p.mode === "share" ? disbandShares(cfg, members) : new Map([[p.actorId, 100]]);
    const linh = splitLinh(sect.fund, shares, p.actorId);
    const pieces = assignPieces(vault.map((v) => ({ id: v.item_id, value: Math.max(1, v.points), qty: p.mode === "share" ? v.qty : 1 })), shares, p.actorId);
    const failed = await closeBatch(db, cfg, {
      sectId: sect.id,
      sectName: sect.name,
      actor: p.actorId,
      leaderId: p.actorId,
      fund: sect.fund,
      vaultIds: vault.map((v) => v.item_id),
      memberIds: members.map((m) => m.id),
      moves: vault.flatMap((v) => {
        // in "leader" mode a stack goes whole; in "share" a stack of several is split by quantity (the first piece keeps the row, the others are new rows)
        const list = p.mode === "share" ? (pieces.get(v.item_id) ?? [{ to: p.actorId, qty: v.qty }]) : [{ to: p.actorId, qty: v.qty }];
        return list.map((piece, k) => ({ item: k === 0 ? v.item_id : crypto.randomUUID(), to: piece.to, name: nameOf(v.item_type), qty: piece.qty, ...(k === 0 ? {} : { origin: v.item_id }) }));
      }),
      gifts: [...linh].filter(([, n]) => n > 0).map(([to, amount]) => ({ to, amount })),
      waitFor: members.map((m) => m.id),
      now: p.now,
    });
    if (!failed) {
      const recipients = [...new Set([...linh.keys(), ...[...pieces.values()].flatMap((l) => l.map((x) => x.to))])];
      return { ok: true, sectId: sect.id, members: members.map((m) => m.id), name: sect.name, recipients };
    }
  }
  return { ok: false, reason: "busy" };
}

/**
 * The last member of a sect is being removed (their character is deleted): the stacks go back to the members who put them in (by mail) and the sect closes; the fund has
 * nobody to go to and is gone.
 */
export async function closeSectReturning(db: D1Database, cfg: SectCfg, p: { sectId: string; actor: string | null; now: number }): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const sect = await sectById(db, p.sectId);
    if (!sect) return;
    const members = (await db.prepare("SELECT character_id AS id FROM sect_members WHERE sect_id = ?").bind(sect.id).all<{ id: string }>()).results;
    const vault = (await db.prepare("SELECT * FROM sect_vault WHERE sect_id = ?").bind(sect.id).all<VaultRow>()).results;
    const failed = await closeBatch(db, cfg, {
      sectId: sect.id,
      sectName: sect.name,
      actor: p.actor,
      leaderId: null,
      fund: sect.fund,
      vaultIds: vault.map((v) => v.item_id),
      memberIds: members.map((m) => m.id),
      moves: vault.map((v) => ({ item: v.item_id, to: v.depositor_id, name: nameOf(v.item_type), qty: v.qty })),
      gifts: [],
      waitFor: [],
      now: p.now,
    });
    if (!failed) return;
  }
}

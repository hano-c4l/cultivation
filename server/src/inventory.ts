import { MAIL_ITEM_EXPIRY_MS, START_BAG_TABS, carried, firstFreeCell, stackLimit, type BagItem, type BagOp, type EquippedItem, type EquipSlot, type MailView } from "@game/shared";

/**
 * D1 side of the bag. The room plans changes against its in-memory copy (shared/src/inventory.ts) and this module
 * writes the plan as ONE batch. Every precondition is a statement that throws when it no longer holds, because a
 * statement that merely changes zero rows would not roll the batch back (and the loot key would already be spent):
 *  - the loot key is inserted first (PRIMARY KEY: a retry is "duplicate" and nothing else happens);
 *  - each change to an existing row is preceded by a guard that checks the row still looks as planned (stale cache);
 *  - the unique (owner, tab, cell) index catches two items planned into one cell.
 * On any of these the batch rolls back and the caller reloads the bag from D1 and plans again.
 */
export type CommitResult = "ok" | "duplicate" | "stale";

/** An item that did not fit in the bag and travels by mail instead. */
export interface MailItem {
  type: string;
  qty: number;
  subject: string;
  /** Gear: durability the new item starts with. */
  dur?: number;
  max?: number;
  /** True: the mail never expires (gear that cannot be handed to the bag). */
  permanent?: boolean;
}

export interface BagState {
  tabs: number;
  items: BagItem[];
  /** Worn pieces. */
  equipped: EquippedItem[];
}

interface BagRow {
  id: string;
  item_type: string;
  bag_tab: number | null;
  cell: number | null;
  qty: number;
  equip_slot: EquipSlot | null;
  durability: number | null;
  max_durability: number | null;
  refine_level: number | null;
  refine_exp: number | null;
}

/** Wear and training fields of a row, in the shape the room and the client use. */
function wearOf(r: { durability: number | null; max_durability: number | null; refine_level?: number | null; refine_exp?: number | null }): { dur?: number; max?: number; lv?: number; xp?: number } {
  return {
    ...(r.durability !== null && r.max_durability !== null ? { dur: r.durability, max: r.max_durability } : {}),
    ...(r.refine_level != null ? { lv: r.refine_level } : {}),
    ...(r.refine_exp != null ? { xp: r.refine_exp } : {}),
  };
}

/** Writes the training of a pháp bảo bản mệnh (level and EXP). Only the room that holds the character lock writes it, so no guard is needed. */
export async function saveRefine(db: D1Database, characterId: string, itemId: string, lv: number, xp: number): Promise<void> {
  await db.prepare("UPDATE item_instances SET refine_level = ?, refine_exp = ? WHERE id = ? AND owner_character_id = ?").bind(lv, xp, itemId, characterId).run();
}

export async function loadBag(db: D1Database, characterId: string): Promise<BagState> {
  const [tabsRow, rows] = await Promise.all([
    db.prepare("SELECT bag_tabs FROM characters WHERE id = ?").bind(characterId).first<{ bag_tabs: number }>(),
    db
      .prepare(
        "SELECT id, item_type, bag_tab, cell, qty, equip_slot, durability, max_durability, refine_level, refine_exp FROM item_instances " +
          "WHERE owner_character_id = ? AND (cell IS NOT NULL OR equip_slot IS NOT NULL)",
      )
      .bind(characterId)
      .all<BagRow>(),
  ]);
  const items: BagItem[] = [];
  const equipped: EquippedItem[] = [];
  for (const r of rows.results) {
    if (r.equip_slot) equipped.push({ id: r.id, type: r.item_type, slot: r.equip_slot, ...wearOf(r) });
    else if (r.bag_tab !== null && r.cell !== null) items.push({ id: r.id, type: r.item_type, tab: r.bag_tab, cell: r.cell, qty: r.qty, ...wearOf(r) });
  }
  return { tabs: tabsRow?.bag_tabs ?? START_BAG_TABS, items, equipped };
}

/** `INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (...)`: throws (NOT NULL) when the row is not as expected. */
function guard(db: D1Database, characterId: string, id: string, expect: { qty?: number; tab?: number | null; cell?: number | null; slot?: string | null; dur?: number }): D1PreparedStatement {
  const conds = ["id = ?", "owner_character_id = ?"];
  const args: unknown[] = [id, characterId];
  if (expect.qty !== undefined) {
    conds.push("qty = ?");
    args.push(expect.qty);
  }
  if (expect.tab === null) conds.push("bag_tab IS NULL");
  else if (expect.tab !== undefined) {
    conds.push("bag_tab = ?");
    args.push(expect.tab);
  }
  if (expect.cell === null) conds.push("cell IS NULL");
  else if (expect.cell !== undefined) {
    conds.push("cell = ?");
    args.push(expect.cell);
  }
  if (expect.slot === null) conds.push("equip_slot IS NULL");
  else if (expect.slot !== undefined) {
    conds.push("equip_slot = ?");
    args.push(expect.slot);
  }
  if (expect.dur !== undefined) {
    conds.push("durability = ?");
    args.push(expect.dur);
  }
  return db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM item_instances WHERE ${conds.join(" AND ")})`).bind(...args);
}

/** D1 allows 100 bound parameters per statement, so the bulk statements of a sort work in chunks. */
function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * The sort: every changed row is checked, merged-away rows are deleted, changed rows are first parked at (NULL, NULL)
 * and then written to their final cell and quantity. Parking makes the order of rows irrelevant to the unique cell index
 * (two rows swapping cells would otherwise collide while the statement runs). All of it is guard-checked first, so a
 * stale cache fails the whole batch instead of overwriting rows that changed in the meantime.
 */
function arrangeStatements(db: D1Database, characterId: string, op: Extract<BagOp, { op: "arrange" }>): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  // Guard: exactly these rows must exist with exactly this state (5 params per row + owner).
  for (const group of chunks(op.before, 18)) {
    const rows = group.map(() => "(id = ? AND bag_tab = ? AND cell = ? AND qty = ?)").join(" OR ");
    const args = group.flatMap((r) => [r.id, r.tab, r.cell, r.qty]);
    out.push(
      db
        .prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE (SELECT COUNT(*) FROM item_instances WHERE owner_character_id = ? AND (${rows})) <> ?`)
        .bind(characterId, ...args, group.length),
    );
  }
  const keep = new Set(op.after.map((r) => r.id));
  const removed = op.before.filter((r) => !keep.has(r.id));
  for (const group of chunks(removed, 90)) {
    out.push(db.prepare(`DELETE FROM item_instances WHERE owner_character_id = ? AND id IN (${group.map(() => "?").join(", ")})`).bind(characterId, ...group.map((r) => r.id)));
  }
  for (const group of chunks(op.after, 90)) {
    out.push(
      db
        .prepare(`UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE owner_character_id = ? AND id IN (${group.map(() => "?").join(", ")})`)
        .bind(characterId, ...group.map((r) => r.id)),
    );
  }
  for (const group of chunks(op.after, 13)) {
    const cases = (col: "tab" | "cell" | "qty") => `CASE id ${group.map(() => "WHEN ? THEN ?").join(" ")} END`;
    const pairs = (col: "tab" | "cell" | "qty") => group.flatMap((r) => [r.id, r[col]]);
    out.push(
      db
        .prepare(
          `UPDATE item_instances SET bag_tab = ${cases("tab")}, cell = ${cases("cell")}, qty = ${cases("qty")} ` +
            `WHERE owner_character_id = ? AND id IN (${group.map(() => "?").join(", ")})`,
        )
        .bind(...pairs("tab"), ...pairs("cell"), ...pairs("qty"), characterId, ...group.map((r) => r.id)),
    );
  }
  return out;
}

export function opStatements(db: D1Database, characterId: string, op: BagOp, now: number): D1PreparedStatement[] {
  switch (op.op) {
    case "arrange":
      return arrangeStatements(db, characterId, op);
    case "add":
      return [
        db
          .prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, durability, max_durability, refine_level, refine_exp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(op.id, characterId, op.type, op.qty, op.tab, op.cell, op.dur ?? null, op.max ?? null, op.lv ?? null, op.xp ?? null, now),
      ];
    case "equip":
      return [
        guard(db, characterId, op.id, { tab: op.tab, cell: op.cell, slot: null }),
        db.prepare("UPDATE item_instances SET bag_tab = NULL, cell = NULL, equip_slot = ? WHERE id = ? AND owner_character_id = ?").bind(op.slot, op.id, characterId),
      ];
    case "unequip":
      return [
        guard(db, characterId, op.id, { tab: null, cell: null, slot: op.slot }),
        db.prepare("UPDATE item_instances SET bag_tab = ?, cell = ?, equip_slot = NULL WHERE id = ? AND owner_character_id = ?").bind(op.tab, op.cell, op.id, characterId),
      ];
    case "swapequip":
      // The new piece is parked (no cell, no slot) while the old one takes its cell and the slot is handed over.
      return [
        guard(db, characterId, op.id, { tab: op.tab, cell: op.cell, slot: null }),
        guard(db, characterId, op.oldId, { tab: null, cell: null, slot: op.slot }),
        db.prepare("UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE id = ? AND owner_character_id = ?").bind(op.id, characterId),
        db.prepare("UPDATE item_instances SET bag_tab = ?, cell = ?, equip_slot = NULL WHERE id = ? AND owner_character_id = ?").bind(op.tab, op.cell, op.oldId, characterId),
        db.prepare("UPDATE item_instances SET equip_slot = ? WHERE id = ? AND owner_character_id = ?").bind(op.slot, op.id, characterId),
      ];
    case "setdur":
      return [
        guard(db, characterId, op.id, { dur: op.from }),
        db.prepare("UPDATE item_instances SET durability = ? WHERE id = ? AND owner_character_id = ? AND max_durability >= ?").bind(op.to, op.id, characterId, op.to),
      ];
    case "mailequip":
      return [
        guard(db, characterId, op.id, { tab: null, cell: null, slot: op.slot }),
        db.prepare("UPDATE item_instances SET equip_slot = NULL WHERE id = ? AND owner_character_id = ?").bind(op.id, characterId),
        db
          .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, expires_at, created_at) VALUES (?, ?, ?, '', ?, NULL, ?)")
          .bind(op.mailId, characterId, op.subject, op.id, now),
      ];
    case "give":
      // The owner's row goes and a copy for the receiver is created in the same batch, with an unexpiring mail pointing at it.
      return [
        guard(db, characterId, op.id, { qty: op.qty }),
        db.prepare("DELETE FROM item_instances WHERE id = ? AND owner_character_id = ?").bind(op.id, characterId),
        db
          .prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, durability, max_durability, refine_level, refine_exp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(op.newId, op.to, op.type, op.qty, op.dur ?? null, op.max ?? null, op.lv ?? null, op.xp ?? null, now),
        db
          .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, expires_at, created_at) VALUES (?, ?, ?, '', ?, NULL, ?)")
          .bind(op.mailId, op.to, op.subject, op.newId, now),
      ];
    case "setqty":
      return [
        guard(db, characterId, op.id, { qty: op.from }),
        db.prepare("UPDATE item_instances SET qty = ? WHERE id = ? AND owner_character_id = ?").bind(op.to, op.id, characterId),
      ];
    case "remove":
      return [
        guard(db, characterId, op.id, { qty: op.qty }),
        db.prepare("DELETE FROM item_instances WHERE id = ? AND owner_character_id = ?").bind(op.id, characterId),
      ];
    case "move":
      return [
        guard(db, characterId, op.id, { tab: op.fromTab, cell: op.fromCell }),
        db.prepare("UPDATE item_instances SET bag_tab = ?, cell = ? WHERE id = ? AND owner_character_id = ?").bind(op.tab, op.cell, op.id, characterId),
      ];
    case "swap": {
      const setPos = (id: string, tab: number | null, cell: number | null) =>
        db.prepare("UPDATE item_instances SET bag_tab = ?, cell = ? WHERE id = ? AND owner_character_id = ?").bind(tab, cell, id, characterId);
      // Three steps through a free (NULL) position, because the unique index is checked row by row.
      return [
        guard(db, characterId, op.a.id, { tab: op.a.tab, cell: op.a.cell }),
        guard(db, characterId, op.b.id, { tab: op.b.tab, cell: op.b.cell }),
        setPos(op.a.id, null, null),
        setPos(op.b.id, op.a.tab, op.a.cell),
        setPos(op.a.id, op.b.tab, op.b.cell),
      ];
    }
  }
}

function classify(err: unknown): CommitResult {
  const msg = String(err);
  if (msg.includes("item_grants") || msg.includes("character_skills")) return "duplicate";
  if (
    msg.includes("inv_guard") ||
    msg.includes("idx_items_cell") ||
    msg.includes("idx_items_equip") ||
    msg.includes("item_instances.bag_tab") ||
    msg.includes("item_instances.cell") ||
    msg.includes("item_instances.equip_slot")
  )
    return "stale";
  throw err;
}

/**
 * Writes bag changes (and items sent by mail) as one atomic batch. `grantKey` makes it idempotent (loot): the same key
 * again returns "duplicate" without changing anything. "stale" means the bag in D1 no longer matches the plan.
 */
export async function commitBagOps(
  db: D1Database,
  characterId: string,
  ops: readonly BagOp[],
  opts: { grantKey?: string; mail?: readonly MailItem[]; extra?: readonly D1PreparedStatement[]; now?: number } = {},
): Promise<CommitResult> {
  const now = opts.now ?? Date.now();
  const statements: D1PreparedStatement[] = [];
  if (opts.grantKey) statements.push(db.prepare("INSERT INTO item_grants (key, created_at) VALUES (?, ?)").bind(opts.grantKey, now));
  for (const op of ops) statements.push(...opStatements(db, characterId, op, now));
  for (const m of opts.mail ?? []) {
    const itemId = crypto.randomUUID();
    statements.push(
      db
        .prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, durability, max_durability, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)")
        .bind(itemId, characterId, m.type, m.qty, m.dur ?? null, m.max ?? null, now),
      db
        .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, expires_at, created_at) VALUES (?, ?, ?, '', ?, ?, ?)")
        .bind(crypto.randomUUID(), characterId, m.subject, itemId, m.permanent ? null : now + MAIL_ITEM_EXPIRY_MS, now),
    );
  }
  statements.push(...(opts.extra ?? []));
  if (statements.length === 0) return "ok";
  try {
    const results = await db.batch(statements);
    // Logged so `wrangler tail` shows the real D1 write cost of a bag change (docs/PHASE2.md, 2a notes).
    console.log("bag rows_written", opts.grantKey ? "loot" : "command", results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
    return "ok";
  } catch (err) {
    return classify(err);
  }
}

export interface MailEntry {
  id: string;
  subject: string;
  body: string;
  currency: string | null;
  amount: number;
  item: { type: string; qty: number; dur?: number; max?: number; lv?: number; xp?: number } | null;
  /** Epoch ms, or null when it never expires. */
  expiresAt: number | null;
}

/** Unclaimed, unexpired mail, oldest first. */
export async function listMail(db: D1Database, characterId: string, now = Date.now()): Promise<MailEntry[]> {
  const { results } = await db
    .prepare(
      "SELECT m.id, m.subject, m.body, m.currency, m.amount, m.expires_at, i.item_type, i.qty, i.durability, i.max_durability, i.refine_level, i.refine_exp " +
        "FROM mailbox m LEFT JOIN item_instances i ON i.id = m.item_id " +
        "WHERE m.character_id = ? AND m.claimed_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?) ORDER BY m.created_at, m.id",
    )
    .bind(characterId, now)
    .all<{ id: string; subject: string; body: string; currency: string | null; amount: number; expires_at: number | null; item_type: string | null; qty: number | null; durability: number | null; max_durability: number | null; refine_level: number | null; refine_exp: number | null }>();
  return results.map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    currency: r.currency,
    amount: r.amount,
    item: r.item_type && r.qty ? { type: r.item_type, qty: r.qty, ...wearOf(r) } : null,
    expiresAt: r.expires_at,
  }));
}

/**
 * Deletes mail (and its attached item) that expired unclaimed. Scoped to one character when given, otherwise it
 * sweeps everyone; called when a character joins and, rarely, as a global sweep.
 */
export async function deleteExpiredMail(db: D1Database, now: number, characterId?: string): Promise<number> {
  const scope = characterId ? " AND character_id = ?" : "";
  const args = characterId ? [now, characterId] : [now];
  const { results } = await db
    .prepare(`SELECT id, item_id FROM mailbox WHERE claimed_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?${scope}`)
    .bind(...args)
    .all<{ id: string; item_id: string | null }>();
  if (results.length === 0) return 0;
  const mailIds = results.map((r) => r.id);
  const itemIds = results.flatMap((r) => (r.item_id ? [r.item_id] : []));
  const marks = (n: number) => Array(n).fill("?").join(", ");
  const statements = [db.prepare(`DELETE FROM mailbox WHERE id IN (${marks(mailIds.length)}) AND claimed_at IS NULL`).bind(...mailIds)];
  // Only items still unplaced: a claimed item is in a bag by now and must not be touched.
  if (itemIds.length > 0) statements.push(db.prepare(`DELETE FROM item_instances WHERE id IN (${marks(itemIds.length)}) AND cell IS NULL AND equip_slot IS NULL`).bind(...itemIds));
  await db.batch(statements);
  return results.length;
}

export type ClaimItemResult =
  | { status: "claimed"; ops: BagOp[]; type: string; qty: number }
  | { status: "bag_full" }
  | { status: "expired" | "already_claimed" | "not_found" }
  | { status: "stale" };

/**
 * Claims a mail's item into the bag: merged into one stack that has room for all of it, otherwise placed into the first
 * free cell. Atomic: the mail must be unclaimed, unexpired and the item still unplaced, all checked by guard statements.
 * Returns the ops to apply to the room's cache after the commit.
 */
export async function claimMailItem(db: D1Database, characterId: string, mailId: string, bag: BagState, now = Date.now()): Promise<ClaimItemResult> {
  const mail = await db
    .prepare(
      "SELECT m.item_id, m.claimed_at, m.expires_at, i.item_type, i.qty, i.durability, i.max_durability, i.refine_level, i.refine_exp FROM mailbox m LEFT JOIN item_instances i ON i.id = m.item_id " +
        "WHERE m.id = ? AND m.character_id = ?",
    )
    .bind(mailId, characterId)
    .first<{ item_id: string | null; claimed_at: number | null; expires_at: number | null; item_type: string | null; qty: number | null; durability: number | null; max_durability: number | null }>();
  if (!mail) return { status: "not_found" };
  // A claimed mail no longer points at its item, so this is checked first.
  if (mail.claimed_at !== null) return { status: "already_claimed" };
  if (!mail.item_id || !mail.item_type || !mail.qty) return { status: "not_found" };
  if (mail.expires_at !== null && mail.expires_at <= now) return { status: "expired" };

  const limit = stackLimit(mail.item_type);
  const room = limit > 1 ? bag.items.find((i) => i.type === mail.item_type && limit - i.qty >= mail.qty!) : undefined;
  const statements: D1PreparedStatement[] = [
    // The mail must still be claimable and its item still unplaced.
    db
      .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM mailbox WHERE id = ? AND character_id = ? AND claimed_at IS NULL AND (expires_at IS NULL OR expires_at > ?))")
      .bind(mailId, characterId, now),
    guard(db, characterId, mail.item_id, { qty: mail.qty, tab: null, cell: null }),
  ];
  let ops: BagOp[];
  if (room) {
    ops = [{ op: "setqty", id: room.id, from: room.qty, to: room.qty + mail.qty }];
    statements.push(...opStatements(db, characterId, ops[0]!, now));
    // The mail stops pointing at the item first (foreign key), then the now-redundant item row goes.
    statements.push(
      db.prepare("UPDATE mailbox SET claimed_at = ?, item_id = NULL WHERE id = ? AND claimed_at IS NULL").bind(now, mailId),
      db.prepare("DELETE FROM item_instances WHERE id = ? AND owner_character_id = ? AND cell IS NULL").bind(mail.item_id, characterId),
    );
  } else {
    const free = firstFreeCell(bag.items, bag.tabs);
    if (!free) return { status: "bag_full" };
    ops = [{ op: "add", id: mail.item_id, type: mail.item_type, tab: free.tab, cell: free.cell, qty: mail.qty, ...wearOf(mail) }];
    statements.push(
      db.prepare("UPDATE item_instances SET bag_tab = ?, cell = ? WHERE id = ? AND owner_character_id = ? AND cell IS NULL").bind(free.tab, free.cell, mail.item_id, characterId),
    );
    // The mail stops pointing at the item (foreign key): the item is the player's now and may be discarded later.
    statements.push(db.prepare("UPDATE mailbox SET claimed_at = ?, item_id = NULL WHERE id = ? AND claimed_at IS NULL").bind(now, mailId));
  }
  try {
    await db.batch(statements);
  } catch (err) {
    classify(err); // rethrows anything that is not a failed precondition
    return { status: "stale" };
  }
  // A placed item keeps its id; one merged into a stack is gone. The ops describe the change to the room's cached bag.
  return { status: "claimed", ops, type: mail.item_type, qty: mail.qty };
}

/**
 * Deletes loot keys older than a day; they only matter while a retry could still arrive. Keys that stand for a one-time grant
 * (`path_item:...`, the hướng tu items) are kept for good, or the grant could be claimed again every day.
 */
export function pruneGrants(db: D1Database, now: number): Promise<unknown> {
  return db.prepare("DELETE FROM item_grants WHERE created_at < ? AND key NOT LIKE 'path_item:%'").bind(now - 86_400_000).run();
}

/** Adds bag tabs (admin/unlock mechanism). Returns the new tab count, or null at the cap or for an unknown character. */
export async function expandBag(db: D1Database, characterId: string, maxTabs: number, by = 1): Promise<number | null> {
  const row = await db
    .prepare("UPDATE characters SET bag_tabs = bag_tabs + ? WHERE id = ? AND bag_tabs + ? <= ? RETURNING bag_tabs")
    .bind(by, characterId, by, maxTabs)
    .first<{ bag_tabs: number }>();
  return row?.bag_tabs ?? null;
}

/** What changed between two bags, for a delta message: items that are new or differ, and ids that disappeared. */
export function diffBag(before: readonly BagItem[], after: readonly BagItem[]): { items: BagItem[]; removed: string[] } {
  const was = new Map(before.map((i) => [i.id, i]));
  const items = after.filter((i) => {
    const w = was.get(i.id);
    return !w || w.type !== i.type || w.tab !== i.tab || w.cell !== i.cell || w.qty !== i.qty || w.dur !== i.dur;
  });
  const now = new Set(after.map((i) => i.id));
  return { items, removed: before.filter((i) => !now.has(i.id)).map((i) => i.id) };
}

/** Mail as sent to clients: item mails only (currency mail has no way to be claimed yet), with a relative expiry. */
export function mailViews(entries: readonly MailEntry[], now = Date.now()): MailView[] {
  return entries
    .filter((m) => m.item !== null)
    .map((m) => ({ id: m.id, subject: m.subject, item: m.item, expiresInMs: m.expiresAt === null ? null : Math.max(0, m.expiresAt - now) }));
}

/**
 * The statements that add one bag tab, to run in the same batch as the payment. A statement that changes zero rows does
 * not roll a batch back, so the check is a guard that fails loudly (inv_guard.ok is NOT NULL) when the character no longer
 * has exactly `expectedTabs` tabs; the payment then rolls back with it.
 */
export function addBagTabStatements(db: D1Database, characterId: string, expectedTabs: number): D1PreparedStatement[] {
  return [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND bag_tabs = ?)").bind(characterId, expectedTabs),
    db.prepare("UPDATE characters SET bag_tabs = bag_tabs + 1 WHERE id = ? AND bag_tabs = ?").bind(characterId, expectedTabs),
  ];
}

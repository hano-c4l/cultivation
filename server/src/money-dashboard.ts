import { CURRENCY_GROUPS, currencyGroupLabel } from "@game/shared";

/**
 * The money overview of the Admin (docs/PHASE5.md, 5f; PLAN section 4 "dashboard"): the supply of each currency, where it comes from and where it goes (the totals by reason group),
 * the biggest holders, the supply day by day, and the Tiên Ngọc the admins put into the game (there is no payment gateway yet, so "đơn nạp" are these manual credits).
 *
 * The history of the supply needs a record of past days, and the game has no scheduled job (an alarm costs a request and wakes a room), so the first look at the dashboard on a Việt Nam day
 * writes that day's row (`currency_snapshots`, INSERT OR IGNORE): the history has a row for every day somebody looked.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const TOPUP_DAYS = 30;
export const TOPUP_ROWS = 100;
export const TOP_HOLDERS = 20;
export const HISTORY_DAYS = 14;

export const vnDayOf = (now: number): number => Math.floor((now + 7 * HOUR_MS) / DAY_MS);

type MoneyId = "tien_ngoc" | "linh_thach" | "cong_hien";
const TOTALS_TABLE: Record<"tien_ngoc" | "linh_thach", string> = { tien_ngoc: "tien_ngoc_totals", linh_thach: "linh_thach_totals" };

export interface GroupFlow {
  group: string;
  labelVi: string;
  totalIn: number;
  totalOut: number;
}

export interface CurrencyOverview {
  id: MoneyId;
  /** Everything held now (Cống Hiến: the cống hiến of the members of sects). */
  supply: number;
  holders: number;
  totalIn: number;
  totalOut: number;
  groups: GroupFlow[];
  top: Array<{ id: string; name: string; balance: number }>;
  history: Array<{ day: number; supply: number; holders: number; totalIn: number; totalOut: number }>;
}

export interface TopupView {
  from: number;
  count: number;
  total: number;
  byDay: Array<{ day: number; total: number; count: number }>;
  rows: Array<{ at: number; characterId: string; name: string | null; amount: number; reason: string; actor: string }>;
}

export interface MoneyOverview {
  at: number;
  day: number;
  currencies: CurrencyOverview[];
  topups: TopupView;
}

async function flowsOf(db: D1Database, currency: "tien_ngoc" | "linh_thach"): Promise<GroupFlow[]> {
  const table = TOTALS_TABLE[currency]; // from the fixed table above, never from input
  const rows = (await db.prepare(`SELECT grp, SUM(total_in) AS total_in, SUM(total_out) AS total_out FROM ${table} GROUP BY grp`).all<{ grp: string; total_in: number; total_out: number }>()).results;
  const order = new Map<string, number>(CURRENCY_GROUPS.map((g, i) => [g.id, i]));
  return rows
    .map((r) => ({ group: r.grp, labelVi: currencyGroupLabel(r.grp), totalIn: r.total_in ?? 0, totalOut: r.total_out ?? 0 }))
    .sort((a, b) => (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99));
}

async function overviewOf(db: D1Database, currency: MoneyId, day: number): Promise<CurrencyOverview> {
  let supply: number;
  let holders: number;
  let groups: GroupFlow[] = [];
  let top: CurrencyOverview["top"] = [];
  if (currency === "cong_hien") {
    // Cống Hiến lives in the sect members (5c-2); the old wallet row is zero and no longer moves.
    const r = await db.prepare("SELECT COALESCE(SUM(contribution), 0) AS s, COUNT(*) AS n FROM sect_members WHERE contribution > 0").first<{ s: number; n: number }>();
    supply = r?.s ?? 0;
    holders = r?.n ?? 0;
    top = (
      await db
        .prepare("SELECT m.character_id AS id, c.name AS name, m.contribution AS balance FROM sect_members m JOIN characters c ON c.id = m.character_id WHERE m.contribution > 0 ORDER BY m.contribution DESC LIMIT ?")
        .bind(TOP_HOLDERS)
        .all<{ id: string; name: string; balance: number }>()
    ).results;
  } else {
    const r = await db.prepare("SELECT COALESCE(SUM(balance), 0) AS s, COUNT(*) AS n FROM currency_balances WHERE currency = ? AND balance > 0").bind(currency).first<{ s: number; n: number }>();
    supply = r?.s ?? 0;
    holders = r?.n ?? 0;
    groups = await flowsOf(db, currency);
    top = (
      await db
        .prepare("SELECT b.character_id AS id, c.name AS name, b.balance AS balance FROM currency_balances b JOIN characters c ON c.id = b.character_id WHERE b.currency = ? AND b.balance > 0 ORDER BY b.balance DESC LIMIT ?")
        .bind(currency, TOP_HOLDERS)
        .all<{ id: string; name: string; balance: number }>()
    ).results;
  }
  const totalIn = groups.reduce((n, g) => n + g.totalIn, 0);
  const totalOut = groups.reduce((n, g) => n + g.totalOut, 0);
  await db
    .prepare("INSERT OR IGNORE INTO currency_snapshots (day, currency, supply, holders, total_in, total_out) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(day, currency, supply, holders, totalIn, totalOut)
    .run();
  const history = (
    await db
      .prepare("SELECT day, supply, holders, total_in AS totalIn, total_out AS totalOut FROM currency_snapshots WHERE currency = ? ORDER BY day DESC LIMIT ?")
      .bind(currency, HISTORY_DAYS)
      .all<CurrencyOverview["history"][number]>()
  ).results;
  return { id: currency, supply, holders, totalIn, totalOut, groups, top, history };
}

/** The Tiên Ngọc the admins gave out in the last `TOPUP_DAYS` days: a credit by an admin's hand or by an admin gift (the reason kind starts with "admin"). */
export async function topups(db: D1Database, now: number): Promise<TopupView> {
  const from = now - TOPUP_DAYS * DAY_MS;
  const where = "delta > 0 AND created_at >= ? AND (actor <> 'system' OR reason LIKE 'admin%')";
  const sum = await db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total, COUNT(*) AS n FROM tien_ngoc_ledger WHERE ${where}`).bind(from).first<{ total: number; n: number }>();
  const byDay = (
    await db
      .prepare(`SELECT (created_at + ?) / ? AS day, SUM(delta) AS total, COUNT(*) AS count FROM tien_ngoc_ledger WHERE ${where} GROUP BY day ORDER BY day DESC`)
      .bind(7 * HOUR_MS, DAY_MS, from)
      .all<{ day: number; total: number; count: number }>()
  ).results;
  const rows = (
    await db
      .prepare(`SELECT l.created_at AS at, l.character_id AS characterId, c.name AS name, l.delta AS amount, l.reason AS reason, l.actor AS actor FROM tien_ngoc_ledger l LEFT JOIN characters c ON c.id = l.character_id WHERE ${where.replace(/\b(delta|created_at|actor|reason)\b/g, "l.$1")} ORDER BY l.id DESC LIMIT ?`)
      .bind(from, TOPUP_ROWS)
      .all<TopupView["rows"][number]>()
  ).results;
  return { from, count: sum?.n ?? 0, total: sum?.total ?? 0, byDay, rows };
}

export async function moneyOverview(db: D1Database, now = Date.now()): Promise<MoneyOverview> {
  const day = vnDayOf(now);
  const currencies: CurrencyOverview[] = [];
  for (const id of ["tien_ngoc", "linh_thach", "cong_hien"] as const) currencies.push(await overviewOf(db, id, day));
  return { at: now, day, currencies, topups: await topups(db, now) };
}

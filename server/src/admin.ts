import { MAX_BAG_TABS, MAX_LEDGER_AMOUNT, isCurrency } from "@game/shared";
import { getSession } from "./auth";
import { applyCurrencyDelta, getWallet } from "./economy";
import { expandBag } from "./inventory";
import type { Env } from "./env";
import { errorResponse, json, readJson } from "./http";

/** Returns the admin's account id, or the error response to send (401 anonymous, 403 not an admin). */
async function requireAdmin(request: Request, env: Env): Promise<string | Response> {
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  if (session.role !== "admin") return errorResponse("forbidden", 403);
  return session.accountId;
}

/**
 * Manual currency adjustment. The caller must send an idempotency key (the admin page makes one per form
 * render), so a double click or a retried request cannot grant twice. Negative amounts correct mistakes and
 * cannot take a balance below zero.
 */
export async function adminGrant(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const characterId = typeof body?.characterId === "string" ? body.characterId : "";
  const amount = body?.amount;
  const key = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!characterId || characterId.length > 64) return errorResponse("invalid_character", 400);
  if (!isCurrency(body?.currency)) return errorResponse("invalid_currency", 400);
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_LEDGER_AMOUNT) {
    return errorResponse("invalid_amount", 400);
  }
  if (key.length < 8 || key.length > 80) return errorResponse("invalid_key", 400);

  const target = await env.DB.prepare("SELECT id FROM characters WHERE id = ?").bind(characterId).first<{ id: string }>();
  if (!target) return errorResponse("character_not_found", 404);

  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 80) : "";
  const result = await applyCurrencyDelta(env.DB, {
    characterId: target.id,
    currency: body.currency,
    delta: amount,
    reason: reason ? `admin_grant:${reason}` : "admin_grant",
    actor: admin,
    idempotencyKey: `admin:${key}`,
  });
  if (result.status === "duplicate") return errorResponse("duplicate_request", 409);
  if (result.status === "insufficient") return errorResponse("insufficient_balance", 409);
  return json({ ok: true, balance: result.balance });
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the queries below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

/**
 * Finds accounts by email or by the name of any of their characters (one account may own several characters later),
 * so the admin first picks an account and a character and only then adjusts money.
 */
export async function adminLookup(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 64) return errorResponse("query_too_short", 400);
  const pattern = likePattern(q);
  const { results: accounts } = await env.DB.prepare(
    "SELECT id, email, role FROM accounts WHERE id IN (" +
      "SELECT id FROM accounts WHERE email LIKE ?1 ESCAPE '!' UNION SELECT account_id FROM characters WHERE name LIKE ?1 ESCAPE '!') " +
      "ORDER BY email LIMIT 20",
  )
    .bind(pattern)
    .all<{ id: string; email: string; role: string }>();
  if (accounts.length === 0) return json({ accounts: [] });
  const { results: chars } = await env.DB.prepare(
    `SELECT id, account_id, name, realm, stage FROM characters WHERE account_id IN (${accounts.map(() => "?").join(", ")}) ORDER BY created_at`,
  )
    .bind(...accounts.map((a) => a.id))
    .all<{ id: string; account_id: string; name: string; realm: number; stage: number }>();
  return json({
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      characters: chars.filter((c) => c.account_id === a.id).map((c) => ({ id: c.id, name: c.name, realm: c.realm, stage: c.stage })),
    })),
  });
}

/** One character's balances and its latest ledger rows (newest first), with the acting admin's email resolved. */
export async function adminCharacter(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const id = url.searchParams.get("id") ?? "";
  const character = await env.DB.prepare("SELECT id, name, bag_tabs AS bagTabs FROM characters WHERE id = ?").bind(id).first<{ id: string; name: string; bagTabs: number }>();
  if (!character) return errorResponse("character_not_found", 404);
  const wallet = await getWallet(env.DB, id);
  const { results: ledger } = await env.DB.prepare(
    "SELECT l.id, l.currency, l.delta, l.reason, l.actor, a.email AS actor_email, l.created_at " +
      "FROM currency_ledger l LEFT JOIN accounts a ON a.id = l.actor WHERE l.character_id = ? ORDER BY l.id DESC LIMIT 50",
  )
    .bind(id)
    .all();
  return json({ character, wallet, ledger });
}

/**
 * Adds bag tabs to a character (the unlock mechanism; what players pay for it is not decided yet). The character's room
 * keeps its own copy of the bag, so the new tab shows up the next time the character enters a room.
 */
export async function adminBagTabs(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const characterId = typeof body?.characterId === "string" ? body.characterId : "";
  const by = body?.by === undefined ? 1 : body.by;
  if (!characterId || characterId.length > 64) return errorResponse("invalid_character", 400);
  if (typeof by !== "number" || !Number.isInteger(by) || by < 1 || by > MAX_BAG_TABS) return errorResponse("invalid_amount", 400);
  const tabs = await expandBag(env.DB, characterId, MAX_BAG_TABS, by);
  if (tabs === null) return errorResponse("cannot_expand", 409);
  console.log("bag expanded", admin, characterId, tabs);
  return json({ ok: true, bagTabs: tabs });
}

/** Total supply per currency (sum of all balances), the start of the PLAN section 4 monitoring dashboard. */
export async function adminSupply(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const { results } = await env.DB.prepare(
    "SELECT currency, SUM(balance) AS total, COUNT(*) AS holders FROM currency_balances GROUP BY currency",
  ).all<{ currency: string; total: number; holders: number }>();
  return json({ supply: results });
}

import { MAX_LEDGER_AMOUNT, isCurrency } from "@game/shared";
import { getSession } from "./auth";
import { applyCurrencyDelta } from "./economy";
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
  const name = typeof body?.characterName === "string" ? body.characterName.trim() : "";
  const amount = body?.amount;
  const key = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!name || name.length > 32) return errorResponse("invalid_character", 400);
  if (!isCurrency(body?.currency)) return errorResponse("invalid_currency", 400);
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_LEDGER_AMOUNT) {
    return errorResponse("invalid_amount", 400);
  }
  if (key.length < 8 || key.length > 80) return errorResponse("invalid_key", 400);

  const target = await env.DB.prepare("SELECT id FROM characters WHERE name = ?").bind(name).first<{ id: string }>();
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

/** Total supply per currency (sum of all balances), the start of the PLAN section 4 monitoring dashboard. */
export async function adminSupply(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const { results } = await env.DB.prepare(
    "SELECT currency, SUM(balance) AS total, COUNT(*) AS holders FROM currency_balances GROUP BY currency",
  ).all<{ currency: string; total: number; holders: number }>();
  return json({ supply: results });
}

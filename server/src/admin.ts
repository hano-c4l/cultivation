import { CONSTITUTION_STATS, ELEMENT_TAGS, MAX_BAG_TABS, MAX_CONSTITUTION_TIERS, MAX_LEDGER_AMOUNT, WEAPON_TAGS, isCurrency, validSettingValue } from "@game/shared";
import { getSession, type AuthedSession } from "./auth";
import { checkAll } from "./economy-check";
import { getAuditEntry, listAudit, parseAuditQuery, recordAudit } from "./admin-audit";
import { applyCurrencyDelta, getWallet } from "./economy";
import { expandBag } from "./inventory";
import type { Env } from "./env";
import { errorResponse, json, readJson } from "./http";
import { allSettings, setSetting } from "./settings";
import { loadConstitutionCatalog, saveConstitutionCatalog } from "./constitution-catalog";

/** Returns the admin's session, or the error response to send (401 anonymous, 403 not an admin). */
async function requireAdminSession(request: Request, env: Env): Promise<AuthedSession | Response> {
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  if (session.role !== "admin") return errorResponse("forbidden", 403);
  return session;
}

/** Returns the admin's account id, or the error response to send (401 anonymous, 403 not an admin). */
async function requireAdmin(request: Request, env: Env): Promise<string | Response> {
  const session = await requireAdminSession(request, env);
  return session instanceof Response ? session : session.accountId;
}

/** Writes one audit row for an action by the session's admin (see admin-audit.ts). */
function audit(env: Env, session: AuthedSession, entry: { action: string; targetType: string; targetId?: string; summary?: string; before?: unknown; after?: unknown }): Promise<number | null> {
  return recordAudit(env.DB, { adminId: session.accountId, adminEmail: session.email, ...entry });
}

/** Who the caller is, for the admin app's login page and menu: 200 for an admin, 401 without a session, 403 for a player. */
export async function adminMe(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json({ account: { id: session.accountId, email: session.email, role: session.role } });
}

/** One page of the admin change log (GET, with q, sort, dir, page, size). */
export async function adminAudit(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const query = parseAuditQuery(url.searchParams);
  return json({ ...(await listAudit(env.DB, query)), page: query.page, size: query.size });
}

/** One row of the admin change log with its before and after values (GET ?id=). */
export async function adminAuditEntry(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return errorResponse("invalid_id", 400);
  const entry = await getAuditEntry(env.DB, id);
  return entry ? json({ entry }) : errorResponse("not_found", 404);
}

/**
 * Manual currency adjustment. The caller must send an idempotency key (the admin page makes one per form
 * render), so a double click or a retried request cannot grant twice. Negative amounts correct mistakes and
 * cannot take a balance below zero.
 */
export async function adminGrant(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const admin = session.accountId;
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
    keyTtlMs: 7 * 24 * 3600 * 1000,
  });
  if (result.status === "duplicate") return errorResponse("duplicate_request", 409);
  if (result.status === "insufficient") return errorResponse("insufficient_balance", 409);
  await audit(env, session, { action: "currency_grant", targetType: "character", targetId: target.id, summary: `${body.currency} ${amount > 0 ? "+" : ""}${amount}${reason ? ` (${reason})` : ""}`, after: { currency: body.currency, delta: amount, balance: result.balance } });
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

/**
 * One character's balances, the totals per currency and reason group, and the detailed history that exists (every Tiên Ngọc change, the big
 * Linh Thạch changes; newest first, 50 each) with the acting admin's email resolved.
 */
export async function adminCharacter(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const id = url.searchParams.get("id") ?? "";
  const character = await env.DB.prepare("SELECT id, name, bag_tabs AS bagTabs FROM characters WHERE id = ?").bind(id).first<{ id: string; name: string; bagTabs: number }>();
  if (!character) return errorResponse("character_not_found", 404);
  const wallet = await getWallet(env.DB, id);
  const totals: Record<string, unknown[]> = {};
  for (const [currency, table] of [["tien_ngoc", "tien_ngoc_totals"], ["linh_thach", "linh_thach_totals"], ["cong_hien", "cong_hien_totals"]] as const) {
    const { results } = await env.DB.prepare(`SELECT grp AS "group", total_in AS totalIn, total_out AS totalOut, entries, updated_at AS updatedAt FROM ${table} WHERE character_id = ? ORDER BY grp`).bind(id).all();
    totals[currency] = results;
  }
  const history: Record<string, unknown[]> = {};
  for (const [currency, table] of [["tien_ngoc", "tien_ngoc_ledger"], ["linh_thach", "linh_thach_ledger"]] as const) {
    const { results } = await env.DB.prepare(
      `SELECT l.id, l.delta, l.reason, l.actor, a.email AS actor_email, l.created_at FROM ${table} l LEFT JOIN accounts a ON a.id = l.actor WHERE l.character_id = ? ORDER BY l.id DESC LIMIT 50`,
    )
      .bind(id)
      .all();
    history[currency] = results;
  }
  return json({ character, wallet, totals, history });
}

/** The quick check of the currency totals against the balances (see economy-check.ts): per currency the characters whose two numbers differ. */
export async function adminEconomyCheck(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  return json({ checks: await checkAll(env.DB) });
}

/**
 * Adds bag tabs to a character (the unlock mechanism; what players pay for it is not decided yet). The character's room
 * keeps its own copy of the bag, so the new tab shows up the next time the character enters a room.
 */
export async function adminBagTabs(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const admin = session.accountId;
  const body = await readJson(request);
  const characterId = typeof body?.characterId === "string" ? body.characterId : "";
  const by = body?.by === undefined ? 1 : body.by;
  if (!characterId || characterId.length > 64) return errorResponse("invalid_character", 400);
  if (typeof by !== "number" || !Number.isInteger(by) || by < 1 || by > MAX_BAG_TABS) return errorResponse("invalid_amount", 400);
  const tabs = await expandBag(env.DB, characterId, MAX_BAG_TABS, by);
  if (tabs === null) return errorResponse("cannot_expand", 409);
  console.log("bag expanded", admin, characterId, tabs);
  await audit(env, session, { action: "bag_tabs_add", targetType: "character", targetId: characterId, summary: `+${by} bag tab(s), now ${tabs}`, after: { bagTabs: tabs } });
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

/** The adjustable game settings with their effective values (GET), or a change of one of them (POST {key, value}). */
export async function adminSettings(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const admin = session.accountId;
  if (request.method === "GET") return json({ settings: await allSettings(env.DB) });
  const body = await readJson(request);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!validSettingValue(key, body?.value)) return errorResponse("invalid_setting", 400);
  const before = (await allSettings(env.DB)).find((s) => s.key === key)?.value ?? null;
  await setSetting(env.DB, key, body.value as number, admin);
  console.log("setting changed", admin, key, body.value);
  await audit(env, session, { action: "setting_change", targetType: "setting", targetId: key, summary: `${key} = ${String(body.value)}`, before, after: body.value });
  return json({ ok: true, settings: await allSettings(env.DB) });
}

/**
 * The constitution catalogue for the admin screen (GET: every constitution, enabled or not, with its version) and the save (POST
 * `{expectedVersion, constitutions}`: see saveConstitutionCatalog). Admin only; the server validates everything again.
 */
export async function adminConstitutions(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const admin = session.accountId;
  if (request.method === "GET") return json({ ...(await loadConstitutionCatalog(env.DB)), vocabulary: { stats: CONSTITUTION_STATS, elements: ELEMENT_TAGS, weapons: WEAPON_TAGS, maxTiers: MAX_CONSTITUTION_TIERS } });
  const body = await readJson(request, 512 * 1024); // a whole catalogue is much bigger than the usual request
  if (typeof body?.expectedVersion !== "number" || !Array.isArray(body?.constitutions)) return errorResponse("invalid_body", 400);
  const result = await saveConstitutionCatalog(env.DB, body.expectedVersion, { version: body.expectedVersion, constitutions: body.constitutions as never });
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, result.error === "version_conflict" ? 409 : 400);
  console.log("constitution catalogue saved", admin, "version", result.version);
  await audit(env, session, { action: "constitution_catalogue_save", targetType: "constitution_catalogue", summary: `saved version ${result.version}`, after: { version: result.version, constitutions: (body.constitutions as unknown[]).length } });
  return json({ ok: true, ...(await loadConstitutionCatalog(env.DB)), vocabulary: { stats: CONSTITUTION_STATS, elements: ELEMENT_TAGS, weapons: WEAPON_TAGS, maxTiers: MAX_CONSTITUTION_TIERS } });
}

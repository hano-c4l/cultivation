import { REALMS, CONSTITUTION_STATS, CURRENCY_GROUPS, ELEMENT_TAGS, GIFT_BODY_MAX, type TuningPage, GIFT_MAX_ITEM_KINDS, GIFT_MAX_RECIPIENTS, GIFT_SUBJECT_MAX, giftableItems, MAX_BAG_TABS, MAX_CONSTITUTION_TIERS, MAX_LEDGER_AMOUNT, WEAPON_TAGS, isCurrency, validSettingValue } from "@game/shared";
import { getSession, hashPassword, type AuthedSession } from "./auth";
import { kickCharacter } from "./accounts-admin";
import { PBKDF2_ITERATIONS, toBase64 } from "./password-hasher";
import { AUDIT_SCREEN, CURRENCY_LABEL_VI, confirmEntry, getDetail, handleEntry, listAudit, listTienNgocHistory, parseAuditList, parseCurrency, parseHistory, parseSearch, runAudit, searchTotals } from "./currency-admin";
import { listAdminLog, logAdmin, parseLogQuery } from "./admin-log";
import { applyCurrencyDelta, getWallet } from "./economy";
import { expandBag } from "./inventory";
import type { Env } from "./env";
import { errorResponse, json, readJson } from "./http";
import { allSettings, setSetting } from "./settings";
import { loadConstitutionCatalog } from "./constitution-catalog";
import { constitutionHolders, saveConstitutionAdmin } from "./constitution-admin";
import { listLoot, listSpecies, saveLoot, saveSpecies } from "./monsters-admin";
import { listSkills, saveSkillOverride } from "./skills-admin";
import { deleteItem, listItems, saveItem } from "./items-admin";
import { deleteQuest, listQuests, questMeta, saveQuest } from "./quests-admin";
import { deleteNpc, listNpcs, npcMeta, saveNpc } from "./npcs-admin";
import { getMerchantAdmin, merchantMeta, saveMerchant } from "./merchants-admin";
import { getAlchemyAdmin, saveAlchemy } from "./alchemy-admin";
import { getEnhanceView, getMasterView, getSetsView, saveEnhance, saveMaster, saveSets } from "./gear-admin";
import { addItem, addSkill, adjustMoney, editStats, endReview, getCharacterView, removeItem, removeSkill, startReview, type StatsInput } from "./characters-admin";
import { banAccount, getAccountDetail, listAccounts, parseAccountQuery, setTempPassword, unbanAccount } from "./accounts-admin";
import { getMapAdmin, listMaps, resetMap, saveMap } from "./maps-admin";
import { countCharacters, listGiftBatches, resolveRecipients, sendGift, type GiftInput } from "./gifts";
import { TUNING_LOG_SCREEN, listTuningGroups, saveTuningGroup } from "./tuning-admin";

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

/** Writes one admin log row for an action by the session's admin (see admin-log.ts): the screen and a sentence saying what was done. */
function log(env: Env, session: AuthedSession, screen: string, content: string): Promise<void> {
  return logAdmin(env.DB, { adminEmail: session.email, screen, content });
}

/** Who the caller is, for the admin app's login page and menu: 200 for an admin, 401 without a session, 403 for a player. */
export async function adminMe(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json({ account: { id: session.accountId, email: session.email, role: session.role } });
}

/** One page of the admin log, newest first (GET: q, page, size). */
export async function adminLog(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const query = parseLogQuery(url.searchParams);
  return json({ ...(await listAdminLog(env.DB, query)), page: query.page, size: query.size });
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

  const target = await env.DB.prepare("SELECT id, name FROM characters WHERE id = ?").bind(characterId).first<{ id: string; name: string }>();
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
  await log(env, session, AUDIT_SCREEN, `${amount > 0 ? "Cộng" : "Trừ"} ${Math.abs(amount).toLocaleString("vi-VN")} ${CURRENCY_LABEL_VI[body.currency]} ${amount > 0 ? "cho" : "của"} nhân vật ${target.name}${reason ? ` (${reason})` : ""}`);
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
  await log(env, session, "Tài khoản", `Thêm ${by} tab túi đồ cho nhân vật ${characterId} (nay có ${tabs} tab)`);
  return json({ ok: true, bagTabs: tabs });
}

// ---- currency management (docs/PHASE3.md, 3b) ----

/** What the currency screens need to draw their forms: the currencies (in the order the screens show them) and the fixed groups with their labels. */
export async function adminCurrencyMeta(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  return json({ currencies: (["tien_ngoc", "linh_thach", "cong_hien"] as const).map((id) => ({ id, labelVi: CURRENCY_LABEL_VI[id] })), groups: CURRENCY_GROUPS });
}

/** Search: the totals per character and group (GET: currency, account, character, group, sort, dir, page, size). */
export async function adminCurrencySearch(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const q = parseSearch(url.searchParams);
  return json({ currency: q.currency, ...(await searchTotals(env.DB, q)), page: q.page, size: q.size });
}

/** The detail of one character and currency (GET: currency, character). */
export async function adminCurrencyDetail(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const detail = await getDetail(env.DB, parseCurrency(url.searchParams.get("currency")), url.searchParams.get("character") ?? "");
  return detail ? json({ detail }) : errorResponse("not_found", 404);
}

/** The detailed Tiên Ngọc history of one character in a date range (GET: character, from, to, page, size); the last 30 days when no range is given. */
export async function adminCurrencyHistory(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const q = parseHistory(url.searchParams);
  if (!q.characterId) return errorResponse("invalid_character", 400);
  return json({ ...(await listTienNgocHistory(env.DB, q)), from: q.from, to: q.to, page: q.page, size: q.size });
}

/** The audit table of a currency with the time of the last audit (GET: currency, sort, dir, page, size). */
export async function adminCurrencyAudit(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const q = parseAuditList(url.searchParams);
  return json({ ...(await listAudit(env.DB, q)), page: q.page, size: q.size });
}

/** Runs the audit of a currency (POST {currency}); refused while some row is still invalid. */
export async function adminCurrencyAuditRun(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request);
  const currency = parseCurrency(typeof body?.currency === "string" ? body.currency : null);
  const result = await runAudit(env.DB, currency, session.email);
  if (!result.ok) return json({ error: result.error, invalid: result.invalid }, 409);
  await log(env, session, AUDIT_SCREEN, `Kiểm duyệt ${CURRENCY_LABEL_VI[currency]}: đã kiểm ${result.checked} nhân vật, ${result.invalid} không hợp lệ`);
  return json({ ok: true, checked: result.checked, invalid: result.invalid, at: result.at });
}

/** The numbers the admin saw on the screen (`balance`, `historyAmount` in the body), when sent: the action is refused if they moved. */
function seenOf(body: Record<string, unknown> | null): { balance: number; historyAmount: number } | undefined {
  const balance = body?.balance;
  const historyAmount = body?.historyAmount;
  return typeof balance === "number" && Number.isInteger(balance) && typeof historyAmount === "number" && Number.isInteger(historyAmount) ? { balance, historyAmount } : undefined;
}

/** "Xác nhận" (POST {currency, character, balance, historyAmount}): accepts the difference, see confirmEntry. */
export async function adminCurrencyConfirm(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request);
  const currency = parseCurrency(typeof body?.currency === "string" ? body.currency : null);
  const characterId = typeof body?.character === "string" ? body.character.slice(0, 64) : "";
  const result = await confirmEntry(env.DB, currency, characterId, { id: session.accountId, email: session.email }, Date.now(), seenOf(body));
  return result.ok ? json({ ok: true, difference: result.difference }) : json({ error: result.error, difference: result.difference ?? null }, result.error === "not_found" ? 404 : 409);
}

/** "Xử lý" (POST {currency, character}): marks the row handled when the numbers agree or the account is banned for good, see handleEntry. */
export async function adminCurrencyHandle(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request);
  const currency = parseCurrency(typeof body?.currency === "string" ? body.currency : null);
  const characterId = typeof body?.character === "string" ? body.character.slice(0, 64) : "";
  const result = await handleEntry(env.DB, currency, characterId, { id: session.accountId, email: session.email }, Date.now(), seenOf(body));
  return result.ok ? json({ ok: true, difference: result.difference }) : json({ error: result.error, difference: result.difference ?? null }, result.error === "not_found" ? 404 : 409);
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
  const before = (await allSettings(env.DB)).find((s) => s.key === key);
  if (before?.value === body.value) return errorResponse("unchanged", 400);
  await setSetting(env.DB, key, body.value as number, admin);
  console.log("setting changed", admin, key, body.value);
  await log(env, session, before?.page === "talents" ? "Thiên phú" : TUNING_LOG_SCREEN, `Đổi cài đặt game "${before?.labelVi ?? key}": ${String(before?.value ?? null)} → ${String(body.value)}`);
  return json({ ok: true, settings: await allSettings(env.DB) });
}

/**
 * The `game_tuning` groups of the "Chỉ số khác" screen (GET: each group with its fields, value, default and version token) and the save of
 * one group (POST `{group, updatedAt, value}`, see saveTuningGroup). 409 when someone saved the group since the admin loaded it.
 */
export async function adminTuning(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const pageOf = (raw: unknown): TuningPage => (raw === "realms" || raw === "potential" || raw === "talents" || raw === "monsters" || raw === "boss" || raw === "npcs" ? raw : "misc");
  if (request.method === "GET") return json({ groups: await listTuningGroups(env.DB, pageOf(new URL(request.url).searchParams.get("page"))) });
  const body = await readJson(request);
  if (typeof body?.group !== "string" || typeof body?.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = await saveTuningGroup(env.DB, body.group, body.value, body.updatedAt, session.email);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, result.error === "version_conflict" ? 409 : result.error === "unknown_group" ? 404 : 400);
  console.log("tuning group saved", session.accountId, body.group);
  return json({ ok: true, changes: result.changes, groups: await listTuningGroups(env.DB, pageOf(body.page)) });
}

/**
 * The constitution catalogue for the admin screen (GET: every constitution, enabled or not, with its version) and the save (POST
 * `{expectedVersion, constitutions}`: see saveConstitutionCatalog). Admin only; the server validates everything again.
 */
export async function adminConstitutions(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const vocabulary = { stats: CONSTITUTION_STATS, elements: ELEMENT_TAGS, weapons: WEAPON_TAGS, maxTiers: MAX_CONSTITUTION_TIERS };
  if (request.method === "GET") return json({ ...(await loadConstitutionCatalog(env.DB)), vocabulary, holders: await constitutionHolders(env.DB) });
  const body = await readJson(request, 512 * 1024); // a whole catalogue is much bigger than the usual request
  if (typeof body?.expectedVersion !== "number" || !Array.isArray(body?.constitutions)) return errorResponse("invalid_body", 400);
  const result = await saveConstitutionAdmin(env.DB, session.email, body.expectedVersion, { version: body.expectedVersion, constitutions: body.constitutions as never });
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, result.error === "version_conflict" ? 409 : 400);
  console.log("constitution catalogue saved", session.accountId, "version", result.version);
  return json({ ok: true, warnings: result.warnings ?? [], ...(await loadConstitutionCatalog(env.DB)), vocabulary, holders: await constitutionHolders(env.DB) });
}

/** What the screen "Gửi quà" needs to start: the items that can be attached, the limits and how many characters "the whole server" is right now. */
export async function adminGiftMeta(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json({
    items: giftableItems(),
    characters: await countCharacters(env.DB),
    limits: { subject: GIFT_SUBJECT_MAX, body: GIFT_BODY_MAX, recipients: GIFT_MAX_RECIPIENTS, itemKinds: GIFT_MAX_ITEM_KINDS },
  });
}

/** Names pasted on the screen to character ids (POST `{names}`): the ones found and the names that matched nobody. */
export async function adminGiftResolve(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 64 * 1024);
  if (!Array.isArray(body?.names) || body.names.some((n: unknown) => typeof n !== "string")) return errorResponse("invalid_body", 400);
  return json(await resolveRecipients(env.DB, body.names as string[]));
}

/** The history of sends (GET: page, size). */
export async function adminGiftHistory(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const page = Math.max(1, Math.min(100_000, Math.trunc(Number(url.searchParams.get("page") ?? "1")) || 1));
  const size = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get("size") ?? "20")) || 20));
  return json({ ...(await listGiftBatches(env.DB, page, size)), page, size });
}

/**
 * Sends a gift (POST `{batchId, subject, body, audience: {kind: "list", characterIds} | {kind: "all"}, gift: {linh_thach, cong_hien, tien_ngoc, items}, expiresInDays}`).
 * `batchId` is made once by the form, so a repeated request answers with the first send instead of sending again. The players online are told best-effort.
 */
export async function adminGiftSend(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 64 * 1024);
  const aud = body?.audience as { kind?: unknown; characterIds?: unknown } | undefined;
  const gift = body?.gift as GiftInput["gift"] | undefined;
  if (typeof body?.batchId !== "string" || typeof body?.subject !== "string" || typeof body?.body !== "string" || !aud || !gift || typeof gift !== "object") return errorResponse("invalid_body", 400);
  const audience: GiftInput["audience"] | null =
    aud.kind === "all" ? { kind: "all" } : aud.kind === "list" && Array.isArray(aud.characterIds) ? { kind: "list", characterIds: aud.characterIds as string[] } : null;
  if (!audience) return errorResponse("invalid_audience", 400);
  const expires = body.expiresInDays === null || body.expiresInDays === undefined ? null : Number(body.expiresInDays);
  const result = await sendGift(env.DB, session.email, session.accountId, { batchId: body.batchId, subject: body.subject, body: body.body, audience, gift, expiresInDays: expires }, Date.now());
  if (!result.ok) return errorResponse(result.error, 400);
  if (!result.duplicate) {
    console.log("gift sent", session.accountId, body.batchId, audience.kind, result.recipients);
    try {
      await env.CHAT_HUB.get(env.CHAT_HUB.idFromName("global"), { locationHint: "apac" }).notifyMail(audience.kind === "all" ? null : audience.characterIds);
    } catch (err) {
      console.error("gift notification failed", err); // the mail is sent; players see it when they next open the bag or join
    }
  }
  return json({ ok: true, recipients: result.recipients, duplicate: result.duplicate });
}

/** The quest catalogue for the admin screen: every quest with how many characters are on it, and what the pickers of the form need. */
export async function adminQuests(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const quests = await listQuests(env.DB);
  return json({ quests, meta: await questMeta(env.DB, quests.map((q) => q.def.chain)) });
}

const QUEST_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, locked_field: 409, in_use: 409, exists: 409, has_progress: 409, version_conflict: 409, busy: 409, deleted: 409, not_found: 404 };

/** Saves a quest (POST `{quest, isNew, updatedAt}`); 400 with the list of problems when the catalogue would no longer be valid, 409 when someone else saved it first. */
export async function adminQuestSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 32 * 1024);
  if (!body || typeof body.quest !== "object" || typeof body.isNew !== "boolean") return errorResponse("invalid_body", 400);
  const result = await saveQuest(env.DB, session.email, body.quest, body.isNew, typeof body.updatedAt === "number" ? body.updatedAt : 0);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, QUEST_ERROR_STATUS[result.error] ?? 400);
  console.log("quest saved", session.accountId, (body.quest as { id?: string }).id);
  return json({ ok: true, updatedAt: result.updatedAt });
}

/** Deletes a quest (POST `{id, updatedAt}`): soft when characters hold it, else hard; refused (409 `in_use` with the list) while another quest requires it. */
export async function adminQuestDelete(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 32 * 1024);
  if (typeof body?.id !== "string" || typeof body?.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = await deleteQuest(env.DB, session.email, body.id, body.updatedAt);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, QUEST_ERROR_STATUS[result.error] ?? 400);
  console.log("quest deleted", session.accountId, body.id, result.mode);
  return json({ ok: true, mode: result.mode });
}

/** The item catalogue for the admin screen: every plain item (the code's, with the admin's changes, and the ones admins made) with owners and sell value. */
export async function adminItems(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await listItems(env.DB));
}

const ITEM_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, bound: 400, locked_field: 409, exists: 409, has_owner: 409, version_conflict: 409, busy: 409, deleted: 409, in_use: 409, not_found: 404 };

/** Saves an item (POST `{item, isNew, updatedAt, value?, valueToken}`): its fields, and its sell value in the same batch. */
export async function adminItemSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 16 * 1024);
  if (!body || typeof body.item !== "object" || body.item === null || typeof body.isNew !== "boolean") return errorResponse("invalid_body", 400);
  const value = body.value === undefined ? undefined : body.value === null ? null : (body.value as number);
  const result = await saveItem(env.DB, session.email, body.item as Record<string, unknown>, body.isNew, typeof body.updatedAt === "number" ? body.updatedAt : 0, value, typeof body.valueToken === "number" ? body.valueToken : 0);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, ITEM_ERROR_STATUS[result.error] ?? 400);
  console.log("item saved", session.accountId, (body.item as { id?: string }).id);
  return json({ ok: true, updatedAt: result.updatedAt });
}

/** Deletes an item an admin made (POST `{id, updatedAt}`): refused while a quest or merchant names it, soft when characters own it, else hard. */
export async function adminItemDelete(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 16 * 1024);
  if (typeof body?.id !== "string" || typeof body?.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = await deleteItem(env.DB, session.email, body.id, body.updatedAt);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, ITEM_ERROR_STATUS[result.error] ?? 400);
  console.log("item deleted", session.accountId, body.id, result.mode);
  return json({ ok: true, mode: result.mode });
}

/** The skills for the admin screen: each skill and each root template with the code's numbers, the admin's changes and the numbers that come out. */
export async function adminSkills(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await listSkills(env.DB));
}

/** Changes the entry of one skill or root template (POST `{key, fields | null, token}`): `null` puts it back to the code's numbers. */
export async function adminSkillSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 16 * 1024);
  if (typeof body?.key !== "string" || typeof body?.token !== "number" || (body.fields !== null && (typeof body.fields !== "object" || Array.isArray(body.fields)))) return errorResponse("invalid_body", 400);
  const result = await saveSkillOverride(env.DB, session.email, body.key, body.fields as Record<string, unknown> | null, body.token);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, result.error === "version_conflict" ? 409 : result.error === "unknown_skill" ? 404 : 400);
  console.log("skill saved", session.accountId, body.key, result.reset ? "reset" : "changed");
  return json({ ok: true, updatedAt: result.updatedAt, reset: result.reset });
}

/** The monster species for the admin screen: each with the code's numbers, what is in force, and where it appears. */
export async function adminMonsters(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await listSpecies(env.DB));
}

const MONSTER_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, unknown: 404, version_conflict: 409 };

/** Changes a species (POST `{id, fields | null, token}`): `null` puts it back to the code's numbers. */
export async function adminMonsterSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 16 * 1024);
  if (typeof body?.id !== "string" || typeof body?.token !== "number" || (body.fields !== null && (typeof body.fields !== "object" || Array.isArray(body.fields)))) return errorResponse("invalid_body", 400);
  const result = await saveSpecies(env.DB, session.email, body.id, body.fields as Record<string, unknown> | null, body.token);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, MONSTER_ERROR_STATUS[result.error] ?? 400);
  console.log("species saved", session.accountId, body.id);
  return json({ ok: true, updatedAt: result.updatedAt, warnings: result.warnings ?? [] });
}

/** The loot tables for the admin screen, with the default, the realms and the items that can be put in them. */
export async function adminLoot(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await listLoot(env.DB));
}

/** Saves the loot tables (POST `{loot, token}`). */
export async function adminLootSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 64 * 1024);
  if (typeof body?.token !== "number" || typeof body?.loot !== "object" || body.loot === null) return errorResponse("invalid_body", 400);
  const result = await saveLoot(env.DB, session.email, body.loot, body.token);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, MONSTER_ERROR_STATUS[result.error] ?? 400);
  console.log("loot saved", session.accountId);
  return json({ ok: true, updatedAt: result.updatedAt });
}

const NPC_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, locked: 409, in_use: 409, exists: 409, version_conflict: 409, busy: 409, not_found: 404 };

/** The NPCs for the admin screen: where each stands, its kind, whether it has a stock and which quests name it; plus the maps and kinds the form offers. */
export async function adminNpcs(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json({ npcs: await listNpcs(env.DB), meta: npcMeta() });
}

/** Saves an NPC (POST `{npc, isNew, updatedAt}`); 409 when someone else saved it first or it is still named by a quest (`in_use` with the list). */
export async function adminNpcSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 8 * 1024);
  if (!body || typeof body.npc !== "object" || typeof body.isNew !== "boolean") return errorResponse("invalid_body", 400);
  const result = await saveNpc(env.DB, session.email, body.npc, body.isNew, typeof body.updatedAt === "number" ? body.updatedAt : 0);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, NPC_ERROR_STATUS[result.error] ?? 400);
  console.log("npc saved", session.accountId, (body.npc as { id?: string }).id);
  return json({ ok: true, updatedAt: result.updatedAt });
}

export async function adminNpcDelete(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 4 * 1024);
  if (typeof body?.mapId !== "string" || typeof body?.id !== "string" || typeof body?.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = await deleteNpc(env.DB, session.email, body.mapId, body.id, body.updatedAt);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, NPC_ERROR_STATUS[result.error] ?? 400);
  console.log("npc deleted", session.accountId, body.id);
  return json({ ok: true });
}

/** A trading NPC's record (GET `?npc=`): buying rate, kinds bought, stock rules, and what the form's pickers need. */
export async function adminMerchant(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const npc = url.searchParams.get("npc") ?? "";
  const view = await getMerchantAdmin(env.DB, npc);
  if (!view) return errorResponse("not_found", 404);
  return json({ ...view, meta: await merchantMeta(env.DB) });
}

export async function adminMerchantSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 256 * 1024);
  if (!body) return errorResponse("invalid_body", 400);
  const result = await saveMerchant(env.DB, session.email, body);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, NPC_ERROR_STATUS[result.error] ?? 400);
  console.log("merchant saved", session.accountId, body.npc);
  return json({ ok: true, updatedAt: result.updatedAt });
}

export async function adminAlchemy(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await getAlchemyAdmin(env.DB));
}

export async function adminAlchemySave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 128 * 1024);
  if (!body || typeof body.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = await saveAlchemy(env.DB, session.email, body.alchemy, body.updatedAt);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, NPC_ERROR_STATUS[result.error] ?? 400);
  console.log("alchemy saved", session.accountId);
  return json({ ok: true, updatedAt: result.updatedAt });
}

/** The maps for the admin screen: one row each with whether an admin changed it. */
export async function adminMaps(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json({ maps: await listMaps(env.DB) });
}

export async function adminMapRecipe(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const view = await getMapAdmin(env.DB, url.searchParams.get("id") ?? "");
  return view ? json(view) : errorResponse("not_found", 404);
}

/** Saves a map recipe (POST `{recipe, updatedAt}`), or puts a map back to the code's (`{reset: true, id, updatedAt}`). */
export async function adminMapSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 128 * 1024);
  if (!body || typeof body.updatedAt !== "number") return errorResponse("invalid_body", 400);
  const result = body.reset === true && typeof body.id === "string" ? await resetMap(env.DB, session.email, body.id, body.updatedAt) : await saveMap(env.DB, session.email, body.recipe, body.updatedAt);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, NPC_ERROR_STATUS[result.error] ?? 400);
  console.log("map saved", session.accountId);
  return json({ ok: true, updatedAt: result.updatedAt });
}

const ACCOUNT_ERROR_STATUS: Record<string, number> = { invalid: 400, forbidden: 403, unchanged: 400, not_found: 404 };

/** One page of accounts (search by email or character name). */
export async function adminAccounts(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  return json(await listAccounts(env.DB, parseAccountQuery(url.searchParams)));
}

export async function adminAccountDetail(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const detail = await getAccountDetail(env.DB, url.searchParams.get("id") ?? "");
  return detail ? json(detail) : errorResponse("not_found", 404);
}

/** POST `{id, action: "ban" | "unban" | "password", forever?, days?, reason?}`. A temporary password is in the answer once. */
export async function adminAccountAction(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 4 * 1024);
  if (!body || typeof body.id !== "string") return errorResponse("invalid_body", 400);
  const result =
    body.action === "ban"
      ? await banAccount(env, session.email, body.id, { forever: body.forever === true, days: typeof body.days === "number" ? body.days : undefined, reason: String(body.reason ?? "") })
      : body.action === "unban"
        ? await unbanAccount(env, session.email, body.id)
        : body.action === "password"
          ? await setTempPassword(env, session.email, body.id, { hash: (p, s) => hashPassword(env, p, s), iterations: PBKDF2_ITERATIONS, newSalt: () => toBase64(crypto.getRandomValues(new Uint8Array(16))) })
          : null;
  if (!result) return errorResponse("invalid_body", 400);
  if (!result.ok) return json({ error: result.error }, ACCOUNT_ERROR_STATUS[result.error] ?? 400);
  console.log("account action", session.accountId, body.action, body.id);
  return json({ ok: true, ...(result.password ? { password: result.password } : {}), kicked: result.kicked === true });
}

const CHARACTER_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, funds: 400, full: 409, busy: 409, not_reviewing: 409, reviewed_by_other: 409, unknown_item: 400, not_found: 404 };

/** A character for the admin screen, with whether it is online (a connection holds its lock). */
export async function adminCharacter(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const id = url.searchParams.get("id") ?? "";
  const view = await getCharacterView(env.DB, id);
  if (!view) return errorResponse("not_found", 404);
  let online = false;
  try {
    online = await env.CHAR_LOCK.get(env.CHAR_LOCK.idFromName(id)).isHeld();
  } catch (err) {
    console.error("lock state unavailable", err);
  }
  return json({ character: view, online });
}

/** POST `{id, action: "start" | "end" | "stats" | "money" | "addItem" | "removeItem" | "addSkill" | "removeSkill", ...}`. Every change needs the admin's own review to be running. */
export async function adminCharacterAction(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 8 * 1024);
  if (!body || typeof body.id !== "string") return errorResponse("invalid_body", 400);
  const id = body.id;
  const admin = session.email;
  let result;
  switch (body.action) {
    case "start":
      result = await startReview(env.DB, admin, id, (accountId, characterId) => kickCharacter(env, characterId, accountId));
      break;
    case "end":
      result = await endReview(env.DB, admin, id);
      break;
    case "stats":
      result = await editStats(env.DB, admin, id, body.input as StatsInput, REALMS.length);
      break;
    case "money":
      result = await adjustMoney(env.DB, admin, id, body.currency, body.delta);
      break;
    case "addItem":
      result = await addItem(env.DB, admin, id, body.item, body.qty);
      break;
    case "removeItem":
      result = await removeItem(env.DB, admin, id, body.instance);
      break;
    case "addSkill":
      result = await addSkill(env.DB, admin, id, body.skill);
      break;
    case "removeSkill":
      result = await removeSkill(env.DB, admin, id, body.skill);
      break;
    default:
      return errorResponse("invalid_body", 400);
  }
  if (!result.ok) return json({ error: result.error }, CHARACTER_ERROR_STATUS[result.error] ?? 400);
  console.log("character action", session.accountId, body.action, id);
  return json({ ok: true, kicked: result.kicked === true });
}

const GEAR_ERROR_STATUS: Record<string, number> = { invalid: 400, unchanged: 400, version_conflict: 409, busy: 409, not_found: 404 };

/** The gear tables: GET `?part=master&kind=`, `?part=sets`, `?part=enhance`. */
export async function adminGear(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const part = url.searchParams.get("part");
  if (part === "sets") return json(await getSetsView(env.DB));
  if (part === "enhance") return json(await getEnhanceView(env.DB));
  const view = await getMasterView(env.DB, url.searchParams.get("kind") ?? "weapon");
  return view ? json(view) : errorResponse("not_found", 404);
}

/** POST `{part: "master" | "sets" | "enhance", token, ...}`. */
export async function adminGearSave(request: Request, env: Env): Promise<Response> {
  const session = await requireAdminSession(request, env);
  if (session instanceof Response) return session;
  const body = await readJson(request, 128 * 1024);
  if (!body || typeof body.token !== "number") return errorResponse("invalid_body", 400);
  const result =
    body.part === "master"
      ? await saveMaster(env.DB, session.email, String(body.kind ?? ""), body.rows, body.token)
      : body.part === "sets"
        ? await saveSets(env.DB, session.email, body.names, body.token)
        : body.part === "enhance"
          ? await saveEnhance(env.DB, session.email, body.rows, body.token)
          : null;
  if (!result) return errorResponse("invalid_body", 400);
  if (!result.ok) return json({ error: result.error, problems: result.problems ?? [] }, GEAR_ERROR_STATUS[result.error] ?? 400);
  console.log("gear saved", session.accountId, body.part);
  return json({ ok: true, token: result.token });
}

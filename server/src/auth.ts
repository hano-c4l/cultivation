import { applyElementSettings } from "./element-settings";
import {
  SPIRITUAL_ROOTS,
  isGender,
  type Gender,
  CONSTITUTION_ROLL_RANGE,
  type ConstitutionCatalog,
  CONSTITUTION_TIER_ROLL_RANGE,
  rollConstitution,
  rootGradeFromRoll,
  rootCountFromRoll,
  rollRoots,
  maybeMutantRoot,
  STAT_DEFS,
  getMap,
  isLeaderboard,
  startingStats,
  validateCharacterName,
  validateEmail,
  validatePassword,
} from "@game/shared";
import { getConstitutionCatalog } from "./constitution-catalog";
import { adminBagTabs, adminConstitutions, adminCharacter, adminGrant, adminLookup, adminSettings, adminSupply } from "./admin";
import { getCharacterByAccount, grantExp, STAND_IN_ROOT, toCharacterSheet } from "./characters";
import type { Env } from "./env";
import { getLeaderboard } from "./leaderboard";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  errorResponse,
  hasForeignOrigin,
  json,
  readCookie,
  readJson,
  sessionCookie,
} from "./http";
import { PBKDF2_ITERATIONS, constantTimeEqual, toBase64 } from "./password-hasher";

export interface AuthedSession {
  accountId: string;
  email: string;
  role: "player" | "admin";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes: number): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function getSession(request: Request, env: Env): Promise<AuthedSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT a.id AS accountId, a.email AS email, a.role AS role FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?",
  )
    .bind(await sha256Hex(token), Date.now())
    .first<AuthedSession>();
  return row ?? null;
}

async function createSession(env: Env, accountId: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), accountId, now + SESSION_TTL_SECONDS * 1000, now)
    .run();
  return token;
}

/** Fixed-window counter in D1. Returns false once `limit` is exceeded within the window. */
async function allowAttempt(env: Env, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (env.DISABLE_RATE_LIMIT === "1") return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);
  const row = await env.DB.prepare(
    "INSERT INTO auth_attempts (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if (Math.random() < 0.02) {
    // Opportunistic cleanup of old counters and expired sessions.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM auth_attempts WHERE window < ?").bind(nowSeconds - 86400),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
    ]);
  }
  return (row?.count ?? 1) <= limit;
}

function hashPassword(env: Env, password: string, saltBase64: string): Promise<string> {
  // A handful of hasher objects lets concurrent logins hash in parallel.
  const stub = env.PASSWORD_HASHER.get(env.PASSWORD_HASHER.idFromName(`hasher-${Math.floor(Math.random() * 4)}`));
  return stub.hash(password, saltBase64, PBKDF2_ITERATIONS);
}

const DUMMY_SALT = toBase64(new Uint8Array(16));

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

async function register(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = validateEmail(body?.email);
  const password = validatePassword(body?.password);
  if (!email) return errorResponse("invalid_email", 400);
  if (!password) return errorResponse("invalid_password", 400);
  // Rate limit only well-formed attempts: malformed ones are rejected without a D1 write.
  if (!(await allowAttempt(env, `reg:${clientIp(request)}`, 10, 600))) return errorResponse("rate_limited", 429);

  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(env, password, salt);
  const accountId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES (?, ?, ?, ?, ?, 'player', ?)",
    )
      .bind(accountId, email, hash, salt, PBKDF2_ITERATIONS, Date.now())
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return errorResponse("email_taken", 409);
    throw err;
  }
  const token = await createSession(env, accountId);
  return json({ ok: true }, 201, { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS, request) });
}

async function login(request: Request, env: Env): Promise<Response> {
  if (!(await allowAttempt(env, `login-ip:${clientIp(request)}`, 30, 60))) return errorResponse("rate_limited", 429);
  const body = await readJson(request);
  const email = validateEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : null;
  if (!email || !password || password.length > 128) return errorResponse("invalid_credentials", 401);
  if (!(await allowAttempt(env, `login-email:${email}`, 10, 300))) return errorResponse("rate_limited", 429);

  const account = await env.DB.prepare("SELECT id, pw_hash, pw_salt FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string; pw_hash: string; pw_salt: string }>();
  // Hash even for unknown emails so response time does not reveal which emails exist.
  const hash = await hashPassword(env, password, account?.pw_salt ?? DUMMY_SALT);
  if (!account || !constantTimeEqual(hash, account.pw_hash)) return errorResponse("invalid_credentials", 401);

  const token = await createSession(env, account.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS, request) });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0, request) });
}

async function me(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  const character = await getCharacterByAccount(env.DB, session.accountId);
  return json({
    account: { email: session.email, role: session.role },
    character: character ? toCharacterSheet(character) : null,
  });
}

async function createCharacter(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  if (await getCharacterByAccount(env.DB, session.accountId)) return errorResponse("character_exists", 409);
  const body = await readJson(request);
  const name = validateCharacterName(body?.name);
  if (!name) return errorResponse("invalid_name", 400);
  // The player picks the gender (it decides which gear they can wear). Callers that send none get a plain Nam or Nữ at random.
  if (body?.gender !== undefined && !isGender(body.gender)) return errorResponse("invalid_gender", 400);
  const gender: Gender = isGender(body?.gender) ? body.gender : crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0 ? "male" : "female";

  // The server rolls the spiritual root; the client cannot choose it.
  // How many elements (đơn ... ngũ linh căn) and which ones; the first is the main element.
  const rootRolls = crypto.getRandomValues(new Uint32Array(6));
  try {
    await applyElementSettings(env.DB);
  } catch (err) {
    console.error("element settings unavailable, using defaults", err);
  }
  const mutantRolls = crypto.getRandomValues(new Uint32Array(2));
  const roots = maybeMutantRoot(rollRoots(rootCountFromRoll(rootRolls[0]! % 100), [...rootRolls.slice(1)]), mutantRolls[0]! % 1000, mutantRolls[1]!);
  const root = roots[0]!;
  const [sx, sy] = getMap("town").spawn;
  const rootGrade = rootGradeFromRoll(crypto.getRandomValues(new Uint32Array(1))[0]! % 100);
  const start = startingStats(root, rootGrade);
  // Thể chất is rolled by the server too: a rare special constitution, otherwise the ordinary Phàm Thể.
  const rolls = crypto.getRandomValues(new Uint32Array(2));
  let catalog: ConstitutionCatalog;
  try {
    catalog = await getConstitutionCatalog(env.DB);
  } catch (err) {
    console.error("constitution catalogue unavailable", err);
    return errorResponse("catalog_unavailable", 503); // never roll from a made-up catalogue
  }
  const constitution = rollConstitution(catalog, rolls[0]! % CONSTITUTION_ROLL_RANGE, rolls[1]! % CONSTITUTION_TIER_ROLL_RANGE);
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO characters (id, account_id, name, spiritual_root, roots, map_id, x, y, potential_points, root_grade, constitution, constitution_tier, gender, ${STAT_DEFS.map((d) => d.column).join(", ")}, created_at, updated_at) ` +
        `VALUES (?, ?, ?, ?, ?, 'town', ?, ?, ?, ?, ?, ?, ?, ${STAT_DEFS.map(() => "?").join(", ")}, ?, ?)`,
    )
      .bind(id, session.accountId, name, STAND_IN_ROOT[root] ?? root, roots.join(","), sx, sy, start.potentialPoints, rootGrade, constitution.id, constitution.tier, gender, ...STAT_DEFS.map((d) => start.base[d.key]), now, now)
      .run();
  } catch (err) {
    if (String(err).includes("characters.name")) return errorResponse("name_taken", 409);
    if (String(err).includes("UNIQUE")) return errorResponse("character_exists", 409);
    throw err;
  }
  const character = await getCharacterByAccount(env.DB, session.accountId);
  return json({ character: character ? toCharacterSheet(character) : null }, 201);
}

/**
 * Local testing only: grants EXP to the caller's character. Answers 404 unless ENABLE_DEV_GRANT=1 is set in
 * .dev.vars, so it does not exist on preview or production. Changes show up on the next connect.
 */
async function devGrantExp(request: Request, env: Env): Promise<Response> {
  if (env.ENABLE_DEV_GRANT !== "1") return errorResponse("not_found", 404);
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  const body = await readJson(request);
  const exp = body?.exp;
  if (typeof exp !== "number" || !Number.isInteger(exp) || exp < 0 || exp > 1e12) return errorResponse("invalid_exp", 400);
  const character = await getCharacterByAccount(env.DB, session.accountId);
  if (!character) return errorResponse("no_character", 404);
  const updated = await grantExp(env.DB, character.id, exp);
  return json({ character: updated ? toCharacterSheet(updated) : null });
}

/** The constitution catalogue (names, tiers, descriptions, effects): game data, shown on the character screen. */
async function constitutionsApi(env: Env): Promise<Response> {
  try {
    return json(await getConstitutionCatalog(env.DB));
  } catch (err) {
    console.error("constitution catalogue unavailable", err);
    return errorResponse("catalog_unavailable", 503);
  }
}

async function leaderboardApi(request: Request, env: Env): Promise<Response> {
  if (!(await getSession(request, env))) return errorResponse("unauthenticated", 401);
  try {
    const board = new URL(request.url).searchParams.get("board") ?? "realm";
    if (!isLeaderboard(board)) return errorResponse("invalid_board", 400);
    return json({ board, rows: await getLeaderboard(env.DB, board) });
  } catch (err) {
    console.error("leaderboard unavailable", err);
    return errorResponse("unavailable", 503);
  }
}

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "POST" && hasForeignOrigin(request)) return errorResponse("forbidden_origin", 403);
  switch (`${request.method} ${url.pathname}`) {
    case "POST /api/register":
      return register(request, env);
    case "POST /api/login":
      return login(request, env);
    case "POST /api/logout":
      return logout(request, env);
    case "GET /api/me":
      return me(request, env);
    case "GET /api/constitutions":
      return constitutionsApi(env);
    case "GET /api/leaderboard":
      return leaderboardApi(request, env);
    case "POST /api/character":
      return createCharacter(request, env);
    case "POST /api/admin/grant":
      return adminGrant(request, env);
    case "GET /api/admin/lookup":
      return adminLookup(request, env, url);
    case "GET /api/admin/character":
      return adminCharacter(request, env, url);
    case "POST /api/admin/bag-tabs":
      return adminBagTabs(request, env);
    case "GET /api/admin/settings":
    case "POST /api/admin/settings":
      return adminSettings(request, env);
    case "GET /api/admin/constitutions":
    case "POST /api/admin/constitutions":
      return adminConstitutions(request, env);
    case "GET /api/admin/supply":
      return adminSupply(request, env);
    case "POST /api/dev/grant-exp":
      return devGrantExp(request, env);
    default:
      return errorResponse("not_found", 404);
  }
}

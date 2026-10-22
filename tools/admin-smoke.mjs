// Local test of the admin screens and rankings (phase 2h/2i): the five leaderboards answer and require a login, the constitution catalogue is admin only,
// a save bumps the version and a stale save is refused.
// Usage: node tools/admin-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and PK_DROP_FORCE=1 (the PvP item drop always succeeds) in .dev.vars. Never run it against preview or production.
import { TOWN_SPAWN } from "./world.mjs";
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
let CH = 3;
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=${CH}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  const wait = async (pred, ms = 5000, label = "message") => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
      await sleep(50);
    }
  };
  return { ws, log, opened, wait, send: (m) => ws.send(JSON.stringify(m)) };
}

async function connect(cookie) {
  const c = open(cookie);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 5000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}

async function after(c, msg, wait = 700) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}


/** A character standing at (map, x, y) with the given sát nhân. */
async function makePlayer(tag, map, x, y, satNhan = 0, admin = false) {
  const reg = await post("/api/register", { email: `ad-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  if (admin) sql(`UPDATE accounts SET role = 'admin' WHERE email = 'ad-${tag}-${run}@example.test'`);
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL, stat_can_cot = 3000 WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}



const get = (path, cookie) => fetch(httpBase + path, { headers: cookie ? { Cookie: cookie } : {} });
const plain = await makePlayer("P", "town", ...TOWN_SPAWN);
const gm = await makePlayer("G", "town", ...TOWN_SPAWN, 0, true);

check("the ranking needs a login", (await get("/api/leaderboard")).status === 401);
for (const b of ["realm", "power", "wealth", "gear", "artifact"]) {
  const r = await get(`/api/leaderboard?board=${b}`, plain.cookie);
  const data = await r.json();
  check(`board ${b} answers with rows`, r.status === 200 && Array.isArray(data.rows), `${r.status} ${JSON.stringify(data).slice(0, 80)}`);
}
check("an unknown board is refused", (await get("/api/leaderboard?board=nope", plain.cookie)).status === 400);

check("the constitution catalogue is for admins only", (await get("/api/admin/constitutions", plain.cookie)).status === 403 && (await get("/api/admin/constitutions")).status === 401);
const cat = await (await get("/api/admin/constitutions", gm.cookie)).json();
check("an admin reads it with the vocabulary", cat.constitutions?.length >= 2 && !!cat.vocabulary?.stats?.skill_damage, `v${cat.version}`);
const save = (body, cookie) => fetch(httpBase + "/api/admin/constitutions", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
const next = structuredClone(cat.constitutions);
next[0].descVi = "Sửa thử " + run;
let r = await save({ expectedVersion: cat.version, constitutions: next }, plain.cookie);
check("a player cannot save", r.status === 403);
r = await save({ expectedVersion: cat.version, constitutions: next }, gm.cookie);
let data = await r.json();
check("a save goes through and bumps the version", r.status === 200 && data.version === cat.version + 1 && data.constitutions[0].descVi === next[0].descVi, `${r.status} v${data.version}`);
r = await save({ expectedVersion: cat.version, constitutions: next }, gm.cookie);
check("a stale save is refused", r.status === 409);
const bad = structuredClone(next);
bad[0].tiers[0].rollWeight += 1;
r = await save({ expectedVersion: data.version, constitutions: bad }, gm.cookie);
data = await r.json();
check("an invalid catalogue is refused with the problems", r.status === 400 && data.error === "invalid" && data.problems.length > 0, JSON.stringify(data).slice(0, 100));
// put the description back
const back = structuredClone(cat.constitutions);
const cur = await (await get("/api/admin/constitutions", gm.cookie)).json();
r = await save({ expectedVersion: cur.version, constitutions: back }, gm.cookie);
check("the original text can be restored", r.status === 200);

console.log(failures === 0 ? "all admin checks passed" : `${failures} admin check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

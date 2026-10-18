// Local test of breakthrough (phase 2d): not ready below a full stage-9 bar, overflow EXP, missing pills and funds, walking away
// fails (pills and Linh Thạch gone, EXP lost, marker cleared), dropping the connection fails, and one full 60 s attempt that
// ends either way consistently (success: next realm, stage 1, points, two new root skills; failure: EXP lost).
// Usage: node tools/breakthrough-smoke.mjs [ws://localhost:8787]
// Registers a throwaway account and uses dev-only endpoints: local only, needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1.
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
const ROOM = "town:6";
const PILL = "bt_pill_1";
const COST = 5000;
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
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie, ch) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
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
async function connect(cookie, ch = 6) {
  const c = open(cookie, ch);
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

const reg = await post("/api/register", { email: `bt-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Phá ${run.slice(-4)}`, gender: "male" }, reg.cookie);
check("character created", created.status === 201);
const charId = created.data.character.id;
const row = () => sql(`SELECT realm, stage, exp, potential_points, bt_started_at FROM characters WHERE id = '${charId}'`)[0];
const pills = () => sql(`SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = '${charId}' AND item_type = '${PILL}'`)[0].q;
const balance = () => sql(`SELECT COALESCE((SELECT balance FROM currency_balances WHERE character_id = '${charId}' AND currency = 'linh_thach'), 0) AS b`)[0].b;
const give = (item, qty = 1) => fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${charId}&item=${item}&qty=${qty}`).then((r) => r.json());
let ledgerN = 0;
const fund = (amount) => {
  sql(`INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'linh_thach', 0)`);
  sql(`INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES ('${charId}', 'linh_thach', ${amount}, 'test', 'smoke', 'bt-smoke-${run}-${++ledgerN}', 0)`);
  sql(`UPDATE currency_balances SET balance = balance + ${amount} WHERE character_id = '${charId}' AND currency = 'linh_thach'`);
};

let c = await connect(reg.cookie);
let r = await after(c, { t: "bt_start", pills: 1 });
check("a fresh character cannot start (not ready)", r.some((m) => m.t === "bt_error" && m.reason === "not_ready"));

// Reach stage 9 with a full bar: a huge grant is capped at the stage need plus the overflow.
await fetch(`${httpBase}/api/dev/grant-exp`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: reg.cookie }, body: JSON.stringify({ exp: 1_000_000_000 }) });
const full = row();
check("stage 9 with EXP above the bar (overflow)", full.stage === 9 && full.exp > 0, JSON.stringify(full));
const overflowExp = full.exp;
c.ws.close();
await sleep(500);
c = await connect(reg.cookie);
check("the welcome shows stage 9", c.welcome.character.stage === 9 && c.welcome.character.exp === overflowExp);

r = await after(c, { t: "bt_start", pills: 1 });
check("no pill: refused", r.some((m) => m.t === "bt_error" && m.reason === "no_pill"));
await give(PILL, 3);
await sleep(700);
r = await after(c, { t: "bt_start", pills: 1 });
check("pills but no Linh Thạch: refused and nothing changes", r.some((m) => m.t === "bt_error" && m.reason === "funds") && pills() === 3 && row().bt_started_at === null);
r = await after(c, { t: "bt_start", pills: 3 });
check("more pills than the realm allows: refused", r.some((m) => m.t === "bt_error" && m.reason === "pills"));

// --- walking away fails ---
fund(COST * 3);
r = await after(c, { t: "bt_start", pills: 1 });
const started = r.find((m) => m.t === "bt");
check("start: the countdown begins with the stated chance", !!started && started.ms === 60000 && started.ratePct >= 70, started ? `${started.ratePct}% for ${started.ms} ms` : "no bt");
check("start: pill and Linh Thạch gone, marker set", pills() === 2 && balance() === COST * 2 && row().bt_started_at !== null);
r = await after(c, { t: "bt_start", pills: 1 });
check("a second start while one runs is refused", r.some((m) => m.t === "bt_error" && m.reason === "busy") && pills() === 2);
const expBefore = row().exp;
const self = c.log.find((m) => m.t === "welcome").players.find((p) => p.id === c.welcome.self);
r = await after(c, { t: "move", x: 25.5, y: 25.5, fx: self.path[self.path.length - 1][0], fy: self.path[self.path.length - 1][1], seq: 1 }, 1000);
const ended = r.find((m) => m.t === "bt_end");
check("moving fails it: EXP lost, marker cleared", ended?.ok === false && ended.reason === "moved" && ended.expLost > 0 && row().bt_started_at === null && row().exp === expBefore - ended.expLost, JSON.stringify(ended));

// --- dropping the connection fails ---
r = await after(c, { t: "bt_start", pills: 1 }, 900);
check("second attempt starts", r.some((m) => m.t === "bt"));
const expMid = row().exp;
c.ws.close();
await sleep(1200);
check("the disconnect settled it as a failure", row().bt_started_at === null && row().exp < expMid && pills() === 1, JSON.stringify(row()));
c = await connect(reg.cookie);

// --- one full attempt (two failures took the bar below full, so fill it again) ---
await fetch(`${httpBase}/api/dev/grant-exp`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: reg.cookie }, body: JSON.stringify({ exp: 1_000_000_000 }) });
c.ws.close();
await sleep(500);
c = await connect(reg.cookie);
fund(COST * 2);
const skillsBefore = c.welcome.skills.length;
r = await after(c, { t: "bt_start", pills: 1 }, 900);
check("full attempt starts", r.some((m) => m.t === "bt"));
console.log("waiting 62 s for the breakthrough to end...");
const end = await c.wait((m) => m.t === "bt_end", 70000, "bt_end");
const now = row();
if (end.ok) {
  check("success: next realm, stage 1, no EXP, marker cleared", now.realm === 1 && now.stage === 1 && now.exp === 0 && now.bt_started_at === null, JSON.stringify(now));
  check("success: potential points were granted", end.points > 0 && now.potential_points >= end.points, `${end.points}`);
  const skills = sql(`SELECT skill_id, realm FROM character_skills WHERE character_id = '${charId}' AND source = 'root' AND realm = 1`);
  check("success: two root skills of the new realm", skills.length === 2, JSON.stringify(skills));
  check("success: the client was sent the new skills", c.log.some((m) => m.t === "skills" && m.ids.length >= skillsBefore + 2));
} else {
  check("failure: EXP lost, still stage 9, marker cleared", now.realm === 0 && now.stage === 9 && now.bt_started_at === null && end.expLost > 0, JSON.stringify(now));
}
check("the pill is gone either way", pills() === 0);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

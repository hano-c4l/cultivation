// Local test of breakthrough in a COMBAT room (phase 2d, forest): a monster that attacks a character in the middle of a
// breakthrough ends it (hit), and a quiet one at the entrance runs the full 60 s and ends either way consistently, with the
// room's working copy and D1 agreeing after the character leaves (the simulation keeps its own EXP and stage, so a stale save would show here).
// Usage: node tools/breakthrough-forest-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints: local only, needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1.
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

/** A character at stage 9 with a full bar, one pill and the Linh Thạch, standing at (x, y) in the forest. */
async function makeChar(tag, x, y) {
  const reg = await post("/api/register", { email: `bf-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-4)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  await fetch(`${httpBase}/api/dev/grant-exp`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: reg.cookie }, body: JSON.stringify({ exp: 1_000_000_000 }) });
  // The dev loot door needs the character connected to the room, so the pill is handed over in town first.
  const t = await connect(reg.cookie);
  await fetch(`${httpBase}/api/dev/loot?room=town:6&char=${id}&item=${PILL}&qty=1`);
  await sleep(700);
  t.ws.close();
  await sleep(700);
  sql(`UPDATE characters SET map_id = 'forest', x = ${x}, y = ${y} WHERE id = '${id}'`);
  sql(`INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 0)`);
  sql(`INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES ('${id}', 'linh_thach', ${COST}, 'test', 'smoke', 'bf-${tag}-${run}', 0)`);
  sql(`UPDATE currency_balances SET balance = balance + ${COST} WHERE character_id = '${id}' AND currency = 'linh_thach'`);
  return { id, cookie: reg.cookie };
}
const rowOf = (id) => sql(`SELECT realm, stage, exp, potential_points, bt_started_at FROM characters WHERE id = '${id}'`)[0];

// B stands next to the wolves (cluster at 20.5, 14.5): they come for it. A stands at the entrance, far from every monster.
const b = await makeChar("Bi", 20.5, 15.5);
const a = await makeChar("An", 20.5, 4.5);

const cb = await connect(b.cookie);
check("B is in the forest at stage 9", cb.welcome.map === "forest" && cb.welcome.character.stage === 9);
const mark = cb.log.length;
cb.send({ t: "bt_start", pills: 1 });
const hitEnd = await cb.wait((m) => m.t === "bt_end", 20000, "bt_end of B").catch(() => null);
check("started", cb.log.slice(mark).some((m) => m.t === "bt"));
check("a monster's attack ended it as a failure", hitEnd?.ok === false && (hitEnd.reason === "hit" || hitEnd.reason === "died"), JSON.stringify(hitEnd));
await sleep(600);
check("B's row: marker cleared, EXP lost", rowOf(b.id).bt_started_at === null && hitEnd?.expLost > 0, JSON.stringify(rowOf(b.id)));
cb.ws.close();

const ca = await connect(a.cookie);
check("A is in the forest at stage 9", ca.welcome.map === "forest" && ca.welcome.character.stage === 9);
const startMark = ca.log.length;
ca.send({ t: "bt_start", pills: 1 });
await sleep(900);
check("A started", ca.log.slice(startMark).some((m) => m.t === "bt"));
console.log("waiting for A's breakthrough (60 s)...");
const end = await ca.wait((m) => m.t === "bt_end", 75000, "bt_end of A");
await sleep(500);
const stats = [...ca.log].reverse().find((m) => m.t === "stats");
if (end.ok) {
  check("A succeeded: the room's sheet says stage 1 of the next realm with no EXP", stats?.character.realm === 1 && stats.character.stage === 1 && stats.character.exp === 0, JSON.stringify(stats?.character));
  check("A succeeded: new HP and skills were sent", ca.log.slice(startMark).some((m) => m.t === "hp") && ca.log.slice(startMark).some((m) => m.t === "skills"));
} else {
  check("A failed: EXP was lost", end.expLost > 0, JSON.stringify(end));
}
// Leaving makes the room save its working copy: it must not put the old realm or stage back.
ca.ws.close();
await sleep(1500);
const after = rowOf(a.id);
if (end.ok) check("after leaving, D1 still has the new realm (no stale save)", after.realm === 1 && after.stage === 1 && after.exp === 0 && after.bt_started_at === null, JSON.stringify(after));
else check("after leaving, D1 has stage 9 and no marker", after.realm === 0 && after.stage === 9 && after.bt_started_at === null, JSON.stringify(after));

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

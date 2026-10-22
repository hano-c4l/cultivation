// Local test of the teleport array and the effect messages (phase 2k): the array lists the other town with its price, takes the Linh Thạch with the
// trip (not before, not when the channel is broken), and everyone who sees a skill, a channel or a boss cone is told.
// Usage: node tools/waygate-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and PK_DROP_FORCE=1 (the PvP item drop always succeeds) in .dev.vars. Never run it against preview or production.
import { CAVE_ARRIVAL, FOREST_ARRIVAL, FOREST_E_ARRIVAL, T, TOWN_ARRIVAL } from "./world.mjs";
import { execFileSync } from "node:child_process";
import { getMap } from "../shared/src/map.ts";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const CH = 3;
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
async function makePlayer(tag, map, x, y, satNhan = 0) {
  const reg = await post("/api/register", { email: `wg-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}

import { TOWN_WAYGATE, FOREST_BY_WOLVES } from "./world.mjs";

const town = getMap("town");
const balanceOf = (c) => [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance ?? c.welcome.wallet.linh_thach;

// A character standing on the array, with a few Linh Thạch, and a friend beside it who watches.
const p = await makePlayer("P", "town", TOWN_WAYGATE[0] + 0.5, TOWN_WAYGATE[1]);
const w = await makePlayer("W", "town", TOWN_WAYGATE[0] - 0.5, TOWN_WAYGATE[1]);
const adminReg = await post("/api/register", { email: `wg-admin-${run}@example.test`, password: "correct-horse-battery" });
await post("/api/character", { name: `Chu${run.slice(-4)}`, gender: "male" }, adminReg.cookie);
sql(`UPDATE accounts SET role='admin' WHERE email='wg-admin-${run}@example.test'`);

let c = await connect(p.cookie);
const cw = await connect(w.cookie);
let r = await after(c, { t: "npc_open", npc: "waygate" });
const list = r.find((m) => m.t === "waygate");
check("the array lists the other main town with its price", list?.dests.length === 1 && list.dests[0].map === "town2" && list.dests[0].price === 4500, JSON.stringify(list));

r = await after(c, { t: "waygate_go", npc: "waygate", to: "town2" }, 700);
check("without the Linh Thạch the trip does not start", r.some((m) => m.t === "tp_end" && m.reason === "money") && !r.some((m) => m.t === "tp"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "waygate_go", npc: "waygate", to: "town" }, 500);
check("a trip to the town it stands in is refused", r.some((m) => m.t === "inv_error") && !r.some((m) => m.t === "tp"));
r = await after(c, { t: "waygate_go", npc: "waygate", to: "forest" }, 500);
check("a trip to a map that is not a main town is not even understood", !r.some((m) => m.t === "tp"));

await post("/api/admin/grant", { characterId: p.id, currency: "linh_thach", amount: 10000, reason: "smoke", idempotencyKey: crypto.randomUUID() }, adminReg.cookie);
await sleep(600);
const before = sql(`SELECT balance FROM currency_balances WHERE character_id = '${p.id}' AND currency = 'linh_thach'`)[0].balance;
r = await after(c, { t: "waygate_go", npc: "waygate", to: "town2" }, 700);
check("with the Linh Thạch the five second channel starts and nothing is taken yet", r.some((m) => m.t === "tp" && m.ms === 5000 && m.item === "waygate") && sql(`SELECT balance FROM currency_balances WHERE character_id = '${p.id}' AND currency = 'linh_thach'`)[0].balance === before);
check("the player next to them sees the channel start (an effect message)", cw.log.some((m) => m.t === "fx_channel" && m.id === p.id && m.what === "tp" && m.on === true), JSON.stringify(cw.log.filter((m) => m.t === "fx_channel")));

// Moving breaks it and costs nothing.
r = await after(c, { t: "move", x: TOWN_WAYGATE[0] + 2, y: TOWN_WAYGATE[1] + 2, fx: TOWN_WAYGATE[0] + 0.5, fy: TOWN_WAYGATE[1], seq: 1 }, 700);
check("moving breaks the channel and the Linh Thạch stays", r.some((m) => m.t === "tp_end" && m.ok === false && m.reason === "moved") && sql(`SELECT balance FROM currency_balances WHERE character_id = '${p.id}' AND currency = 'linh_thach'`)[0].balance === before);
check("the watcher is told it ended", cw.log.some((m) => m.t === "fx_channel" && m.id === p.id && m.on === false));
await sleep(2500); // the step ends

// A full channel takes the fee and the character in one go.
r = await after(c, { t: "waygate_go", npc: "waygate", to: "town2" }, 700);
await sleep(5800);
check("left alone the channel ends in a transfer to the second town", c.log.some((m) => m.t === "transfer" && m.map === "town2"), JSON.stringify(c.log.slice(-4).map((m) => m.t)));
await sleep(600);
const row = sql(`SELECT map_id FROM characters WHERE id = '${p.id}'`)[0];
const after1 = sql(`SELECT balance FROM currency_balances WHERE character_id = '${p.id}' AND currency = 'linh_thach'`)[0].balance;
check("the character is saved in the second town and 4500 Linh Thạch went in the same step", row.map_id === "town2" && after1 === before - 4500, `${row.map_id}, ${before} -> ${after1}`);
const ledger = sql(`SELECT delta, reason FROM currency_ledger WHERE character_id = '${p.id}' AND reason = 'waygate'`);
check("the ledger has one entry for the trip", ledger.length === 1 && ledger[0].delta === -4500, JSON.stringify(ledger));
c.ws.close();
cw.ws.close();

// Skills are drawn for everyone who sees them: a cast in the forest reaches a watcher too.
const a = await makePlayer("A", "forest", ...FOREST_BY_WOLVES);
const b = await makePlayer("B", "forest", FOREST_BY_WOLVES[0] + 1, FOREST_BY_WOLVES[1]);
for (const id of ["chuong_0", "hoi_0"]) sql(`INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('${a.id}', '${id}', 1, 'root', 0)`);
await sleep(2500);
const ca = await connect(a.cookie);
const cb = await connect(b.cookie);
const prey = ca.welcome.monsters.find((m) => !m.guard);
r = await after(ca, { t: "cast", skill: "hoi_0" }, 900);
check("a heal is announced to the caster and to a watcher", ca.log.some((m) => m.t === "fx" && m.id === a.id && m.skill === "hoi_0") && cb.log.some((m) => m.t === "fx" && m.id === a.id && m.skill === "hoi_0"), JSON.stringify(cb.log.filter((m) => m.t === "fx")));
ca.send({ t: "cast", skill: "chuong_0", target: prey.id, el: "kim" });
await ca.wait((m) => m.t === "fx" && m.skill === "chuong_0", 15000, "the attack effect").catch(() => null);
const atk = ca.log.find((m) => m.t === "fx" && m.skill === "chuong_0");
check("an attack skill is announced with its target and the element it used", atk?.to === prey.id && typeof atk?.el === "string", JSON.stringify(atk));
check("the watcher saw the attack too", cb.log.some((m) => m.t === "fx" && m.skill === "chuong_0" && m.to === prey.id));
ca.ws.close();
cb.ws.close();

console.log(failures === 0 ? "all waygate checks passed" : `${failures} waygate check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

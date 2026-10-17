// Local test of gear (phase 2b): gender at creation, wearing and taking off (gender / level / broken refusals, rings and
// replacing), persistence, repair (price, funds), pieces that come off by themselves at join, and durability lost on death.
// Usage: node tools/equipment-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars. Never run it against preview or production.
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
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie, ch = 6) {
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

const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

/** Sends one command and returns the messages the server answered with. */
async function after(c, msg, wait = 600) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}

/** The bag as the client would rebuild it from the welcome and the deltas. */
function bagOf(c) {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) {
    if (m.t !== "inv") continue;
    if (m.full) items.clear();
    for (const i of m.items) items.set(i.id, i);
    for (const id of m.removed) items.delete(id);
  }
  return [...items.values()];
}
const wornOf = (c) => [...c.log].reverse().find((m) => m.t === "eq")?.items ?? c.welcome.equipped;
const cellOf = (c, type) => bagOf(c).find((i) => i.type === type);

// --- creation: the gender is chosen, validated, stored ---
const reg = await post("/api/register", { email: `eq-${run}@example.test`, password: "correct-horse-battery" });
const bad = await post("/api/character", { name: `Xấu ${run.slice(-4)}`, gender: "robot" }, reg.cookie);
check("an unknown gender is rejected", bad.status === 400 && bad.data.error === "invalid_gender");
const created = await post("/api/character", { name: `Giáp ${run.slice(-4)}`, gender: "female_wears_male" }, reg.cookie);
check("a crossed gender is accepted and stored", created.status === 201 && created.data.character.gender === "female_wears_male");
const charId = created.data.character.id;
const give = (item) => fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${charId}&item=${item}&qty=1`).then((r) => r.json());

let c = await connect(reg.cookie);
check("the welcome carries the gender and no worn gear", c.welcome.character.gender === "female_wears_male" && c.welcome.equipped.length === 0);

// --- wearing ---
for (const item of ["eq.hat.m.0.1.1", "eq.hat.f.0.1.1", "eq.weapon.u.0.1.1", "eq.weapon.u.1.9.4", "eq.ring.u.0.1.1", "eq.ring.u.0.1.1", "eq.ring.u.0.1.1"]) await give(item);
await sleep(800);
check("loot of gear lands in the bag with durability", bagOf(c).filter((i) => i.dur === 100 && i.max === 100).length === 7);

let r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.hat.m.0.1.1").cell });
check("wearing a male hat works for a female character in male gear", r.some((m) => m.t === "eq" && m.items.some((e) => e.slot === "hat")));
r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.hat.f.0.1.1").cell });
check("the female hat is refused (gender)", r.some((m) => m.t === "inv_error" && m.reason === "gender"));
r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.weapon.u.1.9.4").cell });
check("a weapon above the character's level is refused", r.some((m) => m.t === "inv_error" && m.reason === "level"));
r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.weapon.u.0.1.1").cell, slot: "hat" });
check("a weapon cannot go in the hat slot", r.some((m) => m.t === "inv_error" && m.reason === "slot"));
r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.weapon.u.0.1.1").cell });
check("the weapon goes to the weapon slot", r.some((m) => m.t === "eq" && m.items.some((e) => e.slot === "weapon")));
for (let i = 0; i < 3; i++) await after(c, { t: "eq_equip", tab: 0, cell: bagOf(c).find((x) => x.type === "eq.ring.u.0.1.1").cell });
const slots = wornOf(c).map((e) => e.slot).sort();
check("two rings are worn, the third replaced one (slots stay unique)", slots.filter((s) => s.startsWith("ring")).length === 2, slots.join(","));
check("one ring is back in the bag", bagOf(c).filter((i) => i.type === "eq.ring.u.0.1.1").length === 1);
r = await after(c, { t: "eq_unequip", slot: "ring2" });
check("taking a ring off returns it to the bag", r.some((m) => m.t === "eq" && !m.items.some((e) => e.slot === "ring2")) && bagOf(c).filter((i) => i.type === "eq.ring.u.0.1.1").length === 2);

// --- persistence and the wire view of worn gear ---
c.ws.close();
await sleep(600);
c = await connect(reg.cookie);
check("worn gear is still worn after reconnecting", ["hat", "ring1", "weapon"].every((s) => c.welcome.equipped.some((e) => e.slot === s)), c.welcome.equipped.map((e) => e.slot).join(","));

// --- repair: needs money, costs by lost points, one batch ---
c.ws.close();
await sleep(500);
sql(`UPDATE item_instances SET durability = 50 WHERE owner_character_id = '${charId}' AND equip_slot = 'hat'`);
c = await connect(reg.cookie);
r = await after(c, { t: "eq_repair", slot: "all" });
check("repair without Linh Thạch is refused", r.some((m) => m.t === "inv_error" && m.reason === "funds"));
sql(`INSERT INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'linh_thach', 1000)`);
sql(`INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES ('${charId}', 'linh_thach', 1000, 'test', 'smoke', 'eq-smoke-${run}', 0)`);
r = await after(c, { t: "eq_repair", slot: "all" });
const rep = r.find((m) => m.t === "repaired");
check("repairing 50 lost points of a Hạ phẩm hat costs 50 Linh Thạch", rep?.cost === 50);
check("the wallet shows the debit", r.some((m) => m.t === "wallet" && m.balance === 950));
check("the hat is whole again", sql(`SELECT durability FROM item_instances WHERE owner_character_id = '${charId}' AND equip_slot = 'hat'`)[0].durability === 100);
check("ledger and balance agree", sql(`SELECT (SELECT SUM(delta) FROM currency_ledger WHERE character_id = '${charId}') AS l, (SELECT balance FROM currency_balances WHERE character_id = '${charId}') AS b`)[0].l === 950);
r = await after(c, { t: "eq_repair", slot: "all" });
check("nothing left to repair", r.some((m) => m.t === "inv_error" && m.reason === "nothing"));

// --- a worn piece that is broken comes off at join ---
c.ws.close();
await sleep(500);
sql(`UPDATE item_instances SET durability = 0 WHERE owner_character_id = '${charId}' AND equip_slot = 'weapon'`);
c = await connect(reg.cookie);
check("a broken piece is taken off at join", !c.welcome.equipped.some((e) => e.slot === "weapon") && c.welcome.bag.items.some((i) => i.type === "eq.weapon.u.0.1.1" && i.dur === 0));
await sleep(400);
check("the player is told", c.log.some((m) => m.t === "eq_removed" && m.items[0].reason === "broken"));
r = await after(c, { t: "eq_equip", tab: 0, cell: cellOf(c, "eq.weapon.u.0.1.1").cell });
check("a broken piece cannot be worn again", r.some((m) => m.t === "inv_error" && m.reason === "broken"));
r = await after(c, { t: "eq_repair", slot: "weapon" });
check("a broken piece is not repaired (not even by slot)", r.some((m) => m.t === "inv_error"));

// --- death wears every worn piece by 5%; a piece that breaks comes off and the dying socket is told ---
c.ws.close();
await sleep(500);
sql(`UPDATE item_instances SET durability = 3 WHERE owner_character_id = '${charId}' AND equip_slot = 'hat'`);
c = await connect(reg.cookie);
c.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(5500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer");
await sleep(500);
c = await connect(reg.cookie, 6);
const here = c.welcome.players.find((p) => p.id === charId).path[0];
c.send({ t: "move", x: 46.5, y: 24.5, fx: here[0], fy: here[1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1);
await sleep((Math.hypot(46.5 - here[0], 24.5 - here[1]) / 4) * 1000 + 5000);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "east gate");
await sleep(500);
c = await connect(reg.cookie, 6);
check("in the cave with the hat and a ring worn", c.welcome.map === "cave" && c.welcome.equipped.length === 2);
c.send({ t: "move", x: 14.5, y: 20.5, fx: 3.5, fy: 20.5, seq: 1 });
await c.wait((m) => m.t === "died", 90000, "dying to cave monsters");
await c.wait((m) => m.t === "transfer", 5000);
const iDied = c.log.findIndex((m) => m.t === "died");
const iMove = c.log.findIndex((m) => m.t === "transfer");
const told = c.log.find((m) => m.t === "eq_removed");
check("the dying socket is told the hat broke and came off", told?.items[0]?.reason === "broken" && told.items[0].type === "eq.hat.m.0.1.1", told ? "" : "no eq_removed");
check("... and that the rest wore down", c.log.some((m) => m.t === "eq_worn") && c.log.some((m) => m.t === "eq" && m.items.length === 1 && m.items[0].dur === 95));
check("... before the transfer to town", iDied >= 0 && c.log.indexOf(told) < iMove);
await sleep(600);
c = await connect(reg.cookie, 6);
check("the town welcome shows the broken hat in the bag and the ring at 95", c.welcome.bag.items.some((i) => i.type === "eq.hat.m.0.1.1" && i.dur === 0) && c.welcome.equipped.length === 1 && c.welcome.equipped[0].dur === 95, c.welcome.equipped.map((e) => e.dur).join(","));
c.ws.close();

console.log(failures === 0 ? "equipment smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

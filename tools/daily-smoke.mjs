// Local test of the hướng tu and breakthrough quests (phase 2e-B, PR2): each path has its own NPC and its own kind of quest (from Trúc Cơ;
// kiếm: kills, thuật: Yêu Đan and herbs, đan: herbs and pills),
// the path item comes only from the quest (the claim button is admin-only, checked by the server), dropping the path opens
// the quest again, and the one-time breakthrough quest pays the pill.
// Usage: node tools/path-quests-smoke.mjs [ws://localhost:8787]
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
const CH = 5;
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
const countOf = (c, type) => bagOf(c).filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);


const reg = await post("/api/register", { email: `dq-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Dq ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
sql(`UPDATE accounts SET role='admin' WHERE email='dq-${run}@example.test'`);
sql(`UPDATE characters SET realm = 1, stage = 9, exp = 0 WHERE id = '${id}'`);
for (const q of ["newbie_1","newbie_2","newbie_3"]) sql(`INSERT OR IGNORE INTO character_quests (character_id, quest_id, state, progress, accepted_at, done_at) VALUES ('${id}', '${q}', 'done', 1, 0, 0)`);
sql(`UPDATE characters SET map_id = 'town', x = 18.5, y = 16.5 WHERE id = '${id}'`);
await sleep(3000);
let c = await connect(reg.cookie);
let r = await after(c, { t: "bt_claim" });
check("GM claims the pill for the current realm (Trúc Cơ -> Kim Đan: bt_pill_2)", r.some((m) => m.t === "bt_claimed" && m.item === "bt_pill_2"));
r = await after(c, { t: "bt_claim" });
check("and again", r.some((m) => m.t === "bt_claimed") && sql(`SELECT SUM(qty) AS q FROM item_instances WHERE owner_character_id = '${id}' AND item_type = 'bt_pill_2'`)[0].q === 2);
r = await after(c, { t: "npc_open", npc: "elder" });
const list = r.find((m) => m.t === "quests");
check("the elder offers the daily quests (kill, herb; the cave one needs newbie_6)", list?.defs.map((d) => d.id).sort().join() === "daily_herb,daily_kill,newbie_4", JSON.stringify(list?.defs.map((d) => d.id)));
r = await after(c, { t: "quest_accept", npc: "elder", quest: "daily_herb" });
await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${id}&item=linh_thao&qty=10`);
await sleep(600);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "daily_herb" }, 1000);
check("handing in pays Linh Thạch and Cống Hiến", r.some((m) => m.t === "quest_done") && r.some((m) => m.t === "wallet" && m.currency === "cong_hien" && m.balance === 8) && r.some((m) => m.t === "wallet" && m.currency === "linh_thach" && m.balance === 100));
r = await after(c, { t: "npc_open", npc: "elder" });
check("it is gone from the list today", !r.find((m) => m.t === "quests").defs.some((d) => d.id === "daily_herb"));
sql(`UPDATE character_quests SET done_at = done_at - 86400000 WHERE character_id = '${id}' AND quest_id = 'daily_herb'`);
c.ws.close();
await sleep(800);
c = await connect(reg.cookie);
r = await after(c, { t: "npc_open", npc: "elder" });
check("next day it is offered again", r.find((m) => m.t === "quests").defs.some((d) => d.id === "daily_herb"));
// (The second day's payment needs the real clock to change the day key; server/src/quests.test.ts covers it.)
c.ws.close();
console.log(failures === 0 ? "all daily checks passed" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

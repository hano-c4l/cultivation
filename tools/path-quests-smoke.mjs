// Local test of the hướng tu and breakthrough quests (phase 2e-B, PR2): each path has its own NPC and quest (from Trúc Cơ),
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

const reg = await post("/api/register", { email: `pq-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Hu ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
const adminReg = await post("/api/register", { email: `pq-admin-${run}@example.test`, password: "correct-horse-battery" });
await post("/api/character", { name: `Qt ${run.slice(-4)}` }, adminReg.cookie);
sql(`UPDATE accounts SET role='admin' WHERE email='pq-admin-${run}@example.test'`);
const qrow = (q) => sql(`SELECT state, progress FROM character_quests WHERE character_id = '${id}' AND quest_id = '${q}'`)[0];
const keyRows = (k) => sql(`SELECT COUNT(*) AS n FROM item_grants WHERE key = '${k}'`)[0].n;
const pathsOf = () => sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths;
const SPOT = { x: 24, y: 23 };

let c = await connect(reg.cookie);
const loot = async (item, qty) => {
  await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${id}&item=${item}&qty=${qty}`);
  await sleep(500);
};
const walk = async (to) => {
  const self = [...c.log].reverse().find((m) => m.t === "path")?.player.path.at(-1) ?? c.welcome.players.find((p) => p.id === c.welcome.self).path.at(-1);
  c.send({ t: "move", x: to.x, y: to.y, fx: self[0], fy: self[1], seq: Math.floor(Math.random() * 1e6) });
  await sleep(3200);
};

// --- the claim button is admin-only, on the server ---
let r = await after(c, { t: "path_claim", path: "kiem" });
check("a normal player cannot use the temporary claim button (the server refuses)", r.some((m) => m.t === "path_error" && m.reason === "admin") && countOf(c, "path_item_kiem") === 0);

// --- each path has its own NPC; Trúc Cơ is needed ---
await walk(SPOT);
r = await after(c, { t: "npc_open", npc: "path_kiem" });
const kiemList = r.find((m) => m.t === "quests");
check("the kiếm master offers only the kiếm quest", kiemList?.defs.length === 1 && kiemList.defs[0].id === "path_kiem", JSON.stringify(kiemList?.defs.map((d) => d.id)));
r = await after(c, { t: "quest_accept", npc: "path_kiem", quest: "path_kiem" });
check("below Trúc Cơ the quest cannot be taken", r.some((m) => m.t === "quest_error" && m.reason === "level") && !qrow("path_kiem"));
r = await after(c, { t: "quest_accept", npc: "path_kiem", quest: "path_dan" });
check("a master does not give another path's quest", r.some((m) => m.t === "quest_error" && m.reason === "invalid"));
c.ws.close();
await sleep(800);
sql(`UPDATE characters SET realm = 1, stage = 1, exp = 0 WHERE id = '${id}'`);
c = await connect(reg.cookie);
await walk(SPOT);
await after(c, { t: "quest_accept", npc: "path_kiem", quest: "path_kiem" });
check("at Trúc Cơ it is taken", qrow("path_kiem")?.state === "active");
r = await after(c, { t: "quest_turn_in", npc: "path_kiem", quest: "path_kiem" });
check("without the materials it is refused", r.some((m) => m.t === "quest_error" && m.reason === "not_ready"));
await loot("linh_thao", 10);
await loot("thu_cot", 4);
r = await after(c, { t: "quest_turn_in", npc: "path_kiem", quest: "path_kiem" });
check("one material short: still refused, nothing taken", r.some((m) => m.t === "quest_error" && m.reason === "not_ready") && countOf(c, "linh_thao") === 10 && countOf(c, "thu_cot") === 4);
await loot("thu_cot", 1);
r = await after(c, { t: "quest_turn_in", npc: "path_kiem", quest: "path_kiem" }, 1000);
check(
  "with all of it: the materials go and the Kiếm Tu Lệnh comes",
  r.some((m) => m.t === "quest_done") && countOf(c, "path_item_kiem") === 1 && countOf(c, "linh_thao") === 0 && countOf(c, "thu_cot") === 0 && keyRows(`path_item:${id}:kiem`) === 1,
);

// --- take the path, then drop it: the quest opens again ---
await after(c, { t: "path_choose", path: "kiem" }, 1000);
check("the item takes the character into the path", countOf(c, "path_item_kiem") === 0 && pathsOf().startsWith("kiem"), pathsOf());
await post("/api/admin/grant", { characterId: id, currency: "linh_thach", amount: 200000, reason: "smoke", idempotencyKey: crypto.randomUUID() }, adminReg.cookie);
c.ws.close();
await sleep(800);
c = await connect(reg.cookie);
await walk(SPOT);
await after(c, { t: "path_drop", path: "kiem" }, 1200);
check("dropping the path works", pathsOf() === "", pathsOf());
check("dropping it also reopened the quest (progress row and both one-time keys are gone)", !qrow("path_kiem") && keyRows(`path_item:${id}:kiem`) === 0 && keyRows(`quest:${id}:path_kiem`) === 0);
r = await after(c, { t: "npc_open", npc: "path_kiem" });
check("the master offers it as available again", !r.find((m) => m.t === "quests")?.states.path_kiem);
await after(c, { t: "quest_accept", npc: "path_kiem", quest: "path_kiem" });
await loot("linh_thao", 10);
await loot("thu_cot", 5);
r = await after(c, { t: "quest_turn_in", npc: "path_kiem", quest: "path_kiem" }, 1000);
check("and the item can be earned a second time", r.some((m) => m.t === "quest_done") && countOf(c, "path_item_kiem") === 1);

// --- a path item given before blocks the quest (no second item, materials kept) ---
sql(`INSERT INTO item_grants (key, created_at) VALUES ('path_item:${id}:thuat', 0)`);
r = await after(c, { t: "quest_accept", npc: "path_thuat", quest: "path_thuat" });
check("a path item given before (the old button) refuses the quest at accept time", r.some((m) => m.t === "quest_error" && m.reason === "claimed") && !qrow("path_thuat"));
// A quest taken before the key was spent (the old button used meanwhile) is refused at hand-in, before any material is taken.
sql(`DELETE FROM item_grants WHERE key = 'path_item:${id}:thuat'`);
await after(c, { t: "quest_accept", npc: "path_thuat", quest: "path_thuat" });
await loot("linh_thao", 10);
await loot("thu_cot", 5);
sql(`INSERT INTO item_grants (key, created_at) VALUES ('path_item:${id}:thuat', 0)`);
r = await after(c, { t: "quest_turn_in", npc: "path_thuat", quest: "path_thuat" });
check("or at hand-in (materials kept, no item)", r.some((m) => m.t === "quest_error" && m.reason === "claimed") && countOf(c, "linh_thao") === 10 && countOf(c, "path_item_thuat") === 0);

// --- the one-time breakthrough quest ---
c.ws.close();
await sleep(800);
for (let i = 1; i <= 6; i++) sql(`INSERT OR IGNORE INTO character_quests (character_id, quest_id, state, progress, accepted_at, done_at) VALUES ('${id}', 'newbie_${i}', 'done', 1, 0, 0)`);
sql(`UPDATE characters SET map_id = 'town', x = 18.5, y = 16.5 WHERE id = '${id}'`);
c = await connect(reg.cookie);
r = await after(c, { t: "npc_open", npc: "elder" });
check("the elder now offers the breakthrough quest", !!r.find((m) => m.t === "quests")?.defs.some((d) => d.id === "breakthrough_1"));
await after(c, { t: "quest_accept", npc: "elder", quest: "breakthrough_1" });
// The bag already holds 10 Linh Thảo and 5 Thú Cốt from the step above; top it up to exactly the quest's 20, 10 and 3.
await loot("linh_thao", 10);
await loot("thu_cot", 5);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "breakthrough_1" });
check("it needs all three materials (no Yêu Đan yet)", r.some((m) => m.t === "quest_error" && m.reason === "not_ready"));
await loot("yeu_dan", 3);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "breakthrough_1" }, 1000);
check("with them: the Đan Đột Phá Trúc Cơ is given and the quest is closed for good", r.some((m) => m.t === "quest_done") && countOf(c, "bt_pill_1") === 1 && qrow("breakthrough_1")?.state === "done");
c.ws.close();

console.log(failures === 0 ? "\nall path quest checks passed" : `\n${failures} path quest check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

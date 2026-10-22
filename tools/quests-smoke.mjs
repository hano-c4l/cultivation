// Local test of the quests (phase 2e-B): the whole newbie chain with a fresh character. Distance checks, locked/available,
// talk (opening the merchant), kills counted in the forest and kept across a room eviction, collect, reach, rewards paid once,
// and a second hand-in changing nothing.
// Usage: node tools/quests-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars. Never run it against preview or production.
import { T, TOWN_GATE, TOWN_SPAWN } from "./world.mjs";
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
const balanceOf = (c) => [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance ?? c.welcome.wallet.linh_thach;
const lastStats = (c) => [...c.log].reverse().find((m) => m.t === "stats")?.character ?? c.welcome.character;

const reg = await post("/api/register", { email: `quest-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Nv ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
const qrow = (q) => sql(`SELECT state, progress FROM character_quests WHERE character_id = '${id}' AND quest_id = '${q}'`)[0];
const NEAR_ELDER = { x: 18.5 + T, y: 16.5 + T };
const NEAR_MERCHANT = { x: 21.5 + T, y: 16.5 + T };

let c = await connect(reg.cookie);
const walk = async (to, from, ms = 2500) => {
  const self = [...c.log].reverse().find((m) => m.t === "path")?.player.path.at(-1) ?? from;
  c.send({ t: "move", x: to.x, y: to.y, fx: self[0], fy: self[1], seq: Math.floor(Math.random() * 1e6) });
  await sleep(ms);
};

// --- distance, locked and available ---
let r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_1" });
check("from far away the quest NPC refuses", r.some((m) => m.t === "quest_error" && m.reason === "far"));
await walk(NEAR_ELDER, TOWN_SPAWN);
r = await after(c, { t: "npc_open", npc: "elder" });
const list = r.find((m) => m.t === "quests");
check("opening the elder lists only what can be taken now (the first step; later ones are locked and hidden), nothing started", list?.defs.length === 1 && list.defs[0].id === "newbie_1" && Object.keys(list.states).length === 0, JSON.stringify(list?.defs.map((d) => d.id)));
r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_2" });
check("the second quest is locked until the first is done", r.some((m) => m.t === "quest_error" && m.reason === "locked"));
r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_1" });
check("accepting the first works and the tracker list follows", r.some((m) => m.t === "quest_active" && m.states.newbie_1?.state === "active") && qrow("newbie_1")?.state === "active");
r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_1" });
check("accepting it again is refused", r.some((m) => m.t === "quest_error" && m.reason === "already"));
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_1" });
check("handing in before talking to the merchant is refused", r.some((m) => m.t === "quest_error" && m.reason === "not_ready") && balanceOf(c) === 0);

// --- talk objective: opening the merchant ---
await walk(NEAR_MERCHANT, [18.5 + T, 16.5 + T]);
r = await after(c, { t: "npc_open", npc: "merchant" });
check("opening the merchant completes the talk objective", r.some((m) => m.t === "quest_progress" && m.quest === "newbie_1" && m.progress === 1) && qrow("newbie_1")?.progress === 1);
await walk(NEAR_ELDER, [21.5 + T, 16.5 + T]);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_1" }, 1000);
check("handing in pays Linh Thạch, EXP and items and closes it", r.some((m) => m.t === "quest_done") && balanceOf(c) === 50 && countOf(c, "hoi_huyet_dan") === 3 && lastStats(c).exp === 100 && qrow("newbie_1")?.state === "done", `balance ${balanceOf(c)}, exp ${lastStats(c).exp}`);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_1" });
check("handing in a second time changes nothing", r.some((m) => m.t === "quest_error") && balanceOf(c) === 50 && countOf(c, "hoi_huyet_dan") === 3);

// --- kills: counted in the forest, kept across an eviction ---
r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_2" });
check("the kill quest is accepted", qrow("newbie_2")?.state === "active" && qrow("newbie_2")?.progress === 0);
await walk({ x: TOWN_GATE[0], y: TOWN_GATE[1] }, [18.5 + T, 16.5 + T], 13_000);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "transfer to the forest");
await sleep(600);
c = await connect(reg.cookie);
check("the tracker shows the active quest after joining the forest", c.log.some((m) => m.t === "quest_active" && m.states.newbie_2?.state === "active"));

async function killOne() {
  const welcomeMons = c.welcome.monsters ?? [];
  const live = new Map(welcomeMons.map((m) => [m.id, m]));
  for (const m of c.log) if (m.t === "mon") live.set(m.monster.id, m.monster);
  const gone = new Set(c.log.filter((m) => m.t === "mon_gone").map((m) => m.id));
  const weakest = [...live.values()].filter((m) => !m.guard && !gone.has(m.id)).sort((x, y) => x.tier - y.tier || Number(x.rank !== "normal") - Number(y.rank !== "normal"));
  const prey = weakest[0];
  const mark = c.log.length;
  c.send({ t: "attack", id: prey.id });
  await c.wait((m) => m.t === "mon_gone" && m.id === prey.id, 60000, "monster dies");
  await sleep(300);
  return c.log.slice(mark).filter((m) => m.t === "quest_progress");
}
let prog = await killOne();
check("a kill in the forest counts for the quest", prog.some((m) => m.quest === "newbie_2" && m.progress === 1), JSON.stringify(prog));
c.ws.close();
await sleep(1000);
check("the progress was written when the player left", qrow("newbie_2")?.progress === 1, JSON.stringify(qrow("newbie_2")));

c = await connect(reg.cookie);
const evicted = (await (await fetch(`${httpBase}/api/dev/evict?room=forest:${CH}&force=1`)).json()).evicted === true;
check("the room was evicted (its copies are gone)", evicted);
prog = await killOne();
check("after the eviction the progress is 2, not 1: the saved value was loaded before counting", prog.some((m) => m.quest === "newbie_2" && m.progress === 2), JSON.stringify(prog));
c.ws.close();
await sleep(1000);
check("and it is written", qrow("newbie_2")?.progress === 2);

// --- back to town: finish the kill quest (the other kills are filled in by hand), then collect ---
sql(`UPDATE character_quests SET progress = 10 WHERE character_id = '${id}' AND quest_id = 'newbie_2'`);
sql(`UPDATE characters SET map_id = 'town', x = ${18.5 + T}, y = ${16.5 + T} WHERE id = '${id}'`);
c = await connect(reg.cookie);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_2" }, 1000);
check("the kill quest is handed in for its reward", r.some((m) => m.t === "quest_done" && m.quest === "newbie_2") && countOf(c, "duong_huyet_dan") === 3 && qrow("newbie_2")?.state === "done");

await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_3" });
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_3" });
check("collect: with no Linh Thảo it is refused", r.some((m) => m.t === "quest_error" && m.reason === "not_ready"));
await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${id}&item=linh_thao&qty=7`);
await sleep(800);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_3" }, 1000);
check("collect: 5 of the 7 Linh Thảo are taken, the reward comes", r.some((m) => m.t === "quest_done") && countOf(c, "linh_thao") >= 2 && countOf(c, "duong_huyet_dan") === 6, `linh thảo ${countOf(c, "linh_thao")} (kills may have dropped some)`);

// --- reach, rare kill (filled in by hand) and the last step ---
await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_4" });
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_4" });
check("reach: below stage 5 it is refused", r.some((m) => m.t === "quest_error" && m.reason === "not_ready"));
c.ws.close();
await sleep(800);
sql(`UPDATE characters SET stage = 5, exp = 0 WHERE id = '${id}'`);
c = await connect(reg.cookie);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_4" }, 1000);
check("reach: at stage 5 it is handed in", r.some((m) => m.t === "quest_done" && m.quest === "newbie_4"));
await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_5" });
c.ws.close();
await sleep(800);
sql(`UPDATE character_quests SET progress = 1 WHERE character_id = '${id}' AND quest_id = 'newbie_5'`);
sql(`UPDATE characters SET stage = 9, exp = 0 WHERE id = '${id}'`);
c = await connect(reg.cookie);
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_5" }, 1000);
check("the rare-kill quest is handed in", r.some((m) => m.t === "quest_done" && m.quest === "newbie_5") && countOf(c, "dai_hoi_huyet_dan") === 2);
await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_6" });
r = await after(c, { t: "quest_turn_in", npc: "elder", quest: "newbie_6" }, 1000);
check("the last quest pays the Ngộ Đạo Đan", r.some((m) => m.t === "quest_done" && m.quest === "newbie_6") && countOf(c, "ngo_dao_dan") === 1);
const expectedLinh = 50 + 100 + 60 + 300 + 500 + 1000;
// The kills in the forest may have dropped some Linh Thạch of their own, so the quests are checked through their ledger entries.
const paid = sql(`SELECT COALESCE(SUM(delta), 0) AS n FROM currency_ledger WHERE character_id = '${id}' AND reason = 'quest'`)[0].n;
check("the whole chain paid exactly once", paid === expectedLinh && balanceOf(c) >= expectedLinh && sql(`SELECT COUNT(*) AS n FROM character_quests WHERE character_id = '${id}' AND state = 'done'`)[0].n === 6, `quest ledger ${paid} / ${expectedLinh}, balance ${balanceOf(c)}`);
const ledger = sql(`SELECT COUNT(*) AS n FROM currency_ledger WHERE character_id = '${id}' AND reason = 'quest'`)[0].n;
check("six ledger entries, one per quest", ledger === 6, String(ledger));
c.ws.close();

console.log(failures === 0 ? "\nall quest checks passed" : `\n${failures} quest check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

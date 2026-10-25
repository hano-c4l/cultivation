// Local test of the second town (phase 2k): its merchant (Kim Đan and Nguyên Anh stock), blacksmith and elder, and its teleport talisman.
// Usage: node tools/town2-smoke.mjs [ws://localhost:8787]
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
  const reg = await post("/api/register", { email: `t2-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}

const town2 = getMap("town2");
const kimdan = getMap("kimdan");
const near = (id) => {
  const n = town2.npcs.find((x) => x.id === id);
  return [n.x + 1, n.y + 2];
};
const bagOf = (c) => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") for (const i of m.items) items.set(i.id, i);
  return [...items.values()];
};

// A Kim Đan character beside the second town's merchant, with some Linh Thạch from an admin.
const p = await makePlayer("P", "town2", ...near("merchant2"));
sql(`UPDATE characters SET realm = 2, stage = 3 WHERE id = '${p.id}'`);
const adminReg = await post("/api/register", { email: `t2-admin-${run}@example.test`, password: "correct-horse-battery" });
await post("/api/character", { name: `Chu${run.slice(-4)}`, gender: "male" }, adminReg.cookie);
sql(`UPDATE accounts SET role='admin' WHERE email='t2-admin-${run}@example.test'`);
const grant = await post("/api/admin/grant", { characterId: p.id, currency: "linh_thach", amount: 100000, reason: "smoke", idempotencyKey: crypto.randomUUID() }, adminReg.cookie);
check("the player was given Linh Thạch", grant.status === 200);

let c = await connect(p.cookie);
check("the character starts in the second town", c.welcome.map === "town2");
let r = await after(c, { t: "npc_open", npc: "merchant2" });
const shop = r.find((m) => m.t === "shop");
check("the second town's merchant opens, with the daily stock of the large healing pill and the tuning", !!shop && shop.left.dai_hoi_huyet_dan === 30 && !shop.left.linh_nguyen_dan && !!shop.tuning, JSON.stringify(shop?.left));
r = await after(c, { t: "shop_buy", npc: "merchant2", offer: "dai_hoi_huyet_dan", qty: 2 }, 900);
check("buying a Đại Hồi Huyết Đan works", r.some((m) => m.t === "shop_ok" && m.op === "buy" && m.item === "dai_hoi_huyet_dan"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "shop_buy", npc: "merchant2", offer: "linh_nguyen_dan", qty: 1 }, 600);
check("the brewed pills are not sold by the merchant any more", !r.some((m) => m.t === "shop_ok"));
r = await after(c, { t: "shop_buy", npc: "merchant2", offer: "hoi_huyet_dan", qty: 1 }, 600);
check("the first town's basic pill is not on its list", !r.some((m) => m.t === "shop_ok"));
r = await after(c, { t: "shop_buy", npc: "merchant2", offer: "ttp_town2", qty: 1 }, 900);
check("the talisman of the second town is for sale", r.some((m) => m.t === "shop_ok" && m.item === "ttp_town2"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "shop_buy", npc: "merchant2", offer: "ttp_town", qty: 1 }, 600);
check("the talisman of the first town is not", !r.some((m) => m.t === "shop_ok"));

// The blacksmith and the elder of the second town.
c.ws.close();
await sleep(600);
sql(`UPDATE characters SET x = ${near("smith2")[0]}, y = ${near("smith2")[1]} WHERE id = '${p.id}'`);
await sleep(2500);
c = await connect(p.cookie);
r = await after(c, { t: "npc_open", npc: "smith2" });
check("the second town's blacksmith answers with the rules and the tuning", r.some((m) => m.t === "smith" && m.levels.length === 10 && !!m.tuning), JSON.stringify(r.map((m) => m.t)));
c.ws.close();
await sleep(600);
sql(`UPDATE characters SET x = ${near("elder2")[0]}, y = ${near("elder2")[1]} WHERE id = '${p.id}'`);
await sleep(2500);
c = await connect(p.cookie);
r = await after(c, { t: "npc_open", npc: "elder2" });
const quests = r.find((m) => m.t === "quests");
const ids = quests?.defs.map((d) => d.id) ?? [];
check("the elder offers the Kim Đan pill quest and the daily hunt of the Kim Đan map", ids.includes("breakthrough_2") && ids.includes("daily_kimdan"), JSON.stringify(ids));
r = await after(c, { t: "quest_accept", npc: "elder2", quest: "daily_nguyenanh" }, 500);
check("a Kim Đan character cannot take the Nguyên Anh hunt", r.some((m) => m.t === "quest_error"), JSON.stringify(r));
r = await after(c, { t: "quest_accept", npc: "elder2", quest: "daily_kimdan" }, 500);
check("but can take the Kim Đan one", r.some((m) => m.t === "quest_active"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "quest_accept", npc: "elder", quest: "newbie_1" }, 500);
check("the first town's elder id does not work here", r.some((m) => m.t === "quest_error"));

// The talisman works from the Kim Đan map and brings the character to the second town.
c.ws.close();
await sleep(600);
const arrive = [kimdan.spawn[0] + 0.5, kimdan.spawn[1] + 0.5];
sql(`UPDATE characters SET map_id = 'kimdan', x = ${arrive[0]}, y = ${arrive[1]} WHERE id = '${p.id}'`);
await sleep(2500);
c = await connect(p.cookie);
check("the character stands on the Kim Đan map (guards in view at the gate)", c.welcome.map === "kimdan" && c.welcome.monsters.some((m) => m.guard));
r = await after(c, { t: "use_type", type: "ttp_town2" }, 600);
check("the talisman starts its channel", r.some((m) => m.t === "tp"), JSON.stringify(r.map((m) => m.t)));
await sleep(5800);
check("and takes the character to the second town", c.log.some((m) => m.t === "transfer" && m.map === "town2"));
c.ws.close();

console.log(failures === 0 ? "all town2 checks passed" : `${failures} town2 check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

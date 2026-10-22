// Local test of the vệ binh (phase 2f, PR2): guards at every gate (town, forest, cave), static in a safe map until a coloured name is in it,
// attacking orange names and leaving white ones alone.
// Usage: node tools/guard-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and PK_DROP_FORCE=1 (the PvP item drop always succeeds) in .dev.vars. Never run it against preview or production.
import { CAVE_ARRIVAL, FOREST_ARRIVAL, FOREST_E_ARRIVAL, T, TOWN_ARRIVAL } from "./world.mjs";
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
  const reg = await post("/api/register", { email: `gd-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}

// --- a white name in town sees the guards at the gate (the room has no simulation, they are static) and is left alone ---
const w = await makePlayer("W", "town", ...TOWN_ARRIVAL);
const cw = await connect(w.cookie);
const townGuards = cw.welcome.monsters.filter((m) => m.guard);
check("the town welcome lists the guards at the gate", townGuards.length === 2 && townGuards.every((g) => g.kind === "ve_binh"), JSON.stringify(cw.welcome.monsters));
await sleep(3000);
check("a white name beside them is not attacked", !cw.log.some((m) => m.t === "hit" && m.to === w.id));

// --- an orange name entering the town gate is attacked: the room starts its simulation for the guards ---
const o = await makePlayer("O", "town", ...TOWN_ARRIVAL, 300);
const co = await connect(o.cookie);
await sleep(300);
check("the orange name and the guards are in the room's simulation (guards listed)", co.welcome.monsters.filter((m) => m.guard).length === 2);
const hit = await co.wait((m) => m.t === "hit" && m.to === o.id && townGuards.some((g) => g.id === m.from), 15000, "a guard hitting the orange name").catch(() => null);
check("a guard in the safe town attacks an orange name", !!hit, JSON.stringify(co.log.filter((m) => m.t === "hit").slice(0, 3)));
check("and still leaves the white name alone", !cw.log.some((m) => m.t === "hit" && m.to === w.id));
co.ws.close();
cw.ws.close();

// --- the forest has guards at both gates, the cave at its gate ---
// (A combat map only tells a player about what is near them, so each gate is checked from its own arrival point.)
const f = await makePlayer("F", "forest", ...FOREST_ARRIVAL);
const cf = await connect(f.cookie);
check("the forest has two guards at the north gate", cf.welcome.monsters.filter((m) => m.guard).length === 2);
cf.ws.close();
const fe = await makePlayer("G", "forest", ...FOREST_E_ARRIVAL);
const cfe = await connect(fe.cookie);
check("the forest has two guards at the east gate", cfe.welcome.monsters.filter((m) => m.guard).length === 2);
cfe.ws.close();
const c2 = await makePlayer("C", "cave", ...CAVE_ARRIVAL);
const cc = await connect(c2.cookie);
check("the cave has two guards at its west gate", cc.welcome.monsters.filter((m) => m.guard).length === 2);
cc.ws.close();

// --- orange and red names may not deal with NPCs (the merchant and the elder), a white name beside them may ---
const m1 = await makePlayer("M", "town", 24.5 + T, 17.5 + T, 300);
const cm = await connect(m1.cookie);
let rr = await after(cm, { t: "npc_open", npc: "merchant" }, 1000);
check("an orange name beside the merchant is refused", rr.some((m) => m.t === "inv_error" && m.reason === "murderer") && !rr.some((m) => m.t === "shop"), JSON.stringify(rr));
cm.ws.close();
const e1 = await makePlayer("E", "town", 17.5 + T, 17.5 + T, 300);
const ce = await connect(e1.cookie);
rr = await after(ce, { t: "npc_open", npc: "elder" }, 1000);
check("an orange name beside the elder is refused", rr.some((m) => m.t === "quest_error" && m.reason === "murderer") && !rr.some((m) => m.t === "quests"), JSON.stringify(rr));
ce.ws.close();
const w2 = await makePlayer("V", "town", 24.5 + T, 17.5 + T, 0);
const cv = await connect(w2.cookie);
rr = await after(cv, { t: "npc_open", npc: "merchant" }, 1000);
check("a white name beside the merchant gets the shop", rr.some((m) => m.t === "shop"), JSON.stringify(rr.map((m) => m.t)));
cv.ws.close();

console.log(failures === 0 ? "all guard checks passed" : `${failures} guard check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

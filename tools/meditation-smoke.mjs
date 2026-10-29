// Local test of meditation (docs/PHASE2.md 2o): in a combat map nothing regenerates until the character sits down; sitting regenerates HP and MP; a step
// stands it up; gear that regenerates works standing; a town refuses to meditate.
// Usage: node tools/meditation-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars.
import { execFileSync } from "node:child_process";
import { FOREST_ARRIVAL, TOWN_ARRIVAL } from "./world.mjs";

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
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q.replace(/"/g, '\\"')}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
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
  return { ws, log, opened, send: (m) => ws.send(JSON.stringify(m)) };
}
async function connect(cookie) {
  const c = open(cookie);
  await c.opened;
  for (let i = 0; i < 100 && !c.log.some((m) => m.t === "welcome"); i++) await sleep(50);
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
async function after(c, msg, wait = 700) {
  const mark = c.log.length;
  if (msg) c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}

const reg = await post("/api/register", { email: `med-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Thi${run.slice(-5)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
const place = (map, [x, y], hp) => sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, vitals = '{"hp":${hp},"mp":1,"at":${Date.now()}}' WHERE id = '${id}'`);

// --- a combat map: nothing regenerates while standing ----------------------------------------------------------------------------------------------
place("forest", FOREST_ARRIVAL, 50);
await sleep(2500);
let c = await connect(reg.cookie);
check("the character is in the forest with the HP it left with", c.welcome.map === "forest" && c.welcome.hp === 50, `hp ${c.welcome.hp}`);
let r = await after(c, null, 3000);
check("standing: no HP comes back and no rate is sent but zero", !r.some((m) => m.t === "hp" && m.hp > 50) && c.log.some((m) => m.t === "regen" && m.hp === 0 && m.mp === 0), JSON.stringify(c.log.filter((m) => m.t === "regen")));

// --- sitting down -----------------------------------------------------------------------------------------------------------------------------------
r = await after(c, { t: "meditate", on: true }, 3500);
const rates = r.find((m) => m.t === "regen");
check("sitting is accepted and the rates are sent", r.some((m) => m.t === "meditating" && m.on === true) && !!rates && rates.hp > 0 && rates.mp > 0, JSON.stringify(rates));
const hpUp = r.filter((m) => m.t === "hp").map((m) => m.hp);
check("HP comes back by the second", hpUp.length >= 2 && hpUp[hpUp.length - 1] > 50, JSON.stringify(hpUp));
const mp = r.filter((m) => m.t === "mp").pop();
check("MP regenerates (the rate is a share of the maximum)", !!mp && mp.perSec > 0, JSON.stringify(mp));

// --- a step stands it up ---------------------------------------------------------------------------------------------------------------------------
r = await after(c, { t: "move", x: FOREST_ARRIVAL[0] + 1.2, y: FOREST_ARRIVAL[1] + 1.2, fx: FOREST_ARRIVAL[0], fy: FOREST_ARRIVAL[1], seq: 1 }, 700);
check("a step stands it up", r.some((m) => m.t === "meditating" && m.on === false && m.reason === "moved"), JSON.stringify(r.map((m) => m.t)));
const stopRates = c.log.filter((m) => m.t === "regen").pop();
check("and the rates drop to zero again", stopRates?.hp === 0 && stopRates?.mp === 0, JSON.stringify(stopRates));
const hpNow = c.log.filter((m) => m.t === "hp").pop()?.hp;
r = await after(c, null, 2500);
check("no more HP after standing up", !r.some((m) => m.t === "hp" && m.hp > hpNow), `hp ${hpNow}`);
await sleep(1500);

// --- gear that regenerates works standing ----------------------------------------------------------------------------------------------------------
const beltType = "eq.belt.u.0.1.1";
await fetch(`${httpBase}/api/dev/loot?room=forest:${CH}&char=${id}&item=${beltType}&qty=1`).then((x) => x.json());
await sleep(500);
r = await after(c, null, 300);
const bag = (c.log.filter((m) => m.t === "inv").flatMap((m) => m.items ?? []).concat(c.welcome.bag.items ?? [])).find((i) => i.type === beltType);
check("the belt arrived in the bag", !!bag);
if (bag) {
  r = await after(c, { t: "eq_equip", tab: bag.tab, cell: bag.cell, slot: "belt" }, 1200);
  const gear = c.log.filter((m) => m.t === "regen").pop();
  check("worn, the belt gives HP back while standing", gear?.hp > 0 && gear?.mp === 0, JSON.stringify(gear));
}
c.ws.close();

// --- a town needs no meditation --------------------------------------------------------------------------------------------------------------------
await sleep(800);
place("town", TOWN_ARRIVAL, 50);
await sleep(2500);
c = await connect(reg.cookie);
r = await after(c, { t: "meditate", on: true }, 700);
check("in a town sitting is refused", r.some((m) => m.t === "meditating" && m.on === false && m.reason === "safe"), JSON.stringify(r.map((m) => [m.t, m.reason])));
c.ws.close();

console.log(failures === 0 ? "all meditation checks passed" : `${failures} meditation check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

// Local test of the kill tasks of the sect (phase 5c-6): a member founds a sect, kills a monster in the forest (the room counts it), asks for the sect window there (the count
// is written to D1), goes back to the town through the gate (the count survives the move) and hands the hunting task in at the sect NPC.
// Usage: node tools/sect-kill-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars, a local D1 with the sect tuning row (any earlier run of the game or of sect-smoke.mjs seeds it) and
// migration 0068. It makes the task `hunt_bone` a kill day with a count of 1 for everybody, through `wrangler d1 execute --local`, and waits for the config to reload.
import { execFileSync, execSync } from "node:child_process";
import { FOREST_N_GATE, TOWN_ARRIVAL, TOWN_GATE, TOWN_SPAWN } from "./world.mjs";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const CH = 7;
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
const exec = (q) => execSync(`npx wrangler d1 execute DB --local --command "${q}"`, { stdio: "pipe" });
const rows = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=${CH}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => { if (ev.data !== "pong") log.push(JSON.parse(ev.data)); });
  const opened = new Promise((res) => { ws.addEventListener("open", () => res(true)); ws.addEventListener("error", () => res(false)); });
  const wait = async (pred, ms = 6000, label = "message", from = 0) => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.slice(from).find(pred);
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
  await c.wait((m) => m.t === "welcome", 8000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}

// The task as a kill day of one monster, for everybody.
const tuning = rows("SELECT value FROM game_tuning WHERE name = 'sect'");
if (tuning.length === 0) {
  console.error("no sect tuning row in the local D1: play once (or run tools/sect-smoke.mjs) so that it is seeded");
  process.exit(1);
}
exec(`UPDATE game_tuning SET value = json_set(value, '$.tasks[1].kill', json('{\\"count\\":1,\\"pct\\":100}')) WHERE name = 'sect'`);
exec(`UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'`);
console.log("waiting for the config to reload...");
await sleep(35_000);

const reg = await post("/api/register", { email: `sk-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Sk ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
exec(`UPDATE characters SET realm = 1, stat_can_cot = 300 WHERE id = '${id}'`);
exec(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 200000)`);
await sleep(5000);

let c = await connect(reg.cookie);
const lastSect = () => [...c.log].reverse().find((m) => m.t === "sect" && m.view);
const walk = async (to, ms) => {
  const self = [...c.log].reverse().find((m) => m.t === "path")?.player.path.at(-1) ?? TOWN_SPAWN;
  c.send({ t: "move", x: to[0], y: to[1], fx: self[0], fy: self[1], seq: Math.floor(Math.random() * 1e6) });
  await sleep(ms);
};
// The sect NPC of the first town stands at about (58.5, 47.5).
await walk([56.5, 47.5], 7000);
let m0 = c.log.length;
c.send({ t: "sect_create", npc: "sect", name: `Sn ${run.slice(-4)}` });
await c.wait((m) => m.t === "sect" && m.view, 8000, "the sect window", m0).catch(() => null);
check("the character founded a sect", !!lastSect());
check("the hunting task is a kill day", lastSect()?.view.taskMode?.hunt_bone === "kill", JSON.stringify(lastSect()?.view.taskMode));

// To the forest and one kill.
await walk(TOWN_GATE, 16_000);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "transfer to the forest");
await sleep(600);
c = await connect(reg.cookie);
async function killOne() {
  const live = new Map((c.welcome.monsters ?? []).map((m) => [m.id, m]));
  for (const m of c.log) if (m.t === "mon") live.set(m.monster.id, m.monster);
  const gone = new Set(c.log.filter((m) => m.t === "mon_gone").map((m) => m.id));
  const prey = [...live.values()].filter((m) => !m.guard && !gone.has(m.id)).sort((x, y) => x.tier - y.tier || Number(x.rank !== "normal") - Number(y.rank !== "normal"))[0];
  c.send({ t: "attack", id: prey.id });
  await c.wait((m) => m.t === "mon_gone" && m.id === prey.id, 60_000, "monster dies");
  await sleep(500);
}
await killOne();
m0 = c.log.length;
c.send({ t: "sect_get" });
const seen = await c.wait((m) => m.t === "sect" && m.view, 6000, "the window in the forest", m0).catch(() => null);
check("the window in the forest counts the kill", seen?.view.taskKills?.hunt_bone === 1, JSON.stringify(seen?.view.taskKills));
check("and it was written to D1", rows(`SELECT kills FROM sect_task_log WHERE character_id = '${id}' AND task_id = 'hunt_bone'`)[0]?.kills === 1);

// Back to the town (the gate in the north of the forest) and hand the task in.
await sleep(500);
c.send({ t: "move", x: FOREST_N_GATE[0], y: FOREST_N_GATE[1], fx: 0, fy: 0, seq: 1 });
await sleep(1000);
const self = [...c.log].reverse().find((m) => m.t === "path")?.player.path.at(-1) ?? [0, 0];
c.send({ t: "move", x: FOREST_N_GATE[0], y: FOREST_N_GATE[1], fx: self[0], fy: self[1], seq: 2 });
await sleep(20_000);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "transfer to the town").catch(() => null);
await sleep(600);
c = await connect(reg.cookie);
await walk([56.5, 47.5], 12_000);
m0 = c.log.length;
c.send({ t: "sect_task", npc: "sect", id: "hunt_bone" });
const done = await c.wait((m) => m.t === "sect" && m.view?.taskDone?.hunt_bone === 1, 8000, "the hand-in", m0).catch(() => null);
check("the kill task is handed in at the NPC after the move", !!done, JSON.stringify(done?.view?.taskDone));
check("and pays the cống hiến (25)", done?.view.contribution === 25, `${done?.view?.contribution}`);
// Walking back through the forest may have killed more (the character hits back); whatever it is, the turns taken never outnumber the kills.
await sleep(600);
c.send({ t: "sect_task", npc: "sect", id: "hunt_bone" });
await sleep(1500);
const row = rows(`SELECT kills, n FROM sect_task_log WHERE character_id = '${id}' AND task_id = 'hunt_bone'`)[0];
check("a turn is only ever paid for the kills counted (n <= kills, at most the 2 a day)", !!row && row.n <= row.kills && row.n <= 2, JSON.stringify(row));

// leave the tuning row as it was
exec(`UPDATE game_tuning SET value = json_set(value, '$.tasks[1].kill', json('{\\"count\\":15,\\"pct\\":50}')) WHERE name = 'sect'`);
exec(`UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'`);
c.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

// Local test of the forge of the blacksmith (phase 5e, Luyện khí): the smith's brewing tab lists no jobs, a run takes the ore and the Linh Thạch, the job is ready after a
// second (the recipe is made quick through the local D1), and collecting it puts ONE piece of gear with rolled stats in the bag; collecting twice is refused.
// Usage: node tools/forge-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars and migration 0070. Waits for the config to reload (35 s).
import { execFileSync } from "node:child_process";
import { TOWN_SMITH_NEAR, TOWN_SPAWN } from "./world.mjs";

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

// The first recipe of the forge made quick for the test.
const row = sql("SELECT value FROM game_tuning WHERE name = 'forge'");
if (row.length === 0) {
  console.error("no forge tuning row in the local D1: start the game once (any join seeds it)");
  process.exit(1);
}
sql("UPDATE game_tuning SET value = json_set(value, '$.recipes[0].seconds', 1, '$.recipes[0].exp', 10, '$.recipes[1].seconds', 1, '$.levels', json('[10, 100, 250, 600, 1400]')) WHERE name = 'forge'");
sql("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
console.log("waiting for the config to reload...");
await sleep(35_000);

const reg = await post("/api/register", { email: `fg-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Fg ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 100000)`);
await sleep(4000);
await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${id}&item=ren_lk&qty=45`).then((r) => r.json()).catch(() => null);
await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${id}&item=ren_tc&qty=45`).then((r) => r.json()).catch(() => null);

const c = open(reg.cookie);
await c.opened;
await c.wait((m) => m.t === "welcome", 8000, "welcome");
const self = () => [...c.log].reverse().find((m) => m.t === "path")?.player.path.at(-1) ?? TOWN_SPAWN;
c.send({ t: "move", x: TOWN_SMITH_NEAR[0], y: TOWN_SMITH_NEAR[1], fx: self()[0], fy: self()[1], seq: 1 });
await sleep(9000);

let m0 = c.log.length;
c.send({ t: "npc_open", npc: "smith", view: "brew" });
const tab = await c.wait((m) => m.t === "brew", 6000, "the forge tab", m0).catch(() => null);
check("the smith's brewing tab is the forge", tab?.craft === "forge" && tab.jobs.length === 0, JSON.stringify(tab && { craft: tab.craft, jobs: tab.jobs.length }));
check("and the blacksmith's tabs include it", !!tab?.tabs?.includes("brew"));

// Level 2 recipe at level 1: refused.
await sleep(600);
m0 = c.log.length;
c.send({ t: "brew_start", npc: "smith", recipe: "forge_belt_tc" });
const locked = await c.wait((m) => m.t === "inv_error", 4000, "the level refusal", m0).catch(() => null);
check("a recipe above the trade level is refused", locked?.reason === "craft_level", locked?.reason);

await sleep(600);
m0 = c.log.length;
c.send({ t: "brew_start", npc: "smith", recipe: "forge_ring_lk" });
const started = await c.wait((m) => m.t === "brew" && m.jobs.length === 1, 8000, "the job", m0).catch(() => null);
check("a run is started: one job", !!started, JSON.stringify(started?.jobs));
const wallet = [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach");
check("and costs the Linh Thạch (100000 - 20000)", wallet?.balance === 80_000, `${wallet?.balance}`);
check("the job copies the result: one piece of gear", started?.jobs[0]?.output === "eq.ring.u.0.3.2" && started.jobs[0].qty === 1);

await sleep(2500);
m0 = c.log.length;
c.send({ t: "brew_collect", npc: "smith", job: started.jobs[0].id });
const got = await c.wait((m) => m.t === "inv" && m.items?.some((i) => i.type === "eq.ring.u.0.3.2"), 8000, "the piece in the bag", m0).catch(() => null);
const piece = got?.items.find((i) => i.type === "eq.ring.u.0.3.2");
check("collecting puts the piece in the bag", !!piece && piece.qty === 1, JSON.stringify(piece));
check("with its durability and rolled stats", !!piece && piece.dur > 0 && !!piece.rs, JSON.stringify(piece && { dur: piece.dur, rs: piece.rs }));
const left = sql(`SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = '${id}' AND item_type = 'ren_lk'`)[0].q;
check("and the ore was used (45 - 40)", left === 5, `${left}`);

const afterCollect = await c.wait((m) => m.t === "brew" && m.craftExp === 10, 6000, "the exp after the collection", m0).catch(() => null);
check("the run gave its 10 trade exp (level 2 with the levels of this test)", !!afterCollect, JSON.stringify(afterCollect?.craftExp));
await sleep(600);
m0 = c.log.length;
c.send({ t: "brew_start", npc: "smith", recipe: "forge_belt_tc" });
const opened = await c.wait((m) => m.t === "brew" && m.jobs.some((j) => j.recipe === "forge_belt_tc"), 8000, "the level 2 job", m0).catch(() => null);
check("and now the level 2 recipe starts", !!opened);

await sleep(600);
m0 = c.log.length;
c.send({ t: "brew_collect", npc: "smith", job: started.jobs[0].id });
const again = await c.wait((m) => m.t === "inv_error", 4000, "second collection", m0).catch(() => null);
check("collecting twice is refused", again?.reason === "invalid", again?.reason);

sql("UPDATE game_tuning SET value = json_set(value, '$.recipes[0].seconds', 600) WHERE name = 'forge'");
sql("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
c.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

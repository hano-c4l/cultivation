// Local test of the alchemist (Đan Sư): its window has a shop tab and a brewing tab, a far player is refused, a brewing takes the materials and Linh Thạch at
// once, cannot be collected early, can be collected once when ready, and the blacksmith's window now offers a trading tab.
// Usage: node tools/alchemist-smoke.mjs [ws://localhost:8787]   (takes about 70 seconds: the first recipe brews for 60)
// Local only; needs DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and the 0041 migration (npm run db:migrate:local). It credits the throwaway character
// through `wrangler d1 execute --local`.
import { T, town } from "./world.mjs";
import { execSync } from "node:child_process";
const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
function open(cookie, ch) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
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

const alchemist = town.npcs.find((n) => n.id === "alchemist");
const reg = await post("/api/register", { email: `al-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Đan ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const give = (item, qty = 1) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${charId}&item=${item}&qty=${qty}`).then((r) => r.json());
const sql = (q) => execSync(`npx wrangler d1 execute DB --local --command "${q}"`, { stdio: "pipe" });
sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'linh_thach', 100000)`);
await sleep(5000);

const c = open(reg.cookie, 7);
await c.opened;
const welcome = await c.wait((m) => m.t === "welcome", 6000, "welcome");
await give("linh_thao", 12);
await give("yeu_dan", 3);
await sleep(1500);
const bagNow = () => {
  const items = new Map((welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const count = (type) => bagNow().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);
const linh = () => [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance;
check("the dev loot gave the materials", count("linh_thao") === 12 && count("yeu_dan") === 3);

// From the spawn the alchemist is too far.
let mark = c.log.length;
c.send({ t: "brew_start", npc: "alchemist", recipe: "linh_nguyen_dan" });
const far = await c.wait((m) => m.t === "inv_error", 4000, "far refusal", mark);
check("a player far from the alchemist is refused", far.reason === "far", far.reason);

// Walk to it.
const spawn = welcome.players.find((p) => p.id === charId).path[0];
c.send({ t: "move", x: alchemist.x, y: alchemist.y + 2, fx: spawn[0], fy: spawn[1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1, 4000, "ack");
await sleep(5500);

mark = c.log.length;
c.send({ t: "npc_open", npc: "alchemist" });
const shop = await c.wait((m) => m.t === "shop", 5000, "the alchemist's shop", mark);
check("the alchemist opens a shop with a brewing tab", shop.tabs.includes("shop") && shop.tabs.includes("brew"), shop.tabs.join(","));
check("it sells healing pills and not the brewed ones", shop.merchant.stock.some((r) => r.id === "hoi_huyet_dan") && !shop.merchant.stock.some((r) => r.id === "linh_nguyen_dan"));
await sleep(400);
mark = c.log.length;
c.send({ t: "npc_open", npc: "alchemist", view: "brew" });
const brew0 = await c.wait((m) => m.t === "brew", 5000, "the brewing tab", mark);
check("the brewing tab starts empty with the recipes in the tuning", brew0.jobs.length === 0 && brew0.tuning.alchemy.recipes.length >= 3);

await sleep(400);
const before = linh();
mark = c.log.length;
c.send({ t: "brew_start", npc: "alchemist", recipe: "linh_nguyen_dan" });
const brew1 = await c.wait((m) => m.t === "brew" || m.t === "inv_error", 6000, "brewing started", mark);
check("a brewing starts", brew1.t === "brew" && brew1.jobs.length === 1, brew1.reason ?? "");
await sleep(500);
check("the materials were taken at once", count("linh_thao") === 2 && count("yeu_dan") === 1, `${count("linh_thao")} / ${count("yeu_dan")}`);
check("the Linh Thạch was taken at once", before !== undefined ? linh() === before - 5000 : (linh() ?? 100000) < 100000, `${linh()}`);

// A second brewing lacks the materials.
await sleep(300);
mark = c.log.length;
c.send({ t: "brew_start", npc: "alchemist", recipe: "linh_nguyen_dan" });
const lack = await c.wait((m) => m.t === "inv_error", 4000, "missing materials", mark);
check("a brewing without the materials is refused", lack.reason === "brew_mats", lack.reason);

// Too early to collect.
await sleep(300);
const job = brew1.jobs[0];
mark = c.log.length;
c.send({ t: "brew_collect", npc: "alchemist", job: job.id });
const early = await c.wait((m) => m.t === "inv_error", 4000, "early collection", mark);
check("collecting before it is ready is refused", early.reason === "brew_wait", early.reason);

// The blacksmith offers a trading tab (walk there first: the alchemist is out of its reach).
console.log("waiting for the brewing...");
await sleep(Math.max(0, job.readyAt - brew1.now) + 2500);
mark = c.log.length;
c.send({ t: "brew_collect", npc: "alchemist", job: job.id });
await c.wait((m) => m.t === "brew" || m.t === "inv_error", 6000, "collection", mark);
await sleep(600);
check("the pill is in the bag after collecting", count("linh_nguyen_dan") === 1, `${count("linh_nguyen_dan")}`);
await sleep(300);
mark = c.log.length;
c.send({ t: "brew_collect", npc: "alchemist", job: job.id });
const twice = await c.wait((m) => m.t === "inv_error", 4000, "second collection", mark);
check("a second collection of the same brewing is refused", twice.reason === "invalid", twice.reason);

const smith = town.npcs.find((n) => n.id === "smith");
const here = alchemist;
c.send({ t: "move", x: smith.x + 2, y: smith.y, fx: here.x, fy: here.y + 2, seq: 2 });
await c.wait((m) => m.t === "ack" && m.seq === 2, 4000, "ack");
await sleep(5500);
mark = c.log.length;
c.send({ t: "npc_open", npc: "smith" });
const sm = await c.wait((m) => m.t === "smith", 5000, "the smith window", mark);
check("the blacksmith's window offers a trading tab", sm.tabs.join(",") === "smith,shop", sm.tabs.join(","));
await sleep(400);
mark = c.log.length;
c.send({ t: "npc_open", npc: "smith", view: "shop" });
const smShop = await c.wait((m) => m.t === "shop", 5000, "the smith's shop", mark);
check("the blacksmith's shop sells gear", smShop.merchant.stock.some((r) => r.kind === "gear"));

c.ws.close();
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
void T;

// Local test of the blacksmith: the window answers with the rules, an upgrade costs ore and Linh Thạch and either raises the piece or
// builds a bonus chance, the level is saved with the piece, a far player and a player's own eq_repair are refused, the merchant sells the
// Hộ Cấp Phù for Tiên Ngọc. Usage: node tools/smith-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and the 0028 migration (npm run db:migrate:local). It credits the throwaway
// character through `wrangler d1 execute --local`.
import { T, TOWN_SMITH_NEAR } from "./world.mjs";
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
const TYPE = "eq.robe.m.0.1.1";
const reg = await post("/api/register", { email: `sm-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Thợ ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const give = (item, qty = 1) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${charId}&item=${item}&qty=${qty}`).then((r) => r.json());
const sql = (q) => execSync(`npx wrangler d1 execute DB --local --command "${q}"`, { stdio: "pipe" });
sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'linh_thach', 100000)`);
sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'tien_ngoc', 100)`);
await sleep(5000);

let c = open(reg.cookie, 7);
await c.opened;
await c.wait((m) => m.t === "welcome", 6000, "welcome");
await give(TYPE);
await give("ren_lk", 40);
await sleep(1500);
const bagNow = () => {
  const items = new Map((c.log.find((m) => m.t === "welcome").bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const robe = () => bagNow().find((i) => i.type === TYPE);
check("the dev loot gave a robe and the ore", !!robe() && (bagNow().find((i) => i.type === "ren_lk")?.qty ?? 0) === 40);

// Walk away first (the spawn is next to the smith), then try from far: refused. A player's own eq_repair: refused.
const spawn = c.log.find((m) => m.t === "welcome").players.find((p) => p.id === charId).path[0];
c.send({ t: "move", x: 20.5 + T, y: 30.5 + T, fx: spawn[0], fy: spawn[1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1, 4000, "ack");
await sleep(5500);
let mark = c.log.length;
c.send({ t: "smith_upgrade", npc: "smith", tab: robe().tab, cell: robe().cell, protect: false });
const far = await c.wait((m) => m.t === "inv_error", 4000, "far refusal", mark);
check("a player far from the smith is refused", far.reason === "far", far.reason);
await sleep(300);
mark = c.log.length;
c.send({ t: "eq_repair", slot: "all" });
const forbidden = await c.wait((m) => m.t === "inv_error", 4000, "forbidden", mark);
check("the player's own repair command is refused (GM only)", forbidden.reason === "forbidden", forbidden.reason);

// Back to the smith (19.5, 20.5 in the old frame).
c.send({ t: "move", x: TOWN_SMITH_NEAR[0], y: TOWN_SMITH_NEAR[1], fx: 20.5 + T, fy: 30.5 + T, seq: 2 });
await c.wait((m) => m.t === "ack" && m.seq === 2, 4000, "ack");
await sleep(5500);
mark = c.log.length;
c.send({ t: "npc_open", npc: "smith" });
const rules = await c.wait((m) => m.t === "smith", 5000, "the smith window", mark);
check("the smith answers with the 10 levels of rules", rules.levels.length === 10 && rules.levels[0].level === 1, `${rules.levels.length}`);

await sleep(400); // the server spaces bag commands by 150 ms
// Upgrade until the first success (+1 is 90%); each attempt costs ore and Linh Thạch.
const linh = () => [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance;
let level = 0;
for (let i = 0; i < 6 && level < 2; i++) {
  mark = c.log.length;
  c.send({ t: "smith_upgrade", npc: "smith", tab: robe().tab, cell: robe().cell, protect: false });
  const res = await c.wait((m) => m.t === "smith_result" || m.t === "inv_error", 6000, "upgrade result", mark);
  if (res.t === "inv_error") {
    check("an upgrade attempt is accepted", false, res.reason);
    break;
  }
  level = res.level;
  await sleep(400);
}
check("the piece reached at least +1", level >= 1, `+${level}`);
const spentOre = 40 - (bagNow().find((i) => i.type === "ren_lk")?.qty ?? 0);
check("the attempts took ore", spentOre >= 1, `${spentOre} used`);
check("the attempts took Linh Thạch", (linh() ?? 100000) < 100000, `${linh()}`);
check("the level is in the bag item", robe()?.en === level, `en ${robe()?.en}`);
c.ws.close();
await sleep(800);
c = open(reg.cookie, 7);
await c.opened;
await c.wait((m) => m.t === "welcome", 6000, "welcome");
check("the level is kept after reconnecting", c.log.find((m) => m.t === "welcome").bag.items.find((i) => i.type === TYPE)?.en === level);

// Refining: raises some stats of the piece towards their maximum, never lowers, costs refining ore and Linh Thạch.
await give("tl_lk", 6);
await sleep(1200);
c.ws.close();
await sleep(800);
c = open(reg.cookie, 7);
await c.opened;
const wr = await c.wait((m) => m.t === "welcome", 6000, "welcome");
const robeR = wr.bag.items.find((i) => i.type === TYPE);
const rsBefore = robeR.rs;
c.send({ t: "move", x: TOWN_SMITH_NEAR[0], y: TOWN_SMITH_NEAR[1], fx: wr.players.find((p) => p.id === charId).path[0][0], fy: wr.players.find((p) => p.id === charId).path[0][1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1, 4000, "ack").catch(() => undefined);
await sleep(600);
const oreBefore = wr.bag.items.find((i) => i.type === "tl_lk")?.qty ?? 0;
let gainsSeen = false;
for (let i = 0; i < 3; i++) {
  mark = c.log.length;
  c.send({ t: "smith_refine", npc: "smith", tab: robeR.tab, cell: robeR.cell });
  const out = await c.wait((m) => m.t === "smith_refined" || m.t === "inv_error", 6000, "refine result", mark);
  if (out.t === "inv_error") { check("a refining is accepted", out.reason === "smith_full", out.reason); break; }
  if (Object.keys(out.gains).length > 0) gainsSeen = true;
  await sleep(400);
}
const inv = [...c.log].reverse().find((m) => m.t === "inv" && m.full);
const robeAfter = inv?.items.find((i) => i.id === robeR.id);
check("refining never lowered a stat", Object.keys(rsBefore).every((k) => robeAfter.rs[k] >= rsBefore[k]), `${JSON.stringify(rsBefore)} -> ${JSON.stringify(robeAfter?.rs)}`);
check("refining took the ore", (inv?.items.find((i) => i.type === "tl_lk")?.qty ?? 0) < oreBefore, `${oreBefore} -> ${inv?.items.find((i) => i.type === "tl_lk")?.qty}`);
console.log(gainsSeen ? "  (some stats rose)" : "  (nothing rose in 3 tries, which is allowed)");

// Not enough ore.
await sleep(300);
sql(`DELETE FROM item_instances WHERE owner_character_id = '${charId}' AND item_type = 'ren_lk'`);
await sleep(4000);
c.ws.close();
await sleep(800);
c = open(reg.cookie, 7);
await c.opened;
const w2 = await c.wait((m) => m.t === "welcome", 6000, "welcome");
const robe2 = w2.bag.items.find((i) => i.type === TYPE);
c.send({ t: "move", x: TOWN_SMITH_NEAR[0], y: TOWN_SMITH_NEAR[1], fx: w2.players.find((p) => p.id === charId).path[0][0], fy: w2.players.find((p) => p.id === charId).path[0][1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1, 4000, "ack").catch(() => undefined);
await sleep(500);
mark = c.log.length;
c.send({ t: "smith_upgrade", npc: "smith", tab: robe2.tab, cell: robe2.cell, protect: false });
const noOre = await c.wait((m) => m.t === "inv_error", 5000, "no ore", mark);
check("without ore the upgrade is refused", noOre.reason === "smith_mats", noOre.reason);
// The merchant sells the Hộ Cấp Phù for Tiên Ngọc.
await sleep(300);
c.send({ t: "move", x: TOWN_SMITH_NEAR[0] + 3, y: TOWN_SMITH_NEAR[1] - 3, fx: TOWN_SMITH_NEAR[0], fy: TOWN_SMITH_NEAR[1], seq: 2 });
await c.wait((m) => m.t === "ack" && m.seq === 2, 4000, "ack").catch(() => undefined);
await sleep(2500);
mark = c.log.length;
c.send({ t: "npc_open", npc: "merchant" });
await c.wait((m) => m.t === "shop", 5000, "the merchant window", mark);
await sleep(400);
mark = c.log.length;
c.send({ t: "shop_buy", npc: "merchant", offer: "ren_giu_cap", qty: 1 });
const bought = await c.wait((m) => m.t === "shop_ok" || m.t === "inv_error", 5000, "the purchase", mark);
const ngoc = [...c.log].reverse().find((m) => m.t === "wallet" && m.currency === "tien_ngoc");
check("the Hộ Cấp Phù costs 50 Tiên Ngọc", bought.t === "shop_ok" && ngoc?.balance === 50, `${bought.t} ${bought.reason ?? ""} ${ngoc?.balance}`);
c.ws.close();
console.log(failures === 0 ? "smith smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

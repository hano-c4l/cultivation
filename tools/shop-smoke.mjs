// Local test of the merchant (phase 2e): distance check, stock, buying (funds, bag, daily limit), selling (unsellable items,
// partial stacks, Linh Thạch received), and that the bag and wallet survive a reconnect.
// Usage: node tools/shop-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars. Never run it against preview or production.
import { FOREST_ARRIVAL, FOREST_BY_WOLVES, T } from "./world.mjs";
import { execFileSync } from "node:child_process";

const sql = (q) => execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", `"${q}"`], { stdio: "ignore", shell: true });

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const ROOM = "town:7";
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie, ch = 7) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
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

async function connect(cookie, ch = 7) {
  const c = open(cookie, ch);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 5000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}

/** Sends one command and returns the messages the server answered with. */
async function after(c, msg, wait = 700) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}

/** The bag as the client would rebuild it from the welcome and the deltas. */
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

// --- two accounts: a player and an admin who pays the player some Linh Thạch ---
const reg = await post("/api/register", { email: `shop-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Mua ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const adminReg = await post("/api/register", { email: `shop-admin-${run}@example.test`, password: "correct-horse-battery" });
await post("/api/character", { name: `Chủ ${run.slice(-4)}` }, adminReg.cookie);
execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", `"UPDATE accounts SET role='admin' WHERE email='shop-admin-${run}@example.test'"`], { stdio: "ignore", shell: true });
const grant = await post("/api/admin/grant", { characterId: charId, currency: "linh_thach", amount: 5000, reason: "smoke", idempotencyKey: crypto.randomUUID() }, adminReg.cookie);
check("the player was given 5000 Linh Thạch", grant.status === 200, JSON.stringify(grant.data));

let c = await connect(reg.cookie);
check("the town has the merchant NPC (spawn is out of reach)", c.welcome.map === "town");

// --- distance: from the spawn the merchant is too far ---
let r = await after(c, { t: "npc_open", npc: "merchant" });
check("opening the shop from far away is refused", r.some((m) => m.t === "inv_error" && m.reason === "far"));
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "hoi_huyet_dan", qty: 1 });
check("buying from far away is refused and nothing is charged", r.some((m) => m.t === "inv_error" && m.reason === "far") && balanceOf(c) === 5000);

// --- walk to a spot between the merchant and the alchemist (the plain pills with daily limits are the alchemist's now) ---
c.send({ t: "move", x: 25.5 + T, y: 19 + T, fx: 20.5 + T, fy: 20.5 + T, seq: 1 });
await sleep(2500);
r = await after(c, { t: "npc_open", npc: "alchemist" });
const stock = r.find((m) => m.t === "shop");
check("near the alchemist the shop opens and reports the daily stock", !!stock && stock.left.ngo_dao_dan === 2 && stock.left.dai_hoi_huyet_dan === 20, JSON.stringify(stock?.left));

// --- buying ---
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "not_an_offer", qty: 1 });
check("an unknown offer is refused", r.some((m) => m.t === "inv_error" && m.reason === "invalid"));
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "hoi_huyet_dan", qty: 5 });
check("buying 5 Hồi Huyết Đan costs 50 and puts them in the bag", r.some((m) => m.t === "shop_ok" && m.op === "buy" && m.total === 50) && balanceOf(c) === 4950 && countOf(c, "hoi_huyet_dan") === 5, `balance ${balanceOf(c)}`);
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "ngo_dao_dan", qty: 2 });
check("buying the whole daily stock of Ngộ Đạo Đan works", r.some((m) => m.t === "shop_ok") && countOf(c, "ngo_dao_dan") === 2 && balanceOf(c) === 4950 - 3000);
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "ngo_dao_dan", qty: 1 });
check("one more is sold out and costs nothing", r.some((m) => m.t === "inv_error" && m.reason === "sold_out") && countOf(c, "ngo_dao_dan") === 2 && balanceOf(c) === 1950);
check("the stock message says 0 left", [...r].reverse().find((m) => m.t === "shop")?.left.ngo_dao_dan === 0);
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "dai_hoi_huyet_dan", qty: 20 });
check("buying the daily 20 Đại Hồi Huyết Đan costs 1200", r.some((m) => m.t === "shop_ok" && m.total === 1200) && balanceOf(c) === 750, `balance ${balanceOf(c)}`);
r = await after(c, { t: "shop_buy", npc: "alchemist", offer: "hoi_huyet_dan", qty: 99 });
check("buying more than the money allows (990 > 750) is refused with no change", r.some((m) => m.t === "inv_error" && m.reason === "funds") && balanceOf(c) === 750 && countOf(c, "hoi_huyet_dan") === 5);
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "eq.hat.f.0.1.1.kim", qty: 1 });
check("gear of the other style is not an offer for a male character", r.some((m) => m.t === "inv_error" && m.reason === "invalid"));
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "eq.hat.m.0.1.1.hoa", qty: 1 });
const hat = bagOf(c).find((i) => i.type === "eq.hat.m.0.1.1.hoa");
check("basic gear can be bought with the element chosen, and arrives with full durability", r.some((m) => m.t === "shop_ok") && hat?.dur === 100 && hat?.max === 100);
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "eq.weapon.u.0.1.1.moc.kiem", qty: 1 });
check("a weapon of a chosen element and family can be bought", r.some((m) => m.t === "shop_ok") && !!bagOf(c).find((i) => i.type === "eq.weapon.u.0.1.1.moc.kiem"));

// --- books and the talisman ---
await post("/api/admin/grant", { characterId: charId, currency: "linh_thach", amount: 15000, reason: "smoke", idempotencyKey: crypto.randomUUID() }, adminReg.cookie);
await sleep(300);
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "bt_cuong_than", qty: 1 });
check("a basic skill book can be bought", r.some((m) => m.t === "shop_ok") && countOf(c, "bt_cuong_than") === 1);
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "bt_cuong_than", qty: 1 });
check("books have no daily limit (a second one is sold)", r.some((m) => m.t === "shop_ok") && countOf(c, "bt_cuong_than") === 2);
r = await after(c, { t: "shop_buy", npc: "merchant", offer: "ttp_town", qty: 2 });
check("the town's teleport talisman is sold here for 2000 each", r.some((m) => m.t === "shop_ok" && m.total === 4000) && countOf(c, "ttp_town") === 2);
const scroll = bagOf(c).find((i) => i.type === "ttp_town");
r = await after(c, { t: "inv_use", tab: scroll.tab, cell: scroll.cell });
check("a talisman of the map you stand on is not used up", r.some((m) => m.t === "inv_error" && m.reason === "not_needed") && countOf(c, "ttp_town") === 2);

// --- selling ---
await fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${charId}&item=bt_pill_1&qty=1`);
await sleep(700);
const pill = bagOf(c).find((i) => i.type === "bt_pill_1");
if (pill) {
  r = await after(c, { t: "shop_sell", npc: "merchant", tab: pill.tab, cell: pill.cell, qty: 1 });
  check("a breakthrough pill is not taken", r.some((m) => m.t === "inv_error" && m.reason === "unsellable") && countOf(c, "bt_pill_1") === 1);
}
const before = balanceOf(c);
const potion = bagOf(c).find((i) => i.type === "hoi_huyet_dan");
r = await after(c, { t: "shop_sell", npc: "merchant", tab: potion.tab, cell: potion.cell, qty: 2 });
check("selling 2 of 5 pays 15% each (rounded down, at least 1) and keeps 3", r.some((m) => m.t === "shop_ok" && m.op === "sell" && m.total === 2) && balanceOf(c) === before + 2 && countOf(c, "hoi_huyet_dan") === 3, `balance ${balanceOf(c)}`);
r = await after(c, { t: "shop_sell", npc: "merchant", tab: potion.tab, cell: potion.cell, qty: 50 });
check("selling more than the stack holds changes nothing", r.some((m) => m.t === "inv_error") && countOf(c, "hoi_huyet_dan") === 3 && balanceOf(c) === before + 2);
r = await after(c, { t: "shop_sell", npc: "merchant", tab: 0, cell: 63, qty: 1 });
check("selling from an empty cell is refused", r.some((m) => m.t === "inv_error" && m.reason === "invalid"));

// --- selling several stacks in one go ---
const pick = bagOf(c).filter((i) => ["hoi_huyet_dan", "dai_hoi_huyet_dan"].includes(i.type));
const expected = pick.reduce((n, i) => n + (i.type === "hoi_huyet_dan" ? 1 : 9) * i.qty, 0);
const walletBefore = balanceOf(c);
r = await after(c, { t: "shop_sell_many", npc: "merchant", cells: [...pick.map((i) => ({ tab: i.tab, cell: i.cell })), { tab: scroll.tab, cell: scroll.cell }, { tab: pill?.tab ?? 0, cell: pill?.cell ?? 62 }] });
check("a multi-sale that includes something unsellable (or empty) is refused whole", r.some((m) => m.t === "inv_error") && countOf(c, "hoi_huyet_dan") === 3 && balanceOf(c) === walletBefore);
r = await after(c, { t: "shop_sell_many", npc: "merchant", cells: pick.map((i) => ({ tab: i.tab, cell: i.cell })) });
check("selling the ticked stacks together pays once and clears them", r.some((m) => m.t === "shop_sold" && m.count === pick.length && m.total === expected) && countOf(c, "hoi_huyet_dan") === 0 && countOf(c, "dai_hoi_huyet_dan") === 0 && balanceOf(c) === walletBefore + expected, `expected ${expected}, balance ${balanceOf(c)} from ${walletBefore}`);
r = await after(c, { t: "shop_sell_many", npc: "merchant", cells: pick.map((i) => ({ tab: i.tab, cell: i.cell })) });
check("selling the same cells again changes nothing", r.some((m) => m.t === "inv_error") && balanceOf(c) === walletBefore + expected);

// --- the talisman takes you home from the forest ---
c.ws.close();
await sleep(800);
sql(`UPDATE characters SET map_id = 'forest', x = ${FOREST_ARRIVAL[0]}, y = ${FOREST_ARRIVAL[1]} WHERE id = '${charId}'`);
const f = await connect(reg.cookie);
check("the character now stands in the forest", f.welcome.map === "forest");
r = await after(f, { t: "hotbar_set", slot: 0, v: "i:ttp_town" });
check("a talisman on the hotbar is not rejected", !r.some((m) => m.t === "hotbar" && m.slots?.[0] !== "i:ttp_town"), JSON.stringify(r.map((m) => m.t)));
r = await after(f, { t: "use_type", type: "ttp_town" }, 600);
check("using the talisman starts a 5 second channel and spends nothing yet", r.some((m) => m.t === "tp" && m.ms === 5000) && countOf(f, "ttp_town") === 2, JSON.stringify(r.map((m) => m.t)));
r = await after(f, { t: "move", x: FOREST_ARRIVAL[0] + 1, y: FOREST_ARRIVAL[1] + 2, fx: FOREST_ARRIVAL[0], fy: FOREST_ARRIVAL[1], seq: 1 }, 600);
check("moving breaks the channel and the talisman is kept", r.some((m) => m.t === "tp_end" && m.ok === false && m.reason === "moved") && countOf(f, "ttp_town") === 2, JSON.stringify(r.map((m) => m.t)));
await sleep(5500);
check("a broken channel does not complete later", !f.log.some((m) => m.t === "transfer"));
f.send({ t: "move", x: FOREST_ARRIVAL[0], y: FOREST_ARRIVAL[1] + 3, fx: FOREST_ARRIVAL[0] + 1, fy: FOREST_ARRIVAL[1] + 2, seq: 2 });
await sleep(200);
r = await after(f, { t: "use_type", type: "ttp_town" }, 400);
check("a talisman cannot be used while still walking", r.some((m) => m.t === "inv_error" && m.reason === "moving") && !r.some((m) => m.t === "tp"), JSON.stringify(r.map((m) => m.t)));
await sleep(2500); // the walk ends
r = await after(f, { t: "use_type", type: "ttp_town" }, 600);
check("a second channel starts", r.some((m) => m.t === "tp"));
await sleep(5800);
check("left alone for 5 seconds the channel completes and transfers to town (the spent talisman is checked after reconnecting)", f.log.some((m) => m.t === "transfer" && m.map === "town"), JSON.stringify(f.log.slice(-6).map((m) => m.t)));
f.ws.close();
await sleep(800);
c = await connect(reg.cookie);
check("after the transfer the character is in town with one talisman left, and the hotbar still holds the talisman", c.welcome.map === "town" && countOf(c, "ttp_town") === 1 && c.welcome.hotbar[0] === "i:ttp_town", `map ${c.welcome.map} talismans ${countOf(c, "ttp_town")} hotbar0 ${c.welcome.hotbar[0]}`);

// --- the state is real: it survives a reconnect ---
c.ws.close();
await sleep(800);
c = await connect(reg.cookie);
check("the bag and the wallet are the same after reconnecting", countOf(c, "ngo_dao_dan") === 2 && countOf(c, "ttp_town") === 1 && c.welcome.wallet.linh_thach === walletBefore + expected, `wallet ${c.welcome.wallet.linh_thach}`);
// --- being hit breaks the channel, and the talisman is kept ---
c.ws.close();
await sleep(800);
sql(`UPDATE characters SET map_id = 'forest', x = ${FOREST_BY_WOLVES[0]}, y = ${FOREST_BY_WOLVES[1]} WHERE id = '${charId}'`);
const h = await connect(reg.cookie);
await after(h, { t: "use_type", type: "ttp_town" }, 300);
const brokeByHit = await h.wait((m) => m.t === "tp_end", 20000, "tp_end by a hit").catch(() => null);
check("a monster's attack breaks the channel and the talisman is kept", brokeByHit?.ok === false && (brokeByHit.reason === "hit" || brokeByHit.reason === "dead") && countOf(h, "ttp_town") === 1, JSON.stringify(brokeByHit));
h.ws.close();

console.log(failures === 0 ? "\nall shop checks passed" : `\n${failures} shop check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

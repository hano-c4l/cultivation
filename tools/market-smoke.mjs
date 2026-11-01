// Local test of Vạn Bảo Lâu (the market, phase 5a): a far player is refused, a seller puts a stack up at a fixed price and as an auction, the listings show to
// another player of the same town, buying moves the money and delivers the item and the proceeds by mail (claimed in the game), a second buyer is told it is
// gone, the seller cannot buy their own listing, and a bid is taken (or refused while the round is closed) and outbid.
// Usage: node tools/market-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and the 0059 migration (npm run db:migrate:local). It credits the throwaway characters through
// `wrangler d1 execute --local`.
import { town } from "./world.mjs";
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
const sql = (q) => execSync(`npx wrangler d1 execute DB --local --command "${q}"`, { stdio: "pipe" });

const market = town.npcs.find((n) => n.id === "market");
if (!market) throw new Error("the town has no market NPC");

async function player(tag) {
  const reg = await post("/api/register", { email: `mk-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag} ${run.slice(-4)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 100000)`);
  return { id, cookie: reg.cookie };
}
const seller = await player("Bán");
const buyer = await player("Mua");
const buyer2 = await player("Mua2");
const give = (id, item, qty) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${id}&item=${item}&qty=${qty}`).then((r) => r.json());
await give(seller.id, "hoi_huyet_dan", 10);
await sleep(5000);

async function enter(p) {
  const c = open(p.cookie, 7);
  await c.opened;
  const welcome = await c.wait((m) => m.t === "welcome", 6000, "welcome");
  const spawn = welcome.players.find((x) => x.id === p.id).path[0];
  return { c, welcome, spawn };
}
const walkTo = async (c, spawn, seq = 1) => {
  c.send({ t: "move", x: market.x, y: market.y + 2, fx: spawn[0], fy: spawn[1], seq });
  await c.wait((m) => m.t === "ack" && m.seq === seq, 4000, "ack");
};

const S = await enter(seller);
const B = await enter(buyer);
const B2 = await enter(buyer2);
const bagOf = (e) => {
  const items = new Map((e.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of e.c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const linh = (e) => [...e.c.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance ?? e.welcome.wallet.linh_thach;

// Too far from the spawn.
let mark = S.c.log.length;
S.c.send({ t: "market_post", npc: "market", kind: "fixed", currency: "linh_thach", tab: 0, cell: 0, qty: 1, price: 1000 });
const far = await S.c.wait((m) => m.t === "market_error", 4000, "far refusal", mark);
check("a player far from Vạn Bảo Lâu is refused", far.reason === "far", far.reason);

await Promise.all([walkTo(S.c, S.spawn), walkTo(B.c, B.spawn), walkTo(B2.c, B2.spawn)]);
await sleep(6500);

mark = S.c.log.length;
S.c.send({ t: "npc_open", npc: "market", view: "market" });
const first = await S.c.wait((m) => m.t === "market", 5000, "the market window", mark);
check("the market opens with a market tab and no listings", first.tabs.includes("market") && first.listings.length === 0 && first.cfg.taxPct === 10, `${first.listings.length} listings`);

// Put 4 of the 10 pills up at a fixed price, the rest as an auction.
await sleep(400);
const stack = bagOf(S).find((i) => i.type === "hoi_huyet_dan");
const before = linh(S);
mark = S.c.log.length;
S.c.send({ t: "market_post", npc: "market", kind: "fixed", currency: "linh_thach", tab: stack.tab, cell: stack.cell, qty: 4, price: 10000 });
const ok1 = await S.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 5000, "post result", mark);
check("a fixed listing goes up", ok1.t === "market_ok" && ok1.op === "post", ok1.reason ?? "");
await sleep(600);
check("the fee (2%) was charged", linh(S) === before - 200, `${before} -> ${linh(S)}`);
check("4 of the 10 left the bag", bagOf(S).filter((i) => i.type === "hoi_huyet_dan").reduce((n, i) => n + i.qty, 0) === 6);
const after1 = [...S.c.log].reverse().find((m) => m.t === "market");
check("the seller sees it as theirs", after1.listings.length === 1 && after1.listings[0].mine && after1.listings[0].kind === "fixed");

await sleep(400);
const stack2 = bagOf(S).find((i) => i.type === "hoi_huyet_dan");
mark = S.c.log.length;
S.c.send({ t: "market_post", npc: "market", kind: "auction", currency: "linh_thach", tab: stack2.tab, cell: stack2.cell, qty: 6, price: 5000 });
const ok2 = await S.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 5000, "auction post", mark);
check("an auction listing goes up", ok2.t === "market_ok", ok2.reason ?? "");

// The buyer sees both, the seller cannot buy their own.
await sleep(400);
mark = B.c.log.length;
B.c.send({ t: "npc_open", npc: "market", view: "market" });
const seen = await B.c.wait((m) => m.t === "market", 5000, "the buyer's window", mark);
check("another player of the town sees both listings", seen.listings.length === 2 && seen.listings.every((l) => !l.mine), `${seen.listings.length}`);
const fixed = seen.listings.find((l) => l.kind === "fixed");
const auction = seen.listings.find((l) => l.kind === "auction");
await sleep(400);
mark = S.c.log.length;
S.c.send({ t: "market_buy", npc: "market", id: fixed.id });
const own = await S.c.wait((m) => m.t === "market_error", 4000, "own purchase", mark);
check("the seller cannot buy their own listing", own.reason === "mine", own.reason);

// Two buyers at once: one gets it.
const b1 = B.c.log.length;
const b2 = B2.c.log.length;
B.c.send({ t: "market_buy", npc: "market", id: fixed.id });
B2.c.send({ t: "market_buy", npc: "market", id: fixed.id });
const r1 = await B.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 6000, "buyer 1", b1);
const r2 = await B2.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 6000, "buyer 2", b2);
const wins = [r1, r2].filter((r) => r.t === "market_ok").length;
check("exactly one of two simultaneous buyers gets it", wins === 1 && [r1, r2].some((r) => r.t === "market_error" && r.reason === "gone"), `${r1.t}/${r1.reason ?? ""} ${r2.t}/${r2.reason ?? ""}`);
const [winner, loser, wRes] = r1.t === "market_ok" ? [B, B2] : [B2, B, r2];
await sleep(800);
check("the winner paid 10 000", linh(winner) === 100000 - 10000, `${linh(winner)}`);
check("the loser paid nothing", linh(loser) === 100000, `${linh(loser)}`);

// The goods arrive by mail and are claimed in the game.
winner.c.send({ t: "mail_refresh" });
const mailMsg = await winner.c.wait((m) => m.t === "mail" && m.mail.some((x) => x.item?.type === "hoi_huyet_dan"), 5000, "the buyer's mail");
const goods = mailMsg.mail.find((x) => x.item?.type === "hoi_huyet_dan");
check("the item is in the buyer's mail", goods.item.qty === 4);
mark = winner.c.log.length;
winner.c.send({ t: "mail_claim", id: goods.id });
await winner.c.wait((m) => m.t === "loot", 5000, "claim", mark);
check("claiming puts it in the bag", bagOf(winner).some((i) => i.type === "hoi_huyet_dan" && i.qty === 4));

S.c.send({ t: "mail_refresh" });
const sm = await S.c.wait((m) => m.t === "mail" && m.mail.some((x) => x.gift?.linh_thach === 9000), 5000, "the seller's proceeds");
const proceeds = sm.mail.find((x) => x.gift?.linh_thach === 9000);
check("the market mail carries the proceeds", !!proceeds);
const sBefore = linh(S);
mark = S.c.log.length;
S.c.send({ t: "mail_claim_all" }); // "Nhận nhanh": every mail at once
await S.c.wait((m) => m.t === "wallet" && m.currency === "linh_thach", 5000, "wallet after claim", mark);
await sleep(300);
check("the seller is paid 9 000 (10 000 less 10% tax)", linh(S) === sBefore + 9000, `${sBefore} -> ${linh(S)}`);

// The auction: a bid is taken while the round is open, refused while it is closed; a lower or equal bid is refused.
await sleep(400);
mark = winner.c.log.length;
winner.c.send({ t: "market_bid", npc: "market", id: auction.id, amount: auction.nextBid });
const bid = await winner.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 5000, "bid", mark);
if (seen.open) {
  check("a bid is taken while the round is open", bid.t === "market_ok" && bid.op === "bid", bid.reason ?? "");
  await sleep(500);
  mark = loser.c.log.length;
  loser.c.send({ t: "market_bid", npc: "market", id: auction.id, amount: auction.nextBid });
  const low = await loser.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 5000, "low bid", mark);
  check("a bid that does not beat the top one is refused", low.t === "market_error" && low.reason === "low", low.reason ?? low.t);
  await sleep(500);
  mark = loser.c.log.length;
  loser.c.send({ t: "market_bid", npc: "market", id: auction.id, amount: auction.nextBid * 2 });
  const up = await loser.c.wait((m) => m.t === "market_ok" || m.t === "market_error", 5000, "outbid", mark);
  check("a higher bid is taken", up.t === "market_ok", up.reason ?? "");
  await sleep(5200); // the server answers a mail_refresh at most once per 5 s on a socket (MAIL_REFRESH_GAP_MS): an earlier one is dropped without an answer
  winner.c.send({ t: "mail_refresh" });
  const refund = await winner.c.wait((m) => m.t === "mail" && m.mail.some((x) => x.gift?.linh_thach === auction.nextBid), 5000, "the refund mail");
  check("the outbid bidder is refunded by mail", !!refund);
} else {
  check("a bid is refused while the round is closed", bid.t === "market_error" && bid.reason === "closed", bid.reason ?? bid.t);
}

for (const e of [S, B, B2]) e.c.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

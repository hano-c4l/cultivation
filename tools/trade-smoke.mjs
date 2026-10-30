// Local test of direct trade (phase 5b): two players of the town invite and answer, offer items and Linh Thạch, a change undoes the locks, a lock or an agreement
// with an old version is refused, both lock and agree and the goods and the money change hands, a trade can be cancelled, and a far player is refused.
// Usage: node tools/trade-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and the 0060 migration (npm run db:migrate:local). It credits the throwaway characters through
// `wrangler d1 execute --local`.
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
async function player(tag) {
  const reg = await post("/api/register", { email: `tr-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag} ${run.slice(-4)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 10000)`);
  sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'tien_ngoc', 50)`);
  return { id, cookie: reg.cookie };
}
const give = (id, item, qty) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${id}&item=${item}&qty=${qty}`).then((r) => r.json());

const pa = await player("Giao");
const pb = await player("Nhan");
await give(pa.id, "hoi_huyet_dan", 5);
await give(pb.id, "linh_thao", 3);
await sleep(5000);

const A = open(pa.cookie, 7);
const B = open(pb.cookie, 7);
await Promise.all([A.opened, B.opened]);
const wa = await A.wait((m) => m.t === "welcome", 6000, "welcome A");
const wb = await B.wait((m) => m.t === "welcome", 6000, "welcome B");
await sleep(1200);
const bagOf = (e, w) => {
  const items = new Map((w.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of e.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const linh = (e, w) => [...e.log].reverse().find((m) => m.t === "wallet" && m.currency === "linh_thach")?.balance ?? w.wallet.linh_thach;
const lastTrade = (e) => [...e.log].reverse().find((m) => m.t === "trade");

// Invitation and answer.
let ma = A.log.length;
A.send({ t: "trade_invite", to: pb.id });
const inv = await B.wait((m) => m.t === "trade_invite", 5000, "the invitation");
check("the invited player gets the invitation", inv.from === pa.id, inv.name);
let mb = B.log.length;
B.send({ t: "trade_reply", from: pa.id, accept: true });
await A.wait((m) => m.t === "trade", 5000, "window A", ma);
const first = await B.wait((m) => m.t === "trade", 5000, "window B", mb);
check("both get an empty window at version 1", first.mine.items.length === 0 && first.theirs.items.length === 0 && first.rev === 1, `rev ${first.rev}`);

// Offers.
const pills = bagOf(A, wa).find((i) => i.type === "hoi_huyet_dan");
const herbs = bagOf(B, wb).find((i) => i.type === "linh_thao");
await sleep(500);
A.send({ t: "trade_offer", items: [pills.id], linh: 300, tienNgoc: 7 });
await B.wait((m) => m.t === "trade" && m.theirs.items.length === 1 && m.theirs.linh === 300, 5000, "B sees A's offer");
await sleep(500);
B.send({ t: "trade_offer", items: [herbs.id], linh: 100, tienNgoc: 0 });
await A.wait((m) => m.t === "trade" && m.theirs.items.length === 1, 5000, "A sees B's offer");
await sleep(300);
const v1 = lastTrade(A);
check("each side sees the other's items", v1.theirs.items[0].type === "linh_thao" && v1.mine.items[0].type === "hoi_huyet_dan" && v1.theirs.linh === 100);

// A lock with an old version is refused; the real one is taken.
ma = A.log.length;
A.send({ t: "trade_lock", rev: v1.rev - 1, on: true });
const old = await A.wait((m) => m.t === "trade_error", 4000, "stale lock", ma);
check("a lock with an out-of-date version is refused", old.reason === "stale", old.reason);
await sleep(300);
A.send({ t: "trade_lock", rev: lastTrade(A).rev, on: true });
await A.wait((m) => m.t === "trade" && m.mine.locked, 5000, "A locked");
await sleep(300);
// B changes the offer: A's lock is undone.
B.send({ t: "trade_offer", items: [herbs.id], linh: 150, tienNgoc: 0 });
const undone = await A.wait((m) => m.t === "trade" && m.theirs.linh === 150, 5000, "offer changed");
check("a change by the other side undoes the lock", !undone.mine.locked && !undone.theirs.locked);
await sleep(300);
A.send({ t: "trade_lock", rev: lastTrade(A).rev, on: true });
B.send({ t: "trade_lock", rev: lastTrade(B).rev, on: true });
await sleep(1200);
const locked = lastTrade(A);
check("both locked", locked.mine.locked && locked.theirs.locked, `rev ${locked.rev}`);

// Agreeing at the same time carries it out once.
ma = A.log.length;
mb = B.log.length;
A.send({ t: "trade_confirm", rev: lastTrade(A).rev });
B.send({ t: "trade_confirm", rev: lastTrade(B).rev });
const endA = await A.wait((m) => m.t === "trade_end", 8000, "trade end A", ma);
const endB = await B.wait((m) => m.t === "trade_end", 8000, "trade end B", mb);
check("the trade ends well for both", endA.reason === "done" && endB.reason === "done", `${endA.reason}/${endB.reason}`);
await sleep(800);
check("A holds the herbs and no pills", bagOf(A, wa).some((i) => i.type === "linh_thao" && i.qty === 3) && !bagOf(A, wa).some((i) => i.type === "hoi_huyet_dan"));
check("B holds the pills and no herbs", bagOf(B, wb).some((i) => i.type === "hoi_huyet_dan" && i.qty === 5) && !bagOf(B, wb).some((i) => i.type === "linh_thao"));
check("A paid 300 and got 150", linh(A, wa) === 10000 - 300 + 150, `${linh(A, wa)}`);
check("B got 300 and paid 150", linh(B, wb) === 10000 + 300 - 150, `${linh(B, wb)}`);
const tn = (e, w) => [...e.log].reverse().find((m) => m.t === "wallet" && m.currency === "tien_ngoc")?.balance ?? w.wallet.tien_ngoc;
check("A paid 7 Tiên Ngọc and B got them in the same trade", tn(A, wa) === 43 && tn(B, wb) === 57, `${tn(A, wa)} / ${tn(B, wb)}`);

// A cancel, and an offer that exceeds the wallet.
A.send({ t: "trade_invite", to: pb.id });
await B.wait((m) => m.t === "trade_invite" && m !== inv, 5000, "second invitation");
mb = B.log.length;
B.send({ t: "trade_reply", from: pa.id, accept: true });
await B.wait((m) => m.t === "trade", 5000, "second window", mb);
await sleep(500);
ma = A.log.length;
A.send({ t: "trade_offer", items: [], linh: 999999, tienNgoc: 0 });
const poor = await A.wait((m) => m.t === "trade_error", 4000, "too much Linh Thạch", ma);
check("an offer above the wallet is refused", poor.reason === "funds" || poor.reason === "limit", poor.reason);
mb = B.log.length;
A.send({ t: "trade_cancel" });
const cancelled = await B.wait((m) => m.t === "trade_end", 4000, "cancel", mb);
check("a cancel ends it for the other side", cancelled.reason === "cancelled", cancelled.reason);

for (const e of [A, B]) e.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

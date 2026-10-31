// Local test of the sects (phase 5c-1): a leader founds a sect at the NPC, invites a player, the member chats in the sect channel, is made an elder, an applicant is taken in,
// a member is sent away (and waits), and the leader closes the sect.
// Usage: node tools/sect-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1 and the 0062 migration (npm run db:migrate:local). It raises the realm and credits the throwaway characters through
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
function open(url, cookie) {
  const ws = new WebSocket(url, { headers: { Cookie: cookie } });
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
async function player(tag, rich) {
  const reg = await post("/api/register", { email: `sc-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag} ${run.slice(-4)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  if (rich) {
    sql(`UPDATE characters SET realm = 1 WHERE id = '${id}'`);
    sql(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 200000)`);
  }
  return { id, name: `${tag} ${run.slice(-4)}`, cookie: reg.cookie };
}

const pa = await player("Chu", true);
const pb = await player("Thanh", false);
const pc = await player("Xin", false);
const kids = [];
async function join(p) {
  const g = open(`${base}/ws?ch=7`, p.cookie);
  const c = open(`${base}/ws/chat`, p.cookie);
  await Promise.all([g.opened, c.opened]);
  await g.wait((m) => m.t === "welcome", 8000, `welcome ${p.name}`);
  kids.push(g, c);
  return { g, c };
}
const A = await join(pa);
const B = await join(pb);
const C = await join(pc);
// The NPC stands at about (58.5, 47.5); everyone walks next to it.
for (const e of [A, B, C]) e.g.send({ t: "move", x: 56.5, y: 47.5, fx: 56.5, fy: 47.5, seq: 1 });
await sleep(7000);
const lastSect = (e) => [...e.g.log].reverse().find((m) => m.t === "sect");

// Founding.
let m0 = A.g.log.length;
A.g.send({ t: "sect_create", npc: "sect", name: `Thanh Van ${run.slice(-3)}` });
const made = await A.g.wait((m) => m.t === "sect" && m.view, 8000, "sect view", m0).catch(() => null);
check("the leader founds a sect and gets its window", !!made && made.view.myRank === 5 && made.view.members.length === 1, made ? made.view.name : "no view");
await sleep(500);

// Cống hiến: give Linh Thạch, buy from the shop, set and take the weekly pay.
await sleep(400);
m0 = A.g.log.length;
A.g.send({ t: "sect_donate", amount: 10000 });
const gave = await A.g.wait((m) => m.t === "sect" && m.view?.fund === 10000, 6000, "donation", m0).catch(() => null);
check("giving Linh Thạch fills the fund and earns cống hiến", !!gave && gave.view.contribution === 100 && gave.view.exp === 50, gave ? `${gave.view.contribution}/${gave.view.exp}` : "no view");
const cong = [...A.g.log].reverse().find((m) => m.t === "wallet" && m.currency === "cong_hien");
check("the Cống Hiến slot of the wallet shows it", cong?.balance === 100, `${cong?.balance}`);
await sleep(400);
m0 = A.g.log.length;
A.g.send({ t: "sect_buy", npc: "sect", item: "hoi_huyet_dan" });
const bought = await A.g.wait((m) => m.t === "inv" && m.items?.some((i) => i.type === "hoi_huyet_dan"), 6000, "the pill", m0).catch(() => null);
await sleep(600);
const cong2 = [...A.g.log].reverse().find((m) => m.t === "wallet" && m.currency === "cong_hien");
check("a shop line costs cống hiến and puts the item in the bag", !!bought && cong2?.balance === 90, `${cong2?.balance}`);
await sleep(400);
A.g.send({ t: "sect_weekly_set", amounts: [0, 0, 0, 0, 0, 500] });
await sleep(1000);
m0 = A.g.log.length;
A.g.send({ t: "sect_weekly" });
const paid = await A.g.wait((m) => m.t === "sect" && m.view?.weeklyClaimed === true, 6000, "weekly pay", m0).catch(() => null);
check("the leader takes the weekly pay from the fund, once", !!paid && paid.view.fund === 9500, paid ? `${paid.view.fund}` : "no view");
await sleep(400);
m0 = A.g.log.length;
A.g.send({ t: "sect_weekly" });
const again = await A.g.wait((m) => m.t === "sect_error", 4000, "second claim", m0).catch(() => null);
check("a second claim the same week is refused", again?.reason === "claimed", again?.reason);

// A short-pursed character cannot found one; a far one is refused.
m0 = B.g.log.length;
B.g.send({ t: "sect_create", npc: "sect", name: "Khong Du" });
const refused = await B.g.wait((m) => m.t === "sect_error", 4000, "refusal", m0).catch(() => null);
check("a character below the realm is refused", refused?.reason === "realm", refused?.reason);

// Invitation.
await sleep(400);
A.g.send({ t: "sect_invite", to: pb.id });
const inv = await B.g.wait((m) => m.t === "sect_invite", 5000, "invitation").catch(() => null);
check("the invited player gets the invitation", inv?.from === pa.id, inv?.sect);
await sleep(400);
m0 = B.g.log.length;
B.g.send({ t: "sect_reply", from: pa.id, accept: true });
const joined = await B.g.wait((m) => m.t === "sect" && m.view, 8000, "B in the sect", m0).catch(() => null);
check("the member is in the sect, a disciple", !!joined && joined.view.myRank === 0 && joined.view.members.length === 2);
const told = await B.c.wait((m) => m.t === "sect_changed" && m.you === true, 4000, "sect_changed on the chat socket").catch(() => null);
check("the chat socket tells the new member (you) that the sect changed", !!told);

// The sect channel reaches both.
await sleep(600);
B.c.send({ t: "chat", channel: "sect", text: "xin chao" });
const heard = await A.c.wait((m) => m.t === "chat" && m.channel === "sect" && m.text === "xin chao", 5000, "sect chat").catch(() => null);
check("a sect chat line reaches the other member", !!heard);
m0 = C.c.log.length;
C.c.send({ t: "chat", channel: "sect", text: "toi khong trong tong mon" });
const noSect = await C.c.wait((m) => m.t === "chat_error", 4000, "refusal", m0).catch(() => null);
check("someone outside the sect cannot use its channel", noSect?.reason === "forbidden", noSect?.reason);

// Role, application, kick.
await sleep(400);
m0 = A.g.log.length;
A.g.send({ t: "sect_role", id: pb.id, role: "elder" });
await sleep(1200);
check("the leader hears of the change without being the one it is about", A.c.log.some((m) => m.t === "sect_changed" && m.you !== true));
const forB = await B.c.wait((m) => m.t === "sect_changed" && m.you === true, 4000, "B is told it is about them", 0).catch(() => null);
check("the appointed member is told it is about them", !!forB);
A.g.send({ t: "sect_get" }); // the client does this when the open window hears of a change
const promoted = await A.g.wait((m) => m.t === "sect" && m.view?.members.some((x) => x.id === pb.id && x.rank === 3), 6000, "promotion", m0).catch(() => null);
check("the leader makes the member an elder", !!promoted);
await sleep(400);
C.g.send({ t: "sect_apply", sect: made.view.id, on: true });
await sleep(1500);
m0 = B.g.log.length;
B.g.send({ t: "sect_get" });
const seen = await B.g.wait((m) => m.t === "sect" && m.view?.requests?.length === 1, 5000, "application seen", m0).catch(() => null);
check("an elder sees the application", !!seen);
await sleep(400);
B.g.send({ t: "sect_answer", id: pc.id, ok: true });
await sleep(1500);
C.g.send({ t: "sect_get" });
const cIn = await C.g.wait((m) => m.t === "sect" && m.view, 5000, "C in the sect").catch(() => null);
check("the applicant is taken in", !!cIn && cIn.view.members.length === 3);
await sleep(400);
m0 = B.g.log.length;
B.g.send({ t: "sect_kick", id: pc.id });
const noKick = await B.g.wait((m) => m.t === "sect_error", 4000, "an elder may not kick", m0).catch(() => null);
check("an elder cannot send anyone away", noKick?.reason === "perm", noKick?.reason);
await sleep(400);
A.g.send({ t: "sect_kick", id: pc.id });
await sleep(1500);
m0 = C.g.log.length;
C.g.send({ t: "sect_get" });
const out = await C.g.wait((m) => m.t === "sect" && m.view === null, 5000, "C out", m0).catch(() => null);
check("the leader sends the member away, who must wait", !!out && out.cooldownUntil > Date.now(), `${out?.cooldownUntil}`);

// Closing.
await sleep(400);
A.g.send({ t: "sect_disband" });
await sleep(1500);
m0 = B.g.log.length;
B.g.send({ t: "sect_get" });
const gone = await B.g.wait((m) => m.t === "sect" && m.view === null, 5000, "B out", m0).catch(() => null);
check("closing the sect sends everyone away", !!gone);

for (const e of kids) e.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

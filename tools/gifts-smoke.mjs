// Local test of the admin gifts (3d): permissions, a gift to a list of characters (the online one is told at once and reads it), the claim
// (currency + items, once), a gift to the whole server, a repeated batch id, and the history. Usage: node tools/gifts-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev on :8787, DISABLE_RATE_LIMIT=1 in .dev.vars. Local only; the admin is made with `wrangler d1 execute --local`.
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
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("["))) [0].results;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
const get = async (path, cookie) => {
  const res = await fetch(httpBase + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
function open(cookie, path = "/ws?ch=6") {
  const ws = new WebSocket(`${base}${path}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  return { ws, log, send: (m) => ws.send(JSON.stringify(m)), opened: new Promise((res) => (ws.addEventListener("open", () => res(true)), ws.addEventListener("error", () => res(false)))) };
}
async function connect(cookie) {
  const c = open(cookie);
  await c.opened;
  for (let i = 0; i < 40 && !c.log.some((m) => m.t === "welcome"); i++) await sleep(100);
  const chat = open(cookie, "/ws/chat");
  await chat.opened;
  return { ...c, chat, welcome: c.log.find((m) => m.t === "welcome") };
}

// Anonymous and player requests are refused.
for (const p of ["/api/admin/gifts/meta", "/api/admin/gifts/history"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
const player = await post("/api/register", { email: `gift-player-${run}@example.test`, password: "correct-horse-battery" });
const playerChar = (await post("/api/character", { name: `Nhận ${run.slice(-4)}` }, player.cookie)).data.character;
check("a player cannot open the gift screen or send", (await get("/api/admin/gifts/meta", player.cookie)).status === 403 && (await post("/api/admin/gifts/send", {}, player.cookie)).status === 403);

const adminEmail = `gift-admin-${run}@example.test`;
const admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000);
const meta = await get("/api/admin/gifts/meta", admin.cookie);
check("meta lists items (no equipment) and limits", meta.status === 200 && meta.data.items.length > 5 && !meta.data.items.some((i) => i.id.startsWith("eq.")) && meta.data.limits.recipients === 1000, String(meta.status));

// The player is online; a gift to them is announced on the chat socket and shows up after a refresh.
const p = await connect(player.cookie);
const batch1 = `smoke${run}a`.slice(0, 24);
const body = { batchId: batch1, subject: "Quà thử", body: "Dòng một\nDòng hai", audience: { kind: "list", characterIds: [playerChar.id] }, gift: { linh_thach: 1500, tien_ngoc: 3, items: [{ type: "hoi_huyet_dan", qty: 4 }] }, expiresInDays: 3 };
check("a bad gift is refused", (await post("/api/admin/gifts/send", { ...body, batchId: `${batch1}x`, gift: { items: [] } }, admin.cookie)).status === 400);
const sent = await post("/api/admin/gifts/send", body, admin.cookie);
check("the gift is sent to one character", sent.status === 200 && sent.data.recipients === 1 && sent.data.duplicate === false, JSON.stringify(sent.data));
const again = await post("/api/admin/gifts/send", body, admin.cookie);
check("the same batch id again sends nothing", again.status === 200 && again.data.duplicate === true && sql(`SELECT COUNT(*) AS n FROM mailbox WHERE id LIKE '${batch1}:%'`)[0].n === 1);
for (let i = 0; i < 30 && !p.chat.log.some((m) => m.t === "mail_new"); i++) await sleep(100);
check("the online player is told on the chat socket", p.chat.log.some((m) => m.t === "mail_new"));
p.send({ t: "mail_refresh" });
await sleep(800);
const mail = p.log.filter((m) => m.t === "mail").at(-1)?.mail.find((m) => m.id === `${batch1}:${playerChar.id}`);
check("the mail has the subject, body, attachments and an expiry of days", mail?.subject === "Quà thử" && mail.body === "Dòng một\nDòng hai" && mail.gift?.linh_thach === 1500 && mail.gift.items[0].qty === 4 && mail.expiresInMs > 2.9 * 86_400_000, JSON.stringify(mail));
p.send({ t: "mail_refresh" });
await sleep(300);
check("a second refresh right away is ignored", p.log.filter((m) => m.t === "mail").length === 1);

p.send({ t: "mail_claim", id: `${batch1}:${playerChar.id}` });
await sleep(1200);
check("the claim pays both currencies, adds the items and empties the mail", p.log.some((m) => m.t === "wallet" && m.currency === "linh_thach" && m.balance === 1500) && p.log.some((m) => m.t === "wallet" && m.currency === "tien_ngoc" && m.balance === 3) && p.log.some((m) => m.t === "inv" && m.items.some((i) => i.type === "hoi_huyet_dan" && i.qty === 4)) && p.log.filter((m) => m.t === "mail").at(-1).mail.length === 0);
check("the totals sit in the Admin group", sql(`SELECT grp, total_in FROM linh_thach_totals WHERE character_id='${playerChar.id}'`)[0]?.grp === "admin");
p.send({ t: "mail_claim", id: `${batch1}:${playerChar.id}` });
await sleep(600);
check("a second claim pays nothing", sql(`SELECT balance FROM currency_balances WHERE character_id='${playerChar.id}' AND currency='linh_thach'`)[0].balance === 1500);

// The whole server.
const total = sql("SELECT COUNT(*) AS n FROM characters WHERE deleted_at IS NULL")[0].n;
const batch2 = `smoke${run}b`.slice(0, 24);
const all = await post("/api/admin/gifts/send", { batchId: batch2, subject: "Sự kiện", body: "", audience: { kind: "all" }, gift: { cong_hien: 10, items: [] }, expiresInDays: null }, admin.cookie);
check("a gift to the whole server reaches every character", all.status === 200 && all.data.recipients === total && sql(`SELECT COUNT(*) AS n FROM mailbox WHERE id LIKE '${batch2}:%'`)[0].n === total, JSON.stringify(all.data));
const hist = await get("/api/admin/gifts/history?size=5", admin.cookie);
const row = hist.data.rows?.find((r) => r.id === batch1);
check("the history shows both sends and the claim count", hist.data.rows?.[0]?.id === batch2 && row?.claimed === 1 && row.recipients === 1, JSON.stringify(hist.data.rows?.map((r) => [r.id, r.claimed])));
const log = (await get(`/api/admin/log?q=${encodeURIComponent("Gửi quà")}&size=2`, admin.cookie)).data.rows ?? [];
check("the admin log has both sends", log.length === 2 && log[0].screen === "Gửi quà" && log[0].content.includes("toàn bộ server"));

for (const c of [p]) {
  c.ws.close();
  c.chat.ws.close();
}
console.log(failures === 0 ? "\nall gift checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

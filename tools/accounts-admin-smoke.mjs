// Local test of the account admin screens (3m-a): permissions, the list, a ban that kicks an open game connection and ends the session, the ban shown at login
// (but only to someone with the right password), lifting it, and a temporary password that replaces the old one.
// Usage: node tools/accounts-admin-smoke.mjs [ws://localhost:8787]   Needs wrangler dev, DISABLE_RATE_LIMIT=1 and the 0044 migration; local only.
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
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
const get = async (path, cookie) => {
  const res = await fetch(httpBase + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const PASSWORD = "correct-horse-battery";

for (const p of ["/api/admin/accounts", "/api/admin/accounts/detail?id=x"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
const email = `ac-player-${run}@example.test`;
const player = await post("/api/register", { email, password: PASSWORD });
const created = await post("/api/character", { name: `Ac ${run.slice(-4)}`, gender: "male" }, player.cookie);
const charId = created.data.character.id;
check("a player cannot use the account API", (await get("/api/admin/accounts", player.cookie)).status === 403 && (await post("/api/admin/accounts/action", { id: "x", action: "ban" }, player.cookie)).status === 403);
const adminEmail = `ac-admin-${run}@example.test`;
const admin = await post("/api/register", { email: adminEmail, password: PASSWORD });
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000);

const list = await get(`/api/admin/accounts?q=${encodeURIComponent(email)}`, admin.cookie);
const row = list.data.rows?.[0];
check("the list finds the player with the character", list.status === 200 && row?.email === email && row.character?.startsWith("Ac "), JSON.stringify(row));
check("an admin account cannot be banned", (await post("/api/admin/accounts/action", { id: (await get(`/api/admin/accounts?q=${encodeURIComponent(adminEmail)}`, admin.cookie)).data.rows[0].id, action: "ban", forever: true, reason: "x" }, admin.cookie)).status === 403);

// An open game connection is kicked by the ban.
const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: player.cookie } });
let closed = false;
let kicked = false;
ws.addEventListener("close", () => (closed = true));
ws.addEventListener("message", (ev) => ev.data !== "pong" && JSON.parse(ev.data).t === "kicked" && (kicked = true));
await new Promise((res) => ws.addEventListener("message", (ev) => ev.data !== "pong" && JSON.parse(ev.data).t === "welcome" && res(true)));
// The chat socket is a separate connection.
const chat = new WebSocket(`${base}/ws/chat`, { headers: { Cookie: player.cookie } });
let chatKicked = false;
chat.addEventListener("message", (ev) => ev.data !== "pong" && JSON.parse(ev.data).t === "kicked" && (chatKicked = true));
await new Promise((res) => chat.addEventListener("open", () => res(true)));
await sleep(500);
let gameReplies = 0;
ws.addEventListener("message", (ev) => ev.data !== "pong" && gameReplies++);
const banned = await post("/api/admin/accounts/action", { id: row.id, action: "ban", days: 2, reason: "Thử khóa" }, admin.cookie);
check("the ban is accepted", banned.status === 200, JSON.stringify(banned.data));
await sleep(1500);
check("the open game connection was told it was kicked and closed", kicked || closed, `kicked ${kicked}, closed ${closed}`);
const repliesBefore = gameReplies;
ws.send(JSON.stringify({ t: "npc_open", npc: "merchant" }));
await sleep(1000);
check("the chat socket was told it was kicked", chatKicked);
check("the old game socket gets no answer to a command", gameReplies === repliesBefore, `${gameReplies - repliesBefore} messages`);
check("the old session no longer works", (await get("/api/me", player.cookie)).status === 401);
const wrong = await post("/api/login", { email, password: "not-the-password" });
check("a wrong password is not told about the ban", wrong.status === 401 && wrong.data.error === "invalid_credentials");
const blocked = await post("/api/login", { email, password: PASSWORD });
check("the right password gets the ban with its reason and end", blocked.status === 403 && blocked.data.error === "banned" && blocked.data.reason === "Thử khóa" && blocked.data.until > Date.now(), JSON.stringify(blocked.data));
const detail = await get(`/api/admin/accounts/detail?id=${row.id}`, admin.cookie);
check("the detail shows the ban", detail.data.account?.banned === true && detail.data.character?.name.startsWith("Ac "));
check("lifting it works and lifting twice is refused", (await post("/api/admin/accounts/action", { id: row.id, action: "unban" }, admin.cookie)).status === 200 && (await post("/api/admin/accounts/action", { id: row.id, action: "unban" }, admin.cookie)).status === 400);
const back = await post("/api/login", { email, password: PASSWORD });
check("the player can log in again", back.status === 200);

const tmp = await post("/api/admin/accounts/action", { id: row.id, action: "password" }, admin.cookie);
check("a temporary password is returned once", tmp.status === 200 && /^[A-Za-z0-9]{14}$/.test(tmp.data.password ?? ""));
check("the session from before ended", (await get("/api/me", back.cookie ?? "")).status === 401);
check("the old cookie cannot open a new chat socket", await new Promise((res) => { const w = new WebSocket(`${base}/ws/chat`, { headers: { Cookie: player.cookie } }); w.addEventListener("open", () => res(false)); w.addEventListener("error", () => res(true)); }));
check("the old password no longer works", (await post("/api/login", { email, password: PASSWORD })).status === 401);
check("the temporary password works", (await post("/api/login", { email, password: tmp.data.password })).status === 200);
const log = sql("SELECT content FROM admin_log ORDER BY id DESC LIMIT 6").map((r) => r.content).join(" | ");
check("the admin log has the actions and not the password", log.includes("Ban tài khoản") && log.includes("Bỏ ban") && log.includes("Đặt mật khẩu tạm") && !log.includes(tmp.data.password));
void charId;
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

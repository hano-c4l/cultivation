// Local test of the character admin (3m-b): review of an online character (kick, login refused), edits only during the review, money and items, and the
// account coming back after "Xong". Usage: node tools/characters-admin-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev, DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT not needed, and the 0045 migration; local only.
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

for (const p of ["/api/admin/character?id=x"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
const email = `ch-player-${run}@example.test`;
const player = await post("/api/register", { email, password: PASSWORD });
const created = await post("/api/character", { name: `Ch ${run.slice(-4)}`, gender: "male" }, player.cookie);
const id = created.data.character.id;
check("a player cannot use the character API", (await get(`/api/admin/character?id=${id}`, player.cookie)).status === 403 && (await post("/api/admin/character/action", { id, action: "start" }, player.cookie)).status === 403);
const adminEmail = `ch-admin-${run}@example.test`;
const admin = await post("/api/register", { email: adminEmail, password: PASSWORD });
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000);

const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: player.cookie } });
let kicked = false;
await new Promise((res) => {
  ws.addEventListener("message", (ev) => {
    if (ev.data === "pong") return;
    const m = JSON.parse(ev.data);
    if (m.t === "welcome") res(true);
    if (m.t === "kicked") kicked = true;
  });
});
const before = await get(`/api/admin/character?id=${id}`, admin.cookie);
check("the screen shows the character and that it is online", before.status === 200 && before.data.character.name.startsWith("Ch ") && before.data.online === true, JSON.stringify(before.data.online));
check("an edit without a review is refused", (await post("/api/admin/character/action", { id, action: "money", currency: "linh_thach", delta: 10 }, admin.cookie)).status === 409);
const start = await post("/api/admin/character/action", { id, action: "start" }, admin.cookie);
check("the review starts and kicks the online character", start.status === 200 && start.data.kicked === true, JSON.stringify(start.data));
await sleep(1500);
check("the game connection was told it was kicked", kicked);
const blocked = await post("/api/login", { email, password: PASSWORD });
check("the player cannot log in during the review", blocked.status === 403 && blocked.data.error === "reviewing" && blocked.data.until > Date.now(), JSON.stringify(blocked.data));
check("the old session is gone", (await get("/api/me", player.cookie)).status === 401);

const money = await post("/api/admin/character/action", { id, action: "money", currency: "linh_thach", delta: 777 }, admin.cookie);
check("money can be added", money.status === 200);
check("too much cannot be taken", (await post("/api/admin/character/action", { id, action: "money", currency: "linh_thach", delta: -999999 }, admin.cookie)).status === 400);
check("an item can be added", (await post("/api/admin/character/action", { id, action: "addItem", item: "linh_thao", qty: 5 }, admin.cookie)).status === 200);
const stats = await post("/api/admin/character/action", { id, action: "stats", input: { realm: 1, stage: 4, exp: 10, potentialPoints: 3, stats: { canCot: 9, thanPhap: 9, ngoTinh: 9, linhLuc: 9, thanThuc: 9, phucDuyen: 9 } } }, admin.cookie);
check("the sheet can be edited", stats.status === 200, JSON.stringify(stats.data));
const after = (await get(`/api/admin/character?id=${id}`, admin.cookie)).data.character;
check("the edits are there", after.wallet.linh_thach === 777 && after.items.some((i) => i.type === "linh_thao" && i.qty === 5) && after.realm === 1 && after.stage === 4 && after.stats.canCot === 9 && after.review?.by === adminEmail);

const done = await post("/api/admin/character/action", { id, action: "end" }, admin.cookie);
check("the review ends", done.status === 200);
check("an edit after the end is refused", (await post("/api/admin/character/action", { id, action: "money", currency: "linh_thach", delta: 1 }, admin.cookie)).status === 409);
const back = await post("/api/login", { email, password: PASSWORD });
check("the player can log in again", back.status === 200);
const log = sql("SELECT content FROM admin_log ORDER BY id DESC LIMIT 8").map((r) => r.content).join(" | ");
check("the log has the review and the edits", log.includes("Bắt đầu sửa nhân vật") && log.includes("Cộng 777 linh_thach") && log.includes("Xong sửa nhân vật"));
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

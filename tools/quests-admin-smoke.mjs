// Local test of the quest admin screen (3e): permissions, create, a stale save, an invalid catalogue, the quest showing up at the elder after the
// 30 s catalogue cache, a player taking it, then a delete that is soft (a character holds it) and one that is hard.
// Usage: node tools/quests-admin-smoke.mjs [ws://localhost:8787]   (needs wrangler dev, DISABLE_RATE_LIMIT=1; local only; takes about 40 s)
import { T, TOWN_SPAWN } from "./world.mjs";
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

check("anonymous list is 401", (await get("/api/admin/quests")).status === 401);
const player = await post("/api/register", { email: `qa-player-${run}@example.test`, password: "correct-horse-battery" });
const char = (await post("/api/character", { name: `Qa ${run.slice(-4)}`, gender: "male" }, player.cookie)).data.character;
check("a player cannot read, save or delete", (await get("/api/admin/quests", player.cookie)).status === 403 && (await post("/api/admin/quests/save", {}, player.cookie)).status === 403 && (await post("/api/admin/quests/delete", {}, player.cookie)).status === 403);

const adminEmail = `qa-admin-${run}@example.test`;
const admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000);

const list = await get("/api/admin/quests", admin.cookie);
check("the list has the seeded catalogue, the pickers and the limits", list.status === 200 && list.data.quests.length >= 20 && list.data.meta.givers.some((g) => g.id === "elder") && list.data.meta.items.length > 5 && !list.data.meta.items.some((i) => i.id.startsWith("eq.")), String(list.status));

const id = `qa_${run}`.slice(0, 30);
const quest = { id, chain: "qa", seq: 1, giver: "elder", titleVi: "Thử từ admin", descVi: "Nhiệm vụ do smoke tạo.", enabled: true, requires: null, objective: { kind: "kill", count: 3, map: "forest" }, rewards: { linhThach: 10, items: [{ item: "hoi_huyet_dan", qty: 1 }] } };
const bad = await post("/api/admin/quests/save", { quest: { ...quest, giver: "merchant" }, isNew: true, updatedAt: 0 }, admin.cookie);
check("a giver that cannot give quests is refused with the problem", bad.status === 400 && bad.data.error === "invalid" && bad.data.problems.length > 0, JSON.stringify(bad.data));
const made = await post("/api/admin/quests/save", { quest, isNew: true, updatedAt: 0 }, admin.cookie);
check("a new quest is created", made.status === 200, JSON.stringify(made.data));
check("the same id again is refused", (await post("/api/admin/quests/save", { quest, isNew: true, updatedAt: 0 }, admin.cookie)).status === 409);
const token = made.data.updatedAt;
const edit = await post("/api/admin/quests/save", { quest: { ...quest, titleVi: "Thử từ admin (sửa)" }, isNew: false, updatedAt: token }, admin.cookie);
check("a change with the right token is saved", edit.status === 200, JSON.stringify(edit.data));
check("the same token again is a conflict", (await post("/api/admin/quests/save", { quest: { ...quest, titleVi: "Khác" }, isNew: false, updatedAt: token }, admin.cookie)).status === 409);
const log = (await get(`/api/admin/log?q=${encodeURIComponent(id)}&size=3`, admin.cookie)).data.rows ?? [];
check("the admin log has the create and the change", log.length === 2 && log.every((r) => r.screen === "Nhiệm vụ"), JSON.stringify(log.map((r) => r.content)));

// The game catalogue is cached for 30 s per isolate: wait, then look at the elder as a player.
console.log("waiting 32 s for the catalogue cache...");
await sleep(32_000);
const ws = new WebSocket(`${base}/ws?ch=5`, { headers: { Cookie: player.cookie } });
const log2 = [];
ws.addEventListener("message", (ev) => ev.data !== "pong" && log2.push(JSON.parse(ev.data)));
await new Promise((r) => ws.addEventListener("open", r));
for (let i = 0; i < 40 && !log2.some((m) => m.t === "welcome"); i++) await sleep(100);
const send = (m) => ws.send(JSON.stringify(m));
send({ t: "move", x: 18.5 + T, y: 16.5 + T, fx: TOWN_SPAWN[0], fy: TOWN_SPAWN[1], seq: 1 });
await sleep(2500);
send({ t: "npc_open", npc: "elder" });
await sleep(800);
const offered = log2.filter((m) => m.t === "quests").at(-1)?.defs.find((d) => d.id === id);
check("the elder offers the new quest with the edited title", offered?.titleVi === "Thử từ admin (sửa)", JSON.stringify(log2.filter((m) => m.t === "quests").at(-1)?.defs.map((d) => d.id)) + " " + JSON.stringify(log2.filter((m) => /error|quests|kicked/.test(m.t)).map((m) => [m.t, m.reason ?? m.defs?.length])));
send({ t: "quest_accept", npc: "elder", quest: id });
await sleep(800);
check("the player takes it", sql(`SELECT state FROM character_quests WHERE character_id='${char.id}' AND quest_id='${id}'`)[0]?.state === "active");
ws.close();

const cur = (await get("/api/admin/quests", admin.cookie)).data.quests.find((q) => q.def.id === id);
check("the list counts the player on it", cur.active === 1);
check("the objective kind of a quest a player holds cannot change", (await post("/api/admin/quests/save", { quest: { ...quest, titleVi: "Thử từ admin (sửa)", objective: { kind: "talk", npc: "merchant" } }, isNew: false, updatedAt: cur.updatedAt }, admin.cookie)).data.error === "locked_field");
const soft = await post("/api/admin/quests/delete", { id, updatedAt: cur.updatedAt }, admin.cookie);
check("deleting it is a soft delete because a character holds it", soft.status === 200 && soft.data.mode === "soft", JSON.stringify(soft.data));
const after = (await get("/api/admin/quests", admin.cookie)).data.quests.find((q) => q.def.id === id);
check("it stays in the list as deleted and disabled", after?.deleted === true && after.def.enabled === false);

const id2 = `qb_${run}`.slice(0, 30);
const made2 = await post("/api/admin/quests/save", { quest: { ...quest, id: id2, chain: "qb" }, isNew: true, updatedAt: 0 }, admin.cookie);
const hard = await post("/api/admin/quests/delete", { id: id2, updatedAt: made2.data.updatedAt }, admin.cookie);
check("a quest nobody holds is deleted for good", hard.status === 200 && hard.data.mode === "hard" && sql(`SELECT COUNT(*) AS n FROM quests WHERE id='${id2}'`)[0].n === 0, JSON.stringify(hard.data));

// Clean up the quests this run made so the local catalogue stays the seeded one.
sql(`DELETE FROM character_quests WHERE quest_id='${id}'`);
sql(`DELETE FROM quests WHERE id='${id}'`);
sql("UPDATE config_versions SET version = version + 1 WHERE name = 'quests'");
console.log(failures === 0 ? "\nall quest admin checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

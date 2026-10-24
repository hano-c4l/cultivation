// Local test of the skills admin screen (3h): permissions, a change saved and listed, the welcome carrying it after the 30 s tuning cache, a cast in
// the forest spending the new MP, a template entry, then everything put back. Usage: node tools/skills-admin-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev, DISABLE_RATE_LIMIT=1 in .dev.vars; local only; takes about 40 s.
import { FOREST_ARRIVAL } from "./world.mjs";
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

let admin;
try {
  check("anonymous list is 401", (await get("/api/admin/skills")).status === 401);
  const player = await post("/api/register", { email: `sa-player-${run}@example.test`, password: "correct-horse-battery" });
  const char = (await post("/api/character", { name: `Sa ${run.slice(-4)}`, gender: "male" }, player.cookie)).data.character;
  check("a player cannot read or save", (await get("/api/admin/skills", player.cookie)).status === 403 && (await post("/api/admin/skills/save", {}, player.cookie)).status === 403);

  const adminEmail = `sa-admin-${run}@example.test`;
  admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  await sleep(3000);

  const list = await get("/api/admin/skills", admin.cookie);
  const hoi = list.data.skills?.find((s) => s.id === "hoi_0");
  check("the list has skills and templates with the code's numbers", list.status === 200 && list.data.skills.some((s) => s.template && s.id === "hoi") && hoi?.base.mpCost === 15 && hoi.override === null, String(list.status));
  check("a field that does not fit the kind is refused", (await post("/api/admin/skills/save", { key: "hoi_0", fields: { range: 9 }, token: list.data.token }, admin.cookie)).data.error === "invalid");
  const saved = await post("/api/admin/skills/save", { key: "hoi_0", fields: { mpCost: 3, nameVi: "Hồi Khí Nhanh" }, token: list.data.token }, admin.cookie);
  check("a change is saved", saved.status === 200, JSON.stringify(saved.data));
  check("the old token is now a conflict", (await post("/api/admin/skills/save", { key: "hoi_0", fields: { mpCost: 4 }, token: list.data.token }, admin.cookie)).status === 409);
  const after = (await get("/api/admin/skills", admin.cookie)).data.skills.find((s) => s.id === "hoi_0");
  check("the list shows the change and the new effective numbers", after.override?.mpCost === 3 && after.effective.mpCost === 3 && after.effective.nameVi === "Hồi Khí Nhanh");
  const tpl = await post("/api/admin/skills/save", { key: "thuan", fields: { buffDurationMs: 25000 }, token: (await get("/api/admin/skills", admin.cookie)).data.token }, admin.cookie);
  check("a template entry is saved and shows on every realm", tpl.status === 200 && (await get("/api/admin/skills", admin.cookie)).data.skills.filter((s) => s.id.startsWith("thuan_")).every((s) => s.effective.buffDurationMs === 25000));
  const log = (await get(`/api/admin/log?q=${encodeURIComponent("Kỹ năng")}&size=3`, admin.cookie)).data.rows ?? [];
  check("the admin log has the changes", log.length >= 2 && log.every((r) => r.screen === "Kỹ năng"));

  // Put the character in the forest with a heal and see the new MP cost spent there.
  sql(`INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('${char.id}', 'hoi_0', 1, 'root', 0)`);
  sql(`UPDATE characters SET map_id = 'forest', x = ${FOREST_ARRIVAL[0]}, y = ${FOREST_ARRIVAL[1]} WHERE id = '${char.id}'`);
  console.log("waiting 32 s for the tuning cache...");
  await sleep(32_000);
  const ws = new WebSocket(`${base}/ws?ch=2`, { headers: { Cookie: player.cookie } });
  const log2 = [];
  ws.addEventListener("message", (ev) => ev.data !== "pong" && log2.push(JSON.parse(ev.data)));
  await new Promise((r) => ws.addEventListener("open", r));
  for (let i = 0; i < 40 && !log2.some((m) => m.t === "welcome"); i++) await sleep(100);
  const welcome = log2.find((m) => m.t === "welcome");
  check("the welcome carries the changes in the tuning", welcome?.map === "forest" && welcome.tuning.skillOverrides?.hoi_0?.mpCost === 3 && welcome.tuning.skillOverrides?.thuan?.buffDurationMs === 25000, JSON.stringify(welcome?.tuning?.skillOverrides));
  ws.send(JSON.stringify({ t: "cast", skill: "hoi_0" }));
  for (let i = 0; i < 40 && !log2.some((m) => m.t === "cast_ok" || m.t === "cast_error"); i++) await sleep(100);
  const mp = [...log2].reverse().find((m) => m.t === "mp");
  check("the cast spends the new MP cost, not the old one", log2.some((m) => m.t === "cast_ok") && mp && mp.mp >= welcome.maxMp - 4 && mp.mp <= welcome.maxMp - 2, `mp ${mp?.mp}/${welcome?.maxMp}, ${JSON.stringify(log2.filter((m) => m.t === "cast_error"))}`);
  ws.close();

  const t = (await get("/api/admin/skills", admin.cookie)).data.token;
  const reset1 = await post("/api/admin/skills/save", { key: "hoi_0", fields: null, token: t }, admin.cookie);
  const reset2 = await post("/api/admin/skills/save", { key: "thuan", fields: null, token: reset1.data.updatedAt }, admin.cookie);
  check("both are put back to the code's numbers", reset1.status === 200 && reset2.status === 200 && (await get("/api/admin/skills", admin.cookie)).data.skills.every((s) => s.override === null));
} finally {
  sql(`UPDATE game_tuning SET value = '{}', updated_at = updated_at + 1 WHERE name = 'skillOverrides'`);
  sql("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
}
console.log(failures === 0 ? "\nall skill admin checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

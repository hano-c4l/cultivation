// Local test of the monsters admin screens (3j): permissions, a species renamed and a loot line added, the welcome carrying both after the 30 s tuning cache,
// the boss rules, then everything put back. Usage: node tools/monsters-admin-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev, DISABLE_RATE_LIMIT=1 in .dev.vars; local only; takes about 40 s.
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

try {
  for (const p of ["/api/admin/monsters", "/api/admin/loot"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
  const player = await post("/api/register", { email: `mo-player-${run}@example.test`, password: "correct-horse-battery" });
  await post("/api/character", { name: `Mo ${run.slice(-4)}`, gender: "male" }, player.cookie);
  check("a player cannot read or save", (await get("/api/admin/monsters", player.cookie)).status === 403 && (await post("/api/admin/monsters/save", {}, player.cookie)).status === 403 && (await post("/api/admin/loot/save", {}, player.cookie)).status === 403);

  const adminEmail = `mo-admin-${run}@example.test`;
  const admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  await sleep(3000);

  const list = await get("/api/admin/monsters", admin.cookie);
  const soi = list.data.species?.find((s) => s.id === "soi_rung");
  check("the species list has the code's numbers, where each appears and the guard", list.status === 200 && list.data.species.length === 17 && soi?.maps.includes("forest") && list.data.species.find((s) => s.id === "ve_binh")?.guard === true, String(list.status));
  check("a chase shorter than the notice is refused", (await post("/api/admin/monsters/save", { id: "soi_rung", fields: { aggroRadius: 9, leashRadius: 3 }, token: list.data.token }, admin.cookie)).data.error === "invalid");
  const renamed = await post("/api/admin/monsters/save", { id: "soi_rung", fields: { nameVi: "Sói Thử", hpMult: 1.25 }, token: list.data.token }, admin.cookie);
  check("a species is renamed and its numbers changed", renamed.status === 200, JSON.stringify(renamed.data));
  check("the old token is a conflict", (await post("/api/admin/monsters/save", { id: "soi_rung", fields: { hpMult: 2 }, token: list.data.token }, admin.cookie)).status === 409);

  const loot = await get("/api/admin/loot", admin.cookie);
  const edited = JSON.parse(JSON.stringify(loot.data.loot));
  edited.base.normal.push({ item: "thu_cot", chance: 0.77, min: 1, max: 1 });
  check("a loot line for an unknown item is refused", (await post("/api/admin/loot/save", { loot: { ...edited, base: { ...edited.base, normal: [...edited.base.normal, { item: "no_such_item", chance: 0.1, min: 1, max: 1 }] } }, token: loot.data.token }, admin.cookie)).data.error === "invalid");
  const lootSaved = await post("/api/admin/loot/save", { loot: edited, token: loot.data.token }, admin.cookie);
  check("a loot line is added", lootSaved.status === 200, JSON.stringify(lootSaved.data));

  const bossPage = await get("/api/admin/tuning?page=boss", admin.cookie);
  const boss = bossPage.data.groups?.find((g) => g.group === "boss");
  const bad = await post("/api/admin/tuning", { group: "boss", page: "boss", updatedAt: boss.updatedAt, value: { ...boss.value, species: { ...boss.value.species, forest: "soi_rung" } } }, admin.cookie);
  check("a species from the glades cannot be a boss", bad.status === 400 && bad.data.problems?.[0]?.includes("bãi quái"), JSON.stringify(bad.data));
  const pages = [(await get("/api/admin/tuning?page=monsters", admin.cookie)).data.groups?.map((g) => g.group).join(), bossPage.data.groups?.map((g) => g.group).join()];
  check("the two pages list their groups", pages[0] === "monsters,drops,oreDrop,refineDrop" && pages[1] === "boss,bossSpawn,bossStats,bossReward,bossSkills,bossCone,bossRegen,guard,guardSkills", JSON.stringify(pages));
  const log = (await get(`/api/admin/log?q=${encodeURIComponent("Quái / BOSS")}&size=4`, admin.cookie)).data.rows ?? [];
  check("the admin log has the changes", log.length >= 2 && log.every((r) => r.screen === "Quái / BOSS"));

  console.log("waiting 32 s for the tuning cache...");
  await sleep(32_000);
  const ws = new WebSocket(`${base}/ws?ch=2`, { headers: { Cookie: player.cookie } });
  const log2 = [];
  ws.addEventListener("message", (ev) => ev.data !== "pong" && log2.push(JSON.parse(ev.data)));
  await new Promise((r) => ws.addEventListener("open", r));
  for (let i = 0; i < 40 && !log2.some((m) => m.t === "welcome"); i++) await sleep(100);
  const welcome = log2.find((m) => m.t === "welcome");
  check("the welcome carries the new name and the new loot line", welcome?.tuning.monsters.species.soi_rung.nameVi === "Sói Thử" && welcome.tuning.loot.base.normal.some((l) => l.item === "thu_cot" && l.chance === 0.77), JSON.stringify(welcome?.tuning?.monsters?.species?.soi_rung));
  ws.close();

  const back = (await get("/api/admin/monsters", admin.cookie)).data;
  const r1 = await post("/api/admin/monsters/save", { id: "soi_rung", fields: null, token: back.token }, admin.cookie);
  const lootNow = await get("/api/admin/loot", admin.cookie);
  const r2 = await post("/api/admin/loot/save", { loot: lootNow.data.default, token: lootNow.data.token }, admin.cookie);
  check("both are put back to the code's numbers", r1.status === 200 && r2.status === 200 && (await get("/api/admin/monsters", admin.cookie)).data.species.every((s) => !s.changed));
} finally {
  sql("DELETE FROM game_tuning WHERE name IN ('loot', 'monsters')");
  sql("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
}
console.log(failures === 0 ? "\nall monster admin checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

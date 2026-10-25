// Local test of the NPC admin screens (3k): permissions, an NPC renamed and put back, the quest guard on disabling, a merchant stock edit and the alchemy
// recipes through the API, and the game's `welcome` then carrying the new name after the 30 s cache. Usage: node tools/npcs-admin-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev, DISABLE_RATE_LIMIT=1 in .dev.vars; local only; takes about 40 s. Everything it changes is put back.
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
const welcomeOf = (cookie) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: cookie } });
    const timer = setTimeout(() => reject(new Error("no welcome")), 8000);
    ws.addEventListener("message", (ev) => {
      if (ev.data === "pong") return;
      const m = JSON.parse(ev.data);
      if (m.t === "welcome") {
        clearTimeout(timer);
        ws.close();
        resolve(m);
      }
    });
  });

let original = null;
let admin = null;
try {
  for (const p of ["/api/admin/npcs", "/api/admin/merchant?npc=merchant", "/api/admin/alchemy"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
  const player = await post("/api/register", { email: `np-player-${run}@example.test`, password: "correct-horse-battery" });
  await post("/api/character", { name: `Np ${run.slice(-4)}`, gender: "male" }, player.cookie);
  check("a player cannot read or save", (await get("/api/admin/npcs", player.cookie)).status === 403 && (await post("/api/admin/npcs/save", {}, player.cookie)).status === 403 && (await post("/api/admin/merchant/save", {}, player.cookie)).status === 403 && (await post("/api/admin/alchemy/save", {}, player.cookie)).status === 403);

  const adminEmail = `np-admin-${run}@example.test`;
  admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  await sleep(3000);

  const list = await get("/api/admin/npcs", admin.cookie);
  const alchemist = list.data.npcs?.find((n) => n.id === "alchemist" && n.mapId === "town");
  check("the list has the alchemist with its stock", list.status === 200 && alchemist?.kind === "alchemist" && alchemist.hasStock === true, String(list.status));
  const elder = list.data.npcs?.find((n) => n.id === "elder" && n.mapId === "town");
  const guard = await post("/api/admin/npcs/save", { npc: { ...elder, enabled: false }, isNew: false, updatedAt: elder.updatedAt }, admin.cookie);
  check("disabling a quest giver is refused with the list of quests", guard.status === 409 && guard.data.error === "in_use" && guard.data.problems.length > 0, JSON.stringify(guard.data).slice(0, 120));
  check("an unchanged save is refused", (await post("/api/admin/npcs/save", { npc: alchemist, isNew: false, updatedAt: alchemist.updatedAt }, admin.cookie)).data.error === "unchanged");
  check("a spot outside the map is refused", (await post("/api/admin/npcs/save", { npc: { ...alchemist, x: 5000, y: 5000 }, isNew: false, updatedAt: alchemist.updatedAt }, admin.cookie)).data.error === "invalid");

  original = alchemist.name;
  const renamed = await post("/api/admin/npcs/save", { npc: { ...alchemist, name: `Đan Sư ${run.slice(-3)}` }, isNew: false, updatedAt: alchemist.updatedAt }, admin.cookie);
  check("the alchemist is renamed", renamed.status === 200, JSON.stringify(renamed.data));
  check("the old token is a conflict", (await post("/api/admin/npcs/save", { npc: { ...alchemist, name: "X" }, isNew: false, updatedAt: alchemist.updatedAt }, admin.cookie)).status === 409);

  const merchant = await get("/api/admin/merchant?npc=alchemist", admin.cookie);
  check("the alchemist's merchant record follows the new name", merchant.status === 200 && merchant.data.merchant.nameVi.includes(run.slice(-3)), merchant.data.merchant?.nameVi);
  const bad = await post("/api/admin/merchant/save", { npc: "alchemist", sellRate: merchant.data.merchant.sellRate, buys: merchant.data.merchant.buys, stock: [{ id: "x", kind: "item", item: "no_such_item" }], updatedAt: merchant.data.updatedAt }, admin.cookie);
  check("a stock rule for an unknown item is refused", bad.data.error === "invalid");
  const stock = [...merchant.data.merchant.stock, { id: "linh_thao_shop", kind: "item", item: "linh_thao", price: 9 }];
  const saved = await post("/api/admin/merchant/save", { npc: "alchemist", sellRate: merchant.data.merchant.sellRate, buys: merchant.data.merchant.buys, stock, updatedAt: merchant.data.updatedAt }, admin.cookie);
  check("a stock rule is added", saved.status === 200, JSON.stringify(saved.data));

  const alch = await get("/api/admin/alchemy", admin.cookie);
  check("the alchemy recipes are served with the item list", alch.status === 200 && alch.data.alchemy.recipes.length >= 3 && alch.data.items.length > 10);
  const noChange = await post("/api/admin/alchemy/save", { alchemy: alch.data.alchemy, updatedAt: alch.data.updatedAt }, admin.cookie);
  check("saving the recipes unchanged is refused", noChange.data.error === "unchanged");
  const recipes = [...alch.data.alchemy.recipes, { id: `smoke_${run.slice(-4)}`, nameVi: "Thử", output: "hoi_huyet_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 1 }], linhThach: 1, seconds: 5, enabled: true }];
  const alchSaved = await post("/api/admin/alchemy/save", { alchemy: { ...alch.data.alchemy, recipes }, updatedAt: alch.data.updatedAt }, admin.cookie);
  check("a recipe is added", alchSaved.status === 200, JSON.stringify(alchSaved.data));

  console.log("waiting for the 30 s cache...");
  await sleep(32000);
  const w = await welcomeOf(player.cookie);
  check("the welcome carries the new NPC name", w.npcs?.find((n) => n.id === "alchemist")?.name === `Đan Sư ${run.slice(-3)}`, w.npcs?.find((n) => n.id === "alchemist")?.name);
  check("the welcome's tuning carries the new recipe", w.tuning?.alchemy?.recipes?.some((r) => r.id === `smoke_${run.slice(-4)}`) === true);
} finally {
  // Put everything back.
  try {
    if (admin) {
      const list = await get("/api/admin/npcs", admin.cookie);
      const a = list.data.npcs?.find((n) => n.id === "alchemist" && n.mapId === "town");
      if (a && original && a.name !== original) await post("/api/admin/npcs/save", { npc: { ...a, name: original }, isNew: false, updatedAt: a.updatedAt }, admin.cookie);
      const m = await get("/api/admin/merchant?npc=alchemist", admin.cookie);
      if (m.status === 200) await post("/api/admin/merchant/save", { npc: "alchemist", sellRate: m.data.merchant.sellRate, buys: m.data.merchant.buys, stock: m.data.merchant.stock.filter((r) => r.id !== "linh_thao_shop"), updatedAt: m.data.updatedAt }, admin.cookie);
      const al = await get("/api/admin/alchemy", admin.cookie);
      if (al.status === 200) await post("/api/admin/alchemy/save", { alchemy: { ...al.data.alchemy, recipes: al.data.alchemy.recipes.filter((r) => !r.id.startsWith("smoke_")) }, updatedAt: al.data.updatedAt }, admin.cookie);
    }
  } catch (err) {
    console.error("cleanup failed", err);
  }
}
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

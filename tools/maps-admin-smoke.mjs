// Local test of the maps admin screens (3l-a): permissions, a map's colours changed, the welcome then carrying the recipe after the 30 s cache (and not before an
// edit), locked fields refused, then reset to the code's map. Usage: node tools/maps-admin-smoke.mjs [ws://localhost:8787]
// Needs wrangler dev, DISABLE_RATE_LIMIT=1 in .dev.vars and the 0043 migration; local only; takes about 40 s. Everything it changes is put back.
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

let admin = null;
try {
  for (const p of ["/api/admin/maps", "/api/admin/maps/recipe?id=town"]) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
  const player = await post("/api/register", { email: `mp-player-${run}@example.test`, password: "correct-horse-battery" });
  await post("/api/character", { name: `Mp ${run.slice(-4)}`, gender: "male" }, player.cookie);
  check("a player cannot read or save", (await get("/api/admin/maps", player.cookie)).status === 403 && (await post("/api/admin/maps/save", {}, player.cookie)).status === 403);
  const adminEmail = `mp-admin-${run}@example.test`;
  admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  await sleep(3000);

  const list = await get("/api/admin/maps", admin.cookie);
  check("the list has the six maps", list.status === 200 && list.data.maps.length === 6, String(list.status));
  const before = await welcomeOf(player.cookie);
  check("an unedited map sends no recipe in the welcome", before.mapRecipe === undefined);
  const view = await get("/api/admin/maps/recipe?id=town", admin.cookie);
  const recipe = view.data.recipe;
  check("the recipe carries the steps of the town", view.status === 200 && recipe.ops.length > 5 && recipe.portals.length === 1);
  check("saving it unchanged is refused", (await post("/api/admin/maps/save", { recipe, updatedAt: view.data.updatedAt }, admin.cookie)).data.error === "unchanged");
  check("a changed realm is refused as locked", (await post("/api/admin/maps/save", { recipe: { ...recipe, realm: 2 }, updatedAt: view.data.updatedAt }, admin.cookie)).data.error === "locked");
  check("a gate to the same map is refused", (await post("/api/admin/maps/save", { recipe: { ...recipe, portals: [{ ...recipe.portals[0], toMap: "town" }] }, updatedAt: view.data.updatedAt }, admin.cookie)).data.error === "invalid");
  const saved = await post("/api/admin/maps/save", { recipe: { ...recipe, palette: { ...recipe.palette, groundA: 0x224466 } }, updatedAt: view.data.updatedAt }, admin.cookie);
  check("the colours are changed", saved.status === 200, JSON.stringify(saved.data));
  check("the old token is a conflict", (await post("/api/admin/maps/save", { recipe: { ...recipe, palette: { ...recipe.palette, groundA: 0x224467 } }, updatedAt: view.data.updatedAt }, admin.cookie)).status === 409);

  console.log("waiting for the 30 s cache...");
  await sleep(32000);
  const after = await welcomeOf(player.cookie);
  check("the welcome carries the recipe", after.mapRecipe?.palette?.groundA === 0x224466, JSON.stringify(after.mapRecipe?.palette));
} finally {
  try {
    if (admin) {
      const v = await get("/api/admin/maps/recipe?id=town", admin.cookie);
      if (v.data.edited) await post("/api/admin/maps/save", { reset: true, id: "town", updatedAt: v.data.updatedAt }, admin.cookie);
    }
  } catch (err) {
    console.error("cleanup failed", err);
  }
}
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

// Local test of new maps (3l-b2): an admin makes a map, a character standing in it joins and gets its recipe and monsters, a recipe change while someone is
// inside does NOT reach a newcomer of the same room (the room pins its grid) but does reach the next room, and the map can only be deleted when nothing points at it.
// Usage: node tools/maps-new-smoke.mjs [ws://localhost:8787]   Needs wrangler dev, DISABLE_RATE_LIMIT=1; local only; takes about 2 minutes. It puts everything back.
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
const MAP = `thu_${run.slice(-6)}`;
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
const join = (cookie) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: cookie } });
    const timer = setTimeout(() => reject(new Error("no welcome")), 10000);
    ws.addEventListener("message", (ev) => {
      if (ev.data === "pong") return;
      const m = JSON.parse(ev.data);
      if (m.t === "welcome") {
        clearTimeout(timer);
        resolve({ ws, welcome: m });
      }
    });
  });
const PASSWORD = "correct-horse-battery";
async function player(tag) {
  const reg = await post("/api/register", { email: `mn-${tag}-${run}@example.test`, password: PASSWORD });
  const created = await post("/api/character", { name: `Mn${tag} ${run.slice(-3)}`, gender: "male" }, reg.cookie);
  return { cookie: reg.cookie, id: created.data.character.id };
}

let admin = null;
try {
  const adminEmail = `mn-admin-${run}@example.test`;
  admin = await post("/api/register", { email: adminEmail, password: PASSWORD });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  const a = await player("a");
  const b = await player("b");
  await sleep(3000);

  const forest = (await get("/api/admin/maps/recipe?id=forest", admin.cookie)).data.recipe;
  const town = (await get("/api/admin/maps/recipe?id=town", admin.cookie)).data.recipe;
  const mid = (size) => Math.floor(size / 2);
  const create = await post("/api/admin/maps/create", {
    id: MAP,
    name: "Rừng Thử", template: "forest",
    realm: 0,
    gate: { x: mid(forest.size), y: mid(forest.size), toX: mid(town.size), toY: mid(town.size) },
    back: { map: "town", x: mid(town.size) + 3, y: mid(town.size), toX: mid(forest.size), toY: mid(forest.size) },
  }, admin.cookie);
  check("the map is created", create.status === 200, JSON.stringify(create.data));
  check("a bad id and an existing id are refused", (await post("/api/admin/maps/create", { id: "Bad Id", template: "forest", realm: 0, gate: { x: 1, y: 1, toX: 1, toY: 1 }, back: { map: "town", x: 1, y: 1, toX: 1, toY: 1 } }, admin.cookie)).status === 400 && (await post("/api/admin/maps/create", { id: MAP, template: "forest", realm: 0, gate: { x: 1, y: 1, toX: 1, toY: 1 }, back: { map: "town", x: 1, y: 1, toX: 1, toY: 1 } }, admin.cookie)).status === 400);
  const view = await get(`/api/admin/maps/recipe?id=${MAP}`, admin.cookie);
  check("the new map has the template's monsters and a gate to the town", view.status === 200 && view.data.recipe.content.groups.length > 8 && view.data.recipe.portals[0].toMap === "town" && view.data.code === false);
  check("the town has the gate to it", (await get("/api/admin/maps/recipe?id=town", admin.cookie)).data.recipe.portals.some((p) => p.toMap === MAP));

  console.log("waiting for the 30 s cache...");
  await sleep(32000);
  sql(`UPDATE characters SET map_id='${MAP}', x=${view.data.recipe.spawn[0]}, y=${view.data.recipe.spawn[1]} WHERE id='${a.id}'`);
  sql(`UPDATE characters SET map_id='${MAP}', x=${view.data.recipe.spawn[0]}, y=${view.data.recipe.spawn[1]} WHERE id='${b.id}'`);
  const first = await join(a.cookie);
  check("a character standing in the new map joins it", first.welcome.map === MAP, first.welcome.map);
  check("the welcome carries the recipe and the map's monsters", first.welcome.mapRecipe?.id === MAP && first.welcome.monsters.length > 0, `${first.welcome.monsters.length} monsters`);

  // Change the colours while A is inside; B joins the same room afterwards.
  const colour = 0x123456;
  const saved = await post("/api/admin/maps/save", { recipe: { ...view.data.recipe, palette: { ...view.data.recipe.palette, groundA: colour } }, updatedAt: view.data.updatedAt }, admin.cookie);
  check("the colours are changed while a player is inside", saved.status === 200, JSON.stringify(saved.data));
  console.log("waiting for the 30 s cache...");
  await sleep(32000);
  const second = await join(b.cookie);
  check("a newcomer of the same room gets the recipe the room pinned, not the new one", second.welcome.mapRecipe?.palette.groundA === view.data.recipe.palette.groundA, String(second.welcome.mapRecipe?.palette.groundA));
  first.ws.close();
  second.ws.close();
  await sleep(2500);
  const third = await join(a.cookie);
  check("once the room has been empty the next player gets the new recipe", third.welcome.mapRecipe?.palette.groundA === colour, String(third.welcome.mapRecipe?.palette.groundA));
  third.ws.close();
  await sleep(1500);

  // Deleting: refused while something points at it.
  const now = (await get(`/api/admin/maps/recipe?id=${MAP}`, admin.cookie)).data;
  const blocked = await post("/api/admin/maps/delete", { id: MAP, updatedAt: now.updatedAt }, admin.cookie);
  check("deleting is refused while the town has a gate to it and characters stand there", blocked.status === 400 && blocked.data.problems.length >= 2, JSON.stringify(blocked.data.problems));
  check("a map of the code cannot be deleted", (await post("/api/admin/maps/delete", { id: "forest", updatedAt: 0 }, admin.cookie)).status === 409);
} finally {
  try {
    sql(`UPDATE characters SET map_id='town' WHERE map_id='${MAP}'`);
    if (admin) {
      const t = (await get("/api/admin/maps/recipe?id=town", admin.cookie)).data;
      if (t.recipe?.portals.some((p) => p.toMap === MAP)) await post("/api/admin/maps/save", { recipe: { ...t.recipe, portals: t.recipe.portals.filter((p) => p.toMap !== MAP) }, updatedAt: t.updatedAt }, admin.cookie);
      const m = (await get(`/api/admin/maps/recipe?id=${MAP}`, admin.cookie)).data;
      if (m.recipe) {
        const del = await post("/api/admin/maps/delete", { id: MAP, updatedAt: m.updatedAt }, admin.cookie);
        check("once nothing points at it the map is deleted", del.status === 200, JSON.stringify(del.data));
      }
      const t2 = (await get("/api/admin/maps/recipe?id=town", admin.cookie)).data;
      if (t2.edited) await post("/api/admin/maps/save", { reset: true, id: "town", updatedAt: t2.updatedAt }, admin.cookie);
    }
  } catch (err) {
    console.error("cleanup failed", err);
  }
}
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

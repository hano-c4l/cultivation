// Local test of the item admin screen (3g): permissions, an item made by an admin, a renamed item of the code, the welcome carrying both after the
// 30 s catalogue cache, a gift of the new item claimed in game, then a soft delete (owned) and a hard delete. Cleans up after itself.
// Usage: node tools/items-admin-smoke.mjs [ws://localhost:8787]   (needs wrangler dev, DISABLE_RATE_LIMIT=1; local only; takes about 40 s)
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

const id1 = `qi_${run}`.slice(0, 30);
const id2 = `qj_${run}`.slice(0, 30);
try {
  check("anonymous list is 401", (await get("/api/admin/items")).status === 401);
  const player = await post("/api/register", { email: `it-player-${run}@example.test`, password: "correct-horse-battery" });
  const char = (await post("/api/character", { name: `It ${run.slice(-4)}`, gender: "male" }, player.cookie)).data.character;
  check("a player cannot read, save or delete", (await get("/api/admin/items", player.cookie)).status === 403 && (await post("/api/admin/items/save", {}, player.cookie)).status === 403 && (await post("/api/admin/items/delete", {}, player.cookie)).status === 403);

  const adminEmail = `it-admin-${run}@example.test`;
  const admin = await post("/api/register", { email: adminEmail, password: "correct-horse-battery" });
  sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
  await sleep(3000);

  const list = await get("/api/admin/items", admin.cookie);
  const thao = list.data.items?.find((i) => i.def.id === "linh_thao");
  check("the list has the items of the code, with values, and no equipment", list.status === 200 && list.data.items.length > 20 && thao?.value === 3 && !list.data.items.some((i) => i.def.id.startsWith("eq.")), String(list.status));

  const item = { id: id1, nameVi: "Đan Thử Admin", descVi: "Đan do smoke tạo.", rarity: "rare", grade: 2, category: "consumable", maxStack: 20, healFraction: 0.5 };
  const bad = await post("/api/admin/items/save", { item: { ...item, category: "equipment" }, isNew: true, updatedAt: 0, valueToken: list.data.valueToken }, admin.cookie);
  check("a bad item is refused", bad.status === 400 && bad.data.error === "invalid");
  const made = await post("/api/admin/items/save", { item, isNew: true, updatedAt: 0, value: 120, valueToken: list.data.valueToken }, admin.cookie);
  check("an item is made, with a sell value", made.status === 200, JSON.stringify(made.data));
  check("the same id again is refused", (await post("/api/admin/items/save", { item, isNew: true, updatedAt: 0, valueToken: 0 }, admin.cookie)).status === 409);

  const code = thao.def;
  const renamed = await post("/api/admin/items/save", { item: { id: "linh_thao", nameVi: "Linh Thảo (thử)", descVi: code.descVi, rarity: code.rarity, grade: code.grade }, isNew: false, updatedAt: thao.updatedAt, valueToken: 0 }, admin.cookie);
  check("an item of the code is renamed", renamed.status === 200, JSON.stringify(renamed.data));
  check("a code item cannot be deleted", (await post("/api/admin/items/delete", { id: "linh_thao", updatedAt: 0 }, admin.cookie)).data.error === "bound");

  console.log("waiting 32 s for the catalogue cache...");
  await sleep(32_000);
  const ws = new WebSocket(`${base}/ws?ch=5`, { headers: { Cookie: player.cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => ev.data !== "pong" && log.push(JSON.parse(ev.data)));
  await new Promise((r) => ws.addEventListener("open", r));
  for (let i = 0; i < 40 && !log.some((m) => m.t === "welcome"); i++) await sleep(100);
  const welcome = log.find((m) => m.t === "welcome");
  check("the welcome carries the new item and the renamed one", welcome?.items?.some((o) => o.id === id1 && o.custom && o.def.nameVi === "Đan Thử Admin") && welcome.items.some((o) => o.id === "linh_thao" && o.def.nameVi === "Linh Thảo (thử)"), JSON.stringify(welcome?.items));

  const sent = await post("/api/admin/gifts/send", { batchId: `it${run}a`.slice(0, 24), subject: "Quà thử", body: "", audience: { kind: "list", characterIds: [char.id] }, gift: { items: [{ type: id1, qty: 3 }] }, expiresInDays: null }, admin.cookie);
  check("the new item can be gifted", sent.status === 200 && sent.data.recipients === 1, JSON.stringify(sent.data));
  await sleep(800);
  ws.send(JSON.stringify({ t: "mail_refresh" }));
  await sleep(800);
  const mail = log.filter((m) => m.t === "mail").at(-1)?.mail.find((m) => m.gift?.items?.[0]?.type === id1);
  ws.send(JSON.stringify({ t: "mail_claim", id: mail?.id ?? "x" }));
  await sleep(1200);
  check("it is claimed into the bag", log.some((m) => m.t === "inv" && m.items.some((i) => i.type === id1 && i.qty === 3)));
  ws.close();

  const cur = (await get("/api/admin/items", admin.cookie)).data.items.find((i) => i.def.id === id1);
  check("the list counts the owner", cur.owned === 3 && cur.custom === true);
  const soft = await post("/api/admin/items/delete", { id: id1, updatedAt: cur.updatedAt }, admin.cookie);
  check("deleting an owned item is a soft delete", soft.status === 200 && soft.data.mode === "soft", JSON.stringify(soft.data));
  check("a deleted item cannot be gifted any more", (await post("/api/admin/gifts/send", { batchId: `it${run}b`.slice(0, 24), subject: "Quà", body: "", audience: { kind: "list", characterIds: [char.id] }, gift: { items: [{ type: id1, qty: 1 }] }, expiresInDays: null }, admin.cookie)).data.error === "invalid_gift");

  const made2 = await post("/api/admin/items/save", { item: { ...item, id: id2 }, isNew: true, updatedAt: 0, valueToken: 0 }, admin.cookie);
  const hard = await post("/api/admin/items/delete", { id: id2, updatedAt: made2.data.updatedAt }, admin.cookie);
  check("an item nobody owns is deleted for good", hard.status === 200 && hard.data.mode === "hard" && sql(`SELECT COUNT(*) AS n FROM items WHERE id='${id2}'`)[0].n === 0, JSON.stringify(hard.data));
  const log2 = (await get(`/api/admin/log?q=${encodeURIComponent(id1)}&size=5`, admin.cookie)).data.rows ?? [];
  check("the admin log has the changes", log2.some((r) => r.screen === "Vật phẩm" && r.content.includes("Thêm")) && log2.some((r) => r.content.includes("Xóa mềm")));
} finally {
  // Put the local catalogue back as it was: the made items, the rename and the value.
  sql(`DELETE FROM item_instances WHERE item_type IN ('${id1}', '${id2}')`);
  sql(`DELETE FROM items WHERE id IN ('${id1}', '${id2}', 'linh_thao')`);
  sql("UPDATE config_versions SET version = version + 1 WHERE name = 'items'");
  sql(`UPDATE game_tuning SET value = json_remove(value, '$.items.${id1}', '$.items.${id2}'), updated_at = updated_at + 1 WHERE name = 'itemValue'`);
  sql("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
}
console.log(failures === 0 ? "\nall item admin checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

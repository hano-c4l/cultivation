// Local test of hướng tu (phase 2d-B): below Trúc Cơ a path is refused, the placeholder item is handed out once per path, a path
// needs its item, the first path is the chủ tu, a phụ tu also costs Linh Thạch, the same path twice and a fourth path are refused,
// the paths and their skills are saved and come back after reconnecting.
// Usage: node tools/paths-smoke.mjs [ws://localhost:8787]
// Registers a throwaway account and uses a dev-only endpoint: local only, needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1.
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
function open(cookie, ch) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  const wait = async (pred, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error("timed out");
      await sleep(50);
    }
  };
  return { ws, log, opened, wait, send: (m) => ws.send(JSON.stringify(m)) };
}
async function connect(cookie, ch = 6) {
  const c = open(cookie, ch);
  await c.opened;
  await c.wait((m) => m.t === "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
async function after(c, msg, wait = 700) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}

const reg = await post("/api/register", { email: `pa-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Tu${run.slice(-5)}`, gender: "male" }, reg.cookie);
check("character created", created.status === 201);
const id = created.data.character.id;
let ledgerN = 0;
const fund = (amount) => {
  sql(`INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', 0)`);
  sql(`INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES ('${id}', 'linh_thach', ${amount}, 'test', 'smoke', 'pa-smoke-${run}-${++ledgerN}', 0)`);
  sql(`UPDATE currency_balances SET balance = balance + ${amount} WHERE character_id = '${id}' AND currency = 'linh_thach'`);
};
const lastStats = (c) => [...c.log].reverse().find((m) => m.t === "stats")?.character;
const errorOf = (r) => r.find((m) => m.t === "path_error")?.reason;

let c = await connect(reg.cookie);
check("a new character has no paths", c.welcome.character.paths.main === null && c.welcome.character.paths.subs.length === 0);
let r = await after(c, { t: "path_claim", path: "kiem" });
check("below Trúc Cơ the item is refused (level)", errorOf(r) === "level");
r = await after(c, { t: "path_choose", path: "kiem" });
check("... and so is choosing", errorOf(r) === "level");

c.ws.close();
await sleep(500);
sql(`UPDATE characters SET realm = 1, stage = 1, exp = 0 WHERE id = '${id}'`);
c = await connect(reg.cookie);

r = await after(c, { t: "path_choose", path: "kiem" });
check("without the item choosing is refused (no_item)", errorOf(r) === "no_item");
r = await after(c, { t: "path_claim", path: "kiem" });
check("the item is handed out", r.some((m) => m.t === "path_claimed" && m.path === "kiem") && r.some((m) => m.t === "inv"));
r = await after(c, { t: "path_claim", path: "kiem" });
check("only once per path (claimed)", errorOf(r) === "claimed");

r = await after(c, { t: "path_choose", path: "kiem" });
const s1 = lastStats(c);
check("the first path is the chủ tu", s1?.paths.main === "kiem" && s1.paths.subs.length === 0);
check("the item was spent and the path skills arrived", sql(`SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = '${id}' AND item_type = 'path_item_kiem'`)[0].q === 0 && r.some((m) => m.t === "skills" && m.ids.includes("kt_kiem_khi") && m.ids.includes("kt_lien_hoan")));
check("saved: row, text and skills", sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths === "kiem" && sql(`SELECT COUNT(*) AS n FROM character_skills WHERE character_id = '${id}' AND source = 'path'`)[0].n === 2);

r = await after(c, { t: "path_claim", path: "dan" });
check("another path's item is handed out", r.some((m) => m.t === "path_claimed" && m.path === "dan"));
r = await after(c, { t: "path_choose", path: "dan" });
check("a phụ tu needs Linh Thạch (funds), and nothing changes", errorOf(r) === "funds" && sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths === "kiem" && sql(`SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = '${id}' AND item_type = 'path_item_dan'`)[0].q === 1);
fund(100000);
r = await after(c, { t: "path_choose", path: "dan" });
const s2 = lastStats(c);
check("with the money the next path is a phụ tu", s2?.paths.main === "kiem" && s2.paths.subs.join() === "dan", JSON.stringify(s2?.paths));
check("the Linh Thạch was paid", r.some((m) => m.t === "wallet" && m.currency === "linh_thach" && m.balance < 100000));

r = await after(c, { t: "path_choose", path: "kiem" });
check("a path already taken is refused (have)", errorOf(r) === "have");
await after(c, { t: "path_claim", path: "thuat" });
r = await after(c, { t: "path_choose", path: "thuat" });
check("the second phụ tu works", lastStats(c)?.paths.subs.join() === "dan,thuat");
check("saved after three paths", sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths === "kiem:dan:thuat" && sql(`SELECT COUNT(*) AS n FROM character_paths WHERE character_id = '${id}'`)[0].n === 3);

c.ws.close();
await sleep(500);
c = await connect(reg.cookie);
check("the paths come back after reconnecting", c.welcome.character.paths.main === "kiem" && c.welcome.character.paths.subs.join() === "dan,thuat");
check("... with their skills", ["kt_kiem_khi", "tt_phap_an", "dt_hoi_xuan"].every((s) => c.welcome.skills.includes(s)));

// --- swap, drop, level up ---
fund(1_000_000);
r = await after(c, { t: "path_swap", path: "kiem" }, 700);
check("the chủ tu cannot be swapped with itself", errorOf(r) === "no_path");
r = await after(c, { t: "path_swap", path: "dan" }, 900);
const sw = lastStats(c);
check("a phụ tu becomes the chủ tu and the old one takes its place", sw?.paths.main === "dan" && sw.paths.subs.join() === "kiem,thuat", JSON.stringify(sw?.paths));
check("the swap cost Linh Thạch and saved", r.some((m) => m.t === "wallet" && m.currency === "linh_thach") && sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths === "dan:kiem:thuat");
await after(c, { t: "hotbar_set", slot: 0, v: "s:tt_phap_an" }, 500);
r = await after(c, { t: "path_drop", path: "thuat" }, 900);
const dr = lastStats(c);
check("dropping removes the path and its skills", dr?.paths.subs.join() === "kiem" && !sql(`SELECT skill_id FROM character_skills WHERE character_id = '${id}'`).some((x) => x.skill_id === "tt_phap_an"));
check("... and clears them from the hotbar", r.some((m) => m.t === "hotbar" && m.slots[0] === ""));
check("... and the item can be had again", sql(`SELECT COUNT(*) AS n FROM item_grants WHERE key = 'path_item:${id}:thuat'`)[0].n === 0);

// Level up: both skills of the first level at the top mastery level (16 Ngộ Đạo Đan each, 100 points apiece).
await fetch(`${httpBase}/api/dev/loot?room=town:6&char=${id}&item=ngo_dao_dan&qty=40`);
await sleep(800);
for (const skill of ["kt_kiem_khi", "kt_lien_hoan"]) for (let i = 0; i < 16; i++) await after(c, { t: "skill_boost", skill }, 220);
await sleep(800);
const lv = lastStats(c);
check("both skills at the top: the path goes up a level", lv?.paths.levels?.kiem === 1, JSON.stringify(lv?.paths));
check("the two skills of the next level arrived", c.log.some((m) => m.t === "skills" && m.ids.includes("kt_kiem_y") && m.ids.includes("kt_kiem_vu")));
check("saved: level in the row and the text", sql(`SELECT level FROM character_paths WHERE character_id = '${id}' AND path_id = 'kiem'`)[0].level === 1 && sql(`SELECT paths FROM characters WHERE id = '${id}'`)[0].paths === "dan:kiem.1");

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

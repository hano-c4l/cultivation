// Local test of the third town and the two new realms (Hóa Thần, Luyện Hư): the town's merchant, alchemist, blacksmith, elder and teleport array, the two new maps (monsters,
// guards at the gate) and a full breakthrough from Nguyên Anh into Hóa Thần (the wait is shortened in the local D1 for the test and put back afterwards).
// Usage: node tools/town3-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars
// (and migration 0055 applied: npm run db:migrate:local). Never run it against preview or production.
import { execFileSync } from "node:child_process";
import { getMap } from "../shared/src/map.ts";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const CH = 3;
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

function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=${CH}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  const wait = async (pred, ms = 5000, label = "message") => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
      await sleep(50);
    }
  };
  return { ws, log, opened, wait, send: (m) => ws.send(JSON.stringify(m)) };
}
async function connect(cookie) {
  const c = open(cookie);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 5000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
async function after(c, msg, wait = 700) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(wait);
  return c.log.slice(mark);
}

const town3 = getMap("town3");
const near = (id) => {
  const n = town3.npcs.find((x) => x.id === id);
  return [n.x + 1, n.y + 2];
};

async function makePlayer(tag, map, x, y, realm, stage) {
  const reg = await post("/api/register", { email: `t3-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = ${realm}, stage = ${stage}, exp = 0, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500);
  return { id, cookie: reg.cookie };
}
const fund = (charId, amount) => {
  sql(`INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES ('${charId}', 'linh_thach', 0)`);
  sql(`INSERT INTO linh_thach_totals (character_id, grp, total_in, total_out, updated_at) VALUES ('${charId}', 'other', ${amount}, 0, 0) ON CONFLICT (character_id, grp) DO UPDATE SET total_in = total_in + ${amount}`);
  sql(`UPDATE currency_balances SET balance = balance + ${amount} WHERE character_id = '${charId}' AND currency = 'linh_thach'`);
};

// --- the town: merchant, array, elder -------------------------------------------------------------------------------------------------------------
const p = await makePlayer("P", "town3", ...near("merchant3"), 4, 9);
fund(p.id, 400_000_000);
let c = await connect(p.cookie);
check("the character starts in the third town", c.welcome.map === "town3");
let r = await after(c, { t: "npc_open", npc: "merchant3" });
const shop = r.find((m) => m.t === "shop");
check("the third town's merchant opens, with the daily stock of the Hóa Thần pill", !!shop && shop.left.than_huyet_dan === 30 && !!shop.tuning, JSON.stringify(shop?.left));
r = await after(c, { t: "shop_buy", npc: "merchant3", offer: "than_huyet_dan", qty: 2 }, 900);
check("buying a Thần Huyết Đan works", r.some((m) => m.t === "shop_ok" && m.op === "buy" && m.item === "than_huyet_dan"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "shop_buy", npc: "merchant3", offer: "ttp_town3", qty: 1 }, 900);
check("the talisman of the third town is for sale", r.some((m) => m.t === "shop_ok" && m.item === "ttp_town3"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "shop_buy", npc: "merchant3", offer: "ttp_town2", qty: 1 }, 600);
check("the talisman of the second town is not", !r.some((m) => m.t === "shop_ok"));
r = await after(c, { t: "shop_buy", npc: "merchant3", offer: "bt_kim_6", qty: 1 }, 900);
check("the Hóa Thần book of an element is for sale", r.some((m) => m.t === "shop_ok" && m.item === "bt_kim_6"), JSON.stringify(r.map((m) => m.t)));

c.ws.close();
await sleep(600);
sql(`UPDATE characters SET x = ${near("waygate3")[0]}, y = ${near("waygate3")[1]} WHERE id = '${p.id}'`);
await sleep(2500);
c = await connect(p.cookie);
r = await after(c, { t: "npc_open", npc: "waygate3" });
const dests = r.find((m) => m.t === "waygate");
check("the teleport array lists the other main towns", !!dests && dests.dests.some((d) => d.map === "town" && d.price === 8500) && dests.dests.some((d) => d.map === "town2" && d.price === 4500), JSON.stringify(dests));

c.ws.close();
await sleep(600);
sql(`UPDATE characters SET x = ${near("elder3")[0]}, y = ${near("elder3")[1]} WHERE id = '${p.id}'`);
await sleep(2500);
c = await connect(p.cookie);
r = await after(c, { t: "npc_open", npc: "elder3" });
const ids = r.find((m) => m.t === "quests")?.defs.map((d) => d.id) ?? [];
check("the elder offers the Luyện Hư pill quest and the daily hunt of the Hóa Thần map to a Hóa Thần character", ids.includes("breakthrough_5") && ids.includes("daily_hoathan"), JSON.stringify(ids));
r = await after(c, { t: "quest_accept", npc: "elder3", quest: "daily_luyenhu" }, 500);
check("but not the Luyện Hư one", r.some((m) => m.t === "quest_error"), JSON.stringify(r.map((m) => m.t)));
r = await after(c, { t: "quest_accept", npc: "elder3", quest: "daily_hoathan" }, 500);
check("and the character can take the Hóa Thần hunt", r.some((m) => m.t === "quest_active"), JSON.stringify(r.map((m) => m.t)));
c.ws.close();

// --- the two new maps -----------------------------------------------------------------------------------------------------------------------------
for (const [id, realm, species] of [["hoathan", 4, ["loi_van_ho", "huyen_giap_quy", "phong_loi_ung"]], ["luyenhu", 5, ["hu_anh_bao", "tinh_ha_cu_linh", "hu_thien_ma_dieu"]]]) {
  const map = getMap(id);
  const q = await makePlayer(id.slice(0, 2).toUpperCase(), id, map.spawn[0] + 0.5, map.spawn[1] + 0.5, realm, 1);
  const cc = await connect(q.cookie);
  check(`${id}: the character stands on the map with its guards in view at the gate`, cc.welcome.map === id && cc.welcome.monsters.some((m) => m.guard));
  check(`${id}: the monsters near the gate are the map's own species`, cc.welcome.monsters.some((m) => !m.guard && species.includes(m.kind)), JSON.stringify([...new Set(cc.welcome.monsters.map((m) => m.kind))]));
  cc.ws.close();
}

// --- a full breakthrough Nguyên Anh -> Hóa Thần, with the wait and the chance set for the test --------------------------------------------------------
const town1 = getMap("town"); // the dev endpoint that hands out items only knows the first town, the forest and the cave
const b = await makePlayer("B", "town", town1.spawn[0] + 2.5, town1.spawn[1] + 2.5, 3, 9);
fund(b.id, 50_000_000);
await fetch(`${httpBase}/api/dev/grant-exp`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: b.cookie }, body: JSON.stringify({ exp: 1_000_000_000_000 }) });
sql(`UPDATE game_tuning SET value = json_set(value, '$.steps[3].durationMs', 3000, '$.steps[3].baseRatePct', 100, '$.steps[3].maxRatePct', 100) WHERE name = 'breakthrough'`);
sql(`UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'`);
console.log("waiting 32 s for the rooms to read the shortened breakthrough...");
await sleep(32_000);
let outcome = null;
try {
  c = await connect(b.cookie);
  const gave = await fetch(`${httpBase}/api/dev/loot?room=town:${CH}&char=${b.id}&item=bt_pill_4&qty=1`).then((x) => x.json());
  check("the Hóa Thần pill exists as an item", gave.ok !== false, JSON.stringify(gave));
  await sleep(6000); // the walk after the grant ends
  r = await after(c, { t: "bt_start", pills: 1 }, 900);
  const started = r.find((m) => m.t === "bt");
  check("the Hóa Thần breakthrough starts (the pill and the 5 000 000 Linh Thạch are taken)", !!started && started.ratePct >= 100 && started.ms === 3000, JSON.stringify(started ?? r));
  await sleep(4500);
  outcome = c.log.find((m) => m.t === "bt_end");
  check("it ends in success", outcome?.ok === true && outcome.realm === 4, JSON.stringify(outcome));
  const row = sql(`SELECT realm, stage FROM characters WHERE id = '${b.id}'`)[0];
  check("the character is saved in Hóa Thần, stage 1", row.realm === 4 && row.stage === 1, JSON.stringify(row));
  const skills = sql(`SELECT skill_id FROM character_skills WHERE character_id = '${b.id}' AND realm = 4`).length;
  check("and has the two root skills of the new realm", skills >= 2, String(skills));
  c.ws.close();
} finally {
  sql(`UPDATE game_tuning SET value = json_set(value, '$.steps[3].durationMs', 600000, '$.steps[3].baseRatePct', 45, '$.steps[3].maxRatePct', 65) WHERE name = 'breakthrough'`);
  sql(`UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'`);
}

console.log(failures === 0 ? "all town3 checks passed" : `${failures} town3 check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

// Local test of PvP and the three scores (phase 2f, PR1): the PK switch, the newbie protection, a kill and what it does to sát khí,
// sát nhân and anh hùng (white victim, self defence, orange victim), the name colour broadcast, and the scores kept in D1.
// Usage: node tools/pvp-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and PK_DROP_FORCE=1 (the PvP item drop always succeeds) in .dev.vars. Never run it against preview or production.
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
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
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

/** A character standing in the forest gate at (x, 4.5): stage, sát nhân and HP as asked. */
async function makePlayer(tag, x, { stage = 5, satNhan = 0, satKhi = 0, hero = 0, hp = null, y = 4.5 } = {}) {
  const reg = await post("/api/register", { email: `pvp-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  const vitals = hp === null ? "NULL" : `json_object('hp', ${hp}, 'mp', 10, 'at', ${Date.now()}, 'cd', json_object(), 'buffs', json('[]'))`;
  sql(`UPDATE characters SET map_id = 'forest', x = ${x}, y = ${y}, realm = 0, stage = ${stage}, exp = 0, sat_nhan = ${satNhan}, sat_khi = ${satKhi}, anh_hung = ${hero}, vitals = ${vitals} WHERE id = '${id}'`);
  return { id, cookie: reg.cookie, tag };
}
const row = (id) => sql(`SELECT sat_khi, sat_nhan, anh_hung, stage FROM characters WHERE id = '${id}'`)[0];
const lastPk = (c) => [...c.log].reverse().find((m) => m.t === "pk");

// --- the newbie protection works both ways, and the switch must be on ---
const a = await makePlayer("A", 20.5);
const young = await makePlayer("Y", 21.5, { stage: 4 });
const b = await makePlayer("B", 22.5, { hp: 1 });
const ca = await connect(a.cookie);
const cy = await connect(young.cookie);
const cb = await connect(b.cookie);
check("the join tells you the PK switch is off and your scores", lastPk(ca)?.mode === 0 && lastPk(ca)?.satKhi === 0);
let r = await after(ca, { t: "attack", id: b.id });
check("with the switch off a player cannot be attacked", r.some((m) => m.t === "pk_error" && m.reason === "off"));
r = await after(ca, { t: "pk_mode", mode: 2 });
check("the state turns to Đồ sát", lastPk(ca)?.mode === 2);
r = await after(ca, { t: "attack", id: young.id });
check("a player under Luyện Khí tầng 5 is protected", r.some((m) => m.t === "pk_error" && m.reason === "protected"));
r = await after(cy, { t: "pk_mode", mode: 2 });
r = await after(cy, { t: "attack", id: a.id });
check("and cannot attack either", r.some((m) => m.t === "pk_error" && m.reason === "protected"));
cy.ws.close();

// --- a kill of a white name: +10 sát khí, +100 sát nhân; the victim loses 50 sát khí and goes home ---
r = await after(ca, { t: "attack", id: b.id }, 400);
await ca.wait((m) => m.t === "pk" && m.satKhi === 10, 8000, "A's scores after the kill").catch(() => null);
const killerPk = lastPk(ca);
check("the killer gets +10 sát khí and +100 sát nhân (a white victim)", killerPk?.satKhi === 10 && killerPk?.satNhan >= 99 && killerPk?.satNhan <= 100, JSON.stringify(killerPk));
check("the victim died and went to town", cb.log.some((m) => m.t === "died") && cb.log.some((m) => m.t === "transfer"));
check("everyone in the room is told the new sát nhân of the killer (the name colour)", ca.log.some((m) => m.t === "pk_score" && m.id === a.id && m.sn >= 99));
await sleep(800);
const rowA = row(a.id);
check("the scores are in D1", rowA.sat_khi === 10 && rowA.sat_nhan >= 99 && rowA.sat_nhan <= 100, JSON.stringify(rowA));
check("the victim lost nothing it did not have (sát khí and sát nhân floor at 0)", row(b.id).sat_nhan === 0 && row(b.id).sat_khi === 0, JSON.stringify(row(b.id)));
check("a kill gives no EXP", row(a.id).stage === 5 && ca.log.filter((m) => m.t === "stats").every((m) => m.character.exp === 0));

// --- self defence: the victim hit the killer first, showing white: sát khí only ---
const c1 = await makePlayer("C", 21.5, { hp: 1 });
const cc = await connect(c1.cookie);
await after(cc, { t: "pk_mode", mode: 2 });
await after(cc, { t: "attack", id: a.id }, 1800); // C hits A first
await after(cc, { t: "pk_mode", mode: 0 });
const before = { ...row(a.id) };
sql(`UPDATE characters SET sat_khi = sat_khi WHERE id = '${a.id}'`);
await after(ca, { t: "attack", id: c1.id }, 300);
await ca.wait((m) => m.t === "pk" && m.satKhi >= 20, 8000, "A's scores after the second kill").catch(() => null);
const second = lastPk(ca);
check("self defence: +10 sát khí (20) but no new sát nhân", second?.satKhi === 20 && second?.satNhan <= 100 && second?.satNhan >= 90, JSON.stringify(second));
cc.ws.close();

// --- an orange victim: a killer with sát nhân 0 earns hero points, nothing else ---
// Down the lane, away from the guards at the gate (they go for orange and red names) and from the monster clusters.
const k = await makePlayer("K", 20.5, { y: 22.5 });
const o = await makePlayer("O", 21.5, { satNhan: 300, hp: 1, y: 22.5 });
// The orange victim carries one stack; with PK_DROP_FORCE=1 in .dev.vars the roll always succeeds (the real chance for orange is 25%).
sql(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('pk-smoke-${run}', '${o.id}', 'linh_thao', 7, 0, 0, 0)`);
const ck = await connect(k.cookie);
const co = await connect(o.cookie);
check("an orange name is announced by its sát nhân when it joins", ck.log.some((m) => m.t === "joined" && m.player.id === o.id && m.player.sn >= 299), JSON.stringify(ck.log.filter((m) => m.t === "joined").map((m) => m.player.sn)));
await after(ck, { t: "pk_mode", mode: 2 });
await after(ck, { t: "attack", id: o.id }, 300);
await ck.wait((m) => m.t === "pk" && m.satKhi === 10, 8000, "K's scores after killing an orange name").catch(() => null);
const kk = lastPk(ck);
check("killing an orange name with sát nhân 0 gives +20 anh hùng and no sát nhân", kk?.hero === 20 && kk?.satNhan === 0 && kk?.satKhi === 10, JSON.stringify(kk));
await sleep(500);
check("and the hero points are in D1", row(k.id).anh_hung === 20, JSON.stringify(row(k.id)));
check("the orange victim lost 50 sát nhân", row(o.id).sat_nhan === 250, JSON.stringify(row(o.id)));
// --- the drop (needs PK_DROP_FORCE=1 in .dev.vars) ---
check("the victim lost its stack (it is not in its bag any more)", sql(`SELECT COUNT(*) AS n FROM item_instances WHERE owner_character_id = '${o.id}' AND item_type = 'linh_thao'`)[0].n === 0);
check("the killer owns a copy of it, unplaced, with an unexpiring mail", sql(`SELECT COUNT(*) AS n FROM item_instances WHERE owner_character_id = '${k.id}' AND item_type = 'linh_thao' AND qty = 7 AND cell IS NULL`)[0].n === 1 && sql(`SELECT COUNT(*) AS n FROM mailbox WHERE character_id = '${k.id}' AND subject = 'pk_drop' AND expires_at IS NULL AND claimed_at IS NULL`)[0].n === 1);
check("both sides are told", ck.log.some((m) => m.t === "pk_drop" && m.role === "killer" && m.item === "linh_thao" && m.qty === 7) && co.log.some((m) => m.t === "pk_drop" && m.role === "victim"), JSON.stringify(ck.log.filter((m) => m.t === "pk_drop")));
check("and the killer's mail list shows it", ck.log.some((m) => m.t === "mail" && m.mail.some((x) => x.subject === "pk_drop")));

ca.ws.close();
ck.ws.close();
console.log(failures === 0 ? "\nall pvp checks passed" : `\n${failures} pvp check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

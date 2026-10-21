// Local test of the map boss (phase 2h): the GM summon puts one boss in the room, the claim in D1 keeps other channels of the map from getting one,
// and the boss stands again when the room is rebuilt. Non-admins cannot summon.
// Usage: node tools/boss-smoke.mjs [ws://localhost:8787]
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
let CH = 3;
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


/** A character standing at (map, x, y) with the given sát nhân. */
async function makePlayer(tag, map, x, y, satNhan = 0, admin = false) {
  const reg = await post("/api/register", { email: `bs-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  if (admin) sql(`UPDATE accounts SET role = 'admin' WHERE email = 'bs-${tag}-${run}@example.test'`);
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}


sql("DELETE FROM world_boss");
const bossIn = (c) => c.log.find((m) => m.t === "mon" && m.monster.boss);

const gm = await makePlayer("A", "forest", 20.5, 12.5, 0, true);
CH = 3;
const chatLog = [];
const chat = new WebSocket(`${base}/ws/chat`, { headers: { Cookie: gm.cookie } });
chat.addEventListener("message", (ev) => {
  if (ev.data !== "pong") chatLog.push(JSON.parse(ev.data));
});
await new Promise((res) => chat.addEventListener("open", res));
const c1 = await connect(gm.cookie);
check("no boss at the start", !c1.welcome.monsters.some((m) => m.boss));
const plain = await makePlayer("P", "forest", 20.5, 12.5);
const cp = await connect(plain.cookie);
cp.send({ t: "boss_summon" });
await sleep(1500);
check("a player who is not an admin cannot call the boss", !bossIn(cp) && sql("SELECT * FROM world_boss").length === 0);
cp.ws.close();

c1.send({ t: "boss_summon" });
const spawned = await c1.wait((m) => m.t === "mon" && m.monster.boss, 6000, "the boss").catch(() => null);
check("the GM summon puts the boss in the room", !!spawned, JSON.stringify(spawned?.monster));
await sleep(500);
check("the whole world is told with a system line naming the boss", chatLog.some((m) => m.t === "chat" && m.channel === "system" && /Huyết Lang Vương/.test(m.text) && /kênh 3/.test(m.text)), JSON.stringify(chatLog));
const claims = sql("SELECT room FROM world_boss");
check("the claim names this room", claims.length === 1 && claims[0].room === "forest:3", JSON.stringify(claims));
check("the boss is a Đại Yêu of the top bậc with a lot of HP", spawned?.monster.tier === 9 && spawned?.monster.maxHp > 5000, JSON.stringify(spawned?.monster));

// Another channel of the same map is refused.
CH = 4;
const gm2 = await makePlayer("B", "forest", 20.5, 12.5, 0, true);
const c2 = await connect(gm2.cookie);
c2.send({ t: "boss_summon" });
await sleep(1500);
check("another channel of the map gets no second boss", !bossIn(c2) && !c2.welcome.monsters.some((m) => m.boss) && sql("SELECT room FROM world_boss").length === 1);
c2.ws.close();

// The room goes empty and comes back: the claim is still there and the boss stands again.
CH = 3;
c1.ws.close();
await sleep(2500);
const c3 = await connect(gm.cookie);
check("after the room slept the welcome lists the boss again", c3.welcome.monsters.some((m) => m.boss), JSON.stringify(c3.welcome.monsters.map((m) => m.kind)));
const bossId = c3.welcome.monsters.find((m) => m.boss)?.id;

// Kill it: a second character beside it, the boss left with 1 HP by the dev hook (local only).
const k = await makePlayer("K", "forest", 33.5, 12.5);
const ck = await connect(k.cookie);
const hook = await fetch(`${httpBase}/api/dev/boss-hp?room=forest:3&hp=1`).then((r) => r.json());
check("the dev hook left the boss on 1 HP", hook.ok === true, JSON.stringify(hook));
ck.send({ t: "attack", id: bossId });
const gone = await ck.wait((m) => m.t === "mon_gone" && m.id === bossId, 10000, "the boss dying").catch(() => null);
check("the boss dies for good", !!gone);
await sleep(1500);
check("the claim is released", sql("SELECT room FROM world_boss").length === 0);
const paid = sql(`SELECT COUNT(*) AS n, COALESCE(SUM(delta), 0) AS total FROM currency_ledger WHERE character_id = '${k.id}' AND reason = 'monster_drop'`)[0];
check("the only sharer is paid Linh Thạch from the boss pool", paid.n === 1 && paid.total > 1000, JSON.stringify(paid));
check("and gains EXP", ck.log.some((m) => m.t === "stats"));
check("a second system line says the boss fell", chatLog.filter((m) => m.t === "chat" && m.channel === "system").length >= 2 && chatLog.some((m) => /hạ gục/.test(m.text ?? "")), JSON.stringify(chatLog.map((m) => m.text)));
check("the boss never comes back to this room", !(await connect(k.cookie).then((c) => { const has = c.welcome.monsters.some((m) => m.boss); c.ws.close(); return has; })));

// With the claim free a new summon works.
c3.send({ t: "boss_summon" });
const again = await c3.wait((m) => m.t === "mon" && m.monster.boss && m.monster.id !== bossId, 6000, "a new boss").catch(() => null);
check("a new boss can be summoned once the old one is dead", !!again);
ck.ws.close();
c3.ws.close();
chat.close();
sql("DELETE FROM world_boss");

console.log(failures === 0 ? "all boss checks passed" : `${failures} boss check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

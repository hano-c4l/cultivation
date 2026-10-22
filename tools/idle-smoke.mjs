import { TOWN_GATE, TOWN_SPAWN } from "./world.mjs";
// Local test of "pause the tick when idle": two clients stand in a forest room, the tick must stop, an eviction is
// imitated, and the next action must rebuild the sim (every player gets a profile back, monster classes are kept).
// Usage: node tools/idle-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts, so it only runs against localhost with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1
// in .dev.vars (stats and evict are dev-only endpoints). Never run it against preview or production.
const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const CHANNEL = 5;
const ROOM = `forest:${CHANNEL}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
const stats = async () => (await fetch(`${httpBase}/api/dev/tick-stats?room=${ROOM}`)).json();

function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=${CHANNEL}`, { headers: { Cookie: cookie } });
  const log = [];
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data === "pong") return;
    const msg = JSON.parse(ev.data);
    log.push(msg);
    for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  return {
    ws,
    log,
    opened,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 15000) => new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  };
}

/** Registers, then walks the character through the forest gate so the next connection lands in the forest. */
async function enterForest(tag) {
  const reg = await post("/api/register", { email: `idle-${run}-${tag}@example.test`, password: "correct-horse-battery" });
  const ch = await post("/api/character", { name: `Rảnh ${run.slice(-4)}${tag}` }, reg.cookie);
  let c = open(reg.cookie);
  await c.opened;
  await c.wait((m) => m.t === "welcome");
  c.send({ t: "move", x: TOWN_GATE[0], y: TOWN_GATE[1], fx: TOWN_SPAWN[0], fy: TOWN_SPAWN[1], seq: 1 });
  await sleep(10500);
  c.send({ t: "portal" });
  await c.wait((m) => m.t === "transfer");
  await sleep(400);
  c = open(reg.cookie);
  await c.opened;
  const welcome = await c.wait((m) => m.t === "welcome");
  return { c, welcome, id: ch.data.character.id, cookie: reg.cookie };
}

const a = await enterForest("a");
const b = await enterForest("b");
check("both players are in the forest room", a.welcome.map === "forest" && b.welcome.map === "forest");

// 1. Nothing happens, so the tick must stop and stay stopped.
let s = await stats();
for (let i = 0; i < 20 && !s.paused; i++) {
  await sleep(500);
  s = await stats();
}
check("the room pauses its tick when nothing happens", s.paused === true && s.pauses >= 1, JSON.stringify(s));
const frozen = s.count;
await sleep(2500);
s = await stats();
check("the tick count stops rising while paused", s.count === frozen, `${frozen} -> ${s.count}`);

// 2. Imitate the runtime evicting the sleeping object.
const wakesBefore = (await stats()).wakes; // joins also count as (empty) rebuilds
const ev = await (await fetch(`${httpBase}/api/dev/evict?room=${ROOM}`)).json();
check("a paused room can be evicted (dev hook)", ev.evicted === true);
s = await stats();
check("eviction wiped the sim", s.players === 0 && s.monsters === 0, JSON.stringify(s));

// 3. B attacks: the room must rebuild with BOTH players, restore monster classes and resync clients.
const ranksBefore = Object.fromEntries(a.welcome.monsters.map((m) => [m.id, m.rank]));
const target = b.welcome.monsters[0];
const mark = a.c.log.length;
b.c.send({ t: "attack", id: target.id });
await b.c.wait((m) => m.t === "mon" || m.t === "hit" || m.t === "path", 8000).catch(() => null);
await sleep(800);
s = await stats();
check("exactly one rebuild happened", s.wakes === wakesBefore + 1, JSON.stringify(s));
check("the rebuilt sim has profiles for both players, not only the sender", s.players === 2, `players ${s.players}`);
check("monsters are back (the whole map, not only what A was shown)", s.monsters >= Object.keys(ranksBefore).length, `monsters ${s.monsters}`);
const resynced = a.c.log.slice(mark).filter((m) => m.t === "mon");
check("the idle player A was sent a fresh snapshot of every monster", new Set(resynced.map((m) => m.monster.id)).size >= Object.keys(ranksBefore).length, `${resynced.length} mon messages`);
const changed = resynced.filter((m) => m.monster.rank !== ranksBefore[m.monster.id]);
check("monster classes are unchanged by the rebuild", changed.length === 0, `${changed.length} changed`);

// 4. The attack that woke the room is really being fought.
const hit = await b.c.wait((m) => m.t === "hit" && m.from === b.id, 15000).catch(() => null);
check("the waking attack lands hits", !!hit);

a.c.ws.close();
b.c.ws.close();
await sleep(500);
console.log(failures === 0 ? "IDLE SMOKE PASSED" : `IDLE SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

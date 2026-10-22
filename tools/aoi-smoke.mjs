// Local test of the area of interest (phase 2k): on a combat map a player is only told about the players and monsters near them.
// Usage: node tools/aoi-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and PK_DROP_FORCE=1 (the PvP item drop always succeeds) in .dev.vars. Never run it against preview or production.
import { execFileSync } from "node:child_process";
import { getMap, mapPoint } from "../shared/src/map.ts";

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


/** A character standing at (map, x, y) with the given sát nhân. */
async function makePlayer(tag, map, x, y, satNhan = 0) {
  const reg = await post("/api/register", { email: `ao-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `${tag}${run.slice(-5)}`, gender: "male" }, reg.cookie);
  const id = created.data.character.id;
  sql(`UPDATE characters SET map_id = '${map}', x = ${x}, y = ${y}, realm = 0, stage = 9, exp = 0, sat_nhan = ${satNhan}, vitals = NULL WHERE id = '${id}'`);
  await sleep(2500); // a request right after wrangler d1 execute can hit a reset connection
  return { id, cookie: reg.cookie };
}

const forest = getMap("forest");
const at = (px, py) => mapPoint(forest, px, py);

const a = await makePlayer("A", "forest", ...at(-30, 0));
const b = await makePlayer("B", "forest", ...at(32, 0)); // 62 screen units from A: out of view (enter 52, leave 58)
const c = await makePlayer("C", "forest", ...at(-12, 0)); // 18 units from A: in view

const ca = await connect(a.cookie);
const names = (w) => w.players.map((p) => p.id).sort();
check("A's welcome lists A only (the others are not connected yet)", names(ca.welcome).length === 1 && names(ca.welcome)[0] === a.id);
const cc = await connect(c.cookie);
check("C's welcome lists C and A", names(cc.welcome).includes(c.id) && names(cc.welcome).includes(a.id));
await ca.wait((m) => m.t === "joined" && m.player.id === c.id, 4000, "A is told C joined");
check("A is told about C (near)", true);
const cb = await connect(b.cookie);
check("B's welcome lists B and C (44 units) but not A (62 units)", !names(cb.welcome).includes(a.id) && names(cb.welcome).includes(c.id) && names(cb.welcome).includes(b.id), names(cb.welcome).length + " players");
await sleep(1500);
check("A was not told about B joining", !ca.log.some((m) => m.t === "joined" && m.player.id === b.id));
const online = ca.log.filter((m) => m.t === "online").at(-1);
check("A is told the room holds 3 players", online?.n === 3, JSON.stringify(online));

// The monsters in B's welcome are only those near B (the forest has groups all over).
const monsB = cb.welcome.monsters.length;
check("B is told about some monsters but not about all of them", monsB > 0 && monsB < 13 * 4 + 4, `${monsB} monsters`);

// B walks towards A: after a moment A is told about B.
const pos = (w, id) => w.players.find((p) => p.id === id).path[0];
const startB = pos(cb.welcome, b.id);
const goal = at(0, 0);
cb.send({ t: "move", x: goal[0], y: goal[1], fx: startB[0], fy: startB[1], seq: 1 });
const joined = await ca.wait((m) => m.t === "joined" && m.player.id === b.id, 15000, "A is told B came into view").then(() => true, () => false);
check("A is told about B once B walks into view", joined);

// B walks back out of view: A is told B left (B first gets to the spot it was sent to).
await sleep(6000);
const startBack = at(0, 0);
cb.send({ t: "move", x: at(40, 0)[0], y: at(40, 0)[1], fx: startBack[0], fy: startBack[1], seq: 2 });
const left = await ca.wait((m) => m.t === "left" && m.id === b.id, 20000, "A is told B left view").then(() => true, () => false);
check("A is told B left once B is far again", left);

for (const x of [ca, cb, cc]) x.ws.close();
console.log(failures === 0 ? "all ok" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

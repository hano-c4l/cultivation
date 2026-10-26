// Local test of what other players look like (phase 4d): the body (`f`) and the weapon (`w`) in the snapshots, and the `look` message others
// get when a weapon is put on, taken off or when a player joins late.
// Usage: node tools/look-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses a dev-only endpoint, so it only runs against localhost with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars.
const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const ROOM = "town:6";
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

async function connect(cookie, ch = 6) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  await new Promise((res) => ws.addEventListener("open", () => res(true)));
  const wait = async (pred, ms = 5000, label = "message") => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
      await sleep(50);
    }
  };
  const welcome = await wait((m) => m.t === "welcome", 5000, "welcome");
  return { ws, log, wait, welcome, send: (m) => ws.send(JSON.stringify(m)) };
}

async function player(tag, gender) {
  const reg = await post("/api/register", { email: `look-${tag}-${run}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `Dáng ${tag}${run.slice(-3)}`, gender }, reg.cookie);
  if (created.status !== 201) throw new Error(`character not created: ${created.status} ${JSON.stringify(created.data)}`);
  return { cookie: reg.cookie, id: created.data.character.id };
}

const bagOf = (c) => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) {
    if (m.t !== "inv") continue;
    if (m.full) items.clear();
    for (const i of m.items) items.set(i.id, i);
    for (const id of m.removed) items.delete(id);
  }
  return [...items.values()];
};

const A = await player("a", "male");
const B = await player("b", "female");
const ca = await connect(A.cookie);
const cb = await connect(B.cookie);
await sleep(500);

const seenB = (m) => (m.t === "joined" || m.t === "path") && m.player?.id === B.id;
const joinedB = ca.log.find(seenB)?.player ?? ca.welcome.players.find((p) => p.id === B.id);
check("A sees B with the female body and no weapon", joinedB?.f === true && joinedB?.w === undefined, JSON.stringify(joinedB));
check("A (male) carries no body flag in its own snapshot", ca.welcome.players.find((p) => p.id === A.id)?.f === undefined);

await fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${B.id}&item=eq.weapon.u.0.1.1.kim.kiem&qty=1`);
await sleep(800);
const sword = bagOf(cb).find((i) => i.type.startsWith("eq.weapon"));
check("B has a sword in the bag", !!sword, sword?.type);
const mark = ca.log.length;
cb.send({ t: "eq_equip", tab: 0, cell: sword.cell });
await sleep(900);
const look = ca.log.slice(mark).find((m) => m.t === "look" && m.id === B.id);
check("A is told that B holds a kiem", look?.w === "kiem", JSON.stringify(look));
check("B is told too (its own view follows the same message)", cb.log.some((m) => m.t === "look" && m.id === B.id && m.w === "kiem"));

const C = await player("c", "male");
const cc = await connect(C.cookie);
const bForC = cc.welcome.players.find((p) => p.id === B.id);
check("a player who joins later sees the sword and the female body in the welcome", bForC?.w === "kiem" && bForC?.f === true, JSON.stringify(bForC));

const mark2 = ca.log.length;
cb.send({ t: "eq_unequip", slot: "weapon" });
await sleep(900);
const off = ca.log.slice(mark2).find((m) => m.t === "look" && m.id === B.id);
check("taking the sword off tells A that B holds nothing", off !== undefined && off.w === undefined, JSON.stringify(off));

for (const c of [ca, cb, cc]) c.ws.close();
console.log(failures === 0 ? "all ok" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

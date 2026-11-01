// Local test of the beast mounts (phase 5d): a token is read (the mount is learned for good, the token used up, a second token refused), a mount above the realm is
// refused, riding one raises the walking speed, riding the flight pháp bảo gets you off it (one ride at a time) and the other way round, and the ride is kept across a reconnect.
// Usage: node tools/beast-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars and migration 0072.
const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}
import { TOWN_GATE, TOWN_SPAWN } from "./world.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => { if (ev.data !== "pong") log.push(JSON.parse(ev.data)); });
  const opened = new Promise((res) => { ws.addEventListener("open", () => res(true)); ws.addEventListener("error", () => res(false)); });
  const wait = async (pred, ms = 6000, label = "message", from = 0) => {
    const end = Date.now() + ms;
    for (;;) {
      const hit = log.slice(from).find(pred);
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
  await c.wait((m) => m.t === "welcome", 8000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
const reg = await post("/api/register", { email: `bs-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Th ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
const give = (item, qty = 1) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${id}&item=${item}&qty=${qty}`).then((r) => r.json());

let c = await connect(reg.cookie);
const bagOf = () => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const x of m.removed) items.delete(x); }
  return [...items.values()];
};
const selfSpeed = () => {
  const last = [...c.log].reverse().find((m) => (m.t === "path" || m.t === "ack") && m.player?.id === id);
  return last ? last.player.speed : c.welcome.players.find((p) => p.id === id).speed;
};
const after = async (msg, ms = 900) => {
  const mark = c.log.length;
  c.send(msg);
  await sleep(ms);
  return c.log.slice(mark);
};
const foot = selfSpeed();

await give("mt_linh_loc");
await give("mt_linh_loc");
await give("mt_hac_phong_lang");
await give("eq.flight.u.0.1.1.kim");
await sleep(1500);
const token = (type) => bagOf().find((i) => i.type === type);

// Learn the first mount: the token goes and the mount stays.
let r = await after({ t: "inv_use", tab: token("mt_linh_loc").tab, cell: token("mt_linh_loc").cell }, 1200);
const list = r.find((m) => m.t === "mounts");
check("reading a token learns the mount", list?.owned?.includes("linh_loc"), JSON.stringify(list));
check("and one token is used up (one is left)", bagOf().filter((i) => i.type === "mt_linh_loc").length === 1);
await sleep(600);
r = await after({ t: "inv_use", tab: token("mt_linh_loc").tab, cell: token("mt_linh_loc").cell }, 1200);
check("a second token of a mount already known is refused and kept", r.some((m) => m.t === "inv_error" && m.reason === "mount_known") && bagOf().filter((i) => i.type === "mt_linh_loc").length === 1, JSON.stringify(r.map((m) => m.t + (m.reason ?? ""))));

// A mount above the realm cannot be learned.
await sleep(600);
r = await after({ t: "inv_use", tab: token("mt_hac_phong_lang").tab, cell: token("mt_hac_phong_lang").cell }, 1200);
check("a mount above the realm is refused and the token stays", r.some((m) => m.t === "inv_error" && m.reason === "mount_realm") && !!token("mt_hac_phong_lang"));
await sleep(600);
r = await after({ t: "beast", id: "hac_phong_lang" });
check("and riding one that is not learned is refused", r.some((m) => m.t === "beast" && m.error));

// Ride: the speed rises, and the others are told.
await sleep(600);
r = await after({ t: "beast", id: "linh_loc" }, 1500);
check("riding a learned mount is accepted", r.some((m) => m.t === "beast" && m.id === "linh_loc" && !m.error), JSON.stringify(r.map((m) => m.t)));
const ridden = selfSpeed();
check("the walking speed rises with the mount (+30%)", ridden > foot, `${foot} -> ${ridden}`);

// Riding while walking: the client does not predict a beast's speed, so the server must send the mover its new track.
await sleep(600);
await after({ t: "beast", id: null }, 800);
const slow = selfSpeed();
c.send({ t: "move", x: TOWN_SPAWN[0] + 9, y: TOWN_SPAWN[1] + 1, fx: TOWN_SPAWN[0], fy: TOWN_SPAWN[1], seq: 11 });
await sleep(500);
r = await after({ t: "beast", id: "linh_loc" }, 1500);
const own = r.filter((m) => (m.t === "path" || m.t === "ack") && m.player?.id === id);
check("riding while walking sends the mover its own new track at the new speed", own.some((m) => m.player.speed > slow), JSON.stringify(own.map((m) => m.player.speed)));
await sleep(4000);

// One ride at a time: the flight pháp bảo gets you off the beast; the beast gets you off it.
const flightItem = bagOf().find((i) => i.type.startsWith("eq.flight."));
await sleep(600);
await after({ t: "eq_equip", tab: flightItem.tab, cell: flightItem.cell }, 1200);
await sleep(600);
r = await after({ t: "mount", on: true }, 1500);
check("riding the flight pháp bảo gets you off the beast", r.some((m) => m.t === "beast" && m.id === null) && r.some((m) => m.t === "mounted" && m.on === true), JSON.stringify(r.map((m) => m.t)));
await sleep(600);
r = await after({ t: "beast", id: "linh_loc" }, 1500);
check("and riding the beast gets you off the flight pháp bảo", r.some((m) => m.t === "mounted" && m.on === false) && r.some((m) => m.t === "beast" && m.id === "linh_loc"), JSON.stringify(r.map((m) => m.t)));

// Kept across a reconnect.
c.ws.close();
await sleep(1500);
c = await connect(reg.cookie);
const me = c.welcome.players.find((p) => p.id === id);
check("the ride is kept across a reconnect (the snapshot says which beast)", me?.bs === "linh_loc" && !me.mounted, JSON.stringify({ bs: me?.bs, mounted: me?.mounted }));
await sleep(600);
r = await after({ t: "beast", id: null }, 1500);
check("getting off puts the speed back", r.some((m) => m.t === "beast" && m.id === null) && selfSpeed() <= ridden, `${selfSpeed()}`);

// The ride and its speed cross a map change, and a click-move in the forest uses it.
await sleep(600);
await after({ t: "beast", id: "linh_loc" }, 1200);
const ridden2 = selfSpeed();
c.send({ t: "move", x: TOWN_GATE[0], y: TOWN_GATE[1], fx: c.log.filter((m) => m.t === "path" && m.player?.id === id).at(-1)?.player.path.at(-1)[0] ?? TOWN_SPAWN[0], fy: c.log.filter((m) => m.t === "path" && m.player?.id === id).at(-1)?.player.path.at(-1)[1] ?? TOWN_SPAWN[1], seq: 21 });
await sleep(14_000);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "transfer to the forest").catch(() => null);
await sleep(600);
c.ws.close();
c = await connect(reg.cookie);
const inForest = c.welcome.players.find((p) => p.id === id);
check("the beast and its speed are kept in the forest", inForest?.bs === "linh_loc" && Math.abs(inForest.speed - ridden2) < 0.01, JSON.stringify({ bs: inForest?.bs, speed: inForest?.speed, ridden2 }));
const at = inForest.path.at(-1);
r = await after({ t: "move", x: at[0] + 3, y: at[1], fx: at[0], fy: at[1], seq: 31 }, 1200);
// (the server's own speed for the walk is the one of the snapshot above: a combat map moves a player by its track and speed, not by the derived stats)
check("a click-move in the forest is accepted while riding", r.some((m) => m.t === "ack") && !r.some((m) => m.t === "inv_error" || m.t === "kicked"), JSON.stringify(r.map((m) => m.t)));

c.ws.close();
console.log(failures === 0 ? "\nall good" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

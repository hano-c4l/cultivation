// Local test of riding the flight pháp bảo and of boots: the speed rises when worn, riding is kept across a map change and a reconnect,
// a refused breakthrough does not get you off, and the flight pháp bảo roll their speed in the range of their realm.
// Usage: node tools/mount-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1, ENABLE_DEV_GRANT=1 and the 0029 migration (npm run db:migrate:local).
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
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
function open(cookie, ch) {
  const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
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
async function connect(cookie, ch = 7) {
  const c = open(cookie, ch);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 6000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
const reg = await post("/api/register", { email: `mo-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Cưỡi ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const give = (item) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${charId}&item=${item}&qty=1`).then((r) => r.json());
const selfOf = (w) => w.players.find((p) => p.id === charId);

let c = await connect(reg.cookie);
const foot = selfOf(c.welcome).speed;
await give("eq.flight.u.0.1.1.kim");
await give("eq.boots.u.0.1.1.kim");
await sleep(1200);
const bag = () => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const flightItem = bag().find((i) => i.type.startsWith("eq.flight."));
check("the flight pháp bảo rolled its speed in the Luyện Khí range (40-60)", flightItem?.rs?.moveSpeed >= 40 && flightItem.rs.moveSpeed <= 60, `${flightItem?.rs?.moveSpeed}`);
const bootsItem = bag().find((i) => i.type.startsWith("eq.boots."));
check("the boots rolled their speed in the Luyện Khí range (10-20)", bootsItem?.rs?.moveSpeed >= 10 && bootsItem.rs.moveSpeed <= 20, `${bootsItem?.rs?.moveSpeed}`);

// Boots first: the walking speed rises without riding.
c.send({ t: "eq_equip", tab: bootsItem.tab, cell: bootsItem.cell });
await sleep(1200);
const worn = [...c.log].reverse().find((m) => m.t === "eq")?.items ?? [];
check("the boots go in their own slot", worn.some((e) => e.slot === "boots"), worn.map((e) => e.slot).join(","));
c.ws.close();
await sleep(800);
c = await connect(reg.cookie);
const withBoots = selfOf(c.welcome).speed;
check("boots raise the walking speed on foot", withBoots > foot, `${foot} -> ${withBoots}`);

// The flight pháp bảo, then ride.
c.send({ t: "eq_equip", tab: flightItem.tab, cell: flightItem.cell });
await sleep(1200);
let mark = c.log.length;
c.send({ t: "mount", on: true });
await c.wait((m) => m.t === "mounted" && m.on === true, 5000, "mounted", mark);
const ride = [...c.log].reverse().find((m) => m.t === "path" && m.player.id === charId)?.player.speed;
check("riding is clearly faster than walking with boots", ride > withBoots * 1.3, `${withBoots} -> ${ride}`);

// A refused breakthrough does not get you off.
await sleep(600);
mark = c.log.length;
c.send({ t: "bt_start", pills: 1 });
await c.wait((m) => m.t === "bt_error", 5000, "breakthrough refused", mark);
await sleep(600);
check("a refused breakthrough does not dismount", !c.log.slice(mark).some((m) => m.t === "mounted" && m.on === false));

// Kept across a reconnect.
c.ws.close();
await sleep(800);
c = await connect(reg.cookie);
check("riding is kept after reconnecting", selfOf(c.welcome).mounted === true && selfOf(c.welcome).speed === ride, `${selfOf(c.welcome).speed}`);

// Kept across a map change (the portal of the town).
c.send({ t: "move", x: 20.5, y: 38.5, fx: selfOf(c.welcome).path[0][0], fy: selfOf(c.welcome).path[0][1], seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1, 5000, "ack");
await sleep(4500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "transfer");
await sleep(500);
c = await connect(reg.cookie, 7);
check("riding is kept after a map change", c.welcome.map === "forest" && selfOf(c.welcome).mounted === true && selfOf(c.welcome).speed === ride, `${c.welcome.map} ${selfOf(c.welcome).speed}`);

// Getting off is kept too.
mark = c.log.length;
c.send({ t: "mount", on: false });
await c.wait((m) => m.t === "mounted" && m.on === false, 5000, "dismounted", mark);
c.ws.close();
await sleep(800);
c = await connect(reg.cookie, 7);
check("being on foot is kept after reconnecting", !selfOf(c.welcome).mounted && selfOf(c.welcome).speed === withBoots, `${selfOf(c.welcome).speed}`);
// Getting on while walking: the mover predicts the change itself and sends where it is, so the server does not send its own track back.
c.send({ t: "mount", on: true });
await c.wait((m) => m.t === "mounted" && m.on === true, 5000, "mounted again");
await sleep(700);
const start = [...c.log].reverse().find((m) => m.t === "path" && m.player.id === charId)?.player.path[0] ?? [20.5, 20.5];
c.send({ t: "move", x: start[0] + 4, y: start[1], fx: start[0], fy: start[1], seq: 77 });
await c.wait((m) => m.t === "ack" && m.seq === 77, 5000, "walk ack");
await sleep(800);
mark = c.log.length;
c.send({ t: "mount", on: false, fx: start[0] + 1, fy: start[1] });
await c.wait((m) => m.t === "mounted" && m.on === false, 5000, "dismounted while walking", mark);
await sleep(800);
check("the server did not send the mover's own track back when it got off while walking", !c.log.slice(mark).some((m) => m.t === "path" && m.player.id === charId), `${c.log.slice(mark).filter((m) => m.t === "path").length} path messages`);
c.ws.close();
console.log(failures === 0 ? "mount smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

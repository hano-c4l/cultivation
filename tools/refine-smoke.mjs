// Local test of the pháp bảo bản mệnh: it trains on its own EXP while worn (kills in the forest), the EXP is saved,
// the character's EXP is not touched by it, and a flight artifact fits its own slot.
// Usage: node tools/refine-smoke.mjs [ws://localhost:8787]
// Registers a throwaway account and uses dev-only endpoints: local only, needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1.
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
async function connect(cookie, ch = 7) {
  const c = open(cookie, ch);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 5000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}

const reg = await post("/api/register", { email: `rf-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Luyện ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const give = (item) => fetch(`${httpBase}/api/dev/loot?room=town:7&char=${charId}&item=${item}&qty=1`).then((r) => r.json());

let c = await connect(reg.cookie);
await give("eq.bonded.u.0.1.2.kim");
await give("eq.flight.u.0.1.2.moc");
await sleep(800);
const bag = () => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
for (const type of ["eq.bonded.u.0.1.2.kim", "eq.flight.u.0.1.2.moc"]) {
  c.send({ t: "eq_equip", tab: 0, cell: bag().find((i) => i.type === type).cell });
  await sleep(500);
}
const worn = [...c.log].reverse().find((m) => m.t === "eq").items;
check("both special artifacts are worn, each in its own slot", worn.some((e) => e.slot === "bonded") && worn.some((e) => e.slot === "flight"));

// Riding: the flight artifact's speed and stats only count while mounted, and a change mid-walk re-plans at the new speed.
const speedOf = (pred) => [...c.log].reverse().find(pred)?.player?.speed;
const footSpeed = c.welcome.players.find((p) => p.id === charId).speed;
c.send({ t: "mount", on: true });
await c.wait((m) => m.t === "mounted" && m.on === true, 5000, "mounted on");
await c.wait((m) => m.t === "path" && m.player.id === charId && m.player.mounted === true, 5000, "mounted path");
const rideSpeed = speedOf((m) => m.t === "path" && m.player.id === charId);
check("riding is faster than walking", rideSpeed > footSpeed, `${footSpeed} -> ${rideSpeed}`);
c.send({ t: "move", x: 20.5, y: 30.5, fx: 20.5, fy: 20.5, seq: 90 });
await c.wait((m) => m.t === "ack" && m.seq === 90);
await sleep(700);
c.send({ t: "mount", on: false });
await c.wait((m) => m.t === "mounted" && m.on === false, 5000, "mounted off");
await sleep(500);
const landed = [...c.log].reverse().find((m) => m.t === "path" && m.player.id === charId && !m.player.mounted);
check("getting off mid-walk drops the speed and keeps walking", landed && landed.player.speed === footSpeed && landed.player.path.length >= 2, `${landed?.player.speed}`);
c.send({ t: "mount", on: false });

// To the forest and a kill.
c.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(5500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer");
await sleep(500);
c = await connect(reg.cookie, 7);
check("the forest welcome keeps both worn", c.welcome.equipped.length === 2);
const prey = c.welcome.monsters.find((m) => m.rank === "normal" && m.tier === 1) ?? c.welcome.monsters[0];
c.send({ t: "attack", id: prey.id });
await c.wait((m) => m.t === "mon_gone" && m.id === prey.id, 40000, "monster dies");
const stats = await c.wait((m) => m.t === "stats" && m.character.exp > 0, 5000, "stats after the kill");
const eq = await c.wait((m) => m.t === "eq" && m.items.some((e) => e.slot === "bonded" && (e.xp ?? 0) > 0), 20000, "the artifact's EXP");
const bonded = eq.items.find((e) => e.slot === "bonded");
check("the kill trained the pháp bảo bản mệnh with its own EXP", bonded.xp > 0 && bonded.lv !== undefined, `xp ${bonded.xp}`);
c.ws.close();
await sleep(800);
c = await connect(reg.cookie, 7);
const back = c.welcome.equipped.find((e) => e.slot === "bonded");
check("the training is saved", back?.xp >= bonded.xp && back.lv === bonded.lv, `xp ${back?.xp}`);
// Same amounts, separate streams: the character kept every point of its own EXP, and the artifact got the same number.
check("the artifact got as much EXP as the character (and the character lost none)", back.xp === c.welcome.character.exp && c.welcome.character.exp >= stats.character.exp, `artifact ${back.xp}, character ${c.welcome.character.exp}`);
c.ws.close();
console.log(failures === 0 ? "refine smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

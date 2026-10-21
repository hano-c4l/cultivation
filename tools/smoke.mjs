// Smoke test: accounts, characters, WebSocket auth, movement, duplicate-login lock across channels, persistence,
// chat, portals, potential point allocation, monsters and combat (the EXP grant step needs ENABLE_DEV_GRANT=1 in .dev.vars, skipped otherwise).
// Usage: node tools/smoke.mjs [baseWsUrl]   (default ws://localhost:8787)
// Registers throwaway accounts, so it only runs against local dev and preview, never production.
const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
const allowed = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.includes("cultivation-preview");
if (!allowed) {
  console.error(`Refusing to run the account smoke test against ${host} (it creates accounts). Use local or preview.`);
  process.exit(2);
}

const connections = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const password = "correct-horse-battery";

function assert(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log("ok:", label);
}

async function api(method, path, { body, cookie, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(httpBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  const set = res.headers.getSetCookie?.()[0];
  return { status: res.status, data, cookie: set ? set.split(";")[0] : undefined, setCookie: set };
}

async function newPlayer(tag) {
  const email = `smoke-${run}-${tag}@example.test`;
  const reg = await api("POST", "/api/register", { body: { email, password } });
  if (reg.status === 429) throw new Error("registration rate limit hit; wait 10 minutes or run against local with .dev.vars");
  assert(reg.status === 201 && reg.cookie, `register ${tag}`);
  const name = `Tiêu ${tag}${Math.floor(1000 + Math.random() * 9000)}`;
  const ch = await api("POST", "/api/character", { body: { name }, cookie: reg.cookie });
  assert(ch.status === 201 && ch.data.character.name === name, `create character ${tag}`);
  return { email, cookie: reg.cookie, name, character: ch.data.character };
}

function connect(cookie, channel = 1) {
  const ws = new WebSocket(`${base}/ws?ch=${channel}`, { headers: cookie ? { Cookie: cookie } : {} });
  const inbox = [];
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    // The server auto-responds to the plain string "ping" with "pong" (not JSON).
    const msg = ev.data === "pong" ? { t: "pong" } : JSON.parse(ev.data);
    inbox.push(msg);
    for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
    ws.addEventListener("close", () => res(false));
  });
  return {
    ws, inbox, opened,
    send: (m) => ws.send(JSON.stringify(m)),
    // `label` names the step in the timeout error, so a slow run says where it stopped.
    wait: (pred, ms = 5000, label = pred.toString().slice(0, 80)) => new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for message: ${label}`)), ms);
    }),
  };
}

const health = await api("GET", "/api/health");
assert(health.data.ok === true, "health");

// --- auth edge cases ---
assert((await api("GET", "/api/me")).status === 401, "me without a session is 401");
assert(!(await connect(undefined).opened), "WebSocket without a session is refused");
const foreign = await api("POST", "/api/register", { body: { email: `x-${run}@example.test`, password }, origin: "https://evil.example" });
assert(foreign.status === 403, "foreign Origin is rejected");
assert((await api("POST", "/api/register", { body: { email: "nope", password } })).status === 400, "invalid email rejected");
assert((await api("POST", "/api/register", { body: { email: `y-${run}@example.test`, password: "short" } })).status === 400, "short password rejected");

const A = await newPlayer("a");
const dup = await api("POST", "/api/register", { body: { email: A.email.toUpperCase(), password } });
assert(dup.status === 409, "duplicate email (case-insensitive) rejected");
const bad = await api("POST", "/api/login", { body: { email: A.email, password: "wrong-password-1" } });
assert(bad.status === 401 && !bad.cookie, "wrong password rejected");
const good = await api("POST", "/api/login", { body: { email: A.email, password } });
assert(good.status === 200 && good.cookie, "login with the right password");
const me = await api("GET", "/api/me", { cookie: good.cookie });
assert(me.data.character.name === A.name, "me returns the character");

// --- gameplay over WebSocket ---
const a = connect(A.cookie, 1);
assert(await a.opened, "authenticated WebSocket opens");
const wa = await a.wait((m) => m.t === "welcome");
assert(wa.self === A.character.id && wa.players.some((p) => p.name === A.name), "welcome has the account's character");

const B = await newPlayer("b");
const b = connect(B.cookie, 1);
await b.opened;
const wb = await b.wait((m) => m.t === "welcome");
await a.wait((m) => m.t === "joined" && m.player.name === B.name);
assert(true, "A sees B join (Vietnamese diacritics preserved)");

a.send({ t: "move", x: 26.37, y: 5.61, fx: 20.5, fy: 20.5, seq: 1 });
const pathMsg = await b.wait((m) => m.t === "path" && m.player.id === A.character.id);
assert(pathMsg.player.path.at(-1).join() === "26.37,5.61", "B receives A's path ending at the exact click point (not a tile centre)");
assert(pathMsg.player.path.length <= 4, "path is smoothed into a few straight segments instead of per-tile hops");
const ack1 = await a.wait((m) => m.t === "ack" && m.seq === 1);
assert(ack1.player === undefined, "accepted move acks without a track (mover keeps its prediction)");

a.ws.send("ping");
await a.wait((m) => m.t === "pong");
assert(true, "plain-string ping is auto-answered with pong");

await sleep(150);
a.send({ t: "move", x: 26.5, y: 10.5, fx: 20.5, fy: 20.5, seq: 2 }); // pond tile, blocked
const ack2 = await a.wait((m) => m.t === "ack" && m.seq === 2);
assert(ack2.player !== undefined, "rejected move acks with the authoritative track");
assert(b.inbox.filter((m) => m.t === "path").length === 1, "blocked target is not broadcast");

await sleep(150);
a.send({ t: "move", x: 26.5, y: 5.5, fx: 2.5, fy: 2.5, seq: 3 }); // claimed start far from server position
const ack3 = await a.wait((m) => m.t === "ack" && m.seq === 3);
assert(ack3.player !== undefined && ack3.player.path[0].join() !== "2.5,2.5", "implausible start tile is overridden by the server");

// --- duplicate login: same room, then another channel (a different Durable Object) ---
const a2 = connect(A.cookie, 1);
await a2.opened;
await a.wait((m) => m.t === "kicked");
const w2 = await a2.wait((m) => m.t === "welcome");
assert(w2.players.filter((p) => p.id === A.character.id).length === 1, "same-room reconnect does not duplicate the character");
assert(w2.players.length === wb.players.length, "player count unchanged after reconnect");

const a3 = connect(A.cookie, 2);
await a3.opened;
await a2.wait((m) => m.t === "kicked");
const w3 = await a3.wait((m) => m.t === "welcome");
assert(w3.players.length === 1 && w3.players[0].id === A.character.id, "other channel: old room kicked, new room has exactly one A");

// --- persistence: position saved on disconnect and restored on the next login ---
// The start tile depends on where A was when the previous room kicked it, so pick a target exactly 2 tiles away.
const { getMap, lineClear } = await import("../shared/src/map.ts");
const town = getMap("town");
// Collision is a fine grid with a body radius; use the shared check so the target is reachable in a straight line.
const segmentClear = (x0, y0, x1, y1) => lineClear(town, [x0, y0], [x1, y1]);
const [sx, sy] = w3.players[0].path[0];
const target = [[2, 0], [-2, 0], [0, 2], [0, -2]]
  .map(([dx, dy]) => [Math.round((sx + dx) * 100) / 100, Math.round((sy + dy) * 100) / 100])
  .find(([x, y]) => segmentClear(sx, sy, x, y));
assert(target !== undefined, "found a walkable target 2 tiles from the start tile");
await sleep(150);
a3.send({ t: "move", x: target[0], y: target[1], fx: sx, fy: sy, seq: 1 });
await a3.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(1200); // 2 tiles at 4 tiles/s = 0.5 s
a3.ws.close();
await sleep(1500);
const a4 = connect(A.cookie, 2);
await a4.opened;
const w4 = await a4.wait((m) => m.t === "welcome");
assert(Math.hypot(w4.players[0].path[0][0] - target[0], w4.players[0].path[0][1] - target[1]) < 0.02, "exact position persisted across disconnect/login");

// --- race: a fast same-room reconnect must not let a late release free the new claim ---
const r1 = connect(A.cookie, 3);
await r1.opened;
await r1.wait((m) => m.t === "welcome");
r1.ws.close();
const r2 = connect(A.cookie, 3); // reconnects immediately, while r1's leave/save may still be running
await r2.opened;
await r2.wait((m) => m.t === "welcome");
await sleep(1500); // let r1's late release land
const r3 = connect(A.cookie, 4);
await r3.opened;
await r2.wait((m) => m.t === "kicked");
await r3.wait((m) => m.t === "welcome");
assert(true, "fast reconnect then another channel still evicts the old room (best-effort race check; fix is by claim id)");

// --- chat: room-local broadcast, word filter, rate limit ---
const C = await newPlayer("c");
const c = connect(C.cookie, 1);
await c.opened;
const wc = await c.wait((m) => m.t === "welcome");
assert(wc.map === "town" && wc.players.at(-1).path[0].join() === "20.5,20.5", "new character starts in town at the spawn");
c.send({ t: "chat", text: "  xin   chào đạo hữu " });
const heard = await b.wait((m) => m.t === "chat" && m.id === C.character.id);
assert(heard.text === "xin chào đạo hữu" && heard.name === C.name, "chat is normalized and reaches the other player in the room");
await sleep(600);
c.send({ t: "chat", text: "vcl Đm hello" });
const filtered = await b.wait((m) => m.t === "chat" && m.text.includes("hello"));
assert(filtered.text === "*** ** hello", "word filter masks blocked words");
c.send({ t: "chat", text: "spam 1" });
c.send({ t: "chat", text: "spam 2" }); // under CHAT_MIN_GAP_MS
const limited = await c.wait((m) => m.t === "chat_error");
assert(limited.reason === "rate", "chat rate limit rejects messages sent too fast");
assert((await c.wait((m) => m.t === "chat" && m.text === "*** ** hello")) !== undefined, "sender also receives its own chat");

// --- portals: server verifies the position, hands off through the saved row, return trip works ---
c.send({ t: "portal" }); // far from any portal: must be ignored
await sleep(1000);
assert(!c.inbox.some((m) => m.t === "transfer"), "portal request far from a portal is ignored");
c.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(5500); // ~18 tiles at 4 tiles/s
c.send({ t: "portal" });
const moved = await c.wait((m) => m.t === "transfer");
assert(moved.map === "forest", "standing on the south gate transfers to the forest");
await sleep(500);
const c2 = connect(C.cookie, 1);
await c2.opened;
const wc2 = await c2.wait((m) => m.t === "welcome");
assert(wc2.map === "forest" && wc2.players[0].path[0].join() === "20.5,3.5", "reconnect lands in the forest at the arrival tile");
const bChats = b.inbox.filter((m) => m.t === "chat").length;
await sleep(600);
c2.send({ t: "chat", text: "chào rừng" });
await c2.wait((m) => m.t === "chat" && m.text === "chào rừng");
await sleep(500);
assert(b.inbox.filter((m) => m.t === "chat").length === bChats, "chat does not leak to a player on another map");
await sleep(150);
c2.send({ t: "move", x: 20.5, y: 1.5, fx: 20.5, fy: 3.5, seq: 1 });
await c2.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(1000);
c2.send({ t: "portal" });
assert((await c2.wait((m) => m.t === "transfer")).map === "town", "return portal leads back to town");
await sleep(500);
const c3 = connect(C.cookie, 1);
await c3.opened;
const wc3 = await c3.wait((m) => m.t === "welcome");
assert(wc3.map === "town" && wc3.players.find((p) => p.id === C.character.id).path[0].join() === "20.5,36.5", "return trip lands at the town arrival tile");

// --- progression: allocate potential points, overspend rejected, persisted across reconnect ---
const sheet0 = wc3.character;
assert(sheet0.rootGrade >= 0 && sheet0.rootGrade <= 4 && sheet0.potentialPoints >= 5 && sheet0.realm === 0 && sheet0.stage === 1, "new character starts at Luyện Khí tầng 1 with starting points");
c3.send({ t: "allocate", points: { canCot: 2, linhLuc: 1 } });
const st1 = await c3.wait((m) => m.t === "stats");
assert(st1.character.potentialPoints === sheet0.potentialPoints - 3 && st1.character.base.canCot === sheet0.base.canCot + 2 && st1.character.base.linhLuc === sheet0.base.linhLuc + 1, "allocation spends points and raises stats");
await sleep(600);
c3.inbox.length = 0;
c3.send({ t: "allocate", points: { canCot: 50 } });
const st2 = await c3.wait((m) => m.t === "stats");
assert(st2.character.potentialPoints === st1.character.potentialPoints && st2.character.base.canCot === st1.character.base.canCot, "overspending is rejected and nothing changes");
await sleep(600);
c3.send({ t: "allocate", points: { hacker: 5 } });
c3.send({ t: "allocate", points: { canCot: -3 } });
await sleep(600);
assert(!c3.inbox.some((m) => m.t === "stats" && m !== st2), "malformed allocation is ignored");
const c4 = connect(C.cookie, 1);
await c4.opened;
const wc4 = await c4.wait((m) => m.t === "welcome");
assert(wc4.character.potentialPoints === st1.character.potentialPoints && wc4.character.base.canCot === st1.character.base.canCot, "allocation survives reconnect");
const grant = await api("POST", "/api/dev/grant-exp", { body: { exp: 1e12 }, cookie: C.cookie });
if (grant.status === 404) {
  console.log("skip: dev grant is not enabled here (set ENABLE_DEV_GRANT=1 in .dev.vars for local runs)");
} else {
  assert(grant.status === 200 && grant.data.character.stage === 9 && grant.data.character.realm === 0, "dev EXP grant reaches stage 9 and stops there");
  assert(grant.data.character.potentialPoints === st1.character.potentialPoints + 8 * 5, "each stage granted potential points");
}
connections.push(c4);

// --- combat: monsters, auto-attack, EXP, persistence, death and respawn in town ---
const D = await newPlayer("d");
let d = connect(D.cookie, 5);
await d.opened;
let wd = await d.wait((m) => m.t === "welcome");
assert(wd.monsters.length === 0 && wd.hp > 0 && wd.maxHp >= wd.hp, "town has no monsters and the welcome carries hp");
d.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
await d.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(5500);
d.send({ t: "portal" });
await d.wait((m) => m.t === "transfer");
await sleep(500);
d = connect(D.cookie, 5);
await d.opened;
wd = await d.wait((m) => m.t === "welcome");
assert(wd.map === "forest" && wd.monsters.filter((m) => !m.guard).length === 9 && wd.monsters.filter((m) => !m.guard).every((m) => m.tier === 1 || m.tier === 4 || m.tier === 7) && wd.monsters.filter((m) => m.guard).length === 2, "the forest welcome lists 3 clusters of 3 monsters at bậc 1, 4 and 7, and 2 guards");
// Rare ranks are rolled at random, so hunt a normal bậc-1 monster to keep the test deterministic.
const prey = wd.monsters.find((m) => !m.guard && m.rank === "normal" && m.tier === 1) ?? wd.monsters.find((m) => !m.guard);
d.send({ t: "attack", id: prey.id });
const firstHit = await d.wait((m) => m.t === "hit" && m.from === D.character.id && m.to === prey.id, 20000, "first hit on the monster");
assert(firstHit.kind === "miss" || firstHit.damage > 0, "attacking walks into range and lands a hit");
await d.wait((m) => m.t === "mon_gone" && m.id === prey.id, 40000, "monster dies");
const gained = await d.wait((m) => m.t === "stats" && m.character.exp > 0, 5000, "stats with EXP after the kill");
assert(gained.character.exp > 0, "killing a monster grants EXP");
d.ws.close();
await sleep(800);
d = connect(D.cookie, 5);
await d.opened;
wd = await d.wait((m) => m.t === "welcome");
assert(wd.character.exp === gained.character.exp, "EXP from kills is saved when the player leaves");
const expBeforeDeath = wd.character.exp;
const stageBeforeDeath = wd.character.stage;

// Walk to the cave and stand next to its monsters until they kill us.
const here = wd.players.find((p) => p.id === D.character.id).path[0];
d.send({ t: "move", x: 46.5, y: 24.5, fx: here[0], fy: here[1], seq: 1 });
await d.wait((m) => m.t === "ack" && m.seq === 1);
await sleep((Math.hypot(46.5 - here[0], 24.5 - here[1]) / 4) * 1000 + 5000);
d.send({ t: "portal" });
const toCave = await d.wait((m) => m.t === "transfer", 8000, "east gate transfer to the cave");
assert(toCave.map === "cave", "the east gate leads to the cave (and the walk there was survivable)");
await sleep(500);
d = connect(D.cookie, 5);
await d.opened;
wd = await d.wait((m) => m.t === "welcome");
assert(wd.map === "cave" && wd.monsters.filter((m) => !m.guard).length === 9, "the cave welcome lists its monsters");
d.send({ t: "move", x: 14.5, y: 20.5, fx: 3.5, fy: 20.5, seq: 1 });
const died = await d.wait((m) => m.t === "died", 90000, "dying to cave monsters");
assert(died.expLost >= 0 && died.expLost <= expBeforeDeath, "death costs a little EXP, never more than owned");
assert((await d.wait((m) => m.t === "transfer", 5000)).map === "town", "death sends the player to town");
await sleep(600);
d = connect(D.cookie, 5);
await d.opened;
wd = await d.wait((m) => m.t === "welcome");
assert(wd.map === "town" && wd.hp === wd.maxHp, "respawn in town with full HP");
assert(wd.character.stage === stageBeforeDeath && wd.character.exp === expBeforeDeath - died.expLost, "death lowered EXP without changing the stage");
connections.push(d);

// --- logout invalidates the session ---
await api("POST", "/api/logout", { cookie: A.cookie });
assert((await api("GET", "/api/me", { cookie: A.cookie })).status === 401, "logout invalidates the session");

for (const conn of [a, a2, a3, a4, b, c, c2, c3, r1, r2, r3, ...connections]) conn.ws.close();
console.log("smoke passed");

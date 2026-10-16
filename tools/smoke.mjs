// Smoke test: two clients join, one moves, the other must receive the path; reconnect must not duplicate.
// Usage: node tools/smoke.mjs [baseWsUrl]   (default ws://localhost:8787)
const base = process.argv[2] ?? "ws://localhost:8787";
const url = `${base}/ws?map=town&ch=1`;

function client(id, name) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    // The server auto-responds to the plain string "ping" with "pong" (not JSON).
    const msg = ev.data === "pong" ? { t: "pong" } : JSON.parse(ev.data);
    inbox.push(msg);
    for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const opened = new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  return {
    ws, inbox, opened,
    send: (m) => ws.send(JSON.stringify(m)),
    join: () => ws.send(JSON.stringify({ t: "join", id, name })),
    wait: (pred, ms = 3000) => new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error("timeout waiting for message")), ms);
    }),
  };
}

function assert(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log("ok:", label);
}

const a = client("aaaaaaaa-0000-0000-0000-000000000001", "Alpha");
const b = client("bbbbbbbb-0000-0000-0000-000000000002", "Bêta");
await Promise.all([a.opened, b.opened]);
a.join();
const wa = await a.wait((m) => m.t === "welcome");
assert(wa.players.some((p) => p.id === wa.self), "welcome includes self snapshot");
b.join();
const wb = await b.wait((m) => m.t === "welcome");
await a.wait((m) => m.t === "joined" && m.player.name === "Bêta");
assert(true, "A sees B join (Vietnamese diacritics preserved)");

a.send({ t: "move", x: 26, y: 5, fx: 20, fy: 20, seq: 1 });
const pathMsg = await b.wait((m) => m.t === "path" && m.player.id === wa.self);
const path = pathMsg.player.path;
assert(path.length > 2 && path.at(-1)[0] === 26 && path.at(-1)[1] === 5, "B receives A's server-computed path");

a.ws.send("ping");
await a.wait((m) => m.t === "pong");
assert(true, "plain-string ping is auto-answered with pong");

const ack1 = await a.wait((m) => m.t === "ack" && m.seq === 1);
assert(ack1.player === undefined, "accepted move acks without a track (mover keeps its prediction)");
assert(!a.inbox.some((m) => m.t === "path" && m.player.id === wa.self), "mover does not receive its own path back");

await new Promise((r) => setTimeout(r, 150)); // clear the server move throttle
a.send({ t: "move", x: 26, y: 10, fx: 20, fy: 20, seq: 2 }); // pond tile, blocked
const ack2 = await a.wait((m) => m.t === "ack" && m.seq === 2);
assert(ack2.player !== undefined, "rejected move acks with the authoritative track");
assert(b.inbox.filter((m) => m.t === "path").length === 1, "blocked target is not broadcast");

await new Promise((r) => setTimeout(r, 150));
a.send({ t: "move", x: 26, y: 5, fx: 2, fy: 2, seq: 3 }); // claimed start far from server position
const ack3 = await a.wait((m) => m.t === "ack" && m.seq === 3);
assert(ack3.player !== undefined && ack3.player.path[0].join() !== "2,2", "implausible start tile is overridden by the server");

// Duplicate login: new socket with A's id kicks the old one, B sees exactly one left + joined.
const a2 = client("aaaaaaaa-0000-0000-0000-000000000001", "Alpha");
await a2.opened;
a2.join();
await a.wait((m) => m.t === "kicked");
const w2 = await a2.wait((m) => m.t === "welcome");
assert(w2.players.filter((p) => p.id === wa.self).length === 1, "reconnect does not duplicate the character");
assert(w2.players.length === wb.players.length, "player count unchanged after reconnect");

for (const c of [a, a2, b]) c.ws.close();
console.log("smoke passed");

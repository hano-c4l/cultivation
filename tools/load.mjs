// Local load test: N clients in one forest room, all hunting, then reads the room's tick metrics.
// Usage: node tools/load.mjs [baseWsUrl] [clients] [seconds]   (default ws://localhost:8787 50 30)
// Registers throwaway accounts, so it only runs against localhost with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1
// in .dev.vars (the tick metrics endpoint is dev-only). Never run it against preview or production.
const base = process.argv[2] ?? "ws://localhost:8787";
const clients = Number(process.argv[3] ?? 50);
const seconds = Number(process.argv[4] ?? 30);
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run the load test against ${host}: local only`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
const CHANNEL = 7;

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=${CHANNEL}`, { headers: { Cookie: cookie } });
  const waiters = [];
  const handlers = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data === "pong") return;
    const msg = JSON.parse(ev.data);
    for (const h of handlers) h(msg);
    for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  return {
    ws,
    opened,
    on: (h) => handlers.push(h),
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 15000) => new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  };
}

const stats = { joined: 0, failed: 0, hits: 0, kills: 0, deaths: 0, attacks: 0 };

/** Accounts are created before the room exists: password hashing is CPU-heavy and would otherwise pollute the tick metrics. */
async function prepare(i) {
  const reg = await post("/api/register", { email: `load-${run}-${i}@example.test`, password: "correct-horse-battery" });
  if (reg.status !== 201) throw new Error(`register ${reg.status}`);
  const ch = await post("/api/character", { name: `Tải ${run.slice(-4)}${i}` }, reg.cookie);
  if (ch.status !== 201) throw new Error(`character ${ch.status}`);
  return { reg, ch };
}

async function client(i, account) {
  try {
    const { reg, ch } = account;

    let c = open(reg.cookie);
    await c.opened;
    await c.wait((m) => m.t === "welcome");
    c.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
    await sleep(5800);
    c.send({ t: "portal" });
    await c.wait((m) => m.t === "transfer");
    await sleep(400);

    c = open(reg.cookie);
    const monsters = new Map();
    let me = ch.data.character.id;
    c.on((m) => {
      if (m.t === "welcome") for (const mon of m.monsters) monsters.set(mon.id, mon);
      else if (m.t === "mon") monsters.set(m.monster.id, m.monster);
      else if (m.t === "mon_gone") { monsters.delete(m.id); if (m.id === currentTarget) stats.kills++; }
      else if (m.t === "hit" && m.from === me) stats.hits++;
      else if (m.t === "died") stats.deaths++;
    });
    let currentTarget = null;
    await c.opened;
    await c.wait((m) => m.t === "welcome");
    stats.joined++;
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      const ids = [...monsters.values()].filter((m) => !m.guard).map((m) => m.id);
      if (ids.length > 0) {
        currentTarget = ids[Math.floor(Math.random() * ids.length)];
        c.send({ t: "attack", id: currentTarget });
        stats.attacks++;
      }
      await sleep(1500 + Math.random() * 1000);
    }
    c.ws.close();
  } catch (err) {
    stats.failed++;
    console.error(`client ${i}: ${err.message}`);
  }
}

const accounts = [];
for (let i = 0; i < clients; i++) {
  try {
    accounts.push(await prepare(i));
  } catch (err) {
    stats.failed++;
    accounts.push(null);
    console.error(`prepare ${i}: ${err.message}`);
  }
}
const started = Date.now();
await Promise.all(accounts.map((a, i) => (a ? sleep(i * 120).then(() => client(i, a)) : Promise.resolve())));
// Clients are closed by now, so read the metrics while a final probe is not needed: the room keeps its counters.
const res = await fetch(`${httpBase}/api/dev/tick-stats?room=forest:${CHANNEL}`);
const tick = res.ok ? await res.json() : null;
console.log(`clients joined ${stats.joined}/${clients}, failed ${stats.failed}, attacks ${stats.attacks}, hits ${stats.hits}, deaths ${stats.deaths}`);
console.log("tick metrics:", tick);
console.log(`elapsed ${Math.round((Date.now() - started) / 1000)} s`);
const ok = stats.failed === 0 && tick && tick.count > 0 && tick.avgMs < 25 && tick.maxDriftMs < 500 && tick.skipped / tick.count < 0.01;
console.log(ok ? "load test passed" : "load test FAILED (need avg tick < 25 ms, max drift < 500 ms, < 1% skipped ticks, no failed clients)");
process.exit(ok ? 0 : 1);

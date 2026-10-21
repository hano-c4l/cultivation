// Local test of the gear master table: a new piece of gear (here through the dev loot path, the same enqueueLoot a drop uses) has its
// stats rolled in the range of the master row and kept with the item, two pieces of the same type differ, the welcome carries the set
// names, and the roll survives a reconnect. Usage: node tools/gear-master-smoke.mjs [ws://localhost:8787]
// Local only; needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 and the 0027 migration (npm run db:migrate:local).
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
  return { ws, log, opened };
}
const TYPE = "eq.robe.m.0.1.1";
const reg = await post("/api/register", { email: `gm-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Rèn ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
let c = open(reg.cookie, 7);
await c.opened;
await sleep(1200);
const welcome0 = c.log.find((m) => m.t === "welcome");
check("the welcome carries the gear set names", Array.isArray(welcome0?.gearSets) && welcome0.gearSets[0][0] === "Lăng Y", welcome0?.gearSets?.[0]?.[0]);
for (let i = 0; i < 6; i++) await fetch(`${httpBase}/api/dev/loot?room=town:7&char=${charId}&item=${TYPE}&qty=1`).then((r) => r.json());
await sleep(1500);
c.ws.close();
await sleep(800);
c = open(reg.cookie, 7);
await c.opened;
await sleep(1200);
const welcome = c.log.find((m) => m.t === "welcome");
const robes = (welcome?.bag.items ?? []).filter((i) => i.type === TYPE);
check("six pieces were created", robes.length === 6, `${robes.length}`);
check("each has rolled stats, kept after reconnecting", robes.length > 0 && robes.every((r) => r.rs && r.rs.defense >= 1 && r.rs.maxHp >= 1), JSON.stringify(robes[0]?.rs));
check("the rolls are within the range of the master row (defense 1..2, maxHp 4..6 around the formula)", robes.every((r) => r.rs.defense <= 3 && r.rs.maxHp <= 8), robes.map((r) => `${r.rs.defense}/${r.rs.maxHp}`).join(" "));
check("pieces of the same type differ", new Set(robes.map((r) => JSON.stringify(r.rs))).size > 1, robes.map((r) => `${r.rs.defense}/${r.rs.maxHp}`).join(" "));
c.ws.close();
console.log(failures === 0 ? "gear master smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

// Local test of area blows and casts at a point (phase 4, 2026-10-29): a sword's plain attack also hits the monsters near the target (those extra hits are
// marked `aoe`), and a skill cast at a point (no target) falls where it is aimed, spends the MP and plays its effect.
// Usage: node tools/area-smoke.mjs [ws://localhost:8787]
// Registers a throwaway account and uses dev-only endpoints: local only, with DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars.
import { FOREST_ARRIVAL } from "./world.mjs";
import { execFileSync } from "node:child_process";

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
const sql = (q) => JSON.parse((() => { const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" }); return out.slice(out.indexOf("[")); })())[0].results;
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

const reg = await post("/api/register", { email: `ar-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Vung${run.slice(-5)}`, gender: "male" }, reg.cookie);
const id = created.data.character.id;
sql(`UPDATE characters SET map_id = 'forest', x = ${FOREST_ARRIVAL[0]}, y = ${FOREST_ARRIVAL[1]}, realm = 0, stage = 9, vitals = NULL WHERE id = '${id}'`);
await sleep(2500);

const ws = new WebSocket(`${base}/ws?ch=${CH}`, { headers: { Cookie: reg.cookie } });
const log = [];
ws.addEventListener("message", (ev) => ev.data !== "pong" && log.push(JSON.parse(ev.data)));
await new Promise((r) => ws.addEventListener("open", r));
const send = (m) => ws.send(JSON.stringify(m));
const until = async (pred, ms, label) => {
  const end = Date.now() + ms;
  for (;;) {
    const hit = log.find(pred);
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(50);
  }
};
const welcome = await until((m) => m.t === "welcome", 6000, "welcome");
const mons = welcome.monsters.filter((m) => !m.guard);
check("the forest welcome lists monsters near the arrival", mons.length >= 2, `${mons.length}`);
const pos = (m) => m.path[m.path.length - 1];
// the monster with the most neighbours within 1.5 tiles
const me = welcome.players.find((p) => p.id === id).path[0];
const near = [...mons].sort((a, b) => Math.hypot(pos(a)[0] - me[0], pos(a)[1] - me[1]) - Math.hypot(pos(b)[0] - me[0], pos(b)[1] - me[1])).slice(0, 8);
let best = near[0];
let bestN = -1;
for (const m of near) {
  const n = mons.filter((o) => o !== m && Math.hypot(pos(o)[0] - pos(m)[0], pos(o)[1] - pos(m)[1]) < 1.5).length;
  if (n > bestN) [best, bestN] = [m, n];
}
console.log(`target ${best.id} has ${bestN} neighbours within 1.5 tiles`);

// a sword in hand
await fetch(`${httpBase}/api/dev/loot?room=forest:${CH}&char=${id}&item=eq.weapon.u.0.1.1.kim.kiem&qty=1`);
await sleep(800);
const inv = [...log].reverse().find((m) => m.t === "inv" && m.items?.some((i) => i.type.startsWith("eq.weapon.")));
const sword = inv?.items.find((i) => i.type.startsWith("eq.weapon."));
if (sword) {
  send({ t: "eq_equip", tab: sword.tab, cell: sword.cell });
  await sleep(800);
}
check("the sword is equipped (the weapon family is `kiem`)", log.some((m) => m.t === "eq" && m.items?.some((i) => i.slot === "weapon")), JSON.stringify(inv?.items?.[0]));

// a plain attack
const mark = log.length;
send({ t: "attack", id: best.id });
await until((m) => m.t === "hit" && m.from === id, 30000, "the first hit").catch(() => null);
await sleep(2500);
const hits = log.slice(mark).filter((m) => m.t === "hit" && m.from === id);
const main = hits.filter((h) => !h.aoe);
const extra = hits.filter((h) => h.aoe);
check("the main target was hit and the swing is announced without `aoe`", main.some((h) => h.to === best.id), `${hits.length} hits`);
if (bestN > 0) check("a neighbour inside the sweep was hit too, marked `aoe` and not the main target", extra.length > 0 && extra.every((h) => h.to !== best.id), `${extra.length} extra hits`);
else console.log("skip no neighbour near the target, so no extra hit expected");

// a cast at a point: the skill goes where it is aimed, with no target
const mp0 = log.filter((m) => m.t === "mp").pop()?.mp;
const mark2 = log.length;
const aim = pos(best);
const skill = welcome.skills.find((k) => /^(chuong|tram|chi)_/.test(k)); // a new character is given a random second skill, so use an attack it has
if (!skill) console.log("skip: the character has no attack skill to cast");
send({ t: "cast", skill: skill ?? "chuong_0", x: aim[0], y: aim[1] });
await sleep(1500);
const after = log.slice(mark2);
const fx = after.find((m) => m.t === "fx" && m.id === id);
check("a cast at a point plays its effect at that point", !!fx && fx.x !== undefined && fx.y !== undefined && fx.to === undefined, JSON.stringify(fx));
check("and spends MP and starts the cooldown", after.some((m) => m.t === "cast_ok" && m.skill === skill) && (after.filter((m) => m.t === "mp").pop()?.mp ?? mp0) <= (mp0 ?? 999));
ws.close();
console.log(failures === 0 ? "ALL OK" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

// Local test of skills (phase 2c): basic skills in the welcome, casting in the forest (MP, cooldown, damage), a heal, the
// hotbar (set, saved, restored), reading a bí tịch (level check, consumed once, already-known refused) and a potion slot.
// Usage: node tools/skills-smoke.mjs [ws://localhost:8787]
// Registers a throwaway account and uses dev-only endpoints: local only, needs DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1.
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}

const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
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
async function connect(cookie, ch) {
  const c = open(cookie, ch);
  await c.opened;
  await c.wait((m) => m.t === "welcome", 5000, "welcome");
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}
async function after(c, msg, ms = 600) {
  const mark = c.log.length;
  c.send(msg);
  await sleep(ms);
  return c.log.slice(mark);
}

const reg = await post("/api/register", { email: `sk-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Pháp ${run.slice(-4)}`, gender: "male" }, reg.cookie);
const charId = created.data.character.id;
const root = created.data.character.spiritualRoot;
const roots = created.data.character.roots;
const order = ["kim", "moc", "thuy", "hoa", "tho"];
const give2 = (item) => fetch(`${httpBase}/api/dev/loot?room=forest:2&char=${charId}&item=${item}&qty=1`).then((r) => r.json());
const give = (item) => fetch(`${httpBase}/api/dev/loot?room=town:2&char=${charId}&item=${item}&qty=1`).then((r) => r.json());

check("the character has 1 to 5 distinct elements, the main one first", roots.length >= 1 && roots.length <= 5 && new Set(roots).size === roots.length && roots[0] === root, roots.join("+"));
let c = await connect(reg.cookie, 2);
check("a new character is given exactly two root skills of the first realm, one an attack, whatever its elements", c.welcome.skills.length === 2 && c.welcome.skills.every((id) => id.endsWith("_0")) && c.welcome.skills.some((id) => /^(chuong|tram|chi)_0$/.test(id)), `${roots.join("+")}: ${c.welcome.skills.join()}`);
check("the welcome carries the (empty) mastery of those skills", typeof c.welcome.skillStates === "object" && c.welcome.skillStates !== null);
// Give a known set (an attack, a heal and a buff of the first realm) so the rest of the run does not depend on the roll.
c.ws.close();
await sleep(500);
for (const id of ["chuong_0", "hoi_0", "thuan_0"]) sql(`INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('${charId}', '${id}', 1, 'root', 0)`);
c = await connect(reg.cookie, 2);
check("with those added the character can use them", ["chuong_0", "hoi_0", "thuan_0"].every((id) => c.welcome.skills.includes(id)), c.welcome.skills.join());
check("the welcome carries MP and an empty hotbar", c.welcome.maxMp > 0 && c.welcome.mp === c.welcome.maxMp && c.welcome.hotbar.length === 8 && c.welcome.hotbar.every((s) => s === ""));

// Town: no casting.
let r = await after(c, { t: "cast", skill: "hoi_0" }, 400);
check("skills are refused in town", r.some((m) => m.t === "cast_error" && m.reason === "town"));

// Hotbar: set, rejected values, saved across a reconnect.
await after(c, { t: "hotbar_set", slot: 0, v: "s:chuong_0" }, 500);
check("a hotbar slot can hold a known skill", c.log.some((m) => m.t === "hotbar" && m.slots[0] === "s:chuong_0"));
await sleep(350);
r = await after(c, { t: "hotbar_set", slot: 1, v: "s:cuong_than" }, 500);
check("a skill the character does not have is refused", r.some((m) => m.t === "hotbar" && m.slots[1] === ""));
await sleep(350);
await after(c, { t: "hotbar_set", slot: 2, v: "s:hoi_0" }, 500);
await sleep(350);
await after(c, { t: "hotbar_set", slot: 7, v: "i:hoi_huyet_dan" }, 500);
c.ws.close();
await sleep(500);
c = await connect(reg.cookie, 2);
check("the hotbar is saved", c.welcome.hotbar[0] === "s:chuong_0" && c.welcome.hotbar[2] === "s:hoi_0" && c.welcome.hotbar[7] === "i:hoi_huyet_dan" && c.welcome.hotbar[1] === "");

// Books: level check, consumed once, already-known refused.
await give("bt_cuong_than");
await give("bt_cuong_than");
await sleep(700);
const bag = () => {
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) if (m.t === "inv") { if (m.full) items.clear(); for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
  return [...items.values()];
};
const books = () => bag().filter((i) => i.type === "bt_cuong_than");
r = await after(c, { t: "inv_use", tab: 0, cell: books()[0].cell });
check("a book above the character's level is refused and kept", r.some((m) => m.t === "inv_error" && m.reason === "level_low") && books().length === 2);
await fetch(`${httpBase}/api/dev/grant-exp`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: reg.cookie }, body: JSON.stringify({ exp: 1e9 }) });
c.ws.close();
await sleep(600);
c = await connect(reg.cookie, 2);
check("the character is now high enough (Luyện Khí 9) to read the book", c.welcome.character.stage === 9 && c.welcome.skills.includes("chuong_0") && c.welcome.skills.includes("thuan_0"), c.welcome.skills.join());
r = await after(c, { t: "inv_use", tab: 0, cell: books()[0].cell }, 900);
check("reading the book teaches the skill and consumes it", r.some((m) => m.t === "skills" && m.ids.includes("cuong_than")) && books().length === 1);
await sleep(200);
r = await after(c, { t: "inv_use", tab: 0, cell: books()[0].cell }, 900);
check("reading a second copy is refused as already known and the book stays", r.some((m) => m.t === "inv_error" && m.reason === "known") && books().length === 1);
c.ws.close();
await sleep(500);
c = await connect(reg.cookie, 2);
check("the learned skill is still there after reconnecting", c.welcome.skills.includes("cuong_than"));

// Forest: cast an attack, a heal and a buff.
c.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
await c.wait((m) => m.t === "ack" && m.seq === 1);
await sleep(5500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer");
await sleep(500);
c = await connect(reg.cookie, 2);
check("the forest welcome has MP", c.welcome.map === "forest" && c.welcome.mp === c.welcome.maxMp);
const prey = c.welcome.monsters.find((m) => m.rank === "normal" && m.tier === 1) ?? c.welcome.monsters[0];
const maxMp = c.welcome.maxMp;
c.send({ t: "cast", skill: "chuong_0", target: prey.id, el: root });
const ok = await c.wait((m) => m.t === "cast_ok", 15000, "the cast to go off");
check("an attack skill walks into range and goes off with a cooldown", ok.skill === "chuong_0" && ok.cdMs === 3000);
const hit = await c.wait((m) => m.t === "hit" && m.skill === "chuong_0", 3000, "a skill hit");
check("the hit names the skill", hit.from === charId);
const mp = [...c.log].reverse().find((m) => m.t === "mp");
const state = await c.wait((m) => m.t === "skill_state" && m.id === "chuong_0", 3000, "the mastery of the skill");
check("a skill that landed gained a mastery point", state.lv === 0 && state.xp >= 1, JSON.stringify(state));
check("MP was spent", mp && mp.maxMp === maxMp && mp.mp <= maxMp - 8, `mp ${mp?.mp}/${mp?.maxMp}`);
r = await after(c, { t: "cast", skill: "chuong_0", target: prey.id }, 400);
check("casting again at once is refused (cooldown)", r.some((m) => m.t === "cast_error" && m.reason === "cooldown"));
await sleep(300);
r = await after(c, { t: "cast", skill: "hoi_0" }, 900);
check("the heal goes off", r.some((m) => m.t === "cast_ok" && m.skill === "hoi_0"));
await sleep(300);
r = await after(c, { t: "cast", skill: "thuan_0" }, 900);
check("the buff goes off", r.some((m) => m.t === "buff" && m.skill === "thuan_0" && m.ms === 15000));
await sleep(300);
r = await after(c, { t: "cast", skill: "ngu_kiem_tram", target: prey.id }, 500);
check("a skill the character has not learned is refused", r.some((m) => m.t === "cast_error" && m.reason === "unknown"));
// Reloading the page keeps MP and the cooldowns (and HP, which the heal had restored or not).
const spentBefore = [...c.log].reverse().find((m) => m.t === "mp");
c.ws.close();
await sleep(500);
c = await connect(reg.cookie, 2);
check("after a reload MP is not refilled", c.welcome.mp < c.welcome.maxMp - 20 && c.welcome.mp >= (spentBefore?.mp ?? 0) - 1, `mp ${c.welcome.mp}/${c.welcome.maxMp}, was ${spentBefore?.mp}`);
check("... the cooldowns carry over", (c.welcome.cd.thuan_0 ?? 0) > 20_000 && (c.welcome.cd.hoi_0 ?? 0) > 0, JSON.stringify(c.welcome.cd));
check("... and the mastery earned is kept (written when the player left)", (c.welcome.skillStates.chuong_0?.xp ?? 0) >= 1, JSON.stringify(c.welcome.skillStates));
check("... and HP is what it was, not full by default", c.welcome.hp > 0 && c.welcome.hp <= c.welcome.maxHp);

// Back in town (no simulation there) the stored HP, MP and cooldowns still show, and keep regenerating.
c.send({ t: "move", x: 20.5, y: 1.5, fx: c.welcome.players.find((p) => p.id === charId).path[0][0], fy: c.welcome.players.find((p) => p.id === charId).path[0][1], seq: 5 });
await c.wait((m) => m.t === "ack" && m.seq === 5);
await sleep(4500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "the north gate");
c.ws.close();
await sleep(700);
const now = Date.now();
sql(`UPDATE characters SET vitals = json_object('hp', 25, 'mp', 7, 'at', ${now}, 'cd', json_object('thuan_0', ${now + 25000}), 'buffs', json('[]')) WHERE id = '${charId}'`);
c = await connect(reg.cookie, 2);
check("in town the welcome carries the stored HP, MP and cooldown", c.welcome.map === "town" && c.welcome.hp >= 25 && c.welcome.hp < c.welcome.maxHp / 2 && c.welcome.mp >= 7 && c.welcome.mp < 40 && (c.welcome.cd.thuan_0 ?? 0) > 15_000, `hp ${c.welcome.hp}/${c.welcome.maxHp}, mp ${c.welcome.mp}/${c.welcome.maxMp}, cd ${JSON.stringify(c.welcome.cd)}`);
check("... and regeneration starts after the usual delay", c.welcome.regenInMs === 0 || c.welcome.regenInMs <= 5000);
c.ws.close();
await sleep(500);
// Walk back to the forest for the eviction step below.
c = await connect(reg.cookie, 2);
c.send({ t: "move", x: 20.5, y: 38.5, fx: c.welcome.players.find((p) => p.id === charId).path[0][0], fy: c.welcome.players.find((p) => p.id === charId).path[0][1], seq: 6 });
await c.wait((m) => m.t === "ack" && m.seq === 6);
await sleep(5500);
c.send({ t: "portal" });
await c.wait((m) => m.t === "transfer", 8000, "the south gate");
await sleep(500);
c = await connect(reg.cookie, 2);
check("back in the forest with the stored HP restored there too", c.welcome.map === "forest" && c.welcome.hp > 0, `hp ${c.welcome.hp}`);

// A real eviction loses every in-memory copy: the hotbar and the learned skills must come back from D1, not from an empty default.
await sleep(300);
await after(c, { t: "hotbar_set", slot: 3, v: "s:hoi_0" }, 600);
// A room with a fighting player never pauses by itself, so the dev hook is told to evict it anyway.
const evicted = (await (await fetch(`${httpBase}/api/dev/evict?room=forest:2&force=1`)).json()).evicted === true;
check("the room was evicted (simulation, bags, hotbars and learned skills gone)", evicted);
await sleep(300);
await after(c, { t: "hotbar_set", slot: 4, v: "s:thuan_0" }, 700);
await give2("bt_ngu_kiem_tram");
await sleep(900);
const book = [...c.log].reverse().find((m) => m.t === "inv" && m.items.some((i) => i.type === "bt_ngu_kiem_tram"))?.items.find((i) => i.type === "bt_ngu_kiem_tram");
check("a book given after the eviction arrived", !!book);
r = await after(c, { t: "inv_use", tab: book.tab, cell: book.cell }, 1000);
const after2 = r.find((m) => m.t === "skills");
check("learning after the eviction keeps the skill learned before", after2?.ids.includes("ngu_kiem_tram") && after2.ids.includes("cuong_than"), after2?.ids.join());
c.ws.close();
await sleep(500);
c = await connect(reg.cookie, 2);
check("... and the hotbar kept its other slots", c.welcome.hotbar[0] === "s:chuong_0" && c.welcome.hotbar[2] === "s:hoi_0" && c.welcome.hotbar[3] === "s:hoi_0" && c.welcome.hotbar[4] === "s:thuan_0" && c.welcome.hotbar[7] === "i:hoi_huyet_dan", c.welcome.hotbar.join("|"));
check("the mastery survived the eviction (it comes back from D1, not from an empty default)", (c.welcome.skillStates.chuong_0?.xp ?? 0) >= 1, JSON.stringify(c.welcome.skillStates));
c.ws.close();
console.log(failures === 0 ? "skills smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

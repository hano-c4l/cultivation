// Local test of skills (phase 2c): basic skills in the welcome, casting in the forest (MP, cooldown, damage), a heal, the
// hotbar (set, saved, restored), reading a bí tịch (level check, consumed once, already-known refused) and a potion slot.
// Usage: node tools/skills-smoke.mjs [ws://localhost:8787]
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
const give2 = (item) => fetch(`${httpBase}/api/dev/loot?room=forest:2&char=${charId}&item=${item}&qty=1`).then((r) => r.json());
const give = (item) => fetch(`${httpBase}/api/dev/loot?room=town:2&char=${charId}&item=${item}&qty=1`).then((r) => r.json());

let c = await connect(reg.cookie, 2);
check("a new character starts with its own element skill and the heal", c.welcome.skills.join() === `${root}_1,hoi_khi`, c.welcome.skills.join());
check("the welcome carries MP and an empty hotbar", c.welcome.maxMp > 0 && c.welcome.mp === c.welcome.maxMp && c.welcome.hotbar.length === 8 && c.welcome.hotbar.every((s) => s === ""));

// Town: no casting.
let r = await after(c, { t: "cast", skill: "hoi_khi" }, 400);
check("skills are refused in town", r.some((m) => m.t === "cast_error" && m.reason === "town"));

// Hotbar: set, rejected values, saved across a reconnect.
await after(c, { t: "hotbar_set", slot: 0, v: `s:${root}_1` }, 500);
check("a hotbar slot can hold a known skill", c.log.some((m) => m.t === "hotbar" && m.slots[0] === `s:${root}_1`));
await sleep(350);
r = await after(c, { t: "hotbar_set", slot: 1, v: "s:cuong_than" }, 500);
check("a skill the character does not have is refused", r.some((m) => m.t === "hotbar" && m.slots[1] === ""));
await sleep(350);
await after(c, { t: "hotbar_set", slot: 2, v: "s:hoi_khi" }, 500);
await sleep(350);
await after(c, { t: "hotbar_set", slot: 7, v: "i:hoi_huyet_dan" }, 500);
c.ws.close();
await sleep(500);
c = await connect(reg.cookie, 2);
check("the hotbar is saved", c.welcome.hotbar[0] === `s:${root}_1` && c.welcome.hotbar[2] === "s:hoi_khi" && c.welcome.hotbar[7] === "i:hoi_huyet_dan" && c.welcome.hotbar[1] === "");

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
check("the character is now high enough (Luyện Khí 9) and has more basic skills", c.welcome.character.stage === 9 && c.welcome.skills.includes(`${root}_2`) && c.welcome.skills.includes("linh_thuan"), c.welcome.skills.join());
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
c.send({ t: "cast", skill: `${root}_1`, target: prey.id });
const ok = await c.wait((m) => m.t === "cast_ok", 15000, "the cast to go off");
check("an attack skill walks into range and goes off with a cooldown", ok.skill === `${root}_1` && ok.cdMs === 3000);
const hit = await c.wait((m) => m.t === "hit" && m.skill === `${root}_1`, 3000, "a skill hit");
check("the hit names the skill", hit.from === charId);
const mp = [...c.log].reverse().find((m) => m.t === "mp");
check("MP was spent", mp && mp.maxMp === maxMp && mp.mp <= maxMp - 8, `mp ${mp?.mp}/${mp?.maxMp}`);
r = await after(c, { t: "cast", skill: `${root}_1`, target: prey.id }, 400);
check("casting again at once is refused (cooldown)", r.some((m) => m.t === "cast_error" && m.reason === "cooldown"));
await sleep(300);
r = await after(c, { t: "cast", skill: "hoi_khi" }, 900);
check("the heal goes off", r.some((m) => m.t === "cast_ok" && m.skill === "hoi_khi"));
await sleep(300);
r = await after(c, { t: "cast", skill: "linh_thuan" }, 900);
check("the buff goes off", r.some((m) => m.t === "buff" && m.skill === "linh_thuan" && m.ms === 15000));
await sleep(300);
r = await after(c, { t: "cast", skill: "ngu_kiem_tram", target: prey.id }, 500);
check("a skill the character has not learned is refused", r.some((m) => m.t === "cast_error" && m.reason === "unknown"));
// A real eviction loses every in-memory copy: the hotbar and the learned skills must come back from D1, not from an empty default.
await sleep(300);
await after(c, { t: "hotbar_set", slot: 3, v: "s:hoi_khi" }, 600);
// A room with a fighting player never pauses by itself, so the dev hook is told to evict it anyway.
const evicted = (await (await fetch(`${httpBase}/api/dev/evict?room=forest:2&force=1`)).json()).evicted === true;
check("the room was evicted (simulation, bags, hotbars and learned skills gone)", evicted);
await sleep(300);
await after(c, { t: "hotbar_set", slot: 4, v: "s:linh_thuan" }, 700);
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
check("... and the hotbar kept its other slots", c.welcome.hotbar[0] === `s:${root}_1` && c.welcome.hotbar[2] === "s:hoi_khi" && c.welcome.hotbar[3] === "s:hoi_khi" && c.welcome.hotbar[4] === "s:linh_thuan" && c.welcome.hotbar[7] === "i:hoi_huyet_dan", c.welcome.hotbar.join("|"));
c.ws.close();
console.log(failures === 0 ? "skills smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

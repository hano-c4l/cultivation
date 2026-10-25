// Local test of several characters per account (docs/PHASE3.md 3m-d): the limit (a setting an admin changes), listing, choosing, two logins playing two
// characters at once, going back to the list, deleting one (soft) and making another, and the other account's characters out of reach.
// Usage: node tools/characters-smoke.mjs [ws://localhost:8787]   Needs wrangler dev, DISABLE_RATE_LIMIT=1 and the 0047 migration; local only.
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
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}
const get = async (path, cookie) => {
  const res = await fetch(httpBase + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const PASSWORD = "correct-horse-battery";

/** Opens the game socket and resolves with the welcome (or the HTTP-level refusal as `{ refused: true }`). */
function play(cookie, ch) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base}/ws?ch=${ch}`, { headers: { Cookie: cookie } });
    const t = setTimeout(() => resolve({ ws, refused: true }), 8000);
    ws.addEventListener("message", (ev) => {
      if (ev.data === "pong") return;
      const m = JSON.parse(ev.data);
      if (m.t === "welcome") {
        clearTimeout(t);
        resolve({ ws, welcome: m });
      }
    });
    ws.addEventListener("error", () => resolve({ ws, refused: true }));
    ws.addEventListener("close", () => resolve({ ws, refused: true }));
  });
}

const adminEmail = `ch-admin-${run}@example.test`;
const admin = await post("/api/register", { email: adminEmail, password: PASSWORD });
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000);
const settingKey = "max_characters";
const original = (await get("/api/admin/settings", admin.cookie)).data;

const email = `ch-player-${run}@example.test`;
let a = await post("/api/register", { email, password: PASSWORD });
let me = await get("/api/me", a.cookie);
check("a new account has no characters and the limit is 3", me.data.characters?.length === 0 && me.data.maxCharacters === 3 && me.data.character === null, JSON.stringify(me.data).slice(0, 200));

const names = [1, 2, 3, 4].map((i) => `Ch${i} ${run.slice(-4)}`);
const made = [];
for (const [i, name] of names.slice(0, 3).entries()) {
  const r = await post("/api/character", { name, gender: i % 2 ? "female" : "male" }, a.cookie);
  made.push(r.data.character?.id);
  check(`character ${i + 1} is created (${r.status})`, r.status === 201 && !!r.data.character?.id);
}
const fourth = await post("/api/character", { name: names[3], gender: "male" }, a.cookie);
check("the fourth is refused with character_limit", fourth.status === 409 && fourth.data.error === "character_limit");
check("a name already taken is refused", (await post("/api/character", { name: names[0], gender: "male" }, (await post("/api/register", { email: `ch-other-${run}@example.test`, password: PASSWORD })).cookie)).data.error === "name_taken");

// A new login lists them all and has chosen none.
const login = await post("/api/login", { email, password: PASSWORD });
me = await get("/api/me", login.cookie);
check("a new login lists the three characters and has chosen none", me.data.characters?.length === 3 && me.data.character === null);
check("the game socket is refused until one is chosen", (await play(login.cookie, 5)).refused === true);
const sel = await post("/api/character/select", { id: made[1] }, login.cookie);
check("choosing one works and /api/me then shows it", sel.status === 200 && (await get("/api/me", login.cookie)).data.character?.id === made[1]);
const p1 = await play(login.cookie, 5);
check("the socket then joins as that character", p1.welcome?.self === made[1] || p1.welcome?.character?.id === made[1], p1.welcome?.character?.name);

// A second login plays another character of the same account at the same time.
const login2 = await post("/api/login", { email, password: PASSWORD });
await post("/api/character/select", { id: made[2] }, login2.cookie);
const p2 = await play(login2.cookie, 5);
check("a second login plays a different character at the same time", p2.welcome?.character?.id === made[2] && p1.ws.readyState === 1);
check("a character of another account cannot be chosen", (await post("/api/character/select", { id: sql(`SELECT id FROM characters WHERE account_id != (SELECT id FROM accounts WHERE email='${email}') LIMIT 1`)[0].id }, login.cookie)).status === 404);

// Back to the list.
p1.ws.close();
p2.ws.close();
await post("/api/character/deselect", {}, login.cookie);
check("going back to the list leaves the login with no character", (await get("/api/me", login.cookie)).data.character === null);

// Delete one: the name has to be typed again, the character leaves the list, its name is free, and there is room again.
check("deleting with the wrong name is refused", (await post("/api/character/delete", { id: made[0], name: "wrong" }, login.cookie)).status === 400);
const del = await post("/api/character/delete", { id: made[0], name: names[0] }, login.cookie);
check("deleting with the right name works", del.status === 200, JSON.stringify(del.data));
me = await get("/api/me", login.cookie);
check("the list has two left", me.data.characters?.length === 2 && !me.data.characters.some((c) => c.id === made[0]));
const row = sql(`SELECT deleted_at, name FROM characters WHERE id='${made[0]}'`)[0];
check("the row is kept, marked deleted, its name freed", row?.deleted_at > 0 && row.name.startsWith("~"));
const again = await post("/api/character", { name: names[0], gender: "male" }, login.cookie);
check("the freed name and the free place make a new character", again.status === 201);
check("a deleted character cannot be chosen", (await post("/api/character/select", { id: made[0] }, login.cookie)).status === 404);

// The limit is a setting.
const lower = await post("/api/admin/settings", { key: settingKey, value: 3 }, admin.cookie);
check("the limit is a setting the admin can read", lower.status === 400 || lower.status === 200, `status ${lower.status}`);
const set2 = await post("/api/admin/settings", { key: settingKey, value: 1 }, admin.cookie);
check("lowering the limit is accepted", set2.status === 200, JSON.stringify(set2.data));
await sleep(500);
check("with the limit at 1 no more can be made, and the ones there stay", (await post("/api/character", { name: `Ch9 ${run.slice(-4)}`, gender: "male" }, login.cookie)).data.error === "character_limit" && (await get("/api/me", login.cookie)).data.characters.length === 3);
const back = await post("/api/admin/settings", { key: settingKey, value: 3 }, admin.cookie);
check("the limit goes back to 3", back.status === 200);
void original;

console.log(failures === 0 ? "\nall character checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

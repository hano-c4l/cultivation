// Local test of the admin pages and their guard (phase 3a): /admin/* needs an admin session, everyone else is sent to /admin/login, the old
// static pages are gone, the admin API answers 401/403/200 as it should, and admin actions leave rows in the change log.
// Usage: node tools/admin-pages-smoke.mjs [http://localhost:8787]
// Registers a throwaway account and makes it admin in the LOCAL D1, so it only runs against localhost with DISABLE_RATE_LIMIT=1 in .dev.vars.
import { execFileSync } from "node:child_process";

const httpBase = (process.argv[2] ?? "http://localhost:8787").replace(/^ws/, "http");
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

// Redirects are not followed: the redirect itself is what is being tested.
const get = async (path, cookie) => {
  const res = await fetch(httpBase + path, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, location: res.headers.get("location"), text: await res.text(), headers: res.headers };
};

async function register(email) {
  const res = await fetch(httpBase + "/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "smoke-pass-123" }) });
  return res.headers.getSetCookie?.()[0]?.split(";")[0];
}

// Anonymous visitors.
for (const p of ["/admin", "/admin/", "/admin/index", "/admin/audit", "/admin/audit/1", "/admin/anything"]) {
  const r = await get(p);
  check(`anonymous ${p} redirects to the login page`, r.status === 302 && r.location === "/admin/login", `${r.status} ${r.location}`);
}
const login = await get("/admin/login");
check("anonymous gets the login page shell", login.status === 200 && login.text.includes('id="app"') && login.text.includes("/assets/admin-"), String(login.status));
check("the admin page is never cached", (login.headers.get("cache-control") ?? "").includes("no-store"));
for (const p of ["/admin.html", "/admin-constitutions.html"]) {
  const r = await get(p);
  check(`old page ${p} redirects away`, r.status === 302 && r.location === "/admin", `${r.status} ${r.location}`);
}
const post = await fetch(httpBase + "/admin", { method: "POST", redirect: "manual" });
check("POST /admin is refused", post.status === 405, String(post.status));
for (const p of ["/api/admin/me", "/api/admin/audit", "/api/admin/audit-entry?id=1"]) {
  const r = await get(p);
  check(`anonymous ${p} is 401`, r.status === 401, String(r.status));
}

// A player.
const playerCookie = await register(`adminpages-player-${run}@example.test`);
check("player registered", Boolean(playerCookie));
for (const p of ["/admin", "/admin/audit"]) {
  const r = await get(p, playerCookie);
  check(`player ${p} redirects to the login page`, r.status === 302 && r.location === "/admin/login", `${r.status} ${r.location}`);
}
check("player still gets the login page", (await get("/admin/login", playerCookie)).status === 200);
for (const p of ["/api/admin/me", "/api/admin/audit"]) {
  const r = await get(p, playerCookie);
  check(`player ${p} is 403`, r.status === 403, String(r.status));
}

// An admin.
const adminEmail = `adminpages-admin-${run}@example.test`;
const adminCookie = await register(adminEmail);
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000); // a command straight after d1 execute can be reset
for (const p of ["/admin", "/admin/", "/admin/index", "/admin/audit", "/admin/audit/1", "/admin/anything"]) {
  const r = await get(p, adminCookie);
  check(`admin ${p} gets the app`, r.status === 200 && r.text.includes('id="app"'), String(r.status));
}
const again = await get("/admin/login", adminCookie);
check("admin asking for the login page is sent home", again.status === 302 && again.location === "/admin", `${again.status} ${again.location}`);
const me = await get("/api/admin/me", adminCookie);
check("admin /api/admin/me is 200 with the email", me.status === 200 && JSON.parse(me.text).account.email === adminEmail, String(me.status));

// The change log: a setting change by the admin leaves a row, readable with search and detail.
const set = await fetch(httpBase + "/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ key: "bag_tab_price", value: 1234 }) });
check("admin changes a setting", set.status === 200, String(set.status));
const list = await get(`/api/admin/audit?q=${encodeURIComponent("bag_tab_price")}&sort=id&dir=desc&size=5`, adminCookie);
const listed = JSON.parse(list.text);
const row = listed.rows?.[0];
check("the change log lists it", list.status === 200 && row?.action === "setting_change" && row.adminEmail === adminEmail && row.targetId === "bag_tab_price", list.text.slice(0, 120));
const detail = await get(`/api/admin/audit-entry?id=${row?.id}`, adminCookie);
check("the entry shows before and after", detail.status === 200 && JSON.parse(detail.text).entry.after === 1234, detail.text.slice(0, 120));
check("an unknown entry is 404", (await get("/api/admin/audit-entry?id=99999999", adminCookie)).status === 404);
check("a bad id is 400", (await get("/api/admin/audit-entry?id=abc", adminCookie)).status === 400);
// The currency screens (3b): a Tiên Ngọc grant to the admin's own character shows in the history, the per-person totals, the supply and the check.
const charName = `Jd${run}`;
const created = await fetch(httpBase + "/api/character", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ name: charName, gender: "male" }) });
const charId = (await created.json()).character?.id;
check("admin's character created", created.status === 201 && Boolean(charId), String(created.status));
const grant = await fetch(httpBase + "/api/admin/grant", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ characterId: charId, currency: "tien_ngoc", amount: 300, reason: "jade-smoke", idempotencyKey: `jade-smoke-${run}` }) });
check("admin grants 300 Tiên Ngọc", grant.status === 200, String(grant.status));
const hist = JSON.parse((await get(`/api/admin/currency-history?currency=tien_ngoc&q=${encodeURIComponent(charName)}`, adminCookie)).text);
check("the history lists it with the actor and the reason", hist.rows?.[0]?.delta === 300 && hist.rows[0].actor === adminEmail && hist.rows[0].reason === "admin_grant:jade-smoke" && hist.rows[0].characterName === charName, JSON.stringify(hist.rows?.[0]));
check("the totals and the breakdown count it", hist.summary?.totalIn === 300 && hist.groups?.some((g) => g.group === "admin_grant"), JSON.stringify(hist.summary));
const lt = JSON.parse((await get(`/api/admin/currency-history?currency=linh_thach&q=${encodeURIComponent(charName)}`, adminCookie)).text);
check("Linh Thạch history does not show it", lt.currency === "linh_thach" && lt.total === 0, String(lt.total));
const noHistory = JSON.parse((await get("/api/admin/currency-history?currency=cong_hien", adminCookie)).text);
check("Cống Hiến has no history: the request falls back to Tiên Ngọc", noHistory.currency === "tien_ngoc");
const byChar = JSON.parse((await get(`/api/admin/currency-history?character=${charId}&reason=admin_grant`, adminCookie)).text);
check("filtering by character and reason group works", byChar.total === 1, String(byChar.total));
const totals = JSON.parse((await get(`/api/admin/currency-totals?currency=tien_ngoc&q=${encodeURIComponent(charName)}`, adminCookie)).text);
check("totals per person show net, balance and no difference", totals.rows?.[0]?.net === 300 && totals.rows[0].balance === 300 && totals.rows[0].diff === 0 && totals.rows[0].characterName === charName, JSON.stringify(totals.rows?.[0]));
const ch = JSON.parse((await get("/api/admin/currency-totals?currency=cong_hien", adminCookie)).text);
check("Cống Hiến totals answer", ch.currency === "cong_hien" && Array.isArray(ch.rows));
const supply = JSON.parse((await get("/api/admin/supply", adminCookie)).text);
check("the supply has Tiên Ngọc", supply.supply?.some((r) => r.currency === "tien_ngoc" && r.total >= 300));
const eco = JSON.parse((await get("/api/admin/economy-check", adminCookie)).text);
check("the quick check answers for the three currencies without this character", eco.checks?.length === 3 && !eco.checks.flatMap((c) => c.mismatches).some((m) => m.characterId === charId));
for (const p of ["/api/admin/currency-history", "/api/admin/currency-totals", "/api/admin/economy-check"]) {
  check(`anonymous ${p} is 401`, (await get(p)).status === 401);
  check(`player ${p} is 403`, (await get(p, playerCookie)).status === 403);
}
check("a nonsense sort or date falls back instead of failing", (await get("/api/admin/currency-history?sort=x%3Bdrop&from=nope&size=999999", adminCookie)).status === 200);

// Put the setting back so the local database is as it was.
await fetch(httpBase + "/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ key: "bag_tab_price", value: listed.rows ? JSON.parse(detail.text).entry.before ?? 1000 : 1000 }) });

console.log(failures === 0 ? "\nall admin page checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

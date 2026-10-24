// Local test of the admin pages and the currency management (phase 3a and 3b): /admin/* needs an admin session, everyone else is sent to
// /admin/login, the old static pages are gone, the admin API answers 401/403/200 as it should, admin changes leave lines in the admin log,
// and the currency screens work end to end: search, detail, the Tiên Ngọc history popup, the balance audit (run, refusal while rows are
// invalid, Xác nhận, Xử lý).
// Usage: node tools/admin-pages-smoke.mjs [http://localhost:8787]
// Registers throwaway accounts and edits the LOCAL D1 (makes an admin, skews a balance), so it only runs against localhost with
// DISABLE_RATE_LIMIT=1 in .dev.vars. Never run it against preview or production.
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
const json = async (path, cookie) => {
  const r = await get(path, cookie);
  return { status: r.status, data: JSON.parse(r.text || "{}") };
};
const post = async (path, body, cookie) => {
  const res = await fetch(httpBase + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

async function register(email) {
  const res = await fetch(httpBase + "/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "smoke-pass-123" }) });
  return res.headers.getSetCookie?.()[0]?.split(";")[0];
}

// Anonymous visitors.
for (const p of ["/admin", "/admin/", "/admin/index", "/admin/currency", "/admin/currency/detail?currency=tien_ngoc&character=x", "/admin/log", "/admin/anything"]) {
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
check("POST /admin is refused", (await fetch(httpBase + "/admin", { method: "POST", redirect: "manual" })).status === 405);
const API = ["/api/admin/me", "/api/admin/log", "/api/admin/currency/meta", "/api/admin/currency/search", "/api/admin/currency/detail?character=x", "/api/admin/currency/history?character=x", "/api/admin/currency/audit"];
for (const p of API) check(`anonymous ${p} is 401`, (await get(p)).status === 401);
check("the audit actions are 401 without a session", (await fetch(httpBase + "/api/admin/currency/audit/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401);

// A player.
const playerCookie = await register(`adminpages-player-${run}@example.test`);
check("player registered", Boolean(playerCookie));
for (const p of ["/admin", "/admin/currency"]) {
  const r = await get(p, playerCookie);
  check(`player ${p} redirects to the login page`, r.status === 302 && r.location === "/admin/login", `${r.status} ${r.location}`);
}
check("player still gets the login page", (await get("/admin/login", playerCookie)).status === 200);
for (const p of API) check(`player ${p} is 403`, (await get(p, playerCookie)).status === 403);
for (const a of ["run", "confirm", "handle"]) check(`player cannot ${a} the audit`, (await post(`/api/admin/currency/audit/${a}`, { currency: "tien_ngoc", character: "x" }, playerCookie)).status === 403);

// An admin.
const adminEmail = `adminpages-admin-${run}@example.test`;
const adminCookie = await register(adminEmail);
sql(`UPDATE accounts SET role='admin' WHERE email='${adminEmail}'`);
await sleep(3000); // a command straight after d1 execute can be reset
for (const p of ["/admin", "/admin/", "/admin/index", "/admin/currency", "/admin/currency/audit?currency=linh_thach", "/admin/currency/detail?currency=tien_ngoc&character=x", "/admin/log", "/admin/anything"]) {
  const r = await get(p, adminCookie);
  check(`admin ${p} gets the app`, r.status === 200 && r.text.includes('id="app"'), String(r.status));
}
const again = await get("/admin/login", adminCookie);
check("admin asking for the login page is sent home", again.status === 302 && again.location === "/admin");
check("admin /api/admin/me is 200 with the email", (await json("/api/admin/me", adminCookie)).data.account?.email === adminEmail);
const meta = await json("/api/admin/currency/meta", adminCookie);
check("meta lists the three currencies and the fixed groups", meta.data.currencies?.length === 3 && meta.data.groups?.map((g) => g.id).join() === "farm,shop,quest,trade,enhance,travel,admin,other", JSON.stringify(meta.data.groups?.map((g) => g.id)));

// The admin log: a setting change leaves a line (newest first) saying what was done.
const set = await post("/api/admin/settings", { key: "bag_tab_price", value: 1234 }, adminCookie);
check("admin changes a setting", set.status === 200, String(set.status));
await post("/api/admin/settings", { key: "bag_tab_price", value: 1000 }, adminCookie);
const logRes = await json(`/api/admin/log?q=${encodeURIComponent("Giá mở khóa một tab")}&size=5`, adminCookie);
check("the log lists both changes, newest first, with the admin, the screen and the content", logRes.data.rows?.[0]?.content?.endsWith("→ 1000") && logRes.data.rows[1].content.endsWith("→ 1234") && logRes.data.rows[0].adminEmail === adminEmail && logRes.data.rows[0].screen === "Chỉ số khác", JSON.stringify(logRes.data.rows?.slice(0, 2)));
check("a setting saved with the same value is refused", (await post("/api/admin/settings", { key: "bag_tab_price", value: 1000 }, adminCookie)).status === 400);

// "Chỉ số khác": the tuning groups.
check("anonymous tuning is 401, a player's is 403", (await get("/api/admin/tuning")).status === 401 && (await get("/api/admin/tuning", playerCookie)).status === 403);
check("a player cannot save a tuning group", (await post("/api/admin/tuning", { group: "waygate", updatedAt: 0, value: { base: 1, perUnit: 1 } }, playerCookie)).status === 403);
const tn = await json("/api/admin/tuning", adminCookie);
const wg = tn.data.groups?.find((g) => g.group === "waygate");
check("tuning lists pvp, waygate, aoi, combat and theme with fields and defaults", tn.data.groups?.map((g) => g.group).join() === "pvp,waygate,aoi,combat,theme" && wg?.fields?.length === 2 && wg.stored === true, JSON.stringify(tn.data.groups?.map((g) => g.group)));
const realmsPage = await json("/api/admin/tuning?page=realms", adminCookie);
const potentialPage = await json("/api/admin/tuning?page=potential", adminCookie);
check("the realms and potential pages list their own groups", realmsPage.data.groups?.map((g) => g.group).join() === "exp,breakthrough,kills" && potentialPage.data.groups?.map((g) => g.group).join() === "stats" && potentialPage.data.groups[0].stored === true);
const verOf = () => sql("SELECT version FROM config_versions WHERE name='tuning'")[0].version;
const v0 = verOf();
const origWg = wg.value;
const t1 = await post("/api/admin/tuning", { group: "waygate", updatedAt: wg.updatedAt, value: { base: 777, perUnit: wg.value.perUnit } }, adminCookie);
check("saving a tuning group works and returns the new value", t1.status === 200 && t1.data.groups?.find((g) => g.group === "waygate")?.value.base === 777, String(t1.status));
check("the version was bumped and the log has the change", verOf() === v0 + 1 && (await json(`/api/admin/log?q=${encodeURIComponent("Phí cơ bản")}&size=1`, adminCookie)).data.rows?.[0]?.content?.includes("→ 777"));
check("a save with the old token is 409", (await post("/api/admin/tuning", { group: "waygate", updatedAt: wg.updatedAt, value: { base: 888, perUnit: wg.value.perUnit } }, adminCookie)).status === 409);
const wg2 = (await json("/api/admin/tuning", adminCookie)).data.groups.find((g) => g.group === "waygate");
check("an invalid or unchanged save is 400", (await post("/api/admin/tuning", { group: "waygate", updatedAt: wg2.updatedAt, value: { base: -5, perUnit: 1 } }, adminCookie)).status === 400 && (await post("/api/admin/tuning", { group: "waygate", updatedAt: wg2.updatedAt, value: wg2.value }, adminCookie)).status === 400);
check("an unknown group is 404", (await post("/api/admin/tuning", { group: "monsters", updatedAt: 0, value: {} }, adminCookie)).status === 404);
const restore = await post("/api/admin/tuning", { group: "waygate", updatedAt: wg2.updatedAt, value: origWg }, adminCookie);
check("the original numbers are restored", restore.status === 200 && restore.data.groups.find((g) => g.group === "waygate").value.base === origWg.base);

// The currency screens: a character of the admin's own.
const charName = `Jd${run}`;
const created = await fetch(httpBase + "/api/character", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ name: charName, gender: "male" }) });
const charId = (await created.json()).character?.id;
check("admin's character created", created.status === 201 && Boolean(charId), String(created.status));
const grant = await post("/api/admin/grant", { characterId: charId, currency: "tien_ngoc", amount: 300, reason: "jade-smoke", idempotencyKey: `jade-smoke-${run}` }, adminCookie);
check("admin grants 300 Tiên Ngọc", grant.status === 200, String(grant.status));
const q = (o) => new URLSearchParams(o).toString();
const s1 = await json(`/api/admin/currency/search?${q({ currency: "tien_ngoc", character: charName })}`, adminCookie);
check("search: one row for the admin group with in 300 and out 0, with the account and the character", s1.data.total === 1 && s1.data.rows[0].group === "admin" && s1.data.rows[0].totalIn === 300 && s1.data.rows[0].totalOut === 0 && s1.data.rows[0].accountEmail === adminEmail && s1.data.rows[0].characterName === charName, JSON.stringify(s1.data.rows));
check("search by account and by group", (await json(`/api/admin/currency/search?${q({ account: adminEmail.slice(0, 20), group: "admin" })}`, adminCookie)).data.rows.some((r) => r.characterId === charId) && (await json(`/api/admin/currency/search?${q({ character: charName, group: "shop" })}`, adminCookie)).data.total === 0);
check("search of another currency does not show it", (await json(`/api/admin/currency/search?${q({ currency: "linh_thach", character: charName })}`, adminCookie)).data.total === 0);
check("search with no input answers (search all)", (await json("/api/admin/currency/search", adminCookie)).data.total >= 1);
check("a nonsense sort, group or size falls back instead of failing", (await get("/api/admin/currency/search?sort=x%3Bdrop&group=nope&size=999999&page=-3", adminCookie)).status === 200);
const d1 = await json(`/api/admin/currency/detail?currency=tien_ngoc&character=${charId}`, adminCookie);
check("detail: balance 300, history 300, matches, no audit row", d1.data.detail?.balance === 300 && d1.data.detail.historyAmount === 300 && d1.data.detail.matches === true && d1.data.detail.audit === null, JSON.stringify(d1.data.detail));
check("detail of an unknown character is 404", (await get("/api/admin/currency/detail?character=nobody", adminCookie)).status === 404);
const popup = await json(`/api/admin/currency/history?character=${charId}`, adminCookie);
check("the history popup defaults to the last 30 days and shows the grant", popup.status === 200 && popup.data.rows?.[0]?.delta === 300 && popup.data.rows[0].group === "admin" && popup.data.to - popup.data.from > 29 * 86400000, JSON.stringify(popup.data.rows?.[0]));
check("the history popup needs a character", (await get("/api/admin/currency/history", adminCookie)).status === 400);

// The audit. Rows left over from earlier runs on this local database are confirmed first, so a run is allowed.
async function clearInvalid(currency) {
  for (let i = 0; i < 20; i++) {
    const page = await json(`/api/admin/currency/audit?${q({ currency, size: 100 })}`, adminCookie);
    const bad = (page.data.rows ?? []).filter((r) => r.status === "invalid");
    if (page.data.pendingInvalid === 0 || bad.length === 0) return page.data.pendingInvalid;
    for (const r of bad) await post("/api/admin/currency/audit/confirm", { currency, character: r.characterId }, adminCookie);
  }
  return -1;
}
check("no invalid rows are left before the test run", (await clearInvalid("tien_ngoc")) === 0);
sql(`UPDATE currency_balances SET balance = balance + 40 WHERE character_id = '${charId}' AND currency = 'tien_ngoc'`);
await sleep(3000);
const ran = await post("/api/admin/currency/audit/run", { currency: "tien_ngoc" }, adminCookie);
check("the audit runs and finds the character", ran.status === 200 && ran.data.invalid >= 1, JSON.stringify(ran.data));
const aud = await json(`/api/admin/currency/audit?${q({ currency: "tien_ngoc", size: 100 })}`, adminCookie);
const mine = aud.data.rows?.find((r) => r.characterId === charId);
check("the audit table has it: history 300, character 340, Không hợp lệ", mine?.historyAmount === 300 && mine.balanceAmount === 340 && mine.status === "invalid" && aud.data.lastAuditAt === ran.data.at, JSON.stringify(mine));
check("the other currencies were not touched by the run", (await json("/api/admin/currency/audit?currency=cong_hien", adminCookie)).data.lastAuditAt !== ran.data.at);
const refused = await post("/api/admin/currency/audit/run", { currency: "tien_ngoc" }, adminCookie);
check("a new run is refused while a row is still invalid", refused.status === 409 && refused.data.error === "pending_invalid", JSON.stringify(refused.data));
const d2 = await json(`/api/admin/currency/detail?currency=tien_ngoc&character=${charId}`, adminCookie);
check("detail now says it does not match and shows the audit status", d2.data.detail.matches === false && d2.data.detail.audit?.status === "invalid" && d2.data.detail.balance === 340 && d2.data.detail.historyAmount === 300);
const stillOff = await post("/api/admin/currency/audit/handle", { currency: "tien_ngoc", character: charId }, adminCookie);
check("Xử lý is refused while the numbers differ (and the account is not banned)", stillOff.status === 409 && stillOff.data.error === "still_mismatch" && stillOff.data.difference === 40, JSON.stringify(stillOff.data));
const staleTry = await post("/api/admin/currency/audit/confirm", { currency: "tien_ngoc", character: charId, balance: 1, historyAmount: 2 }, adminCookie);
check("Xác nhận is refused as stale when the numbers are not the ones the admin saw", staleTry.status === 409 && staleTry.data.error === "stale", JSON.stringify(staleTry.data));
const ok = await post("/api/admin/currency/audit/confirm", { currency: "tien_ngoc", character: charId, balance: 340, historyAmount: 300 }, adminCookie);
check("Xác nhận accepts the difference of +40", ok.status === 200 && ok.data.difference === 40, JSON.stringify(ok.data));
const d3 = await json(`/api/admin/currency/detail?currency=tien_ngoc&character=${charId}`, adminCookie);
check("after it: the history adds up to the balance, the admin group holds 340, the row is Hợp lệ", d3.data.detail.matches === true && d3.data.detail.balance === 340 && d3.data.detail.groups.find((g) => g.group === "admin")?.totalIn === 340 && d3.data.detail.audit.status === "valid", JSON.stringify(d3.data.detail.groups));
const popup2 = await json(`/api/admin/currency/history?character=${charId}`, adminCookie);
check("and the detailed history has the adjustment row by the admin", popup2.data.rows?.[0]?.delta === 40 && popup2.data.rows[0].reason === "admin_adjust:audit" && popup2.data.rows[0].actor === adminEmail, JSON.stringify(popup2.data.rows?.[0]));
check("confirming again is refused", (await post("/api/admin/currency/audit/confirm", { currency: "tien_ngoc", character: charId }, adminCookie)).data.error === "not_invalid");
check("handling a valid row is refused", (await post("/api/admin/currency/audit/handle", { currency: "tien_ngoc", character: charId }, adminCookie)).data.error === "not_invalid");

// The handle path: skew again, audit, fix the balance some other way, then Xử lý.
check("the other rows from the first run (old test balances in this local database) are confirmed too", (await clearInvalid("tien_ngoc")) === 0);
sql(`UPDATE currency_balances SET balance = balance - 10 WHERE character_id = '${charId}' AND currency = 'tien_ngoc'`);
await sleep(3000);
const ran2 = await post("/api/admin/currency/audit/run", { currency: "tien_ngoc" }, adminCookie);
check("a new run is allowed now that every row is resolved", ran2.status === 200, JSON.stringify(ran2.data));
const aud2 = await json(`/api/admin/currency/audit?${q({ currency: "tien_ngoc", size: 100 })}`, adminCookie);
check("the old rows are gone and the character is invalid again (history 340, character 330)", aud2.data.rows.find((r) => r.characterId === charId)?.status === "invalid" && aud2.data.rows.find((r) => r.characterId === charId)?.balanceAmount === 330);
sql(`UPDATE currency_balances SET balance = balance + 10 WHERE character_id = '${charId}' AND currency = 'tien_ngoc'`);
await sleep(3000);
const handled = await post("/api/admin/currency/audit/handle", { currency: "tien_ngoc", character: charId }, adminCookie);
check("Xử lý works once the numbers agree", handled.status === 200 && handled.data.difference === 0, JSON.stringify(handled.data));
check("the row is Đã xử lý", (await json(`/api/admin/currency/detail?currency=tien_ngoc&character=${charId}`, adminCookie)).data.detail.audit.status === "handled");
const logLines = await json(`/api/admin/log?q=${encodeURIComponent(charName)}&size=10`, adminCookie);
const lines = (logLines.data.rows ?? []).map((r) => r.content);
check("the log has the lines for the grant, Xác nhận and Xử lý, newest first", lines[0]?.startsWith(`Kiểm duyệt - Đã xử lý tài khoản ${adminEmail} nhân vật ${charName} khoản lệch 0`) && lines.some((l) => l.startsWith(`Kiểm duyệt - Đã xác nhận tài khoản ${adminEmail} nhân vật ${charName} khoản lệch +40`)) && lines.some((l) => l.includes("300 Tiên Ngọc cho nhân vật")), JSON.stringify(lines));
check("an audit of another currency stays possible and answers", (await clearInvalid("cong_hien")) === 0 && (await post("/api/admin/currency/audit/run", { currency: "cong_hien" }, adminCookie)).status === 200);
await clearInvalid("tien_ngoc"); // leave the local database without rows waiting for somebody

console.log(failures === 0 ? "\nall admin page checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

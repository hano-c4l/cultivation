// Local-only economy smoke test: admin grant auth, idempotency, overdraft. Creates real accounts, so it refuses
// any host that is not localhost. Needs `npm run preview` (or `wrangler dev`) running and DISABLE_RATE_LIMIT=1 in .dev.vars.
// Usage: node tools/economy-smoke.mjs [http://localhost:8787]
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2] ?? "http://localhost:8787";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error("economy-smoke only runs against localhost");
  process.exit(2);
}

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function api(path, { cookie, method = "GET", body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null, setCookie: res.headers.get("set-cookie") };
}

async function newPlayer(tag) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const email = `eco-${tag}-${stamp}@example.test`;
  const reg = await api("/api/register", { method: "POST", body: { email, password: "test-password-123" } });
  const cookie = reg.setCookie.split(";")[0];
  const name = `E${tag}${stamp}`.slice(0, 16);
  await api("/api/character", { cookie, method: "POST", body: { name } });
  return { email, cookie, name };
}

const admin = await newPlayer("a");
const player = await newPlayer("p");
execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", `"UPDATE accounts SET role='admin' WHERE email='${admin.email}'"`], {
  stdio: "ignore",
  shell: true,
});

const grant = (who, body) => api("/api/admin/grant", { cookie: who?.cookie, method: "POST", body });
const key = () => crypto.randomUUID();
const found = await api(`/api/admin/lookup?q=${encodeURIComponent(player.email)}`, { cookie: admin.cookie });
const charId0 = found.data?.accounts?.[0]?.characters?.[0]?.id;
check("lookup by email finds the account and its character", found.status === 200 && found.data.accounts.length === 1 && !!charId0, JSON.stringify(found.data));
const byName = await api(`/api/admin/lookup?q=${encodeURIComponent(player.name)}`, { cookie: admin.cookie });
check("lookup by character name finds the same character", byName.data?.accounts?.[0]?.characters?.[0]?.id === charId0);
check("lookup treats % literally (no match-all)", (await api("/api/admin/lookup?q=%25%25", { cookie: admin.cookie })).data?.accounts?.length === 0);
check("lookup requires admin", (await api(`/api/admin/lookup?q=${player.name}`, { cookie: player.cookie })).status === 403);
const g = { characterId: charId0, currency: "linh_thach", reason: "smoke" };

check("anonymous grant is 401", (await grant(null, { ...g, amount: 5, idempotencyKey: key() })).status === 401);
check("non-admin grant is 403", (await grant(player, { ...g, amount: 5, idempotencyKey: key() })).status === 403);
check("non-admin supply is 403", (await api("/api/admin/supply", { cookie: player.cookie })).status === 403);

const k1 = key();
const first = await grant(admin, { ...g, amount: 100, idempotencyKey: k1 });
check("admin grant +100 applies", first.status === 200 && first.data.balance === 100, JSON.stringify(first.data));
const dup = await grant(admin, { ...g, amount: 100, idempotencyKey: k1 });
check("same key again is 409 and changes nothing", dup.status === 409 && dup.data.error === "duplicate_request");
const over = await grant(admin, { ...g, amount: -150, idempotencyKey: key() });
check("overdraft is 409 insufficient", over.status === 409 && over.data.error === "insufficient_balance");
const spend = await grant(admin, { ...g, amount: -40, idempotencyKey: key() });
check("debit within balance applies (balance 60)", spend.status === 200 && spend.data.balance === 60, JSON.stringify(spend.data));
check("unknown character is 404", (await grant(admin, { ...g, characterId: "khong-ton-tai", amount: 1, idempotencyKey: key() })).status === 404);
check("zero amount is 400", (await grant(admin, { ...g, amount: 0, idempotencyKey: key() })).status === 400);
check("bad currency is 400", (await grant(admin, { ...g, currency: "vang", amount: 1, idempotencyKey: key() })).status === 400);

const view = await api(`/api/admin/currency/detail?currency=linh_thach&character=${charId0}`, { cookie: admin.cookie });
check(
  "the detail shows the balance, the admin group of the history (in 100, out 40) and that they match",
  view.status === 200 && view.data.detail.balance === 60 && view.data.detail.historyAmount === 60 && view.data.detail.matches === true &&
    view.data.detail.groups.length === 1 && view.data.detail.groups[0].group === "admin" && view.data.detail.groups[0].totalIn === 100 && view.data.detail.groups[0].totalOut === 40,
  JSON.stringify(view.data),
);

const supply = await api("/api/admin/supply", { cookie: admin.cookie });
check("supply lists linh_thach", supply.status === 200 && supply.data.supply.some((s) => s.currency === "linh_thach" && s.total >= 60));

// The ledger itself, not just the API answers: read it back from the local D1.
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const charId = sql(`SELECT id FROM characters WHERE name='${player.name}'`)[0].id;
const adminId = sql(`SELECT id FROM accounts WHERE email='${admin.email}'`)[0].id;
const rows = sql(`SELECT delta, reason, actor FROM linh_thach_ledger WHERE character_id='${charId}' ORDER BY id`);
check("the history has exactly 2 rows (duplicate and overdraft left nothing; both are admin changes, so both are traced)", rows.length === 2, `${rows.length}`);
check("first history row is the +100 admin grant with the admin as actor",
  rows[0]?.delta === 100 && rows[0]?.actor === adminId && rows[0]?.reason === "admin_grant:smoke", JSON.stringify(rows[0]));
check("the grant's key is remembered (it expires after a week)", sql(`SELECT expires_at FROM currency_dedupe WHERE key = 'admin:${k1}'`)[0]?.expires_at > Date.now());
const sums = sql(`SELECT (SELECT SUM(total_in) - SUM(total_out) FROM linh_thach_totals WHERE character_id='${charId}') AS s, (SELECT balance FROM currency_balances WHERE character_id='${charId}' AND currency='linh_thach') AS b`)[0];
check("the totals add up to the balance", sums.s === sums.b && sums.b === 60, JSON.stringify(sums));
await sleep(3000); // a request straight after wrangler d1 execute can be reset
check("the audit run is for admins only", (await api("/api/admin/currency/audit/run", { cookie: player.cookie, method: "POST", body: { currency: "linh_thach" } })).status === 403);

console.log(failures === 0 ? "ECONOMY SMOKE PASSED" : `ECONOMY SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

// Local-only economy smoke test: admin grant auth, idempotency, overdraft. Creates real accounts, so it refuses
// any host that is not localhost. Needs `npm run preview` (or `wrangler dev`) running and DISABLE_RATE_LIMIT=1 in .dev.vars.
// Usage: node tools/economy-smoke.mjs [http://localhost:8787]
import { execFileSync } from "node:child_process";

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
const g = { characterName: player.name, currency: "linh_thach", reason: "smoke" };

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
check("unknown character is 404", (await grant(admin, { ...g, characterName: "Khong-Ton-Tai", amount: 1, idempotencyKey: key() })).status === 404);
check("zero amount is 400", (await grant(admin, { ...g, amount: 0, idempotencyKey: key() })).status === 400);
check("bad currency is 400", (await grant(admin, { ...g, currency: "vang", amount: 1, idempotencyKey: key() })).status === 400);

const supply = await api("/api/admin/supply", { cookie: admin.cookie });
check("supply lists linh_thach", supply.status === 200 && supply.data.supply.some((s) => s.currency === "linh_thach" && s.total >= 60));

// The ledger itself, not just the API answers: read it back from the local D1.
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const charId = sql(`SELECT id FROM characters WHERE name='${player.name}'`)[0].id;
const adminId = sql(`SELECT id FROM accounts WHERE email='${admin.email}'`)[0].id;
const rows = sql(`SELECT delta, reason, actor, idempotency_key FROM currency_ledger WHERE character_id='${charId}' ORDER BY id`);
check("ledger has exactly 2 rows (duplicate and overdraft left nothing)", rows.length === 2, `${rows.length}`);
check("first ledger row is the +100 admin grant with the admin as actor",
  rows[0]?.delta === 100 && rows[0]?.actor === adminId && rows[0]?.idempotency_key === `admin:${k1}` && rows[0]?.reason === "admin_grant:smoke", JSON.stringify(rows[0]));
const sums = sql(`SELECT (SELECT SUM(delta) FROM currency_ledger WHERE character_id='${charId}') AS s, (SELECT balance FROM currency_balances WHERE character_id='${charId}' AND currency='linh_thach') AS b`)[0];
check("SUM(delta) equals the balance", sums.s === sums.b && sums.b === 60, JSON.stringify(sums));

console.log(failures === 0 ? "ECONOMY SMOKE PASSED" : `ECONOMY SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

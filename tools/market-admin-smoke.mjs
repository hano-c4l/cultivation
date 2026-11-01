// Local test of the admin market screen API (phase 5 leftovers): a player is refused, an admin reads the listings, sales and trade log, and taking down an unknown listing says "gone".
// Usage: node tools/market-admin-smoke.mjs [http://localhost:8787]. Local only; needs DISABLE_RATE_LIMIT=1 in .dev.vars. It makes an admin through `wrangler d1 execute --local`.
import { execFileSync } from "node:child_process";

const httpBase = (process.argv[2] ?? "http://localhost:8787").replace(/^ws/, "http");
const host = new URL(httpBase).host;
if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1"))) {
  console.error(`refusing to run against ${host}: local only`);
  process.exit(1);
}
const run = Date.now().toString(36);
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};
async function call(method, path, body, cookie) {
  const res = await fetch(httpBase + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

const player = await call("POST", "/api/register", { email: `mk-p-${run}@example.test`, password: "correct-horse-battery" });
check("a player cannot read the market screen", (await call("GET", "/api/admin/market", null, player.cookie)).status === 403);
check("a player cannot take a listing down", (await call("POST", "/api/admin/market/takedown", { id: "x" }, player.cookie)).status === 403);

const email = `mk-a-${run}@example.test`;
await call("POST", "/api/register", { email, password: "correct-horse-battery" });
execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", `"UPDATE accounts SET role='admin' WHERE email='${email}'"`], { stdio: "ignore", shell: true });
const login = await call("POST", "/api/login", { email, password: "correct-horse-battery" });
const cookie = login.cookie;
for (const [view, key] of [["listings", "listings"], ["sales", "sales"], ["trades", "trades"]]) {
  const r = await call("GET", `/api/admin/market?view=${view}`, null, cookie);
  check(`the admin reads the ${view}`, r.status === 200 && Array.isArray(r.data[key]), `${r.status}`);
}
const all = await call("GET", "/api/admin/market?view=listings&all=1&q=linh", null, cookie);
check("the listings can be searched and widened to the closed ones", all.status === 200 && Array.isArray(all.data.listings));
const gone = await call("POST", "/api/admin/market/takedown", { id: "no-such-listing" }, cookie);
check("taking down an unknown listing says gone", gone.status === 409 && gone.data.error === "gone", JSON.stringify(gone.data));
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);

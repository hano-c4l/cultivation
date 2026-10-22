// Local test of the mutant elements: with the `mutant_root_chance` setting at 1000 (per thousand; set it first with
//   npx wrangler d1 execute DB --local --command "INSERT INTO game_settings (key,value,updated_at,updated_by) VALUES ('mutant_root_chance','1000',0,'test') ON CONFLICT(key) DO UPDATE SET value='1000'"
// ) every single-element (đơn linh căn) character is a mutant one, characters with more elements never are, and a mutant
// character can be created (the spiritual_root CHECK only allows the plain five), logs in and keeps its element.
// Usage: node tools/mutant-smoke.mjs [ws://localhost:8787]   (local only; needs DISABLE_RATE_LIMIT=1)
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
const MUTANT = ["loi", "bang", "phong"];
let singles = 0, mutants = 0, multis = 0, multiMutants = 0, firstMutant = null;
for (let i = 0; i < 40 && !(firstMutant && multis >= 3); i++) {
  const reg = await post("/api/register", { email: `mu-${run}-${i}@example.test`, password: "correct-horse-battery" });
  const created = await post("/api/character", { name: `Biến ${run.slice(-3)}${i}`, gender: "male" }, reg.cookie);
  if (created.status !== 200 && created.status !== 201) { check("a character can be created", false, `status ${created.status}`); continue; }
  const roots = created.data.character.roots;
  if (roots.length === 1) { singles++; if (MUTANT.includes(roots[0])) { mutants++; firstMutant ??= { cookie: reg.cookie, roots, sheet: created.data.character }; } }
  else { multis++; if (roots.some((r) => MUTANT.includes(r))) multiMutants++; }
}
check("a single-element character is a mutant one at chance 1000", singles > 0 && mutants === singles, `${mutants}/${singles}`);
check("characters with more elements never get a mutant element", multiMutants === 0, `${multis} checked`);
if (firstMutant) {
  check("the sheet keeps the mutant element as the main one", MUTANT.includes(firstMutant.sheet.spiritualRoot) && firstMutant.sheet.roots[0] === firstMutant.sheet.spiritualRoot, firstMutant.sheet.spiritualRoot);
  const ws = new WebSocket(`${base}/ws?ch=7`, { headers: { Cookie: firstMutant.cookie } });
  const welcome = await new Promise((res) => {
    ws.addEventListener("message", (ev) => { if (ev.data !== "pong") { const m = JSON.parse(ev.data); if (m.t === "welcome") res(m); } });
    setTimeout(() => res(null), 6000);
  });
  check("the mutant character joins a room and keeps its element", welcome && welcome.character.roots[0] === firstMutant.roots[0], welcome?.character.roots.join(","));
  ws.close();
}
console.log(failures === 0 ? "mutant smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

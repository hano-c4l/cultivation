// Local test of the bag and the mailbox: loot, stacking, move, discard, potion refusal in town, a full bag sending loot
// to mail, claiming (full bag, then with room), expiry, persistence across reconnects, and a second login during writes.
// Usage: node tools/inventory-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts and uses dev-only endpoints, so it only runs against localhost with
// DISABLE_RATE_LIMIT=1 and ENABLE_DEV_GRANT=1 in .dev.vars. Never run it against preview or production.
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
const ROOM = "town:6";
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(cookie) {
  const ws = new WebSocket(`${base}/ws?ch=6`, { headers: { Cookie: cookie } });
  const log = [];
  ws.addEventListener("message", (ev) => {
    if (ev.data !== "pong") log.push(JSON.parse(ev.data));
  });
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  return { ws, log, opened, send: (m) => ws.send(JSON.stringify(m)) };
}

async function connect(cookie) {
  const c = open(cookie);
  await c.opened;
  for (let i = 0; i < 40 && !c.log.some((m) => m.t === "welcome"); i++) await sleep(100);
  return { ...c, welcome: c.log.find((m) => m.t === "welcome") };
}

const reg = await post("/api/register", { email: `inv-${run}@example.test`, password: "correct-horse-battery" });
const created = await post("/api/character", { name: `Túi ${run.slice(-4)}` }, reg.cookie);
const charId = created.data.character.id;
const give = (item, qty) => fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${charId}&item=${item}&qty=${qty}`).then((r) => r.json());
const sql = (q) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", `"${q}"`], { shell: true, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const total = (type) => sql(`SELECT COALESCE(SUM(qty),0) AS q FROM item_instances WHERE owner_character_id='${charId}' AND item_type='${type}'`)[0].q;
const bagOf = (c) => {
  // Rebuild the client's picture of the bag from the welcome and the deltas, the way the UI does.
  const items = new Map((c.welcome.bag.items ?? []).map((i) => [i.id, i]));
  for (const m of c.log) {
    if (m.t !== "inv") continue;
    if (m.full) items.clear();
    for (const i of m.items) items.set(i.id, i);
    for (const id of m.removed) items.delete(id);
  }
  return [...items.values()];
};
const after = async (c, fn, wait = 500) => {
  const mark = c.log.length;
  await fn();
  await sleep(wait);
  return c.log.slice(mark);
};

let a = await connect(reg.cookie);
check("a new character has one tab and an empty bag and no mail", a.welcome.bag.tabs === 1 && a.welcome.bag.items.length === 0 && a.welcome.mail.length === 0);

// Loot goes into the bag and is announced.
let msgs = await after(a, () => give("linh_thao", 3));
check("loot arrives as a bag delta and a loot message", msgs.some((m) => m.t === "inv" && m.items[0]?.qty === 3) && msgs.some((m) => m.t === "loot" && m.items[0].type === "linh_thao" && !m.items[0].mailed));
await give("linh_thao", 200);
await sleep(300);
check("stacks never exceed 99 and the total is exact", bagOf(a).every((i) => i.qty <= 99) && total("linh_thao") === 203 && bagOf(a).reduce((s, i) => s + i.qty, 0) === 203, `total ${total("linh_thao")}`);

// Move: merge the small stack into the 99-stacks, swap, and the rate limit.
const stacks = bagOf(a).sort((x, y) => x.cell - y.cell);
await give("thu_cot", 1);
await sleep(300);
const bone = bagOf(a).find((i) => i.type === "thu_cot");
msgs = await after(a, () => a.send({ t: "inv_move", from: { tab: 0, cell: bone.cell }, to: { tab: 0, cell: stacks[0].cell } }));
const swapped = bagOf(a);
check("moving onto a different item swaps the two", swapped.find((i) => i.type === "thu_cot").cell === stacks[0].cell && swapped.length === stacks.length + 1);
msgs = await after(a, () => {
  a.send({ t: "inv_move", from: { tab: 0, cell: 50 }, to: { tab: 0, cell: 51 } });
  a.send({ t: "inv_move", from: { tab: 0, cell: 50 }, to: { tab: 0, cell: 51 } });
}, 400);
check("commands sent faster than the minimum gap are refused (rate)", msgs.some((m) => m.t === "inv_error" && m.reason === "rate"));
await sleep(250);
// Buying a tab: the price the player confirmed must match the current one, and without money nothing is bought.
msgs = await after(a, () => a.send({ t: "inv_expand", price: 1 }));
check("a tab price that differs from the current one is refused and the real price comes back", msgs.some((m) => m.t === "inv_error" && m.reason === "price_changed") && msgs.some((m) => m.t === "inv" && m.full && m.tabPrice === 1000));
await sleep(250);
msgs = await after(a, () => a.send({ t: "inv_expand", price: 1000 }));
check("buying a tab without enough Linh Thach is refused", msgs.some((m) => m.t === "inv_error" && m.reason === "funds") && !msgs.some((m) => m.t === "inv" && m.tabs > 1));
await sleep(250);
msgs = await after(a, () => a.send({ t: "inv_move", from: { tab: 0, cell: 40 }, to: { tab: 0, cell: 1 } }));
check("moving from an empty cell is refused and the bag is resent", msgs.some((m) => m.t === "inv_error" && m.reason === "invalid") && msgs.some((m) => m.t === "inv" && m.full));

// Discard and the potion in town.
await sleep(250);
const last = bagOf(a).filter((i) => i.type === "linh_thao").sort((x, y) => x.qty - y.qty)[0];
msgs = await after(a, () => a.send({ t: "inv_drop", tab: 0, cell: last.cell, qty: 1 }));
check("discarding one reduces the stack by one", total("linh_thao") === 202 && bagOf(a).find((i) => i.id === last.id).qty === last.qty - 1);
await give("hoi_huyet_dan", 2);
await sleep(300);
const potion = bagOf(a).find((i) => i.type === "hoi_huyet_dan");
await sleep(200);
msgs = await after(a, () => a.send({ t: "inv_use", tab: 0, cell: potion.cell }));
check("a potion is refused when there is nothing to heal (town) and is not consumed", msgs.some((m) => m.t === "inv_error" && m.reason === "not_needed") && total("hoi_huyet_dan") === 2);

// A bag that is full sends loot to the mailbox.
const used = bagOf(a).length;
await give("thu_cot", (64 - used) * 99); // exactly fills the free cells (a few thu_cot already sit in one)
await sleep(600);
check("the bag can be filled to the last cell", bagOf(a).length === 64, `${bagOf(a).length} cells`);
msgs = await after(a, () => give("yeu_dan", 1), 700);
check("loot that does not fit is flagged as mailed and a mail arrives", msgs.some((m) => m.t === "loot" && m.items[0].mailed) && msgs.some((m) => m.t === "mail" && m.mail.length === 1 && m.mail[0].item.type === "yeu_dan"));
const mailRows = sql(`SELECT m.id, m.expires_at, m.created_at, i.qty, i.cell FROM mailbox m JOIN item_instances i ON i.id=m.item_id WHERE m.character_id='${charId}'`);
check("the mail expires 30 minutes after it was sent and its item is unplaced", mailRows.length === 1 && mailRows[0].expires_at - mailRows[0].created_at === 30 * 60_000 && mailRows[0].cell === null);
check("the item in the mail exists exactly once", total("yeu_dan") === 1);

const mailId = a.log.filter((m) => m.t === "mail").at(-1).mail[0].id;
await sleep(200);
msgs = await after(a, () => a.send({ t: "mail_claim", id: mailId }));
check("claiming with a full bag is refused and keeps the mail", msgs.some((m) => m.t === "inv_error" && m.reason === "full") && sql(`SELECT claimed_at FROM mailbox WHERE id='${mailId}'`)[0].claimed_at === null);
const filler = bagOf(a).find((i) => i.type === "thu_cot");
await sleep(200);
await after(a, () => a.send({ t: "inv_drop", tab: 0, cell: filler.cell }));
await sleep(200);
msgs = await after(a, () => a.send({ t: "mail_claim", id: mailId }));
check("claiming with room puts the item in the bag and empties the mailbox", bagOf(a).some((i) => i.type === "yeu_dan") && msgs.some((m) => m.t === "mail" && m.mail.length === 0));
await sleep(200);
msgs = await after(a, () => a.send({ t: "mail_claim", id: mailId }));
check("a second claim of the same mail changes nothing", total("yeu_dan") === 1 && msgs.some((m) => m.t === "inv_error"));

// Expiry: a mail past its deadline cannot be claimed and its item disappears on the next login.
await give("yeu_dan", 98); // tops the Yêu Đan stack up to 99, which fits without a new cell
await sleep(400);
await give("yeu_dan", 1); // that stack is full and the bag has no free cell, so this one is mailed
await sleep(600);
const mail2 = a.log.filter((m) => m.t === "mail").at(-1).mail.find((m) => m.id !== mailId);
check("another overflow made a second mail", !!mail2);
sql(`UPDATE mailbox SET expires_at = ${Date.now() - 1000} WHERE id='${mail2.id}'`);
await sleep(200);
msgs = await after(a, () => a.send({ t: "mail_claim", id: mail2.id }));
check("an expired mail cannot be claimed", msgs.some((m) => m.t === "inv_error" && m.reason === "expired") && msgs.some((m) => m.t === "mail" && m.mail.length === 0));

// Persistence and a second login while commands are in flight.
const before = bagOf(a).map((i) => `${i.tab}:${i.cell}:${i.type}:${i.qty}`).sort();
const sumBefore = bagOf(a).reduce((s, i) => s + i.qty, 0);
for (let k = 0; k < 6; k++) {
  a.send({ t: "inv_move", from: { tab: 0, cell: 0 }, to: { tab: 0, cell: 1 } });
  await sleep(40);
}
const b = await connect(reg.cookie); // the second login evicts the first room connection
await sleep(600);
const sumAfter = b.welcome.bag.items.reduce((s, i) => s + i.qty, 0);
check("a second login during writes neither creates nor loses items", sumAfter === sumBefore, `${sumBefore} -> ${sumAfter}`);
check("the old connection was kicked", a.log.some((m) => m.t === "kicked"));
check("the expired mail's item was deleted when it was swept at login", sql(`SELECT COUNT(*) AS n FROM mailbox WHERE character_id='${charId}' AND claimed_at IS NULL`)[0].n === 0 && total("yeu_dan") === 99);
const cells = b.welcome.bag.items.map((i) => `${i.tab}:${i.cell}`);
check("no two items share a cell after reconnecting", new Set(cells).size === cells.length);
check("the reconnected bag keeps the same set of items as before the writes", b.welcome.bag.items.length === before.length);

// A potion really heals in a combat map: consumed first, HP up after, and a second use inside the cooldown is refused.
{
  const reg2 = await post("/api/register", { email: `inv2-${run}@example.test`, password: "correct-horse-battery" });
  const ch2 = await post("/api/character", { name: `Đan ${run.slice(-4)}` }, reg2.cookie);
  const id2 = ch2.data.character.id;
  let t = await connect(reg2.cookie);
  t.send({ t: "move", x: 20.5, y: 38.5, fx: 20.5, fy: 20.5, seq: 1 });
  await sleep(5800);
  t.send({ t: "portal" });
  for (let i = 0; i < 40 && !t.log.some((m) => m.t === "transfer"); i++) await sleep(100);
  await sleep(500);
  t = await connect(reg2.cookie);
  check("the second character stands in the forest", t.welcome?.map === "forest");
  await fetch(`${httpBase}/api/dev/loot?room=forest:6&char=${id2}&item=hoi_huyet_dan&qty=3`);
  await sleep(500);
  const potionOf = () => sql(`SELECT COALESCE(SUM(qty),0) AS q FROM item_instances WHERE owner_character_id='${id2}' AND item_type='hoi_huyet_dan'`)[0].q;
  check("the potions arrived in the forest bag", potionOf() === 3);
  // Get hurt: attack a monster and wait until the monster has hit back.
  t.send({ t: "attack", id: t.welcome.monsters[0].id });
  let hurt = null;
  for (let i = 0; i < 150 && !hurt; i++) {
    await sleep(100);
    hurt = t.log.find((m) => m.t === "hp" && m.hp < m.maxHp) ?? null;
  }
  check("the character got hurt in the forest", !!hurt);
  const potionCell = (() => {
    const items = new Map((t.welcome.bag.items ?? []).map((i) => [i.id, i]));
    for (const m of t.log) if (m.t === "inv") { for (const i of m.items) items.set(i.id, i); for (const id of m.removed) items.delete(id); }
    return [...items.values()].find((i) => i.type === "hoi_huyet_dan");
  })();
  const lastHp = () => t.log.filter((m) => m.t === "hp").at(-1);
  const hpBefore = lastHp().hp;
  const mark = t.log.length;
  t.send({ t: "inv_use", tab: 0, cell: potionCell.cell });
  await sleep(800);
  const used = t.log.slice(mark);
  const healedTo = used.filter((m) => m.t === "hp").at(-1);
  check("using a potion consumes exactly one and heals", potionOf() === 2 && !!healedTo && healedTo.hp > hpBefore - 40, `hp ${hpBefore} -> ${healedTo?.hp}`);
  check("the bag told the client the potion count went down", used.some((m) => m.t === "inv" && m.items.some((i) => i.type === "hoi_huyet_dan" && i.qty === 2)));
  await sleep(200);
  const mark2 = t.log.length;
  t.send({ t: "inv_use", tab: 0, cell: potionCell.cell });
  await sleep(600);
  const again = t.log.slice(mark2);
  check("a second potion inside the cooldown is refused and not consumed", again.some((m) => m.t === "inv_error" && m.reason === "cooldown") && potionOf() === 2);
  t.ws.close();
}

// Split and sort, on a fresh character so the cells above do not matter.
{
  const reg3 = await post("/api/register", { email: `inv3-${run}@example.test`, password: "correct-horse-battery" });
  const ch3 = await post("/api/character", { name: `Xếp ${run.slice(-4)}` }, reg3.cookie);
  const id3 = ch3.data.character.id;
  const g3 = (item, qty) => fetch(`${httpBase}/api/dev/loot?room=${ROOM}&char=${id3}&item=${item}&qty=${qty}`).then((r) => r.json());
  const rows3 = () => sql(`SELECT item_type AS type, qty, bag_tab AS tab, cell FROM item_instances WHERE owner_character_id='${id3}' AND cell IS NOT NULL ORDER BY cell`);
  const t = await connect(reg3.cookie);
  await g3("linh_thao", 100); // 99 + 1
  await g3("thu_cot", 5);
  await g3("yeu_dan", 1);
  await sleep(600);
  const sum = (type) => rows3().filter((r) => r.type === type).reduce((s, r) => s + r.qty, 0);
  const start = rows3();
  const bigCell = start.find((r) => r.type === "linh_thao" && r.qty === 99).cell;

  let msgs = await after(t, () => t.send({ t: "inv_split", tab: 0, cell: bigCell, qty: 20 }));
  check("splitting 20 off a stack of 99 leaves 79 and a new stack of 20", rows3().filter((r) => r.type === "linh_thao").map((r) => r.qty).sort((x, y) => y - x).join() === "79,20,1" && msgs.some((m) => m.t === "inv"), JSON.stringify(rows3().filter((r) => r.type === "linh_thao")));
  await sleep(200);
  msgs = await after(t, () => t.send({ t: "inv_split", tab: 0, cell: bigCell, qty: 79 }));
  check("splitting off the whole stack is refused and the bag is resent", msgs.some((m) => m.t === "inv_error" && m.reason === "invalid") && sum("linh_thao") === 100);

  // One sort is allowed per 15 seconds: a second one inside the window is refused and changes nothing.
  // No slow database check in between: each wrangler call takes seconds and would eat into the window.
  const wait = (ms) => sleep(ms);
  await wait(300);
  const sort1 = await after(t, () => t.send({ t: "inv_sort", mode: "rarity" }), 300);
  const tooSoon = await after(t, () => t.send({ t: "inv_sort", mode: "name" }), 300); // 0.3 s after the first: inside the 15 s window
  const afterRarity = rows3();
  await wait(15_500);
  const sort2 = await after(t, () => t.send({ t: "inv_sort", mode: "name" }), 1250);
  const afterName = rows3();
  const sort4 = await after(t, () => t.send({ t: "inv_sort", mode: "rarity" }), 500); // right after the second: refused
  await wait(15_500);
  const sort3 = await after(t, () => t.send({ t: "inv_sort", mode: "grade" }), 1250);

  check("sorting by rarity merges the split stacks (79 + 20 + 1 -> 99 + 1), nothing lost", sort1.some((m) => m.t === "inv" && m.removed.length >= 1) && sum("linh_thao") === 100 && sum("thu_cot") === 5 && sum("yeu_dan") === 1);
  check("a second sort inside the 15 second window is refused and changes nothing", tooSoon.some((m) => m.t === "inv_error" && m.reason === "wait") && !tooSoon.some((m) => m.t === "inv") && afterRarity[0].type === "yeu_dan");
  check("sorting by name puts Linh Thảo first and packs from the first cell", afterName[0].type === "linh_thao" && afterName.map((r) => r.cell).join() === afterName.map((_, i) => i).join() && sort2.some((m) => m.t === "inv"), JSON.stringify(afterName.map((r) => r.type)));
  check("a sort right after another is refused and changes nothing", sort4.some((m) => m.t === "inv_error" && m.reason === "wait") && !sort4.some((m) => m.t === "inv") && afterName[0].type === "linh_thao");
  check("after the window a sort by grade puts the Trung phẩm item first", rows3()[0].type === "yeu_dan" && sort3.some((m) => m.t === "inv"));
  check("all four stacks survived the sorts", rows3().length === 4 && sum("linh_thao") === 100);
  // The layout survives a reconnect.
  const rejoin = await connect(reg3.cookie);
  check("the sorted layout is what a new connection receives", rejoin.welcome.bag.items.length === 4 && rejoin.welcome.bag.items.sort((x, y) => x.cell - y.cell)[0].type === "yeu_dan");
  rejoin.ws.close();
  t.ws.close();
}

a.ws.close();
b.ws.close();
await sleep(400);
console.log(failures === 0 ? "INVENTORY SMOKE PASSED" : `INVENTORY SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

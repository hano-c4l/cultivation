// Local test of the chat channels: world chat across rooms, map chat staying in its room, whispers across rooms,
// the offline error, the world rate limit and the duplicate chat socket.
// Usage: node tools/chat-smoke.mjs [ws://localhost:8787]
// Registers throwaway accounts, so it only runs against localhost with DISABLE_RATE_LIMIT=1 in .dev.vars.
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
  const res = await fetch(httpBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, cookie: res.headers.getSetCookie?.()[0]?.split(";")[0], data: await res.json().catch(() => ({})) };
}

function open(url, cookie) {
  const ws = new WebSocket(url, { headers: { Cookie: cookie } });
  const log = [];
  let closeCode = null;
  ws.addEventListener("message", (ev) => {
    if (ev.data === "pong") return;
    log.push(JSON.parse(ev.data));
  });
  ws.addEventListener("close", (ev) => (closeCode = ev.code));
  const opened = new Promise((res) => {
    ws.addEventListener("open", () => res(true));
    ws.addEventListener("error", () => res(false));
  });
  return { ws, log, opened, closeCode: () => closeCode, send: (m) => ws.send(JSON.stringify(m)) };
}

/** Registers a player and opens the game socket on `ch` plus the chat socket. */
async function player(tag, ch) {
  const reg = await post("/api/register", { email: `chat-${run}-${tag}@example.test`, password: "correct-horse-battery" });
  const name = `Đạo Hữu ${tag}${run.slice(-3)}`; // diacritics also exercise the encoded name header
  await post("/api/character", { name }, reg.cookie);
  const game = open(`${base}/ws?ch=${ch}`, reg.cookie);
  await game.opened;
  const chat = open(`${base}/ws/chat`, reg.cookie);
  await chat.opened;
  await sleep(300);
  return { name, cookie: reg.cookie, game, chat };
}
const lines = (c, channel) => c.log.filter((m) => m.t === "chat" && m.channel === channel);

const a = await player("a", 1);
const b = await player("b", 2); // another channel of the same map: map chat must not reach it
const c = await player("c", 1);

// Map chat: same room only.
a.game.send({ t: "chat", channel: "map", text: "xin chào bản đồ" });
await sleep(500);
check("map chat reaches the sender's room", lines(c.game, "map").some((m) => m.text === "xin chào bản đồ") && lines(a.game, "map").length === 1);
check("map chat does not reach another channel", lines(b.game, "map").length === 0 && lines(b.chat, "map").length === 0);
// A client that sends non-map chat on the game socket is ignored.
a.game.send({ t: "chat", channel: "world", text: "sai ổ cắm" });
await sleep(400);
check("world chat on the game socket is ignored", lines(b.chat, "world").length === 0 && lines(a.game, "world").length === 0);
// Old clients send no channel: it means map chat.
a.game.ws.send(JSON.stringify({ t: "chat", text: "client cũ" }));
await sleep(500);
check("a chat without a channel counts as map chat", lines(c.game, "map").some((m) => m.text === "client cũ"));

// World chat reaches everyone, in every room, over the chat socket.
a.chat.send({ t: "chat", channel: "world", text: "thế giới ơi" });
await sleep(600);
check("world chat reaches the sender and other channels", [a, b, c].every((p) => lines(p.chat, "world").some((m) => m.text === "thế giới ơi" && m.name === a.name)));

// World rate limit: min gap 5 s.
a.chat.send({ t: "chat", channel: "world", text: "quá nhanh" });
await sleep(500);
check("a second world line within 5 s is refused", a.chat.log.some((m) => m.t === "chat_error" && m.reason === "rate") && !lines(b.chat, "world").some((m) => m.text === "quá nhanh"));

// Whispers across rooms.
a.chat.send({ t: "chat", channel: "whisper", to: b.name.toUpperCase(), text: "thì thầm" });
await sleep(600);
const got = lines(b.chat, "whisper").find((m) => m.text === "thì thầm");
const echo = lines(a.chat, "whisper").find((m) => m.text === "thì thầm");
check("a whisper reaches the named player in another room (name matched without case)", !!got && got.name === a.name && !got.toName);
check("the sender gets an echo that names the recipient", !!echo && echo.toName === b.name);
check("nobody else sees the whisper", lines(c.chat, "whisper").length === 0 && lines(c.game, "whisper").length === 0);

a.chat.send({ t: "chat", channel: "whisper", to: "Không Có Ai Đâu", text: "ơ" });
await sleep(500);
check("a whisper to an unknown or offline name reports offline", a.chat.log.some((m) => m.t === "chat_error" && m.reason === "offline"));
a.chat.send({ t: "chat", channel: "whisper", to: a.name, text: "tự nói" });
await sleep(500);
check("a whisper to yourself is invalid", a.chat.log.some((m) => m.t === "chat_error" && m.reason === "invalid"));

// A second chat socket for the same character replaces the first (it is closed with 4001).
const again = open(`${base}/ws/chat`, b.cookie);
await again.opened;
await sleep(600);
check("a newer chat socket tells the older one it was replaced", b.chat.log.some((m) => m.t === "kicked" && m.reason === "duplicate-chat"));
c.chat.send({ t: "chat", channel: "whisper", to: b.name, text: "tới socket mới" });
await sleep(500);
check("whispers go to the newer socket only", again.log.some((m) => m.t === "chat" && m.text === "tới socket mới"));

// The chat socket needs a session.
const anon = new WebSocket(`${base}/ws/chat`);
const anonOpened = await new Promise((res) => {
  anon.addEventListener("open", () => res(true));
  anon.addEventListener("error", () => res(false));
  anon.addEventListener("close", () => res(false));
});
check("the chat socket refuses clients without a session", anonOpened === false);

for (const p of [a, b, c]) {
  p.game.ws.close();
  p.chat.ws.close();
}
again.ws.close();
await sleep(400);
console.log(failures === 0 ? "CHAT SMOKE PASSED" : `CHAT SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

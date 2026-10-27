// Writes a synthetic sprite atlas + manifest into client/dist/gfx/ so the sprite path (phase 4a) can be seen working in a local browser.
// Run it AFTER `npm run build` (the build empties client/dist) and restart `wrangler dev`. It writes nothing outside client/dist/gfx and nothing is committed.
//   node tools/gfx-fixture.mjs          write the fixture
//   node tools/gfx-fixture.mjs --clean  remove it
// What you should see: "player" sprites (a disc with an arrow showing the way it faces, bobbing while running), the wolf on the forest map, and the
// guard (these two only on the forest: walk town -> forest -> town -> forest and they must be unloaded and loaded again). Two failure cases must stay on the old shapes and log one "gfx: atlas ... not loaded" warning each: "monster.bao_dem" points at an atlas whose
// files do not exist, and "monster.heo_rung" at one whose JSON exists but whose image is missing.
import { deflateSync } from "node:zlib";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "client/dist/gfx");
if (!OUT.startsWith(resolve(root, "client/dist") + "\\") && !OUT.startsWith(resolve(root, "client/dist") + "/")) throw new Error("refusing to write outside client/dist");

if (process.argv.includes("--clean")) {
  rmSync(OUT, { recursive: true, force: true });
  console.log("removed", OUT);
  process.exit(0);
}

const F = 96; // frame box
const DIRS = 8;
// Screen heading of each direction index (see shared/src/gfx.ts DIRECTION_VECTORS): the tile vector (x, y) is (x - y, (x + y) / 2) on screen.
const SCREEN = [[0, 1], [-1, 0.5], [-1, 0], [-1, -0.5], [0, -1], [1, -0.5], [1, 0], [1, 0.5]];
const ANIMS = { idle: { frames: 2, fps: 3, loop: true }, run: { frames: 4, fps: 10, loop: true } };

function makeAtlas(name, hue) {
  const names = [];
  for (const [anim, a] of Object.entries(ANIMS)) for (let d = 0; d < DIRS; d++) for (let i = 0; i < a.frames; i++) names.push([anim, d, i]);
  const cols = 8;
  const rows = Math.ceil(names.length / cols);
  const W = cols * F;
  const H = rows * F;
  const px = new Uint8Array(W * H * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
  };
  const frames = {};
  names.forEach(([anim, d, i], n) => {
    const ox = (n % cols) * F;
    const oy = Math.floor(n / cols) * F;
    const bob = anim === "run" ? Math.round(Math.sin((i / ANIMS.run.frames) * Math.PI * 2) * 5) : anim === "idle" ? i * 2 : 0;
    const cx = ox + 48;
    const cy = oy + 62 - bob;
    const [sr, sg, sb] = hsv(hue + d * 0.02, 0.6, 0.95);
    for (let y = -26; y <= 26; y++) for (let x = -16; x <= 16; x++) if ((x * x) / 256 + (y * y) / 676 <= 1) put(cx + x, cy + y, sr, sg, sb);
    // The arrow: a line from the centre toward the facing direction, with a thick tip.
    const [vx, vy] = SCREEN[d];
    const len = Math.hypot(vx, vy);
    for (let t = 0; t <= 24; t += 0.5) {
      const ax = Math.round(cx + (vx / len) * t);
      const ay = Math.round(cy + (vy / len) * t);
      const w = t > 16 ? 2 : 1;
      for (let dx = -w; dx <= w; dx++) for (let dy = -w; dy <= w; dy++) put(ax + dx, ay + dy, 20, 20, 20);
    }
    // The feet anchor: a red dot where the anchor is (48, 90).
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) put(ox + 48 + dx, oy + 90 + dy, 230, 40, 40);
    frames[`${anim}_${d}_${String(i).padStart(2, "0")}`] = { frame: { x: ox, y: oy, w: F, h: F }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: F, h: F }, sourceSize: { w: F, h: F } };
  });
  writeFileSync(resolve(OUT, `${name}.png`), png(W, H, px));
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify({ frames, meta: { image: `${name}.png`, size: { w: W, h: H }, scale: "1" } }));
}

function hsv(h, s, v) {
  const i = Math.floor((h % 1) * 6);
  const f = (h % 1) * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// A minimal PNG writer (RGBA, no filter), so the fixture needs no image library.
function png(w, h, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "latin1");
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
makeAtlas("fx_player", 0.1);
makeAtlas("fx_wolf", 0.35);
makeAtlas("fx_guard", 0.6);
copyFileSync(resolve(OUT, "fx_wolf.json"), resolve(OUT, "fx_noimg.json")); // frame data without an image

const sprite = (atlas, scale) => ({ atlas, frame: { w: F, h: F }, anchor: { x: 48, y: 90 }, ...(scale ? { scale } : {}), anims: ANIMS });
const manifest = {
  version: Date.now() % 1_000_000,
  atlases: {
    fx_player: { image: "fx_player.png", data: "fx_player.json" },
    fx_wolf: { image: "fx_wolf.png", data: "fx_wolf.json" },
    fx_guard: { image: "fx_guard.png", data: "fx_guard.json" },
    fx_ghost: { image: "fx_ghost.png", data: "fx_ghost.json" }, // declared, but the files do not exist
    fx_noimg: { image: "fx_noimg.png", data: "fx_noimg.json" }, // the JSON exists, the image does not
  },
  sprites: {
    player: sprite("fx_player"),
    "monster.soi_rung": sprite("fx_wolf"),
    guard: sprite("fx_guard"),
    "monster.bao_dem": sprite("fx_ghost"),
    "monster.heo_rung": sprite("fx_noimg"),
  },
  maps: { "*": ["fx_player", "fx_ghost", "fx_noimg"], forest: ["fx_wolf", "fx_guard"] }, // the guard and the wolf atlases load on the forest only: they must go on leaving it and come back on re-entering
};
writeFileSync(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("wrote", OUT, "(player on every map, wolf on forest, guard, and a ghost atlas that does not exist)");

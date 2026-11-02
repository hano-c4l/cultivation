// Copies a finished render (the atlas image, its JSON and the sprite entry from tools/render/run.mjs) into client/public/gfx/ and merges it into manifest.json.
//   node tools/gfx-publish.mjs <render dir> [--maps '*,forest']      (default: the atlas loads on every map)
//   node tools/gfx-publish.mjs <render dir> --demand                  (listed by no map: the client fetches it the first time a sprite of it is needed)
//   node tools/gfx-publish.mjs --remove <atlas name>
// This is the ONLY writer of client/public/gfx (raw frames and sources stay outside the repo). Run `npm test` afterwards: a test checks the manifest.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "client", "public", "gfx");
const manifestPath = join(OUT, "manifest.json");
const args = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = (manifest.version ?? 0) + 1;

if (args[0] === "--remove") {
  const name = args[1];
  const atlas = manifest.atlases[name];
  if (!atlas) throw new Error(`no atlas ${name}`);
  for (const [k, s] of Object.entries(manifest.sprites)) if (s.atlas === name) delete manifest.sprites[k];
  delete manifest.atlases[name];
  for (const m of Object.keys(manifest.maps)) {
    manifest.maps[m] = manifest.maps[m].filter((a) => a !== name);
    if (manifest.maps[m].length === 0) delete manifest.maps[m];
  }
  rmSync(join(OUT, atlas.image), { force: true });
  rmSync(join(OUT, atlas.data), { force: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`removed ${name}; manifest version ${manifest.version}`);
  process.exit(0);
}

const dir = resolve(args[0] ?? "");
const demand = args.includes("--demand");
const maps = demand ? [] : (args.includes("--maps") ? args[args.indexOf("--maps") + 1] : "*").split(",");
if (!existsSync(join(dir, "done.marker")) || !readFileSync(join(dir, "done.marker"), "utf8").startsWith("ok")) throw new Error("not a finished render (no ok marker)");
const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
const sprites = readdirSprites(dir);
mkdirSync(OUT, { recursive: true });
// The image is published as lossless WebP when `sharp` is there (about 45% smaller than the PNG, same pixels); otherwise as the PNG.
let toWebp = null;
try {
  toWebp = (await import("./gfx-webp.mjs")).toWebp;
} catch {
  console.warn("sharp is not installed: publishing PNG images (npm install brings it)");
}
for (const sp of sprites) {
  copyFileSync(join(dir, sp.image), join(OUT, sp.image));
  copyFileSync(join(dir, sp.data), join(OUT, sp.data));
  let image = sp.image;
  if (toWebp && image.endsWith(".png")) {
    image = (await toWebp(image)).name;
    rmSync(join(OUT, sp.image));
  }
  manifest.atlases[sp.atlas] = { image, data: sp.data };
  manifest.sprites[sp.key] = { atlas: sp.atlas, frame: sp.frame, anchor: sp.anchor, ...(sp.head ? { head: sp.head } : {}), ...(sp.headSit ? { headSit: sp.headSit } : {}), anims: sp.anims };
  for (const m of maps) {
    manifest.maps[m] = [...new Set([...(manifest.maps[m] ?? []), sp.atlas])];
  }
  console.log(`published ${sp.key} (${sp.atlas}) ${demand ? "on demand" : "to maps " + maps.join(", ")}`);
}
// A props atlas (tools/render/render_props.py) has no sprite entries: the map layer reads its frames by name (`<style>_<variant>`), so only the atlas is registered (on every map).
for (const f of readdirSync(dir).filter((n) => n.endsWith(".props.json"))) {
  const pr = JSON.parse(readFileSync(join(dir, f), "utf8"));
  copyFileSync(join(dir, pr.image), join(OUT, pr.image));
  copyFileSync(join(dir, pr.data), join(OUT, pr.data));
  let image = pr.image;
  if (toWebp && image.endsWith(".png")) {
    image = (await toWebp(image)).name;
    rmSync(join(OUT, pr.image));
  }
  manifest.atlases[pr.atlas] = { image, data: pr.data };
  manifest.maps["*"] = [...new Set([...(manifest.maps["*"] ?? []), pr.atlas])];
  console.log(`published props atlas ${pr.atlas} on every map`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest version ${manifest.version}; ${Array.isArray(report.clips) ? report.clips.length : Object.values(report.clips).reduce((n, c) => n + c.length, 0)} frames touch the box edge (see report.json)`);

function readdirSprites(d) {
  return readdirSync(d)
    .filter((f) => f.endsWith(".sprite.json"))
    .map((f) => JSON.parse(readFileSync(join(d, f), "utf8")));
}

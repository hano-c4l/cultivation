// Copies a finished render (the atlas image, its JSON and the sprite entry from tools/render/run.mjs) into client/public/gfx/ and merges it into manifest.json.
//   node tools/gfx-publish.mjs <render dir> [--maps '*,forest']      (default: the atlas loads on every map)
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
const maps = (args.includes("--maps") ? args[args.indexOf("--maps") + 1] : "*").split(",");
if (!existsSync(join(dir, "done.marker")) || !readFileSync(join(dir, "done.marker"), "utf8").startsWith("ok")) throw new Error("not a finished render (no ok marker)");
const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
const sprites = readdirSprites(dir);
mkdirSync(OUT, { recursive: true });
for (const sp of sprites) {
  copyFileSync(join(dir, sp.image), join(OUT, sp.image));
  copyFileSync(join(dir, sp.data), join(OUT, sp.data));
  manifest.atlases[sp.atlas] = { image: sp.image, data: sp.data };
  manifest.sprites[sp.key] = { atlas: sp.atlas, frame: sp.frame, anchor: sp.anchor, ...(sp.head ? { head: sp.head } : {}), anims: sp.anims };
  for (const m of maps) {
    manifest.maps[m] = [...new Set([...(manifest.maps[m] ?? []), sp.atlas])];
  }
  console.log(`published ${sp.key} (${sp.atlas}) to maps ${maps.join(", ")}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest version ${manifest.version}; ${report.clips.length} frames touch the box edge (see report.json)`);

function readdirSprites(d) {
  return readdirSync(d)
    .filter((f) => f.endsWith(".sprite.json"))
    .map((f) => JSON.parse(readFileSync(join(d, f), "utf8")));
}

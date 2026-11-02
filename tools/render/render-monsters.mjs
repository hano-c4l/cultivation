// Re-renders the monster models at the 4j scale: a 128 px frame (anchor 64,112) and figureScale times the factor of tools/render/monster-sizes.json.
//   node tools/render/render-monsters.mjs <out dir outside the repo> [--only wolf,cat]
// Each run goes through tools/render/run.mjs; publish a result with `node tools/gfx-publish.mjs <out dir>/<name> --demand`.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outRoot = resolve(args[0] ?? "");
if (!args[0]) {
  console.error("usage: node tools/render/render-monsters.mjs <out dir> [--only wolf,cat]");
  process.exit(2);
}
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const sizes = JSON.parse(readFileSync(join(here, "monster-sizes.json"), "utf8"));

function resolveConfig(file) {
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  if (!cfg.extends) return cfg;
  const base = resolveConfig(join(dirname(file), cfg.extends));
  return { ...base, ...cfg };
}

mkdirSync(join(outRoot, "configs"), { recursive: true });
const files = readdirSync(here).filter((f) => /^monster-.+\.json$/.test(f) && f !== "monster-sizes.json");
for (const f of files) {
  const species = f.replace(/^monster-/, "").replace(/\.json$/, "");
  if (only && !only.includes(species)) continue;
  const orig = resolveConfig(join(here, f));
  const k = sizes.species[species] ?? sizes.base;
  const cfg = { extends: join(here, f).replaceAll("\\", "/"), frame: 128, anchor: [64, 112], atlasMaxPx: 2048, figureScale: Math.round(orig.figureScale * k * 10000) / 10000 };
  const cfgPath = join(outRoot, "configs", f);
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`== ${species}: figureScale ${orig.figureScale} -> ${cfg.figureScale}`);
  const r = spawnSync("node", [join(here, "run.mjs"), cfgPath, join(outRoot, orig.name)], { stdio: "inherit" });
  if (r.status !== 0) console.error(`!! ${species} failed`);
}

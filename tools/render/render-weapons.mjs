// Renders the weapon layers (phase 4d): one atlas for each weapon family and body, drawn on top of the body sprite.
//   node tools/render/render-weapons.mjs <out dir outside the repo> [--preview] [--family kiem,dao] [--body female]
// Reads tools/render/weapons.json. --preview renders the idle animation only, with the body visible (to place a weapon in the hand), into <out dir>/preview-*.
// Without it every animation is rendered with the body as a holdout, so the frames hold only the visible parts of the weapon; publish them with
// `node tools/gfx-publish.mjs <out dir>/<name>` (sprite key `weapon.<family>.<body>`, loaded on demand by the game).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const outRoot = resolve(args[0] ?? "");
if (!args[0]) {
  console.error("usage: node tools/render/render-weapons.mjs <out dir> [--preview] [--family a,b] [--body male|female]");
  process.exit(2);
}
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const preview = args.includes("--preview");
const table = JSON.parse(readFileSync(join(root, "tools/render/weapons.json"), "utf8"));
const families = (flag("--family") ?? Object.keys(table.weapons).join(",")).split(",");
const bodies = (flag("--body") ?? Object.keys(table.bodies).join(",")).split(",");
mkdirSync(join(outRoot, "configs"), { recursive: true });

for (const family of families) {
  for (const body of bodies) {
    const w = table.weapons[family];
    const name = `w_${family}_${body}`;
    const cfg = {
      extends: join(root, "tools/render", table.bodies[body]).replaceAll("\\", "/"),
      name,
      spriteKey: `weapon.${family}.${body}`,
      holdout: !preview,
      ...(preview ? { preview: true, onlyAnims: ["idle", "attack"] } : {}),
      weapon: { model: `${table.pack}/${w.file}`, bone: w.bone, length: w.length, location: w.location, rotationDeg: w.rotationDeg },
    };
    const cfgPath = join(outRoot, "configs", `${name}.json`);
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    const out = join(outRoot, preview ? `preview-${name}` : name);
    const r = spawnSync("node", [join(root, "tools/render/run.mjs"), cfgPath, out], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

// Renders the paper dolls (phase 4j): one Blender run for each gender and robe silhouette, every layer in it (body, hair, robe, belt, bracer, boots, ten hats, five weapons).
//   node tools/render/render-dolls.mjs <out dir outside the repo> [--only female.robe,male.tunic] [--quick]
// --quick renders idle, attack and die only (a look at the shapes). Publish a finished run with `node tools/gfx-publish.mjs <out dir>/<name> --demand`.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outRoot = resolve(args[0] ?? "");
if (!args[0]) {
  console.error("usage: node tools/render/render-dolls.mjs <out dir> [--only female.robe] [--quick]");
  process.exit(2);
}
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const quick = args.includes("--quick");
const template = JSON.parse(readFileSync(join(here, "doll-template.json"), "utf8"));
const table = JSON.parse(readFileSync(join(here, "doll-styles.json"), "utf8"));
delete template.note;
mkdirSync(join(outRoot, "configs"), { recursive: true });

for (const [gender, g] of Object.entries(table.genders)) {
  for (const [style, st] of Object.entries(table.styles)) {
    const id = `${gender}.${style}`;
    if (only && !only.includes(id)) continue;
    const name = `dl_${gender[0]}_${style}`;
    const cfg = {
      ...template,
      extends: join(here, g.extends).replaceAll("\\", "/"),
      name,
      spriteKey: `doll.${gender}.${style}`,
      source: { outfit: null },
      materials: {
        ...template.materials,
        ...Object.fromEntries(g.skin.map((m) => [m, { color: [1.25, 1.02, 0.88] }])),
        [g.hair]: { color: [0.08, 0.09, 0.15] },
        MI_Eyes: { color: [0.04, 0.04, 0.07] },
      },
      generated: { ...template.generated, parts: [...st.parts, ...Array.from({ length: 10 }, (_, i) => `hat${i}`)], scale: g.k, hemZ: st.hemZ, flare0: st.flare0, flare1: st.flare1, cuff: st.cuff, bootHeight: st.bootHeight },
      ...(quick ? { onlyAnims: ["idle", "attack", "die"] } : {}),
    };
    const cfgPath = join(outRoot, "configs", `${name}.json`);
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log(`== ${id}`);
    const r = spawnSync("node", [join(here, "run.mjs"), cfgPath, join(outRoot, name)], { stdio: "inherit" });
    if (r.status !== 0) console.error(`!! ${id} failed`);
  }
}

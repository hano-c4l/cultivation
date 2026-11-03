// Renders the paper dolls (phase 4j): one Blender run for each gender and robe silhouette, every layer in it (body, hair, robe with belt, cuffs and boots in it, ten hats, five weapons).
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
  console.error("usage: node tools/render/render-dolls.mjs <out dir> [--only female.robe] [--quick] [--test] [--solo] [--set key=json]");
  process.exit(2);
}
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const quick = args.includes("--quick");
const sets = Object.fromEntries(args.flatMap((a, i) => (args[i - 1] === "--set" ? [[a.slice(0, a.indexOf("=")), JSON.parse(a.slice(a.indexOf("=") + 1))]] : []))); // --set key=json: any setting of the config, for a trial (`--set pixelScale=2`)
const test = args.includes("--test"); // the sit pose, the weapons and a hat, facing the viewer and a side: a look before a full render
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
        ...st.materials,
        ...Object.fromEntries(g.skin.map((m) => [m, { color: [1.25, 1.02, 0.88] }])),
        [g.hair]: { color: [0.08, 0.09, 0.15] },
        MI_Eyes: { color: [0.04, 0.04, 0.07] },
      },
      generated: { ...template.generated, ...st.generated, parts: [...st.parts, ...Array.from({ length: 10 }, (_, i) => `hat${i}`)], scale: g.k, hemZ: st.hemZ, flare0: st.flare0, flare1: st.flare1, cuff: st.cuff, bootHeight: st.bootHeight },
      ...(st.generated?.trimLayer ? { passes: template.passes.flatMap((q) => (q.name === "robe" ? [q, { name: "trim", draw: ["trim"] }] : [q])) } : {}),
      ...(st.generated?.trimLayer ? { previewSets: Object.fromEntries(Object.entries(template.previewSets).map(([k, v]) => [k, v.flatMap((n) => (n === "robe" ? [n, "trim"] : [n]))])) } : {}),
      ...(quick ? { onlyAnims: ["idle", "attack", "die"] } : {}),
      ...(args.includes("--solo") ? { onlyAnims: ["idle"], onlyPasses: ["body", "hair", "robe", "w_kiem"], onlyDirs: [0, 2] } : {}),
      ...(test ? { onlyAnims: ["idle", "sit"], onlyPasses: ["body", "hair", "robe", "trim", "h0", "w_kiem", "w_dao", "w_thuong", "w_riu", "w_cung"], onlyDirs: [0, 2] } : {}),
    };
    Object.assign(cfg, sets);
    const cfgPath = join(outRoot, "configs", `${name}.json`);
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log(`== ${id}`);
    const r = spawnSync("node", [join(here, "run.mjs"), cfgPath, join(outRoot, name)], { stdio: "inherit" });
    if (r.status !== 0) console.error(`!! ${id} failed`);
  }
}

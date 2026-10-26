// Runs render_sprites.py in Blender and waits for it (phase 4b).
//   node tools/render/run.mjs <config.json> <out dir>
// The out dir must be OUTSIDE the repo (raw frames never go in). The config names its sources relative to the art folder (CULTIVATION_ART, default D:/Working/cultivation-art). Blender is found through the BLENDER_EXE environment variable, or else the
// Microsoft Store alias (the Store build's launcher returns at once and shows no output, so progress is read from the log and the end from done.marker).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [cfgArg, outArg] = process.argv.slice(2);
if (!cfgArg || !outArg) {
  console.error("usage: node tools/render/run.mjs <config.json> <out dir outside the repo>");
  process.exit(2);
}
const out = resolve(outArg);
const rel = relative(root, out);
if (rel === "" || !(rel.startsWith("..") || isAbsolute(rel))) {
  console.error(`refusing to write raw renders inside the repo (${out})`);
  process.exit(2);
}
const cfg = resolve(cfgArg);
const artRoot = resolve(process.env.CULTIVATION_ART ?? "D:/Working/cultivation-art");
if (!existsSync(cfg) || !existsSync(artRoot)) {
  console.error("config or art folder not found");
  process.exit(2);
}

function findBlender() {
  if (process.env.BLENDER_EXE) return process.env.BLENDER_EXE;
  const apps = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps");
  if (existsSync(apps)) {
    const dir = readdirSync(apps).find((n) => n.startsWith("BlenderFoundation.Blender"));
    // existsSync cannot see an app execution alias (a reparse point), so the launcher is not checked for here
    if (dir) return join(apps, dir, "blender-launcher.exe");
  }
  throw new Error("Blender not found: set BLENDER_EXE");
}

mkdirSync(out, { recursive: true });
const marker = join(out, "done.marker");
rmSync(marker, { force: true });
const script = join(root, "tools/render/render_sprites.py");
const child = spawn(findBlender(), ["--background", "--factory-startup", "--python", script, "--", cfg, out, artRoot], { stdio: "ignore", detached: true });
child.unref();

const deadline = Date.now() + 15 * 60_000;
let shown = 0;
while (!existsSync(marker)) {
  if (Date.now() > deadline) {
    console.error("timed out waiting for done.marker; see", join(out, "log.txt"));
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1500));
  const logPath = join(out, "log.txt");
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf8").split("\n");
    for (; shown < lines.length - 1; shown++) console.log(lines[shown]);
  }
}
await new Promise((r) => setTimeout(r, 500));
const result = readFileSync(marker, "utf8");
const lines = readFileSync(join(out, "log.txt"), "utf8").split("\n");
for (; shown < lines.length; shown++) if (lines[shown]) console.log(lines[shown]);
if (result.startsWith("ok")) {
  console.log("done:", out);
} else {
  console.error(result);
  process.exit(1);
}

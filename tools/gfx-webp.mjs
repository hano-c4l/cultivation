// Converts the atlas images in client/public/gfx/ from PNG to lossless WebP (phase 4h): the same pixels, a smaller download. The texture a phone holds
// in memory after decoding is the same size either way, so this saves bandwidth and first-load time, not VRAM.
//   node tools/gfx-webp.mjs            convert every PNG atlas in the manifest and point the manifest at the WebP files (the PNGs are removed)
// gfx-publish.mjs uses the same conversion for what it publishes. Needs the `sharp` dev dependency.
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "client", "public", "gfx");

/** Converts `OUT/<image>.png` to `.webp` (lossless, slowest and smallest setting) and returns the new file name and both sizes. */
export async function toWebp(image) {
  const src = join(OUT, image);
  const name = image.replace(/\.png$/, ".webp");
  await sharp(src).webp({ lossless: true, effort: 6 }).toFile(join(OUT, name));
  return { name, before: statSync(src).size, after: statSync(join(OUT, name)).size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = join(OUT, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let before = 0;
  let after = 0;
  for (const [id, a] of Object.entries(manifest.atlases)) {
    if (!a.image.endsWith(".png") || !existsSync(join(OUT, a.image))) continue;
    const r = await toWebp(a.image);
    before += r.before;
    after += r.after;
    rmSync(join(OUT, a.image));
    a.image = r.name;
    console.log(`${id}: ${(r.before / 1024).toFixed(0)} KB -> ${(r.after / 1024).toFixed(0)} KB`);
  }
  manifest.version = (manifest.version ?? 0) + 1;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`total ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB; manifest version ${manifest.version}`);
}

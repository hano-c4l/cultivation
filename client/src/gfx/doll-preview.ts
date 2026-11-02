import type Phaser from "phaser";
import type { GfxKit } from "./kit";
import type { DollLayerSpec } from "./doll";

/**
 * Draws a paper doll on a 2D canvas (the equipment window): the layers of one frame, each tinted by multiplication like the game's tint, then the weapon. The DOM has no
 * Phaser tint, so a tinted layer is drawn onto a scratch canvas, multiplied by its colour, and cut back to its own shape. Returns how many layers are not loaded yet (the
 * caller draws again a little later).
 */
export function paintDoll(textures: Phaser.Textures.TextureManager, kit: GfxKit, canvas: HTMLCanvasElement, body: string, layers: readonly DollLayerSpec[], frame = "idle_0_00", scale = 1.5): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!sctx) return 0;
  let missing = 0;
  const draw = (key: string, tint?: number): void => {
    const texKey = kit.textureKeyOf(key);
    const f = texKey && textures.exists(texKey) ? textures.getFrame(texKey, frame) : undefined;
    if (!f) {
      missing++;
      return;
    }
    const src = f.source.image as CanvasImageSource;
    const w = f.cutWidth;
    const h = f.cutHeight;
    // the anchor of the figure (its feet) goes to the bottom middle of the canvas; the sprites of one doll share the untrimmed frame, so `f.x / f.y` (the trim) places each
    const ox = canvas.width / 2 - (f.realWidth / 2) * scale + f.x * scale;
    const oy = canvas.height - 6 - (f.realHeight * 0.875) * scale + f.y * scale;
    if (tint === undefined) {
      ctx.drawImage(src, f.cutX, f.cutY, w, h, ox, oy, w * scale, h * scale);
      return;
    }
    scratch.width = w;
    scratch.height = h;
    sctx.globalCompositeOperation = "source-over";
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(src, f.cutX, f.cutY, w, h, 0, 0, w, h);
    sctx.globalCompositeOperation = "multiply";
    sctx.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
    sctx.fillRect(0, 0, w, h);
    sctx.globalCompositeOperation = "destination-in"; // keep only where the layer itself was drawn
    sctx.drawImage(src, f.cutX, f.cutY, w, h, 0, 0, w, h);
    ctx.drawImage(scratch, 0, 0, w, h, ox, oy, w * scale, h * scale);
  };
  draw(body);
  for (const l of layers) draw(l.key, l.tint);
  return missing;
}

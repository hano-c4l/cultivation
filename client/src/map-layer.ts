import Phaser from "phaser";
import { CELLS_PER_TILE, TILE_H, TILE_W, hash2, obstacleBlobs, obstacleStyleOf, playRectPixels, type GroundStyle, type MapArt, type MapData, type ObstacleStyle, type Obstacles } from "@game/shared";

/** Pixel size of one chunk of the map: obstacles are drawn into textures of this size around the camera only (the whole map would take tens of MB). */
export const CHUNK = 512;
/** How far past the screen chunks are kept (px), and how far they must be before they are dropped. */
const KEEP_PX = 192;
const DROP_PX = 640;
/** Chunks built in one frame (a fresh map needs several; building them all at once would stall the first frame). */
const BUILDS_PER_FRAME = 4;
/** Height (px) of the side faces of walls. */
const FACE = 6;
/** The ground pattern of a styled map: 8 x 8 tiles of the 64 x 32 unit, so the patches and details repeat every eight tiles. */
const GROUND_W = TILE_W * 8;
const GROUND_H = TILE_H * 8;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** `color` (0xRRGGBB) with each channel multiplied by `f` (clamped): below 1 darkens, above 1 lightens. */
export function shade(color: number, f: number): number {
  const c = (shift: number): number => Math.max(0, Math.min(255, Math.round(((color >> shift) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

function diamond(x: number, y: number, scale: number): Phaser.Math.Vector2[] {
  const w = (TILE_W / 2) * scale;
  const h = (TILE_H / 2) * scale;
  return [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + w, y + h), new Phaser.Math.Vector2(x, y + 2 * h), new Phaser.Math.Vector2(x - w, y + h)];
}

/** A small random number in [0, 1) from three integers: details that look scattered but never change. */
function rnd(a: number, b: number, c: number): number {
  return hash2(a * 31 + c * 7, b * 17 + c * 13) / 4294967296;
}

/**
 * The repeating ground texture of a style, made once per palette. `plain` is the bare checker (what a map without art gets). A styled ground has no
 * tile grid: one base tone with soft patches of the two palette tones over it (drawn again one pattern over each way, so the repeat has no seam) and
 * small marks of the style scattered on top.
 */
export function ensureGroundTexture(scene: Phaser.Scene, palette: MapData["palette"], style: GroundStyle): string {
  const key = `ground-${style}-${palette.groundA.toString(16)}-${palette.groundB.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  if (style === "plain") {
    const tile = (cx: number, cy: number, color: number): void => {
      const pts = [new Phaser.Math.Vector2(cx, cy - TILE_H / 2), new Phaser.Math.Vector2(cx + TILE_W / 2, cy), new Phaser.Math.Vector2(cx, cy + TILE_H / 2), new Phaser.Math.Vector2(cx - TILE_W / 2, cy)];
      g.fillStyle(color, 1);
      g.lineStyle(1, 0x000000, 0.18);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
    };
    tile(TILE_W / 2, TILE_H / 2, palette.groundA);
    for (const [cx, cy] of [[0, 0], [TILE_W, 0], [0, TILE_H], [TILE_W, TILE_H]] as const) tile(cx, cy, palette.groundB);
    g.generateTexture(key, TILE_W, TILE_H);
    g.destroy();
    return key;
  }
  const base = mixColor(palette.groundA, palette.groundB);
  g.fillStyle(base, 1).fillRect(0, 0, GROUND_W, GROUND_H);
  // soft patches, flattened like the iso view; each is also drawn shifted by one pattern so one crossing an edge continues on the other side
  for (let n = 0; n < 70; n++) {
    const x = rnd(n, 1, 21) * GROUND_W;
    const y = rnd(n, 2, 22) * GROUND_H;
    const w = 40 + rnd(n, 3, 23) * 90;
    const color = shade(rnd(n, 4, 24) < 0.5 ? palette.groundA : palette.groundB, 0.92 + rnd(n, 5, 25) * 0.16);
    for (const dx of [-GROUND_W, 0, GROUND_W]) for (const dy of [-GROUND_H, 0, GROUND_H]) g.fillStyle(color, 0.55).fillEllipse(x + dx, y + dy, w, w / 2);
  }
  // marks of the style: only fully inside, so none is cut at the seam
  for (let n = 0; n < 150; n++) {
    const x = 6 + rnd(n, 7, 31) * (GROUND_W - 12);
    const y = 6 + rnd(n, 8, 32) * (GROUND_H - 12);
    detail(g, style, x, y, palette, rnd(n, 9, 33));
  }
  g.generateTexture(key, GROUND_W, GROUND_H);
  g.destroy();
  return key;
}

/** The middle tone between two colours. */
function mixColor(a: number, b: number): number {
  const c = (shift: number): number => Math.round((((a >> shift) & 255) + ((b >> shift) & 255)) / 2);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** One small mark on the ground of a style at (x, y); `v` in [0, 1) varies it. */
function detail(g: Phaser.GameObjects.Graphics, style: GroundStyle, x: number, y: number, p: MapData["palette"], v: number): void {
  switch (style) {
    case "grass":
      g.lineStyle(1, shade(p.groundA, 1.45), 0.85);
      for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 1.6, y, x + i * 2.4, y - 3 - v * 2);
      break;
    case "dirt":
      g.fillStyle(shade(p.groundA, v > 0.5 ? 1.3 : 0.7), 0.8).fillEllipse(x, y, 2.5 + v * 2, 1.4 + v);
      break;
    case "stone":
      g.lineStyle(1, shade(p.groundA, 0.6), 0.7).lineBetween(x - 3, y, x, y + 1).lineBetween(x, y + 1, x + 3 * v + 1, y - 1);
      g.fillStyle(shade(p.groundA, 1.25), 0.6).fillRect(x + 2, y + 2, 1.5, 1);
      break;
    case "snow":
      g.fillStyle(0xffffff, 0.75).fillCircle(x, y, 0.9 + v);
      g.fillStyle(0xbcd4ea, 0.5).fillEllipse(x + 2, y + 1.5, 4, 1.4);
      break;
    case "lava":
      g.lineStyle(1, 0x1a0c08, 0.7).lineBetween(x - 3, y - 1, x + 1, y + 1).lineBetween(x + 1, y + 1, x + 4, y);
      g.fillStyle(0xff7a2a, 0.55 + v * 0.3).fillCircle(x + 1, y + 1, 0.9);
      break;
    default:
      break;
  }
}

const CANOPY = [0x2f6b3a, 0x3a7d44, 0x2a5d34, 0x4a8a4a];

/** The texture of one obstacle (a style and a variant 0..3) in the map's obstacle colour: made once and shared by every spot that looks like it. */
export function ensureObstacleTexture(scene: Phaser.Scene, style: ObstacleStyle, variant: number, obstacle: number): string {
  const key = `ob-${style}-${variant}-${obstacle.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const W = 64;
  const H = 80;
  const cx = W / 2;
  const base = H - 10;
  g.fillStyle(0x000000, 0.28).fillEllipse(cx, base, 34, 13);
  const outline = 0x14100c;
  switch (style) {
    case "tree": {
      g.fillStyle(0x5a4632, 1).lineStyle(1.5, outline, 1).fillRect(cx - 3, base - 26, 6, 26).strokeRect(cx - 3, base - 26, 6, 26);
      const col = CANOPY[variant % 4] as number;
      for (const [dx, dy, r] of [[-9, -34, 11], [9, -34, 11], [0, -46, 13], [0, -28, 11]] as const) {
        g.fillStyle(shade(col, 0.8), 1).lineStyle(1.5, outline, 1).fillCircle(cx + dx, base + dy, r).strokeCircle(cx + dx, base + dy, r);
      }
      g.fillStyle(shade(col, 1.25), 0.9).fillCircle(cx - 3, base - 50, 6);
      break;
    }
    case "rock": {
      const col = shade(obstacle, 1.9);
      const pts = [[-17, 0], [-13, -17], [-3, -25], [10, -21], [17, -8], [14, 0]].map(([x, y]) => new Phaser.Math.Vector2(cx + (x as number), base + (y as number) * (0.85 + variant * 0.07)));
      g.fillStyle(col, 1).lineStyle(1.5, outline, 1).fillPoints(pts, true).strokePoints(pts, true);
      g.fillStyle(shade(col, 1.3), 0.9).fillPoints([pts[1] as Phaser.Math.Vector2, pts[2] as Phaser.Math.Vector2, new Phaser.Math.Vector2(cx, base - 12), new Phaser.Math.Vector2(cx - 9, base - 8)], true);
      break;
    }
    case "bush": {
      const col = CANOPY[variant % 4] as number;
      for (const [dx, dy, r] of [[-9, -6, 8], [8, -6, 8], [0, -12, 9], [-3, -4, 8], [5, -3, 7]] as const) {
        g.fillStyle(shade(col, 0.9), 1).lineStyle(1.5, outline, 1).fillCircle(cx + dx, base + dy, r).strokeCircle(cx + dx, base + dy, r);
      }
      g.fillStyle(shade(col, 1.3), 0.9).fillCircle(cx - 3, base - 16, 4);
      if (variant % 2 === 0) g.fillStyle(0xe9577a, 1).fillCircle(cx + 6, base - 9, 1.8).fillCircle(cx - 8, base - 6, 1.8);
      break;
    }
    case "stump": {
      const w = 11;
      g.fillStyle(0x5a4632, 1).lineStyle(1.5, outline, 1).fillRect(cx - w, base - 16, w * 2, 16).strokeRect(cx - w, base - 16, w * 2, 16);
      g.fillStyle(0x5a4632, 1).fillEllipse(cx, base, w * 2, 8);
      g.fillStyle(0xc9a26a, 1).lineStyle(1.5, outline, 1).fillEllipse(cx, base - 16, w * 2, 9).strokeEllipse(cx, base - 16, w * 2, 9);
      g.lineStyle(1, 0x8a6a3a, 1).strokeEllipse(cx, base - 16, w, 4.5);
      break;
    }
    case "boulder": {
      const col = shade(obstacle, 1.7);
      const pts = [[-26, 0], [-24, -14], [-14, -27], [2, -32], [16, -26], [25, -12], [24, 0]].map(([x, y]) => new Phaser.Math.Vector2(cx + (x as number), base + (y as number) * (0.8 + variant * 0.08)));
      g.fillStyle(col, 1).lineStyle(1.5, outline, 1).fillPoints(pts, true).strokePoints(pts, true);
      g.fillStyle(shade(col, 1.3), 0.9).fillPoints([pts[1] as Phaser.Math.Vector2, pts[2] as Phaser.Math.Vector2, pts[3] as Phaser.Math.Vector2, new Phaser.Math.Vector2(cx - 4, base - 14), new Phaser.Math.Vector2(cx - 14, base - 8)], true);
      g.lineStyle(1, shade(col, 0.6), 0.9).lineBetween(cx + 4, base - 28, cx + 8, base - 12).lineBetween(cx + 8, base - 12, cx + 3, base - 2);
      break;
    }
    case "ember": {
      const col = shade(obstacle, 0.9);
      const pts = [[-18, 0], [-14, -18], [-4, -28], [9, -23], [18, -9], [15, 0]].map(([x, y]) => new Phaser.Math.Vector2(cx + (x as number), base + (y as number) * (0.85 + variant * 0.07)));
      g.fillStyle(col, 1).lineStyle(1.5, outline, 1).fillPoints(pts, true).strokePoints(pts, true);
      g.lineStyle(2, 0xff7a2a, 0.95).lineBetween(cx - 8, base - 20, cx - 2, base - 11).lineBetween(cx - 2, base - 11, cx + 6, base - 14).lineBetween(cx - 2, base - 11, cx - 3, base - 2);
      g.fillStyle(0xffd27a, 0.9).fillCircle(cx - 2, base - 11, 1.8);
      break;
    }
    case "pillar": {
      const col = shade(obstacle, 2.1);
      const tall = 46 + variant * 5;
      g.fillStyle(col, 1).lineStyle(1.5, outline, 1).fillTriangle(cx - 11, base, cx + 11, base, cx + variant - 1, base - tall).strokeTriangle(cx - 11, base, cx + 11, base, cx + variant - 1, base - tall);
      g.fillStyle(shade(col, 1.35), 0.9).fillTriangle(cx - 11, base, cx - 1, base, cx + variant - 1, base - tall);
      break;
    }
    case "crystal": {
      const col = 0x8fd4ff;
      for (const [dx, h, w] of [[-9, 30, 7], [8, 24, 6], [0, 42 + variant * 3, 9]] as const) {
        g.fillStyle(shade(col, 0.85), 0.95).lineStyle(1.5, 0x1d3a52, 1).fillTriangle(cx + dx - w, base, cx + dx + w, base, cx + dx, base - h).strokeTriangle(cx + dx - w, base, cx + dx + w, base, cx + dx, base - h);
        g.fillStyle(0xffffff, 0.7).fillTriangle(cx + dx - w, base, cx + dx, base, cx + dx, base - h);
      }
      break;
    }
    default:
      break;
  }
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
}

/** The scan of one map's collision grid, kept for as long as that map object lives (a changed recipe makes a new object). */
const CACHE = new WeakMap<MapData, { sprites: boolean; obstacles: Obstacles; index: Map<string, { cells: number[]; blobs: number[] }> }>();

interface Chunk {
  /** The ground of this part of the map: a tile sprite of the chunk's size, so only the ground near the camera takes memory (one sprite for the whole map would hold a texture as big as the map). */
  ground?: Phaser.GameObjects.TileSprite;
  wall?: Phaser.GameObjects.RenderTexture;
  sprites: Phaser.GameObjects.Image[];
}

/**
 * The obstacles of a map and its walls, drawn only around the camera. The collision grid is split into connected spots (`obstacleBlobs`): small spots
 * are trees, rocks, pillars or crystals (one shared texture per look, depth-sorted among the characters), large ones are walls (the top on the real
 * footprint, side faces below it). Chunks of CHUNK px are built when they come near the screen and destroyed when they leave it, so a big map costs
 * a few MB of textures instead of tens: texture memory is what a phone runs out of first.
 */
export class MapLayer {
  private readonly chunks = new Map<string, Chunk>();
  private readonly index = new Map<string, { cells: number[]; blobs: number[] }>();
  private readonly obstacles: Obstacles;
  private readonly rect: { x0: number; y0: number; x1: number; y1: number };
  private readonly cw: number;
  private readonly sprites: boolean;
  private readonly groundKey: string;
  private readonly patW: number;
  private readonly patH: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
    private readonly art: MapArt,
  ) {
    this.rect = playRectPixels(map);
    this.cw = map.width * CELLS_PER_TILE;
    this.sprites = art.obstacle !== "plain";
    // The scan of the collision grid (about 460 000 cells on the big maps) is the same every time the same map is drawn again: keep it.
    const cached = CACHE.get(map);
    if (cached && cached.sprites === this.sprites) {
      this.obstacles = cached.obstacles;
      this.index = cached.index;
    } else {
      this.obstacles = obstacleBlobs(map);
      this.buildIndex(map);
      CACHE.set(map, { sprites: this.sprites, obstacles: this.obstacles, index: this.index });
    }
    this.groundKey = ensureGroundTexture(scene, map.palette, art.ground);
    this.patW = art.ground === "plain" ? TILE_W : GROUND_W;
    this.patH = art.ground === "plain" ? TILE_H : GROUND_H;
  }

  private buildIndex(map: MapData): void {
    const ch = map.height * CELLS_PER_TILE;
    const keyOf = (px: number, py: number): string => `${Math.floor((px - this.rect.x0) / CHUNK)},${Math.floor((py - this.rect.y0) / CHUNK)}`;
    const bucket = (key: string): { cells: number[]; blobs: number[] } => {
      let b = this.index.get(key);
      if (!b) this.index.set(key, (b = { cells: [], blobs: [] }));
      return b;
    };
    // every chunk of the rectangle has ground, even with no obstacle in it
    for (let ky = 0; ky * CHUNK < this.rect.y1 - this.rect.y0; ky++) for (let kx = 0; kx * CHUNK < this.rect.x1 - this.rect.x0; kx++) bucket(`${kx},${ky}`);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < this.cw; cx++) {
        const id = this.obstacles.blobOf[cy * this.cw + cx] as number;
        if (id === -1 || (this.sprites && (this.obstacles.blobs[id] as { small: boolean }).small)) continue;
        const p = toScreen(cx / CELLS_PER_TILE, cy / CELLS_PER_TILE);
        bucket(keyOf(p.x, p.y)).cells.push(cx, cy);
      }
    }
    if (this.sprites) {
      this.obstacles.blobs.forEach((b, i) => {
        if (!b.small) return;
        const p = toScreen(b.x, b.y);
        bucket(keyOf(p.x, p.y)).blobs.push(i);
      });
    }
  }

  /** Chunks alive now (for the overlay and the tests of memory). */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Builds the chunks near the view and drops the far ones; call every frame (it does nothing when the view is still). */
  update(view: Phaser.Geom.Rectangle): void {
    const x0 = Math.floor((view.x - KEEP_PX - this.rect.x0) / CHUNK);
    const x1 = Math.floor((view.right + KEEP_PX - this.rect.x0) / CHUNK);
    const y0 = Math.floor((view.y - KEEP_PX - this.rect.y0) / CHUNK);
    const y1 = Math.floor((view.bottom + KEEP_PX - this.rect.y0) / CHUNK);
    let built = 0;
    for (let ky = y0; ky <= y1 && built < BUILDS_PER_FRAME; ky++) {
      for (let kx = x0; kx <= x1 && built < BUILDS_PER_FRAME; kx++) {
        const key = `${kx},${ky}`;
        if (this.chunks.has(key) || !this.index.has(key)) continue;
        this.chunks.set(key, this.build(kx, ky, this.index.get(key) as { cells: number[]; blobs: number[] }));
        built++;
      }
    }
    for (const [key, chunk] of this.chunks) {
      const [kx, ky] = key.split(",").map(Number) as [number, number];
      const cx = this.rect.x0 + (kx + 0.5) * CHUNK;
      const cy = this.rect.y0 + (ky + 0.5) * CHUNK;
      const far = cx < view.x - DROP_PX - CHUNK / 2 || cx > view.right + DROP_PX + CHUNK / 2 || cy < view.y - DROP_PX - CHUNK / 2 || cy > view.bottom + DROP_PX + CHUNK / 2;
      if (far) {
        this.free(chunk);
        this.chunks.delete(key);
      }
    }
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) this.free(chunk);
    this.chunks.clear();
  }

  private free(chunk: Chunk): void {
    chunk.ground?.destroy();
    chunk.wall?.destroy();
    for (const s of chunk.sprites) s.destroy();
  }

  private blocked(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cw && cy < this.map.height * CELLS_PER_TILE && (this.obstacles.blobOf[cy * this.cw + cx] as number) !== -1;
  }

  private build(kx: number, ky: number, data: { cells: number[]; blobs: number[] }): Chunk {
    const chunk: Chunk = { sprites: [] };
    const gx = this.rect.x0 + kx * CHUNK;
    const gy = this.rect.y0 + ky * CHUNK;
    const gw = Math.min(CHUNK, this.rect.x1 - gx);
    const gh = Math.min(CHUNK, this.rect.y1 - gy);
    if (gw > 0 && gh > 0) {
      const t = this.scene.add.tileSprite(gx, gy, gw, gh, this.groundKey).setOrigin(0, 0).setDepth(0);
      t.tilePositionX = (((gx + TILE_W / 2) % this.patW) + this.patW) % this.patW;
      t.tilePositionY = ((gy % this.patH) + this.patH) % this.patH;
      chunk.ground = t;
    }
    const half = TILE_W / (2 * CELLS_PER_TILE);
    const cellH = TILE_H / CELLS_PER_TILE;
    if (data.cells.length > 0) {
      // The texture overlaps its neighbours by one cell so a diamond straddling the seam is whole.
      const ox = this.rect.x0 + kx * CHUNK - half;
      const oy = this.rect.y0 + ky * CHUNK;
      const col = this.map.palette.obstacle;
      const flat = !this.sprites; // a plain map keeps its flat diamonds
      const g = this.scene.make.graphics({}, false);
      for (let i = 0; i < data.cells.length; i += 2) {
        const cx = data.cells[i] as number;
        const cy = data.cells[i + 1] as number;
        const p = toScreen(cx / CELLS_PER_TILE, cy / CELLS_PER_TILE);
        const x = p.x - ox;
        const y = p.y - oy;
        if (!flat) {
          // faces first (the top of the cell below must be able to cover them), on the edges that look down onto walkable ground
          if (!this.blocked(cx + 1, cy)) g.fillStyle(shade(col, 0.55), 1).fillPoints([new Phaser.Math.Vector2(x + half, y + cellH / 2), new Phaser.Math.Vector2(x, y + cellH), new Phaser.Math.Vector2(x, y + cellH + FACE), new Phaser.Math.Vector2(x + half, y + cellH / 2 + FACE)], true);
          if (!this.blocked(cx, cy + 1)) g.fillStyle(shade(col, 0.4), 1).fillPoints([new Phaser.Math.Vector2(x - half, y + cellH / 2), new Phaser.Math.Vector2(x, y + cellH), new Phaser.Math.Vector2(x, y + cellH + FACE), new Phaser.Math.Vector2(x - half, y + cellH / 2 + FACE)], true);
        }
        g.fillStyle(flat ? col : shade(col, 1.35), 1).fillPoints(diamond(x, y, 1 / CELLS_PER_TILE), true);
      }
      const tex = this.scene.add.renderTexture(ox, oy, CHUNK + 2 * half, CHUNK + cellH + FACE).setOrigin(0, 0).setDepth(0.1);
      tex.draw(g, 0, 0);
      g.destroy();
      chunk.wall = tex;
    }
    for (const id of data.blobs) {
      const b = this.obstacles.blobs[id] as { x: number; y: number; radius: number; variant: number };
      const p = toScreen(b.x, b.y);
      const key = ensureObstacleTexture(this.scene, obstacleStyleOf(this.art, b), b.variant, this.map.palette.obstacle);
      const img = this.scene.add.image(p.x, p.y + 4, key).setOrigin(0.5, 0.875).setScale(Math.max(0.75, Math.min(2, b.radius / 0.9))).setDepth(10 + b.x + b.y);
      chunk.sprites.push(img);
    }
    return chunk;
  }
}

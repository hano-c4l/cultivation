import { CELLS_PER_TILE, TILE_H, TILE_W, playRectPixels, type MapData } from "@game/shared";

/**
 * The small map in the top right corner: the play rectangle drawn the way the screen draws it (tiles at ((x - y) * 32, (x + y) * 16)), the blocked ground faintly,
 * the doors to other maps, and dots: yourself (white, ringed), other players (blue), monsters (red), the boss (gold, bigger). Guards and NPCs are left out.
 * It only draws what the client already knows; it asks the server for nothing.
 */
export interface MinimapDots {
  /** Tile positions. */
  self: { x: number; y: number } | null;
  players: Array<{ x: number; y: number }>;
  monsters: Array<{ x: number; y: number; boss: boolean }>;
}

export interface MinimapUi {
  setMap(map: MapData): void;
  update(dots: MinimapDots, now: number): void;
  show(on: boolean): void;
}

const MAX_W = 176;
const MAX_H = 128;
const COLORS = { ground: "rgba(60, 96, 70, 0.9)", blocked: "rgba(10, 14, 12, 0.85)", frame: "rgba(255, 255, 255, 0.55)", portal: "#b9a4ff", self: "#ffffff", player: "#4da3ff", monster: "#ff4d4d", boss: "#ffd24a" };
/** How often the dots are redrawn (ms): positions only move at walking pace, so ten times a second is plenty. */
const REDRAW_MS = 100;

export function initMinimap(): MinimapUi {
  const box = document.createElement("div");
  box.id = "minimap";
  box.hidden = true;
  const canvas = document.createElement("canvas");
  box.append(canvas);
  document.body.append(box);
  const ctx = canvas.getContext("2d");

  let map: MapData | null = null;
  let base: HTMLCanvasElement | null = null;
  let scale = 1;
  let origin = { x: 0, y: 0 };
  let lastDraw = 0;

  const project = (tx: number, ty: number): { x: number; y: number } => ({ x: ((tx - ty) * (TILE_W / 2) - origin.x) * scale, y: ((tx + ty) * (TILE_H / 2) - origin.y) * scale });

  /** The still part (the ground and what blocks it), drawn once per map. */
  function paintBase(m: MapData): void {
    const r = playRectPixels(m);
    origin = { x: r.x0, y: r.y0 };
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    scale = Math.min(MAX_W / w, MAX_H / h);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const c = layer.getContext("2d")!;
    c.fillStyle = COLORS.ground;
    c.fillRect(0, 0, layer.width, layer.height);
    // A tile is blocked when its middle cell is: one little diamond per blocked tile is enough at this size.
    c.fillStyle = COLORS.blocked;
    const side = m.width * CELLS_PER_TILE;
    const dw = Math.max(1.5, TILE_W * scale);
    const dh = Math.max(1, TILE_H * scale);
    for (let ty = 0; ty < m.height; ty++) {
      for (let tx = 0; tx < m.width; tx++) {
        const cx = Math.min(side - 1, Math.floor((tx + 0.5) * CELLS_PER_TILE));
        const cy = Math.min(side - 1, Math.floor((ty + 0.5) * CELLS_PER_TILE));
        if (m.collision[cy * side + cx] !== 0) continue;
        const p = project(tx + 0.5, ty + 0.5);
        if (p.x < -dw || p.y < -dh || p.x > layer.width + dw || p.y > layer.height + dh) continue;
        c.fillRect(p.x - dw / 2, p.y - dh / 2, dw, dh);
      }
    }
    c.strokeStyle = COLORS.frame;
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, layer.width - 1, layer.height - 1);
    base = layer;
  }

  const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };

  return {
    setMap(m) {
      map = m;
      paintBase(m);
      lastDraw = 0;
    },
    show(on) {
      box.hidden = !on;
    },
    update(dots, now) {
      if (!ctx || !map || !base || box.hidden || now - lastDraw < REDRAW_MS) return;
      lastDraw = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      // The doors to other maps: a violet ring that breathes.
      const pulse = 3 + Math.sin(now / 400);
      for (const portal of map.portals) {
        const p = project(portal.x + 0.5, portal.y + 0.5);
        ctx.strokeStyle = COLORS.portal;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const m of dots.monsters) {
        if (m.boss) continue;
        const p = project(m.x, m.y);
        dot(ctx, p.x, p.y, 1.8, COLORS.monster);
      }
      for (const o of dots.players) {
        const p = project(o.x, o.y);
        dot(ctx, p.x, p.y, 2.2, COLORS.player);
      }
      for (const m of dots.monsters) {
        if (!m.boss) continue;
        const p = project(m.x, m.y);
        dot(ctx, p.x, p.y, 4, "#000000");
        dot(ctx, p.x, p.y, 3.2, COLORS.boss);
      }
      if (dots.self) {
        const p = project(dots.self.x, dots.self.y);
        dot(ctx, p.x, p.y, 3.6, "#000000");
        dot(ctx, p.x, p.y, 2.8, COLORS.self);
      }
    },
  };
}

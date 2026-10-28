import type Phaser from "phaser";

/** What a run of frames amounted to: frame times in milliseconds, newest last. */
export interface FrameSummary {
  frames: number;
  avgFps: number;
  /** The frame rate of the slowest 1% of frames (the stutter a player feels, which the average hides). */
  lowFps: number;
  worstMs: number;
}

/** Average frame rate and the 1%-low of a list of frame times (ms). An empty list gives zeros. */
export function summarizeFrames(times: readonly number[]): FrameSummary {
  if (times.length === 0) return { frames: 0, avgFps: 0, lowFps: 0, worstMs: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((s, t) => s + t, 0);
  const slowest = Math.max(1, Math.ceil(sorted.length * 0.01));
  const tail = sorted.slice(sorted.length - slowest);
  const tailAvg = tail.reduce((s, t) => s + t, 0) / tail.length;
  return { frames: times.length, avgFps: (times.length * 1000) / total, lowFps: 1000 / tailAvg, worstMs: sorted[sorted.length - 1] ?? 0 };
}

/** Bytes a texture takes on the GPU once decoded (4 bytes a pixel; mipmaps are not used). */
export function textureBytes(width: number, height: number): number {
  return Math.max(0, Math.round(width)) * Math.max(0, Math.round(height)) * 4;
}

export interface SceneStats {
  /** Sprite views alive (players, monsters, NPCs, weapon layers). */
  views: number;
  /** Atlases loaded. */
  atlases: number;
  players: number;
  monsters: number;
}

const WINDOW_FRAMES = 600;

/**
 * The performance overlay (`?perf=1`): frame rate, 1%-low, renderer, screen size, texture memory by kind and counts, with a button that copies the whole
 * report as text. It exists because phone FPS and VRAM cannot be read from a development machine: open the game on the phone with `?perf=1`, play a
 * while in a busy place, and send the copied report. `?gfx=off` (the sprite kit never starts: everything is drawn with shapes) is the comparison.
 */
export function initPerf(game: Phaser.Game, scene: Phaser.Scene, stats: () => SceneStats): void {
  (window as unknown as { __game?: Phaser.Game }).__game = game; // for the console while measuring (only exists with ?perf=1)
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:99999;max-width:260px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.78);color:#9ef0b0;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:auto";
  const text = document.createElement("div");
  const copy = document.createElement("button");
  copy.textContent = "Copy report";
  copy.style.cssText = "margin-top:4px;padding:3px 8px;font:11px system-ui;border-radius:4px;border:1px solid #666;background:#2d3340;color:#fff";
  box.append(text, copy);
  document.body.append(box);

  const times: number[] = [];
  let last = performance.now();
  const tick = (now: number): void => {
    times.push(now - last);
    if (times.length > WINDOW_FRAMES) times.shift();
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const memory = (): { atlasMb: number; otherMb: number; textures: number; largest: string } => {
    let atlas = 0;
    let other = 0;
    let n = 0;
    const sizes: Array<[string, number]> = [];
    for (const key of game.textures.getTextureKeys()) {
      if (key === "__DEFAULT" || key === "__MISSING" || key === "__WHITE") continue;
      const src = game.textures.get(key).source[0];
      if (!src) continue;
      n++;
      const bytes = textureBytes(src.width, src.height);
      sizes.push([key, bytes]);
      if (key.startsWith("gfx:")) atlas += bytes;
      else other += bytes;
    }
    // render textures (the wall chunks of the map) are not in the texture manager's list: count them from the scene
    for (const o of scene.children.list) {
      if (o.type !== "RenderTexture") continue;
      const rt = o as Phaser.GameObjects.RenderTexture;
      const bytes = textureBytes(rt.width, rt.height);
      other += bytes;
      n++;
      sizes.push(["wall chunk", bytes]);
    }
    sizes.sort((a, b) => b[1] - a[1]);
    return { atlasMb: atlas / 1048576, otherMb: other / 1048576, textures: n, largest: sizes.slice(0, 3).map(([k, b]) => `${k.slice(0, 22)} ${(b / 1048576).toFixed(1)}`).join(", ") };
  };

  const report = (): string => {
    const f = summarizeFrames(times);
    const m = memory();
    const s = stats();
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const lines = [
      `fps ${f.avgFps.toFixed(1)} (1% low ${f.lowFps.toFixed(1)}, worst ${f.worstMs.toFixed(0)} ms, ${f.frames} frames)`,
      `renderer ${game.config.renderType === 1 ? "canvas" : game.renderer.type === 1 ? "canvas" : "webgl"}  dpr ${window.devicePixelRatio}  canvas ${game.scale.width}x${game.scale.height}`,
      `texture memory ${(m.atlasMb + m.otherMb).toFixed(1)} MB: atlases ${m.atlasMb.toFixed(1)}, map and other ${m.otherMb.toFixed(1)} (${m.textures} textures)`,
      `sprite views ${s.views}, atlases ${s.atlases}, players ${s.players}, monsters ${s.monsters}, objects ${scene.children.length}`,
      `largest textures (MB): ${m.largest}`,
      ...(heap ? [`js heap ${(heap.usedJSHeapSize / 1048576).toFixed(0)} MB`] : []),
      `map ${new URLSearchParams(location.search).get("gfx") === "off" ? "(gfx off) " : ""}${navigator.userAgent.slice(0, 90)}`,
    ];
    return lines.join("\n");
  };

  setInterval(() => {
    text.textContent = report();
  }, 500);
  copy.onclick = () => {
    const out = report();
    void navigator.clipboard?.writeText(out).catch(() => undefined);
    console.log(out);
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy report"), 1200);
  };
}

import Phaser from "phaser";
import { EMPTY_MANIFEST, GFX_ANIMS, animKey, atlasesForMap, frameName, validateManifest, type GfxAnimName, type GfxManifest, type GfxSprite } from "@game/shared";

/** Where the manifest and the atlases are served from (client/public/gfx). */
const BASE = "/gfx/";
const manifestUrl = () => `${BASE}manifest.json`;
/** Prefix of the Phaser texture key of an atlas. */
const TEX = "gfx:";

/**
 * One sprite on screen, owned by the kit. `alive` turns false when its atlas is unloaded (a map change); the owner then drops it and draws its
 * fallback shape again.
 */
export class GfxView {
  alive = true;
  private current = "";
  /** The last direction shown; kept while an actor stands still. */
  dir = 0;

  constructor(
    private readonly kit: GfxKit,
    readonly key: string,
    readonly sprite: Phaser.GameObjects.Sprite,
    private readonly def: GfxSprite,
  ) {}

  /** While set (a time from performance.now()), idle and run do not interrupt the one-shot that is playing. Infinity keeps the last frame (death). */
  private lockUntil = 0;

  /**
   * Plays an animation facing a direction; the call is a no-op when it is the one already playing (restarting it every frame would freeze frame 0).
   * It does nothing while a one-shot is playing.
   */
  play(anim: GfxAnimName, dir: number): void {
    if (!this.alive || performance.now() < this.lockUntil) return;
    this.dir = dir;
    const resolved = this.kit.animFor(this.key, this.def, anim, dir);
    if (!resolved) {
      if (this.kit.isBroken(this.key)) this.destroy(); // frames are missing: the owner goes back to its shape
      return;
    }
    if (resolved === this.current) return;
    this.current = resolved;
    this.sprite.play(resolved);
  }

  /**
   * Plays an attack, cast, hit or die once, stretched to `ms` (the game decides how long it lasts; the frames only decorate it) and then lets idle and run take
   * over again; a death (ms = Infinity) stays on its last frame until the view is dropped.
   */
  playOnce(anim: GfxAnimName, dir: number, ms: number): void {
    if (!this.alive || this.lockUntil === Infinity) return;
    this.dir = dir;
    const resolved = this.kit.animFor(this.key, this.def, anim, dir);
    if (!resolved) {
      if (this.kit.isBroken(this.key)) this.destroy();
      return;
    }
    this.current = resolved;
    this.lockUntil = ms === Infinity ? Infinity : performance.now() + ms;
    this.sprite.play({ key: resolved, duration: ms === Infinity ? undefined : ms });
  }

  /** Puts the feet at a screen point. */
  place(x: number, y: number, depth: number): void {
    this.sprite.setPosition(x, y).setDepth(depth);
  }

  setScale(k: number): void {
    this.k = k;
    this.sprite.setScale(k * (this.def.scale ?? 1));
  }

  private k = 1;

  /** How far above the feet the top of the head is on screen, in px (names and bars stand above it). */
  rise(): number {
    return (this.def.head ?? this.def.anchor.y) * this.k * (this.def.scale ?? 1);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.destroy();
    this.kit.forget(this);
  }
}

/**
 * Phase 4a: loads the sprite manifest and the atlases a map needs, and makes sprites from them. It never blocks the game: with no manifest, a broken
 * one, a missing atlas or a network error, `spriteKeyFor` simply finds nothing and the scene keeps drawing its shapes.
 */
export class GfxKit {
  private manifest: GfxManifest = EMPTY_MANIFEST;
  private ready = false;
  private mapId = "";
  /** Atlases whose textures are in the scene. */
  private loaded = new Set<string>();
  /** Atlases that failed to load this session: their sprites stay on the fallback shapes. */
  private failed = new Set<string>();
  private pending = new Set<string>();
  /** Atlases handed to the Phaser loader and not yet confirmed or failed. */
  private queued = new Set<string>();
  private wanted = new Set<string>();
  /** Sprite keys whose frames turned out to be missing from the atlas. */
  private broken = new Set<string>();
  private views = new Map<string, Set<GfxView>>();

  constructor(private readonly scene: Phaser.Scene) {
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (!file.key.startsWith(TEX)) return;
      this.fail(file.key.slice(TEX.length), String(file.url));
    });
  }

  /** Fetches the manifest, then loads the atlases of the current map. Never throws. */
  async init(): Promise<void> {
    try {
      const res = await fetch(manifestUrl(), { cache: "no-cache" });
      if (!res.ok) return;
      // The host answers an unknown path with the game's index.html and status 200 (single-page-application fallback): the body must really be JSON.
      const raw: unknown = JSON.parse(await res.text());
      const checked = validateManifest(raw);
      if (!checked.ok) {
        console.warn(`gfx: manifest ignored (${checked.error})`);
        return;
      }
      this.manifest = checked.manifest;
    } catch {
      return; // no manifest, or not JSON: the shapes stay
    } finally {
      this.ready = true;
    }
    if (this.mapId) this.useMap(this.mapId);
  }

  /** True when at least one sprite could ever show; lets the per-frame code skip all lookups in the common (empty) case. */
  get active(): boolean {
    return this.loaded.size > 0;
  }

  /** The map changed: load what it needs and drop the rest (the atlases every map needs stay). */
  useMap(mapId: string): void {
    this.mapId = mapId;
    if (!this.ready) return;
    const want = new Set(atlasesForMap(this.manifest, mapId));
    this.wanted = want;
    for (const id of [...this.loaded]) if (!want.has(id)) this.unload(id);
    for (const id of want) {
      if (this.loaded.has(id) || this.failed.has(id) || this.pending.has(id)) continue;
      this.pending.add(id);
      void this.loadAtlas(id);
    }
  }

  /**
   * The frame data is fetched here (and must really be JSON: the host answers a missing file with index.html and status 200) and handed to Phaser as an
   * object, so a bad file is a quiet fallback and not an exception inside the loader. The image goes through the Phaser loader.
   */
  private async loadAtlas(id: string): Promise<void> {
    const atlas = this.manifest.atlases[id]!;
    const v = `?v=${this.manifest.version}`;
    let data: object;
    try {
      const res = await fetch(`${BASE}${atlas.data}${v}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      data = JSON.parse(await res.text()) as object;
    } catch (e) {
      this.fail(id, `${atlas.data}: ${(e as Error).message}`);
      return;
    }
    if (!this.wanted.has(id)) {
      this.pending.delete(id); // the player already left the map
      return;
    }
    this.scene.load.atlas(`${TEX}${id}`, `${BASE}${atlas.image}${v}`, data);
    // The texture manager announces the finished atlas (the loader's own per-file event name depends on the atlas file type).
    this.scene.textures.once(`${Phaser.Textures.Events.ADD_KEY}${TEX}${id}`, () => this.onLoaded(id));
    this.queued.add(id);
    // A missing image is answered with index.html and status 200, which fails when the image is decoded: that is a process error, not a load error,
    // so no FILE_LOAD_ERROR comes. When the queue is done, whatever was handed over and has no texture failed.
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => this.sweep());
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  private sweep(): void {
    for (const id of [...this.queued]) {
      if (this.scene.textures.exists(`${TEX}${id}`)) continue;
      this.queued.delete(id);
      if (this.pending.has(id)) this.fail(id, "its image did not load");
    }
  }

  private fail(id: string, why: string): void {
    this.failed.add(id);
    this.pending.delete(id);
    console.warn(`gfx: atlas ${id} not loaded (${why}); its sprites stay on the fallback shapes`);
  }

  private onLoaded(id: string): void {
    this.pending.delete(id);
    this.queued.delete(id);
    if (!this.wanted.has(id)) {
      this.scene.textures.remove(`${TEX}${id}`); // the player left the map while it loaded
      return;
    }
    this.loaded.add(id);
  }

  /** Drops an atlas: its sprites first, then their animations, then the texture. */
  private unload(id: string): void {
    for (const v of [...(this.views.get(id) ?? [])]) v.destroy();
    this.views.delete(id);
    for (const [key, s] of Object.entries(this.manifest.sprites)) {
      if (s.atlas !== id) continue;
      for (const a of GFX_ANIMS) for (let d = 0; d < 8; d++) this.scene.anims.remove(animKey(key, a, d));
      this.broken.delete(key);
    }
    this.scene.textures.remove(`${TEX}${id}`);
    this.loaded.delete(id);
  }

  /**
   * The sprite key to use for a kind of actor, or undefined to keep the shape. This is the one place that turns "what is it" into "which sprite":
   * for now it follows the naming convention below; the D1 mapping (admin-editable) will wrap it in 4c/4e.
   *   player -> `player.<variant>` then `player`; monster -> `monster.<kind>`; guard -> `guard`.
   */
  spriteKeyFor(kind: "player" | "monster" | "guard", id?: string, variant?: string): string | undefined {
    if (!this.active) return undefined;
    const candidates = kind === "player" ? [variant ? `player.${variant}` : "", "player"] : kind === "monster" ? [`monster.${id ?? ""}`] : ["guard"];
    return candidates.find((k) => k !== "" && this.usable(k));
  }

  private usable(key: string): boolean {
    const s = this.manifest.sprites[key];
    return s !== undefined && this.loaded.has(s.atlas) && !this.broken.has(key);
  }

  /** Makes a sprite view for a key from `spriteKeyFor`; undefined when it can no longer be made. */
  createView(key: string): GfxView | undefined {
    const def = this.manifest.sprites[key];
    if (!def || !this.usable(key)) return undefined;
    const first = (Object.keys(def.anims)[0] ?? "idle") as GfxAnimName;
    const frame = frameName(first, 0, 0);
    const tex = this.scene.textures.get(`${TEX}${def.atlas}`);
    if (!tex.has(frame)) {
      this.broken.add(key);
      console.warn(`gfx: sprite ${key} has no frame ${frame} in atlas ${def.atlas}; it stays on the fallback shape`);
      return undefined;
    }
    const sprite = this.scene.add.sprite(0, 0, `${TEX}${def.atlas}`, frame).setOrigin(def.anchor.x / def.frame.w, def.anchor.y / def.frame.h);
    sprite.setScale(def.scale ?? 1);
    const view = new GfxView(this, key, sprite, def);
    let set = this.views.get(def.atlas);
    if (!set) this.views.set(def.atlas, (set = new Set()));
    set.add(view);
    return view;
  }

  isBroken(key: string): boolean {
    return this.broken.has(key);
  }

  forget(view: GfxView): void {
    this.views.get(this.manifest.sprites[view.key]?.atlas ?? "")?.delete(view);
  }

  /** The Phaser animation key to play (made on first use); an animation the sprite lacks falls back to `idle`; undefined when it has neither. */
  animFor(spriteKey: string, def: GfxSprite, anim: GfxAnimName, dir: number): string | undefined {
    const name = def.anims[anim] ? anim : def.anims.idle ? "idle" : undefined;
    if (!name) return undefined;
    const key = animKey(spriteKey, name, dir);
    if (this.scene.anims.exists(key)) return key;
    const a = def.anims[name]!;
    const tex = `${TEX}${def.atlas}`;
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < a.frames; i++) {
      const f = frameName(name, dir, i);
      if (!this.scene.textures.get(tex).has(f)) {
        this.broken.add(spriteKey);
        console.warn(`gfx: sprite ${spriteKey} lacks frame ${f}`);
        return undefined;
      }
      frames.push({ key: tex, frame: f });
    }
    this.scene.anims.create({ key, frames, frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    return key;
  }
}

/**
 * How long each one-shot lasts on screen, in ms. The server alone decides when a hit lands and how often one can be made; these only say how long the
 * picture takes, so they sit under the usual attack gaps and never gate anything. A death stays until the view is dropped.
 */
export const ONE_SHOT_MS: Readonly<Record<GfxAnimName, number>> = { idle: 0, run: 0, attack: 500, cast: 600, hit: 320, die: Infinity };

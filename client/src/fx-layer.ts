import Phaser from "phaser";
import { FX_TEX, ensureFxTextures } from "./fx-art";

/** The feels of particle a hit, a bolt or a cast can throw: each is one emitter, made once, fired with `explode`. */
export type Puff = "spark" | "mote" | "trail" | "ember" | "drop" | "petal" | "shard" | "smoke";

const ADD = Phaser.BlendModes.ADD;
/** Ground decals (circles, rings) are drawn just above the ground, under every actor (actors sit at 10 + x + y), so they lie under the feet and not over the legs. */
const GROUND_DEPTH = 0.6;

/** The configs of the emitters: what each looks like (the colour comes with every call). */
const PUFFS: Readonly<Record<Puff, { tex: string; cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig }>> = {
  spark: { tex: FX_TEX.star, cfg: { speed: { min: 50, max: 150 }, lifespan: 460, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 90 } } },
  mote: { tex: FX_TEX.glow, cfg: { speed: { min: 8, max: 34 }, gravityY: -70, lifespan: { min: 600, max: 900 }, scale: { start: 0.32, end: 0 }, alpha: { start: 1, end: 0 } } },
  trail: { tex: FX_TEX.glow, cfg: { speed: { min: 0, max: 12 }, lifespan: 260, scale: { start: 0.42, end: 0 }, alpha: { start: 0.9, end: 0 } } },
  ember: { tex: FX_TEX.glow, cfg: { speed: { min: 30, max: 100 }, gravityY: -110, lifespan: { min: 400, max: 800 }, scale: { start: 0.3, end: 0 }, alpha: { start: 1, end: 0 } } },
  drop: { tex: FX_TEX.glow, cfg: { speed: { min: 40, max: 120 }, angle: { min: 200, max: 340 }, gravityY: 320, lifespan: { min: 350, max: 600 }, scale: { start: 0.24, end: 0.08 }, alpha: { start: 1, end: 0 } } },
  petal: { tex: FX_TEX.petal, cfg: { speed: { min: 25, max: 90 }, gravityY: 25, lifespan: { min: 800, max: 1200 }, scale: { start: 0.7, end: 0.2 }, alpha: { start: 1, end: 0 }, rotate: { start: 0, end: 540 } } },
  shard: { tex: FX_TEX.shard, cfg: { speed: { min: 70, max: 190 }, gravityY: 180, lifespan: { min: 380, max: 620 }, scale: { start: 0.55, end: 0.1 }, alpha: { start: 1, end: 0 }, rotate: { start: 0, end: 360 } } },
  smoke: { tex: FX_TEX.wisp, cfg: { speed: { min: 8, max: 36 }, gravityY: -26, lifespan: { min: 600, max: 900 }, scale: { start: 0.35, end: 1.2 }, alpha: { start: 0.45, end: 0 } } },
};

/** Most picture objects (glows, rings, sigils) alive at once, on top of the particles, so a crowded fight cannot pile them up. */
const MAX_SPRITES = 60;
/** Particles alive at once, for each emitter. */
const MAX_ALIVE = 90;

interface Live {
  obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  tween: Phaser.Tweens.Tween;
}

/**
 * What the skill effects are made of beyond lines and shapes: particles, soft glows, rings and the formation circle ("sigil"). One emitter per kind
 * for the whole scene (not one per hit), and a capped number of picture objects; `clear` stops everything (a map change must not leave tweens
 * that draw into destroyed objects).
 */
export class FxLayer {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly emitters = new Map<Puff, Phaser.GameObjects.Particles.ParticleEmitter>();
  private readonly live = new Set<Live>();
  private readonly holds = new Set<Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    ensureFxTextures(scene);
  }

  /** `n` particles of a kind at (x, y), in `color`. */
  puff(kind: Puff, x: number, y: number, n: number, color: number): void {
    let em = this.emitters.get(kind);
    if (!em) {
      const def = PUFFS[kind];
      em = this.scene.add.particles(0, 0, def.tex, { ...def.cfg, emitting: false, blendMode: kind === "smoke" ? Phaser.BlendModes.NORMAL : ADD, maxAliveParticles: MAX_ALIVE }).setDepth(this.depth + 1);
      this.emitters.set(kind, em);
    }
    em.setParticleTint(color);
    em.explode(n, x, y);
  }

  /** A soft light that swells (or shrinks) and fades at (x, y). */
  glow(x: number, y: number, color: number, from: number, to: number, ms: number, alpha = 0.9): void {
    this.sprite(FX_TEX.glow, x, y, color, from, to, ms, alpha, 1, this.depth);
  }

  /** A ring lying on the ground (flattened as the ground is seen) that opens and fades. */
  ring(x: number, y: number, color: number, from: number, to: number, ms: number, alpha = 0.9): void {
    this.sprite(FX_TEX.ring, x, y, color, from, to, ms, alpha, 0.5, GROUND_DEPTH);
  }

  /**
   * The formation circle on the ground under (x, y): it opens, turns (as the ground turns: inside a flattened container, so it spins on the floor and
   * not on the screen), and fades. `ms` is its life, `turns` how many half turns it makes.
   */
  sigil(x: number, y: number, color: number, radius: number, ms: number, turns = 1, alpha = 0.85): Phaser.GameObjects.Container | null {
    if (this.live.size >= MAX_SPRITES) return null;
    const img = this.scene.add.image(0, 0, FX_TEX.rune).setBlendMode(ADD).setTint(color).setAlpha(0);
    const box = this.scene.add.container(x, y, [img]).setScale(radius / 128, (radius / 128) * 0.5).setDepth(GROUND_DEPTH);
    const state = { p: 0 };
    const entry = { obj: box, tween: undefined as unknown as Phaser.Tweens.Tween };
    entry.tween = this.scene.tweens.add({
      targets: state,
      p: 1,
      duration: ms,
      onUpdate: () => {
        const fade = Math.min(1, state.p * 5, (1 - state.p) * 2.4);
        img.setAlpha(alpha * Math.max(0, fade)).setRotation(state.p * Math.PI * turns);
        box.setScale((radius / 128) * (0.6 + 0.4 * Math.min(1, state.p * 4)), (radius / 128) * 0.5 * (0.6 + 0.4 * Math.min(1, state.p * 4)));
      },
      onComplete: () => {
        box.destroy();
        this.live.delete(entry);
      },
    });
    this.live.add(entry);
    return box;
  }

  /** A formation circle that keeps turning until `drop` (a channel lasts as long as it lasts); the caller moves it with `setPosition`. */
  hold(x: number, y: number, color: number, radius: number, alpha = 0.8): Phaser.GameObjects.Container {
    const img = this.scene.add.image(0, 0, FX_TEX.rune).setBlendMode(ADD).setTint(color).setAlpha(alpha);
    const box = this.scene.add.container(x, y, [img]).setScale(radius / 128, (radius / 128) * 0.5).setDepth(GROUND_DEPTH);
    box.setData("spin", this.scene.tweens.add({ targets: img, rotation: Math.PI * 2, duration: 7000, repeat: -1 }));
    this.holds.add(box);
    return box;
  }

  drop(box: Phaser.GameObjects.Container | undefined): void {
    if (!box || !this.holds.delete(box)) return;
    (box.getData("spin") as Phaser.Tweens.Tween | undefined)?.stop();
    box.destroy();
  }

  /** A streak (a blade of light, a beam) from (x, y) along `angle`, `length` px long, that fades. */
  ray(x: number, y: number, angle: number, length: number, thick: number, color: number, ms: number, alpha = 0.95): void {
    if (this.live.size >= MAX_SPRITES) return;
    const img = this.scene.add.image(x, y, FX_TEX.ray).setBlendMode(ADD).setTint(color).setOrigin(1, 0.5).setRotation(angle).setDepth(this.depth).setAlpha(alpha);
    img.setDisplaySize(length, thick);
    const entry = { obj: img, tween: undefined as unknown as Phaser.Tweens.Tween };
    entry.tween = this.scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleY: img.scaleY * 0.3,
      duration: ms,
      onComplete: () => {
        img.destroy();
        this.live.delete(entry);
      },
    });
    this.live.add(entry);
  }

  /** The sweep of a blade: a crescent that flies out along `angle` from (x, y) and fades. */
  crescent(x: number, y: number, angle: number, size: number, color: number, ms: number): void {
    if (this.live.size >= MAX_SPRITES) return;
    const img = this.scene.add.image(x, y, FX_TEX.crescent).setBlendMode(ADD).setTint(color).setRotation(angle).setDepth(this.depth).setAlpha(0.95).setScale(size / 160 * 0.6);
    const flip = Math.cos(angle) < 0;
    img.setFlipY(flip);
    const entry = { obj: img, tween: undefined as unknown as Phaser.Tweens.Tween };
    entry.tween = this.scene.tweens.add({
      targets: img,
      alpha: 0,
      scale: size / 160,
      x: x + Math.cos(angle) * size * 0.35,
      y: y + Math.sin(angle) * size * 0.35,
      duration: ms,
      ease: "Cubic.easeOut",
      onComplete: () => {
        img.destroy();
        this.live.delete(entry);
      },
    });
    this.live.add(entry);
  }

  private sprite(tex: string, x: number, y: number, color: number, from: number, to: number, ms: number, alpha: number, squash: number, depth: number): void {
    if (this.live.size >= MAX_SPRITES) return;
    const img = this.scene.add.image(x, y, tex).setBlendMode(ADD).setTint(color).setDepth(depth).setAlpha(alpha).setScale(from, from * squash);
    const entry = { obj: img, tween: undefined as unknown as Phaser.Tweens.Tween };
    entry.tween = this.scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleX: to,
      scaleY: to * squash,
      duration: ms,
      ease: "Cubic.easeOut",
      onComplete: () => {
        img.destroy();
        this.live.delete(entry);
      },
    });
    this.live.add(entry);
  }

  /** Stops every running picture and drops what the emitters still hold. */
  clear(): void {
    for (const l of this.live) {
      l.tween.stop();
      l.obj.destroy();
    }
    this.live.clear();
    for (const h of [...this.holds]) this.drop(h);
    for (const em of this.emitters.values()) em.killAll();
  }
}

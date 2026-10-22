import Phaser from "phaser";
import { getSkill } from "@game/shared";
import { BUFF_COLOR, ELEMENT_COLOR, NEUTRAL, skillFxOf } from "./fx-kinds";

/** A point on screen (world pixels of the scene) where an effect is drawn, or null when the thing it belongs to is not in view. */
export type PosOf = (id: string) => { x: number; y: number } | null;

/** Most one-shot effects drawn at once (a crowded fight must not pile up shapes). */
const MAX_ONE_SHOTS = 40;
const FX_DEPTH = 900;

interface Channel {
  what: "bt" | "tp";
  id: string;
  since: number;
  gfx: Phaser.GameObjects.Graphics;
}

/**
 * The visual effects of skills and of the long channels (breakthrough, teleport). All of them are drawn with graphics and tweens (no art needed) and
 * are destroyed when they end. The server decides what happens and tells everyone who sees it (`fx`, `fx_cone`, `fx_channel`); this only draws.
 */
export class Effects {
  private readonly scene: Phaser.Scene;
  private readonly posOf: PosOf;
  private readonly channels = new Map<string, Channel>();
  private oneShots = 0;

  constructor(scene: Phaser.Scene, posOf: PosOf) {
    this.scene = scene;
    this.posOf = posOf;
  }

  /** A skill went off: `id` cast it at `to` or at the point `at`, in `element`. */
  skill(id: string, skillId: string, to: string | undefined, at: { x: number; y: number } | undefined, element: string | undefined): void {
    const def = getSkill(skillId);
    const kind = skillFxOf(def);
    const from = this.posOf(id);
    const target = to ? this.posOf(to) : null;
    const color = (element ? ELEMENT_COLOR[element] : undefined) ?? (def?.element ? ELEMENT_COLOR[def.element] : undefined) ?? NEUTRAL;
    switch (kind) {
      case "melee":
        if (target) this.melee(target, color);
        break;
      case "ranged":
        if (from && target) this.bolt(from, target, color);
        break;
      case "cone":
        if (from && target) this.cone(from, target, 5 * 32, 45, color);
        break;
      case "blink":
        if (from && at) this.blink(from, at);
        break;
      case "buff":
        if (from) this.buff(from, (def?.buff ? BUFF_COLOR[def.buff.stat] : undefined) ?? NEUTRAL, id);
        break;
      case "heal":
        if (from) this.heal(from, id);
        break;
    }
  }

  /** The boss's cone: from its feet towards the point it faced. `range` is in tiles, `half` is half the opening in degrees. */
  coneFrom(from: { x: number; y: number }, aim: { x: number; y: number }, rangeTiles: number, half: number): void {
    // A tile is about 45 px along the screen diagonal; the reach is drawn a little generously so the shape reads.
    this.cone(from, aim, rangeTiles * 40, half, 0xff5a3c);
  }

  /** A breakthrough or a teleport channel started (`on`) or ended on a player. */
  channel(id: string, what: "bt" | "tp", on: boolean, ok: boolean | undefined): void {
    const key = `${id}:${what}`;
    const existing = this.channels.get(key);
    if (on) {
      if (existing) return;
      this.channels.set(key, { what, id, since: performance.now(), gfx: this.scene.add.graphics().setDepth(FX_DEPTH - 1) });
      return;
    }
    if (existing) {
      existing.gfx.destroy();
      this.channels.delete(key);
    }
    const at = this.posOf(id);
    if (!at) return;
    if (what === "bt") this.finale(at, ok === true);
    else if (ok === true) this.flash(at, 0xb99bff);
  }

  /** Every frame: the running channels follow their players and turn. A channel whose player is out of view or has gone is dropped. */
  update(now: number): void {
    for (const [key, ch] of this.channels) {
      const at = this.posOf(ch.id);
      // A teleport channel lasts a few seconds: whatever happens to the message that ends it, the drawing does not outlive that by much.
      if (!at || (ch.what === "tp" && now - ch.since > 9000)) {
        ch.gfx.destroy();
        this.channels.delete(key);
        continue;
      }
      const t = (now - ch.since) / 1000;
      const g = ch.gfx;
      g.clear();
      if (ch.what === "bt") this.drawBreakthrough(g, at, t);
      else this.drawTeleport(g, at, t);
    }
  }

  /** Everything is gone (a new map, a reconnect). */
  clear(): void {
    for (const ch of this.channels.values()) ch.gfx.destroy();
    this.channels.clear();
  }

  /** Drops the channels of one player (they left or were removed). */
  forget(id: string): void {
    for (const [key, ch] of this.channels) {
      if (ch.id !== id) continue;
      ch.gfx.destroy();
      this.channels.delete(key);
    }
  }

  // ---- channels ----

  private drawBreakthrough(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, t: number): void {
    // Golden rings breathing around the feet, motes of light rising along a column, and a slow turning halo.
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    g.lineStyle(3, 0xffd54a, 0.55 + 0.35 * pulse).strokeEllipse(at.x, at.y, 74 + 10 * pulse, 37 + 5 * pulse);
    g.lineStyle(2, 0xfff0b0, 0.5).strokeEllipse(at.x, at.y, 110 - 14 * pulse, 55 - 7 * pulse);
    g.fillStyle(0xffd54a, 0.12 + 0.08 * pulse).fillEllipse(at.x, at.y, 70, 35);
    for (let i = 0; i < 8; i++) {
      const phase = (t * 0.55 + i / 8) % 1;
      const a = i * 2.4 + t * 0.8;
      const r = 26 * (1 - phase * 0.6);
      g.fillStyle(0xfff0b0, 1 - phase).fillCircle(at.x + Math.cos(a) * r, at.y - phase * 78, 2.5 + 1.5 * (1 - phase));
    }
    for (let i = 0; i < 6; i++) {
      const a = t * 1.3 + (i / 6) * Math.PI * 2;
      g.fillStyle(0xffe58a, 0.9).fillCircle(at.x + Math.cos(a) * 46, at.y + Math.sin(a) * 23, 3);
    }
    g.lineStyle(2, 0xffd54a, 0.18 + 0.12 * pulse).lineBetween(at.x, at.y, at.x, at.y - 120);
  }

  private drawTeleport(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, t: number): void {
    // A purple circle on the ground that tightens and spins, with a beam of light that grows over the five seconds.
    const grow = Math.min(1, t / 5);
    const spin = t * 2.2;
    g.lineStyle(3, 0x9d7bff, 0.9).strokeEllipse(at.x, at.y, 84 - 28 * grow, 42 - 14 * grow);
    g.lineStyle(2, 0xd9ccff, 0.8).strokeEllipse(at.x, at.y, 52 + 8 * Math.sin(t * 4), 26 + 4 * Math.sin(t * 4));
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      g.fillStyle(0xe8e0ff, 0.95).fillCircle(at.x + Math.cos(a) * 36, at.y + Math.sin(a) * 18, 2.8);
    }
    g.fillStyle(0x9d7bff, 0.1 + 0.25 * grow).fillRect(at.x - 6 - 8 * grow, at.y - 40 - 180 * grow, 12 + 16 * grow, 40 + 180 * grow);
  }

  // ---- one-shot effects ----

  /** Runs a one-shot drawing: it gets a graphics object that is destroyed when `ms` have passed. Returns false (nothing drawn) when too many are running. */
  private shot(ms: number, depth: number, draw: (g: Phaser.GameObjects.Graphics, p: number) => void): boolean {
    if (this.oneShots >= MAX_ONE_SHOTS) return false;
    this.oneShots++;
    const g = this.scene.add.graphics().setDepth(depth);
    const state = { p: 0 };
    draw(g, 0);
    this.scene.tweens.add({
      targets: state,
      p: 1,
      duration: ms,
      onUpdate: () => {
        g.clear();
        draw(g, state.p);
      },
      onComplete: () => {
        g.destroy();
        this.oneShots--;
      },
    });
    return true;
  }

  /** Close combat: a bright arc cutting across the target. */
  private melee(at: { x: number; y: number }, color: number): void {
    const cx = at.x;
    const cy = at.y - 22;
    this.shot(260, FX_DEPTH, (g, p) => {
      const sweep = -0.9 + 1.8 * Math.min(1, p * 1.4);
      g.lineStyle(7 * (1 - p) + 1, color, 1 - p * 0.7).beginPath().arc(cx, cy, 26, -2.2 + sweep * 0.2, -2.2 + sweep, false).strokePath();
      g.lineStyle(3 * (1 - p) + 1, 0xffffff, 1 - p).beginPath().arc(cx, cy, 26, -2.2 + sweep * 0.2, -2.2 + sweep, false).strokePath();
      g.fillStyle(color, 0.5 * (1 - p)).fillCircle(cx, cy, 8 + 14 * p);
    });
  }

  /** A single target hit from afar: a glowing bolt flies from the caster to the target and bursts. */
  private bolt(from: { x: number; y: number }, to: { x: number; y: number }, color: number): void {
    const fx = from.x;
    const fy = from.y - 22;
    const tx = to.x;
    const ty = to.y - 22;
    const dist = Math.hypot(tx - fx, ty - fy);
    const flight = Math.min(420, 140 + dist * 0.9);
    this.shot(flight + 160, FX_DEPTH, (g, p) => {
      const t = (p * (flight + 160)) / flight;
      if (t <= 1) {
        const x = fx + (tx - fx) * t;
        const y = fy + (ty - fy) * t;
        g.lineStyle(3, color, 0.5).lineBetween(fx + (tx - fx) * Math.max(0, t - 0.25), fy + (ty - fy) * Math.max(0, t - 0.25), x, y);
        g.fillStyle(color, 0.95).fillCircle(x, y, 6);
        g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 3);
      } else {
        const k = Math.min(1, t - 1) / ((160 / flight) || 1);
        g.lineStyle(3, color, 1 - k).strokeCircle(tx, ty, 6 + 22 * k);
        g.fillStyle(color, 0.45 * (1 - k)).fillCircle(tx, ty, 6 + 16 * k);
      }
    });
  }

  /** An area attack in a cone: the wedge flares out from the caster towards the aim point and fades. */
  private cone(from: { x: number; y: number }, aim: { x: number; y: number }, reach: number, halfDeg: number, color: number): void {
    const ox = from.x;
    const oy = from.y - 10;
    const dir = Math.atan2(aim.y - from.y, aim.x - from.x);
    // The ground is squashed 2:1 on screen, so the wedge is drawn on the screen as the flattened shape of a cone on the ground.
    const half = (halfDeg * Math.PI) / 180;
    this.shot(520, FX_DEPTH - 1, (g, p) => {
      const r = reach * Math.min(1, p * 2.4);
      g.fillStyle(color, 0.38 * (1 - p)).lineStyle(2, 0xffffff, 0.7 * (1 - p)).beginPath().moveTo(ox, oy);
      for (let i = 0; i <= 12; i++) {
        const a = dir - half + (i / 12) * half * 2;
        g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.55);
      }
      g.closePath().fillPath().strokePath();
    });
  }

  /** Instant movement: a streak at the start fading away, a ring opening at the destination. */
  private blink(from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.shot(320, FX_DEPTH, (g, p) => {
      g.lineStyle(4 * (1 - p) + 1, 0xb8e8ff, 0.8 * (1 - p)).lineBetween(from.x, from.y - 20, to.x, to.y - 20);
      g.lineStyle(3, 0xb8e8ff, 1 - p).strokeEllipse(from.x, from.y, 40 * (1 - p) + 6, 20 * (1 - p) + 3);
      g.lineStyle(3, 0xffffff, p).strokeEllipse(to.x, to.y, 12 + 44 * p, 6 + 22 * p);
      g.fillStyle(0xb8e8ff, 0.4 * (1 - p)).fillEllipse(to.x, to.y, 12 + 44 * p, 6 + 22 * p);
    });
  }

  /** A buff: two rings rising round the caster in the colour of what it raises (attack red, defence blue, dodge green). */
  private buff(at: { x: number; y: number }, color: number, id: string): void {
    this.shot(700, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      for (let i = 0; i < 2; i++) {
        const q = Math.min(1, Math.max(0, p * 1.3 - i * 0.25));
        g.lineStyle(3, color, 0.9 * (1 - q)).strokeEllipse(now.x, now.y - 8 - q * 46, 40 + 8 * q, 20 + 4 * q);
      }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + p * 3;
        g.fillStyle(color, 0.9 * (1 - p)).fillCircle(now.x + Math.cos(a) * 18, now.y - 6 - p * 50 - (i % 2) * 8, 2.4);
      }
    });
  }

  /** A heal: soft green light and small crosses drifting up. */
  private heal(at: { x: number; y: number }, id: string): void {
    this.shot(800, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      g.fillStyle(0x7dff9c, 0.25 * (1 - p)).fillEllipse(now.x, now.y - 4, 56, 28);
      for (let i = 0; i < 4; i++) {
        const x = now.x + (i - 1.5) * 12;
        const y = now.y - 14 - p * 44 - (i % 2) * 10;
        const s = 4;
        g.lineStyle(3, 0xb6ffc8, 1 - p).lineBetween(x - s, y, x + s, y).lineBetween(x, y - s, x, y + s);
      }
    });
  }

  /** The end of a breakthrough: success is a burst of golden light, failure a grey crack and puff. */
  private finale(at: { x: number; y: number }, ok: boolean): void {
    if (ok) {
      this.shot(1100, FX_DEPTH, (g, p) => {
        g.lineStyle(5 * (1 - p) + 1, 0xffd54a, 1 - p).strokeEllipse(at.x, at.y, 40 + 220 * p, 20 + 110 * p);
        g.fillStyle(0xfff0b0, 0.5 * (1 - p)).fillRect(at.x - 14 * (1 - p) - 4, at.y - 220 * p - 20, 8 + 28 * (1 - p), 220 * p + 20);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.lineStyle(3, 0xffe58a, 1 - p).lineBetween(at.x + Math.cos(a) * 20 * p, at.y - 20 + Math.sin(a) * 10 * p, at.x + Math.cos(a) * (30 + 110 * p), at.y - 20 + Math.sin(a) * (15 + 55 * p));
        }
      });
    } else {
      this.shot(900, FX_DEPTH, (g, p) => {
        g.fillStyle(0x6b6b6b, 0.5 * (1 - p)).fillEllipse(at.x, at.y - 10 - 20 * p, 60 + 50 * p, 30 + 20 * p);
        g.lineStyle(3, 0xff5a5a, 1 - p).lineBetween(at.x - 8, at.y - 50, at.x + 4, at.y - 30).lineBetween(at.x + 4, at.y - 30, at.x - 4, at.y - 12);
      });
    }
  }

  /** A flash of light at a spot (a teleport leaving). */
  private flash(at: { x: number; y: number }, color: number): void {
    this.shot(500, FX_DEPTH, (g, p) => {
      g.fillStyle(color, 0.55 * (1 - p)).fillRect(at.x - 10 - 10 * (1 - p), at.y - 260 * p - 30, 20 + 20 * (1 - p), 260 * p + 30);
      g.lineStyle(3, 0xffffff, 1 - p).strokeEllipse(at.x, at.y, 30 + 60 * p, 15 + 30 * p);
    });
  }
}

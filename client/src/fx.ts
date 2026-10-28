import Phaser from "phaser";
import { getSkill } from "@game/shared";
import { FxLayer, type Puff } from "./fx-layer";
import { BASIC_COLOR, BUFF_COLOR, ELEMENT_COLOR, NEUTRAL, basicFxOf, basicProjectileOf, elementStyleOf, skillFxOf, templateOf, type ElementStyle } from "./fx-kinds";

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
  /** The formation circle turning under the player for as long as the channel lasts. */
  sigil: Phaser.GameObjects.Container;
}

type P = { x: number; y: number };

/**
 * The visual effects of skills and of the long channels (breakthrough, teleport). All of them are drawn with graphics and tweens (no art needed) and
 * are destroyed when they end. The server decides what happens and tells everyone who sees it (`fx`, `fx_cone`, `fx_channel`); this only draws.
 */
export class Effects {
  private readonly scene: Phaser.Scene;
  private readonly posOf: PosOf;
  private readonly channels = new Map<string, Channel>();
  private oneShots = 0;
  /** Particles, glows, rings and the formation circle (everything that is not a line or a shape). */
  private readonly layer: FxLayer;
  /** The one-shots running now, so a clear can stop them (a tween that outlives its scene would draw into a destroyed object). */
  private readonly running = new Set<{ g: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween }>();

  constructor(scene: Phaser.Scene, posOf: PosOf) {
    this.scene = scene;
    this.posOf = posOf;
    this.layer = new FxLayer(scene, FX_DEPTH);
  }

  /** A skill went off: `id` cast it at `to` or at the point `at`, in `element`. The stronger the skill, the bigger and richer the effect. */
  skill(id: string, skillId: string, to: string | undefined, at: { x: number; y: number } | undefined, element: string | undefined): void {
    const def = getSkill(skillId);
    const kind = skillFxOf(def);
    const from = this.posOf(id);
    const target = to ? this.posOf(to) : null;
    const color = (element ? ELEMENT_COLOR[element] : undefined) ?? (def?.element ? ELEMENT_COLOR[def.element] : undefined) ?? NEUTRAL;
    const style = elementStyleOf(element ?? def?.element ?? undefined);
    const lvl = Math.min(1, Math.max(0, ((def?.power ?? 1.6) - 1) / 4.5));
    const tpl = def ? templateOf(def.id) : "";
    if (from && (kind === "melee" || kind === "ranged" || kind === "cone")) this.castSigil(from, color, lvl);
    switch (kind) {
      case "melee":
        if (target) {
          if (tpl === "ngu_kiem_tram") this.swords(from ?? target, target, color, lvl);
          else this.melee(target, color, style, from ?? undefined, lvl, tpl);
        }
        break;
      case "ranged":
        if (from && target) this.bolt(from, target, color, style, false, lvl);
        break;
      case "cone":
        if (from && target) this.cone(from, target, 5 * 32, 45, color);
        break;
      case "blink":
        if (from && at) this.blink(from, at);
        break;
      case "buff":
        if (from) this.buff(from, (def?.buff ? BUFF_COLOR[def.buff.stat] : undefined) ?? NEUTRAL, id, lvl);
        break;
      case "heal":
        if (from) this.heal(from, id, lvl);
        break;
    }
  }

  /** A few particles of a kind at a spot (the trail of a flying sword, say): the layer's emitters are shared, so this costs one explode. */
  puff(kind: Puff, x: number, y: number, n: number, color: number): void {
    this.layer.puff(kind, x, y, n, color);
  }

  /** The formation circle that opens under a caster: bigger for a stronger skill, with motes of spirit light rising from it. */
  private castSigil(from: P, color: number, lvl: number): void {
    this.layer.sigil(from.x, from.y + 2, color, 30 + 26 * lvl, 560 + 240 * lvl, 0.7);
    this.layer.puff("mote", from.x, from.y - 2, 4 + Math.round(6 * lvl), color);
  }

  /** A plain attack (no skill) of `from` on `to`: a swing up close, a bolt (an arrow, for a bow) from afar; players and monsters in their own colours. */
  basic(from: string, to: string, byMonster: boolean, weapon?: string): void {
    const a = this.posOf(from);
    const b = this.posOf(to);
    if (!a || !b) return;
    const color = byMonster ? BASIC_COLOR.monster : BASIC_COLOR.player;
    if (basicFxOf(Math.hypot(b.x - a.x, b.y - a.y)) === "melee") this.melee(b, color);
    else this.bolt(a, b, color, "plain", basicProjectileOf(weapon, byMonster) === "arrow");
  }

  /** A weapon was put on `id`: a ring of light rising round them and a glint of steel. */
  equip(id: string): void {
    const start = this.posOf(id);
    if (!start) return;
    this.layer.sigil(start.x, start.y + 2, 0xfff0b0, 34, 700, 0.5, 0.7);
    this.layer.puff("spark", start.x, start.y - 26, 8, 0xfff0b0);
    this.shot(650, FX_DEPTH, (g, p) => {
      const at = this.posOf(id) ?? start;
      g.lineStyle(3, 0xfff0b0, 1 - p).strokeEllipse(at.x, at.y - 6 - p * 30, 44 + 14 * p, 22 + 7 * p);
      // a glint of steel: two crossed strokes that open and fade at chest height
      const s = 4 + 14 * Math.sin(Math.min(1, p * 1.6) * Math.PI);
      g.lineStyle(3, 0xffffff, 1 - p).lineBetween(at.x - s, at.y - 26, at.x + s, at.y - 26).lineBetween(at.x, at.y - 26 - s, at.x, at.y - 26 + s);
    });
  }

  /** The boss's cone: from its feet towards the point it faced. `range` is in tiles, `half` is half the opening in degrees. */
  coneFrom(from: { x: number; y: number }, aim: { x: number; y: number }, rangeTiles: number, half: number): void {
    // A tile is about 45 px along the screen diagonal; the reach is drawn a little generously so the shape reads.
    this.layer.sigil(from.x, from.y + 2, 0xff5a3c, 46, 700, 0.6);
    this.cone(from, aim, rangeTiles * 40, half, 0xff5a3c);
  }

  /** A breakthrough or a teleport channel started (`on`) or ended on a player. */
  channel(id: string, what: "bt" | "tp", on: boolean, ok: boolean | undefined): void {
    const key = `${id}:${what}`;
    const existing = this.channels.get(key);
    if (on) {
      if (existing) return;
      const at0 = this.posOf(id) ?? { x: 0, y: 0 };
      const gold = what === "bt";
      this.channels.set(key, { what, id, since: performance.now(), gfx: this.scene.add.graphics().setDepth(FX_DEPTH - 1), sigil: this.layer.hold(at0.x, at0.y + 2, gold ? 0xffd54a : 0x9d7bff, gold ? 70 : 48) });
      return;
    }
    if (existing) this.endChannel(key, existing);
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
        this.endChannel(key, ch);
        continue;
      }
      ch.sigil.setPosition(at.x, at.y + 2);
      const t = (now - ch.since) / 1000;
      const g = ch.gfx;
      g.clear();
      if (ch.what === "bt") this.drawBreakthrough(g, at, t);
      else this.drawTeleport(g, at, t);
      if (ch.what === "bt" && Math.random() < 0.28) this.layer.puff("mote", at.x + (Math.random() - 0.5) * 50, at.y, 1, 0xffe58a);
      if (ch.what === "tp" && Math.random() < 0.35) this.layer.puff("mote", at.x + (Math.random() - 0.5) * 40, at.y, 1, 0xd9ccff);
    }
  }

  private endChannel(key: string, ch: Channel): void {
    ch.gfx.destroy();
    this.layer.drop(ch.sigil);
    this.channels.delete(key);
  }

  /** Everything is gone (a new map, a reconnect). */
  clear(): void {
    for (const ch of this.channels.values()) ch.gfx.destroy();
    this.channels.clear();
    this.layer.clear();
    for (const r of this.running) {
      r.tween.stop();
      r.g.destroy();
    }
    this.running.clear();
    this.oneShots = 0;
  }

  /** Drops the channels of one player (they left or were removed). */
  forget(id: string): void {
    for (const [key, ch] of this.channels) {
      if (ch.id !== id) continue;
      this.endChannel(key, ch);
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
    const entry = { g, tween: undefined as unknown as Phaser.Tweens.Tween };
    entry.tween = this.scene.tweens.add({
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
        this.running.delete(entry);
      },
    });
    this.running.add(entry);
    return true;
  }

  /** What an element's hit throws up at (x, y): particles of its own kind, a flash of light and a ring on the ground. `lvl` (0..1) is how strong the skill is. */
  private impact(x: number, y: number, style: ElementStyle, color: number, lvl: number): void {
    const n = 5 + Math.round(8 * lvl);
    const L = this.layer;
    L.glow(x, y, color, 0.5, 1.2 + lvl, 260);
    L.ring(x, y + 18, color, 0.2, 0.7 + 0.5 * lvl, 420, 0.7);
    switch (style) {
      case "hoa":
        L.puff("ember", x, y, n + 4, 0xff7a2a);
        L.puff("ember", x, y, 3, 0xffe9a0);
        L.puff("smoke", x, y - 6, 3, 0x5a4a44);
        break;
      case "thuy":
        L.puff("drop", x, y, n + 3, 0x8fd0ff);
        L.puff("spark", x, y, 3, 0xe6f6ff);
        break;
      case "moc":
        L.puff("petal", x, y, n + 2, 0x8fe08f);
        L.puff("mote", x, y, 4, 0xd6ffcf);
        break;
      case "kim":
        L.puff("shard", x, y, n, 0xffe9a0);
        L.puff("spark", x, y, 5, 0xffffff);
        break;
      case "tho":
        L.puff("shard", x, y + 6, n, 0xb48a52);
        L.puff("smoke", x, y + 6, 4, 0x8a6a3a);
        break;
      case "loi":
        this.strike(x, y, color);
        L.puff("spark", x, y, n + 4, 0xf0e0ff);
        break;
      case "bang":
        L.puff("shard", x, y, n, 0xc8f4ff);
        L.puff("spark", x, y, 4, 0xffffff);
        L.puff("mote", x, y, 3, 0xe6f9ff);
        break;
      case "phong":
        L.puff("smoke", x, y, 5, 0xcdf7dc);
        L.puff("spark", x, y, 4, 0xe8fff0);
        break;
      default:
        L.puff("spark", x, y, n, 0xffffff);
    }
  }

  /** A bolt of lightning from the sky onto (x, y), flickering for an instant. */
  private strike(x: number, y: number, color: number): void {
    const top = y - 190;
    const pts: P[] = [];
    for (let i = 0; i <= 7; i++) pts.push({ x: x + (i === 7 ? 0 : (Math.random() - 0.5) * 26 * (1 - i / 8)), y: top + ((y - top) * i) / 7 });
    this.shot(230, FX_DEPTH + 1, (g, p) => {
      const a = p < 0.2 ? 1 : 0.9 * (1 - p) * (0.6 + 0.4 * Math.sin(p * 60));
      for (const [w, c, al] of [[9, color, 0.35], [4, 0xf0e0ff, 0.8], [1.5, 0xffffff, 1]] as const) {
        g.lineStyle(w, c, a * al).beginPath().moveTo(pts[0]?.x ?? x, pts[0]?.y ?? top);
        for (const q of pts) g.lineTo(q.x, q.y);
        g.strokePath();
      }
    });
  }

  /** Close combat: a sweep of light across the target, a palm print for a palm, an element's mark under it. `from` is where the blow came from. */
  private melee(at: P, color: number, style: ElementStyle = "plain", from?: P, lvl = 0.2, tpl = ""): void {
    const cx = at.x;
    const cy = at.y - 22;
    const ang = from ? Math.atan2(at.y - from.y, at.x - from.x) : -0.6;
    if (tpl === "chuong") {
      // a palm: a swelling print of light with a shock ring
      this.layer.glow(cx, cy, 0xffffff, 0.4, 1.1 + 0.6 * lvl, 280, 0.8);
      this.layer.glow(cx, cy, color, 0.6, 1.8 + lvl, 380, 0.7);
      this.layer.ring(cx, cy + 14, color, 0.3, 1.2 + lvl, 440, 0.9);
    } else {
      this.layer.crescent(cx - Math.cos(ang) * 18, cy - Math.sin(ang) * 10, ang - 0.25, tpl ? 150 + 50 * lvl : 96, color, tpl ? 380 : 260);
      if (tpl) this.layer.crescent(cx - Math.cos(ang) * 10, cy - Math.sin(ang) * 6, ang + 0.2, 120 + 40 * lvl, 0xffffff, 300);
    }
    this.impact(cx, cy, style, color, tpl ? lvl : lvl * 0.4);
    this.shot(style === "plain" ? 260 : 340, FX_DEPTH, (g, p) => {
      if (style !== "plain") this.burst(g, cx, cy, p, style, color, 0.6);
      g.fillStyle(color, 0.35 * (1 - p)).fillCircle(cx, cy, 8 + 14 * p);
    });
  }

  /** Flying swords: three blades leave the caster, arc and strike the target one after another. */
  private swords(from: P, to: P, color: number, lvl: number): void {
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 110, () => {
        const fx = from.x + (i - 1) * 16;
        const fy = from.y - 46 - Math.abs(i - 1) * 8;
        const tx = to.x;
        const ty = to.y - 22;
        const dur = 260;
        this.shot(dur + 120, FX_DEPTH, (g, p) => {
          const t = Math.min(1, (p * (dur + 120)) / dur);
          const arc = Math.sin(t * Math.PI) * (26 + 14 * i);
          const x = fx + (tx - fx) * t;
          const y = fy + (ty - fy) * t - arc;
          const ang = Math.atan2(ty - fy - arc * 0.2, tx - fx);
          if (t < 1) {
            this.layer.puff("trail", x, y, 1, color);
            g.fillStyle(color, 0.55);
            this.diamond(g, x, y, ang, 21, 5);
            g.fillStyle(0xffffff, 1);
            this.diamond(g, x, y, ang, 15, 3.2);
          } else if (!g.getData("hit")) {
            g.setData("hit", true);
            this.layer.crescent(tx - 14, ty - 6, ang, 110 + 40 * lvl, color, 300);
            this.impact(tx, ty, "kim", color, lvl * 0.6);
          }
        });
      });
    }
  }

  /** A single target hit from afar: a glowing bolt with a trail of its element flies from the caster to the target and bursts. */
  private bolt(from: P, to: P, color: number, style: ElementStyle = "plain", arrow = false, lvl = 0.2): void {
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
        const ang = Math.atan2(ty - fy, tx - fx);
        if (arrow) {
          this.arrowAt(g, x, y, ang, color);
          if (Math.random() < 0.4) this.layer.puff("trail", x - Math.cos(ang) * 14, y - Math.sin(ang) * 14, 1, color);
        } else {
          g.fillStyle(color, 0.22).fillCircle(x, y, 13 + 6 * lvl);
          if (style === "plain") {
            g.lineStyle(3, color, 0.5).lineBetween(fx + (tx - fx) * Math.max(0, t - 0.25), fy + (ty - fy) * Math.max(0, t - 0.25), x, y);
            g.fillStyle(color, 0.95).fillCircle(x, y, 6);
            g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 3);
          } else this.head(g, x, y, ang, t, style, color);
          this.layer.puff("trail", x, y, 1, color);
          const r = Math.random();
          if (style === "hoa" && r < 0.6) this.layer.puff("ember", x, y, 1, 0xff7a2a);
          else if (style === "moc" && r < 0.25) this.layer.puff("petal", x, y, 1, 0x8fe08f);
          else if (style === "thuy" && r < 0.3) this.layer.puff("drop", x, y, 1, 0x8fd0ff);
          else if (r < 0.2) this.layer.puff("spark", x, y, 1, 0xffffff);
        }
      } else {
        if (!g.getData("hit")) {
          g.setData("hit", true);
          this.impact(tx, ty, arrow ? "plain" : style, color, lvl);
        }
        const k = Math.min(1, t - 1) / ((160 / flight) || 1);
        if (style === "plain" || arrow) g.lineStyle(3, color, 1 - k).strokeCircle(tx, ty, 6 + 22 * k);
        else this.burst(g, tx, ty, k, style, color, 1);
      }
    });
  }

  /** An arrow in flight: a shaft, a head and two feathers, pointing along `ang`. */
  private arrowAt(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, color: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const at = (d: number, side = 0): { x: number; y: number } => ({ x: x + c * d - s * side, y: y + s * d + c * side });
    const tail = at(-18);
    const tip = at(6);
    g.lineStyle(2, 0xd9c7a0, 1).lineBetween(tail.x, tail.y, tip.x, tip.y);
    g.fillStyle(color, 1).beginPath().moveTo(tip.x, tip.y).lineTo(at(-1, 3).x, at(-1, 3).y).lineTo(at(-1, -3).x, at(-1, -3).y).closePath().fillPath();
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(tail.x, tail.y, at(-23, 3).x, at(-23, 3).y).lineBetween(tail.x, tail.y, at(-23, -3).x, at(-23, -3).y);
  }

  /** A filled diamond centred on (x, y), `len` long along `ang` and `wid` wide (the fill colour is set by the caller). */
  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, len: number, wid: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    g.beginPath()
      .moveTo(x + c * len, y + s * len)
      .lineTo(x - s * wid, y + c * wid)
      .lineTo(x - c * len, y - s * len)
      .lineTo(x + s * wid, y - c * wid)
      .closePath()
      .fillPath();
  }

  /**
   * The head of a bolt of an element, at (x, y) flying along `ang`; `t` is the progress of the flight (0..1) and moves the little parts.
   * Fire is a flickering teardrop, water a drop with a wake, wood leaves, metal a shard, earth stones, lightning a jagged streak, ice a crystal, wind a spiral.
   */
  private head(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, t: number, style: ElementStyle, color: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const back = (d: number, side = 0): { x: number; y: number } => ({ x: x - c * d - s * side, y: y - s * d + c * side });
    const spin = t * 14;
    switch (style) {
      case "hoa":
        for (let i = 3; i >= 1; i--) {
          const q = back(i * 6, Math.sin(spin + i * 2) * 3);
          g.fillStyle(i === 1 ? 0xffb347 : 0xff5a2a, 0.75 - i * 0.15).fillCircle(q.x, q.y, 7 - i * 1.4);
        }
        g.fillStyle(color, 1).fillCircle(x, y, 6);
        g.fillStyle(0xfff3a0, 1).fillCircle(x, y, 3);
        break;
      case "thuy":
        for (let i = 1; i <= 2; i++) g.fillStyle(0xbfe3ff, 0.55 / i).fillCircle(back(i * 7).x, back(i * 7).y, 5 - i);
        g.fillStyle(color, 1).fillCircle(x, y, 6);
        g.fillStyle(0xffffff, 0.8).fillCircle(x - 2, y - 2, 2);
        break;
      case "moc":
        for (let i = 0; i < 3; i++) {
          const a = spin * 0.5 + (i * Math.PI * 2) / 3;
          g.fillStyle(i === 0 ? 0xa8e6a0 : color, 0.95);
          this.diamond(g, x + Math.cos(a) * 7, y + Math.sin(a) * 7, a + 0.8, 6, 2.5);
        }
        g.fillStyle(0xe6ffd8, 1).fillCircle(x, y, 2);
        break;
      case "kim":
        g.lineStyle(2, color, 0.5).lineBetween(back(20).x, back(20).y, x, y);
        g.fillStyle(color, 1);
        this.diamond(g, x, y, ang, 11, 3.5);
        g.fillStyle(0xffffff, 0.9);
        this.diamond(g, x + c * 2, y + s * 2, ang, 5, 1.5);
        break;
      case "tho":
        for (let i = 0; i < 3; i++) {
          const a = spin * 0.4 + (i * Math.PI * 2) / 3;
          g.fillStyle(i === 0 ? 0x8a6a3a : color, 1).fillRect(x + Math.cos(a) * 6 - 3, y + Math.sin(a) * 6 - 3, 6, 6);
        }
        g.fillStyle(0xe0c48a, 1).fillCircle(x, y, 3);
        break;
      case "loi":
        g.lineStyle(3, 0xf0e0ff, 1).beginPath().moveTo(x, y);
        for (let i = 1; i <= 5; i++) {
          const q = back(i * 6, Math.sin(spin * 3 + i * 5) * 5);
          g.lineTo(q.x, q.y);
        }
        g.strokePath();
        g.fillStyle(color, 1).fillCircle(x, y, 5);
        g.fillStyle(0xffffff, 1).fillCircle(x, y, 2.5);
        break;
      case "bang":
        g.fillStyle(color, 1);
        this.diamond(g, x, y, ang, 10, 5);
        g.fillStyle(0xffffff, 0.85);
        this.diamond(g, x, y, ang, 5, 2.5);
        for (let i = 1; i <= 3; i++) {
          const q = back(i * 7, Math.sin(spin + i) * 4);
          g.fillStyle(0xe6f9ff, 0.6 / i).fillCircle(q.x, q.y, 2);
        }
        break;
      case "phong":
        for (let k = 0; k < 2; k++) {
          g.lineStyle(2, k === 0 ? color : 0xe8fff0, 0.9).beginPath().moveTo(x, y);
          for (let i = 1; i <= 6; i++) {
            const q = back(i * 4, Math.sin(spin + i * 0.9 + k * Math.PI) * (2 + i));
            g.lineTo(q.x, q.y);
          }
          g.strokePath();
        }
        g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 2.5);
        break;
      default:
        g.fillStyle(color, 0.95).fillCircle(x, y, 6);
        g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 3);
    }
  }

  /** What an element's hit leaves at (x, y): `k` is the progress (0..1), `size` scales it (a swing is smaller than a bolt). */
  private burst(g: Phaser.GameObjects.Graphics, x: number, y: number, k: number, style: ElementStyle, color: number, size: number): void {
    const fade = 1 - k;
    const r = (6 + 22 * k) * size;
    const ray = (i: number, n: number, from: number, to: number, w: number, col: number): void => {
      const a = (i / n) * Math.PI * 2;
      g.lineStyle(w, col, fade).lineBetween(x + Math.cos(a) * from, y + Math.sin(a) * from * 0.8, x + Math.cos(a) * to, y + Math.sin(a) * to * 0.8);
    };
    switch (style) {
      case "hoa":
        g.fillStyle(color, 0.45 * fade).fillCircle(x, y, r * 0.8);
        for (let i = 0; i < 7; i++) ray(i, 7, r * 0.4, r * (1 + 0.3 * Math.sin(k * 20 + i * 3)), 3, i % 2 ? 0xffd27a : 0xff6a2a);
        break;
      case "thuy":
        g.lineStyle(3, color, fade).strokeEllipse(x, y + 6, r * 2, r);
        g.lineStyle(2, 0xdff1ff, fade).strokeEllipse(x, y + 6, r * 1.2, r * 0.6);
        for (let i = 0; i < 4; i++) g.fillStyle(color, fade).fillCircle(x + (i - 1.5) * r * 0.5, y - k * 18 * size - (i % 2) * 5, 2.5 * size);
        break;
      case "moc":
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k * 2;
          g.fillStyle(i % 2 ? 0xa8e6a0 : color, fade);
          this.diamond(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, a, 5 * size, 2 * size);
        }
        break;
      case "kim":
        for (let i = 0; i < 8; i++) ray(i, 8, r * 0.3, r * 1.3, 2.5, i % 2 ? 0xffffff : color);
        break;
      case "tho":
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.fillStyle(i % 2 ? 0x8a6a3a : color, fade).fillRect(x + Math.cos(a) * r - 3, y + Math.sin(a) * r * 0.7 + k * k * 14 * size - 3, 6 * size, 6 * size);
        }
        g.lineStyle(3, color, fade).strokeEllipse(x, y + 6, r * 1.6, r * 0.8);
        break;
      case "loi":
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          g.lineStyle(3, i % 2 ? 0xffffff : color, fade).beginPath().moveTo(x, y);
          for (let j = 1; j <= 3; j++) {
            const d = j * r * 0.45;
            const off = Math.sin(i * 7 + j * 4) * 6 * size;
            g.lineTo(x + Math.cos(a) * d - Math.sin(a) * off, y + (Math.sin(a) * d + Math.cos(a) * off) * 0.8);
          }
          g.strokePath();
        }
        break;
      case "bang":
        for (let i = 0; i < 6; i++) {
          ray(i, 6, r * 0.2, r * 1.2, 3, 0xffffff);
          const a = (i / 6) * Math.PI * 2;
          g.fillStyle(color, fade);
          this.diamond(g, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.7, a, 5 * size, 2 * size);
        }
        break;
      case "phong":
        for (let i = 0; i < 3; i++) {
          g.lineStyle(2, i === 1 ? 0xffffff : color, fade).beginPath().arc(x, y, r * (0.5 + i * 0.35), k * 5 + i * 2, k * 5 + i * 2 + 2.2, false).strokePath();
        }
        break;
      default:
        g.lineStyle(3, color, fade).strokeCircle(x, y, r);
        g.fillStyle(color, 0.45 * fade).fillCircle(x, y, r * 0.7);
    }
  }

  /** An area attack in a cone: layered wedges flare out from the caster towards the aim point, with sparks along the front. */
  private cone(from: P, aim: P, reach: number, halfDeg: number, color: number): void {
    const ox = from.x;
    const oy = from.y - 10;
    const dir = Math.atan2(aim.y - from.y, aim.x - from.x);
    // The ground is squashed 2:1 on screen, so the wedge is drawn on the screen as the flattened shape of a cone on the ground.
    const half = (halfDeg * Math.PI) / 180;
    for (let i = 0; i < 9; i++) {
      const a = dir - half + (i / 8) * half * 2;
      this.layer.puff(i % 2 ? "ember" : "spark", ox + Math.cos(a) * reach * 0.8, oy + Math.sin(a) * reach * 0.8 * 0.55, 2, color);
    }
    this.shot(560, 0.62, (g, p) => {
      for (let layer = 0; layer < 3; layer++) {
        const r = reach * Math.min(1, Math.max(0, p * 2.4 - layer * 0.18)) * (1 - layer * 0.18);
        if (r <= 0) continue;
        g.fillStyle(layer === 0 ? color : 0xffffff, (layer === 0 ? 0.34 : 0.14) * (1 - p)).beginPath().moveTo(ox, oy);
        if (layer === 0) g.lineStyle(2, 0xffffff, 0.7 * (1 - p));
        for (let i = 0; i <= 12; i++) {
          const a = dir - half + (i / 12) * half * 2;
          g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.55);
        }
        g.closePath().fillPath();
        if (layer === 0) g.strokePath();
      }
    });
  }

  /** Instant movement: the caster leaves a streak and afterimages, the destination opens in a ring with a burst of light. */
  private blink(from: P, to: P): void {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    for (let i = 0; i < 4; i++) this.layer.glow(from.x + (to.x - from.x) * (i / 4), from.y - 22 + (to.y - from.y) * (i / 4), 0xb8e8ff, 0.8, 0.2, 260 + i * 60, 0.7);
    this.layer.ray(to.x, to.y - 20, ang, Math.min(dist, 260), 10, 0xb8e8ff, 320);
    this.layer.puff("smoke", from.x, from.y - 14, 4, 0xdff4ff);
    this.layer.puff("spark", from.x, from.y - 14, 6, 0xffffff);
    this.layer.sigil(to.x, to.y + 2, 0xb8e8ff, 36, 520, 0.6);
    this.layer.puff("spark", to.x, to.y - 20, 8, 0xe6f9ff);
    this.layer.glow(to.x, to.y - 20, 0xffffff, 0.4, 1.8, 300);
    this.shot(320, FX_DEPTH, (g, p) => {
      g.lineStyle(3, 0xffffff, p).strokeEllipse(to.x, to.y, 12 + 44 * p, 6 + 22 * p);
    });
  }

  /** A buff: a formation circle under the caster in the colour of what it raises (attack red, defence blue, dodge green), a column of light and rising sparks. */
  private buff(at: P, color: number, id: string, lvl = 0.3): void {
    this.layer.sigil(at.x, at.y + 2, color, 36 + 18 * lvl, 1000, 1.2, 0.9);
    this.layer.puff("mote", at.x, at.y - 4, 8 + Math.round(6 * lvl), color);
    this.layer.puff("spark", at.x, at.y - 20, 5, 0xffffff);
    this.layer.glow(at.x, at.y - 24, color, 0.6, 1.6 + lvl, 600, 0.5);
    this.shot(900, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      for (let i = 0; i < 2; i++) {
        const q = Math.min(1, Math.max(0, p * 1.3 - i * 0.25));
        g.lineStyle(3, color, 0.9 * (1 - q)).strokeEllipse(now.x, now.y - 8 - q * 56, 40 + 8 * q, 20 + 4 * q);
      }
      // the column: three nested strips, brightest at the foot
      for (let i = 0; i < 3; i++) g.fillStyle(color, (0.16 - i * 0.04) * Math.sin(Math.min(1, p) * Math.PI)).fillRect(now.x - 15 + i * 4, now.y - 90 * (1 - i * 0.12), 30 - i * 8, 90 * (1 - i * 0.12));
    });
  }

  /** Eight petals of a lotus opening on the ground at (x, y); `open` runs 0..1. */
  private lotus(g: Phaser.GameObjects.Graphics, x: number, y: number, open: number, radius: number, color: number, alpha: number): void {
    for (let ring = 0; ring < 2; ring++) {
      const r = radius * (1 - ring * 0.35) * (0.3 + 0.7 * open);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + ring * 0.39;
        const tip = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5 };
        const l = { x: x + Math.cos(a - 0.38) * r * 0.55, y: y + Math.sin(a - 0.38) * r * 0.55 * 0.5 };
        const rr = { x: x + Math.cos(a + 0.38) * r * 0.55, y: y + Math.sin(a + 0.38) * r * 0.55 * 0.5 };
        g.fillStyle(ring === 0 ? color : 0xffffff, alpha * (ring === 0 ? 0.55 : 0.4)).fillTriangle(x, y, l.x, l.y, tip.x, tip.y).fillTriangle(x, y, rr.x, rr.y, tip.x, tip.y);
      }
    }
  }

  /** A heal: a lotus opening under the caster, petals and soft green light rising. */
  private heal(at: P, id: string, lvl = 0.3): void {
    this.layer.sigil(at.x, at.y + 2, 0x7dff9c, 34 + 14 * lvl, 900, 0.8, 0.7);
    this.layer.puff("petal", at.x, at.y - 6, 7 + Math.round(6 * lvl), 0xb6ffc8);
    this.layer.puff("mote", at.x, at.y - 4, 8, 0x9dffb4);
    this.layer.glow(at.x, at.y - 22, 0x7dff9c, 0.8, 2, 700, 0.5);
    this.shot(900, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      this.lotus(g, now.x, now.y, Math.min(1, p * 2.2), 30 + 14 * lvl, 0x9dffb4, 1 - p);
      const y = now.y - 14 - p * 40;
      g.lineStyle(3, 0xb6ffc8, 1 - p).lineBetween(now.x - 5, y, now.x + 5, y).lineBetween(now.x, y - 5, now.x, y + 5);
    });
  }

  /** The end of a breakthrough: success is a burst of golden light with a lotus and a rain of sparks, failure a grey crack and puff. */
  private finale(at: P, ok: boolean): void {
    if (ok) {
      this.layer.sigil(at.x, at.y + 2, 0xffd54a, 110, 1100, 0.8, 0.9);
      this.layer.ring(at.x, at.y, 0xffe58a, 0.4, 2.4, 900, 0.9);
      this.layer.glow(at.x, at.y - 30, 0xfff0b0, 0.8, 4, 700, 0.8);
      this.layer.puff("spark", at.x, at.y - 24, 14, 0xfff0b0);
      this.layer.puff("petal", at.x, at.y - 10, 12, 0xffe58a);
      this.layer.puff("mote", at.x, at.y, 14, 0xffd54a);
      this.shot(1100, FX_DEPTH, (g, p) => {
        g.lineStyle(5 * (1 - p) + 1, 0xffd54a, 1 - p).strokeEllipse(at.x, at.y, 40 + 220 * p, 20 + 110 * p);
        g.fillStyle(0xfff0b0, 0.5 * (1 - p)).fillRect(at.x - 14 * (1 - p) - 4, at.y - 220 * p - 20, 8 + 28 * (1 - p), 220 * p + 20);
        this.lotus(g, at.x, at.y, Math.min(1, p * 3), 80, 0xffe58a, 1 - p);
      });
    } else {
      this.layer.puff("smoke", at.x, at.y - 10, 8, 0x777777);
      this.layer.ring(at.x, at.y, 0x884444, 0.4, 1.2, 600, 0.7);
      this.shot(900, FX_DEPTH, (g, p) => {
        g.lineStyle(3, 0xff5a5a, 1 - p).lineBetween(at.x - 8, at.y - 50, at.x + 4, at.y - 30).lineBetween(at.x + 4, at.y - 30, at.x - 4, at.y - 12);
      });
    }
  }

  /** A flash of light at a spot (a teleport leaving): a beam of light rising out of a circle that opens. */
  private flash(at: P, color: number): void {
    this.layer.sigil(at.x, at.y + 2, color, 52, 600, 0.6);
    this.layer.puff("spark", at.x, at.y - 30, 10, 0xffffff);
    this.layer.puff("mote", at.x, at.y, 8, color);
    this.shot(500, FX_DEPTH, (g, p) => {
      g.fillStyle(color, 0.55 * (1 - p)).fillRect(at.x - 10 - 10 * (1 - p), at.y - 260 * p - 30, 20 + 20 * (1 - p), 260 * p + 30);
      g.lineStyle(3, 0xffffff, 1 - p).strokeEllipse(at.x, at.y, 30 + 60 * p, 15 + 30 * p);
    });
  }
}

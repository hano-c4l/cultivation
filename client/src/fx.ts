import Phaser from "phaser";
import { getSkill, skillAreaOf, skillLookOf, weaponAreaOf, type AreaDef, type SkillLook } from "@game/shared";
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
  private readonly selfId: () => string | undefined;
  private readonly channels = new Map<string, Channel>();
  private oneShots = 0;
  /** Bumped by `clear`: delayed parts of an effect check it, so they do not fire on the next map. */
  private epoch = 0;
  /** Particles, glows, rings and the formation circle (everything that is not a line or a shape). */
  private readonly layer: FxLayer;
  /** The one-shots running now, so a clear can stop them (a tween that outlives its scene would draw into a destroyed object). */
  private readonly running = new Set<{ g: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween }>();

  constructor(scene: Phaser.Scene, posOf: PosOf, selfId: () => string | undefined = () => undefined) {
    this.scene = scene;
    this.posOf = posOf;
    this.selfId = selfId;
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
    // A cast at a point (no target) is drawn at that point.
    const aimed = target ?? (kind === "melee" || kind === "ranged" || kind === "cone" ? (at ?? null) : null);
    if (from && (kind === "melee" || kind === "ranged" || kind === "cone")) this.castSigil(from, color, lvl);
    if (from && aimed && def?.kind === "attack") this.areaMark(skillAreaOf(def), from, aimed, color, 0.26);
    const look = def && !def.fx ? skillLookOf(def) : undefined;
    if (look && this.styled(look, from, aimed, id, color, style, lvl, def?.buff ? (BUFF_COLOR[def.buff.stat] ?? NEUTRAL) : NEUTRAL)) return;
    switch (kind) {
      case "melee":
        if (aimed) {
          if (tpl === "ngu_kiem_tram") this.swords(from ?? aimed, aimed, color, lvl, 4 + Math.round(3 * lvl));
          else this.melee(aimed, color, style, from ?? undefined, lvl, tpl);
        }
        break;
      case "ranged":
        if (from && aimed) this.spell(from, aimed, color, style, lvl);
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

  /**
   * The light a timed buff keeps round its wearer while it runs (called a few times a second by the scene): rising embers for a strength buff, a
   * shimmering ring on the ground for a ward, streaks of wind for a dodge buff, a column of motes otherwise. It thins out in the last second.
   */
  lingering(id: string, skillId: string, leftS: number): void {
    const at = this.posOf(id);
    const def = getSkill(skillId);
    if (!at || !def?.buff) return;
    const color = BUFF_COLOR[def.buff.stat] ?? NEUTRAL;
    const fade = Math.min(1, leftS);
    switch (def.buff.stat) {
      case "attack":
        this.layer.puff("ember", at.x + (Math.random() - 0.5) * 18, at.y - 8, 1, color);
        if (Math.random() < 0.5) this.layer.puff("spark", at.x + (Math.random() - 0.5) * 22, at.y - 26, 1, 0xffffff);
        this.layer.glow(at.x, at.y - 22, color, 0.5, 1.1, 300, 0.22 * fade);
        break;
      case "dodge":
        this.layer.puff("trail", at.x + (Math.random() - 0.5) * 26, at.y - 14 - Math.random() * 20, 1, color);
        this.layer.ring(at.x, at.y + 6, color, 0.5, 1.1, 520, 0.28 * fade);
        break;
      default:
        this.layer.ring(at.x, at.y + 6, color, 0.7, 1.05, 700, 0.32 * fade);
        this.layer.puff("mote", at.x + (Math.random() - 0.5) * 24, at.y - 2, 1, color);
        this.layer.glow(at.x, at.y - 22, color, 0.5, 1.2, 300, 0.2 * fade);
    }
  }

  /** A guard used a skill: a glow of its colour (mend: lotus light, ward: a ring, burst and slash: a flash of its spear). */
  guardSkill(id: string, skill: string): void {
    const at = this.posOf(id);
    if (!at) return;
    switch (skill) {
      case "mend":
        this.layer.puff("petal", at.x, at.y - 10, 8, 0x9be8a8);
        this.layer.glow(at.x, at.y - 24, 0x9be8a8, 0.6, 1.6, 700, 0.5);
        break;
      case "ward":
        this.layer.ring(at.x, at.y + 6, 0xffd36a, 0.5, 1.5, 800, 0.7);
        this.layer.puff("mote", at.x, at.y - 6, 8, 0xffd36a);
        break;
      default:
        this.layer.glow(at.x, at.y - 24, 0xff7a4a, 0.6, 1.7, 500, 0.6);
        this.layer.puff("spark", at.x, at.y - 24, 6, 0xffe2b0);
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

  /** A plain attack (no skill) of `from` on `to`: the swing of its weapon up close (a sword's crescent, a spear's thrust, an axe's whirl, a fist's shock), a bolt (an arrow, for a bow) from afar. */
  basic(from: string, to: string, byMonster: boolean, weapon?: string): void {
    const a = this.posOf(from);
    const b = this.posOf(to);
    if (!a || !b) return;
    const color = byMonster ? BASIC_COLOR.monster : BASIC_COLOR.player;
    const arrow = basicProjectileOf(weapon, byMonster) === "arrow";
    if (arrow || basicFxOf(Math.hypot(b.x - a.x, b.y - a.y)) !== "melee") return this.bolt(a, b, color, "plain", arrow);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cy = b.y - 22;
    const area = weaponAreaOf(weapon);
    if (area.shape !== "single") this.areaMark(area, a, b, color, 0.16);
    switch (weapon) {
      case "thuong": {
        // a thrust: a bright line driven through the target
        this.layer.ray(b.x + Math.cos(ang) * 46, cy + Math.sin(ang) * 23, ang, 150, 9, color, 260);
        this.layer.ray(b.x + Math.cos(ang) * 46, cy + Math.sin(ang) * 23, ang, 150, 3, 0xffffff, 220);
        this.layer.glow(b.x, cy, color, 0.3, 1.2, 220, 0.8);
        this.layer.puff("spark", b.x, cy, 5, color);
        break;
      }
      case "riu": {
        // a whirl round the wielder
        this.layer.ring(a.x, a.y + 8, color, 0.3, 1.5, 320, 0.8);
        for (let k = 0; k < 3; k++) this.layer.crescent(a.x, a.y - 22, ang + k * 2.09, 100, color, 300);
        this.layer.puff("shard", b.x, cy, 4, color);
        break;
      }
      case "dao":
        this.layer.crescent(b.x - Math.cos(ang) * 20, cy - Math.sin(ang) * 10, ang - 0.3, 130, color, 320);
        this.layer.crescent(b.x - Math.cos(ang) * 14, cy - Math.sin(ang) * 7, ang + 0.25, 100, 0xffffff, 260);
        this.layer.puff("spark", b.x, cy, 4, color);
        break;
      case "quyen":
        this.layer.glow(b.x, cy, color, 0.4, 1.4, 240, 0.8);
        this.layer.ring(b.x, cy + 14, color, 0.3, 1, 320, 0.8);
        break;
      default:
        this.melee(b, color);
    }
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
    this.epoch++;
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

  // ---- the ground an area covers, and what a blow leaves on its target ----

  /** A ground offset (tiles) as a screen offset: the ground is seen from above at 2:1, a tile being 64 px wide and 32 high. */
  private gs(dx: number, dy: number): P {
    return { x: (dx - dy) * 32, y: (dx + dy) * 16 };
  }

  /** A screen offset as a ground offset (tiles), the other way. */
  private ground(sx: number, sy: number): P {
    return { x: (sx / 32 + sy / 16) / 2, y: (sy / 16 - sx / 32) / 2 };
  }

  /**
   * Draws, on the ground, the very shape the server hits (`shared/src/area.ts` decides who is inside it): a fan, a strip or a disc, lit for a moment.
   * `from` is where the blow comes from and `aim` the point it is aimed at, both on screen; `alpha` dims it (a plain blow marks it softly).
   */
  private areaMark(area: AreaDef, from: P, aim: P, color: number, alpha = 0.3): void {
    if (area.shape === "single") return;
    const d = this.ground(aim.x - from.x, aim.y - from.y);
    const len = Math.hypot(d.x, d.y) || 1;
    const ux = d.x / len;
    const uy = d.y / len;
    const pts: P[] = [];
    const add = (gx: number, gy: number, cx = from.x, cy = from.y): void => {
      const o = this.gs(gx, gy);
      pts.push({ x: cx + o.x, y: cy + o.y });
    };
    if (area.shape === "circle") {
      const c = area.at === "self" ? from : aim;
      for (let i = 0; i < 28; i++) add(Math.cos((i / 28) * Math.PI * 2) * area.range, Math.sin((i / 28) * Math.PI * 2) * area.range, c.x, c.y);
    } else if (area.shape === "arc") {
      const half = (((area.deg ?? 90) / 2) * Math.PI) / 180;
      const base = Math.atan2(uy, ux);
      pts.push({ x: from.x, y: from.y });
      for (let i = 0; i <= 14; i++) {
        const a = base - half + (i / 14) * half * 2;
        add(Math.cos(a) * area.range, Math.sin(a) * area.range);
      }
    } else {
      const w = (area.width ?? 1) / 2;
      add(-uy * w, ux * w);
      add(ux * area.range - uy * w, uy * area.range + ux * w);
      add(ux * area.range + uy * w, uy * area.range - ux * w);
      add(uy * w, -ux * w);
    }
    this.shot(520, 0.62, (g, p) => {
      g.fillStyle(color, alpha * (1 - p)).lineStyle(2, 0xffffff, Math.min(0.8, alpha * 2.2) * (1 - p)).beginPath().moveTo(pts[0]?.x ?? 0, pts[0]?.y ?? 0);
      for (const q of pts) g.lineTo(q.x, q.y);
      g.closePath().fillPath().strokePath();
    });
  }

  /** A blow landed on `to` (from `from`): sparks thrown away from the attacker, a streak across the figure, and a burst for a critical hit. */
  hit(to: string, from: string, kind: "hit" | "crit", skillId?: string): void {
    const at = this.posOf(to);
    if (!at) return;
    const src = this.posOf(from);
    const def = skillId ? getSkill(skillId) : undefined;
    const color = (def?.element ? ELEMENT_COLOR[def.element] : undefined) ?? (kind === "crit" ? 0xffd54a : 0xfff0d0);
    const ang = src ? Math.atan2(at.y - src.y, at.x - src.x) : -0.6;
    const cx = at.x;
    const cy = at.y - 22;
    const L = this.layer;
    L.puff("spark", cx, cy, kind === "crit" ? 9 : 4, color);
    L.glow(cx, cy, 0xffffff, 0.3, kind === "crit" ? 1.8 : 0.9, 180, 0.8);
    L.ray(cx + Math.cos(ang) * 22, cy + Math.sin(ang) * 11, ang, kind === "crit" ? 70 : 46, kind === "crit" ? 9 : 5, color, 200);
    if (kind === "crit") {
      L.ring(cx, cy + 14, 0xffd54a, 0.2, 1.1, 360, 0.9);
      L.puff("shard", cx, cy, 6, 0xffe9a0);
    }
  }

  // ---- the looks of single skills ----

  /** A finger of force: a bright line from the caster through the target, with sparks along it. */
  private finger(from: P, to: P, color: number, style: ElementStyle, lvl: number): void {
    const fy = from.y - 24;
    const ty = to.y - 22;
    const ang = Math.atan2(ty - fy, to.x - from.x);
    const dist = Math.hypot(to.x - from.x, ty - fy);
    this.layer.ray(to.x + Math.cos(ang) * 40, ty + Math.sin(ang) * 20, ang, dist + 60, 12 + 6 * lvl, color, 340);
    this.layer.ray(to.x + Math.cos(ang) * 40, ty + Math.sin(ang) * 20, ang, dist + 60, 4, 0xffffff, 260);
    this.layer.glow(from.x + Math.cos(ang) * 14, fy + Math.sin(ang) * 7, color, 0.4, 1.4, 240, 0.9);
    for (let i = 1; i <= 7; i++) this.layer.puff("spark", from.x + ((to.x - from.x) * i) / 8, fy + ((ty - fy) * i) / 8, 1, color);
    this.later(120, () => this.impact(to.x, ty, style, color, lvl * 0.5));
  }

  /** The artifact's orb: it swells above the caster, then a beam leaps from it to the target. */
  private orb(from: P, to: P, color: number, style: ElementStyle, lvl: number): void {
    const ox = from.x;
    const oy = from.y - 64;
    this.layer.sigil(from.x, from.y + 2, color, 30 + 14 * lvl, 600, 0.6);
    this.layer.glow(ox, oy, color, 0.3, 1.3, 260, 0.95);
    this.layer.puff("mote", ox, oy, 6, color);
    this.later(240, () => {
      const ty = to.y - 22;
      const ang = Math.atan2(ty - oy, to.x - ox);
      const dist = Math.hypot(to.x - ox, ty - oy);
      this.layer.ray(to.x, ty, ang, dist + 20, 14 + 6 * lvl, color, 320);
      this.layer.ray(to.x, ty, ang, dist + 20, 5, 0xffffff, 240);
      this.layer.glow(ox, oy, 0xffffff, 0.6, 0.2, 200, 0.9);
      this.impact(to.x, ty, style, color, lvl * 0.6);
    });
  }

  /** A great blow of the bonded artifact: a huge formation, a flash of the view, the spell of its element at full strength. */
  private great(from: P, to: P, color: number, style: ElementStyle, lvl: number): void {
    this.layer.sigil(from.x, from.y + 2, color, 70, 900, 0.8, 0.95);
    this.layer.ring(from.x, from.y + 6, color, 0.4, 2.6, 800, 0.9);
    this.layer.glow(from.x, from.y - 30, 0xffffff, 0.6, 3.2, 420, 0.8);
    const me = this.selfId();
    if (me && (to.x !== from.x || to.y !== from.y)) {
      const mine = this.posOf(me);
      if (mine && Math.hypot(mine.x - from.x, mine.y - from.y) < 60) this.scene.cameras.main.flash(140, 255, 255, 255, false);
    }
    this.later(260, () => this.spell(from, to, color, style === "plain" ? "kim" : style, Math.min(1, lvl + 0.35)));
  }

  /** A bubble of light round the caster, hexagons crossing it: a ward. */
  private dome(at: P, color: number, id: string): void {
    this.layer.sigil(at.x, at.y + 2, color, 40, 1000, 0.7);
    this.layer.ring(at.x, at.y + 4, color, 0.3, 1.2, 700, 0.8);
    this.shot(1100, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      const a = Math.sin(Math.min(1, p) * Math.PI);
      const rx = 34;
      const ry = 50;
      const cy = now.y - 6;
      g.fillStyle(color, 0.2 * a).beginPath().moveTo(now.x - rx, cy);
      for (let i = 0; i <= 20; i++) g.lineTo(now.x - rx * Math.cos((i / 20) * Math.PI), cy - ry * Math.sin((i / 20) * Math.PI));
      g.closePath().fillPath();
      g.lineStyle(2, 0xffffff, 0.7 * a).beginPath().moveTo(now.x - rx, cy);
      for (let i = 0; i <= 20; i++) g.lineTo(now.x - rx * Math.cos((i / 20) * Math.PI), cy - ry * Math.sin((i / 20) * Math.PI));
      g.strokePath();
      for (let k = 1; k <= 2; k++) g.lineStyle(1.5, color, 0.6 * a).strokeEllipse(now.x, cy - 4, rx * 2 * (1 - k * 0.3), ry * 0.5 * (1 - k * 0.3));
      g.lineStyle(1.5, color, 0.6 * a).lineBetween(now.x, cy, now.x, cy - ry).lineBetween(now.x - rx * 0.7, cy, now.x - rx * 0.4, cy - ry * 0.8).lineBetween(now.x + rx * 0.7, cy, now.x + rx * 0.4, cy - ry * 0.8);
    });
    this.layer.puff("spark", at.x, at.y - 30, 6, 0xffffff);
  }

  /** Fire climbing round the caster and rings of a roar going out: strength. */
  private flames(at: P, color: number, id: string): void {
    this.layer.sigil(at.x, at.y + 2, 0xff6a3a, 40, 900, 1, 0.85);
    this.layer.glow(at.x, at.y - 24, 0xff5a2a, 0.6, 2.4, 700, 0.6);
    this.shot(950, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      for (let i = 0; i < 3; i++) {
        const q = Math.min(1, Math.max(0, p * 1.6 - i * 0.22));
        g.lineStyle(3, 0xffb070, 0.8 * (1 - q)).strokeEllipse(now.x, now.y - 24, 30 + 90 * q, 15 + 45 * q);
      }
      for (let k = 0; k < 2; k++) this.layer.puff("ember", now.x + (Math.random() - 0.5) * 36, now.y - 4 - Math.random() * 12, 1, k ? 0xffe9a0 : color);
    });
  }

  /** A swirl of wind climbing round the caster, leaves in it. */
  private wind(at: P, color: number, id: string): void {
    this.layer.sigil(at.x, at.y + 2, 0xb8f5c0, 38, 900, 1.4, 0.8);
    this.shot(950, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      const a = Math.sin(Math.min(1, p) * Math.PI);
      for (let i = 0; i < 6; i++) {
        const u = i / 5;
        const ang = p * 14 + u * 4;
        g.lineStyle(2, i % 2 ? 0xe8fff0 : color, 0.8 * a).strokeEllipse(now.x + Math.cos(ang) * 4, now.y - 4 - u * 60, 36 - 10 * u, 14 - 4 * u);
      }
      if (Math.random() < 0.5) this.layer.puff("petal", now.x + (Math.random() - 0.5) * 30, now.y - 10 - Math.random() * 40, 1, 0xb8f5c0);
    });
  }

  /** A talisman: the formation stands upright over the caster's head, turning, over a circle on the ground. */
  private seal(at: P, color: number): void {
    this.layer.sigil(at.x, at.y + 2, color, 34, 1000, 0.8, 0.8);
    this.layer.emblem(at.x, at.y - 64, color, 54, 1000);
    this.layer.puff("spark", at.x, at.y - 60, 8, color);
  }

  /** An alchemist's furnace: pills of light circle the caster and rise, steam going up. */
  private furnace(at: P, color: number, id: string): void {
    this.layer.sigil(at.x, at.y + 2, color, 34, 1000, 0.5, 0.8);
    this.layer.puff("smoke", at.x, at.y - 10, 5, 0xe8f5e8);
    this.shot(1000, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      for (let i = 0; i < 6; i++) {
        const ang = p * 7 + (i / 6) * Math.PI * 2;
        const h = 8 + p * 44 + (i % 2) * 8;
        g.fillStyle(i % 2 ? 0xffe58a : color, 0.9 * (1 - p * 0.7)).fillCircle(now.x + Math.cos(ang) * 22, now.y - h + Math.sin(ang) * 10, 3.2);
      }
    });
  }

  /** A golden bell standing over the caster, ringing: an unbreakable body. */
  private bell(at: P, color: number, id: string): void {
    this.layer.sigil(at.x, at.y + 2, 0xffd54a, 38, 1100, 0.6, 0.85);
    this.layer.ring(at.x, at.y + 2, 0xffe58a, 0.3, 1.6, 800, 0.9);
    this.shot(1200, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      const a = Math.sin(Math.min(1, p) * Math.PI);
      const pts: P[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const w = 12 + 30 * Math.pow(u, 2.2); // narrow at the crown, flaring at the lip
        pts.push({ x: now.x + w, y: now.y - 70 + u * 66 });
      }
      for (let i = 12; i >= 0; i--) {
        const u = i / 12;
        pts.push({ x: now.x - (12 + 30 * Math.pow(u, 2.2)), y: now.y - 70 + u * 66 });
      }
      g.fillStyle(0xffd54a, 0.28 * a).lineStyle(2.5, 0xfff0b0, 0.9 * a).beginPath().moveTo(pts[0]?.x ?? now.x, pts[0]?.y ?? now.y);
      for (const q of pts) g.lineTo(q.x, q.y);
      g.closePath().fillPath().strokePath();
      g.fillStyle(0xfff0b0, 0.9 * a).fillCircle(now.x, now.y - 76, 4);
      if (p > 0.15 && !g.getData("ring")) {
        g.setData("ring", true);
        this.layer.puff("shard", now.x, now.y - 40, 8, 0xffe58a);
        this.layer.puff("spark", now.x, now.y - 40, 8, 0xffffff);
      }
    });
  }

  /** A fire-bird's wings spread behind the caster and embers rise: new life. */
  private phoenix(at: P, id: string): void {
    this.layer.sigil(at.x, at.y + 2, 0xff9a4a, 40, 1100, 0.7, 0.9);
    this.layer.glow(at.x, at.y - 30, 0xffb070, 0.6, 3.4, 800, 0.7);
    this.layer.puff("ember", at.x, at.y - 6, 14, 0xff8a3a);
    this.layer.puff("mote", at.x, at.y - 10, 8, 0xffe9a0);
    this.shot(1100, FX_DEPTH, (g, p) => {
      const now = this.posOf(id) ?? at;
      const open = Math.min(1, p * 3.5) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
      for (const side of [-1, 1]) {
        for (let f = 0; f < 6; f++) {
          const a = -0.25 - f * 0.28;
          const len = (34 + f * 7) * open;
          g.lineStyle(4 - f * 0.4, f % 2 ? 0xffe9a0 : 0xff7a2a, 0.85 * open).lineBetween(now.x + side * 8, now.y - 30, now.x + side * (8 + Math.cos(a) * len * 1.2), now.y - 30 + Math.sin(a) * len);
        }
      }
      g.fillStyle(0xff7a2a, 0.35 * open).fillEllipse(now.x, now.y - 28, 22, 40);
    });
  }

  /**
   * The special look of a skill (`skillLooks`): returns true when it drew the skill whole. The common ones (the spell of an element, an aura, a lotus,
   * a blink) are drawn by the kind of skill in `skill`.
   */
  private styled(look: SkillLook, from: P | null, target: P | null, id: string, color: number, style: ElementStyle, lvl: number, buffColor: number): boolean {
    switch (look) {
      case "palm":
        if (target) this.melee(target, color, style, from ?? undefined, lvl, "chuong");
        return !!target;
      case "slash":
        if (target) {
          this.melee(target, color, style, from ?? undefined, lvl, "tram");
          this.layer.crescent(target.x, target.y - 26, 0.9, 130 + 40 * lvl, 0xffffff, 300);
          this.layer.crescent(target.x, target.y - 26, -0.9, 130 + 40 * lvl, color, 340);
        }
        return !!target;
      case "finger":
        if (from && target) this.finger(from, target, color, style, lvl);
        return !!(from && target);
      case "sword":
        if (from && target) this.swords(from, target, color, lvl, 3 + Math.round(4 * lvl));
        return !!(from && target);
      case "orb":
        if (from && target) this.orb(from, target, color, style, lvl);
        return !!(from && target);
      case "great":
        if (from && target) this.great(from, target, color, style, lvl);
        return !!(from && target);
      case "dome":
        if (from) this.dome(from, buffColor, id);
        return !!from;
      case "flames":
        if (from) this.flames(from, buffColor, id);
        return !!from;
      case "wind":
        if (from) this.wind(from, buffColor, id);
        return !!from;
      case "seal":
        if (from) this.seal(from, buffColor);
        return !!from;
      case "furnace":
        if (from) this.furnace(from, buffColor, id);
        return !!from;
      case "bell":
        if (from) this.bell(from, buffColor, id);
        return !!from;
      case "phoenix":
        if (from) this.phoenix(from, id);
        return !!from;
      default:
        return false;
    }
  }

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
  private swords(from: P, to: P, color: number, lvl: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      this.later(i * 90, () => {
        const mid = (count - 1) / 2;
        const fx = from.x + (i - mid) * 14;
        const fy = from.y - 46 - Math.abs(i - mid) * 7;
        const tx = to.x;
        const ty = to.y - 22;
        const dur = 260;
        this.shot(dur + 120, FX_DEPTH, (g, p) => {
          const t = Math.min(1, (p * (dur + 120)) / dur);
          const arc = Math.sin(t * Math.PI) * (26 + 12 * (i % 3));
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
            this.layer.crescent(tx - 14, ty - 6, ang + i * 0.5, 110 + 40 * lvl, color, 300);
            this.impact(tx, ty, "kim", color, lvl * 0.6);
            if (i === count - 1) {
              this.layer.glow(tx, ty, 0xffffff, 0.6, 3, 360, 0.9);
              this.layer.ring(tx, ty + 14, color, 0.3, 1.8 + lvl, 480, 0.9);
              this.shake(lvl, { x: tx, y: ty });
            }
          }
        });
      });
    }
  }

  /** Runs `fn` after `ms`, unless the effects were cleared meanwhile (a new map must not get the last map's blast). */
  private later(ms: number, fn: () => void): void {
    const epoch = this.epoch;
    this.scene.time.delayedCall(ms, () => {
      if (epoch === this.epoch) fn();
    });
  }

  /** A small shake of the view for a heavy blow at `at`: only when the effect is strong and lands near you (a crowded map must not shake all the time). */
  private shake(lvl: number, at: P): void {
    if (lvl <= 0.45) return;
    const me = this.selfId();
    const p = me ? this.posOf(me) : null;
    if (p && Math.hypot(p.x - at.x, p.y - at.y) < 170) this.scene.cameras.main.shake(130, 0.0015 + 0.003 * lvl);
  }

  /**
   * The spell of an element thrown at a target: what lands is the sign of that element, not a plain bolt. Fire falls from the sky as a meteor and
   * bursts, metal is a flight of swords, ice rises from the ground in spikes and shatters, lightning strikes again and again, wood is thorns erupting,
   * water a geyser, earth a falling boulder, wind a tornado. `lvl` (0..1) is the strength of the skill: more swords, more spikes, a bigger blast.
   */
  private spell(from: P, to: P, color: number, style: ElementStyle, lvl: number): void {
    switch (style) {
      case "hoa":
        return this.meteor(to, lvl);
      case "kim":
        return this.swords(from, to, color, lvl, 3 + Math.round(4 * lvl));
      case "bang":
        return this.iceSpikes(to, lvl);
      case "loi":
        return this.thunder(to, color, lvl);
      case "moc":
        return this.thorns(to, lvl);
      case "thuy":
        return this.geyser(to, lvl);
      case "tho":
        return this.boulder(to, lvl);
      case "phong":
        return this.tornado(to, lvl);
      default:
        return this.bolt(from, to, color, style, false, lvl);
    }
  }

  /** The blast of a fire spell on the ground: a swelling fireball, a shock ring, flying embers and smoke, and a scorch mark that stays a while. */
  private blast(x: number, y: number, lvl: number): void {
    const L = this.layer;
    L.glow(x, y - 8, 0xffd08a, 0.8, 3.2 + 2 * lvl, 420, 0.95);
    L.glow(x, y - 8, 0xff6a2a, 0.6, 4.4 + 2.4 * lvl, 560, 0.7);
    L.ring(x, y + 12, 0xffa04a, 0.3, 2 + 1.4 * lvl, 560, 0.95);
    L.puff("ember", x, y - 4, 16 + Math.round(12 * lvl), 0xff7a2a);
    L.puff("ember", x, y - 4, 6, 0xffe9a0);
    L.puff("spark", x, y - 8, 8, 0xffffff);
    L.puff("smoke", x, y - 10, 6, 0x4a3c38);
    this.shot(1300, 0.62, (g, p) => {
      g.fillStyle(0x1a120e, 0.5 * (1 - p)).fillEllipse(x, y + 10, 70 + 30 * lvl, 30 + 12 * lvl);
    });
    this.shot(480, FX_DEPTH, (g, p) => {
      g.lineStyle(5 * (1 - p) + 1, 0xffd08a, 1 - p).strokeEllipse(x, y + 6, 30 + 190 * p * (0.7 + 0.5 * lvl), 15 + 90 * p * (0.7 + 0.5 * lvl));
    });
    this.shake(lvl, { x, y });
  }

  /** A fireball falls from the sky onto the target and bursts. */
  private meteor(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y - 6;
    const sx = tx - 90;
    const sy = ty - 330;
    const dur = 460;
    this.layer.ring(tx, ty + 12, 0xff7a2a, 0.15, 0.8, dur, 0.5); // the mark on the ground a moment before it lands
    this.shot(dur, FX_DEPTH, (g, p) => {
      const t = p * p * (0.35 + 0.65 * p);
      const x = sx + (tx - sx) * t;
      const y = sy + (ty - sy) * t;
      g.fillStyle(0xff5a1a, 0.3).fillCircle(x, y, 30 + 10 * lvl);
      g.fillStyle(0xff8a2a, 0.9).fillCircle(x, y, 17 + 6 * lvl);
      g.fillStyle(0xffe9a0, 1).fillCircle(x, y, 9);
      this.layer.puff("ember", x - 6, y - 6, 2, 0xff7a2a);
      if (Math.random() < 0.5) this.layer.puff("smoke", x - 10, y - 12, 1, 0x4a3c38);
    });
    this.later(dur, () => {
      this.blast(tx, ty, lvl);
      this.impact(tx, ty - 16, "hoa", 0xff7a45, lvl * 0.4);
    });
  }

  /** Spikes of ice grow out of the ground round the target, hold, and shatter. */
  private iceSpikes(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y + 6;
    const n = 6 + Math.round(4 * lvl);
    const spikes = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = i % 2 ? 30 : 16;
      return { x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r * 0.5, lean: Math.cos(a) * 9, h: (38 + 34 * lvl) * (i % 2 ? 0.75 : 1.1), wait: (i % 3) * 0.04 };
    });
    this.layer.sigil(tx, ty, 0x9ee7ff, 46 + 14 * lvl, 800, 0.5);
    this.shot(950, FX_DEPTH, (g, p) => {
      for (const s of spikes) {
        const grow = Math.min(1, Math.max(0, (p - s.wait) / 0.18));
        const out = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
        if (grow <= 0 || out <= 0) continue;
        const h = s.h * (1 - (1 - grow) * (1 - grow));
        const w = 7 + 3 * lvl;
        g.fillStyle(0x8fd8ff, 0.9 * out).fillTriangle(s.x - w, s.y, s.x + w, s.y, s.x + s.lean * grow, s.y - h);
        g.fillStyle(0xe6fbff, 0.9 * out).fillTriangle(s.x - w * 0.2, s.y, s.x + w, s.y, s.x + s.lean * grow, s.y - h);
        g.lineStyle(1.5, 0xffffff, 0.9 * out).lineBetween(s.x - w, s.y, s.x + s.lean * grow, s.y - h);
      }
      if (p > 0.72 && !g.getData("shatter")) {
        g.setData("shatter", true);
        this.layer.puff("shard", tx, ty - 16, 14 + Math.round(8 * lvl), 0xc8f4ff);
        this.layer.puff("spark", tx, ty - 20, 8, 0xffffff);
        this.layer.glow(tx, ty - 18, 0xbfeaff, 0.6, 2.2, 360, 0.8);
      }
    });
    this.later(120, () => this.impact(tx, ty - 16, "bang", 0x9ee7ff, lvl * 0.4));
    this.shake(lvl * 0.7, { x: tx, y: ty });
  }

  /** Lightning strikes the target again and again, one blow after another. */
  private thunder(to: P, color: number, lvl: number): void {
    const n = 2 + Math.round(3 * lvl);
    for (let i = 0; i < n; i++) {
      this.later(i * 110, () => {
        const x = to.x + (i === 0 ? 0 : (Math.random() - 0.5) * 60);
        const y = to.y - 8 + (i === 0 ? 0 : (Math.random() - 0.5) * 24);
        this.strike(x, y, color);
        this.layer.glow(x, y - 10, 0xf0e0ff, 0.5, 2 + lvl, 260, 0.9);
        this.layer.puff("spark", x, y - 10, 8, 0xf0e0ff);
        if (i === 0) this.layer.sigil(to.x, to.y + 6, color, 50 + 14 * lvl, 700, 0.5);
      });
    }
    this.later(n * 110, () => this.layer.ring(to.x, to.y + 14, color, 0.3, 1.8 + lvl, 500, 0.9));
    this.shake(lvl, to);
  }

  /** Thorned vines burst out of the ground round the target and lash up, throwing leaves. */
  private thorns(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y + 6;
    const n = 6 + Math.round(3 * lvl);
    const vines = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: tx + Math.cos(a) * 24, y: ty + Math.sin(a) * 12, h: 46 + 30 * lvl, sway: (i % 2 ? 1 : -1) * (12 + (i % 3) * 5), wait: (i % 3) * 0.05 };
    });
    this.layer.sigil(tx, ty, 0x6fcf6f, 46 + 12 * lvl, 800, 0.5);
    this.shot(900, FX_DEPTH, (g, p) => {
      const out = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
      for (const v of vines) {
        const grow = Math.min(1, Math.max(0, (p - v.wait) / 0.3));
        if (grow <= 0 || out <= 0) continue;
        const pts: P[] = [];
        for (let k = 0; k <= 8; k++) {
          const u = (k / 8) * grow;
          pts.push({ x: v.x + Math.sin(u * 3 + p * 4) * v.sway * u + (tx - v.x) * u * 0.5, y: v.y - v.h * u });
        }
        for (const [w, c] of [[6, 0x2f7d38], [3, 0x6fcf6f]] as const) {
          g.lineStyle(w * (1 - 0.4 * grow), c, out).beginPath().moveTo(pts[0]?.x ?? v.x, pts[0]?.y ?? v.y);
          for (const q of pts) g.lineTo(q.x, q.y);
          g.strokePath();
        }
        const tip = pts[pts.length - 1];
        if (tip) {
          g.fillStyle(0xd6ffcf, out);
          this.diamond(g, tip.x, tip.y, -1.2, 7, 2.6);
        }
      }
      if (p > 0.3 && !g.getData("leaves")) {
        g.setData("leaves", true);
        this.layer.puff("petal", tx, ty - 24, 12 + Math.round(6 * lvl), 0x8fe08f);
        this.layer.puff("mote", tx, ty - 10, 6, 0xd6ffcf);
      }
    });
    this.later(160, () => this.impact(tx, ty - 16, "moc", 0x6fcf6f, lvl * 0.4));
  }

  /** A geyser of water bursts up under the target and falls back in drops. */
  private geyser(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y + 8;
    this.layer.sigil(tx, ty, 0x5aa9ff, 46 + 12 * lvl, 750, 0.5);
    this.layer.ring(tx, ty, 0x9fd0ff, 0.2, 1.6 + lvl, 600, 0.9);
    this.shot(820, FX_DEPTH, (g, p) => {
      const up = Math.sin(Math.min(1, p / 0.75) * Math.PI * 0.5);
      const fall = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      const h = (90 + 50 * lvl) * up * fall;
      const w = 15 + 7 * lvl;
      if (h > 1) {
        g.fillStyle(0x5aa9ff, 0.55 * fall).fillRect(tx - w, ty - h, w * 2, h);
        g.fillStyle(0xbfe3ff, 0.7 * fall).fillRect(tx - w * 0.45, ty - h, w * 0.9, h);
        g.fillStyle(0xdff1ff, 0.9 * fall).fillEllipse(tx, ty - h, w * 2.6, w * 1.1);
        g.fillStyle(0x5aa9ff, 0.5 * fall).fillEllipse(tx, ty, w * 3, w * 1.2);
      }
      if (p > 0.45 && !g.getData("splash")) {
        g.setData("splash", true);
        this.layer.puff("drop", tx, ty - 60, 16 + Math.round(8 * lvl), 0x8fd0ff);
        this.layer.puff("spark", tx, ty - 50, 6, 0xe6f6ff);
      }
    });
    this.later(140, () => this.impact(tx, ty - 22, "thuy", 0x5aa9ff, lvl * 0.4));
  }

  /** A boulder falls from the sky onto the target and breaks in a cloud of dust. */
  private boulder(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y - 4;
    const sx = tx + 40;
    const sy = ty - 300;
    const dur = 430;
    const r = 18 + 8 * lvl;
    this.layer.ring(tx, ty + 14, 0xc49a5a, 0.15, 0.9, dur, 0.55);
    this.shot(dur, FX_DEPTH, (g, p) => {
      const t = p * p * (0.35 + 0.65 * p);
      const x = sx + (tx - sx) * t;
      const y = sy + (ty - sy) * t;
      g.fillStyle(0x6b4a2a, 1).fillCircle(x, y, r);
      g.fillStyle(0x8a6a3a, 1).fillCircle(x - r * 0.25, y - r * 0.25, r * 0.7);
      g.fillStyle(0xb48a52, 1).fillCircle(x - r * 0.4, y - r * 0.4, r * 0.3);
      g.lineStyle(2, 0x2a1c0e, 1).strokeCircle(x, y, r);
      this.layer.puff("smoke", x, y - r, 1, 0x8a6a3a);
    });
    this.later(dur, () => {
      const L = this.layer;
      L.puff("shard", tx, ty - 6, 14 + Math.round(8 * lvl), 0xb48a52);
      L.puff("smoke", tx, ty + 4, 8, 0x9a7a4a);
      L.glow(tx, ty - 6, 0xe0c48a, 0.5, 2.4 + lvl, 320, 0.7);
      L.ring(tx, ty + 12, 0xc49a5a, 0.3, 2 + lvl, 520, 0.95);
      this.shot(1100, 0.62, (g, p) => {
        g.fillStyle(0x2a1c0e, 0.45 * (1 - p)).fillEllipse(tx, ty + 12, 56 + 20 * lvl, 24 + 8 * lvl);
      });
      this.impact(tx, ty - 16, "tho", 0xc49a5a, lvl * 0.4);
      this.shake(lvl, { x: tx, y: ty });
    });
  }

  /** A tornado stands up on the target, whirling, then breaks into wisps. */
  private tornado(to: P, lvl: number): void {
    const tx = to.x;
    const ty = to.y + 6;
    this.layer.sigil(tx, ty, 0xb8f5c0, 46 + 12 * lvl, 800, 1, 0.8);
    this.shot(900, FX_DEPTH, (g, p) => {
      const grow = Math.min(1, p / 0.25);
      const out = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
      const rings = 9;
      for (let i = 0; i < rings; i++) {
        const u = i / (rings - 1);
        const x = tx + Math.sin(p * 18 + u * 5) * (5 + 6 * u);
        const y = ty - u * (100 + 40 * lvl) * grow;
        const rx = (10 + 26 * u) * (0.6 + 0.4 * grow);
        g.lineStyle(3, i % 2 ? 0xe8fff0 : 0xb8f5c0, (0.9 - 0.4 * u) * out).strokeEllipse(x, y, rx * 2, rx * 0.8);
      }
      if (Math.random() < 0.6) this.layer.puff("smoke", tx + (Math.random() - 0.5) * 40, ty - Math.random() * 80, 1, 0xcdf7dc);
      if (p > 0.7 && !g.getData("end")) {
        g.setData("end", true);
        this.layer.puff("spark", tx, ty - 50, 10, 0xe8fff0);
      }
    });
    this.later(160, () => this.impact(tx, ty - 22, "phong", 0xb8f5c0, lvl * 0.4));
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

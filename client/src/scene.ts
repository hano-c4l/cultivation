import Phaser from "phaser";
import {
  equipmentInfo,
  MP_REGEN_PER_S,
  REGEN_PER_S,
  getItemDef,
  getSkill,
  type SkillDef,
  type SkillContext,
  type SpiritualRoot,
  type SkillStateView,
  type EquippedItem,
  effectiveSkill,
  gearSkillInfo,
  skillGrade,
  refineLevelOf,
  TILE_H,
  TILE_W,
  ATTACK_MIN_GAP_MS,
  MIN_MOVE_INTERVAL_MS,
  RANKS,
  REALMS,
  getMonsterDef,
  levelIndex,
  type CharacterSheet,
  type MonsterRank,
  type MonsterSnapshot,
  CELLS_PER_TILE,
  findSmoothPath,
  getMap,
  isCellWalkable,
  isMapId,
  portalNear,
  positionAlongPath,
  type MapData,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec2,
} from "@game/shared";
import { initCharacterPanel, type CharacterPanel } from "./character-ui";
import { initChat, type ChatUi } from "./chat-ui";
import { setCatalog } from "./constitution-store";
import { itemTierText } from "./equip-text";
import { initEquipment, type EquipmentUi } from "./equipment-ui";
import { initBuffs, type BuffsUi } from "./buffs-ui";
import { initHotbar, type HotbarUi } from "./hotbar-ui";
import { initSkills, type SkillsUi } from "./skills-ui";
import { initInventory, type InventoryUi } from "./inventory-ui";
import { initVitals, type VitalsUi } from "./vitals-ui";
import { DEFAULT_CHANNEL } from "./config";
import { vi } from "./locales/vi";
import { Net } from "./net";

const FONT = '"Be Vietnam Pro", system-ui, sans-serif';

const ELEMENT_COLOR: Record<string, number> = { kim: 0xe0e0e0, moc: 0x4caf50, thuy: 0x2196f3, hoa: 0xff5722, tho: 0x9c7a5b };
/** A click within this many screen pixels of a monster (around its body) targets it instead of walking. */
const MONSTER_PICK_PX = 34;

/** Converts continuous tile coordinates to isometric screen pixels. */
function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Inverse of toScreen. */
function toTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

interface Actor {
  id: string;
  path: Vec2[];
  startedAt: number; // local performance.now() timestamp
  speed: number;
  /** Visual error (tiles) between the previous track and the new one; decays to zero so path swaps never snap. */
  offX: number;
  offY: number;
  offAt: number;
  body: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
}

interface MonsterActor {
  id: string;
  tier: number;
  rank: MonsterRank;
  /** The element rolled when it (re)spawned: it shows in the name and in the colour of the body. */
  element: SpiritualRoot;
  path: Vec2[];
  startedAt: number;
  speed: number;
  hp: number;
  maxHp: number;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  /** Last label colour applied; Text.setColor redraws the text texture, so it is only called on a change. */
  color: string;
}

/** Time constant (ms) for blending away the offset left by a path correction. */
const CORRECTION_TAU_MS = 150;
/** Corrections larger than this many tiles snap instead of blending. */
const MAX_BLEND_TILES = 3;

/** Rendered position: authoritative/predicted track plus the decaying correction offset. */
function currentPos(actor: Actor, now: number): { x: number; y: number; moving: boolean } {
  const auth = positionAlongPath(actor.path, now - actor.startedAt, actor.speed);
  const k = Math.exp(-(now - actor.offAt) / CORRECTION_TAU_MS);
  return { x: auth.x + actor.offX * k, y: auth.y + actor.offY * k, moving: auth.moving };
}

/** Swaps in a new track while keeping the rendered position continuous (blended, or snapped if far). */
function applyTrack(actor: Actor, path: Vec2[], startedAt: number, speed: number, now: number): void {
  const before = currentPos(actor, now);
  actor.path = path;
  actor.speed = speed;
  actor.startedAt = startedAt;
  const auth = positionAlongPath(path, now - startedAt, speed);
  const dx = before.x - auth.x;
  const dy = before.y - auth.y;
  const far = Math.hypot(dx, dy) > MAX_BLEND_TILES;
  actor.offX = far ? 0 : dx;
  actor.offY = far ? 0 : dy;
  actor.offAt = now;
}

export class GameScene extends Phaser.Scene {
  private map: MapData = getMap("town");
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private actors = new Map<string, Actor>();
  private monsters = new Map<string, MonsterActor>();
  private targetId: string | null = null;
  private selfSheet: CharacterSheet | null = null;
  private lastAttackSentAt = 0;
  private selfId = "";
  private net!: Net;
  private chatNet!: Net;
  private chat!: ChatUi;
  private inventory!: InventoryUi;
  private equipment!: EquipmentUi;
  private hotbar!: HotbarUi;
  private buffs!: BuffsUi;
  /** Mastery of the skills that have it, and the worn gear: what the numbers a skill is shown with depend on. */
  private skillStates: SkillStateView = {};
  private worn: EquippedItem[] = [];
  /** The teleport skill waiting for a point on the map; the next click gives it (Esc cancels). */
  private aiming: SkillDef | null = null;
  private skillsUi!: SkillsUi;
  /** The skills last announced, to report a new one. */
  private knownSkills: string[] | null = null;
  /** Level of the worn pháp bảo bản mệnh, to report level-ups. */
  private bondedLv: number | undefined;
  private charPanel!: CharacterPanel;
  private vitals!: VitalsUi;
  private hud!: HTMLElement;
  private ping = 0;
  private pingSentAt = 0;
  private moveSeq = 0;
  private lastMoveSentAt = 0;
  private colo = "…";
  private portalSentAt = 0;
  private transferring = false;
  private marker!: Phaser.GameObjects.Graphics;

  constructor() {
    super("game");
  }

  create(): void {
    this.hud = document.getElementById("hud")!;
    this.drawMap();
    this.marker = this.add.graphics().setDepth(1);
    this.chat = initChat((channel, text, to) => {
      if (channel === "map") return this.net.send({ t: "chat", channel, text });
      // World chat and whispers use the chat socket; without it they would vanish silently.
      if (!this.chatNet.isOpen()) return this.chat.system(vi.chat.chatUnavailable, "error");
      this.chatNet.send(to ? { t: "chat", channel, text, to } : { t: "chat", channel, text });
    }, this.registry.get("isAdmin") === true);
    this.vitals = initVitals();
    this.hotbar = initHotbar({
      // A skill is an action: during a breakthrough it would end it (hotbar potions are fine).
      send: (msg) => {
        if (msg.t === "cast" && this.guardBreakthrough()) return;
        this.net.send(msg);
      },
      aim: (skill) => this.beginAim(skill),
      mpCostOf: (skill) => effectiveSkill(skill, this.skillContext(skill)).mpCost,
      getTarget: () => this.targetId,
      getMp: () => this.vitals.getMp(),
      contextOf: (skill) => this.skillContext(skill),
      countOf: (type) => this.inventory.list().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0),
    });
    this.buffs = initBuffs();
    this.skillsUi = initSkills({
      beginAssign: (value, label) => this.hotbar.beginAssign(value, label),
      boost: (skill) => this.net.send({ t: "skill_boost", skill }),
      pillCount: () => this.inventory.list().filter((i) => getItemDef(i.type)?.masteryPills !== undefined).reduce((n, i) => n + i.qty, 0),
    });
    this.inventory = initInventory((msg) => this.net.send(msg), (value, label) => this.hotbar.beginAssign(value, label));
    this.equipment = initEquipment((msg) => this.net.send(msg), () => this.inventory.list());
    this.charPanel = initCharacterPanel({
      sendAllocate: (points) => this.net.send({ t: "allocate", points }),
      startBreakthrough: (pills) => this.net.send({ t: "bt_start", pills }),
      cancelBreakthrough: () => this.net.send({ t: "bt_cancel" }),
      countOf: (type) => this.inventory.list().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0),
    });

    const camera = this.cameras.main;
    const center = toScreen(this.map.spawn[0] + 0.5, this.map.spawn[1] + 0.5);
    camera.centerOn(center.x, center.y);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.aiming) this.endAim();
    });

    // Channel picks which Durable Object (and so which Cloudflare data centre) serves us; override with ?ch=N.
    // The map is chosen by the server from the character's saved position.
    const channel = Number(new URLSearchParams(location.search).get("ch")) || DEFAULT_CHANNEL;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.net = new Net(`${proto}://${location.host}/ws?ch=${channel}`, {
      onMessage: (msg) => this.handleMessage(msg),
      onAuthLost: () => location.reload(),
      onPong: () => {
        this.ping = Math.max(0, Math.round(performance.now() - this.pingSentAt));
        this.refreshHud();
      },
      onStatus: (connected) => {
        if (!connected) {
          this.hud.textContent = this.transferring ? vi.transferring : vi.disconnected;
          this.clearActors();
        }
      },
    });
    this.net.connect();

    // Second socket for world chat and whispers: it survives portals and deaths, which reconnect the game socket.
    this.chatNet = new Net(`${proto}://${location.host}/ws/chat`, {
      onMessage: (msg) => this.handleChatMessage(msg),
      onAuthLost: () => undefined, // the game socket reloads the page
      onPong: () => undefined,
      onStatus: () => undefined,
    });
    this.chatNet.connect();

    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        this.pingSentAt = performance.now();
        this.net.sendPing();
      },
    });
    // The chat socket needs no round-trip timing, only a keep-alive, so it pings far less often.
    this.time.addEvent({ delay: 30_000, loop: true, callback: () => this.chatNet.sendPing() });
  }

  /** (Re)draws the current map's tiles and portals, destroying whatever was drawn for the previous map. */
  private drawMap(): void {
    for (const obj of this.mapObjects) obj.destroy();
    this.mapObjects = [];

    // Draw the ground once into a texture: the fine collision cells can add up to thousands of polygons, and
    // replaying them every frame (Canvas renderer) would be wasteful for a static map.
    const g = this.make.graphics({}, false);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const p = toScreen(x, y);
        g.fillStyle((x + y) % 2 === 0 ? 0x3d5a3a : 0x38553a, 1);
        g.lineStyle(1, 0x000000, 0.18);
        const pts = this.diamond(p.x, p.y);
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      }
    }
    // Obstacles: every blocked collision cell, so trees, pillars, ponds and fences show their real shape.
    g.fillStyle(0x5a4a3a, 1);
    const cw = this.map.width * CELLS_PER_TILE;
    const ch = this.map.height * CELLS_PER_TILE;
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        if (isCellWalkable(this.map, cx, cy)) continue;
        const p = toScreen(cx / CELLS_PER_TILE, cy / CELLS_PER_TILE);
        g.fillPoints(this.diamond(p.x, p.y, 1 / CELLS_PER_TILE), true);
      }
    }
    const minX = -this.map.height * (TILE_W / 2);
    const texW = (this.map.width + this.map.height) * (TILE_W / 2) + 2;
    const texH = (this.map.width + this.map.height) * (TILE_H / 2) + TILE_H + 2;
    const ground = this.add.renderTexture(minX, 0, texW, texH).setOrigin(0, 0).setDepth(0);
    ground.draw(g, -minX, 0);
    g.destroy();
    this.mapObjects.push(ground);

    for (const portal of this.map.portals) {
      const p = toScreen(portal.x, portal.y);
      const glow = this.add.graphics().setDepth(0.5);
      glow.fillStyle(0x7b61ff, 0.55).lineStyle(2, 0xd9ccff, 1);
      const pts = this.diamond(p.x, p.y);
      glow.fillPoints(pts, true);
      glow.strokePoints(pts, true);
      const label = this.add
        .text(p.x, p.y - 6, vi.maps[portal.toMap] ?? portal.toMap, {
          fontFamily: FONT,
          fontSize: "12px",
          color: "#e8e0ff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(0.6);
      this.mapObjects.push(glow, label);
    }
  }

  /** Isometric diamond whose top vertex is at (x, y); `scale` 1 is a full tile. */
  private diamond(x: number, y: number, scale = 1): Phaser.Math.Vector2[] {
    const w = (TILE_W / 2) * scale;
    const h = (TILE_H / 2) * scale;
    return [
      new Phaser.Math.Vector2(x, y),
      new Phaser.Math.Vector2(x + w, y + h),
      new Phaser.Math.Vector2(x, y + 2 * h),
      new Phaser.Math.Vector2(x - w, y + h),
    ];
  }

  private switchMap(mapId: string): void {
    if (!isMapId(mapId) || this.map.id === mapId) return;
    this.map = getMap(mapId);
    this.drawMap();
  }

  /** The realm, grade and mastery level a skill works at for this character (the same inputs the server uses). */
  private skillContext(skill: SkillDef): SkillContext {
    const gear = skill.source === "gear" ? gearSkillInfo(this.worn).find((g) => g.id === skill.id) : undefined;
    return { realm: gear ? gear.realm : skill.realm, ...(gear ? { tier: gear.tier } : {}), grade: skillGrade(skill, this.selfSheet?.rootGrade ?? 0, gear?.grade), level: skill.source === "gear" ? 0 : (this.skillStates[skill.id]?.lv ?? 0) };
  }

  private beginAim(skill: SkillDef): void {
    this.aiming = skill;
    this.hotbar.setAimNote(vi.skills.aim(skill.nameVi, skill.range));
  }

  private endAim(): void {
    this.aiming = null;
    this.hotbar.setAimNote(null);
  }

  /** While a breakthrough runs, actions that would break it are not sent; tells the player why. */
  private guardBreakthrough(): boolean {
    if (!this.charPanel.isBreaking()) return false;
    this.chat.system(vi.breakthrough.blocked, "error");
    return true;
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.transferring) return;
    if (this.guardBreakthrough()) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const t = toTile(world.x, world.y);
    // Exact click point (not snapped to a tile centre); 2 decimals keeps messages small.
    const tx = Math.round(t.x * 100) / 100;
    const ty = Math.round(t.y * 100) / 100;
    if (this.aiming) {
      // This click picks the teleport destination instead of walking. A point out of reach keeps the aim so the player can retry.
      const skill = this.aiming;
      const self = this.actors.get(this.selfId);
      const here = self ? currentPos(self, performance.now()) : null;
      if (here && Math.hypot(tx - here.x, ty - here.y) > skill.range) {
        this.chat.system(vi.skills.errors.range!, "error");
        return;
      }
      this.endAim();
      this.net.send({ t: "cast", skill: skill.id, x: tx, y: ty });
      return;
    }
    const picked = this.pickMonster(world.x, world.y);
    if (picked) {
      const nowMs = performance.now();
      if (nowMs - this.lastAttackSentAt >= ATTACK_MIN_GAP_MS + 20) {
        this.lastAttackSentAt = nowMs;
        this.targetId = picked;
        this.net.send({ t: "attack", id: picked });
      }
      return;
    }
    this.targetId = null;
    // Client-side throttle matches the server's, so a dropped click never desyncs the prediction.
    const now = performance.now();
    if (now - this.lastMoveSentAt < MIN_MOVE_INTERVAL_MS + 20) return;
    const from = this.predictSelfMove(tx, ty);
    if (!from) return;
    this.lastMoveSentAt = now;
    this.net.send({ t: "move", x: tx, y: ty, fx: from[0], fy: from[1], seq: ++this.moveSeq });
    const c = toScreen(tx, ty);
    this.marker.clear().lineStyle(2, 0xffe08a, 1).strokeEllipse(c.x, c.y, TILE_W * 0.5, TILE_H * 0.5);
    this.time.delayedCall(500, () => this.marker.clear());
  }

  /** Starts walking immediately using the same path finder as the server. Returns the exact position it started from, or null if no path. */
  private predictSelfMove(tx: number, ty: number): Vec2 | null {
    const self = this.actors.get(this.selfId);
    if (!self) return null;
    const now = performance.now();
    const here = currentPos(self, now);
    const from: Vec2 = [Math.round(here.x * 100) / 100, Math.round(here.y * 100) / 100];
    const path = findSmoothPath(this.map, from, [tx, ty]);
    if (!path) return null;
    applyTrack(self, path, now, self.speed, now);
    return from;
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "welcome":
        this.selfId = msg.self;
        this.endAim();
        this.colo = msg.colo;
        this.transferring = false;
        this.portalSentAt = 0;
        this.switchMap(msg.map);
        this.clearActors();
        this.upsertActor(msg.players);
        for (const m of msg.monsters) this.upsertMonster(m);
        setCatalog(msg.constitutions);
        // A breakthrough never survives a (re)connect: the server settled it as a failure when the old connection ended.
        this.charPanel.breakthroughEnded();
        this.charPanel.update(msg.character);
        this.equipment.setSheet(msg.character);
        this.inventory.setSheet(msg.character);
        this.skillsUi.setSheet(msg.character);
        this.selfSheet = msg.character;
        this.vitals.set(msg.hp, msg.maxHp, { inMs: msg.regenInMs, perSec: REGEN_PER_S });
        this.vitals.setWallet(msg.wallet);
        this.inventory.setBag(msg.bag);
        this.charPanel.refresh();
        this.equipment.setEquipped(msg.equipped);
        const wornBonded = msg.equipped.find((e) => e.slot === "bonded");
        this.bondedLv = wornBonded ? bondedLevel(wornBonded) : undefined;
        this.inventory.setEquipped(msg.equipped);
        this.charPanel.setEquipped(msg.equipped);
        this.inventory.setMail(msg.mail);
        this.knownSkills = msg.skills;
        this.skillStates = msg.skillStates;
        this.worn = msg.equipped;
        this.skillsUi.setStates(msg.skillStates);
        this.charPanel.setSkills(msg.skills, msg.skillStates);
        this.skillsUi.setEquipped(msg.equipped);
        this.skillsUi.setSkills(msg.skills);
        this.hotbar.setSkills(msg.skills);
        this.hotbar.setSlots(msg.hotbar);
        this.vitals.setMp(msg.mp, msg.maxMp, msg.regenInMs, MP_REGEN_PER_S);
        this.buffs.set(msg.effects);
        for (const [skill, ms] of Object.entries(msg.cd)) this.hotbar.setCooldown(skill, ms);
        this.refreshHud();
        break;
      case "mon":
        this.upsertMonster(msg.monster);
        break;
      case "mon_gone":
        this.removeMonster(msg.id);
        break;
      case "hit":
        this.showHit(msg);
        break;
      case "hp":
        this.vitals.set(msg.hp, msg.maxHp);
        break;
      case "died":
        this.chat.system(vi.combat.died(msg.expLost), "important");
        break;
      case "wallet":
        this.vitals.setBalance(msg.currency, msg.balance);
        if (msg.gained) this.chat.system(vi.chat.gainedCurrency(msg.gained, vi.economy.currency[msg.currency]));
        break;
      case "stats": {
        const before = this.selfSheet;
        this.charPanel.update(msg.character);
        this.equipment.setSheet(msg.character);
        this.inventory.setSheet(msg.character);
        this.skillsUi.setSheet(msg.character);
        this.selfSheet = msg.character;
        const c = msg.character;
        if (before && (c.realm > before.realm || (c.realm === before.realm && c.stage > before.stage))) {
          this.chat.system(vi.chat.levelUp(REALMS[c.realm]?.nameVi ?? "", c.stage));
        } else if (before && c.realm === before.realm && c.stage === before.stage && c.exp > before.exp) {
          // EXP from a kill (a stage-up resets the counter, so that case is covered by the line above).
          this.chat.system(vi.chat.gainedExp(c.exp - before.exp));
        }
        break;
      }
      case "joined":
      case "path":
        this.upsertActor([msg.player]);
        this.refreshHud();
        break;
      case "ack":
        // Only corrections carry a track; an accepted move keeps the local prediction untouched.
        if (msg.player) this.upsertActor([msg.player]);
        break;
      case "left":
        this.removeActor(msg.id);
        this.refreshHud();
        break;
      case "kicked":
        this.hud.textContent = vi.kicked;
        this.chatNet.close();
        break;
      case "transfer":
        // The server closes the socket right after; Net reconnects and the welcome brings the new map.
        this.transferring = true;
        this.hud.textContent = vi.transferring;
        this.chat.system(vi.chat.transferTo(vi.maps[msg.map] ?? msg.map), "important");
        break;
      case "inv":
        if (msg.full) this.inventory.setBag({ tabs: msg.tabs, items: msg.items, tabPrice: msg.tabPrice });
        else this.inventory.applyDelta(msg.tabs, msg.items, msg.removed);
        this.charPanel.refresh();
        this.equipment.refresh();
        this.hotbar.refresh();
        this.skillsUi.refresh(); // the pill count
        break;
      case "eq": {
        // The pháp bảo bản mệnh reaching a new training level is worth a line.
        const bonded = msg.items.find((e) => e.slot === "bonded");
        const level = bonded ? bondedLevel(bonded) : undefined;
        if (bonded && level !== undefined && this.bondedLv !== undefined && level > this.bondedLv) {
          this.chat.system(vi.equip.refined(getItemDef(bonded.type)?.nameVi ?? bonded.type, itemTierText(bonded.type, bonded.lv) ?? ""));
        }
        this.bondedLv = level;
        this.equipment.setEquipped(msg.items);
        this.inventory.setEquipped(msg.items);
        this.charPanel.setEquipped(msg.items);
        this.worn = msg.items;
        this.skillsUi.setEquipped(msg.items); // gear skills take the realm and grade of the piece
        this.hotbar.refresh();
        break;
      }
      case "skills": {
        // A new skill (a stage-up unlocked it, or a book taught it) is worth a line.
        if (this.knownSkills) {
          for (const id of msg.ids.filter((s) => !this.knownSkills!.includes(s))) this.chat.system((getSkill(id)?.source === "root" ? vi.skills.rootGranted : getSkill(id)?.source === "gear" ? vi.skills.gearGranted : vi.skills.learned)(getSkill(id)?.nameVi ?? id), "important");
        }
        this.knownSkills = msg.ids;
        this.charPanel.setSkills(msg.ids, this.skillStates);
        this.skillsUi.setSkills(msg.ids);
        this.hotbar.setSkills(msg.ids);
        break;
      }
      case "hotbar":
        this.hotbar.setSlots(msg.slots);
        break;
      case "skill_state": {
        this.skillStates[msg.id] = { lv: msg.lv, xp: msg.xp };
        if (msg.up) this.charPanel.setSkills(this.knownSkills ?? [], this.skillStates); // a passive may be stronger now
        this.skillsUi.setState(msg.id, msg.lv, msg.xp);
        const def = getSkill(msg.id);
        if (msg.up && def) this.chat.system(vi.skills.levelUp(def.nameVi, vi.skills.levels[msg.lv] ?? ""), "important");
        this.hotbar.refresh(); // a level changes MP cost and cooldown
        break;
      }
      case "mp":
        this.vitals.setMp(msg.mp, msg.maxMp, msg.regenInMs, msg.perSec);
        break;
      case "cast_ok":
        this.hotbar.setCooldown(msg.skill, msg.cdMs);
        break;
      case "cast_error":
        this.chat.system(vi.skills.errors[msg.reason] ?? vi.skills.errors.unknown!, "error");
        break;
      case "effects":
        this.buffs.set(msg.list);
        break;
      case "buff":
        this.chat.system(vi.skills.buffOn(getSkill(msg.skill)?.nameVi ?? msg.skill, Math.round(msg.ms / 1000)));
        break;
      case "eq_removed":
        for (const it of msg.items) {
          const name = getItemDef(it.type)?.nameVi ?? it.type;
          this.chat.system((vi.equip.removed[it.reason] ?? vi.equip.removed.slot!)(name), "important");
          if (it.mailed) this.chat.system(vi.equip.removedMailed, "important");
        }
        break;
      case "eq_worn":
        this.chat.system(vi.equip.wornDown, "important");
        break;
      case "repaired":
        this.chat.system(vi.equip.repaired(msg.cost));
        break;
      case "mail":
        this.inventory.setMail(msg.mail);
        break;
      case "loot":
        for (const it of msg.items) {
          const name = getItemDef(it.type)?.nameVi ?? it.type;
          if (it.mailed) this.chat.system(vi.inventory.mailed(name, it.qty), "important");
          else this.chat.system(vi.inventory.picked(name, it.qty));
        }
        break;
      case "inv_error":
        // A sort refused for being too frequent locks the button with a countdown and is reported once, in the system tab.
        if (msg.reason === "wait") {
          if (this.inventory.rejected("wait", msg.retryMs)) this.chat.system(vi.inventory.sortBlocked(Math.max(1, Math.ceil((msg.retryMs ?? 5000) / 1000))), "warning");
          break;
        }
        // Rate-limit refusals are silent: they only happen when commands are sent faster than a person taps.
        this.inventory.rejected(msg.reason);
        if (msg.reason !== "rate") this.chat.system(vi.inventory.errors[msg.reason] ?? vi.inventory.errors.invalid!, "error");
        break;
      case "bt":
        this.charPanel.breakthroughStarted(msg.ms, msg.ratePct);
        this.chat.system(vi.breakthrough.started(msg.ratePct), "important");
        break;
      case "bt_end": {
        this.charPanel.breakthroughEnded();
        if (msg.ok) this.chat.system(vi.breakthrough.success(REALMS[msg.realm ?? 0]?.nameVi ?? "", msg.points ?? 0), "important");
        else this.chat.system((vi.breakthrough.failed[msg.reason] ?? vi.breakthrough.failed.timeout!) + (msg.expLost ? vi.breakthrough.lost(msg.expLost) : ""), "important");
        break;
      }
      case "bt_error":
        this.chat.system(vi.breakthrough.errors[msg.reason] ?? vi.breakthrough.errors.invalid!, "error");
        break;
      case "chat":
      case "chat_error":
        this.handleChatMessage(msg);
        break;
    }
  }

  /** Chat lines and chat errors arrive on both sockets (map chat on the game socket, world and whispers on the chat socket). */
  private handleChatMessage(msg: ServerMessage): void {
    if (msg.t === "chat") {
      this.chat.add(msg, this.selfId);
    } else if (msg.t === "chat_error") {
      const text =
        msg.reason === "rate"
          ? vi.chat.rateLimited
          : msg.reason === "offline"
            ? vi.chat.offline
            : msg.reason === "forbidden"
              ? vi.chat.forbidden
              : vi.chat.invalid;
      this.chat.system(text, "error");
    }
  }

  private refreshHud(): void {
    const realm = this.map.realm === null ? "" : ` (${REALMS[this.map.realm]?.nameVi ?? ""})`;
    const where = `${vi.maps[this.map.id] ?? this.map.id}${realm}`;
    this.hud.textContent = `${where} · ${vi.connected(this.actors.size, this.ping, this.colo)} · ${vi.hint}`;
  }

  private upsertActor(players: PlayerSnapshot[]): void {
    for (const p of players) {
      let actor = this.actors.get(p.id);
      const isNew = !actor;
      if (!actor) {
        const isSelf = p.id === this.selfId;
        const body = this.add.ellipse(0, 0, 22, 34, isSelf ? 0xffd54a : 0x6ec6ff).setStrokeStyle(2, 0x000000, 0.6);
        const label = this.add
          .text(0, 0, p.name, { fontFamily: FONT, fontSize: "13px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
          .setOrigin(0.5, 1);
        actor = { id: p.id, path: p.path, startedAt: 0, speed: p.speed, offX: 0, offY: 0, offAt: 0, body, label };
        this.actors.set(p.id, actor);
      }
      const now = performance.now();
      if (isNew) {
        actor.path = p.path;
        actor.speed = p.speed;
        actor.startedAt = now - p.ageMs;
      } else {
        applyTrack(actor, p.path, now - p.ageMs, p.speed, now);
      }
      if (p.id === this.selfId) this.cameras.main.startFollow(actor.body, true, 0.15, 0.15);
    }
  }

  private removeActor(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.body.destroy();
    actor.label.destroy();
    this.actors.delete(id);
  }

  private clearActors(): void {
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    for (const id of [...this.monsters.keys()]) this.removeMonster(id);
    this.targetId = null;
  }

  /** The monster nearest to a click, measured on screen so clicking the body, label or HP bar all count. */
  private pickMonster(wx: number, wy: number): string | null {
    const now = performance.now();
    let best: string | null = null;
    let bestD = MONSTER_PICK_PX;
    for (const m of this.monsters.values()) {
      const pos = positionAlongPath(m.path, now - m.startedAt, m.speed);
      const s = toScreen(pos.x, pos.y);
      const d = Math.hypot(s.x - wx, s.y - 20 - wy);
      if (d <= bestD) {
        bestD = d;
        best = m.id;
      }
    }
    return best;
  }

  private upsertMonster(snap: MonsterSnapshot): void {
    const def = getMonsterDef(snap.kind);
    let m = this.monsters.get(snap.id);
    if (!m) {
      const color = ELEMENT_COLOR[snap.element] ?? 0xcccccc;
      const body = this.add.rectangle(0, 0, 26, 26, color).setStrokeStyle(2, 0x000000, 0.7);
      const label = this.add
        .text(0, 0, this.monsterName(snap.kind, snap.tier, snap.rank, snap.element), { fontFamily: FONT, fontSize: "12px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1);
      m = { color: "#ffffff", id: snap.id, tier: snap.tier, rank: snap.rank, element: snap.element, path: snap.path, startedAt: 0, speed: snap.speed, hp: snap.hp, maxHp: snap.maxHp, body, label, bar: this.add.graphics() };
      this.monsters.set(snap.id, m);
    }
    // A respawn can roll a different rank, so name and size follow the latest snapshot.
    m.tier = snap.tier;
    m.rank = snap.rank;
    m.element = snap.element;
    m.body.setFillStyle(ELEMENT_COLOR[snap.element] ?? 0xcccccc);
    m.label.setText(this.monsterName(snap.kind, snap.tier, snap.rank, snap.element));
    m.body.setScale(snap.rank === "rare2" ? 1.4 : snap.rank === "rare1" ? 1.2 : 1);
    const now = performance.now();
    // Monsters are re-planned often; blending keeps them from snapping, but a plain swap is fine at their speed.
    const before = positionAlongPath(m.path, now - m.startedAt, m.speed);
    m.path = snap.path.length > 0 ? snap.path : [[before.x, before.y]];
    m.speed = snap.speed;
    m.startedAt = now - snap.ageMs;
    m.hp = snap.hp;
    m.maxHp = snap.maxHp;
  }

  /** "Sói Rừng · Bậc 4" plus the class tag for rare monsters. */
  private monsterName(kind: string, tier: number, rank: MonsterRank, element: SpiritualRoot): string {
    const tag = RANKS[rank].tagVi;
    return `${getMonsterDef(kind)?.nameVi ?? kind} · ${vi.roots[element] ?? element} · ${vi.combat.tier(tier)}${tag ? ` · ${tag}` : ""}`;
  }

  /** Rare monsters have their own colours; normal ones are coloured by how their bậc compares to the player's level. */
  private monsterColor(m: MonsterActor): string {
    if (m.rank === "rare2") return "#ffd54a";
    if (m.rank === "rare1") return "#7fd6ff";
    if (!this.selfSheet) return "#ffffff";
    const diff = levelIndex(this.map.realm ?? 0, m.tier) - levelIndex(this.selfSheet.realm, this.selfSheet.stage);
    if (diff <= -3) return "#9ad59a";
    if (diff <= 2) return "#ffffff";
    if (diff <= 5) return "#ffb74d";
    return "#ff6b6b";
  }

  private removeMonster(id: string): void {
    const m = this.monsters.get(id);
    if (!m) return;
    m.body.destroy();
    m.label.destroy();
    m.bar.destroy();
    this.monsters.delete(id);
    if (this.targetId === id) this.targetId = null;
  }

  /** Floating damage number over the target; also keeps a monster's HP bar current. */
  private showHit(msg: Extract<ServerMessage, { t: "hit" }>): void {
    const monster = this.monsters.get(msg.to);
    if (monster) monster.hp = msg.hp;
    const now = performance.now();
    let x: number;
    let y: number;
    if (monster) {
      const p = positionAlongPath(monster.path, now - monster.startedAt, monster.speed);
      x = p.x;
      y = p.y;
    } else {
      const actor = this.actors.get(msg.to);
      if (!actor) return;
      const p = currentPos(actor, now);
      x = p.x;
      y = p.y;
    }
    const s = toScreen(x, y);
    const text = msg.kind === "miss" ? vi.combat.miss : msg.kind === "crit" ? `${msg.damage}!` : String(msg.damage);
    const color = msg.to === this.selfId ? "#ff6b6b" : msg.kind === "crit" ? "#ffd54a" : "#ffffff";
    const label = this.add
      .text(s.x, s.y - 50, text, { fontFamily: FONT, fontSize: msg.kind === "crit" ? "18px" : "14px", color, stroke: "#000000", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(1000);
    this.tweens.add({ targets: label, y: label.y - 28, alpha: 0, duration: 800, onComplete: () => label.destroy() });
  }

  update(): void {
    const now = performance.now();
    for (const actor of this.actors.values()) {
      const pos = currentPos(actor, now);
      const s = toScreen(pos.x, pos.y);
      actor.body.setPosition(s.x, s.y - 17);
      actor.label.setPosition(s.x, s.y - 38);
      const depth = 10 + pos.x + pos.y;
      actor.body.setDepth(depth);
      actor.label.setDepth(depth + 0.1);
    }

    for (const m of this.monsters.values()) {
      const pos = positionAlongPath(m.path, now - m.startedAt, m.speed);
      const s = toScreen(pos.x, pos.y);
      const depth = 10 + pos.x + pos.y;
      m.body.setPosition(s.x, s.y - 13).setDepth(depth);
      m.label.setPosition(s.x, s.y - 40).setDepth(depth + 0.1);
      const color = this.monsterColor(m);
      if (color !== m.color) {
        m.color = color;
        m.label.setColor(color);
      }
      m.bar.clear().setDepth(depth + 0.1);
      const w = 34;
      m.bar.fillStyle(0x000000, 0.7).fillRect(s.x - w / 2, s.y - 36, w, 5);
      m.bar.fillStyle(0xe53935, 1).fillRect(s.x - w / 2 + 1, s.y - 35, (w - 2) * Math.max(0, m.hp / m.maxHp), 3);
      if (m.id === this.targetId) m.body.setStrokeStyle(3, 0xffe08a, 1);
      else m.body.setStrokeStyle(2, 0x000000, 0.7);
    }

    // Standing still on a portal tile asks the server to transfer us (the server re-checks the position).
    const self = this.actors.get(this.selfId);
    // Retry after 1.5 s in case the server's (slightly lagging) position was not yet in range.
    if (self && !this.transferring && !this.charPanel.isBreaking() && now - this.portalSentAt > 1500) {
      const pos = currentPos(self, now);
      if (!pos.moving && portalNear(this.map, pos.x, pos.y)) {
        this.portalSentAt = now;
        this.net.send({ t: "portal" });
      }
    }
  }
}

/** The level a worn pháp bảo bản mệnh is at (its trained level, or the one it was made at). */
function bondedLevel(piece: { type: string; lv?: number }): number | undefined {
  const info = equipmentInfo(piece.type);
  return info ? refineLevelOf(info, piece.lv) : undefined;
}

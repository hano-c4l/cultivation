import Phaser from "phaser";
import {
  bossKinds,
  bossRealmBonus,
  equipmentInfo,
  mpRegenPerS,
  REGEN_PER_S,
  getItemDef,
  getSkill,
  type SkillDef,
  type SkillContext,
  skillContextFor,
  PATHS,
  pathLevel,
  pathLevelName,
  type PathId,
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
  guardRealmBonus,
  rankDef,
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
  inPlayRect,
  isMapId,
  playRectPixels,
  portalNear,
  positionAlongPath,
  type MapData,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec2,
  equipmentBonus,
  walkSpeed,
  type EquipStatKey,
  setTuning,
  setItemOverlays,
  setElementTuning,
  setMerchant,
  setMapNpcs,
  setMapRecipe,
  overrideRecipe,
  npcsOf,
} from "@game/shared";
import { applyTuningTheme } from "./theme";
import { initCharacterPanel, type CharacterPanel } from "./character-ui";
import { initChat, type ChatUi } from "./chat-ui";
import { setCatalog } from "./constitution-store";
import { itemTierText, statText } from "./equip-text";
import { initEquipment, type EquipmentUi } from "./equipment-ui";
import { initShop, type ShopUi } from "./shop-ui";
import { initSmith, type SmithUi } from "./smith-ui";
import { initQuests, type QuestUi } from "./quest-ui";
import { initPk, type PkUi } from "./pk-ui";
import { initWaygate, type WaygateUi } from "./waygate-ui";
import { Effects } from "./fx";
import { initChannel, type ChannelUi } from "./channel-ui";
import { initRank, type RankUi } from "./rank-ui";
import { closeAllWindows } from "./window-manager";
import { setGearSetNames, setWornSkillSets, skillDisplayName, grayWindowMs, decayedSatNhan, displayColor, nameTier, type NameColor, type PkMode } from "@game/shared";
import { NPC_INTERACT_RADIUS, nearestStandablePoint, type NpcSpot, type NpcView } from "@game/shared";
import { initBuffs, type BuffsUi } from "./buffs-ui";
import { initHotbar, type HotbarUi } from "./hotbar-ui";
import { initSkills, type SkillsUi } from "./skills-ui";
import { initInventory, type InventoryUi } from "./inventory-ui";
import { initVitals, type VitalsUi } from "./vitals-ui";
import { DEFAULT_CHANNEL } from "./config";
import { vi } from "./locales/vi";
import { isMounted, setMounted, wearerOfSheet } from "./wearer";
import { Net } from "./net";

const FONT = '"Be Vietnam Pro", system-ui, sans-serif';

/** The element icon in front of a monster's name: the same colours as the element dots on gear and skills (index.html .elem-*). */
const ELEMENT_DOT: Record<string, number> = { kim: 0xfbc02d, moc: 0x43a047, thuy: 0x1e88e5, hoa: 0xe53935, tho: 0x8d6e63, loi: 0x7e57c2, bang: 0x4dd0e1, phong: 0x80cbc4 };
const ELEMENT_COLOR: Record<string, number> = { kim: 0xe0e0e0, moc: 0x4caf50, thuy: 0x2196f3, hoa: 0xff5722, tho: 0x9c7a5b, loi: 0x9575cd, bang: 0x80deea, phong: 0xa5d6a7 };
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
  /** The "PK" tag after the name: brown for PK, red for Đồ sát (hidden when off). */
  tag: Phaser.GameObjects.Text;
  pk: PkMode;
  /** Riding the flight pháp bảo: drawn on a small cloud under the feet and lifted off the ground. */
  mounted: boolean;
  cloud?: Phaser.GameObjects.Ellipse;
  /** Sát nhân when last heard (it falls 5 a minute while online) and when; the name colour comes from these. */
  sn: number;
  snAt: number;
}

function isBossKind(kind: string): boolean {
  return bossKinds().includes(kind);
}

interface MonsterActor {
  id: string;
  /** A vệ binh: own name and colour, and it is only clicked (attacked) with the PK state on. */
  guard: boolean;
  /** The map boss: red name, big body. */
  boss: boolean;
  tier: number;
  rank: MonsterRank;
  /** The element rolled when it (re)spawned: it shows in the name and in the colour of the body. */
  element: SpiritualRoot;
  path: Vec2[];
  startedAt: number;
  speed: number;
  hp: number;
  maxHp: number;
  body: Phaser.GameObjects.Shape;
  label: Phaser.GameObjects.Text;
  /** The element icon drawn just before the name. */
  icon: Phaser.GameObjects.Arc;
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

/** Radius (tiles) of the teleport array drawn on the ground and of the click that opens it. */
const WAYGATE_RADIUS = 1.3;
/** Pixel size of one texture of obstacles (kept under the 4096 limit of small GPUs, and not too many textures for a big map). */
const CHUNK = 1024;


/**
 * The repeating ground pattern: 64 x 32 px holding two tiles of the checker, so it lines up with the isometric grid when tiled (the tile whose top
 * vertex is at world (0, 0) is the even one; its pattern x is the world x plus half a tile).
 */
function ensureGroundTexture(scene: Phaser.Scene, palette: MapData["palette"]): string {
  const key = `ground-${palette.groundA.toString(16)}-${palette.groundB.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const tile = (cx: number, cy: number, color: number) => {
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

export class GameScene extends Phaser.Scene {
  private map: MapData = getMap("town");
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private actors = new Map<string, Actor>();
  private monsters = new Map<string, MonsterActor>();
  private targetId: string | null = null;
  private selfSheet: CharacterSheet | null = null;
  private lastAttackSentAt = 0;
  private selfId = "";
  /** Players in the room as the server last counted them (a combat map only lists those near you); null until it says. */
  private online: number | null = null;
  private net!: Net;
  private chatNet!: Net;
  private chat!: ChatUi;
  private inventory!: InventoryUi;
  private equipment!: EquipmentUi;
  private shop!: ShopUi;
  private smith!: SmithUi;
  private linhThach = 0;
  private quests!: QuestUi;
  private pk!: PkUi;
  private channel!: ChannelUi;
  private waygate!: WaygateUi;
  private fx!: Effects;
  private rank!: RankUi;
  /** When each player last hit you (performance.now): they show grey to you for 3 minutes unless their name is orange or red. */
  private hitMeAt = new Map<string, number>();
  private lastPk = { satKhi: 0, satNhan: 0, hero: 0 };
  private pkSeen = false;
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
  private mountBtn!: HTMLButtonElement;
  private flightWorn = false;
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
    this.mountBtn = document.createElement("button");
    this.mountBtn.id = "mount-btn";
    this.mountBtn.hidden = true;
    this.mountBtn.onclick = () => this.toggleMount();
    document.body.append(this.mountBtn);
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
        // Using another skill or item drops a teleport that was waiting for a click: it counts as never started.
        if ((msg.t === "cast" || msg.t === "use_type") && this.aiming) this.endAim();
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
    this.equipment = initEquipment((msg) => this.net.send(msg), () => this.inventory.list(), this.registry.get("isAdmin") === true);
    this.shop = initShop((msg) => this.net.send(msg), () => this.inventory.list(), (npc, view) => this.switchNpcView(npc, view));
    this.smith = initSmith((msg) => this.net.send(msg), () => this.inventory.list(), () => ({ linh_thach: this.linhThach }), (npc, view) => this.switchNpcView(npc, view));
    this.quests = initQuests((msg) => this.net.send(msg), () => this.inventory.list(), (title) => this.chat.system(vi.quests.ready(title)));
    this.pk = initPk((msg) => this.net.send(msg));
    this.channel = initChannel();
    this.waygate = initWaygate((msg) => this.net.send(msg));
    this.fx = new Effects(this, (id) => this.screenPosOf(id));
    this.rank = initRank((msg) => this.net.send(msg), this.registry.get("isAdmin") === true);
    this.charPanel = initCharacterPanel({
      sendAllocate: (points) => this.net.send({ t: "allocate", points }),
      startBreakthrough: (pills) => this.net.send({ t: "bt_start", pills }),
      cancelBreakthrough: () => this.net.send({ t: "bt_cancel" }),
      choosePath: (path) => this.net.send({ t: "path_choose", path }),
      swapPath: (path) => this.net.send({ t: "path_swap", path }),
      dropPath: (path) => this.net.send({ t: "path_drop", path }),
      claimPath: (path) => this.net.send({ t: "path_claim", path }),
      claimBreakthroughPill: () => this.net.send({ t: "bt_claim" }),
      isAdmin: this.registry.get("isAdmin") === true,
      countOf: (type) => this.inventory.list().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0),
    });

    const camera = this.cameras.main;
    const center = toScreen(this.map.spawn[0] + 0.5, this.map.spawn[1] + 0.5);
    this.applyCameraBounds();
    camera.centerOn(center.x, center.y);
    this.scale.on("resize", () => this.applyCameraBounds());

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.aiming) this.endAim();
      const a = document.activeElement;
      const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
      if (!typing && (ev.key === "m" || ev.key === "M") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && this.selfId) {
        this.toggleMount();
      }
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

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.recolorAll() });
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

  /** Title of a quest the client has heard of (the quest list of an NPC or the tracker), else its id. */
  private questTitle(id: string): string {
    return this.quests.titleOf(id) ?? id;
  }

  /** (Re)draws the current map's tiles and portals, destroying whatever was drawn for the previous map. */
  /** The NPC list the map was drawn with. */
  private npcKey = "";
  /** The map recipe the current map was built from ("" for the code's map). */
  private recipeKey = "";

  private drawMap(): void {
    this.npcKey = JSON.stringify(npcsOf(this.map));
    for (const obj of this.mapObjects) obj.destroy();
    this.mapObjects = [];

    // The ground is one repeating pattern over the map's rectangle (the map is far too big for a texture of its own). Obstacles are every blocked
    // collision cell inside the rectangle, drawn once into textures of CHUNK pixels, so trees, pillars, ponds and fences show their real shape.
    const rect = playRectPixels(this.map);
    const groundKey = ensureGroundTexture(this, this.map.palette);
    const ground = this.add.tileSprite(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, groundKey).setOrigin(0, 0).setDepth(0);
    ground.tilePositionX = (((rect.x0 + TILE_W / 2) % TILE_W) + TILE_W) % TILE_W;
    ground.tilePositionY = ((rect.y0 % TILE_H) + TILE_H) % TILE_H;
    this.mapObjects.push(ground);

    const cw = this.map.width * CELLS_PER_TILE;
    const ch = this.map.height * CELLS_PER_TILE;
    const half = TILE_W / (2 * CELLS_PER_TILE);
    const buckets = new Map<string, Array<[number, number]>>();
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        if (isCellWalkable(this.map, cx, cy)) continue;
        if (!inPlayRect(this.map, (cx + 0.5) / CELLS_PER_TILE, (cy + 0.5) / CELLS_PER_TILE)) continue; // void: never drawn
        const p = toScreen(cx / CELLS_PER_TILE, cy / CELLS_PER_TILE);
        const key = `${Math.floor((p.x - rect.x0) / CHUNK)},${Math.floor((p.y - rect.y0) / CHUNK)}`;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push([p.x, p.y]);
      }
    }
    for (const [key, cells] of buckets) {
      const [kx, ky] = key.split(",").map(Number) as [number, number];
      // The texture overlaps its neighbours by one cell so a diamond straddling the seam is whole.
      const ox = rect.x0 + kx * CHUNK - half;
      const oy = rect.y0 + ky * CHUNK;
      const g = this.make.graphics({}, false);
      g.fillStyle(this.map.palette.obstacle, 1);
      for (const [x, y] of cells) g.fillPoints(this.diamond(x - ox, y - oy, 1 / CELLS_PER_TILE), true);
      const tex = this.add.renderTexture(ox, oy, CHUNK + 2 * half, CHUNK + TILE_H / CELLS_PER_TILE).setOrigin(0, 0).setDepth(0.1);
      tex.draw(g, 0, 0);
      g.destroy();
      this.mapObjects.push(tex);
    }

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

    for (const npc of npcsOf(this.map)) {
      const p = toScreen(npc.x, npc.y);
      if (npc.kind === "waygate") {
        // A magic circle on the ground (nothing blocks it: characters arrive standing on it).
        const g = this.add.graphics().setDepth(0.4);
        const rx = WAYGATE_RADIUS * TILE_W * 0.5;
        const ry = WAYGATE_RADIUS * TILE_H * 0.5;
        g.lineStyle(3, 0x7b61ff, 0.95).strokeEllipse(p.x, p.y, rx * 2, ry * 2);
        g.lineStyle(2, 0xd9ccff, 0.9).strokeEllipse(p.x, p.y, rx * 1.35, ry * 1.35);
        g.fillStyle(0x7b61ff, 0.22).fillEllipse(p.x, p.y, rx * 1.9, ry * 1.9);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.fillStyle(0xe8e0ff, 0.9).fillCircle(p.x + Math.cos(a) * rx * 0.67, p.y + Math.sin(a) * ry * 0.67, 2.5);
        }
        const label = this.add.text(p.x, p.y - ry - 4, npc.name ?? vi.npcs[npc.id] ?? npc.id, { fontFamily: FONT, fontSize: "12px", color: "#e8e0ff", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(p.y + 2);
        this.mapObjects.push(g, label);
        continue;
      }
      // Placeholder figure (a robe and a head) standing on the NPC's spot, like the other placeholder art.
      const body = this.add.graphics().setDepth(p.y + 1);
      body.fillStyle(npc.kind === "quest" ? 0x5a8ad6 : npc.kind === "alchemist" ? 0x5aa66a : 0xd6a94b, 1).fillEllipse(p.x, p.y, 22, 11).fillRoundedRect(p.x - 8, p.y - 30, 16, 28, 5);
      body.fillStyle(0xf2d6b0, 1).fillCircle(p.x, p.y - 36, 7);
      const label = this.add
        .text(p.x, p.y - 48, npc.name ?? vi.npcs[npc.id] ?? npc.id, { fontFamily: FONT, fontSize: "12px", color: "#ffe08a", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(p.y + 2);
      this.mapObjects.push(body, label);
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
    // Same map but the NPCs changed (they are data from D1, sent with each welcome): draw it again.
    if (!isMapId(mapId) || (this.map.id === mapId && this.npcKey === JSON.stringify(npcsOf(this.map)) && this.recipeKey === JSON.stringify(overrideRecipe(mapId) ?? ""))) return;
    this.recipeKey = JSON.stringify(overrideRecipe(mapId) ?? "");
    this.map = getMap(mapId);
    this.shop.close();
    this.quests.close();
    this.waygate.close();
    this.drawMap();
    this.applyCameraBounds();
  }

  /**
   * Keeps the view inside the map's rectangle so the black beyond it is never shown. A map smaller than the window (in either direction) can
   * not fill it, so the bounds grow to the window around the map's centre and the map sits in the middle.
   */
  private applyCameraBounds(): void {
    const cam = this.cameras.main;
    const r = playRectPixels(this.map);
    const w = Math.max(r.x1 - r.x0, cam.width / cam.zoom);
    const h = Math.max(r.y1 - r.y0, cam.height / cam.zoom);
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    cam.setBounds(cx - w / 2, cy - h / 2, w, h);
  }

  /** The realm, grade and mastery level a skill works at for this character (the same inputs the server uses). */
  private skillContext(skill: SkillDef): SkillContext {
    const gear = skill.source === "gear" ? gearSkillInfo(this.worn).find((g) => g.id === skill.id) : undefined;
    const sheet = this.selfSheet;
    return skillContextFor(skill, { rootGrade: sheet?.rootGrade ?? 0, realm: sheet?.realm ?? 0, level: this.skillStates[skill.id]?.lv ?? 0, ...(sheet ? { paths: sheet.paths } : {}), ...(gear ? { gear } : {}) });
  }

  private beginAim(skill: SkillDef): void {
    this.aiming = skill;
    this.hotbar.setAimNote(vi.skills.aim(skillDisplayName(skill), skill.range));
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
    // The figure stands up from its spot, so a click on its body lands on a ground tile behind it: test the drawn box too.
    const npc = npcsOf(this.map).find((n) => {
      const p = toScreen(n.x, n.y);
      if (n.kind === "waygate") return Math.hypot(tx - n.x, ty - n.y) <= WAYGATE_RADIUS; // a circle on the ground, nothing stands up from it
      return Math.hypot(tx - n.x, ty - n.y) <= 1 || (Math.abs(world.x - p.x) <= 18 && world.y >= p.y - 52 && world.y <= p.y + 10);
    });
    if (npc) {
      this.talkTo(npc);
      return;
    }
    // With the PK state on (or against a player who hit you in the last 3 minutes: self-defence), a click on another player attacks them
    // (the server checks the rules and says why when it refuses).
    const player = !this.map.safe ? this.pickPlayer(world.x, world.y) : null;
    const picked = player ?? this.pickMonster(world.x, world.y);
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
    this.sendWalk(tx, ty);
  }

  /** The tabs of an NPC that has more than one window (the blacksmith's trading, the alchemist's brewing): shows the other one. */
  private switchNpcView(npc: string, view: NpcView): void {
    this.shop.close();
    this.smith.close();
    if (view === "smith") this.smith.open(npc);
    else this.shop.open(npc, this.map.id);
  }

  /** Clicking an NPC opens its window when close enough; otherwise the character walks over and the player clicks again. */
  private talkTo(npc: NpcSpot): void {
    const self = this.actors.get(this.selfId);
    if (!self) return;
    const here = currentPos(self, performance.now());
    if (Math.hypot(here.x - npc.x, here.y - npc.y) <= NPC_INTERACT_RADIUS - 0.4) {
      // One NPC window at a time (both would otherwise open on the same spot).
      this.shop.close();
      this.quests.close();
      this.smith.close();
      this.waygate.close();
      if (npc.kind === "quest") this.quests.open(npc.id);
      else if (npc.kind === "smith") this.smith.open(npc.id);
      else if (npc.kind === "waygate") this.waygate.open(npc.id);
      else this.shop.open(npc.id, this.map.id);
      return;
    }
    this.chat.system(vi.shop.tooFar, "error");
    // Walk to the standable spot nearest the NPC on the player's side.
    const dx = here.x - npc.x;
    const dy = here.y - npc.y;
    const len = Math.hypot(dx, dy) || 1;
    const spot = nearestStandablePoint(this.map, npc.x + (dx / len) * 1.5, npc.y + (dy / len) * 1.5, 2);
    if (spot) this.sendWalk(Math.round(spot[0] * 100) / 100, Math.round(spot[1] * 100) / 100);
  }

  /** Walks to a point: predicts the path locally and tells the server. */
  private sendWalk(tx: number, ty: number): void {
    // Client-side throttle matches the server's, so a dropped click never desyncs the prediction.
    const now = performance.now();
    if (now - this.lastMoveSentAt < MIN_MOVE_INTERVAL_MS + 20) return;
    const from = this.predictSelfMove(tx, ty);
    if (!from) return;
    this.lastMoveSentAt = now;
    this.shop.close(); // walking away from an NPC closes its window
    this.quests.close();
    this.smith.close();
    this.waygate.close();
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
        setGearSetNames(msg.gearSets); // the live names of the gear sets
        setTuning(msg.tuning as unknown as Record<string, unknown>); // the live balance numbers (drops, kills, skills, theme...)
        applyTuningTheme();
        setMapNpcs(msg.map, msg.npcs); // who stands on this map (data from D1)
        if (msg.mapRecipe || isMapId(msg.map)) setMapRecipe(msg.mapRecipe ?? null, msg.map); // the layout of this map when an admin changed it (before the map is built below)
        if (msg.mutant) setElementTuning(msg.mutant); // the live numbers of the mutant elements (game settings)
        setItemOverlays(msg.items ?? []); // what admins changed in the item catalogue (before the bag below is drawn)
        setMounted(false); // the snapshot of yourself (below) says whether you still ride: it is kept across maps
        this.flightWorn = msg.equipped.some((e) => e.slot === "flight");
        this.refreshMountBtn();
        this.hitMeAt.clear(); // a new room starts without quarrels
        this.endAim();
        this.colo = msg.colo;
        this.transferring = false;
        this.hotbar.setAimNote(null); // a channel never survives a (re)connect
        this.pkSeen = false; // the first PvP message after joining is not a change
        this.channel.stop(); // a talisman channel never survives a (re)connect or the transfer it ends in
        this.portalSentAt = 0;
        this.switchMap(msg.map);
        this.pk.setSafe(this.map.safe);
        this.clearActors();
        this.online = null;
        this.upsertActor(msg.players);
        for (const m of msg.monsters) this.upsertMonster(m);
        this.syncRankContext();
        setCatalog(msg.constitutions);
        // A breakthrough never survives a (re)connect: the server settled it as a failure when the old connection ended.
        this.charPanel.breakthroughEnded();
        this.charPanel.update(msg.character);
        this.equipment.setSheet(msg.character);
        this.shop.setSheet(msg.character);
        this.smith.setSheet(msg.character);
        this.quests.setSheet(msg.character);
        this.rank.show(msg.character.name);
        this.inventory.setSheet(msg.character);
        this.skillsUi.setSheet(msg.character);
        this.selfSheet = msg.character;
        this.vitals.set(msg.hp, msg.maxHp, { inMs: msg.regenInMs, perSec: REGEN_PER_S });
        this.vitals.setWallet(msg.wallet);
        this.linhThach = msg.wallet.linh_thach;
        this.waygate.setBalance(this.linhThach);
        this.inventory.setBag(msg.bag);
        this.charPanel.refresh();
        this.equipment.setEquipped(msg.equipped);
        this.smith.setEquipped(msg.equipped);
        const wornBonded = msg.equipped.find((e) => e.slot === "bonded");
        this.bondedLv = wornBonded ? bondedLevel(wornBonded) : undefined;
        this.inventory.setEquipped(msg.equipped);
        this.charPanel.setEquipped(msg.equipped);
        this.inventory.setMail(msg.mail);
        this.knownSkills = msg.skills;
        this.skillStates = msg.skillStates;
        this.worn = msg.equipped;
        setWornSkillSets(msg.equipped);
        this.skillsUi.setStates(msg.skillStates);
        this.charPanel.setSkills(msg.skills, msg.skillStates);
        this.skillsUi.setEquipped(msg.equipped);
        this.skillsUi.setSkills(msg.skills);
        this.hotbar.setSkills(msg.skills);
        this.hotbar.setSlots(msg.hotbar);
        this.vitals.setMp(msg.mp, msg.maxMp, msg.regenInMs, mpRegenPerS());
        this.hotbar.refresh(); // the slots were drawn before the MP was known (they dim what the MP cannot pay)
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
      case "mon_reset":
        for (const id of [...this.monsters.keys()]) this.removeMonster(id);
        break;
      case "online":
        this.online = msg.n;
        this.refreshHud();
        break;
      case "hit":
        this.showHit(msg);
        break;
      case "hp":
        this.vitals.set(msg.hp, msg.maxHp);
        break;
      case "died":
        this.hitMeAt.clear(); // the quarrel with whoever killed us is over: their name goes back to its real colour
        this.channel.stop();
        this.chat.system(vi.combat.died(msg.expLost), "important");
        break;
      case "wallet":
        if (msg.currency === "linh_thach") {
          this.linhThach = msg.balance;
          this.waygate.setBalance(this.linhThach);
        }
        this.vitals.setBalance(msg.currency, msg.balance);
        this.smith.refresh();
        if (msg.gained) this.chat.system(vi.chat.gainedCurrency(msg.gained, vi.economy.currency[msg.currency]));
        break;
      case "stats": {
        const before = this.selfSheet;
        this.smith.setSheet(msg.character);
        this.charPanel.update(msg.character);
        this.equipment.setSheet(msg.character);
        this.shop.setSheet(msg.character);
        this.inventory.setSheet(msg.character);
        this.skillsUi.setSheet(msg.character);
        this.selfSheet = msg.character;
        const c = msg.character;
        // A hướng tu was taken (the sheet carries the paths): say which, and whether it is the chủ tu.
        if (before && JSON.stringify(before.paths) !== JSON.stringify(c.paths)) {
          const had = [before.paths.main, ...before.paths.subs].filter((p): p is PathId => !!p);
          const has = [c.paths.main, ...c.paths.subs].filter((p): p is PathId => !!p);
          const taken = has.find((p) => !had.includes(p));
          const lost = had.find((p) => !has.includes(p));
          const leveled = has.find((p) => pathLevel(c.paths, p) > pathLevel(before.paths, p));
          if (taken) this.chat.system(vi.paths.chosen(PATHS[taken].nameVi, taken === c.paths.main));
          else if (lost) this.chat.system(vi.paths.dropped(PATHS[lost].nameVi));
          else if (leveled) this.chat.system(vi.paths.leveled(PATHS[leveled].nameVi, pathLevelName(c.paths, leveled)));
          else if (c.paths.main && c.paths.main !== before.paths.main) this.chat.system(vi.paths.swapped(PATHS[c.paths.main].nameVi));
        }
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
      case "mounted":
        if (msg.error) this.chat.system(vi.mount.errors[msg.error] ?? msg.error);
        this.applyMounted(msg.on, true);
        {
          const me = this.actors.get(this.selfId);
          if (me) this.setActorMounted(me, msg.on);
        }
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
        this.hotbar.setAimNote(null); // a talisman channel that completed ends here
        this.hud.textContent = vi.transferring;
        this.chat.system(vi.chat.transferTo(vi.maps[msg.map] ?? msg.map));
        break;
      case "inv":
        if (msg.full) this.inventory.setBag({ tabs: msg.tabs, items: msg.items, tabPrice: msg.tabPrice });
        else this.inventory.applyDelta(msg.tabs, msg.items, msg.removed);
        this.smith.refresh();
        this.charPanel.refresh();
        this.equipment.refresh();
        this.shop.refresh();
        this.quests.refresh();
        this.hotbar.refresh();
        this.skillsUi.refresh(); // the pill count
        break;
      case "eq": {
        this.flightWorn = msg.items.some((e) => e.slot === "flight");
        this.refreshMountBtn();
        // The pháp bảo bản mệnh reaching a new training level is worth a line.
        const bonded = msg.items.find((e) => e.slot === "bonded");
        const level = bonded ? bondedLevel(bonded) : undefined;
        if (bonded && level !== undefined && this.bondedLv !== undefined && level > this.bondedLv) {
          this.chat.system(vi.equip.refined(getItemDef(bonded.type)?.nameVi ?? bonded.type, itemTierText(bonded.type, bonded.lv) ?? ""));
        }
        this.bondedLv = level;
        this.equipment.setEquipped(msg.items);
        this.smith.setEquipped(msg.items);
        this.inventory.setEquipped(msg.items);
        this.charPanel.setEquipped(msg.items);
        this.worn = msg.items;
        setWornSkillSets(msg.items);
        this.hotbar.refresh();
        this.skillsUi.setEquipped(msg.items); // gear skills take the realm and grade of the piece
        this.hotbar.refresh();
        break;
      }
      case "skills": {
        // A new skill (a stage-up unlocked it, or a book taught it) is worth a line.
        if (this.knownSkills) {
          for (const id of msg.ids.filter((s) => !this.knownSkills!.includes(s))) this.chat.system((getSkill(id)?.source === "root" ? vi.skills.rootGranted : getSkill(id)?.source === "gear" ? vi.skills.gearGranted : vi.skills.learned)(getSkill(id)?.nameVi ?? id));
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
        if (msg.up && def) this.chat.system(vi.skills.levelUp(skillDisplayName(def), vi.skills.levels[msg.lv] ?? ""));
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
        this.chat.system(vi.skills.buffOn(((d) => (d ? skillDisplayName(d) : msg.skill))(getSkill(msg.skill)), Math.round(msg.ms / 1000)));
        break;
      case "eq_removed":
        for (const it of msg.items) {
          const name = getItemDef(it.type)?.nameVi ?? it.type;
          this.chat.system((vi.equip.removed[it.reason] ?? vi.equip.removed.slot!)(name));
          if (it.mailed) this.chat.system(vi.equip.removedMailed);
        }
        break;
      case "eq_worn":
        this.chat.system(vi.equip.wornDown);
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
      case "fx":
        this.fx.skill(msg.id, msg.skill, msg.to, msg.x !== undefined && msg.y !== undefined ? toScreen(msg.x, msg.y) : undefined, msg.el);
        break;
      case "fx_cone": {
        const from = toScreen(msg.x, msg.y);
        const aim = toScreen(msg.ax, msg.ay);
        this.fx.coneFrom(from, aim, msg.range, msg.half);
        break;
      }
      case "fx_channel":
        this.fx.channel(msg.id, msg.what, msg.on, msg.ok);
        break;
      case "waygate":
        this.waygate.setDests(msg.npc, msg.dests);
        break;
      case "shop":
        setTuning(msg.tuning as unknown as Record<string, unknown>);
        setMerchant(msg.merchant);
        this.shop.setStock(msg.npc, msg.left, msg.tabs);
        break;
      case "smith":
        setTuning(msg.tuning as unknown as Record<string, unknown>);
        this.smith.setRules(msg.npc, msg.levels, msg.pity, msg.tabs);
        break;
      case "brew":
        setTuning(msg.tuning as unknown as Record<string, unknown>);
        this.shop.setBrew(msg.npc, msg.jobs, msg.now, msg.tabs);
        break;
      case "smith_result": {
        const owned = [...this.worn, ...this.inventory.list()].find((x) => x.id === msg.id);
        const name = owned ? (getItemDef(owned.type)?.nameVi ?? owned.type) : "";
        const text = msg.success ? vi.smith.success(name, msg.level) : msg.dropped ? vi.smith.failedDropped(name, msg.level) : msg.scrollUsed ? vi.smith.failedKept(name, msg.level) : vi.smith.failed(name, msg.level);
        this.chat.system(text, msg.success ? undefined : "warning");
        this.smith.notify(text, msg.success);
        this.smith.setPity(msg.id, msg.pity);
        break;
      }
      case "smith_refined": {
        const owned = [...this.worn, ...this.inventory.list()].find((x) => x.id === msg.id);
        const name = owned ? (getItemDef(owned.type)?.nameVi ?? owned.type) : "";
        const parts = Object.entries(msg.gains).map(([key, v]) => statText(key as EquipStatKey, v));
        const text = parts.length > 0 ? vi.smith.refined(name, parts.join(", ")) : vi.smith.refinedNothing(name);
        this.chat.system(text, parts.length > 0 ? undefined : "warning");
        this.smith.notify(text, parts.length > 0);
        break;
      }
      case "shop_ok": {
        const name = getItemDef(msg.item)?.nameVi ?? msg.item;
        const text = msg.op === "buy" ? vi.shop.bought(name, msg.qty, msg.total) : vi.shop.sold(name, msg.qty, msg.total);
        this.chat.system(text);
        this.shop.notify(text);
        break;
      }
      case "pk": {
        // Your own state: the switch and the scores. A change of the scores is said in the system tab (not the first message, which is just the join).
        const isFirstPk = !this.pkSeen;
        const changed = msg.satKhi !== this.lastPk.satKhi || msg.satNhan !== this.lastPk.satNhan || msg.hero !== this.lastPk.hero;
        if (this.pkSeen && changed) this.chat.system(vi.pk.changed(msg.satKhi, msg.satNhan, msg.hero));
        this.pkSeen = true;
        this.lastPk = { satKhi: msg.satKhi, satNhan: msg.satNhan, hero: msg.hero };
        this.pk.set(msg.mode, msg.satKhi, msg.satNhan, msg.hero);
        this.charPanel.setSatKhi(msg.satKhi);
        // A new room starts with the PK state off: say again which one the player chose, so it survives a change of map.
        if (isFirstPk && this.pk.chosen() !== msg.mode) this.net.send({ t: "pk_mode", mode: this.pk.chosen() });
        const self = this.actors.get(this.selfId);
        if (self) {
          self.sn = msg.satNhan;
          self.snAt = performance.now();
          this.recolorName(self, self.snAt);
        }
        break;
      }
      case "pk_drop": {
        const name = getItemDef(msg.item)?.nameVi ?? msg.item;
        this.chat.system(
          msg.role === "killer" ? vi.pk.dropKiller(name, msg.qty, msg.other) : msg.role === "lost" ? vi.pk.dropLost(name, msg.qty) : vi.pk.dropVictim(name, msg.qty, msg.other),
          msg.role === "killer" ? "info" : "important",
        );
        break;
      }
      case "pk_state": {
        const who = this.actors.get(msg.id);
        if (who) this.setActorPk(who, msg.mode);
        break;
      }
      case "pk_clear": {
        this.hitMeAt.delete(msg.id);
        const who = this.actors.get(msg.id);
        if (who) this.recolorName(who, performance.now());
        break;
      }
      case "pk_score": {
        const who = this.actors.get(msg.id);
        if (who) {
          who.sn = msg.sn;
          who.snAt = performance.now();
          this.recolorName(who, who.snAt);
        }
        break;
      }
      case "pk_error":
        this.chat.system(vi.pk.errors[msg.reason] ?? vi.pk.errors.invalid!, "error");
        break;
      case "quests":
        this.quests.setQuests(msg.npc, msg.defs, msg.states, msg.need);
        break;
      case "quest_active":
        this.quests.setActive(msg.defs, msg.states);
        break;
      case "quest_progress": {
        this.quests.progress(msg.quest, msg.progress);
        break;
      }
      case "quest_done":
        this.chat.system(vi.quests.done(this.questTitle(msg.quest)));
        this.quests.notify(vi.quests.done(this.questTitle(msg.quest)));
        break;
      case "quest_error":
        if (msg.reason === "murderer") {
          this.quests.ban(vi.quests.errors.murderer!);
          break;
        }
        this.chat.system(vi.quests.errors[msg.reason] ?? vi.quests.errors.invalid!, "error");
        this.quests.notify(vi.quests.errors[msg.reason] ?? vi.quests.errors.invalid!);
        break;
      case "tp": {
        // The note above the hotbar counts down the channel; the server ends it (tp_end or the transfer).
        const name = msg.item === "waygate" ? vi.waygate.channelName : (getItemDef(msg.item)?.nameVi ?? msg.item);
        this.chat.system(vi.shop.channel(name, Math.round(msg.ms / 1000)));
        // Channelling is standing still, with nothing open: every window closes, and a bar in the middle of the screen counts down.
        closeAllWindows();
        this.channel.start(name, msg.ms);
        break;
      }
      case "tp_end": {
        this.channel.stop();
        this.hotbar.setAimNote(null);
        if (msg.ok) break;
        // Not an alarming (red) line: the player still sees why it stopped, on the note above the hotbar for a moment.
        const why = vi.shop.channelBroken[msg.reason ?? "other"] ?? vi.shop.channelBroken.other!;
        this.chat.system(why);
        this.hotbar.setAimNote(why);
        setTimeout(() => this.hotbar.setAimNote(null), 3000);
        break;
      }
      case "shop_sold": {
        const text = vi.shop.soldMany(msg.count, msg.total);
        this.chat.system(text);
        this.shop.notify(text);
        break;
      }
      case "inv_error":
        // A sort refused for being too frequent locks the button with a countdown and is reported once, in the system tab.
        if (msg.reason === "wait") {
          if (this.inventory.rejected("wait", msg.retryMs)) this.chat.system(vi.inventory.sortBlocked(Math.max(1, Math.ceil((msg.retryMs ?? 5000) / 1000))), "warning");
          break;
        }
        if (msg.reason === "murderer") {
          this.shop.ban(vi.inventory.errors.murderer!);
          this.smith.ban(vi.inventory.errors.murderer!);
        }
        // Rate-limit refusals are silent: they only happen when commands are sent faster than a person taps.
        this.inventory.rejected(msg.reason);
        if (msg.reason !== "rate") this.chat.system(vi.inventory.errors[msg.reason] ?? vi.inventory.errors.invalid!, "error");
        break;
      case "bt":
        this.charPanel.breakthroughStarted(msg.ms, msg.ratePct);
        this.chat.system(vi.breakthrough.started(msg.ratePct), "important");
        // Like channelling a talisman: standing still with nothing open, and a bar in the middle of the screen counts down.
        closeAllWindows();
        this.channel.start(vi.breakthrough.barTitle(REALMS[(this.selfSheet?.realm ?? 0) + 1]?.nameVi ?? ""), msg.ms, "gold");
        break;
      case "bt_end": {
        this.charPanel.breakthroughEnded();
        this.channel.stop();
        if (msg.ok) this.chat.system(vi.breakthrough.success(REALMS[msg.realm ?? 0]?.nameVi ?? "", msg.points ?? 0), "important");
        else this.chat.system((vi.breakthrough.failed[msg.reason] ?? vi.breakthrough.failed.timeout!) + (msg.expLost ? vi.breakthrough.lost(msg.expLost) : ""), "important");
        break;
      }
      case "path_error":
        this.chat.system(vi.paths.errors[msg.reason] ?? vi.paths.errors.invalid!, "error");
        break;
      case "bt_claimed":
        this.chat.system(vi.breakthrough.claimed(getItemDef(msg.item)?.nameVi ?? msg.item));
        break;
      case "path_claimed":
        this.chat.system(vi.paths.claimed(PATHS[msg.path].itemNameVi));
        break;
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
    if (msg.t === "mail_new") {
      // A gift was sent to this player: read the mail list again from the game socket and say so.
      this.net.send({ t: "mail_refresh" });
      this.chat.system(vi.inventory.giftArrived);
      return;
    }
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
    this.hud.textContent = `${where} · ${vi.connected(this.online ?? this.actors.size, this.ping, this.colo)} · ${vi.hint}`;
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
        const tag = this.add.text(0, 0, "PK", { fontFamily: FONT, fontSize: "10px", fontStyle: "bold", color: "#c68642", stroke: "#000000", strokeThickness: 2 }).setOrigin(0, 1).setResolution(3).setVisible(false);
        actor = { id: p.id, path: p.path, startedAt: 0, speed: p.speed, offX: 0, offY: 0, offAt: 0, body, label, tag, pk: 0, mounted: false, sn: 0, snAt: 0 };
        this.actors.set(p.id, actor);
      }
      const now = performance.now();
      actor.sn = p.sn ?? 0;
      actor.snAt = now;
      this.setActorPk(actor, p.pk ?? 0);
      this.setActorMounted(actor, p.mounted === true);
      this.recolorName(actor, now);
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
    this.fx.forget(id);
    actor.body.destroy();
    actor.label.destroy();
    actor.tag.destroy();
    actor.cloud?.destroy();
    this.actors.delete(id);
  }

  /** Where an actor (a player or a monster) stands on screen right now, or null when it is not here: effects follow it. */
  private screenPosOf(id: string): { x: number; y: number } | null {
    const now = performance.now();
    const actor = this.actors.get(id);
    if (actor) {
      const p = currentPos(actor, now);
      return toScreen(p.x, p.y);
    }
    const m = this.monsters.get(id);
    if (m) {
      const p = positionAlongPath(m.path, now - m.startedAt, m.speed);
      return toScreen(p.x, p.y);
    }
    return null;
  }

  private clearActors(): void {
    this.fx?.clear();
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
      if (m.guard && this.pk.mode() === 0) continue; // a guard is only attacked on purpose: with the PK state off a click walks past it
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
      // A guard looks like a player (an oval body, a plain name) and shows no element, realm or HP bar; a monster is a square in its element's colour.
      const body: Phaser.GameObjects.Shape = snap.guard ? this.add.ellipse(0, 0, 22, 34, 0x6ec6ff).setStrokeStyle(2, 0x000000, 0.6) : this.add.rectangle(0, 0, 26, 26, color).setStrokeStyle(2, 0x000000, 0.7);
      const label = this.add
        .text(0, 0, this.monsterName(snap.kind, snap.tier, snap.rank, snap.guard === true), { fontFamily: FONT, fontSize: "12px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1);
      const icon = this.add.circle(0, 0, 5, ELEMENT_DOT[snap.element] ?? 0xcccccc).setStrokeStyle(1, 0xffffff, 1).setVisible(snap.guard !== true);
      m = { color: "#ffffff", icon, id: snap.id, guard: snap.guard === true, boss: snap.boss === true, tier: snap.tier, rank: snap.rank, element: snap.element, path: snap.path, startedAt: 0, speed: snap.speed, hp: snap.hp, maxHp: snap.maxHp, body, label, bar: this.add.graphics() };
      this.monsters.set(snap.id, m);
      this.syncRankContext();
    }
    // A respawn can roll a different rank, so name and size follow the latest snapshot.
    m.tier = snap.tier;
    m.rank = snap.rank;
    m.element = snap.element;
    if (!m.guard) {
      m.body.setFillStyle(ELEMENT_COLOR[snap.element] ?? 0xcccccc);
      m.icon.setFillStyle(ELEMENT_DOT[snap.element] ?? 0xcccccc);
    }
    m.label.setText(this.monsterName(snap.kind, snap.tier, snap.rank, snap.guard === true));
    m.body.setScale(snap.boss ? 2 : snap.rank === "rare2" ? 1.4 : snap.rank === "rare1" ? 1.2 : 1);
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
  private monsterName(kind: string, tier: number, rank: MonsterRank, guard = false): string {
    // A guard shows its name only (no realm, no element, no HP bar), like a player.
    if (guard) return getMonsterDef(kind)?.nameVi ?? kind;
    const tag = isBossKind(kind) ? vi.rank.bossTag : rankDef(rank).tagVi;
    // The bậc shows as the realm tag and the bậc ("TC2"), like on gear.
    return `${getMonsterDef(kind)?.nameVi ?? kind} · ${REALMS[(this.map.realm ?? 0) + (isBossKind(kind) ? bossRealmBonus() : 0)]?.shortVi ?? ""}${tier}${tag ? ` · ${tag}` : ""}`;
  }

  /** Rare monsters have their own colours; normal ones are coloured by how their bậc compares to the player's level. */
  private monsterColor(m: MonsterActor): string {
    if (m.guard) return "#ffd54a"; // guards are gold like a boss, whatever the player's level
    if (m.boss) return "#ff5252";
    if (m.rank === "rare2") return "#ffd54a";
    if (m.rank === "rare1") return "#7fd6ff";
    if (!this.selfSheet) return "#ffffff";
    const diff = levelIndex(this.map.realm ?? 0, m.tier) - levelIndex(this.selfSheet.realm, this.selfSheet.stage);
    if (diff <= -3) return "#9ad59a";
    if (diff <= 2) return "#ffffff";
    if (diff <= 5) return "#ffb74d";
    return "#ff6b6b";
  }

  /** Tells the ranking window what its GM buttons need: a map with monsters, and whether a boss stands here. */
  private syncRankContext(): void {
    this.rank.setContext(!this.map.safe, [...this.monsters.values()].some((m) => m.boss));
  }

  private removeMonster(id: string): void {
    const m = this.monsters.get(id);
    if (!m) return;
    m.body.destroy();
    m.label.destroy();
    m.icon.destroy();
    m.bar.destroy();
    this.monsters.delete(id);
    if (this.targetId === id) this.targetId = null;
    this.syncRankContext();
  }

  /** Floating damage number over the target; also keeps a monster's HP bar current. */
  /** The colour a name is shown in to this player: white, yellow, orange or red by sát nhân, grey for a white or yellow player who hit you in the last 3 minutes. */
  private nameColorOf(actor: Actor, now: number): NameColor {
    const sn = decayedSatNhan(actor.sn, now - actor.snAt);
    const hitAt = this.hitMeAt.get(actor.id);
    // hitMeAt holds performance.now() values; displayColor compares against the same clock.
    return displayColor(nameTier(sn), actor.id === this.selfId ? undefined : hitAt, now);
  }

  /** The tag after another player's name: "PK" in brown (PK) or red (Đồ sát). Not shown on yourself. */
  private setActorPk(actor: Actor, mode: PkMode): void {
    actor.pk = mode;
    actor.tag.setVisible(mode > 0 && actor.id !== this.selfId).setColor(mode === 2 ? "#ff5252" : "#c68642");
  }

  /** Draws (or removes) the cloud under a rider; for yourself it also keeps the badge and the gear-stat views in step. */
  private setActorMounted(actor: Actor, on: boolean): void {
    if (actor.mounted === on) return;
    actor.mounted = on;
    if (on && !actor.cloud) actor.cloud = this.add.ellipse(0, 0, 40, 16, 0x9fe8ff, 0.75).setStrokeStyle(2, 0xffffff, 0.8);
    actor.cloud?.setVisible(on);
    if (actor.id === this.selfId && isMounted() !== on) this.applyMounted(on);
  }

  /**
   * Gets on or off. A walk in progress goes on at the new speed from where the character is right now, predicted here just like a click
   * to walk is (and the position is sent along), so the change is smooth and the server's answer does not pull the character back.
   */
  private toggleMount(): void {
    const on = !isMounted();
    const self = this.actors.get(this.selfId);
    const sheet = this.selfSheet;
    if (!self || !sheet || (on && !this.flightWorn)) {
      this.net.send({ t: "mount", on });
      return;
    }
    const now = performance.now();
    const here = currentPos(self, now);
    const from: Vec2 = [Math.round(here.x * 100) / 100, Math.round(here.y * 100) / 100];
    const speed = walkSpeed(sheet.base, equipmentBonus(this.worn, { ...wearerOfSheet(sheet), mounted: on }).moveSpeed);
    const dest = self.path[self.path.length - 1];
    const rest = here.moving && dest ? findSmoothPath(this.map, from, dest) : null;
    applyTrack(self, rest ?? [from], now, speed, now);
    this.net.send({ t: "mount", on, fx: from[0], fy: from[1] });
  }

  /** The button is there while a flight pháp bảo is worn (or you are riding): it says what a press does. */
  private refreshMountBtn(): void {
    const on = isMounted();
    // Always there once in the game, like the other buttons; grey and dead while no flight pháp bảo is worn.
    this.mountBtn.hidden = false;
    this.mountBtn.textContent = on ? vi.mount.down : vi.mount.up;
    this.mountBtn.title = this.flightWorn || on ? vi.mount.hint : vi.mount.needFlight;
    this.mountBtn.disabled = !this.flightWorn && !on;
    this.mountBtn.classList.toggle("riding", on);
  }

  /** Your own riding state changed: badge, stat views and the line in the system chat. */
  private applyMounted(on: boolean, announce = false): void {
    if (isMounted() === on) return;
    setMounted(on);
    this.refreshMountBtn();
    this.charPanel.refresh();
    this.equipment.refresh();
    if (announce) this.chat.system(on ? vi.mount.on : vi.mount.off);
  }

  private recolorName(actor: Actor, now: number): void {
    const color = this.nameColorOf(actor, now);
    actor.label.setColor(color === "gray" ? "#9e9e9e" : color === 3 ? "#ff5252" : color === 2 ? "#ff9800" : color === 1 ? "#ffd54a" : "#ffffff");
  }

  private recolorAll(): void {
    const now = performance.now();
    this.pk.tick();
    this.hotbar.refresh(); // MP regenerates: slots it can pay for again stop being dim
    for (const a of this.actors.values()) this.recolorName(a, now);
  }

  /** The player drawn under a click, other than yourself (used with the PK switch on). */
  private pickPlayer(wx: number, wy: number): string | null {
    const now = performance.now();
    let best: string | null = null;
    let bestD = MONSTER_PICK_PX;
    for (const a of this.actors.values()) {
      if (a.id === this.selfId) continue;
      const hitAt = this.hitMeAt.get(a.id);
      if (this.pk.mode() === 0 && !(hitAt !== undefined && now - hitAt < grayWindowMs())) continue;
      const pos = currentPos(a, now);
      const s = toScreen(pos.x, pos.y);
      const d = Math.hypot(s.x - wx, s.y - 20 - wy);
      if (d <= bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  }

  private showHit(msg: Extract<ServerMessage, { t: "hit" }>): void {
    if (msg.to === this.selfId && this.actors.has(msg.from) && !msg.ret) this.hitMeAt.set(msg.from, performance.now());
    // A hit with no skill behind it is a plain attack (a skill is drawn from its own `fx` message).
    if (!msg.skill) this.fx.basic(msg.from, msg.to, this.monsters.has(msg.from));
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
    this.fx.update(now);
    for (const actor of this.actors.values()) {
      const pos = currentPos(actor, now);
      const s = toScreen(pos.x, pos.y);
      actor.body.setPosition(s.x, s.y - (actor.mounted ? 25 : 17));
      if (actor.cloud) actor.cloud.setPosition(s.x, s.y - 4).setDepth(10 + pos.x + pos.y - 0.1);
      actor.label.setPosition(s.x, s.y - (actor.mounted ? 46 : 38));
      const depth = 10 + pos.x + pos.y;
      actor.body.setDepth(depth);
      actor.label.setDepth(depth + 0.1);
      if (actor.tag.visible) actor.tag.setPosition(s.x + actor.label.width / 2 + 2, s.y - (actor.mounted ? 47 : 39)).setDepth(depth + 0.1);
    }

    for (const m of this.monsters.values()) {
      const pos = positionAlongPath(m.path, now - m.startedAt, m.speed);
      const s = toScreen(pos.x, pos.y);
      const depth = 10 + pos.x + pos.y;
      // A guard stands like a player: the same body and name height, no element icon and no HP bar.
      m.body.setPosition(s.x, s.y - (m.guard ? 17 : 13)).setDepth(depth);
      m.label.setPosition(s.x, s.y - (m.guard ? 38 : 40)).setDepth(depth + 0.1);
      // The element icon sits just left of the name, level with its middle.
      m.icon.setPosition(s.x - m.label.width / 2 - 8, s.y - 40 - m.label.height / 2).setDepth(depth + 0.1);
      const color = this.monsterColor(m);
      if (color !== m.color) {
        m.color = color;
        m.label.setColor(color);
      }
      m.bar.clear().setDepth(depth + 0.1);
      if (!m.guard) {
        const w = 34;
        m.bar.fillStyle(0x000000, 0.7).fillRect(s.x - w / 2, s.y - 36, w, 5);
        m.bar.fillStyle(0xe53935, 1).fillRect(s.x - w / 2 + 1, s.y - 35, (w - 2) * Math.max(0, m.hp / m.maxHp), 3);
      }
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

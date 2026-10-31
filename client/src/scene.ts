import Phaser from "phaser";
import {
  headingAlongPath,
  tuning,
  BASIC_SKILL_ID,
  parseSkillSlot,
  directionOf,
  type GfxAnimName,
  bossKinds,
  bossRealmBonus,
  equipmentInfo,
  mpRegenPerS,
  REGEN_PER_S,
  getItemDef,
  getSkill,
  setBasicSkillRealm,
  bootsTintOf,
  hatShapeOf,
  hatTintOf,
  robeTintOf,
  weaponTintOf,
  type GearLook,
  glowTierOf,
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
  findSmoothPath,
  getMap,
  isMapId,
  mapArtOf,
  guardLookOf,
  monsterTintOf,
  npcLookOf,
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
  installMapNames,
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
import { initDojo, type DojoUi } from "./dojo-ui";
import { initMarket, type MarketUi } from "./market-ui";
import { initPlayerMenu, type PlayerMenu } from "./player-menu";
import { initSect, type SectUi } from "./sect-ui";
import { initTrade, type TradeUi } from "./trade-ui";
import { initMinimap, type MinimapUi } from "./minimap";
import { Effects } from "./fx";
import { HAT_ORN_TEX, HAT_TEX, ensureHatTextures } from "./hat-art";
import { DRAGON_HEAD, DRAGON_MIST, DRAGON_SEG, DRAGON_TAIL, FLIGHT_GLOW, FLIGHT_SCALE, FLIGHT_TEX, FLIGHT_TURNS, ensureFlightTextures } from "./flight-art";
import { FX_TEX, ensureFxTextures } from "./fx-art";

/** The flight look an actor rides on: the one its worn pháp bảo gives, else the default. */
const actorFlight = (a: { flight?: string }): FlightStyle => ((FLIGHT_STYLES as readonly string[]).includes(a.flight ?? "") ? (a.flight as FlightStyle) : flightStyleOf());

/** Which side of the screen each of the 8 directions of a figure faces: -2 left, 0 toward the camera or away from it, +2 right (see DIRECTION_VECTORS). */
/** How big a hat picture is drawn on a head (the picture is 40 px wide; a head is about 14 px across on screen). */
const HAT_SCALE = 0.62;
const HEAD_SIDE: readonly number[] = [0, -1, -2, -1, 0, 1, 2, 1];

/** `#rrggbb` as a number, or undefined (no tint) when there is none. */
/** `k` of the way from the colour `a` to the colour `b` (both 0xRRGGBB). */
const mixTint = (a: number, b: number, k: number): number => {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const hexOf = (hex: string | undefined): number | undefined => (hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : undefined);
import { initChannel, type ChannelUi } from "./channel-ui";
import { initRank, type RankUi } from "./rank-ui";
import { closeAllWindows } from "./window-manager";
import { setGearSetNames, setWornSkillSets, skillDisplayName, grayWindowMs, decayedSatNhan, displayColor, nameTier, type NameColor, type PkMode } from "@game/shared";
import { FLIGHT_STYLES, NPC_INTERACT_RADIUS, flightStyleOf, type FlightStyle, nearestStandablePoint, type NpcSpot, type NpcView } from "@game/shared";
import { initBuffs, type BuffsUi } from "./buffs-ui";
import { initHotbar, type HotbarUi } from "./hotbar-ui";
import { initSkills, type SkillsUi } from "./skills-ui";
import { initInventory, type InventoryUi } from "./inventory-ui";
import { initVitals, type VitalsUi } from "./vitals-ui";
import { DEFAULT_CHANNEL } from "./config";
import { decide, newAutoMemory, type AutoAction, type AutoMemory, type AutoSettings, type AutoView } from "./auto-brain";
import { initAuto, type AutoUi } from "./auto-ui";
import { loadPrimary, savePrimary, type PrimaryChoice } from "./primary-store";
import { iconButton } from "./icons";
import { loading } from "./loading-ui";
import { qiSpawnPoint, qiStyleOf } from "./qi-aura";
import { mapLabel, vi } from "./locales/vi";
import { isMounted, setMounted, wearerOfSheet } from "./wearer";
import { Net } from "./net";
import { GfxKit, ONE_SHOT_MS, type GfxView } from "./gfx/kit";
import { attackAnimOf, skillFxOf, weaponEquipped } from "./fx-kinds";
import { initPerf } from "./perf-ui";
import { MapLayer } from "./map-layer";

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
  /** The sect name drawn above the name (made when the player is in a sect). */
  sectTag?: Phaser.GameObjects.Text;
  /** Riding the flight pháp bảo: drawn on a small cloud under the feet and lifted off the ground. */
  mounted: boolean;
  cloud?: Phaser.GameObjects.Image;
  /** The joints, head and tail tip of the dragon pháp bảo (made when the rider's flight is the dragon; head last, tail tip first). */
  dragon?: Phaser.GameObjects.Image[];
  /** Where the rider was on screen last frame and the way they are heading (radians on screen), so a flying sword points where it flies. */
  fly?: { x: number; y: number; a: number };
  /** The sprite that replaces the oval body when the manifest has one for it (phase 4); the body stays as the camera anchor, hidden. */
  view?: GfxView;
  /** Drawn with the female body (from the snapshot); picks the sprite. */
  female?: boolean;
  /** The weapon family in the hand (from the snapshot and the `look` messages), and the sprite drawn over the body for it. */
  weapon?: string;
  /** The outfit worn (from the snapshot and the `look` messages): picks the body sprite variant. */
  outfit?: string;
  /** What the worn weapon, robe, hat and boots add to the look (from the snapshot and the `look` messages); `hat` is the hat drawn on the head. */
  lk?: GearLook;
  hat?: Phaser.GameObjects.Image;
  /** Meditating: drawn sitting, with a ring of light under it and motes of healing round it. `seat` is the ring, `moteAt` when the next mote rises. */
  sitting?: boolean;
  seat?: Phaser.GameObjects.Container;
  /** The folded legs drawn over the cut of a seated figure. */
  legs?: Phaser.GameObjects.Ellipse;
  /** The light round a weapon upgraded to +7 or more (a soft blob over the weapon sprite). */
  wglow?: Phaser.GameObjects.Image;
  /** The front ornament of the hat, carried round it as the figure turns; `hatAng` is the way the head faces now (radians, 0 = towards the camera), eased towards the heading. */
  hatOrn?: Phaser.GameObjects.Image;
  /** The puffs of cloud under the dragon pháp bảo, laid along its body. */
  mist?: Phaser.GameObjects.Image[];
  hatAng?: number;
  moteAt?: number;
  /** The flight pháp bảo look this player rides on (`FlightStyle`; none: the default look). */
  flight?: string;
  /** The cultivation level (`realm * 10 + stage`): the colour and thickness of the qi haze round the figure. */
  lv?: number;
  /** When (performance.now) the next wisp of that haze is released. */
  qiNext?: number;
  wview?: GfxView;
  /** Sát nhân when last heard (it falls 5 a minute while online) and when; the name colour comes from these. */
  sn: number;
  snAt: number;
}

function isBossKind(kind: string): boolean {
  return bossKinds().includes(kind);
}

interface MonsterActor {
  id: string;
  kind: string;
  /** The sprite that replaces the square when the manifest has one (phase 4); the square stays, hidden. */
  view?: GfxView;
  /** The weapon sprite of a guard (a guard is drawn as a player body holding a weapon, from the tuning `npcLooks`). */
  wview?: GfxView;
  /** The formation circle under a guard (from the tuning `npcLooks`): lit only for a moment when it uses a skill. */
  aura?: Phaser.GameObjects.Container;
  /** When (performance.now) the aura goes out again. */
  auraUntil?: number;
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
  /** Killed and playing its death: when to drop it. It cannot be picked or targeted meanwhile; a respawn under the same id drops it at once. */
  dyingUntil?: number;
}

/** How long a killed monster with a sprite stays on screen for its death animation. */
const DEATH_LINGER_MS = 1600;
/** How long green dots stay round someone who cast a heal. */
const HEAL_DOTS_MS = 3000;

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
/** The teleport array is a wide circle on the ground (tiles): a click anywhere in it walks the character to its middle, and standing in the middle opens its window. */
/** A player clicked in a safe map: the character walks up to PLAYER_MENU_STAND tiles from them, and the menu opens within PLAYER_MENU_REACH. */
const PLAYER_MENU_REACH = 2.3;
const PLAYER_MENU_STAND = 2;
/** An NPC is walked up to about this far (not to its side), so a crowd does not hide it. */
const NPC_STAND = 2;
const WAYGATE_RADIUS = 2.6;
/** How close to the middle of the array the character must stand for its window to open by itself after the walk. */
const WAYGATE_CENTER_REACH = 0.7;
export class GameScene extends Phaser.Scene {
  private gfx!: GfxKit;
  private map: MapData = getMap("town");
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  /** The obstacles and walls around the camera (built and dropped as it moves). */
  private mapLayer?: MapLayer;
  private lastSweepAt = 0;
  /** The NPCs of the current map: their shape figure, name, and the sprite views that replace the figure. */
  /** Blows just taken, by id: the figure flashes white and is shoved back a little for a moment (applied where its sprite is placed). */
  private reacts = new Map<string, { at: number; ms: number; kx: number; ky: number; push: number }>();
  /** Timed buffs still running on each actor (skill id -> when it ends, performance.now): they keep a light round the figure. */
  private buffGlows = new Map<string, Map<string, number>>();
  private nextGlowAt = 0;
  private npcFigures: Array<{ npc: NpcSpot; x: number; y: number; depth: number; body: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; view?: GfxView; wview?: GfxView; aura?: Phaser.GameObjects.Container }> = [];
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
  private tienNgoc = 0;
  private quests!: QuestUi;
  private pk!: PkUi;
  private channel!: ChannelUi;
  private waygate!: WaygateUi;
  /** The teleport array the character is walking to the middle of (its window opens on arrival). */
  private playerMenu!: PlayerMenu;
  /** A player the character is walking up to, to open the menu of what can be done with them. */
  private pendingPlayer: { id: string } | null = null;
  private playerWatch: Phaser.Time.TimerEvent | null = null;
  private pendingWaygate: NpcSpot | null = null;
  private waygateWatch: Phaser.Time.TimerEvent | null = null;
  private dojo!: DojoUi;
  private market!: MarketUi;
  private trade!: TradeUi;
  private sect!: SectUi;
  private minimap!: MinimapUi;
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
  private meditateBtn!: HTMLButtonElement;
  private meditating = false;
  private medTimer: number | undefined;
  private flightWorn = false;
  private ping = 0;
  private pingSentAt = 0;
  private moveSeq = 0;
  private lastMoveSentAt = 0;
  private colo = "…";
  private portalSentAt = 0;
  private transferring = false;
  /** The Auto hunt: the window and button, whether it runs, what it was started with, what it remembers, where it started and when it thinks next. */
  private autoUi!: AutoUi;
  private autoOn = false;
  private autoSettings: AutoSettings | null = null;
  private autoMem: AutoMemory = newAutoMemory();
  private autoAnchor = { x: 0, y: 0 };
  private autoNextAt = 0;
  /** When the player last walked by hand while Auto ran (0: not walking by hand). */
  private autoManualAt = 0;
  /** When each skill is ready again (performance.now) as the server last said, the hotbar as the server holds it, and your own HP, max MP and whether you are dead (for Auto). */
  private cdUntil = new Map<string, number>();
  private hotbarSlots: string[] = [];
  private selfHp = 0;
  private selfMaxHp = 0;
  private selfMaxMp = 0;
  private selfDead = false;
  /** The attack the player chose for the slot in front of the hotbar (null: the plain attack), kept per character in the browser and told to the server at every welcome. */
  private primary: PrimaryChoice | null = null;
  /** The loading screen: the welcome is in, and for how many frames in a row nothing has been left to load; when it was put up. */
  private welcomed = false;
  private settledFrames = 0;
  private loadingSince = 0;
  /** The next frame puts the camera straight on yourself (no slide from wherever it was). */
  private snapCamera = false;
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
    this.meditateBtn = document.createElement("button");
    this.meditateBtn.id = "meditate-btn";
    this.meditateBtn.hidden = true;
    this.meditateBtn.onclick = () => this.toggleMeditate();
    document.body.append(this.meditateBtn);
    this.setMeditating(false);
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
      getAim: () => this.aimPoint(),
      getMp: () => this.vitals.getMp(),
      primary: () => this.primary,
      setPrimary: (choice) => {
        this.primary = choice;
        savePrimary(this.selfSheet?.id ?? null, choice);
        this.net.send({ t: "primary", skill: choice?.skill ?? "", ...(choice?.el ? { el: choice.el as SpiritualRoot } : {}) });
      },
      roots: () => this.selfSheet?.roots ?? [],
      hasBasic: () => !!this.knownSkills?.includes(BASIC_SKILL_ID),
      contextOf: (skill) => this.skillContext(skill),
      countOf: (type) => this.inventory.list().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0),
    });
    this.buffs = initBuffs();
    this.skillsUi = initSkills({
      beginAssign: (value, label) => this.hotbar.beginAssign(value, label),
      boost: (skill) => this.net.send({ t: "skill_boost", skill }),
      forget: (skill) => this.net.send({ t: "skill_forget", skill }),
      pillCount: () => this.inventory.list().filter((i) => getItemDef(i.type)?.masteryPills !== undefined).reduce((n, i) => n + i.qty, 0),
    });
    this.inventory = initInventory((msg) => this.net.send(msg), (value, label) => this.hotbar.beginAssign(value, label));
    this.equipment = initEquipment((msg) => this.net.send(msg), () => this.inventory.list(), this.registry.get("isAdmin") === true);
    this.shop = initShop((msg) => this.net.send(msg), () => this.inventory.list(), (npc, view) => this.switchNpcView(npc, view));
    this.smith = initSmith((msg) => this.net.send(msg), () => this.inventory.list(), () => ({ linh_thach: this.linhThach }), (npc, view) => this.switchNpcView(npc, view));
    this.quests = initQuests((msg) => this.net.send(msg), () => this.inventory.list(), (title) => this.chat.system(vi.quests.ready(title)));
    this.pk = initPk((msg) => this.net.send(msg));
    this.autoUi = initAuto({
      charId: () => this.selfSheet?.id ?? null,
      hotbarSkills: () => this.hotbarSlots.flatMap((v, i) => (parseSkillSlot(v) && getSkill(parseSkillSlot(v)!.id) ? [{ value: v, key: i + 1 }] : [])),
      potions: () => {
        const by = new Map<string, number>();
        for (const it of this.inventory.list()) {
          const d = getItemDef(it.type);
          if (d?.healFraction !== undefined || d?.mpFraction !== undefined) by.set(it.type, (by.get(it.type) ?? 0) + it.qty);
        }
        return [...by].map(([type, qty]) => ({ type, name: getItemDef(type)?.nameVi ?? type, qty, hp: getItemDef(type)?.healFraction !== undefined, mp: getItemDef(type)?.mpFraction !== undefined }));
      },
      onStart: (settings) => this.startAuto(settings),
      onStop: () => this.stopAuto("stopped"),
    });
    this.channel = initChannel();
    this.waygate = initWaygate((msg) => this.net.send(msg));
    this.dojo = initDojo((msg) => this.net.send(msg));
    this.market = initMarket((msg) => this.net.send(msg), () => this.inventory.list());
    this.playerMenu = initPlayerMenu();
    this.trade = initTrade((msg) => this.net.send(msg), () => this.inventory.list(), (text, ok) => this.chat.system(text, ok ? "info" : "warning"));
    this.minimap = initMinimap();
    ensureFlightTextures(this);
    ensureHatTextures(this);
    ensureFxTextures(this);
    this.fx = new Effects(this, (id) => this.screenPosOf(id), () => this.selfId);
    this.gfx = new GfxKit(this);
    this.gfx.useMap(this.map.id);
    void this.gfx.init();
    if (new URLSearchParams(location.search).get("perf") === "1") initPerf(this.game, this, () => ({ ...this.gfx.stats(), players: this.actors.size, monsters: this.monsters.size }));
    this.rank = initRank((msg) => this.net.send(msg), this.registry.get("isAdmin") === true);
    this.sect = initSect((msg) => this.net.send(msg), (text, ok) => this.chat.system(text, ok ? "info" : "warning"), () => this.linhThach, () => this.selfId);
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
      if (!typing && (ev.key === "v" || ev.key === "V") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && this.selfId) {
        this.toggleMeditate();
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
        if (connected) loading.set(0.3, vi.loadingScreen.entering);
        if (!connected) {
          this.hud.textContent = this.transferring ? vi.transferring : vi.disconnected;
          this.clearActors();
          this.stopAuto("moved");
          this.beginLoading(this.transferring ? vi.loadingScreen.transferring : vi.loadingScreen.reconnecting);
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
    for (const f of this.npcFigures) {
      f.view?.destroy();
      f.wview?.destroy();
      f.aura?.destroy();
    }
    this.npcFigures = [];
    this.reacts.clear();
    this.buffGlows.clear();
    for (const obj of this.mapObjects) obj.destroy();
    this.mapObjects = [];

    // The ground, the obstacles and the walls are a MapLayer: the ground pattern, trees, rocks and walls drawn in chunks around the camera only (the map
    // is far too big for textures of its own: docs/PHASE4.md, 4g and 4h).
    const art = mapArtOf(this.map.id);
    this.mapLayer?.destroy();
    this.mapLayer = new MapLayer(this, this.map, art);

    for (const portal of this.map.portals) {
      const p = toScreen(portal.x, portal.y);
      const glow = this.add.graphics().setDepth(0.5);
      glow.fillStyle(0x7b61ff, 0.55).lineStyle(2, 0xd9ccff, 1);
      const pts = this.diamond(p.x, p.y);
      glow.fillPoints(pts, true);
      glow.strokePoints(pts, true);
      const label = this.add
        .text(p.x, p.y - 6, mapLabel(portal.toMap), {
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
        // A formation circle on the ground (nothing blocks it: characters arrive standing on it): the trigram ring turns slowly, with a soft violet light under it.
        const rx = WAYGATE_RADIUS * TILE_W * 0.5;
        const ry = WAYGATE_RADIUS * TILE_H * 0.5;
        const g = this.add.graphics().setDepth(0.4);
        g.fillStyle(0x7b61ff, 0.2).fillEllipse(p.x, p.y, rx * 1.9, ry * 1.9);
        const rune = this.add.image(0, 0, FX_TEX.rune).setBlendMode(Phaser.BlendModes.ADD).setTint(0xb9a4ff).setAlpha(0.95);
        const ring = this.add.container(p.x, p.y, [rune]).setScale((rx * 2.1) / 256, (ry * 2.1) / 256).setDepth(0.41);
        const spin = this.tweens.add({ targets: rune, rotation: Math.PI * 2, duration: 14_000, repeat: -1 });
        const pulse = this.tweens.add({ targets: rune, alpha: 0.6, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        ring.once("destroy", () => {
          spin.stop();
          pulse.stop();
        });
        const label = this.add.text(p.x, p.y - ry - 4, npc.name ?? vi.npcs[npc.id] ?? npc.id, { fontFamily: FONT, fontSize: "12px", color: "#e8e0ff", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(10 + npc.x + npc.y + 0.1);
        this.mapObjects.push(g, ring, label);
        continue;
      }
      // Placeholder figure (a robe and a head) standing on the NPC's spot; a player body replaces it once the sprites are loaded (syncNpcViews).
      const depth = 10 + npc.x + npc.y; // the same scale as players, monsters and trees (a tile sum), so they pass in front of and behind each other correctly
      const body = this.add.graphics().setDepth(depth);
      body.fillStyle(npc.kind === "quest" ? 0x5a8ad6 : npc.kind === "alchemist" ? 0x5aa66a : 0xd6a94b, 1).fillEllipse(p.x, p.y, 22, 11).fillRoundedRect(p.x - 8, p.y - 30, 16, 28, 5);
      body.fillStyle(0xf2d6b0, 1).fillCircle(p.x, p.y - 36, 7);
      const label = this.add
        .text(p.x, p.y - 48, npc.name ?? vi.npcs[npc.id] ?? npc.id, { fontFamily: FONT, fontSize: "12px", color: "#ffe08a", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(depth + 0.1);
      this.mapObjects.push(body, label);
      this.npcFigures.push({ npc, x: p.x, y: p.y, depth, body, label });
    }
  }

  /** A formation circle turning slowly on the ground at (x, y) in `color` (`#rrggbb`): the mark of a cultivator (an NPC, a guard). */
  private makeAura(x: number, y: number, color: string, radius: number, depth: number): Phaser.GameObjects.Container {
    const rune = this.add.image(0, 0, FX_TEX.rune).setBlendMode(Phaser.BlendModes.ADD).setTint(hexOf(color) ?? 0xffffff).setAlpha(0.6);
    const box = this.add.container(x, y, [rune]).setScale((radius * 2) / 256, (radius * 2 * 0.5) / 256).setDepth(depth);
    const spin = this.tweens.add({ targets: rune, rotation: Math.PI * 2, duration: 16_000, repeat: -1 });
    box.once("destroy", () => spin.stop());
    return box;
  }

  /**
   * NPCs are player bodies (male or female, an outfit, a weapon) chosen by the tuning `npcLooks`. The sprites may load after the map is drawn, so the views
   * are made here, a frame at a time: the shape figure stays until its sprite exists, a changed outfit swaps the view, and the name rides at the head.
   */
  private syncNpcViews(): void {
    if (this.npcFigures.length === 0 || !this.gfx.active) return;
    for (const f of this.npcFigures) {
      const look = npcLookOf(f.npc);
      if (!look) continue;
      const key = this.gfx.spriteKeyFor("player", undefined, `${look.body}${look.outfit ? `.${look.outfit}` : ""}`);
      if (f.view && (!f.view.alive || (key && f.view.key !== key))) {
        f.wview?.destroy();
        f.view.destroy();
        f.view = f.wview = undefined;
        f.body.setVisible(true);
        f.label.setY(f.y - 48);
      }
      if (!f.view && key) {
        const view = this.gfx.createView(key);
        if (view) {
          f.view = view;
          f.body.setVisible(false);
        }
      }
      if (!f.view?.alive) continue;
      const wkey = look.weapon ? this.gfx.spriteKeyFor("weapon", look.weapon, look.body) : undefined;
      if (f.wview && (!f.wview.alive || f.wview.key !== wkey)) {
        f.wview.destroy();
        f.wview = undefined;
      }
      if (!f.wview && wkey) f.wview = this.gfx.createView(wkey);
      f.view.play("idle", 0);
      f.view.setTint(hexOf(look.tint));
      f.view.place(f.x, f.y, f.depth);
      f.wview?.followFrame(f.view);
      f.wview?.place(f.x, f.y, f.depth + 0.02);
      f.label.setY(f.y - f.view.rise() - 6);
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
    this.gfx.useMap(mapId);
    this.minimap.setMap(this.map);
    this.minimap.show(true);
    this.shop.close();
    this.quests.close();
    this.waygate.close();
    this.dojo.close();
      this.market.close();
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

  /** The ground point under the pointer (the last place it touched on a phone), in tiles: where a directional cast is aimed. */
  private aimPoint(): { x: number; y: number } | null {
    const p = this.input.activePointer;
    if (!this.cameras.main || (p.x === 0 && p.y === 0 && !p.isDown)) return null;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return toTile(w.x, w.y);
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.transferring) return;
    if (this.guardBreakthrough()) return;
    this.pendingPlayer = null; // any click cancels a walk toward a player; the menu closes itself on a click outside it
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
      this.stopAuto("manual");
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
      this.stopAuto("manual"); // opening an NPC window is the player taking over
      this.talkTo(npc);
      return;
    }
    // With the PK state on (or against a player who hit you in the last 3 minutes: self-defence), a click on another player attacks them
    // (the server checks the rules and says why when it refuses).
    // In a safe map a click on another player offers a trade instead (nobody can be attacked there).
    if (this.map.safe) {
      const other = this.pickPlayer(world.x, world.y, true);
      if (other) {
        this.stopAuto("manual");
        this.approachPlayer(other);
        return;
      }
    }
    const player = !this.map.safe ? this.pickPlayer(world.x, world.y) : null;
    const picked = player ?? this.pickMonster(world.x, world.y);
    if (picked) {
      this.stopAuto("manual"); // taking a target by hand is the player taking over
      const nowMs = performance.now();
      if (nowMs - this.lastAttackSentAt >= ATTACK_MIN_GAP_MS + 20) {
        this.lastAttackSentAt = nowMs;
        this.targetId = picked;
        this.net.send({ t: "attack", id: picked });
      }
      return;
    }
    this.targetId = null;
    if (this.meditating) this.setMeditating(false); // a click to walk stands the character up (the server does the same)
    if (this.autoOn) this.autoManualAt = performance.now(); // a walk by hand: Auto keeps casting but stops steering until the character is still
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
    if (npc.kind === "waygate" && Math.hypot(here.x - npc.x, here.y - npc.y) > WAYGATE_CENTER_REACH) {
      // The array: step into the middle of the circle (not beside it), and its window opens when the character arrives.
      this.sendWalk(Math.round(npc.x * 100) / 100, Math.round(npc.y * 100) / 100);
      this.pendingWaygate = npc;
      this.waygateWatch?.remove(); // one watcher at a time: a second click must not leave the first one running
      const watch: Phaser.Time.TimerEvent = this.time.addEvent({
        delay: 120,
        repeat: 80,
        callback: () => {
          const me = this.actors.get(this.selfId);
          if (this.pendingWaygate !== npc || !me) return void watch.remove();
          const p = currentPos(me, performance.now());
          if (Math.hypot(p.x - npc.x, p.y - npc.y) <= WAYGATE_CENTER_REACH) {
            this.pendingWaygate = null;
            watch.remove();
            this.talkTo(npc);
          }
        },
      });
      this.waygateWatch = watch;
      return;
    }
    if (Math.hypot(here.x - npc.x, here.y - npc.y) <= NPC_INTERACT_RADIUS - 0.4) {
      // One NPC window at a time (both would otherwise open on the same spot).
      this.shop.close();
      this.quests.close();
      this.smith.close();
      this.waygate.close();
      this.dojo.close();
      this.market.close();
      if (npc.kind === "quest") this.quests.open(npc.id);
      else if (npc.kind === "smith") this.smith.open(npc.id);
      else if (npc.kind === "waygate") this.waygate.open(npc.id);
      else if (npc.kind === "master") this.dojo.open(npc.id);
      else if (npc.kind === "market") this.market.open(npc.id);
      else if (npc.kind === "sect") {
        this.sect.setNpc(npc.id);
        this.sect.open();
      }
      else this.shop.open(npc.id, this.map.id);
      return;
    }
    this.chat.system(vi.shop.tooFar, "error");
    // Walk to the standable spot nearest the NPC on the player's side.
    const dx = here.x - npc.x;
    const dy = here.y - npc.y;
    const len = Math.hypot(dx, dy) || 1;
    const spot = nearestStandablePoint(this.map, npc.x + (dx / len) * NPC_STAND, npc.y + (dy / len) * NPC_STAND, 1);
    if (spot) this.sendWalk(Math.round(spot[0] * 100) / 100, Math.round(spot[1] * 100) / 100);
  }

  /**
   * A click on another player (in a safe map): the character walks up to a short distance from them, and then the menu of what can be done with
   * them opens (so nobody trades from across the map). Already close: it opens at once.
   */
  private approachPlayer(id: string): void {
    const self = this.actors.get(this.selfId);
    const other = this.actors.get(id);
    if (!self || !other) return;
    const open = () => {
      const target = this.actors.get(id);
      if (!target) return;
      this.playerMenu.show(target.label.text, [{ label: vi.playerMenu.trade, run: () => this.net.send({ t: "trade_invite", to: id }) }, ...(this.sect.canInvite() ? [{ label: vi.playerMenu.sectInvite, run: () => this.net.send({ t: "sect_invite", to: id }) }] : [])]);
    };
    const near = (): boolean => {
      const a = this.actors.get(this.selfId);
      const b = this.actors.get(id);
      if (!a || !b) return false;
      const now = performance.now();
      const p = currentPos(a, now);
      const q = currentPos(b, now);
      return Math.hypot(p.x - q.x, p.y - q.y) <= PLAYER_MENU_REACH;
    };
    this.playerMenu.close();
    if (near()) return open();
    const here = currentPos(self, performance.now());
    const there = currentPos(other, performance.now());
    const len = Math.hypot(here.x - there.x, here.y - there.y) || 1;
    const spot = nearestStandablePoint(this.map, there.x + ((here.x - there.x) / len) * PLAYER_MENU_STAND, there.y + ((here.y - there.y) / len) * PLAYER_MENU_STAND, 2);
    if (!spot) return open();
    this.sendWalk(Math.round(spot[0] * 100) / 100, Math.round(spot[1] * 100) / 100);
    const mark = { id };
    this.pendingPlayer = mark;
    this.playerWatch?.remove(); // one watcher at a time
    const watch: Phaser.Time.TimerEvent = this.time.addEvent({
      delay: 150,
      repeat: 100,
      callback: () => {
        if (this.pendingPlayer !== mark || !this.actors.has(id)) return void watch.remove();
        if (!near()) return;
        this.pendingPlayer = null;
        watch.remove();
        open();
      },
    });
    this.playerWatch = watch;
  }

  /** Walks to a point: predicts the path locally and tells the server. */
  private sendWalk(tx: number, ty: number): void {
    // Client-side throttle matches the server's, so a dropped click never desyncs the prediction.
    const now = performance.now();
    if (now - this.lastMoveSentAt < MIN_MOVE_INTERVAL_MS + 20) return;
    const from = this.predictSelfMove(tx, ty);
    if (!from) return;
    this.pendingWaygate = null; // a new walk cancels the one that was going to open the teleport array
    this.pendingPlayer = null; // and the one toward a player
    this.lastMoveSentAt = now;
    this.shop.close(); // walking away from an NPC closes its window
    this.quests.close();
    this.smith.close();
    this.waygate.close();
    this.dojo.close();
      this.market.close();
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
        installMapNames(msg.mapNames); // the names admins gave to maps (before any label below)
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
        this.sect.show();
        this.inventory.setSheet(msg.character);
        this.skillsUi.setSheet(msg.character);
        this.selfSheet = msg.character;
        setBasicSkillRealm(msg.character.realm);
        this.primary = loadPrimary(msg.character.id, msg.character.roots);
        this.net.send({ t: "primary", skill: this.primary?.skill ?? "", ...(this.primary?.el ? { el: this.primary.el as SpiritualRoot } : {}) });
        this.vitals.set(msg.hp, msg.maxHp);
        this.selfHp = msg.hp;
        this.selfMaxHp = msg.maxHp;
        this.selfMaxMp = msg.maxMp;
        this.selfDead = false;
        this.hotbarSlots = msg.hotbar;
        this.stopAuto("moved"); // a new room: the spot it started from means nothing now
        this.autoUi.show(true);
        this.vitals.setWallet(msg.wallet);
        this.linhThach = msg.wallet.linh_thach;
        this.tienNgoc = msg.wallet.tien_ngoc;
        this.waygate.setBalance(this.linhThach);
        this.dojo.setBalance(this.linhThach);
        this.market.setBalance(this.linhThach, this.tienNgoc);
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
        this.vitals.setMp(msg.mp, msg.maxMp, 0, 0);
        // A town has no simulation and sends no rates: the character heals by itself there, as it always did. A combat map sends its rates right after this.
        this.vitals.setRates(msg.maxHp * REGEN_PER_S, msg.maxMp * mpRegenPerS());
        this.setMeditating(false);
        this.hotbar.refresh(); // the slots were drawn before the MP was known (they dim what the MP cannot pay)
        this.buffs.set(msg.effects);
        for (const [skill, ms] of Object.entries(msg.cd)) this.noteCooldown(skill, ms);
        this.refreshHud();
        this.welcomed = true;
        this.snapCamera = true;
        loading.set(0.5, vi.loadingScreen.images(0, 0));
        break;
      case "mon":
        this.upsertMonster(msg.monster);
        break;
      case "mon_gone":
        if (msg.dead) this.killMonster(msg.id);
        else this.removeMonster(msg.id);
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
      case "regen":
        this.vitals.setRates(msg.hp, msg.mp);
        break;
      case "sit": {
        const sitter = this.actors.get(msg.id);
        if (sitter) sitter.sitting = msg.on;
        break;
      }
      case "meditating":
        this.setMeditating(msg.on);
        if (msg.reason && vi.meditate.reasons[msg.reason]) this.chat.system(vi.meditate.reasons[msg.reason]!, msg.reason === "hit" || msg.reason === "died" ? "error" : undefined);
        else if (msg.on) this.chat.system(vi.meditate.on);
        break;
      case "hp":
        this.vitals.set(msg.hp, msg.maxHp);
        this.selfHp = msg.hp;
        this.selfMaxHp = msg.maxHp;
        break;
      case "died":
        this.selfDead = true;
        this.setMeditating(false);
        this.stopAuto("dead");
        this.playOnce(this.selfId, "die"); // stays on the last frame until the transfer to town replaces the view
        this.hitMeAt.clear(); // the quarrel with whoever killed us is over: their name goes back to its real colour
        this.channel.stop();
        this.chat.system(vi.combat.died(msg.expLost), "important");
        break;
      case "wallet":
        if (msg.currency === "linh_thach") {
          this.linhThach = msg.balance;
          this.waygate.setBalance(this.linhThach);
        this.dojo.setBalance(this.linhThach);
        this.market.setBalance(this.linhThach, this.tienNgoc);
        }
        if (msg.currency === "tien_ngoc") {
          this.tienNgoc = msg.balance;
          this.market.setBalance(this.linhThach, this.tienNgoc);
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
        setBasicSkillRealm(msg.character.realm);
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
      case "look": {
        const looker = this.actors.get(msg.id);
        if (looker) {
          if (weaponEquipped(looker.weapon, msg.w)) this.fx.equip(msg.id);
          looker.weapon = msg.w;
          looker.outfit = msg.o;
          looker.flight = msg.fl;
          looker.lk = msg.lk;
          if (msg.lv !== undefined) looker.lv = msg.lv;
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
        // Only corrections carry a track; an accepted move keeps the local prediction untouched. A correction for an older move than the last one sent
        // (it was late: a jitter spike) is dropped: the newer move's own ack carries the fix if one is needed. Seq 0 is a server-forced correction.
        if (msg.player && (msg.seq === 0 || msg.seq >= this.moveSeq)) this.upsertActor([msg.player]);
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
        this.stopAuto("moved");
        this.beginLoading(vi.loadingScreen.transferring);
        this.hotbar.setAimNote(null); // a talisman channel that completed ends here
        this.hud.textContent = vi.transferring;
        this.chat.system(vi.chat.transferTo(mapLabel(msg.map)));
        break;
      case "inv":
        if (msg.full) this.inventory.setBag({ tabs: msg.tabs, items: msg.items, tabPrice: msg.tabPrice });
        else this.inventory.applyDelta(msg.tabs, msg.items, msg.removed);
        this.smith.refresh();
        this.charPanel.refresh();
        this.equipment.refresh();
        this.shop.refresh();
        this.market.refresh();
        this.trade.refresh();
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
        this.hotbarSlots = msg.slots;
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
        this.selfMaxMp = msg.maxMp;
        break;
      case "cast_ok":
        this.noteCooldown(msg.skill, msg.cdMs);
        break;
      case "cast_error":
        // Auto asks for skills a little before they are ready: its refusals stay out of the chat and the skill is left alone for a moment.
        if (this.autoOn) this.autoMem.backoffUntil.set(msg.skill, performance.now() + tuning().auto.castBackoffMs);
        else this.chat.system(vi.skills.errors[msg.reason] ?? vi.skills.errors.unknown!, "error");
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
      case "fx": {
        const fxKind = skillFxOf(getSkill(msg.skill));
        // A close-combat skill swings; the others are cast. The caster turns to its target (an actor) or to the point the skill goes to.
        const caster = this.actors.get(msg.id)?.weapon ?? (this.monsters.get(msg.id)?.guard ? guardLookOf().weapon : undefined);
        this.playOnce(msg.id, fxKind === "melee" ? (caster === "thuong" ? "thrust" : "attack") : fxKind === "blink" ? undefined : "cast", msg.to ?? (msg.x !== undefined && msg.y !== undefined ? [msg.x, msg.y] : undefined));
        this.fx.skill(msg.id, msg.skill, msg.to, msg.x !== undefined && msg.y !== undefined ? toScreen(msg.x, msg.y) : undefined, msg.el);
        const buff = getSkill(msg.skill);
        if ((buff?.kind === "buff" && buff.buff) || buff?.kind === "heal") {
          const list = this.buffGlows.get(msg.id) ?? new Map<string, number>();
          list.set(msg.skill, performance.now() + (buff?.buff?.durationMs ?? HEAL_DOTS_MS));
          this.buffGlows.set(msg.id, list);
        }
        break;
      }
      case "fx_guard": {
        const m = this.monsters.get(msg.id);
        if (m) m.auraUntil = performance.now() + 1800;
        this.fx.guardSkill(msg.id, msg.skill);
        break;
      }
      case "fx_zone":
        this.fx.zone(msg.id, msg.skill, toScreen(msg.x, msg.y), toScreen(msg.ax, msg.ay), msg.ms, msg.el);
        break;
      case "fx_zone_end":
        this.fx.zoneEnd(msg.id);
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
      case "dojo":
        this.dojo.setBalance(this.linhThach);
        this.market.setBalance(this.linhThach, this.tienNgoc);
        this.dojo.setCourses(msg.npc, msg.courses);
        break;
      case "skill_forgot":
        this.chat.system(vi.skills.forgot(skillDisplayName(getSkill(msg.skill) ?? ({ id: msg.skill, nameVi: msg.skill } as SkillDef))));
        break;
      case "trade_invite":
        this.trade.invited(msg.from, msg.name, msg.ttlMs);
        break;
      case "sect":
        this.sect.onSect(msg.view, msg.cooldownUntil);
        break;
      case "sect_dir":
        this.sect.onDir(msg.sects);
        break;
      case "sect_error":
        this.sect.onError(msg.reason);
        break;
      case "sect_invite":
        this.sect.invited(msg.from, msg.name, msg.sect, msg.ttlMs);
        break;
      case "sect_label":
        this.setActorSect(msg.id, msg.sc);
        break;
      case "trade":
        this.trade.show(msg);
        break;
      case "trade_end":
        this.trade.end(msg.reason);
        break;
      case "trade_error":
        this.trade.error(msg.reason);
        break;
      case "market":
        this.market.setBalance(this.linhThach, this.tienNgoc);
        this.market.setListings(msg.npc, msg.listings, msg.cfg, msg.now, msg.open);
        break;
      case "market_ok":
        this.market.done(msg.op);
        break;
      case "market_error":
        this.market.fail(msg.reason);
        break;
      case "dojo_ok":
        this.dojo.notify(vi.dojo.learned(skillDisplayName(getSkill(msg.skill) ?? ({ id: msg.skill, nameVi: msg.skill } as SkillDef)), msg.cost.toLocaleString("vi-VN")), true);
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
    if (msg.t === "market_changed") {
      this.market.invalidate();
      return;
    }
    if (msg.t === "sect_changed") {
      // The sect changed. About this player: read it again at once (the menu of a player and the name above the head follow it). About the others: only an open window needs the new list.
      if (msg.you || this.sect.isOpen()) this.net.send({ t: "sect_get" });
      return;
    }
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
    const where = `${mapLabel(this.map.id)}${realm}`;
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
      actor.female = p.f === true;
      actor.weapon = p.w;
      actor.outfit = p.o;
      actor.flight = p.fl;
      actor.lk = p.lk;
      actor.sitting = p.med === true;
      actor.lv = p.lv;
      actor.sn = p.sn ?? 0;
      actor.snAt = now;
      this.setActorPk(actor, p.pk ?? 0);
      this.setActorSect(p.id, p.sc);
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
    this.reacts.delete(id);
    this.buffGlows.delete(id);
    actor.wview?.destroy();
    actor.view?.destroy();
    actor.body.destroy();
    actor.label.destroy();
    actor.tag.destroy();
    actor.sectTag?.destroy();
    actor.cloud?.destroy();
    this.clearDragon(actor);
    actor.hat?.destroy();
    actor.hatOrn?.destroy();
    actor.seat?.destroy();
    actor.legs?.destroy();
    actor.wglow?.destroy();
    this.actors.delete(id);
  }

  /** Where an actor stands on the ground (tile coordinates) right now, or undefined when it is not here. */
  private tilePosOf(id: string): Vec2 | undefined {
    const now = performance.now();
    const m = this.monsters.get(id);
    if (m) {
      const p = positionAlongPath(m.path, now - m.startedAt, m.speed);
      return [p.x, p.y];
    }
    const a = this.actors.get(id);
    if (!a) return undefined;
    const p = currentPos(a, now);
    return [p.x, p.y];
  }

  /** Plays an attack, cast, hit or die once on a player or a monster that shows a sprite, turned toward an actor or a tile point (and not otherwise). */
  private playOnce(id: string, anim: GfxAnimName | undefined, toward?: string | Vec2): void {
    const view = this.actors.get(id)?.view ?? this.monsters.get(id)?.view;
    if (!anim || !view?.alive) return;
    const from = this.tilePosOf(id);
    const to = typeof toward === "string" ? this.tilePosOf(toward) : toward;
    const dir = from && to ? directionOf(to[0] - from[0], to[1] - from[1]) : null;
    view.playOnce(anim, dir ?? view.dir, ONE_SHOT_MS[anim]);
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
      if (m.dyingUntil !== undefined) continue;
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
    if (m?.dyingUntil !== undefined) {
      this.removeMonster(snap.id); // it respawned under the same id while its corpse was still showing
      m = undefined;
    }
    if (!m) {
      const color = ELEMENT_COLOR[snap.element] ?? 0xcccccc;
      // A guard looks like a player (an oval body, a plain name) and shows no element, realm or HP bar; a monster is a square in its element's colour.
      const body: Phaser.GameObjects.Shape = snap.guard ? this.add.ellipse(0, 0, 22, 34, 0x6ec6ff).setStrokeStyle(2, 0x000000, 0.6) : this.add.rectangle(0, 0, 26, 26, color).setStrokeStyle(2, 0x000000, 0.7);
      const label = this.add
        .text(0, 0, this.monsterName(snap.kind, snap.tier, snap.rank, snap.guard === true), { fontFamily: FONT, fontSize: "12px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1);
      const icon = this.add.circle(0, 0, 5, ELEMENT_DOT[snap.element] ?? 0xcccccc).setStrokeStyle(1, 0xffffff, 1).setVisible(snap.guard !== true);
      m = { color: "#ffffff", icon, id: snap.id, kind: snap.kind, guard: snap.guard === true, boss: snap.boss === true, tier: snap.tier, rank: snap.rank, element: snap.element, path: snap.path, startedAt: 0, speed: snap.speed, hp: snap.hp, maxHp: snap.maxHp, body, label, bar: this.add.graphics() };
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
    this.rank.setContext(!this.map.safe, [...this.monsters.values()].some((m) => m.boss && m.dyingUntil === undefined));
  }

  /** A kill: a monster with a sprite plays its death and is dropped after a moment; one drawn as a square goes at once. */
  private killMonster(id: string): void {
    const m = this.monsters.get(id);
    if (!m) return;
    if (!m.view?.alive || m.guard) return this.removeMonster(id);
    m.dyingUntil = performance.now() + DEATH_LINGER_MS;
    this.playOnce(id, "die");
    m.label.setVisible(false);
    m.icon.setVisible(false);
    m.bar.clear();
    if (this.targetId === id) this.targetId = null;
    this.syncRankContext();
  }

  private removeMonster(id: string): void {
    const m = this.monsters.get(id);
    if (!m) return;
    this.reacts.delete(id);
    this.buffGlows.delete(id);
    m.wview?.destroy();
    m.view?.destroy();
    m.aura?.destroy();
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

  /** The name of the sect over a player's name (made when there is one, gone when there is none). */
  private setActorSect(id: string, name: string | undefined): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    if (!name) {
      actor.sectTag?.destroy();
      actor.sectTag = undefined;
      return;
    }
    if (!actor.sectTag) actor.sectTag = this.add.text(0, 0, name, { fontFamily: FONT, fontSize: "11px", color: "#9ad8c0", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(2);
    else actor.sectTag.setText(name);
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
    if (on && !actor.cloud) actor.cloud = this.add.image(0, 0, FLIGHT_TEX[actorFlight(actor)]).setAlpha(0.95);
    actor.cloud?.setVisible(on);
    if (!on) this.clearDragon(actor);
    if (actor.id === this.selfId && isMounted() !== on) this.applyMounted(on);
  }

  /**
   * Gets on or off. A walk in progress goes on at the new speed from where the character is right now, predicted here just like a click
   * to walk is (and the position is sent along), so the change is smooth and the server's answer does not pull the character back.
   */
  /** Sit down to meditate or stand up (V). The server decides; the button follows its answer. */
  private toggleMeditate(): void {
    if (this.transferring || this.selfDead) return;
    if (!this.meditating) this.stopAuto("manual"); // a hunt and a meditation do not go together
    this.net.send({ t: "meditate", on: !this.meditating });
  }

  private setMeditating(on: boolean): void {
    this.meditating = on;
    // While sitting, the server is told now and then so it can pay the EXP of the stretch (it also pays when the character stands up or leaves).
    if (this.medTimer !== undefined) window.clearInterval(this.medTimer);
    this.medTimer = on ? window.setInterval(() => this.net.send({ t: "med_tick" }), 30_000) : undefined;
    const me = this.actors.get(this.selfId);
    if (me) me.sitting = on; // the figure sits or stands with the server's answer (the "sit" message only tells the others)
    this.meditateBtn.hidden = false;
    iconButton(this.meditateBtn, "meditate", `${on ? vi.meditate.stand : vi.meditate.sit}: ${vi.meditate.hint}`);
    this.meditateBtn.classList.toggle("sitting", on);
  }

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
    iconButton(this.mountBtn, "flight", `${on ? vi.mount.down : vi.mount.up}: ${this.flightWorn || on ? vi.mount.hint : vi.mount.needFlight}`);
    this.mountBtn.disabled = !this.flightWorn && !on;
    this.mountBtn.classList.toggle("riding", on);
  }

  /** Your own riding state changed: badge, stat views and the line in the system chat. */
  private applyMounted(on: boolean, announce = false): void {
    if (isMounted() === on) return;
    setMounted(on);
    if (this.meditating) this.setMeditating(false); // getting on or off stands the character up (the server does the same)
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
  private pickPlayer(wx: number, wy: number, anyone = false): string | null {
    const now = performance.now();
    let best: string | null = null;
    let bestD = MONSTER_PICK_PX;
    for (const a of this.actors.values()) {
      if (a.id === this.selfId) continue;
      const hitAt = this.hitMeAt.get(a.id);
      if (!anyone && this.pk.mode() === 0 && !(hitAt !== undefined && now - hitAt < grayWindowMs())) continue;
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
    // A hit with no skill behind it is a plain attack (a skill is drawn from its own `fx` message); the extra targets of one swing (`aoe`) do not swing again.
    const attacker = this.monsters.get(msg.from);
    const weapon = attacker ? (attacker.guard ? guardLookOf().weapon : undefined) : this.actors.get(msg.from)?.weapon;
    if (!msg.skill && !msg.aoe) {
      this.fx.basic(msg.from, msg.to, !!attacker, weapon);
      this.playOnce(msg.from, attackAnimOf(weapon), msg.to);
    }
    if (msg.dot) {
      // one tick of a lasting zone: a spark and a small number, no recoil (ten ticks on five monsters must not be fifty shoves)
      if (msg.kind !== "miss") this.fx.hit(msg.to, msg.from, "hit", msg.skill, true);
    } else if (msg.kind !== "miss") {
      this.playOnce(msg.to, "hit", msg.from);
      this.shove(msg.from, msg.to, msg.kind === "crit");
      this.fx.hit(msg.to, msg.from, msg.kind, msg.skill);
    }
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
      .text(s.x + (msg.dot ? (Math.random() - 0.5) * 24 : 0), s.y - 50, text, { fontFamily: FONT, fontSize: msg.kind === "crit" ? "18px" : msg.dot ? "11px" : "14px", color, stroke: "#000000", strokeThickness: msg.dot ? 2 : 3 })
      .setOrigin(0.5, 1)
      .setDepth(1000);
    this.tweens.add({ targets: label, y: label.y - 28, alpha: 0, duration: 800, onComplete: () => label.destroy() });
  }

  /** Starts the recoil of a blow: a flash and a shove away from the attacker (harder for a critical hit). */
  private shove(from: string, to: string, crit: boolean): void {
    const a = this.screenPosOf(from);
    const b = this.screenPosOf(to);
    const dx = a && b ? b.x - a.x : 1;
    const dy = a && b ? b.y - a.y : 0;
    const len = Math.hypot(dx, dy) || 1;
    this.reacts.set(to, { at: performance.now(), ms: crit ? 260 : 190, kx: dx / len, ky: (dy / len) * 0.5, push: crit ? 11 : 6 });
  }

  /** The recoil of a blow on `id`'s figure (and its weapon layer): a flash of white at first, a shove away from the attacker that eases off. */
  private applyReact(id: string, view: GfxView | undefined, wview: GfxView | undefined, now: number): void {
    const r = this.reacts.get(id);
    if (!view?.alive) return;
    if (!r || now - r.at >= r.ms) {
      if (r) this.reacts.delete(id);
      view.setFlash(false);
      view.setOffset(0, 0);
      wview?.setOffset(0, 0);
      return;
    }
    const t = 1 - (now - r.at) / r.ms;
    view.setFlash(now - r.at < 80);
    const k = r.push * t * t;
    view.setOffset(r.kx * k, r.ky * k);
    wview?.setOffset(r.kx * k, r.ky * k);
  }

  /** Shows the sprite of a player when the manifest has one (and the oval otherwise); plays run or idle facing the way it walks. */
  /** The qi haze round a cultivator (see `qi-aura.ts`): level from the character sheet for yourself, from the snapshot for the others; wisps are released at a steady rate. */
  private syncQi(a: Actor, now: number, x: number, y: number): void {
    const lv = a.id === this.selfId && this.selfSheet ? this.selfSheet.realm * 10 + this.selfSheet.stage : a.lv;
    if (lv === undefined || now < (a.qiNext ?? 0)) return;
    const st = qiStyleOf(lv, tuning().theme.realmColors);
    a.qiNext = now + (1000 / st.rate) * (0.6 + Math.random() * 0.8);
    const height = a.view?.alive ? a.view.rise() : 38;
    const at = qiSpawnPoint(x, y, height);
    this.fx.puff("qi", at.x, at.y, st.burst, st.color);
  }

  private syncActorView(a: Actor, now: number, x: number, y: number, depth: number, moving: boolean): void {
    if (a.view && !a.view.alive) {
      a.wview?.destroy();
      a.wview = undefined;
      a.view = undefined;
      a.body.setVisible(true);
    }
    // The body sprite follows the outfit: an atlas that is not here yet is fetched, and the plain clothes show until it is.
    const bodyKey = this.gfx.spriteKeyFor("player", undefined, `${a.female ? "female" : "male"}${a.outfit ? `.${a.outfit}` : ""}`);
    if (a.view && bodyKey && a.view.key !== bodyKey) {
      a.wview?.destroy();
      a.wview = undefined;
      a.view.destroy();
      a.view = undefined;
    }
    if (!a.view) {
      const key = bodyKey;
      const view = key ? this.gfx.createView(key) : undefined;
      if (!view) return;
      a.view = view;
      a.body.setVisible(false);
    }
    // Meditating: the figure sits (no sitting frames exist: the legs are cropped away, folded legs are drawn over the cut and the body sinks onto them), on a ring of light.
    const sit = a.sitting === true; // on the ground or on the flying pháp bảo
    a.view.setSeated(sit);
    a.wview?.setSeated(sit);
    // Riding the flight pháp bảo the body stands still (the cloud carries it, and only the arms move to strike or cast), so it never runs.
    const anim = moving && !a.mounted ? "run" : "idle";
    const dir = headingAlongPath(a.path, now - a.startedAt, a.speed) ?? a.view.dir;
    // The weapon is a second sprite over the body that shows the same frame as the body (frames line up by name); it follows what is in the hand.
    const wkey = a.weapon ? this.gfx.spriteKeyFor("weapon", a.weapon, a.female ? "female" : "male") : undefined;
    if (a.wview && (!a.wview.alive || a.wview.key !== wkey)) {
      a.wview.destroy();
      a.wview = undefined;
    }
    if (!a.wview && wkey) {
      a.wview = this.gfx.createView(wkey);
      a.wview?.setSeated(sit);
    }
    a.view.play(anim, dir);
    if (a.view.alive) {
      a.wview?.followFrame(a.view);
      this.applyReact(a.id, a.view, a.wview, now);
      // A rider stands 8 px above the ground on the pháp bảo; seated, the rider sits a little higher (on the pháp bảo itself, not in it).
      const ride = a.mounted ? (sit ? 16 : 8) : 0;
      const lift = -ride;
      a.view.place(x, y - ride, depth);
      a.wview?.place(x, y - ride, depth + 0.02);
      this.applyGearLook(a, x, y - ride, depth, moving);
      this.syncSeat(a, now, x, y, depth, sit, lift);
    } else {
      a.wview?.destroy();
      a.wview = undefined;
    }
  }

  /** The dots of the mini map: where everyone is now (the positions the figures are drawn at). */
  private updateMinimap(now: number): void {
    if (!this.selfId) return;
    let self: { x: number; y: number } | null = null;
    const players: Array<{ x: number; y: number }> = [];
    for (const a of this.actors.values()) {
      const p = currentPos(a, now);
      if (a.id === this.selfId) self = { x: p.x, y: p.y };
      else players.push({ x: p.x, y: p.y });
    }
    const monsters: Array<{ x: number; y: number; boss: boolean; guard: boolean }> = [];
    for (const m of this.monsters.values()) {
      if (m.dyingUntil !== undefined) continue;
      const p = positionAlongPath(m.path, now - m.startedAt, m.speed);
      monsters.push({ x: p.x, y: p.y, boss: m.boss, guard: m.guard });
    }
    this.minimap.update({ self, players, monsters }, now);
  }

  private clearDragon(a: Actor): void {
    if (!a.dragon) return;
    for (const p of a.dragon) p.destroy();
    a.dragon = undefined;
    for (const p of a.mist ?? []) p.destroy();
    a.mist = undefined;
  }

  /**
   * Lays the dragon out joint by joint along the ground heading `ga`: the body is a chain of round, scale-covered joints on a travelling wave (sideways on the
   * ground and up and down in the air), so it reads as a coil in space and not as a flat picture turned about; the head leads and raises itself, the tail ends in a fin.
   * A joint further back is drawn under the ones before it.
   */
  private syncDragon(a: Actor, cx: number, cy: number, ga: number, now: number, depth: number, moving: boolean): void {
    const JOINTS = 15;
    if (!a.dragon) {
      const parts: Phaser.GameObjects.Image[] = [this.add.image(0, 0, DRAGON_TAIL)];
      for (let i = 0; i < JOINTS; i++) parts.push(this.add.image(0, 0, DRAGON_SEG).setOrigin(0.5, 0.65));
      parts.push(this.add.image(0, 0, DRAGON_HEAD).setOrigin(0.3, 0.5));
      a.dragon = parts;
      a.mist = [0, 1, 2, 3].map(() => this.add.image(0, 0, DRAGON_MIST).setAlpha(0.9));
    }
    // On screen a ground vector is squashed 2:1 vertically; `fwd` runs head-ward, `side` is to the left of it.
    const fwd = { x: Math.cos(ga), y: 0.5 * Math.sin(ga) };
    const side = { x: -Math.sin(ga), y: 0.5 * Math.cos(ga) };
    const length = 150;
    const phase = now / (moving ? 170 : 300) + a.id.length;
    const at = (t: number): { x: number; y: number; z: number } => {
      const calm = 0.35 + 0.65 * (1 - t); // the head holds steady, the tail swings widest
      const sway = Math.sin(phase - t * 5.2) * 16 * calm;
      return { x: cx + fwd.x * length * (t - 0.5) + side.x * sway, y: cy + fwd.y * length * (t - 0.5) + side.y * sway, z: Math.sin(phase * 0.9 - t * 4.1 + 1.2) * 7 * calm + t * 9 };
    };
    const parts = a.dragon;
    // The cloud bank follows the body: a puff under four places along it, so it turns with the dragon.
    a.mist?.forEach((puff, k) => {
      const m = at(0.12 + k * 0.25);
      puff.setPosition(m.x, m.y + 8).setScale(1.25 + 0.1 * Math.sin(now / 500 + k)).setDepth(depth - 0.002);
    });
    for (let i = 0; i < JOINTS; i++) {
      const t = i / (JOINTS - 1);
      const p = at(t * 0.92);
      const img = parts[1 + i]!;
      img.setPosition(p.x, p.y - p.z - 6).setScale(0.55 + 0.5 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5)).setDepth(depth + t * 0.004);
    }
    const tail = at(-0.02);
    const tailDir = Math.atan2(tail.y - at(0.1).y, tail.x - at(0.1).x);
    parts[0]!.setPosition(tail.x, tail.y - tail.z - 6).setRotation(tailDir).setFlipY(Math.cos(tailDir) < 0).setDepth(depth - 0.001).setScale(0.8).setOrigin(1, 0.5);
    const h = at(1);
    const neck = at(0.9);
    const headAng = Math.atan2(h.y - neck.y, h.x - neck.x);
    const left = Math.cos(headAng) < 0;
    parts[parts.length - 1]!
      .setPosition(h.x, h.y - h.z - 10)
      .setRotation(left ? headAng - Math.PI : headAng)
      .setFlipX(left)
      .setFlipY(false)
      .setScale(0.95)
      .setDepth(depth + 0.006);
  }

  /** The ring of light under a meditating figure and the motes of healing that rise round it (green for HP, blue for MP; the others see both). */
  private syncSeat(a: Actor, now: number, x: number, y: number, depth: number, sit: boolean, lift: number): void {
    if (!sit) {
      if (a.seat) {
        a.seat.destroy();
        a.seat = undefined;
      }
      if (a.legs) {
        a.legs.destroy();
        a.legs = undefined;
      }
      return;
    }
    // The crossed legs: a robe-coloured mound (a darker knee line in front) where the legs were cut away, a little wider than the body.
    const robe = mixTint(a.lk?.r !== undefined ? (hexOf(robeTintOf(a.lk.r)) ?? 0xd8d0bc) : 0xd8d0bc, 0x30303c, 0.25);
    if (!a.legs) a.legs = this.add.ellipse(x, y, 26, 9, robe).setStrokeStyle(1.2, 0x2a2a35, 0.9);
    a.legs.setPosition(x, y + lift - (a.mounted ? 1 : 3)).setFillStyle(robe).setDepth(depth + 0.01);
    if (!a.seat) a.seat = this.makeAura(x, y, "#9fffd0", 34, depth - 0.05);
    a.seat.setPosition(x, y + 3 + (a.mounted ? lift + 2 : 0)).setDepth(depth - 0.05).setAlpha(0.65 + 0.25 * Math.sin(now / 420));
    if ((a.moteAt ?? 0) > now) return;
    a.moteAt = now + 260 + Math.random() * 200;
    // For yourself the motes show what is coming back: green while HP is below the maximum, blue while MP is.
    const mine = a.id === this.selfId;
    const hp = !mine || this.selfHp < this.selfMaxHp;
    const mp = !mine || this.vitals.getMp() < this.selfMaxMp;
    const ang = Math.random() * Math.PI * 2;
    const rx = 10 + Math.random() * 12;
    const color = hp && (!mp || Math.random() < 0.5) ? 0x7dff9c : mp ? 0x7ab8ff : 0xfff0a0;
    this.fx.puff("mote", x + Math.cos(ang) * rx, y - 4 + Math.sin(ang) * rx * 0.5, 1, color);
  }

  /**
   * A weapon upgraded to +7 or more shines: +7 to +9 breathes a pale blue light and sheds the odd spark, +10 burns gold and violet by turns with a bigger glow and a
   * stream of sparks. The light is a soft blob over the weapon sprite; the sparks rise from a random point on it. Nothing here is the server's business.
   */
  private applyWeaponGlow(a: Actor, depth: number, lk: GearLook | undefined): void {
    const tier = glowTierOf(lk?.e);
    const sprite = a.wview?.alive ? a.wview.sprite : undefined;
    if (tier === 0 || !sprite) {
      if (a.wglow) {
        a.wglow.destroy();
        a.wglow = undefined;
      }
      return;
    }
    const now = this.time.now;
    const grand = tier === 2;
    const wave = 0.5 + 0.5 * Math.sin(now / (grand ? 170 : 300));
    const colour = grand ? (Math.sin(now / 420) > 0 ? 0xffd54a : 0xd58bff) : 0x8fd8ff;
    // The weapon's own pixels: the frame is trimmed, so its box sits `frame.x/y` inside the untrimmed picture that the origin is measured on.
    const f = sprite.frame;
    const bw = f.width * sprite.scaleX;
    const bh = f.height * sprite.scaleY;
    const box = new Phaser.Geom.Rectangle(sprite.x + (f.x - sprite.originX * f.realWidth) * sprite.scaleX, sprite.y + (f.y - sprite.originY * f.realHeight) * sprite.scaleY, bw, bh);
    if (!a.wglow) a.wglow = this.add.image(0, 0, FX_TEX.glow).setBlendMode(Phaser.BlendModes.ADD);
    const size = Math.max(box.width, box.height) * (grand ? 2.4 : 1.8) + 8;
    a.wglow
      .setPosition(box.centerX, box.centerY)
      .setDisplaySize(size, size)
      .setTint(colour)
      .setAlpha((grand ? 0.4 : 0.25) + wave * (grand ? 0.3 : 0.2))
      .setDepth(depth + 0.025)
      .setVisible(true);
    // The weapon itself brightens with the beat of the light.
    const base = hexOf(weaponTintOf(lk!.w ?? 1)) ?? 0xffffff;
    a.wview!.setTint(mixTint(base, colour, (grand ? 0.45 : 0.28) * wave));
    if (Math.random() < (grand ? 0.3 : 0.07) && box.width > 0) this.fx.puff("mote", box.x + Math.random() * box.width, box.y + Math.random() * box.height, 1, colour);
  }

  /**
   * What the worn gear adds to a figure: the robe colours the body sprite, the weapon its sprite (by element and realm), the hat is a small shape on the head,
   * the boots raise dust of their colour while the figure runs. The colours come from the tuning (`gearLooks`); a Canvas renderer ignores tints.
   */
  private applyGearLook(a: Actor, x: number, y: number, depth: number, moving: boolean): void {
    const lk = a.lk;
    a.view?.setTint(lk?.r !== undefined ? hexOf(robeTintOf(lk.r)) : undefined);
    a.wview?.setTint(lk?.w !== undefined ? hexOf(weaponTintOf(lk.w)) : undefined);
    this.applyWeaponGlow(a, depth, lk);
    if (lk?.h !== undefined && a.view) {
      if (!a.hat) a.hat = this.add.image(0, 0, HAT_TEX(hatShapeOf(lk.h))).setOrigin(0.5, 0.85);
      const key = HAT_TEX(hatShapeOf(lk.h));
      if (a.hat.texture.key !== key) a.hat.setTexture(key);
      // The top of the head is `rise` above the feet (the name stands a few px higher); the picture's bottom edge sits on it.
      // Every hat picture is symmetric and seen from above, so it stays put and unflipped whichever way the figure turns (flipping and squashing it per direction made it
      // flicker on the diagonals); only the head moving a pixel to the side follows the heading, and it is a little darker with the face turned away.
      const dir = a.view.dir;
      const sx = HEAD_SIDE[dir] ?? 0;
      const away = dir === 3 || dir === 4 || dir === 5;
      // The hat turns with the head: its front ornament (a gem, a tuft) rides round the hat to the side the figure faces, and hides behind it when the figure faces
      // away. The facing eases from one heading to the next, so a diagonal walk never snaps the ornament about.
      const want = dir * (Math.PI / 4);
      const have = a.hatAng ?? want;
      a.hatAng = have + Math.atan2(Math.sin(want - have), Math.cos(want - have)) * 0.3;
      const fx = -Math.sin(a.hatAng);
      const fy = Math.cos(a.hatAng);
      const shape = hatShapeOf(lk.h);
      if (!a.hatOrn) a.hatOrn = this.add.image(0, 0, HAT_ORN_TEX(shape));
      if (a.hatOrn.texture.key !== HAT_ORN_TEX(shape)) a.hatOrn.setTexture(HAT_ORN_TEX(shape));
      const base = hexOf(hatTintOf(lk.h)) ?? 0xffffff;
      const dim = away ? 0.85 : 1;
      const tint = (Math.round(((base >> 16) & 255) * dim) << 16) | (Math.round(((base >> 8) & 255) * dim) << 8) | Math.round((base & 255) * dim);
      a.hat
        .setPosition(x + Math.sign(sx), y - a.view.rise() + 6)
        .setDepth(depth + 0.03)
        .setTint(tint)
        .setFlipX(false)
        .setScale(HAT_SCALE)
        .setVisible(true);
      a.hatOrn
        .setPosition(a.hat.x + fx * 10.5 * HAT_SCALE, a.hat.y - 2 + fy * 4)
        .setDepth(depth + (fy < -0.25 ? 0.02 : 0.035))
        .setScale(HAT_SCALE * 1.05)
        .setVisible(fy > -0.25);
    } else if (a.hat) {
      a.hat.destroy();
      a.hat = undefined;
      a.hatOrn?.destroy();
      a.hatOrn = undefined;
    }
    if (moving && !a.mounted && lk?.b !== undefined && Math.random() < 0.12) this.fx.puff("trail", x + (Math.random() - 0.5) * 10, y - 2, 1, hexOf(bootsTintOf(lk.b)) ?? 0xffffff);
  }

  /** The same for a monster, a guard or a boss; the rank and boss sizes scale the sprite as they scale the square. */
  private syncMonsterView(m: MonsterActor, now: number, x: number, y: number, depth: number): void {
    const look = m.guard ? guardLookOf() : undefined;
    if (m.view && !m.view.alive) {
      m.wview?.destroy();
      m.wview = undefined;
      m.view = undefined;
      m.body.setVisible(true);
    }
    const key = look ? this.gfx.spriteKeyFor("player", undefined, `${look.body}${look.outfit ? `.${look.outfit}` : ""}`) : this.gfx.spriteKeyFor("monster", m.kind);
    // The outfit atlas of a guard loads on demand: the plain body shows until it is here, then the view is swapped (as for players and NPCs).
    if (look && m.view && key && m.view.key !== key) {
      m.wview?.destroy();
      m.wview = undefined;
      m.view.destroy();
      m.view = undefined;
      m.body.setVisible(true);
    }
    if (!m.view) {
      const view = key ? this.gfx.createView(key) : undefined;
      if (!view) return;
      m.view = view;
      m.body.setVisible(false);
    }
    const scale = (look?.scale ?? 1) * (m.boss ? 2 : m.rank === "rare2" ? 1.4 : m.rank === "rare1" ? 1.2 : 1);
    m.view.setScale(scale);
    m.view.setTint(look ? hexOf(look.tint) : monsterTintOf(m.element)); // one model, a colour for each element; a guard wears its own robe colour
    m.view.play(positionAlongPath(m.path, now - m.startedAt, m.speed).moving ? "run" : "idle", headingAlongPath(m.path, now - m.startedAt, m.speed) ?? m.view.dir);
    if (!m.view.alive) return;
    this.applyReact(m.id, m.view, m.wview, now);
    m.view.place(x, y, depth);
    if (look?.aura && now < (m.auraUntil ?? 0)) {
      if (!m.aura) m.aura = this.makeAura(x, y + 2, look.aura, 46, 0.45);
      m.aura.setPosition(x, y + 2);
    } else if (m.aura) {
      m.aura.destroy();
      m.aura = undefined;
    }
    if (look) {
      const wkey = look.weapon ? this.gfx.spriteKeyFor("weapon", look.weapon, look.body) : undefined;
      if (m.wview && (!m.wview.alive || m.wview.key !== wkey)) {
        m.wview.destroy();
        m.wview = undefined;
      }
      if (!m.wview && wkey) m.wview = this.gfx.createView(wkey);
      m.wview?.setScale(scale);
      m.wview?.followFrame(m.view);
      m.wview?.place(x, y, depth + 0.02);
    }
  }

  /** A skill's cooldown as the server said it: the bar shows it, and Auto waits for it. */
  private noteCooldown(skill: string, ms: number): void {
    this.cdUntil.set(skill, performance.now() + ms);
    this.hotbar.setCooldown(skill, ms);
  }

  /** Start was pressed in the Auto window. False (and a line in the chat) when it cannot run here. */
  private startAuto(settings: AutoSettings): boolean {
    const self = this.actors.get(this.selfId);
    if (!self || this.selfDead || this.transferring) return false;
    if (this.map.safe) {
      this.chat.system(vi.auto.safeMap, "error");
      return false;
    }
    const here = currentPos(self, performance.now());
    this.autoAnchor = { x: here.x, y: here.y };
    this.autoSettings = settings;
    this.autoMem = newAutoMemory();
    this.autoNextAt = 0;
    this.autoManualAt = 0;
    this.autoOn = true;
    this.autoUi.setRunning(true);
    this.chat.system(vi.auto.started(settings.radius));
    return true;
  }

  /** Ends the hunt (the button reads Auto again) and says why. Does nothing when it is not running. */
  private stopAuto(reason: "stopped" | "manual" | "dead" | "moved"): void {
    if (!this.autoOn) return;
    this.autoOn = false;
    this.autoSettings = null;
    this.autoUi.setRunning(false);
    this.chat.system(vi.auto.ended[reason]);
  }

  /** What the hunt sees now: the character, the monsters around, the skills' readiness and the bag. */
  private autoView(now: number): AutoView | null {
    const self = this.actors.get(this.selfId);
    if (!self || !this.selfSheet) return null;
    const here = currentPos(self, now);
    const monsters = [...this.monsters.values()].flatMap((m) => {
      if (m.dyingUntil !== undefined || m.hp <= 0) return [];
      const p = positionAlongPath(m.path, now - m.startedAt, m.speed);
      return [{ id: m.id, x: p.x, y: p.y, guard: m.guard, boss: m.boss, rare: m.rank !== "normal", hp: m.hp }];
    });
    const bag = this.inventory.list();
    return {
      now,
      self: { x: here.x, y: here.y, moving: here.moving },
      hp: this.selfHp,
      maxHp: this.selfMaxHp,
      mp: this.vitals.getMp(),
      maxMp: this.selfMaxMp,
      busy: this.selfDead || this.transferring || this.charPanel.isBreaking(),
      anchor: this.autoAnchor,
      targetId: this.targetId,
      monsters,
      readyAt: (id) => this.cdUntil.get(id) ?? 0,
      buffUntil: (id) => this.buffGlows.get(this.selfId)?.get(id) ?? 0,
      mpCost: (id) => {
        const def = getSkill(id);
        return def ? effectiveSkill(def, this.skillContext(def)).mpCost : 0;
      },
      bagCount: (type) => bag.reduce((n, it) => (it.type === type ? n + it.qty : n), 0),
      healMsOf: (type) => getItemDef(type)?.healOverMs ?? 0,
    };
  }

  /** The hunt thinks a few times a second and carries out at most one command each time, through the same messages as the player's own taps. */
  private tickAuto(now: number): void {
    if (!this.autoOn || !this.autoSettings || now < this.autoNextAt) return;
    this.autoNextAt = now + tuning().auto.tickMs;
    const view = this.autoView(now);
    if (!view) return;
    if (this.autoManualAt > 0) {
      if (view.self.moving || now - this.autoManualAt < 400) view.manual = true;
      else {
        // the character has come to a stop: hunt around this new spot
        this.autoManualAt = 0;
        this.autoAnchor = { x: view.self.x, y: view.self.y };
        view.anchor = this.autoAnchor;
        this.autoMem.homeAt = now + 3000;
      }
    }
    const act: AutoAction | null = decide(view, this.autoSettings, this.autoMem, tuning().auto);
    if (!act) return;
    switch (act.t) {
      case "potion":
        this.net.send({ t: "use_type", type: act.type });
        break;
      case "cast":
        if (act.target) this.targetId = act.target;
        this.net.send({ t: "cast", skill: act.skill, ...(act.target ? { target: act.target } : {}), ...(act.at ? { x: Math.round(act.at.x * 100) / 100, y: Math.round(act.at.y * 100) / 100 } : {}), ...(act.element ? { el: act.element as SpiritualRoot } : {}) });
        break;
      case "attack":
        this.targetId = act.id;
        this.net.send({ t: "attack", id: act.id });
        break;
      case "walk":
        this.targetId = null;
        this.sendWalk(act.x, act.y);
        break;
    }
  }

  /** Puts the loading screen up for a (re)entry: the welcome has to come again and everything in it has to be loaded before the screen goes. */
  private beginLoading(label: string): void {
    this.welcomed = false;
    this.settledFrames = 0;
    this.loadingSince = performance.now();
    loading.show(label);
    loading.set(0.15, label);
  }

  /** While the loading screen is up: shows how far the sprites are and takes it away once nothing is left to load (or after a while, whatever is missing). */
  private watchLoading(now: number): void {
    if (!loading.active) return;
    if (this.loadingSince === 0) this.loadingSince = now;
    if (now - this.loadingSince > 15_000) return loading.finish(); // never keep the player out for a slow or failed download
    if (!this.welcomed) return;
    const st = this.gfx.loadState();
    const settled = st.ready && st.pending === 0;
    const total = st.loaded + st.pending;
    loading.set(0.5 + 0.45 * (settled ? 1 : total > 0 ? st.loaded / total : 0), settled ? vi.loadingScreen.almost : vi.loadingScreen.images(st.loaded, total));
    this.settledFrames = settled ? this.settledFrames + 1 : 0;
    if (this.settledFrames >= 10) loading.finish(); // a few frames after the last atlas: the figures have made their views in that time
  }

  /** About four times a second, every timed buff that is still running lights up its wearer a little; one that ended is forgotten. */
  private tickBuffGlows(now: number): void {
    if (now < this.nextGlowAt || this.buffGlows.size === 0) return;
    this.nextGlowAt = now + 260;
    for (const [id, list] of this.buffGlows) {
      for (const [skill, until] of list) if (until <= now) list.delete(skill);
      let slot = 0;
      for (const [skill, until] of list) this.fx.lingering(id, skill, (until - now) / 1000, slot++, list.size);
      if (list.size === 0) this.buffGlows.delete(id);
    }
  }

  update(): void {
    const now = performance.now();
    this.fx.update(now);
    this.mapLayer?.update(this.cameras.main.worldView);
    if (now - this.lastSweepAt > 5000) {
      this.lastSweepAt = now;
      this.gfx.sweepIdle(now);
    }
    this.syncNpcViews();
    this.watchLoading(now);
    this.tickAuto(now);
    this.tickBuffGlows(now);
    this.updateMinimap(now);
    for (const actor of this.actors.values()) {
      const pos = currentPos(actor, now);
      const s = toScreen(pos.x, pos.y);
      actor.body.setPosition(s.x, s.y - (actor.mounted ? 25 : 17));
      if (this.snapCamera && actor.id === this.selfId) {
        this.cameras.main.centerOn(actor.body.x, actor.body.y); // the first frame after a welcome: no slide in from the old view
        this.snapCamera = false;
      }
      if (actor.cloud && !actor.cloud.visible) this.clearDragon(actor); // got off: the dragon's joints go with the cloud
      if (actor.cloud?.visible) {
        // the flight pháp bảo hovers: a slow bob (out of step between riders); a sword turns to the way it flies and sheds spirit light from its tail
        const bob = Math.sin(now / 340 + actor.id.length * 1.7) * 2.2;
        const fly = actor.fly ?? (actor.fly = { x: s.x, y: s.y, a: 0 });
        const dx = s.x - fly.x;
        const dy = s.y - fly.y;
        if (dx * dx + dy * dy > 0.3) {
          const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - fly.a), Math.cos(Math.atan2(dy, dx) - fly.a));
          fly.a += diff * 0.22;
        }
        fly.x = s.x;
        fly.y = s.y;
        const want = FLIGHT_TEX[actorFlight(actor)];
        if (actor.cloud.texture.key !== want) actor.cloud.setTexture(want); // another pháp bảo was put on
        const style = actorFlight(actor);
        const turn = FLIGHT_TURNS[style]; // the sword, the phoenix and the dragon face where they fly
        const dragon = style === "dragon";
        const sword = turn !== undefined;
        const ca = Math.cos(fly.a);
        const sa = Math.sin(fly.a);
        // what lies on the ground is squashed 2:1 on screen: along a screen-vertical heading it is seen half as long
        const ga = Math.atan2(2 * sa, ca);
        const along = sword ? Math.hypot(Math.cos(ga), 0.5 * Math.sin(ga)) : 1;
        actor.cloud.setPosition(s.x, s.y - 4 + bob).setDepth(10 + pos.x + pos.y - 0.1);
        const big = FLIGHT_SCALE[actorFlight(actor)];
        if (dragon) {
          actor.cloud.setRotation(0).setFlipY(false).setScale(big * 0.8);
          this.syncDragon(actor, s.x, s.y - 4 + bob, ga, now, 10 + pos.x + pos.y - 0.1, pos.moving);
        } else {
          this.clearDragon(actor);
          actor.cloud.setRotation(turn ? fly.a - turn.points : 0).setFlipY(!!turn?.flip && ca < 0).setScale(turn && turn.points === 0 ? along * big : big, turn && turn.points !== 0 ? along * big : big); // the length lies along the picture's x for a picture that points right, along its y for one that points up
        }
        if (pos.moving && Math.random() < 0.4) this.fx.puff("trail", s.x - (turn ? ca * turn.tail * along : 14), s.y - 4 + bob - (turn ? sa * turn.tail * along : 0), 1, FLIGHT_GLOW[style]);
      }
      const depth = 10 + pos.x + pos.y;
      actor.body.setDepth(depth);
      this.syncActorView(actor, now, s.x, s.y, depth, pos.moving);
      this.syncQi(actor, now, s.x, s.y - (actor.mounted ? 8 : 0));
      // The name stands just above the head: a sprite says how tall it is, the oval has a fixed height (a rider is lifted a little).
      const rise = actor.view?.alive ? actor.view.rise() + 6 + (actor.mounted ? 8 : 0) : actor.mounted ? 46 : 38;
      actor.label.setPosition(s.x, s.y - rise).setDepth(depth + 0.1);
      if (actor.tag.visible) actor.tag.setPosition(s.x + actor.label.width / 2 + 2, s.y - rise - 1).setDepth(depth + 0.1);
      actor.sectTag?.setPosition(s.x, s.y - rise - actor.label.height + 1).setDepth(depth + 0.1);
    }

    for (const m of this.monsters.values()) {
      const pos = positionAlongPath(m.path, now - m.startedAt, m.speed);
      const s = toScreen(pos.x, pos.y);
      const depth = 10 + pos.x + pos.y;
      // A guard stands like a player: the same body and name height, no element icon and no HP bar.
      m.body.setPosition(s.x, s.y - (m.guard ? 17 : 13)).setDepth(depth);
      this.syncMonsterView(m, now, s.x, s.y, depth);
      if (m.dyingUntil !== undefined) {
        if (now >= m.dyingUntil) this.removeMonster(m.id);
        continue; // the name, icon and bar are gone with it
      }
      const rise = m.view?.alive ? m.view.rise() + 4 : m.guard ? 38 : 40; // above the head of a sprite, else the old fixed height
      m.label.setPosition(s.x, s.y - rise).setDepth(depth + 0.1);
      // The element icon sits just left of the name, level with its middle.
      m.icon.setPosition(s.x - m.label.width / 2 - 8, s.y - rise - m.label.height / 2).setDepth(depth + 0.1);
      const color = this.monsterColor(m);
      if (color !== m.color) {
        m.color = color;
        m.label.setColor(color);
      }
      m.bar.clear().setDepth(depth + 0.1);
      if (!m.guard) {
        const w = 34;
        m.bar.fillStyle(0x000000, 0.7).fillRect(s.x - w / 2, s.y - (rise - 4), w, 5);
        m.bar.fillStyle(0xe53935, 1).fillRect(s.x - w / 2 + 1, s.y - (rise - 5), (w - 2) * Math.max(0, m.hp / m.maxHp), 3);
      }
      if (m.view?.alive && m.id === this.targetId) m.bar.lineStyle(2, 0xffe08a, 1).strokeEllipse(s.x, s.y, 40, 20); // the square is hidden: ring the feet
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

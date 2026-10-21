import { DurableObject } from "cloudflare:workers";
import {
  BREAKTHROUGH_FAIL_EXP_LOSS,
  NO_PATHS,
  PATHS,
  allPathSkills,
  afterDrop,
  afterSwap,
  checkPathChoice,
  pathDropCost,
  pathLevel,
  pathLevelReady,
  pathSwapCost,
  nextPathSlot,
  parsePaths,
  pathBonuses,
  withPaths,
  pathCost,
  type PathError,
  type PathId,
  type PathState,
  DEFAULT_CONSTITUTION,
  getBreakthrough,
  breakthroughPoints,
  breakthroughRate,
  checkBreakthroughReady,
  expAtStart,
  expToNext,
  rollBreakthrough,
  type BreakthroughEnd,
  type BreakthroughError,
  MAX_BAG_TABS,
  ALLOCATE_MIN_GAP_MS,
  ATTACK_MIN_GAP_MS,
  BASE_SPEED,
  CHAT_BURST,
  CHAT_MIN_GAP_MS,
  CHAT_WINDOW_MS,
  checkChatRate,
  retryAfterMs,
  DEFAULT_CATALOG,
  EMPTY_WALLET,
  INV_MIN_GAP_MS,
  MP_REGEN_PER_S,
  POTION_COOLDOWN_MS,
  HOTBAR_SLOTS,
  constitutionEffects,
  gearAffinity,
  parseRoots,
  parseVitals,
  restoreVitals,
  MP_REGEN_DELAY_MS,
  REGEN_DELAY_MS,
  type ConstitutionCatalog,
  availableSkills,
  gearSkillInfo,
  parseSkillSlot,
  addMastery,
  skillGrade,
  MASTERY_PILL_POINTS,
  gearSkillIds,
  canLearn,
  getSkill,
  isSkillId,
  parseHotbar,
  applyBag,
  applyRefineExp,
  equipmentBonus,
  equipmentInfo,
  levelIndex,
  refineLevelOf,
  newDurability,
  planDeathWear,
  planEquip,
  planReconcile,
  planRepair,
  planUnequip,
  getItemDef,
  itemAt,
  planAdd,
  planMove,
  planRemove,
  planSort,
  planSplit,
  SORT_BURST,
  SORT_MIN_GAP_MS,
  SORT_WINDOW_MS,
  firstFreeCell,
  type BagOp,
  type EquipBlock,
  type EquipSlot,
  type EquipStats,
  type LootDrop,
  type WearerCtx,
  MAX_DESYNC_TILES,
  MIN_MOVE_INTERVAL_MS,
  MOVE_BUDGET_CAP,
  PING_MESSAGE,
  PONG_MESSAGE,
  TICK_MS,
  deriveStats,
  expLostOnDeath,
  findSmoothPath,
  getMap,
  isMapId,
  isStandable,
  lineClear,
  nearestStandablePoint,
  parseClientMessage,
  portalNear,
  spendMoveBudget,
  positionAlongPath,
  type BaseStats,
  type CharacterSheet,
  type ClientMessage,
  type MapId,
  type MonsterRank,
  type PlayerSnapshot,
  tileCenter,
  type MapData,
  type ServerMessage,
  type Vec2,
} from "@game/shared";
import { DEATH_DURABILITY_BY_TIER, applyGuardKill, GRAY_WINDOW_MS, SAT_NHAN_DECAY_PER_MIN, planPkDrop, type NameTier, TALISMAN_CAST_MS, applyPvpKill, findOffer, isMonsterId, isPkProtected, nameTier, npcNear, sellPrice, type Gender, type PkMode, type PkScores } from "@game/shared";
import { getPurchased, limitStatements, stockLeft } from "./shop";
import { savePkScores } from "./characters";
import { abandonQuest, acceptQuest, commitTurnIn, getQuestCatalog, loadQuestProgress, pathItemGiven, planTurnIn, resetQuestStatements, saveQuestProgress } from "./quests";
import { givesPathItem, killCounts, objectiveTarget, questStatus, type QuestDef, type QuestProgressView } from "@game/shared";
import { commitPathBatch, commitPathChoice, levelUpStatements, rearrangeStatements } from "./paths";
import { commitBreakthroughFailure, commitBreakthroughSuccess, isStaleBreakthrough, planTakePills, startStatements } from "./breakthrough";
import { filterChat } from "./chat";
import {
  allocatePoints,
  getCharacterById,
  loadSkillRows,
  ensureRootSkills,
  saveSkillMastery,
  type SkillRow,
  saveHotbar,
  saveCharacterPosition,
  saveCharacterProgress,
  toCharacterSheet,
  type CharacterRow,
} from "./characters";
import { getConstitutionCatalog } from "./constitution-catalog";
import { applyCurrencyDelta, getWallet } from "./economy";
import {
  addBagTabStatements,
  claimMailItem,
  commitBagOps,
  deleteExpiredMail,
  diffBag,
  listMail,
  loadBag,
  mailViews,
  opStatements,
  pruneGrants,
  saveRefine,
  type BagState,
  type MailItem,
} from "./inventory";
import { CombatSim, type PlayerProfile, type ProfileSeed, type SimEvent } from "./combat-sim";
import type { Env } from "./env";
import { getSetting } from "./settings";

/** Per-socket state persisted via the hibernation attachment, so the DO can sleep safely. */
interface PlayerState {
  /** Character id. */
  id: string;
  /** The account is an admin (set by the Worker when the socket opens; a role change counts from the next connection). */
  admin?: boolean;
  name: string;
  /** Lock claim id of this connection, kept so the lock can be released after a wake-up. */
  claimId: string;
  mapId: MapId;
  path: Vec2[];
  startedAt: number;
  speed: number;
  lastMoveAt: number;
  /** Last bag command, to rate-limit them (each one is a D1 write). */
  lastInvAt?: number;
  /** Last skill / hotbar command, to rate-limit them. */
  lastCastAt?: number;
  lastHotbarAt?: number;
  /** Times of recent sorts: a sort rewrites many rows, so it has its own, stricter limit. */
  sortTimes?: number[];
  /** Position changed since the last save to D1. */
  dirty: boolean;
  /** Set while a portal transfer is in flight so moves and repeated portal requests are ignored. */
  transferring?: boolean;
  /** Timestamps of recent chat messages, for rate limiting. */
  chatTimes: number[];
  lastAllocateAt?: number;
  /** Movement budget (see shared/movement.ts) and when it was last updated. */
  moveBudget?: number;
  moveBudgetAt?: number;
  /** A paid breakthrough in progress (kept here so it survives the object sleeping; the alarm ends it). */
  bt?: ActiveBreakthrough;
  /** PvP: the PK switch (off at every join), sát khí, sát nhân as of `snAt` (it falls 5 a minute from there while online), anh hùng. */
  pk?: PkMode;
  sk?: number;
  sn?: number;
  snAt?: number;
  ah?: number;
  /** The scores changed since they were last written (they are also written when the character leaves while it has sát nhân to decay). */
  pkDirty?: boolean;
  /** A teleport talisman being channelled: when it completes, which talisman and where it leads. Any move, attack or hit breaks it. */
  tp?: { endsAt: number; item: string; to: MapId };
}

/** What a running breakthrough needs to be finished later: when it started (the D1 marker), when it ends, and the chance fixed at the start. */
interface ActiveBreakthrough {
  startedAt: number;
  endsAt: number;
  from: number;
  ratePct: number;
}

/**
 * Position stored in the character row, as continuous tile units. Rows written before free movement hold
 * integer tile indices, which are treated as tile centres; positions inside obstacles snap to the nearest standable point.
 */
function restorePosition(map: MapData, x: number, y: number): Vec2 {
  const legacy = Number.isInteger(x) && Number.isInteger(y);
  const p: Vec2 = legacy ? [x + 0.5, y + 0.5] : [x, y];
  return nearestStandablePoint(map, p[0], p[1], 2) ?? tileCenter(map.spawn);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Minimum gaps between two skill commands and two hotbar edits (a hotbar edit is a D1 write). */
const CAST_MIN_GAP_MS = 150;
const HOTBAR_MIN_GAP_MS = 300;

/** A comparable form of stored vitals without their timestamp: equal keys mean nothing changed worth a write. */
function vitalsKey(v: { hp: number; mp: number; cd?: Record<string, number>; buffs?: unknown[] } | null): string {
  return v === null ? "null" : `${v.hp}|${v.mp}|${JSON.stringify(v.cd ?? {})}|${JSON.stringify(v.buffs ?? [])}`;
}

/** Moves are saved at most this often per room, so D1 writes stay low and the room can still hibernate. */
const SAVE_DEBOUNCE_MS = 10_000;

function baseOf(row: CharacterRow): BaseStats {
  return toCharacterSheet(row).base;
}

/** Who is wearing the gear: requirements are judged against the character without it. */
function wearerOfRow(row: CharacterRow, catalog?: ConstitutionCatalog): WearerCtx {
  const affinity = catalog ? gearAffinity(parseRoots(row.roots, row.spiritual_root), constitutionEffects(catalog, row.constitution, row.constitution_tier)) : undefined;
  return { gender: row.gender, realm: row.realm, stage: row.stage, base: baseOf(row), affinity };
}

/** Weapon family of the worn weapon, or null (no weapon, a broken one, or one without a family). */
function weaponFamily(equipped: readonly { slot: string; type: string; dur?: number }[]): string | null {
  const w = equipped.find((e) => e.slot === "weapon");
  return w && (w.dur === undefined || w.dur > 0) ? (equipmentInfo(w.type)?.weaponType ?? null) : null;
}

function seedOf(row: CharacterRow, bag: BagState | undefined, skills: readonly SkillRow[] | undefined, catalog: ConstitutionCatalog): ProfileSeed {
  const effects = constitutionEffects(catalog, row.constitution, row.constitution_tier);
  return {
    effects,
    affinity: gearAffinity(parseRoots(row.roots, row.spiritual_root), effects),
    roots: parseRoots(row.roots, row.spiritual_root),
    vitals: parseVitals(row.vitals),
    gear: bag ? equipmentBonus(bag.equipped, wearerOfRow(row, catalog)) : undefined,
    weapon: bag ? weaponFamily(bag.equipped) : null,
    gearSkills: bag ? gearSkillInfo(bag.equipped) : [],
    granted: (skills ?? []).map((r) => r.skill_id),
    skillState: stateOfRows(skills ?? []),
    gender: row.gender,
    paths: parsePaths(row.paths),
    id: row.id,
    name: row.name,
    satKhi: row.sat_khi,
    satNhan: row.sat_nhan,
    satNhanAt: Date.now(),
    hero: row.anh_hung,
    potentialPoints: row.potential_points,
    element: row.spiritual_root,
    base: baseOf(row),
    rootGrade: row.root_grade,
    constitution: row.constitution,
    constitutionTier: row.constitution_tier,
    realm: row.realm,
    stage: row.stage,
    exp: row.exp,
  };
}

/** Mastery of the skills that have levels (root and learned), as the sim and the client want it. */
function stateOfRows(rows: readonly SkillRow[]): Record<string, { lv: number; xp: number }> {
  const out: Record<string, { lv: number; xp: number }> = {};
  for (const r of rows) out[r.skill_id] = { lv: r.level, xp: r.mastery };
  return out;
}

function sheetOf(p: PlayerProfile): CharacterSheet {
  return {
    id: p.id,
    name: p.name,
    spiritualRoot: p.element,
    roots: [...(p.roots ?? [p.element])],
    rootGrade: p.rootGrade,
    constitution: p.constitution,
    constitutionTier: p.constitutionTier,
    gender: p.gender,
    paths: p.paths ?? NO_PATHS,
    realm: p.realm,
    stage: p.stage,
    exp: p.exp,
    potentialPoints: p.potentialPoints,
    base: p.base,
  };
}

export class MapRoom extends DurableObject<Env> {
  private colo: string | null = null;
  /** Monsters and fights; exists only while someone is in a non-safe map (the room is empty otherwise). */
  private sim: CombatSim | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  /** Pending ledger writes for monster drops, run one after another so they never delay the tick. */
  private dropQueue: Promise<void> = Promise.resolve();
  private lastTickAt = 0;
  /** Single-flight rebuild of the sim after the object slept (see wake). */
  private waking: Promise<void> | null = null;
  /** JSON of the monster classes last written to storage, to skip identical writes. */
  private ranksJson: string | null = null;
  /**
   * Each online character's bag as this room last wrote it (the room is the only writer while it holds the character
   * lock). Too big for the socket attachment, so it lives in memory and is reloaded lazily after a sleep.
   */
  private bags = new Map<string, BagState>();
  /** Bag changes of one character run one after another, so loot and commands never plan against the same snapshot. */
  private bagQueues = new Map<string, Promise<void>>();
  /** Characters whose pháp bảo bản mệnh EXP changed since it was last written. */
  private refineDirty = new Set<string>();
  /** Skills learned from bí tịch and the hotbar of each character in this room, read on join (and after a sleep). */
  private skillRows = new Map<string, SkillRow[]>();
  /** Skills whose mastery changed since the last write, per character (written with the next save). */
  private skillDirty = new Map<string, Set<string>>();
  /** Quest progress of the characters in the room (loaded lazily from D1; absolute values are written back) and which quests changed. */
  private questRows = new Map<string, Record<string, QuestProgressView>>();
  private questDirty = new Map<string, Set<string>>();
  private hotbars = new Map<string, string[]>();
  /** Per character: the vitals as last written to D1 (without the timestamp), so an unchanged state is not written again. */
  private vitalKeys = new Map<string, string>();
  private pauses = 0;
  private wakes = 0;
  private tickStat = { count: 0, totalMs: 0, maxMs: 0, maxDriftMs: 0, skipped: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime while the object hibernates (no wake-up, no duration billing).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_MESSAGE, PONG_MESSAGE));
  }

  /**
   * Cloudflare data centre this Durable Object runs in (diagnostics for latency). Never blocks the join:
   * it is cached in memory and storage, and the first lookup runs in the background with a short timeout.
   */
  private async knownColo(): Promise<string> {
    if (this.colo) return this.colo;
    const stored = await this.ctx.storage.get<string>("colo");
    if (stored) {
      this.colo = stored;
      return stored;
    }
    this.ctx.waitUntil(this.fetchColo());
    return "…";
  }

  private async fetchColo(): Promise<void> {
    try {
      const res = await fetch("https://cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(800) });
      const m = /^colo=(\w+)$/m.exec(await res.text());
      if (m?.[1]) {
        this.colo = m[1];
        await this.ctx.storage.put("colo", m[1]);
      }
    } catch {
      // Diagnostics only; the next join retries.
    }
  }

  /** The Worker authenticates the cookie and sets these headers; clients cannot reach this object directly. */
  async fetch(request: Request): Promise<Response> {
    const characterId = request.headers.get("x-char-id");
    const room = request.headers.get("x-room");
    if (!characterId || !room) return new Response("Forbidden", { status: 403 });

    const lock = this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(characterId));
    // Claim first: the previous holder (any room) kicks its socket and saves before we read the row.
    const claimId = crypto.randomUUID();
    await lock.claim(characterId, room, claimId);
    try {
      let row = await getCharacterById(this.env.DB, characterId);
      if (!row) {
        await lock.release(claimId);
        return new Response("No such character", { status: 404 });
      }
      // The Worker routes by the saved map; a mismatch means the character moved during this login (portal in flight).
      if (room.split(":")[0] !== row.map_id) {
        await lock.release(claimId);
        return new Response("Wrong map", { status: 409 });
      }
      // A breakthrough marker left by a room that was lost mid-way counts as a failure (the pills and the cost are already paid).
      let staleLoss: number | null = null;
      if (row.bt_started_at !== null) {
        staleLoss = await this.settleStaleBreakthrough(row);
        row = (await getCharacterById(this.env.DB, characterId)) ?? row;
      }
      const colo = await this.knownColo();
      // The Worker routes by the character's saved map, so the row's map is this room's map.
      const mapId: MapId = isMapId(row.map_id) ? row.map_id : "town";
      const map = getMap(mapId);
      // Every await of the join happens before the socket is accepted. From accepting to `welcome` the code is
      // synchronous, so no broadcast, tick event or monster resync can reach the new socket ahead of its welcome
      // (the client rebuilds its actors from the welcome and would otherwise show stale ones).
      // After a sleep the sim is gone and every connected player needs a profile again.
      await this.wake(mapId);
      const wallet = await getWallet(this.env.DB, row.id).catch((err) => {
        console.error("wallet read failed", err);
        return { ...EMPTY_WALLET };
      });

      // The bag and the mail are read here too (before accepting), for the same reason as the wallet.
      const joinedAt = Date.now();
      await deleteExpiredMail(this.env.DB, joinedAt, row.id).catch((err) => console.error("mail sweep failed", err));
      const [bag, mail] = await Promise.all([
        loadBag(this.env.DB, row.id),
        listMail(this.env.DB, row.id, joinedAt).catch((err) => {
          console.error("mail read failed", err);
          return [];
        }),
      ]);
      this.bags.set(row.id, bag);
      // Gear the character no longer qualifies for (or that is already broken) comes off before the room sees them.
      const removedAtJoin = await this.reconcileGear(row).catch((err) => {
        console.error("gear reconcile failed", row.id, err);
        return [];
      });
      const bagNow = this.bags.get(row.id) ?? bag;
      // Every skill the character was given, including the root skills of any realm it has reached and was not given yet.
      const skills = await loadSkillRows(this.env.DB, row.id)
        .then((rows) => ensureRootSkills(this.env.DB, row.id, row.realm, rows))
        .catch((err) => {
          console.error("skills read failed", row.id, err);
          return null;
        });
      // A failed read is not cached as "no skills": getSkillRows tries again when a skill is next needed.
      if (skills) this.skillRows.set(row.id, skills);
      const hotbar = parseHotbar(row.hotbar);
      this.hotbars.set(row.id, hotbar);
      // Pieces mailed because the bag was full must be in the mail list the welcome carries.
      const mailNow = removedAtJoin.some((r) => r.mailed) ? await listMail(this.env.DB, row.id).catch(() => mail) : mail;
      // Names and descriptions of the constitutions are data: the client shows what the server's catalogue says. If it
      // cannot be read the default one is sent (display only; creation never falls back like this).
      const constitutions = await getConstitutionCatalog(this.env.DB).catch((err) => {
        console.error("constitution catalogue read failed", err);
        return DEFAULT_CATALOG;
      });
      if (Math.random() < 0.05) {
        // Rare global housekeeping: mail that expired while its owner was offline, and old loot keys.
        this.ctx.waitUntil(
          Promise.all([deleteExpiredMail(this.env.DB, joinedAt), pruneGrants(this.env.DB, joinedAt)]).then(
            () => undefined,
            (err) => console.error("housekeeping failed", err),
          ),
        );
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      const position = restorePosition(map, row.x, row.y);
      const state: PlayerState = {
        id: row.id,
        admin: request.headers.get("x-char-admin") === "1",
        pk: 0,
        sk: row.sat_khi,
        sn: row.sat_nhan,
        snAt: Date.now(),
        ah: row.anh_hung,
        name: row.name,
        claimId,
        mapId,
        path: [position],
        startedAt: Date.now(),
        speed: BASE_SPEED,
        lastMoveAt: 0,
        dirty: false,
        chatTimes: [],
      };
      server.serializeAttachment(state);
      // Includes the joining player so the client gets its own authoritative snapshot.
      const players = this.players().map((p) => this.snapshot(p));
      const sim = this.sim;
      const profile = sim ? (sim.getPlayer(row.id) ?? sim.addPlayer(seedOf(row, bagNow, skills ?? [], constitutions))) : undefined;
      if (sim) this.startTick();
      const derived = withPaths(deriveStats(baseOf(row), row.realm, row.stage, row.root_grade, equipmentBonus(bagNow.equipped, wearerOfRow(row, constitutions)), parseRoots(row.roots, row.spiritual_root).length), parsePaths(row.paths));
      const maxHp = profile?.maxHp ?? derived.maxHp;
      // In town there is no profile: what the character left the fight with still counts (and keeps regenerating from now on).
      const storedVitals = parseVitals(row.vitals);
      const away = restoreVitals(storedVitals, Date.now(), derived.maxHp, derived.maxMp);
      this.vitalKeys.set(row.id, vitalsKey(storedVitals));
      this.send(server, {
        t: "welcome",
        self: state.id,
        map: mapId,
        players,
        colo,
        character: toCharacterSheet(row),
        monsters: sim?.snapshots(Date.now()) ?? [],
        hp: profile?.hp ?? away.hp,
        maxHp,
        wallet,
        bag: { tabs: bagNow.tabs, items: bagNow.items, tabPrice: await getSetting(this.env.DB, "bag_tab_price") },
        mail: mailViews(mailNow),
        constitutions,
        equipped: bagNow.equipped,
        skills: profile && sim ? sim.skillsOf(profile) : availableSkills((skills ?? []).map((r) => r.skill_id), gearSkillIds(bagNow.equipped)),
        skillStates: stateOfRows(skills ?? []),
        hotbar,
        cd: profile && sim ? sim.cooldownsLeft(profile, Date.now()) : Object.fromEntries(Object.entries(away.cooldowns).map(([k, t]) => [k, t - Date.now()])),
        mp: profile && sim ? sim.currentMp(profile, Date.now()) : away.mp,
        maxMp: profile?.maxMp ?? derived.maxMp,
        regenInMs: profile ? Math.max(0, profile.lastHurtAt + Math.max(REGEN_DELAY_MS, MP_REGEN_DELAY_MS) - Date.now()) : 0,
        effects: profile && sim ? sim.effectsOf(profile, Date.now()) : away.buffs.filter((b) => b.until > Date.now() && getSkill(b.skill) !== undefined).map((b) => ({ id: `s:${b.skill}`, ms: b.until - Date.now() })),
      });
      if (staleLoss !== null) this.send(server, { t: "bt_end", ok: false, reason: "left", expLost: staleLoss });
      void this.sendQuestActive(row.id).catch((err) => console.error("quest list failed", row.id, err));
      this.sendPk(server, state);
      if (removedAtJoin.length > 0) this.send(server, { t: "eq_removed", items: removedAtJoin.map((r) => ({ type: r.item.type, reason: r.reason, mailed: r.mailed })) });
      this.broadcast({ t: "joined", player: this.snapshot(state) }, server);
      return new Response(null, { status: 101, webSocket: client });
    } catch (err) {
      this.bags.delete(characterId);
      await lock.release(claimId);
      throw err;
    }
  }

  /** Called by CharacterLock when the same character connects elsewhere: save, then kick the old socket. */
  async evictCharacter(characterId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as PlayerState | null;
      if (!state || state.id !== characterId) continue;
      // The same character connected elsewhere while this socket still looked open to the server (it never saw a close).
      this.logSocketEnd("evicted", ws, { reason: "replaced by a newer connection" });
      await this.failBreakthroughOnExit(ws, state, "left");
      await this.flushPk(state);
      ws.serializeAttachment(null);
      await this.save(state);
      await this.settleBag(state.id);
      this.dropPlayer(state.id);
      this.send(ws, { t: "kicked", reason: "duplicate-login" });
      try {
        ws.close(4000, "duplicate-login");
      } catch {
        // Already closed.
      }
      this.broadcast({ t: "left", id: state.id }, ws);
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    const msg = parseClientMessage(raw);
    if (!msg) return;
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state || state.transferring) return;

    switch (msg.t) {
      case "move":
        // Starts the tick again if it was paused. Never awaited: a move must not wait for a rebuild.
        void this.wake(state.mapId).catch((err) => console.error("wake failed", err));
        return this.handleMove(ws, state, msg);
      case "portal":
        return this.handlePortal(ws, state);
      case "chat":
        // Only map chat belongs on this socket; a client that sends the others here is ignored.
        return msg.channel === "map" ? this.handleChat(ws, state, msg.text) : undefined;
      case "allocate":
        return this.handleAllocate(ws, state, msg.points);
      case "attack":
        return this.handleAttack(ws, state, msg.id);
      case "pk_mode":
        return this.handlePkMode(ws, state, msg.mode);
      case "inv_use":
      case "inv_drop":
      case "inv_move":
      case "inv_sort":
      case "inv_split":
      case "inv_expand":
      case "mail_claim":
        return this.handleInventory(ws, state, msg);
      case "eq_equip":
      case "eq_unequip":
      case "eq_repair":
        return this.handleEquipment(ws, state, msg);
      case "npc_open":
      case "shop_buy":
      case "shop_sell":
      case "shop_sell_many":
        return this.handleShop(ws, state, msg);
      case "quest_accept":
      case "quest_turn_in":
        return this.handleQuest(ws, state, msg);
      case "quest_abandon":
        return this.handleQuestAbandon(ws, state, msg.quest);
      case "cast":
        return this.handleCast(ws, state, msg);
      case "hotbar_set":
        return this.handleHotbar(ws, state, msg.slot, msg.v);
      case "hotbar_swap":
        return this.handleHotbarSwap(ws, state, msg.a, msg.b);
      case "use_type":
        return this.handleUseType(ws, state, msg.type);
      case "skill_boost":
        return this.handleSkillBoost(ws, state, msg.skill);
      case "bt_start":
        return this.handleBreakthroughStart(ws, state, msg.pills);
      case "bt_cancel":
        return this.interruptBreakthrough(state.id, "cancel");
      case "conn_report":
        // What the client saw when its previous socket ended (it only goes to the log; compare with the server's own `socket close` line).
        console.log(`conn report char=${state.id} code=${msg.code} clean=${msg.clean} reason="${msg.reason}" downMs=${msg.downMs}`);
        return;
      case "bt_claim":
        return this.handleBreakthroughClaim(ws, state);
      case "path_claim":
        return this.handlePathClaim(ws, state, msg.path);
      case "path_choose":
        return this.handlePathChoose(ws, state, msg.path);
      case "path_swap":
      case "path_drop":
        return this.handlePathChange(ws, state, msg.t === "path_swap" ? "swap" : "drop", msg.path);
    }
  }

  private async handleMove(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "move" }>): Promise<void> {
    // Walking away ends a breakthrough (it fails). The move itself goes on with a fresh copy of the state.
    if (state.bt) {
      await this.interruptBreakthrough(state.id, "moved");
      state = (ws.deserializeAttachment() as PlayerState | null) ?? state;
    }
    if (state.tp) {
      await this.interruptTalisman(state.id, "moved");
      state = (ws.deserializeAttachment() as PlayerState | null) ?? state;
    }
    const map = getMap(state.mapId);
    const now = Date.now();
    // The mover predicts locally, so it only needs a payload when its move was corrected or rejected.
    const reject = () => this.send(ws, { t: "ack", seq: msg.seq, player: this.snapshot(state) });
    if (now - state.lastMoveAt < MIN_MOVE_INTERVAL_MS) return reject();
    const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
    // Trust the client's start tile when it is close to the server's view (latency drift), so the
    // client's prediction and the server path start from the same tile and nothing is pulled back.
    // A movement budget bounds how much drift the server accepts over time, so claims cannot be chained into a speed hack.
    const spent = spendMoveBudget(
      state.moveBudget ?? MOVE_BUDGET_CAP,
      now - (state.moveBudgetAt ?? now),
      Math.hypot(msg.fx - here.x, msg.fy - here.y),
      MAX_DESYNC_TILES,
    );
    const claimedOk = spent.accepted && isStandable(map, msg.fx, msg.fy);
    // A claim that was refused (too far, or not standable) is not charged.
    state.moveBudget = claimedOk ? spent.budget : spent.budget + (spent.accepted ? Math.hypot(msg.fx - here.x, msg.fy - here.y) : 0);
    state.moveBudgetAt = now;
    const from: Vec2 = claimedOk ? [msg.fx, msg.fy] : [here.x, here.y];
    const path = findSmoothPath(map, from, [msg.x, msg.y]);
    if (!path) return reject();
    this.sim?.clearTarget(state.id);
    state.path = path;
    state.startedAt = now;
    state.lastMoveAt = now;
    state.dirty = true;
    ws.serializeAttachment(state);
    // Others get the new path; the mover only gets the track back if its start tile was overridden.
    this.broadcast({ t: "path", player: this.snapshot(state) }, ws);
    this.send(ws, claimedOk ? { t: "ack", seq: msg.seq } : { t: "ack", seq: msg.seq, player: this.snapshot(state) });
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SAVE_DEBOUNCE_MS);
  }

  /** Portal: verify the position, then hand the character to the destination map. */
  private async handlePortal(ws: WebSocket, state: PlayerState): Promise<void> {
    const here = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    const portal = portalNear(getMap(state.mapId), here.x, here.y);
    if (!portal) return;
    await this.handoff(ws, state, portal.toMap, portal.toX + 0.5, portal.toY + 0.5);
  }

  /**
   * Map handoff: save at the destination (together with any unwritten progression), detach, release the lock, then
   * tell the client to reconnect. Used by portals and by death (back to town).
   */
  private async handoff(ws: WebSocket, state: PlayerState, toMap: MapId, x: number, y: number, closeOnFail = false, before: readonly D1PreparedStatement[] = []): Promise<boolean> {
    // A breakthrough cannot go through a portal or a death: it fails first, so the row is settled before the move is saved.
    if (state.bt) {
      await this.failBreakthroughOnExit(ws, state, closeOnFail ? "died" : "moved");
      state = (ws.deserializeAttachment() as PlayerState | null) ?? state;
    }
    state.transferring = true;
    // The destination row is written below; a pending debounced save must not overwrite it with the old map.
    state.dirty = false;
    ws.serializeAttachment(state);
    const progress = this.sim?.beginFlush(state.id) ?? undefined;
    try {
      await saveCharacterPosition(this.env.DB, state.id, toMap, x, y, progress, this.vitalsJson(state.id), before);
    } catch (err) {
      console.error("handoff save failed", state.id, err);
      if (progress) this.sim?.endFlush(state.id, progress, false);
      state.transferring = false;
      ws.serializeAttachment(state);
      // A dead player would stay dead with no way out: closing the socket runs the normal leave (save, drop, rejoin).
      if (closeOnFail) {
        try {
          ws.close(1011, "handoff-failed");
        } catch {
          // Already closed.
        }
      }
      return false;
    }
    if (progress) this.sim?.endFlush(state.id, progress, true);
    await this.flushPk(state);
    ws.serializeAttachment(null);
    await this.settleBag(state.id);
    this.dropPlayer(state.id);
    this.broadcast({ t: "left", id: state.id }, ws);
    this.send(ws, { t: "transfer", map: toMap });
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
    try {
      ws.close(4002, "transfer");
    } catch {
      // Already closed.
    }
    return true;
  }

  private handleChat(ws: WebSocket, state: PlayerState, text: string): void {
    const now = Date.now();
    const times = checkChatRate(state.chatTimes, now, { burst: CHAT_BURST, windowMs: CHAT_WINDOW_MS, minGapMs: CHAT_MIN_GAP_MS });
    if (!times) return this.send(ws, { t: "chat_error", reason: "rate" });
    state.chatTimes = times;
    ws.serializeAttachment(state);
    // Room-local chat: only players on this map channel receive it. World chat and whispers go over the chat socket.
    this.broadcast({ t: "chat", channel: "map", id: state.id, name: state.name, text: filterChat(text), ts: now });
  }

  /** Spends potential points. Always answers with the current sheet so the client resyncs after a rejection. */
  private async handleAllocate(ws: WebSocket, state: PlayerState, points: Extract<ClientMessage, { t: "allocate" }>["points"]): Promise<void> {
    const now = Date.now();
    if (now - (state.lastAllocateAt ?? 0) < ALLOCATE_MIN_GAP_MS) return;
    state.lastAllocateAt = now;
    ws.serializeAttachment(state);
    try {
      const row = (await allocatePoints(this.env.DB, state.id, points)) ?? (await getCharacterById(this.env.DB, state.id));
      if (!row) return;
      // In a combat map the room's working copy of EXP is newer than D1, so the sheet is built from it.
      const profile = this.sim?.getPlayer(state.id);
      if (profile) {
        // Points still in flight may or may not be in D1 yet; counting them keeps the number from dipping (off by at most that much for a moment).
        profile.potentialPoints = row.potential_points + profile.pendingPoints + profile.inflightPoints;
        this.sim?.updateBase(state.id, baseOf(row));
        this.send(ws, { t: "stats", character: sheetOf(profile) });
        this.send(ws, { t: "hp", hp: profile.hp, maxHp: profile.maxHp });
        this.sendMp(ws, profile, now); // more Linh lực raises max MP
      } else {
        this.send(ws, { t: "stats", character: toCharacterSheet(row) });
      }
    } catch (err) {
      console.error("allocate failed", state.id, err);
    }
  }

  /** Debounced save of every player whose position changed. */
  async alarm(): Promise<void> {
    let nextBreakthroughAt: number | null = null;
    for (const ws of this.ctx.getWebSockets()) {
      let state = ws.deserializeAttachment() as PlayerState | null;
      if (!state) continue;
      if (state.tp && !state.transferring) {
        if (Date.now() >= state.tp.endsAt - 50) {
          await this.finishTalisman(ws, state.id);
          // A completed talisman has handed the character off (the attachment is gone): its old state must not be saved over the new position.
          const after = ws.deserializeAttachment() as PlayerState | null;
          if (!after) continue;
          state = after;
        } else {
          nextBreakthroughAt = Math.min(nextBreakthroughAt ?? Infinity, state.tp.endsAt);
        }
      }
      if (state.bt && !state.transferring) {
        if (Date.now() >= state.bt.endsAt - 50) {
          await this.finishBreakthrough(ws, state.id, state.bt, "timeout");
          state = (ws.deserializeAttachment() as PlayerState | null) ?? state;
        } else {
          nextBreakthroughAt = Math.min(nextBreakthroughAt ?? Infinity, state.bt.endsAt);
        }
      }
      await this.flushRefine(state.id);
      await this.flushSkills(state.id);
      await this.flushQuests(state.id);
      const profile = this.sim?.getPlayer(state.id);
      if (!state.dirty && !profile?.expDirty && !profile?.pendingPoints) continue;
      state.dirty = false;
      ws.serializeAttachment(state);
      await this.save(state);
    }
    if (nextBreakthroughAt !== null) await this.scheduleAlarmAt(nextBreakthroughAt);
  }

  /** Makes sure the alarm fires no later than `at` (the single alarm also drives the debounced saves). */
  private async scheduleAlarmAt(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.logSocketEnd("close", ws, { code, reason });
    await this.handleLeave(ws);
    // 1005/1006 are reserved and cannot be sent in a close frame.
    ws.close(code >= 1000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.logSocketEnd("error", ws, {});
    await this.handleLeave(ws);
  }

  /**
   * Log line for every way a game socket ends or is replaced (for finding out why connections drop, e.g. mid-breakthrough):
   * who, which room, whether a breakthrough was running, and the close code and reason when the runtime gave them.
   */
  private logSocketEnd(kind: "close" | "error" | "evicted", ws: WebSocket, info: { code?: number; reason?: string }): void {
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state) return;
    console.log(
      `socket ${kind} char=${state.id} map=${state.mapId} code=${info.code ?? "-"} reason="${info.reason ?? ""}" bt=${state.bt ? `running(${Math.round((state.bt.endsAt - Date.now()) / 1000)}s left)` : "no"} transferring=${state.transferring === true}`,
    );
  }

  private async handleLeave(ws: WebSocket): Promise<void> {
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state) return; // already evicted or never joined
    this.broadcast({ t: "left", id: state.id }, ws);
    await this.failBreakthroughOnExit(ws, state, "left");
    // Keep the attachment until the save finished: a claim arriving meanwhile must still find this
    // socket in evictCharacter() and wait for a save before the new room reads the character row.
    await this.save(state);
    await this.flushPk(state);
    // Pending bag writes finish while the attachment is still set, so a login that claims the lock meanwhile still
    // finds this socket in evictCharacter() and waits, and its new room reads the finished bag.
    await this.settleBag(state.id);
    ws.serializeAttachment(null);
    this.dropPlayer(state.id);
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
  }

  /** HP/MP/cooldowns/buffs of a character as the JSON stored with the position (null: fresh, undefined: nothing to store). */
  private vitalsJson(id: string): string | null | undefined {
    const v = this.sim?.snapshotVitals(id, Date.now());
    if (v !== undefined) this.vitalKeys.set(id, vitalsKey(v)); // the caller writes it with the position
    return v === undefined || v === null ? v : JSON.stringify(v);
  }

  /** Whether the vitals of a character differ from what is in D1 (so a pause is worth a write). */
  private vitalsChanged(id: string): boolean {
    const v = this.sim?.snapshotVitals(id, Date.now());
    return v !== undefined && vitalsKey(v) !== this.vitalKeys.get(id);
  }

  /** Persists the current tile and any unwritten progression. Failures are logged; the next save or disconnect retries. */
  private async save(state: PlayerState): Promise<void> {
    if (state.transferring) return; // the handoff owns the row until it completes
    const pos = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    const progress = this.sim?.beginFlush(state.id) ?? undefined;
    try {
      await saveCharacterPosition(this.env.DB, state.id, state.mapId, round2(pos.x), round2(pos.y), progress, this.vitalsJson(state.id));
      if (progress) this.sim?.endFlush(state.id, progress, true);
    } catch (err) {
      console.error("save failed", state.id, err);
      if (progress) this.sim?.endFlush(state.id, progress, false);
    }
  }

  // --- combat -------------------------------------------------------------------------------------------------

  private ensureSim(mapId: MapId, ranks?: Record<string, string>): CombatSim | null {
    const map = getMap(mapId);
    if (map.safe) return null;
    if (!this.sim) this.sim = new CombatSim(map, mapId, Math.random, Date.now(), ranks);
    return this.sim;
  }

  /**
   * Makes sure a combat map's sim exists and ticks. Cheap and synchronous while it is running. A paused sim only
   * restarts the interval. If the object slept, the sim is gone: one rebuild (shared by concurrent callers) restores
   * the monster classes from storage and a profile for every connected player from D1, then tells clients about the
   * monsters again.
   */
  private wake(mapId: MapId): Promise<void> {
    if (getMap(mapId).safe) return Promise.resolve();
    if (this.sim) {
      this.startTick();
      return Promise.resolve();
    }
    this.waking ??= this.rebuild(mapId).finally(() => {
      this.waking = null;
    });
    return this.waking;
  }

  private async rebuild(mapId: MapId): Promise<void> {
    const stored = await this.ctx.storage.get<Record<string, string>>("ranks");
    if (this.sim) return; // another path created it while storage was read
    const sim = this.ensureSim(mapId, stored)!;
    this.ranksJson = stored ? JSON.stringify(stored) : null;
    try {
      const present = this.players().filter((p) => !p.transferring);
      const rows = await Promise.all(present.map((p) => getCharacterById(this.env.DB, p.id)));
      const stillHere = new Set(this.players().filter((p) => !p.transferring).map((p) => p.id));
      for (const row of rows) {
        if (!row || !stillHere.has(row.id) || sim.getPlayer(row.id)) continue;
        // The worn gear counts too, so the bag is read for every player the sim lost.
        const bag = await this.getBag(row.id).catch(() => undefined);
        const skills = await this.getSkillRows(row.id).catch(() => [] as SkillRow[]);
        const catalog = await getConstitutionCatalog(this.env.DB).catch(() => DEFAULT_CATALOG);
        const live = present.find((s) => s.id === row.id);
        sim.addPlayer({ ...seedOf(row, bag, skills, catalog), satKhi: live?.sk ?? row.sat_khi, hero: live?.ah ?? row.anh_hung, satNhan: live?.sn ?? row.sat_nhan, satNhanAt: live?.snAt ?? Date.now() });
        if (live?.pk) sim.setPkMode(row.id, live.pk);
      }
    } catch (err) {
      this.sim = null; // the next move or attack retries the whole rebuild
      throw err;
    }
    this.wakes++;
    console.log("sim rebuilt", mapId, "players", sim.playerCount, "ranks restored", !!stored);
    for (const monster of sim.snapshots(Date.now())) this.broadcast({ t: "mon", monster });
    this.startTick();
  }

  /** Stops the interval when nothing happens so the object can sleep. Everything not yet in D1 is written first. */
  private async pauseTick(sim: CombatSim): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.pauses++;
    const ranks = sim.ranks();
    const json = JSON.stringify(ranks);
    // HP/MP/cooldowns live in memory; once the tick stops the object may sleep, so everybody's are written first.
    // alarm() writes the players with unsaved position or progress (their vitals go with it); of the others only those
    // whose vitals changed since the last write need one.
    const saves = this.players()
      .filter((p) => {
        const profile = sim.getPlayer(p.id);
        const alarmSaves = p.dirty || profile?.expDirty || !!profile?.pendingPoints;
        return !p.transferring && !alarmSaves && this.vitalsChanged(p.id);
      })
      .map((p) => this.save(p));
    await Promise.all([
      this.alarm(),
      ...saves,
      json === this.ranksJson ? Promise.resolve() : this.ctx.storage.put("ranks", ranks).then(() => void (this.ranksJson = json)),
    ]);
    console.log("tick paused", "players", sim.playerCount);
  }

  private startTick(): void {
    if (this.tickTimer) return;
    this.lastTickAt = Date.now();
    this.tickTimer = setInterval(() => void this.tick(), TICK_MS);
  }

  /** Forgets a character's combat profile; with nobody left the tick stops and the monsters are discarded. */
  private dropPlayer(id: string): void {
    this.sim?.removePlayer(id);
    // Judged by the sockets, not the sim: after a sleep the sim may be gone while the last players leave.
    if (this.players().length === 0) {
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = null;
      this.sim = null;
      this.ranksJson = null;
      this.ctx.waitUntil(this.ctx.storage.delete("ranks").then(() => undefined));
    }
  }

  /** Dev-only metrics (see /api/dev/tick-stats); never exposed unless ENABLE_DEV_GRANT is set. */
  tickStats(): {
    count: number;
    avgMs: number;
    maxMs: number;
    maxDriftMs: number;
    skipped: number;
    players: number;
    monsters: number;
    paused: boolean;
    pauses: number;
    wakes: number;
  } {
    const t = this.tickStat;
    return {
      count: t.count,
      avgMs: t.count ? t.totalMs / t.count : 0,
      maxMs: t.maxMs,
      maxDriftMs: t.maxDriftMs,
      skipped: t.skipped,
      players: this.sim?.playerCount ?? 0,
      monsters: this.sim?.monsterCount ?? 0,
      paused: this.tickTimer === null,
      pauses: this.pauses,
      wakes: this.wakes,
    };
  }

  /** Dev-only (see /api/dev/loot): runs the real loot path (bag or mail, one key, one batch) without killing anything. */
  async devLoot(characterId: string, drops: LootDrop[]): Promise<void> {
    // Gear starts with full durability, like a real drop.
    this.enqueueLoot(
      characterId,
      drops.map((d) => {
        const wear = newDurability(d.item);
        return wear ? { ...d, dur: wear.dur, max: wear.max } : d;
      }),
    );
    await (this.bagQueues.get(characterId) ?? Promise.resolve());
  }

  /** Dev-only (see /api/dev/evict): imitates the runtime evicting a paused object, which wrangler dev does not do reliably. */
  devEvict(force = false): boolean {
    // `force` also stops a running tick: a room full of fighting players never pauses, but its caches must still be testable.
    if (force && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.tickTimer || !this.sim) return false;
    this.sim = null;
    this.ranksJson = null;
    // A real eviction loses every in-memory copy, not just the simulation.
    this.bags.clear();
    this.bagQueues.clear();
    this.hotbars.clear();
    this.skillRows.clear();
    this.skillDirty.clear();
    this.questRows.clear();
    this.questDirty.clear();
    this.vitalKeys.clear();
    return true;
  }

  private async tick(): Promise<void> {
    const sim = this.sim;
    if (!sim) return;
    if (this.ticking) {
      this.tickStat.skipped++;
      return;
    }
    this.ticking = true;
    const started = Date.now();
    try {
      const drift = started - this.lastTickAt - TICK_MS;
      this.lastTickAt = started;
      if (drift > this.tickStat.maxDriftMs) this.tickStat.maxDriftMs = drift;

      const positions = new Map<string, Vec2>();
      const moving = new Set<string>();
      const sockets = new Map<string, { ws: WebSocket; state: PlayerState }>();
      for (const ws of this.ctx.getWebSockets()) {
        const state = ws.deserializeAttachment() as PlayerState | null;
        if (!state || state.transferring) continue;
        const p = positionAlongPath(state.path, started - state.startedAt, state.speed);
        positions.set(state.id, [p.x, p.y]);
        if (p.moving) moving.add(state.id);
        sockets.set(state.id, { ws, state });
      }

      const later: Promise<void>[] = [];
      for (const ev of sim.tick(started, positions, moving)) this.dispatch(ev, sockets, started, later);
      await Promise.all(later);

      const ms = Date.now() - started;
      const t = this.tickStat;
      t.count++;
      t.totalMs += ms;
      if (ms > t.maxMs) t.maxMs = ms;
      if (this.sim === sim && sim.isIdle(positions, moving)) await this.pauseTick(sim);
    } catch (err) {
      console.error("tick failed", err);
    } finally {
      this.ticking = false;
    }
  }

  private dispatch(
    ev: SimEvent,
    sockets: Map<string, { ws: WebSocket; state: PlayerState }>,
    now: number,
    later: Promise<void>[],
  ): void {
    switch (ev.t) {
      case "mon":
        return this.broadcast({ t: "mon", monster: ev.monster });
      case "mon_gone":
        return this.broadcast({ t: "mon_gone", id: ev.id });
      case "hit": {
        this.broadcast({ t: "hit", from: ev.from, to: ev.to, kind: ev.kind, damage: ev.damage, hp: ev.hp, ...(ev.skill ? { skill: ev.skill } : {}), ...(ev.ret ? { ret: true as const } : {}) });
        // Anything that attacks a character in the middle of a breakthrough (hit or miss) breaks it.
        // Who hit whom among the players: a player that hit you in the last 3 minutes is a self-defence kill, and shows grey on your screen.
        // An answer to a blow is not an attack of its own and does not count.
        if (sockets.has(ev.from) && sockets.has(ev.to) && !ev.ret) this.noteBlow(ev.from, ev.to, now);
        const target = sockets.get(ev.to);
        if (target?.state.bt) later.push(this.interruptBreakthrough(ev.to, "hit"));
        if (target?.state.tp) later.push(this.interruptTalisman(ev.to, "hit"));
        return;
      }
      case "hp": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "hp", hp: ev.hp, maxHp: ev.maxHp });
        return;
      }
      case "progress": {
        const entry = sockets.get(ev.playerId);
        const profile = this.sim?.getPlayer(ev.playerId);
        if (!entry || !profile) return;
        this.send(entry.ws, { t: "stats", character: sheetOf(profile) });
        // A stage-up changes points, so it is written at once; plain EXP waits for the debounced save.
        if (ev.stagesGained > 0) {
          this.send(entry.ws, { t: "skills", ids: this.sim?.skillsOf(profile) ?? [] }); // a stage-up may unlock a skill
          this.sendMp(entry.ws, profile, now); // and raises max MP (with a full refill)
          later.push(this.flushProgress(entry.state.id));
        }
        else later.push(this.ensureSaveAlarm(now));
        return;
      }
      case "drop":
        this.enqueueDrop(ev.playerId, ev.amount);
        return;
      case "refine":
        later.push(this.addRefineExp(ev.playerId, ev.gain, now));
        return;
      case "mp": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "mp", mp: ev.mp, maxMp: ev.maxMp, regenInMs: ev.regenInMs, perSec: MP_REGEN_PER_S });
        return;
      }
      case "cast_ok": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "cast_ok", skill: ev.skill, cdMs: ev.cdMs });
        return;
      }
      case "cast_fail": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "cast_error", skill: ev.skill, reason: ev.reason });
        return;
      }
      case "buff": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "buff", skill: ev.skill, ms: ev.ms });
        return;
      }
      case "mastery":
        later.push(this.noteMastery(ev.playerId, ev.skill, ev.lv, ev.xp, ev.up, now));
        return;
      case "effects": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.send(entry.ws, { t: "effects", list: ev.list });
        return;
      }
      case "loot":
        this.enqueueLoot(ev.playerId, ev.drops);
        return;
      case "pvp_kill":
        later.push(this.settlePvpKill(ev.killerId, ev.victimId, sockets, now));
        return;
      case "guard_kill":
        later.push(this.settleGuardKill(ev.killerId, sockets, now));
        return;
      case "kill": {
        const mapId = sockets.get(ev.playerId)?.state.mapId;
        if (mapId) later.push(this.noteKill(ev.playerId, mapId, ev.rare).catch((err) => console.error("quest kill failed", ev.playerId, err)));
        return;
      }
      case "player_dead": {
        const entry = sockets.get(ev.playerId);
        const profile = this.sim?.getPlayer(ev.playerId);
        if (!entry || !profile) return;
        later.push(this.handleDeath(entry.ws, entry.state, profile, ev.by));
        return;
      }
      case "teleport": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.teleport(entry.ws, entry.state, ev.to, now);
        return;
      }
      case "path_request": {
        const entry = sockets.get(ev.playerId);
        if (entry) this.chase(entry.ws, entry.state, ev.to, now);
        return;
      }
    }
  }

  private async ensureSaveAlarm(now: number): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SAVE_DEBOUNCE_MS);
  }

  /**
   * Records a Linh Thạch drop in the ledger. The key is made once per kill and reused on every retry, so a retry
   * after a timeout cannot pay twice. The write is synchronous with the kill's own queue slot (never held in memory
   * only, TECHNICAL section 3), but off the tick's critical path. A drop still failing after the retries is lost, never doubled.
   */
  private enqueueDrop(characterId: string, amount: number): void {
    const key = `drop:${crypto.randomUUID()}`;
    this.dropQueue = this.dropQueue.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await applyCurrencyDelta(this.env.DB, {
            characterId,
            currency: "linh_thach",
            delta: amount,
            reason: "monster_drop",
            actor: "system",
            idempotencyKey: key,
          });
          if (r.status === "applied") {
            for (const ws of this.ctx.getWebSockets()) {
              const s = ws.deserializeAttachment() as PlayerState | null;
              if (s?.id === characterId && !s.transferring) this.send(ws, { t: "wallet", currency: "linh_thach", balance: r.balance, gained: amount });
            }
          }
          return;
        } catch (err) {
          console.error("drop write failed", characterId, attempt, err);
          await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
        }
      }
    });
  }

  /** Runs a bag change after the earlier ones of the same character. Errors are logged and the cached bag is dropped (reloaded next time). */
  private bagTask(id: string, fn: () => Promise<void>): Promise<void> {
    const next = (this.bagQueues.get(id) ?? Promise.resolve()).then(fn).catch((err) => {
      console.error("bag task failed", id, err);
      this.bags.delete(id);
    });
    this.bagQueues.set(id, next);
    void next.then(() => {
      if (this.bagQueues.get(id) === next) this.bagQueues.delete(id);
    });
    return next;
  }

  /** Waits for the character's pending bag writes and forgets the cached bag. Called before the lock is released. */
  private async settleBag(id: string): Promise<void> {
    await (this.bagQueues.get(id) ?? Promise.resolve());
    await this.flushSkills(id); // the mastery of its skills is written before the lock is released too
    await this.flushQuests(id); // and so is the progress of its quests (kills counted in this room)
    await this.flushRefine(id); // the artifact's EXP is written before the lock is released
    this.bags.delete(id);
    this.skillRows.delete(id);
    this.skillDirty.delete(id);
    this.questRows.delete(id);
    this.questDirty.delete(id);
    this.hotbars.delete(id);
    this.vitalKeys.delete(id);
  }

  /**
   * The pháp bảo bản mệnh worn by a character gets the kill's EXP in its own stream. The EXP lives in the cached bag and
   * is written with the next save (a level-up writes at once), so a kill costs no D1 write. The artifact never passes the
   * owner's level; at the cap its EXP stops at the amount a level needs.
   */
  private async addRefineExp(characterId: string, gain: number, now: number): Promise<void> {
    const profile = this.sim?.getPlayer(characterId);
    const bag = this.bags.get(characterId);
    const piece = bag?.equipped.find((e) => e.slot === "bonded");
    const info = piece ? equipmentInfo(piece.type) : undefined;
    if (!profile || !bag || !piece || !info || (piece.dur !== undefined && piece.dur <= 0)) return;
    const level = refineLevelOf(info, piece.lv);
    const r = applyRefineExp(level, piece.xp ?? 0, gain, levelIndex(profile.realm, profile.stage));
    if (r.lv === piece.lv && r.xp === piece.xp) return;
    piece.lv = r.lv;
    piece.xp = r.xp;
    this.refineDirty.add(characterId);
    if (r.levelsGained > 0) {
      await this.flushRefine(characterId);
      this.applyGear(characterId, bag);
    } else {
      await this.ensureSaveAlarm(now);
    }
  }

  /** Writes the unsaved pháp bảo bản mệnh progress of a character (if any) and tells the client the new values. */
  private async flushRefine(characterId: string): Promise<void> {
    if (!this.refineDirty.delete(characterId)) return;
    const piece = this.bags.get(characterId)?.equipped.find((e) => e.slot === "bonded");
    if (!piece || piece.lv === undefined) return;
    try {
      await saveRefine(this.env.DB, characterId, piece.id, piece.lv, piece.xp ?? 0);
      const bag = this.bags.get(characterId);
      if (bag) this.sendToCharacter(characterId, { t: "eq", items: bag.equipped });
    } catch (err) {
      console.error("refine save failed", characterId, err);
      this.refineDirty.add(characterId);
    }
  }

  private async getBag(id: string): Promise<BagState> {
    let bag = this.bags.get(id);
    if (!bag) {
      bag = await loadBag(this.env.DB, id);
      this.bags.set(id, bag);
    }
    return bag;
  }

  /**
   * Plans against the cached bag and writes the plan as one batch. If D1 says the plan is stale (the bag changed under
   * the cache) the bag is reloaded and planned again, up to three times, always with the same grant key. The cache is
   * only updated after the commit, so it never claims items that were not written.
   */
  private async mutateBag(
    id: string,
    plan: (bag: BagState) => { ops: BagOp[]; mail?: MailItem[]; extra?: D1PreparedStatement[] } | null,
    grantKey?: string,
  ): Promise<{ ok: true; before: BagState; after: BagState; mailed: MailItem[] } | { ok: false; reason: "invalid" | "failed" | "duplicate" }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.getBag(id);
      const p = plan(before);
      if (!p) return { ok: false, reason: "invalid" };
      const r = await commitBagOps(this.env.DB, id, p.ops, { grantKey, mail: p.mail, extra: p.extra });
      if (r === "ok") {
        const next = applyBag({ items: before.items, equipped: before.equipped }, p.ops);
        const after: BagState = { tabs: before.tabs, items: next.items, equipped: next.equipped };
        this.bags.set(id, after);
        return { ok: true, before, after, mailed: p.mail ?? [] };
      }
      this.bags.delete(id); // stale (or a repeated key): resync from D1
      if (r === "duplicate") return { ok: false, reason: "duplicate" };
    }
    return { ok: false, reason: "failed" };
  }

  /** `direct` is for a character who is leaving (death): its socket is already marked as transferring, so it is addressed itself. */
  private sendToCharacter(id: string, msg: ServerMessage, direct?: WebSocket): void {
    if (direct) return this.send(direct, msg);
    for (const ws of this.ctx.getWebSockets()) {
      const s = ws.deserializeAttachment() as PlayerState | null;
      if (s?.id === id && !s.transferring) this.send(ws, msg);
    }
  }

  private sendBagDelta(id: string, before: BagState, after: BagState, direct?: WebSocket): void {
    const d = diffBag(before.items, after.items);
    if (d.items.length > 0 || d.removed.length > 0) this.sendToCharacter(id, { t: "inv", full: false, tabs: after.tabs, items: d.items, removed: d.removed }, direct);
    if (JSON.stringify(before.equipped) !== JSON.stringify(after.equipped)) {
      this.sendToCharacter(id, { t: "eq", items: after.equipped }, direct);
      this.applyGear(id, after, direct);
    }
  }

  /** Worn gear changed (or wore down): the combat stats follow, in a combat map. In town the next join recomputes them. */
  private applyGear(id: string, bag: BagState, direct?: WebSocket): void {
    const p = this.sim?.getPlayer(id);
    if (!p || !this.sim) {
      // In town there is no profile, but the skills that pháp bảo grant still follow what is worn.
      void (async () => {
        const who = await this.casterOf(id);
        if (who) this.sendToCharacter(id, { t: "skills", ids: availableSkills(who.granted, who.gear) }, direct);
      })().catch((err) => console.error("skills refresh failed", id, err));
      return;
    }
    const before = this.sim.skillsOf(p).join(",");
    this.sim.updateGear(id, equipmentBonus(bag.equipped, { gender: p.gender, realm: p.realm, stage: p.stage, base: p.base, affinity: p.affinity }), weaponFamily(bag.equipped), gearSkillInfo(bag.equipped));
    this.sendToCharacter(id, { t: "hp", hp: p.hp, maxHp: p.maxHp }, direct);
    // Pháp bảo grant skills while worn: the list changes when one is put on, taken off or breaks.
    const skills = this.sim.skillsOf(p);
    if (skills.join(",") !== before) this.sendToCharacter(id, { t: "skills", ids: skills }, direct);
  }

  /** Who is wearing: the live profile when there is one, otherwise the saved row. */
  private async wearerOf(id: string): Promise<WearerCtx | null> {
    const p = this.sim?.getPlayer(id);
    if (p) return { gender: p.gender, realm: p.realm, stage: p.stage, base: p.base };
    const row = await getCharacterById(this.env.DB, id);
    return row ? wearerOfRow(row) : null;
  }

  /** Reports pieces that came off on their own, and refreshes the mail list when some went there. */
  private async announceRemoved(id: string, removed: Array<{ item: { type: string }; reason: EquipBlock; mailed: boolean }>, direct?: WebSocket): Promise<void> {
    if (removed.length === 0) return;
    this.sendToCharacter(id, { t: "eq_removed", items: removed.map((r) => ({ type: r.item.type, reason: r.reason, mailed: r.mailed })) }, direct);
    if (removed.some((r) => r.mailed)) await this.sendMailList(id, direct);
  }

  /** At join: takes off worn pieces that are broken or no longer fit the character (bag first, permanent mail when full). */
  private async reconcileGear(row: CharacterRow): Promise<ReturnType<typeof planReconcile>["removed"]> {
    const bag = await this.getBag(row.id);
    if (bag.equipped.length === 0) return [];
    const w = wearerOfRow(row);
    const preview = planReconcile({ items: bag.items, equipped: bag.equipped }, bag.tabs, w, () => crypto.randomUUID());
    if (preview.ops.length === 0) return [];
    let removed: typeof preview.removed = [];
    const res = await this.mutateBag(row.id, (b) => {
      const r = planReconcile({ items: b.items, equipped: b.equipped }, b.tabs, w, () => crypto.randomUUID());
      removed = r.removed;
      return r.ops.length > 0 ? { ops: r.ops } : null;
    });
    return res.ok ? removed : [];
  }

  private async sendMailList(id: string, direct?: WebSocket): Promise<void> {
    this.sendToCharacter(id, { t: "mail", mail: mailViews(await listMail(this.env.DB, id)) }, direct);
  }

  /**
   * Puts the items of one kill into the bag; what does not fit goes to the mailbox (claim within 30 minutes). One loot
   * key and one batch per kill, so a retry never creates the items twice.
   */
  private enqueueLoot(characterId: string, drops: LootDrop[]): void {
    const key = `loot:${crypto.randomUUID()}`;
    void this.bagTask(characterId, async () => {
      const plan = (bag: BagState) => {
        let items = bag.items;
        const ops: BagOp[] = [];
        const mail: MailItem[] = [];
        for (const d of drops) {
          const wear = d.dur !== undefined && d.max !== undefined ? { dur: d.dur, max: d.max } : undefined;
          const p = planAdd(items, bag.tabs, d.item, d.qty, () => crypto.randomUUID(), wear);
          if (p) {
            ops.push(...p);
            items = applyBag({ items, equipped: [] }, p).items;
          } else {
            mail.push({ type: d.item, qty: d.qty, subject: "bag_full", ...(wear ?? {}) });
          }
        }
        return { ops, mail };
      };
      // A thrown D1 error is retried with the SAME key, like the Linh Thạch drop: if an attempt did commit but its answer
      // was lost, the retry sees "duplicate" and the bag is resynced instead of the loot being created twice.
      let res: Awaited<ReturnType<MapRoom["mutateBag"]>> | null = null;
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        try {
          res = await this.mutateBag(characterId, plan, key);
        } catch (err) {
          console.error("loot write failed", characterId, attempt, err);
          this.bags.delete(characterId);
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
      if (!res) return;
      if (!res.ok) {
        if (res.reason === "duplicate") {
          // An earlier attempt did commit: send the real bag and mail instead of a delta.
          const bag = await this.getBag(characterId);
          this.sendToCharacter(characterId, { t: "inv", full: true, tabs: bag.tabs, items: bag.items, removed: [] });
          await this.sendMailList(characterId);
        }
        return;
      }
      this.sendBagDelta(characterId, res.before, res.after);
      const mailedTypes = new Set(res.mailed.map((m) => m.type + ":" + m.qty));
      this.sendToCharacter(characterId, {
        t: "loot",
        items: drops.map((d) => ({ type: d.item, qty: d.qty, mailed: mailedTypes.has(d.item + ":" + d.qty) })),
      });
      if (res.mailed.length > 0) await this.sendMailList(characterId);
    });
  }

  private handleInventory(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "inv_use" | "inv_drop" | "inv_move" | "inv_sort" | "inv_split" | "inv_expand" | "mail_claim" }>): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "inv_error", reason: "rate" });
    if (msg.t === "inv_sort") {
      const times = checkChatRate(state.sortTimes ?? [], now, { burst: SORT_BURST, windowMs: SORT_WINDOW_MS, minGapMs: SORT_MIN_GAP_MS });
      if (!times) {
        // Tell the client how long the button must stay locked, so it can count down instead of asking again.
        const retryMs = retryAfterMs(state.sortTimes ?? [], now, { burst: SORT_BURST, windowMs: SORT_WINDOW_MS, minGapMs: SORT_MIN_GAP_MS });
        return this.send(ws, { t: "inv_error", reason: "wait", retryMs });
      }
      state.sortTimes = times;
    }
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      if (msg.t === "mail_claim") return this.claimMail(ws, id, msg.id);
      if (msg.t === "inv_expand") return this.buyBagTab(ws, id, msg.price);
      if (msg.t === "inv_move") {
        const res = await this.mutateBag(id, (bag) => {
          const ops = planMove(bag.items, bag.tabs, msg.from, msg.to);
          return ops ? { ops } : null;
        });
        if (!res.ok) return this.resync(ws, id, res.reason === "invalid" ? "invalid" : "busy");
        return this.sendBagDelta(id, res.before, res.after);
      }
      if (msg.t === "inv_sort") {
        const res = await this.mutateBag(id, (bag) => {
          const ops = planSort(bag.items, bag.tabs, msg.mode);
          return ops ? { ops } : null; // null: already in order, nothing to write
        });
        if (res.ok) return this.sendBagDelta(id, res.before, res.after);
        if (res.reason === "invalid") return; // nothing to change
        return this.resync(ws, id, "busy");
      }
      if (msg.t === "inv_split") {
        const res = await this.mutateBag(id, (bag) => {
          const ops = planSplit(bag.items, bag.tabs, { tab: msg.tab, cell: msg.cell }, msg.qty, () => crypto.randomUUID());
          return ops ? { ops } : null;
        });
        if (res.ok) return this.sendBagDelta(id, res.before, res.after);
        if (res.reason === "invalid") {
          const bag = await this.getBag(id);
          return this.resync(ws, id, firstFreeCell(bag.items, bag.tabs) ? "invalid" : "no_room");
        }
        return this.resync(ws, id, "busy");
      }
      if (msg.t === "inv_drop") {
        const res = await this.mutateBag(id, (bag) => {
          const ops = planRemove(bag.items, bag.tabs, { tab: msg.tab, cell: msg.cell }, msg.qty);
          return ops ? { ops } : null;
        });
        if (!res.ok) return this.resync(ws, id, res.reason === "invalid" ? "invalid" : "busy");
        return this.sendBagDelta(id, res.before, res.after);
      }
      return this.usePotion(ws, id, msg.tab, msg.cell);
    });
  }

  /**
   * Buys the next bag tab. The price is read from the game settings; the payment and the new tab commit in one batch
   * (applyCurrencyDelta with the tab statements as `extra`), so Linh Thạch is never taken without the tab or the reverse.
   */
  private async buyBagTab(ws: WebSocket, id: string, shownPrice: number): Promise<void> {
    const bag = await this.getBag(id);
    if (bag.tabs >= MAX_BAG_TABS) return this.resync(ws, id, "max_tabs");
    const price = await getSetting(this.env.DB, "bag_tab_price");
    // The player confirmed the price on their screen; if an admin changed it since, charge nothing and show the new one.
    if (price !== shownPrice) return this.resync(ws, id, "price_changed");
    try {
      const extra = addBagTabStatements(this.env.DB, id, bag.tabs);
      if (price === 0) {
        // A free tab: the ledger refuses a zero entry, so only the guarded tab statements run.
        await this.env.DB.batch(extra);
        const free: BagState = { ...bag, tabs: bag.tabs + 1 };
        this.bags.set(id, free);
        this.sendToCharacter(id, { t: "inv", full: true, tabs: free.tabs, items: free.items, removed: [], tabPrice: price });
        return;
      }
      const r = await applyCurrencyDelta(
        this.env.DB,
        { characterId: id, currency: "linh_thach", delta: -price, reason: "bag_tab", actor: "system", idempotencyKey: `bagtab:${crypto.randomUUID()}` },
        extra,
      );
      if (r.status === "insufficient") return this.send(ws, { t: "inv_error", reason: "funds" });
      if (r.status !== "applied") return this.resync(ws, id, "busy");
      const after: BagState = { ...bag, tabs: bag.tabs + 1 };
      this.bags.set(id, after);
      this.sendToCharacter(id, { t: "inv", full: true, tabs: after.tabs, items: after.items, removed: [], tabPrice: price });
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance });
    } catch (err) {
      // A failed guard means the cached tab count was stale (nothing was charged): reload and let the player look again.
      if (!String(err).includes("inv_guard")) console.error("bag tab purchase failed", id, err);
      this.bags.delete(id);
      return this.resync(ws, id, "busy");
    }
  }

  /** Progress of a character's quests, from the room's copy or (after a sleep, or the first time) from D1. Never replaced by an empty copy. */
  private async getQuestRows(id: string): Promise<Record<string, QuestProgressView>> {
    let rows = this.questRows.get(id);
    if (!rows) {
      rows = await loadQuestProgress(this.env.DB, id);
      this.questRows.set(id, rows);
    }
    return rows;
  }

  /** Writes the quest progress changed since the last write (absolute values). A failed write keeps the quests dirty. */
  private async flushQuests(id: string): Promise<void> {
    const dirty = this.questDirty.get(id);
    if (!dirty || dirty.size === 0) return;
    const rows = this.questRows.get(id) ?? {};
    const list = [...dirty].filter((q) => rows[q]?.state === "active").map((q) => ({ id: q, progress: rows[q]!.progress }));
    this.questDirty.delete(id);
    try {
      await saveQuestProgress(this.env.DB, id, list);
    } catch (err) {
      console.error("quest progress save failed", id, err);
      const again = this.questDirty.get(id) ?? new Set<string>();
      for (const q of list) again.add(q.id);
      this.questDirty.set(id, again);
    }
  }

  /** A kill the character gets credit for: every active quest it counts for gains one (up to its target). Written with the next save. */
  private async noteKill(id: string, mapId: string, rare: boolean): Promise<void> {
    const [defs, rows] = await Promise.all([getQuestCatalog(this.env.DB), this.getQuestRows(id)]);
    let touched = false;
    for (const def of defs) {
      const mine = rows[def.id];
      if (!mine || mine.state !== "active" || !killCounts(def.objective, mapId, rare) || mine.progress >= objectiveTarget(def.objective)) continue;
      mine.progress += 1;
      const dirty = this.questDirty.get(id) ?? new Set<string>();
      dirty.add(def.id);
      this.questDirty.set(id, dirty);
      this.sendToCharacter(id, { t: "quest_progress", quest: def.id, progress: mine.progress });
      touched = true;
    }
    if (touched) await this.ensureSaveAlarm(Date.now());
  }

  /** Opening an NPC completes the talk objective of an active quest that names it. Written at once (the town room may sleep right after). */
  private async noteTalk(id: string, npcId: string): Promise<void> {
    const [defs, rows] = await Promise.all([getQuestCatalog(this.env.DB), this.getQuestRows(id)]);
    const done: string[] = [];
    for (const def of defs) {
      const mine = rows[def.id];
      if (mine?.state === "active" && def.objective.kind === "talk" && def.objective.npc === npcId && mine.progress < 1) {
        mine.progress = 1;
        done.push(def.id);
      }
    }
    if (done.length === 0) return;
    await saveQuestProgress(this.env.DB, id, done.map((q) => ({ id: q, progress: 1 })));
    for (const q of done) this.sendToCharacter(id, { t: "quest_progress", quest: q, progress: 1 });
  }

  /** What an NPC offers: its quests (enabled ones, plus any the character is already on) and the character's progress. */
  private async sendQuests(ws: WebSocket, id: string, npcId: string): Promise<void> {
    const [defs, rows] = await Promise.all([getQuestCatalog(this.env.DB), this.getQuestRows(id)]);
    const row = await getCharacterById(this.env.DB, id);
    const p = parsePaths(row?.paths);
    const owned = new Set<string>([...(p.main ? [p.main] : []), ...p.subs]);
    const realm = this.sim?.getPlayer(id)?.realm ?? row?.realm ?? 0;
    // Only what can be taken or is being done: no finished quests, no locked ones, no path quest for a path the character already has,
    // and no path quest below the realm it needs (the NPC then says which realm that is).
    let need: number | undefined;
    const offered = (d: QuestDef) => {
      const status = questStatus(d, rows);
      if (status === "active") return true;
      if (status !== "available" || !d.enabled || (d.path && owned.has(d.path))) return false;
      if (d.path && d.minRealm !== undefined && realm < d.minRealm) {
        need = Math.max(need ?? 0, d.minRealm);
        return false;
      }
      return true;
    };
    const mine = defs.filter((d) => d.giver === npcId && offered(d));
    // Quests already taken come first in the order they were taken, then the ones that can be taken in catalogue order.
    mine.sort((a, b) => (rows[a.id] ? 0 : 1) - (rows[b.id] ? 0 : 1) || (rows[a.id]?.at ?? 0) - (rows[b.id]?.at ?? 0) || Number(a.chain === "daily") - Number(b.chain === "daily"));
    this.send(ws, { t: "quests", npc: npcId, defs: mine, states: rows, ...(need !== undefined && mine.length === 0 ? { need } : {}) });
  }

  /** Every quest the character has taken (active and done), for the quest window and the tracker. */
  private async sendQuestActive(id: string): Promise<void> {
    const [defs, rows] = await Promise.all([getQuestCatalog(this.env.DB), this.getQuestRows(id)]);
    const taken = defs.filter((d) => rows[d.id]);
    this.sendToCharacter(id, { t: "quest_active", defs: taken, states: Object.fromEntries(taken.map((d) => [d.id, rows[d.id]!])) });
  }

  /** The hướng tu the character has now (chủ tu and phụ tu). */
  private async ownedPaths(id: string): Promise<Set<string>> {
    const row = await getCharacterById(this.env.DB, id);
    const p = parsePaths(row?.paths);
    return new Set<string>([...(p.main ? [p.main] : []), ...p.subs]);
  }

  /** Gives up an active quest (from anywhere): the row goes and the quest is as if never taken. Finished quests are never touched. */
  private handleQuestAbandon(ws: WebSocket, state: PlayerState, questId: string): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "quest_error", reason: "rate" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const rows = await this.getQuestRows(id);
      if (rows[questId]?.state !== "active") return this.send(ws, { t: "quest_error", reason: "not_active" });
      try {
        await abandonQuest(this.env.DB, id, questId);
      } catch (err) {
        console.error("quest abandon failed", id, err);
        this.questRows.delete(id);
        return this.send(ws, { t: "quest_error", reason: "busy" });
      }
      delete rows[questId];
      this.questDirty.get(id)?.delete(questId);
      await this.sendQuestActive(id);
    });
  }

  /** Accept and hand in quests. Same queue and rate limit as the bag commands, and the giver must be within reach. */
  private handleQuest(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "quest_accept" | "quest_turn_in" }>): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "quest_error", reason: "rate" });
    const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
    const spot = npcNear(getMap(state.mapId), msg.npc, here.x, here.y);
    if (!spot || spot.kind !== "quest") return this.send(ws, { t: "quest_error", reason: "far" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const defs = await getQuestCatalog(this.env.DB);
      const def = defs.find((d) => d.id === msg.quest && d.giver === msg.npc);
      if (!def) return this.send(ws, { t: "quest_error", reason: "invalid" });
      if (msg.t === "quest_accept") return this.questAccept(ws, id, def);
      return this.questTurnIn(ws, id, def);
    });
  }

  private async questAccept(ws: WebSocket, id: string, def: QuestDef): Promise<void> {
    const rows = await this.getQuestRows(id);
    const now = Date.now();
    // A daily quest finished on an earlier day is open again (questStatus knows); anything else the character has is "already".
    if (rows[def.id] && questStatus(def, rows, now) !== "available") return this.send(ws, { t: "quest_error", reason: "already" });
    if (!def.enabled) return this.send(ws, { t: "quest_error", reason: "invalid" });
    if (questStatus(def, rows) === "locked") return this.send(ws, { t: "quest_error", reason: "locked" });
    if (def.minRealm !== undefined) {
      const realm = this.sim?.getPlayer(id)?.realm ?? (await getCharacterById(this.env.DB, id))?.realm ?? 0;
      if (realm < def.minRealm) return this.send(ws, { t: "quest_error", reason: "level" });
    }
    // A path item that was already given (the old claim button) blocks the path quest: say so now, not after the materials were gathered.
    if (def.path && (await this.ownedPaths(id)).has(def.path)) return this.send(ws, { t: "quest_error", reason: "owned" });
    if (givesPathItem(def) && def.path && (await pathItemGiven(this.env.DB, id, def.path))) return this.send(ws, { t: "quest_error", reason: "claimed" });
    try {
      await acceptQuest(this.env.DB, id, def.id, now, def.repeat === "daily");
    } catch (err) {
      // The primary key says it was taken meanwhile (another socket, a retry): reload and show what is there.
      if (!String(err).includes("character_quests")) console.error("quest accept failed", id, err);
      this.questRows.delete(id);
      return this.send(ws, { t: "quest_error", reason: String(err).includes("character_quests") ? "already" : "busy" });
    }
    rows[def.id] = { state: "active", progress: 0, at: now };
    await this.sendQuests(ws, id, def.giver);
    await this.sendQuestActive(id);
  }

  /**
   * Hands a quest in. The objective is checked against the room's copy and D1 (progress is flushed first), then the reward
   * and the closing of the quest commit in ONE batch (commitTurnIn): a repeat finds the grant key spent and changes nothing.
   */
  private async questTurnIn(ws: WebSocket, id: string, def: QuestDef): Promise<void> {
    const rows = await this.getQuestRows(id);
    const mine = rows[def.id];
    if (!mine || mine.state !== "active") return this.send(ws, { t: "quest_error", reason: "not_active" });
    await this.flushQuests(id);
    const row = await getCharacterById(this.env.DB, id);
    if (!row) return;
    const o = def.objective;
    if ((o.kind === "kill" || o.kind === "talk") && mine.progress < objectiveTarget(o)) return this.send(ws, { t: "quest_error", reason: "not_ready" });
    if (o.kind === "reach" && (row.realm < o.realm || (row.realm === o.realm && row.stage < o.stage))) return this.send(ws, { t: "quest_error", reason: "not_ready" });
    // A path item that was already given (the claim button, or a path quest not reopened) must not be given twice: refuse before taking any materials.
    if (givesPathItem(def) && def.path && (await pathItemGiven(this.env.DB, id, def.path))) return this.send(ws, { t: "quest_error", reason: "claimed" });
    const bag = await this.getBag(id);
    const plan = planTurnIn(def, { items: bag.items, equipped: bag.equipped }, bag.tabs, row, () => crypto.randomUUID());
    if (!plan.ok) return this.send(ws, { t: "quest_error", reason: plan.reason });
    try {
      const r = await commitTurnIn(this.env.DB, id, def, plan, o.kind === "kill" || o.kind === "talk", Date.now());
      if (r.status === "duplicate") {
        this.questRows.delete(id);
        return this.send(ws, { t: "quest_error", reason: "already" });
      }
      if (r.status === "stale") {
        this.bags.delete(id);
        this.questRows.delete(id);
        return this.send(ws, { t: "quest_error", reason: "busy" });
      }
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, plan.ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      if (r.balance !== null) this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance, gained: def.rewards.linhThach });
      if (r.congHien !== null) this.sendToCharacter(id, { t: "wallet", currency: "cong_hien", balance: r.congHien, gained: def.rewards.congHien });
      if (plan.exp) this.sendToCharacter(id, { t: "stats", character: toCharacterSheet({ ...row, stage: plan.exp.to.stage, exp: plan.exp.to.exp, potential_points: row.potential_points + plan.exp.to.points }) });
      rows[def.id] = { state: "done", progress: mine.progress, at: mine.at, done: Date.now() };
      this.sendToCharacter(id, { t: "quest_done", quest: def.id });
      await this.sendQuests(ws, id, def.giver);
      await this.sendQuestActive(id);
    } catch (err) {
      console.error("quest turn-in failed", id, def.id, err);
      this.bags.delete(id);
      this.questRows.delete(id);
      this.send(ws, { t: "quest_error", reason: "busy" });
    }
  }

  /**
   * The merchant: open the shop, buy, sell. Each trade is ONE D1 batch (the Linh Thạch entry plus the bag cells, and for a
   * limited offer the daily counter), so money and goods never part ways. Same queue and rate limit as the other bag commands.
   */
  private handleShop(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "npc_open" | "shop_buy" | "shop_sell" | "shop_sell_many" }>): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "inv_error", reason: "rate" });
    const npcId = msg.npc;
    const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
    const spot = npcNear(getMap(state.mapId), npcId, here.x, here.y);
    if (!spot) return this.send(ws, { t: "inv_error", reason: "far" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      if (msg.t === "npc_open") {
        // Opening any NPC counts as talking to it (a talk quest may be waiting for that).
        await this.noteTalk(id, npcId).catch((err) => console.error("quest talk failed", id, err));
        if (spot.kind === "quest") return this.sendQuests(ws, id, npcId);
      }
      if (spot.kind !== "merchant") return;
      const wearer = await this.wearerOf(id);
      if (!wearer) return;
      const sendStock = async () => this.send(ws, { t: "shop", npc: npcId, left: stockLeft(wearer.gender, state.mapId, await getPurchased(this.env.DB, id, Date.now())) });
      if (msg.t === "npc_open") return sendStock();
      if (msg.t === "shop_buy") return this.shopBuy(ws, id, wearer.gender, state.mapId, msg.offer, msg.qty, sendStock);
      if (msg.t === "shop_sell_many") return this.shopSellMany(ws, id, msg.cells);
      return this.shopSell(ws, id, msg.tab, msg.cell, msg.qty);
    });
  }

  private async shopBuy(ws: WebSocket, id: string, gender: Gender, mapId: string, offerId: string, qty: number, sendStock: () => Promise<void>): Promise<void> {
    const offer = findOffer(gender, mapId, offerId);
    const def = offer ? getItemDef(offer.item) : undefined;
    if (!offer || !def || (def.maxStack === 1 && qty !== 1)) return this.send(ws, { t: "inv_error", reason: "invalid" });
    const now = Date.now();
    if (offer.dailyLimit !== undefined) {
      const bought = (await getPurchased(this.env.DB, id, now))[offer.id] ?? 0;
      if (bought + qty > offer.dailyLimit) {
        this.send(ws, { t: "inv_error", reason: "sold_out" });
        return sendStock();
      }
    }
    const bag = await this.getBag(id);
    const max = equipmentInfo(offer.item)?.maxDurability;
    const ops = planAdd(bag.items, bag.tabs, offer.item, qty, () => crypto.randomUUID(), max != null ? { dur: max, max } : undefined);
    if (!ops) return this.resync(ws, id, "full");
    const total = offer.price * qty;
    const extra = [
      ...ops.flatMap((op) => opStatements(this.env.DB, id, op, now)),
      ...(offer.dailyLimit !== undefined ? limitStatements(this.env.DB, id, offer.id, qty, offer.dailyLimit, now) : []),
    ];
    try {
      const r = await applyCurrencyDelta(this.env.DB, { characterId: id, currency: "linh_thach", delta: -total, reason: "shop_buy", actor: "system", idempotencyKey: `shop:${crypto.randomUUID()}` }, extra);
      if (r.status === "insufficient") return this.send(ws, { t: "inv_error", reason: "funds" });
      if (r.status !== "applied") return this.resync(ws, id, "busy");
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance });
      this.sendToCharacter(id, { t: "shop_ok", op: "buy", item: offer.item, qty, total });
      await sendStock();
    } catch (err) {
      // A failed guard means the cached bag (or the day's counter) was stale: nothing was charged, look again.
      if (!/inv_guard|idx_items_|item_instances\./.test(String(err))) console.error("shop purchase failed", id, err);
      this.bags.delete(id);
      await sendStock();
      return this.resync(ws, id, "busy");
    }
  }

  private async shopSell(ws: WebSocket, id: string, tab: number, cell: number, qty: number): Promise<void> {
    const bag = await this.getBag(id);
    const item = bag.items.find((i) => i.tab === tab && i.cell === cell);
    if (!item) return this.resync(ws, id, "invalid");
    const unit = sellPrice(item.type, item.dur, item.max);
    if (unit <= 0) return this.send(ws, { t: "inv_error", reason: "unsellable" });
    const ops = planRemove(bag.items, bag.tabs, { tab, cell }, qty);
    if (!ops) return this.resync(ws, id, "invalid");
    const total = unit * qty;
    const extra = ops.flatMap((op) => opStatements(this.env.DB, id, op, Date.now()));
    try {
      const r = await applyCurrencyDelta(this.env.DB, { characterId: id, currency: "linh_thach", delta: total, reason: "shop_sell", actor: "system", idempotencyKey: `shop:${crypto.randomUUID()}` }, extra);
      if (r.status !== "applied") return this.resync(ws, id, "busy");
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance, gained: total });
      this.sendToCharacter(id, { t: "shop_ok", op: "sell", item: item.type, qty, total });
    } catch (err) {
      // The guard on the stack failed (the cache was stale): nothing was paid out.
      if (!/inv_guard|idx_items_|item_instances\./.test(String(err))) console.error("shop sale failed", id, err);
      this.bags.delete(id);
      return this.resync(ws, id, "busy");
    }
  }

  /** Sells whole stacks from several cells in ONE batch: one credit, every removal guarded. Anything wrong with any cell refuses them all. */
  private async shopSellMany(ws: WebSocket, id: string, cells: Array<{ tab: number; cell: number }>): Promise<void> {
    const bag = await this.getBag(id);
    let total = 0;
    const ops: BagOp[] = [];
    for (const pos of cells) {
      const item = bag.items.find((i) => i.tab === pos.tab && i.cell === pos.cell);
      if (!item) return this.resync(ws, id, "invalid");
      const unit = sellPrice(item.type, item.dur, item.max);
      if (unit <= 0) return this.send(ws, { t: "inv_error", reason: "unsellable" });
      const one = planRemove(bag.items, bag.tabs, pos);
      if (!one) return this.resync(ws, id, "invalid");
      ops.push(...one);
      total += unit * item.qty;
    }
    const extra = ops.flatMap((op) => opStatements(this.env.DB, id, op, Date.now()));
    try {
      const r = await applyCurrencyDelta(this.env.DB, { characterId: id, currency: "linh_thach", delta: total, reason: "shop_sell", actor: "system", idempotencyKey: `shop:${crypto.randomUUID()}` }, extra);
      if (r.status !== "applied") return this.resync(ws, id, "busy");
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance, gained: total });
      this.sendToCharacter(id, { t: "shop_sold", count: cells.length, total });
    } catch (err) {
      if (!/inv_guard|idx_items_|item_instances\./.test(String(err))) console.error("shop bulk sale failed", id, err);
      this.bags.delete(id);
      return this.resync(ws, id, "busy");
    }
  }

  /** After a refused command the client's picture may be wrong: tell it why and send the real bag. */
  private async resync(ws: WebSocket, id: string, reason: Extract<ServerMessage, { t: "inv_error" }>["reason"]): Promise<void> {
    this.send(ws, { t: "inv_error", reason });
    const bag = await this.getBag(id);
    this.send(ws, { t: "inv", full: true, tabs: bag.tabs, items: bag.items, removed: [], tabPrice: await getSetting(this.env.DB, "bag_tab_price") });
    this.send(ws, { t: "eq", items: bag.equipped });
  }

  /** Wear, take off and repair gear. One D1 batch each, rate-limited like the other bag commands. */
  private handleEquipment(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "eq_equip" | "eq_unequip" | "eq_repair" }>): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "inv_error", reason: "rate" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      if (msg.t === "eq_repair") return this.repairGear(ws, id, msg.slot);
      const wearer = await this.wearerOf(id);
      if (!wearer) return;
      let refusal: "invalid" | EquipBlock | "full" | "nothing" | null = null;
      const res = await this.mutateBag(id, (bag) => {
        const state = { items: bag.items, equipped: bag.equipped };
        const plan =
          msg.t === "eq_equip" ? planEquip(state, bag.tabs, { tab: msg.tab, cell: msg.cell }, msg.slot, wearer) : planUnequip(state, bag.tabs, msg.slot);
        if (!plan.ok) {
          refusal = plan.error;
          return null;
        }
        return { ops: plan.ops };
      });
      if (res.ok) return this.sendBagDelta(id, res.before, res.after);
      if (res.reason === "invalid") return this.resync(ws, id, refusal ?? "invalid");
      return this.resync(ws, id, "busy");
    });
  }

  /**
   * Repairs worn pieces. Paid in the same batch that restores the durability: the debit (ledger + balance) and the guarded
   * durability writes commit together or not at all, so Linh Thạch is never taken without the repair or the other way round.
   */
  private async repairGear(ws: WebSocket, id: string, slot: EquipSlot | "all"): Promise<void> {
    const bag = await this.getBag(id);
    const plan = planRepair({ items: bag.items, equipped: bag.equipped }, slot);
    if (!plan.ok) return this.resync(ws, id, plan.error);
    const extra = plan.ops.flatMap((op) => opStatements(this.env.DB, id, op, Date.now()));
    try {
      const r = await applyCurrencyDelta(this.env.DB, { characterId: id, currency: "linh_thach", delta: -plan.cost, reason: "repair", actor: "system", idempotencyKey: `repair:${crypto.randomUUID()}` }, extra);
      if (r.status === "insufficient") return this.send(ws, { t: "inv_error", reason: "funds" });
      if (r.status !== "applied") return this.resync(ws, id, "busy");
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, plan.ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance });
      this.sendToCharacter(id, { t: "repaired", cost: plan.cost });
    } catch (err) {
      // A failed guard means the cached gear was stale: nothing was written, so reload and let the player retry.
      if (!String(err).includes("inv_guard") && !String(err).includes("max_durability")) console.error("repair failed", id, err);
      this.bags.delete(id);
      return this.resync(ws, id, "busy");
    }
  }

  /**
   * The hotbar and the learned skills of a character, from the room's copy or (after the object slept, which loses every
   * in-memory copy) from D1. Like the bag, they are loaded lazily: a stale empty default here would wipe a saved hotbar.
   */
  private async getHotbar(id: string): Promise<string[]> {
    let bar = this.hotbars.get(id);
    if (!bar) {
      bar = parseHotbar((await getCharacterById(this.env.DB, id))?.hotbar);
      this.hotbars.set(id, bar);
    }
    return bar;
  }

  /** The skills a character was given, from the room's copy or (after a sleep) from D1, with any root skills still owed. */
  private async getSkillRows(id: string): Promise<SkillRow[]> {
    let rows = this.skillRows.get(id);
    if (!rows) {
      const realm = this.sim?.getPlayer(id)?.realm ?? (await getCharacterById(this.env.DB, id))?.realm ?? 0;
      rows = await ensureRootSkills(this.env.DB, id, realm, await loadSkillRows(this.env.DB, id));
      this.skillRows.set(id, rows);
    }
    return rows;
  }

  /** Writes the mastery changed since the last write (absolute values from the room's copy). A failed write keeps the skills dirty. */
  private async flushSkills(id: string): Promise<void> {
    const dirty = this.skillDirty.get(id);
    if (!dirty || dirty.size === 0) return;
    const rows = this.skillRows.get(id) ?? [];
    const list = rows.filter((r) => dirty.has(r.skill_id)).map((r) => ({ id: r.skill_id, lv: r.level, xp: r.mastery }));
    this.skillDirty.delete(id);
    try {
      await saveSkillMastery(this.env.DB, id, list);
    } catch (err) {
      console.error("skill mastery save failed", id, err);
      const again = this.skillDirty.get(id) ?? new Set<string>();
      for (const m of list) again.add(m.id);
      this.skillDirty.set(id, again);
    }
  }

  /** Mastery of one skill changed (a use, or a Ngộ Đạo Đan): the room's copy follows, the client is told, the write is queued. */
  private noteMastery(id: string, skill: string, lv: number, xp: number, up: boolean, now: number): Promise<void> {
    const row = this.skillRows.get(id)?.find((r) => r.skill_id === skill);
    if (!row) return Promise.resolve();
    row.level = lv;
    row.mastery = xp;
    const dirty = this.skillDirty.get(id) ?? new Set<string>();
    dirty.add(skill);
    this.skillDirty.set(id, dirty);
    this.sendToCharacter(id, { t: "skill_state", id: skill, lv, xp, ...(up ? { up: true } : {}) });
    // A new level is worth writing at once; plain points wait for the debounced save. A path skill reaching its top level may take its path up a level.
    return up ? this.flushSkills(id).then(() => this.checkPathLevelUp(id)) : this.ensureSaveAlarm(now);
  }

  /** Tells the client its MP (after a change of max MP the client's extrapolation would otherwise use the old maximum). */
  private sendMp(ws: WebSocket, profile: PlayerProfile, now: number): void {
    const e = this.sim?.mpEvent(profile, now);
    if (e?.t === "mp") this.send(ws, { t: "mp", mp: e.mp, maxMp: e.maxMp, regenInMs: e.regenInMs, perSec: MP_REGEN_PER_S });
  }

  /** Who is casting: the live profile in a combat map, otherwise the saved row. */
  private async casterOf(id: string): Promise<{ roots: CharacterRow["spiritual_root"][]; realm: number; stage: number; gear: string[]; granted: string[] } | null> {
    const gear = gearSkillIds((await this.getBag(id)).equipped);
    const granted = (await this.getSkillRows(id)).map((r) => r.skill_id);
    const p = this.sim?.getPlayer(id);
    if (p) return { roots: [...(p.roots ?? [p.element])], realm: p.realm, stage: p.stage, gear, granted };
    const row = await getCharacterById(this.env.DB, id);
    return row ? { roots: parseRoots(row.roots, row.spiritual_root), realm: row.realm, stage: row.stage, gear, granted } : null;
  }

  /** Uses a skill. Memory only: a cast costs no D1 write. Casting needs the fight simulation, so it only works in combat maps. */
  private async handleCast(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "cast" }>): Promise<void> {
    const now = Date.now();
    if (now - (state.lastCastAt ?? 0) < CAST_MIN_GAP_MS) return;
    state.lastCastAt = now;
    ws.serializeAttachment(state);
    if (getMap(state.mapId).safe) return void this.send(ws, { t: "cast_error", skill: msg.skill, reason: "town" });
    try {
      await this.wake(state.mapId);
    } catch (err) {
      console.error("wake failed", err);
      return;
    }
    if (state.bt) await this.interruptBreakthrough(state.id, "moved");
    if (state.tp) await this.interruptTalisman(state.id, "moved");
    const profile = this.sim?.getPlayer(state.id);
    if (!this.sim || !profile) return;
    if (profile.dead) return void this.send(ws, { t: "cast_error", skill: msg.skill, reason: "dead" });
    const dest: Vec2 | undefined = msg.x !== undefined && msg.y !== undefined ? [msg.x, msg.y] : undefined;
    const r = this.sim.queueCast(state.id, msg.skill, msg.target ?? null, now, dest, msg.el);
    if (!r.ok) this.send(ws, { t: "cast_error", skill: msg.skill, reason: r.reason });
  }

  /** Sets one hotbar slot. A skill must be one the character can use; a potion slot holds an item type (never an item id). */
  /** Swaps two slots of the hotbar (what is in them was validated when it was put there). One write. */
  private async handleHotbarSwap(ws: WebSocket, state: PlayerState, a: number, b: number): Promise<void> {
    const now = Date.now();
    const id = state.id;
    // The client shows a swap at once, so a swap that is dropped (too frequent) must be answered with the real bar.
    if (now - (state.lastHotbarAt ?? 0) < HOTBAR_MIN_GAP_MS) return void this.send(ws, { t: "hotbar", slots: await this.getHotbar(id) });
    state.lastHotbarAt = now;
    ws.serializeAttachment(state);
    const current = await this.getHotbar(id);
    if (a === b || a < 0 || b < 0 || a >= HOTBAR_SLOTS || b >= HOTBAR_SLOTS) return void this.send(ws, { t: "hotbar", slots: current });
    const next = [...current];
    next[a] = current[b] ?? "";
    next[b] = current[a] ?? "";
    try {
      await saveHotbar(this.env.DB, id, next);
      this.hotbars.set(id, next);
      this.send(ws, { t: "hotbar", slots: next });
    } catch (err) {
      console.error("hotbar swap failed", id, err);
      this.send(ws, { t: "hotbar", slots: current });
    }
  }

  private async handleHotbar(ws: WebSocket, state: PlayerState, slot: number, v: string): Promise<void> {
    const now = Date.now();
    if (now - (state.lastHotbarAt ?? 0) < HOTBAR_MIN_GAP_MS) return;
    state.lastHotbarAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    const current = await this.getHotbar(id);
    const resend = () => this.send(ws, { t: "hotbar", slots: current });
    if (slot < 0 || slot >= HOTBAR_SLOTS) return resend();
    if (v.startsWith("s:")) {
      const slotSkill = parseSkillSlot(v);
      const who = await this.casterOf(id);
      const known = who ? availableSkills(who.granted, who.gear) : [];
      const def = slotSkill ? getSkill(slotSkill.id) : undefined;
      if (!slotSkill || !def || !known.includes(def.id) || def.kind === "passive") return resend();
      // Only an attack with a free element carries one, and it must be one of the character's own.
      if (slotSkill.element && !(def.flex && who?.roots.includes(slotSkill.element))) return resend();
    } else if (v.startsWith("i:")) {
      const slotItem = getItemDef(v.slice(2));
      if (slotItem?.healFraction === undefined && slotItem?.teleportTo === undefined) return resend(); // potions and talismans can be put on the bar
    }
    const next = [...current];
    next[slot] = v;
    // A skill is on the bar once: putting it in another slot moves it there (the slot it left becomes empty).
    const moved = parseSkillSlot(v);
    if (moved) next.forEach((x, i) => (i !== slot && parseSkillSlot(x)?.id === moved.id ? (next[i] = "") : undefined));
    try {
      await saveHotbar(this.env.DB, id, next);
      this.hotbars.set(id, next);
      this.send(ws, { t: "hotbar", slots: next });
    } catch (err) {
      console.error("hotbar save failed", id, err);
      resend();
    }
  }

  /**
   * A Ngộ Đạo Đan raises the mastery of one skill. The pill and the new mastery commit in one batch (the row must exist, which a
   * guard checks), so the pill is never spent without the points. It works anywhere, also in town, because it needs no simulation.
   */
  private handleSkillBoost(ws: WebSocket, state: PlayerState, skillId: string): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "inv_error", reason: "rate" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const def = getSkill(skillId);
      const rows = await this.getSkillRows(id);
      const row = rows.find((r) => r.skill_id === skillId);
      if (!def || !row || def.source === "gear") return this.send(ws, { t: "inv_error", reason: "no_skill" });
      const profileNow = this.sim?.getPlayer(id);
      const charRow = profileNow ? null : await getCharacterById(this.env.DB, id);
      const rootGrade = profileNow?.rootGrade ?? charRow?.root_grade ?? 0;
      // The hướng tu (Đan tu) add percent to the points of a Ngộ Đạo Đan.
      const points = Math.round(MASTERY_PILL_POINTS * (1 + pathBonuses(profileNow?.paths ?? parsePaths(charRow?.paths)).masteryPct / 100));
      const next = addMastery(row.level, row.mastery, points, skillGrade(def, rootGrade));
      if (next.level === row.level && next.mastery === row.mastery) return this.send(ws, { t: "inv_error", reason: "not_needed" }); // already at the top
      const hasPill = (await this.getBag(id)).items.some((i) => getItemDef(i.type)?.masteryPills !== undefined);
      if (!hasPill) return this.send(ws, { t: "inv_error", reason: "no_pill" });
      const res = await this.mutateBag(id, (b) => {
        // Looked up in the bag this plan is made on: when the cache was stale and the bag was reloaded, a pill's cell may have moved.
        const pill = b.items.find((i) => getItemDef(i.type)?.masteryPills !== undefined);
        if (!pill) return null;
        const ops = planRemove(b.items, b.tabs, { tab: pill.tab, cell: pill.cell }, 1);
        if (!ops) return null;
        const guard = this.env.DB.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM character_skills WHERE character_id = ? AND skill_id = ?)").bind(id, skillId);
        const write = this.env.DB.prepare("UPDATE character_skills SET level = ?, mastery = ? WHERE character_id = ? AND skill_id = ?").bind(next.level, next.mastery, id, skillId);
        return { ops, extra: [guard, write] };
      });
      if (!res.ok) return this.resync(ws, id, res.reason === "invalid" ? "invalid" : "busy");
      // Committed: the room's copy, the simulation and the client follow (the value is already in D1, so it is not dirty).
      row.level = next.level;
      row.mastery = next.mastery;
      this.sim?.setMastery(id, skillId, next.level, next.mastery);
      this.sendBagDelta(id, res.before, res.after);
      this.sendToCharacter(id, { t: "skill_state", id: skillId, lv: next.level, xp: next.mastery, ...(next.up ? { up: true } : {}) });
      if (next.up) await this.checkPathLevelUp(id);
    });
  }

  /** A potion on the hotbar: the first stack of that type in the bag is used (same rules and cooldown as using it from the bag). */
  private handleUseType(ws: WebSocket, state: PlayerState, type: string): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.send(ws, { t: "inv_error", reason: "rate" });
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const bag = await this.getBag(id);
      const item = bag.items.find((i) => i.type === type);
      if (!item) return this.send(ws, { t: "inv_error", reason: "invalid" });
      return this.usePotion(ws, id, item.tab, item.cell);
    });
  }

  /**
   * Reads a bí tịch: the book is consumed and the skill stored in ONE batch (a skill already known has a primary-key
   * clash and rolls the whole batch back, so nothing is consumed). The room's copy and the client are updated afterwards.
   */
  private async learnBook(ws: WebSocket, id: string, tab: number, cell: number, skillId: string): Promise<void> {
    const skill = getSkill(skillId);
    const who = await this.casterOf(id);
    if (!skill || !who) return this.resync(ws, id, "invalid");
    if (who.granted.includes(skillId)) return this.send(ws, { t: "inv_error", reason: "known" });
    if (!canLearn(skill, who.realm, who.stage)) return this.send(ws, { t: "inv_error", reason: "level_low" });
    const res = await this.mutateBag(id, (bag) => {
      const ops = planRemove(bag.items, bag.tabs, { tab, cell }, 1);
      if (!ops) return null;
      return { ops, extra: [this.env.DB.prepare("INSERT INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES (?, ?, ?, 'learned', ?)").bind(id, skillId, Date.now(), skill.realm)] };
    });
    if (!res.ok) {
      if (res.reason === "duplicate") return this.send(ws, { t: "inv_error", reason: "known" });
      return this.resync(ws, id, res.reason === "invalid" ? "invalid" : "busy");
    }
    (await this.getSkillRows(id)).push({ skill_id: skillId, source: "learned", realm: skill.realm, level: 0, mastery: 0 });
    this.sim?.addGranted(id, skillId);
    this.sendBagDelta(id, res.before, res.after);
    this.sendToCharacter(id, { t: "skills", ids: availableSkills([...who.granted, skillId], who.gear) });
    this.sendToCharacter(id, { t: "skill_state", id: skillId, lv: 0, xp: 0 });
  }

  /** Consumes one potion and heals. The potion is committed first; HP only changes after the write succeeded. */
  private async usePotion(ws: WebSocket, id: string, tab: number, cell: number): Promise<void> {
    const bag = await this.getBag(id);
    const item = itemAt(bag.items, { tab, cell });
    if (item && getItemDef(item.type)?.teaches) return this.learnBook(ws, id, tab, cell, getItemDef(item.type)!.teaches!);
    const teleport = item ? getItemDef(item.type)?.teleportTo : undefined;
    if (item && teleport) return this.useTalisman(ws, id, tab, cell, teleport);
    const heal = item ? getItemDef(item.type)?.healFraction : undefined;
    if (!item || heal === undefined) return this.resync(ws, id, "invalid");
    const profile = this.sim?.getPlayer(id);
    const now = Date.now();
    if (!profile || profile.dead || profile.hp >= profile.maxHp) return this.send(ws, { t: "inv_error", reason: "not_needed" });
    if (now < profile.potionReadyAt) return this.send(ws, { t: "inv_error", reason: "cooldown" });
    profile.potionReadyAt = now + POTION_COOLDOWN_MS;
    // The hướng tu (Đan tu) make healing pills heal more.
    const healBoost = 1 + pathBonuses(profile.paths ?? NO_PATHS).potionHealPct / 100;
    const res = await this.mutateBag(id, (b) => {
      const ops = planRemove(b.items, b.tabs, { tab, cell }, 1);
      return ops ? { ops } : null;
    });
    if (!res.ok) return this.resync(ws, id, res.reason === "invalid" ? "invalid" : "busy");
    this.sendBagDelta(id, res.before, res.after);
    const over = getItemDef(item.type)?.healOverMs;
    if (over !== undefined) {
      // Heals a little every second; the effect shows on the buff bar until it has all landed.
      const events = this.sim?.startHot(id, item.type, heal * healBoost, over, Date.now());
      if (events) for (const ev of events) if (ev.t === "effects") this.sendToCharacter(id, { t: "effects", list: ev.list });
      this.startTick();
      return;
    }
    const hp = this.sim?.heal(id, heal * healBoost);
    const p = this.sim?.getPlayer(id);
    if (hp !== null && hp !== undefined && p) this.sendToCharacter(id, { t: "hp", hp, maxHp: p.maxHp });
  }

  /**
   * A teleport talisman starts a channel of TALISMAN_CAST_MS: nothing is spent yet. Moving, attacking, casting or being hit
   * breaks it and the talisman stays in the bag; when the time is up the alarm completes it (finishTalisman), which spends
   * the talisman and moves the character like a portal does. It cannot start during a breakthrough or another channel.
   */
  private async useTalisman(ws: WebSocket, id: string, tab: number, cell: number, to: MapId): Promise<void> {
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state || state.transferring) return;
    if (state.bt) return this.send(ws, { t: "inv_error", reason: "breaking" });
    if (state.tp) return this.send(ws, { t: "inv_error", reason: "busy" });
    // Channelling means standing still: a walk that is still going (one `move` keeps the path running) would carry on
    // with no further message to break the channel.
    if (this.isMoving(state)) return this.send(ws, { t: "inv_error", reason: "moving" });
    const dead = this.sim?.getPlayer(id)?.dead === true;
    if (state.mapId === to || dead) return this.send(ws, { t: "inv_error", reason: "not_needed" });
    const item = itemAt((await this.getBag(id)).items, { tab, cell });
    if (!item) return this.resync(ws, id, "invalid");
    const endsAt = Date.now() + TALISMAN_CAST_MS;
    this.patchState(ws, (s) => {
      s.tp = { endsAt, item: item.type, to };
    });
    this.sim?.clearTarget(id); // channelling is standing still: it drops the attack target like a breakthrough does
    this.send(ws, { t: "tp", ms: TALISMAN_CAST_MS, item: item.type });
    await this.scheduleAlarmAt(endsAt);
  }

  /** Breaks a talisman channel (nothing was spent). Does nothing when none is running. */
  private async interruptTalisman(id: string, reason: "moved" | "hit" | "dead" | "other"): Promise<void> {
    const sock = this.socketOf(id);
    if (!sock?.state.tp || sock.state.transferring) return;
    this.patchState(sock.ws, (s) => {
      delete s.tp;
    });
    this.send(sock.ws, { t: "tp_end", ok: false, reason });
  }

  /**
   * The channel ran its time: the talisman is spent in the SAME batch that saves the new position (handoff's `before`), so it
   * is never lost without the teleport. If anything is off (no talisman left, the bag changed under the plan, a D1 error) the
   * batch rolls back, nothing is spent and the character stays.
   */
  private async finishTalisman(ws: WebSocket, id: string): Promise<void> {
    const tp = (ws.deserializeAttachment() as PlayerState | null)?.tp;
    if (!tp) return;
    this.patchState(ws, (s) => {
      delete s.tp;
    });
    if (this.sim?.getPlayer(id)?.dead === true) return void this.send(ws, { t: "tp_end", ok: false, reason: "dead" });
    for (let attempt = 0; attempt < 2; attempt++) {
      let ops: BagOp[] | null = null;
      await this.bagTask(id, async () => {
        const b = await this.getBag(id);
        const have = b.items.find((i) => i.type === tp.item);
        ops = have ? planRemove(b.items, b.tabs, { tab: have.tab, cell: have.cell }, 1) : null;
      });
      if (!ops) return void this.send(ws, { t: "tp_end", ok: false, reason: "no_item" });
      // The socket may have changed meanwhile (a duplicate login evicted it, a breakthrough began): act only on what it holds now.
      const fresh = ws.deserializeAttachment() as PlayerState | null;
      if (!fresh || fresh.id !== id || fresh.transferring || fresh.bt || fresh.tp || this.isMoving(fresh)) return;
      const spawn = getMap(tp.to).spawn;
      const before = (ops as BagOp[]).flatMap((op) => opStatements(this.env.DB, id, op, Date.now()));
      if (await this.handoff(ws, fresh, tp.to, spawn[0] + 0.5, spawn[1] + 0.5, false, before)) return; // the socket is closed: the client sees the transfer
      this.bags.delete(id); // nothing was written: reload the bag and try once more (a stale cache is the usual reason)
      const again = ws.deserializeAttachment() as PlayerState | null;
      if (!again || again.transferring) return;
    }
    this.send(ws, { t: "tp_end", ok: false, reason: "other" });
  }

  /** True while the character's walk has not reached its last point. */
  private isMoving(state: PlayerState): boolean {
    const last = state.path[state.path.length - 1];
    if (!last) return false;
    const now = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    return Math.hypot(now.x - last[0], now.y - last[1]) > 0.05;
  }

  private async claimMail(ws: WebSocket, id: string, mailId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const bag = await this.getBag(id);
      const r = await claimMailItem(this.env.DB, id, mailId, bag);
      if (r.status === "claimed") {
        const next = applyBag({ items: bag.items, equipped: bag.equipped }, r.ops);
        const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
        this.bags.set(id, after);
        this.sendBagDelta(id, bag, after);
        this.sendToCharacter(id, { t: "loot", items: [{ type: r.type, qty: r.qty, mailed: false }] });
        return this.sendMailList(id);
      }
      if (r.status === "stale") {
        this.bags.delete(id);
        continue;
      }
      if (r.status === "bag_full") return this.send(ws, { t: "inv_error", reason: "full" });
      await this.sendMailList(id); // expired, already claimed or unknown: show what is really there
      return this.send(ws, { t: "inv_error", reason: r.status === "expired" ? "expired" : "invalid" });
    }
    this.send(ws, { t: "inv_error", reason: "busy" });
  }

  private async flushProgress(id: string): Promise<void> {
    const progress = this.sim?.beginFlush(id);
    if (!progress) return;
    try {
      await saveCharacterProgress(this.env.DB, id, progress);
      this.sim?.endFlush(id, progress, true);
    } catch (err) {
      console.error("progress flush failed", id, err);
      this.sim?.endFlush(id, progress, false);
    }
  }

  /** Death: lose a little EXP (never a stage), then respawn in town through the normal handoff. */
  /** Death wear as one guarded batch under a one-time key, retried with the same key (a retry after a lost answer is "duplicate"). */
  private wearGearOnDeath(ws: WebSocket, id: string, wearer: WearerCtx, fraction?: number): void {
    const key = `death:${crypto.randomUUID()}`;
    void this.bagTask(id, async () => {
      let removed: Array<{ item: { type: string }; reason: EquipBlock; mailed: boolean }> = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await this.mutateBag(
            id,
            (bag) => {
              const r = planDeathWear({ items: bag.items, equipped: bag.equipped }, bag.tabs, wearer, () => crypto.randomUUID(), fraction);
              removed = r.removed;
              return r.ops.length > 0 ? { ops: r.ops } : null;
            },
            key,
          );
          // The dying socket is already marked as transferring, so it is addressed directly (it stays open until the bag settles).
          if (res.ok) {
            this.sendBagDelta(id, res.before, res.after, ws);
            await this.announceRemoved(id, removed, ws);
            if (res.after.equipped.length > 0) this.send(ws, { t: "eq_worn" });
          } else if (res.reason === "duplicate") {
            // An earlier attempt did commit: send the real state.
            const bag = await this.getBag(id);
            this.send(ws, { t: "inv", full: true, tabs: bag.tabs, items: bag.items, removed: [] });
            this.send(ws, { t: "eq", items: bag.equipped });
            await this.sendMailList(id, ws);
          }
          return;
        } catch (err) {
          console.error("death wear failed", id, attempt, err);
          this.bags.delete(id);
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    });
  }


  // ---- Breakthrough (đột phá), docs/PHASE2.md 2d ----

  /** The socket of a character in this room, with its current state. */
  private socketOf(id: string): { ws: WebSocket; state: PlayerState } | null {
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as PlayerState | null;
      if (state && state.id === id) return { ws, state };
    }
    return null;
  }

  /** Changes the attachment of a socket from its current value (a copy taken before an await may be stale). */
  private patchState(ws: WebSocket, fn: (s: PlayerState) => void): PlayerState | null {
    const fresh = ws.deserializeAttachment() as PlayerState | null;
    if (!fresh) return null;
    fn(fresh);
    ws.serializeAttachment(fresh);
    return fresh;
  }

  private btError(ws: WebSocket, reason: BreakthroughError): void {
    this.send(ws, { t: "bt_error", reason });
  }

  /**
   * Starts a breakthrough. The pills and the Linh Thạch leave and the start is marked in D1 in ONE batch (a guard checks the
   * row is still at stage 9 of this realm with none running); then the character must stay undisturbed for the realm's time.
   */
  private handleBreakthroughStart(ws: WebSocket, state: PlayerState, pills: number): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.btError(ws, "busy");
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    void this.bagTask(state.id, () => this.startBreakthrough(ws, state.id, pills));
  }

  private async startBreakthrough(ws: WebSocket, id: string, pills: number): Promise<void> {
    const here = ws.deserializeAttachment() as PlayerState | null;
    if (here?.tp) {
      await this.interruptTalisman(here.id, "other");
    }
    if (!here || here.transferring || here.bt) return this.btError(ws, "busy");
    // A walk that is still going would carry on with no further message to break the breakthrough: stand still first.
    if (this.isMoving(here)) return this.btError(ws, "moving");
    if (!getMap(here.mapId).safe) await this.wake(here.mapId);
    const profile = this.sim?.getPlayer(id);
    if (profile?.dead) return this.btError(ws, "dead");
    // The working copy in a combat map is newer than D1; write it first so the row and the room agree.
    if (profile) await this.flushProgress(id);
    const row = await getCharacterById(this.env.DB, id);
    if (!row) return;
    if (row.bt_started_at !== null) return this.btError(ws, "busy");
    const realm = profile?.realm ?? row.realm;
    const stage = profile?.stage ?? row.stage;
    const exp = profile?.exp ?? row.exp;
    const ready = checkBreakthroughReady(realm, stage, exp);
    if (!ready.ok) return this.btError(ws, ready.error);
    const { def } = ready;
    if (pills < 1 || pills > def.maxPills) return this.btError(ws, "pills");
    const bag = await this.getBag(id);
    const ops = planTakePills(bag.items, def.pill, pills);
    if (!ops) return this.btError(ws, "no_pill");
    const startedAt = Date.now();
    try {
      const r = await applyCurrencyDelta(
        this.env.DB,
        { characterId: id, currency: "linh_thach", delta: -def.cost, reason: "breakthrough", actor: "system", idempotencyKey: `bt:${crypto.randomUUID()}` },
        startStatements(this.env.DB, id, realm, ops, startedAt, expAtStart(realm, stage, exp)),
      );
      if (r.status === "insufficient") return this.btError(ws, "funds");
      if (r.status !== "applied") return this.btError(ws, "busy");
      const next = applyBag({ items: bag.items, equipped: bag.equipped }, ops);
      const after: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
      this.bags.set(id, after);
      this.sendBagDelta(id, bag, after);
      this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: r.balance });
    } catch (err) {
      // A failed guard means the row (or the cached bag) was not in the state the room believed: nothing was written.
      if (!isStaleBreakthrough(err)) console.error("breakthrough start failed", id, err);
      this.bags.delete(id);
      return this.btError(ws, "busy");
    }
    const ratePct = breakthroughRate(def, pills, ready.overflowBonus);
    const active: ActiveBreakthrough = { startedAt, endsAt: startedAt + def.durationMs, from: realm, ratePct };
    this.patchState(ws, (s) => {
      s.bt = active;
    });
    this.sim?.clearTarget(id);
    this.sim?.applyBreakthroughStart(id, expAtStart(realm, stage, exp));
    const started = this.sim?.getPlayer(id);
    if (started) this.send(ws, { t: "stats", character: sheetOf(started) });
    else this.send(ws, { t: "stats", character: toCharacterSheet({ ...row, exp: expAtStart(realm, stage, exp) }) });
    this.send(ws, { t: "bt", ms: def.durationMs, ratePct, pills, bonus: ready.overflowBonus });
    await this.scheduleAlarmAt(active.endsAt);
  }

  /** Ends the character's breakthrough as a failure (it was disturbed). Does nothing when none is running. */
  private async interruptBreakthrough(id: string, reason: BreakthroughEnd): Promise<void> {
    const sock = this.socketOf(id);
    if (!sock?.state.bt || sock.state.transferring) return;
    await this.finishBreakthrough(sock.ws, id, sock.state.bt, reason);
  }

  /** Leaving the room (disconnect, portal, death, being kicked) while a breakthrough runs: it fails, then the exit goes on. */
  private async failBreakthroughOnExit(ws: WebSocket, state: PlayerState, reason: BreakthroughEnd): Promise<void> {
    if (!state.bt) return;
    try {
      await this.finishBreakthrough(ws, state.id, state.bt, reason);
    } catch (err) {
      console.error("breakthrough exit failed", state.id, err);
    }
  }

  /**
   * Settles a breakthrough: `timeout` rolls the chance fixed at the start, anything else is a failure. The marker is cleared
   * first (in the attachment) so two triggers (the alarm and a hit, say) cannot settle it twice; D1 also checks the marker.
   */
  private async finishBreakthrough(ws: WebSocket, id: string, bt: ActiveBreakthrough, reason: BreakthroughEnd, rand: () => number = Math.random): Promise<void> {
    const live = (ws.deserializeAttachment() as PlayerState | null)?.bt;
    if (!live || live.startedAt !== bt.startedAt) return;
    const mapId = this.patchState(ws, (s) => {
      delete s.bt;
    })?.mapId;
    const won = reason === "timeout" && rollBreakthrough(bt.ratePct, rand);
    if (mapId && !getMap(mapId).safe) await this.wake(mapId).catch((err) => console.error("wake failed", err));
    if (this.sim?.getPlayer(id)) await this.flushProgress(id);
    const loss = Math.round(expToNext(bt.from, 9) * BREAKTHROUGH_FAIL_EXP_LOSS);
    try {
      if (won) {
        const row = await getCharacterById(this.env.DB, id);
        const def = getBreakthrough(bt.from);
        if (!row || !def) return;
        const points = breakthroughPoints(def, row.root_grade, row.constitution_tier, row.constitution === DEFAULT_CONSTITUTION);
        if ((await commitBreakthroughSuccess(this.env.DB, id, bt.from, bt.startedAt, points)) !== "ok") return;
        await this.afterBreakthroughSuccess(ws, id, def.to, points);
        return;
      }
      const cap = expToNext(bt.from, 9);
      if ((await commitBreakthroughFailure(this.env.DB, id, bt.startedAt, loss, cap)) !== "ok") return;
      this.sim?.applyBreakthroughLoss(id, loss, cap);
      const row = await getCharacterById(this.env.DB, id);
      const profile = this.sim?.getPlayer(id);
      if (row) this.send(ws, { t: "stats", character: profile ? sheetOf(profile) : toCharacterSheet(row) });
      this.send(ws, { t: "bt_end", ok: false, reason, expLost: loss });
    } catch (err) {
      // The marker stays in D1, so the next join settles it as a failure; nothing is lost twice.
      console.error("breakthrough settle failed", id, err);
    }
  }

  /** The new realm is committed: the room's copy, the skills of the realm, the sheet and the vitals follow. */
  private async afterBreakthroughSuccess(ws: WebSocket, id: string, toRealm: number, points: number): Promise<void> {
    const profile = this.sim?.getPlayer(id);
    this.sim?.applyBreakthrough(id, toRealm, points);
    // Two root skills of the new realm are rolled once and stored; the sim and the client learn them now.
    const before = this.skillRows.get(id) ?? (await loadSkillRows(this.env.DB, id));
    const rows = await ensureRootSkills(this.env.DB, id, toRealm, before);
    this.skillRows.set(id, rows);
    for (const r of rows) this.sim?.addGranted(id, r.skill_id);
    const row = await getCharacterById(this.env.DB, id);
    if (!row) return;
    const bag = await this.getBag(id);
    this.send(ws, { t: "stats", character: profile ? sheetOf(profile) : toCharacterSheet(row) });
    this.send(ws, { t: "skills", ids: profile && this.sim ? this.sim.skillsOf(profile) : availableSkills(rows.map((r) => r.skill_id), gearSkillIds(bag.equipped)) });
    if (profile) {
      this.send(ws, { t: "hp", hp: profile.hp, maxHp: profile.maxHp });
      this.sendMp(ws, profile, Date.now());
      this.applyGear(id, bag, ws); // the realm changed what the worn gear and its skills are worth
    } else {
      const derived = withPaths(deriveStats(baseOf(row), row.realm, row.stage, row.root_grade, equipmentBonus(bag.equipped, wearerOfRow(row)), parseRoots(row.roots, row.spiritual_root).length), parsePaths(row.paths));
      this.send(ws, { t: "hp", hp: derived.maxHp, maxHp: derived.maxHp });
    }
    this.send(ws, { t: "bt_end", ok: true, reason: "timeout", points, realm: toRealm });
  }


  // ---- Hướng tu (cultivation paths), docs/PHASE2.md 2d-B ----

  private pathError(ws: WebSocket, reason: PathError): void {
    this.send(ws, { t: "path_error", reason });
  }

  /**
   * GM button: an admin at Trúc Cơ or above may take a path item as many times as wanted (no grant key, so it neither limits the
   * button nor blocks the NPC quest). A full bag refuses it.
   */
  private handlePathClaim(ws: WebSocket, state: PlayerState, path: PathId): void {
    // The temporary claim button is for admins only now (players get the item from the path's NPC quest). Checked here, not just hidden.
    if (!state.admin) return this.pathError(ws, "admin");
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.pathError(ws, "busy");
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const row = await getCharacterById(this.env.DB, id);
      if (!row) return;
      const realm = this.sim?.getPlayer(id)?.realm ?? row.realm;
      const err = checkPathChoice(parsePaths(row.paths), path, realm);
      if (err === "level") return this.pathError(ws, "level");
      const res = await this.mutateBag(
        id,
        (bag) => {
          const ops = planAdd(bag.items, bag.tabs, PATHS[path].item, 1, () => crypto.randomUUID());
          return ops ? { ops } : null;
        },
      );
      if (!res.ok) return this.pathError(ws, res.reason === "invalid" ? "bag_full" : "busy");
      this.sendBagDelta(id, res.before, res.after);
      this.send(ws, { t: "path_claimed", path });
    });
  }

  /** GM button: the breakthrough pill for the realm the character is in, as many times as wanted. Admin only (checked here). */
  private handleBreakthroughClaim(ws: WebSocket, state: PlayerState): void {
    if (!state.admin) return this.btError(ws, "admin");
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.btError(ws, "busy");
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, async () => {
      const row = await getCharacterById(this.env.DB, id);
      if (!row) return;
      const def = getBreakthrough(this.sim?.getPlayer(id)?.realm ?? row.realm);
      if (!def) return this.btError(ws, "max_realm");
      const res = await this.mutateBag(id, (bag) => {
        const ops = planAdd(bag.items, bag.tabs, def.pill, 1, () => crypto.randomUUID());
        return ops ? { ops } : null;
      });
      if (!res.ok) return this.btError(ws, res.reason === "invalid" ? "full" : "busy");
      this.sendBagDelta(id, res.before, res.after);
      this.send(ws, { t: "bt_claimed", item: def.pill });
    });
  }

  /**
   * Takes up a hướng tu: the item leaves the bag (and for a phụ tu the Linh Thạch is paid) together with the new path and its two
   * skills in ONE batch. The first path is the chủ tu. Swapping and dropping are handlePathChange.
   */
  private handlePathChoose(ws: WebSocket, state: PlayerState, path: PathId): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.pathError(ws, "busy");
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, () => this.choosePath(ws, id, path));
  }

  private async choosePath(ws: WebSocket, id: string, path: PathId): Promise<void> {
    const here = ws.deserializeAttachment() as PlayerState | null;
    if (!here || here.transferring || here.bt) return this.pathError(ws, "busy");
    const profile = this.sim?.getPlayer(id);
    if (profile?.dead) return this.pathError(ws, "busy");
    const row = await getCharacterById(this.env.DB, id);
    if (!row) return;
    const before = parsePaths(row.paths);
    const err = checkPathChoice(before, path, profile?.realm ?? row.realm);
    if (err) return this.pathError(ws, err);
    const slot = nextPathSlot(before, path);
    if (slot === null) return this.pathError(ws, "full");
    const bag = await this.getBag(id);
    const ops = planTakePills(bag.items, PATHS[path].item, 1);
    if (!ops) return this.pathError(ws, "no_item");
    const after: PathState = slot === 0 ? { main: path, subs: [] } : { main: before.main, subs: [...before.subs, path] };
    let result;
    try {
      result = await commitPathChoice(this.env.DB, id, path, slot, before, after, ops, pathCost(before));
    } catch (err2) {
      console.error("path choice failed", id, err2);
      this.bags.delete(id);
      return this.pathError(ws, "busy");
    }
    if (result.status === "insufficient") return this.pathError(ws, "funds");
    if (result.status === "duplicate") return this.pathError(ws, "have");
    if (result.status === "stale") {
      this.bags.delete(id);
      return this.pathError(ws, "busy");
    }
    // Committed: the bag, the wallet, the skills and the stats follow.
    const next = applyBag({ items: bag.items, equipped: bag.equipped }, ops);
    const bagAfterChoice: BagState = { tabs: bag.tabs, items: next.items, equipped: next.equipped };
    this.bags.set(id, bagAfterChoice);
    this.sendBagDelta(id, bag, bagAfterChoice);
    if (result.balance !== null) this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: result.balance });
    const rows = await this.getSkillRows(id);
    for (const skill of PATHS[path].levels[0]?.skills ?? []) {
      if (!rows.some((r) => r.skill_id === skill)) rows.push({ skill_id: skill, source: "path", realm: 1, level: 0, mastery: 0 });
      this.sim?.addGranted(id, skill);
      this.sendToCharacter(id, { t: "skill_state", id: skill, lv: 0, xp: 0 });
    }
    this.sim?.setPaths(id, after);
    const fresh = await getCharacterById(this.env.DB, id);
    const live = this.sim?.getPlayer(id);
    if (fresh) this.send(ws, { t: "stats", character: live ? sheetOf(live) : toCharacterSheet(fresh) });
    const gear = (await this.getBag(id)).equipped;
    this.send(ws, { t: "skills", ids: live && this.sim ? this.sim.skillsOf(live) : availableSkills(rows.map((r) => r.skill_id), gearSkillIds(gear)) });
    if (live) {
      this.send(ws, { t: "hp", hp: live.hp, maxHp: live.maxHp });
      this.sendMp(ws, live, Date.now());
    }
  }


  /**
   * Swaps the chủ tu with a phụ tu, or drops a path. Both cost Linh Thạch by the levels of the paths, paid in the same batch that
   * rewrites the rows (see rearrangeStatements). A dropped path takes its skills with it, off the hotbar too.
   */
  private handlePathChange(ws: WebSocket, state: PlayerState, kind: "swap" | "drop", path: PathId): void {
    const now = Date.now();
    if (now - (state.lastInvAt ?? 0) < INV_MIN_GAP_MS) return this.pathError(ws, "busy");
    state.lastInvAt = now;
    ws.serializeAttachment(state);
    const id = state.id;
    void this.bagTask(id, () => this.changePath(ws, id, kind, path));
  }

  private async changePath(ws: WebSocket, id: string, kind: "swap" | "drop", path: PathId): Promise<void> {
    const here = ws.deserializeAttachment() as PlayerState | null;
    if (!here || here.transferring || here.bt) return this.pathError(ws, "busy");
    const row = await getCharacterById(this.env.DB, id);
    if (!row) return;
    const before = parsePaths(row.paths);
    const after = kind === "swap" ? afterSwap(before, path) : afterDrop(before, path);
    if (!after) return this.pathError(ws, "no_path");
    const cost = kind === "swap" ? pathSwapCost(before, path) : pathDropCost(before, path);
    const removed = kind === "drop" ? allPathSkills(path) : [];
    let hotbar: string[] | undefined;
    if (removed.length > 0) {
      const current = await this.getHotbar(id);
      const cleaned = current.map((slot) => (removed.includes(parseSkillSlot(slot)?.id ?? "") ? "" : slot));
      if (cleaned.some((slot, i) => slot !== current[i])) hotbar = cleaned;
    }
    const now = Date.now();
    // Dropping a path also opens its quest again (progress row and one-time keys go in the same batch), so the item can be earned again.
    const reopened = kind === "drop" ? (await getQuestCatalog(this.env.DB)).filter((q) => q.path === path) : [];
    let result;
    try {
      result = await commitPathBatch(this.env.DB, id, rearrangeStatements(this.env.DB, id, before, after, { ...(kind === "drop" ? { dropped: path } : {}), ...(hotbar ? { hotbar } : {}), ...(reopened.length > 0 ? { extra: resetQuestStatements(this.env.DB, id, reopened) } : {}), now }), cost, `path_${kind}:${id}:${path}:${now}`, `path_${kind}`);
    } catch (err) {
      console.error("path change failed", id, err);
      return this.pathError(ws, "busy");
    }
    if (result.status === "insufficient") return this.pathError(ws, "funds");
    if (result.status !== "ok") return this.pathError(ws, "busy");
    if (result.balance !== null) this.sendToCharacter(id, { t: "wallet", currency: "linh_thach", balance: result.balance });
    if (reopened.length > 0) {
      const mine = await this.getQuestRows(id);
      for (const q of reopened) delete mine[q.id];
      await this.sendQuestActive(id).catch((err) => console.error("quest list failed", id, err));
    }
    const rows = await this.getSkillRows(id);
    if (removed.length > 0) {
      for (let i = rows.length - 1; i >= 0; i--) if (removed.includes(rows[i]!.skill_id)) rows.splice(i, 1);
      this.sim?.removeGranted(id, removed);
    }
    if (hotbar) {
      this.hotbars.set(id, hotbar);
      this.sendToCharacter(id, { t: "hotbar", slots: hotbar });
    }
    this.sim?.setPaths(id, after);
    await this.announcePaths(ws, id, rows);
  }

  /** After the paths changed: the sheet, the skills and the vitals (maximum MP follows a Thuật tu coming or going). */
  private async announcePaths(ws: WebSocket, id: string, rows: SkillRow[]): Promise<void> {
    const fresh = await getCharacterById(this.env.DB, id);
    const live = this.sim?.getPlayer(id);
    if (fresh) this.send(ws, { t: "stats", character: live ? sheetOf(live) : toCharacterSheet(fresh) });
    const gear = (await this.getBag(id)).equipped;
    this.send(ws, { t: "skills", ids: live && this.sim ? this.sim.skillsOf(live) : availableSkills(rows.map((r) => r.skill_id), gearSkillIds(gear)) });
    if (live) {
      this.send(ws, { t: "hp", hp: live.hp, maxHp: live.maxHp });
      this.sendMp(ws, live, Date.now());
    }
  }

  /**
   * A path goes up a level when both of the skills of its level have reached the top mastery level: the level is written with the
   * two skills of the next one in one batch (guarded on the level it was at). Called when a path skill gains a mastery level.
   */
  private async checkPathLevelUp(id: string): Promise<void> {
    const sock = this.socketOf(id);
    if (!sock) return;
    const rows = await this.getSkillRows(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await getCharacterById(this.env.DB, id);
      if (!row) return;
      const before = parsePaths(row.paths);
      const masteryOf = (skill: string) => rows.find((r) => r.skill_id === skill)?.level;
      const ready = [before.main, ...before.subs].find((p): p is PathId => !!p && pathLevelReady(p, pathLevel(before, p), masteryOf));
      if (!ready) return;
      const from = pathLevel(before, ready);
      const after: PathState = { ...before, levels: { ...before.levels, [ready]: from + 1 } };
      const result = await commitPathBatch(this.env.DB, id, levelUpStatements(this.env.DB, id, ready, from, before, after, Date.now()), 0, `path_level:${id}:${ready}:${from}`).catch((err) => {
        console.error("path level-up failed", id, err);
        return null;
      });
      if (!result || result.status !== "ok") return;
      for (const skill of PATHS[ready].levels[from + 1]?.skills ?? []) {
        if (!rows.some((r) => r.skill_id === skill)) rows.push({ skill_id: skill, source: "path", realm: 1, level: 0, mastery: 0 });
        this.sim?.addGranted(id, skill);
        this.sendToCharacter(id, { t: "skill_state", id: skill, lv: 0, xp: 0 });
      }
      this.sim?.setPaths(id, after);
      await this.announcePaths(sock.ws, id, rows);
    }
  }

  /** A marker left in D1 by a room that was lost: counts as a failed breakthrough. Returns the EXP lost. */
  private async settleStaleBreakthrough(row: CharacterRow): Promise<number> {
    const loss = Math.round(expToNext(row.realm, 9) * BREAKTHROUGH_FAIL_EXP_LOSS);
    try {
      await commitBreakthroughFailure(this.env.DB, row.id, row.bt_started_at as number, loss, expToNext(row.realm, 9));
    } catch (err) {
      console.error("stale breakthrough settle failed", row.id, err);
    }
    return loss;
  }

  private async handleDeath(ws: WebSocket, state: PlayerState, profile: PlayerProfile, by?: string): Promise<void> {
    // The name tier is read before anything awaits. The sim pushes `player_dead` before `pvp_kill`, and settlePvpKill (called right after this
    // synchronous start) lowers the victim's sát nhân, so reading later would use the score after the kill. server/src/pvp.test.ts pins the order.
    const tier = nameTier(this.satNhanOf(state, Date.now()));
    const expLost = expLostOnDeath(profile.exp);
    this.sim?.applyDeathPenalty(state.id, expLost);
    // Killed by a player while yellow, orange or red: maybe one item goes to the killer's mailbox. It is done first (and awaited), so the wear
    // below and the handoff, which waits for the bag queue, both see the bag without it.
    if (by && tier >= 1) await this.dropToKiller(ws, state, by, tier);
    // Every worn piece wears down (whatever killed the character). Queued before the handoff, which waits for the bag
    // queue before the lock is released, so the town room reads the new durability.
    this.wearGearOnDeath(ws, state.id, { gender: profile.gender, realm: profile.realm, stage: profile.stage, base: profile.base }, DEATH_DURABILITY_BY_TIER[tier]);
    this.send(ws, { t: "died", expLost });
    const [sx, sy] = getMap("town").spawn;
    await this.handoff(ws, state, "town", sx + 0.5, sy + 0.5, true);
  }

  /**
   * The PvP drop (docs/PHASE2.md 2f): with the chance of the victim's name tier, one bag stack or worn piece goes to the killer's mailbox (never
   * expiring) in ONE batch (the victim's row is deleted and a copy is made for the killer), keyed once per kill so a retry cannot give two. The
   * killer must still be in this room; if it left, nothing drops. Both sides are told.
   */
  private async dropToKiller(ws: WebSocket, victim: PlayerState, killerId: string, tier: NameTier): Promise<void> {
    const killer = this.socketOf(killerId);
    if (!killer) return;
    const key = `pkdrop:${crypto.randomUUID()}`;
    const ids = { newId: crypto.randomUUID(), mailId: crypto.randomUUID() };
    // Local tests set PK_DROP_FORCE=1 (in .dev.vars) so the drop always happens; the real game rolls.
    const roll = this.env.PK_DROP_FORCE === "1" ? 0 : Math.random();
    const pick = Math.random();
    let chosen: Extract<BagOp, { op: "give" }> | null = null;
    let done = false;
    await this.bagTask(victim.id, async () => {
      const res = await this.mutateBag(
        victim.id,
        (bag) => {
          chosen = planPkDrop({ items: bag.items, equipped: bag.equipped }, tier, roll, pick, killerId, ids, "pk_drop");
          return chosen ? { ops: [chosen] } : null;
        },
        key,
      );
      if (!res.ok) return;
      done = true;
      this.sendBagDelta(victim.id, res.before, res.after, ws);
    });
    const gave = chosen as Extract<BagOp, { op: "give" }> | null;
    if (!done || !gave) return;
    this.send(ws, { t: "pk_drop", role: "victim", item: gave.type, qty: gave.qty, other: killer.state.name });
    this.send(killer.ws, { t: "pk_drop", role: "killer", item: gave.type, qty: gave.qty, other: victim.name });
    await this.sendMailList(killerId, killer.ws).catch((err) => console.error("mail list failed", killerId, err));
  }

  /** A teleport skill went off: the player stands at `to` from now on, and everyone (the player included) gets that as a new track. */
  private teleport(ws: WebSocket, state: PlayerState, to: Vec2, now: number): void {
    state.path = [to];
    state.startedAt = now;
    state.dirty = true;
    state.moveBudget = MOVE_BUDGET_CAP;
    state.moveBudgetAt = now;
    ws.serializeAttachment(state);
    const snap = this.snapshot(state);
    this.broadcast({ t: "path", player: snap }, ws);
    this.send(ws, { t: "path", player: snap });
  }

  /** The server walks a player toward their target; the new path goes to everyone, including the player. */
  private chase(ws: WebSocket, state: PlayerState, to: Vec2, now: number): void {
    const map = getMap(state.mapId);
    const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
    const from: Vec2 = [here.x, here.y];
    const path = lineClear(map, from, to) ? ([from, to] as Vec2[]) : findSmoothPath(map, from, to);
    if (!path) return;
    state.path = path;
    state.startedAt = now;
    state.dirty = true;
    ws.serializeAttachment(state);
    const snap = this.snapshot(state);
    this.broadcast({ t: "path", player: snap }, ws);
    this.send(ws, { t: "path", player: snap });
  }

  // ---- PvP scores (shared/src/pk.ts) ----

  /** Sát nhân of a character right now: the stored value less 5 a minute of the time online since it was set (never below 0). */
  private satNhanOf(state: PlayerState, now: number): number {
    return Math.max(0, (state.sn ?? 0) - (SAT_NHAN_DECAY_PER_MIN * Math.max(0, now - (state.snAt ?? now))) / 60_000);
  }

  private pkScoresOf(state: PlayerState, now: number): PkScores {
    return { satKhi: state.sk ?? 0, satNhan: this.satNhanOf(state, now), hero: state.ah ?? 0 };
  }

  /** Last time one player hit another (attacker>victim), for self-defence and the grey name. Small and short-lived. */
  private blows = new Map<string, number>();

  private noteBlow(from: string, to: string, now: number): void {
    this.blows.set(`${from}>${to}`, now);
    if (this.blows.size > 400) for (const [k, t] of this.blows) if (now - t > GRAY_WINDOW_MS) this.blows.delete(k);
  }

  /** The PK switch: only the player's own choice, off at every join. A safe map keeps it but nobody can be attacked there. */
  private handlePkMode(ws: WebSocket, state: PlayerState, mode: PkMode): void {
    const next = this.patchState(ws, (s) => {
      s.pk = mode;
    });
    if (!next) return;
    this.sim?.setPkMode(state.id, mode);
    this.sendPk(ws, next);
    this.broadcast({ t: "pk_state", id: state.id, mode }, ws);
  }

  private sendPk(ws: WebSocket, state: PlayerState, now = Date.now()): void {
    const sc = this.pkScoresOf(state, now);
    this.send(ws, { t: "pk", mode: state.pk ?? 0, satKhi: sc.satKhi, satNhan: Math.round(sc.satNhan), hero: sc.hero });
  }

  /** Writes the scores of a character that is leaving (its sát nhân may have decayed, or they changed). Best effort: the next write corrects it. */
  private async flushPk(state: PlayerState): Promise<void> {
    if (!state.pkDirty && (state.sn ?? 0) <= 0) return;
    try {
      await savePkScores(this.env.DB, state.id, { satKhi: state.sk ?? 0, satNhan: this.satNhanOf(state, Date.now()), hero: state.ah ?? 0 });
    } catch (err) {
      console.error("pk scores write failed", state.id, err);
    }
  }

  /**
   * A player killed another: both sides' scores are settled (applyPvpKill) on the socket states the tick works with, written at once
   * (a kill is rare) and sent to both and to the room (the name colour). The victim's own death goes on through handleDeath.
   */
  private async settlePvpKill(killerId: string, victimId: string, sockets: Map<string, { ws: WebSocket; state: PlayerState }>, now: number): Promise<void> {
    const killer = sockets.get(killerId);
    const victim = sockets.get(victimId);
    if (!killer || !victim) return;
    const victimSn = this.satNhanOf(victim.state, now);
    const hitMeAt = this.blows.get(`${victimId}>${killerId}`);
    // Self defence: the victim hit the killer in the last 3 minutes and was showing white or yellow to the killer.
    const selfDefense = nameTier(victimSn) <= 1 && hitMeAt !== undefined && now - hitMeAt < GRAY_WINDOW_MS;
    const killerSn = this.satNhanOf(killer.state, now);
    const r = applyPvpKill(this.pkScoresOf(killer.state, now), this.pkScoresOf(victim.state, now), victimSn, selfDefense, killerSn);
    for (const [entry, scores] of [[killer, r.killer], [victim, r.victim]] as const) {
      const apply = (s: PlayerState) => {
        s.sk = scores.satKhi;
        s.sn = scores.satNhan;
        s.snAt = now;
        s.ah = scores.hero;
        s.pkDirty = true;
      };
      // The live attachment gets the scores (not a stale copy that could undo what this tick already did to it), and the copy the tick
      // works with gets them too, so the victim's handoff, which writes that copy back, keeps them.
      this.patchState(entry.ws, apply);
      apply(entry.state);
      this.sim?.setPk(entry.state.id, { satKhi: scores.satKhi, hero: scores.hero, satNhan: scores.satNhan, satNhanAt: now });
      this.send(entry.ws, { t: "pk", mode: entry.state.pk ?? 0, satKhi: scores.satKhi, satNhan: Math.round(scores.satNhan), hero: scores.hero });
      this.broadcast({ t: "pk_score", id: entry.state.id, sn: Math.round(scores.satNhan) });
    }
    this.blows.delete(`${killerId}>${victimId}`);
    this.blows.delete(`${victimId}>${killerId}`);
    this.sim?.clearQuarrel(killerId, victimId);
    // Both sides drop the "attacked me" mark (the grey name) at once; the clients reset it on this message.
    this.sendToCharacter(killerId, { t: "pk_clear", id: victimId });
    this.sendToCharacter(victimId, { t: "pk_clear", id: killerId });
    await Promise.all([killer, victim].map((e) => this.flushPk(e.state)));
  }

  /** A player killed a guard: sát khí and sát nhân rise like for a white name (applyGuardKill), written at once and sent like after a PvP kill. */
  private async settleGuardKill(killerId: string, sockets: Map<string, { ws: WebSocket; state: PlayerState }>, now: number): Promise<void> {
    const killer = sockets.get(killerId);
    if (!killer) return;
    const sn = this.satNhanOf(killer.state, now);
    const r = applyGuardKill(this.pkScoresOf(killer.state, now), sn);
    const apply = (s: PlayerState) => {
      s.sk = r.satKhi;
      s.sn = r.satNhan;
      s.snAt = now;
      s.ah = r.hero;
      s.pkDirty = true;
    };
    this.patchState(killer.ws, apply);
    apply(killer.state);
    this.sim?.setPk(killerId, { satKhi: r.satKhi, hero: r.hero, satNhan: r.satNhan, satNhanAt: now });
    this.send(killer.ws, { t: "pk", mode: killer.state.pk ?? 0, satKhi: r.satKhi, satNhan: Math.round(r.satNhan), hero: r.hero });
    this.broadcast({ t: "pk_score", id: killerId, sn: Math.round(r.satNhan) });
    await this.flushPk(killer.state);
  }

  private async handleAttack(ws: WebSocket, state: PlayerState, monsterId: string): Promise<void> {
    try {
      await this.wake(state.mapId);
    } catch (err) {
      console.error("wake failed", err);
      return;
    }
    const sim = this.sim;
    const profile = sim?.getPlayer(state.id);
    if (!sim || !profile) return void (isMonsterId(monsterId) ? undefined : this.send(ws, { t: "pk_error", reason: "safe" }));
    const now = Date.now();
    if (profile.dead || now - profile.lastAttackMsgAt < ATTACK_MIN_GAP_MS) return;
    if (!isMonsterId(monsterId)) {
      // Another player: the PK switch must be on, and neither side may be under the newbie protection (the sim checks the same rules every blow).
      const target = sim.getPlayer(monsterId);
      if (!target) return void this.send(ws, { t: "pk_error", reason: "invalid" });
      if (isPkProtected(profile.realm, profile.stage) || isPkProtected(target.realm, target.stage)) return void this.send(ws, { t: "pk_error", reason: "protected" });
      if (!sim.pvpAllowed(profile, target)) return void this.send(ws, { t: "pk_error", reason: "off" });
    }
    if (state.bt) await this.interruptBreakthrough(state.id, "moved");
    if (state.tp) await this.interruptTalisman(state.id, "moved");
    profile.lastAttackMsgAt = now;
    sim.setTarget(state.id, monsterId);
  }

  private players(): PlayerState[] {
    const result: PlayerState[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const s = ws.deserializeAttachment() as PlayerState | null;
      if (s) result.push(s);
    }
    return result;
  }

  private snapshot(p: PlayerState): PlayerSnapshot {
    return { id: p.id, name: p.name, path: p.path, ageMs: Date.now() - p.startedAt, speed: p.speed, sn: Math.round(this.satNhanOf(p, Date.now())), ...(p.pk ? { pk: p.pk } : {}) };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closing; ignore.
    }
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      if (!ws.deserializeAttachment()) continue;
      try {
        ws.send(data);
      } catch {
        // Ignore dead sockets.
      }
    }
  }
}

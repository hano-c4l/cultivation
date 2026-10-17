import { DurableObject } from "cloudflare:workers";
import {
  ALLOCATE_MIN_GAP_MS,
  ATTACK_MIN_GAP_MS,
  BASE_SPEED,
  CHAT_BURST,
  CHAT_MIN_GAP_MS,
  CHAT_WINDOW_MS,
  checkChatRate,
  EMPTY_WALLET,
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
import { filterChat } from "./chat";
import {
  allocatePoints,
  getCharacterById,
  saveCharacterPosition,
  saveCharacterProgress,
  toCharacterSheet,
  type CharacterRow,
} from "./characters";
import { applyCurrencyDelta, getWallet } from "./economy";
import { CombatSim, type PlayerProfile, type ProfileSeed, type SimEvent } from "./combat-sim";
import type { Env } from "./env";

/** Per-socket state persisted via the hibernation attachment, so the DO can sleep safely. */
interface PlayerState {
  /** Character id. */
  id: string;
  name: string;
  /** Lock claim id of this connection, kept so the lock can be released after a wake-up. */
  claimId: string;
  mapId: MapId;
  path: Vec2[];
  startedAt: number;
  speed: number;
  lastMoveAt: number;
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

/** Moves are saved at most this often per room, so D1 writes stay low and the room can still hibernate. */
const SAVE_DEBOUNCE_MS = 10_000;

function baseOf(row: CharacterRow): BaseStats {
  return toCharacterSheet(row).base;
}

function seedOf(row: CharacterRow): ProfileSeed {
  return {
    id: row.id,
    name: row.name,
    potentialPoints: row.potential_points,
    element: row.spiritual_root,
    base: baseOf(row),
    rootGrade: row.root_grade,
    realm: row.realm,
    stage: row.stage,
    exp: row.exp,
  };
}

function sheetOf(p: PlayerProfile): CharacterSheet {
  return {
    id: p.id,
    name: p.name,
    spiritualRoot: p.element,
    rootGrade: p.rootGrade,
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
      const row = await getCharacterById(this.env.DB, characterId);
      if (!row) {
        await lock.release(claimId);
        return new Response("No such character", { status: 404 });
      }
      // The Worker routes by the saved map; a mismatch means the character moved during this login (portal in flight).
      if (room.split(":")[0] !== row.map_id) {
        await lock.release(claimId);
        return new Response("Wrong map", { status: 409 });
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

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      const position = restorePosition(map, row.x, row.y);
      const state: PlayerState = {
        id: row.id,
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
      const profile = sim ? (sim.getPlayer(row.id) ?? sim.addPlayer(seedOf(row))) : undefined;
      if (sim) this.startTick();
      const maxHp = profile?.maxHp ?? deriveStats(baseOf(row), row.realm, row.stage, row.root_grade).maxHp;
      this.send(server, {
        t: "welcome",
        self: state.id,
        map: mapId,
        players,
        colo,
        character: toCharacterSheet(row),
        monsters: sim?.snapshots(Date.now()) ?? [],
        hp: profile?.hp ?? maxHp,
        maxHp,
        wallet,
      });
      this.broadcast({ t: "joined", player: this.snapshot(state) }, server);
      return new Response(null, { status: 101, webSocket: client });
    } catch (err) {
      await lock.release(claimId);
      throw err;
    }
  }

  /** Called by CharacterLock when the same character connects elsewhere: save, then kick the old socket. */
  async evictCharacter(characterId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as PlayerState | null;
      if (!state || state.id !== characterId) continue;
      ws.serializeAttachment(null);
      await this.save(state);
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
    }
  }

  private async handleMove(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "move" }>): Promise<void> {
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
  private async handoff(ws: WebSocket, state: PlayerState, toMap: MapId, x: number, y: number, closeOnFail = false): Promise<void> {
    state.transferring = true;
    // The destination row is written below; a pending debounced save must not overwrite it with the old map.
    state.dirty = false;
    ws.serializeAttachment(state);
    const progress = this.sim?.beginFlush(state.id) ?? undefined;
    try {
      await saveCharacterPosition(this.env.DB, state.id, toMap, x, y, progress);
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
      return;
    }
    if (progress) this.sim?.endFlush(state.id, progress, true);
    ws.serializeAttachment(null);
    this.dropPlayer(state.id);
    this.broadcast({ t: "left", id: state.id }, ws);
    this.send(ws, { t: "transfer", map: toMap });
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
    try {
      ws.close(4002, "transfer");
    } catch {
      // Already closed.
    }
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
      } else {
        this.send(ws, { t: "stats", character: toCharacterSheet(row) });
      }
    } catch (err) {
      console.error("allocate failed", state.id, err);
    }
  }

  /** Debounced save of every player whose position changed. */
  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as PlayerState | null;
      if (!state) continue;
      const profile = this.sim?.getPlayer(state.id);
      if (!state.dirty && !profile?.expDirty && !profile?.pendingPoints) continue;
      state.dirty = false;
      ws.serializeAttachment(state);
      await this.save(state);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.handleLeave(ws);
    // 1005/1006 are reserved and cannot be sent in a close frame.
    ws.close(code >= 1000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleLeave(ws);
  }

  private async handleLeave(ws: WebSocket): Promise<void> {
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state) return; // already evicted or never joined
    this.broadcast({ t: "left", id: state.id }, ws);
    // Keep the attachment until the save finished: a claim arriving meanwhile must still find this
    // socket in evictCharacter() and wait for a save before the new room reads the character row.
    await this.save(state);
    ws.serializeAttachment(null);
    this.dropPlayer(state.id);
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
  }

  /** Persists the current tile and any unwritten progression. Failures are logged; the next save or disconnect retries. */
  private async save(state: PlayerState): Promise<void> {
    if (state.transferring) return; // the handoff owns the row until it completes
    const pos = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    const progress = this.sim?.beginFlush(state.id) ?? undefined;
    try {
      await saveCharacterPosition(this.env.DB, state.id, state.mapId, round2(pos.x), round2(pos.y), progress);
      if (progress) this.sim?.endFlush(state.id, progress, true);
    } catch (err) {
      console.error("save failed", state.id, err);
      if (progress) this.sim?.endFlush(state.id, progress, false);
    }
  }

  // --- combat -------------------------------------------------------------------------------------------------

  private ensureSim(mapId: MapId, ranks?: Record<string, MonsterRank>): CombatSim | null {
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
    const stored = await this.ctx.storage.get<Record<string, MonsterRank>>("ranks");
    if (this.sim) return; // another path created it while storage was read
    const sim = this.ensureSim(mapId, stored)!;
    this.ranksJson = stored ? JSON.stringify(stored) : null;
    try {
      const present = this.players().filter((p) => !p.transferring);
      const rows = await Promise.all(present.map((p) => getCharacterById(this.env.DB, p.id)));
      const stillHere = new Set(this.players().filter((p) => !p.transferring).map((p) => p.id));
      for (const row of rows) if (row && stillHere.has(row.id) && !sim.getPlayer(row.id)) sim.addPlayer(seedOf(row));
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
    await Promise.all([
      this.alarm(),
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

  /** Dev-only (see /api/dev/evict): imitates the runtime evicting a paused object, which wrangler dev does not do reliably. */
  devEvict(): boolean {
    if (this.tickTimer || !this.sim) return false;
    this.sim = null;
    this.ranksJson = null;
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
      case "hit":
        return this.broadcast({ t: "hit", from: ev.from, to: ev.to, kind: ev.kind, damage: ev.damage, hp: ev.hp });
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
        if (ev.stagesGained > 0) later.push(this.flushProgress(entry.state.id));
        else later.push(this.ensureSaveAlarm(now));
        return;
      }
      case "drop":
        this.enqueueDrop(ev.playerId, ev.amount);
        return;
      case "player_dead": {
        const entry = sockets.get(ev.playerId);
        const profile = this.sim?.getPlayer(ev.playerId);
        if (!entry || !profile) return;
        later.push(this.handleDeath(entry.ws, entry.state, profile));
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
   * only, PLAN section 3), but off the tick's critical path. A drop still failing after the retries is lost, never doubled.
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
  private async handleDeath(ws: WebSocket, state: PlayerState, profile: PlayerProfile): Promise<void> {
    const expLost = expLostOnDeath(profile.exp);
    this.sim?.applyDeathPenalty(state.id, expLost);
    this.send(ws, { t: "died", expLost });
    const [sx, sy] = getMap("town").spawn;
    await this.handoff(ws, state, "town", sx + 0.5, sy + 0.5, true);
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

  private async handleAttack(ws: WebSocket, state: PlayerState, monsterId: string): Promise<void> {
    try {
      await this.wake(state.mapId);
    } catch (err) {
      console.error("wake failed", err);
      return;
    }
    const sim = this.sim;
    const profile = sim?.getPlayer(state.id);
    if (!sim || !profile) return;
    const now = Date.now();
    if (profile.dead || now - profile.lastAttackMsgAt < ATTACK_MIN_GAP_MS) return;
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
    return { id: p.id, name: p.name, path: p.path, ageMs: Date.now() - p.startedAt, speed: p.speed };
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

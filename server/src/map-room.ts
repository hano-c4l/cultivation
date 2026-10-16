import { DurableObject } from "cloudflare:workers";
import {
  BASE_SPEED,
  CHAT_BURST,
  CHAT_MIN_GAP_MS,
  CHAT_WINDOW_MS,
  MAX_DESYNC_TILES,
  MIN_MOVE_INTERVAL_MS,
  PING_MESSAGE,
  PONG_MESSAGE,
  findPath,
  getMap,
  isMapId,
  isWalkable,
  parseClientMessage,
  portalNear,
  positionAlongPath,
  type ClientMessage,
  type MapId,
  type PlayerSnapshot,
  type ServerMessage,
  type Tile,
} from "@game/shared";
import { filterChat } from "./chat";
import { getCharacterById, saveCharacterPosition } from "./characters";
import type { Env } from "./env";

/** Per-socket state persisted via the hibernation attachment, so the DO can sleep safely. */
interface PlayerState {
  /** Character id. */
  id: string;
  name: string;
  /** Lock claim id of this connection, kept so the lock can be released after a wake-up. */
  claimId: string;
  mapId: MapId;
  path: Tile[];
  startedAt: number;
  speed: number;
  lastMoveAt: number;
  /** Position changed since the last save to D1. */
  dirty: boolean;
  /** Set while a portal transfer is in flight so moves and repeated portal requests are ignored. */
  transferring?: boolean;
  /** Timestamps of recent chat messages, for rate limiting. */
  chatTimes: number[];
}

/** Moves are saved at most this often per room, so D1 writes stay low and the room can still hibernate. */
const SAVE_DEBOUNCE_MS = 10_000;

export class MapRoom extends DurableObject<Env> {
  private colo: string | null = null;

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

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      // The Worker routes by the character's saved map, so the row's map is this room's map.
      const mapId: MapId = isMapId(row.map_id) ? row.map_id : "town";
      const map = getMap(mapId);
      const tile: Tile = isWalkable(map, row.x, row.y) ? [row.x, row.y] : map.spawn;
      const state: PlayerState = {
        id: row.id,
        name: row.name,
        claimId,
        mapId,
        path: [tile],
        startedAt: Date.now(),
        speed: BASE_SPEED,
        lastMoveAt: 0,
        dirty: false,
        chatTimes: [],
      };
      server.serializeAttachment(state);
      // Includes the joining player so the client gets its own authoritative snapshot.
      const players = this.players().map((p) => this.snapshot(p));
      this.send(server, { t: "welcome", self: state.id, map: mapId, players, colo });
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
        return this.handleMove(ws, state, msg);
      case "portal":
        return this.handlePortal(ws, state);
      case "chat":
        return this.handleChat(ws, state, msg.text);
    }
  }

  private async handleMove(ws: WebSocket, state: PlayerState, msg: Extract<ClientMessage, { t: "move" }>): Promise<void> {
    const map = getMap(state.mapId);
    const now = Date.now();
    // The mover predicts locally, so it only needs a payload when its move was corrected or rejected.
    const reject = () => this.send(ws, { t: "ack", seq: msg.seq, player: this.snapshot(state) });
    if (now - state.lastMoveAt < MIN_MOVE_INTERVAL_MS) return reject();
    if (!isWalkable(map, msg.x, msg.y)) return reject();
    const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
    const serverTile: Tile = [Math.floor(here.x), Math.floor(here.y)];
    // Trust the client's start tile when it is close to the server's view (latency drift), so the
    // client's prediction and the server path start from the same tile and nothing is pulled back.
    // TODO(phase 1): add a movement budget so repeated claims cannot be chained into a speed hack.
    const claimedOk =
      isWalkable(map, msg.fx, msg.fy) && Math.hypot(msg.fx - serverTile[0], msg.fy - serverTile[1]) <= MAX_DESYNC_TILES;
    const from: Tile = claimedOk ? [msg.fx, msg.fy] : serverTile;
    const path = findPath(map, from, [msg.x, msg.y]);
    if (!path) return reject();
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

  /** Map handoff: save at the destination, detach, release the lock, then tell the client to reconnect. */
  private async handlePortal(ws: WebSocket, state: PlayerState): Promise<void> {
    const here = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    const portal = portalNear(getMap(state.mapId), here.x, here.y);
    if (!portal) return;
    state.transferring = true;
    // The destination row is written below; a pending debounced save must not overwrite it with the old map.
    state.dirty = false;
    ws.serializeAttachment(state);
    try {
      await saveCharacterPosition(this.env.DB, state.id, portal.toMap, portal.toX, portal.toY);
    } catch (err) {
      console.error("portal save failed", state.id, err);
      state.transferring = false;
      ws.serializeAttachment(state);
      return;
    }
    ws.serializeAttachment(null);
    this.broadcast({ t: "left", id: state.id }, ws);
    this.send(ws, { t: "transfer", map: portal.toMap });
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
    try {
      ws.close(4002, "transfer");
    } catch {
      // Already closed.
    }
  }

  private handleChat(ws: WebSocket, state: PlayerState, text: string): void {
    const now = Date.now();
    const recent = state.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
    const last = recent[recent.length - 1];
    if (recent.length >= CHAT_BURST || (last !== undefined && now - last < CHAT_MIN_GAP_MS)) {
      return this.send(ws, { t: "chat_error", reason: "rate" });
    }
    recent.push(now);
    state.chatTimes = recent;
    ws.serializeAttachment(state);
    // Room-local chat: only players on this map channel receive it.
    this.broadcast({ t: "chat", id: state.id, name: state.name, text: filterChat(text), ts: now });
  }

  /** Debounced save of every player whose position changed. */
  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as PlayerState | null;
      if (!state?.dirty) continue;
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
    await this.env.CHAR_LOCK.get(this.env.CHAR_LOCK.idFromName(state.id)).release(state.claimId);
  }

  /** Persists the current tile. Failures are logged; the next debounced save or disconnect retries. */
  private async save(state: PlayerState): Promise<void> {
    if (state.transferring) return; // the portal handler owns the row until the handoff completes
    const pos = positionAlongPath(state.path, Date.now() - state.startedAt, state.speed);
    try {
      await saveCharacterPosition(this.env.DB, state.id, state.mapId, Math.floor(pos.x), Math.floor(pos.y));
    } catch (err) {
      console.error("save failed", state.id, err);
    }
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

import { DurableObject } from "cloudflare:workers";
import {
  BASE_SPEED,
  MAX_DESYNC_TILES,
  MIN_MOVE_INTERVAL_MS,
  findPath,
  getMap,
  isWalkable,
  parseClientMessage,
  positionAlongPath,
  type MapData,
  type PlayerSnapshot,
  type ServerMessage,
  type Tile,
} from "@game/shared";

/** Per-socket state persisted via the hibernation attachment, so the DO can sleep safely. */
interface PlayerState {
  id: string;
  name: string;
  path: Tile[];
  startedAt: number;
  speed: number;
  lastMoveAt: number;
}

const MAP_ID = "town";

export class MapRoom extends DurableObject {
  private readonly map: MapData = getMap(MAP_ID);
  private colo: string | null = null;

  /** Cloudflare data centre this Durable Object runs in (diagnostics for latency). */
  private async getColo(): Promise<string> {
    if (this.colo) return this.colo;
    try {
      const res = await fetch("https://cloudflare.com/cdn-cgi/trace");
      const m = /^colo=(\w+)$/m.exec(await res.text());
      this.colo = m?.[1] ?? "??";
    } catch {
      this.colo = "??";
    }
    return this.colo;
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    const msg = parseClientMessage(raw);
    if (!msg) return;

    if (msg.t === "ping") {
      this.send(ws, { t: "pong", c: msg.c });
      return;
    }

    const state = ws.deserializeAttachment() as PlayerState | null;

    if (msg.t === "join") {
      if (state) return; // already joined on this socket
      // Single writer per character: kick any older socket with the same id.
      for (const other of this.ctx.getWebSockets()) {
        const o = other.deserializeAttachment() as PlayerState | null;
        if (o && o.id === msg.id) {
          this.send(other, { t: "kicked", reason: "duplicate-login" });
          other.serializeAttachment(null);
          other.close(4000, "duplicate-login");
          this.broadcast({ t: "left", id: o.id }, other);
        }
      }
      const fresh: PlayerState = {
        id: msg.id,
        name: msg.name,
        path: [this.map.spawn],
        startedAt: Date.now(),
        speed: BASE_SPEED,
        lastMoveAt: 0,
      };
      ws.serializeAttachment(fresh);
      // Includes the joining player so the client gets its own authoritative snapshot.
      const players = this.players().map((p) => this.snapshot(p));
      this.send(ws, { t: "welcome", self: fresh.id, map: this.map.id, players, colo: await this.getColo() });
      this.broadcast({ t: "joined", player: this.snapshot(fresh) }, ws);
      return;
    }

    if (!state) return; // must join first

    if (msg.t === "move") {
      const now = Date.now();
      // The mover predicts locally, so it only needs a payload when its move was corrected or rejected.
      const reject = () => this.send(ws, { t: "ack", seq: msg.seq, player: this.snapshot(state) });
      if (now - state.lastMoveAt < MIN_MOVE_INTERVAL_MS) return reject();
      if (!isWalkable(this.map, msg.x, msg.y)) return reject();
      const here = positionAlongPath(state.path, now - state.startedAt, state.speed);
      const serverTile: Tile = [Math.floor(here.x), Math.floor(here.y)];
      // Trust the client's start tile when it is close to the server's view (latency drift), so the
      // client's prediction and the server path start from the same tile and nothing is pulled back.
      // TODO(phase 1): add a movement budget so repeated claims cannot be chained into a speed hack.
      const claimedOk =
        isWalkable(this.map, msg.fx, msg.fy) &&
        Math.hypot(msg.fx - serverTile[0], msg.fy - serverTile[1]) <= MAX_DESYNC_TILES;
      const from: Tile = claimedOk ? [msg.fx, msg.fy] : serverTile;
      const path = findPath(this.map, from, [msg.x, msg.y]);
      if (!path) return reject();
      state.path = path;
      state.startedAt = now;
      state.lastMoveAt = now;
      ws.serializeAttachment(state);
      // Others get the new path; the mover only gets the track back if its start tile was overridden.
      this.broadcast({ t: "path", player: this.snapshot(state) }, ws);
      this.send(ws, claimedOk ? { t: "ack", seq: msg.seq } : { t: "ack", seq: msg.seq, player: this.snapshot(state) });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.handleLeave(ws);
    // 1005/1006 are reserved and cannot be sent in a close frame.
    ws.close(code >= 1000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  private handleLeave(ws: WebSocket): void {
    const state = ws.deserializeAttachment() as PlayerState | null;
    if (!state) return;
    ws.serializeAttachment(null);
    this.broadcast({ t: "left", id: state.id }, ws);
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

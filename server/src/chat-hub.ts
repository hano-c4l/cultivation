import { DurableObject } from "cloudflare:workers";
import {
  PING_MESSAGE,
  PONG_MESSAGE,
  WORLD_CHAT_BURST,
  WORLD_CHAT_MIN_GAP_MS,
  WORLD_CHAT_WINDOW_MS,
  CHAT_BURST,
  CHAT_MIN_GAP_MS,
  CHAT_WINDOW_MS,
  checkChatRate,
  parseClientMessage,
  type ServerMessage,
} from "@game/shared";
import { filterChat } from "./chat";
import type { Env } from "./env";

/** Per-socket state kept in the hibernation attachment. */
interface ChatSocket {
  id: string;
  name: string;
  worldTimes: number[];
  whisperTimes: number[];
}

/** Close code sent to an older chat socket of the same character; the client must not reconnect after it. */
export const CHAT_REPLACED_CODE = 4001;

/**
 * World chat and whispers. Every logged-in client keeps one WebSocket here next to its map socket, so a world
 * message is a single incoming WebSocket message plus local sends: no map room is woken and no RPC is made (RPCs
 * are billed one request each, and would also wake hibernating or paused rooms). Map chat stays in the MapRoom.
 * "Online" for whispers simply means "has a chat socket". One object serves everyone; it is the throughput limit
 * of world chat and should be sharded if the player count ever makes that matter.
 */
export class ChatHub extends DurableObject<Env> {
  /**
   * World timestamps by character, kept across reconnects while the object stays awake. The attachment carries the
   * same data across hibernation. Together a reconnect only resets the limit if the hub also slept in between.
   */
  private worldByChar = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_MESSAGE, PONG_MESSAGE));
  }

  /** The Worker authenticates the cookie and sets these headers; clients cannot reach this object directly. */
  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get("x-char-id");
    const encodedName = request.headers.get("x-char-name");
    if (!id || !encodedName) return new Response("Forbidden", { status: 403 });
    let name: string;
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      return new Response("Forbidden", { status: 403 });
    }

    // The newest connection wins, otherwise whispers would reach two clients of the same character.
    for (const old of this.ctx.getWebSockets(id)) {
      // `kicked` is what stops the client from reconnecting; the close code alone is not reliable (a client may only
      // see the close event after its own handshake completes).
      this.send(old, { t: "kicked", reason: "duplicate-chat" });
      try {
        old.close(CHAT_REPLACED_CODE, "replaced");
      } catch {
        // Already closed.
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [id]);
    const attachment: ChatSocket = { id, name, worldTimes: this.worldByChar.get(id) ?? [], whisperTimes: [] };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    const self = ws.deserializeAttachment() as ChatSocket | null;
    if (!self) return;
    const msg = parseClientMessage(raw);
    if (!msg || msg.t !== "chat" || msg.channel === "map") return; // the hub serves world and whisper only

    const now = Date.now();
    const text = filterChat(msg.text);
    if (msg.channel === "world") {
      // Both records may be missing part of the history (a new socket, or the hub slept), so use their union.
      const history = [...new Set([...(this.worldByChar.get(self.id) ?? []), ...self.worldTimes])].sort((a, b) => a - b);
      const times = checkChatRate(history, now, {
        burst: WORLD_CHAT_BURST,
        windowMs: WORLD_CHAT_WINDOW_MS,
        minGapMs: WORLD_CHAT_MIN_GAP_MS,
      });
      if (!times) return this.send(ws, { t: "chat_error", reason: "rate" });
      self.worldTimes = times;
      this.worldByChar.set(self.id, times);
      if (this.worldByChar.size > 500) {
        for (const [id, list] of this.worldByChar) if (now - (list[list.length - 1] ?? 0) >= WORLD_CHAT_WINDOW_MS) this.worldByChar.delete(id);
      }
      ws.serializeAttachment(self);
      this.broadcast({ t: "chat", channel: "world", id: self.id, name: self.name, text, ts: now });
      return;
    }

    // Whisper: find the recipient's socket by name (names are unique, compared without case).
    const times = checkChatRate(self.whisperTimes, now, { burst: CHAT_BURST, windowMs: CHAT_WINDOW_MS, minGapMs: CHAT_MIN_GAP_MS });
    if (!times) return this.send(ws, { t: "chat_error", reason: "rate" });
    const wanted = (msg.to ?? "").toLocaleLowerCase("vi");
    if (wanted === self.name.toLocaleLowerCase("vi")) return this.send(ws, { t: "chat_error", reason: "invalid" });
    let target: WebSocket | null = null;
    let targetName = "";
    for (const other of this.ctx.getWebSockets()) {
      const o = other.deserializeAttachment() as ChatSocket | null;
      if (o && o.name.toLocaleLowerCase("vi") === wanted) {
        target = other;
        targetName = o.name;
        break;
      }
    }
    if (!target) return this.send(ws, { t: "chat_error", reason: "offline" });
    self.whisperTimes = times;
    ws.serializeAttachment(self);
    this.send(target, { t: "chat", channel: "whisper", id: self.id, name: self.name, text, ts: now });
    this.send(ws, { t: "chat", channel: "whisper", id: self.id, name: self.name, text, ts: now, toName: targetName });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1005/1006 are reserved and cannot be sent in a close frame.
    try {
      ws.close(code >= 1000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000, reason);
    } catch {
      // Already closed.
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closing; ignore.
    }
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Socket already closing; ignore.
      }
    }
  }
}

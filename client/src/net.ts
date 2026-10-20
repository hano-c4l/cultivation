import { PING_MESSAGE, PONG_MESSAGE, type ClientMessage, type ServerMessage } from "@game/shared";

export interface NetHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(connected: boolean): void;
  onPong(): void;
  /** The session cookie is no longer valid (logged out elsewhere or expired). */
  onAuthLost(): void;
}

/** WebSocket wrapper with automatic reconnect (the server re-sends a full welcome on connect). */
export class Net {
  private ws: WebSocket | null = null;
  private retryMs = 500;
  private closedForGood = false;
  /** How the last socket ended and when: reported to the server after the next successful connect. */
  private lastClose: { code: number; reason: string; clean: boolean; at: number } | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: NetHandlers,
  ) {}

  connect(): void {
    // A reconnect scheduled before close() or a `kicked` must not reopen the socket (it would kick the active tab's).
    if (this.closedForGood) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      if (this.lastClose) {
        const c = this.lastClose;
        this.lastClose = null;
        console.warn(`[net] reconnected after ${Date.now() - c.at} ms (previous socket closed: code ${c.code}, clean ${c.clean}, reason "${c.reason}")`);
        ws.send(JSON.stringify({ t: "conn_report", code: c.code, reason: c.reason, clean: c.clean, downMs: Date.now() - c.at } satisfies ClientMessage));
      }
      this.retryMs = 500;
      this.handlers.onStatus(true);
    });
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      if (ev.data === PONG_MESSAGE) {
        this.handlers.onPong();
        return;
      }
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.t === "kicked") this.closedForGood = true;
        this.handlers.onMessage(msg);
      } catch {
        // Ignore malformed server frames.
      }
    });
    ws.addEventListener("close", (ev) => {
      // 4001: the server replaced this socket with a newer one of the same character; reconnecting would start a tug of war.
      if (ev.code === 4001) this.closedForGood = true;
      this.lastClose = { code: ev.code, reason: ev.reason ?? "", clean: ev.wasClean, at: Date.now() };
      console.warn(`[net] socket closed: code ${ev.code}, clean ${ev.wasClean}, reason "${ev.reason}"`);
      this.handlers.onStatus(false);
      if (this.closedForGood) return;
      void this.reconnectLater();
    });
  }

  private async reconnectLater(): Promise<void> {
    // A refused upgrade (401) looks like any close; check the session so we show login instead of looping.
    const me = await fetch("/api/me", { credentials: "same-origin" }).catch(() => null);
    if (me && me.status === 401) return this.handlers.onAuthLost();
    setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 5000);
  }

  /** Stops for good: closes the socket and never reconnects. */
  close(): void {
    this.closedForGood = true;
    this.ws?.close();
  }

  /** Sends the plain-string keep-alive that the server answers without waking the room. */
  sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(PING_MESSAGE);
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

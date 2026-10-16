import type { ClientMessage, ServerMessage } from "@game/shared";

export interface NetHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(connected: boolean): void;
}

/** WebSocket wrapper with automatic reconnect (the server re-sends a full welcome on join). */
export class Net {
  private ws: WebSocket | null = null;
  private retryMs = 500;
  private closedForGood = false;

  constructor(
    private readonly url: string,
    private readonly identity: { id: string; name: string },
    private readonly handlers: NetHandlers,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.retryMs = 500;
      this.send({ t: "join", id: this.identity.id, name: this.identity.name });
      this.handlers.onStatus(true);
    });
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.t === "kicked") this.closedForGood = true;
        this.handlers.onMessage(msg);
      } catch {
        // Ignore malformed server frames.
      }
    });
    ws.addEventListener("close", () => {
      this.handlers.onStatus(false);
      if (this.closedForGood) return;
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 5000);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

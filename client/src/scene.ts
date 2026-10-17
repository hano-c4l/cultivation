import Phaser from "phaser";
import {
  TILE_H,
  TILE_W,
  MIN_MOVE_INTERVAL_MS,
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
import { DEFAULT_CHANNEL } from "./config";
import { vi } from "./locales/vi";
import { Net } from "./net";

const FONT = '"Be Vietnam Pro", system-ui, sans-serif';

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
  private selfId = "";
  private net!: Net;
  private chat!: ChatUi;
  private charPanel!: CharacterPanel;
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
    this.chat = initChat((text) => this.net.send({ t: "chat", text }));
    this.charPanel = initCharacterPanel((points) => this.net.send({ t: "allocate", points }));

    const camera = this.cameras.main;
    const center = toScreen(this.map.spawn[0] + 0.5, this.map.spawn[1] + 0.5);
    camera.centerOn(center.x, center.y);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));

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

    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        this.pingSentAt = performance.now();
        this.net.sendPing();
      },
    });
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

  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.transferring) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const t = toTile(world.x, world.y);
    // Exact click point (not snapped to a tile centre); 2 decimals keeps messages small.
    const tx = Math.round(t.x * 100) / 100;
    const ty = Math.round(t.y * 100) / 100;
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
        this.colo = msg.colo;
        this.transferring = false;
        this.portalSentAt = 0;
        this.switchMap(msg.map);
        this.clearActors();
        this.upsertActor(msg.players);
        this.charPanel.update(msg.character);
        this.refreshHud();
        break;
      case "stats":
        this.charPanel.update(msg.character);
        break;
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
        break;
      case "transfer":
        // The server closes the socket right after; Net reconnects and the welcome brings the new map.
        this.transferring = true;
        this.hud.textContent = vi.transferring;
        break;
      case "chat":
        this.chat.add(msg.name, msg.text, msg.id === this.selfId);
        break;
      case "chat_error":
        this.chat.system(msg.reason === "rate" ? vi.chatRateLimited : vi.chatInvalid);
        break;
    }
  }

  private refreshHud(): void {
    const where = vi.maps[this.map.id] ?? this.map.id;
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

    // Standing still on a portal tile asks the server to transfer us (the server re-checks the position).
    const self = this.actors.get(this.selfId);
    // Retry after 1.5 s in case the server's (slightly lagging) position was not yet in range.
    if (self && !this.transferring && now - this.portalSentAt > 1500) {
      const pos = currentPos(self, now);
      if (!pos.moving && portalNear(this.map, pos.x, pos.y)) {
        this.portalSentAt = now;
        this.net.send({ t: "portal" });
      }
    }
  }
}

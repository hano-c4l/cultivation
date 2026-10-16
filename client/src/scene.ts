import Phaser from "phaser";
import {
  TILE_H,
  TILE_W,
  findPath,
  getMap,
  isWalkable,
  positionAlongPath,
  type PlayerSnapshot,
  type ServerMessage,
  type Tile,
} from "@game/shared";
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
  path: Tile[];
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
function applyTrack(actor: Actor, path: Tile[], startedAt: number, speed: number, now: number): void {
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

/** Guest identity is per tab (sessionStorage) so two tabs can play as two characters; accounts replace this in Phase 1. */
function loadIdentity(): { id: string; name: string } {
  try {
    const stored = sessionStorage.getItem("tt.identity");
    if (stored) return JSON.parse(stored) as { id: string; name: string };
  } catch {
    // Storage unavailable; fall through to an ephemeral identity.
  }
  const identity = {
    id: crypto.randomUUID(),
    name: `${vi.guestPrefix} ${Math.floor(1000 + Math.random() * 9000)}`,
  };
  try {
    sessionStorage.setItem("tt.identity", JSON.stringify(identity));
  } catch {
    // Ignore.
  }
  return identity;
}

export class GameScene extends Phaser.Scene {
  private readonly map = getMap("town");
  private actors = new Map<string, Actor>();
  private selfId = "";
  private net!: Net;
  private hud!: HTMLElement;
  private ping = 0;
  private colo = "…";
  private marker!: Phaser.GameObjects.Graphics;

  constructor() {
    super("game");
  }

  create(): void {
    this.hud = document.getElementById("hud")!;
    this.drawMap();
    this.marker = this.add.graphics().setDepth(1);

    const camera = this.cameras.main;
    const center = toScreen(this.map.spawn[0] + 0.5, this.map.spawn[1] + 0.5);
    camera.centerOn(center.x, center.y);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleClick(pointer));

    const identity = loadIdentity();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.net = new Net(`${proto}://${location.host}/ws?map=town&ch=1`, identity, {
      onMessage: (msg) => this.handleMessage(msg),
      onStatus: (connected) => {
        if (!connected) {
          this.hud.textContent = vi.disconnected;
          this.clearActors();
        }
      },
    });
    this.net.connect();

    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => this.net.send({ t: "ping", c: Math.round(performance.now()) }),
    });
  }

  private drawMap(): void {
    const g = this.add.graphics().setDepth(0);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const walk = isWalkable(this.map, x, y);
        const p = toScreen(x, y);
        const shade = (x + y) % 2 === 0 ? 0x3d5a3a : 0x38553a;
        g.fillStyle(walk ? shade : 0x5a4a3a, 1);
        g.lineStyle(1, 0x000000, 0.18);
        const pts = [
          new Phaser.Math.Vector2(p.x, p.y),
          new Phaser.Math.Vector2(p.x + TILE_W / 2, p.y + TILE_H / 2),
          new Phaser.Math.Vector2(p.x, p.y + TILE_H),
          new Phaser.Math.Vector2(p.x - TILE_W / 2, p.y + TILE_H / 2),
        ];
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      }
    }
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const t = toTile(world.x, world.y);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    if (!isWalkable(this.map, tx, ty)) return;
    this.net.send({ t: "move", x: tx, y: ty });
    this.predictSelfMove(tx, ty);
    const c = toScreen(tx + 0.5, ty + 0.5);
    this.marker.clear().lineStyle(2, 0xffe08a, 1).strokeEllipse(c.x, c.y, TILE_W * 0.5, TILE_H * 0.5);
    this.time.delayedCall(500, () => this.marker.clear());
  }

  /** Starts walking immediately using the same A* as the server; the server's path later corrects any drift. */
  private predictSelfMove(tx: number, ty: number): void {
    const self = this.actors.get(this.selfId);
    if (!self) return;
    const now = performance.now();
    const here = currentPos(self, now);
    const path = findPath(this.map, [Math.floor(here.x), Math.floor(here.y)], [tx, ty]);
    if (path) applyTrack(self, path, now, self.speed, now);
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "welcome":
        this.selfId = msg.self;
        this.colo = msg.colo;
        this.clearActors();
        this.upsertActor(msg.players);
        this.hud.textContent = vi.connected(this.actors.size, this.ping, this.colo);
        break;
      case "joined":
      case "path":
        this.upsertActor([msg.player]);
        this.refreshHud();
        break;
      case "left":
        this.removeActor(msg.id);
        this.refreshHud();
        break;
      case "pong":
        this.ping = Math.max(0, Math.round(performance.now()) - msg.c);
        this.refreshHud();
        break;
      case "kicked":
        this.hud.textContent = vi.kicked;
        break;
    }
  }

  private refreshHud(): void {
    this.hud.textContent = `${vi.connected(this.actors.size, this.ping, this.colo)} · ${vi.hint}`;
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
  }
}

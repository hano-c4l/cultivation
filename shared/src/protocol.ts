import type { Vec2 } from "./map";
import { isMonsterId, type HitKind } from "./combat";
import type { MonsterRank } from "./monsters";
import { parseAllocation, type CharacterSheet } from "./progression";
import type { BaseStats } from "./progression-data";

/**
 * Keep-alive and RTT probe: the runtime answers PING_MESSAGE with PONG_MESSAGE without waking the
 * Durable Object (WebSocket auto-response), so idle rooms can hibernate. Plain strings, not JSON.
 */
export const PING_MESSAGE = "ping";
export const PONG_MESSAGE = "pong";

export const MAX_MESSAGE_BYTES = 512;
export const MIN_MOVE_INTERVAL_MS = 100;
export const CHAT_MAX_LENGTH = 120;
/** At most CHAT_BURST messages per CHAT_WINDOW_MS per player, and at least CHAT_MIN_GAP_MS apart. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;
export const CHAT_MIN_GAP_MS = 500;
/** How far (tiles) the client-claimed start tile may differ from the server position and still be trusted. */
export const MAX_DESYNC_TILES = 3;
/** Minimum gap between stat allocations; each one is a D1 write. */
export const ALLOCATE_MIN_GAP_MS = 500;

export type ClientMessage =
  /** `x`/`y` is the exact destination and `fx`/`fy` the exact position the client starts from, in tile units; `seq` is echoed back in the ack. */
  | { t: "move"; x: number; y: number; fx: number; fy: number; seq: number }
  /** Ask to use the portal the character is standing on; the server verifies the position. */
  | { t: "portal" }
  | { t: "chat"; text: string }
  /** Spend potential points: stat key to points. One message per confirmation, one D1 write. */
  | { t: "allocate"; points: Partial<BaseStats> }
  /** Target a monster: the server walks into range and auto-attacks until the target dies or the player moves. */
  | { t: "attack"; id: string };

/** Snapshot of one player: where they started walking, the path, and how long ago they started. */
/** A monster: path-based like players, so clients interpolate and the server sends updates only when the path changes. */
export interface MonsterSnapshot {
  id: string;
  kind: string;
  /** Bậc 1..9 within the map's realm, and the class (normal or one of the two rare tiers). */
  tier: number;
  rank: MonsterRank;
  path: Vec2[];
  ageMs: number;
  speed: number;
  hp: number;
  maxHp: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  /** Continuous waypoints in tile units (see Vec2). */
  path: Vec2[];
  ageMs: number;
  speed: number;
}

export type ServerMessage =
  | { t: "welcome"; self: string; map: string; players: PlayerSnapshot[]; colo: string; character: CharacterSheet; monsters: MonsterSnapshot[]; hp: number; maxHp: number }
  | { t: "joined"; player: PlayerSnapshot }
  | { t: "left"; id: string }
  | { t: "path"; player: PlayerSnapshot }
  /** Reply to the mover. `player` is present only when the server corrected or rejected the move. */
  | { t: "ack"; seq: number; player?: PlayerSnapshot }
  | { t: "kicked"; reason: string }
  /** The character moved to another map; the client reconnects and receives a fresh welcome. */
  | { t: "transfer"; map: string }
  | { t: "chat"; id: string; name: string; text: string; ts: number }
  | { t: "chat_error"; reason: "rate" | "invalid" }
  /** Current character sheet; sent after every allocation attempt (also when it was rejected). */
  | { t: "stats"; character: CharacterSheet }
  /** A monster appeared or changed its path. */
  | { t: "mon"; monster: MonsterSnapshot }
  | { t: "mon_gone"; id: string }
  /** One attack landed (or missed). `hp` is the target's HP afterwards; `to` is a monster id or a character id. */
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number }
  /** The receiving character's own HP changed (regeneration or damage). */
  | { t: "hp"; hp: number; maxHp: number }
  /** The receiving character died; a transfer to town follows. */
  | { t: "died"; expLost: number }

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** A finite coordinate in a sane range; the server still validates it against the map. */
function isCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -1 && v <= 1024;
}

/** Validates untrusted client input. Returns null when the message is malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case "move":
      if (!isCoord(m.x) || !isCoord(m.y) || !isCoord(m.fx) || !isCoord(m.fy) || !isInt(m.seq)) return null;
      return { t: "move", x: m.x, y: m.y, fx: m.fx, fy: m.fy, seq: m.seq };
    case "portal":
      return { t: "portal" };
    case "chat": {
      if (typeof m.text !== "string") return null;
      const text = normalizeChatText(m.text);
      return text ? { t: "chat", text } : null;
    }
    case "allocate": {
      const points = parseAllocation(m.points);
      return points ? { t: "allocate", points } : null;
    }
    case "attack":
      return isMonsterId(m.id) ? { t: "attack", id: m.id } : null;
    default:
      return null;
  }
}

/** Strips control characters, collapses whitespace and caps the length. Returns null for empty text. */
export function normalizeChatText(raw: string): string | null {
  const text = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  if (chars.length === 0) return null;
  return chars.slice(0, CHAT_MAX_LENGTH).join("");
}

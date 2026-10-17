import type { Vec2 } from "./map";
import { isMonsterId, type HitKind } from "./combat";
import type { Currency, Wallet } from "./economy";
import { BAG_CELLS_PER_TAB, MAX_BAG_TABS, SORT_MODES, type BagItem, type BagPos, type SortMode } from "./inventory";
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
/** World chat reaches every player and costs the hub a broadcast, so it is limited much harder. */
export const WORLD_CHAT_MIN_GAP_MS = 5_000;
export const WORLD_CHAT_BURST = 3;
export const WORLD_CHAT_WINDOW_MS = 60_000;
export const CHAT_TARGET_MAX_LENGTH = 32;

/**
 * Where a chat line goes: everyone online (world), the sender's map room (map), one named player (whisper), or an
 * announcement to everyone shown in the system tab (system, only accepted from admins).
 */
export type ChatChannel = "world" | "map" | "whisper" | "system";
export const CHAT_CHANNELS: readonly ChatChannel[] = ["world", "map", "whisper", "system"];
/** How far (tiles) the client-claimed start tile may differ from the server position and still be trusted. */
export const MAX_DESYNC_TILES = 3;
/** Minimum gap between stat allocations; each one is a D1 write. */
export const ALLOCATE_MIN_GAP_MS = 500;

export type ClientMessage =
  /** `x`/`y` is the exact destination and `fx`/`fy` the exact position the client starts from, in tile units; `seq` is echoed back in the ack. */
  | { t: "move"; x: number; y: number; fx: number; fy: number; seq: number }
  /** Ask to use the portal the character is standing on; the server verifies the position. */
  | { t: "portal" }
  /** `channel` defaults to "map" when absent (older clients). `to` is the recipient's name and only used for whispers. World and whisper go over the chat socket, map over the game socket. */
  | { t: "chat"; channel: ChatChannel; text: string; to?: string }
  /** Spend potential points: stat key to points. One message per confirmation, one D1 write. */
  | { t: "allocate"; points: Partial<BaseStats> }
  /** Target a monster: the server walks into range and auto-attacks until the target dies or the player moves. */
  | { t: "attack"; id: string }
  /** Bag commands name a cell, never an item id: the server resolves the item from its own copy of the bag. */
  | { t: "inv_use"; tab: number; cell: number }
  | { t: "inv_drop"; tab: number; cell: number; qty?: number }
  | { t: "inv_move"; from: BagPos; to: BagPos }
  /** Merge split stacks and order the whole bag by `mode`. */
  | { t: "inv_sort"; mode: SortMode }
  /** Split `qty` off a stack into the first free cell. */
  | { t: "inv_split"; tab: number; cell: number; qty: number }
  /** Claim the item attached to a mail into the bag. */
  | { t: "mail_claim"; id: string };

/** A mail as the client sees it. `expiresInMs` is relative to when it was sent (null: never expires), so clock skew does not matter. */
export interface MailView {
  id: string;
  subject: string;
  item: { type: string; qty: number } | null;
  expiresInMs: number | null;
}

/** The bag as the client sees it. */
export interface BagView {
  tabs: number;
  items: BagItem[];
}

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
  | { t: "welcome"; self: string; map: string; players: PlayerSnapshot[]; colo: string; character: CharacterSheet; monsters: MonsterSnapshot[]; hp: number; maxHp: number; wallet: Wallet; bag: BagView; mail: MailView[] }
  | { t: "joined"; player: PlayerSnapshot }
  | { t: "left"; id: string }
  | { t: "path"; player: PlayerSnapshot }
  /** Reply to the mover. `player` is present only when the server corrected or rejected the move. */
  | { t: "ack"; seq: number; player?: PlayerSnapshot }
  | { t: "kicked"; reason: string }
  /** The character moved to another map; the client reconnects and receives a fresh welcome. */
  | { t: "transfer"; map: string }
  /** `id`/`name` is the sender. For a whisper the sender's own copy also carries `toName`. */
  | { t: "chat"; channel: ChatChannel; id: string; name: string; text: string; ts: number; toName?: string }
  | { t: "chat_error"; reason: "rate" | "invalid" | "offline" | "forbidden" }
  /** Current character sheet; sent after every allocation attempt (also when it was rejected). */
  | { t: "stats"; character: CharacterSheet }
  /** A monster appeared or changed its path. */
  | { t: "mon"; monster: MonsterSnapshot }
  | { t: "mon_gone"; id: string }
  /** One attack landed (or missed). `hp` is the target's HP afterwards; `to` is a monster id or a character id. */
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number }
  /** The receiving character's own HP changed (regeneration or damage). */
  | { t: "hp"; hp: number; maxHp: number }
  /** One of the receiving character's balances changed; `gained` is the amount just added, when it is a gain. */
  | { t: "wallet"; currency: Currency; balance: number; gained?: number }
  /** Bag contents. `full` replaces everything; otherwise `items` are added or changed (by id) and `removed` are deleted. */
  | { t: "inv"; full: boolean; tabs: number; items: BagItem[]; removed: string[] }
  /** Items from a kill: `mailed` ones did not fit in the bag and were sent by mail (claim them in time). */
  | { t: "loot"; items: Array<{ type: string; qty: number; mailed: boolean }> }
  /** The current unclaimed mail (full list). */
  | { t: "mail"; mail: MailView[] }
  | { t: "inv_error"; reason: "invalid" | "rate" | "full" | "not_needed" | "cooldown" | "expired" | "busy" | "wait" | "no_room"; retryMs?: number }
  /** The receiving character died; a transfer to town follows. */
  | { t: "died"; expLost: number }

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** A bag cell inside the largest bag any character can own; the server checks it against the character's own tab count. */
function cellOk(tab: number, cell: number): boolean {
  return tab >= 0 && tab < MAX_BAG_TABS && cell >= 0 && cell < BAG_CELLS_PER_TAB;
}

function parseBagPos(v: unknown): BagPos | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  return isInt(p.tab) && isInt(p.cell) && cellOk(p.tab, p.cell) ? { tab: p.tab, cell: p.cell } : null;
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
      if (!text) return null;
      const channel = m.channel === undefined ? "map" : m.channel;
      if (!CHAT_CHANNELS.includes(channel as ChatChannel)) return null;
      if (channel !== "whisper") return { t: "chat", channel: channel as ChatChannel, text };
      const to = typeof m.to === "string" ? normalizeChatTarget(m.to) : null;
      return to ? { t: "chat", channel: "whisper", text, to } : null;
    }
    case "allocate": {
      const points = parseAllocation(m.points);
      return points ? { t: "allocate", points } : null;
    }
    case "attack":
      return isMonsterId(m.id) ? { t: "attack", id: m.id } : null;
    case "inv_use":
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) ? { t: "inv_use", tab: m.tab, cell: m.cell } : null;
    case "inv_drop": {
      if (!isInt(m.tab) || !isInt(m.cell) || !cellOk(m.tab, m.cell)) return null;
      if (m.qty === undefined) return { t: "inv_drop", tab: m.tab, cell: m.cell };
      return isInt(m.qty) && m.qty >= 1 && m.qty <= 9999 ? { t: "inv_drop", tab: m.tab, cell: m.cell, qty: m.qty } : null;
    }
    case "inv_move": {
      const from = parseBagPos(m.from);
      const to = parseBagPos(m.to);
      return from && to ? { t: "inv_move", from, to } : null;
    }
    case "inv_sort":
      return typeof m.mode === "string" && (SORT_MODES as readonly string[]).includes(m.mode) ? { t: "inv_sort", mode: m.mode as SortMode } : null;
    case "inv_split":
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) && isInt(m.qty) && m.qty >= 1 && m.qty <= 9999
        ? { t: "inv_split", tab: m.tab, cell: m.cell, qty: m.qty }
        : null;
    case "mail_claim":
      return typeof m.id === "string" && m.id.length > 0 && m.id.length <= 64 ? { t: "mail_claim", id: m.id } : null;
    default:
      return null;
  }
}

/** A whisper recipient's name: trimmed, no control characters, at most CHAT_TARGET_MAX_LENGTH characters. */
export function normalizeChatTarget(raw: string): string | null {
  const name = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const chars = [...name];
  return chars.length === 0 || chars.length > CHAT_TARGET_MAX_LENGTH ? null : name;
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

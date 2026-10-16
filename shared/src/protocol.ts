import type { Tile } from "./pathfinding";

export const MAX_MESSAGE_BYTES = 512;
export const MAX_NAME_LENGTH = 16;
export const MIN_MOVE_INTERVAL_MS = 100;

export type ClientMessage =
  | { t: "join"; id: string; name: string }
  | { t: "move"; x: number; y: number }
  | { t: "ping"; c: number };

/** Snapshot of one player: where they started walking, the path, and how long ago they started. */
export interface PlayerSnapshot {
  id: string;
  name: string;
  path: Tile[];
  ageMs: number;
  speed: number;
}

export type ServerMessage =
  | { t: "welcome"; self: string; map: string; players: PlayerSnapshot[] }
  | { t: "joined"; player: PlayerSnapshot }
  | { t: "left"; id: string }
  | { t: "path"; player: PlayerSnapshot }
  | { t: "pong"; c: number }
  | { t: "kicked"; reason: string };

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
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
    case "join":
      if (typeof m.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(m.id)) return null;
      if (typeof m.name !== "string") return null;
      return { t: "join", id: m.id, name: sanitizeName(m.name) };
    case "move":
      if (!isInt(m.x) || !isInt(m.y)) return null;
      return { t: "move", x: m.x, y: m.y };
    case "ping":
      if (!isInt(m.c)) return null;
      return { t: "ping", c: m.c };
    default:
      return null;
  }
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : "Vô Danh";
}

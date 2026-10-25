import type { CharacterSheet, Gender } from "@game/shared";

/** The server sends the shared character sheet shape, so client and server cannot drift. */
export type PublicCharacter = CharacterSheet;

export interface Me {
  account: { email: string; role: string };
  character: PublicCharacter | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Error code from the server when !ok, e.g. "invalid_credentials". */
  error?: string;
  data?: T;
  /** The whole error answer (a ban says until when and why). */
  details?: Record<string, unknown>;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok
      ? { ok: true, status: res.status, data: json }
      : { ok: false, status: res.status, error: json.error ?? "unknown", details: json as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

export const api = {
  me: () => call<Me>("GET", "/api/me"),
  register: (email: string, password: string) => call<{ ok: true }>("POST", "/api/register", { email, password }),
  login: (email: string, password: string) => call<{ ok: true }>("POST", "/api/login", { email, password }),
  leaderboard: (board: string) => call<{ rows: Array<{ name: string; realm: number; stage: number; value: number }> }>("GET", `/api/leaderboard?board=${board}`),
  logout: () => call<{ ok: true }>("POST", "/api/logout"),
  createCharacter: (name: string, gender: Gender) => call<{ character: PublicCharacter }>("POST", "/api/character", { name, gender }),
};

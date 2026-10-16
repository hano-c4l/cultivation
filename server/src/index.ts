import { isMapId } from "@game/shared";
import { getSession, handleApi } from "./auth";
import { CharacterLock } from "./character-lock";
import { getCharacterByAccount } from "./characters";
import type { Env } from "./env";
import { errorResponse, hasForeignOrigin, json } from "./http";
import { MapRoom } from "./map-room";
import { PasswordHasher } from "./password-hasher";

export { CharacterLock, MapRoom, PasswordHasher };
export type { Env };

const MAX_CHANNEL = 8;

async function handleWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  // Cross-site WebSocket hijacking guard: browsers send Origin; it must match our host.
  if (hasForeignOrigin(request)) return errorResponse("forbidden_origin", 403);

  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  const character = await getCharacterByAccount(env.DB, session.accountId);
  if (!character) return errorResponse("no_character", 403);

  // The map is server-authoritative (the character's saved map); clients only choose the channel.
  const map = isMapId(character.map_id) ? character.map_id : "town";
  const channel = Number(url.searchParams.get("ch") ?? "1");
  if (!Number.isInteger(channel) || channel < 1 || channel > MAX_CHANNEL) {
    return errorResponse("bad_channel", 400);
  }

  const room = `${map}:${channel}`;
  // Identity headers are set here only; any client-supplied values are overwritten.
  const headers = new Headers(request.headers);
  headers.set("x-char-id", character.id);
  headers.set("x-room", room);
  // One Durable Object per map channel; hint APAC for lower latency in Vietnam.
  const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
  return stub.fetch(new Request(request, { headers }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return json({ ok: row?.ok === 1 });
      }
      if (url.pathname === "/api/whereami") {
        const cf = request.cf as { colo?: string; country?: string } | undefined;
        return json({ edge: cf?.colo ?? null, country: cf?.country ?? null });
      }
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname === "/ws") return await handleWebSocket(request, env, url);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("unhandled", err);
      return errorResponse("internal_error", 500);
    }
  },
} satisfies ExportedHandler<Env>;

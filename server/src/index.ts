import { getMapRecipes } from "./maps";
import { loadLiveConfig } from "./live-config";
import { isItemId, isMapId } from "@game/shared";
import { isAdminPagePath } from "./admin-page-rules";
import { handleAdminPage } from "./admin-pages";
import { getSession, handleApi } from "./auth";
import { ChatHub } from "./chat-hub";
import { CharacterLock } from "./character-lock";
import { getCharacterByAccount } from "./characters";
import type { Env } from "./env";
import { errorResponse, hasForeignOrigin, json } from "./http";
import { MapRoom } from "./map-room";
import { PasswordHasher } from "./password-hasher";

export { ChatHub, CharacterLock, MapRoom, PasswordHasher };
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
  await getMapRecipes(env.DB); // a map an admin added is known only once its recipe is read (installing it builds nothing)
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
  headers.set("x-char-admin", session.role === "admin" ? "1" : "0");
  // One Durable Object per map channel; hint APAC for lower latency in Vietnam.
  const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
  return stub.fetch(new Request(request, { headers }));
}

/** The chat socket (world chat and whispers): same authentication as /ws, routed to the single ChatHub. */
async function handleChatSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  if (hasForeignOrigin(request)) return errorResponse("forbidden_origin", 403);
  const session = await getSession(request, env);
  if (!session) return errorResponse("unauthenticated", 401);
  const character = await getCharacterByAccount(env.DB, session.accountId);
  if (!character) return errorResponse("no_character", 403);
  // Identity headers are set here only; any client-supplied values are overwritten.
  const headers = new Headers(request.headers);
  headers.set("x-char-id", character.id);
  // Header values are Latin-1; names carry Vietnamese diacritics, so they travel encoded.
  headers.set("x-char-name", encodeURIComponent(character.name));
  headers.set("x-char-admin", session.role === "admin" ? "1" : "0");
  const stub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName("global"), { locationHint: "apac" });
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
      if (url.pathname === "/api/dev/tick-stats") {
        // Local load testing only: answers 404 unless ENABLE_DEV_GRANT=1, so it does not exist on preview or production.
        const room = url.searchParams.get("room") ?? "";
        if (env.ENABLE_DEV_GRANT !== "1" || !/^(forest|cave):\d{1,3}$/.test(room)) return errorResponse("not_found", 404);
        const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
        return json(await stub.tickStats());
      }
      if (url.pathname === "/api/dev/loot") {
        // Local testing only (same gate as tick-stats): gives loot to a character connected to the named room.
        const room = url.searchParams.get("room") ?? "";
        const item = url.searchParams.get("item") ?? "";
        const qty = Number(url.searchParams.get("qty") ?? "1");
        const char = url.searchParams.get("char") ?? "";
        if (env.ENABLE_DEV_GRANT !== "1" || !/^(town|forest|cave):\d{1,3}$/.test(room) || !isItemId(item) || !char) return errorResponse("not_found", 404);
        if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return errorResponse("bad_request", 400);
        const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
        await stub.devLoot(char, [{ item, qty }]);
        return json({ ok: true });
      }
      if (url.pathname === "/api/dev/boss-hp") {
        // Local testing only (same gate as evict): leaves the room's boss with `hp` health.
        const room = url.searchParams.get("room") ?? "";
        const hp = Number(url.searchParams.get("hp") ?? "1");
        if (env.ENABLE_DEV_GRANT !== "1" || !/^(forest|cave):\d{1,3}$/.test(room)) return errorResponse("not_found", 404);
        if (!Number.isInteger(hp) || hp < 1) return errorResponse("bad_request", 400);
        const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
        return json({ ok: await stub.devBossHp(hp) });
      }
      if (url.pathname === "/api/dev/evict") {
        // Local testing only (same gate as tick-stats): imitates the runtime evicting a paused room.
        const room = url.searchParams.get("room") ?? "";
        if (env.ENABLE_DEV_GRANT !== "1" || !/^(forest|cave):\d{1,3}$/.test(room)) return errorResponse("not_found", 404);
        const stub = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(room), { locationHint: "apac" });
        return json({ evicted: await stub.devEvict(url.searchParams.get("force") === "1") });
      }
      if (url.pathname.startsWith("/api/")) {
        await loadLiveConfig(env.DB); // routes that roll a character or build a sheet use the live numbers (cached)
        return await handleApi(request, env, url);
      }
      if (isAdminPagePath(url.pathname)) return await handleAdminPage(request, env, url);
      if (url.pathname === "/ws") return await handleWebSocket(request, env, url);
      if (url.pathname === "/ws/chat") return await handleChatSocket(request, env);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("unhandled", err);
      return errorResponse("internal_error", 500);
    }
  },
} satisfies ExportedHandler<Env>;

import { isMapId } from "@game/shared";
import { MapRoom } from "./map-room";

export { MapRoom };

export interface Env {
  MAP_ROOM: DurableObjectNamespace<MapRoom>;
  DB: D1Database;
  ASSETS: Fetcher;
}

const MAX_CHANNEL = 8;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return Response.json({ ok: row?.ok === 1 });
    }

    if (url.pathname === "/api/whereami") {
      const cf = request.cf as { colo?: string; country?: string } | undefined;
      return Response.json({ edge: cf?.colo ?? null, country: cf?.country ?? null });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const map = url.searchParams.get("map") ?? "town";
      const channel = Number(url.searchParams.get("ch") ?? "1");
      if (!isMapId(map) || !Number.isInteger(channel) || channel < 1 || channel > MAX_CHANNEL) {
        return new Response("Bad map or channel", { status: 400 });
      }
      // One Durable Object per map channel; hint APAC for lower latency in Vietnam.
      const id = env.MAP_ROOM.idFromName(`${map}:${channel}`);
      const stub = env.MAP_ROOM.get(id, { locationHint: "apac" });
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

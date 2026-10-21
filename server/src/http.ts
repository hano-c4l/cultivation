const MAX_JSON_BYTES = 4096;

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("Cache-Control", "no-store");
  return Response.json(data, { status, headers: h });
}

export function errorResponse(code: string, status: number): Response {
  return json({ error: code }, status);
}

/** Reads a small JSON object body; returns null for wrong content type, oversize or malformed bodies. */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Browsers always send Origin on cross-site POST/WebSocket; a mismatch is a CSRF / hijacking attempt. Non-browser clients send none. */
export function hasForeignOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

export const SESSION_COOKIE = "ct_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

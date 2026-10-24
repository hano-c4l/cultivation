import { decideAdminPage } from "./admin-page-rules";
import { getSession } from "./auth";
import type { Env } from "./env";

const PAGE_HEADERS = { "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" };

/** Answers a request for an admin page (the rules are in admin-page-rules.ts): the app shell fetched from the static assets, or a redirect. Only GET and HEAD. */
export async function handleAdminPage(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const session = await getSession(request, env);
  const decision = decideAdminPage(url.pathname, session ? session.role : null);
  if (decision.kind === "redirect") return new Response(null, { status: 302, headers: { ...PAGE_HEADERS, Location: decision.to } });
  // The shell is a static asset (admin/index.html); the Worker serves it only after the check above.
  const shell = await env.ASSETS.fetch(new Request(new URL("/admin/", url), { method: "GET" }));
  const headers = new Headers(shell.headers);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v);
  return new Response(shell.body, { status: shell.status, headers });
}

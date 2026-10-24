/** Where the admin pages live and who may see them. Pure (no Worker imports) so it is unit tested; admin-pages.ts applies it. */

/** Everything below /admin needs an admin session, except the login page. */
export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_HOME_PATH = "/admin";

/** Addresses of the two old static admin pages, which no longer exist: they send people to the new admin. */
const LEGACY_PAGES: ReadonlySet<string> = new Set(["/admin.html", "/admin-constitutions.html"]);

export type AdminPageDecision = { kind: "shell" } | { kind: "redirect"; to: string };

/** True for the paths the Worker answers for the admin app (the app itself is one shell served for all of them). */
export function isAdminPagePath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || LEGACY_PAGES.has(pathname);
}

/**
 * What to do with a request for an admin page. `role` is the caller's role, null without a session.
 * - Admin: gets the app; asking for the login page sends them to the admin home instead.
 * - Anyone else (no session, or a player): the login page is served, every other address redirects to it.
 */
export function decideAdminPage(pathname: string, role: "admin" | "player" | null): AdminPageDecision {
  if (LEGACY_PAGES.has(pathname)) return { kind: "redirect", to: ADMIN_HOME_PATH };
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === ADMIN_LOGIN_PATH) return role === "admin" ? { kind: "redirect", to: ADMIN_HOME_PATH } : { kind: "shell" };
  return role === "admin" ? { kind: "shell" } : { kind: "redirect", to: ADMIN_LOGIN_PATH };
}

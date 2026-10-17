import { DEFAULT_CATALOG, type ConstitutionCatalog } from "@game/shared";

/**
 * The constitution catalogue as the server last sent it (names, tiers, descriptions are data an admin can change, so the
 * client never hard-codes them). Starts as the default so a screen shown before the first welcome still has text.
 */
let catalog: ConstitutionCatalog = DEFAULT_CATALOG;

export function getCatalog(): ConstitutionCatalog {
  return catalog;
}

export function setCatalog(next: ConstitutionCatalog): void {
  catalog = next;
}

/** Loads the catalogue over HTTP (used before the game socket exists, e.g. the reveal after character creation). */
export async function fetchCatalog(): Promise<void> {
  try {
    const res = await fetch("/api/constitutions", { credentials: "same-origin" });
    if (res.ok) catalog = (await res.json()) as ConstitutionCatalog;
  } catch {
    // Keep what we have.
  }
}

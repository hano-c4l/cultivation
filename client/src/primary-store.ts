import { BASIC_SKILL_ID } from "@game/shared";

/**
 * The attack the player chose for the slot in front of the hotbar: the basic qi blast in one of the character's elements, or the plain attack (null). It
 * is kept per character in the browser and sent to the server at every welcome; the server uses it whenever the character attacks a monster by click or by Auto.
 */
export interface PrimaryChoice {
  skill: typeof BASIC_SKILL_ID;
  /** The element, one of the character's own; empty: the main one. */
  el: string;
}

const key = (id: string): string => `primary:${id}`;

/** The saved choice of a character, mended against what the character has (an element it no longer has falls back to the main one); null for the plain attack. */
export function loadPrimary(id: string | null, roots: readonly string[], read: (k: string) => string | null = (k) => localStorage.getItem(k)): PrimaryChoice | null {
  if (!id) return null;
  try {
    const raw = JSON.parse(read(key(id)) ?? "null") as { skill?: unknown; el?: unknown } | null;
    if (!raw || raw.skill !== BASIC_SKILL_ID) return null;
    return { skill: BASIC_SKILL_ID, el: typeof raw.el === "string" && roots.includes(raw.el) ? raw.el : "" };
  } catch {
    return null;
  }
}

export function savePrimary(id: string | null, choice: PrimaryChoice | null, write: (k: string, v: string) => void = (k, v) => localStorage.setItem(k, v)): void {
  if (!id) return;
  try {
    write(key(id), JSON.stringify(choice ?? {}));
  } catch {
    // storage blocked or full: the choice still holds for this visit
  }
}

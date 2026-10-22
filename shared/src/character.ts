/** Five elements (ngũ hành). A character's spiritual root decides their element. */
export const SPIRITUAL_ROOTS = ["kim", "moc", "thuy", "hoa", "tho"] as const;
/** Mutant elements (biến dị): Lôi, Băng, Phong. Only a single-element root can have one; monsters never roll them. */
export const MUTANT_ROOTS = ["loi", "bang", "phong"] as const;
/** Every element a character, a skill or a piece of gear can have. */
export const ALL_ROOTS = [...SPIRITUAL_ROOTS, ...MUTANT_ROOTS] as const;
export type SpiritualRoot = (typeof ALL_ROOTS)[number];

export function isSpiritualRoot(value: unknown): value is SpiritualRoot {
  return typeof value === "string" && (ALL_ROOTS as readonly string[]).includes(value);
}

export function isMutantRoot(value: unknown): boolean {
  return typeof value === "string" && (MUTANT_ROOTS as readonly string[]).includes(value);
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

/** Returns the normalized character name (single spaces, trimmed) or null when invalid. Letters include Vietnamese diacritics. */
export function validateCharacterName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const length = [...name].length;
  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) return null;
  return /^[\p{L}\p{N} ]+$/u.test(name) ? name : null;
}

/** Returns the lowercased email or null when it is clearly malformed (real verification is out of scope for phase 1). */
export function validateEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > EMAIL_MAX_LENGTH) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.length >= PASSWORD_MIN_LENGTH && raw.length <= PASSWORD_MAX_LENGTH ? raw : null;
}

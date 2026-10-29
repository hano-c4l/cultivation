import { parseSkillSlot, tuning } from "@game/shared";
import { AUTO_DEFAULTS, type AutoSettings } from "./auto-brain";

const storeKey = (id: string): string => `auto:${id}`;

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);

/** The saved settings of a character, mended against the defaults and the limits (nothing in the browser's storage is trusted). */
export function loadAuto(id: string | null, read: (key: string) => string | null = (k) => localStorage.getItem(k)): AutoSettings {
  const lim = tuning().auto;
  const base: AutoSettings = { ...AUTO_DEFAULTS, radius: lim.radiusDefault, skills: [] };
  if (!id) return base;
  try {
    const raw = JSON.parse(read(storeKey(id)) ?? "null") as Partial<AutoSettings> | null;
    if (!raw || raw.v !== 1) return base;
    return {
      v: 1,
      radius: clamp(raw.radius, lim.radiusMin, lim.radiusMax, base.radius),
      returnHome: typeof raw.returnHome === "boolean" ? raw.returnHome : base.returnHome,
      huntRare: typeof raw.huntRare === "boolean" ? raw.huntRare : base.huntRare,
      huntBoss: typeof raw.huntBoss === "boolean" ? raw.huntBoss : base.huntBoss,
      skills: Array.isArray(raw.skills) ? raw.skills.filter((v): v is string => typeof v === "string" && !!parseSkillSlot(v)).slice(0, 8) : [],
      mpMin: clamp(raw.mpMin, 0, 100, base.mpMin),
      healBelow: clamp(raw.healBelow, 0, 100, base.healBelow),
      potion: typeof raw.potion === "string" && /^[a-z0-9_.]{0,60}$/.test(raw.potion) ? raw.potion : "",
      potionBelow: clamp(raw.potionBelow, 0, 100, base.potionBelow),
      mpPotion: typeof raw.mpPotion === "string" && /^[a-z0-9_.]{0,60}$/.test(raw.mpPotion) ? raw.mpPotion : "",
      mpPotionBelow: clamp(raw.mpPotionBelow, 0, 100, base.mpPotionBelow),
    };
  } catch {
    return base;
  }
}

export function saveAuto(id: string | null, s: AutoSettings, write: (key: string, value: string) => void = (k, v) => localStorage.setItem(k, v)): void {
  if (!id) return;
  try {
    write(storeKey(id), JSON.stringify(s));
  } catch {
    // storage full or blocked: the window still works, the choices are just not kept
  }
}


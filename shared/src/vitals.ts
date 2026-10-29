import { regenDelayMs, REGEN_PER_S } from "./combat";
import { mpRegenDelayMs, mpRegenPerS } from "./skills";

/**
 * What a character keeps when they leave a combat room or reload: HP, MP, the skills still cooling down and the buffs
 * still running. Stored as JSON in `characters.vitals` (written with the position save, so it costs no extra row write).
 * NULL means "fresh": full HP and MP, nothing cooling down (a new character, a respawn after death).
 *
 * Time passes while away: the same regeneration as in play applies (after its usual delay), so logging out cannot heal
 * faster than standing still, and a long absence ends with full HP and MP.
 */
export interface Vitals {
  hp: number;
  mp: number;
  /** When it was written (epoch ms). */
  at: number;
  /** Skill id to the time (epoch ms) it is ready again; only entries still in the future are stored. */
  cd?: Record<string, number>;
  /** Running buffs: skill id and the time (epoch ms) each ends. */
  buffs?: Array<{ skill: string; until: number }>;
}

export function parseVitals(raw: string | null | undefined): Vitals | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Vitals>;
    if (typeof v.hp !== "number" || typeof v.mp !== "number" || typeof v.at !== "number" || !(v.hp > 0)) return null;
    const cd: Record<string, number> = {};
    for (const [k, t] of Object.entries(v.cd ?? {})) if (/^[a-z0-9_]{1,32}$/.test(k) && typeof t === "number") cd[k] = t;
    const buffs = (v.buffs ?? []).filter((b) => b && typeof b.skill === "string" && typeof b.until === "number");
    return { hp: v.hp, mp: Math.max(0, v.mp), at: v.at, cd, buffs };
  } catch {
    return null;
  }
}

export interface RestoredVitals {
  hp: number;
  mp: number;
  cooldowns: Record<string, number>;
  buffs: Array<{ skill: string; until: number }>;
}

/**
 * HP, MP, cooldowns and buffs at `now`, given what was stored when the character left. `rates` (points per second, see regenPerSecond) is the regeneration of the
 * time away: absent, the old rule applies (a share of the maximum per second after the usual delay), which is what a town still uses.
 */
export function restoreVitals(v: Vitals | null, now: number, maxHp: number, maxMp: number, rates?: { hp: number; mp: number }): RestoredVitals {
  if (!v) return { hp: maxHp, mp: maxMp, cooldowns: {}, buffs: [] };
  const away = Math.max(0, now - v.at);
  const regen = (stored: number, max: number, perS: number, delayMs: number): number => {
    const secs = Math.max(0, away - delayMs) / 1000;
    return Math.min(max, Math.max(0, Math.round(stored)) + Math.floor(secs * Math.max(1, max * perS)));
  };
  const cooldowns: Record<string, number> = {};
  for (const [k, t] of Object.entries(v.cd ?? {})) if (t > now) cooldowns[k] = t;
  const flat = (stored: number, max: number, perS: number): number => Math.min(max, Math.max(0, Math.round(stored)) + Math.floor((away / 1000) * perS));
  return {
    hp: Math.max(1, rates ? flat(v.hp, maxHp, rates.hp) : regen(v.hp, maxHp, REGEN_PER_S, regenDelayMs())),
    mp: rates ? flat(v.mp, maxMp, rates.mp) : regen(v.mp, maxMp, mpRegenPerS(), mpRegenDelayMs()),
    cooldowns,
    buffs: (v.buffs ?? []).filter((b) => b.until > now),
  };
}

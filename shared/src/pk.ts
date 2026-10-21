import { isBonded } from "./equipment-data";
import type { BagContents, BagOp } from "./inventory";
import { levelIndex } from "./progression";

/**
 * PvP scoring (phase 2f, docs/PHASE2.md): three separate scores, the name colour, the newbie protection and what each
 * score does. Placeholder game-design values ("giá trị tạm"); everything here is pure so it can be tested without a room.
 *
 *  - sát khí (killing aura): +10 per kill of a player, -50 when killed by a player; above 200 it adds damage (5% rising to 15% at 1000);
 *  - sát nhân (murder): +100 for killing a white or yellow name; sets the name colour; falls with time online, when killed, and by
 *    killing orange or red names;
 *  - anh hùng (hero): earned only while sát nhân is 0 by killing orange or red names; 200 and 500 give bonuses; killing a white
 *    or yellow name resets it.
 */
export interface PkScores {
  satKhi: number;
  satNhan: number;
  hero: number;
}

export const NO_PK: Readonly<PkScores> = { satKhi: 0, satNhan: 0, hero: 0 };

/** Characters below this level (Luyện Khí tầng 5) cannot be attacked in PvP, and cannot attack players either. */
export const PK_PROTECTED_BELOW = levelIndex(0, 5);
export function isPkProtected(realm: number, stage: number): boolean {
  return levelIndex(realm, stage) < PK_PROTECTED_BELOW;
}

/** The PK state a player chooses: 0 off (starts no fight), 1 PK (fights those who are PK or Đồ sát), 2 Đồ sát (fights anyone). */
export type PkMode = 0 | 1 | 2;
export const PK_OFF: PkMode = 0;
export const PK_ON: PkMode = 1;
export const PK_SLAUGHTER: PkMode = 2;
export function isPkMode(v: unknown): v is PkMode {
  return v === 0 || v === 1 || v === 2;
}
/** Whether a player in state `mine` may start a fight with one in state `theirs` (not counting self-defence or newbie protection). */
export function canStartPvp(mine: PkMode, theirs: PkMode): boolean {
  return mine === 2 || (mine === 1 && theirs >= 1);
}

// ---- sát khí ----
export const SAT_KHI_PER_KILL = 10;
export const SAT_KHI_LOST_ON_DEATH = 50;
/** Damage bonus starts above this many points... */
export const SAT_KHI_BONUS_ABOVE = 200;
/** ...and reaches its maximum at this many. */
export const SAT_KHI_BONUS_FULL_AT = 1000;
export const SAT_KHI_BONUS_MIN_PCT = 5;
export const SAT_KHI_BONUS_MAX_PCT = 15;

/** Percent of extra damage the sát khí gives: 0 up to 200, 5% just above it, rising evenly to 15% at 1000 and staying there. */
export function satKhiDamagePct(satKhi: number): number {
  if (satKhi <= SAT_KHI_BONUS_ABOVE) return 0;
  const span = SAT_KHI_BONUS_FULL_AT - SAT_KHI_BONUS_ABOVE;
  const t = Math.min(1, (satKhi - SAT_KHI_BONUS_ABOVE) / span);
  return SAT_KHI_BONUS_MIN_PCT + (SAT_KHI_BONUS_MAX_PCT - SAT_KHI_BONUS_MIN_PCT) * t;
}

// ---- sát nhân and the name colour ----
export const SAT_NHAN_PER_KILL = 100;
export const SAT_NHAN_DECAY_PER_MIN = 5;
export const SAT_NHAN_LOST_ON_DEATH = 50;
export const SAT_NHAN_LOST_KILLING_ORANGE = 50;
export const SAT_NHAN_LOST_KILLING_RED = 100;

/** 0 white, 1 yellow, 2 orange, 3 red. */
export type NameTier = 0 | 1 | 2 | 3;
export const NAME_TIER_YELLOW_FROM = 1;
export const NAME_TIER_ORANGE_FROM = 201;
export const NAME_TIER_RED_FROM = 501;

export function nameTier(satNhan: number): NameTier {
  if (satNhan >= NAME_TIER_RED_FROM) return 3;
  if (satNhan >= NAME_TIER_ORANGE_FROM) return 2;
  if (satNhan >= NAME_TIER_YELLOW_FROM) return 1;
  return 0;
}

/** A player who attacked you in the last 3 minutes shows grey to YOU (not to anyone else), unless their name is orange or red. */
export const GRAY_WINDOW_MS = 3 * 60_000;

/** How a name is shown to one viewer: the real tier, or "gray" when a white or yellow player recently attacked that viewer. */
export type NameColor = NameTier | "gray";
export function displayColor(tier: NameTier, lastAttackedViewerAt: number | undefined, now: number): NameColor {
  return tier <= 1 && lastAttackedViewerAt !== undefined && now - lastAttackedViewerAt < GRAY_WINDOW_MS ? "gray" : tier;
}

/** The sát nhân after `ms` of being online (it only falls while online; never below 0). */
export function decayedSatNhan(satNhan: number, ms: number): number {
  return Math.max(0, satNhan - (SAT_NHAN_DECAY_PER_MIN * Math.max(0, ms)) / 60_000);
}

// ---- anh hùng ----
export const HERO_PER_ORANGE = 20;
export const HERO_PER_RED = 50;
export const HERO_TIER_1 = 200;
export const HERO_TIER_2 = 500;

export interface HeroBonus {
  /** Percent of extra maximum MP (linh lực). */
  mpPct: number;
  /** Percent of extra item drop chance (relative). */
  dropPct: number;
}

/** 200 points: +5% linh lực; 500 points: +10% linh lực and +5% drop chance. Not cumulative: the higher step replaces the lower. */
export function heroBonus(hero: number): HeroBonus {
  if (hero >= HERO_TIER_2) return { mpPct: 10, dropPct: 5 };
  if (hero >= HERO_TIER_1) return { mpPct: 5, dropPct: 0 };
  return { mpPct: 0, dropPct: 0 };
}

export interface PvpKillResult {
  killer: PkScores;
  victim: PkScores;
}

/**
 * What a kill of a player does to both sides. `victimSatNhan` is the victim's CURRENT sát nhân (decay already applied) and
 * `selfDefense` says the victim attacked the killer in the last 3 minutes while showing white or yellow (the killer saw them grey):
 * that kill adds sát khí but no sát nhân and leaves the hero points alone.
 */
export function applyPvpKill(killer: PkScores, victim: PkScores, victimSatNhan: number, selfDefense: boolean, killerSatNhan = killer.satNhan): PvpKillResult {
  const tier = nameTier(victimSatNhan);
  const next: PkScores = { satKhi: killer.satKhi + SAT_KHI_PER_KILL, satNhan: killerSatNhan, hero: killer.hero };
  if (tier >= 2) {
    // Killing an orange or red name: hero points while the killer's sát nhân is 0 (nothing carries over), otherwise it only brings sát nhân down.
    if (killerSatNhan === 0) next.hero += tier === 3 ? HERO_PER_RED : HERO_PER_ORANGE;
    else next.satNhan = Math.max(0, killerSatNhan - (tier === 3 ? SAT_NHAN_LOST_KILLING_RED : SAT_NHAN_LOST_KILLING_ORANGE));
  } else if (!selfDefense) {
    next.satNhan = killerSatNhan + SAT_NHAN_PER_KILL;
    next.hero = 0;
  }
  const dead: PkScores = {
    satKhi: Math.max(0, victim.satKhi - SAT_KHI_LOST_ON_DEATH),
    satNhan: Math.max(0, victimSatNhan - SAT_NHAN_LOST_ON_DEATH),
    hero: victim.hero,
  };
  return { killer: next, victim: dead };
}

/** Killing a guard counts as killing a white name (without the self-defence exemption): sát khí and sát nhân both rise, the hero points go. */
export function applyGuardKill(killer: PkScores, killerSatNhan = killer.satNhan): PkScores {
  return { satKhi: killer.satKhi + SAT_KHI_PER_KILL, satNhan: killerSatNhan + SAT_NHAN_PER_KILL, hero: 0 };
}

// ---- what a death costs by name colour (phase 2f, PR2) ----

/** Chance that a player killed by another player loses one item, by name tier (white, yellow, orange, red). Placeholder values. */
export const PK_DROP_CHANCE: Readonly<Record<NameTier, number>> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5 };

/** Share of its maximum durability each worn piece loses at ANY death, by name tier: orange and red names wear their gear down harder. */
export const DEATH_DURABILITY_BY_TIER: Readonly<Record<NameTier, number>> = { 0: 0.05, 1: 0.05, 2: 0.1, 3: 0.2 };

/**
 * The item a player killed by another player loses, as a `give` op, or null when nothing drops (the roll fails, or there is nothing to
 * take). Any bag stack or worn piece can go, whole (a full stack goes, not one unit), except the pháp bảo bản mệnh (its trained level
 * belongs to its owner). `roll` is a number in [0, 1) for the chance and `pick` another for the choice.
 */
export function planPkDrop(
  bag: BagContents,
  tier: NameTier,
  roll: number,
  pick: number,
  to: string,
  ids: { newId: string; mailId: string },
  subject: string,
): Extract<BagOp, { op: "give" }> | null {
  if (roll >= PK_DROP_CHANCE[tier]) return null;
  const candidates = [
    ...bag.items.filter((i) => !isBonded(i.type)).map((i) => ({ id: i.id, type: i.type, qty: i.qty, dur: i.dur, max: i.max, lv: i.lv, xp: i.xp })),
    ...bag.equipped.filter((e) => !isBonded(e.type)).map((e) => ({ id: e.id, type: e.type, qty: 1, dur: e.dur, max: e.max, lv: e.lv, xp: e.xp })),
  ];
  const c = candidates[Math.min(candidates.length - 1, Math.floor(pick * candidates.length))];
  if (!c) return null;
  return {
    op: "give",
    id: c.id,
    qty: c.qty,
    type: c.type,
    ...(c.dur !== undefined ? { dur: c.dur } : {}),
    ...(c.max !== undefined ? { max: c.max } : {}),
    ...(c.lv !== undefined ? { lv: c.lv } : {}),
    ...(c.xp !== undefined ? { xp: c.xp } : {}),
    to,
    newId: ids.newId,
    mailId: ids.mailId,
    subject,
  };
}

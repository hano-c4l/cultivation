import { tuning } from "./tuning";
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
/** The level (flat index) below which nobody can attack or be attacked: the tuning `pvp.protectedBelow`. */
export function pkProtectedBelow(): number {
  const p = tuning().pvp.protectedBelow;
  return levelIndex(p.realm, p.stage);
}
export function isPkProtected(realm: number, stage: number): boolean {
  return levelIndex(realm, stage) < pkProtectedBelow();
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

// ---- sát khí (the numbers are in the tuning, `pvp`) ----

/** Percent of extra damage the sát khí gives: 0 up to 200, 5% just above it, rising evenly to 15% at 1000 and staying there. */
export function satKhiDamagePct(satKhi: number): number {
  const k = tuning().pvp.satKhi;
  if (satKhi <= k.bonusAbove) return 0;
  const t = Math.min(1, (satKhi - k.bonusAbove) / (k.bonusFullAt - k.bonusAbove));
  return k.bonusMinPct + (k.bonusMaxPct - k.bonusMinPct) * t;
}

// ---- sát nhân and the name colour ----
/** Sát nhân lost per minute online (tuning `pvp`). */
export function satNhanDecayPerMin(): number {
  return tuning().pvp.satNhan.decayPerMin;
}

/** 0 white, 1 yellow, 2 orange, 3 red. */
export type NameTier = 0 | 1 | 2 | 3;
/** Sát nhân from which a name is yellow, orange, red (tuning `pvp.nameTiers`). */
export const nameTierYellowFrom = (): number => tuning().pvp.nameTiers.yellowFrom;
export const nameTierOrangeFrom = (): number => tuning().pvp.nameTiers.orangeFrom;
export const nameTierRedFrom = (): number => tuning().pvp.nameTiers.redFrom;

export function nameTier(satNhan: number): NameTier {
  if (satNhan >= nameTierRedFrom()) return 3;
  if (satNhan >= nameTierOrangeFrom()) return 2;
  if (satNhan >= nameTierYellowFrom()) return 1;
  return 0;
}

/** A player who attacked you in the last 3 minutes shows grey to YOU (not to anyone else), unless their name is orange or red. */
export function grayWindowMs(): number {
  return tuning().combat.grayWindowMs;
}

/** How a name is shown to one viewer: the real tier, or "gray" when a white or yellow player recently attacked that viewer. */
export type NameColor = NameTier | "gray";
export function displayColor(tier: NameTier, lastAttackedViewerAt: number | undefined, now: number): NameColor {
  return tier <= 1 && lastAttackedViewerAt !== undefined && now - lastAttackedViewerAt < grayWindowMs() ? "gray" : tier;
}

/** The sát nhân after `ms` of being online (it only falls while online; never below 0). */
export function decayedSatNhan(satNhan: number, ms: number): number {
  return Math.max(0, satNhan - (satNhanDecayPerMin() * Math.max(0, ms)) / 60_000);
}

// ---- anh hùng ----
// (the numbers of the anh hùng points are in the tuning, `pvp.hero`)

export interface HeroBonus {
  /** Percent of extra maximum MP (linh lực). */
  mpPct: number;
  /** Percent of extra item drop chance (relative). */
  dropPct: number;
}

/** 200 points: +5% linh lực; 500 points: +10% linh lực and +5% drop chance. Not cumulative: the higher step replaces the lower. */
export function heroBonus(hero: number): HeroBonus {
  const h = tuning().pvp.hero;
  if (hero >= h.tier2) return { ...h.bonus2 };
  if (hero >= h.tier1) return { ...h.bonus1 };
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
  const next: PkScores = { satKhi: killer.satKhi + tuning().pvp.satKhi.perKill, satNhan: killerSatNhan, hero: killer.hero };
  if (tier >= 2) {
    // Killing an orange or red name: hero points while the killer's sát nhân is 0 (nothing carries over), otherwise it only brings sát nhân down.
    if (killerSatNhan === 0) next.hero += tier === 3 ? tuning().pvp.hero.perRed : tuning().pvp.hero.perOrange;
    else next.satNhan = Math.max(0, killerSatNhan - (tier === 3 ? tuning().pvp.satNhan.lostKillingRed : tuning().pvp.satNhan.lostKillingOrange));
  } else if (!selfDefense) {
    // Sát nhân only rises while the killer has no hero points; a killer with hero points just loses them.
    if (killer.hero <= 0) next.satNhan = killerSatNhan + tuning().pvp.satNhan.perKill;
    next.hero = 0;
  }
  const dead: PkScores = {
    satKhi: Math.max(0, victim.satKhi - tuning().pvp.satKhi.lostOnDeath),
    satNhan: Math.max(0, victimSatNhan - tuning().pvp.satNhan.lostOnDeath),
    hero: victim.hero,
  };
  return { killer: next, victim: dead };
}

/** Killing a guard counts as killing a white name (without the self-defence exemption): sát khí rises and so does sát nhân (unless the killer had hero points, which just go). */
export function applyGuardKill(killer: PkScores, killerSatNhan = killer.satNhan): PkScores {
  return { satKhi: killer.satKhi + tuning().pvp.satKhi.perKill, satNhan: killer.hero > 0 ? killerSatNhan : killerSatNhan + tuning().pvp.satNhan.perKill, hero: 0 };
}

// ---- what a death costs by name colour (phase 2f, PR2) ----

/** Chance that a player killed by another player loses one item, by name tier (white, yellow, orange, red). Placeholder values. */
export function pkDropChance(tier: NameTier): number {
  return tuning().pvp.dropChance[tier] ?? 0;
}

/** Share of its maximum durability each worn piece loses at ANY death, by name tier: orange and red names wear their gear down harder. */
export function deathDurabilityOf(tier: NameTier): number {
  return tuning().pvp.deathDurability[tier] ?? 0.05;
}

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
  const c = pickDropCandidate(bag, tier, roll, pick);
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
    ...(c.rs ? { rs: c.rs } : {}),
    ...(c.en ? { en: c.en } : {}),
    to,
    newId: ids.newId,
    mailId: ids.mailId,
    subject,
  };
}

/** The same roll and pick for a death with no player to receive the item (a guard or a monster killed the player): the item is simply lost. */
export function planPkLoss(bag: BagContents, tier: NameTier, roll: number, pick: number): { op: Extract<BagOp, { op: "remove" }>; type: string; qty: number } | null {
  const c = pickDropCandidate(bag, tier, roll, pick);
  return c ? { op: { op: "remove", id: c.id, qty: c.qty }, type: c.type, qty: c.qty } : null;
}

function pickDropCandidate(bag: BagContents, tier: NameTier, roll: number, pick: number) {
  if (roll >= pkDropChance(tier)) return undefined;
  const candidates = [
    ...bag.items.filter((i) => !isBonded(i.type)).map((i) => ({ id: i.id, type: i.type, qty: i.qty, dur: i.dur, max: i.max, lv: i.lv, xp: i.xp, rs: i.rs, en: i.en })),
    ...bag.equipped.filter((e) => !isBonded(e.type)).map((e) => ({ id: e.id, type: e.type, qty: 1, dur: e.dur, max: e.max, lv: e.lv, xp: e.xp, rs: e.rs, en: e.en })),
  ];
  return candidates[Math.min(candidates.length - 1, Math.floor(pick * candidates.length))];
}

/** A guard's kill of a player lowers the victim's sát nhân like any death does. */
export function satNhanAfterDeath(satNhan: number): number {
  return Math.max(0, satNhan - tuning().pvp.satNhan.lostOnDeath);
}

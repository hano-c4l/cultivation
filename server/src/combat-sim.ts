import { BASIC_SKILL_ID, basicSkillAt, gearRegenFrom, regenPerSecond, areaTargets, castReachOf, firstAlongLine, skillAreaOf, weaponAreaOf, weaponReachOf, type AreaDef } from "@game/shared";
import {
  PLAYER_ATTACK_COOLDOWN_MS,
  regenDelayMs,
  REGEN_PER_S,
  CLUSTERS,
  GUARDS,
  getMap,
  GUARD_KIND,
  guardRealmBonus,
  guardTier,
  guardSkills,
  nameTierOrangeFrom,
  guardStats,
  nameTierRedFrom,
  decayedSatNhan,
  isRank,
  bossKind,
  tuningGeneration,
  BOSS_SPOTS,
  bossReward,
  bossSpawnChance,
  bossTier,
  bossPityKills,
  bossShares,
  bossStats,
  bossSkills,
  bossCone,
  bossRegenPerS,
  inCone,
  bossStatTier,
  pickByShare,
  applyExp,
  getRootGrade,
  computeDamage,
  deriveStats,
  clusterSlots,
  killExp,
  levelIndex,
  rollEquipmentDrop,
  rollBookDrop,
  rollRareBook,
  rollPillDrop,
  rollOreDrop,
  rollRefineDrop,
  mpRegenDelayMs,
  modifierTotal,
  restoreVitals,
  type ConstitutionEffect,
  type GearAffinity,
  type Vitals,
  mpRegenPerS,
  availableSkills,
  getSkill,
  type SkillDef,
  rollLinhThachDrop,
  rollLoot,
  type LootDrop,
  monsterStats,
  rollRank,
  rollMonsterElement,
  NO_PATHS,
  pathExpFactor,
  pathBonuses,
  pathSkillDamagePct,
  skillContextFor,
  type PathState,
  SPIRITUAL_ROOTS,
  isMutantRoot,
  elementTuning,
  topContributor,
  findSmoothPath,
  inPlayRect,
  screenToTile,
  isStandable,
  getMonsterDef,
  lineClear,
  nearestStandablePoint,
  positionAlongPath,
  type BaseStats,
  type Combatant,
  type Element,
  type EquipStats,
  type Gender,
  type HitKind,
  type MapData,
  type MapId,
  type MonsterDef,
  type MonsterRank,
  type MonsterSnapshot,
  type Vec2,
  rateCap,
  type BuffStat,
  type EffectView,
  type EffectiveSkill,
  type GearSkillInfo,
  type SkillContext,
  type SpiritualRoot,
  addMastery,
  heroBonus,
  grayWindowMs,
  canStartPvp,
  isPkProtected,
  type PkMode,
  satKhiDamagePct,
  passiveTotals,
  effectiveSkill,
  skillGrade,
  type MapContent,
} from "@game/shared";

/** Everything the simulation needs to know about a character when it joins. */
export interface ProfileSeed {
  id: string;
  name: string;
  /** Spendable potential points as last known (D1 value plus unflushed stage-up points). */
  potentialPoints: number;
  /** The main element (the one a skill without an element, and the grade bonus, go by). */
  element: Element;
  /** The hướng tu the character has taken up (shared/src/paths.ts); absent: none. */
  paths?: PathState;
  /** All the elements, main one first; absent: just `element`. More elements give more skills, and the plain attack and the hits it takes go by all of them (elementOutcome). */
  roots?: readonly Element[];
  base: BaseStats;
  rootGrade: number;
  constitution: string;
  constitutionTier: number;
  gender: Gender;
  /** Stats of the gear worn right now (equipmentBonus); recomputed by the room whenever gear or requirements change. */
  gear?: EquipStats;
  /** Whether the character is meditating when the profile is made (the regeneration the gear gives is in `gear`). */
  meditating?: boolean;
  /** Weapon family of the worn weapon (a skill may need one); null: no weapon or a weapon without a family. */
  weapon?: string | null;
  /** The skills the character was given: its root skills of each realm reached and the ones learned from bí tịch (by id). */
  granted?: readonly string[];
  /** Mastery of the granted skills that have it (level index and points); a skill without an entry is at nhập môn with no points. */
  skillState?: Readonly<Record<string, { lv: number; xp: number }>>;
  /** Skills granted by the pháp bảo worn right now, with each piece's realm and grade; the room refreshes them whenever the gear changes. */
  gearSkills?: readonly GearSkillInfo[];
  /** What the character resonates with (gear of that element or weapon family gives more), and their constitution's effects. */
  affinity?: GearAffinity;
  effects?: readonly ConstitutionEffect[];
  /** HP, MP, cooldowns and buffs they left with (null/absent: fresh). Applied once, when the profile is created. */
  vitals?: Vitals | null;
  realm: number;
  stage: number;
  exp: number;
  /** Sát nhân as of `satNhanAt` (ms, the same clock as the ticks); it falls 5 a minute from there. Guards go for names of 501 and over. */
  satNhan?: number;
  satNhanAt?: number;
  /** PvP scores that matter to combat: sát khí adds damage, the hero points add maximum MP and drop chance (shared/src/pk.ts). */
  satKhi?: number;
  hero?: number;
}

/**
 * Working copy of a character's combat state. It lives in the room's memory only: HP is not persisted, and EXP
 * (the room's working copy, see docs/TECHNICAL.md section 3) is flushed to D1 on stage-up, leave, portal, death and by the
 * debounced save. Points gained from stage-ups are written as a relative delta (`pendingPoints`).
 */
export interface PlayerProfile extends ProfileSeed {
  stats: Combatant;
  expBonus: number;
  hp: number;
  maxHp: number;
  targetId: string | null;
  nextAttackAt: number;
  lastHurtAt: number;
  lastRegenAt: number;
  /** Sitting in meditation: the ordinary regeneration of HP and MP works only then (plus what the gear gives all the time). A hit, a step, an attack or a skill ends it. */
  meditating: boolean;
  /** HP and MP regenerated per second now (points; `setRates` keeps them current), and the fraction of a point of HP carried over between the one-second steps. */
  hpRate: number;
  mpRate: number;
  hpFrac: number;
  lastRepathAt: number;
  lastAttackMsgAt: number;
  pendingPoints: number;
  /** Points carried by a D1 write that has started but not finished; never sent twice. */
  inflightPoints: number;
  expDirty: boolean;
  dead: boolean;
  /** The PK state (see PkMode): off cannot start a fight, PK fights those who are PK or Đồ sát, Đồ sát fights anyone. */
  pkMode: PkMode;
  /** Players who hit this one (not as a retaliation) and when: this player may hit them back even with the PK state off. Cleared by a kill between the two. */
  hitBy: Map<string, number>;
  /** The player that last hit this one while it stood still (it fights back at it even with the PK switch off). */
  retaliateId: string | null;
  /** The attack the player uses in place of the plain one (the basic qi blast in an element of theirs), or undefined for the plain attack. */
  primary?: { skill: string; element: SpiritualRoot };
  /** Earliest time the next potion may be used (healing ones and MP ones have a cooldown each). */
  potionReadyAt: number;
  mpPotionReadyAt: number;
  /**
   * MP is stored as `mp` at time `mpAt` and worked out for any later time (currentMp), so regeneration never needs a tick:
   * a room that is otherwise idle can pause. It regenerates from mpRegenDelayMs() after the last hit taken.
   */
  maxMp: number;
  mp: number;
  mpAt: number;
  /** Skill ready times (ms), by skill id. Memory only: leaving the room resets them (known gap). */
  cooldowns: Map<string, number>;
  /** A skill to use as soon as it can (walking into range first); cleared by moving, targeting or a failure. */
  pendingCast: { skill: string; target: string | null; dest?: Vec2; element?: SpiritualRoot; /** Walks started towards a cast point out of reach (given up after a few that went nowhere). */ tries?: number } | null;
  buffs: ActiveBuff[];
  /** Potions that heal over time (memory only; what is left is paid out when the player leaves). */
  hots: ActiveHot[];
  /** Live mastery of the granted skills (a copy of the seed that the sim changes as skills are used). */
  masteries: Record<string, { lv: number; xp: number }>;
}

/** A potion healing a little every `tickMs` until `left` ticks have run. */
interface ActiveHot {
  item: string;
  /** Amounts still to heal, one per tick (the last one carries the rounding). */
  amounts: number[];
  tickMs: number;
  nextAt: number;
  until: number;
}

/** A running buff: it adds `pct` to attack, defense or dodge until `until`. */
interface ActiveBuff {
  skill: string;
  stat: BuffStat;
  pct: number;
  until: number;
}

type MonsterState = "idle" | "chase" | "return" | "dead";

interface Monster {
  id: string;
  def: MonsterDef;
  tier: number;
  rank: MonsterRank;
  maxHp: number;
  combatant: Combatant;
  /** Damage dealt by each player since the monster last healed; decides who takes a rare monster's reward. */
  damage: Map<string, number>;
  home: Vec2;
  hp: number;
  state: MonsterState;
  path: Vec2[];
  startedAt: number;
  targetId: string | null;
  nextAttackAt: number;
  lastRepathAt: number;
  respawnAt: number;
  /** The map's boss (phase 2h): rolled once, stats of a Đại Yêu of the top bậc times the species' multipliers; never respawns, never rerolls. */
  boss?: boolean;
  /** A vệ binh: fixed class and element, fights only orange and red names and its attackers, pays nothing when killed. */
  guard?: boolean;
  /** Guards only: when each of its skills is ready again, and until when its buff lasts. */
  skillReadyAt?: Record<string, number>;
  buffUntil?: number;
  /** When a boss last healed back at home (it heals once a second). */
  lastRegenAt?: number;
}

export type SimEvent =
  /** A guard was killed by `killerId`: no reward, but the killer's sát khí and sát nhân rise (applyGuardKill). */
  | { t: "guard_kill"; killerId: string }
  | { t: "mon"; monster: MonsterSnapshot }
  | { t: "mon_gone"; id: string }
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number; skill?: string; /** A player answering the player who hit them first. */ ret?: true; /** One of the extra targets of an area blow (the swing is drawn once, for the main target). */ aoe?: true; /** One tick of a lasting zone. */ dot?: true }
  | { t: "hp"; playerId: string; hp: number; maxHp: number }
  /** EXP changed after a kill; `stagesGained > 0` means points changed and the room must persist right away. */
  | { t: "progress"; playerId: string; stagesGained: number }
  /** A monster died and `playerId` (who takes its reward) gets the credit: quests count it. `rare` is any rank above normal. */
  | { t: "kill"; playerId: string; rare: boolean }
  /** The room should try to claim the map's boss for this room (a spawn roll hit, or the pity counter ran out). Answer with bossAnswered. */
  | { t: "boss_request" }
  /** The boss died: everything it pays has been worked out and sent as progress, drop, loot and kill events; the room releases the claim and announces it. */
  | { t: "boss_kill"; killerId: string; name: string; shares: Array<{ id: string; share: number }> }
  /** The kill's EXP, which the pháp bảo bản mệnh of the winner also receives (its own stream, no effect on the character's EXP). */
  | { t: "refine"; playerId: string; gain: number }
  /** MP changed (spent, or settled when hit); the client regenerates it from the snapshot. */
  | { t: "mp"; playerId: string; mp: number; maxMp: number; regenInMs: number; /** Fraction of the maximum regenerated per second. */ perSec: number }
  /** The character stood up from meditation because it was hit or died (a step, an attack or a skill is the room's to see). */
  | { t: "med"; playerId: string; reason: "hit" | "died" }
  | { t: "cast_ok"; playerId: string; skill: string; cdMs: number }
  /** A skill went off, for everyone who can see it: who cast it, at what (a monster or player id) or where (a teleport's destination), in which element. */
  | { t: "fx"; playerId: string; skill: string; target?: string; dest?: Vec2; element?: string }
  /** The boss struck in a cone: where it stands, the point it faced, the reach (tiles) and half the opening (degrees). */
  | { t: "zone"; id: string; playerId: string; skill: string; origin: Vec2; aim: Vec2; ms: number; element?: string }
  | { t: "zone_end"; id: string; playerId: string }
  | { t: "guard_skill"; monsterId: string; skill: "mend" | "ward" | "burst" | "slash" }
  | { t: "cone"; monsterId: string; at: Vec2; aim: Vec2; range: number; halfAngleDeg: number }
  | { t: "cast_fail"; playerId: string; skill: string; reason: "mp" | "cooldown" | "no_target" | "weapon" | "unknown" | "range" | "blocked" }
  /** A teleport went off: the room moves the player to `to` (it owns the player's position). */
  | { t: "teleport"; playerId: string; to: Vec2 }
  | { t: "buff"; playerId: string; skill: string; ms: number }
  /** A skill gained mastery (`up`: it reached a new level). The room keeps the value and writes it with the next save. */
  | { t: "mastery"; playerId: string; skill: string; lv: number; xp: number; up: boolean }
  /** The running effects changed (a buff or a timed potion started or ended): the full list for the buff bar. */
  | { t: "effects"; playerId: string; list: EffectView[] }
  /** A kill dropped items for this player; the room puts them in the bag (or mails them when it is full). */
  | { t: "loot"; playerId: string; drops: LootDrop[] }
  /** A kill dropped Linh Thạch for this player; the room writes it to the ledger. */
  | { t: "drop"; playerId: string; amount: number }
  | { t: "player_dead"; playerId: string; /** The player who landed the killing blow, when it was a player. */ by?: string; /** Killed by a guard (it lowers the victim's sát nhân). */ guard?: true }
  /** A player killed another player: the room settles the scores (shared/src/pk.ts). */
  | { t: "pvp_kill"; killerId: string; victimId: string }
  /** The server wants this player to walk to `to` (chasing their target). */
  | { t: "path_request"; playerId: string; to: Vec2 };

/** Re-plan a chase at most this often, and only when the target moved more than REPATH_DISTANCE. */
const REPATH_MS = 500;

/** A lasting area on the ground (a lane of fire): its caster's blow, repeated every tick on whoever stands in it, until `until`. */
interface Zone {
  id: string;
  owner: string;
  skill: SkillDef;
  element: SpiritualRoot | undefined;
  power: number;
  area: AreaDef;
  origin: Vec2;
  aim: Vec2;
  until: number;
  nextAt: number;
}
/** Most lasting zones a room keeps at once (a cast past it is a plain blow on the spot). */
const MAX_ZONES = 40;

/** Something a blow can fall on: a monster or a player, where it stands. */
type Cand = { id: string; pos: Vec2; m?: Monster; q?: PlayerProfile };
const REPATH_DISTANCE = 0.5;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function lastPoint(path: Vec2[]): Vec2 {
  return path[path.length - 1] ?? [0, 0];
}

/** The skill's realm, grade and mastery level for this character: what effectiveSkill needs. */
export function skillContextOf(
  seed: Pick<ProfileSeed, "rootGrade" | "gearSkills"> & { realm?: number; paths?: PathState; masteries?: Readonly<Record<string, { lv: number }>>; skillState?: Readonly<Record<string, { lv: number }>> },
  def: SkillDef,
): SkillContext {
  const gear = def.source === "gear" ? seed.gearSkills?.find((g) => g.id === def.id) : undefined;
  const lv = def.source === "gear" ? 0 : ((seed.masteries ?? seed.skillState)?.[def.id]?.lv ?? 0);
  return skillContextFor(def, { rootGrade: seed.rootGrade, realm: seed.realm ?? def.realm, level: lv, ...(seed.paths ? { paths: seed.paths } : {}), ...(gear ? { gear } : {}) });
}

function derivedCombatant(seed: ProfileSeed & { buffs?: readonly ActiveBuff[]; masteries?: Readonly<Record<string, { lv: number; xp: number }>> }, stage = seed.stage): { stats: Combatant; maxHp: number; maxMp: number; expBonus: number } {
  const d = deriveStats(seed.base, seed.realm, stage, seed.rootGrade, seed.gear, (seed.roots ?? [seed.element]).length);
  // Buffs and passives only touch attack, defense, dodge and crit (never max HP), so their expiry cannot move the HP ratio.
  let attack = d.attack;
  let defense = d.defense;
  let dodge = d.dodgeRate;
  let crit = d.critRate;
  for (const b of seed.buffs ?? []) {
    if (b.stat === "attack") attack = Math.floor(attack + d.attack * b.pct);
    else if (b.stat === "defense") defense = Math.floor(defense + d.defense * b.pct);
    else if (b.stat === "crit") crit += b.pct * 100;
    else dodge += b.pct * 100;
  }
  // Passive skills work all the time, at the strength their realm, grade and mastery give them (the same sum the character panel shows).
  const passive = passiveTotals(seed.granted ?? [], seed.masteries ?? seed.skillState ?? {}, seed.rootGrade);
  attack = Math.floor(attack + d.attack * passive.attackPct);
  defense = Math.floor(defense + d.defense * passive.defensePct);
  dodge += passive.dodgePoints;
  crit += passive.critPoints;
  // The hướng tu add percent to attack, defense and maximum MP (the same sums the character panel shows) and slow the EXP gained.
  const paths = seed.paths ?? NO_PATHS;
  const pb = pathBonuses(paths);
  attack = Math.floor(attack * (1 + pb.attackPct / 100));
  defense = Math.floor(defense * (1 + pb.defensePct / 100));
  return {
    stats: { attack, defense, critRate: Math.min(rateCap(), crit), dodgeRate: Math.min(rateCap(), dodge), element: seed.element, roots: seed.roots ?? [seed.element] },
    maxHp: d.maxHp,
    maxMp: Math.floor(d.maxMp * (1 + (pb.maxMpPct + heroBonus(seed.hero ?? 0).mpPct) / 100)),
    // The EXP gained is multiplied by 1 / (1 + k * phu tu): folded into the bonus percentage the kill reward takes.
    expBonus: paths.subs.length === 0 ? d.expBonus : ((1 + d.expBonus / 100) * pathExpFactor(paths) - 1) * 100,
  };
}

/**
 * Monsters, targets and fights for one map room. Pure logic: it never touches sockets or D1, so it can be tested and
 * the room only has to deliver the events it returns. Time is passed in; randomness is injected.
 */
/** Tries at finding a random spot for the boss, and how far (tiles) it must stand from every portal and guard. */
const BOSS_SPOT_TRIES = 20;
const BOSS_MIN_GATE_DIST = 25;

/** A copy of what the map has now: its monster groups, its guards and the boss spot it falls back to. */
export function currentContent(mapId: MapId): MapContent {
  const spot = BOSS_SPOTS[mapId];
  return {
    groups: (CLUSTERS[mapId] ?? []).map((g) => ({ ...g })),
    guards: (GUARDS[mapId] ?? []).map((g): [number, number] => [g[0], g[1]]),
    bossSpot: spot ? [spot[0], spot[1]] : null,
  };
}

export class CombatSim {
  private monsters = new Map<string, Monster>();
  private players = new Map<string, PlayerProfile>();
  /** Time of the latest tick (for the self-defence window, which setTarget and queueCast read without a time of their own). */
  private clock = 0;
  private nextMonsterId = 1;
  /** Realm of the map; monster stats and EXP scale from it. */
  private readonly realm: number;
  private readonly content: MapContent;

  constructor(
    private readonly map: MapData,
    mapId: MapId,
    private readonly rand: () => number,
    now: number,
    /** Classes to restore after the room slept, by monster id; without them every monster rolls its class. */
    ranks?: Readonly<Record<string, string>>,
    /** The groups, guards and boss spot to use (the room pins them, so an admin editing the map does not change a room that is running); without it, the map's current ones. */
    content?: MapContent,
  ) {
    this.realm = map.realm ?? map.guardRealm ?? 0;
    this.content = content ?? currentContent(mapId);
    for (const cluster of this.content.groups) {
      const def = getMonsterDef(cluster.kind);
      if (!def) continue;
      for (const [sx, sy] of clusterSlots(cluster)) {
        const home = nearestStandablePoint(map, sx, sy, 2);
        if (!home) continue;
        const id = `m${this.nextMonsterId++}`;
        const m: Monster = {
          id,
          def,
          tier: cluster.tier,
          rank: "normal",
          maxHp: 0,
          combatant: { attack: 0, defense: 0, critRate: 5, dodgeRate: 0, element: def.element },
          damage: new Map(),
          home,
          hp: 0,
          state: "idle",
          path: [home],
          startedAt: now,
          targetId: null,
          nextAttackAt: 0,
          lastRepathAt: 0,
          respawnAt: 0,
        };
        this.applyRank(m, ranks?.[id]);
        m.hp = m.maxHp;
        this.monsters.set(id, m);
      }
    }
    // The guards come after every cluster monster, so the ids of the clusters (and the ranks saved under them) never move.
    const guardDef = getMonsterDef(GUARD_KIND);
    for (const [sx, sy] of guardDef ? this.content.guards : []) {
      const home = nearestStandablePoint(map, sx, sy, 2);
      if (!home || !guardDef) continue;
      const id = `m${this.nextMonsterId++}`;
      const g: Monster = {
        id, def: guardDef, tier: guardTier(), rank: "normal", maxHp: 0,
        combatant: { attack: 0, defense: 0, critRate: 5, dodgeRate: 0, element: guardDef.element },
        damage: new Map(), home, hp: 0, state: "idle", path: [home], startedAt: now, targetId: null, nextAttackAt: 0, lastRepathAt: 0, respawnAt: 0, guard: true,
      };
      this.applyRank(g);
      g.hp = g.maxHp;
      this.monsters.set(id, g);
    }
  }

  /**
   * (Re)rolls the monster's class and element and derives its stats from the map's realm, its bậc, species and class. `saved` is
   * what the room kept across a sleep ("rare1|moc"; an older value is only the class, and then the species' own element stays).
   */
  private applyRank(m: Monster, saved?: string): void {
    if (m.guard) {
      // A guard never rerolls: normal class, its own element, and the stats of a character one realm above the map in a full set of gear
      // (shared/src/guards.ts), with five times the HP.
      const g = guardStats(this.realm);
      m.rank = "normal";
      m.combatant.element = m.def.element;
      m.maxHp = g.maxHp;
      m.combatant.attack = g.attack;
      m.combatant.defense = g.defense;
      m.combatant.critRate = g.critRate;
      m.combatant.dodgeRate = g.dodgeRate;
      m.skillReadyAt = {};
      m.buffUntil = 0;
      return;
    }
    const [savedRank, savedElement] = (saved ?? "").split("|");
    const known = savedRank !== undefined && isRank(savedRank);
    m.rank = known ? (savedRank as MonsterRank) : rollRank(this.rand());
    m.combatant.element = (SPIRITUAL_ROOTS as readonly string[]).includes(savedElement ?? "") ? (savedElement as SpiritualRoot) : known ? m.def.element : rollMonsterElement(this.rand());
    const stats = monsterStats(m.def, this.realm, m.tier, m.rank);
    m.maxHp = stats.maxHp;
    m.combatant.attack = stats.attack;
    m.combatant.defense = stats.defense;
  }

  /** Sets a monster's element (the room never does; tests use it to pin the table's outcome). */
  setMonsterElement(id: string, element: SpiritualRoot): void {
    const m = this.monsters.get(id);
    if (m) m.combatant.element = element;
  }

  /** Sets the boss's health (the dev hook of the boss smoke). */
  setBossHp(hp: number): void {
    for (const m of this.monsters.values()) if (m.boss) m.hp = Math.min(m.maxHp, Math.max(1, hp));
  }

  /** Sets a monster's health (tests use it to end a fight quickly). */
  setMonsterHp(id: string, hp: number): void {
    const m = this.monsters.get(id);
    if (m) m.hp = Math.min(m.maxHp, hp);
  }

  /** Current class of every monster, kept by the room across a sleep so a rebuilt sim cannot reroll rare monsters. */
  ranks(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of this.monsters.values()) if (!m.guard && !m.boss) out[m.id] = `${m.rank}|${m.combatant.element}`;
    return out;
  }

  /**
   * True when nothing needs ticks: no monster is dead (respawn is tick-driven), chasing or walking home, none is
   * within aggro range of a living player, and no living player is walking, fighting, hurt (regeneration is
   * tick-driven) or dead. The room may then stop its
   * interval and let the Durable Object sleep; any move or attack starts it again.
   */
  isIdle(positions: ReadonlyMap<string, Vec2>, moving: ReadonlySet<string> = new Set()): boolean {
    for (const m of this.monsters.values()) {
      if (m.state !== "idle" || m.hp < m.maxHp) return false;
      // An idle monster only looks for a target on the next tick. A monster that just respawned (or got home) next to
      // a standing player would never get that tick and would sit there until the player acted, so it counts as busy.
      const at = lastPoint(m.path);
      for (const [id, pos] of positions) {
        const profile = this.players.get(id);
        if (profile && !profile.dead && dist(at, pos) <= m.def.aggroRadius && this.wouldAggro(m, profile)) return false;
      }
    }
    for (const p of this.players.values()) {
      if (p.dead || p.targetId !== null || (p.hp < p.maxHp && p.hpRate > 0) || p.hots.length > 0 || moving.has(p.id)) return false;
    }
    return this.zones.length === 0; // a lasting zone is tick-driven
  }

  // ---- the map boss (phase 2h) ----
  private bossEnabled = false;
  private bossAsked = false;
  /** Kills of this room not yet added to the map's shared counter (D1, `boss_kills`). */
  private pityKills = 0;
  /** What the other rooms and earlier flushes of this one had added to that counter when it was last read. The boss is due when both together reach the pity number. */
  private pityShared = 0;

  /** Turns the boss rolls on (the room does, for a map that has a boss). `pityKills` are this room's kills kept from before it slept, `shared` the map's counter. */
  enableBoss(pityKills = 0, shared = 0): void {
    this.bossEnabled = true;
    this.pityKills = pityKills;
    this.pityShared = shared;
  }

  /** This room's kills not yet in the shared counter. */
  get pity(): number {
    return this.pityKills;
  }

  /** Hands the pending kills to the room to add to the shared counter (they leave this room's count). */
  takePity(): number {
    const n = this.pityKills;
    this.pityKills = 0;
    return n;
  }

  /** Gives kills back (a flush that failed). */
  returnPity(n: number): void {
    this.pityKills += n;
  }

  /** The shared counter as the last flush or read saw it, this room's own kills included. */
  setSharedPity(total: number): void {
    this.pityShared = total;
  }

  get hasBoss(): boolean {
    for (const m of this.monsters.values()) if (m.boss) return true;
    return false;
  }

  /** Takes the boss off the map without a kill (its claim is gone); returns its id so the room can tell the clients. */
  removeBoss(): string | null {
    for (const m of this.monsters.values()) {
      if (!m.boss) continue;
      this.monsters.delete(m.id);
      for (const p of this.players.values()) if (p.targetId === m.id) p.targetId = null;
      return m.id;
    }
    return null;
  }

  /** The room answered a boss_request: the next one may be raised (the pity counter starts again either way). */
  bossAnswered(): void {
    this.bossAsked = false;
    this.pityKills = 0;
    this.pityShared = 0;
  }

  /**
   * A place for the boss to appear: a random spot of the map (each time it comes it is somewhere else). It must be standable ground inside the
   * map's rectangle, reachable on foot from where characters arrive, and well away from every portal and guard. After a few tries (or when the
   * random numbers keep giving the same spot) it settles for the fixed spot of the map.
   */
  private randomBossHome(mapId: MapId): Vec2 | null {
    const { halfW, halfH } = this.map.rect;
    const arrive: Vec2 = [this.map.spawn[0] + 0.5, this.map.spawn[1] + 0.5];
    for (let attempt = 0; attempt < BOSS_SPOT_TRIES; attempt++) {
      const px = (this.rand() * 2 - 1) * (halfW - 10);
      const py = (this.rand() * 2 - 1) * (halfH - 8);
      const [x, y] = screenToTile(this.map.width, px, py);
      const home = nearestStandablePoint(this.map, x, y, 2);
      if (!home || !inPlayRect(this.map, home[0], home[1])) continue;
      if (this.map.portals.some((p) => dist(home, [p.x + 0.5, p.y + 0.5]) < BOSS_MIN_GATE_DIST)) continue;
      if (this.content.guards.some((g) => dist(home, [g[0], g[1]]) < BOSS_MIN_GATE_DIST)) continue;
      const path = findSmoothPath(this.map, arrive, home);
      const end = path?.[path.length - 1];
      if (!end || dist(end, home) > 0.6) continue;
      return home;
    }
    const spot = this.content.bossSpot;
    return spot ? nearestStandablePoint(this.map, spot[0], spot[1], 3) : null;
  }

  /**
   * Puts the map's boss on the ground at full health, with a freshly rolled element: at `at` (where it stood before the room slept) or at a
   * random spot of the map. Null when it cannot (already one, no boss for this map).
   */
  spawnBoss(mapId: MapId, now: number, at?: Vec2): MonsterSnapshot | null {
    const kind = bossKind(mapId);
    const def = kind ? getMonsterDef(kind) : undefined;
    if (!def || this.hasBoss) return null;
    const home = (at ? nearestStandablePoint(this.map, at[0], at[1], 3) : null) ?? this.randomBossHome(mapId);
    if (!home) return null;
    const m: Monster = {
      id: `m${this.nextMonsterId++}`,
      def,
      tier: bossTier(),
      rank: "rare2",
      maxHp: 0,
      combatant: { attack: 0, defense: 0, critRate: 5, dodgeRate: 0, element: rollMonsterElement(this.rand()) },
      damage: new Map(),
      home,
      hp: 0,
      state: "idle",
      path: [home],
      startedAt: now,
      targetId: null,
      nextAttackAt: 0,
      lastRepathAt: 0,
      respawnAt: 0,
      boss: true,
    };
    const stats = bossStats(this.realm);
    m.maxHp = stats.maxHp;
    m.hp = stats.maxHp;
    m.combatant.attack = stats.attack;
    m.combatant.defense = stats.defense;
    m.combatant.critRate = stats.critRate;
    m.combatant.dodgeRate = stats.dodgeRate;
    m.skillReadyAt = {};
    this.monsters.set(m.id, m);
    return this.snapshot(m, now);
  }

  /** The boss's health as a fraction and its damage table, for keeping across the room sleeping (null: no boss). */
  bossState(): { frac: number; damage: Record<string, number>; home: Vec2 } | null {
    for (const m of this.monsters.values()) {
      if (!m.boss) continue;
      return { frac: m.maxHp > 0 ? m.hp / m.maxHp : 1, damage: Object.fromEntries(m.damage), home: m.home };
    }
    return null;
  }

  /** Puts a boss back the way it was left: this fraction of its health and these damage shares. */
  restoreBoss(frac: number, damage: Readonly<Record<string, number>>): void {
    for (const m of this.monsters.values()) {
      if (!m.boss) continue;
      m.hp = Math.min(m.maxHp, Math.max(1, Math.round(m.maxHp * Math.min(1, Math.max(0, frac)))));
      m.damage = new Map(Object.entries(damage).filter(([, v]) => v > 0));
      return;
    }
  }

  /** A player who died no longer counts towards a boss kill: the damage they did is forgotten. */
  private forgetBossDamage(id: string): void {
    for (const m of this.monsters.values()) if (m.boss) m.damage.delete(id);
  }

  /** A safe map's sim exists only for its guards. */
  get isSafeMap(): boolean {
    return this.map.safe === true;
  }

  get monsterCount(): number {
    return this.monsters.size;
  }

  addPlayer(seed: ProfileSeed): PlayerProfile {
    const d = derivedCombatant(seed);
    const profile: PlayerProfile = {
      ...seed,
      ...d,
      hp: d.maxHp,
      targetId: null,
      nextAttackAt: 0,
      lastHurtAt: 0,
      lastRegenAt: 0,
      meditating: seed.meditating === true,
      hpRate: 0,
      mpRate: 0,
      hpFrac: 0,
      lastRepathAt: 0,
      lastAttackMsgAt: 0,
      pendingPoints: 0,
      inflightPoints: 0,
      expDirty: false,
      dead: false,
      pkMode: 0,
      hitBy: new Map(),
      retaliateId: null,
      potionReadyAt: 0,
      mpPotionReadyAt: 0,
      mp: d.maxMp,
      mpAt: 0,
      cooldowns: new Map(),
      pendingCast: null,
      buffs: [],
      hots: [],
      masteries: { ...(seed.skillState ?? {}) },
    };
    if (seed.vitals) {
      // Back from a reload or another map: pick up where they left, with the regeneration of the time away.
      const now = Date.now();
      // The time away regenerates only what the gear gives (and, in a safe map, the ordinary regeneration): nobody meditates while away.
      const away = regenPerSecond(d.maxHp, d.maxMp, this.map.safe, gearRegenFrom(seed.gear));
      const r = restoreVitals(seed.vitals, now, d.maxHp, d.maxMp, away);
      profile.hp = r.hp;
      profile.mp = r.mp;
      profile.mpAt = now;
      for (const [skill, readyAt] of Object.entries(r.cooldowns)) profile.cooldowns.set(skill, readyAt);
      for (const b of r.buffs) {
        const def = getSkill(b.skill);
        if (def?.buff) profile.buffs.push({ skill: b.skill, stat: def.buff.stat, pct: effectiveSkill(def, skillContextOf(profile, def)).power, until: b.until });
      }
      if (profile.buffs.length > 0) this.recompute(profile, false);
    }
    this.players.set(seed.id, profile);
    this.setRates(profile);
    return profile;
  }

  /**
   * What to store when a character leaves: HP, MP, cooldowns and buffs. null: nothing worth keeping (dead, or already full
   * with nothing running), which clears the stored copy. undefined: no such player (do not touch the stored copy).
   */
  snapshotVitals(id: string, now: number): Vitals | null | undefined {
    const p = this.players.get(id);
    if (!p) return undefined;
    if (p.dead) return null;
    const cd: Record<string, number> = {};
    for (const [skill, readyAt] of p.cooldowns) if (readyAt > now) cd[skill] = readyAt;
    const buffs = p.buffs.filter((b) => b.until > now).map((b) => ({ skill: b.skill, until: b.until }));
    // The periodic save also calls this while the player stays, so it must not change the profile: a potion still working
    // is counted in the stored HP (leaving would otherwise lose the rest) but keeps running here.
    let hp = p.hp;
    for (const h of p.hots) for (const a of h.amounts) hp = Math.min(p.maxHp, hp + a);
    const mp = this.currentMp(p, now);
    if (hp >= p.maxHp && mp >= p.maxMp && Object.keys(cd).length === 0 && buffs.length === 0) return null;
    return { hp, mp, at: now, cd, buffs };
  }

  /** Effects running now, for the buff bar: buff skills ("s:<id>") and potions working over time ("i:<item>"), each with its time left. */
  effectsOf(p: PlayerProfile, now: number): EffectView[] {
    const out: EffectView[] = [];
    for (const b of p.buffs) if (b.until > now) out.push({ id: `s:${b.skill}`, ms: b.until - now });
    for (const h of p.hots) if (h.until > now) out.push({ id: `i:${h.item}`, ms: h.until - now });
    return out;
  }

  /**
   * A potion that heals over time. `fraction` of max HP arrives in equal steps of `tickMs` over `durationMs`. Drinking one
   * while another of the same kind still works restarts it with what was left plus the new dose, so nothing is lost.
   */
  startHot(id: string, item: string, fraction: number, durationMs: number, now: number, tickMs = 1000): SimEvent[] | null {
    const p = this.players.get(id);
    if (!p || p.dead) return null;
    const steps = Math.max(1, Math.round(durationMs / tickMs));
    const total = Math.max(1, Math.round(p.maxHp * fraction));
    const amounts = Array.from({ length: steps }, () => Math.floor(total / steps));
    amounts[steps - 1]! += total - amounts.reduce((a, b) => a + b, 0);
    const old = p.hots.find((h) => h.item === item);
    if (old) for (const a of old.amounts) amounts[amounts.length - 1]! += a;
    p.hots = [...p.hots.filter((h) => h.item !== item), { item, amounts, tickMs, nextAt: now + tickMs, until: now + steps * tickMs }];
    return [{ t: "effects", playerId: id, list: this.effectsOf(p, now) }];
  }

  /** Remaining cooldown of each skill still cooling down, in ms (for the client). */
  cooldownsLeft(p: PlayerProfile, now: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [skill, readyAt] of p.cooldowns) if (readyAt > now) out[skill] = readyAt - now;
    return out;
  }

  removePlayer(id: string): void {
    if (this.players.get(id)?.dead) this.forgetBossDamage(id);
    this.players.delete(id);
    this.zones = this.zones.filter((z) => z.owner !== id); // nobody to pay: the fire goes out (the room has stopped drawing it with the player)
    for (const m of this.monsters.values()) {
      if (m.targetId === id && m.state === "chase") m.state = "return";
    }
  }

  /** Restores `fraction` of max HP (a potion). Returns the new HP, or null for a missing or dead player. */
  heal(id: string, fraction: number): number | null {
    const p = this.players.get(id);
    if (!p || p.dead) return null;
    p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * fraction)));
    return p.hp;
  }

  getPlayer(id: string): PlayerProfile | undefined {
    return this.players.get(id);
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** Re-reads base stats after the player spent potential points; HP keeps its ratio. */
  updateBase(id: string, base: BaseStats): void {
    const p = this.players.get(id);
    if (!p) return;
    p.base = base;
    this.recompute(p, false);
  }

  /** Gear changed (worn, taken off, worn out): re-derive combat stats, keeping the HP ratio. */
  updateGear(id: string, gear: EquipStats, weapon?: string | null, gearSkills?: readonly GearSkillInfo[]): void {
    const p = this.players.get(id);
    if (!p) return;
    this.settleMp(p, Math.max(this.clock, p.mpAt)); // what regenerated at the old rate stays; the gear may change the rate
    p.gear = gear;
    if (gearSkills !== undefined) p.gearSkills = gearSkills;
    if (weapon !== undefined) p.weapon = weapon;
    this.recompute(p, false);
  }

  /** The skills this character can use now: unlocked basic ones plus learned books. */
  skillsOf(p: PlayerProfile): string[] {
    return availableSkills(p.granted ?? [], (p.gearSkills ?? []).map((g) => g.id));
  }

  /** The character took up a hướng tu: its bonuses and skill strengths follow at once. */
  setPaths(id: string, paths: PathState): void {
    const p = this.players.get(id);
    if (!p) return;
    p.paths = paths;
    this.recompute(p, false);
  }

  /** A skill was granted (a book was read, or a realm gave its root skills). */
  addGranted(id: string, skill: string): void {
    const p = this.players.get(id);
    if (p && !(p.granted ?? []).includes(skill)) p.granted = [...(p.granted ?? []), skill];
    if (p) this.recompute(p, false); // a passive takes effect at once
  }

  /** Skills were taken away (a hướng tu was dropped). */
  removeGranted(id: string, skills: readonly string[]): void {
    const p = this.players.get(id);
    if (!p) return;
    p.granted = (p.granted ?? []).filter((s) => !skills.includes(s));
    for (const s of skills) p.cooldowns.delete(s);
    this.recompute(p, false);
  }

  /** Sets the mastery of a skill (a Ngộ Đạo Đan was used); the passives follow the new level. */
  setMastery(id: string, skill: string, lv: number, xp: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.masteries[skill] = { lv, xp };
    this.recompute(p, false);
  }

  /**
   * A breakthrough succeeded: the character is at stage 1 of the next realm with no EXP, and the points are already in D1 (so they
   * are spendable but not pending). Stats follow the new realm and HP/MP refill, like after a stage-up.
   */
  applyBreakthrough(id: string, realm: number, points: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.realm = realm;
    p.stage = 1;
    p.exp = 0;
    p.expDirty = false;
    p.potentialPoints += points;
    this.recompute(p, true);
  }

  /** A breakthrough started: the EXP overflow is used up (already written to D1 by the start batch). */
  applyBreakthroughStart(id: string, capExp: number): void {
    const p = this.players.get(id);
    if (p) p.exp = Math.min(p.exp, capExp);
  }

  /** A breakthrough failed: the working copy is cut to `capExp`, then `lost` EXP comes off (written absolutely with the next save). */
  applyBreakthroughLoss(id: string, lost: number, capExp: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.exp = Math.max(0, Math.min(p.exp, capExp) - lost);
    p.expDirty = true;
  }

  /** What the skill does for this character right now (realm, grade and mastery level included). */
  effectiveOf(p: PlayerProfile, def: SkillDef): EffectiveSkill {
    return effectiveSkill(def, skillContextOf(p, def));
  }

  /** MP at time `now`: the stored value plus regeneration since it was stored (starting mpRegenDelayMs() after the last hit). */
  currentMp(p: PlayerProfile, now: number): number {
    if (p.mp >= p.maxMp) return p.maxMp;
    if (p.mpRate <= 0 || now <= p.mpAt) return p.mp;
    return Math.min(p.maxMp, p.mp + Math.floor(((now - p.mpAt) / 1000) * p.mpRate));
  }

  /** The regeneration per second now: the ordinary one while meditating (always in a safe map, where there is nothing to fear), and what the gear gives. Call after anything that changes it, having settled the MP first. */
  private setRates(p: PlayerProfile): void {
    const r = regenPerSecond(p.maxHp, p.maxMp, p.meditating || this.map.safe, gearRegenFrom(p.gear));
    p.hpRate = r.hp;
    p.mpRate = r.mp;
  }

  /** HP and MP regenerated per second now (what the client shows while it waits for the next message). */
  regenOf(id: string): { hp: number; mp: number } | null {
    const p = this.players.get(id);
    return p ? { hp: p.hpRate, mp: p.mpRate } : null;
  }

  /** Sit down or stand up. Refused (false) when dead. Standing up from an attack, a step or a hit goes through `stopMeditation`. */
  setMeditating(id: string, on: boolean, now: number): boolean {
    const p = this.players.get(id);
    if (!p || p.dead) return false;
    if (p.meditating === on) return true;
    this.settleMp(p, now);
    p.meditating = on;
    this.setRates(p);
    return true;
  }

  /** The character stood up: a hit, a step, an attack, a skill, death. Returns whether it was meditating (the room then tells the client). */
  stopMeditation(id: string, now: number): boolean {
    const p = this.players.get(id);
    if (!p?.meditating) return false;
    this.settleMp(p, now);
    p.meditating = false;
    this.setRates(p);
    return true;
  }

  /** Stores the MP worked out for `now` (call before changing it or before `lastHurtAt` moves). */
  private settleMp(p: PlayerProfile, now: number): void {
    p.mp = this.currentMp(p, now);
    p.mpAt = now;
  }

  /** Restores `fraction` of max MP (a pill) and returns the MP as it stands, or null for a missing or dead player. */
  restoreMp(id: string, fraction: number, now: number): Extract<SimEvent, { t: "mp" }> | null {
    const p = this.players.get(id);
    if (!p || p.dead) return null;
    this.settleMp(p, now);
    p.mp = Math.min(p.maxMp, p.mp + Math.max(1, Math.round(p.maxMp * fraction)));
    return this.mpEvent(p, now) as Extract<SimEvent, { t: "mp" }>;
  }

  mpEvent(p: PlayerProfile, now: number): SimEvent {
    return { t: "mp", playerId: p.id, mp: this.currentMp(p, now), maxMp: p.maxMp, regenInMs: 0, perSec: p.maxMp > 0 ? p.mpRate / p.maxMp : 0 };
  }

  /**
   * Asks to use a skill: checked now (so a refusal is immediate) and again when it goes off. An attack walks into range
   * of its target first (the player's chase does that); heals and buffs go off on the next tick.
   */
  queueCast(playerId: string, skillId: string, targetId: string | null, now: number, dest?: Vec2, element?: SpiritualRoot): { ok: true } | { ok: false; reason: "unknown" | "mp" | "cooldown" | "no_target" | "weapon" } {
    const p = this.players.get(playerId);
    const skill = p ? this.skillFor(p, skillId) : undefined;
    if (!p || p.dead || !skill || skill.kind === "passive" || !this.skillsOf(p).includes(skillId)) return { ok: false, reason: "unknown" };
    if (skill.weapon !== undefined && p.weapon !== skill.weapon) return { ok: false, reason: "weapon" };
    if (now < (p.cooldowns.get(skillId) ?? 0)) return { ok: false, reason: "cooldown" };
    if (this.currentMp(p, now) < this.effectiveOf(p, skill).mpCost) return { ok: false, reason: "mp" };
    let target: string | null = null;
    if (skill.kind === "attack" && !targetId && dest) {
      // Cast at a point (no target named): no chase and no target is set; the blow falls where it is aimed.
      p.targetId = null; // the old target is not chased while the caster walks to the point
      p.lastRepathAt = Number.NEGATIVE_INFINITY;
      p.pendingCast = { skill: skillId, target: null, dest, ...(skill.flex ? { element: element && (p.roots ?? [p.element]).includes(element) ? element : p.element } : {}) };
      return { ok: true };
    }
    if (skill.kind === "attack") {
      target = targetId ?? p.targetId;
      const m = target ? this.monsters.get(target) : undefined;
      const q = target ? this.players.get(target) : undefined;
      const monsterOk = !!m && m.state !== "dead" && !(m.guard && !this.canAttackGuard(p));
      if (!target || (!monsterOk && !(q && this.pvpAllowed(p, q)))) return { ok: false, reason: "no_target" };
      p.targetId = target;
      p.lastRepathAt = Number.NEGATIVE_INFINITY;
    }
    if (skill.kind === "teleport" && !dest) return { ok: false, reason: "no_target" };
    // The element of a flexible attack is one of the caster's own (the main one when none is named or the name is not theirs).
    const chosen = skill.flex ? (element && (p.roots ?? [p.element]).includes(element) ? element : p.element) : undefined;
    p.pendingCast = { skill: skillId, target, ...(skill.kind === "teleport" && dest ? { dest } : {}), ...(chosen ? { element: chosen } : {}) };
    return { ok: true };
  }

  cancelCast(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.pendingCast = null;
  }

  private recompute(p: PlayerProfile, fullHeal: boolean): void {
    const d = derivedCombatant(p);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.stats = d.stats;
    p.maxHp = d.maxHp;
    p.expBonus = d.expBonus;
    p.hp = fullHeal ? d.maxHp : Math.max(p.hp > 0 ? 1 : 0, Math.round(d.maxHp * ratio));
    p.maxMp = d.maxMp;
    p.mp = fullHeal ? d.maxMp : Math.min(p.mp, d.maxMp);
    this.setRates(p); // the rates that are a share of the maximum follow it
  }

  /** EXP from meditation (the room settles it): the same rule as EXP from a kill. Returns how many stages it paid for, or null when the player is not here or dead. */
  addMeditationExp(id: string, gain: number): { stagesGained: number } | null {
    const p = this.players.get(id);
    if (!p || p.dead) return null;
    const r = applyExp({ realm: p.realm, stage: p.stage, exp: p.exp, potentialPoints: 0 }, gain);
    p.exp = r.exp;
    p.expDirty = true;
    if (r.stagesGained > 0) {
      p.stage = r.stage;
      p.pendingPoints += r.potentialPoints;
      p.potentialPoints += r.potentialPoints;
      this.recompute(p, true);
    }
    return { stagesGained: r.stagesGained };
  }

  /** Health coming back to `p` from a draining skill (rounded, at least 1 once there is anything to give back). */
  private drainHealth(p: PlayerProfile, amount: number, events: SimEvent[]): void {
    if (p.dead || amount <= 0 || p.hp >= p.maxHp) return;
    p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(amount)));
    events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
  }

  /** A skill as this player has it: the basic qi blast grows with the realm (range, power, MP, area), the rest are as they are. */
  private skillFor(p: PlayerProfile, id: string): SkillDef | undefined {
    return id === BASIC_SKILL_ID ? basicSkillAt(p.realm) : getSkill(id);
  }

  /** Targets a monster, or (PvP) another player when the rules allow it (PK switch on, nobody under the newbie protection). */
  setTarget(playerId: string, targetId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || p.dead) return false;
    const q = this.players.get(targetId);
    if (q) {
      if (!this.pvpAllowed(p, q)) return false;
    } else {
      const m = this.monsters.get(targetId);
      if (!m || m.state === "dead") return false;
      if (m.guard && !this.canAttackGuard(p)) return false;
    }
    p.pendingCast = null; // a new target cancels a waiting skill
    p.targetId = targetId;
    p.lastRepathAt = Number.NEGATIVE_INFINITY;
    return true;
  }

  /**
   * Whether `p` may attack the player `q` now: both alive, not the same player, neither under the newbie protection (it works both
   * ways), and the PK switch on (or `q` is the one that hit `p` while it stood still, which `p` may answer with the switch off).
   * Safe maps never get here: they have no simulation.
   */
  pvpAllowed(p: PlayerProfile, q: PlayerProfile): boolean {
    if (this.map.safe || p.dead || q.dead || p.id === q.id || isPkProtected(p.realm, p.stage) || isPkProtected(q.realm, q.stage)) return false;
    return canStartPvp(p.pkMode, q.pkMode) || p.retaliateId === q.id || this.hitRecently(p, q.id);
  }

  /** Whether `q` hit `p` in the last 3 minutes (a fight p did not start: it may defend itself whatever its PK state). */
  private hitRecently(p: PlayerProfile, qid: string): boolean {
    const at = p.hitBy.get(qid);
    return at !== undefined && this.clock - at < grayWindowMs();
  }

  /** A player went through a portal: nobody keeps a "hit me" mark or a retaliation aimed at them. (A mere reconnect does not call this.) */
  forgetQuarrels(id: string): void {
    for (const q of this.players.values()) {
      q.hitBy.delete(id);
      if (q.retaliateId === id) q.retaliateId = null;
    }
  }

  /** Forgets who hit whom between two players (after one killed the other, the quarrel is over). */
  clearQuarrel(a: string, b: string): void {
    this.players.get(a)?.hitBy.delete(b);
    this.players.get(b)?.hitBy.delete(a);
  }

  /** The PK state of a player. A player target that the new state does not allow (and is not a defence) is dropped. */
  setPkMode(id: string, mode: PkMode): void {
    const p = this.players.get(id);
    if (!p) return;
    p.pkMode = mode;
    const q = p.targetId ? this.players.get(p.targetId) : undefined;
    if (q && !this.pvpAllowed(p, q)) {
      p.targetId = null;
      p.pendingCast = null;
    }
  }

  /** New sát khí and hero points of a player: the damage bonus and the maximum MP follow. */
  setPk(id: string, scores: { satKhi: number; hero: number; satNhan?: number; satNhanAt?: number }): void {
    const p = this.players.get(id);
    if (!p) return;
    p.satKhi = scores.satKhi;
    p.hero = scores.hero;
    if (scores.satNhan !== undefined) {
      p.satNhan = scores.satNhan;
      p.satNhanAt = scores.satNhanAt ?? this.clock;
    }
    this.recompute(p, false);
  }

  clearTarget(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) {
      p.targetId = null;
      p.pendingCast = null;
    }
  }

  private snapshot(m: Monster, now: number): MonsterSnapshot {
    return {
      id: m.id,
      kind: m.def.id,
      tier: m.boss ? bossStatTier() : m.tier,
      rank: m.rank,
      element: m.combatant.element,
      path: m.path,
      ageMs: now - m.startedAt,
      speed: m.def.speed,
      hp: m.hp,
      maxHp: m.maxHp,
      ...(m.guard ? { guard: true as const } : {}),
      ...(m.boss ? { boss: true as const } : {}),
    };
  }

  snapshots(now: number): MonsterSnapshot[] {
    const out: MonsterSnapshot[] = [];
    for (const m of this.monsters.values()) if (m.state !== "dead") out.push(this.snapshot(m, now));
    return out;
  }

  private position(m: Monster, now: number): Vec2 {
    const p = positionAlongPath(m.path, now - m.startedAt, m.def.speed);
    return [p.x, p.y];
  }

  /** Replans the monster's walk; straight when the line is clear, A* otherwise. Returns false if unreachable. */
  private walk(m: Monster, from: Vec2, to: Vec2, now: number): boolean {
    const path = lineClear(this.map, from, to) ? ([from, to] as Vec2[]) : findSmoothPath(this.map, from, to);
    if (!path) return false;
    m.path = path;
    m.startedAt = now;
    m.lastRepathAt = now;
    return true;
  }

  /** Players who were walking during the current tick; only idle players retaliate on their own. */
  private moving: ReadonlySet<string> = new Set();

  /**
   * Advances the simulation. `positions` holds the live, non-transferring players' current positions and `moving`
   * the ids of those who are currently walking.
   */
  tick(now: number, positions: ReadonlyMap<string, Vec2>, moving: ReadonlySet<string> = new Set()): SimEvent[] {
    this.moving = moving;
    this.clock = now;
    const events: SimEvent[] = [];
    this.tickMonsters(now, positions, events);
    this.tickPlayers(now, positions, events);
    this.tickZones(now, positions, events);
    return events;
  }

  /** The lasting zones hurt whoever is inside them every tick of their own; one ends when its time is up or its caster is gone or dead. */
  private zones: Zone[] = [];
  private zoneSeq = 0;

  private tickZones(now: number, positions: ReadonlyMap<string, Vec2>, events: SimEvent[]): void {
    if (this.zones.length === 0) return;
    const keep: Zone[] = [];
    for (const z of this.zones) {
      const owner = this.players.get(z.owner);
      if (!owner || owner.dead || now >= z.until) {
        events.push({ t: "zone_end", id: z.id, playerId: z.owner });
        continue;
      }
      keep.push(z);
      while (now >= z.nextAt) {
        z.nextAt += z.area.zone!.tickMs;
        // the whole list at once (a zone has no main target), nearest first, at most `maxTargets` of them
        const cands = areaTargets({ ...z.area, maxTargets: z.area.maxTargets + 1 }, z.origin, z.aim, this.blowCandidates(owner, now, positions));
        for (const c of cands) {
          if (c.m) {
            if (c.m.state === "dead" || !this.monsters.has(c.id)) continue;
            this.strikeMonster(owner, c.m, c.pos, now, events, z.skill, z.power, z.element, z.area.pct / 100, true, true);
          } else if (c.q && !c.q.dead && this.pvpAllowed(owner, c.q)) {
            this.strikePlayer(owner, c.q, c.pos, now, events, z.skill, z.power, z.element, z.area.pct / 100, true, true);
          }
        }
      }
    }
    this.zones = keep;
  }

  /** Lays a zone down (a recast of the same skill by the same player replaces the old one). */
  private addZone(p: PlayerProfile, skill: SkillDef, area: AreaDef, origin: Vec2, aim: Vec2, power: number, element: SpiritualRoot | undefined, now: number, events: SimEvent[]): void {
    const old = this.zones.filter((z) => z.owner === p.id && z.skill.id === skill.id);
    for (const z of old) events.push({ t: "zone_end", id: z.id, playerId: z.owner });
    this.zones = this.zones.filter((z) => !old.includes(z));
    if (this.zones.length >= MAX_ZONES) return;
    const id = `z${++this.zoneSeq}`;
    this.zones.push({ id, owner: p.id, skill, element, power, area, origin, aim, until: now + area.zone!.ms, nextAt: now });
    events.push({ t: "zone", id, playerId: p.id, skill: skill.id, origin, aim, ms: area.zone!.ms, ...(element ? { element } : {}) });
  }

  private tickMonsters(now: number, positions: ReadonlyMap<string, Vec2>, events: SimEvent[]): void {
    for (const m of this.monsters.values()) {
      if (m.state === "dead") {
        if (now >= m.respawnAt) {
          this.applyRank(m); // every respawn rolls its class again
          if (this.bossEnabled && !this.bossAsked && !m.guard && !this.hasBoss && (this.pityKills + this.pityShared >= bossPityKills(this.realm) || this.rand() < bossSpawnChance())) {
            this.bossAsked = true;
            events.push({ t: "boss_request" });
          }
          m.hp = m.maxHp;
          m.damage.clear();
          m.state = "idle";
          m.path = [m.home];
          m.startedAt = now;
          m.targetId = null;
          events.push({ t: "mon", monster: this.snapshot(m, now) });
        }
        continue;
      }
      const pos = this.position(m, now);

      if (m.boss && m.state === "idle" && m.hp < m.maxHp && now - (m.lastRegenAt ?? 0) >= 1000) {
        m.lastRegenAt = now;
        m.hp = Math.min(m.maxHp, m.hp + Math.max(1, Math.round(m.maxHp * bossRegenPerS())));
        if (m.hp >= m.maxHp) m.damage.clear(); // whole again: earlier damage no longer counts towards the reward
        events.push({ t: "mon", monster: this.snapshot(m, now) });
      }

      if (m.state === "idle") {
        let best: string | null = null;
        let bestD = m.def.aggroRadius;
        for (const [id, p] of positions) {
          const profile = this.players.get(id);
          if (!profile || profile.dead || !this.wouldAggro(m, profile)) continue;
          const d = dist(pos, p);
          if (d <= bestD) {
            bestD = d;
            best = id;
          }
        }
        if (best) {
          m.state = "chase";
          m.targetId = best;
          m.lastRepathAt = Number.NEGATIVE_INFINITY;
        }
      }

      if (m.state === "chase") {
        const target = m.targetId ? positions.get(m.targetId) : undefined;
        const profile = m.targetId ? this.players.get(m.targetId) : undefined;
        if (!target || !profile || profile.dead || dist(pos, m.home) > m.def.leashRadius) {
          m.state = "return";
          m.targetId = null;
        } else if (dist(pos, target) <= m.def.attackRange) {
          if (m.path.length > 1) {
            m.path = [pos];
            m.startedAt = now;
            events.push({ t: "mon", monster: this.snapshot(m, now) });
          }
          if (now >= m.nextAttackAt) this.monsterAttack(m, profile, now, events, positions);
        } else if (now - m.lastRepathAt >= REPATH_MS && dist(lastPoint(m.path), target) > REPATH_DISTANCE) {
          if (this.walk(m, pos, target, now)) events.push({ t: "mon", monster: this.snapshot(m, now) });
          else m.lastRepathAt = now;
        }
      }

      if (m.state === "return") {
        if (dist(pos, m.home) < 0.3) {
          m.state = "idle";
          // A boss heals back gradually (see bossRegenPerS) and keeps its damage table meanwhile; everything else is whole at once.
          if (!m.boss) {
            m.hp = m.maxHp;
            m.damage.clear(); // healed to full: earlier damage no longer counts towards the reward
          }
          m.path = [m.home];
          m.startedAt = now;
          events.push({ t: "mon", monster: this.snapshot(m, now) });
        } else if (dist(lastPoint(m.path), m.home) > 0.05 && this.walk(m, pos, m.home, now)) {
          events.push({ t: "mon", monster: this.snapshot(m, now) });
        }
      }
    }
  }

  /** Whether a monster starts a chase on this player: any monster goes for anyone in range, a guard only for red names and the ones who hit it. */
  private wouldAggro(m: Monster, p: PlayerProfile): boolean {
    if (!m.guard) return true;
    return m.damage.has(p.id) || this.satNhanNow(p) >= nameTierOrangeFrom();
  }

  /** A player's sát nhân at the sim clock (the stored value less 5 a minute since it was set). */
  private satNhanNow(p: PlayerProfile): number {
    return decayedSatNhan(p.satNhan ?? 0, this.clock - (p.satNhanAt ?? this.clock));
  }

  /** Whether `p` may attack a guard: the PK state must be on and the player must not be under the newbie protection. */
  private canAttackGuard(p: PlayerProfile): boolean {
    return !this.map.safe && p.pkMode > 0 && !isPkProtected(p.realm, p.stage);
  }

  /**
   * What a guard does with this turn: heals itself when hurt, raises its attack, or picks one of its two attack skills, in that order, each on
   * its own cooldown; otherwise a plain attack. Returns the attack power multiplier, or null when the turn went to the heal or the buff.
   */
  private guardTurn(m: Monster, now: number, events: SimEvent[]): number | null | "cone" {
    const ready = (id: string, cd: number): boolean => {
      if (now < (m.skillReadyAt?.[id] ?? 0)) return false;
      (m.skillReadyAt ??= {})[id] = now + cd;
      return true;
    };
    const left = (id: string) => (m.skillReadyAt?.[id] ?? 0) <= now;
    // The boss uses the same turn as a guard with its own numbers and without the buff (two attacks and a heal).
    const guardSk = guardSkills();
    const sk = m.boss ? bossSkills() : guardSk;
    // The boss's special cone first: only in the last quarter of its HP, on a long cooldown.
    if (m.boss && m.hp < m.maxHp * bossCone().below && left("cone") && ready("cone", bossCone().cdMs)) return "cone";
    if (m.hp < m.maxHp * sk.mend.below && left("mend") && ready("mend", sk.mend.cdMs)) {
      m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * sk.mend.fraction));
      events.push({ t: "mon", monster: this.snapshot(m, now) });
      if (m.guard) events.push({ t: "guard_skill", monsterId: m.id, skill: "mend" });
      return null;
    }
    if (!m.boss && now >= (m.buffUntil ?? 0) && left("ward") && ready("ward", guardSk.ward.cdMs)) {
      m.buffUntil = now + guardSk.ward.durationMs;
      events.push({ t: "guard_skill", monsterId: m.id, skill: "ward" });
      return null;
    }
    const buff = now < (m.buffUntil ?? 0) ? 1 + guardSk.ward.attackPct / 100 : 1;
    if (left("burst") && ready("burst", sk.burst.cdMs)) {
      if (m.guard) events.push({ t: "guard_skill", monsterId: m.id, skill: "burst" });
      return sk.burst.power * buff;
    }
    if (left("slash") && ready("slash", sk.slash.cdMs)) {
      if (m.guard) events.push({ t: "guard_skill", monsterId: m.id, skill: "slash" });
      return sk.slash.power * buff;
    }
    return buff;
  }

  private monsterAttack(m: Monster, p: PlayerProfile, now: number, events: SimEvent[], positions?: ReadonlyMap<string, Vec2>): void {
    m.nextAttackAt = now + m.def.attackCooldownMs;
    let power = 1;
    if (m.guard || m.boss) {
      const turn = this.guardTurn(m, now, events);
      if (turn === null) return; // the turn went to a heal or the buff
      if (turn === "cone") return this.bossCone(m, p, now, events, positions);
      power = turn;
    }
    const attacker = power === 1 ? m.combatant : { ...m.combatant, attack: Math.max(1, Math.round(m.combatant.attack * power)) };
    this.hurtPlayer(m, p, attacker, now, events);
  }

  /** The boss's cone: everyone alive inside it (towards `focus`, the player it is fighting) takes a hit of bossCone().power times its attack. */
  private bossCone(m: Monster, focus: PlayerProfile, now: number, events: SimEvent[], positions?: ReadonlyMap<string, Vec2>): void {
    const from = this.position(m, now);
    const aim = positions?.get(focus.id);
    const attacker = { ...m.combatant, attack: Math.max(1, Math.round(m.combatant.attack * bossCone().power)) };
    if (!aim || !positions) return this.hurtPlayer(m, focus, attacker, now, events);
    events.push({ t: "cone", monsterId: m.id, at: from, aim, range: bossCone().range, halfAngleDeg: bossCone().halfAngleDeg });
    for (const [id, at] of positions) {
      const target = this.players.get(id);
      if (!target || target.dead) continue;
      if (inCone(at[0] - from[0], at[1] - from[1], aim[0] - from[0], aim[1] - from[1], bossCone().range, bossCone().halfAngleDeg)) this.hurtPlayer(m, target, attacker, now, events);
    }
  }

  /** One hit from a monster on a player: damage, the events, a retaliation and death. */
  private hurtPlayer(m: Monster, p: PlayerProfile, attacker: Combatant, now: number, events: SimEvent[]): void {
    const hit = computeDamage(attacker, p.stats, this.rand);
    p.hp = Math.max(0, p.hp - hit.damage);
    this.settleMp(p, now); // regeneration up to this hit is kept
    p.lastHurtAt = now;
    if (this.stopMeditation(p.id, now)) events.push({ t: "med", playerId: p.id, reason: "hit" });
    events.push({ t: "hit", from: m.id, to: p.id, kind: hit.kind, damage: hit.damage, hp: p.hp });
    events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
    if (p.mp < p.maxMp) events.push(this.mpEvent(p, now));
    // Standing still and being hit with nothing targeted: fight back (in reach, since the monster is in melee range).
    // A walking player is fleeing and keeps going; a player who already has a target keeps it. PvP will reuse this.
    if (p.hp > 0 && p.targetId === null && !this.moving.has(p.id)) {
      p.targetId = m.id;
      p.lastRepathAt = Number.NEGATIVE_INFINITY;
    }
    if (p.hp <= 0) {
      p.dead = true;
      p.targetId = null;
      this.forgetBossDamage(p.id);
      events.push({ t: "player_dead", playerId: p.id, ...(m.guard ? { guard: true as const } : {}) });
    }
  }

  private tickPlayers(now: number, positions: ReadonlyMap<string, Vec2>, events: SimEvent[]): void {
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const pos = positions.get(p.id);
      if (!pos) continue;
      // A retaliation lasts only while the player still has that attacker targeted.
      if (p.retaliateId !== null && p.targetId !== p.retaliateId) p.retaliateId = null;

      if (p.hp < p.maxHp && p.hpRate > 0 && now - p.lastRegenAt >= 1000) {
        p.lastRegenAt = now;
        p.hpFrac += p.hpRate;
        const gain = Math.floor(p.hpFrac);
        p.hpFrac -= gain;
        if (gain > 0) {
          p.hp = Math.min(p.maxHp, p.hp + gain);
          events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
        }
      }

      let effectsChanged = false;
      if (p.buffs.length > 0 && p.buffs.some((b) => b.until <= now)) {
        p.buffs = p.buffs.filter((b) => b.until > now);
        this.recompute(p, false);
        effectsChanged = true;
      }
      if (p.hots.length > 0) {
        for (const h of p.hots) {
          while (h.amounts.length > 0 && now >= h.nextAt) {
            p.hp = Math.min(p.maxHp, p.hp + h.amounts.shift()!);
            h.nextAt += h.tickMs;
            events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
          }
        }
        if (p.hots.some((h) => h.amounts.length === 0)) {
          p.hots = p.hots.filter((h) => h.amounts.length > 0);
          effectsChanged = true;
        }
      }
      if (effectsChanged) events.push({ t: "effects", playerId: p.id, list: this.effectsOf(p, now) });
      if (p.pendingCast && this.runCast(p, pos, now, events, positions)) continue;

      if (!p.targetId) continue;
      const rival = this.players.get(p.targetId);
      if (rival) {
        this.tickPvpTarget(p, rival, pos, positions, now, events);
        continue;
      }
      const m = this.monsters.get(p.targetId);
      if (!m || m.state === "dead") {
        p.targetId = null;
        continue;
      }
      const mpos = this.position(m, now);
      const d = dist(pos, mpos);
      const reach = this.reachOf(p);
      if (d <= reach) {
        if (this.strikeDue(p, m.id, now)) this.playerAttack(p, m, mpos, now, events, undefined, 1, undefined, pos, positions);
      } else if (now - p.lastRepathAt >= REPATH_MS) {
        p.lastRepathAt = now;
        events.push({ t: "path_request", playerId: p.id, to: this.standOff(pos, mpos, reach) });
      }
    }
  }

  /**
   * The player's chosen attack in place of the plain one, when it can be used now: the player has it, it is an attack and there is MP for it (the cooldown does
   * not count: the player waits for it standing where it reaches). Otherwise the plain attack.
   */
  private primaryOf(p: PlayerProfile, now: number): SkillDef | undefined {
    if (!p.primary) return undefined;
    const def = this.skillFor(p, p.primary.skill);
    if (!def || def.kind !== "attack" || !this.skillsOf(p).includes(def.id)) return undefined;
    return this.currentMp(p, now) >= this.effectiveOf(p, def).mpCost ? def : undefined;
  }

  /** The player picks the attack that stands in for the plain one (`skill` empty: back to the plain attack). Only the basic qi blast, in an element the player has. */
  setPrimary(id: string, skill: string, element?: SpiritualRoot): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    if (!skill) {
      delete p.primary;
      return true;
    }
    if (skill !== BASIC_SKILL_ID || !this.skillsOf(p).includes(skill)) return false;
    const roots = p.roots ?? [p.element];
    p.primary = { skill, element: element && roots.includes(element) ? element : p.element };
    return true;
  }

  /** How far the player's next blow reaches: the waiting skill's range, the chosen attack's, else the wielded weapon's. */
  private reachOf(p: PlayerProfile): number {
    const skill = p.pendingCast ? this.skillFor(p, p.pendingCast.skill) : undefined;
    if (skill && skill.kind === "attack") return castReachOf(skill);
    const primary = this.primaryOf(p, this.clock);
    return primary ? castReachOf(primary) : weaponReachOf(p.weapon);
  }

  /** In reach of the target and free to strike: the chosen attack when there is one, else the plain blow. Returns whether a plain blow is due (the chosen attack was queued or is cooling down: no). */
  private strikeDue(p: PlayerProfile, target: string, now: number): boolean {
    if (now < p.nextAttackAt || p.pendingCast) return false;
    const primary = this.primaryOf(p, now);
    if (!primary) return true;
    if (now >= (p.cooldowns.get(primary.id) ?? 0)) this.queueCast(p.id, primary.id, target, now, undefined, p.primary!.element);
    return false;
  }

  /** Where to stand to hit `to` from `pos`: on the line between them, a little inside `reach` (about one tile short for a short weapon). */
  private standOff(pos: Vec2, to: Vec2, reach: number): Vec2 {
    const d = dist(pos, to);
    const k = d > 0 ? Math.max(0.8, reach - 0.6) / d : 0;
    return [to[0] + (pos[0] - to[0]) * k, to[1] + (pos[1] - to[1]) * k];
  }

  /** The player's target is another player: swing when in reach, walk towards them when not, drop the target when the rules no longer allow it. */
  private tickPvpTarget(p: PlayerProfile, q: PlayerProfile, pos: Vec2, positions: ReadonlyMap<string, Vec2>, now: number, events: SimEvent[]): void {
    const qpos = positions.get(q.id);
    if (!qpos || !this.pvpAllowed(p, q)) {
      p.targetId = null;
      return;
    }
    const d = dist(pos, qpos);
    const reach = this.reachOf(p);
    if (d <= reach) {
      if (this.strikeDue(p, q.id, now)) this.pvpAttack(p, q, qpos, now, events, undefined, 1, undefined, pos, positions);
    } else if (now - p.lastRepathAt >= REPATH_MS) {
      p.lastRepathAt = now;
      events.push({ t: "path_request", playerId: p.id, to: this.standOff(pos, qpos, reach) });
    }
  }

  /**
   * Goes off with the queued skill when it can. Returns true when the skill was used or dropped (the player's turn is
   * over), false while the player is still walking into range.
   */
  private runCast(p: PlayerProfile, pos: Vec2, now: number, events: SimEvent[], positions: ReadonlyMap<string, Vec2>): boolean {
    const pending = p.pendingCast;
    const skill = pending ? this.skillFor(p, pending.skill) : undefined;
    if (!pending || !skill) {
      p.pendingCast = null;
      return false;
    }
    const fail = (reason: "mp" | "cooldown" | "no_target" | "weapon" | "unknown" | "range" | "blocked") => {
      p.pendingCast = null;
      events.push({ t: "cast_fail", playerId: p.id, skill: skill.id, reason });
      return true;
    };
    if (skill.weapon !== undefined && p.weapon !== skill.weapon) return fail("weapon");
    if (now < (p.cooldowns.get(skill.id) ?? 0)) return fail("cooldown");
    const eff = this.effectiveOf(p, skill);
    if (this.currentMp(p, now) < eff.mpCost) return fail("mp");
    // A teleport is checked again at the moment it goes off, from where the player really stands: close enough, a standable
    // spot, and reachable on foot (so nobody can land inside a sealed area).
    if (skill.kind === "teleport") {
      const dest = pending.dest;
      if (!dest) return fail("no_target");
      if (dist(pos, dest) > skill.range + 0.5) return fail("range");
      if (!isStandable(this.map, dest[0], dest[1]) || !findSmoothPath(this.map, pos, dest)) return fail("blocked");
    }
    let m: Monster | undefined;
    let mpos: Vec2 | undefined;
    let q: PlayerProfile | undefined;
    let qpos: Vec2 | undefined;
    let aimAt: Vec2 | undefined;
    if (skill.kind === "attack" && !pending.target && pending.dest) {
      // Cast at a point: out of reach, the caster first walks to the spot just in reach of the point (the blow falls on the point itself).
      const reach = castReachOf(skill);
      const around = skillAreaOf(skill);
      if (around.shape === "circle" && around.at === "self") {
        aimAt = pos; // a ring round the caster has no use for the point: it goes off where the caster stands
      } else if (dist(pos, pending.dest) > reach) {
        if (now - p.lastRepathAt < REPATH_MS) return false;
        if ((pending.tries ?? 0) >= 4 && !this.moving.has(p.id)) return fail("range"); // the walks went nowhere (no way there)
        p.lastRepathAt = now;
        pending.tries = (pending.tries ?? 0) + 1;
        events.push({ t: "path_request", playerId: p.id, to: this.standOff(pos, pending.dest, reach) });
        return false;
      }
      aimAt ??= pending.dest;
    } else if (skill.kind === "attack") {
      q = pending.target ? this.players.get(pending.target) : undefined;
      if (q) {
        qpos = positions.get(q.id);
        if (!qpos || !this.pvpAllowed(p, q)) return fail("no_target");
        if (dist(pos, qpos) > castReachOf(skill)) return false;
      } else {
        m = pending.target ? this.monsters.get(pending.target) : undefined;
        if (!m || m.state === "dead") return fail("no_target");
        mpos = this.position(m, now);
        if (dist(pos, mpos) > castReachOf(skill)) return false; // still walking: the chase below brings the player closer
      }
    }
    // The skill goes off: pay, start the cooldown, then its effect.
    this.settleMp(p, now);
    p.mp -= eff.mpCost;
    p.cooldowns.set(skill.id, now + eff.cooldownMs);
    p.pendingCast = null;
    events.push(this.mpEvent(p, now), { t: "cast_ok", playerId: p.id, skill: skill.id, cdMs: eff.cooldownMs });
    events.push({ t: "fx", playerId: p.id, skill: skill.id, ...(pending.target ? { target: pending.target } : {}), ...(aimAt ? { dest: aimAt } : pending.dest ? { dest: pending.dest } : {}), ...(pending.element ? { element: pending.element } : {}) });
    if (skill.kind === "teleport" && pending.dest) {
      p.targetId = null;
      events.push({ t: "teleport", playerId: p.id, to: pending.dest });
    } else if (skill.kind === "heal") {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * eff.power)));
      events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
      if (p.hp > before) this.gainMastery(p, skill, events); // healing at full HP teaches nothing
    } else if (skill.kind === "buff" && skill.buff) {
      this.gainMastery(p, skill, events);
      p.buffs = [...p.buffs.filter((b) => b.skill !== skill.id), { skill: skill.id, stat: skill.buff.stat, pct: eff.power, until: now + skill.buff.durationMs }];
      this.recompute(p, false);
      events.push({ t: "buff", playerId: p.id, skill: skill.id, ms: skill.buff.durationMs }, { t: "effects", playerId: p.id, list: this.effectsOf(p, now) });
    } else if (skill.kind === "attack" && skillAreaOf(skill).zone) {
      // A lasting zone: laid at the aimed point (a line runs from the caster towards it) even when nobody stands there; mastery is earned once, now.
      p.nextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
      this.addZone(p, skill, skillAreaOf(skill), pos, aimAt ?? qpos ?? mpos ?? pending.dest ?? pos, eff.power, pending.element, now, events);
      this.gainMastery(p, skill, events);
    } else if (q && qpos) {
      const done = this.pvpAttack(p, q, qpos, now, events, skill, eff.power, pending.element, pos, positions);
      if (done > 0) this.gainMastery(p, skill, events);
    } else if (aimAt) {
      const done = this.playerAttack(p, undefined, aimAt, now, events, skill, eff.power, pending.element, pos, positions);
      if (done > 0) this.gainMastery(p, skill, events);
    } else if (m && mpos) {
      const done = this.playerAttack(p, m, mpos, now, events, skill, eff.power, pending.element, pos, positions);
      if (done > 0) this.gainMastery(p, skill, events);
    }
    return true;
  }

  /**
   * What a player hits with: the plain attack or one skill, in its element, with every damage share that applies (grade, constitution,
   * hướng tu) and the sát khí bonus. Used for monsters and for other players alike.
   */
  private attackerFor(p: PlayerProfile, skill?: SkillDef, skillPower = 1, skillElement?: SpiritualRoot, scale = 1): Combatant {
    // A skill hits as the caster's own stats scaled by its power, in its own element; one without an element uses the caster's
    // MAIN element. The plain attack goes by ALL the caster's elements against the target's (elementOutcome: every pair scores +1, -1 or 0 and the sum decides); a skill has one element, so only its pairs count.
    // An attack in one of the caster's own elements gets the damage share of the root's grade (phẩm cấp).
    // The constitution's "skill damage" effects (percent) add to a matching skill: all skills, its element, the wielded weapon family or the skill itself.
    const roots = p.roots ?? [p.element];
    const element = skill ? (skillElement ?? skill.element ?? p.element) : p.element;
    // A skill's grade is already in its power (effectiveSkill), so only the plain attack takes the root grade's damage share here.
    const gradePct = !skill && roots.includes(element) ? getRootGrade(p.rootGrade).elementDamagePct : 0;
    const bonusPct = skill ? modifierTotal(p.effects ?? [], "skill_damage", { elements: [element], weapons: p.weapon ? [p.weapon] : [], skill: skill.id }).percent + pathSkillDamagePct(p.paths ?? NO_PATHS, skill, p.weapon ?? null) : 0;
    const mutantPct = skill && isMutantRoot(element) ? elementTuning().mutantSkillBonusPct : 0;
    const power = skill ? skillPower * (1 + mutantPct / 100) : 1;
    const skMult = 1 + satKhiDamagePct(p.satKhi ?? 0) / 100;
    return { ...p.stats, attack: Math.max(1, Math.round(p.stats.attack * power * (1 + gradePct / 100) * (1 + bonusPct / 100) * skMult * scale)), element, roots: skill ? undefined : roots };
  }


  /**
   * Whoever a blow can fall on besides its main target: the monsters (a guard only for a player in the slaughter state) and the players the PK rules
   * allow (the slaughter state: anyone; the normal state: players in it too; self-defence: whoever is being answered).
   */
  private blowCandidates(p: PlayerProfile, now: number, positions: ReadonlyMap<string, Vec2> | undefined): Cand[] {
    const out: Cand[] = [];
    const slaughter = !this.map.safe && p.pkMode === 2 && !isPkProtected(p.realm, p.stage);
    for (const other of this.monsters.values()) {
      if (other.state === "dead" || (other.guard && !slaughter)) continue;
      out.push({ id: other.id, pos: this.position(other, now), m: other });
    }
    for (const q of this.players.values()) {
      const qpos = positions?.get(q.id);
      if (qpos && this.pvpAllowed(p, q)) out.push({ id: q.id, pos: qpos, q });
    }
    return out;
  }

  /** The extra targets take the blow (monsters and players alike) at `pct` of its damage; one that died or left the map before its turn is skipped. */
  private strikeExtras(p: PlayerProfile, extra: readonly Cand[], area: AreaDef, now: number, events: SimEvent[], skill: SkillDef | undefined, skillPower: number, skillElement: SpiritualRoot | undefined): void {
    for (const e of extra) {
      if (e.m) {
        if (e.m.state === "dead" || !this.monsters.has(e.id)) continue;
        this.strikeMonster(p, e.m, e.pos, now, events, skill, skillPower, skillElement, area.pct / 100, true);
      } else if (e.q && !e.q.dead && this.pvpAllowed(p, e.q)) {
        this.strikePlayer(p, e.q, e.pos, now, events, skill, skillPower, skillElement, area.pct / 100, true);
      }
    }
  }

  /**
   * A blow at a monster: the main target takes it in full, and the monsters and players inside the area of the blow (the weapon's sweep for a plain
   * attack, the skill's own area) take `pct` of it. One swing costs one cooldown and, for a skill, earns its mastery once; the damage returned is the main
   * target's. `origin` is where the blow comes from (the attacker), `aim` the point it is aimed at when there is no target at all (a cast at a point):
   * then the nearest target in the area is the main one and a swing that finds none is wasted.
   */
  private playerAttack(p: PlayerProfile, m: Monster | undefined, mpos: Vec2, now: number, events: SimEvent[], skill?: SkillDef, skillPower = 1, skillElement?: SpiritualRoot, origin?: Vec2, positions?: ReadonlyMap<string, Vec2>): number {
    p.nextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
    const from: Vec2 = origin ?? mpos;
    const area: AreaDef = skill ? skillAreaOf(skill) : weaponAreaOf(p.weapon ?? undefined);
    // A single-target blow at a target (a bow, a fist) needs no scan of the others.
    if (m && area.shape === "single") return this.strikeMonster(p, m, mpos, now, events, skill, skillPower, skillElement, 1, false);
    const candidates = this.blowCandidates(p, now, positions);
    let main: Cand | undefined = m ? { id: m.id, pos: mpos, m } : undefined;
    if (!main) {
      // A cast at a point: with an area, the nearest target inside it; without, the first along the line.
      main = area.shape === "single" ? firstAlongLine(from, mpos, skill?.range ?? 6, 0.9, candidates) : areaTargets({ ...area, maxTargets: 2 }, from, mpos, candidates)[0];
      if (!main) return 0;
    }
    // The extra targets are picked before anything is struck: a kill (or a boss, which leaves the map) must not change who is in the swing.
    const extra = areaTargets(area, from, m ? main.pos : mpos, candidates, main.id);
    const done = main.m ? this.strikeMonster(p, main.m, main.pos, now, events, skill, skillPower, skillElement, 1, false) : this.strikePlayer(p, main.q!, main.pos, now, events, skill, skillPower, skillElement, 1, false);
    this.strikeExtras(p, extra, area, now, events, skill, skillPower, skillElement);
    return done;
  }

  /** One monster takes the blow (damage, the pull onto the attacker, a kill and everything it pays); `scale` is the share of the damage an extra target takes. */
  private strikeMonster(p: PlayerProfile, m: Monster, mpos: Vec2, now: number, events: SimEvent[], skill: SkillDef | undefined, skillPower: number, skillElement: SpiritualRoot | undefined, scale: number, aoe: boolean, dot = false): number {
    // A finishing skill hits harder a target that is already low; a draining one gives part of the damage back as health.
    const finishing = skill?.execute !== undefined && m.maxHp > 0 && m.hp / m.maxHp < skill.execute.below ? skill.execute.mult : 1;
    const attacker = this.attackerFor(p, skill, skillPower * finishing, skillElement, scale);
    const hit = computeDamage(attacker, m.combatant, this.rand);
    const applied = Math.min(m.hp, hit.damage);
    if (skill?.drain && !aoe && !dot) this.drainHealth(p, applied * skill.drain, events);
    m.hp -= applied;
    m.damage.set(p.id, (m.damage.get(p.id) ?? 0) + applied);
    events.push({ t: "hit", from: p.id, to: m.id, kind: hit.kind, damage: hit.damage, hp: m.hp, ...(skill ? { skill: skill.id } : {}), ...(aoe ? { aoe: true as const } : {}), ...(dot ? { dot: true as const } : {}) });
    if (m.hp > 0) {
      // Being hit pulls an idle or retreating monster onto the attacker.
      if (m.state === "idle" || m.state === "return") {
        m.state = "chase";
        m.targetId = p.id;
        m.lastRepathAt = Number.NEGATIVE_INFINITY;
      }
      return applied;
    }
    m.state = "dead";
    m.respawnAt = now + m.def.respawnMs;
    m.targetId = null;
    m.path = [mpos];
    events.push({ t: "mon_gone", id: m.id });
    for (const other of this.players.values()) if (other.targetId === m.id) other.targetId = null;
    if (m.boss) {
      this.monsters.delete(m.id);
      this.payBoss(m, p, events);
      return applied;
    }
    if (!m.guard) this.pityKills++;
    if (m.guard) {
      // A guard pays nothing: no EXP, no Linh Thạch, no loot, no quest credit. The killer's scores rise like for a white name.
      m.damage.clear();
      events.push({ t: "guard_kill", killerId: p.id });
      return applied;
    }
    // A normal monster pays whoever lands the last hit. A rare one pays its top contributor (70% damage share +
    // 30% last hit) among the players still here, which can be someone other than the killer.
    const winner =
      m.rank === "normal"
        ? p
        : this.players.get(topContributor(m.damage, m.maxHp, p.id, (id) => !!this.players.get(id) && !this.players.get(id)!.dead) ?? p.id) ?? p;
    const { stagesGained, gain } = this.reward(winner, m);
    events.push({ t: "progress", playerId: winner.id, stagesGained });
    events.push({ t: "kill", playerId: winner.id, rare: m.rank !== "normal" });
    events.push({ t: "refine", playerId: winner.id, gain });
    const drop = rollLinhThachDrop(levelIndex(this.realm, m.tier), m.rank, this.rand(), this.rand());
    if (drop > 0) events.push({ t: "drop", playerId: winner.id, amount: drop });
    // The hero points of the winner raise the chance of every item roll (the rolls themselves are drawn in the same order).
    const dropMult = 1 + heroBonus(winner.hero ?? 0).dropPct / 100;
    const loot = rollLoot(m.rank, this.rand, dropMult, this.realm);
    // Drawn after every other roll of the kill, so the sequence of the older rolls does not change.
    const gear = rollEquipmentDrop(this.realm, m.tier, m.rank, this.rand, dropMult);
    if (gear) loot.push({ item: gear.type, qty: 1, ...(gear.dur !== undefined ? { dur: gear.dur, max: gear.max } : {}) });
    const book = rollBookDrop(m.rank, this.rand, dropMult); // two more rolls, after everything else
    if (book) loot.push({ item: book, qty: 1 });
    const pill = rollPillDrop(this.realm, m.rank, this.rand, dropMult); // one more roll, after everything else
    if (pill) loot.push({ item: pill, qty: 1 });
    const ore = rollOreDrop(this.realm, m.rank, this.rand, dropMult); // two more rolls: the blacksmith's ore of this realm
    if (ore) loot.push(ore);
    const refine = rollRefineDrop(this.realm, m.rank, this.rand, dropMult); // two more: the refining ore of this realm
    if (refine) loot.push(refine);
    const rare = rollRareBook(m.rank, this.realm, this.rand); // two more: a rare book of this realm, very seldom
    if (rare) loot.push({ item: rare, qty: 1 });
    if (loot.length > 0) events.push({ t: "loot", playerId: winner.id, drops: loot });
    if (stagesGained > 0) events.push({ t: "hp", playerId: winner.id, hp: winner.hp, maxHp: winner.maxHp });
    m.damage.clear();
    return applied;
  }


  /**
   * One blow at another player. The same hit event as a blow at a monster (so it also ends a breakthrough or a talisman channel), the same
   * damage rules (defence, elements, critical, dodge) with the sát khí bonus. The victim, if it stands still with nothing targeted, fights
   * back even with the PK switch off. Returns the damage dealt (for the mastery of a skill). A kill ends the target and tells the room
   * (pvp_kill) so it settles the scores; the death itself goes through player_dead like a death to a monster.
   */
  private pvpAttack(p: PlayerProfile, q: PlayerProfile, qpos: Vec2, now: number, events: SimEvent[], skill?: SkillDef, skillPower = 1, skillElement?: SpiritualRoot, origin?: Vec2, positions?: ReadonlyMap<string, Vec2>): number {
    p.nextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
    const area: AreaDef = skill ? skillAreaOf(skill) : weaponAreaOf(p.weapon ?? undefined);
    if (area.shape === "single") return this.strikePlayer(p, q, qpos, now, events, skill, skillPower, skillElement, 1, false);
    const extra = areaTargets(area, origin ?? qpos, qpos, this.blowCandidates(p, now, positions), q.id);
    const done = this.strikePlayer(p, q, qpos, now, events, skill, skillPower, skillElement, 1, false);
    this.strikeExtras(p, extra, area, now, events, skill, skillPower, skillElement);
    return done;
  }

  /** One player takes the blow (`scale`: the share of the damage an extra target takes; `aoe`: it is not the one aimed at). */
  private strikePlayer(p: PlayerProfile, q: PlayerProfile, qpos: Vec2, now: number, events: SimEvent[], skill: SkillDef | undefined, skillPower: number, skillElement: SpiritualRoot | undefined, scale: number, aoe: boolean, dot = false): number {
    const finishing = skill?.execute !== undefined && q.maxHp > 0 && q.hp / q.maxHp < skill.execute.below ? skill.execute.mult : 1;
    const attacker = this.attackerFor(p, skill, skillPower * finishing, skillElement, scale);
    const hit = computeDamage(attacker, q.stats, this.rand);
    // A blow that answers someone who hit first (the automatic retaliation, or a click back by hand) is a defence: it is marked `ret`, it
    // does not make the answerer "grey" to the attacker and it is not counted as striking first when a kill is scored.
    const answering = p.retaliateId === q.id || this.hitRecently(p, q.id);
    if (!answering) q.hitBy.set(p.id, now);
    const applied = Math.min(q.hp, hit.damage);
    if (skill?.drain && !aoe) this.drainHealth(p, applied * skill.drain, events);
    q.hp = Math.max(0, q.hp - hit.damage);
    this.settleMp(q, now); // regeneration up to this hit is kept
    q.lastHurtAt = now;
    if (this.stopMeditation(q.id, now)) events.push({ t: "med", playerId: q.id, reason: "hit" });
    events.push({ t: "hit", from: p.id, to: q.id, kind: hit.kind, damage: hit.damage, hp: q.hp, ...(skill ? { skill: skill.id } : {}), ...(answering ? { ret: true as const } : {}), ...(aoe ? { aoe: true as const } : {}), ...(dot ? { dot: true as const } : {}) });
    events.push({ t: "hp", playerId: q.id, hp: q.hp, maxHp: q.maxHp });
    if (q.mp < q.maxMp) events.push(this.mpEvent(q, now));
    if (q.hp > 0) {
      if (q.targetId === null && !this.moving.has(q.id)) {
        q.targetId = p.id;
        q.retaliateId = p.id;
        q.lastRepathAt = Number.NEGATIVE_INFINITY;
      }
      return applied;
    }
    q.dead = true;
    this.forgetBossDamage(q.id);
    q.targetId = null;
    q.pendingCast = null;
    if (p.targetId === q.id) p.targetId = null;
    for (const other of this.players.values()) if (other.targetId === q.id) other.targetId = null;
    events.push({ t: "player_dead", playerId: q.id, by: p.id });
    events.push({ t: "pvp_kill", killerId: p.id, victimId: q.id });
    return applied;
  }

  /** Mastery from one successful use of a skill that has levels (not a gear skill). A new level re-derives passives. */
  private gainMastery(p: PlayerProfile, skill: SkillDef, events: SimEvent[]): void {
    if (skill.source === "gear") return;
    const now = p.masteries[skill.id] ?? { lv: 0, xp: 0 };
    const r = addMastery(now.lv, now.xp, 1, skillGrade(skill, p.rootGrade));
    if (r.level === now.lv && r.mastery === now.xp) return;
    p.masteries[skill.id] = { lv: r.level, xp: r.mastery };
    events.push({ t: "mastery", playerId: p.id, skill: skill.id, lv: r.level, xp: r.mastery, up: r.up });
    if (r.up) this.recompute(p, false);
  }

  /** Gives the killer EXP (with their bonus) and applies any stage-ups. Linh Thạch drops are rolled by the caller. */
  private reward(p: PlayerProfile, m: Monster, scale = 1): { stagesGained: number; gain: number } {
    const gain = Math.floor(killExp({ realm: this.realm, tier: m.tier, rank: m.rank }, p.realm, p.expBonus) * scale);
    const r = applyExp({ realm: p.realm, stage: p.stage, exp: p.exp, potentialPoints: 0 }, gain);
    p.exp = r.exp;
    p.expDirty = true;
    if (r.stagesGained > 0) {
      p.stage = r.stage;
      p.pendingPoints += r.potentialPoints;
      p.potentialPoints += r.potentialPoints;
      this.recompute(p, true);
    }
    return { stagesGained: r.stagesGained, gain };
  }

  /**
   * The boss died: its reward is split by bossShares among the players still here and alive. Each gets their share of the EXP and of
   * the Linh Thạch pool; the items (`itemRounds` rounds of Đại Yêu loot with better chances) each go whole to one sharing player,
   * picked by share. The damage table is cleared and the room told, so it can release the claim and announce.
   */
  private payBoss(m: Monster, killer: PlayerProfile, events: SimEvent[]): void {
    const shares = bossShares(m.damage, m.maxHp, killer.id, (id) => {
      const q = this.players.get(id);
      return !!q && !q.dead;
    });
    const items = new Map<string, LootDrop[]>();
    const rw = bossReward();
    for (let i = 0; i < rw.itemRounds; i++) {
      const loot = rollLoot(m.rank, this.rand, rw.itemChanceMult, this.realm);
      const gear = rollEquipmentDrop(this.realm, m.tier, m.rank, this.rand, rw.itemChanceMult);
      if (gear) loot.push({ item: gear.type, qty: 1, ...(gear.dur !== undefined ? { dur: gear.dur, max: gear.max } : {}) });
      const book = rollBookDrop(m.rank, this.rand, rw.itemChanceMult);
      if (book) loot.push({ item: book, qty: 1 });
      const pill = rollPillDrop(this.realm, m.rank, this.rand, rw.itemChanceMult);
      if (pill) loot.push({ item: pill, qty: 1 });
      const ore = rollOreDrop(this.realm, m.rank, this.rand, rw.itemChanceMult);
      if (ore) loot.push(ore);
      const refine = rollRefineDrop(this.realm, m.rank, this.rand, rw.itemChanceMult);
      if (refine) loot.push(refine);
      const rare = rollRareBook("boss", this.realm, this.rand); // a little likelier than from a common monster, still rare
      if (rare) loot.push({ item: rare, qty: 1 });
      for (const drop of loot) {
        const to = pickByShare(shares, this.rand());
        if (to) items.set(to, [...(items.get(to) ?? []), drop]);
      }
    }
    const pool = rollLinhThachDrop(levelIndex(this.realm, m.tier), "rare2", 0, 0.5) * rw.linhMult;
    for (const { id, share } of shares) {
      const q = this.players.get(id);
      if (!q) continue;
      const { stagesGained, gain } = this.reward(q, m, rw.expMult * share);
      events.push({ t: "progress", playerId: id, stagesGained });
      events.push({ t: "kill", playerId: id, rare: true });
      events.push({ t: "refine", playerId: id, gain });
      const linh = Math.floor(pool * share);
      if (linh > 0) events.push({ t: "drop", playerId: id, amount: linh });
      const mine = items.get(id);
      if (mine && mine.length > 0) events.push({ t: "loot", playerId: id, drops: mine });
      if (stagesGained > 0) events.push({ t: "hp", playerId: id, hp: q.hp, maxHp: q.maxHp });
    }
    events.push({ t: "boss_kill", killerId: killer.id, name: m.def.nameVi, shares });
    m.damage.clear();
  }

  /** Death handling by the room: EXP penalty is applied to the working copy; the room then persists and transfers. */
  applyDeathPenalty(id: string, expLost: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.exp = Math.max(0, p.exp - expLost);
    p.expDirty = true;
  }

  /**
   * Reserves the unwritten progression for a D1 write: the pending point delta is taken (so an overlapping save,
   * leave or portal cannot send it a second time) and must be settled with `endFlush`. Returns null when nothing
   * is waiting. EXP is absolute, so writing it twice would be harmless, but it is reserved the same way.
   */
  beginFlush(id: string): { realm: number; stage: number; exp: number; addPoints: number } | null {
    const p = this.players.get(id);
    if (!p || (!p.expDirty && p.pendingPoints === 0)) return null;
    const write = { realm: p.realm, stage: p.stage, exp: p.exp, addPoints: p.pendingPoints };
    p.inflightPoints += write.addPoints;
    p.pendingPoints = 0;
    p.expDirty = false;
    return write;
  }

  /** Settles a reserved write; on failure the points and the dirty flag are put back for the next attempt. */
  endFlush(id: string, write: { addPoints: number }, ok: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.inflightPoints -= write.addPoints;
    if (!ok) {
      p.pendingPoints += write.addPoints;
      p.expDirty = true;
    }
  }
}

const guardSnapshotCache = new Map<MapId, MonsterSnapshot[]>();
let guardSnapshotGeneration = -1;

/** The guards of a map as they stand at home, for a safe map that has no simulation running (so they can still be seen). */
export function staticGuardSnapshots(mapId: MapId): MonsterSnapshot[] {
  if (guardSnapshotGeneration !== tuningGeneration()) {
    guardSnapshotCache.clear(); // the guards' stats and species come from the tuning
    guardSnapshotGeneration = tuningGeneration();
  }
  let list = guardSnapshotCache.get(mapId);
  if (!list) {
    list = new CombatSim(getMap(mapId), mapId, Math.random, 0).snapshots(0).filter((m) => m.guard);
    guardSnapshotCache.set(mapId, list);
  }
  return list;
}

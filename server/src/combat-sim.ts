import {
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_RANGE,
  REGEN_DELAY_MS,
  REGEN_PER_S,
  CLUSTERS,
  RANKS,
  applyExp,
  getRootGrade,
  computeDamage,
  deriveStats,
  clusterSlots,
  killExp,
  levelIndex,
  rollEquipmentDrop,
  rollBookDrop,
  MP_REGEN_DELAY_MS,
  modifierTotal,
  restoreVitals,
  type ConstitutionEffect,
  type GearAffinity,
  type Vitals,
  MP_REGEN_PER_S,
  availableSkills,
  getSkill,
  type SkillDef,
  rollLinhThachDrop,
  rollLoot,
  type LootDrop,
  monsterStats,
  rollRank,
  topContributor,
  findSmoothPath,
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
} from "@game/shared";

/** Everything the simulation needs to know about a character when it joins. */
export interface ProfileSeed {
  id: string;
  name: string;
  /** Spendable potential points as last known (D1 value plus unflushed stage-up points). */
  potentialPoints: number;
  /** The main element (defence uses it). */
  element: Element;
  /** All the elements, main one first; absent: just `element`. More elements give more skills, never more damage. */
  roots?: readonly Element[];
  base: BaseStats;
  rootGrade: number;
  constitution: string;
  constitutionTier: number;
  gender: Gender;
  /** Stats of the gear worn right now (equipmentBonus); recomputed by the room whenever gear or requirements change. */
  gear?: EquipStats;
  /** Weapon family of the worn weapon (a skill may need one); null: no weapon or a weapon without a family. */
  weapon?: string | null;
  /** Skills learned from bí tịch (the basic ones are worked out from root, realm and stage). */
  learned?: readonly string[];
  /** What the character resonates with (gear of that element or weapon family gives more), and their constitution's effects. */
  affinity?: GearAffinity;
  effects?: readonly ConstitutionEffect[];
  /** HP, MP, cooldowns and buffs they left with (null/absent: fresh). Applied once, when the profile is created. */
  vitals?: Vitals | null;
  realm: number;
  stage: number;
  exp: number;
}

/**
 * Working copy of a character's combat state. It lives in the room's memory only: HP is not persisted, and EXP
 * (the room's working copy, see docs/PLAN.md section 3) is flushed to D1 on stage-up, leave, portal, death and by the
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
  lastRepathAt: number;
  lastAttackMsgAt: number;
  pendingPoints: number;
  /** Points carried by a D1 write that has started but not finished; never sent twice. */
  inflightPoints: number;
  expDirty: boolean;
  dead: boolean;
  /** Earliest time the next potion may be used. */
  potionReadyAt: number;
  /**
   * MP is stored as `mp` at time `mpAt` and worked out for any later time (currentMp), so regeneration never needs a tick:
   * a room that is otherwise idle can pause. It regenerates from MP_REGEN_DELAY_MS after the last hit taken.
   */
  maxMp: number;
  mp: number;
  mpAt: number;
  /** Skill ready times (ms), by skill id. Memory only: leaving the room resets them (known gap). */
  cooldowns: Map<string, number>;
  /** A skill to use as soon as it can (walking into range first); cleared by moving, targeting or a failure. */
  pendingCast: { skill: string; target: string | null } | null;
  buffs: ActiveBuff[];
}

/** A running buff: it adds `pct` (a fraction) to attack or defense until `until`. */
interface ActiveBuff {
  skill: string;
  stat: "attack" | "defense";
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
}

export type SimEvent =
  | { t: "mon"; monster: MonsterSnapshot }
  | { t: "mon_gone"; id: string }
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number; skill?: string }
  | { t: "hp"; playerId: string; hp: number; maxHp: number }
  /** EXP changed after a kill; `stagesGained > 0` means points changed and the room must persist right away. */
  | { t: "progress"; playerId: string; stagesGained: number }
  /** The kill's EXP, which the pháp bảo bản mệnh of the winner also receives (its own stream, no effect on the character's EXP). */
  | { t: "refine"; playerId: string; gain: number }
  /** MP changed (spent, or settled when hit); the client regenerates it from the snapshot. */
  | { t: "mp"; playerId: string; mp: number; maxMp: number; regenInMs: number }
  | { t: "cast_ok"; playerId: string; skill: string; cdMs: number }
  | { t: "cast_fail"; playerId: string; skill: string; reason: "mp" | "cooldown" | "no_target" | "weapon" | "unknown" }
  | { t: "buff"; playerId: string; skill: string; ms: number }
  /** A kill dropped items for this player; the room puts them in the bag (or mails them when it is full). */
  | { t: "loot"; playerId: string; drops: LootDrop[] }
  /** A kill dropped Linh Thạch for this player; the room writes it to the ledger. */
  | { t: "drop"; playerId: string; amount: number }
  | { t: "player_dead"; playerId: string }
  /** The server wants this player to walk to `to` (chasing their target). */
  | { t: "path_request"; playerId: string; to: Vec2 };

/** Re-plan a chase at most this often, and only when the target moved more than REPATH_DISTANCE. */
const REPATH_MS = 500;
const REPATH_DISTANCE = 0.5;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function lastPoint(path: Vec2[]): Vec2 {
  return path[path.length - 1] ?? [0, 0];
}

function derivedCombatant(seed: ProfileSeed & { buffs?: readonly ActiveBuff[] }, stage = seed.stage): { stats: Combatant; maxHp: number; maxMp: number; expBonus: number } {
  const d = deriveStats(seed.base, seed.realm, stage, seed.rootGrade, seed.gear, (seed.roots ?? [seed.element]).length);
  // Buffs only touch attack and defense (never max HP), so their expiry cannot move the HP ratio.
  let attack = d.attack;
  let defense = d.defense;
  for (const b of seed.buffs ?? []) {
    if (b.stat === "attack") attack = Math.floor(attack + d.attack * b.pct);
    else defense = Math.floor(defense + d.defense * b.pct);
  }
  return {
    stats: { attack, defense, critRate: d.critRate, dodgeRate: d.dodgeRate, element: seed.element },
    maxHp: d.maxHp,
    maxMp: d.maxMp,
    expBonus: d.expBonus,
  };
}

/**
 * Monsters, targets and fights for one map room. Pure logic: it never touches sockets or D1, so it can be tested and
 * the room only has to deliver the events it returns. Time is passed in; randomness is injected.
 */
export class CombatSim {
  private monsters = new Map<string, Monster>();
  private players = new Map<string, PlayerProfile>();
  private nextMonsterId = 1;
  /** Realm of the map; monster stats and EXP scale from it. */
  private readonly realm: number;

  constructor(
    private readonly map: MapData,
    mapId: MapId,
    private readonly rand: () => number,
    now: number,
    /** Classes to restore after the room slept, by monster id; without them every monster rolls its class. */
    ranks?: Readonly<Record<string, MonsterRank>>,
  ) {
    this.realm = map.realm ?? 0;
    for (const cluster of CLUSTERS[mapId]) {
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
  }

  /** (Re)rolls the monster's class and derives its stats from the map's realm, its bậc, species and class. */
  private applyRank(m: Monster, rank?: MonsterRank): void {
    m.rank = rank && rank in RANKS ? rank : rollRank(this.rand());
    const stats = monsterStats(m.def, this.realm, m.tier, m.rank);
    m.maxHp = stats.maxHp;
    m.combatant.attack = stats.attack;
    m.combatant.defense = stats.defense;
  }

  /** Current class of every monster, kept by the room across a sleep so a rebuilt sim cannot reroll rare monsters. */
  ranks(): Record<string, MonsterRank> {
    const out: Record<string, MonsterRank> = {};
    for (const m of this.monsters.values()) out[m.id] = m.rank;
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
        if (profile && !profile.dead && dist(at, pos) <= m.def.aggroRadius) return false;
      }
    }
    for (const p of this.players.values()) {
      if (p.dead || p.targetId !== null || p.hp < p.maxHp || moving.has(p.id)) return false;
    }
    return true;
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
      lastRepathAt: 0,
      lastAttackMsgAt: 0,
      pendingPoints: 0,
      inflightPoints: 0,
      expDirty: false,
      dead: false,
      potionReadyAt: 0,
      mp: d.maxMp,
      mpAt: 0,
      cooldowns: new Map(),
      pendingCast: null,
      buffs: [],
    };
    if (seed.vitals) {
      // Back from a reload or another map: pick up where they left, with the regeneration of the time away.
      const now = Date.now();
      const r = restoreVitals(seed.vitals, now, d.maxHp, d.maxMp);
      profile.hp = r.hp;
      profile.mp = r.mp;
      profile.mpAt = now;
      for (const [skill, readyAt] of Object.entries(r.cooldowns)) profile.cooldowns.set(skill, readyAt);
      for (const b of r.buffs) {
        const def = getSkill(b.skill);
        if (def?.buff) profile.buffs.push({ skill: b.skill, stat: def.buff.stat, pct: def.power, until: b.until });
      }
      if (profile.buffs.length > 0) this.recompute(profile, false);
    }
    this.players.set(seed.id, profile);
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
    const mp = this.currentMp(p, now);
    if (p.hp >= p.maxHp && mp >= p.maxMp && Object.keys(cd).length === 0 && buffs.length === 0) return null;
    return { hp: p.hp, mp, at: now, cd, buffs };
  }

  /** Remaining cooldown of each skill still cooling down, in ms (for the client). */
  cooldownsLeft(p: PlayerProfile, now: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [skill, readyAt] of p.cooldowns) if (readyAt > now) out[skill] = readyAt - now;
    return out;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
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
  updateGear(id: string, gear: EquipStats, weapon?: string | null): void {
    const p = this.players.get(id);
    if (!p) return;
    p.gear = gear;
    if (weapon !== undefined) p.weapon = weapon;
    this.recompute(p, false);
  }

  /** The skills this character can use now: unlocked basic ones plus learned books. */
  skillsOf(p: PlayerProfile): string[] {
    return availableSkills(p.roots ?? [p.element], p.realm, p.stage, p.learned ?? []);
  }

  /** A book was learned. */
  addLearned(id: string, skill: string): void {
    const p = this.players.get(id);
    if (p && !(p.learned ?? []).includes(skill)) p.learned = [...(p.learned ?? []), skill];
  }

  /** MP at time `now`: the stored value plus regeneration since it was stored (starting MP_REGEN_DELAY_MS after the last hit). */
  currentMp(p: PlayerProfile, now: number): number {
    if (p.mp >= p.maxMp) return p.maxMp;
    const from = Math.max(p.mpAt, p.lastHurtAt + MP_REGEN_DELAY_MS);
    if (now <= from) return p.mp;
    return Math.min(p.maxMp, p.mp + Math.floor(((now - from) / 1000) * Math.max(1, p.maxMp * MP_REGEN_PER_S)));
  }

  /** Stores the MP worked out for `now` (call before changing it or before `lastHurtAt` moves). */
  private settleMp(p: PlayerProfile, now: number): void {
    p.mp = this.currentMp(p, now);
    p.mpAt = now;
  }

  mpEvent(p: PlayerProfile, now: number): SimEvent {
    return { t: "mp", playerId: p.id, mp: this.currentMp(p, now), maxMp: p.maxMp, regenInMs: Math.max(0, p.lastHurtAt + MP_REGEN_DELAY_MS - now) };
  }

  /**
   * Asks to use a skill: checked now (so a refusal is immediate) and again when it goes off. An attack walks into range
   * of its target first (the player's chase does that); heals and buffs go off on the next tick.
   */
  queueCast(playerId: string, skillId: string, targetId: string | null, now: number): { ok: true } | { ok: false; reason: "unknown" | "mp" | "cooldown" | "no_target" | "weapon" } {
    const p = this.players.get(playerId);
    const skill = getSkill(skillId);
    if (!p || p.dead || !skill || !this.skillsOf(p).includes(skillId)) return { ok: false, reason: "unknown" };
    if (skill.weapon !== undefined && p.weapon !== skill.weapon) return { ok: false, reason: "weapon" };
    if (now < (p.cooldowns.get(skillId) ?? 0)) return { ok: false, reason: "cooldown" };
    if (this.currentMp(p, now) < skill.mpCost) return { ok: false, reason: "mp" };
    let target: string | null = null;
    if (skill.kind === "attack") {
      target = targetId ?? p.targetId;
      const m = target ? this.monsters.get(target) : undefined;
      if (!target || !m || m.state === "dead") return { ok: false, reason: "no_target" };
      p.targetId = target;
      p.lastRepathAt = Number.NEGATIVE_INFINITY;
    }
    p.pendingCast = { skill: skillId, target };
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
  }

  setTarget(playerId: string, monsterId: string): boolean {
    const p = this.players.get(playerId);
    const m = this.monsters.get(monsterId);
    if (!p || p.dead || !m || m.state === "dead") return false;
    p.pendingCast = null; // a new target cancels a waiting skill
    p.targetId = monsterId;
    p.lastRepathAt = Number.NEGATIVE_INFINITY;
    return true;
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
      tier: m.tier,
      rank: m.rank,
      path: m.path,
      ageMs: now - m.startedAt,
      speed: m.def.speed,
      hp: m.hp,
      maxHp: m.maxHp,
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
    const events: SimEvent[] = [];
    this.tickMonsters(now, positions, events);
    this.tickPlayers(now, positions, events);
    return events;
  }

  private tickMonsters(now: number, positions: ReadonlyMap<string, Vec2>, events: SimEvent[]): void {
    for (const m of this.monsters.values()) {
      if (m.state === "dead") {
        if (now >= m.respawnAt) {
          this.applyRank(m); // every respawn rolls its class again
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

      if (m.state === "idle") {
        let best: string | null = null;
        let bestD = m.def.aggroRadius;
        for (const [id, p] of positions) {
          const profile = this.players.get(id);
          if (!profile || profile.dead) continue;
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
          if (now >= m.nextAttackAt) this.monsterAttack(m, profile, now, events);
        } else if (now - m.lastRepathAt >= REPATH_MS && dist(lastPoint(m.path), target) > REPATH_DISTANCE) {
          if (this.walk(m, pos, target, now)) events.push({ t: "mon", monster: this.snapshot(m, now) });
          else m.lastRepathAt = now;
        }
      }

      if (m.state === "return") {
        if (dist(pos, m.home) < 0.3) {
          m.state = "idle";
          m.hp = m.maxHp;
          m.damage.clear(); // healed to full: earlier damage no longer counts towards the reward
          m.path = [m.home];
          m.startedAt = now;
          events.push({ t: "mon", monster: this.snapshot(m, now) });
        } else if (dist(lastPoint(m.path), m.home) > 0.05 && this.walk(m, pos, m.home, now)) {
          events.push({ t: "mon", monster: this.snapshot(m, now) });
        }
      }
    }
  }

  private monsterAttack(m: Monster, p: PlayerProfile, now: number, events: SimEvent[]): void {
    m.nextAttackAt = now + m.def.attackCooldownMs;
    const hit = computeDamage(m.combatant, p.stats, this.rand);
    p.hp = Math.max(0, p.hp - hit.damage);
    this.settleMp(p, now); // regeneration up to this hit is kept; it pauses from here
    p.lastHurtAt = now;
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
      events.push({ t: "player_dead", playerId: p.id });
    }
  }

  private tickPlayers(now: number, positions: ReadonlyMap<string, Vec2>, events: SimEvent[]): void {
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const pos = positions.get(p.id);
      if (!pos) continue;

      if (p.hp < p.maxHp && now - p.lastHurtAt >= REGEN_DELAY_MS && now - p.lastRegenAt >= 1000) {
        p.lastRegenAt = now;
        p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * REGEN_PER_S)));
        events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
      }

      if (p.buffs.length > 0 && p.buffs.some((b) => b.until <= now)) {
        p.buffs = p.buffs.filter((b) => b.until > now);
        this.recompute(p, false);
      }
      if (p.pendingCast && this.runCast(p, pos, now, events)) continue;

      if (!p.targetId) continue;
      const m = this.monsters.get(p.targetId);
      if (!m || m.state === "dead") {
        p.targetId = null;
        continue;
      }
      const mpos = this.position(m, now);
      const d = dist(pos, mpos);
      if (d <= PLAYER_ATTACK_RANGE) {
        if (now >= p.nextAttackAt) this.playerAttack(p, m, mpos, now, events);
      } else if (now - p.lastRepathAt >= REPATH_MS) {
        p.lastRepathAt = now;
        // Stop about one tile short of the monster, on the line from the monster to the player.
        const k = d > 0 ? 1 / d : 0;
        events.push({ t: "path_request", playerId: p.id, to: [mpos[0] + (pos[0] - mpos[0]) * k, mpos[1] + (pos[1] - mpos[1]) * k] });
      }
    }
  }

  /**
   * Goes off with the queued skill when it can. Returns true when the skill was used or dropped (the player's turn is
   * over), false while the player is still walking into range.
   */
  private runCast(p: PlayerProfile, pos: Vec2, now: number, events: SimEvent[]): boolean {
    const pending = p.pendingCast;
    const skill = pending ? getSkill(pending.skill) : undefined;
    if (!pending || !skill) {
      p.pendingCast = null;
      return false;
    }
    const fail = (reason: "mp" | "cooldown" | "no_target" | "weapon" | "unknown") => {
      p.pendingCast = null;
      events.push({ t: "cast_fail", playerId: p.id, skill: skill.id, reason });
      return true;
    };
    if (skill.weapon !== undefined && p.weapon !== skill.weapon) return fail("weapon");
    if (now < (p.cooldowns.get(skill.id) ?? 0)) return fail("cooldown");
    if (this.currentMp(p, now) < skill.mpCost) return fail("mp");
    let m: Monster | undefined;
    let mpos: Vec2 | undefined;
    if (skill.kind === "attack") {
      m = pending.target ? this.monsters.get(pending.target) : undefined;
      if (!m || m.state === "dead") return fail("no_target");
      mpos = this.position(m, now);
      if (dist(pos, mpos) > skill.range) return false; // still walking: the chase below brings the player closer
    }
    // The skill goes off: pay, start the cooldown, then its effect.
    this.settleMp(p, now);
    p.mp -= skill.mpCost;
    p.cooldowns.set(skill.id, now + skill.cooldownMs);
    p.pendingCast = null;
    events.push(this.mpEvent(p, now), { t: "cast_ok", playerId: p.id, skill: skill.id, cdMs: skill.cooldownMs });
    if (skill.kind === "heal") {
      p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * skill.power)));
      events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
    } else if (skill.kind === "buff" && skill.buff) {
      p.buffs = [...p.buffs.filter((b) => b.skill !== skill.id), { skill: skill.id, stat: skill.buff.stat, pct: skill.power, until: now + skill.buff.durationMs }];
      this.recompute(p, false);
      events.push({ t: "buff", playerId: p.id, skill: skill.id, ms: skill.buff.durationMs });
    } else if (m && mpos) {
      this.playerAttack(p, m, mpos, now, events, skill);
    }
    return true;
  }

  private playerAttack(p: PlayerProfile, m: Monster, mpos: Vec2, now: number, events: SimEvent[], skill?: SkillDef): void {
    p.nextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
    // A skill hits as the caster's own stats scaled by its power, in its own element; one without an element (and the basic
    // attack) uses the caster's MAIN element, so having more elements never hits harder (breadth is only in which skills
    // the player may choose). An attack in one of the caster's own elements gets the damage share of the root's grade
    // (phẩm cấp); the number of elements does not change damage.
    // The constitution's "skill damage" effects (percent) add to a matching skill: all skills, its element, the wielded weapon family or the skill itself.
    const roots = p.roots ?? [p.element];
    const element = skill?.element ?? p.element;
    const gradePct = roots.includes(element) ? getRootGrade(p.rootGrade).elementDamagePct : 0;
    const bonusPct = skill ? modifierTotal(p.effects ?? [], "skill_damage", { elements: [element], weapons: p.weapon ? [p.weapon] : [], skill: skill.id }).percent : 0;
    const power = skill ? skill.power : 1;
    const attacker = { ...p.stats, attack: Math.max(1, Math.round(p.stats.attack * power * (1 + gradePct / 100) * (1 + bonusPct / 100))), element };
    const hit = computeDamage(attacker, m.combatant, this.rand);
    const applied = Math.min(m.hp, hit.damage);
    m.hp -= applied;
    m.damage.set(p.id, (m.damage.get(p.id) ?? 0) + applied);
    events.push({ t: "hit", from: p.id, to: m.id, kind: hit.kind, damage: hit.damage, hp: m.hp, ...(skill ? { skill: skill.id } : {}) });
    if (m.hp > 0) {
      // Being hit pulls an idle or retreating monster onto the attacker.
      if (m.state === "idle" || m.state === "return") {
        m.state = "chase";
        m.targetId = p.id;
        m.lastRepathAt = Number.NEGATIVE_INFINITY;
      }
      return;
    }
    m.state = "dead";
    m.respawnAt = now + m.def.respawnMs;
    m.targetId = null;
    m.path = [mpos];
    events.push({ t: "mon_gone", id: m.id });
    for (const other of this.players.values()) if (other.targetId === m.id) other.targetId = null;
    // A normal monster pays whoever lands the last hit. A rare one pays its top contributor (70% damage share +
    // 30% last hit) among the players still here, which can be someone other than the killer.
    const winner =
      m.rank === "normal"
        ? p
        : this.players.get(topContributor(m.damage, m.maxHp, p.id, (id) => !!this.players.get(id) && !this.players.get(id)!.dead) ?? p.id) ?? p;
    const { stagesGained, gain } = this.reward(winner, m);
    events.push({ t: "progress", playerId: winner.id, stagesGained });
    events.push({ t: "refine", playerId: winner.id, gain });
    const drop = rollLinhThachDrop(levelIndex(this.realm, m.tier), m.rank, this.rand(), this.rand());
    if (drop > 0) events.push({ t: "drop", playerId: winner.id, amount: drop });
    const loot = rollLoot(m.rank, this.rand);
    // Drawn after every other roll of the kill, so the sequence of the older rolls does not change.
    const gear = rollEquipmentDrop(this.realm, m.tier, m.rank, this.rand);
    if (gear) loot.push({ item: gear.type, qty: 1, ...(gear.dur !== undefined ? { dur: gear.dur, max: gear.max } : {}) });
    const book = rollBookDrop(m.rank, this.rand); // two more rolls, after everything else
    if (book) loot.push({ item: book, qty: 1 });
    if (loot.length > 0) events.push({ t: "loot", playerId: winner.id, drops: loot });
    if (stagesGained > 0) events.push({ t: "hp", playerId: winner.id, hp: winner.hp, maxHp: winner.maxHp });
    m.damage.clear();
  }

  /** Gives the killer EXP (with their bonus) and applies any stage-ups. Linh Thạch drops are rolled by the caller. */
  private reward(p: PlayerProfile, m: Monster): { stagesGained: number; gain: number } {
    const gain = killExp({ realm: this.realm, tier: m.tier, rank: m.rank }, p.realm, p.expBonus);
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
  beginFlush(id: string): { stage: number; exp: number; addPoints: number } | null {
    const p = this.players.get(id);
    if (!p || (!p.expDirty && p.pendingPoints === 0)) return null;
    const write = { stage: p.stage, exp: p.exp, addPoints: p.pendingPoints };
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

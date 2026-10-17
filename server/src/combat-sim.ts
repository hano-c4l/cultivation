import {
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_RANGE,
  REGEN_DELAY_MS,
  REGEN_PER_S,
  CLUSTERS,
  RANKS,
  applyExp,
  computeDamage,
  deriveStats,
  clusterSlots,
  killExp,
  levelIndex,
  rollEquipmentDrop,
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
  element: Element;
  base: BaseStats;
  rootGrade: number;
  constitution: string;
  constitutionTier: number;
  gender: Gender;
  /** Stats of the gear worn right now (equipmentBonus); recomputed by the room whenever gear or requirements change. */
  gear?: EquipStats;
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
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number }
  | { t: "hp"; playerId: string; hp: number; maxHp: number }
  /** EXP changed after a kill; `stagesGained > 0` means points changed and the room must persist right away. */
  | { t: "progress"; playerId: string; stagesGained: number }
  /** The kill's EXP, which the pháp bảo bản mệnh of the winner also receives (its own stream, no effect on the character's EXP). */
  | { t: "refine"; playerId: string; gain: number }
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

function derivedCombatant(seed: ProfileSeed, stage = seed.stage): { stats: Combatant; maxHp: number; expBonus: number } {
  const d = deriveStats(seed.base, seed.realm, stage, seed.rootGrade, seed.gear);
  return {
    stats: { attack: d.attack, defense: d.defense, critRate: d.critRate, dodgeRate: d.dodgeRate, element: seed.element },
    maxHp: d.maxHp,
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
    };
    this.players.set(seed.id, profile);
    return profile;
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
  updateGear(id: string, gear: EquipStats): void {
    const p = this.players.get(id);
    if (!p) return;
    p.gear = gear;
    this.recompute(p, false);
  }

  private recompute(p: PlayerProfile, fullHeal: boolean): void {
    const d = derivedCombatant(p);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.stats = d.stats;
    p.maxHp = d.maxHp;
    p.expBonus = d.expBonus;
    p.hp = fullHeal ? d.maxHp : Math.max(p.hp > 0 ? 1 : 0, Math.round(d.maxHp * ratio));
  }

  setTarget(playerId: string, monsterId: string): boolean {
    const p = this.players.get(playerId);
    const m = this.monsters.get(monsterId);
    if (!p || p.dead || !m || m.state === "dead") return false;
    p.targetId = monsterId;
    p.lastRepathAt = Number.NEGATIVE_INFINITY;
    return true;
  }

  clearTarget(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.targetId = null;
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
    p.lastHurtAt = now;
    events.push({ t: "hit", from: m.id, to: p.id, kind: hit.kind, damage: hit.damage, hp: p.hp });
    events.push({ t: "hp", playerId: p.id, hp: p.hp, maxHp: p.maxHp });
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

  private playerAttack(p: PlayerProfile, m: Monster, mpos: Vec2, now: number, events: SimEvent[]): void {
    p.nextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
    const hit = computeDamage(p.stats, m.combatant, this.rand);
    const applied = Math.min(m.hp, hit.damage);
    m.hp -= applied;
    m.damage.set(p.id, (m.damage.get(p.id) ?? 0) + applied);
    events.push({ t: "hit", from: p.id, to: m.id, kind: hit.kind, damage: hit.damage, hp: m.hp });
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

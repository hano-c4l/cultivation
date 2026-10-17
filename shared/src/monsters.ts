import type { SpiritualRoot } from "./character";
import { MAP_IDS, getMap, type MapId } from "./map";
import { levelIndex, monsterBaseExp } from "./progression";

/**
 * Monster species. Stats are not stored per species: they come from the map's realm and the cluster's bậc through
 * monsterStats(), scaled by the multipliers below. Display names are Vietnamese data fields.
 */
export interface MonsterDef {
  id: string;
  nameVi: string;
  element: SpiritualRoot;
  /** Multipliers on the realm/bậc curve. */
  hpMult: number;
  attackMult: number;
  defenseMult: number;
  /** Tiles per second (kept below the player's BASE_SPEED so players can run away). */
  speed: number;
  /** A player this close starts a chase. */
  aggroRadius: number;
  /** A chase that drags the monster this far from home makes it give up and walk back. */
  leashRadius: number;
  attackRange: number;
  attackCooldownMs: number;
  respawnMs: number;
}

export const MONSTERS: Readonly<Record<string, MonsterDef>> = {
  soi_rung: { id: "soi_rung", nameVi: "Sói Rừng", element: "moc", hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 5, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1500, respawnMs: 15_000 },
  heo_rung: { id: "heo_rung", nameVi: "Heo Rừng Điên", element: "tho", hpMult: 1.6, attackMult: 1.2, defenseMult: 1.5, speed: 2.6, aggroRadius: 4, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1800, respawnMs: 20_000 },
  bao_dem: { id: "bao_dem", nameVi: "Báo Đêm", element: "hoa", hpMult: 1.2, attackMult: 1.4, defenseMult: 1, speed: 3.6, aggroRadius: 6, leashRadius: 9, attackRange: 1.3, attackCooldownMs: 1300, respawnMs: 25_000 },
  doi_u_minh: { id: "doi_u_minh", nameVi: "Dơi U Minh", element: "kim", hpMult: 1, attackMult: 1.2, defenseMult: 0.9, speed: 3.4, aggroRadius: 6, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1300, respawnMs: 15_000 },
  thi_quy: { id: "thi_quy", nameVi: "Thi Quỷ", element: "thuy", hpMult: 1.8, attackMult: 1.3, defenseMult: 1.6, speed: 2.2, aggroRadius: 5, leashRadius: 8, attackRange: 1.4, attackCooldownMs: 2000, respawnMs: 20_000 },
  xich_thi: { id: "xich_thi", nameVi: "Xích Thi", element: "hoa", hpMult: 1.4, attackMult: 1.5, defenseMult: 1.2, speed: 2.8, aggroRadius: 5, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1700, respawnMs: 25_000 },
};

export function getMonsterDef(kind: string): MonsterDef | undefined {
  return MONSTERS[kind];
}

/**
 * Monster class. "hiếm" has two tiers (the names after the dot are placeholders). A boss rank will be added with the
 * boss system; its rules are recorded in docs/PHASE1.md.
 */
export type MonsterRank = "normal" | "rare1" | "rare2";

export interface RankDef {
  /** Probability (0..1) that a spawn or respawn rolls this rank. */
  chance: number;
  hpMult: number;
  attackMult: number;
  defenseMult: number;
  expMult: number;
  /** Shown after the name; null for normal monsters. */
  tagVi: string | null;
}

export const RANKS: Readonly<Record<MonsterRank, RankDef>> = {
  normal: { chance: 0, hpMult: 1, attackMult: 1, defenseMult: 1, expMult: 1, tagVi: null },
  rare1: { chance: 0.08, hpMult: 1.8, attackMult: 1.2, defenseMult: 1.2, expMult: 2.5, tagVi: "Hiếm · Tinh Anh" },
  rare2: { chance: 0.02, hpMult: 3, attackMult: 1.5, defenseMult: 1.5, expMult: 5, tagVi: "Hiếm · Đại Yêu" },
};

/** Rolls a rank from a uniform [0, 1) number: rarest first so each configured chance holds. */
export function rollRank(roll: number): MonsterRank {
  if (roll < RANKS.rare2.chance) return "rare2";
  if (roll < RANKS.rare2.chance + RANKS.rare1.chance) return "rare1";
  return "normal";
}

export interface MonsterStats {
  maxHp: number;
  attack: number;
  defense: number;
}

/** Combat stats of a monster: the realm/bậc curve (parallel to a typical player of that level) times species and rank. */
export function monsterStats(def: MonsterDef, realm: number, tier: number, rank: MonsterRank): MonsterStats {
  const lv = levelIndex(realm, tier);
  const r = RANKS[rank];
  return {
    maxHp: Math.round((60 + lv * 30) * def.hpMult * r.hpMult),
    attack: Math.round((10 + lv * 3.2) * def.attackMult * r.attackMult),
    defense: Math.round((4 + lv * 2) * def.defenseMult * r.defenseMult),
  };
}

/** A group of monsters of one species at one bậc. Fixed size: it does not change with the number of players. */
export interface Cluster {
  /** Bậc 1..9 within the map's realm. */
  tier: number;
  kind: string;
  /** Centre in tile units; monsters stand on a ring of `radius` around it (snapped to standable ground by the server). */
  x: number;
  y: number;
  radius: number;
  count: number;
}

/** Cluster layout per map. More clusters (and bigger maps) are added here as the world grows. The safe town has none. */
export const CLUSTERS: Readonly<Record<MapId, readonly Cluster[]>> = {
  town: [],
  forest: [
    { tier: 1, kind: "soi_rung", x: 20.5, y: 14.5, radius: 1.8, count: 3 },
    { tier: 4, kind: "heo_rung", x: 12.5, y: 24.5, radius: 1.2, count: 3 },
    { tier: 7, kind: "bao_dem", x: 36.5, y: 24.5, radius: 1.2, count: 3 },
  ],
  cave: [
    { tier: 1, kind: "doi_u_minh", x: 12.5, y: 20.5, radius: 1.3, count: 3 },
    { tier: 4, kind: "thi_quy", x: 22.5, y: 20.5, radius: 1.3, count: 3 },
    { tier: 7, kind: "xich_thi", x: 33.5, y: 20.5, radius: 1.3, count: 3 },
  ],
};

/** The positions of a cluster's monsters (before snapping to standable ground). */
export function clusterSlots(c: Cluster): [number, number][] {
  return Array.from({ length: c.count }, (_, i) => {
    const a = (i / c.count) * Math.PI * 2 + Math.PI / 6;
    return [c.x + Math.cos(a) * c.radius, c.y + Math.sin(a) * c.radius] as [number, number];
  });
}

/**
 * The most EXP a monster of `rank` gives at home for players of `realm`: the highest-bậc cluster across the maps of
 * that realm. Players who hunt in a map of a higher realm never get more than this per kill (no power-levelling by
 * being carried). Undefined when the realm has no map yet.
 */
export function homeExpCap(realm: number, rank: MonsterRank): number | undefined {
  let best = 0;
  for (const id of MAP_IDS) {
    if (getMap(id).realm !== realm) continue;
    for (const c of CLUSTERS[id]) best = Math.max(best, monsterBaseExp(realm, c.tier));
  }
  return best > 0 ? best * RANKS[rank].expMult : undefined;
}

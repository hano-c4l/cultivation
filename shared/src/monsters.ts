import { tuning } from "./tuning";
import { SPIRITUAL_ROOTS, type SpiritualRoot } from "./character";
import { CAVE_CHAMBERS, FOREST_GLADES, KIMDAN_GLADES, MAP_IDS, MAP_REALM, MAP_SIZE, NGUYENANH_GLADES, screenToTile, type MapId } from "./map";
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
  ve_binh: { id: "ve_binh", nameVi: "Vệ Binh", element: "kim", hpMult: 3, attackMult: 2.5, defenseMult: 2, speed: 3, aggroRadius: 8, leashRadius: 12, attackRange: 1.4, attackCooldownMs: 1200, respawnMs: 60_000 },
  huyet_lang_vuong: { id: "huyet_lang_vuong", nameVi: "Huyết Lang Vương", element: "moc", hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.6, attackCooldownMs: 1400, respawnMs: 0 },
  quy_vuong: { id: "quy_vuong", nameVi: "U Minh Quỷ Vương", element: "thuy", hpMult: 1, attackMult: 1, defenseMult: 1, speed: 2.8, aggroRadius: 7, leashRadius: 12, attackRange: 1.6, attackCooldownMs: 1500, respawnMs: 0 },
  hoa_dien_lang: { id: "hoa_dien_lang", nameVi: "Hỏa Diễm Lang", element: "hoa", hpMult: 1, attackMult: 1.1, defenseMult: 1, speed: 3, aggroRadius: 6, leashRadius: 9, attackRange: 1.3, attackCooldownMs: 1400, respawnMs: 20_000 },
  nham_giap_thu: { id: "nham_giap_thu", nameVi: "Nham Giáp Thú", element: "tho", hpMult: 1.8, attackMult: 1.2, defenseMult: 1.7, speed: 2.4, aggroRadius: 5, leashRadius: 8, attackRange: 1.4, attackCooldownMs: 1900, respawnMs: 25_000 },
  liet_hoa_xa: { id: "liet_hoa_xa", nameVi: "Liệt Hỏa Xà", element: "hoa", hpMult: 1.3, attackMult: 1.5, defenseMult: 1.1, speed: 3.4, aggroRadius: 6, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1300, respawnMs: 25_000 },
  hoa_long_vuong: { id: "hoa_long_vuong", nameVi: "Xích Diễm Long Vương", element: "hoa", hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.8, attackCooldownMs: 1400, respawnMs: 0 },
  bang_phong_hac: { id: "bang_phong_hac", nameVi: "Băng Phong Hạc", element: "thuy", hpMult: 1, attackMult: 1.2, defenseMult: 1, speed: 3.6, aggroRadius: 7, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1300, respawnMs: 20_000 },
  han_thi_ma: { id: "han_thi_ma", nameVi: "Hàn Thi Ma", element: "thuy", hpMult: 1.9, attackMult: 1.3, defenseMult: 1.8, speed: 2.3, aggroRadius: 5, leashRadius: 8, attackRange: 1.5, attackCooldownMs: 2000, respawnMs: 25_000 },
  tuyet_yeu_hau: { id: "tuyet_yeu_hau", nameVi: "Tuyết Yêu Hầu", element: "kim", hpMult: 1.4, attackMult: 1.6, defenseMult: 1.2, speed: 3.2, aggroRadius: 6, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1500, respawnMs: 25_000 },
  bang_hoang: { id: "bang_hoang", nameVi: "Băng Hoàng", element: "thuy", hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.8, attackCooldownMs: 1500, respawnMs: 0 },
  xich_thi: { id: "xich_thi", nameVi: "Xích Thi", element: "hoa", hpMult: 1.4, attackMult: 1.5, defenseMult: 1.2, speed: 2.8, aggroRadius: 5, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1700, respawnMs: 25_000 },
};

/**
 * Vệ binh (guards, phase 2f PR2): they stand at the gate of the forest and the cave and fight only red names (sát nhân from 501) and anyone
 * who hits them. They are one realm above the map's and at bậc `guardTier()`, strong enough to beat a red player of the map's own level. Killing
 * one pays nothing (no EXP, Linh Thạch or loot) and costs sát khí and sát nhân like killing a white name. Placeholder values.
 */
export const GUARD_KIND = "ve_binh";
export function guardRealmBonus(): number {
  return tuning().guard.realmBonus;
}
export function guardTier(): number {
  return tuning().guard.tier;
}
/**
 * Guard positions per map (tile units, snapped to standable ground by the server): beside the arrival point, off the lane. Written in screen
 * units (see PlayRect) and converted, so they follow the map's layout.
 */
const guardSpots = (map: MapId, units: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] => units.map(([px, py]) => screenToTile(MAP_SIZE[map], px, py));
export const GUARDS: Readonly<Record<MapId, readonly (readonly [number, number])[]>> = {
  // Every portal has them on its arrival side: town (from the forest), forest (from the town and from the cave), cave (from the forest).
  town: guardSpots("town", [[-4, 17], [4, 17]]),
  forest: guardSpots("forest", [[-4, -33], [4, -33], [67, -4], [67, 4]]),
  cave: guardSpots("cave", [[-82, -4], [-82, 4], [82, -4], [82, 4]]),
  town2: guardSpots("town2", [[-38, -3], [-38, 3], [38, -11], [38, -5], [38, 5], [38, 11]]),
  kimdan: guardSpots("kimdan", [[-72, -4], [-72, 4]]),
  nguyenanh: guardSpots("nguyenanh", [[-77, -4], [-77, 4]]),
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
  rare1: { chance: 0.08, hpMult: 1.8, attackMult: 1.2, defenseMult: 1.2, expMult: 2.5, tagVi: "Tinh Anh" },
  rare2: { chance: 0.02, hpMult: 3, attackMult: 1.5, defenseMult: 1.5, expMult: 5, tagVi: "Đại Yêu" },
};

/** Rolls a rank from a uniform [0, 1) number: rarest first so each configured chance holds. */
export function rollRank(roll: number): MonsterRank {
  if (roll < RANKS.rare2.chance) return "rare2";
  if (roll < RANKS.rare2.chance + RANKS.rare1.chance) return "rare1";
  return "normal";
}

/**
 * Every spawn and respawn rolls the monster's element (uniformly out of the five); `element` on its species is only what it
 * shows until then and what an older stored monster keeps. Takes a uniform [0, 1) number.
 */
export function rollMonsterElement(roll: number): SpiritualRoot {
  return SPIRITUAL_ROOTS[Math.min(SPIRITUAL_ROOTS.length - 1, Math.floor(roll * SPIRITUAL_ROOTS.length))] as SpiritualRoot;
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

/**
 * Cluster layout per map: one group per glade/chamber of the map (their spots are in map.ts). On the lattice maps the bậc follows the distance from
 * where the character arrives (the nearest ninth of the groups is bậc 1, the farthest bậc 9) and the species follows the bậc (the first three, the
 * middle three, the last three). More groups (and bigger maps) are added by extending the lists. The safe towns have none.
 */
function groupsOf(map: MapId, spots: readonly (readonly [number, number])[], tiers: readonly number[], kinds: readonly string[], radius: number, count: number): Cluster[] {
  return spots.map(([px, py], i) => {
    const [x, y] = screenToTile(MAP_SIZE[map], px, py);
    return { tier: tiers[i]!, kind: kinds[i]!, x, y, radius, count };
  });
}

/** The bậc (1..9) of each spot by its rank in distance from `origin` (screen units): even bands of nearest to farthest. */
export function tiersByDistance(spots: readonly (readonly [number, number])[], origin: readonly [number, number]): number[] {
  const order = spots.map((s, i) => ({ i, d: Math.hypot(s[0] - origin[0], s[1] - origin[1]) })).sort((a, b) => a.d - b.d || a.i - b.i);
  const tiers = new Array<number>(spots.length).fill(1);
  order.forEach((o, rank) => {
    tiers[o.i] = 1 + Math.min(8, Math.floor((rank * 9) / spots.length));
  });
  return tiers;
}

/** Three species for a map, one for each third of the bậc range. */
const speciesByTier = (tiers: readonly number[], kinds: readonly [string, string, string]): string[] => tiers.map((t) => kinds[t <= 3 ? 0 : t <= 6 ? 1 : 2]);

const FOREST_TIERS = tiersByDistance(FOREST_GLADES, [0, -34]);
const CAVE_TIERS = tiersByDistance(CAVE_CHAMBERS, [-84, 0]);
const KIMDAN_TIERS = tiersByDistance(KIMDAN_GLADES, [-74, 0]);
const NGUYENANH_TIERS = tiersByDistance(NGUYENANH_GLADES, [-79, 0]);

/** Forest groups stay off the east-west road and the lane from the north gate (the only way to the cave) so low-level players can still walk through. */
export const CLUSTERS: Readonly<Record<MapId, readonly Cluster[]>> = {
  town: [],
  forest: groupsOf("forest", FOREST_GLADES, FOREST_TIERS, speciesByTier(FOREST_TIERS, ["soi_rung", "heo_rung", "bao_dem"]), 2, 4),
  cave: groupsOf("cave", CAVE_CHAMBERS, CAVE_TIERS, speciesByTier(CAVE_TIERS, ["doi_u_minh", "thi_quy", "xich_thi"]), 2, 3),
  town2: [],
  kimdan: groupsOf("kimdan", KIMDAN_GLADES, KIMDAN_TIERS, speciesByTier(KIMDAN_TIERS, ["hoa_dien_lang", "nham_giap_thu", "liet_hoa_xa"]), 2, 4),
  nguyenanh: groupsOf("nguyenanh", NGUYENANH_GLADES, NGUYENANH_TIERS, speciesByTier(NGUYENANH_TIERS, ["bang_phong_hac", "han_thi_ma", "tuyet_yeu_hau"]), 2, 4),
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
    if (MAP_REALM[id] !== realm) continue;
    for (const c of CLUSTERS[id]) best = Math.max(best, monsterBaseExp(realm, c.tier));
  }
  return best > 0 ? best * RANKS[rank].expMult : undefined;
}

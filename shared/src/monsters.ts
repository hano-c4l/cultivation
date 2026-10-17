import type { SpiritualRoot } from "./character";
import type { MapId } from "./map";

/** Monster definition. Numbers are tuning data; display names are Vietnamese data fields. */
export interface MonsterDef {
  id: string;
  nameVi: string;
  element: SpiritualRoot;
  maxHp: number;
  attack: number;
  defense: number;
  /** Base EXP for the killer, before the killer's EXP bonus. */
  exp: number;
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
  soi_rung: {
    id: "soi_rung", nameVi: "Sói Rừng", element: "moc", maxHp: 60, attack: 10, defense: 4, exp: 40,
    speed: 3, aggroRadius: 5, leashRadius: 12, attackRange: 1.3, attackCooldownMs: 1500, respawnMs: 15_000,
  },
  heo_rung: {
    id: "heo_rung", nameVi: "Heo Rừng Điên", element: "tho", maxHp: 120, attack: 14, defense: 8, exp: 70,
    speed: 2.6, aggroRadius: 4, leashRadius: 10, attackRange: 1.3, attackCooldownMs: 1800, respawnMs: 20_000,
  },
  doi_u_minh: {
    id: "doi_u_minh", nameVi: "Dơi U Minh", element: "kim", maxHp: 200, attack: 22, defense: 12, exp: 150,
    speed: 3.4, aggroRadius: 6, leashRadius: 14, attackRange: 1.3, attackCooldownMs: 1300, respawnMs: 25_000,
  },
  thi_quy: {
    id: "thi_quy", nameVi: "Thi Quỷ", element: "thuy", maxHp: 350, attack: 30, defense: 20, exp: 300,
    speed: 2.2, aggroRadius: 5, leashRadius: 12, attackRange: 1.4, attackCooldownMs: 2000, respawnMs: 30_000,
  },
};

export interface SpawnPoint {
  kind: keyof typeof MONSTERS;
  /** Tile units (centre of the spawn). The server snaps it to the nearest standable point. */
  x: number;
  y: number;
}

/** Safe maps (town) have no spawns. Anchors sit on the open lanes of each map. */
export const SPAWNS: Readonly<Record<MapId, readonly SpawnPoint[]>> = {
  town: [],
  forest: [
    { kind: "soi_rung", x: 20.5, y: 12.5 },
    { kind: "soi_rung", x: 20.5, y: 17.5 },
    { kind: "soi_rung", x: 14.5, y: 24.5 },
    { kind: "heo_rung", x: 26.5, y: 24.5 },
    { kind: "heo_rung", x: 32.5, y: 24.5 },
    { kind: "heo_rung", x: 38.5, y: 24.5 },
  ],
  cave: [
    { kind: "doi_u_minh", x: 12.5, y: 20.5 },
    { kind: "doi_u_minh", x: 17.5, y: 20.5 },
    { kind: "thi_quy", x: 23.5, y: 20.5 },
    { kind: "thi_quy", x: 29.5, y: 20.5 },
    { kind: "thi_quy", x: 35.5, y: 20.5 },
  ],
};

export function getMonsterDef(kind: string): MonsterDef | undefined {
  return MONSTERS[kind];
}

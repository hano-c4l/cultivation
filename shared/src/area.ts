import { tuning, DEFAULT_TUNING } from "./tuning";
import type { SkillDef } from "./skills";

/**
 * The ground a blow or a skill covers besides its main target. `arc` is a fan in front of the attacker (a sword's sweep), `line` a strip
 * straight ahead (a spear's thrust), `circle` a disc (`at: "self"`: round the attacker, an axe's whirl; `at: "aim"`: round the point aimed at, a
 * burst), and `single` hits only the target. `range` is in tiles (the disc's radius), `pct` the share of the damage the extra targets take.
 */
export interface AreaDef {
  shape: "single" | "arc" | "line" | "circle";
  range: number;
  /** Opening of an arc, in degrees. */
  deg?: number;
  /** Width of a line, in tiles. */
  width?: number;
  at?: "self" | "aim";
  /** Most targets in all, the main one included. */
  maxTargets: number;
  pct: number;
}

export type Pt = readonly [number, number];

export const SINGLE: AreaDef = { shape: "single", range: 0, maxTargets: 1, pct: 100 };

/** The area of the plain attack of a weapon family (none or an unknown family: single target). */
export function weaponAreaOf(weapon: string | undefined): AreaDef {
  const t = tuning().weaponArea;
  return (weapon ? (t?.[weapon] ?? DEFAULT_TUNING.weaponArea[weapon]) : undefined) ?? t?.none ?? SINGLE;
}

/** The id of the template a skill id comes from: `tram_2` -> `tram`. */
const templateOf = (id: string): string => id.replace(/_\d+$/, "");

/**
 * The area of a skill: by its id, then its template (`kim_3` has its own, `tram_2` falls to `tram`), then by the family of a gear skill
 * (`pb_kim_2` is `pb`, `bm_kim` is `bm`). A skill with none hits one target.
 */
export function skillAreaOf(def: Pick<SkillDef, "id"> | undefined): AreaDef {
  if (!def) return SINGLE;
  const t = tuning().skillAreas;
  const d = DEFAULT_TUNING.skillAreas;
  const family = def.id.replace(/^(pb|bm)_.*/, "$1");
  return t?.[def.id] ?? d[def.id] ?? t?.[templateOf(def.id)] ?? d[templateOf(def.id)] ?? t?.[family] ?? d[family] ?? SINGLE;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Whether `p` is inside the area when it is cast from `origin` towards `aim`. */
export function inArea(area: AreaDef, origin: Pt, aim: Pt, p: Pt): boolean {
  switch (area.shape) {
    case "single":
      return false;
    case "circle":
      return dist(area.at === "self" ? origin : aim, p) <= area.range;
    case "arc":
    case "line": {
      const dx = aim[0] - origin[0];
      const dy = aim[1] - origin[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = p[0] - origin[0];
      const py = p[1] - origin[1];
      const along = px * ux + py * uy;
      const across = Math.abs(-px * uy + py * ux);
      if (area.shape === "line") return along >= 0 && along <= area.range && across <= (area.width ?? 1) / 2;
      const d = Math.hypot(px, py);
      if (d > area.range) return false;
      if (d < 0.05) return true;
      return Math.acos(Math.max(-1, Math.min(1, along / d))) <= (((area.deg ?? 90) / 2) * Math.PI) / 180;
    }
  }
}

/**
 * The extra targets of a blow: from `candidates` the ones inside the area, nearest to the origin first, at most `maxTargets - 1` (the main
 * target, given by `exceptId`, is struck separately and never listed). Ties go by id so the choice is the same on every run.
 */
export function areaTargets<T extends { id: string; pos: Pt }>(area: AreaDef, origin: Pt, aim: Pt, candidates: readonly T[], exceptId?: string): T[] {
  if (area.shape === "single") return [];
  return candidates
    .filter((c) => c.id !== exceptId && inArea(area, origin, aim, c.pos))
    .sort((a, b) => dist(origin, a.pos) - dist(origin, b.pos) || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, area.maxTargets - 1));
}

/**
 * The first monster along an aim line (a skill with no area, cast at a point): inside the strip `width` wide and `range` long, the nearest to the
 * origin. Used when nothing was targeted.
 */
export function firstAlongLine<T extends { id: string; pos: Pt }>(origin: Pt, aim: Pt, range: number, width: number, candidates: readonly T[]): T | undefined {
  const line: AreaDef = { shape: "line", range, width, maxTargets: 1, pct: 100 };
  return candidates
    .filter((c) => inArea(line, origin, aim, c.pos))
    .sort((a, b) => dist(origin, a.pos) - dist(origin, b.pos) || (a.id < b.id ? -1 : 1))[0];
}

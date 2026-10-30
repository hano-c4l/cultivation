/**
 * The martial master's courses (võ sư): the advanced skill books are learned from the master for a fee instead of being bought from a merchant (a book still
 * drops from monsters and is read as before). A course names the master (`npc`: `master` for the first town, `master2`, `master3`), the skill it teaches and
 * the cost in Linh Thạch; a skill the character already has is not listed. The list is the tuning group `dojo`, so the Admin can change it later; this file has
 * no imports on purpose (the tuning defaults are built from it).
 */
export interface DojoCourse {
  npc: string;
  skill: string;
  cost: number;
}

const ROOTS = ["kim", "moc", "thuy", "hoa", "tho"] as const;
const by = (npc: string, skills: ReadonlyArray<readonly [string, number]>): DojoCourse[] => skills.map(([skill, cost]) => ({ npc, skill, cost }));
const rootSkills = (n: number, cost: number): Array<readonly [string, number]> => ROOTS.map((el) => [`${el}_${n}`, cost] as const);

/** What the merchants used to sell as books, at the price they asked, now taught by the masters of the same towns. */
export const DEFAULT_DOJO_COURSES: DojoCourse[] = [
  ...by("master", [["cuong_than", 2_000], ["ngu_kiem_tram", 3_000], ...rootSkills(3, 20_000), ["hap_huyet", 60_000], ["bao_kich", 80_000]]),
  ...by("master2", [["ho_the_kd", 150_000], ["hoi_nguyen_kd", 200_000], ["cuong_than_na", 1_500_000], ...rootSkills(4, 300_000), ...rootSkills(5, 3_000_000), ["diet_ky", 600_000], ["loi_van", 6_000_000]]),
  ...by("master3", [
    ["ho_the_ht", 15_000_000],
    ["hoi_than_ht", 20_000_000],
    ["chien_y_ht", 30_000_000],
    ["ho_the_lh", 150_000_000],
    ["hoi_nguyen_lh", 200_000_000],
    ["chien_y_lh", 300_000_000],
    ...rootSkills(6, 30_000_000),
    ...rootSkills(7, 300_000_000),
    ["thien_thach", 40_000_000],
    ["huyet_hai", 400_000_000],
  ]),
];

export interface DojoCfg {
  courses: DojoCourse[];
}

export const DEFAULT_DOJO: DojoCfg = { courses: DEFAULT_DOJO_COURSES };

/** The courses of one master (the id may carry the number of its town: `master2` is its own, never `master`'s). */
export const coursesOf = (cfg: DojoCfg, npc: string): DojoCourse[] => cfg.courses.filter((c) => c.npc === npc);

export function validDojo(v: unknown): v is DojoCfg {
  if (typeof v !== "object" || v === null) return false;
  const list = (v as { courses?: unknown }).courses;
  if (!Array.isArray(list) || list.length > 400) return false;
  const seen = new Set<string>();
  return list.every((c) => {
    if (typeof c !== "object" || c === null) return false;
    const { npc, skill, cost } = c as Record<string, unknown>;
    if (typeof npc !== "string" || !/^[a-z0-9_]{1,24}$/.test(npc) || typeof skill !== "string" || !/^[a-z0-9_]{1,24}$/.test(skill)) return false;
    if (typeof cost !== "number" || !Number.isInteger(cost) || cost < 0 || cost > 1_000_000_000_000) return false;
    const key = `${npc}:${skill}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

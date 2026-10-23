import type { EquipKind } from "./equipment-data";
import type { MonsterRank } from "./monsters";

/**
 * Balance numbers of phase 2j that used to be code constants (blacksmith costs and ore drops, refining, the price of the Hộ Cấp Phù, the
 * boss's cone and healing). They live in D1 (table `game_tuning`, one JSON row per group; migration 0030) so an admin screen can edit them
 * later: the server seeds the rows from DEFAULT_TUNING, installs them with setTuning and sends them to the client with the windows that
 * show them. Every group is validated separately, and a missing or broken group keeps its default. All values are placeholders.
 */
export interface DropCfg {
  chance: number;
  min: number;
  max: number;
}

export interface Tuning {
  /** Tinh luyện: ore taken, Linh Thạch (as a share of `enhanceCost.linhBase` of the realm) and the chance each stat is rolled. */
  refine: { materials: number; linhShare: number; statChance: number };
  /** Chance and size of the smith's ore a kill drops, by monster rank. */
  oreDrop: Record<MonsterRank, DropCfg>;
  /** The same for the refining ore (rarer). */
  refineDrop: Record<MonsterRank, DropCfg>;
  /** The Hộ Cấp Phù (keeps a level on a failed step), sold for Tiên Ngọc. */
  keepLevel: { priceTienNgoc: number };
  /** Upgrade cost: Linh Thạch per unit of a step's `linhMult` by the realm of the piece, and the cap of the bonus built up by failures. */
  enhanceCost: { linhBase: number[]; maxPityPct: number };
  /** The boss's cone: damage multiple, cooldown, the share of HP below which it is used, range (tiles) and half its opening (degrees). */
  bossCone: { power: number; cdMs: number; below: number; range: number; halfAngleDeg: number };
  /** The boss heals this fraction of its maximum HP per second once it has walked home from a lost fight. */
  bossRegen: { perSecond: number };
  /** The teleport array in the middle of a main town: Linh Thạch = base + perUnit x the distance between the two towns on the world map (see waygate.ts). */
  waygate: { base: number; perUnit: number };
  /** Area of interest: an entity comes into view inside `enter` and leaves it beyond `leave`, in screen units of 32 px (see aoi.ts). */
  aoi: { enter: { x: number; y: number }; leave: { x: number; y: number }; everyTicks: number };
  /** The map boss appearing: the chance a respawning monster asks for it, and the kills in a room that make it certain, by the map realm (index = realm); `flushEvery` is how many kills a room counts before it adds them to the map's shared counter (one D1 write each). */
  bossSpawn: { chance: number; pityKills: number[]; pityDefault: number; flushEvery: number };
  /** The boss strength: a character at bậc `statTier` in a full set of gear of `gearGrade`, its points spent, `hpMult` times the maximum HP. */
  bossStats: { statTier: number; gearGrade: number; hpMult: number; pointsPerLevel: number; realmBonus: number };
  /** Sharing a boss kill: the smallest share that pays, the weights of damage and last hit, and the rewards as multiples of a Đại Yêu. */
  bossReward: { minShare: number; damageWeight: number; lastHitWeight: number; expMult: number; linhMult: number; itemRounds: number; itemChanceMult: number };
  /** What the boss does besides its plain attack. */
  bossSkills: { mend: { fraction: number; below: number; cdMs: number }; burst: { power: number; cdMs: number }; slash: { power: number; cdMs: number } };
  /** A vệ binh strength (see guards.ts). */
  guard: { gearGrade: number; hpMult: number; pointsPerLevel: number; realmBonus: number; tier: number };
  /** What a vệ binh does besides its plain attack. */
  guardSkills: {
    mend: { fraction: number; below: number; cdMs: number };
    ward: { attackPct: number; durationMs: number; cdMs: number };
    burst: { power: number; cdMs: number };
    slash: { power: number; cdMs: number };
  };
  /** PvP numbers (see pk.ts): sát khí, sát nhân, and by name colour (index 0 white, 1 yellow, 2 orange, 3 red) the chance to lose an item and the share of durability lost on dying. */
  pvp: {
    satKhi: { perKill: number; lostOnDeath: number; bonusAbove: number; bonusFullAt: number; bonusMinPct: number; bonusMaxPct: number };
    satNhan: { perKill: number; decayPerMin: number; lostOnDeath: number; lostKillingOrange: number; lostKillingRed: number };
    dropChance: number[];
    deathDurability: number[];
  };
  /** What a kill drops. `linh`: Linh Thạch (chance and amount multiple by monster rank, base amount and growth per level index). `book`: chance of a skill book by rank. `pill`: chance of the realm's breakthrough pill by the map's realm (key) and rank. `equip`: chance of a piece of gear, weights over grades 1..4 and the share of over-level pieces, by rank. */
  drops: {
    linh: { chance: Record<MonsterRank, number>; amountMult: Record<MonsterRank, number>; base: number; growth: number };
    book: Record<MonsterRank, number>;
    pill: Record<string, Record<MonsterRank, number>>;
    equip: Record<MonsterRank, { chance: number; grades: number[]; overLevel: number }>;
  };
  /** Same-bậc normal monsters needed to finish a stage: `base` at Luyện Khí tầng 1, growing by `growth` per level (monster EXP follows from it). */
  kills: { base: number; growth: number };
  /** Value of things, in Linh Thạch: plain items by id, a piece of gear by kind (times `1 + levelStep x level`, times `grades[grade - 1]`). Merchants buy at a share of it. */
  itemValue: { items: Record<string, number>; kinds: Record<EquipKind, number>; grades: number[]; levelStep: number };
  /** Skills: strength and cooldown by mastery level, mastery points needed per level, how much each kind scales with realm, and a phụ tu skill's share. */
  skills: { levelPower: number[]; levelCooldown: number[]; masteryNeeded: number[]; attackRealmScale: number; healRealmScale: number; buffRealmScale: number; subFactor: number };
  /** Interface colours (see theme.ts): realm tags and grade backgrounds. */
  theme: { realmColors: string[]; gradeColors: string[] };
}

export type TuningGroup = keyof Tuning;

export const DEFAULT_TUNING: Readonly<Tuning> = {
  refine: { materials: 2, linhShare: 1, statChance: 0.5 },
  oreDrop: {
    normal: { chance: 0.2, min: 1, max: 1 },
    rare1: { chance: 0.6, min: 1, max: 3 },
    rare2: { chance: 1, min: 2, max: 5 },
  },
  refineDrop: {
    normal: { chance: 0.04, min: 1, max: 1 },
    rare1: { chance: 0.15, min: 1, max: 2 },
    rare2: { chance: 0.4, min: 1, max: 3 },
  },
  keepLevel: { priceTienNgoc: 50 },
  enhanceCost: { linhBase: [100, 1_000, 10_000, 100_000], maxPityPct: 30 },
  bossCone: { power: 2.2, cdMs: 25_000, below: 0.25, range: 4.5, halfAngleDeg: 45 },
  bossRegen: { perSecond: 0.02 },
  waygate: { base: 500, perUnit: 40 },
  aoi: { enter: { x: 52, y: 32 }, leave: { x: 58, y: 36 }, everyTicks: 5 },
  bossSpawn: { chance: 0.001, pityKills: [500, 1500, 2500, 4000], pityDefault: 1500, flushEvery: 25 },
  bossStats: { statTier: 2, gearGrade: 4, hpMult: 25, pointsPerLevel: 2, realmBonus: 1 },
  bossReward: { minShare: 0.1, damageWeight: 0.7, lastHitWeight: 0.3, expMult: 4, linhMult: 25, itemRounds: 5, itemChanceMult: 3 },
  bossSkills: { mend: { fraction: 0.04, below: 0.5, cdMs: 20_000 }, burst: { power: 2.6, cdMs: 10_000 }, slash: { power: 1.7, cdMs: 5_000 } },
  guard: { gearGrade: 4, hpMult: 5, pointsPerLevel: 2, realmBonus: 1, tier: 3 },
  guardSkills: {
    mend: { fraction: 0.25, below: 0.6, cdMs: 15_000 },
    ward: { attackPct: 30, durationMs: 8_000, cdMs: 20_000 },
    burst: { power: 2.4, cdMs: 9_000 },
    slash: { power: 1.6, cdMs: 5_000 },
  },
  pvp: {
    satKhi: { perKill: 10, lostOnDeath: 50, bonusAbove: 200, bonusFullAt: 1000, bonusMinPct: 5, bonusMaxPct: 15 },
    satNhan: { perKill: 100, decayPerMin: 5, lostOnDeath: 50, lostKillingOrange: 50, lostKillingRed: 100 },
    dropChance: [0, 0.1, 0.25, 0.5],
    deathDurability: [0.05, 0.05, 0.1, 0.2],
  },
  drops: {
    linh: { chance: { normal: 0.3, rare1: 1, rare2: 1 }, amountMult: { normal: 1, rare1: 4, rare2: 10 }, base: 2, growth: 1.1 },
    book: { normal: 0.003, rare1: 0.03, rare2: 0.08 },
    pill: {
      "0": { normal: 0.004, rare1: 0.04, rare2: 0.12 },
      "1": { normal: 0.0015, rare1: 0.02, rare2: 0.06 },
      "2": { normal: 0.0005, rare1: 0.008, rare2: 0.03 },
    },
    equip: {
      normal: { chance: 0.03, grades: [70, 25, 5, 0], overLevel: 0 },
      rare1: { chance: 0.15, grades: [45, 35, 17, 3], overLevel: 0.1 },
      rare2: { chance: 0.3, grades: [25, 35, 30, 10], overLevel: 0.25 },
    },
  },
  kills: { base: 30, growth: 1.13 },
  itemValue: {
    items: {
      hoi_huyet_dan: 10,
      duong_huyet_dan: 25,
      dai_hoi_huyet_dan: 60,
      ngo_dao_dan: 1500,
      linh_thao: 3,
      thu_cot: 3,
      yeu_dan: 40,
      ttp_town: 2_000,
      ttp_town2: 20_000,
      linh_nguyen_dan: 400,
      bao_nguyen_dan: 1_500,
      thien_ngo_dan: 7_500,
    },
    kinds: { weapon: 40, hat: 20, robe: 30, bracer: 20, ring: 25, jade: 25, necklace: 25, belt: 20, boots: 20, charm: 60, bonded: 150, flight: 150 },
    grades: [1, 2, 4, 8],
    levelStep: 0.6,
  },
  skills: {
    levelPower: [1, 1.15, 1.35, 1.6, 2],
    levelCooldown: [1, 1, 1, 0.9, 0.8],
    masteryNeeded: [50, 150, 400, 1000],
    attackRealmScale: 0.5,
    healRealmScale: 0.1,
    buffRealmScale: 0.2,
    subFactor: 0.5,
  },
  theme: {
    realmColors: ["#8bc34a", "#4fc3f7", "#ffb300", "#e040fb"],
    gradeColors: ["rgba(158, 158, 158, 0.28)", "rgba(76, 175, 80, 0.3)", "rgba(66, 165, 245, 0.32)", "rgba(171, 71, 188, 0.34)", "rgba(255, 179, 0, 0.36)"],
  },
};

export const TUNING_GROUPS = Object.keys(DEFAULT_TUNING) as TuningGroup[];

/** Labels for the future admin screen. */
export const TUNING_LABELS_VI: Readonly<Record<TuningGroup, string>> = {
  refine: "Tinh luyện: nguyên liệu, Linh Thạch, tỉ lệ mỗi chỉ số",
  oreDrop: "Tỉ lệ và số lượng rơi Tinh Thiết theo loại quái",
  refineDrop: "Tỉ lệ và số lượng rơi Tinh Hoa theo loại quái",
  keepLevel: "Giá Hộ Cấp Phù (Tiên Ngọc)",
  enhanceCost: "Chi phí nâng cấp: Linh Thạch cơ bản theo cảnh giới, giới hạn cộng dồn thất bại",
  bossCone: "Kỹ năng nón của boss",
  bossRegen: "Tốc độ hồi máu của boss khi về chỗ cũ",
  waygate: "Truyền tống trận: giá cơ bản và giá mỗi đơn vị khoảng cách giữa hai thành (Linh Thạch)",
  aoi: "Vùng nhìn: khoảng cách vào tầm và rời tầm (đơn vị màn hình 32 px)",
  bossSpawn: "Boss xuất hiện: xác suất mỗi lần quái hồi sinh, số lần giết chắc chắn theo cảnh giới bản đồ",
  bossStats: "Sức mạnh boss: bậc, phẩm trang bị, hệ số sinh lực, điểm mỗi cấp",
  bossReward: "Thưởng boss: ngưỡng chia, trọng số sát thương và đòn kết liễu, hệ số EXP, Linh Thạch, số vòng rơi đồ",
  bossSkills: "Kỹ năng boss: hồi máu, đòn mạnh, đòn chém",
  guard: "Sức mạnh vệ binh: phẩm trang bị, hệ số sinh lực, điểm mỗi cấp",
  guardSkills: "Kỹ năng vệ binh: hồi máu, hộ thể, đòn mạnh, đòn chém",
  pvp: "PvP: sát khí, sát nhân, xác suất rơi đồ và độ bền hao khi chết theo màu tên",
  drops: "Rơi đồ: Linh Thạch, bí tịch, đan đột phá, trang bị theo loại quái",
  kills: "Số quái cùng bậc cần giết để lên một tầng (và EXP quái suy ra từ đó)",
  itemValue: "Giá trị vật phẩm: vật phẩm thường, trang bị theo loại, phẩm và cấp",
  skills: "Kỹ năng: sức mạnh và hồi chiêu theo cấp thuần thục, điểm thuần thục, hệ số theo cảnh giới",
  theme: "Màu giao diện: màu cảnh giới và màu nền phẩm cấp",
};

const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const int = (v: unknown, min: number, max: number): v is number => num(v, min, max) && Number.isInteger(v);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validDrop(v: unknown): v is DropCfg {
  return obj(v) && num(v.chance, 0, 1) && int(v.min, 0, 999) && int(v.max, 0, 999) && (v.max as number) >= (v.min as number);
}

/** A set of skills: each named entry must be an object whose listed fields are numbers (cooldowns and durations whole). */
function validSkillSet(value: Record<string, unknown>, shape: Record<string, string[]>): boolean {
  return Object.entries(shape).every(([name, fields]) => {
    const sk = value[name];
    return obj(sk) && fields.every((f) => (f.endsWith("Ms") ? int(sk[f], 0, 3_600_000) : num(sk[f], 0, 100_000)));
  });
}

const EQUIP_KIND_KEYS: readonly EquipKind[] = ["weapon", "hat", "robe", "bracer", "ring", "jade", "necklace", "belt", "boots", "charm", "bonded", "flight"];

function validDrops(v: unknown): v is Record<MonsterRank, DropCfg> {
  return obj(v) && validDrop(v.normal) && validDrop(v.rare1) && validDrop(v.rare2);
}

/** Whether `value` is a well formed value for the group (used for rows read from D1 and for an admin save). */
export function validTuningGroup(group: string, value: unknown): boolean {
  if (!obj(value)) return false;
  switch (group) {
    case "refine":
      return int(value.materials, 0, 999) && num(value.linhShare, 0, 1000) && num(value.statChance, 0, 1);
    case "oreDrop":
    case "refineDrop":
      return validDrops(value);
    case "keepLevel":
      return int(value.priceTienNgoc, 0, 1_000_000);
    case "enhanceCost":
      return (
        Array.isArray(value.linhBase) &&
        value.linhBase.length === DEFAULT_TUNING.enhanceCost.linhBase.length &&
        value.linhBase.every((n) => int(n, 0, 1_000_000_000)) &&
        num(value.maxPityPct, 0, 100)
      );
    case "bossCone":
      return num(value.power, 0, 100) && int(value.cdMs, 0, 3_600_000) && num(value.below, 0, 1) && num(value.range, 0, 50) && num(value.halfAngleDeg, 0, 180);
    case "bossRegen":
      return num(value.perSecond, 0, 1);
    case "waygate":
      return int(value.base, 0, 100_000_000) && num(value.perUnit, 0, 1_000_000);
    case "aoi": {
      const box = (b: unknown): b is { x: number; y: number } => obj(b) && num(b.x, 1, 1000) && num(b.y, 1, 1000);
      return box(value.enter) && box(value.leave) && value.leave.x >= value.enter.x && value.leave.y >= value.enter.y && int(value.everyTicks, 1, 600);
    }
    case "bossSpawn":
      return num(value.chance, 0, 1) && Array.isArray(value.pityKills) && value.pityKills.length >= 1 && value.pityKills.length <= 16 && value.pityKills.every((n) => int(n, 1, 10_000_000)) && int(value.pityDefault, 1, 10_000_000) && int(value.flushEvery, 1, 100_000);
    case "bossStats":
      return int(value.statTier, 1, 9) && int(value.gearGrade, 1, 4) && num(value.hpMult, 0.01, 1000) && num(value.pointsPerLevel, 0, 1000) && int(value.realmBonus, 0, 3);
    case "bossReward":
      return (
        num(value.minShare, 0, 1) && num(value.damageWeight, 0, 1) && num(value.lastHitWeight, 0, 1) && num(value.expMult, 0, 1000) && num(value.linhMult, 0, 100_000) && int(value.itemRounds, 0, 100) && num(value.itemChanceMult, 0, 100)
      );
    case "bossSkills":
      return validSkillSet(value, { mend: ["fraction", "below", "cdMs"], burst: ["power", "cdMs"], slash: ["power", "cdMs"] });
    case "guard":
      return int(value.gearGrade, 1, 4) && num(value.hpMult, 0.01, 1000) && num(value.pointsPerLevel, 0, 1000) && int(value.realmBonus, 0, 3) && int(value.tier, 1, 9);
    case "guardSkills":
      return validSkillSet(value, { mend: ["fraction", "below", "cdMs"], ward: ["attackPct", "durationMs", "cdMs"], burst: ["power", "cdMs"], slash: ["power", "cdMs"] });
    case "drops": {
      const ranks = (r: unknown, f: (v: unknown) => boolean) => obj(r) && f(r.normal) && f(r.rare1) && f(r.rare2);
      const prob = (v: unknown) => num(v, 0, 1);
      const linh = value.linh;
      const pill = value.pill;
      return (
        obj(linh) &&
        ranks(linh.chance, prob) &&
        ranks(linh.amountMult, (v) => num(v, 0, 100_000)) &&
        num(linh.base, 0, 1_000_000) &&
        num(linh.growth, 1, 10) &&
        ranks(value.book, prob) &&
        obj(pill) &&
        Object.entries(pill).every(([k, v]) => /^\d{1,2}$/.test(k) && ranks(v, prob)) &&
        ranks(value.equip, (v) => obj(v) && prob(v.chance) && prob(v.overLevel) && Array.isArray(v.grades) && v.grades.length === 4 && v.grades.every((g) => num(g, 0, 100_000)) && (v.grades as number[]).some((g) => g > 0))
      );
    }
    case "kills":
      return num(value.base, 1, 1_000_000) && num(value.growth, 1, 3);
    case "itemValue": {
      const kinds = value.kinds;
      return (
        obj(value.items) &&
        Object.entries(value.items).every(([k, v]) => /^[a-z0-9_.]{1,60}$/.test(k) && int(v, 0, 1_000_000_000)) &&
        obj(kinds) &&
        EQUIP_KIND_KEYS.every((k) => num(kinds[k], 0, 1_000_000)) &&
        Array.isArray(value.grades) &&
        value.grades.length === 4 &&
        value.grades.every((g) => num(g, 0, 1000)) &&
        num(value.levelStep, 0, 10)
      );
    }
    case "skills": {
      const list = (a: unknown, n: number, min: number, max: number) => Array.isArray(a) && a.length === n && a.every((x) => num(x, min, max));
      return (
        list(value.levelPower, 5, 0, 100) &&
        list(value.levelCooldown, 5, 0.05, 10) &&
        list(value.masteryNeeded, 4, 1, 10_000_000) &&
        num(value.attackRealmScale, 0, 10) &&
        num(value.healRealmScale, 0, 10) &&
        num(value.buffRealmScale, 0, 10) &&
        num(value.subFactor, 0, 1)
      );
    }
    case "theme": {
      const color = (c: unknown) => typeof c === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]+\)|hsla?\([0-9 ,.%deg]+\))$/.test(c.trim());
      const colors = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(color);
      return colors(value.realmColors, 4) && colors(value.gradeColors, 5);
    }
    case "pvp": {
      const tiers = (a: unknown) => Array.isArray(a) && a.length === 4 && a.every((n) => num(n, 0, 1));
      const sk = value.satKhi;
      const sn = value.satNhan;
      return (
        obj(sk) &&
        ["perKill", "lostOnDeath", "bonusAbove", "bonusFullAt", "bonusMinPct", "bonusMaxPct"].every((k) => num(sk[k], 0, 1_000_000)) &&
        (sk.bonusFullAt as number) > (sk.bonusAbove as number) &&
        obj(sn) &&
        ["perKill", "decayPerMin", "lostOnDeath", "lostKillingOrange", "lostKillingRed"].every((k) => num(sn[k], 0, 1_000_000)) &&
        tiers(value.dropChance) &&
        tiers(value.deathDurability)
      );
    }
    default:
      return false;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let live: Tuning = clone(DEFAULT_TUNING);
let liveGeneration = 0;

/** Changes every time setTuning installs numbers: anything cached from tunable numbers (the merchants' prices) keys on it. */
export function tuningGeneration(): number {
  return liveGeneration;
}

/** The numbers in force on this isolate (the defaults until setTuning installs rows). */
export function tuning(): Readonly<Tuning> {
  return live;
}

/** Installs live groups (`rows` maps a group name to its parsed JSON); a group not given, or given badly, keeps its default. */
export function setTuning(rows: Readonly<Record<string, unknown>> | null | undefined): void {
  const next = clone(DEFAULT_TUNING);
  for (const group of TUNING_GROUPS) {
    const v = rows?.[group];
    if (v !== undefined && validTuningGroup(group, v)) (next as unknown as Record<string, unknown>)[group] = clone(v);
  }
  live = next;
  liveGeneration++;
}

/** Back to the defaults (tests). */
export function resetTuning(): void {
  setTuning(null);
}

import { DEFAULT_ALCHEMY, validAlchemy, type AlchemyCfg } from "./alchemy";
import type { AreaDef } from "./area";
import { DEFAULT_DOJO, validDojo, type DojoCfg } from "./dojo";
import { SKILL_LOOKS } from "./skill-looks";
import { FLIGHT_STYLES, GROUND_STYLES, ICON_PICKABLE, OBSTACLE_STYLES, type FlightStyle, type IconShape, type GroundStyle, type NpcLook, type ObstacleStyle } from "./art-styles";
import type { EquipKind } from "./equipment-data";
import type { MonsterRank } from "./monsters";
import type { PathBonus } from "./paths";

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

/** One line of a loot table: each kill rolls `chance` (0..1) and, on success, a quantity in [min, max] of the item. */
export interface LootLine {
  item: string;
  chance: number;
  min: number;
  max: number;
}

/** The limits of the Auto hunt (see `Tuning.auto`). */
export type AutoLimits = Tuning["auto"];

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
  /** The colours of the gear on a figure (see gear-look.ts): the tint of a weapon by its element (`none` for one without), and the palettes the robe, hat and boots of each set pick from (set number modulo the length). */
  gearLooks: { weapon: Record<string, string>; robe: string[]; hat: string[]; boots: string[] };
  basicSkill: { realms: Array<{ nameVi?: string; powerMult: number; range?: number; mpCost?: number; area?: AreaDef }> };
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
    /** Anh hùng: points per orange and red kill, the two steps, and what each step gives (percent of linh lực, percent of drop chance). */
    hero: { perOrange: number; perRed: number; tier1: number; tier2: number; bonus1: { mpPct: number; dropPct: number }; bonus2: { mpPct: number; dropPct: number } };
    /** Sát nhân from which a name is yellow, orange, red (orange and red are barred from NPCs and hunted by guards). */
    nameTiers: { yellowFrom: number; orangeFrom: number; redFrom: number };
    /** Below this level (realm, stage) nobody can be attacked or attack in PvP. */
    protectedBelow: { realm: number; stage: number };
  };
  /** What a kill drops. `linh`: Linh Thạch (chance and amount multiple by monster rank, base amount and growth per level index). `book`: chance of a skill book by rank. `pill`: chance of the realm's breakthrough pill by the map's realm (key) and rank. `equip`: chance of a piece of gear, weights over grades 1..4 and the share of over-level pieces, by rank. */
  drops: {
    linh: { chance: Record<MonsterRank, number>; amountMult: Record<MonsterRank, number>; base: number; growth: number };
    book: Record<MonsterRank, number>;
    pill: Record<string, Record<MonsterRank, number>>;
    equip: Record<MonsterRank, { chance: number; grades: number[]; overLevel: number }>;
  };
  /**
   * What a kill drops besides what `drops` rolls: the lines every map pays by monster class (`base`) and, for maps of a realm (key = the realm
   * index), extra lines on top. Lines are rolled in order, two random numbers each (chance, quantity), so the order matters for seeded tests.
   */
  loot: { base: Record<MonsterRank, LootLine[]>; realm: Record<string, Record<MonsterRank, LootLine[]>> };
  /** Same-bậc normal monsters needed to finish a stage: `base` at Luyện Khí tầng 1, growing by `growth` per level (monster EXP follows from it). */
  kills: { base: number; growth: number };
  /** Value of things, in Linh Thạch: plain items by id, a piece of gear by kind (times `1 + levelStep x level`, times `grades[grade - 1]`). Merchants buy at a share of it. */
  itemValue: { items: Record<string, number>; kinds: Record<EquipKind, number>; grades: number[]; levelStep: number };
  /** Skills: strength and cooldown by mastery level, mastery points needed per level, how much each kind scales with realm, and a phụ tu skill's share. */
  skills: { levelPower: number[]; levelCooldown: number[]; masteryNeeded: number[]; pillPoints: number; attackRealmScale: number; healRealmScale: number; buffRealmScale: number; subFactor: number };
  /** Interface colours (see theme.ts): realm tags and grade backgrounds, and the palette of the page (`ui`: CSS variable name without `--` to colour). */
  theme: { realmColors: string[]; gradeColors: string[]; ui: Record<string, string> };
  /** Monster species (numbers on the realm/bậc curve, see monsters.ts) and the classes: chance of rolling it and the multiples on stats and EXP. */
  monsters: { species: Record<string, MonsterNumbers>; ranks: Record<MonsterRank, RankNumbers> };
  /** Changes to skills by id, or by the id of a root template (every realm of it): see SkillNumbers; the skills themselves are generated from templates in skills.ts. Empty by default. */
  skillOverrides: Record<string, Partial<SkillNumbers>>;
  /** EXP and potential points by realm, how the need grows per stage, the EXP of farming a map below you, and how far the bar overflows at stage 9. */
  exp: { realms: Array<{ expBase: number; pointsPerStage: number }>; stageGrowth: number; lowMapMult: number; overflowMax: number };
  /** Breakthrough by the realm left (index = from realm): pills, chances, time, cost, points; and the shared rules. */
  breakthrough: {
    steps: Array<{ maxPills: number; baseRatePct: number; maxRatePct: number; durationMs: number; cost: number; basePoints: number }>;
    failExpLoss: number;
    gradePointsMult: number;
    constitutionPoints: number;
    overflowFrom: number;
    overflowFromBonus: number;
    overflowMaxBonus: number;
  };
  /** Linh Thạch to make a phụ tu the chủ tu, and to drop a path (see paths.ts). */
  paths: { swapCostBase: number; dropCostBase: number };
  /** Fighting basics: the share of stage EXP lost on death, the regeneration (HP and MP delay and rate), the grey-name window, the share of durability a death costs, and the monster stat curve (`base + perLevel x level index`). */
  combat: {
    deathExpLoss: number;
    hpRegenDelayMs: number;
    mpRegenPerS: number;
    mpRegenDelayMs: number;
    grayWindowMs: number;
    deathDurabilityFraction: number;
    monsterCurve: { hpBase: number; hpPerLevel: number; attackBase: number; attackPerLevel: number; defenseBase: number; defensePerLevel: number };
  };
  /** How the base stats and the level turn into combat stats (`deriveStats`): each stat is its `base` plus the listed amounts per point of a base stat or per level index (realm x 9 + stage - 1); worn gear is added on top. The percent caps and the walking speed stay in code. */
  stats: {
    maxHp: { base: number; perCanCot: number; perLevel: number };
    maxMp: { base: number; perLinhLuc: number; perLevel: number };
    attack: { base: number; perLinhLuc: number; perCanCot: number; perLevel: number };
    defense: { base: number; perCanCot: number; perLevel: number };
    critRate: { base: number; perThanThuc: number };
    dodgeRate: { perThanPhap: number };
    expBonus: { perNgoTinh: number };
    dropBonus: { perPhucDuyen: number };
    /** The highest percent crit and dodge reach. */
    rateCap: number;
  };
  /** The spiritual root rolls: quality grades (weight out of the total, EXP bonus, starting points, damage bonus) and the element counts (weight, EXP bonus). Names stay in code. */
  roots: { grades: Array<{ weight: number; expBonusPct: number; bonusPoints: number; elementDamagePct: number }>; counts: Array<{ weight: number; expBonusPct: number }> };
  /** What each path adds as the chủ tu (see paths.ts), by path id. */
  pathBonuses: Record<string, PathBonus>;
  /** The map bosses: how long a claim lasts, the bậc they pay out at, and the species of each map (null: no boss). */
  boss: { claimTtlMs: number; tier: number; species: Record<string, string | null> };
  /** The alchemist's brewing: how many brewings a character can have at once and the recipes (see alchemy.ts). */
  alchemy: AlchemyCfg;
  /** The martial masters' courses: which skill each teaches and for how much Linh Thạch (see dojo.ts). */
  dojo: DojoCfg;
  /** The chance that a kill drops the book of a rare skill of the realm of the map (see skills-extra.ts): by monster class, and for each item round of the map's boss. */
  rareBooks: { chance: Record<"normal" | "rare1" | "rare2" | "boss", number> };
  /** The outfit drawn on a player's sprite, by the realm of the robe worn: the rule with the highest `minRealm` the robe reaches wins (no robe or no rule: the plain peasant clothes). `outfit` names a sprite variant (`player.<body>.<outfit>`); one without a sprite is drawn as the plain clothes. */
  outfits: { rules: Array<{ minRealm: number; outfit: string }> };
  /** Which sprite model draws a species (`monster.<species>` is tried first): species id -> model key (`monster.<model>`). Several species can share one model; a species with neither is drawn as the square. */
  monsterModels: Record<string, string>;
  /** The colour a monster sprite is multiplied by, by element (`#rrggbb`), so one model looks different in each element; an element without one is drawn in the model's own colours. */
  monsterTints: Record<string, string>;
  /** How each map is drawn: ground details and the shape of the small obstacles (trees, rocks...), by map id; a map without an entry is drawn plain. */
  mapArt: { maps: Record<string, { ground: GroundStyle; obstacle: ObstacleStyle; mix?: ObstacleStyle[] }> };
  /** How the NPCs look: a player body with an optional outfit and weapon, by NPC id (a trailing number is ignored: `smith2` is `smith`) or else by kind. */
  npcLooks: { byKind: Record<string, NpcLook>; byId: Record<string, NpcLook> };
  /** What a rider of the flight pháp bảo stands on (one look for everyone while the server syncs only "is riding"; a look per item waits for the Admin art screens). */
  flightLooks: { default: FlightStyle; /** By the element of the worn flight pháp bảo (its id's last part), then by its realm; else `default`. */ byElement?: Record<string, FlightStyle>; byRealm?: Record<string, FlightStyle> };
  /** The ground a plain attack covers besides its target, by weapon family (`none`: bare hands or an unknown family). */
  weaponArea: Record<string, AreaDef>;
  /** How far (in tiles) a plain attack reaches, by weapon family: the player walks up to this far from the target, then strikes (`none`: bare hands or an unknown family). */
  weaponReach: Record<string, number>;
  /** The ground a skill covers besides its target, by skill id, then by template (`tram_2` is `tram`), then by gear family (`pb`, `bm`). */
  skillAreas: Record<string, AreaDef>;
  /** The limits of the Auto hunt (the client automation): what a player may pick and how fast it works. The player's own choices are kept in the browser. */
  auto: { radiusMin: number; radiusMax: number; radiusDefault: number; tickMs: number; giveUpMs: number; skipMs: number; potionGapMs: number; castBackoffMs: number };
  /** How a skill is drawn, by skill id, then template, then gear family: a style name of `SKILL_LOOKS` (a skill with none is drawn by its kind). */
  skillLooks: Record<string, string>;
  /**
   * The icon an Admin chose from the existing drawings (`ICON_PICKABLE`): `items` by item id, `skills` by skill id, and `kinds` for a whole kind of item: `weapon.<family>`
   * or a gear kind (`hat`, `robe`...) for gear, `category.<category>` for the rest. Nothing listed: the icon the code derives (client/src/icons.ts).
   */
  iconLooks: { items: Record<string, IconShape>; skills: Record<string, IconShape>; kinds: Record<string, IconShape> };
}

export interface MonsterNumbers {
  /** The name shown for the species, when an admin changed it (otherwise the one written in the code). */
  nameVi?: string;
  hpMult: number;
  attackMult: number;
  defenseMult: number;
  speed: number;
  aggroRadius: number;
  leashRadius: number;
  attackRange: number;
  attackCooldownMs: number;
  respawnMs: number;
}
export interface RankNumbers {
  chance: number;
  hpMult: number;
  attackMult: number;
  defenseMult: number;
  expMult: number;
}
export interface SkillNumbers {
  power: number;
  mpCost: number;
  cooldownMs: number;
  range: number;
  /** Text shown in the skill windows (kept short: it travels with the tuning). */
  nameVi: string;
  descVi: string;
  /** Buffs: how long they last. */
  buffDurationMs: number;
  /** Attacks: the effect others see. */
  fx: "melee" | "ranged";
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
  enhanceCost: { linhBase: [100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000], maxPityPct: 30 },
  bossCone: { power: 2.2, cdMs: 25_000, below: 0.25, range: 4.5, halfAngleDeg: 45 },
  bossRegen: { perSecond: 0.02 },
  gearLooks: {
    weapon: { none: "#e6edf5", kim: "#f2f4f8", moc: "#9fe0a0", thuy: "#8cc4ff", hoa: "#ff8c6a", tho: "#e0b878", loi: "#c8a8ff", bang: "#b4f0ff", phong: "#a8f0d8" },
    robe: ["#ffffff", "#ffe9d0", "#d8ecff", "#e2ffd8", "#f6d8ff", "#fff4b8", "#ffd0d8", "#cfeee8", "#e8e0ff", "#ffe0a8", "#cfe4ff", "#f0ffd0", "#ffd8f0", "#d0fff4", "#ffd6b0", "#dcdcff"],
    hat: ["#e8d8b0", "#d0e0ff", "#f0c0c0", "#c8f0c8", "#e0c8f8", "#ffe8a0", "#c0e8f0", "#f8d0a0", "#d8d8e8", "#b8e0c0"],
    boots: ["#c8d0dc", "#ffd890", "#a8d8ff", "#ffa8a8", "#b8f0b8", "#e0b8ff", "#fff0a0", "#a8f0e8"],
  },
  basicSkill: {
    realms: [
      { powerMult: 1 },
      { nameVi: "Linh Khí Phá", powerMult: 1.3, mpCost: 4 },
      { nameVi: "Kim Đan Chân Khí", powerMult: 1.7, mpCost: 6 },
      { nameVi: "Nguyên Anh Khí Kình", powerMult: 2.2, mpCost: 9 },
      { nameVi: "Thần Thức Xạ", powerMult: 2.2, range: 10, mpCost: 12 },
      { nameVi: "Hư Không Chấn", powerMult: 2.4, range: 11, mpCost: 16, area: { shape: "circle", range: 2.5, at: "aim", maxTargets: 5, pct: 70 } },
    ],
  },
  waygate: { base: 500, perUnit: 40 },
  aoi: { enter: { x: 52, y: 32 }, leave: { x: 58, y: 36 }, everyTicks: 5 },
  bossSpawn: { chance: 0.001, pityKills: [500, 1500, 2500, 4000, 5500, 7000], pityDefault: 1500, flushEvery: 25 },
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
    hero: { perOrange: 20, perRed: 50, tier1: 200, tier2: 500, bonus1: { mpPct: 5, dropPct: 0 }, bonus2: { mpPct: 10, dropPct: 5 } },
    nameTiers: { yellowFrom: 1, orangeFrom: 201, redFrom: 501 },
    protectedBelow: { realm: 0, stage: 5 },
  },
  drops: {
    linh: { chance: { normal: 0.3, rare1: 1, rare2: 1 }, amountMult: { normal: 1, rare1: 4, rare2: 10 }, base: 2, growth: 1.1 },
    book: { normal: 0.003, rare1: 0.03, rare2: 0.08 },
    pill: {
      "0": { normal: 0.004, rare1: 0.04, rare2: 0.12 },
      "1": { normal: 0.0015, rare1: 0.02, rare2: 0.06 },
      "2": { normal: 0.0005, rare1: 0.008, rare2: 0.03 },
      "3": { normal: 0.0002, rare1: 0.004, rare2: 0.015 },
      "4": { normal: 0.0001, rare1: 0.002, rare2: 0.008 },
    },
    equip: {
      normal: { chance: 0.03, grades: [70, 25, 5, 0], overLevel: 0 },
      rare1: { chance: 0.15, grades: [45, 35, 17, 3], overLevel: 0.1 },
      rare2: { chance: 0.3, grades: [25, 35, 30, 10], overLevel: 0.25 },
    },
  },
  loot: { base: {
  normal: [
    { item: "linh_thao", chance: 0.12, min: 1, max: 2 },
    { item: "thu_cot", chance: 0.12, min: 1, max: 1 },
    { item: "hoi_huyet_dan", chance: 0.04, min: 1, max: 1 },
    { item: "duong_huyet_dan", chance: 0.03, min: 1, max: 1 },
  ],
  rare1: [
    { item: "yeu_dan", chance: 0.5, min: 1, max: 1 },
    { item: "linh_thao", chance: 0.5, min: 1, max: 3 },
    { item: "hoi_huyet_dan", chance: 0.2, min: 1, max: 2 },
    { item: "duong_huyet_dan", chance: 0.15, min: 1, max: 1 },
    { item: "ngo_dao_dan", chance: 0.05, min: 1, max: 1 },
  ],
  rare2: [
    { item: "yeu_dan", chance: 1, min: 1, max: 2 },
    { item: "linh_thao", chance: 0.8, min: 2, max: 4 },
    { item: "hoi_huyet_dan", chance: 0.5, min: 1, max: 3 },
    { item: "duong_huyet_dan", chance: 0.4, min: 1, max: 2 },
    { item: "ngo_dao_dan", chance: 0.25, min: 1, max: 1 },
  ],
}, realm: {
  2: {
    normal: [{ item: "linh_nguyen_dan", chance: 0.03, min: 1, max: 1 }],
    rare1: [{ item: "linh_nguyen_dan", chance: 0.15, min: 1, max: 2 }, { item: "bao_nguyen_dan", chance: 0.03, min: 1, max: 1 }, { item: "thien_ngo_dan", chance: 0.04, min: 1, max: 1 }],
    rare2: [{ item: "linh_nguyen_dan", chance: 0.4, min: 1, max: 3 }, { item: "bao_nguyen_dan", chance: 0.12, min: 1, max: 1 }, { item: "thien_ngo_dan", chance: 0.15, min: 1, max: 1 }],
  },
  3: {
    normal: [{ item: "linh_nguyen_dan", chance: 0.04, min: 1, max: 1 }, { item: "bao_nguyen_dan", chance: 0.01, min: 1, max: 1 }],
    rare1: [{ item: "linh_nguyen_dan", chance: 0.2, min: 1, max: 2 }, { item: "bao_nguyen_dan", chance: 0.08, min: 1, max: 1 }, { item: "thien_ngo_dan", chance: 0.06, min: 1, max: 1 }],
    rare2: [{ item: "linh_nguyen_dan", chance: 0.5, min: 1, max: 3 }, { item: "bao_nguyen_dan", chance: 0.25, min: 1, max: 2 }, { item: "thien_ngo_dan", chance: 0.25, min: 1, max: 1 }],
  },
  4: {
    normal: [{ item: "than_huyet_dan", chance: 0.03, min: 1, max: 1 }, { item: "than_linh_dan", chance: 0.015, min: 1, max: 1 }],
    rare1: [{ item: "than_huyet_dan", chance: 0.2, min: 1, max: 2 }, { item: "than_linh_dan", chance: 0.1, min: 1, max: 1 }, { item: "thien_ngo_dan", chance: 0.08, min: 1, max: 1 }],
    rare2: [{ item: "than_huyet_dan", chance: 0.5, min: 1, max: 3 }, { item: "than_linh_dan", chance: 0.3, min: 1, max: 2 }, { item: "thien_ngo_dan", chance: 0.3, min: 1, max: 1 }],
  },
  5: {
    normal: [{ item: "hu_huyet_dan", chance: 0.02, min: 1, max: 1 }, { item: "hu_linh_dan", chance: 0.01, min: 1, max: 1 }],
    rare1: [{ item: "hu_huyet_dan", chance: 0.15, min: 1, max: 2 }, { item: "hu_linh_dan", chance: 0.08, min: 1, max: 1 }, { item: "thien_ngo_dan", chance: 0.1, min: 1, max: 1 }],
    rare2: [{ item: "hu_huyet_dan", chance: 0.4, min: 1, max: 3 }, { item: "hu_linh_dan", chance: 0.25, min: 1, max: 2 }, { item: "thien_ngo_dan", chance: 0.35, min: 1, max: 1 }],
  },
} },
  kills: { base: 30, growth: 1.13 },
  itemValue: {
    items: {
      hoi_huyet_dan: 10,
      duong_huyet_dan: 25,
      dai_hoi_huyet_dan: 60,
      hoi_linh_dan: 10,
      dai_hoi_linh_dan: 60,
      linh_tuyen_dan: 400,
      bao_linh_dan: 1_500,
      ngo_dao_dan: 1500,
      linh_thao: 3,
      thu_cot: 3,
      yeu_dan: 40,
      ttp_town: 2_000,
      ttp_town2: 20_000,
      ttp_town3: 200_000,
      linh_nguyen_dan: 400,
      bao_nguyen_dan: 1_500,
      thien_ngo_dan: 7_500,
      than_huyet_dan: 4_000,
      than_linh_dan: 4_000,
      hu_huyet_dan: 25_000,
      hu_linh_dan: 25_000,
      book_realm_0: 200,
      book_realm_1: 2_000,
      book_realm_2: 15_000,
      book_realm_3: 80_000,
      book_realm_4: 300_000,
      book_realm_5: 1_000_000,
    },
    kinds: { weapon: 40, hat: 20, robe: 30, bracer: 20, ring: 25, jade: 25, necklace: 25, belt: 20, boots: 20, charm: 60, bonded: 150, flight: 150 },
    grades: [1, 2, 4, 8],
    levelStep: 0.6,
  },
  skills: {
    levelPower: [1, 1.15, 1.35, 1.6, 2],
    levelCooldown: [1, 1, 1, 0.9, 0.8],
    masteryNeeded: [50, 150, 400, 1000],
    pillPoints: 100,
    attackRealmScale: 0.5,
    healRealmScale: 0.1,
    buffRealmScale: 0.2,
    subFactor: 0.5,
  },
  theme: {
    realmColors: ["#8bc34a", "#4fc3f7", "#ffb300", "#e040fb", "#ff5252", "#e8f4ff"],
    gradeColors: ["rgba(158, 158, 158, 0.28)", "rgba(76, 175, 80, 0.3)", "rgba(66, 165, 245, 0.32)", "rgba(171, 71, 188, 0.34)", "rgba(255, 179, 0, 0.36)"],
    ui: {
      "ui-text": "#e8e4d8",
      "ui-border": "#3a4560",
      "ui-accent": "#d6a94b",
      "ui-on-accent": "#1b1405",
      "ui-highlight": "#ffd54a",
      "ui-muted": "#6b7a99",
      "ui-panel": "rgba(27, 33, 48, 0.96)",
      "ui-page": "#10141c",
    },
  },
  monsters: {
    species: {
    soi_rung: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 5, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1500, respawnMs: 15_000 },
    heo_rung: { hpMult: 1.6, attackMult: 1.2, defenseMult: 1.5, speed: 2.6, aggroRadius: 4, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1800, respawnMs: 20_000 },
    bao_dem: { hpMult: 1.2, attackMult: 1.4, defenseMult: 1, speed: 3.6, aggroRadius: 6, leashRadius: 9, attackRange: 1.3, attackCooldownMs: 1300, respawnMs: 25_000 },
    doi_u_minh: { hpMult: 1, attackMult: 1.2, defenseMult: 0.9, speed: 3.4, aggroRadius: 6, leashRadius: 8, attackRange: 1.3, attackCooldownMs: 1300, respawnMs: 15_000 },
    thi_quy: { hpMult: 1.8, attackMult: 1.3, defenseMult: 1.6, speed: 2.2, aggroRadius: 5, leashRadius: 8, attackRange: 1.4, attackCooldownMs: 2000, respawnMs: 20_000 },
    ve_binh: { hpMult: 3, attackMult: 2.5, defenseMult: 2, speed: 3, aggroRadius: 8, leashRadius: 12, attackRange: 1.4, attackCooldownMs: 1200, respawnMs: 60_000 },
    huyet_lang_vuong: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.6, attackCooldownMs: 1400, respawnMs: 0 },
    quy_vuong: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 2.8, aggroRadius: 7, leashRadius: 12, attackRange: 1.6, attackCooldownMs: 1500, respawnMs: 0 },
    hoa_dien_lang: { hpMult: 1, attackMult: 1.1, defenseMult: 1, speed: 3, aggroRadius: 6, leashRadius: 9, attackRange: 1.3, attackCooldownMs: 1400, respawnMs: 20_000 },
    nham_giap_thu: { hpMult: 1.8, attackMult: 1.2, defenseMult: 1.7, speed: 2.4, aggroRadius: 5, leashRadius: 8, attackRange: 1.4, attackCooldownMs: 1900, respawnMs: 25_000 },
    liet_hoa_xa: { hpMult: 1.3, attackMult: 1.5, defenseMult: 1.1, speed: 3.4, aggroRadius: 6, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1300, respawnMs: 25_000 },
    hoa_long_vuong: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.8, attackCooldownMs: 1400, respawnMs: 0 },
    bang_phong_hac: { hpMult: 1, attackMult: 1.2, defenseMult: 1, speed: 3.6, aggroRadius: 7, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1300, respawnMs: 20_000 },
    han_thi_ma: { hpMult: 1.9, attackMult: 1.3, defenseMult: 1.8, speed: 2.3, aggroRadius: 5, leashRadius: 8, attackRange: 1.5, attackCooldownMs: 2000, respawnMs: 25_000 },
    tuyet_yeu_hau: { hpMult: 1.4, attackMult: 1.6, defenseMult: 1.2, speed: 3.2, aggroRadius: 6, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1500, respawnMs: 25_000 },
    bang_hoang: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.8, attackCooldownMs: 1500, respawnMs: 0 },
    xich_thi: { hpMult: 1.4, attackMult: 1.5, defenseMult: 1.2, speed: 2.8, aggroRadius: 5, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1700, respawnMs: 25_000 },
    loi_van_ho: { hpMult: 1.1, attackMult: 1.3, defenseMult: 1, speed: 3.4, aggroRadius: 6, leashRadius: 9, attackRange: 1.4, attackCooldownMs: 1300, respawnMs: 25_000 },
    huyen_giap_quy: { hpMult: 2, attackMult: 1.2, defenseMult: 1.9, speed: 2.3, aggroRadius: 5, leashRadius: 8, attackRange: 1.5, attackCooldownMs: 2000, respawnMs: 25_000 },
    phong_loi_ung: { hpMult: 1, attackMult: 1.6, defenseMult: 1, speed: 3.8, aggroRadius: 7, leashRadius: 10, attackRange: 1.5, attackCooldownMs: 1400, respawnMs: 25_000 },
    loi_de_long: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.9, attackCooldownMs: 1400, respawnMs: 0 },
    hu_anh_bao: { hpMult: 1.2, attackMult: 1.5, defenseMult: 1, speed: 3.8, aggroRadius: 7, leashRadius: 10, attackRange: 1.4, attackCooldownMs: 1200, respawnMs: 25_000 },
    tinh_ha_cu_linh: { hpMult: 2.1, attackMult: 1.3, defenseMult: 2, speed: 2.2, aggroRadius: 5, leashRadius: 8, attackRange: 1.6, attackCooldownMs: 2000, respawnMs: 25_000 },
    hu_thien_ma_dieu: { hpMult: 1.1, attackMult: 1.7, defenseMult: 1.1, speed: 3.6, aggroRadius: 7, leashRadius: 10, attackRange: 1.5, attackCooldownMs: 1400, respawnMs: 25_000 },
    hon_don_ma_ton: { hpMult: 1, attackMult: 1, defenseMult: 1, speed: 3, aggroRadius: 7, leashRadius: 12, attackRange: 1.9, attackCooldownMs: 1500, respawnMs: 0 },
    },
    ranks: {
      normal: { chance: 0, hpMult: 1, attackMult: 1, defenseMult: 1, expMult: 1 },
      rare1: { chance: 0.08, hpMult: 1.8, attackMult: 1.2, defenseMult: 1.2, expMult: 2.5 },
      rare2: { chance: 0.02, hpMult: 3, attackMult: 1.5, defenseMult: 1.5, expMult: 5 },
    },
  },
  skillOverrides: {},
  exp: {
    realms: [
      { expBase: 1_000, pointsPerStage: 5 },
      { expBase: 20_000, pointsPerStage: 6 },
      { expBase: 400_000, pointsPerStage: 8 },
      { expBase: 8_000_000, pointsPerStage: 10 },
      { expBase: 160_000_000, pointsPerStage: 12 },
      { expBase: 3_200_000_000, pointsPerStage: 14 },
    ],
    stageGrowth: 1.35,
    lowMapMult: 1,
    overflowMax: 1,
  },
  breakthrough: {
    steps: [
      { maxPills: 2, baseRatePct: 70, maxRatePct: 90, durationMs: 60_000, cost: 5_000, basePoints: 10 },
      { maxPills: 3, baseRatePct: 60, maxRatePct: 80, durationMs: 180_000, cost: 50_000, basePoints: 16 },
      { maxPills: 3, baseRatePct: 50, maxRatePct: 70, durationMs: 600_000, cost: 500_000, basePoints: 24 },
      { maxPills: 3, baseRatePct: 45, maxRatePct: 65, durationMs: 600_000, cost: 5_000_000, basePoints: 32 },
      { maxPills: 3, baseRatePct: 40, maxRatePct: 60, durationMs: 600_000, cost: 50_000_000, basePoints: 40 },
    ],
    failExpLoss: 0.3,
    gradePointsMult: 2,
    constitutionPoints: 2,
    overflowFrom: 0.5,
    overflowFromBonus: 5,
    overflowMaxBonus: 15,
  },
  paths: { swapCostBase: 20_000, dropCostBase: 30_000 },
  combat: {
    deathExpLoss: 0.1,
    hpRegenDelayMs: 5000,
    mpRegenPerS: 0.02,
    mpRegenDelayMs: 5000,
    grayWindowMs: 3 * 60_000,
    deathDurabilityFraction: 0.05,
    monsterCurve: { hpBase: 60, hpPerLevel: 30, attackBase: 10, attackPerLevel: 3.2, defenseBase: 4, defensePerLevel: 2 },
  },
  stats: {
    maxHp: { base: 100, perCanCot: 15, perLevel: 25 },
    maxMp: { base: 50, perLinhLuc: 10, perLevel: 12 },
    attack: { base: 5, perLinhLuc: 2, perCanCot: 0.5, perLevel: 3 },
    defense: { base: 2, perCanCot: 1.5, perLevel: 2 },
    critRate: { base: 5, perThanThuc: 0.5 },
    dodgeRate: { perThanPhap: 0.5 },
    expBonus: { perNgoTinh: 1 },
    dropBonus: { perPhucDuyen: 0.5 },
    rateCap: 60,
  },
  roots: {
    grades: [
      { weight: 50, expBonusPct: -10, bonusPoints: 0, elementDamagePct: 0 },
      { weight: 30, expBonusPct: 5, bonusPoints: 1, elementDamagePct: 5 },
      { weight: 13, expBonusPct: 15, bonusPoints: 2, elementDamagePct: 10 },
      { weight: 5, expBonusPct: 30, bonusPoints: 4, elementDamagePct: 20 },
      { weight: 2, expBonusPct: 50, bonusPoints: 6, elementDamagePct: 30 },
    ],
    counts: [
      { weight: 20, expBonusPct: 10 },
      { weight: 48, expBonusPct: 0 },
      { weight: 25, expBonusPct: -15 },
      { weight: 5, expBonusPct: -30 },
      { weight: 2, expBonusPct: -40 },
    ],
  },
  pathBonuses: {
    kiem: { attackPct: 10, defensePct: 0, maxMpPct: 0, weaponSkillPct: 15, elementSkillPct: 0, potionHealPct: 0, masteryPct: 0 },
    thuat: { attackPct: 0, defensePct: 0, maxMpPct: 20, weaponSkillPct: 0, elementSkillPct: 12, potionHealPct: 0, masteryPct: 0 },
    dan: { attackPct: 0, defensePct: 8, maxMpPct: 0, weaponSkillPct: 0, elementSkillPct: 0, potionHealPct: 30, masteryPct: 25 },
  },
  boss: {
    claimTtlMs: 24 * 60 * 60 * 1000,
    tier: 9,
    species: { town: null, forest: "huyet_lang_vuong", cave: "quy_vuong", town2: null, kimdan: "hoa_long_vuong", nguyenanh: "bang_hoang", town3: null, hoathan: "loi_de_long", luyenhu: "hon_don_ma_ton" },
  },
  alchemy: DEFAULT_ALCHEMY,
  dojo: DEFAULT_DOJO,
  rareBooks: { chance: { normal: 0.00005, rare1: 0.0008, rare2: 0.003, boss: 0.02 } },
  outfits: { rules: [{ minRealm: 0, outfit: "ranger" }, { minRealm: 2, outfit: "tien" }] }, // Kim Đan robes and above: the white xianxia robe
  // Real species where a model exists: wolf (sói, lang), cat (báo), eagle (hạc), yeti (hầu), demon (quỷ vương), dino (heo), orc (thú giáp), ghost (hàn thi ma), snake (rắn). Stand-ins: the boss dragons use the dragon.
  monsterModels: {
    doi_u_minh: "bat",
    bang_phong_hac: "eagle",
    thi_quy: "skeleton",
    xich_thi: "skeleton",
    han_thi_ma: "ghost",
    quy_vuong: "demon",
    tuyet_yeu_hau: "yeti",
    hoa_long_vuong: "dragon",
    bang_hoang: "dragon",
    huyet_lang_vuong: "wolf",
    soi_rung: "wolf",
    heo_rung: "dino",
    bao_dem: "cat",
    hoa_dien_lang: "wolf",
    nham_giap_thu: "orc",
    liet_hoa_xa: "snake",
    loi_van_ho: "monkroose",
    huyen_giap_quy: "cactoro",
    phong_loi_ung: "birb",
    loi_de_long: "dragon2",
    hu_anh_bao: "ninja",
    tinh_ha_cu_linh: "mushking",
    hu_thien_ma_dieu: "alien",
    hon_don_ma_ton: "bluedemon",
  },
  flightLooks: { default: "sword", byElement: { moc: "lotus", thuy: "cloud", phong: "cloud", bang: "cloud", hoa: "sword", kim: "sword", loi: "sword", tho: "lotus" }, byRealm: { "4": "phoenix", "5": "dragon" } },
  auto: { radiusMin: 3, radiusMax: 40, radiusDefault: 20, tickMs: 350, giveUpMs: 6000, skipMs: 20_000, potionGapMs: 2500, castBackoffMs: 2500 },
  weaponReach: { kiem: 1.8, dao: 1.8, thuong: 3, riu: 1.7, cung: 7, quyen: 1.5, none: 1.6 },
  weaponArea: {
    kiem: { shape: "arc", range: 1.9, deg: 120, maxTargets: 3, pct: 70 },
    dao: { shape: "arc", range: 1.8, deg: 150, maxTargets: 3, pct: 70 },
    thuong: { shape: "line", range: 3.6, width: 1, maxTargets: 3, pct: 65 },
    riu: { shape: "circle", range: 1.7, at: "self", maxTargets: 4, pct: 60 },
    cung: { shape: "single", range: 0, maxTargets: 1, pct: 100 },
    quyen: { shape: "single", range: 0, maxTargets: 1, pct: 100 },
    none: { shape: "single", range: 0, maxTargets: 1, pct: 100 },
  },
  skillAreas: {
    tram: { shape: "arc", range: 6, deg: 90, maxTargets: 4, pct: 70 },
    chi: { shape: "line", range: 9, width: 0.9, maxTargets: 3, pct: 70 },
    ngu_kiem_tram: { shape: "circle", range: 1.8, at: "aim", maxTargets: 4, pct: 70 },
    pb: { shape: "circle", range: 1.5, at: "aim", maxTargets: 3, pct: 60 },
    bm: { shape: "circle", range: 2.5, at: "aim", maxTargets: 5, pct: 80 },
    kim_3: { shape: "line", range: 10, width: 1.2, maxTargets: 4, pct: 75 },
    kim_4: { shape: "circle", range: 4, at: "self", maxTargets: 6, pct: 80 },
    kim_5: { shape: "circle", range: 3, at: "aim", maxTargets: 6, pct: 80 },
    moc_3: { shape: "circle", range: 2, at: "aim", maxTargets: 4, pct: 70 },
    moc_4: { shape: "circle", range: 3, at: "aim", maxTargets: 6, pct: 28, zone: { ms: 7000, tickMs: 1000 } },
    moc_5: { shape: "circle", range: 4.5, at: "self", maxTargets: 7, pct: 85 },
    thuy_3: { shape: "line", range: 10, width: 1.2, maxTargets: 4, pct: 75 },
    thuy_4: { shape: "circle", range: 2.5, at: "aim", maxTargets: 5, pct: 75 },
    thuy_5: { shape: "circle", range: 3.5, at: "aim", maxTargets: 7, pct: 30, zone: { ms: 8000, tickMs: 1000 } },
    hoa_3: { shape: "line", range: 8, width: 1.6, maxTargets: 5, pct: 16, zone: { ms: 6000, tickMs: 600 } },
    hoa_4: { shape: "line", range: 11, width: 1.4, maxTargets: 5, pct: 80 },
    hoa_5: { shape: "circle", range: 3, at: "aim", maxTargets: 6, pct: 80 },
    tho_3: { shape: "circle", range: 2, at: "aim", maxTargets: 4, pct: 70 },
    tho_4: { shape: "circle", range: 4, at: "self", maxTargets: 6, pct: 80 },
    tho_5: { shape: "circle", range: 3.5, at: "aim", maxTargets: 7, pct: 30, zone: { ms: 8000, tickMs: 1000 } },
    loi_3: { shape: "line", range: 10, width: 1.2, maxTargets: 4, pct: 75 },
    loi_4: { shape: "circle", range: 4, at: "self", maxTargets: 6, pct: 80 },
    loi_5: { shape: "circle", range: 3, at: "aim", maxTargets: 6, pct: 80 },
    bang_3: { shape: "line", range: 10, width: 1.2, maxTargets: 4, pct: 75 },
    bang_4: { shape: "circle", range: 3, at: "aim", maxTargets: 6, pct: 28, zone: { ms: 7000, tickMs: 1000 } },
    bang_5: { shape: "circle", range: 4.5, at: "self", maxTargets: 7, pct: 85 },
    phong_3: { shape: "line", range: 10, width: 1.2, maxTargets: 4, pct: 75 },
    phong_4: { shape: "circle", range: 4, at: "self", maxTargets: 6, pct: 80 },
    phong_5: { shape: "circle", range: 3.5, at: "aim", maxTargets: 7, pct: 30, zone: { ms: 8000, tickMs: 1000 } },
    kim_6: { shape: "line", range: 12, width: 1.6, maxTargets: 6, pct: 85 },
    kim_7: { shape: "circle", range: 4, at: "aim", maxTargets: 8, pct: 85 },
    moc_6: { shape: "circle", range: 4, at: "aim", maxTargets: 7, pct: 30, zone: { ms: 8000, tickMs: 1000 } },
    moc_7: { shape: "circle", range: 5.5, at: "self", maxTargets: 8, pct: 90 },
    thuy_6: { shape: "circle", range: 5, at: "self", maxTargets: 7, pct: 85 },
    thuy_7: { shape: "circle", range: 4.5, at: "aim", maxTargets: 8, pct: 30, zone: { ms: 9000, tickMs: 1000 } },
    hoa_6: { shape: "circle", range: 4, at: "aim", maxTargets: 7, pct: 85 },
    hoa_7: { shape: "line", range: 12, width: 2, maxTargets: 7, pct: 18, zone: { ms: 7000, tickMs: 600 } },
    tho_6: { shape: "circle", range: 4.5, at: "aim", maxTargets: 8, pct: 30, zone: { ms: 9000, tickMs: 1000 } },
    tho_7: { shape: "circle", range: 5.5, at: "self", maxTargets: 8, pct: 90 },
    loi_6: { shape: "line", range: 12, width: 1.6, maxTargets: 6, pct: 85 },
    loi_7: { shape: "circle", range: 5.5, at: "self", maxTargets: 8, pct: 90 },
    bang_6: { shape: "circle", range: 4, at: "aim", maxTargets: 7, pct: 30, zone: { ms: 8000, tickMs: 1000 } },
    bang_7: { shape: "circle", range: 5.5, at: "self", maxTargets: 8, pct: 90 },
    phong_6: { shape: "circle", range: 5, at: "self", maxTargets: 7, pct: 85 },
    phong_7: { shape: "line", range: 12, width: 2, maxTargets: 7, pct: 85 },
    kt_kiem_khi: { shape: "line", range: 9, width: 1.2, maxTargets: 4, pct: 70 },
    kt_kiem_y: { shape: "line", range: 10, width: 1.4, maxTargets: 5, pct: 75 },
    kt_than_kiem: { shape: "line", range: 12, width: 2, maxTargets: 6, pct: 85 },
    kt_lien_hoan: { shape: "circle", range: 3, at: "self", maxTargets: 5, pct: 70 },
    tt_phap_tran: { shape: "circle", range: 3, at: "aim", maxTargets: 5, pct: 26, zone: { ms: 6000, tickMs: 1000 } },
    tt_dai_phap: { shape: "circle", range: 4.5, at: "self", maxTargets: 7, pct: 85 },
  },
  skillLooks: {
    chuong: "palm", tram: "slash", chi: "finger", ngu_kiem_tram: "sword", pb: "orb", bm: "great",
    thuan: "dome", cuong_luc: "flames", phong_bo: "wind", cuong_than: "flames", cuong_than_na: "flames", ho_the_kd: "bell", bm_ho_the: "bell",
    tt_linh_an: "seal", tt_linh_hai: "seal", kt_hop_nhat: "sword", dt_duong_nguyen: "furnace", dt_dan_khi: "furnace", dt_kim_than: "bell", pt_phong_than: "wind",
    kim_3: "lance", kim_4: "nova", moc_4: "field", moc_5: "nova", thuy_3: "lance", thuy_5: "field", hoa_3: "lane", hoa_4: "lance", tho_4: "nova", tho_5: "field", loi_3: "lance", loi_4: "nova", bang_3: "lance", bang_4: "field", bang_5: "nova", phong_3: "lance", phong_4: "nova", phong_5: "field", kt_kiem_khi: "lance", kt_kiem_y: "lance", kt_than_kiem: "lance", kt_lien_hoan: "nova", tt_phap_tran: "field", tt_dai_phap: "nova",
    khi_co_ban: "bolt",
    hap_huyet: "drain", bao_kich: "flames", diet_ky: "shock", loi_van: "storm", thien_thach: "meteor", huyet_hai: "drain",
    thon_linh: "drain", pha_quan: "shock", huyet_ma: "drain", cuong_loi: "storm", thien_co: "shock", hap_tinh: "drain", loi_dinh: "storm", cuu_u: "drain", thai_co: "meteor", doat_menh: "shock", hon_don: "nova", vo_thuong: "flames",
    kim_6: "lance", kim_7: "nova", moc_6: "field", moc_7: "nova", thuy_6: "nova", thuy_7: "field", hoa_6: "nova", hoa_7: "lane", tho_6: "field", tho_7: "nova", loi_6: "lance", loi_7: "nova", bang_6: "field", bang_7: "nova", phong_6: "nova", phong_7: "lance",
    ho_the_ht: "bell", ho_the_lh: "bell", chien_y_ht: "flames", chien_y_lh: "flames", hoi_than_ht: "lotus", hoi_nguyen_lh: "lotus",
    hoi: "lotus", hoi_nguyen_kd: "lotus", tt_hoi_linh: "lotus", bm_hoi_sinh: "phoenix", dt_hoi_xuan: "furnace", dt_hoi_duong: "furnace", dt_dai_hoi: "furnace",
  },
  iconLooks: { items: {}, skills: {}, kinds: {} },
  monsterTints: { kim: "#ffe27a", moc: "#8fe08f", thuy: "#7ab8ff", hoa: "#ff8a6a", tho: "#d2a878", loi: "#b89cff", bang: "#a4f0ff", phong: "#a6ebd9" },
  mapArt: {
    maps: {
      town: { ground: "grass", obstacle: "tree", mix: ["tree", "tree", "tree", "bamboo", "bamboo", "bush", "lantern", "rock"] },
      forest: { ground: "grass", obstacle: "tree", mix: ["tree", "tree", "tree", "bamboo", "bamboo", "bush", "stump", "boulder"] },
      cave: { ground: "stone", obstacle: "pillar", mix: ["pillar", "pillar", "boulder", "jade", "jade", "rock"] },
      town2: { ground: "stone", obstacle: "rock", mix: ["rock", "lantern", "boulder", "pillar", "jade", "bamboo"] },
      kimdan: { ground: "lava", obstacle: "rock", mix: ["ember", "ember", "rock", "boulder", "pillar"] },
      nguyenanh: { ground: "snow", obstacle: "crystal", mix: ["crystal", "crystal", "jade", "boulder", "pillar"] },
      town3: { ground: "stone", obstacle: "rock", mix: ["rock", "lantern", "jade", "pillar", "crystal", "bamboo"] },
      hoathan: { ground: "stone", obstacle: "crystal", mix: ["crystal", "pillar", "boulder", "jade", "rock"] },
      luyenhu: { ground: "stone", obstacle: "crystal", mix: ["crystal", "crystal", "pillar", "jade", "boulder"] },
    },
  },
  // Xianxia robes for everyone: the white robe `tien`, one colour each by tint, a formation circle in the same colour under the feet.
  npcLooks: {
    byKind: {
      merchant: { body: "male", outfit: "tien", tint: "#f0d890", aura: "#e6c35a" },
      quest: { body: "female", outfit: "tien", tint: "#cfe0ff", aura: "#9fc4ff" },
      smith: { body: "male", outfit: "tien", weapon: "riu", tint: "#ffc09a", aura: "#ff8a3a" },
      alchemist: { body: "female", outfit: "tien", tint: "#bff0c8", aura: "#7dff9c" },
      master: { body: "male", outfit: "ranger", weapon: "kiem", tint: "#e6b8a0", aura: "#e0563a" },
      guard: { body: "male", outfit: "tien", weapon: "thuong", scale: 1.5, tint: "#7f93c4", aura: "#e6c35a" },
    },
    byId: {
      elder: { body: "male", outfit: "tien", tint: "#fff0c0", aura: "#ffe58a" },
      path_kiem: { body: "male", outfit: "tien", weapon: "kiem", tint: "#bfe4ff", aura: "#9fe0ff" },
      path_thuat: { body: "female", outfit: "tien", tint: "#dccbff", aura: "#b99bff" },
      path_dan: { body: "female", outfit: "tien", tint: "#c6f5c6", aura: "#7dff9c" },
    },
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
  gearLooks: "Màu trang bị trên nhân vật: màu vũ khí theo hệ, bảng màu áo, mũ, giày theo từng bộ",
  basicSkill: "Phóng Khí (kỹ năng thay đòn đánh thường) theo cảnh giới: tên, hệ số sát thương, tầm, linh lực, vùng sát thương",
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
  loot: "Bảng rơi vật phẩm: các dòng theo loại quái cho mọi bản đồ, và dòng thêm theo cảnh giới của bản đồ",
  kills: "Số quái cùng bậc cần giết để lên một tầng (và EXP quái suy ra từ đó)",
  itemValue: "Giá trị vật phẩm: vật phẩm thường, trang bị theo loại, phẩm và cấp",
  skills: "Kỹ năng: sức mạnh và hồi chiêu theo cấp thuần thục, điểm thuần thục, hệ số theo cảnh giới",
  theme: "Màu giao diện: màu cảnh giới, màu nền phẩm cấp và bảng màu chung của trang",
  monsters: "Loài quái (hệ số HP, công, thủ, tốc độ, tầm, hồi sinh) và các hạng quái (xác suất, hệ số, EXP)",
  skillOverrides: "Chỉnh từng kỹ năng theo mã hoặc theo mẫu: tên, mô tả, sức mạnh, MP, hồi chiêu, tầm, thời gian buff, hiệu ứng",
  exp: "EXP mỗi cảnh giới, điểm tiềm năng mỗi tầng, tăng trưởng theo tầng, EXP săn bản đồ thấp, mức tràn",
  breakthrough: "Đột phá: đan tối đa, tỉ lệ, thời gian, chi phí, điểm; mất EXP khi thất bại, thưởng tràn",
  paths: "Hướng tu: phí đổi chủ tu và phí bỏ hướng",
  combat: "Chiến đấu: mất EXP khi chết, hồi HP/MP, cửa sổ tên xám, hao độ bền cơ bản, đường cong chỉ số quái",
  stats: "Chỉ số chiến đấu từ chỉ số gốc và cấp: sinh lực, linh lực, công, thủ, chí mạng, né, EXP, rơi đồ",
  roots: "Linh căn: tỉ lệ và thưởng theo phẩm cấp và theo số hệ",
  pathBonuses: "Thưởng chỉ số của từng hướng tu (khi là chủ tu)",
  boss: "Boss bản đồ: thời hạn giữ, bậc trả thưởng, loài của từng bản đồ",
  rareBooks: "Bí tịch tuyệt học chỉ rơi từ quái: xác suất mỗi lần hạ quái theo loại quái, và mỗi vòng thưởng của boss",
  dojo: "Võ Sư dạy bí tịch: mỗi võ sư dạy kỹ năng nào và giá học (Linh Thạch)",
  alchemy: "Luyện đan của Đan Sư: số mẻ luyện cùng lúc và các công thức",
  outfits: "Trang phục hiện trên nhân vật theo cảnh giới của áo đang mặc",
  flightLooks: "Hình pháp bảo phi hành dưới chân người bay (kiếm, mây, sen), theo hệ của món đang dùng",
  auto: "Giới hạn của Auto đánh quái: phạm vi tối thiểu, tối đa, mặc định (ô), nhịp ra lệnh (ms), thời gian bỏ một con đánh mãi không trúng, nghỉ giữa hai lần uống đan, nghỉ sau khi kỹ năng báo lỗi",
  weaponReach: "Tầm đánh thường theo họ vũ khí (ô): nhân vật đứng cách mục tiêu tối đa chừng này rồi mới ra đòn (cung bắn từ xa, thương dài hơn kiếm)",
  weaponArea: "Vùng chém của đánh thường theo họ vũ khí: quái gần mục tiêu trong vùng cũng bị đánh",
  skillAreas: "Vùng sát thương của kỹ năng tấn công: hình quạt, đường thẳng hay vòng tròn, số mục tiêu tối đa, phần sát thương của mục tiêu phụ",
  skillLooks: "Kiểu hình ảnh của từng kỹ năng (theo mã, mẫu hoặc họ pháp bảo)",
  iconLooks: "Biểu tượng chọn riêng cho vật phẩm, kỹ năng hoặc cả một loại trang bị (chọn từ các hình có sẵn)",
  monsterTints: "Màu phủ lên hình quái theo hệ (một mô hình trông khác nhau ở mỗi hệ)",
  monsterModels: "Hình quái: loài quái nào dùng mô hình nào (một mô hình có thể dùng chung cho nhiều loài)",
  mapArt: "Hình bản đồ: kiểu nền và kiểu vật cản nhỏ (cây, đá, cột, tinh thể) của từng bản đồ",
  npcLooks: "Hình NPC: thân nam hoặc nữ, trang phục và vũ khí, theo mã NPC hoặc theo loại NPC",
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

function validHeroEtc(v: Record<string, unknown>): boolean {
  const h = v.hero;
  const nt = v.nameTiers;
  const pb = v.protectedBelow;
  const bonus = (b: unknown) => obj(b) && num(b.mpPct, 0, 1000) && num(b.dropPct, 0, 1000);
  return (
    obj(h) &&
    num(h.perOrange, 0, 100_000) &&
    num(h.perRed, 0, 100_000) &&
    num(h.tier1, 0, 1_000_000) &&
    num(h.tier2, 0, 1_000_000) &&
    (h.tier2 as number) >= (h.tier1 as number) &&
    bonus(h.bonus1) &&
    bonus(h.bonus2) &&
    obj(nt) &&
    int(nt.yellowFrom, 1, 1_000_000) &&
    int(nt.orangeFrom, 1, 1_000_000) &&
    int(nt.redFrom, 1, 1_000_000) &&
    (nt.yellowFrom as number) < (nt.orangeFrom as number) &&
    (nt.orangeFrom as number) < (nt.redFrom as number) &&
    obj(pb) &&
    int(pb.realm, 0, 20) &&
    int(pb.stage, 1, 9)
  );
}

const PATH_BONUS_KEYS = ["attackPct", "defensePct", "maxMpPct", "weaponSkillPct", "elementSkillPct", "potionHealPct", "masteryPct"] as const;

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
        value.linhBase.length >= 4 &&
        value.linhBase.length <= 20 &&
        value.linhBase.every((n) => int(n, 0, 1_000_000_000)) &&
        num(value.maxPityPct, 0, 100)
      );
    case "bossCone":
      return num(value.power, 0, 100) && int(value.cdMs, 0, 3_600_000) && num(value.below, 0, 1) && num(value.range, 0, 50) && num(value.halfAngleDeg, 0, 180);
    case "bossRegen":
      return num(value.perSecond, 0, 1);
    case "gearLooks": {
      const color = (c: unknown): boolean => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
      const list = (a: unknown): boolean => Array.isArray(a) && a.length >= 1 && a.length <= 64 && a.every(color);
      return obj(value.weapon) && Object.entries(value.weapon).every(([k, v]) => /^[a-z]{2,8}$/.test(k) && color(v)) && list(value.robe) && list(value.hat) && list(value.boots);
    }
    case "basicSkill": {
      const r = value.realms;
      return (
        Array.isArray(r) &&
        r.length >= 1 &&
        r.length <= 20 &&
        r.every(
          (e) =>
            obj(e) &&
            num(e.powerMult, 0.1, 100) &&
            (e.nameVi === undefined || (typeof e.nameVi === "string" && e.nameVi.length >= 1 && e.nameVi.length <= 40)) &&
            (e.range === undefined || num(e.range, 1, 30)) &&
            (e.mpCost === undefined || int(e.mpCost, 0, 10_000)) &&
            (e.area === undefined || (obj(e.area) && (e.area.shape === "single" || e.area.shape === "arc" || e.area.shape === "line" || e.area.shape === "circle") && num(e.area.range, 0, 20) && (e.area.deg === undefined || num(e.area.deg, 1, 360)) && (e.area.width === undefined || num(e.area.width, 0.1, 10)) && (e.area.at === undefined || e.area.at === "self" || e.area.at === "aim") && int(e.area.maxTargets, 1, 20) && num(e.area.pct, 1, 300))),
        )
      );
    }
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
    case "loot": {
      const lines = (v: unknown): boolean =>
        Array.isArray(v) && v.length <= 40 && v.every((l) => obj(l) && typeof l.item === "string" && /^[a-z0-9_.]{1,60}$/.test(l.item) && num(l.chance, 0, 1) && int(l.min, 0, 999) && int(l.max, 0, 999) && (l.max as number) >= (l.min as number));
      const ranks = (r: unknown): boolean => obj(r) && lines(r.normal) && lines(r.rare1) && lines(r.rare2);
      return ranks(value.base) && obj(value.realm) && Object.entries(value.realm).every(([k, r]) => /^\d{1,2}$/.test(k) && ranks(r));
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
        int(value.pillPoints, 0, 1_000_000) &&
        num(value.attackRealmScale, 0, 10) &&
        num(value.healRealmScale, 0, 10) &&
        num(value.buffRealmScale, 0, 10) &&
        num(value.subFactor, 0, 1)
      );
    }
    case "monsters": {
      const sp = value.species;
      const rk = value.ranks;
      if (!obj(sp) || !obj(rk)) return false;
      const speciesOk = Object.entries(sp).every(
        ([id, v]) =>
          /^[a-z0-9_]{1,40}$/.test(id) &&
          obj(v) &&
          (v.nameVi === undefined || (typeof v.nameVi === "string" && v.nameVi.trim().length >= 1 && v.nameVi.length <= 60)) &&
          num(v.hpMult, 0.01, 1000) &&
          num(v.attackMult, 0.01, 1000) &&
          num(v.defenseMult, 0.01, 1000) &&
          num(v.speed, 0.1, 20) &&
          num(v.aggroRadius, 0, 50) &&
          num(v.leashRadius, 0, 100) &&
          num(v.attackRange, 0.5, 20) &&
          int(v.attackCooldownMs, 100, 600_000) &&
          int(v.respawnMs, 0, 86_400_000),
      );
      const rankOk = ["normal", "rare1", "rare2"].every((r) => {
        const v = rk[r];
        return obj(v) && num(v.chance, 0, 1) && num(v.hpMult, 0.01, 1000) && num(v.attackMult, 0.01, 1000) && num(v.defenseMult, 0.01, 1000) && num(v.expMult, 0, 1000);
      });
      return speciesOk && rankOk && num((rk.rare1 as { chance: number }).chance + (rk.rare2 as { chance: number }).chance, 0, 1);
    }
    case "skillOverrides":
      // Structural only (the whole group is valid or not): which skills exist and which fields fit a kind of skill are checked where an admin saves.
      return Object.entries(value).every(
        ([id, v]) =>
          /^[a-z0-9_]{1,40}$/.test(id) &&
          obj(v) &&
          Object.keys(v).every((k) => ["power", "mpCost", "cooldownMs", "range", "nameVi", "descVi", "buffDurationMs", "fx"].includes(k)) &&
          (v.power === undefined || num(v.power, 0, 1000)) &&
          (v.mpCost === undefined || int(v.mpCost, 0, 100_000)) &&
          (v.cooldownMs === undefined || int(v.cooldownMs, 0, 3_600_000)) &&
          (v.range === undefined || num(v.range, 0, 100)) &&
          (v.nameVi === undefined || (typeof v.nameVi === "string" && v.nameVi.trim().length >= 1 && v.nameVi.length <= 60)) &&
          (v.descVi === undefined || (typeof v.descVi === "string" && v.descVi.trim().length >= 1 && v.descVi.length <= 300)) &&
          (v.buffDurationMs === undefined || int(v.buffDurationMs, 0, 3_600_000)) &&
          (v.fx === undefined || v.fx === "melee" || v.fx === "ranged"),
      );
    case "exp": {
      const realms = value.realms;
      return (
        Array.isArray(realms) &&
        realms.length >= 4 &&
        realms.length <= 20 &&
        realms.every((r) => obj(r) && int(r.expBase, 1, 1_000_000_000_000) && int(r.pointsPerStage, 0, 10_000)) &&
        num(value.stageGrowth, 1, 10) &&
        num(value.lowMapMult, 0, 10) &&
        num(value.overflowMax, 0, 10)
      );
    }
    case "breakthrough": {
      const steps = value.steps;
      return (
        Array.isArray(steps) &&
        steps.length >= 3 &&
        steps.length <= 20 &&
        steps.every(
          (s) => obj(s) && int(s.maxPills, 1, 20) && num(s.baseRatePct, 0, 100) && num(s.maxRatePct, 0, 100) && (s.maxRatePct as number) >= (s.baseRatePct as number) && int(s.durationMs, 0, 86_400_000) && int(s.cost, 0, 1_000_000_000) && int(s.basePoints, 0, 10_000),
        ) &&
        num(value.failExpLoss, 0, 1) &&
        num(value.gradePointsMult, 0, 100) &&
        num(value.constitutionPoints, 0, 100) &&
        num(value.overflowFrom, 0, 1) &&
        num(value.overflowFromBonus, 0, 100) &&
        num(value.overflowMaxBonus, 0, 100)
      );
    }
    case "combat": {
      const c = value.monsterCurve;
      return (
        num(value.deathExpLoss, 0, 1) &&
        int(value.hpRegenDelayMs, 0, 600_000) &&
        num(value.mpRegenPerS, 0, 1) &&
        int(value.mpRegenDelayMs, 0, 600_000) &&
        int(value.grayWindowMs, 0, 86_400_000) &&
        num(value.deathDurabilityFraction, 0, 1) &&
        obj(c) &&
        ["hpBase", "hpPerLevel", "attackBase", "attackPerLevel", "defenseBase", "defensePerLevel"].every((k) => num(c[k], 0, 1_000_000))
      );
    }
    case "stats": {
      const part = (v: unknown, keys: string[]) => obj(v) && keys.every((k) => num(v[k], 0, 100_000));
      return (
        part(value.maxHp, ["base", "perCanCot", "perLevel"]) &&
        part(value.maxMp, ["base", "perLinhLuc", "perLevel"]) &&
        part(value.attack, ["base", "perLinhLuc", "perCanCot", "perLevel"]) &&
        part(value.defense, ["base", "perCanCot", "perLevel"]) &&
        part(value.critRate, ["base", "perThanThuc"]) &&
        part(value.dodgeRate, ["perThanPhap"]) &&
        part(value.expBonus, ["perNgoTinh"]) &&
        part(value.dropBonus, ["perPhucDuyen"]) &&
        num(value.rateCap, 0, 100)
      );
    }
    case "roots": {
      const grades = value.grades;
      const counts = value.counts;
      return (
        Array.isArray(grades) &&
        grades.length === 5 &&
        grades.every((g) => obj(g) && num(g.weight, 0, 1000) && num(g.expBonusPct, -100, 1000) && int(g.bonusPoints, 0, 1000) && num(g.elementDamagePct, 0, 1000)) &&
        grades.some((g) => (g as { weight: number }).weight > 0) &&
        Array.isArray(counts) &&
        counts.length === 5 &&
        counts.every((c) => obj(c) && num(c.weight, 0, 1000) && num(c.expBonusPct, -100, 1000)) &&
        counts.some((c) => (c as { weight: number }).weight > 0)
      );
    }
    case "pathBonuses":
      return (
        Object.keys(value).length >= 1 &&
        Object.entries(value).every(([id, b]) => /^[a-z0-9_]{1,24}$/.test(id) && obj(b) && PATH_BONUS_KEYS.every((k) => num(b[k], 0, 1000)))
      );
    case "paths":
      return int(value.swapCostBase, 0, 1_000_000_000) && int(value.dropCostBase, 0, 1_000_000_000);
    case "mapArt":
      return obj(value.maps) && Object.keys(value.maps).length <= 100 && Object.entries(value.maps).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && obj(v) && (GROUND_STYLES as readonly unknown[]).includes(v.ground) && (OBSTACLE_STYLES as readonly unknown[]).includes(v.obstacle) && (v.mix === undefined || (Array.isArray(v.mix) && v.mix.length >= 1 && v.mix.length <= 12 && v.mix.every((s) => (OBSTACLE_STYLES as readonly unknown[]).includes(s)))));
    case "npcLooks": {
      const look = (v: unknown): boolean => obj(v) && (v.body === "male" || v.body === "female") && (v.outfit === undefined || (typeof v.outfit === "string" && /^[a-z]{1,16}$/.test(v.outfit))) && (v.weapon === undefined || (typeof v.weapon === "string" && /^[a-z]{1,16}$/.test(v.weapon))) && (v.scale === undefined || num(v.scale, 0.5, 3)) && (v.tint === undefined || (typeof v.tint === "string" && /^#[0-9a-fA-F]{6}$/.test(v.tint))) && (v.aura === undefined || (typeof v.aura === "string" && /^#[0-9a-fA-F]{6}$/.test(v.aura)));
      const table = (t: unknown): boolean => obj(t) && Object.keys(t).length <= 100 && Object.entries(t).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && look(v));
      return table(value.byKind) && table(value.byId);
    }
    case "flightLooks": {
      const styles = (m: unknown): boolean => m === undefined || (obj(m) && Object.keys(m).length <= 40 && Object.entries(m).every(([k, v]) => /^[a-z0-9_]{1,16}$/.test(k) && (FLIGHT_STYLES as readonly unknown[]).includes(v)));
      return (FLIGHT_STYLES as readonly unknown[]).includes(value.default) && styles(value.byElement) && styles(value.byRealm);
    }
    case "auto":
      return (
        int(value.radiusMin, 1, 60) &&
        int(value.radiusMax, 1, 60) &&
        (value.radiusMin as number) <= (value.radiusMax as number) &&
        int(value.radiusDefault, value.radiusMin as number, value.radiusMax as number) &&
        int(value.tickMs, 150, 2000) &&
        int(value.giveUpMs, 1000, 60_000) &&
        int(value.skipMs, 1000, 300_000) &&
        int(value.potionGapMs, 500, 30_000) &&
        int(value.castBackoffMs, 500, 30_000)
      );
    case "weaponReach":
      return Object.keys(value).length <= 20 && Object.entries(value).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && num(v, 0.5, 20));
    case "weaponArea":
    case "skillAreas": {
      const area = (a: unknown): boolean =>
        obj(a) &&
        (a.shape === "single" || a.shape === "arc" || a.shape === "line" || a.shape === "circle") &&
        num(a.range, 0, 20) &&
        (a.deg === undefined || num(a.deg, 1, 360)) &&
        (a.width === undefined || num(a.width, 0.1, 10)) &&
        (a.at === undefined || a.at === "self" || a.at === "aim") &&
        int(a.maxTargets, 1, 20) &&
        num(a.pct, 1, 300) &&
        (a.zone === undefined || (obj(a.zone) && int(a.zone.ms, 500, 30_000) && int(a.zone.tickMs, 200, 5000)));
      return Object.keys(value).length <= 300 && Object.entries(value).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && area(v));
    }
    case "skillLooks":
      return Object.keys(value).length <= 300 && Object.entries(value).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && typeof v === "string" && (SKILL_LOOKS as readonly string[]).includes(v));
    case "iconLooks": {
      const table = (t: unknown, key: RegExp): boolean => obj(t) && Object.keys(t).length <= 2000 && Object.entries(t).every(([k, v]) => key.test(k) && (ICON_PICKABLE as readonly unknown[]).includes(v));
      return table(value.items, /^[A-Za-z0-9_.]{1,80}$/) && table(value.skills, /^[a-z0-9_]{1,24}$/) && table(value.kinds, /^[a-z]{1,24}(\.[a-z_]{1,24})?$/);
    }
    case "monsterTints":
      return Object.keys(value).length <= 20 && Object.entries(value).every(([k, v]) => /^[a-z]{1,16}$/.test(k) && typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v));
    case "monsterModels":
      return Object.keys(value).length <= 100 && Object.entries(value).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && typeof v === "string" && /^[a-z0-9]{1,16}$/.test(v));
    case "outfits":
      return Array.isArray(value.rules) && value.rules.length <= 20 && value.rules.every((r) => obj(r) && int(r.minRealm, 0, 99) && typeof r.outfit === "string" && /^[a-z]{1,16}$/.test(r.outfit));
    case "alchemy":
      return validAlchemy(value);
    case "dojo":
      return validDojo(value);
    case "rareBooks": {
      const c = value.chance;
      return obj(c) && (["normal", "rare1", "rare2", "boss"] as const).every((k) => num(c[k], 0, 1));
    }
    case "boss": {
      const sp = value.species;
      return int(value.claimTtlMs, 60_000, 30 * 86_400_000) && int(value.tier, 1, 9) && obj(sp) && Object.entries(sp).every(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && (v === null || (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v))));
    }
    case "theme": {
      const color = (c: unknown) => typeof c === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]+\)|hsla?\([0-9 ,.%deg]+\))$/.test(c.trim());
      const colors = (a: unknown, n: number, max = n) => Array.isArray(a) && a.length >= n && a.length <= max && a.every(color);
      const ui = value.ui;
      return colors(value.realmColors, 4, 20) && colors(value.gradeColors, 5) && obj(ui) && Object.entries(ui).every(([k, v]) => /^[a-z][a-z0-9-]{0,30}$/.test(k) && color(v));
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
        tiers(value.deathDurability) &&
        validHeroEtc(value)
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
/**
 * A group stored before a realm was added is short: the realm lists lack the new realms. The shape is still valid, so the tail of the list is taken from
 * the defaults (what an admin has set is never touched). The keyed tables (boss species, drops, item values) are completed by migration 0055: a missing key there
 * can mean "none", so the code does not fill it in.
 */
function padStale(next: Tuning): void {
  const tail = <T>(live: T[], def: readonly T[]): void => {
    for (let i = live.length; i < def.length; i++) live.push(clone(def[i]!));
  };
  tail(next.exp.realms, DEFAULT_TUNING.exp.realms);
  tail(next.theme.realmColors, DEFAULT_TUNING.theme.realmColors);
  tail(next.enhanceCost.linhBase, DEFAULT_TUNING.enhanceCost.linhBase);
  tail(next.bossSpawn.pityKills, DEFAULT_TUNING.bossSpawn.pityKills);
  tail(next.breakthrough.steps, DEFAULT_TUNING.breakthrough.steps);
}

/** Whether a stored group is shorter than the default in a realm list (it was saved before the last realms were added); `padStale` completes it in memory. */
export function lacksRealms(group: string, value: unknown): boolean {
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : Infinity);
  const v = value as Record<string, unknown> | null;
  if (typeof v !== "object" || v === null) return false;
  switch (group) {
    case "exp":
      return len(v.realms) < DEFAULT_TUNING.exp.realms.length;
    case "theme":
      return len(v.realmColors) < DEFAULT_TUNING.theme.realmColors.length;
    case "breakthrough":
      return len(v.steps) < DEFAULT_TUNING.breakthrough.steps.length;
    case "enhanceCost":
      return len(v.linhBase) < DEFAULT_TUNING.enhanceCost.linhBase.length;
    case "bossSpawn":
      return len(v.pityKills) < DEFAULT_TUNING.bossSpawn.pityKills.length;
    default:
      return false;
  }
}

export function setTuning(rows: Readonly<Record<string, unknown>> | null | undefined): void {
  const next = clone(DEFAULT_TUNING);
  for (const group of TUNING_GROUPS) {
    const v = rows?.[group];
    if (v !== undefined && validTuningGroup(group, v)) (next as unknown as Record<string, unknown>)[group] = clone(v);
  }
  padStale(next);
  live = next;
  liveGeneration++;
}

/** Back to the defaults (tests). */
export function resetTuning(): void {
  setTuning(null);
}

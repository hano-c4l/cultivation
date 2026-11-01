/**
 * Sects, the players' own (docs/PHASE5.md, 5c). The numbers are the tuning group `sect`; this file also holds the roles and what the sect window shows.
 * It has no imports on purpose (the tuning defaults are built from it).
 */

/** Lowest to highest. A rank is the index; the sect keeps it as a number so SQL can compare it. */
export const SECT_ROLES = ["disciple", "inner", "elite", "elder", "deputy", "leader"] as const;
export type SectRole = (typeof SECT_ROLES)[number];

export const SECT_RANK: Readonly<Record<SectRole, number>> = { disciple: 0, inner: 1, elite: 2, elder: 3, deputy: 4, leader: 5 };

/** The roles the leader gives by hand. The ones in between are earned from contribution (5c-2). */
export const SECT_APPOINTABLE: readonly SectRole[] = ["disciple", "elder", "deputy"];

export const roleOfRank = (rank: number): SectRole => SECT_ROLES[Math.min(Math.max(0, Math.floor(rank)), SECT_ROLES.length - 1)] as SectRole;

export interface SectLevelCfg {
  /** The most members at this level. */
  maxMembers: number;
  /** The sect exp needed to go on to the next level (0 at the last level). */
  expNeed: number;
  /** The Linh Thạch from the sect's fund that going on to the next level costs. */
  costLinh: number;
  /** The items from the sect's warehouse (not the ones on the shelf) that going on to the next level uses up. */
  costItems: Array<{ item: string; qty: number }>;
}

/** A daily task of the sect: a member hands in items at the sect NPC and the sect and the member are paid (mining, hunting and the rest are the items they bring back). */
export interface SectTask {
  id: string;
  /** What kind of work it stands for (a label: mine, hunt, forge, alchemy, gather). */
  kind: string;
  name: string;
  item: string;
  qty: number;
  /** How many times a member can do it a day (Việt Nam time). */
  perDay: number;
  minLevel: number;
  /**
   * Makes the task able to come up as a KILL count instead of the hand-in: each Việt Nam day, `pct` percent of the (member, task, day) draws are kill days (see `sectTaskMode`).
   * On a kill day the member has to kill `count` monsters (`rare`: only rare ones; `map`: only on that map) before handing in, and `item` and `qty` are not used.
   */
  kill?: { count: number; pct: number; rare?: boolean; map?: string };
  reward: {
    /** Cống hiến for the member, and kinh nghiệm for the sect. */
    contribution: number;
    exp: number;
    /** Linh Thạch the SYSTEM adds to the fund (scaled by `balance.incomePct`, and capped per day by `taskIncomeCap`). */
    fundLinh: number;
    /** Linh Thạch the member is paid out of the fund. */
    memberLinh: number;
    /** Items the system puts in the warehouse (scaled by `balance.incomePct`; none past the day's cap or in a full warehouse). */
    vault?: { item: string; qty: number };
  };
}

export interface SectVaultCfg {
  /** How many stacks the warehouse holds, by sect level (index = level - 1; a level past the table uses the last). */
  slots: number[];
  /** Cống hiến a deposited item is worth per piece, by the item's grade (index = grade - 1). */
  pointsByGrade: number[];
  /** Percent by rarity (common, uncommon, rare, epic) that scales those points. */
  rarityPct: number[];
  /** The most percent the leader can set for a kind of item (the leader's own percent scales the points; 0 refuses the kind). */
  catMax: number;
  /** Sect exp a point of deposited cống hiến brings. */
  expPerPoint: number;
  /** The most cống hiến a member can earn from deposits in one day (Việt Nam time): an item deposited beyond it is taken for nothing. */
  dailyCap: number;
}

/** What the leader lets the warehouse take: a percent per kind of item (0 or missing: refused) and the lowest grade. Nothing is taken until the leader sets it. */
export interface SectAccept {
  cats: Record<string, number>;
  minGrade: number;
}

export const VAULT_CATEGORIES = ["equipment", "skill_book", "consumable", "material"] as const;

/** One line of the sect's shop: what it sells for cống hiến. */
export interface SectShopItem {
  item: string;
  /** Cống hiến for the whole `qty`. */
  cost: number;
  qty: number;
  /** The sect level and the rank needed to buy it. */
  minLevel: number;
  minRank: number;
}

/** One skill the sect teaches: bought once with cống hiến, kept only while the character stays in a sect (5c-2b). */
export interface SectSkillItem {
  /** The id of a skill of source "sect". */
  skill: string;
  cost: number;
  minLevel: number;
  minRank: number;
}

export interface SectCfg {
  /** The realm (index) a character must have reached to found a sect. */
  createRealm: number;
  /** Linh Thạch taken for founding one (gone from the game). */
  createFee: number;
  nameMin: number;
  nameMax: number;
  noticeMax: number;
  /** After leaving, being sent away or a disbanding, the wait before joining another sect, in hours. */
  rejoinHours: number;
  /** How long an invitation can be answered, in seconds. */
  inviteSec: number;
  /** How far apart (tiles) the inviter and the invited may stand. */
  inviteRange: number;
  /** The most open applications one character can have, and the most a sect holds. */
  applyMax: number;
  requestsMax: number;
  /** Index = sect level - 1. */
  levels: SectLevelCfg[];
  /** The lowest rank that can do each thing. */
  perms: { invite: number; approve: number; kick: number; notice: number; appoint: number };
  /** The most of these roles at a time. */
  maxDeputies: number;
  maxElders: number;
  /** A leader who has not been in the game for this many days hands the sect to the highest deputy or elder. */
  leaderIdleDays: number;
  /** Giving Linh Thạch to the sect: the least amount, how many Linh Thạch make one cống hiến for the giver, and how many make one sect exp. The fund gets all of it. */
  donate: { min: number; linhPerPoint: number; linhPerExp: number };
  /** The most Linh Thạch a week a rank can be set to be paid, by rank (index 0 disciple .. 5 leader). The leader sets the real amounts. */
  weeklyMax: number[];
  /** The lowest rank that can raise the sect to the next level. */
  upgradeRank: number;
  /** What the sect shop sells for cống hiến. */
  shop: SectShopItem[];
  /** The skills the sect teaches for cống hiến. */
  skills: SectSkillItem[];
  /**
   * The dials to balance the sect economy against inflation without touching the tables: `upgradeCostPct` scales the Linh Thạch every level costs, `incomePct` scales the
   * Linh Thạch and the items the system puts into a sect's fund and warehouse (sect quests, 5c-4); 100 is as the tables say.
   */
  balance: { upgradeCostPct: number; incomePct: number };
  /** The sect's daily tasks (hand-ins). */
  tasks: SectTask[];
  /** The most Linh Thạch the tasks can add to a sect's fund in a day, by sect level (index = level - 1; after `balance.incomePct`). Past it a task still pays the member and the exp. */
  taskIncomeCap: number[];
  /** The sect warehouse (5c-3). */
  vault: SectVaultCfg;
  /** How a closing sect divides its fund and warehouse when the leader chooses "by cống hiến": the share of the whole sect's cống hiến, of the leader and of the deputies (sum 100). */
  disband: { poolPct: number; leaderPct: number; deputyPct: number };
  /** The total cống hiến earned (`contribution_total`) at which a disciple becomes nội môn and then tinh anh. */
  autoRanks: { inner: number; elite: number };
}

export const DEFAULT_SECT: SectCfg = {
  createRealm: 1,
  createFee: 50_000,
  nameMin: 2,
  nameMax: 14,
  noticeMax: 200,
  rejoinHours: 24,
  inviteSec: 30,
  inviteRange: 8,
  applyMax: 3,
  requestsMax: 50,
  levels: [
    { maxMembers: 20, expNeed: 500, costLinh: 200_000, costItems: [{ item: "linh_thao", qty: 50 }] },
    { maxMembers: 35, expNeed: 2000, costLinh: 800_000, costItems: [{ item: "thu_cot", qty: 100 }] },
    { maxMembers: 50, expNeed: 6000, costLinh: 2_500_000, costItems: [{ item: "yeu_dan", qty: 30 }] },
    { maxMembers: 70, expNeed: 15_000, costLinh: 8_000_000, costItems: [{ item: "yeu_dan", qty: 100 }] },
    { maxMembers: 100, expNeed: 0, costLinh: 0, costItems: [] },
  ],
  perms: { invite: SECT_RANK.elder, approve: SECT_RANK.elder, kick: SECT_RANK.deputy, notice: SECT_RANK.deputy, appoint: SECT_RANK.leader },
  maxDeputies: 2,
  maxElders: 5,
  leaderIdleDays: 30,
  donate: { min: 100, linhPerPoint: 100, linhPerExp: 200 },
  weeklyMax: [2000, 5000, 10_000, 20_000, 50_000, 100_000],
  upgradeRank: SECT_RANK.deputy,
  balance: { upgradeCostPct: 100, incomePct: 100 },
  tasks: [
    { id: "mine", kind: "mine", name: "Đào linh thạch: nộp Tinh Thiết Luyện Khí", item: "ren_lk", qty: 10, perDay: 2, minLevel: 1, reward: { contribution: 20, exp: 10, fundLinh: 3000, memberLinh: 500 } },
    { id: "hunt_bone", kind: "hunt", name: "Phá hang ổ tà tu: nộp Thú Cốt", item: "thu_cot", qty: 20, perDay: 2, minLevel: 1, kill: { count: 15, pct: 50 }, reward: { contribution: 25, exp: 12, fundLinh: 2000, memberLinh: 300, vault: { item: "thu_cot", qty: 5 } } },
    { id: "hunt_dan", kind: "hunt", name: "Diệt yêu thú mạnh: nộp Yêu Đan", item: "yeu_dan", qty: 3, perDay: 1, minLevel: 2, kill: { count: 2, pct: 50, rare: true }, reward: { contribution: 40, exp: 25, fundLinh: 5000, memberLinh: 800 } },
    { id: "alchemy", kind: "alchemy", name: "Luyện đan cho tông môn: nộp Hồi Huyết Đan", item: "hoi_huyet_dan", qty: 10, perDay: 1, minLevel: 1, reward: { contribution: 30, exp: 15, fundLinh: 1000, memberLinh: 0, vault: { item: "hoi_huyet_dan", qty: 5 } } },
    { id: "gather", kind: "gather", name: "Hái dược liệu: nộp Linh Thảo", item: "linh_thao", qty: 20, perDay: 2, minLevel: 1, reward: { contribution: 15, exp: 8, fundLinh: 500, memberLinh: 0, vault: { item: "linh_thao", qty: 10 } } },
  ],
  taskIncomeCap: [20_000, 60_000, 150_000, 400_000, 1_000_000],
  vault: {
    slots: [60, 100, 160, 240, 360],
    pointsByGrade: [1, 2, 4, 8, 15, 30, 60, 120, 250],
    rarityPct: [100, 150, 250, 400],
    catMax: 150,
    expPerPoint: 1,
    dailyCap: 3000,
  },
  disband: { poolPct: 60, leaderPct: 30, deputyPct: 10 },
  autoRanks: { inner: 500, elite: 5000 },
  shop: [
    { item: "hoi_huyet_dan", cost: 10, qty: 1, minLevel: 1, minRank: 0 },
    { item: "linh_thao", cost: 15, qty: 5, minLevel: 1, minRank: 0 },
    { item: "duong_huyet_dan", cost: 30, qty: 1, minLevel: 2, minRank: 0 },
  ],
  skills: [
    { skill: "tm_ho_than", cost: 150, minLevel: 1, minRank: 0 },
    { skill: "tm_hoi_xuan", cost: 200, minLevel: 1, minRank: 0 },
    { skill: "tm_tran_phap", cost: 500, minLevel: 2, minRank: 0 },
    { skill: "tm_chien_y", cost: 1200, minLevel: 3, minRank: 0 },
    { skill: "tm_kiem_tran", cost: 3000, minLevel: 4, minRank: 0 },
    { skill: "tm_tam_phap", cost: 8000, minLevel: 5, minRank: 0 },
  ],
};

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

const ITEM_ID = /^[A-Za-z0-9_.]{1,80}$/;

function validItems(v: unknown): boolean {
  return Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).item === "string" && ITEM_ID.test((x as Record<string, unknown>).item as string) && inRange((x as Record<string, unknown>).qty, 1, 100_000));
}

function validTask(t: unknown): boolean {
  if (typeof t !== "object" || t === null) return false;
  const x = t as Record<string, unknown>;
  const r = x.reward as Record<string, unknown> | undefined;
  if (typeof x.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(x.id) || typeof x.kind !== "string" || !/^[a-z]{1,16}$/.test(x.kind) || typeof x.name !== "string" || x.name.length < 1 || x.name.length > 80) return false;
  if (typeof x.item !== "string" || !ITEM_ID.test(x.item) || !inRange(x.qty, 1, 100_000) || !inRange(x.perDay, 1, 100) || !inRange(x.minLevel, 1, 30)) return false;
  const k = x.kill as Record<string, unknown> | undefined;
  if (k !== undefined && !(typeof k === "object" && k !== null && inRange(k.count, 1, 100_000) && inRange(k.pct, 0, 100) && (k.rare === undefined || typeof k.rare === "boolean") && (k.map === undefined || (typeof k.map === "string" && /^[a-z0-9_]{1,32}$/.test(k.map))))) return false;
  if (typeof r !== "object" || r === null) return false;
  if (!inRange(r.contribution, 0, 1_000_000) || !inRange(r.exp, 0, 1_000_000) || !inRange(r.fundLinh, 0, 1_000_000_000) || !inRange(r.memberLinh, 0, 1_000_000_000)) return false;
  const v = r.vault as Record<string, unknown> | undefined;
  return v === undefined || (typeof v === "object" && v !== null && typeof v.item === "string" && ITEM_ID.test(v.item) && inRange(v.qty, 1, 100_000));
}

function validVault(v: Record<string, unknown>): boolean {
  const list = (a: unknown, len: number | null, lo: number, hi: number) => Array.isArray(a) && (len === null ? a.length >= 1 && a.length <= 30 : a.length === len) && a.every((n) => inRange(n, lo, hi));
  return list(v.slots, null, 1, 100_000) && list(v.pointsByGrade, 9, 0, 1_000_000) && list(v.rarityPct, 4, 0, 10_000) && inRange(v.catMax, 1, 1000) && inRange(v.expPerPoint, 0, 1000) && inRange(v.dailyCap, 0, 1_000_000_000);
}

export function validSect(v: unknown): v is SectCfg {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  const p = c.perms as Record<string, unknown> | undefined;
  return (
    inRange(c.createRealm, 0, 20) &&
    inRange(c.createFee, 0, 1_000_000_000) &&
    inRange(c.nameMin, 1, 30) &&
    inRange(c.nameMax, 1, 30) &&
    (c.nameMin as number) <= (c.nameMax as number) &&
    inRange(c.noticeMax, 0, 1000) &&
    inRange(c.rejoinHours, 0, 24 * 365) &&
    inRange(c.inviteSec, 5, 600) &&
    inRange(c.inviteRange, 1, 30) &&
    inRange(c.applyMax, 1, 20) &&
    inRange(c.requestsMax, 1, 500) &&
    Array.isArray(c.levels) &&
    c.levels.length >= 1 &&
    c.levels.length <= 30 &&
    c.levels.every((l) => typeof l === "object" && l !== null && inRange((l as Record<string, unknown>).maxMembers, 1, 1000) && inRange((l as Record<string, unknown>).expNeed, 0, 1_000_000_000) && inRange((l as Record<string, unknown>).costLinh, 0, 1_000_000_000) && validItems((l as Record<string, unknown>).costItems)) &&
    Array.isArray(c.taskIncomeCap) &&
    c.taskIncomeCap.length >= 1 &&
    c.taskIncomeCap.length <= 30 &&
    c.taskIncomeCap.every((n) => inRange(n, 0, 1_000_000_000)) &&
    Array.isArray(c.tasks) &&
    c.tasks.length <= 30 &&
    c.tasks.every(validTask) &&
    typeof p === "object" &&
    p !== null &&
    (["invite", "approve", "kick", "notice", "appoint"] as const).every((k) => inRange(p[k], 0, SECT_RANK.leader)) &&
    inRange(c.maxDeputies, 0, 10) &&
    inRange(c.maxElders, 0, 50) &&
    inRange(c.leaderIdleDays, 1, 365) &&
    typeof c.donate === "object" &&
    c.donate !== null &&
    inRange((c.donate as Record<string, unknown>).min, 1, 1_000_000_000) &&
    inRange((c.donate as Record<string, unknown>).linhPerPoint, 1, 1_000_000) &&
    inRange((c.donate as Record<string, unknown>).linhPerExp, 1, 1_000_000) &&
    Array.isArray(c.weeklyMax) &&
    c.weeklyMax.length === SECT_ROLES.length &&
    c.weeklyMax.every((n) => inRange(n, 0, 1_000_000_000)) &&
    inRange(c.upgradeRank, 0, SECT_RANK.leader) &&
    typeof c.balance === "object" &&
    c.balance !== null &&
    inRange((c.balance as Record<string, unknown>).upgradeCostPct, 1, 1000) &&
    inRange((c.balance as Record<string, unknown>).incomePct, 0, 1000) &&
    typeof c.vault === "object" &&
    c.vault !== null &&
    validVault(c.vault as Record<string, unknown>) &&
    typeof c.disband === "object" &&
    c.disband !== null &&
    inRange((c.disband as Record<string, unknown>).poolPct, 0, 100) &&
    inRange((c.disband as Record<string, unknown>).leaderPct, 0, 100) &&
    inRange((c.disband as Record<string, unknown>).deputyPct, 0, 100) &&
    ((c.disband as Record<string, number>).poolPct as number) + ((c.disband as Record<string, number>).leaderPct as number) + ((c.disband as Record<string, number>).deputyPct as number) === 100 &&
    typeof c.autoRanks === "object" &&
    c.autoRanks !== null &&
    inRange((c.autoRanks as Record<string, unknown>).inner, 1, 1_000_000_000) &&
    inRange((c.autoRanks as Record<string, unknown>).elite, 1, 1_000_000_000) &&
    ((c.autoRanks as Record<string, number>).inner as number) < ((c.autoRanks as Record<string, number>).elite as number) &&
    Array.isArray(c.skills) &&
    c.skills.length <= 50 &&
    c.skills.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as Record<string, unknown>).skill === "string" &&
        /^[a-z0-9_]{1,32}$/.test((s as Record<string, unknown>).skill as string) &&
        inRange((s as Record<string, unknown>).cost, 1, 1_000_000_000) &&
        inRange((s as Record<string, unknown>).minLevel, 1, 30) &&
        inRange((s as Record<string, unknown>).minRank, 0, SECT_RANK.leader),
    ) &&
    Array.isArray(c.shop) &&
    c.shop.length <= 50 &&
    c.shop.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as Record<string, unknown>).item === "string" &&
        /^[A-Za-z0-9_.]{1,80}$/.test((s as Record<string, unknown>).item as string) &&
        inRange((s as Record<string, unknown>).cost, 1, 1_000_000_000) &&
        inRange((s as Record<string, unknown>).qty, 1, 999) &&
        inRange((s as Record<string, unknown>).minLevel, 1, 30) &&
        inRange((s as Record<string, unknown>).minRank, 0, SECT_RANK.leader),
    )
  );
}

/** The rank cống hiến earns on its own: disciple, then nội môn and tinh anh at the thresholds of the config (an elder or above is appointed, never earned). */
export const earnedRank = (cfg: SectCfg, total: number): number => (total >= cfg.autoRanks.elite ? SECT_RANK.elite : total >= cfg.autoRanks.inner ? SECT_RANK.inner : SECT_RANK.disciple);

/** What a level costs in Linh Thạch now: the table's number scaled by the `balance` dial. */
export const upgradeCostOf = (cfg: SectCfg, level: number): number => Math.floor((sectLevelOf(cfg, level).costLinh * cfg.balance.upgradeCostPct) / 100);

/** What the system puts into a sect (a quest's fund or warehouse income): the number scaled by the `balance` dial, rounded down. */
export const scaledIncome = (cfg: SectCfg, amount: number): number => Math.floor((amount * cfg.balance.incomePct) / 100);

/** The row of a level (a level past the table uses the last row). */
export const sectLevelOf = (cfg: SectCfg, level: number): SectLevelCfg => cfg.levels[Math.min(Math.max(1, level), cfg.levels.length) - 1] as SectLevelCfg;

/** The most members at a level (a level past the table uses the last row). */
export const sectMaxMembers = (cfg: SectCfg, level: number): number => cfg.levels[Math.min(Math.max(1, level), cfg.levels.length) - 1]?.maxMembers ?? 1;

/** The most stacks the warehouse holds at a level. */
export const vaultSlotsOf = (cfg: SectCfg, level: number): number => cfg.vault.slots[Math.min(Math.max(1, level), cfg.vault.slots.length) - 1] ?? 0;

/**
 * The cống hiến `qty` of an item is worth to the warehouse as `accept` stands, or 0 when it is not taken (a kind the leader did not allow, a grade below the
 * lowest, or too little to count). Per piece: the points of its grade, scaled by its rarity and by the leader's percent for its kind.
 */
export function vaultPoints(cfg: SectCfg, accept: SectAccept, def: { category: string; grade: number; rarity: string } | undefined, qty: number): number {
  if (!def || qty < 1) return 0;
  const pct = Math.min(accept.cats[def.category] ?? 0, cfg.vault.catMax);
  if (pct <= 0 || def.grade < accept.minGrade) return 0;
  const base = cfg.vault.pointsByGrade[Math.min(Math.max(1, def.grade), cfg.vault.pointsByGrade.length) - 1] ?? 0;
  const rarity = cfg.vault.rarityPct[["common", "uncommon", "rare", "epic"].indexOf(def.rarity)] ?? 100;
  return Math.floor((base * qty * rarity * pct) / 10_000);
}

/** The percent of the closing sect's fund and warehouse each member gets when the leader divides it by cống hiến. Sums to 100. */
export function disbandShares(cfg: SectCfg, members: Array<{ id: string; rank: number; total: number }>): Map<string, number> {
  const out = new Map<string, number>();
  const leader = members.find((m) => m.rank >= SECT_RANK.leader);
  const deputies = members.filter((m) => m.rank === SECT_RANK.deputy);
  const sum = members.reduce((n, m) => n + m.total, 0);
  const d = cfg.disband;
  for (const m of members) {
    const weight = sum > 0 ? m.total / sum : 1 / Math.max(1, members.length); // nobody earned anything: equal shares
    let pct = (d.poolPct * weight);
    if (m === leader) pct += d.leaderPct + (deputies.length === 0 ? d.deputyPct : 0);
    if (m.rank === SECT_RANK.deputy) pct += d.deputyPct / deputies.length;
    out.set(m.id, pct);
  }
  return out;
}

/** The Linh Thạch each member gets from `fund` by their percent of `shares` (rounded down; what is left over goes to `rest`). */
export function splitLinh(fund: number, shares: ReadonlyMap<string, number>, rest: string): Map<string, number> {
  const out = new Map<string, number>();
  let given = 0;
  for (const [id, pct] of shares) {
    const n = Math.max(0, Math.floor((fund * pct) / 100));
    out.set(id, n);
    given += n;
  }
  out.set(rest, (out.get(rest) ?? 0) + (fund - given));
  return out;
}

/** One piece of a stack that goes to one member. */
export interface StackPiece {
  to: string;
  qty: number;
}

/**
 * Who gets what when a sect's warehouse is divided by `shares` (percent per member). Stacks of one piece (gear, a book) go whole to the member whose claim has the most left;
 * a stack of several is split by quantity: each member gets about their remaining claim of the stack (rounded down, the pieces left over to the biggest fractions), so the
 * totals end close to the percents. Stacks are done the most valuable first; `value` is the whole stack's worth. `fallback` takes everything when there are no shares.
 */
export function assignPieces(items: ReadonlyArray<{ id: string; value: number; qty: number }>, shares: ReadonlyMap<string, number>, fallback: string): Map<string, StackPiece[]> {
  const out = new Map<string, StackPiece[]>();
  if (shares.size === 0) {
    for (const i of items) out.set(i.id, [{ to: fallback, qty: i.qty }]);
    return out;
  }
  const total = items.reduce((n, i) => n + i.value, 0);
  const left = new Map([...shares].map(([id, pct]) => [id, (total * pct) / 100] as const));
  const ids = [...left.keys()].sort();
  for (const item of [...items].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))) {
    if (item.qty <= 1) {
      let best = ids[0] as string;
      for (const id of ids) if ((left.get(id) ?? 0) > (left.get(best) ?? 0)) best = id;
      out.set(item.id, [{ to: best, qty: item.qty }]);
      left.set(best, (left.get(best) ?? 0) - item.value);
      continue;
    }
    // split by quantity: in proportion to what each member still has coming (those who are owed nothing more get none)
    const want = ids.map((id) => Math.max(0, left.get(id) ?? 0));
    const sum = want.reduce((a, b) => a + b, 0);
    const exact = want.map((w) => (sum > 0 ? (item.qty * w) / sum : item.qty / ids.length));
    const qty = exact.map((x) => Math.floor(x));
    let rest = item.qty - qty.reduce((a, b) => a + b, 0);
    const order = exact.map((x, i) => i).sort((i, j) => (exact[j] as number) - Math.floor(exact[j] as number) - ((exact[i] as number) - Math.floor(exact[i] as number)) || i - j);
    for (const i of order) {
      if (rest <= 0) break;
      qty[i] = (qty[i] as number) + 1;
      rest--;
    }
    const pieces: StackPiece[] = [];
    ids.forEach((id, i) => {
      const q = qty[i] as number;
      if (q > 0) {
        pieces.push({ to: id, qty: q });
        left.set(id, (left.get(id) ?? 0) - (item.value * q) / item.qty);
      }
    });
    out.set(item.id, pieces);
  }
  return out;
}

/** An item a rank is paid a week from the warehouse (a plain stackable item). */
export interface SectWeeklyItem {
  item: string;
  qty: number;
}

/** The mode a task has for a member on a day: a task with `kill` is a kill day for `pct` percent of the draws, a hash of (member, task, day), so leaving and joining again cannot redraw it. */
export function sectTaskMode(task: Pick<SectTask, "id" | "kill">, characterId: string, day: number): "kill" | "item" {
  if (!task.kill || task.kill.pct <= 0) return "item";
  if (task.kill.pct >= 100) return "kill";
  let h = 0x811c9dc5;
  for (const ch of `${characterId}:${task.id}:${day}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100 < task.kill.pct ? "kill" : "item";
}

/** Whether a kill (on `mapId`, of a rare monster or not) counts for the kill objective of a task. */
export function sectKillCounts(task: Pick<SectTask, "kill">, mapId: string, rare: boolean): boolean {
  const k = task.kill;
  return !!k && (k.map === undefined || k.map === mapId) && (!k.rare || rare);
}

/** Whether a kill task can still use another kill today: the day's total so far is below what all its turns ask for (`count x perDay`). */
export function sectKillOpen(task: Pick<SectTask, "kill" | "perDay">, total: number): boolean {
  return !!task.kill && total < task.kill.count * task.perDay;
}

/** What the sect window shows for the sect the player is in. */
export interface SectMemberView {
  id: string;
  name: string;
  rank: number;
  /** `realm * 10 + stage`, like a snapshot's. */
  lv: number;
  online: boolean;
  joinedAt: number;
  /** The tổng cống hiến earned in the sect (5c-2). */
  total: number;
}

/** One line of the ranking of the sects. */
export interface SectRankItem {
  id: string;
  name: string;
  level: number;
  exp: number;
  members: number;
  leader: string;
}

export interface SectView {
  id: string;
  name: string;
  level: number;
  maxMembers: number;
  notice: string;
  fund: number;
  exp: number;
  /** The player's own rank. */
  myRank: number;
  members: SectMemberView[];
  /** Applications waiting (only for a rank that can approve). */
  requests: Array<{ id: string; name: string; lv: number; at: number }>;
  /** The player's cống hiến in this sect (shown in the wallet). */
  contribution: number;
  /** The sect exp and Linh Thạch the next level needs (0: this is the top level). */
  expNeed: number;
  costLinh: number;
  /** What each rank is paid a week (the leader sets it; index = rank), what this player is paid, and whether they took it this week. */
  weekly: number[];
  weeklyPay: number;
  /** The items each rank is paid a week from the warehouse (index = rank; null: none; only for a rank that sets them), and this player's own. */
  weeklyItems: Array<SectWeeklyItem | null>;
  weeklyItem: SectWeeklyItem | null;
  weeklyClaimed: boolean;
  /** How many stacks the warehouse holds now and at most, and what it takes (only the leader needs the last). */
  vaultCount: number;
  vaultSlots: number;
  accept: SectAccept;
  /** The cống hiến this player can still earn from deposits today. */
  vaultToday: number;
  /** How many times the player did each task today (by task id). */
  taskDone: Record<string, number>;
  /** Today's mode of each task that can be a kill count, and the kills counted for it so far today (by task id). */
  taskMode: Record<string, "kill" | "item">;
  taskKills: Record<string, number>;
}

/** One stack in the warehouse (sent when the Kho tab opens). */
export interface SectVaultItemView {
  id: string;
  type: string;
  qty: number;
  by: string;
  carry: Record<string, unknown>;
  /** On the shop shelf: for what. */
  shelf?: { currency: "linh_thach" | "cong_hien"; price: number };
}

/** A line of the list of sects to apply to. */
export interface SectListItem {
  id: string;
  name: string;
  level: number;
  members: number;
  maxMembers: number;
  leader: string;
  notice: string;
  /** The player has an application open here. */
  applied: boolean;
}

export type SectError =
  | "rate"
  | "invalid"
  | "name"
  | "taken"
  | "realm"
  | "funds"
  | "in_sect"
  | "no_sect"
  | "cooldown"
  | "full"
  | "perm"
  | "leader"
  | "limit"
  | "gone"
  | "far"
  | "npc"
  | "busy"
  | "unsafe"
  | "exp"
  | "fund"
  | "claimed"
  | "item"
  | "poor"
  | "bag"
  | "value"
  | "vault_full"
  | "lack"
  | "task"
  | "known"
  | "skill_level";

/** The lines the sect says in its own channel (the server sends them; Vietnamese, like the boss announcements). */
export const SECT_SAY = {
  joined: (name: string) => `${name} đã gia nhập tông môn.`,
  left: (name: string) => `${name} đã rời tông môn.`,
  kicked: (name: string, by: string) => `${name} bị ${by} trục xuất khỏi tông môn.`,
  role: (name: string, role: string) => `${name} được bổ nhiệm làm ${role}.`,
  transfer: (name: string, to: string) => `${name} đã trao chức tông chủ cho ${to}.`,
  succeed: (name: string) => `Tông chủ vắng mặt quá lâu, ${name} trở thành tông chủ mới.`,
  disband: (sect: string) => `Tông môn ${sect} đã giải tán.`,
  donated: (name: string, amount: string) => `${name} đã góp ${amount} Linh Thạch cho tông môn.`,
  upgraded: (level: number) => `Tông môn đã lên cấp ${level}!`,
} as const;

/** The names of the roles, in Vietnamese. */
export const SECT_ROLE_NAMES: Readonly<Record<SectRole, string>> = {
  disciple: "Đệ tử",
  inner: "Nội môn",
  elite: "Tinh anh",
  elder: "Trưởng lão",
  deputy: "Phó tông chủ",
  leader: "Tông chủ",
};

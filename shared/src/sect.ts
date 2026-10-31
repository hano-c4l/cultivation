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
}

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
  /**
   * The dials to balance the sect economy against inflation without touching the tables: `upgradeCostPct` scales the Linh Thạch every level costs, `incomePct` scales the
   * Linh Thạch and the items the system puts into a sect's fund and warehouse (sect quests, 5c-4); 100 is as the tables say.
   */
  balance: { upgradeCostPct: number; incomePct: number };
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
    { maxMembers: 20, expNeed: 500, costLinh: 200_000 },
    { maxMembers: 35, expNeed: 2000, costLinh: 800_000 },
    { maxMembers: 50, expNeed: 6000, costLinh: 2_500_000 },
    { maxMembers: 70, expNeed: 15_000, costLinh: 8_000_000 },
    { maxMembers: 100, expNeed: 0, costLinh: 0 },
  ],
  perms: { invite: SECT_RANK.elder, approve: SECT_RANK.elder, kick: SECT_RANK.deputy, notice: SECT_RANK.deputy, appoint: SECT_RANK.leader },
  maxDeputies: 2,
  maxElders: 5,
  leaderIdleDays: 30,
  donate: { min: 100, linhPerPoint: 100, linhPerExp: 200 },
  weeklyMax: [2000, 5000, 10_000, 20_000, 50_000, 100_000],
  upgradeRank: SECT_RANK.deputy,
  balance: { upgradeCostPct: 100, incomePct: 100 },
  autoRanks: { inner: 500, elite: 5000 },
  shop: [
    { item: "hoi_huyet_dan", cost: 10, qty: 1, minLevel: 1, minRank: 0 },
    { item: "linh_thao", cost: 15, qty: 5, minLevel: 1, minRank: 0 },
    { item: "duong_huyet_dan", cost: 30, qty: 1, minLevel: 2, minRank: 0 },
  ],
};

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
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
    c.levels.every((l) => typeof l === "object" && l !== null && inRange((l as Record<string, unknown>).maxMembers, 1, 1000) && inRange((l as Record<string, unknown>).expNeed, 0, 1_000_000_000) && inRange((l as Record<string, unknown>).costLinh, 0, 1_000_000_000)) &&
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
    typeof c.autoRanks === "object" &&
    c.autoRanks !== null &&
    inRange((c.autoRanks as Record<string, unknown>).inner, 1, 1_000_000_000) &&
    inRange((c.autoRanks as Record<string, unknown>).elite, 1, 1_000_000_000) &&
    ((c.autoRanks as Record<string, number>).inner as number) < ((c.autoRanks as Record<string, number>).elite as number) &&
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
  weeklyClaimed: boolean;
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
  | "bag";

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

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
  levels: [{ maxMembers: 20 }, { maxMembers: 35 }, { maxMembers: 50 }, { maxMembers: 70 }, { maxMembers: 100 }],
  perms: { invite: SECT_RANK.elder, approve: SECT_RANK.elder, kick: SECT_RANK.deputy, notice: SECT_RANK.deputy, appoint: SECT_RANK.leader },
  maxDeputies: 2,
  maxElders: 5,
  leaderIdleDays: 30,
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
    c.levels.every((l) => typeof l === "object" && l !== null && inRange((l as Record<string, unknown>).maxMembers, 1, 1000)) &&
    typeof p === "object" &&
    p !== null &&
    (["invite", "approve", "kick", "notice", "appoint"] as const).every((k) => inRange(p[k], 0, SECT_RANK.leader)) &&
    inRange(c.maxDeputies, 0, 10) &&
    inRange(c.maxElders, 0, 50) &&
    inRange(c.leaderIdleDays, 1, 365)
  );
}

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
  | "unsafe";

/** The lines the sect says in its own channel (the server sends them; Vietnamese, like the boss announcements). */
export const SECT_SAY = {
  joined: (name: string) => `${name} đã gia nhập tông môn.`,
  left: (name: string) => `${name} đã rời tông môn.`,
  kicked: (name: string, by: string) => `${name} bị ${by} trục xuất khỏi tông môn.`,
  role: (name: string, role: string) => `${name} được bổ nhiệm làm ${role}.`,
  transfer: (name: string, to: string) => `${name} đã trao chức tông chủ cho ${to}.`,
  succeed: (name: string) => `Tông chủ vắng mặt quá lâu, ${name} trở thành tông chủ mới.`,
  disband: (sect: string) => `Tông môn ${sect} đã giải tán.`,
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

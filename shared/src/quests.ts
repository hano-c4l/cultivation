import { BREAKTHROUGHS } from "./breakthrough";
import { isItemId } from "./items";
import { PATHS, isPathId, type PathId } from "./paths";
import { REALMS, STAGES_PER_REALM } from "./progression-data";

/**
 * Quests (phase 2e-B). A quest is DATA: every field is a plain value so the whole catalogue can live in D1 and be edited
 * from an admin screen later (new quests need no code). The server reads it, validates it with `validateQuests` (the same
 * check an admin write must pass) and serves it to the client. The values in DEFAULT_QUESTS are placeholder game-design
 * values ("giá trị tạm" in docs/PHASE2.md).
 */
export type QuestObjective =
  /** Open the window of an NPC (the server checks the distance). */
  | { kind: "talk"; npc: string }
  /** Kill `count` monsters after accepting; `map` limits it to one map, `rare` to rare monsters (Tinh Anh, Đại Yêu). */
  | { kind: "kill"; count: number; map?: string; rare?: boolean }
  /** Hand over `qty` of an item at turn-in, and of every item in `also` (all of them are taken). */
  | { kind: "collect"; item: string; qty: number; also?: Array<{ item: string; qty: number }> }
  /** Be at least this realm and stage at turn-in. */
  | { kind: "reach"; realm: number; stage: number };

export interface QuestRewards {
  /** Linh Thạch. */
  linhThach?: number;
  /** Raw EXP, applied like EXP from a kill (stage-ups carry over; at stage 9 the bar overflows by at most 100% and the rest is lost). */
  exp?: number;
  items?: Array<{ item: string; qty: number }>;
}

export interface QuestDef {
  /** Never changes once players have it (it is stored with their progress). */
  id: string;
  /** Quests of a chain are listed together; `seq` orders them. */
  chain: string;
  seq: number;
  /** The NPC that gives the quest and takes it back. */
  giver: string;
  titleVi: string;
  descVi: string;
  /** A disabled quest is not offered to anyone new; players already on it can still finish it. */
  enabled: boolean;
  /** The quest that must be finished first, or null. */
  requires: string | null;
  /** The character must have reached this realm (index into REALMS) to take the quest. */
  minRealm?: number;
  /**
   * A hướng tu quest: its reward is that path's item, so it shares the one-time key of the path item
   * (`path_item:<character>:<path>`), and it opens again when the character drops the path (the item can then be had again).
   * It must not pay Linh Thạch (the reward key doubles as a ledger key and the ledger is append-only).
   */
  path?: PathId;
  objective: QuestObjective;
  rewards: QuestRewards;
}

export type QuestState = "active" | "done";
/** What the window shows: locked (prerequisite not done), available, active or done. */
export type QuestStatus = "locked" | "available" | "active" | "done";

export interface QuestProgressView {
  state: QuestState;
  progress: number;
}

/** How much progress the objective needs: the kill count, the item quantity, or 1 for a talk and a level. */
/** Every item a collect objective asks for, with its quantity (the main one first). */
export function collectItems(o: Extract<QuestObjective, { kind: "collect" }>): Array<{ item: string; qty: number }> {
  return [{ item: o.item, qty: o.qty }, ...(o.also ?? [])];
}

export function objectiveTarget(o: QuestObjective): number {
  return o.kind === "kill" ? o.count : o.kind === "collect" ? o.qty : 1;
}

/** Only kill and talk objectives are counted while the quest is active; collecting and reaching are checked when the quest is handed in. */
export function countsProgress(o: QuestObjective): boolean {
  return o.kind === "kill" || o.kind === "talk";
}

/** Whether a kill (on `mapId`, of a rare monster or not) counts for this quest. */
export function killCounts(o: QuestObjective, mapId: string, rare: boolean): boolean {
  return o.kind === "kill" && (o.map === undefined || o.map === mapId) && (!o.rare || rare);
}

/** The status of a quest for a character, from its progress rows and the set of finished quests. */
export function questStatus(def: QuestDef, progress: Readonly<Record<string, QuestProgressView>>): QuestStatus {
  const mine = progress[def.id];
  if (mine) return mine.state;
  if (def.requires && progress[def.requires]?.state !== "done") return "locked";
  return "available";
}

const POSITIVE_INT = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1_000_000_000;

/**
 * Checks a whole catalogue. Returns the problems found (empty when it is valid). `npcs` is the set of NPC ids that exist;
 * every giver and every talk target must be one of them.
 */
export function validateQuests(list: readonly QuestDef[], npcs: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const all = new Map(list.map((q) => [q.id, q]));
  for (const q of list) {
    const at = `quest ${q.id}`;
    if (!/^[a-z0-9_]{1,40}$/.test(q.id)) problems.push(`${at}: bad id`);
    if (seen.has(q.id)) problems.push(`${at}: duplicate id`);
    if (!/^[a-z0-9_]{1,24}$/.test(q.chain)) problems.push(`${at}: bad chain`);
    if (!Number.isInteger(q.seq) || q.seq < 0) problems.push(`${at}: bad seq`);
    if (!npcs.has(q.giver)) problems.push(`${at}: unknown giver ${q.giver}`);
    if (!q.titleVi.trim() || !q.descVi.trim()) problems.push(`${at}: title and description are required`);
    // A prerequisite may sit anywhere in the catalogue (other chains sort in any order): it must exist and the links must not loop.
    if (q.requires !== null) {
      if (!all.has(q.requires)) problems.push(`${at}: requires ${q.requires}, which does not exist`);
      else {
        const trail = new Set<string>([q.id]);
        for (let next: string | null = q.requires; next !== null; next = all.get(next)?.requires ?? null) {
          if (trail.has(next)) {
            problems.push(`${at}: requires itself through ${next}`);
            break;
          }
          trail.add(next);
        }
      }
    }
    const o = q.objective;
    if (o.kind === "talk" && !npcs.has(o.npc)) problems.push(`${at}: talk target ${o.npc} is not an NPC`);
    else if (o.kind === "kill" && (!POSITIVE_INT(o.count) || o.count > 9999)) problems.push(`${at}: bad kill count`);
    else if (o.kind === "collect" && !collectItems(o).every((c) => isItemId(c.item) && POSITIVE_INT(c.qty) && c.qty <= 9999)) problems.push(`${at}: bad collect item or quantity`);
    else if (o.kind === "reach" && !(Number.isInteger(o.realm) && o.realm >= 0 && o.realm < REALMS.length && Number.isInteger(o.stage) && o.stage >= 1 && o.stage <= STAGES_PER_REALM))
      problems.push(`${at}: bad realm or stage`);
    else if (!["talk", "kill", "collect", "reach"].includes(o.kind)) problems.push(`${at}: unknown objective`);
    if (q.minRealm !== undefined && !(Number.isInteger(q.minRealm) && q.minRealm >= 0 && q.minRealm < REALMS.length)) problems.push(`${at}: bad minimum realm`);
    if (q.path !== undefined) {
      if (!isPathId(q.path)) problems.push(`${at}: unknown path ${String(q.path)}`);
      else if (!(q.rewards.items ?? []).some((it) => it.item === PATHS[q.path as PathId].item)) problems.push(`${at}: a path quest must reward the path item`);
      if (q.rewards.linhThach) problems.push(`${at}: a path quest cannot pay Linh Thạch`);
    }
    const r = q.rewards;
    if (r.linhThach !== undefined && !POSITIVE_INT(r.linhThach)) problems.push(`${at}: bad Linh Thạch reward`);
    if (r.exp !== undefined && !POSITIVE_INT(r.exp)) problems.push(`${at}: bad EXP reward`);
    for (const it of r.items ?? []) if (!isItemId(it.item) || !POSITIVE_INT(it.qty) || it.qty > 9999) problems.push(`${at}: bad reward item ${it.item}`);
    seen.add(q.id);
  }
  return problems;
}

/** Whether the reward adds anything at all (a quest with an empty reward is allowed: the turn-in then only closes it). */
export function hasRewards(r: QuestRewards): boolean {
  return !!(r.linhThach || r.exp || (r.items && r.items.length > 0));
}

/** The grant key that makes a quest's reward one-time. It is also the idempotency key of its Linh Thạch entry. */
export function questGrantKey(characterId: string, questId: string): string {
  return `quest:${characterId}:${questId}`;
}

const NEWBIE = (q: Omit<QuestDef, "chain" | "giver" | "enabled">): QuestDef => ({ ...q, chain: "newbie", giver: "elder", enabled: true });

/** The newbie chain (6 steps, rewards grow with each). The NPC "elder" gives and takes them back; step 1 sends the player to the merchant. */
export const DEFAULT_QUESTS: readonly QuestDef[] = [
  NEWBIE({
    id: "newbie_1",
    seq: 1,
    titleVi: "Gặp Thương nhân",
    descVi: "Thương nhân trong thành bán đan dược và trang bị cơ bản. Hãy đến chào hỏi người, rồi quay lại báo cho ta.",
    requires: null,
    objective: { kind: "talk", npc: "merchant" },
    rewards: { linhThach: 50, exp: 100, items: [{ item: "hoi_huyet_dan", qty: 3 }] },
  }),
  NEWBIE({
    id: "newbie_2",
    seq: 2,
    titleVi: "Thử sức ở Hắc Mộc Lâm",
    descVi: "Ra cổng nam, vào Hắc Mộc Lâm và hạ 10 con quái để làm quen với chiến đấu.",
    requires: "newbie_1",
    objective: { kind: "kill", count: 10, map: "forest" },
    rewards: { linhThach: 100, exp: 400, items: [{ item: "duong_huyet_dan", qty: 3 }] },
  }),
  NEWBIE({
    id: "newbie_3",
    seq: 3,
    titleVi: "Thu thập Linh Thảo",
    descVi: "Quái ở Hắc Mộc Lâm thỉnh thoảng rơi Linh Thảo. Mang về 5 cây để ta dùng luyện đan.",
    requires: "newbie_2",
    objective: { kind: "collect", item: "linh_thao", qty: 5 },
    rewards: { linhThach: 60, exp: 300, items: [{ item: "duong_huyet_dan", qty: 3 }] },
  }),
  NEWBIE({
    id: "newbie_4",
    seq: 4,
    titleVi: "Tu luyện đến tầng 5",
    descVi: "Tiếp tục săn quái và tu luyện cho đến khi đạt Luyện Khí tầng 5.",
    requires: "newbie_3",
    objective: { kind: "reach", realm: 0, stage: 5 },
    rewards: { linhThach: 300, exp: 1000, items: [{ item: "hoi_huyet_dan", qty: 5 }] },
  }),
  NEWBIE({
    id: "newbie_5",
    seq: 5,
    titleVi: "Hạ một quái Tinh Anh",
    descVi: "Trong rừng có những con quái mạnh hơn hẳn, tên mang chữ Tinh Anh hoặc Đại Yêu. Hãy hạ một con.",
    requires: "newbie_4",
    objective: { kind: "kill", count: 1, map: "forest", rare: true },
    rewards: { linhThach: 500, exp: 1500, items: [{ item: "dai_hoi_huyet_dan", qty: 2 }] },
  }),
  NEWBIE({
    id: "newbie_6",
    seq: 6,
    titleVi: "Đỉnh Luyện Khí",
    descVi: "Tu luyện đến Luyện Khí tầng 9, đỉnh của cảnh giới đầu tiên, rồi quay lại nhận phần thưởng cuối.",
    requires: "newbie_5",
    objective: { kind: "reach", realm: 0, stage: 9 },
    rewards: { linhThach: 1000, exp: 3000, items: [{ item: "ngo_dao_dan", qty: 1 }] },
  }),
];

/**
 * One quest per hướng tu, given by that path's own NPC and different from the others: Kiếm tu proves itself in combat (kills),
 * Thuật tu brings spirit essence (Yêu Đan and herbs), Đan tu brings herbs and basic pills. From Trúc Cơ; the reward is the path
 * item. The quest reopens when the path is dropped.
 */
const pathQuest = (path: PathId, seq: number, giver: string, titleVi: string, descVi: string, objective: QuestObjective): QuestDef => ({
  id: `path_${path}`,
  chain: "path",
  seq,
  giver,
  titleVi,
  descVi,
  enabled: true,
  requires: null,
  minRealm: 1,
  path,
  objective,
  rewards: { items: [{ item: PATHS[path].item, qty: 1 }] },
});

/** The hướng tu quests and the one-time breakthrough quest (placeholder values, like the newbie chain). */
export const EXTRA_QUESTS: readonly QuestDef[] = [
  pathQuest("kiem", 1, "path_kiem", "Thử kiếm", "Kiếm tu lấy chiến đấu làm gốc. Hãy ra Hắc Mộc Lâm hạ 30 con quái để chứng tỏ kiếm tâm, rồi quay lại nhận Kiếm Tu Lệnh.", {kind: "kill", count: 30, map: "forest"}),
  pathQuest("thuat", 2, "path_thuat", "Lễ vật Yêu Đan", "Thuật tu cần linh khí cô đọng để thi triển pháp thuật. Mang đến 4 Yêu Đan và 8 Linh Thảo, ta sẽ trao Thuật Tu Lệnh.", {kind: "collect", item: "yeu_dan", qty: 4, also: [{item: "linh_thao", qty: 8}]}),
  pathQuest("dan", 3, "path_dan", "Dược liệu và đan thuốc", "Đan tu khởi đầu từ dược liệu và đan cơ bản. Mang đến 30 Linh Thảo và 5 Hồi Huyết Đan, ta sẽ trao Đan Tu Lệnh.", {kind: "collect", item: "linh_thao", qty: 30, also: [{item: "hoi_huyet_dan", qty: 5}]}),
  {
    id: "breakthrough_1",
    chain: "breakthrough",
    seq: 1,
    giver: "elder",
    titleVi: "Đan Đột Phá Trúc Cơ",
    descVi: "Đột phá lên Trúc Cơ cần Đan Đột Phá. Mang đến 20 Linh Thảo, 10 Thú Cốt và 3 Yêu Đan, ta sẽ luyện cho con một viên. Chỉ làm được một lần.",
    enabled: true,
    requires: "newbie_6",
    objective: { kind: "collect", item: "linh_thao", qty: 20, also: [{ item: "thu_cot", qty: 10 }, { item: "yeu_dan", qty: 3 }] },
    rewards: { items: [{ item: BREAKTHROUGHS[0]?.pill ?? "", qty: 1 }] },
  },
];

/** Everything the server seeds into an empty catalogue, in order. */
export const SEED_QUESTS: readonly QuestDef[] = [...DEFAULT_QUESTS, ...EXTRA_QUESTS];

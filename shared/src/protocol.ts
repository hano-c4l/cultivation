import { ALL_ROOTS, type SpiritualRoot } from "./character";
import type { Vec2 } from "./map";
import { isCombatTargetId, isMonsterId, type HitKind } from "./combat";
import type { BreakthroughEnd, BreakthroughError } from "./breakthrough";
import { MAX_SHOP_QTY, SHOP_SELL_MANY_MAX } from "./shop";
import type { QuestDef, QuestProgressView } from "./quests";
import { isPkMode, type PkMode } from "./pk";
import { isPathId, type PathError, type PathId } from "./paths";
import type { ConstitutionCatalog } from "./constitutions";
import type { Currency, Wallet } from "./economy";
import type { EnhanceLevelDef } from "./smith";
import type { Tuning } from "./tuning";
import type { BrewJobView } from "./alchemy";
import type { MerchantDef } from "./merchants";
import type { MapRecipe, NpcSpot } from "./map";
import type { ItemOverlay } from "./items";
import type { ElementTuning } from "./element-tuning";
import { MAP_ID_PATTERN } from "./map";
import type { WaygateDest } from "./waygate";
import { isEquipSlot, type EquipBlock, type EquipSlot, type EquippedItem } from "./equipment-data";
import { BAG_CELLS_PER_TAB, MAX_BAG_TABS, SORT_MODES, type BagItem, type Carry, type BagPos, type SortMode } from "./inventory";
import type { MonsterRank } from "./monsters";
import { HOTBAR_SLOTS, HOTBAR_SLOT_PATTERN } from "./skills";
import { parseAllocation, type CharacterSheet } from "./progression";
import type { BaseStats } from "./progression-data";

/**
 * Keep-alive and RTT probe: the runtime answers PING_MESSAGE with PONG_MESSAGE without waking the
 * Durable Object (WebSocket auto-response), so idle rooms can hibernate. Plain strings, not JSON.
 */
export const PING_MESSAGE = "ping";
export const PONG_MESSAGE = "pong";

export const MAX_MESSAGE_BYTES = 512;
export const MIN_MOVE_INTERVAL_MS = 100;
/** Moves the server accepts in a burst (bunched up by network jitter) before it holds to one per MIN_MOVE_INTERVAL_MS. */
export const MOVE_BURST = 4;
export const CHAT_MAX_LENGTH = 120;
/** At most CHAT_BURST messages per CHAT_WINDOW_MS per player, and at least CHAT_MIN_GAP_MS apart. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;
export const CHAT_MIN_GAP_MS = 500;
/** World chat reaches every player and costs the hub a broadcast, so it is limited much harder. */
export const WORLD_CHAT_MIN_GAP_MS = 5_000;
export const WORLD_CHAT_BURST = 3;
export const WORLD_CHAT_WINDOW_MS = 60_000;
export const CHAT_TARGET_MAX_LENGTH = 32;

/**
 * Where a chat line goes: everyone online (world), the sender's map room (map), one named player (whisper), or an
 * announcement to everyone shown in the system tab (system, only accepted from admins).
 */
export type ChatChannel = "world" | "map" | "whisper" | "system";

/** The windows one NPC can open (tabs of the same NPC): buying and selling, the blacksmith's work, brewing pills. */
export type NpcView = "shop" | "smith" | "brew";
export const CHAT_CHANNELS: readonly ChatChannel[] = ["world", "map", "whisper", "system"];
/** How far (tiles) the client-claimed start tile may differ from the server position and still be trusted. */
export const MAX_DESYNC_TILES = 3;
/** Minimum gap between stat allocations; each one is a D1 write. */
export const ALLOCATE_MIN_GAP_MS = 500;

export type ClientMessage =
  /** `x`/`y` is the exact destination and `fx`/`fy` the exact position the client starts from, in tile units; `seq` is echoed back in the ack. */
  | { t: "move"; x: number; y: number; fx: number; fy: number; seq: number }
  /** Ask to use the portal the character is standing on; the server verifies the position. */
  | { t: "portal" }
  /** `channel` defaults to "map" when absent (older clients). `to` is the recipient's name and only used for whispers. World and whisper go over the chat socket, map over the game socket. */
  | { t: "chat"; channel: ChatChannel; text: string; to?: string }
  /** Spend potential points: stat key to points. One message per confirmation, one D1 write. */
  | { t: "allocate"; points: Partial<BaseStats> }
  /** Target a monster (or, with the PK switch on, another player): the server walks into range and auto-attacks until the target dies or the player moves. */
  | { t: "attack"; id: string }
  /** Set the PK state: 0 off, 1 PK (fights players who are PK or Đồ sát), 2 Đồ sát (fights anyone). Never in a safe map. A new room starts at off; the client sends its chosen state again after each join, so it survives a change of map. */
  | { t: "pk_mode"; mode: PkMode }
  /** Bag commands name a cell, never an item id: the server resolves the item from its own copy of the bag. */
  | { t: "inv_use"; tab: number; cell: number }
  | { t: "inv_drop"; tab: number; cell: number; qty?: number }
  | { t: "inv_move"; from: BagPos; to: BagPos }
  /** Merge split stacks and order the whole bag by `mode`. */
  | { t: "inv_sort"; mode: SortMode }
  /** Split `qty` off a stack into the first free cell. */
  | { t: "inv_split"; tab: number; cell: number; qty: number }
  /** Buy the next bag tab with Linh Thạch (the price is a game setting). */
  | { t: "inv_expand"; price: number }
  /** Claim the item attached to a mail into the bag. */
  | { t: "mail_claim"; id: string }
  /** Ask for the mail list again (a gift was sent while the player is online); the server answers with `mail` and limits how often. */
  | { t: "mail_refresh" }
  /** Wear the bag item at (tab, cell). Without `slot` the server picks the first empty slot of its kind (or replaces the first). */
  | { t: "eq_equip"; tab: number; cell: number; slot?: EquipSlot }
  | { t: "eq_unequip"; slot: EquipSlot }
  /** Repair one worn piece, or all of them, for Linh Thạch. */
  /** GM only: repair worn pieces from anywhere. Players repair at the blacksmith (smith_repair). */
  | { t: "eq_repair"; slot: EquipSlot | "all" }
  /** Blacksmith: upgrade one piece, worn (`slot`) or in the bag (`tab`, `cell`); `protect` spends a Hộ Cấp Phù when it would save a level. */
  | { t: "smith_upgrade"; npc: string; slot?: EquipSlot; tab?: number; cell?: number; protect: boolean }
  /** Blacksmith: refine one piece (worn: `slot`, or in the bag: `tab`, `cell`): some stats rise towards their maximum, for refining ore and Linh Thạch. */
  | { t: "smith_refine"; npc: string; slot?: EquipSlot; tab?: number; cell?: number }
  /** Blacksmith: repair one worn piece or all of them for Linh Thạch. */
  | { t: "smith_repair"; npc: string; slot: EquipSlot | "all" }
  /** Use a skill. `target` is the monster to hit (attack skills; omitted: the current target). Heals and buffs need none. */
  | { t: "cast"; skill: string; target?: string; x?: number; y?: number; el?: SpiritualRoot }
  /** Set one hotbar slot: "" (empty), "s:<skill id>" or "i:<item type>". One slot per message, one D1 write. */
  | { t: "hotbar_set"; slot: number; v: string }
  /** Swap two hotbar slots (drag and drop): one message, one D1 write. */
  | { t: "hotbar_swap"; a: number; b: number }
  /** Use the first stack of an item type in the bag (hotbar potion slots); the server picks the stack, the client never names an item id. */
  | { t: "use_type"; type: string }
  /** Spend one Ngộ Đạo Đan on a skill to raise its mastery. */
  | { t: "skill_boost"; skill: string }
  /** Start a breakthrough with this many pills (the pills and the Linh Thạch are paid now). Moving, fighting or being hit before it ends makes it fail. */
  | { t: "bt_start"; pills: number }
  /** GM only: take the breakthrough pill for the realm to break out of (as many times as wanted). */
  | { t: "bt_claim" }
  /** GM only: call the map's boss into this room now (it still has to be free: one boss per map). */
  | { t: "boss_summon" }
  /** GM only: take the boss of this room off the map (the players cannot kill it); its claim is released so a new one can appear. */
  | { t: "boss_remove" }
  /** Stop the breakthrough in progress; it counts as a failure (the pills and the Linh Thạch are gone). */
  | { t: "bt_cancel" }
  /** Get on (true) or off (false) the flight pháp bảo. Its stats and speed only count while riding. */
  | { t: "mount"; on: boolean; fx?: number; fy?: number }
  /** Sent once after a reconnect: how the previous socket of this page ended (for the server log; changes nothing). */
  | { t: "conn_report"; code: number; reason: string; clean: boolean; downMs: number }
  /** Take a path item (a placeholder for the NPC quest): one per path per character. */
  | { t: "path_claim"; path: PathId }
  /** Take up a hướng tu: the item (and for a phụ tu the Linh Thạch) is spent; the first is the chủ tu. */
  | { t: "path_choose"; path: PathId }
  /** Make a phụ tu the chủ tu (the old chủ tu takes its place); costs Linh Thạch by the levels. */
  | { t: "path_swap"; path: PathId }
  /** Drop a path (its skills go with it); costs Linh Thạch by its level, double for the chủ tu. */
  | { t: "path_drop"; path: PathId }
  /** Talk to an NPC (the server checks the distance); a merchant answers with its stock left. */
  | { t: "npc_open"; npc: string; view?: NpcView }
  | { t: "brew_start"; npc: string; recipe: string }
  | { t: "brew_collect"; npc: string; job: string }
  /** Use the teleport array of a town to go to another main town (the server prices the trip and takes the Linh Thạch when the channel ends). */
  | { t: "waygate_go"; npc: string; to: string }
  /** Buy `qty` of one of the merchant's offers (named by id, priced by the server). */
  | { t: "shop_buy"; npc: string; offer: string; qty: number }
  /** Sell `qty` from the stack at (tab, cell) to the merchant. */
  | { t: "shop_sell"; npc: string; tab: number; cell: number; qty: number }
  /** Sell whole stacks from several cells in one go (all or nothing). At most SHOP_SELL_MANY_MAX cells, so the message stays small. */
  | { t: "shop_sell_many"; npc: string; cells: BagPos[] }
  /** Take a quest from its giver (the server checks the distance, that it is available and that nothing is in the way). */
  | { t: "quest_accept"; npc: string; quest: string }
  /** Hand a quest in: the objective is checked, then the reward and the closing of the quest commit in one batch. */
  | { t: "quest_turn_in"; npc: string; quest: string }
  /** Give up an active quest (from anywhere): it goes back to "not taken". */
  | { t: "quest_abandon"; quest: string };

/** One running effect on the character for the buff bar: id is "s:<skill>" (a buff skill) or "i:<item type>" (a potion that works over time); `ms` is the time left. */
export interface EffectView {
  id: string;
  ms: number;
}

/** Mastery of the skills that have it (root, learned, sect): level index and points towards the next level. */
export type SkillStateView = Record<string, { lv: number; xp: number }>;

/** A mail as the client sees it. `expiresInMs` is relative to when it was sent (null: never expires), so clock skew does not matter. */
export interface MailView {
  id: string;
  subject: string;
  item: ({ type: string; qty: number } & Carry) | null;
  expiresInMs: number | null;
  /** The text of an admin gift (the subject is shown as written). */
  body?: string;
  /** What an admin gift carries; the claim gives all of it or nothing. */
  gift?: { linh_thach?: number; cong_hien?: number; tien_ngoc?: number; items: Array<{ type: string; qty: number }> };
}

/** The bag as the client sees it. */
export interface BagView {
  tabs: number;
  /** Linh Thạch the next tab costs (a game setting, read when the character joins). */
  tabPrice: number;
  items: BagItem[];
}

/** Snapshot of one player: where they started walking, the path, and how long ago they started. */
/** A monster: path-based like players, so clients interpolate and the server sends updates only when the path changes. */
export interface MonsterSnapshot {
  id: string;
  kind: string;
  /** Bậc 1..9 within the map's realm, and the class (normal or one of the two rare tiers). */
  tier: number;
  rank: MonsterRank;
  /** The element rolled when it (re)spawned. */
  element: SpiritualRoot;
  path: Vec2[];
  ageMs: number;
  speed: number;
  hp: number;
  maxHp: number;
  /** A vệ binh (guard): shown with its own name and colour, attackable only with the PK state on. */
  guard?: true;
  /** The boss of the map (phase 2h): one at a time across the channels, drawn bigger and with its own name colour. */
  boss?: true;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  /** Sát nhân of the player when the snapshot was made (it falls 5 a minute while online; the client works the name colour out from it). */
  sn?: number;
  /** The PK state of the player (1 PK, 2 Đồ sát; left out when off), shown after the name. */
  pk?: PkMode;
  /** Continuous waypoints in tile units (see Vec2). */
  path: Vec2[];
  ageMs: number;
  speed: number;
  /** Riding the flight pháp bảo (left out when on foot). */
  mounted?: true;
  /** Drawn with the female body (left out for the male body; the gender itself is never sent). */
  f?: true;
  /** The weapon family in the hand (WEAPON_TYPES), left out with no weapon or a broken one: it picks the weapon sprite drawn over the body. */
  w?: string;
  /** The outfit worn (an `outfits` tuning key), left out for the plain clothes: it picks the body sprite variant. */
  o?: string;
  /** The look of the worn flight pháp bảo (`FlightStyle`), so a rider is drawn on the right one. */
  fl?: string;
}

export type ServerMessage =
  | { t: "welcome"; self: string; map: string; players: PlayerSnapshot[]; colo: string; character: CharacterSheet; monsters: MonsterSnapshot[]; hp: number; maxHp: number; wallet: Wallet; bag: BagView; mail: MailView[]; constitutions: ConstitutionCatalog; equipped: EquippedItem[]; skills: string[]; hotbar: string[]; mp: number; maxMp: number; cd: Record<string, number>; regenInMs: number; effects: EffectView[]; skillStates: SkillStateView; gearSets?: string[][]; tuning: Tuning; npcs: NpcSpot[]; mapRecipe?: MapRecipe; mapNames?: Record<string, string>; items?: ItemOverlay[]; mutant?: Pick<ElementTuning, "mutantRootChancePermille" | "mutantSkillBonusPct" | "mutantGearBonusPct" | "mutantGearDropPermille"> }
  | { t: "joined"; player: PlayerSnapshot }
  /** What a player holds or wears changed (a weapon or a robe put on, taken off or broken): `w` is the weapon family and `o` the outfit, each left out for none. */
  | { t: "look"; id: string; w?: string; o?: string; fl?: string }
  | { t: "left"; id: string }
  | { t: "path"; player: PlayerSnapshot }
  /** Reply to the mover. `player` is present only when the server corrected or rejected the move. */
  | { t: "ack"; seq: number; player?: PlayerSnapshot }
  | { t: "kicked"; reason: string }
  /** The character moved to another map; the client reconnects and receives a fresh welcome. */
  | { t: "transfer"; map: string }
  /** `id`/`name` is the sender. For a whisper the sender's own copy also carries `toName`. */
  | { t: "chat"; channel: ChatChannel; id: string; name: string; text: string; ts: number; toName?: string }
  | { t: "chat_error"; reason: "rate" | "invalid" | "offline" | "forbidden" }
  /** Current character sheet; sent after every allocation attempt (also when it was rejected). */
  | { t: "stats"; character: CharacterSheet }
  /** Whether you are riding the flight pháp bảo now (also sent when it comes off by itself), or why getting on failed. */
  | { t: "mounted"; on: boolean; error?: "no_flight" | "broken" | "busy" | "requirements" }
  /** A monster appeared or changed its path. */
  | { t: "mon"; monster: MonsterSnapshot }
  /** A monster left the room. `dead` when it was killed (the client plays its death before dropping it). */
  | { t: "mon_gone"; id: string; dead?: true }
  /** One attack landed (or missed). `hp` is the target's HP afterwards; `to` is a monster id or a character id. */
  /** `ret`: a player answering a blow (not an attack of their own: it does not make them grey to the one they hit back). */
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number; skill?: string; ret?: true; aoe?: true }
  /** The receiving character's own HP changed (regeneration or damage). */
  | { t: "hp"; hp: number; maxHp: number }
  /** One of the receiving character's balances changed; `gained` is the amount just added, when it is a gain. */
  | { t: "wallet"; currency: Currency; balance: number; gained?: number }
  /** Bag contents. `full` replaces everything; otherwise `items` are added or changed (by id) and `removed` are deleted. */
  | { t: "inv"; full: boolean; tabs: number; items: BagItem[]; removed: string[]; tabPrice?: number }
  /** Items from a kill: `mailed` ones did not fit in the bag and were sent by mail (claim them in time). */
  | { t: "loot"; items: Array<{ type: string; qty: number; mailed: boolean }> }
  /** The current unclaimed mail (full list). */
  | { t: "mail"; mail: MailView[] }
  /** Sent on the chat socket when a gift was sent to the player: the client answers with `mail_refresh` on the game socket. */
  | { t: "mail_new" }
  /** The merchant's stock for today: units this character can still buy of each offer that has a daily limit. */
  | { t: "shop"; npc: string; left: Record<string, number>; tuning: Tuning; merchant: MerchantDef; tabs: NpcView[] }
  /** A trade went through: `total` Linh Thạch paid (buy) or received (sell). */
  | { t: "shop_ok"; op: "buy" | "sell"; item: string; qty: number; total: number }
  /** A multi-item sale went through: `count` stacks sold for `total` Linh Thạch. */
  | { t: "shop_sold"; count: number; total: number }
  /** Your own PvP state: the PK switch and the three scores (sát nhân as of now; it keeps falling 5 a minute while you are online). */
  | { t: "pk"; mode: PkMode; satKhi: number; satNhan: number; hero: number }
  /** A PvP command was refused: the PK switch is off, the map is safe, or someone is under the newbie protection. */
  | { t: "pk_error"; reason: "off" | "safe" | "protected" | "invalid" }
  /** How many players are in the room (a combat map only tells a player about those near them, so the count cannot be taken from the list). */
  | { t: "online"; n: number }
  /** The server lost its record of what this client has been shown (the room was rebuilt): forget every monster, they are sent again as they come into view. */
  | { t: "mon_reset" }
  /** The sát nhân of a player changed (a kill or a death): everyone in the room recolours the name. */
  | { t: "pk_score"; id: string; sn: number }
  /** The PK state of a player in the room changed (the tag after their name). */
  | { t: "pk_state"; id: string; mode: PkMode }
  /** A player killed by another lost an item to the killer's mailbox: `role` says which side this message is for ("lost": no killer to receive it, a guard or monster killed the player and the item is gone), `other` is the other player's name. */
  | { t: "pk_drop"; role: "killer" | "victim" | "lost"; item: string; qty: number; other: string }
  /** A player killed by another lost an item to the killer's mailbox: `role` says which side this message is for, `other` is the other player's name. */
  | { t: "pk_drop"; role: "killer" | "victim"; item: string; qty: number; other: string }
  /** A kill ended the quarrel with this player: forget that they attacked you (the grey name). */
  | { t: "pk_clear"; id: string }
  /** The quests a giver has (all enabled ones plus any the character is on) and the character's progress on them. */
  | { t: "quests"; npc: string; defs: QuestDef[]; states: Record<string, QuestProgressView>; need?: number }
  /** Every quest the character has taken (active and done) with its progress: sent on joining and after a quest is accepted, handed in or given up. */
  | { t: "quest_active"; defs: QuestDef[]; states: Record<string, QuestProgressView> }
  /** Progress of an active quest changed (a kill, or talking to the NPC). */
  | { t: "quest_progress"; quest: string; progress: number }
  /** A quest was handed in: the reward is already in the bag and the wallet. */
  | { t: "quest_done"; quest: string }
  | { t: "quest_error"; reason: "level" | "claimed" | "far" | "locked" | "not_active" | "not_ready" | "full" | "busy" | "invalid" | "already" | "rate" | "owned" | "murderer" }
  /** A teleport talisman is being channelled for `ms`; the talisman is only used up when it completes. */
  | { t: "tp"; ms: number; item: string }
  /** A skill went off (drawn for everyone who sees the caster): `id` cast `skill` at `to` (a monster or player), or to the point x,y (a teleport), in element `el`. */
  | { t: "fx"; id: string; skill: string; to?: string; x?: number; y?: number; el?: string }
  /** The boss struck in a cone from (x, y) towards (ax, ay): reach in tiles and half the opening in degrees. */
  /** A guard used one of its skills (`mend`, `ward`, `burst`, `slash`): its robe shows the light of it for a moment. */
  | { t: "fx_guard"; id: string; skill: string }
  | { t: "fx_cone"; id: string; x: number; y: number; ax: number; ay: number; range: number; half: number }
  /** A player started (`on`) or ended a long channel: a breakthrough ("bt") or a teleport ("tp": talisman or array). `ok` says how it ended. */
  | { t: "fx_channel"; id: string; what: "bt" | "tp"; on: boolean; ok?: boolean }
  /** The destinations of a teleport array with their prices (sent when it is opened). */
  | { t: "waygate"; npc: string; dests: WaygateDest[] }
  /** The channelling ended: `ok` means the character is on its way (the talisman is used up); otherwise `reason` says why it stopped and nothing was lost. */
  | { t: "tp_end"; ok: boolean; reason?: "moved" | "hit" | "dead" | "no_item" | "money" | "other" }
  | { t: "inv_error"; reason: "moving" | "breaking" | "far" | "sold_out" | "unsellable" | "invalid" | "rate" | "full" | "not_needed" | "cooldown" | "expired" | "busy" | "wait" | "no_room" | "max_tabs" | "price_changed" | "no_pill" | "no_skill" | EquipBlock | "nothing" | "funds" | "known" | "level_low" | "murderer" | "smith_max" | "smith_full" | "smith_mats" | "smith_scroll" | "smith_item" | "forbidden" | "brew_mats" | "brew_limit" | "brew_wait"; retryMs?: number }
  /** The skills the character can use (unlocked basic ones plus learned books); sent on join, on a stage-up and after learning one. */
  | { t: "skills"; ids: string[] }
  /** Mastery of one skill changed (`up`: it reached a new level). */
  | { t: "skill_state"; id: string; lv: number; xp: number; up?: boolean }
  | { t: "hotbar"; slots: string[] }
  /** MP right now. It then regenerates by `perSec` (fraction of max) per second after `regenInMs` (nothing before that). */
  | { t: "mp"; mp: number; maxMp: number; regenInMs: number; perSec: number }
  /** A skill went off; its cooldown runs for `cdMs`. */
  | { t: "cast_ok"; skill: string; cdMs: number }
  | { t: "cast_error"; skill: string; reason: "unknown" | "mp" | "cooldown" | "no_target" | "weapon" | "town" | "dead" | "range" | "blocked" }
  /** Every effect running on the character right now (full list; sent whenever one starts or ends). */
  | { t: "effects"; list: EffectView[] }
  /** A buff started on the character and lasts `ms`. */
  | { t: "buff"; skill: string; ms: number }
  /** The worn pieces (full list; sent whenever anything about them changed). */
  | { t: "eq"; items: EquippedItem[] }
  /** Pieces that came off on their own (broken by a death, or the wearer no longer qualifies). `mailed`: the bag was full, claim them from mail. */
  | { t: "eq_removed"; items: Array<{ type: string; reason: EquipBlock; mailed: boolean }> }
  /** The character died with gear on: every worn piece lost durability (the `eq` list that precedes this has the new values). */
  | { t: "eq_worn" }
  /** A repair was paid for. */
  | { t: "repaired"; cost: number }
  /** The blacksmith's window: the upgrade rules and the extra success chance (percent) each of your pieces has built up from failures. */
  | { t: "brew"; npc: string; jobs: BrewJobView[]; tuning: Tuning; tabs: NpcView[]; now: number }
  | { t: "smith"; npc: string; levels: EnhanceLevelDef[]; pity: Record<string, number>; tuning: Tuning; tabs: NpcView[] }
  /** The outcome of a refining: what each stat gained (empty: nothing rose this time). */
  | { t: "smith_refined"; id: string; gains: Record<string, number> }
  /** The outcome of an upgrade: the piece, whether it worked, its level now, whether a level was lost or a Hộ Cấp Phù used, and its new bonus chance. */
  | { t: "smith_result"; id: string; success: boolean; level: number; dropped: boolean; scrollUsed: boolean; pity: number }
  /** The receiving character died; a transfer to town follows. */
  | { t: "died"; expLost: number }
  /** A breakthrough started: it ends in `ms` unless interrupted, with `ratePct` percent chance. */
  | { t: "bt"; ms: number; ratePct: number; pills: number; bonus: number }
  /** A breakthrough ended. `ok` false: `reason` says why (`timeout` means the roll failed). `expLost` on failure; `points` and `realm` on success. */
  | { t: "bt_end"; ok: boolean; reason: BreakthroughEnd; expLost?: number; points?: number; realm?: number }
  | { t: "bt_error"; reason: BreakthroughError }
  | { t: "path_error"; reason: PathError }
  /** A path item was handed out. */
  | { t: "path_claimed"; path: PathId }
  | { t: "bt_claimed"; item: string }

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** A bag cell inside the largest bag any character can own; the server checks it against the character's own tab count. */
function cellOk(tab: number, cell: number): boolean {
  return tab >= 0 && tab < MAX_BAG_TABS && cell >= 0 && cell < BAG_CELLS_PER_TAB;
}

function parseBagPos(v: unknown): BagPos | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  return isInt(p.tab) && isInt(p.cell) && cellOk(p.tab, p.cell) ? { tab: p.tab, cell: p.cell } : null;
}

function isNpcId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9_]{1,24}$/.test(v);
}

/** A finite coordinate in a sane range; the server still validates it against the map. */
function isCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -1 && v <= 1024;
}

/** Validates untrusted client input. Returns null when the message is malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case "move":
      if (!isCoord(m.x) || !isCoord(m.y) || !isCoord(m.fx) || !isCoord(m.fy) || !isInt(m.seq)) return null;
      return { t: "move", x: m.x, y: m.y, fx: m.fx, fy: m.fy, seq: m.seq };
    case "portal":
      return { t: "portal" };
    case "chat": {
      if (typeof m.text !== "string") return null;
      const text = normalizeChatText(m.text);
      if (!text) return null;
      const channel = m.channel === undefined ? "map" : m.channel;
      if (!CHAT_CHANNELS.includes(channel as ChatChannel)) return null;
      if (channel !== "whisper") return { t: "chat", channel: channel as ChatChannel, text };
      const to = typeof m.to === "string" ? normalizeChatTarget(m.to) : null;
      return to ? { t: "chat", channel: "whisper", text, to } : null;
    }
    case "allocate": {
      const points = parseAllocation(m.points);
      return points ? { t: "allocate", points } : null;
    }
    case "attack":
      return isCombatTargetId(m.id) ? { t: "attack", id: m.id } : null;
    case "pk_mode":
      return isPkMode(m.mode) ? { t: "pk_mode", mode: m.mode } : null;
    case "inv_use":
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) ? { t: "inv_use", tab: m.tab, cell: m.cell } : null;
    case "inv_drop": {
      if (!isInt(m.tab) || !isInt(m.cell) || !cellOk(m.tab, m.cell)) return null;
      if (m.qty === undefined) return { t: "inv_drop", tab: m.tab, cell: m.cell };
      return isInt(m.qty) && m.qty >= 1 && m.qty <= 9999 ? { t: "inv_drop", tab: m.tab, cell: m.cell, qty: m.qty } : null;
    }
    case "inv_move": {
      const from = parseBagPos(m.from);
      const to = parseBagPos(m.to);
      return from && to ? { t: "inv_move", from, to } : null;
    }
    case "inv_expand":
      return isInt(m.price) && m.price >= 0 && m.price <= 1_000_000 ? { t: "inv_expand", price: m.price } : null;
    case "inv_sort":
      return typeof m.mode === "string" && (SORT_MODES as readonly string[]).includes(m.mode) ? { t: "inv_sort", mode: m.mode as SortMode } : null;
    case "inv_split":
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) && isInt(m.qty) && m.qty >= 1 && m.qty <= 9999
        ? { t: "inv_split", tab: m.tab, cell: m.cell, qty: m.qty }
        : null;
    case "cast": {
      if (typeof m.skill !== "string" || !/^[a-z0-9_]{1,32}$/.test(m.skill)) return null;
      // An attack skill without a fixed element says which of the character's elements to use.
      let el: SpiritualRoot | undefined;
      if (m.el !== undefined) {
        if (typeof m.el !== "string" || !(ALL_ROOTS as readonly string[]).includes(m.el)) return null;
        el = m.el as SpiritualRoot;
      }
      const withEl = el ? { el } : {};
      // A teleport, or an attack aimed at a point instead of a target, names a point.
      if (m.x !== undefined || m.y !== undefined) return isCoord(m.x) && isCoord(m.y) ? { t: "cast", skill: m.skill, x: m.x, y: m.y, ...withEl } : null;
      if (m.target === undefined) return { t: "cast", skill: m.skill, ...withEl };
      return isCombatTargetId(m.target) ? { t: "cast", skill: m.skill, target: m.target, ...withEl } : null;
    }
    case "hotbar_set":
      return isInt(m.slot) && m.slot >= 0 && m.slot < HOTBAR_SLOTS && typeof m.v === "string" && HOTBAR_SLOT_PATTERN.test(m.v) ? { t: "hotbar_set", slot: m.slot, v: m.v } : null;
    case "hotbar_swap":
      return isInt(m.a) && isInt(m.b) && m.a >= 0 && m.b >= 0 && m.a < HOTBAR_SLOTS && m.b < HOTBAR_SLOTS && m.a !== m.b ? { t: "hotbar_swap", a: m.a, b: m.b } : null;
    case "use_type":
      return typeof m.type === "string" && /^[a-z0-9_.]{1,60}$/.test(m.type) ? { t: "use_type", type: m.type } : null;
    case "bt_claim":
      return { t: "bt_claim" };
    case "bt_start":
      return isInt(m.pills) && m.pills >= 1 && m.pills <= 9 ? { t: "bt_start", pills: m.pills } : null;
    case "boss_remove":
      return { t: "boss_remove" };
    case "boss_summon":
      return { t: "boss_summon" };
    case "bt_cancel":
      return { t: "bt_cancel" };
    case "mount":
      if (typeof m.on !== "boolean") return null;
      if (m.fx !== undefined || m.fy !== undefined) return isCoord(m.fx) && isCoord(m.fy) ? { t: "mount", on: m.on, fx: m.fx, fy: m.fy } : null;
      return { t: "mount", on: m.on };
    case "conn_report":
      return isInt(m.code) && typeof m.reason === "string" && typeof m.clean === "boolean" && isInt(m.downMs)
        ? { t: "conn_report", code: m.code, reason: m.reason.slice(0, 80), clean: m.clean, downMs: Math.min(Math.max(m.downMs, 0), 86_400_000) }
        : null;
    case "path_claim":
      return isPathId(m.path) ? { t: "path_claim", path: m.path } : null;
    case "path_choose":
      return isPathId(m.path) ? { t: "path_choose", path: m.path } : null;
    case "path_swap":
      return isPathId(m.path) ? { t: "path_swap", path: m.path } : null;
    case "path_drop":
      return isPathId(m.path) ? { t: "path_drop", path: m.path } : null;
    case "skill_boost":
      return typeof m.skill === "string" && /^[a-z0-9_]{1,32}$/.test(m.skill) ? { t: "skill_boost", skill: m.skill } : null;
    case "eq_equip": {
      if (!isInt(m.tab) || !isInt(m.cell) || !cellOk(m.tab, m.cell)) return null;
      if (m.slot === undefined) return { t: "eq_equip", tab: m.tab, cell: m.cell };
      return isEquipSlot(m.slot) ? { t: "eq_equip", tab: m.tab, cell: m.cell, slot: m.slot } : null;
    }
    case "eq_unequip":
      return isEquipSlot(m.slot) ? { t: "eq_unequip", slot: m.slot } : null;
    case "eq_repair":
      return m.slot === "all" || isEquipSlot(m.slot) ? { t: "eq_repair", slot: m.slot as EquipSlot | "all" } : null;
    case "smith_upgrade": {
      if (!isNpcId(m.npc) || typeof m.protect !== "boolean") return null;
      if (m.slot !== undefined) return isEquipSlot(m.slot) ? { t: "smith_upgrade", npc: m.npc, slot: m.slot, protect: m.protect } : null;
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) ? { t: "smith_upgrade", npc: m.npc, tab: m.tab, cell: m.cell, protect: m.protect } : null;
    }
    case "smith_refine": {
      if (!isNpcId(m.npc)) return null;
      if (m.slot !== undefined) return isEquipSlot(m.slot) ? { t: "smith_refine", npc: m.npc, slot: m.slot } : null;
      return isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) ? { t: "smith_refine", npc: m.npc, tab: m.tab, cell: m.cell } : null;
    }
    case "smith_repair":
      return isNpcId(m.npc) && (m.slot === "all" || isEquipSlot(m.slot)) ? { t: "smith_repair", npc: m.npc, slot: m.slot as EquipSlot | "all" } : null;
    case "npc_open":
      if (!isNpcId(m.npc)) return null;
      if (m.view === undefined) return { t: "npc_open", npc: m.npc };
      return m.view === "shop" || m.view === "smith" || m.view === "brew" ? { t: "npc_open", npc: m.npc, view: m.view } : null;
    case "brew_start":
      return isNpcId(m.npc) && typeof m.recipe === "string" && /^[a-z0-9_]{1,40}$/.test(m.recipe) ? { t: "brew_start", npc: m.npc, recipe: m.recipe } : null;
    case "brew_collect":
      return isNpcId(m.npc) && typeof m.job === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.job) ? { t: "brew_collect", npc: m.npc, job: m.job } : null;
    case "waygate_go":
      return isNpcId(m.npc) && typeof m.to === "string" && MAP_ID_PATTERN.test(m.to) ? { t: "waygate_go", npc: m.npc, to: m.to } : null;
    case "shop_buy":
      return isNpcId(m.npc) && typeof m.offer === "string" && /^[a-z0-9_.]{1,60}$/.test(m.offer) && isInt(m.qty) && m.qty >= 1 && m.qty <= MAX_SHOP_QTY
        ? { t: "shop_buy", npc: m.npc, offer: m.offer, qty: m.qty }
        : null;
    case "shop_sell":
      return isNpcId(m.npc) && isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) && isInt(m.qty) && m.qty >= 1 && m.qty <= 9999
        ? { t: "shop_sell", npc: m.npc, tab: m.tab, cell: m.cell, qty: m.qty }
        : null;
    case "shop_sell_many": {
      if (!isNpcId(m.npc) || !Array.isArray(m.cells) || m.cells.length < 1 || m.cells.length > SHOP_SELL_MANY_MAX) return null;
      const cells: BagPos[] = [];
      for (const c of m.cells) {
        const pos = parseBagPos(c);
        if (!pos || cells.some((o) => o.tab === pos.tab && o.cell === pos.cell)) return null;
        cells.push(pos);
      }
      return { t: "shop_sell_many", npc: m.npc, cells };
    }
    case "quest_accept":
    case "quest_turn_in":
      return isNpcId(m.npc) && typeof m.quest === "string" && /^[a-z0-9_]{1,40}$/.test(m.quest) ? { t: m.t, npc: m.npc, quest: m.quest } : null;
    case "quest_abandon":
      return typeof m.quest === "string" && /^[a-z0-9_]{1,40}$/.test(m.quest) ? { t: "quest_abandon", quest: m.quest } : null;
    case "mail_refresh":
      return { t: "mail_refresh" };
    case "mail_claim":
      return typeof m.id === "string" && m.id.length > 0 && m.id.length <= 64 ? { t: "mail_claim", id: m.id } : null;
    default:
      return null;
  }
}

/** A whisper recipient's name: trimmed, no control characters, at most CHAT_TARGET_MAX_LENGTH characters. */
export function normalizeChatTarget(raw: string): string | null {
  const name = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const chars = [...name];
  return chars.length === 0 || chars.length > CHAT_TARGET_MAX_LENGTH ? null : name;
}

/** Strips control characters, collapses whitespace and caps the length. Returns null for empty text. */
export function normalizeChatText(raw: string): string | null {
  const text = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  if (chars.length === 0) return null;
  return chars.slice(0, CHAT_MAX_LENGTH).join("");
}

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
import type { MarketCfg, MarketCurrency, MarketKind, MarketListingView } from "./market";
import type { TradeEnd, TradeError, TradeSideView } from "./trade";
import { SECT_APPOINTABLE, type SectError, type SectListItem, type SectRankItem, type SectRole, type SectVaultItemView, type SectView } from "./sect";
import type { MerchantDef } from "./merchants";
import type { MapRecipe, NpcSpot } from "./map";
import type { ItemOverlay } from "./items";
import type { ElementTuning } from "./element-tuning";
import { MAP_ID_PATTERN } from "./map";
import type { WaygateDest } from "./waygate";
import { isEquipSlot, type EquipBlock, type EquipSlot, type EquippedItem } from "./equipment-data";
import type { GearLook } from "./gear-look";
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
 * announcement to everyone shown in the system tab (system, only accepted from admins), or the members of the sender's sect (sect).
 */
export type ChatChannel = "world" | "map" | "whisper" | "system" | "sect";

/** The windows one NPC can open (tabs of the same NPC): buying and selling, the blacksmith's work, brewing pills. */
export type NpcView = "shop" | "smith" | "brew" | "learn" | "market";
export const CHAT_CHANNELS: readonly ChatChannel[] = ["world", "map", "whisper", "system", "sect"];
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
  /** Direct trade: ask the player `to` (a character id in this room) to trade. */
  | { t: "trade_invite"; to: string }
  /** Direct trade: answer the invitation of `from`. */
  | { t: "trade_reply"; from: string; accept: boolean }
  /** Direct trade: put these bag items (by id, whole stacks) and this much Linh Thạch in your side; both sides' locks and agreements are undone. */
  | { t: "trade_offer"; items: string[]; linh: number; tienNgoc: number }
  /** Direct trade: put `qty` of the bag item `id` in your side (a part of a stack is split off first); undoes the locks like an offer. */
  | { t: "trade_add"; id: string; qty: number }
  /** Direct trade: lock (or unlock) your side. `rev` is the version of the window you saw: a change in between makes the server refuse. */
  | { t: "trade_lock"; rev: number; on: boolean }
  /** Direct trade: agree to the trade as it stands (needs both sides locked). When both agree it happens. */
  | { t: "trade_confirm"; rev: number }
  | { t: "trade_cancel" }
  /** Sect: ask for the player's own sect (and the wait before joining another), refreshed whenever the window opens. */
  | { t: "sect_get" }
  /** Sect: the list of sects open to applications. */
  | { t: "sect_list" }
  /** Sect: found one (the player must stand by a sect NPC, `npc`). */
  | { t: "sect_create"; npc: string; name: string }
  /** Sect: apply to join (or withdraw the application). */
  | { t: "sect_apply"; sect: string; on: boolean }
  /** Sect: accept or turn down the application of `id`. */
  | { t: "sect_answer"; id: string; ok: boolean }
  /** Sect: invite a player standing near. */
  | { t: "sect_invite"; to: string }
  /** Sect: answer the invitation of `from`. */
  | { t: "sect_reply"; from: string; accept: boolean }
  | { t: "sect_leave" }
  | { t: "sect_kick"; id: string }
  | { t: "sect_role"; id: string; role: SectRole }
  /** Sect: hand the leadership to a member (the leader becomes a deputy). */
  | { t: "sect_transfer"; id: string }
  /** Sect (leader): close the sect and divide its fund and warehouse: all to the leader, or by cống hiến. */
  | { t: "sect_disband"; mode: "leader" | "share" }
  | { t: "sect_notice"; text: string }
  /** Sect: give Linh Thạch to the sect (cống hiến, the fund and the exp grow). */
  | { t: "sect_donate"; amount: number }
  /** Sect: raise the sect to the next level. */
  | { t: "sect_upgrade" }
  /** Sect: take this week's pay of the player's rank. */
  | { t: "sect_weekly" }
  /** Sect (leader): what each rank is paid a week, by rank (index 0 disciple .. 5 leader). */
  | { t: "sect_weekly_set"; amounts: number[]; items?: Array<{ item: string; qty: number } | null> }
  /** Sect: buy a line of the sect shop with cống hiến (the player must stand by a sect NPC, `npc`). */
  | { t: "sect_buy"; npc: string; item: string }
  | { t: "sect_skill_buy"; npc: string; skill: string }
  /** Sect: ask for the warehouse list (the Kho tab and the shelf of the shop). */
  | { t: "sect_vault" }
  /** Sect: hand in the items of a daily task (the player must stand by a sect NPC, `npc`). */
  | { t: "sect_task"; npc: string; id: string }
  /** Sect: the ranking of the sects. */
  | { t: "sect_rank" }
  /** Sect: put `qty` of a bag item in the warehouse (it earns cống hiến if the leader's list takes it). */
  | { t: "sect_put"; id: string; qty: number }
  /** Sect (leader): take a warehouse stack out, to a member (the leader included) by mail. */
  | { t: "sect_take"; id: string; to: string }
  /** Sect (leader): put a warehouse stack on the shop shelf for Linh Thạch or cống hiến, or take it off the shelf (`currency` null). */
  | { t: "sect_shelf"; id: string; currency: "linh_thach" | "cong_hien" | null; price: number }
  /** Sect: buy a shelf stack (by mail; the player must stand by a sect NPC, `npc`). */
  | { t: "sect_shelf_buy"; npc: string; id: string }
  /** Sect (leader): what the warehouse takes: a percent for each kind of item and the lowest grade. */
  | { t: "sect_accept"; cats: Record<string, number>; minGrade: number }
  /** Claim every mail in one go (the ones that do not fit stay in the mailbox). */
  | { t: "mail_claim_all" }
  /** Vạn Bảo Lâu: read this town's listings again (the window asks while it is open; cheaper to call than `npc_open`). */
  | { t: "market_list"; npc: string }
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
  /** The attack used instead of the plain one when a monster is clicked or Auto fights: `skill` the basic qi blast (with the element `el`) or "" for the plain attack. The client keeps the choice and sends it at every welcome. */
  | { t: "primary"; skill: string; el?: SpiritualRoot }
  /** Set one hotbar slot: "" (empty), "s:<skill id>" or "i:<item type>". One slot per message, one D1 write. */
  | { t: "hotbar_set"; slot: number; v: string }
  /** Swap two hotbar slots (drag and drop): one message, one D1 write. */
  | { t: "hotbar_swap"; a: number; b: number }
  /** Use the first stack of an item type in the bag (hotbar potion slots); the server picks the stack, the client never names an item id. */
  | { t: "use_type"; type: string }
  /** Spend one Ngộ Đạo Đan on a skill to raise its mastery. */
  | { t: "skill_boost"; skill: string }
  /** Forget a skill learned from a book or a master (its mastery goes with it; the book is not given back). */
  | { t: "skill_forget"; skill: string }
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
  /** Sit down to meditate (HP and MP regenerate) or stand up again. Walking, attacking or being hit stands the character up. */
  | { t: "meditate"; on: boolean }
  /** Sent now and then while sitting: the server settles the EXP of the stretch since the last one (it also does at standing up). */
  | { t: "med_tick" }
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
  | { t: "brew_start"; npc: string; recipe: string; /** Batches made in one run (absent: 1). */ count?: number }
  | { t: "brew_collect"; npc: string; job: string }
  | { t: "dojo_learn"; npc: string; skill: string }
  /** Vạn Bảo Lâu: put the stack at (tab, cell) up for sale, `qty` of it, asking `price` Linh Thạch (an auction: the start price). */
  | { t: "market_post"; npc: string; kind: MarketKind; currency: MarketCurrency; tab: number; cell: number; qty: number; price: number }
  /** Buy a fixed-price listing of this town. */
  | { t: "market_buy"; npc: string; id: string }
  /** Bid on an auction listing of this town (the amount is paid now; an outbid bidder gets it back by mail). */
  | { t: "market_bid"; npc: string; id: string; amount: number }
  /** Take your own listing down (an auction only while nobody has bid). The item comes back by mail. */
  | { t: "market_cancel"; npc: string; id: string }
  /** Announce your own listing to the town (the NPC speaks); costs a fee and needs a high-grade item. */
  | { t: "market_promote"; npc: string; id: string }
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
  /** Sitting in meditation (left out when not): the figure is drawn sitting, with healing motes round it. */
  med?: true;
  /** How the worn weapon, robe, hat and boots change the look (see gear-look.ts), left out when none is worn. */
  lk?: GearLook;
  /** The cultivation level, `realm * 10 + stage`: it sets the colour and strength of the qi drawn round the figure. */
  lv?: number;
  /** The name of the sect the player is in, left out for none: drawn above the name. */
  sc?: string;
}

export type ServerMessage =
  | { t: "welcome"; self: string; map: string; players: PlayerSnapshot[]; colo: string; character: CharacterSheet; monsters: MonsterSnapshot[]; hp: number; maxHp: number; wallet: Wallet; bag: BagView; mail: MailView[]; constitutions: ConstitutionCatalog; equipped: EquippedItem[]; skills: string[]; hotbar: string[]; mp: number; maxMp: number; cd: Record<string, number>; regenInMs: number; effects: EffectView[]; skillStates: SkillStateView; gearSets?: string[][]; tuning: Tuning; npcs: NpcSpot[]; mapRecipe?: MapRecipe; mapNames?: Record<string, string>; items?: ItemOverlay[]; mutant?: Pick<ElementTuning, "mutantRootChancePermille" | "mutantSkillBonusPct" | "mutantGearBonusPct" | "mutantGearDropPermille"> }
  | { t: "joined"; player: PlayerSnapshot }
  /** What a player holds or wears changed (a weapon or a robe put on, taken off or broken): `w` is the weapon family and `o` the outfit, each left out for none. */
  | { t: "look"; id: string; w?: string; o?: string; fl?: string; lk?: GearLook; lv?: number }
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
  /** Whether the character meditates now. `reason` when it stopped by itself: hit, moved (also an attack or a skill), died, or refused (`safe`: a town needs no meditation, `busy`: a breakthrough or a talisman runs). */
  | { t: "meditating"; on: boolean; reason?: "hit" | "moved" | "died" | "safe" | "busy" }
  /** A player sat down to meditate or stood up (the others draw the pose and the motes). */
  | { t: "sit"; id: string; on: boolean }
  /** HP and MP regenerated per second now (points, may be fractional): sent when meditation starts or ends, when the gear or the maximums change, and at the join. */
  | { t: "regen"; hp: number; mp: number }
  /** A monster appeared or changed its path. */
  | { t: "mon"; monster: MonsterSnapshot }
  /** A monster left the room. `dead` when it was killed (the client plays its death before dropping it). */
  | { t: "mon_gone"; id: string; dead?: true }
  /** One attack landed (or missed). `hp` is the target's HP afterwards; `to` is a monster id or a character id. */
  /** `ret`: a player answering a blow (not an attack of their own: it does not make them grey to the one they hit back). */
  | { t: "hit"; from: string; to: string; kind: HitKind; damage: number; hp: number; skill?: string; ret?: true; aoe?: true; /** One tick of a lasting zone: a light reaction, no swing. */ dot?: true }
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
  /** Someone asks this player to trade (answer with `trade_reply`; `ttlMs` is how long it stands). */
  | { t: "trade_invite"; from: string; name: string; ttlMs: number }
  /** The trade window: `rev` changes with every offer; `mine` and `theirs` are the two sides. */
  | { t: "trade"; rev: number; other: { id: string; name: string }; mine: TradeSideView; theirs: TradeSideView; cfg: { maxItems: number; maxLinh: number; maxTienNgoc: number } }
  | { t: "trade_end"; reason: TradeEnd }
  | { t: "trade_error"; reason: TradeError }
  /** The player's sect (null: none) and, when it is none, when they may join one. */
  | { t: "sect"; view: SectView | null; cooldownUntil: number }
  | { t: "sect_dir"; sects: SectListItem[] }
  | { t: "sect_vault"; items: SectVaultItemView[] }
  | { t: "sect_ranks"; sects: SectRankItem[]; mine: number | null }
  | { t: "sect_error"; reason: SectError }
  /** Someone invites this player to a sect. */
  | { t: "sect_invite"; from: string; name: string; sect: string; ttlMs: number }
  /** Something about the player's sect changed (comes on the chat socket). `you`: it is about this player (they joined, left, were sent away or appointed): read it again at once; otherwise only a window that is open needs to. */
  | { t: "sect_changed"; you?: true }
  /** The sect shown above a player changed (left out: none). */
  | { t: "sect_label"; id: string; sc?: string }
  /** Some listing of the town's Vạn Bảo Lâu changed (`town` absent: any town): a window that is open reads the list again. */
  | { t: "market_changed"; town?: string }
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
  /** A lasting area went down (`id`: its number): `owner` cast `skill` from (x, y) towards (ax, ay), and it stays for `ms` unless `fx_zone_end` comes first. */
  | { t: "fx_zone"; id: string; owner: string; skill: string; x: number; y: number; ax: number; ay: number; ms: number; el?: string }
  | { t: "fx_zone_end"; id: string }
  | { t: "fx_cone"; id: string; x: number; y: number; ax: number; ay: number; range: number; half: number }
  /** A player started (`on`) or ended a long channel: a breakthrough ("bt") or a teleport ("tp": talisman or array). `ok` says how it ended. */
  | { t: "fx_channel"; id: string; what: "bt" | "tp"; on: boolean; ok?: boolean }
  /** The destinations of a teleport array with their prices (sent when it is opened). */
  | { t: "waygate"; npc: string; dests: WaygateDest[] }
  /** The channelling ended: `ok` means the character is on its way (the talisman is used up); otherwise `reason` says why it stopped and nothing was lost. */
  | { t: "tp_end"; ok: boolean; reason?: "moved" | "hit" | "dead" | "no_item" | "money" | "other" }
  | { t: "inv_error"; reason: "craft_level" | "moving" | "breaking" | "far" | "sold_out" | "unsellable" | "invalid" | "rate" | "full" | "not_needed" | "cooldown" | "expired" | "busy" | "wait" | "no_room" | "max_tabs" | "price_changed" | "no_pill" | "no_skill" | EquipBlock | "nothing" | "funds" | "known" | "level_low" | "murderer" | "smith_max" | "smith_full" | "smith_mats" | "smith_scroll" | "smith_item" | "forbidden" | "brew_mats" | "brew_limit" | "brew_wait"; retryMs?: number }
  /** The skills the character can use (unlocked basic ones plus learned books); sent on join, on a stage-up and after learning one. */
  | { t: "skills"; ids: string[] }
  /** Mastery of one skill changed (`up`: it reached a new level). */
  | { t: "skill_state"; id: string; lv: number; xp: number; up?: boolean }
  | { t: "skill_forgot"; skill: string }
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
  | { t: "brew"; npc: string; craft: "alchemy" | "forge"; /** The character's exp in this trade (the level follows from the tuning). */ craftExp: number; jobs: BrewJobView[]; tuning: Tuning; tabs: NpcView[]; now: number }
  /** The martial master's courses this character can still take (what is already known is left out), each with its cost in Linh Thạch. */
  | { t: "dojo"; npc: string; courses: Array<{ skill: string; cost: number; ok: boolean }> }
  | { t: "dojo_ok"; skill: string; cost: number }
  /** Vạn Bảo Lâu's window: every open listing of this town, the numbers (tuning `market`) and whether bids are being taken now. */
  | { t: "market"; npc: string; listings: MarketListingView[]; cfg: MarketCfg; now: number; open: boolean; tabs: NpcView[] }
  /** A market action went through (`op` is what was done). */
  | { t: "market_ok"; op: "post" | "buy" | "bid" | "cancel" | "promote" }
  | { t: "market_error"; reason: MarketError }
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

/** Why a market action was refused. */
export type MarketError = "far" | "rate" | "invalid" | "funds" | "gone" | "mine" | "low" | "closed" | "limit" | "grade" | "cooldown" | "untradable" | "busy" | "murderer" | "top";

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v);

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
    case "primary": {
      if (typeof m.skill !== "string" || !/^[a-z0-9_]{0,32}$/.test(m.skill)) return null;
      if (m.el === undefined) return { t: "primary", skill: m.skill };
      return typeof m.el === "string" && (ALL_ROOTS as readonly string[]).includes(m.el) ? { t: "primary", skill: m.skill, el: m.el as SpiritualRoot } : null;
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
    case "med_tick":
      return { t: "med_tick" };
    case "meditate":
      return typeof m.on === "boolean" ? { t: "meditate", on: m.on } : null;
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
    case "skill_forget":
      return typeof m.skill === "string" && /^[a-z0-9_]{1,32}$/.test(m.skill) ? { t: "skill_forget", skill: m.skill } : null;
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
      return m.view === "shop" || m.view === "smith" || m.view === "brew" || m.view === "learn" || m.view === "market" ? { t: "npc_open", npc: m.npc, view: m.view } : null;
    case "market_post":
      return isNpcId(m.npc) && (m.kind === "fixed" || m.kind === "auction") && (m.currency === "linh_thach" || m.currency === "tien_ngoc") && isInt(m.tab) && isInt(m.cell) && cellOk(m.tab, m.cell) && isInt(m.qty) && m.qty >= 1 && m.qty <= 9999 && isInt(m.price) && m.price >= 1 && m.price <= 1_000_000_000
        ? { t: "market_post", npc: m.npc, kind: m.kind, currency: m.currency, tab: m.tab, cell: m.cell, qty: m.qty, price: m.price }
        : null;
    case "market_buy":
    case "market_cancel":
    case "market_promote":
      return isNpcId(m.npc) && typeof m.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.id) ? { t: m.t, npc: m.npc, id: m.id } : null;
    case "market_bid":
      return isNpcId(m.npc) && typeof m.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.id) && isInt(m.amount) && m.amount >= 1 && m.amount <= 1_000_000_000 ? { t: "market_bid", npc: m.npc, id: m.id, amount: m.amount } : null;
    case "brew_start":
      return isNpcId(m.npc) && typeof m.recipe === "string" && /^[a-z0-9_]{1,40}$/.test(m.recipe) ? { t: "brew_start", npc: m.npc, recipe: m.recipe, ...(typeof m.count === "number" && Number.isInteger(m.count) && m.count >= 1 && m.count <= 100 ? { count: m.count } : {}) } : null;
    case "dojo_learn":
      return isNpcId(m.npc) && typeof m.skill === "string" && /^[a-z0-9_]{1,24}$/.test(m.skill) ? { t: "dojo_learn", npc: m.npc, skill: m.skill } : null;
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
    case "trade_invite":
      return typeof m.to === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.to) ? { t: "trade_invite", to: m.to } : null;
    case "trade_reply":
      return typeof m.from === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.from) && typeof m.accept === "boolean" ? { t: "trade_reply", from: m.from, accept: m.accept } : null;
    case "trade_offer":
      return Array.isArray(m.items) && m.items.length <= 6 && m.items.every((x) => typeof x === "string" && /^[A-Za-z0-9-]{1,64}$/.test(x)) && isInt(m.linh) && m.linh >= 0 && m.linh <= 1_000_000_000 && isInt(m.tienNgoc) && m.tienNgoc >= 0 && m.tienNgoc <= 1_000_000_000
        ? { t: "trade_offer", items: m.items as string[], linh: m.linh, tienNgoc: m.tienNgoc }
        : null;
    case "trade_add":
      return typeof m.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(m.id) && isInt(m.qty) && m.qty >= 1 && m.qty <= 1_000_000 ? { t: "trade_add", id: m.id, qty: m.qty } : null;
    case "sect_get":
      return { t: "sect_get" };
    case "sect_list":
      return { t: "sect_list" };
    case "sect_create":
      return typeof m.npc === "string" && /^[a-z0-9_]{1,24}$/.test(m.npc) && typeof m.name === "string" && m.name.length <= 60 ? { t: "sect_create", npc: m.npc, name: m.name } : null;
    case "sect_apply":
      return isId(m.sect) && typeof m.on === "boolean" ? { t: "sect_apply", sect: m.sect, on: m.on } : null;
    case "sect_answer":
      return isId(m.id) && typeof m.ok === "boolean" ? { t: "sect_answer", id: m.id, ok: m.ok } : null;
    case "sect_invite":
      return isId(m.to) ? { t: "sect_invite", to: m.to } : null;
    case "sect_reply":
      return isId(m.from) && typeof m.accept === "boolean" ? { t: "sect_reply", from: m.from, accept: m.accept } : null;
    case "sect_leave":
      return { t: "sect_leave" };
    case "sect_kick":
      return isId(m.id) ? { t: "sect_kick", id: m.id } : null;
    case "sect_role":
      return isId(m.id) && typeof m.role === "string" && (SECT_APPOINTABLE as readonly string[]).includes(m.role) ? { t: "sect_role", id: m.id, role: m.role as SectRole } : null;
    case "sect_transfer":
      return isId(m.id) ? { t: "sect_transfer", id: m.id } : null;
    case "sect_disband":
      return m.mode === "leader" || m.mode === "share" ? { t: "sect_disband", mode: m.mode } : null;
    case "sect_notice":
      return typeof m.text === "string" && m.text.length <= 400 ? { t: "sect_notice", text: m.text } : null;
    case "sect_donate":
      return isInt(m.amount) && m.amount >= 1 && m.amount <= 1_000_000_000 ? { t: "sect_donate", amount: m.amount } : null;
    case "sect_upgrade":
      return { t: "sect_upgrade" };
    case "sect_weekly":
      return { t: "sect_weekly" };
    case "sect_weekly_set":
    {
      if (!(Array.isArray(m.amounts) && m.amounts.length === 6 && m.amounts.every((n) => isInt(n) && n >= 0 && n <= 1_000_000_000))) return null;
      if (m.items === undefined) return { t: "sect_weekly_set", amounts: m.amounts as number[] };
      const okItem = (x: unknown) => x === null || (typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).item === "string" && /^[A-Za-z0-9_.]{1,80}$/.test((x as Record<string, unknown>).item as string) && isInt((x as Record<string, unknown>).qty) && ((x as Record<string, number>).qty as number) >= 1 && ((x as Record<string, number>).qty as number) <= 999);
      return Array.isArray(m.items) && m.items.length === 6 && m.items.every(okItem) ? { t: "sect_weekly_set", amounts: m.amounts as number[], items: m.items as Array<{ item: string; qty: number } | null> } : null;
    }
    case "sect_vault":
      return { t: "sect_vault" };
    case "sect_task":
      return typeof m.npc === "string" && /^[a-z0-9_]{1,24}$/.test(m.npc) && typeof m.id === "string" && /^[a-z0-9_]{1,24}$/.test(m.id) ? { t: "sect_task", npc: m.npc, id: m.id } : null;
    case "sect_rank":
      return { t: "sect_rank" };
    case "sect_put":
      return isId(m.id) && isInt(m.qty) && m.qty >= 1 && m.qty <= 1_000_000 ? { t: "sect_put", id: m.id, qty: m.qty } : null;
    case "sect_take":
      return isId(m.id) && isId(m.to) ? { t: "sect_take", id: m.id, to: m.to } : null;
    case "sect_shelf":
      return isId(m.id) && (m.currency === null || m.currency === "linh_thach" || m.currency === "cong_hien") && isInt(m.price) && m.price >= 0 && m.price <= 1_000_000_000 ? { t: "sect_shelf", id: m.id, currency: m.currency, price: m.price } : null;
    case "sect_shelf_buy":
      return typeof m.npc === "string" && /^[a-z0-9_]{1,24}$/.test(m.npc) && isId(m.id) ? { t: "sect_shelf_buy", npc: m.npc, id: m.id } : null;
    case "sect_accept": {
      const cats = m.cats;
      if (typeof cats !== "object" || cats === null || Array.isArray(cats) || !isInt(m.minGrade) || m.minGrade < 1 || m.minGrade > 9) return null;
      const entries = Object.entries(cats as Record<string, unknown>);
      if (entries.length > 8 || !entries.every(([k, v]) => /^[a-z_]{1,16}$/.test(k) && isInt(v) && v >= 0 && v <= 1000)) return null;
      return { t: "sect_accept", cats: Object.fromEntries(entries) as Record<string, number>, minGrade: m.minGrade };
    }
    case "sect_skill_buy":
      return typeof m.npc === "string" && /^[a-z0-9_]{1,24}$/.test(m.npc) && typeof m.skill === "string" && /^[a-z0-9_]{1,32}$/.test(m.skill) ? { t: "sect_skill_buy", npc: m.npc, skill: m.skill } : null;
    case "sect_buy":
      return typeof m.npc === "string" && /^[a-z0-9_]{1,24}$/.test(m.npc) && typeof m.item === "string" && /^[A-Za-z0-9_.]{1,80}$/.test(m.item) ? { t: "sect_buy", npc: m.npc, item: m.item } : null;
    case "trade_lock":
      return isInt(m.rev) && m.rev >= 0 && typeof m.on === "boolean" ? { t: "trade_lock", rev: m.rev, on: m.on } : null;
    case "trade_confirm":
      return isInt(m.rev) && m.rev >= 0 ? { t: "trade_confirm", rev: m.rev } : null;
    case "trade_cancel":
      return { t: "trade_cancel" };
    case "mail_claim_all":
      return { t: "mail_claim_all" };
    case "market_list":
      return isNpcId(m.npc) ? { t: "market_list", npc: m.npc } : null;
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

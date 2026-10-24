import { BASE_SPEED, CLUSTERS, DEFAULT_TUNING, GUARD_KIND, MONSTERS, REALMS, allItemDefs, getItemDef, isEquipmentType, validTuningGroup, type LootLine, type MonsterNumbers, type Tuning } from "@game/shared";
import { logStatement } from "./admin-log";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of the monsters (docs/PHASE3.md 3j): the species (a name and the numbers of each, kept in the tuning group `monsters`, which `getMonsterDef`
 * already merges and which reaches the client with the tuning) and the loot tables (the tuning group `loot`, which `rollLoot` reads). Each save is one batch
 * guarded by the `updated_at` of its row, with the version bump of the tuning and the admin log. New species need a place on a map (3l), so they are not here.
 */
export const MONSTER_LOG_SCREEN = "Quái / BOSS";
export const SPECIES_NAME_MAX = 40;
/** The shortest respawn of a species that lives in the groups of a map: faster is endless kills, Linh Thạch and D1 writes. */
export const MIN_CLUSTER_RESPAWN_MS = 3000;

type Species = Tuning["monsters"]["species"];

interface Row {
  value: string;
  updated_at: number;
}

async function readGroup<G extends "monsters" | "loot">(db: D1Database, group: G): Promise<{ value: Tuning[G]; token: number }> {
  await getTuning(db); // seeds the group the first time
  const row = await db.prepare("SELECT value, updated_at FROM game_tuning WHERE name = ?").bind(group).first<Row>();
  let value = DEFAULT_TUNING[group];
  try {
    const parsed: unknown = row ? JSON.parse(row.value) : null;
    if (parsed && validTuningGroup(group, parsed)) value = parsed as Tuning[G];
  } catch {
    // an unreadable row counts as the defaults, as the game does
  }
  return { value: JSON.parse(JSON.stringify(value)) as Tuning[G], token: row?.updated_at ?? 0 };
}

export interface SpeciesEntry {
  id: string;
  /** The species as the code writes it: the name, the element it shows, and the numbers a reset goes back to. */
  base: { nameVi: string; element: string } & Omit<MonsterNumbers, "nameVi">;
  /** What is in force (the live numbers over the base). */
  effective: { nameVi: string } & Omit<MonsterNumbers, "nameVi">;
  changed: boolean;
  /** Where it appears: in the groups of these maps, as the boss of these maps, or as the guard. */
  maps: string[];
  bossOf: string[];
  guard: boolean;
}

const NUMBER_KEYS = ["hpMult", "attackMult", "defenseMult", "speed", "aggroRadius", "leashRadius", "attackRange", "attackCooldownMs", "respawnMs"] as const;

function numbersOf(m: MonsterNumbers): Omit<MonsterNumbers, "nameVi"> {
  return { hpMult: m.hpMult, attackMult: m.attackMult, defenseMult: m.defenseMult, speed: m.speed, aggroRadius: m.aggroRadius, leashRadius: m.leashRadius, attackRange: m.attackRange, attackCooldownMs: m.attackCooldownMs, respawnMs: m.respawnMs };
}

export async function listSpecies(db: D1Database): Promise<{ species: SpeciesEntry[]; token: number; limits: { name: number; minClusterRespawnMs: number; playerSpeed: number } }> {
  const { value, token } = await readGroup(db, "monsters");
  const boss = await getTuning(db).then((t) => t.boss.species);
  const species = Object.values(MONSTERS).map((def): SpeciesEntry => {
    const live = value.species[def.id];
    return {
      id: def.id,
      base: { nameVi: def.nameVi, element: def.element, ...numbersOf(DEFAULT_TUNING.monsters.species[def.id] ?? def) },
      effective: { nameVi: live?.nameVi ?? def.nameVi, ...numbersOf(live ?? def) },
      changed: JSON.stringify(live ?? null) !== JSON.stringify(DEFAULT_TUNING.monsters.species[def.id] ?? null),
      maps: Object.entries(CLUSTERS).flatMap(([map, list]) => (list.some((c) => c.kind === def.id) ? [map] : [])),
      bossOf: Object.entries(boss).flatMap(([map, k]) => (k === def.id ? [map] : [])),
      guard: def.id === GUARD_KIND,
    };
  });
  return { species, token, limits: { name: SPECIES_NAME_MAX, minClusterRespawnMs: MIN_CLUSTER_RESPAWN_MS, playerSpeed: BASE_SPEED } };
}

export type MonsterFailure = { ok: false; error: "unknown" | "invalid" | "unchanged" | "version_conflict"; problems?: string[] };
export type MonsterSaveResult = { ok: true; updatedAt: number; changed: string[] } | MonsterFailure;

const LABELS: Record<string, string> = { nameVi: "tên", hpMult: "hệ số sinh lực", attackMult: "hệ số công", defenseMult: "hệ số thủ", speed: "tốc độ", aggroRadius: "tầm phát hiện", leashRadius: "tầm đuổi", attackRange: "tầm đánh", attackCooldownMs: "nhịp đánh", respawnMs: "hồi sinh" };

const bump = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(at);

async function writeGroup(db: D1Database, group: "monsters" | "loot", value: unknown, token: number, adminEmail: string, content: string, now: number): Promise<MonsterFailure | { ok: true; updatedAt: number }> {
  const stamp = Math.max(now, token + 1);
  try {
    await db.batch([
      db.prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = ?").bind(token, JSON.stringify(value), stamp, adminEmail, group),
      bump(db, stamp),
      logStatement(db, { adminEmail, screen: MONSTER_LOG_SCREEN, content }, now),
    ]);
  } catch (err) {
    if (String(err).includes("game_tuning")) return { ok: false, error: "version_conflict" };
    throw err;
  }
  resetTuningCache();
  return { ok: true, updatedAt: stamp };
}

/**
 * Sets the name and numbers of a species (`fields`, merged onto what is in force; a name equal to the code's is not stored) or puts it back to the code's
 * (`null`). Checks the bounds, that a pursuit can reach as far as the notice (`leashRadius` >= `aggroRadius`) and a floor on the respawn of species that live in groups.
 */
export async function saveSpecies(db: D1Database, adminEmail: string, id: string, fields: Record<string, unknown> | null, token: number, now = Date.now()): Promise<MonsterSaveResult & { warnings?: string[] }> {
  const def = MONSTERS[id];
  if (!def) return { ok: false, error: "unknown" };
  const { value, token: current } = await readGroup(db, "monsters");
  if (current !== token) return { ok: false, error: "version_conflict" };
  const before = value.species[id] ?? DEFAULT_TUNING.monsters.species[id]!;
  let entry: MonsterNumbers;
  if (fields === null) entry = { ...DEFAULT_TUNING.monsters.species[id]! };
  else {
    const merged: Record<string, unknown> = { ...before };
    for (const k of [...NUMBER_KEYS, "nameVi"]) if (fields[k] !== undefined) merged[k] = fields[k];
    if (typeof merged.nameVi === "string") merged.nameVi = merged.nameVi.normalize("NFC").trim();
    if (merged.nameVi === def.nameVi || merged.nameVi === "") delete merged.nameVi;
    entry = merged as unknown as MonsterNumbers;
  }
  const problems: string[] = [];
  const inGroups = Object.values(CLUSTERS).some((list) => list.some((c) => c.kind === id));
  if (typeof entry.nameVi === "string" && [...entry.nameVi].length > SPECIES_NAME_MAX) problems.push(`tên tối đa ${SPECIES_NAME_MAX} ký tự`);
  if (entry.leashRadius < entry.aggroRadius) problems.push("tầm đuổi không được nhỏ hơn tầm phát hiện");
  if (inGroups && entry.respawnMs < MIN_CLUSTER_RESPAWN_MS) problems.push(`loài sống trong bãi quái phải hồi sinh sau ít nhất ${MIN_CLUSTER_RESPAWN_MS / 1000} giây`);
  const next: Tuning["monsters"] = { ...value, species: { ...value.species, [id]: entry } };
  if (!validTuningGroup("monsters", next)) problems.push("có số nằm ngoài khoảng cho phép");
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const changed = [...NUMBER_KEYS, "nameVi" as const].filter((k) => JSON.stringify(before[k as keyof MonsterNumbers] ?? null) !== JSON.stringify(entry[k as keyof MonsterNumbers] ?? null)).map((k) => LABELS[k]!);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  const name = entry.nameVi ?? def.nameVi;
  const res = await writeGroup(db, "monsters", next, token, adminEmail, fields === null ? `Đưa loài quái «${name}» (${id}) về số của code` : `Sửa loài quái «${name}» (${id}): ${changed.join(", ")}`, now);
  if (!res.ok) return res;
  const warnings: string[] = [];
  if (entry.speed !== before.speed && entry.speed >= BASE_SPEED) warnings.push(`tốc độ ${entry.speed} không thấp hơn tốc độ chạy của người chơi (${BASE_SPEED}): người chơi sẽ không chạy thoát được`);
  return { ok: true, updatedAt: res.updatedAt, changed, warnings };
}

// ---- Loot tables ----

export async function listLoot(db: D1Database): Promise<{
  loot: Tuning["loot"];
  default: Tuning["loot"];
  token: number;
  realms: Array<{ key: string; nameVi: string }>;
  items: Array<{ id: string; nameVi: string; disabled: boolean }>;
}> {
  const { value, token } = await readGroup(db, "loot");
  const items = allItemDefs().map((d) => ({ id: d.id, nameVi: d.nameVi, disabled: d.disabled === true }));
  return { loot: value, default: JSON.parse(JSON.stringify(DEFAULT_TUNING.loot)) as Tuning["loot"], token, realms: REALMS.map((r) => ({ key: String(r.id), nameVi: r.nameVi })), items };
}

const RANKS = ["normal", "rare1", "rare2"] as const;

/** Every line of a loot value with where it sits ("base.normal.2", "realm.2.rare1.0"). */
function linesOf(loot: Tuning["loot"]): Map<string, LootLine> {
  const out = new Map<string, LootLine>();
  for (const r of RANKS) loot.base[r].forEach((l, i) => out.set(`base.${r}.${i}`, l));
  for (const [realm, ranks] of Object.entries(loot.realm)) for (const r of RANKS) ranks[r].forEach((l, i) => out.set(`realm.${realm}.${r}.${i}`, l));
  return out;
}

/**
 * Saves the loot tables as the admin edited them. Whether an item exists, is not equipment and is not taken out of play is checked here, for the lines that are new or
 * changed (so an item removed from the code later does not make every save fail), and `rollLoot` skips such lines anyway.
 */
export async function saveLoot(db: D1Database, adminEmail: string, posted: unknown, token: number, now = Date.now()): Promise<MonsterSaveResult> {
  const { value, token: current } = await readGroup(db, "loot");
  if (current !== token) return { ok: false, error: "version_conflict" };
  if (!validTuningGroup("loot", posted)) return { ok: false, error: "invalid", problems: ["bảng rơi không đúng dạng (xác suất 0-1, số lượng nguyên, tối thiểu không quá tối đa, tối đa 40 dòng mỗi hạng)"] };
  const next = posted as Tuning["loot"];
  const had = new Set([...linesOf(value).values()].map((l) => JSON.stringify(l)));
  const problems: string[] = [];
  for (const [where, line] of linesOf(next)) {
    if (had.has(JSON.stringify(line))) continue;
    const def = getItemDef(line.item);
    if (!def) problems.push(`${where}: vật phẩm ${line.item} không tồn tại`);
    else if (isEquipmentType(line.item)) problems.push(`${where}: trang bị (${line.item}) rơi theo cơ chế riêng, không thêm vào bảng này`);
    else if (def.disabled) problems.push(`${where}: vật phẩm ${line.item} đã bị xóa`);
  }
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const before = linesOf(value);
  const after = linesOf(next);
  const added = [...after.values()].filter((l) => !had.has(JSON.stringify(l))).length;
  const afterSet = new Set([...after.values()].map((l) => JSON.stringify(l)));
  const removed = [...before.values()].filter((l) => !afterSet.has(JSON.stringify(l))).length;
  if (JSON.stringify(value) === JSON.stringify(next)) return { ok: false, error: "unchanged" };
  const res = await writeGroup(db, "loot", next, token, adminEmail, `Sửa bảng rơi vật phẩm: thêm hoặc đổi ${added} dòng, bỏ ${removed} dòng`, now);
  return res.ok ? { ok: true, updatedAt: res.updatedAt, changed: [`+${added}`, `-${removed}`] } : res;
}

/** Whether the loot tables name an item (a reference that blocks deleting it). */
export async function lootReferences(db: D1Database, item: string): Promise<string[]> {
  const { value } = await readGroup(db, "loot");
  const out: string[] = [];
  for (const [where, line] of linesOf(value)) if (line.item === item) out.push(`Bảng rơi (${where})`);
  return out;
}

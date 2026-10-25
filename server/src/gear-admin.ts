import { DEFAULT_ENHANCE_TABLE, EQUIP_KINDS, EQUIP_STAT_KEYS, GENDERED_KINDS, REALMS, STAGES_PER_REALM, validEnhanceLevel, validMasterStats, type EnhanceLevelDef, type MasterStats } from "@game/shared";
import { logStatement } from "./admin-log";
import { getEnhanceTable, resetEnhanceCache } from "./enhance";
import { getGearMaster, resetGearMasterCache } from "./gear-master";

/**
 * The admin side of the gear tables (docs/PHASE3.md 3g-b): the stat ranges of the master table (`equipment_master`), the names of the gear sets
 * (`equipment_sets`) and the blacksmith's upgrade table (`enhance_levels`). Each is saved in one batch guarded by the `config_versions` number the admin saw
 * (any save of that table moves it, so two admins never overwrite each other), with the version bump and the admin log row. A save only writes the rows that
 * changed. Existing pieces keep the stats they were rolled with: the master only steers pieces made afterwards.
 */
export const GEAR_LOG_SCREEN = "Trang bị";
export const SET_NAME_MAX = 30;
const MASTER_KINDS = EQUIP_KINDS.filter((k) => k !== "bonded");

const versionOf = async (db: D1Database, name: string) => (await db.prepare("SELECT version FROM config_versions WHERE name = ?").bind(name).first<{ version: number }>())?.version ?? 0;
const bump = (db: D1Database, name: string, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = ?").bind(at, name);
/** Fails the whole batch when the table moved since the admin looked (the first statement of every save). */
const guard = (db: D1Database, name: string, seen: number) => db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE (SELECT version FROM config_versions WHERE name = ?) != ?").bind(name, seen);

export type GearResult = { ok: true; token: number } | { ok: false; error: "invalid" | "unchanged" | "version_conflict" | "busy"; problems?: string[] };

async function commit(db: D1Database, statements: D1PreparedStatement[], name: string, seen: number): Promise<GearResult> {
  try {
    await db.batch(statements);
  } catch (err) {
    if (String(err).includes("inv_guard") && (await versionOf(db, name)) !== seen) return { ok: false, error: "version_conflict" };
    console.error("gear save failed", name, err);
    return { ok: false, error: "busy" };
  }
  return { ok: true, token: await versionOf(db, name) };
}

// ---- master stats ----

export interface MasterRowView {
  key: string;
  kind: string;
  style: string;
  realm: number;
  tier: number;
  stats: MasterStats;
}

export interface MasterView {
  token: number;
  kinds: Array<{ kind: string; styles: string[] }>;
  statKeys: readonly string[];
  rows: MasterRowView[];
}

/** The ranges of one kind (both styles when it has two), every realm and bậc. */
export async function getMasterView(db: D1Database, kind: string): Promise<MasterView | null> {
  if (!(MASTER_KINDS as readonly string[]).includes(kind)) return null;
  const master = await getGearMaster(db); // seeds the table the first time
  const token = await versionOf(db, "gear_master");
  const styles = GENDERED_KINDS.has(kind as never) ? ["m", "f"] : ["u"];
  const rows: MasterRowView[] = [];
  for (const style of styles) {
    for (let realm = 0; realm < REALMS.length; realm++) {
      for (let tier = 1; tier <= STAGES_PER_REALM; tier++) {
        const key = `${kind}.${style}.${realm}.${tier}`;
        const stats = master.stats.get(key);
        if (stats) rows.push({ key, kind, style, realm, tier, stats });
      }
    }
  }
  return { token, kinds: MASTER_KINDS.map((k) => ({ kind: k, styles: GENDERED_KINDS.has(k as never) ? ["m", "f"] : ["u"] })), statKeys: EQUIP_STAT_KEYS, rows };
}

/** Saves changed rows: `rows` maps an item key to its new ranges. A row can change its numbers, not which stats it has. */
export async function saveMaster(db: D1Database, adminEmail: string, kind: string, rows: unknown, token: number, now = Date.now()): Promise<GearResult> {
  const view = await getMasterView(db, kind);
  if (!view || typeof rows !== "object" || rows === null || Array.isArray(rows)) return { ok: false, error: "invalid", problems: ["body"] };
  if (view.token !== token) return { ok: false, error: "version_conflict" };
  const current = new Map(view.rows.map((r) => [r.key, r.stats]));
  const statements: D1PreparedStatement[] = [guard(db, "gear_master", token)];
  const problems: string[] = [];
  let changed = 0;
  for (const [key, next] of Object.entries(rows as Record<string, unknown>)) {
    const was = current.get(key);
    if (!was) {
      problems.push(`${key}: unknown row`);
      continue;
    }
    if (!validMasterStats(next) || Object.keys(next).sort().join() !== Object.keys(was).sort().join()) {
      problems.push(`${key}: ranges are not valid or the stats differ`);
      continue;
    }
    if (JSON.stringify(next) === JSON.stringify(was)) continue;
    changed++;
    statements.push(db.prepare("UPDATE equipment_master SET stats = ?, updated_at = ? WHERE item_key = ?").bind(JSON.stringify(next), now, key));
  }
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  if (changed === 0) return { ok: false, error: "unchanged" };
  if (changed > 40) return { ok: false, error: "invalid", problems: ["at most 40 rows per save"] };
  statements.push(bump(db, "gear_master", now), logStatement(db, { adminEmail, screen: GEAR_LOG_SCREEN, content: `Sửa bảng master trang bị «${kind}»: ${changed} dòng` }, now));
  const res = await commit(db, statements, "gear_master", token);
  if (res.ok) resetGearMasterCache();
  return res;
}

// ---- set names ----

export async function getSetsView(db: D1Database): Promise<{ token: number; realms: Array<{ realm: number; nameVi: string; names: string[] }> }> {
  const master = await getGearMaster(db);
  return { token: await versionOf(db, "gear_master"), realms: REALMS.map((r, i) => ({ realm: i, nameVi: r.nameVi, names: [...(master.setNames[i] ?? [])] })) };
}

/** `names[realm][tier - 1]`. */
export async function saveSets(db: D1Database, adminEmail: string, names: unknown, token: number, now = Date.now()): Promise<GearResult> {
  const view = await getSetsView(db);
  if (view.token !== token) return { ok: false, error: "version_conflict" };
  if (!Array.isArray(names) || names.length !== REALMS.length) return { ok: false, error: "invalid", problems: ["body"] };
  const statements: D1PreparedStatement[] = [guard(db, "gear_master", token)];
  const changed: string[] = [];
  for (let realm = 0; realm < REALMS.length; realm++) {
    const row = names[realm];
    if (!Array.isArray(row) || row.length !== STAGES_PER_REALM) return { ok: false, error: "invalid", problems: [`realm ${realm}`] };
    for (let i = 0; i < STAGES_PER_REALM; i++) {
      const name = typeof row[i] === "string" ? (row[i] as string).trim() : "";
      if (name.length < 1 || name.length > SET_NAME_MAX) return { ok: false, error: "invalid", problems: [`realm ${realm} bậc ${i + 1}: 1-${SET_NAME_MAX} ký tự`] };
      if (name === view.realms[realm]!.names[i]) continue;
      changed.push(`${view.realms[realm]!.names[i]} → ${name}`);
      statements.push(db.prepare("UPDATE equipment_sets SET name_vi = ?, updated_at = ? WHERE realm = ? AND tier = ?").bind(name, now, realm, i + 1));
    }
  }
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  statements.push(bump(db, "gear_master", now), logStatement(db, { adminEmail, screen: GEAR_LOG_SCREEN, content: `Đổi tên bộ trang bị: ${changed.join("; ")}` }, now));
  const res = await commit(db, statements, "gear_master", token);
  if (res.ok) resetGearMasterCache();
  return res;
}

// ---- the blacksmith's table ----

export async function getEnhanceView(db: D1Database): Promise<{ token: number; rows: EnhanceLevelDef[] }> {
  const rows = await getEnhanceTable(db);
  return { token: await versionOf(db, "enhance"), rows };
}

export async function saveEnhance(db: D1Database, adminEmail: string, posted: unknown, token: number, now = Date.now()): Promise<GearResult> {
  const view = await getEnhanceView(db);
  if (view.token !== token) return { ok: false, error: "version_conflict" };
  if (!Array.isArray(posted) || posted.length !== DEFAULT_ENHANCE_TABLE.length) return { ok: false, error: "invalid", problems: ["body"] };
  const statements: D1PreparedStatement[] = [guard(db, "enhance", token)];
  const changed: number[] = [];
  for (const def of DEFAULT_ENHANCE_TABLE) {
    const next = (posted as Array<Partial<EnhanceLevelDef>>).find((r) => r?.level === def.level);
    if (!validEnhanceLevel(next)) return { ok: false, error: "invalid", problems: [`+${def.level}`] };
    const was = view.rows.find((r) => r.level === def.level)!;
    const clean: EnhanceLevelDef = { level: next.level, successPct: next.successPct, statPct: next.statPct, failBonusPct: next.failBonusPct, dropOnFail: next.dropOnFail, materials: next.materials, linhMult: next.linhMult };
    if (JSON.stringify(clean) === JSON.stringify(was)) continue;
    changed.push(def.level);
    statements.push(
      db
        .prepare("UPDATE enhance_levels SET success_pct = ?, stat_pct = ?, fail_bonus_pct = ?, drop_on_fail = ?, materials = ?, linh_mult = ?, updated_at = ? WHERE level = ?")
        .bind(clean.successPct, clean.statPct, clean.failBonusPct, clean.dropOnFail ? 1 : 0, clean.materials, clean.linhMult, now, clean.level),
    );
  }
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  statements.push(bump(db, "enhance", now), logStatement(db, { adminEmail, screen: GEAR_LOG_SCREEN, content: `Sửa bảng nâng cấp Thợ Rèn: cấp ${changed.map((l) => `+${l}`).join(", ")}` }, now));
  const res = await commit(db, statements, "enhance", token);
  if (res.ok) resetEnhanceCache();
  return res;
}

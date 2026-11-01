/**
 * Beast mounts (thú cưỡi, docs/PHASE5.md 5d). A mount is learned from a token item (`mt_<id>`, bought from a merchant or given by an admin): using the token puts the
 * mount in the character's list for good and uses the token up. Riding one adds `speedPct` to the walking speed, never together with the flight pháp bảo (one ride at a
 * time). The numbers are the tuning group `mounts` (the list is edited by an admin; the ids are fixed in code, as the skills are, so the tokens exist). Placeholder values.
 */
export interface MountDef {
  /** Stable id, a-z 0-9 _. */
  id: string;
  nameVi: string;
  descVi: string;
  /** The realm (REALMS index) a character must have reached to learn and ride it. */
  minRealm: number;
  /** Walking speed added while riding it, in percent (like the speed of the gear). */
  speedPct: number;
  /** What the token is worth in Linh Thạch (the merchant sells it at this price). */
  price: number;
  /** How the beast is drawn until it has a sprite: the body colour and the size. */
  color: string;
  size: number;
  enabled: boolean;
}

export interface MountsCfg {
  list: MountDef[];
}

export const DEFAULT_MOUNTS: MountsCfg = {
  list: [
    { id: "linh_loc", nameVi: "Linh Lộc", descVi: "Con hươu linh khí hiền lành, chạy nhanh hơn người đi bộ.", minRealm: 0, speedPct: 30, price: 20_000, color: "#c9a96a", size: 1, enabled: true },
    { id: "hac_phong_lang", nameVi: "Hắc Phong Lang", descVi: "Sói đen chạy nhanh như gió, thuần phục được từ Trúc Cơ.", minRealm: 1, speedPct: 45, price: 150_000, color: "#44485a", size: 1.1, enabled: true },
    { id: "xich_van_ma", nameVi: "Xích Vân Mã", descVi: "Ngựa đỏ bốc lửa, phi như mây trời Kim Đan.", minRealm: 2, speedPct: 60, price: 1_000_000, color: "#b5483a", size: 1.25, enabled: true },
    { id: "bach_ho", nameVi: "Bạch Hổ", descVi: "Hổ trắng thần thú, chỉ Nguyên Anh mới ngự được.", minRealm: 3, speedPct: 80, price: 6_000_000, color: "#e7e7e0", size: 1.4, enabled: true },
  ],
};

/** The id of the token item that teaches a mount. */
export const mountItemId = (mountId: string): string => `mt_${mountId}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validMounts(v: unknown): v is MountsCfg {
  if (!isObj(v) || !Array.isArray(v.list) || v.list.length > 40) return false;
  const ids = new Set<string>();
  for (const m of v.list) {
    if (!isObj(m) || typeof m.id !== "string" || !/^[a-z0-9_]{1,32}$/.test(m.id) || ids.has(m.id)) return false;
    ids.add(m.id);
    if (typeof m.nameVi !== "string" || m.nameVi.length < 1 || m.nameVi.length > 60 || typeof m.descVi !== "string" || m.descVi.length > 200) return false;
    if (!isInt(m.minRealm, 0, 20) || !isInt(m.speedPct, 0, 300) || !isInt(m.price, 1, 1_000_000_000)) return false;
    if (typeof m.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(m.color) || typeof m.size !== "number" || m.size < 0.5 || m.size > 3 || typeof m.enabled !== "boolean") return false;
  }
  return true;
}


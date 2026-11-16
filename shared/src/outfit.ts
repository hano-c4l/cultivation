import { equipmentInfo } from "./equipment-data";
import { tuning } from "./tuning";

/** The silhouette a doll wears when no robe is worn (the bare cloth of the paper doll, 4j). */
export const DEFAULT_OUTFIT = "robe";

/** The outfit drawn on a player (a key of the tuning `outfits` rules), from the worn gear; null for the plain peasant clothes (no robe, a broken one, or a robe below every rule). */
export function outfitOf(equipped: readonly { slot: string; type: string; dur?: number }[]): string | null {
  const robe = equipped.find((e) => e.slot === "robe");
  if (!robe || (robe.dur !== undefined && robe.dur <= 0)) return null;
  const info = equipmentInfo(robe.type);
  const realm = info?.realm;
  if (realm === undefined) return null;
  const special = tuning().outfits.byTier?.[`${realm}.${info?.tier}`];
  if (special) return special;
  let best: { minRealm: number; outfit: string } | null = null;
  for (const r of tuning().outfits.rules) if (realm >= r.minRealm && (!best || r.minRealm > best.minRealm)) best = r;
  return best?.outfit ?? null;
}

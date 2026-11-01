import { tuning } from "./tuning";
import type { MountDef } from "./mounts-data";

/** A mount of the live tuning (an admin's edits), by id. */
export function mountOf(id: string): MountDef | undefined {
  return tuning().mounts.list.find((m) => m.id === id);
}

/** The walking speed (percent) riding this mount adds; 0 for an id that is not a mount in play. */
export function mountSpeedPct(id: string | undefined | null): number {
  const m = id ? mountOf(id) : undefined;
  return m && m.enabled ? m.speedPct : 0;
}

/** Why this character cannot learn or ride the mount now (null: can). */
export function mountBlock(def: MountDef | undefined, realm: number): "unknown" | "realm" | null {
  if (!def || !def.enabled) return "unknown";
  return realm < def.minRealm ? "realm" : null;
}

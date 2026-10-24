import { itemOverlayProblem, setItemOverlays, type ItemOverlay } from "@game/shared";

/**
 * The item catalogue overlay in D1 (table `items`, migration 0040): the rows an admin made or changed, cached per isolate and re-read when
 * `config_versions.items` changes. Reading installs them (setItemOverlays), which `getItemDef` and everything built on it use. A row that does not
 * validate is skipped; D1 down serves the last copy or the catalogue of the code.
 */
const TTL_MS = 30_000;
let cache: { value: ItemOverlay[]; version: number; checkedAt: number } | null = null;

interface Row {
  id: string;
  custom: number;
  disabled: number;
  def: string;
}

export function overlayOfRow(r: Row): ItemOverlay | null {
  try {
    const o: ItemOverlay = { id: r.id, custom: r.custom === 1, disabled: r.disabled === 1, def: JSON.parse(r.def) as ItemOverlay["def"] };
    const problem = itemOverlayProblem(o);
    if (problem) {
      console.error(`item ${r.id} is invalid: ${problem}`);
      return null;
    }
    return o;
  } catch {
    console.error(`item ${r.id} is not JSON`);
    return null;
  }
}

async function load(db: D1Database): Promise<{ value: ItemOverlay[]; version: number }> {
  const [versionRow, rows] = await Promise.all([
    db.prepare("SELECT version FROM config_versions WHERE name = 'items'").first<{ version: number }>(),
    db.prepare("SELECT id, custom, disabled, def FROM items ORDER BY id").all<Row>(),
  ]);
  const value = rows.results.flatMap((r) => overlayOfRow(r) ?? []);
  setItemOverlays(value);
  return { value, version: versionRow?.version ?? 0 };
}

/** The overlay rows in force (cached). Never throws: with no copy and D1 down the catalogue of the code stays in force. */
export async function getItemOverlays(db: D1Database, now = Date.now()): Promise<ItemOverlay[]> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.value;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'items'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.value;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    return fresh.value;
  } catch (err) {
    console.error("items unavailable", err);
    return cache?.value ?? [];
  }
}

export function resetItemsCache(): void {
  cache = null;
}

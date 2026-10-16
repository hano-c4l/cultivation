import type { SpiritualRoot } from "@game/shared";

export interface CharacterRow {
  id: string;
  account_id: string;
  name: string;
  spiritual_root: SpiritualRoot;
  map_id: string;
  x: number;
  y: number;
  realm: number;
  stage: number;
  exp: number;
  potential_points: number;
}

const COLUMNS = "id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points";

export function getCharacterByAccount(db: D1Database, accountId: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE account_id = ?`).bind(accountId).first<CharacterRow>();
}

export function getCharacterById(db: D1Database, id: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ?`).bind(id).first<CharacterRow>();
}

export async function saveCharacterPosition(db: D1Database, id: string, mapId: string, x: number, y: number): Promise<void> {
  await db
    .prepare("UPDATE characters SET map_id = ?, x = ?, y = ?, updated_at = ? WHERE id = ?")
    .bind(mapId, x, y, Date.now(), id)
    .run();
}

/** Shape sent to the client; never exposes account ids. */
export function toPublicCharacter(c: CharacterRow) {
  return { id: c.id, name: c.name, spiritualRoot: c.spiritual_root, realm: c.realm, stage: c.stage, exp: c.exp };
}

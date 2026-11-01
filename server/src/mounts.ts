/**
 * The beast mounts a character has (table `character_mounts`, migration 0072). Learning one is a bag change plus a row in the SAME batch (the token is used up with the row
 * written, and a clash on the primary key, a mount already known, rolls the whole batch back so the token stays), like reading a book.
 */
export async function ownedMounts(db: D1Database, characterId: string): Promise<string[]> {
  const { results } = await db.prepare("SELECT mount_id FROM character_mounts WHERE character_id = ? ORDER BY acquired_at, mount_id").bind(characterId).all<{ mount_id: string }>();
  return results.map((r) => r.mount_id);
}

export async function ownsMount(db: D1Database, characterId: string, mountId: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM character_mounts WHERE character_id = ? AND mount_id = ?").bind(characterId, mountId).first());
}

/** The statement that records a learned mount (it throws on a mount already owned). */
export function learnMountStatement(db: D1Database, characterId: string, mountId: string, now: number): D1PreparedStatement {
  return db.prepare("INSERT INTO character_mounts (character_id, mount_id, acquired_at) VALUES (?, ?, ?)").bind(characterId, mountId, now);
}

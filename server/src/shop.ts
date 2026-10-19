import { merchantOffers, shopDay, type Gender } from "@game/shared";

/**
 * D1 side of the merchant (docs/PHASE2.md, 2e). A purchase is ONE batch built by the room: the Linh Thạch debit, the new
 * item cells and the statements below. An offer with a daily limit adds a guard that throws when the limit would be passed,
 * so two purchases racing each other cannot both slip through, and the whole batch (debit included) rolls back.
 */

/** Units bought today per offer id (only offers that have a row today). */
export async function getPurchased(db: D1Database, characterId: string, now: number): Promise<Record<string, number>> {
  const { results } = await db
    .prepare("SELECT offer_id, count FROM shop_purchases WHERE character_id = ? AND day = ?")
    .bind(characterId, shopDay(now))
    .all<{ offer_id: string; count: number }>();
  const out: Record<string, number> = {};
  for (const r of results) out[r.offer_id] = r.count;
  return out;
}

/** Units this character can still buy today, for each offer of a daily limit. */
export function stockLeft(gender: Gender, bought: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of merchantOffers(gender)) if (o.dailyLimit !== undefined) out[o.id] = Math.max(0, o.dailyLimit - (bought[o.id] ?? 0));
  return out;
}

/** Counts a purchase of `qty` against a daily limit; yesterday's rows of the character are swept in the same batch. */
export function limitStatements(db: D1Database, characterId: string, offerId: string, qty: number, limit: number, now: number): D1PreparedStatement[] {
  const day = shopDay(now);
  return [
    db
      .prepare(
        "INSERT INTO inv_guard (ok) SELECT NULL WHERE COALESCE((SELECT count FROM shop_purchases WHERE character_id = ? AND offer_id = ? AND day = ?), 0) + ? > ?",
      )
      .bind(characterId, offerId, day, qty, limit),
    db
      .prepare(
        "INSERT INTO shop_purchases (character_id, offer_id, day, count) VALUES (?, ?, ?, ?) ON CONFLICT (character_id, offer_id, day) DO UPDATE SET count = count + excluded.count",
      )
      .bind(characterId, offerId, day, qty),
    db.prepare("DELETE FROM shop_purchases WHERE character_id = ? AND day < ?").bind(characterId, day),
  ];
}

import type { BrewJobView, BrewRecipe, Craft } from "@game/shared";

/**
 * The alchemist's brewings (table `brew_jobs`, migration 0041): one row per brewing, from the moment the materials are taken until the pills are
 * collected. The recipes are the `alchemy` group of the tuning; a row copies the result (item, quantity) and the ready time so a recipe an admin
 * changes or removes later does not touch a brewing already going. Starting and collecting are written in the same batch as the bag and money.
 */
interface JobRow {
  id: string;
  recipe_id: string;
  item: string;
  qty: number;
  ready_at: number;
}

export async function listBrewJobs(db: D1Database, characterId: string, craft: Craft = "alchemy"): Promise<BrewJobView[]> {
  const { results } = await db
    .prepare("SELECT id, recipe_id, item, qty, ready_at FROM brew_jobs WHERE character_id = ? AND craft = ? AND collected_at IS NULL ORDER BY ready_at, id")
    .bind(characterId, craft)
    .all<JobRow>();
  return results.map((r) => ({ id: r.id, recipe: r.recipe_id, output: r.item, qty: r.qty, readyAt: r.ready_at }));
}

/** The statements that start a brewing: refuse (abort the batch) when the character already has `maxJobs` going, then insert the row. */
export function startBrewStatements(db: D1Database, characterId: string, npcId: string, recipe: BrewRecipe, jobId: string, maxJobs: number, now: number, craft: Craft = "alchemy"): D1PreparedStatement[] {
  return [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE (SELECT COUNT(*) FROM brew_jobs WHERE character_id = ? AND craft = ? AND collected_at IS NULL) >= ?").bind(characterId, craft, maxJobs),
    db
      .prepare("INSERT INTO brew_jobs (id, character_id, npc_id, recipe_id, item, qty, started_at, ready_at, collected_at, craft, exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
      .bind(jobId, characterId, npcId, recipe.id, recipe.output, recipe.qty, now, now + recipe.seconds * 1000, craft, recipe.exp ?? 0),
  ];
}

/** The statements that finish a brewing: the row must still be waiting and ready (a second collection fails the guard), then it is marked collected. */
export function collectBrewStatements(db: D1Database, characterId: string, jobId: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM brew_jobs WHERE id = ? AND character_id = ? AND collected_at IS NULL AND ready_at <= ?)").bind(jobId, characterId, now),
    // the exp the run was started with (copied into the row), once: the guard above is the same batch's
    db
      .prepare("INSERT INTO craft_exp (character_id, craft, exp) SELECT character_id, craft, exp FROM brew_jobs WHERE id = ? AND character_id = ? AND exp > 0 ON CONFLICT (character_id, craft) DO UPDATE SET exp = craft_exp.exp + excluded.exp")
      .bind(jobId, characterId),
    db.prepare("UPDATE brew_jobs SET collected_at = ? WHERE id = ? AND character_id = ?").bind(now, jobId, characterId),
  ];
}

/** The exp of a character in a trade. */
export async function getCraftExp(db: D1Database, characterId: string, craft: Craft): Promise<number> {
  return (await db.prepare("SELECT exp FROM craft_exp WHERE character_id = ? AND craft = ?").bind(characterId, craft).first<{ exp: number }>())?.exp ?? 0;
}

export async function getBrewJob(db: D1Database, characterId: string, jobId: string, craft: Craft = "alchemy"): Promise<BrewJobView | null> {
  // a job is collected at the kind of NPC that made it (an alchemist's brewing is not handed over by a blacksmith)
  const r = await db.prepare("SELECT id, recipe_id, item, qty, ready_at FROM brew_jobs WHERE id = ? AND character_id = ? AND craft = ? AND collected_at IS NULL").bind(jobId, characterId, craft).first<JobRow>();
  return r ? { id: r.id, recipe: r.recipe_id, output: r.item, qty: r.qty, readyAt: r.ready_at } : null;
}

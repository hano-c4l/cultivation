import { applyElementSettings } from "./element-settings";
import { getEnhanceTable } from "./enhance";
import { getGearMaster } from "./gear-master";
import { getNpcs } from "./npcs";
import { getTuning } from "./tuning";

/**
 * Installs everything that lives in D1 and that the game maths reads from this isolate's memory: the element rules, the gear set names and master,
 * the blacksmith table, the balance numbers (`game_tuning`) and where the NPCs stand. Each is cached (30 seconds) and never throws, so this is cheap
 * to call. EVERY entry point that can run game maths must call it first: a room that wakes on an alarm, a socket close or a Worker route in a fresh
 * isolate would otherwise run with the code defaults instead of what the admin saved.
 */
export async function loadLiveConfig(db: D1Database): Promise<void> {
  await applyElementSettings(db).catch((err) => console.error("element settings unavailable", err));
  await getGearMaster(db); // installs the gear set names (never throws)
  await getEnhanceTable(db); // installs the blacksmith rules (never throws)
  await getTuning(db); // installs the balance numbers (never throws)
  await getNpcs(db); // installs where the NPCs stand (never throws)
}

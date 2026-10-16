import type { CharacterLock } from "./character-lock";
import type { MapRoom } from "./map-room";
import type { PasswordHasher } from "./password-hasher";

export interface Env {
  MAP_ROOM: DurableObjectNamespace<MapRoom>;
  CHAR_LOCK: DurableObjectNamespace<CharacterLock>;
  PASSWORD_HASHER: DurableObjectNamespace<PasswordHasher>;
  DB: D1Database;
  ASSETS: Fetcher;
  /** Set only in local .dev.vars so repeated local smoke runs are not rate limited. */
  DISABLE_RATE_LIMIT?: string;
}

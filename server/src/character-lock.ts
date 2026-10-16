import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * One lock object per character id: the newest connection wins. The previous holder room is told to
 * kick its socket and save BEFORE the new room is granted the lock, so the new room never reads a
 * stale character row and two rooms never write the same character.
 */
export class CharacterLock extends DurableObject<Env> {
  // Serializes claims so two simultaneous logins cannot interleave their evict/grant steps.
  private chain: Promise<unknown> = Promise.resolve();

  claim(characterId: string, room: string): Promise<void> {
    const run = this.chain.then(() => this.doClaim(characterId, room));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async doClaim(characterId: string, room: string): Promise<void> {
    const holder = await this.ctx.storage.get<string>("holder");
    if (holder) {
      // Same-room reconnects are evicted too: the room only kicks sockets that already joined.
      const stub = this.env.MAP_ROOM.get(this.env.MAP_ROOM.idFromName(holder));
      await stub.evictCharacter(characterId);
    }
    await this.ctx.storage.put("holder", room);
  }

  /** Called by the holder room after the player left; ignored when somebody else already took over. */
  async release(room: string): Promise<void> {
    if ((await this.ctx.storage.get<string>("holder")) === room) await this.ctx.storage.delete("holder");
  }
}

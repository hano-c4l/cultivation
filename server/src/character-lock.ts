import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

interface Holder {
  room: string;
  /** When the claim was made: a claim that is old is checked against the room before it counts as online. */
  at?: number;
  /** Unique per connection, so a late release from an old connection cannot free a newer claim. */
  claimId: string;
}

/**
 * One lock object per character id: the newest connection wins. The previous holder room is told to
 * kick its socket and save BEFORE the new room is granted the lock, so the new room never reads a
 * stale character row and two rooms never write the same character.
 */
export class CharacterLock extends DurableObject<Env> {
  // Serializes claims so two simultaneous logins cannot interleave their evict/grant steps.
  private chain: Promise<unknown> = Promise.resolve();

  claim(characterId: string, room: string, claimId: string): Promise<void> {
    const run = this.chain.then(() => this.doClaim(characterId, { room, claimId }));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async doClaim(characterId: string, next: Holder): Promise<void> {
    const holder = await this.ctx.storage.get<Holder>("holder");
    if (holder) {
      // Same-room reconnects are evicted too: the room only kicks sockets that already joined.
      const stub = this.env.MAP_ROOM.get(this.env.MAP_ROOM.idFromName(holder.room));
      await stub.evictCharacter(characterId);
    }
    await this.ctx.storage.put("holder", { ...next, at: Date.now() });
  }

  /** Kicks whoever holds the character (saving first) and frees the lock: used when an admin bans the account. */
  evict(characterId: string): Promise<void> {
    // In the same line as the claims: an eviction that read the holder just before a new claim set another would otherwise free the new connection's lock.
    const run = this.chain.then(() => this.doEvict(characterId));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async doEvict(characterId: string): Promise<void> {
    const holder = await this.ctx.storage.get<Holder>("holder");
    if (!holder) return;
    const stub = this.env.MAP_ROOM.get(this.env.MAP_ROOM.idFromName(holder.room));
    await stub.evictCharacter(characterId);
    await this.ctx.storage.delete("holder");
  }

  /** Whether a connection holds the character right now (the admin screen shows it as online). */
  async isHeld(): Promise<boolean> {
    const holder = await this.ctx.storage.get<Holder>("holder");
    if (!holder) return false;
    // A claim that outlived its connection (a release that never came) must not show a character as online for ever: an older claim is checked against the room.
    if (Date.now() - (holder.at ?? 0) < 60_000) return true;
    try {
      const here = await this.env.MAP_ROOM.get(this.env.MAP_ROOM.idFromName(holder.room)).hasCharacter(holder.claimId);
      if (!here && (await this.ctx.storage.get<Holder>("holder"))?.claimId === holder.claimId) await this.ctx.storage.delete("holder"); // unless a newer claim came meanwhile
      return here;
    } catch {
      return true; // the room could not be asked: the lock stays as it is
    }
  }

  /** Called by the holding connection after it left; ignored unless the claim id still matches. */
  async release(claimId: string): Promise<void> {
    const holder = await this.ctx.storage.get<Holder>("holder");
    if (holder?.claimId === claimId) await this.ctx.storage.delete("holder");
  }
}

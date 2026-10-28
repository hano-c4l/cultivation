import type { NpcLook } from "./art-styles";
import type { NpcSpot } from "./map";
import { tuning } from "./tuning";

/**
 * The look of an NPC from the tuning `npcLooks`: its own id first, then the id without a trailing number (`smith2` is `smith`: the same character in the
 * second town), then its kind, then a plain male body. A waygate has none: it is a circle on the ground.
 */
export function npcLookOf(npc: Pick<NpcSpot, "id" | "kind">): NpcLook | null {
  if (npc.kind === "waygate") return null;
  const t = tuning().npcLooks;
  return t.byId[npc.id] ?? t.byId[npc.id.replace(/\d+$/, "")] ?? t.byKind[npc.kind] ?? { body: "male" };
}

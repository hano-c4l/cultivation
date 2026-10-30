import type { NpcSpot } from "./map";
import type { NpcView } from "./protocol";

/** The windows (tabs) an NPC of this kind opens; `hasShop` says whether a blacksmith also has goods for sale. */
export function npcTabs(kind: NpcSpot["kind"], hasShop: boolean): NpcView[] {
  switch (kind) {
    case "merchant":
      return ["shop"];
    case "alchemist":
      return ["shop", "brew"];
    case "master":
      return ["learn"];
    case "smith":
      return hasShop ? ["smith", "shop"] : ["smith"];
    default:
      return [];
  }
}

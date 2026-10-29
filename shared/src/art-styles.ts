/** How the ground of a map is drawn (a pattern of small details over the two checker tones). `plain` is the bare checker. */
export const GROUND_STYLES = ["plain", "grass", "dirt", "stone", "snow", "lava"] as const;
export type GroundStyle = (typeof GROUND_STYLES)[number];
/** What the small blocked spots of a map are drawn as. `plain` keeps them flat diamonds like the large ones. */
export const OBSTACLE_STYLES = ["plain", "tree", "bush", "stump", "rock", "boulder", "pillar", "crystal", "ember", "bamboo", "lantern", "jade"] as const;
export type ObstacleStyle = (typeof OBSTACLE_STYLES)[number];

/** What a rider of the flight pháp bảo stands on: a flying sword, a cloud, a lotus, the bare cloud-disc of old (`plain`), and for the two highest realms a phoenix and a dragon. */
export const FLIGHT_STYLES = ["plain", "sword", "cloud", "lotus", "phoenix", "dragon"] as const;
export type FlightStyle = (typeof FLIGHT_STYLES)[number];

/** How an NPC is drawn: one of the player bodies, an optional outfit (`outfits` tuning key), an optional weapon family. */
export interface NpcLook {
  body: "male" | "female";
  outfit?: string;
  weapon?: string;
  /** Drawn this many times its size (a guard is bigger than a villager). */
  scale?: number;
  /** A colour (`#rrggbb`) the whole figure is multiplied by, so one white robe makes jade, gold, violet or steel-blue ones (WebGL only: Canvas draws it white). */
  tint?: string;
  /** A colour (`#rrggbb`) for the formation circle that turns slowly under the figure. */
  aura?: string;
}

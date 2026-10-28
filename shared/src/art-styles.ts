/** How the ground of a map is drawn (a pattern of small details over the two checker tones). `plain` is the bare checker. */
export const GROUND_STYLES = ["plain", "grass", "dirt", "stone", "snow", "lava"] as const;
export type GroundStyle = (typeof GROUND_STYLES)[number];
/** What the small blocked spots of a map are drawn as. `plain` keeps them flat diamonds like the large ones. */
export const OBSTACLE_STYLES = ["plain", "tree", "bush", "stump", "rock", "boulder", "pillar", "crystal", "ember"] as const;
export type ObstacleStyle = (typeof OBSTACLE_STYLES)[number];

/** How an NPC is drawn: one of the player bodies, an optional outfit (`outfits` tuning key), an optional weapon family. */
export interface NpcLook {
  body: "male" | "female";
  outfit?: string;
  weapon?: string;
  /** Drawn this many times its size (a guard is bigger than a villager). */
  scale?: number;
}

import { DEFAULT_OUTFIT, equipmentInfo, gearLookOf, HAT_SHAPES, hatShapeOf, hatTintOf, outfitOf, robeTintOf, weaponTintOf, type GearLook } from "@game/shared";

/**
 * The paper doll (docs/PHASE4.md 4j): a figure is a body sprite plus one sprite for each slot of gear that shows (hair, robe, hat; the weapon is added by the scene),
 * rendered from the same model and the same animations so that they share frame names, and tinted by the set of the worn piece. This turns "what is worn" into
 * the list of layers; the kit makes the sprites and keeps them on the body.
 */
export interface DollLayerSpec {
  slot: string;
  key: string;
  tint?: number;
}

/** What a robe looks like when nothing is worn there (undyed cloth). The belt, cuffs and boots are drawn into the robe layer, so they follow its tint. */
export const BARE_ROBE = 0xd8d0bc;

const hex = (c: string | undefined): number | undefined => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : undefined);

/** `doll.female.robe.body` -> `doll.female.robe`; undefined for a sprite that is not the body of a doll. */
export function dollPrefixOf(bodyKey: string): string | undefined {
  return bodyKey.startsWith("doll.") && bodyKey.endsWith(".body") ? bodyKey.slice(0, -".body".length) : undefined;
}

/**
 * The layers a doll shows for a look, in drawing order. `has` says whether the manifest has a sprite of a key; a slot without one (an old doll with fewer layers,
 * a hat shape not rendered yet) is left out. The robe always shows (bare when nothing is worn); a hat swaps the hair for the one without the knot.
 */
export function dollLayers(prefix: string, lk: GearLook | undefined, has: (key: string) => boolean): DollLayerSpec[] {
  const out: DollLayerSpec[] = [];
  const add = (slot: string, name: string, tint?: number): void => {
    const key = `${prefix}.${name}`;
    if (has(key)) out.push({ slot, key, ...(tint !== undefined ? { tint } : {}) });
  };
  const hatted = lk?.h !== undefined && has(`${prefix}.h${hatShapeOf(lk.h)}`);
  add("hair", hatted ? "hairhat" : "hair");
  add("robe", "robe", lk?.r !== undefined ? (hex(robeTintOf(lk.r)) ?? BARE_ROBE) : BARE_ROBE);
  add("trim", "trim"); // the metal and trim of the styles that split them (armour): baked colours, never tinted
  if (hatted && lk?.h !== undefined) add("hat", `h${hatShapeOf(lk.h)}`, hex(hatTintOf(lk.h)));
  return out;
}

/** The sprite key of a doll's weapon layer for a weapon family, or undefined when the doll has none (the old weapon atlas is used then). */
export function dollWeaponKey(prefix: string, family: string | undefined, has: (key: string) => boolean): string | undefined {
  if (!family) return undefined;
  const key = `${prefix}.w_${family}`;
  return has(key) ? key : undefined;
}

/** The weapon family (`kiem`, `cung`...) of the worn weapon, or undefined when none is worn or it is broken. */
export function weaponFamilyOf(equipped: readonly { slot: string; type: string; dur?: number }[]): string | undefined {
  const w = equipped.find((e) => e.slot === "weapon" && !(e.dur !== undefined && e.dur <= 0));
  return w ? (equipmentInfo(w.type)?.weaponType ?? undefined) : undefined;
}

/** Everything a doll needs for what is worn: the body sprite key, its layers and the weapon layer (each undefined when the manifest lacks the doll). */
export function dollOfWorn(female: boolean, equipped: readonly { slot: string; type: string; dur?: number; en?: number }[], has: (key: string) => boolean): { body: string; layers: DollLayerSpec[]; weapon?: DollLayerSpec } | undefined {
  const prefix = `doll.${female ? "female" : "male"}.${outfitOf(equipped) ?? DEFAULT_OUTFIT}`;
  const body = `${prefix}.body`;
  if (!has(body)) return undefined;
  const weapon = dollWeaponKey(prefix, weaponFamilyOf(equipped), has);
  const lk = gearLookOf(equipped);
  const tint = lk?.w !== undefined ? hex(weaponTintOf(lk.w)) : undefined;
  return { body, layers: dollLayers(prefix, lk, has), ...(weapon ? { weapon: { slot: "weapon", key: weapon, ...(tint !== undefined ? { tint } : {}) } } : {}) };
}

/**
 * The layers of an NPC or a guard (their look is data: `npcLooks`): a robe of the look's tint and a hat in the colour of its aura. Because only the robe
 * is tinted, a villager's face and hands keep their own colour.
 */
export function npcDollLayers(prefix: string, look: { tint?: string; hat?: number; hatTint?: string; aura?: string }, has: (key: string) => boolean): DollLayerSpec[] {
  const out: DollLayerSpec[] = [];
  const add = (slot: string, name: string, tint?: number): void => {
    const key = `${prefix}.${name}`;
    if (has(key)) out.push({ slot, key, ...(tint !== undefined ? { tint } : {}) });
  };
  const shape = look.hat !== undefined ? look.hat % HAT_SHAPES : undefined;
  const hatted = shape !== undefined && has(`${prefix}.h${shape}`);
  add("hair", hatted ? "hairhat" : "hair");
  add("robe", "robe", hex(look.tint) ?? BARE_ROBE);
  add("trim", "trim");
  if (hatted) add("hat", `h${shape}`, hex(look.hatTint ?? look.aura));
  return out;
}

import { beltTintOf, bootsTintOf, bracerTintOf, hatShapeOf, hatTintOf, robeTintOf, type GearLook } from "@game/shared";

/**
 * The paper doll (docs/PHASE4.md 4j): a figure is a body sprite plus one sprite for each slot of gear that shows (hair, robe, belt, bracers, boots, hat),
 * rendered from the same model and the same animations so that they share frame names, and tinted by the set of the worn piece. This turns "what is worn" into
 * the list of layers; the kit makes the sprites and keeps them on the body.
 */
export interface DollLayerSpec {
  slot: string;
  key: string;
  tint?: number;
}

/** What a robe, a pair of boots... looks like when nothing is worn there (undyed cloth, dark shoes). */
export const BARE_ROBE = 0xd8d0bc;
export const BARE_BOOTS = 0x4a5468;

const hex = (c: string | undefined): number | undefined => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : undefined);

/** `doll.female.robe.body` -> `doll.female.robe`; undefined for a sprite that is not the body of a doll. */
export function dollPrefixOf(bodyKey: string): string | undefined {
  return bodyKey.startsWith("doll.") && bodyKey.endsWith(".body") ? bodyKey.slice(0, -".body".length) : undefined;
}

/**
 * The layers a doll shows for a look, in drawing order. `has` says whether the manifest has a sprite of a key; a slot without one (an old doll with fewer layers,
 * a hat shape not rendered yet) is left out. A belt and bracers show only when worn; the robe and the boots always (bare ones when nothing is worn); a hat
 * swaps the hair for the one without the knot.
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
  if (lk?.t !== undefined) add("belt", "belt", hex(beltTintOf(lk.t)));
  if (lk?.g !== undefined) add("bracer", "bracer", hex(bracerTintOf(lk.g)));
  add("boots", "boots", lk?.b !== undefined ? (hex(bootsTintOf(lk.b)) ?? BARE_BOOTS) : BARE_BOOTS);
  if (hatted && lk?.h !== undefined) add("hat", `h${hatShapeOf(lk.h)}`, hex(hatTintOf(lk.h)));
  return out;
}

/** The sprite key of a doll's weapon layer for a weapon family, or undefined when the doll has none (the old weapon atlas is used then). */
export function dollWeaponKey(prefix: string, family: string | undefined, has: (key: string) => boolean): string | undefined {
  if (!family) return undefined;
  const key = `${prefix}.w_${family}`;
  return has(key) ? key : undefined;
}

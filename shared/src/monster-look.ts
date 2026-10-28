import type { FlightStyle } from "./art-styles";
import { DEFAULT_TUNING, tuning } from "./tuning";

/** The sprite model of a species from the tuning `monsterModels` (a stored table from before a species got a model falls back to the default one). */
export function monsterModelOf(species: string): string | undefined {
  return tuning().monsterModels[species] ?? DEFAULT_TUNING.monsterModels[species];
}

/** The colour (0xRRGGBB) a monster sprite of this element is multiplied by, or undefined to keep the model's colours. */
export function monsterTintOf(element: string): number | undefined {
  const hex = tuning().monsterTints[element];
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : undefined;
}

/** What a rider of the flight pháp bảo stands on (a stored tuning from before the group existed falls back to the default). */
export function flightStyleOf(): FlightStyle {
  return tuning().flightLooks?.default ?? DEFAULT_TUNING.flightLooks.default;
}

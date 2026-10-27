import { describe, expect, it } from "vitest";
import shipped from "../../client/public/gfx/manifest.json";
import { DEFAULT_TUNING, MONSTERS, validTuningGroup } from "./index";

describe("monsterModels", () => {
  it("defaults are valid, name real species, and every model has a shipped sprite with the animations a monster needs", () => {
    expect(validTuningGroup("monsterModels", DEFAULT_TUNING.monsterModels)).toBe(true);
    for (const [species, model] of Object.entries(DEFAULT_TUNING.monsterModels)) {
      expect(MONSTERS[species], species).toBeDefined();
      const sprite = (shipped.sprites as Record<string, { anims: Record<string, unknown> }>)[`monster.${model}`];
      expect(sprite, model).toBeDefined();
      for (const a of ["idle", "run", "attack", "die"]) expect(sprite!.anims[a], `${model}.${a}`).toBeDefined();
    }
  });

  it("rejects bad species or model names", () => {
    expect(validTuningGroup("monsterModels", { "Bad Key": "bat" })).toBe(false);
    expect(validTuningGroup("monsterModels", { soi_rung: "Bat!" })).toBe(false);
    expect(validTuningGroup("monsterModels", [])).toBe(false);
  });
});

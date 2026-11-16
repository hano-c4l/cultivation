import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, makeEquipmentId, outfitOf, resetTuning, setTuning, validTuningGroup } from "./index";

const robe = (realm: number, dur?: number) => ({ slot: "robe", type: makeEquipmentId("robe", "m", realm, 1, 1), ...(dur !== undefined ? { dur } : {}) });

describe("outfitOf", () => {
  afterEach(() => resetTuning());

  it("is the plain clothes with no robe or a broken robe", () => {
    expect(outfitOf([])).toBeNull();
    expect(outfitOf([{ slot: "weapon", type: "x" }])).toBeNull();
    expect(outfitOf([robe(1, 0)])).toBeNull();
  });

  it("follows the rules in the tuning: the highest minRealm reached wins", () => {
    expect(outfitOf([robe(0)])).toBe("tunic");
    setTuning({ outfits: { rules: [{ minRealm: 0, outfit: "ranger" }, { minRealm: 2, outfit: "mage" }] } });
    expect(outfitOf([robe(1)])).toBe("ranger");
    expect(outfitOf([robe(2)])).toBe("mage");
    expect(outfitOf([robe(3, 10)])).toBe("mage");
  });

  it("lets a robe set of one realm and tier wear its own outfit (byTier)", () => {
    setTuning({ outfits: { rules: DEFAULT_TUNING.outfits.rules, byTier: { "2.1": "armor" } } });
    expect(outfitOf([robe(2)])).toBe("armor");
    expect(outfitOf([robe(3)])).toBe("robe");
    expect(validTuningGroup("outfits", { rules: [], byTier: { "2.1": "armor" } })).toBe(true);
    expect(validTuningGroup("outfits", { rules: [], byTier: { x: "armor" } })).toBe(false);
    expect(validTuningGroup("outfits", { rules: [], byTier: { "2.1": "Bad Name" } })).toBe(false);
  });

  it("validates the rules", () => {
    expect(validTuningGroup("outfits", DEFAULT_TUNING.outfits)).toBe(true);
    expect(validTuningGroup("outfits", { rules: [{ minRealm: 1, outfit: "Bad Name" }] })).toBe(false);
    expect(validTuningGroup("outfits", { rules: [{ minRealm: -1, outfit: "ranger" }] })).toBe(false);
    expect(validTuningGroup("outfits", {})).toBe(false);
  });
});

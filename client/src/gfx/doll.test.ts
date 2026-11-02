import { describe, expect, it } from "vitest";
import { hatShapeOf } from "@game/shared";
import { BARE_BOOTS, BARE_ROBE, dollLayers, dollPrefixOf, dollWeaponKey } from "./doll";

const P = "doll.female.robe";
const all = new Set([`${P}.hair`, `${P}.hairhat`, `${P}.robe`, `${P}.belt`, `${P}.bracer`, `${P}.boots`, ...Array.from({ length: 10 }, (_, i) => `${P}.h${i}`), `${P}.w_kiem`]);
const has = (k: string): boolean => all.has(k);

describe("dollPrefixOf", () => {
  it("names the doll a body sprite belongs to", () => {
    expect(dollPrefixOf("doll.female.robe.body")).toBe(P);
    expect(dollPrefixOf("player.female.tien")).toBeUndefined();
    expect(dollPrefixOf("doll.female.robe.robe")).toBeUndefined();
  });
});

describe("dollLayers", () => {
  it("shows bare cloth and shoes when nothing is worn, and neither belt, bracers nor hat", () => {
    const l = dollLayers(P, undefined, has);
    expect(l.map((x) => x.slot)).toEqual(["hair", "robe", "boots"]);
    expect(l[0]!.key).toBe(`${P}.hair`);
    expect(l[1]!.tint).toBe(BARE_ROBE);
    expect(l[2]!.tint).toBe(BARE_BOOTS);
  });

  it("adds a layer for each worn piece, tinted by its set", () => {
    const l = dollLayers(P, { r: 3, t: 2, g: 1, b: 4 }, has);
    expect(l.map((x) => x.slot)).toEqual(["hair", "robe", "belt", "bracer", "boots"]);
    for (const x of l.slice(1)) expect(x.tint).toBeTypeOf("number");
  });

  it("swaps the hair for the one without the knot under a hat, and picks the hat's shape", () => {
    const l = dollLayers(P, { h: 14 }, has);
    expect(l[0]!.key).toBe(`${P}.hairhat`);
    expect(l.at(-1)).toMatchObject({ slot: "hat", key: `${P}.h${hatShapeOf(14)}` });
  });

  it("leaves out a slot the doll has no sprite for", () => {
    const few = new Set([`${P}.hair`, `${P}.robe`]);
    const l = dollLayers(P, { h: 1, t: 1 }, (k) => few.has(k));
    expect(l.map((x) => x.slot)).toEqual(["hair", "robe"]);
  });
});

describe("dollWeaponKey", () => {
  it("is the doll's own weapon layer when it has one", () => {
    expect(dollWeaponKey(P, "kiem", has)).toBe(`${P}.w_kiem`);
    expect(dollWeaponKey(P, "cung", has)).toBeUndefined();
    expect(dollWeaponKey(P, undefined, has)).toBeUndefined();
  });
});

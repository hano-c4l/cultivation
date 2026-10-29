import { DEFAULT_TUNING } from "@game/shared";
import { describe, expect, it } from "vitest";
import { AUTO_DEFAULTS, decide, newAutoMemory, type AutoMonster, type AutoSettings, type AutoView } from "./auto-brain";
import { loadAuto, saveAuto } from "./auto-store";

const lim = DEFAULT_TUNING.auto;
const mon = (id: string, x: number, y: number, over: Partial<AutoMonster> = {}): AutoMonster => ({ id, x, y, guard: false, boss: false, rare: false, hp: 100, ...over });
const settings = (over: Partial<AutoSettings> = {}): AutoSettings => ({ ...AUTO_DEFAULTS, ...over });

function view(over: Partial<AutoView> = {}): AutoView {
  return {
    now: 10_000,
    self: { x: 20, y: 20, moving: false },
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    busy: false,
    anchor: { x: 20, y: 20 },
    targetId: null,
    monsters: [],
    readyAt: () => 0,
    buffUntil: () => 0,
    mpCost: () => 10,
    hasBasic: true,
    bagCount: () => 0,
    healMsOf: () => 0,
    ...over,
  };
}

describe("the Auto hunt decides what to do next", () => {
  it("attacks the nearest monster in range, never a guard, and respects the boss and rare switches", () => {
    const mem = newAutoMemory();
    const monsters = [mon("guard", 21, 20, { guard: true }), mon("boss", 22, 20, { boss: true }), mon("rare", 23, 20, { rare: true }), mon("far", 40, 20), mon("ok", 25, 20)];
    expect(decide(view({ monsters }), settings({ huntRare: false }), mem, lim)).toEqual({ t: "attack", id: "ok" });
    expect(decide(view({ monsters }), settings({ huntRare: true }), newAutoMemory(), lim)).toEqual({ t: "attack", id: "rare" });
    expect(decide(view({ monsters }), settings({ huntRare: true, huntBoss: true }), newAutoMemory(), lim)).toEqual({ t: "attack", id: "boss" });
  });

  it("measures the range from the spot it started at, not from where the character stands", () => {
    const monsters = [mon("m", 31, 20)]; // 11 from the anchor, 1 from the character
    const v = view({ monsters, self: { x: 30, y: 20, moving: false } });
    expect(decide(v, settings({ radius: 8, returnHome: false }), newAutoMemory(), lim)).toBeNull();
    expect(decide(v, settings({ radius: 8 }), newAutoMemory(), lim)).toEqual({ t: "walk", x: 20, y: 20 }); // out of range: it goes back instead
    expect(decide(v, settings({ radius: 12 }), newAutoMemory(), lim)).toEqual({ t: "attack", id: "m" });
  });

  it("does not send attack again for the target it already has, and uses a skill on it instead", () => {
    const monsters = [mon("m", 23, 20)];
    const st = settings({ skills: ["s:chuong_0"] });
    const act = decide(view({ monsters, targetId: "m" }), st, newAutoMemory(), lim);
    expect(act).toMatchObject({ t: "cast", skill: "chuong_0", target: "m" });
    expect(decide(view({ monsters, targetId: "m", readyAt: () => 99_999 }), st, newAutoMemory(), lim)).toBeNull(); // cooling down: the plain attack carries on
  });

  it("keeps the MP floor and the skill's cost", () => {
    const monsters = [mon("m", 23, 20)];
    const st = settings({ skills: ["s:chuong_0"], mpMin: 50 });
    expect(decide(view({ monsters, targetId: "m", mp: 40 }), st, newAutoMemory(), lim)).toBeNull();
    expect(decide(view({ monsters, targetId: "m", mp: 60, mpCost: () => 70 }), st, newAutoMemory(), lim)).toBeNull();
    expect(decide(view({ monsters, targetId: "m", mp: 60 }), st, newAutoMemory(), lim)).toMatchObject({ t: "cast" });
  });

  it("drinks the potion under the threshold, one at a time, and heals with a skill", () => {
    const mem = newAutoMemory();
    const st = settings({ potion: "pill_hp", potionBelow: 40, skills: ["s:hoi_0"], healBelow: 50 });
    const v = view({ hp: 30, bagCount: () => 3 });
    expect(decide(v, st, mem, lim)).toEqual({ t: "potion", type: "pill_hp" });
    expect(decide({ ...v, now: v.now + 500 }, st, mem, lim)).toMatchObject({ t: "cast", skill: "hoi_0" }); // too soon for another potion: the heal skill
    expect(decide(view({ hp: 80, bagCount: () => 3 }), st, newAutoMemory(), lim)).toBeNull();
    expect(decide(v, st, newAutoMemory(), lim)).toEqual({ t: "potion", type: "pill_hp" });
    expect(decide(view({ hp: 30, bagCount: () => 0 }), settings({ potion: "pill_hp", potionBelow: 40 }), newAutoMemory(), lim)).toBeNull(); // none left
  });

  it("recasts a buff only after it has run out", () => {
    const st = settings({ skills: ["s:thuan_0"] });
    expect(decide(view({ buffUntil: () => 20_000 }), st, newAutoMemory(), lim)).toBeNull();
    expect(decide(view({ buffUntil: () => 5_000 }), st, newAutoMemory(), lim)).toMatchObject({ t: "cast", skill: "thuan_0", target: null });
  });

  it("gives up on a target that stops losing HP, and walks home when nothing is left", () => {
    const mem = newAutoMemory();
    const monsters = [mon("stuck", 24, 20), mon("other", 26, 20)];
    expect(decide(view({ monsters, targetId: "stuck" }), settings(), mem, lim)).toBeNull(); // starts watching
    const later = view({ monsters, targetId: "stuck", now: 10_000 + lim.giveUpMs + 100 });
    expect(decide(later, settings(), mem, lim)).toEqual({ t: "attack", id: "other" }); // skips the stuck one
    const away = view({ now: 50_000, self: { x: 30, y: 20, moving: false } });
    expect(decide(away, settings(), newAutoMemory(), lim)).toEqual({ t: "walk", x: 20, y: 20 });
    expect(decide(away, settings({ returnHome: false }), newAutoMemory(), lim)).toBeNull();
  });

  it("does nothing while busy (dead, changing map, in a breakthrough)", () => {
    expect(decide(view({ busy: true, monsters: [mon("m", 22, 20)] }), settings(), newAutoMemory(), lim)).toBeNull();
  });

  it("a skill that was refused is left alone until its back-off ends", () => {
    const mem = newAutoMemory();
    const st = settings({ skills: ["s:chuong_0"] });
    const monsters = [mon("m", 23, 20)];
    mem.backoffUntil.set("chuong_0", 12_000);
    expect(decide(view({ monsters, targetId: "m" }), st, mem, lim)).toBeNull();
    expect(decide(view({ monsters, targetId: "m", now: 12_500 }), st, mem, lim)).toMatchObject({ t: "cast" });
  });
});

describe("the basic qi blast and the MP pill", () => {
  const monsters = [mon("m", 25, 20)];

  it("is thrown in place of the plain attack when ticked, in the chosen element, while MP lasts", () => {
    const on = settings({ basic: true, basicElement: "hoa" });
    expect(decide(view({ monsters, targetId: "m" }), on, newAutoMemory(), lim)).toEqual({ t: "cast", value: "s:khi_co_ban:hoa", skill: "khi_co_ban", element: "hoa", target: "m" });
    expect(decide(view({ monsters, targetId: "m" }), settings({ basic: true }), newAutoMemory(), lim)).toMatchObject({ skill: "khi_co_ban", element: null, value: "s:khi_co_ban" });
    expect(decide(view({ monsters, targetId: "m" }), settings({ basic: false }), newAutoMemory(), lim)).toBeNull(); // not ticked: the plain attack
    expect(decide(view({ monsters, targetId: "m", mp: 2 }), on, newAutoMemory(), lim)).toBeNull(); // not enough MP for it: the plain attack
    expect(decide(view({ monsters, targetId: "m", readyAt: () => 99_999 }), on, newAutoMemory(), lim)).toBeNull(); // cooling down
    expect(decide(view({ monsters, targetId: "m", hasBasic: false }), on, newAutoMemory(), lim)).toBeNull();
  });

  it("a chosen skill comes before the basic one, and the basic one waits out of its reach", () => {
    const both = settings({ basic: true, skills: ["s:chuong_0"] });
    expect(decide(view({ monsters, targetId: "m" }), both, newAutoMemory(), lim)).toMatchObject({ skill: "chuong_0" });
    expect(decide(view({ monsters: [mon("far", 33, 20)], targetId: "far" }), settings({ basic: true, radius: 20 }), newAutoMemory(), lim)).toBeNull(); // 13 tiles away: the basic blast reaches 7
  });

  it("drinks an MP pill under the threshold, apart from the healing one", () => {
    const st = settings({ mpPotion: "hoi_linh_dan", mpPotionBelow: 30, potion: "hoi_huyet_dan", potionBelow: 40 });
    const v = view({ mp: 20, bagCount: () => 5 });
    expect(decide(v, st, newAutoMemory(), lim)).toEqual({ t: "potion", type: "hoi_linh_dan" });
    expect(decide(view({ mp: 60, bagCount: () => 5 }), st, newAutoMemory(), lim)).toBeNull();
    expect(decide(view({ hp: 20, mp: 20, bagCount: () => 5 }), st, newAutoMemory(), lim)).toEqual({ t: "potion", type: "hoi_huyet_dan" }); // HP first
  });

  it("the range goes much further than before", () => {
    expect(lim.radiusMax).toBeGreaterThanOrEqual(40);
    expect(decide(view({ monsters: [mon("m", 45, 20)] }), settings({ radius: 30 }), newAutoMemory(), lim)).toEqual({ t: "attack", id: "m" }); // 25 tiles from the anchor
  });
});

describe("the saved settings", () => {
  it("come back as saved, per character, and a broken or foreign value falls back to the defaults", () => {
    const store = new Map<string, string>();
    const write = (k: string, v: string) => void store.set(k, v);
    const read = (k: string) => store.get(k) ?? null;
    saveAuto("c1", settings({ radius: 11, skills: ["s:chuong_0:kim"], potion: "pill_hp", huntBoss: true, basic: true, basicElement: "moc", mpPotion: "hoi_linh_dan" }), write);
    const back = loadAuto("c1", read);
    expect(back).toMatchObject({ radius: 11, skills: ["s:chuong_0:kim"], potion: "pill_hp", huntBoss: true, basic: true, basicElement: "moc", mpPotion: "hoi_linh_dan" });
    expect(loadAuto("c2", read).skills).toEqual([]);
    store.set("auto:c3", "{not json");
    expect(loadAuto("c3", read).radius).toBe(lim.radiusDefault);
    store.set("auto:c4", JSON.stringify({ v: 1, radius: 999, mpMin: -5, skills: ["x", 3, "s:hoi_0"], potion: "../evil" }));
    expect(loadAuto("c4", read)).toMatchObject({ radius: lim.radiusMax, mpMin: 0, skills: ["s:hoi_0"], potion: "" });
  });
});

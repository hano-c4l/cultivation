/**
 * The mind of the Auto hunt: one pure function that looks at what the character sees and says the next thing to do, one command at a time. The scene
 * only gathers the view and carries the command out through the same messages a player's clicks send, so the server's rules (reach, cooldowns, MP,
 * rate limits) apply unchanged. Nothing here knows about Phaser, the network or the page.
 */
import { castReachOf, getSkill, parseSkillSlot, type AutoLimits } from "@game/shared";

/** What the player chose in the Auto window (kept in the browser, per character). */
export interface AutoSettings {
  v: 1;
  /** How far from the spot where Start was pressed the character goes after monsters, in tiles. */
  radius: number;
  /** Walk back to that spot when no monster is left in range. */
  returnHome: boolean;
  /** Fight the rare monsters / the map boss as well as the ordinary ones. */
  huntRare: boolean;
  huntBoss: boolean;
  /** The skills to use, as hotbar values ("s:<skill>[:<element>]"; the element comes with them, so a flexible skill is used as it was set up). In this order. */
  skills: string[];
  /** Attack skills are only used while MP is at least this share (percent). */
  mpMin: number;
  /** A healing skill is used below this share of HP (percent). */
  healBelow: number;
  /** The potion (an item type) to drink below `potionBelow` percent of HP; empty: none. */
  potion: string;
  potionBelow: number;
  /** The same for MP (a pill that restores linh lực). */
  mpPotion: string;
  mpPotionBelow: number;
}

export const AUTO_DEFAULTS: AutoSettings = { v: 1, radius: 8, returnHome: true, huntRare: true, huntBoss: false, skills: [], mpMin: 20, healBelow: 50, potion: "", potionBelow: 40, mpPotion: "", mpPotionBelow: 30 };

export interface AutoMonster {
  id: string;
  x: number;
  y: number;
  guard: boolean;
  boss: boolean;
  /** A rare class (not the ordinary one). */
  rare: boolean;
  hp: number;
}

/** Everything the decision needs, gathered by the scene each time. */
export interface AutoView {
  now: number;
  self: { x: number; y: number; moving: boolean };
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Nothing to do now: dead, changing map, in a breakthrough or a talisman channel. */
  busy: boolean;
  /** The player is walking by hand (a click on the ground): the hunt only casts at what is already in reach and neither picks targets nor walks. */
  manual?: boolean;
  /** Where Start was pressed (or where the last manual walk ended). */
  anchor: { x: number; y: number };
  /** The monster the character has targeted now (the server keeps it until it dies or another is picked). */
  targetId: string | null;
  monsters: readonly AutoMonster[];
  /** When a skill is ready again (performance.now), and until when a buff cast earlier still runs. */
  readyAt(skillId: string): number;
  buffUntil(skillId: string): number;
  mpCost(skillId: string): number;
  /** How many of an item type are in the bag, and how long the heal of a potion takes to land in full (0: at once). */
  bagCount(type: string): number;
  healMsOf(type: string): number;
}

/** What the decision remembers from one turn to the next. */
export interface AutoMemory {
  /** The target being watched and when its HP last changed: a monster that does not lose HP for a long while is out of reach. */
  watchId: string | null;
  watchHp: number;
  watchSince: number;
  /** Monsters given up on, until when. */
  skipUntil: Map<string, number>;
  potionAt: number;
  mpPotionAt: number;
  homeAt: number;
  /** A skill that was refused is left alone until this time. */
  backoffUntil: Map<string, number>;
}

export const newAutoMemory = (): AutoMemory => ({ watchId: null, watchHp: 0, watchSince: 0, skipUntil: new Map(), potionAt: 0, mpPotionAt: 0, homeAt: 0, backoffUntil: new Map() });

export type AutoAction =
  | { t: "potion"; type: string }
  | { t: "cast"; value: string; skill: string; element: string | null; target: string | null; /** A point to cast at instead of a target (a walk by hand: naming a target would make the server chase it). */ at?: { x: number; y: number } }
  | { t: "attack"; id: string }
  | { t: "walk"; x: number; y: number };

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** The next command, or null to do nothing this turn. At most one a turn, so the server's own limits are never pressed. */
export function decide(view: AutoView, s: AutoSettings, mem: AutoMemory, lim: AutoLimits): AutoAction | null {
  if (view.busy) return null;
  const { now } = view;
  const hpPct = view.maxHp > 0 ? (view.hp / view.maxHp) * 100 : 100;
  const mpPct = view.maxMp > 0 ? (view.mp / view.maxMp) * 100 : 100;

  // 1. a potion when HP is low (a heal that lands slowly is given time to land before the next one)
  if (s.potion && hpPct < s.potionBelow && view.bagCount(s.potion) > 0 && now >= mem.potionAt) {
    mem.potionAt = now + Math.max(lim.potionGapMs, view.healMsOf(s.potion) + 300);
    return { t: "potion", type: s.potion };
  }

  // 1b. a pill for linh lực when MP is low
  if (s.mpPotion && mpPct < s.mpPotionBelow && view.bagCount(s.mpPotion) > 0 && now >= mem.mpPotionAt) {
    mem.mpPotionAt = now + Math.max(lim.potionGapMs, view.healMsOf(s.mpPotion) + 300);
    return { t: "potion", type: s.mpPotion };
  }

  const picks = s.skills.flatMap((value) => {
    const slot = parseSkillSlot(value);
    const def = slot ? getSkill(slot.id) : undefined;
    return slot && def ? [{ value, slot, def }] : [];
  });
  const usable = (id: string): boolean => view.readyAt(id) <= now && (mem.backoffUntil.get(id) ?? 0) <= now && view.mp >= view.mpCost(id);
  const cast = (p: (typeof picks)[number], target: string | null): AutoAction => ({ t: "cast", value: p.value, skill: p.slot.id, element: p.slot.element, target });

  // 2. a healing skill when HP is low
  if (hpPct < s.healBelow) {
    const heal = picks.find((p) => p.def.kind === "heal" && usable(p.slot.id));
    if (heal) return cast(heal, null);
  }
  // 3. a buff that is not running
  const buff = picks.find((p) => p.def.kind === "buff" && usable(p.slot.id) && view.buffUntil(p.slot.id) <= now);
  if (buff) return cast(buff, null);

  const eligible = (m: AutoMonster): boolean => !m.guard && !(m.boss && !s.huntBoss) && !(m.rare && !m.boss && !s.huntRare) && (mem.skipUntil.get(m.id) ?? 0) <= now;

  // 3b. walking by hand: attack skills still fire at the nearest monster within their reach, but nothing steers the character
  if (view.manual) {
    const attacks = picks.filter((p) => p.def.kind === "attack");
    if (mpPct < s.mpMin || attacks.length === 0) return null;
    let nearest: AutoMonster | undefined;
    let nearestD = Infinity;
    for (const m of view.monsters) {
      const d = dist(m.x, m.y, view.self.x, view.self.y);
      if (eligible(m) && d < nearestD) {
        nearest = m;
        nearestD = d;
      }
    }
    if (!nearest) return null;
    // A margin inside the reach: the character is walking, and a blow that falls out of reach by the time it goes off would make the server walk it to the point.
    const atk = attacks.find((p) => usable(p.slot.id) && nearestD <= Math.max(1, castReachOf(p.def) - 1.5));
    return atk ? { t: "cast", value: atk.value, skill: atk.slot.id, element: atk.slot.element, target: null, at: { x: nearest.x, y: nearest.y } } : null;
  }

  // 4. a target: the one being fought while it stays in range and keeps losing HP, else the nearest one worth fighting
  const near = (m: AutoMonster): boolean => dist(m.x, m.y, view.anchor.x, view.anchor.y) <= s.radius;
  let target = view.targetId ? view.monsters.find((m) => m.id === view.targetId) : undefined;
  if (target && (!near(target) || target.guard)) target = undefined;
  if (target) {
    if (mem.watchId !== target.id || target.hp !== mem.watchHp) {
      mem.watchId = target.id;
      mem.watchHp = target.hp;
      mem.watchSince = now;
    } else if (now - mem.watchSince > lim.giveUpMs) {
      mem.skipUntil.set(target.id, now + lim.skipMs); // it has not lost HP for a long time: behind a wall, say
      target = undefined;
    }
  }
  if (!target) {
    let best: AutoMonster | undefined;
    let bestD = Infinity;
    for (const m of view.monsters) {
      if (!near(m) || !eligible(m)) continue;
      const d = dist(m.x, m.y, view.self.x, view.self.y);
      if (d < bestD) {
        best = m;
        bestD = d;
      }
    }
    if (best) {
      mem.watchId = best.id;
      mem.watchHp = best.hp;
      mem.watchSince = now;
      return { t: "attack", id: best.id }; // only when the target changes: a new target cancels a skill that is walking into range
    }
    // nothing to fight: back to the spot
    if (s.returnHome && !view.self.moving && now >= mem.homeAt && dist(view.self.x, view.self.y, view.anchor.x, view.anchor.y) > 2) {
      mem.homeAt = now + 3000;
      return { t: "walk", x: view.anchor.x, y: view.anchor.y };
    }
    return null;
  }

  // 5. an attack skill, while MP stays above the floor and the target is within the skill's reach
  if (mpPct >= s.mpMin) {
    const d = dist(view.self.x, view.self.y, target.x, target.y);
    const atk = picks.find((p) => p.def.kind === "attack" && usable(p.slot.id) && d <= castReachOf(p.def));
    if (atk) return cast(atk, target.id);
  }
  // Otherwise the plain attack carries on; it is the attack the player chose for the slot in front of the hotbar (the server uses it), so Auto has nothing of its own to say here.
  return null;
}

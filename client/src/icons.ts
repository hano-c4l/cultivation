import { equipmentInfo, getItemDef, skillLookOf, type SkillDef } from "@game/shared";
import { ELEMENT_COLOR, skillFxOf } from "./fx-kinds";

/**
 * Icons of items and skills, drawn with SVG shapes (no image files). `iconFor` and `skillIconFor` are the ONLY places that turn an item or a skill into a
 * picture, the counterpart of `GfxKit.spriteKeyFor`: phase 4i can wrap them with a D1 per-item choice without touching any screen. The shape comes
 * from data that already exists (the kind and weapon type of gear, the category of other items, the effect kind of a skill), so an item an Admin
 * creates gets an icon with no code change; the element colours the accent and the grade tints the disc behind it (`--grade-N`, from the theme tuning).
 */

/** The shapes an icon can have. */
export type IconShape =
  | "sword" | "saber" | "spear" | "axe" | "bow" | "fist"
  | "hat" | "robe" | "bracer" | "ring" | "jade" | "necklace" | "belt" | "boots" | "charm" | "bonded" | "flight"
  | "pill" | "ore" | "book" | "scroll" | "unknown"
  | "slash" | "bolt" | "fan" | "blink" | "buff" | "heal" | "passive"
  // the ways of delivering an attack skill: through a line, round the caster, a lane on the ground, a field on the ground
  | "pierce" | "nova" | "lane" | "field"
  // the interface: the currencies and the buttons of the windows
  | "stone" | "merit" | "immortal" | "person" | "shield" | "bag" | "taiji" | "trophy" | "swap" | "door" | "meditate";

export interface IconSpec {
  shape: IconShape;
  /** An element key (`ELEMENT_COLOR`) that colours the accent, or null for gold. */
  element: string | null;
  /** The grade (1..5) that tints the disc behind the icon, or 0 for none. */
  grade: number;
}

const WEAPON_SHAPES: Readonly<Record<string, IconShape>> = { kiem: "sword", dao: "saber", thuong: "spear", riu: "axe", cung: "bow", quyen: "fist" };
const KIND_SHAPES: Readonly<Record<string, IconShape>> = {
  hat: "hat", robe: "robe", bracer: "bracer", ring: "ring", jade: "jade", necklace: "necklace", belt: "belt", boots: "boots", charm: "charm", bonded: "bonded", flight: "flight", weapon: "sword",
};

/** What an item looks like, from its type: gear by kind (weapons by family), anything else by category. An unknown type gets the question-mark box. */
export function iconSpecOf(type: string): IconSpec {
  const eq = equipmentInfo(type);
  if (eq) {
    const shape = (eq.kind === "weapon" && eq.weaponType ? WEAPON_SHAPES[eq.weaponType] : undefined) ?? KIND_SHAPES[eq.kind] ?? "unknown";
    return { shape, element: eq.element, grade: eq.grade };
  }
  const def = getItemDef(type);
  if (!def) return { shape: "unknown", element: null, grade: 0 };
  let shape: IconShape = "ore";
  if (def.teaches !== undefined || def.category === "skill_book") shape = "book";
  else if (def.pathItem !== undefined) shape = "scroll";
  else if (def.category === "consumable") shape = "pill";
  return { shape, element: null, grade: def.grade ?? 0 };
}

/** What a skill looks like: the glyph of its effect (so an Admin's `fx` choice changes it too), in the colour of its element. */
export function skillIconSpecOf(def: SkillDef | undefined): IconSpec {
  if (!def) return { shape: "unknown", element: null, grade: 0 };
  if (def.kind === "passive") return { shape: "passive", element: def.element ?? null, grade: 0 };
  const look = skillLookOf(def);
  if (def.kind === "attack" && (look === "lance" || look === "nova" || look === "lane" || look === "field")) {
    return { shape: look === "lance" ? "pierce" : look, element: def.element ?? null, grade: 0 };
  }
  const fx = skillFxOf(def);
  const shape: IconShape = fx === "melee" ? "slash" : fx === "ranged" ? "bolt" : fx === "cone" ? "fan" : fx === "blink" ? "blink" : fx;
  return { shape, element: def.element ?? null, grade: 0 };
}

/** One piece of a drawing: an SVG path in a 32x32 box, painted with a palette role. */
type Part = readonly [d: string, paint: "m" | "a" | "d" | "l" | "w" | "g" | "p", stroke?: number];

/** The drawings. Roles: m = main (steel, cloth), a = accent (the element, or gold), d = dark, l = light, w = wood, g = gold, p = paper. A stroke width makes it a line. */
const SHAPES: Readonly<Record<IconShape, readonly Part[]>> = {
  sword: [["M16 2 L19 18 L16 21 L13 18 Z", "m"], ["M16 3 L16 19", "l", 1], ["M9 20 H23 V22.5 H9 Z", "g"], ["M15 22.5 H17 V28 H15 Z", "w"], ["M16 28 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", "g"]],
  saber: [["M22 3 C27 12 22 20 12 21 L11 18 C18 16 20 10 22 3 Z", "m"], ["M9 19 L17 24 L15.5 26 L7.5 21 Z", "g"], ["M12 23 L6 29 L8.5 30 L14.5 24.5 Z", "w"]],
  spear: [["M5.5 26.5 L7 28 L23 12 L21.5 10.5 Z", "w"], ["M21 9 L28 3 L25 13 Z", "m"], ["M20 12 L24 8", "a", 2]],
  axe: [["M8 28 L10.5 29 L22 8 L20 7 Z", "w"], ["M16 6 C22 2 29 6 27 12 C24 9 21 10 19 13 Z", "m"], ["M18 7 C22 5 26 7 26 10", "l", 1]],
  bow: [["M9 3 C26 10 26 22 9 29", "w", 2.4], ["M9 3 L9 29", "l", 1], ["M9 16 L26 16 M26 16 l-3 -2.5 M26 16 l-3 2.5", "a", 1.6]],
  fist: [["M9 14 H23 V25 Q16 29 9 25 Z", "m"], ["M9 14 q1 -5 3.5 0 q1 -5 3.5 0 q1 -5 3.5 0 q1 -5 3.5 0", "m"], ["M10 21 H22", "d", 1], ["M7 19 L9 23", "a", 2]],
  hat: [["M16 4 L26 20 H6 Z", "m"], ["M3 20.5 Q16 26 29 20.5 Q16 23 3 20.5 Z", "a"], ["M16 4 L19 14", "l", 1]],
  robe: [["M11 4 L5 10 L8 28 H24 L27 10 L21 4 L18 8 H14 Z", "m"], ["M13 6 L16 16 L19 6", "a", 2], ["M8 20 H24", "d", 1]],
  bracer: [["M7 8 H25 V24 H7 Z", "m"], ["M7 12 H25 V14.5 H7 Z", "a"], ["M7 18 H25 V20.5 H7 Z", "a"], ["M10 8 V24", "l", 1]],
  ring: [["M16 27 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0", "g", 3], ["M16 3 L21 9 L16 14 L11 9 Z", "a"], ["M16 5 L18 9 L16 11", "l", 1]],
  jade: [["M16 16 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M16 16 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", "m"], ["M9 10 Q12 6 17 6", "l", 1.6], ["M16 16 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", "d", 1]],
  necklace: [["M5 5 Q16 29 27 5", "g", 1.6], ["M16 19 L21 25 L16 31 L11 25 Z", "a"], ["M16 21 L18 25", "l", 1]],
  belt: [["M3 12 H29 V20 H3 Z", "w"], ["M11 9 H21 V23 H11 Z", "g"], ["M14 13 H18 V19 H14 Z", "d"], ["M3 14 H29", "l", 1]],
  boots: [["M10 3 H19 V16 Q28 17 28 24 V27 H9 Z", "m"], ["M9 27 H28 V30 H9 Z", "d"], ["M10 8 H19", "a", 2]],
  charm: [["M10 3 H22 V29 H10 Z", "p"], ["M13 8 H19 M13 13 H19 M16 8 V22 M13 18 L19 18", "a", 1.8], ["M10 3 H22", "d", 1]],
  bonded: [["M16 16 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", "a"], ["M12 12 m-3.5 0 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0", "l"], ["M3 20 Q16 28 29 12", "g", 1.4]],
  flight: [["M7 21 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M13 18 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M21 20 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M26 22 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", "l"], ["M4 24 H29", "a", 2], ["M16 6 L21 14 H11 Z", "m"]],
  pill: [["M16 16 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", "a"], ["M11 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", "l"], ["M8 19 Q16 26 24 19", "d", 1]],
  ore: [["M5 23 L11 8 L20 5 L28 15 L24 27 H9 Z", "m"], ["M11 8 L15 17 L20 5 M15 17 L24 27", "l", 1], ["M20 5 L28 15 L22 17 Z", "a"]],
  book: [["M6 4 H25 V28 H6 Z", "m"], ["M6 4 H10 V28 H6 Z", "d"], ["M12 8 H23 V12 H12 Z", "l"], ["M17 20 m-3.5 0 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0", "a"]],
  scroll: [["M8 6 H24 V26 H8 Z", "p"], ["M5 4 H27 V8 H5 Z", "w"], ["M5 24 H27 V28 H5 Z", "w"], ["M11 12 H21 M11 16 H21 M11 20 H18", "a", 1.4]],
  unknown: [["M4 4 H28 V28 H4 Z", "d"], ["M12 12 Q12 8 16 8 Q20 8 20 12 Q20 15 16 16 V19 M16 22 V24", "l", 2.2]],
  slash: [["M5 25 Q14 4 28 7", "a", 5], ["M7 24 Q15 9 27 8", "l", 1.8]],
  bolt: [["M25 7 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", "a"], ["M4 28 L19 12", "a", 3], ["M25 7 m-1.8 0 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0", "l"], ["M8 22 L14 22 M11 26 L16 26", "l", 1.2]],
  fan: [["M16 28 L3 10 Q16 1 29 10 Z", "a"], ["M16 28 L8 7 M16 28 L16 4 M16 28 L24 7", "l", 1]],
  blink: [["M4 8 L13 16 L4 24", "a", 3], ["M15 8 L24 16 L15 24", "l", 3]],
  buff: [["M16 16 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0", "a", 2], ["M16 25 V8 M9 15 L16 8 L23 15", "l", 3]],
  heal: [["M12 5 H20 V12 H27 V20 H20 V27 H12 V20 H5 V12 H12 Z", "a"], ["M13 7 V13 H7", "l", 1]],
  pierce: [["M3 16 H25", "a", 3.2], ["M27 16 L20 10 M27 16 L20 22", "a", 3], ["M9 16 m-2.2 0 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0", "l"], ["M16 16 m-2.2 0 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0", "l"]],
  nova: [["M16 16 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", "a"], ["M16 16 m-11.5 0 a11.5 11.5 0 1 0 23 0 a11.5 11.5 0 1 0 -23 0", "a", 2], ["M16 2 V6 M16 26 V30 M2 16 H6 M26 16 H30", "l", 2]],
  lane: [["M3 27 H29", "d", 1.4], ["M8 26 Q4 18 9 9 Q11 16 13 18 Q14 12 16 5 Q24 15 21 26 Z", "a"], ["M12 26 Q11 21 14 17 Q17 21 17 26 Z", "l"], ["M23 26 Q22 22 24 19 Q27 22 26 26 Z", "a"]],
  field: [["M16 20 m-12 0 a12 6 0 1 0 24 0 a12 6 0 1 0 -24 0", "a"], ["M16 20 m-8 0 a8 3.8 0 1 0 16 0 a8 3.8 0 1 0 -16 0", "l", 1], ["M10 17 L10 8 M16 18 L16 5 M22 17 L22 10", "a", 2.4]],
  stone: [["M16 3 L27 11 L22 28 H10 L5 11 Z", "m"], ["M5 11 H27", "l", 1], ["M16 3 L12 11 L16 27 L20 11 Z", "l", 1]],
  merit: [["M16 16 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0", "m"], ["M16 16 m-8.5 0 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0", "l", 1], ["M12 12 H20 V20 H12 Z", "d"]],
  immortal: [["M16 16 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0", "m"], ["M16 7 Q21 14 16 23 Q11 14 16 7 Z", "l"], ["M8 14 Q14 15 16 23 Q9 23 8 14 Z", "l"], ["M24 14 Q18 15 16 23 Q23 23 24 14 Z", "l"]],
  person: [["M16 10 m-5.5 0 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0", "m"], ["M5 29 Q5 17 16 17 Q27 17 27 29 Z", "m"], ["M12 22 L16 27 L20 22", "d", 1.2]],
  shield: [["M16 3 L27 7 V16 Q27 25 16 29 Q5 25 5 16 V7 Z", "m"], ["M16 3 V29", "l", 1], ["M5 14 H27", "l", 1]],
  bag: [["M8 12 H24 L26 28 H6 Z", "m"], ["M12 12 V9 Q12 4 16 4 Q20 4 20 9 V12", "d", 2], ["M6 18 H26", "d", 1]],
  taiji: [["M16 16 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0", "l"], ["M16 4 A12 12 0 0 1 16 28 A6 6 0 0 1 16 16 A6 6 0 0 0 16 4 Z", "d"], ["M16 10 m-1.8 0 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0", "l"], ["M16 22 m-1.8 0 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0", "d"]],
  trophy: [["M9 4 H23 V13 Q23 20 16 21 Q9 20 9 13 Z", "m"], ["M9 7 H4 Q4 14 10 15 M23 7 H28 Q28 14 22 15", "g", 1.6], ["M14 21 H18 V25 H14 Z", "g"], ["M10 25 H22 V29 H10 Z", "g"]],
  swap: [["M5 11 H24 M24 11 l-5 -5 M24 11 l-5 5", "l", 2.4], ["M27 21 H8 M8 21 l5 -5 M8 21 l5 5", "a", 2.4]],
  door: [["M7 4 H20 V28 H7 Z", "w"], ["M17 16 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0", "g"], ["M22 16 H30 M30 16 l-4 -4 M30 16 l-4 4", "a", 2]],
  // a figure sitting cross-legged with its hands in the lap, a halo behind the head
  meditate: [["M16 9 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "l", 1], ["M16 10 m-3.2 0 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0", "m"], ["M16 14 Q10 15 10 22 L22 22 Q22 15 16 14 Z", "m"], ["M4 26 Q8 22 16 25 Q24 22 28 26 Q22 29 16 27 Q10 29 4 26 Z", "a"], ["M13 21 Q16 23 19 21", "d", 1.2]],
  passive: [["M16 3 L19.5 12 L29 12.5 L21.5 18.5 L24 28 L16 22.5 L8 28 L10.5 18.5 L3 12.5 L12.5 12 Z", "a"], ["M16 7 L18 13", "l", 1.2]],
};

const SVG_NS = "http://www.w3.org/2000/svg";
const FIXED: Readonly<Record<string, string>> = { d: "#3a2f26", l: "rgba(255,255,255,0.75)", w: "#8d6e4a", g: "#e0b84a", p: "#f2e6b8" };
const MAIN: Readonly<Partial<Record<IconShape, string>>> = { stone: "#6fb7ff", merit: "#e0b84a", immortal: "#f4a6d0", person: "#c9d4e6", shield: "#7a8fb8", bag: "#a8794a", trophy: "#e0b84a", fist: "#e6c4a0", ore: "#9aa7a0", robe: "#7a8fb8", hat: "#b89b6a", jade: "#7fcfa6", pill: "#e0b84a", book: "#8a5a9a", boots: "#7a5a3a", bracer: "#8a8f99", flight: "#cfd8e6" };
const STEEL = "#cfd8dc";

function paint(role: Part[1], shape: IconShape, accent: string): string {
  if (role === "a") return accent;
  if (role === "m") return MAIN[shape] ?? STEEL;
  return FIXED[role] ?? STEEL;
}

const cache = new Map<string, SVGSVGElement>();

/** Builds (once per look) and returns a fresh copy of the icon for a spec. Built with DOM calls, never with a string of markup. */
export function renderIcon(spec: IconSpec): SVGSVGElement {
  const rgb = spec.element ? ELEMENT_COLOR[spec.element] : undefined;
  const accent = rgb !== undefined ? `#${rgb.toString(16).padStart(6, "0")}` : "#e0b84a";
  const key = `${spec.shape}|${accent}|${spec.grade}`;
  let node = cache.get(key);
  if (!node) {
    node = document.createElementNS(SVG_NS, "svg");
    node.setAttribute("viewBox", "0 0 32 32");
    node.setAttribute("class", "ic");
    node.setAttribute("aria-hidden", "true");
    if (spec.grade > 0) {
      const disc = document.createElementNS(SVG_NS, "circle");
      disc.setAttribute("cx", "16");
      disc.setAttribute("cy", "16");
      disc.setAttribute("r", "15");
      disc.setAttribute("fill", `var(--grade-${Math.min(4, spec.grade - 1)}, rgba(158,158,158,0.3))`);
      node.append(disc);
    }
    for (const [d, role, stroke] of SHAPES[spec.shape]) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      const color = paint(role, spec.shape, accent);
      if (stroke) {
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", color);
        p.setAttribute("stroke-width", String(stroke));
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("stroke-linejoin", "round");
      } else {
        p.setAttribute("fill", color);
        p.setAttribute("stroke", "#2a2018");
        p.setAttribute("stroke-width", "0.9");
        p.setAttribute("stroke-linejoin", "round");
      }
      node.append(p);
    }
    cache.set(key, node);
  }
  return node.cloneNode(true) as SVGSVGElement;
}

/** The icon of an interface element (a currency, the button of a window). */
export function uiIcon(shape: IconShape): SVGSVGElement {
  return renderIcon({ shape, element: null, grade: 0 });
}

/** Turns a text button into an icon button: the words move to the tooltip and the accessible name, so nothing is lost by hovering. */
export function iconButton(btn: HTMLElement, shape: IconShape, label: string): void {
  btn.replaceChildren(uiIcon(shape));
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.classList.add("icon-btn");
}

/** The icon of an item type (a bag cell, a shop row, the gear window). */
export function iconFor(type: string): SVGSVGElement {
  return renderIcon(iconSpecOf(type));
}

/** The icon of a skill (the hotbar, the skills window). */
export function skillIconFor(def: SkillDef | undefined): SVGSVGElement {
  return renderIcon(skillIconSpecOf(def));
}

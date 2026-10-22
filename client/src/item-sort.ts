import { ITEM_RARITIES, SORT_MODES, getItemDef, type SortMode } from "@game/shared";
import { itemTierRealm } from "./equip-text";
import { vi } from "./locales/vi";

/**
 * Orders a list of items the way the bag's sort modes do (name, rarity, grade, realm); a view only, nothing is rewritten.
 * The name sorts A to Z, the others put the higher first (ties by name).
 */
export function sortItemsBy<T>(list: readonly T[], mode: SortMode, typeOf: (x: T) => string, lvOf: (x: T) => number | undefined): T[] {
  const name = (x: T) => getItemDef(typeOf(x))?.nameVi ?? typeOf(x);
  const rarity = (x: T) => ITEM_RARITIES.indexOf(getItemDef(typeOf(x))?.rarity ?? "common");
  const grade = (x: T) => getItemDef(typeOf(x))?.grade ?? 0;
  const realm = (x: T) => itemTierRealm(typeOf(x), lvOf(x)) ?? -1;
  return [...list].sort((a, b) => {
    let d = 0;
    if (mode === "rarity") d = rarity(b) - rarity(a);
    else if (mode === "grade") d = grade(b) - grade(a);
    else if (mode === "realm") d = realm(b) - realm(a) || grade(b) - grade(a);
    return d || name(a).localeCompare(name(b), "vi");
  });
}

/**
 * The sort controls of the bag: a drop-down with the kind of sort and a "Sắp xếp" button. Picking a kind changes nothing by itself;
 * the button applies it (`onSort`).
 */
export function sortControls(className: string, picked: SortMode, onPick: (mode: SortMode) => void, onSort: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = className;
  const select = document.createElement("select");
  for (const m of SORT_MODES) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = vi.inventory.sortModes[m] ?? m;
    o.selected = m === picked;
    select.append(o);
  }
  select.onchange = () => onPick(select.value as SortMode);
  const button = document.createElement("button");
  button.textContent = vi.inventory.sort;
  button.onclick = onSort;
  box.append(select, button);
  return box;
}

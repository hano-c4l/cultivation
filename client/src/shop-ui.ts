import {
  REALMS,
  SHOP_CATEGORIES,
  SHOP_SELL_MANY_MAX,
  ALL_ROOTS,
  MAX_SHOP_QTY,
  equipmentInfo,
  getItemDef,
  getMerchant,
  merchantOffers,
  merchantPays,
  shopCategoryOf,
  tuning,
  type BagItem,
  type BrewJobView,
  type CharacterSheet,
  type ClientMessage,
  type NpcView,
  type ShopCategory,
  type SortMode,
} from "@game/shared";
import { sortControls, sortItemsBy } from "./item-sort";
import { elementDot, equipLines, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface ShopUi {
  /** Opens the window for the merchant `npc` of the map `mapId` (the server answers with the stock left). */
  open(npc: string, mapId: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  /** Units left today per offer with a daily limit, and the windows this NPC has (tabs). */
  setStock(npc: string, left: Record<string, number>, tabs: NpcView[]): void;
  /** The alchemist's brewings (`now` is the server time, so the countdowns follow the server clock). */
  setBrew(npc: string, jobs: BrewJobView[], now: number, tabs: NpcView[]): void;
  /** The bag changed: the list of things that can be sold may have too. */
  refresh(): void;
  /** A trade went through: shown as a green line at the top of the window. */
  notify(text: string): void;
  /** The merchant refuses this player: the window shows only the reason. */
  ban(text: string): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Tabs that list items with an element, so they get the element selector. */
const ELEMENT_TABS: ReadonlySet<ShopCategory> = new Set<ShopCategory>(["all", "gear", "artifact", "book"]);

/**
 * The merchant's window: a buy tab (what he sells to this character, with the stock left today) and a sell tab (the bag
 * items he takes), each split by kind of item. Buying can be narrowed to one element. The sell tab can tick several items
 * and sell them in one go. It only sends offer ids and cells; the server prices and decides.
 */
export function initShop(send: (msg: ClientMessage) => void, getBag: () => BagItem[], switchView: (npc: string, view: NpcView) => void): ShopUi {
  const panel = el("div");
  panel.id = "shop-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("shop", panel, 5);

  let npc = "";
  let sheet: CharacterSheet | null = null;
  let mode: "buy" | "sell" | "brew" = "buy";
  /** The windows this NPC has: more than one shows tabs (the alchemist: trading and brewing; the blacksmith: upgrading and trading). */
  let npcTabs: NpcView[] = [];
  let jobs: BrewJobView[] = [];
  /** Server time minus the local time, so a countdown follows the server clock. */
  let skewMs = 0;
  let category: ShopCategory = "all";
  /** "" means every element. Starts as the character's main element. */
  let element: string | null = null;
  let left: Record<string, number> = {};
  let flash = "";
  let banned = "";
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** Items ticked for the quick sale (by item id, which survives the bag being redrawn). */
  const ticked = new Set<string>();
  let armedMany = 0;
  /** The kind of sort picked in the drop-down, and the one the "Sắp xếp" button applied last (a view only, nothing is rewritten). */
  let sortPicked: SortMode = "name";
  let sortApplied: SortMode = "name";
  /** Realms and grades picked in the filters of the sell tab; empty means no filter. They only steer "Chọn hết". */
  const realmSel = new Set<number>();
  const gradeSel = new Set<number>();
  /** Which filter drop-downs are open (a redraw must not close them). */
  const msOpen = new Set<string>();
  /** Quantity typed per offer, kept across redraws. */
  const qtys = new Map<string, number>();

  // A click anywhere outside an open filter list closes it.
  document.addEventListener("pointerdown", (ev) => {
    if (panel.hidden) return;
    for (const d of panel.querySelectorAll<HTMLDetailsElement>("details.shop-ms")) if (d.open && !d.contains(ev.target as Node)) d.open = false;
  });

  const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;

  function itemCell(type: string, dur?: number, max?: number, lv?: number): HTMLElement {
    const def = getItemDef(type);
    const box = el("div", `shop-item rar-${def?.rarity ?? "common"}`);
    const name = el("div", "shop-name", nameOf(type));
    const dot = elementDot(type);
    if (dot) name.prepend(dot);
    const tag = itemTierTag(type, lv);
    if (tag) name.prepend(el("span", `eq-tier ${realmClass(itemTierRealm(type, lv))}`, tag));
    // A weapon says its family (kiếm, cung, ...): the same name covers all of them and some skills need a particular one.
    const family = def?.equip?.weaponType ? vi.equip.weaponTypes[def.equip.weaponType] : undefined;
    const info = def?.category === "equipment" ? [...(family ? [family] : []), ...equipLines(type, dur, max, lv)].join(" · ") : (def?.descVi ?? "");
    box.append(name, el("div", "muted", info));
    return box;
  }

  /** Orders a list by the sort the button applied last. */
  const sortItems = <T,>(list: readonly T[], typeOf: (x: T) => string, lvOf: (x: T) => number | undefined): T[] => sortItemsBy(list, sortApplied, typeOf, lvOf);

  function renderBuy(): HTMLElement {
    const list = el("div");
    if (!sheet) return list;
    const filterByElement = ELEMENT_TABS.has(category) && element;
    const offers = sortItems(
      merchantOffers(sheet.gender, npc).filter((o) => (category === "all" || o.category === category) && (!filterByElement || o.element === null || o.element === element)),
      (o) => o.item,
      () => undefined,
    );
    if (offers.length === 0) list.append(el("div", "muted", vi.shop.nothingHere));
    for (const offer of offers) {
      const row = el("div", "shop-row");
      const remaining = offer.dailyLimit !== undefined ? (left[offer.id] ?? offer.dailyLimit) : null;
      // New gear comes with full durability, so it is shown that way (not as a piece that never wears out).
      const fresh = equipmentInfo(offer.item)?.maxDurability ?? undefined;
      row.append(itemCell(offer.item, fresh, fresh));
      const qty = el("input") as HTMLInputElement;
      qty.type = "number";
      qty.min = "1";
      const stackable = (getItemDef(offer.item)?.maxStack ?? 1) > 1;
      qty.max = String(remaining ?? MAX_SHOP_QTY);
      qty.value = String(stackable ? (qtys.get(offer.id) ?? 1) : 1);
      qty.disabled = !stackable;
      qty.oninput = () => qtys.set(offer.id, Number(qty.value) || 1);
      const price = el("div", "shop-price", offer.currency === "tien_ngoc" ? vi.shop.priceTienNgoc(offer.price) : vi.shop.price(offer.price));
      const stock = el("div", "muted", remaining === null ? vi.shop.unlimited : vi.shop.left(remaining));
      const buy = el("button", "eq-small", vi.shop.buy);
      buy.disabled = remaining !== null && remaining <= 0;
      buy.onclick = () => {
        const n = Math.min(MAX_SHOP_QTY, Math.max(1, Math.floor(Number(qty.value) || 1)));
        send({ t: "shop_buy", npc, offer: offer.id, qty: n });
      };
      const side = el("div", "shop-side");
      side.append(price, stock, qty, buy);
      row.append(side);
      list.append(row);
    }
    return list;
  }

  /** Gear and rare items cannot be bought back at the price they fetch, and a trained pháp bảo would lose its levels. */
  const isPrecious = (item: BagItem) => {
    const def = getItemDef(item.type);
    return def?.category === "equipment" || def?.rarity === "rare" || def?.rarity === "epic" || item.lv !== undefined;
  };

  /** What the sell tab shows now: the sellable bag items of the current tab, in the chosen order. */
  function sellableItems(): BagItem[] {
    return sortItems(
      getBag().filter((i) => merchantPays(npc, i.type, i.dur, i.max) > 0 && (category === "all" || shopCategoryOf(i.type) === category)),
      (i) => i.type,
      (i) => i.lv,
    );
  }

  function renderSell(): HTMLElement {
    const list = el("div");
    const sellable = sellableItems();
    // Ticks of items that left the bag no longer count.
    const present = new Set(getBag().map((i) => i.id));
    for (const id of [...ticked]) if (!present.has(id)) ticked.delete(id);
    if (sellable.length === 0) list.append(el("div", "muted", vi.shop.nothingToSell));
    for (const item of sellable) {
      const unit = merchantPays(npc, item.type, item.dur, item.max);
      const row = el("div", "shop-row");
      const check = el("input") as HTMLInputElement;
      check.type = "checkbox";
      check.checked = ticked.has(item.id);
      check.disabled = !check.checked && ticked.size >= SHOP_SELL_MANY_MAX; // no more than the limit can be picked
      check.onchange = () => {
        if (check.checked) ticked.add(item.id);
        else ticked.delete(item.id);
        armedMany = 0;
        render();
      };
      const cell = itemCell(item.type, item.dur, item.max, item.lv);
      if (item.qty > 1) cell.querySelector(".shop-name")?.append(el("span", "muted", ` × ${item.qty}`));
      const main = el("div", "shop-main");
      main.append(check, cell);
      row.append(main);
      const side = el("div", "shop-side");
      side.append(el("div", "shop-price", vi.shop.sellFor(unit)));
      const one = el("button", "eq-small", vi.shop.sellOne);
      // Precious items take two taps within 3 seconds, like selling a whole stack.
      let armedOne = 0;
      one.onclick = () => {
        const now = Date.now();
        if (isPrecious(item) && now - armedOne > 3000) {
          armedOne = now;
          one.textContent = vi.shop.confirm;
          return;
        }
        send({ t: "shop_sell", npc, tab: item.tab, cell: item.cell, qty: 1 });
      };
      side.append(one);
      if (item.qty > 1) {
        const allBtn = el("button", "eq-small", vi.shop.sellAll(item.qty));
        let armed = 0;
        allBtn.onclick = () => {
          const now = Date.now();
          if (now - armed > 3000) {
            armed = now;
            allBtn.textContent = vi.shop.confirm;
            return;
          }
          send({ t: "shop_sell", npc, tab: item.tab, cell: item.cell, qty: item.qty });
        };
        side.append(allBtn);
      }
      row.append(side);
      list.append(row);
    }
    return list;
  }

  const gradeOf = (i: BagItem) => getItemDef(i.type)?.grade ?? 0;
  const realmOf = (i: BagItem) => itemTierRealm(i.type, i.lv);

  /** A drop-down with a tick box per option (several can be picked); it shows how many are picked. */
  function multiSelect<V extends number>(key: string, label: string, options: Array<[V, string]>, picked: Set<V>): HTMLElement {
    const box = el("details", "shop-ms");
    box.open = msOpen.has(key);
    box.ontoggle = () => {
      if (box.open) msOpen.add(key);
      else msOpen.delete(key);
    };
    box.append(el("summary", undefined, picked.size > 0 ? `${label} (${picked.size})` : label));
    const menu = el("div", "shop-ms-list");
    for (const [value, text] of options) {
      const row = el("label");
      const cb = el("input") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = picked.has(value);
      cb.onchange = () => {
        if (cb.checked) picked.add(value);
        else picked.delete(value);
        render();
      };
      row.append(cb, document.createTextNode(` ${text}`));
      menu.append(row);
    }
    box.append(menu);
    return box;
  }

  /** The realms and grades present in the items shown; a filter with a single choice is not worth showing. */
  function filterOptions(shown: BagItem[]): { realms: number[]; grades: number[] } {
    const realms = [...new Set(shown.map(realmOf).filter((r): r is number => r !== null))].sort((a, b) => a - b);
    const grades = [...new Set(shown.map(gradeOf).filter((g) => g > 0))].sort((a, b) => a - b);
    // Picks of options that are gone (or of a filter that is not shown) no longer count.
    for (const r of [...realmSel]) if (!realms.includes(r) || realms.length < 2) realmSel.delete(r);
    for (const g of [...gradeSel]) if (!grades.includes(g) || grades.length < 2) gradeSel.delete(g);
    return { realms, grades };
  }

  /** Whether "Chọn hết" takes the item: it must match the picked realms and grades (no pick in a filter means anything). */
  const matchesFilters = (i: BagItem) => (realmSel.size === 0 || realmSel.has(realmOf(i) ?? -1)) && (gradeSel.size === 0 || gradeSel.has(gradeOf(i)));

  function renderFilters(shown: BagItem[]): HTMLElement[] {
    const { realms, grades } = filterOptions(shown);
    const out: HTMLElement[] = [];
    if (realms.length >= 2) out.push(multiSelect("realm", vi.shop.realm, realms.map((r): [number, string] => [r, REALMS[r]?.shortVi ?? String(r)]), realmSel));
    if (grades.length >= 2) out.push(multiSelect("grade", vi.shop.grade, grades.map((g): [number, string] => [g, vi.inventory.grades[g] ?? String(g)]), gradeSel));
    return out;
  }

  /** The quick-sale bar: tick everything shown, and sell the ticked stacks at once after a second tap. */
  function renderBulkBar(shown: BagItem[]): HTMLElement {
    const bar = el("div", "shop-bulk");
    const chosen = getBag().filter((i) => ticked.has(i.id));
    const total = chosen.reduce((n, i) => n + merchantPays(npc, i.type, i.dur, i.max) * i.qty, 0);
    const target = shown.filter(matchesFilters);
    // "Chọn hết" takes what the filters pick (everything when nothing is picked), up to the limit of one sale. It is a toggle: while all of
    // them are ticked (or the limit is reached with some of them ticked) it reads "Bỏ chọn", which clears every tick, filters or not.
    const everything = target.length > 0 && (target.every((i) => ticked.has(i.id)) || (ticked.size >= SHOP_SELL_MANY_MAX && target.some((i) => ticked.has(i.id))));
    const toggle = el("button", "eq-small", everything ? vi.shop.untickAll : vi.shop.tickAll);
    toggle.disabled = !everything && target.length === 0;
    toggle.onclick = () => {
      if (everything) ticked.clear();
      else for (const i of target) if (ticked.size < SHOP_SELL_MANY_MAX) ticked.add(i.id);
      armedMany = 0;
      render();
    };
    const sell = el("button", "eq-small shop-sell", vi.shop.sellTicked(chosen.length, total));
    sell.disabled = chosen.length === 0 || chosen.length > SHOP_SELL_MANY_MAX;
    sell.title = vi.shop.sellTickedHint(chosen.length, total);
    sell.onclick = () => {
      const now = Date.now();
      if (now - armedMany > 3000) {
        armedMany = now;
        sell.textContent = vi.shop.confirmMany(chosen.length, total);
        return;
      }
      armedMany = 0;
      send({ t: "shop_sell_many", npc, cells: chosen.map((i) => ({ tab: i.tab, cell: i.cell })) });
      ticked.clear();
    };
    bar.append(toggle, ...renderFilters(shown), sell);
    return bar;
  }

  /** Local time as the server's clock reads it. */
  const serverNow = () => Date.now() + skewMs;

  /** The brewing tab: the brewings going (with a countdown and a button to collect) and the recipes the alchemist knows. */
  function renderBrew(): HTMLElement {
    const box = el("div");
    const cfg = tuning().alchemy;
    box.append(el("div", "muted", vi.brew.jobs(jobs.length, cfg.maxJobs)));
    if (jobs.length === 0) box.append(el("div", "muted", vi.brew.none));
    for (const job of jobs) {
      const row = el("div", "shop-row");
      const left = Math.ceil((job.readyAt - serverNow()) / 1000);
      const main = el("div");
      main.append(el("div", "shop-name", `${nameOf(job.output)} ×${job.qty}`), el("div", "muted", left > 0 ? vi.brew.left(left) : vi.brew.ready));
      const take = el("button", undefined, vi.brew.collect);
      take.disabled = left > 0;
      take.onclick = () => send({ t: "brew_collect", npc, job: job.id });
      row.append(main, take);
      box.append(row);
    }
    box.append(el("div", "shop-name", vi.brew.recipes));
    const recipes = cfg.recipes.filter((r) => r.enabled && getItemDef(r.output) && !getItemDef(r.output)?.disabled);
    if (recipes.length === 0) box.append(el("div", "muted", vi.brew.noRecipes));
    const countOf = (type: string) => getBag().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);
    for (const recipe of recipes) {
      const row = el("div", "shop-row");
      const main = el("div");
      main.append(el("div", "shop-name", `${recipe.nameVi} → ${nameOf(recipe.output)} ×${recipe.qty}`));
      const mats = recipe.inputs.map((i) => `${nameOf(i.item)} ${i.qty} (${vi.brew.have(countOf(i.item))})`).join(", ");
      main.append(el("div", "muted", `${mats} · ${vi.brew.cost(recipe.linhThach)} · ${vi.brew.left(recipe.seconds)}`));
      const start = el("button", undefined, vi.brew.start);
      start.disabled = jobs.length >= cfg.maxJobs || recipe.inputs.some((i) => countOf(i.item) < i.qty);
      start.onclick = () => send({ t: "brew_start", npc, recipe: recipe.id });
      row.append(main, start);
      box.append(row);
    }
    return box;
  }

  // The countdowns of the brewing tab tick once a second while it is showing.
  setInterval(() => {
    if (!panel.hidden && mode === "brew" && jobs.some((j) => j.readyAt > serverNow() - 1000)) render();
  }, 1000);

  const categoriesOf = (list: Array<Exclude<ShopCategory, "all">>): Set<Exclude<ShopCategory, "all">> => new Set(list);

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(el("b", undefined, getMerchant(npc)?.nameVi || vi.shop.title), close);
    if (banned) {
      panel.append(head, el("div", "shop-flash", banned));
      return;
    }
    // A tab with nothing behind it is not shown: the buy tab when the merchant sells nothing to this character, the sell tab when he buys
    // nothing, and a kind of item when there is none of it on offer (buying) or in the bag that he takes (selling).
    const buyCats = categoriesOf(sheet ? merchantOffers(sheet.gender, npc).map((o) => o.category) : []);
    const sellCats = categoriesOf(getBag().filter((i) => merchantPays(npc, i.type, i.dur, i.max) > 0).map((i) => shopCategoryOf(i.type)));
    const buys = getMerchant(npc)?.buys;
    const available = { buy: buyCats.size > 0, sell: buys === null || (buys?.length ?? 0) > 0 };
    if (mode !== "brew" && !available[mode]) mode = available.buy ? "buy" : "sell";
    const shownCats = mode === "sell" ? sellCats : buyCats;
    if (category !== "all" && !shownCats.has(category)) category = "all";
    const modes = el("div", "eq-tabs");
    // The blacksmith's own work is another window: its tab switches to it.
    if (npcTabs.includes("smith")) {
      const b = el("button", undefined, vi.npcTabs.smith);
      b.onclick = () => switchView(npc, "smith");
      modes.append(b);
    }
    for (const m of ["buy", "sell"] as const) {
      if (!available[m]) continue;
      const b = el("button", m === mode ? "active" : undefined, vi.shop.tabs[m]);
      b.onclick = () => {
        mode = m;
        render();
      };
      modes.append(b);
    }
    if (npcTabs.includes("brew")) {
      const b = el("button", mode === "brew" ? "active" : undefined, vi.npcTabs.brew);
      b.onclick = () => {
        mode = "brew";
        send({ t: "npc_open", npc, view: "brew" });
        render();
      };
      modes.append(b);
    }
    // Sorting is for the sell tab (the bag is long); the few things on sale need none.
    if (mode === "sell") modes.append(
      sortControls(
        "shop-sort",
        sortPicked,
        (m) => {
          sortPicked = m;
        },
        () => {
          sortApplied = sortPicked;
          render();
        },
      ),
    );
    const cats = el("div", "eq-tabs shop-cats");
    for (const c of SHOP_CATEGORIES) {
      if (c === "all" ? shownCats.size === 0 : !shownCats.has(c)) continue;
      const b = el("button", c === category ? "active" : undefined, vi.shop.categories[c]);
      b.onclick = () => {
        category = c;
        render();
      };
      cats.append(b);
    }
    if (mode === "brew") {
      panel.append(head, modes);
      if (flash) panel.append(el("div", "shop-flash", flash));
      panel.append(renderBrew(), el("div", "muted", vi.brew.note));
      return;
    }
    panel.append(head, modes, cats);
    if (flash && mode === "buy") panel.append(el("div", "shop-flash", flash));
    if (mode === "buy" && ELEMENT_TABS.has(category)) {
      const row = el("div", "shop-element");
      row.append(el("span", "muted", vi.shop.element));
      const select = el("select");
      const options: Array<[string, string]> = [["", vi.shop.anyElement], ...ALL_ROOTS.map((r): [string, string] => [r, vi.roots[r] ?? r])];
      for (const [value, label] of options) {
        const opt = el("option", undefined, label);
        opt.value = value;
        select.append(opt);
      }
      select.value = element ?? "";
      select.onchange = () => {
        element = select.value;
        render();
      };
      row.append(select);
      panel.append(row);
    }
    if (mode === "sell") {
      panel.append(renderBulkBar(sellableItems()));
      if (flash) panel.append(el("div", "shop-flash", flash));
    }
    panel.append(mode === "buy" ? renderBuy() : renderSell(), el("div", "muted", vi.shop.note));
  }

  const ui: ShopUi = {
    open(id, map) {
      npc = id;
      void map;
      mode = "buy";
      npcTabs = [];
      jobs = [];
      category = "all";
      ticked.clear();
      flash = "";
      banned = "";
      if (element === null) element = sheet?.roots[0] ?? "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id, view: "shop" });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet(s) {
      sheet = s;
      render();
    },
    setStock(id, stock, tabs) {
      if (id !== npc) return;
      left = stock;
      npcTabs = tabs;
      render();
    },
    setBrew(id, list, now, tabs) {
      if (id !== npc) return;
      jobs = list;
      skewMs = now - Date.now();
      npcTabs = tabs;
      render();
    },
    ban(text) {
      banned = text;
      render();
    },
    notify(text) {
      flash = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash = "";
        render();
      }, 4000);
      render();
    },
    refresh: render,
    isOpen: () => !panel.hidden,
  };
  return ui;
}

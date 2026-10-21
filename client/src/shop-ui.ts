import {
  SHOP_CATEGORIES,
  SHOP_SELL_MANY_MAX,
  SPIRITUAL_ROOTS,
  MAX_SHOP_QTY,
  equipmentInfo,
  getItemDef,
  merchantOffers,
  sellPrice,
  shopCategoryOf,
  type BagItem,
  type CharacterSheet,
  type ClientMessage,
  type ShopCategory,
} from "@game/shared";
import { elementDot, equipLines, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface ShopUi {
  /** Opens the window for the merchant `npc` of the map `mapId` (the server answers with the stock left). */
  open(npc: string, mapId: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  /** Units left today per offer with a daily limit. */
  setStock(npc: string, left: Record<string, number>): void;
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
export function initShop(send: (msg: ClientMessage) => void, getBag: () => BagItem[]): ShopUi {
  const panel = el("div");
  panel.id = "shop-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("shop", panel, 5);

  let npc = "";
  let mapId = "";
  let sheet: CharacterSheet | null = null;
  let mode: "buy" | "sell" = "buy";
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
  /** Quantity typed per offer, kept across redraws. */
  const qtys = new Map<string, number>();

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

  function renderBuy(): HTMLElement {
    const list = el("div");
    if (!sheet) return list;
    const filterByElement = ELEMENT_TABS.has(category) && element;
    const offers = merchantOffers(sheet.gender, mapId).filter(
      (o) => (category === "all" || o.category === category) && (!filterByElement || o.element === null || o.element === element),
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
      const price = el("div", "shop-price", vi.shop.price(offer.price));
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

  function renderSell(): HTMLElement {
    const list = el("div");
    const sellable = getBag().filter((i) => sellPrice(i.type, i.dur, i.max) > 0 && (category === "all" || shopCategoryOf(i.type) === category));
    // Ticks of items that left the bag no longer count.
    const present = new Set(getBag().map((i) => i.id));
    for (const id of [...ticked]) if (!present.has(id)) ticked.delete(id);
    if (sellable.length === 0) list.append(el("div", "muted", vi.shop.nothingToSell));
    for (const item of sellable) {
      const unit = sellPrice(item.type, item.dur, item.max);
      const row = el("div", "shop-row");
      const check = el("input") as HTMLInputElement;
      check.type = "checkbox";
      check.checked = ticked.has(item.id);
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
    list.append(renderBulkBar(sellable));
    return list;
  }

  /** The quick-sale bar: tick everything shown, and sell the ticked stacks at once after a second tap. */
  function renderBulkBar(shown: BagItem[]): HTMLElement {
    const bar = el("div", "shop-bulk");
    const chosen = getBag().filter((i) => ticked.has(i.id));
    const total = chosen.reduce((n, i) => n + sellPrice(i.type, i.dur, i.max) * i.qty, 0);
    const toggle = el("button", "eq-small", shown.length > 0 && shown.every((i) => ticked.has(i.id)) ? vi.shop.untickAll : vi.shop.tickAll);
    toggle.disabled = shown.length === 0;
    toggle.onclick = () => {
      const everything = shown.every((i) => ticked.has(i.id));
      for (const i of shown) {
        if (everything) ticked.delete(i.id);
        else ticked.add(i.id);
      }
      armedMany = 0;
      render();
    };
    const sell = el("button", "eq-small", vi.shop.sellTicked(chosen.length, total));
    sell.disabled = chosen.length === 0 || chosen.length > SHOP_SELL_MANY_MAX;
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
    bar.append(toggle, sell);
    if (chosen.length > SHOP_SELL_MANY_MAX) bar.append(el("div", "muted", vi.shop.tooMany(SHOP_SELL_MANY_MAX)));
    return bar;
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(el("b", undefined, vi.shop.title), close);
    if (banned) {
      panel.append(head, el("div", "shop-flash", banned));
      return;
    }
    const modes = el("div", "eq-tabs");
    for (const m of ["buy", "sell"] as const) {
      const b = el("button", m === mode ? "active" : undefined, vi.shop.tabs[m]);
      b.onclick = () => {
        mode = m;
        render();
      };
      modes.append(b);
    }
    const cats = el("div", "eq-tabs shop-cats");
    for (const c of SHOP_CATEGORIES) {
      const b = el("button", c === category ? "active" : undefined, vi.shop.categories[c]);
      b.onclick = () => {
        category = c;
        render();
      };
      cats.append(b);
    }
    panel.append(head, modes, cats);
    if (flash) panel.append(el("div", "shop-flash", flash));
    if (mode === "buy" && ELEMENT_TABS.has(category)) {
      const row = el("div", "shop-element");
      row.append(el("span", "muted", vi.shop.element));
      const select = el("select");
      const options: Array<[string, string]> = [["", vi.shop.anyElement], ...SPIRITUAL_ROOTS.map((r): [string, string] => [r, vi.roots[r] ?? r])];
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
    panel.append(mode === "buy" ? renderBuy() : renderSell(), el("div", "muted", vi.shop.note));
  }

  const ui: ShopUi = {
    open(id, map) {
      npc = id;
      mapId = map;
      mode = "buy";
      category = "all";
      ticked.clear();
      flash = "";
      banned = "";
      if (element === null) element = sheet?.roots[0] ?? "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet(s) {
      sheet = s;
      render();
    },
    setStock(id, stock) {
      if (id !== npc) return;
      left = stock;
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

import { equipmentInfo, getItemDef, merchantOffers, sellPrice, MAX_SHOP_QTY, type BagItem, type CharacterSheet, type ClientMessage } from "@game/shared";
import { elementDot, equipLines, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface ShopUi {
  /** Opens the window for the merchant `npc` (the server answers with the stock left). */
  open(npc: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  /** Units left today per offer with a daily limit. */
  setStock(npc: string, left: Record<string, number>): void;
  /** The bag changed: the list of things that can be sold may have too. */
  refresh(): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The merchant's window: a buy tab (what he sells to this character, with the stock left today) and a sell tab (the bag
 * items he takes). It only sends offer ids and cells; the server prices and decides.
 */
export function initShop(send: (msg: ClientMessage) => void, getBag: () => BagItem[]): ShopUi {
  const panel = el("div");
  panel.id = "shop-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("shop", panel, 4);

  let npc = "";
  let sheet: CharacterSheet | null = null;
  let tab: "buy" | "sell" = "buy";
  let left: Record<string, number> = {};
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
    const info = def?.category === "equipment" ? equipLines(type, dur, max, lv).join(" · ") : (def?.descVi ?? "");
    box.append(name, el("div", "muted", info));
    return box;
  }

  function renderBuy(): HTMLElement {
    const list = el("div");
    if (!sheet) return list;
    for (const offer of merchantOffers(sheet.gender)) {
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

  function renderSell(): HTMLElement {
    const list = el("div");
    const sellable = getBag().filter((i) => sellPrice(i.type, i.dur, i.max) > 0);
    if (sellable.length === 0) list.append(el("div", "muted", vi.shop.nothingToSell));
    for (const item of sellable) {
      const unit = sellPrice(item.type, item.dur, item.max);
      const row = el("div", "shop-row");
      const cell = itemCell(item.type, item.dur, item.max, item.lv);
      if (item.qty > 1) cell.querySelector(".shop-name")?.append(el("span", "muted", ` × ${item.qty}`));
      row.append(cell);
      const side = el("div", "shop-side");
      side.append(el("div", "shop-price", vi.shop.sellFor(unit)));
      const one = el("button", "eq-small", vi.shop.sellOne);
      // Gear and rare items cannot be bought back at the price they fetch, and a trained pháp bảo would lose its levels:
      // selling them takes two taps within 3 seconds, like selling a whole stack.
      const def = getItemDef(item.type);
      const precious = def?.category === "equipment" || def?.rarity === "rare" || def?.rarity === "epic" || item.lv !== undefined;
      let armedOne = 0;
      one.onclick = () => {
        const now = Date.now();
        if (precious && now - armedOne > 3000) {
          armedOne = now;
          one.textContent = vi.shop.confirm;
          return;
        }
        send({ t: "shop_sell", npc, tab: item.tab, cell: item.cell, qty: 1 });
      };
      side.append(one);
      if (item.qty > 1) {
        // Selling a whole stack is irreversible, so it takes two taps within 3 seconds (like dropping a stack).
        const all = el("button", "eq-small", vi.shop.sellAll(item.qty));
        let armed = 0;
        all.onclick = () => {
          const now = Date.now();
          if (now - armed > 3000) {
            armed = now;
            all.textContent = vi.shop.confirm;
            return;
          }
          send({ t: "shop_sell", npc, tab: item.tab, cell: item.cell, qty: item.qty });
        };
        side.append(all);
      }
      row.append(side);
      list.append(row);
    }
    return list;
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(el("b", undefined, vi.shop.title), close);
    const tabs = el("div", "eq-tabs");
    for (const t of ["buy", "sell"] as const) {
      const b = el("button", t === tab ? "active" : undefined, vi.shop.tabs[t]);
      b.onclick = () => {
        tab = t;
        render();
      };
      tabs.append(b);
    }
    panel.append(head, tabs, tab === "buy" ? renderBuy() : renderSell(), el("div", "muted", vi.shop.note));
  }

  const ui: ShopUi = {
    open(id) {
      npc = id;
      tab = "buy";
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
    refresh: render,
    isOpen: () => !panel.hidden,
  };
  return ui;
}

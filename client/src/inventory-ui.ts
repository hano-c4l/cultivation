import { BAG_CELLS_PER_TAB, BAG_COLS, MAX_BAG_TABS, SORT_MIN_GAP_MS, SORT_MODES, equipBlock, getItemDef, type BagItem, type BagView, equipmentInfo, type CharacterSheet, type ClientMessage, type EquippedItem, type MailView, type SortMode, type WearerCtx } from "@game/shared";
import { iconFor } from "./icons";
import { describeItem, elementDot, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { wearerOfSheet } from "./wearer";
import { registerWindow } from "./window-manager";

export interface InventoryUi {
  /** Replaces the whole bag (welcome, or after the server refused a command). */
  setBag(bag: Omit<BagView, "tabPrice"> & { tabPrice?: number }): void;
  /** Applies a delta from the server. */
  applyDelta(tabs: number, items: BagItem[], removed: string[]): void;
  setMail(mail: MailView[]): void;
  /** Who the player is: gear that does not fit them gets a mark on its cell. */
  setSheet(sheet: CharacterSheet): void;
  /** The worn gear, shown next to a bag piece of the same kind so the two can be compared. */
  setEquipped(items: EquippedItem[]): void;
  /** The bag items right now (the equipment window lists the ones that can be worn). */
  list(): BagItem[];
  /**
   * The server refused a command. A refused sort must not leave the button showing a mode that was not applied, and a
   * "wait" refusal locks the button with a countdown for `retryMs`. Returns true when that started a new lock (so the
   * caller reports it once instead of on every refused click).
   */
  rejected(reason: string, retryMs?: number): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function itemName(type: string): string {
  return getItemDef(type)?.nameVi ?? type;
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  // Mail that lasts days (admin gifts) shows days and hours, not a long minute counter.
  if (s >= 86_400) return vi.inventory.daysLeft(Math.floor(s / 86_400), Math.floor((s % 86_400) / 3600));
  if (s >= 3600) return vi.inventory.hoursLeft(Math.floor(s / 3600), Math.floor((s % 3600) / 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The attachments of an admin gift as one line ("1000 Linh Thạch, Hồi Huyết Đan × 5"). */
function giftLine(g: NonNullable<MailView["gift"]>): string {
  return [
    ...(["linh_thach", "cong_hien", "tien_ngoc"] as const).flatMap((c) => (g[c] ? [`${g[c]} ${vi.economy.currency[c]}`] : [])),
    ...g.items.map((i) => `${itemName(i.type)}${i.qty > 1 ? ` × ${i.qty}` : ""}`),
  ].join(", ");
}

/**
 * Bag overlay (button or the I key): 8 columns, one tab at a time. Tap an item to select it, then tap another cell to
 * move it there (an empty cell moves, the same item merges, a different item swaps). The server owns the bag, so a
 * command only names cells; the screen changes when the server's delta comes back.
 */
export function initInventory(send: (msg: ClientMessage) => void, toHotbar: (value: string, label: string) => void = () => undefined): InventoryUi {
  const toggle = el("button", undefined, vi.inventory.button);
  toggle.id = "bag-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "bag-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("bag", panel, 3);

  let items = new Map<string, BagItem>();
  let tabs = 1;
  /** What the next tab costs (from the welcome). */
  let tabPrice = 0;
  /** The buy button was tapped once; a second tap within three seconds buys. */
  let confirmBuy = false;
  let mail: Array<MailView & { deadline: number | null }> = [];
  let activeTab = 0;
  let selected: { tab: number; cell: number } | null = null;
  /** "Đổi chỗ" is on: the next tap on a cell moves the selected item there. */
  let moveMode = false;
  let wearer: WearerCtx | null = null;
  let worn: EquippedItem[] = [];
  /** Set when a mouse drag just ended, so the click that follows it does not also select. */
  let justDragged = false;
  let confirmDrop: "one" | "all" | null = null;
  /** The mode picked in the list next to the sort button; the button sorts by it. */
  let sortMode: SortMode = "name";
  /** The button is locked after a click, matching the server's limit of one sort per 15 seconds. */
  let sortLockedUntil = 0;
  /** Set by a "wait" refusal: the button shows the seconds left and stays locked until then. */
  let sortBanUntil = 0;
  let sortBtn: HTMLButtonElement | null = null;
  let banTimer: ReturnType<typeof setInterval> | undefined;

  const sortLabel = (): string => {
    const left = Math.ceil((Math.max(sortBanUntil, sortLockedUntil) - Date.now()) / 1000);
    return left > 0 ? `${vi.inventory.sort} (${left}s)` : vi.inventory.sort;
  };
  const banned = (): boolean => Date.now() < sortBanUntil;

  /** Keeps the seconds on the button current without rebuilding the whole panel. */
  function runBanTimer(): void {
    if (banTimer) clearInterval(banTimer);
    banTimer = setInterval(() => {
      if (sortBtn) {
        sortBtn.textContent = sortLabel();
        sortBtn.disabled = banned() || Date.now() < sortLockedUntil;
      }
      if (!banned() && Date.now() >= sortLockedUntil) {
        clearInterval(banTimer);
        banTimer = undefined;
        render();
      }
    }, 250);
  }
  /** Quantity chosen in the split controls, or null while they are closed. */
  let splitQty: number | null = null;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let clock: ReturnType<typeof setInterval> | undefined;

  const at = (tab: number, cell: number): BagItem | undefined => {
    for (const i of items.values()) if (i.tab === tab && i.cell === cell) return i;
    return undefined;
  };

  const resetConfirm = () => {
    confirmDrop = null;
    confirmBuy = false;
    if (confirmTimer) clearTimeout(confirmTimer);
  };

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();

    const head = el("div", "bag-head");
    head.append(el("b", undefined, vi.inventory.title));
    const used = el("span", "bag-used", vi.inventory.used(items.size, tabs * BAG_CELLS_PER_TAB));
    const sort = el("button", "bag-sort", sortLabel());
    sortBtn = sort;
    sort.disabled = banned() || Date.now() < sortLockedUntil;
    sort.onclick = () => {
      if (banned() || Date.now() < sortLockedUntil) return;
      sortLockedUntil = Date.now() + SORT_MIN_GAP_MS + 200;
      runBanTimer();
      selected = null;
      splitQty = null;
      resetConfirm();
      send({ t: "inv_sort", mode: sortMode });
      render();
    };
    const modes = el("select", "bag-sort-mode");
    for (const m of SORT_MODES) {
      const o = el("option", undefined, vi.inventory.sortModes[m] ?? m);
      o.value = m;
      if (m === sortMode) o.selected = true;
      modes.append(o);
    }
    modes.onchange = () => {
      sortMode = modes.value as SortMode;
    };
    const close = el("button", undefined, "✕");
    close.onclick = () => setOpen(false);
    head.append(used, modes, sort, close);
    panel.append(head);

    // The tab row is always shown: it carries the button that unlocks the next tab.
    const bar = el("div", "bag-tabs");
    for (let t = 0; t < tabs; t++) {
      const b = el("button", t === activeTab ? "active" : undefined, vi.inventory.tab(t + 1));
      b.onclick = () => {
        activeTab = t;
        // Moving to another tab is the point of "Đổi chỗ", so the selection survives the tab change in that mode.
        if (!moveMode) selected = null;
        resetConfirm();
        render();
      };
      bar.append(b);
    }
    if (tabs < MAX_BAG_TABS) {
      const buy = el("button", "bag-buy", confirmBuy ? vi.inventory.buyTabSure(tabPrice) : vi.inventory.buyTab(tabPrice));
      buy.title = vi.inventory.buyTabTip;
      buy.onclick = () => {
        if (confirmBuy) {
          resetConfirm();
          send({ t: "inv_expand", price: tabPrice });
          render();
          return;
        }
        resetConfirm();
        confirmBuy = true;
        confirmTimer = setTimeout(() => {
          confirmBuy = false;
          render();
        }, 3000);
        render();
      };
      bar.append(buy);
    }
    panel.append(bar);

    // Item info and actions come first (fixed height), so they are visible without scrolling on a short screen.
    panel.append(renderDetail());

    const grid = el("div", "bag-grid");
    grid.style.gridTemplateColumns = `repeat(${BAG_COLS}, 1fr)`;
    for (let cell = 0; cell < BAG_CELLS_PER_TAB; cell++) {
      const item = at(activeTab, cell);
      const slot = el("button", "bag-cell");
      slot.dataset.cell = String(cell);
      if (selected && selected.tab === activeTab && selected.cell === cell) slot.classList.add("selected");
      if (item) {
        const def = getItemDef(item.type);
        slot.classList.add(`cat-${def?.category ?? "material"}`, `rar-${def?.rarity ?? "common"}`);
        if (item.dur !== undefined && item.dur <= 0) slot.classList.add("broken");
        slot.title = itemName(item.type);
        slot.append(iconFor(item.type)); // the name shows in the detail box when the cell is tapped (and in the title)
        const tag = itemTierTag(item.type, item.lv);
        if (tag) slot.append(el("span", `bag-tag ${realmClass(itemTierRealm(item.type, item.lv))}`, tag));
        const dot = elementDot(item.type);
        if (dot) {
          dot.classList.add("bag-elem");
          slot.append(dot);
        }
        if (item.qty > 1) slot.append(el("span", "bag-qty", String(item.qty)));
        // Gear this character cannot use: X for the wrong gender, + when more level or stats are needed.
        if (def?.equip && wearer) {
          const why = equipBlock(def.equip, undefined, undefined, wearer);
          if (why === "gender") slot.append(mark("bag-mark x", "✕", vi.inventory.markGender));
          else if (why === "level" || why === "stat") slot.append(mark("bag-mark plus", "+", vi.inventory.markLevel));
        }
        slot.onpointerdown = (ev) => startDrag(ev, activeTab, cell, item, slot);
      }
      slot.onclick = () => {
        if (justDragged) return;
        onCell(activeTab, cell);
      };
      grid.append(slot);
    }
    panel.append(grid);

    panel.append(renderMail());
  }

  function renderDetail(): HTMLElement {
    const box = el("div", "bag-detail");
    const item = selected ? at(selected.tab, selected.cell) : undefined;
    if (!item || !selected) {
      box.append(el("div", "muted", vi.inventory.hint));
      return box;
    }
    const def = getItemDef(item.type);
    const sel = selected;
    box.append(describeItem(item.type, { dur: item.dur, max: item.max, qty: item.qty, lv: item.lv, xp: item.xp, rs: item.rs, en: item.en, wearer: wearer ?? undefined }));
    if (moveMode) box.append(el("div", "muted", vi.inventory.swapHint));
    if (splitQty !== null && item.qty > 1) {
      box.append(renderSplit(item, sel));
      return box;
    }
    const actions = el("div", "bag-actions");
    const swap = el("button", moveMode ? "active" : undefined, vi.inventory.swap);
    swap.onclick = () => {
      moveMode = !moveMode;
      render();
    };
    actions.append(swap);
    if (def?.equip) {
      const wear = el("button", undefined, vi.inventory.wear);
      wear.onclick = () => send({ t: "eq_equip", tab: sel.tab, cell: sel.cell });
      actions.append(wear);
    }
    if (def?.healFraction !== undefined || def?.teaches || def?.teleportTo) {
      const use = el("button", undefined, def.teaches ? vi.inventory.learn : vi.inventory.use);
      use.onclick = () => send({ t: "inv_use", tab: sel.tab, cell: sel.cell });
      actions.append(use);
    }
    if (def?.healFraction !== undefined || def?.teleportTo) {
      const quick = el("button", undefined, vi.inventory.toHotbar);
      quick.onclick = () => toHotbar(`i:${item.type}`, itemName(item.type));
      actions.append(quick);
    }
    if (item.qty > 1 && (def?.maxStack ?? 1) > 1) {
      const split = el("button", undefined, vi.inventory.split);
      split.onclick = () => {
        resetConfirm();
        splitQty = Math.max(1, Math.floor(item.qty / 2));
        render();
      };
      actions.append(split);
    }
    const dropOne = el("button", "danger", confirmDrop === "one" ? vi.inventory.sure : vi.inventory.dropOne);
    dropOne.onclick = () => confirmedDrop("one", () => send({ t: "inv_drop", tab: sel.tab, cell: sel.cell, qty: 1 }));
    actions.append(dropOne);
    if (item.qty > 1) {
      const dropAll = el("button", "danger", confirmDrop === "all" ? vi.inventory.sure : vi.inventory.dropAll);
      dropAll.onclick = () => confirmedDrop("all", () => send({ t: "inv_drop", tab: sel.tab, cell: sel.cell }));
      actions.append(dropAll);
    }
    const cancel = el("button", undefined, vi.inventory.cancel);
    cancel.onclick = () => {
      selected = null;
      moveMode = false;
      splitQty = null;
      resetConfirm();
      render();
    };
    actions.append(cancel);
    box.append(actions);
    // Gear: what is worn in the same kind of slot, so the two can be compared before wearing.
    if (def?.equip) {
      for (const w of worn.filter((e) => equipmentInfo(e.type)?.kind === def.equip!.kind)) {
        const cmp = el("div", "bag-compare");
        cmp.append(el("div", "muted", `${vi.inventory.wornNow}:`), describeItem(w.type, { dur: w.dur, max: w.max, lv: w.lv, xp: w.xp, rs: w.rs, en: w.en, wearer: wearer ?? undefined }));
        box.append(cmp);
      }
    }
    return box;
  }

  /** The split controls replace the description while open: how many to take off the stack, then confirm. */
  function renderSplit(item: BagItem, sel: { tab: number; cell: number }): HTMLElement {
    const row = el("div", "bag-split");
    const max = item.qty - 1;
    const qty = Math.min(Math.max(1, splitQty ?? 1), max);
    const set = (n: number) => {
      splitQty = Math.min(Math.max(1, n), max);
      render();
    };
    const minus = el("button", undefined, "−");
    minus.onclick = () => set(qty - 1);
    const value = el("input");
    value.type = "number";
    value.min = "1";
    value.max = String(max);
    value.value = String(qty);
    value.onchange = () => set(Number(value.value) || 1);
    const plus = el("button", undefined, "+");
    plus.onclick = () => set(qty + 1);
    const ok = el("button", undefined, vi.inventory.splitConfirm(qty));
    ok.onclick = () => {
      send({ t: "inv_split", tab: sel.tab, cell: sel.cell, qty });
      splitQty = null;
      selected = null;
      render();
    };
    const cancel = el("button", undefined, vi.inventory.cancel);
    cancel.onclick = () => {
      splitQty = null;
      render();
    };
    row.append(el("span", "muted", vi.inventory.splitHow), minus, value, plus, ok, cancel);
    return row;
  }

  /** Throwing an item away needs a second tap within three seconds. */
  function confirmedDrop(kind: "one" | "all", run: () => void): void {
    if (confirmDrop === kind) {
      resetConfirm();
      selected = null;
      run();
      return;
    }
    resetConfirm();
    confirmDrop = kind;
    confirmTimer = setTimeout(() => {
      confirmDrop = null;
      render();
    }, 3000);
    render();
  }

  function renderMail(): HTMLElement {
    const box = el("div", "bag-mail");
    box.append(el("b", undefined, vi.inventory.mailTitle(mail.length)));
    if (mail.length === 0) {
      box.append(el("div", "muted", vi.inventory.mailEmpty));
      return box;
    }
    for (const m of mail) {
      const row = el("div", "mail-row");
      const what = m.gift ? giftLine(m.gift) : m.item ? `${itemName(m.item.type)}${m.item.qty > 1 ? ` × ${m.item.qty}` : ""}${m.deadline === null ? ` · ${vi.inventory.noExpiry}` : ""}` : "";
      const info = el("div");
      info.append(el("div", undefined, vi.inventory.mailSubjects[m.subject] ?? m.subject));
      if (m.body) {
        const text = el("div", "muted", m.body); // textContent: the text is written by an admin
        text.style.whiteSpace = "pre-wrap";
        info.append(text);
      }
      info.append(el("div", "muted", what));
      const timer = el("span", "mail-timer");
      timer.dataset.deadline = m.deadline === null ? "" : String(m.deadline);
      timer.textContent = m.deadline === null ? "" : fmtTime(m.deadline - Date.now());
      const claim = el("button", undefined, vi.inventory.claim);
      claim.onclick = () => send({ t: "mail_claim", id: m.id });
      row.append(info, timer, claim);
      box.append(row);
    }
    return box;
  }

  /**
   * Tapping selects; tapping an empty cell or the same item again deselects; tapping another item selects that one.
   * Items only move by dragging (mouse) or with "Đổi chỗ" on, then tapping the destination.
   */
  function onCell(tab: number, cell: number): void {
    resetConfirm();
    splitQty = null;
    const here = at(tab, cell);
    if (moveMode && selected) {
      if (!(selected.tab === tab && selected.cell === cell)) send({ t: "inv_move", from: { tab: selected.tab, cell: selected.cell }, to: { tab, cell } });
      moveMode = false;
      selected = null;
    } else if (!here || (selected && selected.tab === tab && selected.cell === cell)) {
      selected = null;
    } else {
      selected = { tab, cell };
    }
    render();
  }

  function mark(cls: string, text: string, title: string): HTMLElement {
    const m = el("span", cls, text);
    m.title = title;
    return m;
  }

  /** Mouse drag and drop of an item onto another cell of the tab being shown (touch uses "Đổi chỗ" instead, so scrolling stays possible). */
  function startDrag(ev: PointerEvent, tab: number, cell: number, item: BagItem, source: HTMLElement): void {
    if (ev.pointerType !== "mouse" || ev.button !== 0) return;
    const sx = ev.clientX;
    const sy = ev.clientY;
    let ghost: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
        // The dragged thing looks like the cell it came from, not just its name.
        const look = getComputedStyle(source);
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.className = "bag-ghost";
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.style.height = `${source.offsetHeight}px`;
        ghost.style.backgroundColor = look.backgroundColor;
        ghost.style.borderColor = look.borderTopColor;
        document.body.append(ghost);
      }
      if (ghost) {
        ghost.style.left = `${e.clientX - source.offsetWidth / 2}px`;
        ghost.style.top = `${e.clientY - source.offsetHeight / 2}px`;
      }
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!ghost) return; // no drag: the click handler takes over
      ghost.remove();
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".bag-cell");
      const to = target?.dataset.cell === undefined ? NaN : Number(target.dataset.cell);
      if (Number.isInteger(to) && to !== cell) send({ t: "inv_move", from: { tab, cell }, to: { tab, cell: to } });
      selected = null;
      moveMode = false;
      render();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function tickMail(): void {
    const now = Date.now();
    const before = mail.length;
    mail = mail.filter((m) => m.deadline === null || m.deadline > now);
    if (mail.length !== before) {
      render();
      refreshBadge();
      return;
    }
    for (const t of panel.querySelectorAll<HTMLElement>(".mail-timer")) {
      const d = t.dataset.deadline;
      if (d) t.textContent = fmtTime(Number(d) - now);
    }
  }

  function refreshBadge(): void {
    toggle.textContent = mail.length > 0 ? `${vi.inventory.button} (${mail.length})` : vi.inventory.button;
    toggle.classList.toggle("alert", mail.length > 0);
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    if (open) send({ t: "mail_refresh" }); // a gift may have arrived while the bag was shut (the server answers at most every few seconds)
    if (clock) clearInterval(clock);
    clock = open ? setInterval(tickMail, 1000) : undefined;
    if (!open) {
      selected = null;
      moveMode = false;
      resetConfirm();
    }
    render();
  }

  toggle.onclick = () => setOpen(panel.hidden);
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "i" || ev.key === "I") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) setOpen(panel.hidden);
  });

  return {
    setBag(bag) {
      items = new Map(bag.items.map((i) => [i.id, i]));
      tabs = bag.tabs;
      tabPrice = bag.tabPrice ?? tabPrice;
      if (activeTab >= tabs) activeTab = 0;
      toggle.hidden = false;
      selected = null;
      resetConfirm();
      render();
    },
    applyDelta(newTabs, changed, removed) {
      tabs = newTabs;
      for (const id of removed) items.delete(id);
      for (const i of changed) items.set(i.id, i);
      // The selection may point at a cell that just changed under it.
      if (selected && !at(selected.tab, selected.cell)) selected = null;
      if (!selected) {
        splitQty = null;
        moveMode = false;
      }
      render();
    },
    rejected(reason, retryMs) {
      if (reason !== "wait" && reason !== "rate") return false;
      // The sort did not happen: the button opens again unless the server asked to wait.
      sortLockedUntil = 0;
      let started = false;
      if (reason === "wait") {
        started = !banned();
        // Lock the button until the server would accept a sort again (a little margin for latency), counting down.
        sortBanUntil = Date.now() + (retryMs ?? 5000) + 200;
        runBanTimer();
      }
      render();
      return started;
    },
    setSheet(sheet) {
      wearer = wearerOfSheet(sheet);
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    list() {
      return [...items.values()];
    },
    setMail(next) {
      const now = Date.now();
      mail = next.map((m) => ({ ...m, deadline: m.expiresInMs === null ? null : now + m.expiresInMs }));
      refreshBadge();
      render();
    },
  };
}

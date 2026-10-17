import { BAG_CELLS_PER_TAB, BAG_COLS, SORT_MIN_GAP_MS, SORT_MODES, getItemDef, type BagItem, type BagView, type ClientMessage, type MailView } from "@game/shared";
import { vi } from "./locales/vi";

export interface InventoryUi {
  /** Replaces the whole bag (welcome, or after the server refused a command). */
  setBag(bag: BagView): void;
  /** Applies a delta from the server. */
  applyDelta(tabs: number, items: BagItem[], removed: string[]): void;
  setMail(mail: MailView[]): void;
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
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Bag overlay (button or the I key): 8 columns, one tab at a time. Tap an item to select it, then tap another cell to
 * move it there (an empty cell moves, the same item merges, a different item swaps). The server owns the bag, so a
 * command only names cells; the screen changes when the server's delta comes back.
 */
export function initInventory(send: (msg: ClientMessage) => void): InventoryUi {
  const toggle = el("button", undefined, vi.inventory.button);
  toggle.id = "bag-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "bag-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);

  let items = new Map<string, BagItem>();
  let tabs = 1;
  let mail: Array<MailView & { deadline: number | null }> = [];
  let activeTab = 0;
  let selected: { tab: number; cell: number } | null = null;
  let confirmDrop: "one" | "all" | null = null;
  /** Each click on the sort button uses the next mode; -1 until the first click. */
  let sortStep = -1;
  /** The step before the last click, restored when the server refuses that sort. */
  let prevSortStep = -1;
  /** The button is dimmed briefly after a click, matching the server's minimum gap. */
  let sortLockedUntil = 0;
  /** Set by a "wait" refusal: the button shows the seconds left and stays locked until then. */
  let sortBanUntil = 0;
  let sortBtn: HTMLButtonElement | null = null;
  let banTimer: ReturnType<typeof setInterval> | undefined;

  const sortLabel = (): string => {
    const base = sortStep < 0 ? vi.inventory.sort : vi.inventory.sortBy(vi.inventory.sortModes[SORT_MODES[sortStep]!] ?? "");
    const left = Math.ceil((sortBanUntil - Date.now()) / 1000);
    return left > 0 ? `${base} (${left}s)` : base;
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
      if (!banned()) {
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
      prevSortStep = sortStep;
      sortLockedUntil = Date.now() + SORT_MIN_GAP_MS + 100;
      setTimeout(render, SORT_MIN_GAP_MS + 150);
      sortStep = (sortStep + 1) % SORT_MODES.length;
      selected = null;
      splitQty = null;
      resetConfirm();
      send({ t: "inv_sort", mode: SORT_MODES[sortStep]! });
      render();
    };
    const close = el("button", undefined, "✕");
    close.onclick = () => setOpen(false);
    head.append(used, sort, close);
    panel.append(head);

    if (tabs > 1) {
      const bar = el("div", "bag-tabs");
      for (let t = 0; t < tabs; t++) {
        const b = el("button", t === activeTab ? "active" : undefined, vi.inventory.tab(t + 1));
        b.onclick = () => {
          activeTab = t;
          selected = null;
          resetConfirm();
          render();
        };
        bar.append(b);
      }
      panel.append(bar);
    }

    // Item info and actions come first (fixed height), so they are visible without scrolling on a short screen.
    panel.append(renderDetail());

    const grid = el("div", "bag-grid");
    grid.style.gridTemplateColumns = `repeat(${BAG_COLS}, 1fr)`;
    for (let cell = 0; cell < BAG_CELLS_PER_TAB; cell++) {
      const item = at(activeTab, cell);
      const slot = el("button", "bag-cell");
      if (selected && selected.tab === activeTab && selected.cell === cell) slot.classList.add("selected");
      if (item) {
        const def = getItemDef(item.type);
        slot.classList.add(`cat-${def?.category ?? "material"}`, `rar-${def?.rarity ?? "common"}`);
        slot.title = itemName(item.type);
        slot.append(el("span", "bag-name", itemName(item.type)));
        if (item.qty > 1) slot.append(el("span", "bag-qty", String(item.qty)));
      }
      slot.onclick = () => onCell(activeTab, cell);
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
    box.append(el("b", undefined, `${itemName(item.type)}${item.qty > 1 ? ` × ${item.qty}` : ""}`));
    if (def) box.append(el("div", "muted", `${vi.inventory.rarityLabel}: ${vi.inventory.rarities[def.rarity]} · ${vi.inventory.gradeLabel}: ${vi.inventory.grades[def.grade] ?? def.grade}`));
    if (splitQty !== null && item.qty > 1) {
      box.append(renderSplit(item, sel));
      return box;
    }
    box.append(el("div", "muted", def?.descVi ?? ""));
    const actions = el("div", "bag-actions");
    if (def?.healFraction !== undefined) {
      const use = el("button", undefined, vi.inventory.use);
      use.onclick = () => send({ t: "inv_use", tab: sel.tab, cell: sel.cell });
      actions.append(use);
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
      splitQty = null;
      resetConfirm();
      render();
    };
    actions.append(cancel);
    box.append(actions);
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
      const what = m.item ? `${itemName(m.item.type)} × ${m.item.qty}` : "";
      const info = el("div");
      info.append(el("div", undefined, vi.inventory.mailSubjects[m.subject] ?? m.subject), el("div", "muted", what));
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

  function onCell(tab: number, cell: number): void {
    resetConfirm();
    splitQty = null;
    const here = at(tab, cell);
    if (!selected) {
      if (here) selected = { tab, cell };
    } else if (selected.tab === tab && selected.cell === cell) {
      selected = null;
    } else {
      send({ t: "inv_move", from: { tab: selected.tab, cell: selected.cell }, to: { tab, cell } });
      selected = null;
    }
    render();
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
    if (clock) clearInterval(clock);
    clock = open ? setInterval(tickMail, 1000) : undefined;
    if (!open) {
      selected = null;
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
      if (!selected) splitQty = null;
      render();
    },
    rejected(reason, retryMs) {
      if (reason !== "wait" && reason !== "rate") return false;
      // The sort did not happen: show the mode that is really applied.
      sortStep = prevSortStep;
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
    setMail(next) {
      const now = Date.now();
      mail = next.map((m) => ({ ...m, deadline: m.expiresInMs === null ? null : now + m.expiresInMs }));
      refreshBadge();
      render();
    },
  };
}

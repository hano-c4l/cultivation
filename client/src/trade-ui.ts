import { getItemDef, glowTierOf, type BagItem, type ClientMessage, type TradeEnd, type TradeError, type TradeSideView } from "@game/shared";
import { describeItem, elementDot, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { iconFor } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface TradeUi {
  /** Someone invited this player. */
  invited(from: string, name: string, ttlMs: number): void;
  /** The server's picture of the trade (both sides); opens the window. */
  show(msg: { rev: number; other: { id: string; name: string }; mine: TradeSideView; theirs: TradeSideView; cfg: { maxItems: number; maxLinh: number; maxTienNgoc: number } }): void;
  end(reason: TradeEnd): void;
  error(reason: TradeError): void;
  /** The bag changed: the picker may have too. */
  refresh(): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

/**
 * The trade window: your side (items picked from the bag, Linh Thạch) and theirs, a lock for each side and an agreement once both are locked. It only
 * sends what the player wants; every change undoes both locks, and the server does the trade as one batch.
 */
export function initTrade(send: (msg: ClientMessage) => void, bag: () => BagItem[], notify: (text: string, ok: boolean) => void): TradeUi {
  const panel = el("div");
  panel.id = "trade-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("trade", panel, 5);

  /** The small box that asks "invite X?" or "X invites you". */
  const prompt = el("div");
  prompt.id = "trade-prompt";
  prompt.hidden = true;
  document.body.append(prompt);
  let promptTimer: ReturnType<typeof setTimeout> | null = null;
  const closePrompt = () => {
    prompt.hidden = true;
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = null;
  };

  let view: Parameters<TradeUi["show"]>[0] | null = null;
  let note = "";
  let linhDraft = 0;
  let tnDraft = 0;
  let bagSel: string | null = null;
  let mineSel: string | null = null;
  let theirSel: string | null = null;
  let sendQty = 1;

  const sendOffer = (items: string[], linh: number, tienNgoc: number) => send({ t: "trade_offer", items, linh, tienNgoc });

  /** The picture of one item as the bag draws it: icon, realm tag, element, quantity in the corner, quality as the ring round it. */
  type Shown = { id: string; type: string; qty: number; lv?: number; dur?: number; max?: number; xp?: number; rs?: unknown; en?: number };
  const cellOf = (it: Shown, selected: boolean, onClick: () => void): HTMLElement => {
    const def = getItemDef(it.type);
    const slot = el("button", "bag-cell");
    slot.classList.add(`cat-${def?.category ?? "material"}`, `rar-${def?.rarity ?? "common"}`);
    if (it.dur !== undefined && it.dur <= 0) slot.classList.add("broken");
    const glow = glowTierOf(it.en);
    if (glow > 0 && def?.equip) slot.classList.add(glow === 2 ? "gl10" : "gl7");
    if (selected) slot.classList.add("selected");
    slot.title = def?.nameVi ?? it.type;
    slot.append(iconFor(it.type));
    const tag = itemTierTag(it.type, it.lv);
    if (tag) slot.append(el("span", `bag-tag ${realmClass(itemTierRealm(it.type, it.lv))}`, tag));
    const dot = elementDot(it.type);
    if (dot) {
      dot.classList.add("bag-elem");
      slot.append(dot);
    }
    if (it.qty > 1) slot.append(el("span", "bag-qty", String(it.qty)));
    slot.onclick = onClick;
    return slot;
  };
  const describe = (it: Shown): HTMLElement => describeItem(it.type, { dur: it.dur, max: it.max, qty: it.qty, lv: it.lv, xp: it.xp, rs: it.rs as never, en: it.en });
  const fromCarry = (it: TradeSideView["items"][number]): Shown => ({ id: it.id, type: it.type, qty: it.qty, lv: it.carry.lv as number | undefined, dur: it.carry.dur as number | undefined, max: it.carry.max as number | undefined, xp: it.carry.xp as number | undefined, rs: it.carry.rs, en: it.carry.en as number | undefined });

  /** A pane of offered items: the detail of the chosen one above, its extra button, and the cells (as many slots as the limit). */
  const offerPane = (shown: Shown[], max: number, sel: string | null, pick: (id: string | null) => void, action: ((it: Shown) => HTMLElement) | null): HTMLElement => {
    const box = el("div");
    const detail = el("div", "bag-detail tr-detail");
    const chosen = shown.find((x) => x.id === sel);
    if (chosen) {
      detail.append(describe(chosen));
      if (action) detail.append(action(chosen));
    } else detail.append(el("div", "muted", vi.trade.hint));
    const grid = el("div", "bag-grid tr-grid");
    for (let i = 0; i < max; i++) {
      const it = shown[i];
      if (it) grid.append(cellOf(it, it.id === sel, () => pick(it.id === sel ? null : it.id)));
      else grid.append(el("div", "bag-cell empty"));
    }
    box.append(detail, grid);
    return box;
  };

  const render = () => {
    panel.replaceChildren();
    if (!view) return;
    const v = view;
    const head = el("div", "eq-head");
    const close = el("button", "", "×");
    close.onclick = () => send({ t: "trade_cancel" });
    head.append(el("b", "", vi.trade.title(v.other.name)), close);
    panel.append(head);
    if (note) panel.append(el("div", "tr-note", note));

    const columns = el("div", "tr-cols");
    const offered = new Set(v.mine.items.map((x) => x.id));
    if (bagSel && !bag().some((i) => i.id === bagSel && !offered.has(i.id))) bagSel = null;
    if (mineSel && !offered.has(mineSel)) mineSel = null;
    if (theirSel && !v.theirs.items.some((x) => x.id === theirSel)) theirSel = null;

    // --- 1: my bag, in the order the bag has it
    const bagCol = el("div", "tr-col");
    bagCol.append(el("div", "tr-h", vi.trade.bag));
    const detail = el("div", "bag-detail tr-detail");
    const chosen = bagSel ? bag().find((i) => i.id === bagSel) : undefined;
    if (chosen) {
      detail.append(describe(chosen));
      const row = el("div", "tr-send");
      const qty = el("input");
      qty.type = "number";
      qty.min = "1";
      qty.max = String(chosen.qty);
      qty.value = String(Math.min(Math.max(1, sendQty), chosen.qty));
      qty.readOnly = chosen.qty <= 1;
      qty.onchange = () => {
        sendQty = Math.min(Math.max(1, Math.floor(Number(qty.value)) || 1), chosen.qty);
        qty.value = String(sendQty);
      };
      const give = el("button", "", vi.trade.send);
      give.disabled = v.mine.items.length >= v.cfg.maxItems;
      give.onclick = () => {
        const n = chosen.qty <= 1 ? 1 : Math.min(Math.max(1, Math.floor(Number(qty.value)) || 1), chosen.qty);
        send({ t: "trade_add", id: chosen.id, qty: n });
        bagSel = null;
        render();
      };
      row.append(el("span", "muted", vi.trade.qty), qty, give);
      detail.append(row);
    } else detail.append(el("div", "muted", vi.trade.pickBag(v.cfg.maxItems)));
    const grid = el("div", "bag-grid tr-grid tr-scroll");
    const mineBag = [...bag()].filter((i) => !offered.has(i.id) && !getItemDef(i.type)?.disabled).sort((x, y) => x.tab - y.tab || x.cell - y.cell);
    for (const i of mineBag) {
      grid.append(
        cellOf(i, i.id === bagSel, () => {
          bagSel = i.id === bagSel ? null : i.id;
          sendQty = i.qty;
          render();
        }),
      );
    }
    if (mineBag.length === 0) grid.append(el("div", "muted", vi.trade.bagEmpty));
    bagCol.append(detail, grid);

    // --- 2: what I put in, and my money
    const mine = el("div", "tr-col");
    mine.append(el("div", "tr-h", vi.trade.mine + (v.mine.locked ? ` · ${vi.trade.locked}` : "")));
    mine.append(
      offerPane(
        v.mine.items.map(fromCarry),
        v.cfg.maxItems,
        mineSel,
        (id) => {
          mineSel = id;
          render();
        },
        (it) => {
          const rm = el("button", "tr-remove", vi.trade.remove);
          rm.onclick = () => {
            mineSel = null;
            sendOffer(v.mine.items.filter((x) => x.id !== it.id).map((x) => x.id), v.mine.linh, v.mine.tienNgoc);
          };
          return rm;
        },
      ),
    );
    const linhRow = el("label", "tr-linh", vi.trade.linh);
    const linh = el("input");
    linh.type = "number";
    linh.min = "0";
    linh.max = String(v.cfg.maxLinh);
    linh.value = String(linhDraft);
    linh.onchange = () => {
      linhDraft = Math.max(0, Math.floor(Number(linh.value)) || 0);
      sendOffer(v.mine.items.map((x) => x.id), linhDraft, tnDraft);
    };
    linhRow.append(linh);
    const tnRow = el("label", "tr-linh", vi.trade.tienNgoc);
    const tn = el("input");
    tn.type = "number";
    tn.min = "0";
    tn.max = String(v.cfg.maxTienNgoc);
    tn.value = String(tnDraft);
    tn.onchange = () => {
      tnDraft = Math.max(0, Math.floor(Number(tn.value)) || 0);
      sendOffer(v.mine.items.map((x) => x.id), linhDraft, tnDraft);
    };
    tnRow.append(tn);
    mine.append(linhRow, tnRow);

    // --- 3: what they put in (look only)
    const theirs = el("div", "tr-col");
    theirs.append(el("div", "tr-h", vi.trade.theirs(v.other.name) + (v.theirs.locked ? ` · ${vi.trade.locked}` : "")));
    theirs.append(
      offerPane(
        v.theirs.items.map(fromCarry),
        v.cfg.maxItems,
        theirSel,
        (id) => {
          theirSel = id;
          render();
        },
        null,
      ),
    );
    theirs.append(el("div", "tr-linh", vi.trade.theirLinh(fmt(v.theirs.linh), fmt(v.theirs.tienNgoc))));
    columns.append(bagCol, mine, theirs);
    panel.append(columns);

    // --- buttons
    const bar = el("div", "tr-bar");
    const lock = el("button", "", v.mine.locked ? vi.trade.unlock : vi.trade.lock);
    lock.onclick = () => send({ t: "trade_lock", rev: v.rev, on: !v.mine.locked });
    const agree = el("button", "", v.mine.confirmed ? vi.trade.waiting : vi.trade.agree);
    agree.disabled = !(v.mine.locked && v.theirs.locked) || v.mine.confirmed;
    agree.onclick = () => send({ t: "trade_confirm", rev: v.rev });
    const cancel = el("button", "tr-cancel", vi.trade.cancel);
    cancel.onclick = () => send({ t: "trade_cancel" });
    bar.append(lock, agree, cancel);
    panel.append(bar, el("div", "muted", vi.trade.rule));
  };

  const showPrompt = (text: string, buttons: Array<[string, () => void]>, ttlMs: number) => {
    closePrompt();
    prompt.replaceChildren(el("div", "", text));
    const row = el("div", "tr-bar");
    for (const [label, on] of buttons) {
      const b = el("button", "", label);
      b.onclick = () => {
        closePrompt();
        on();
      };
      row.append(b);
    }
    prompt.append(row);
    prompt.hidden = false;
    promptTimer = setTimeout(closePrompt, ttlMs);
  };

  return {
    invited(from, name, ttlMs) {
      showPrompt(vi.trade.invitedBy(name), [[vi.trade.accept, () => send({ t: "trade_reply", from, accept: true })], [vi.trade.decline, () => send({ t: "trade_reply", from, accept: false })]], ttlMs);
    },
    show(msg) {
      const first = view === null;
      view = msg;
      closePrompt();
      if (first) {
        linhDraft = 0;
        tnDraft = 0;
        bagSel = mineSel = theirSel = null;
        note = "";
      } else {
        linhDraft = msg.mine.linh;
        tnDraft = msg.mine.tienNgoc;
      }
      panel.hidden = false;
      render();
    },
    end(reason) {
      closePrompt();
      view = null;
      panel.hidden = true;
      note = "";
      notify(vi.trade.ended[reason] ?? vi.trade.ended.cancelled ?? "", reason === "done");
    },
    error(reason) {
      note = vi.trade.errors[reason] ?? "";
      if (view) render();
      else notify(note, false);
    },
    refresh() {
      if (view && !panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
  };
}

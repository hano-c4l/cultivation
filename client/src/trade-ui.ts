import { getItemDef, type BagItem, type ClientMessage, type TradeEnd, type TradeError, type TradeSideView } from "@game/shared";
import { equipLines, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { iconFor } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface TradeUi {
  /** The player clicked another player of a safe map: asks whether to invite them. */
  askTo(id: string, name: string): void;
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

  const itemBlock = (type: string, qty: number, carry: Record<string, unknown>): HTMLElement => {
    const node = el("div", "tr-item");
    const name = el("div", "tr-name", `${getItemDef(type)?.nameVi ?? type}${qty > 1 ? ` x${qty}` : ""}`);
    name.prepend(iconFor(type));
    const tag = itemTierTag(type, carry.lv as number | undefined);
    if (tag) name.prepend(el("span", `eq-tier ${realmClass(itemTierRealm(type, carry.lv as number | undefined))}`, tag));
    const def = getItemDef(type);
    const lines = def?.category === "equipment" ? equipLines(type, carry.dur as number | undefined, carry.max as number | undefined, carry.lv as number | undefined, carry.rs as never, carry.en as number | undefined).join(" · ") : (def?.descVi ?? "");
    node.append(name, el("div", "muted", lines));
    return node;
  };

  const sendOffer = (items: string[], linh: number, tienNgoc: number) => send({ t: "trade_offer", items, linh, tienNgoc });

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
    // --- my side
    const mine = el("div", "tr-col");
    mine.append(el("div", "tr-h", vi.trade.mine + (v.mine.locked ? ` · ${vi.trade.locked}` : "")));
    for (const it of v.mine.items) {
      const row = el("div", "tr-row");
      row.append(itemBlock(it.type, it.qty, it.carry));
      const rm = el("button", "", "×");
      rm.title = vi.trade.remove;
      rm.onclick = () => sendOffer(v.mine.items.filter((x) => x.id !== it.id).map((x) => x.id), v.mine.linh, v.mine.tienNgoc);
      row.append(rm);
      mine.append(row);
    }
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
    // The picker: the bag items not offered yet.
    const offered = new Set(v.mine.items.map((x) => x.id));
    const grid = el("div", "tr-bag");
    for (const i of bag()) {
      if (offered.has(i.id) || getItemDef(i.type)?.disabled) continue;
      const cell = el("button", "tr-cell");
      cell.title = `${getItemDef(i.type)?.nameVi ?? i.type}${i.qty > 1 ? ` x${i.qty}` : ""}`;
      cell.append(iconFor(i.type));
      if (i.qty > 1) cell.append(el("span", "tr-qty", String(i.qty)));
      cell.disabled = v.mine.items.length >= v.cfg.maxItems;
      cell.onclick = () => sendOffer([...v.mine.items.map((x) => x.id), i.id], v.mine.linh, v.mine.tienNgoc);
      grid.append(cell);
    }
    mine.append(el("div", "muted", vi.trade.pick(v.cfg.maxItems)), grid);

    // --- their side
    const theirs = el("div", "tr-col");
    theirs.append(el("div", "tr-h", vi.trade.theirs(v.other.name) + (v.theirs.locked ? ` · ${vi.trade.locked}` : "")));
    if (v.theirs.items.length === 0) theirs.append(el("div", "muted", vi.trade.nothing));
    for (const it of v.theirs.items) {
      const row = el("div", "tr-row");
      row.append(itemBlock(it.type, it.qty, it.carry));
      theirs.append(row);
    }
    theirs.append(el("div", "tr-linh", vi.trade.theirLinh(fmt(v.theirs.linh), fmt(v.theirs.tienNgoc))));
    columns.append(mine, theirs);
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
    askTo(id, name) {
      showPrompt(vi.trade.askInvite(name), [[vi.trade.invite, () => send({ t: "trade_invite", to: id })], [vi.trade.no, () => undefined]], 8000);
    },
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

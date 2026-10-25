import type { ClientMessage, WaygateDest } from "@game/shared";
import { mapLabel, vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface WaygateUi {
  /** Opens the window of the teleport array `npc` (the server answers with the destinations and their prices). */
  open(npc: string): void;
  close(): void;
  /** The destinations the server sent for the array that was opened. */
  setDests(npc: string, dests: WaygateDest[]): void;
  /** The Linh Thạch the character holds (a destination it cannot pay for is greyed out). */
  setBalance(linhThach: number): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The window of the teleport array in the middle of a main town: one row per other town with the Linh Thạch the trip costs. It only sends the
 * destination; the server prices the trip, runs the channel and takes the Linh Thạch when it ends.
 */
export function initWaygate(send: (msg: ClientMessage) => void): WaygateUi {
  const panel = el("div");
  panel.id = "waygate-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("waygate", panel, 5);

  let npc = "";
  let dests: WaygateDest[] = [];
  let balance = 0;

  const render = () => {
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(el("b", "", vi.waygate.title), close);
    panel.append(head, el("div", "muted", vi.waygate.hint));
    if (dests.length === 0) panel.append(el("div", "muted", vi.waygate.none));
    for (const d of dests) {
      const row = el("div", "wg-row");
      const info = el("div");
      info.append(el("div", "wg-name", mapLabel(d.map)), el("div", "wg-price", vi.waygate.price(d.price.toLocaleString("vi-VN"))));
      const go = el("button", "", vi.waygate.go);
      go.disabled = balance < d.price;
      go.title = go.disabled ? vi.waygate.poor : "";
      go.onclick = () => {
        send({ t: "waygate_go", npc, to: d.map });
        panel.hidden = true;
      };
      row.append(info, go);
      panel.append(row);
    }
    panel.append(el("div", "muted", vi.waygate.balance(balance.toLocaleString("vi-VN"))));
  };

  return {
    open(id) {
      npc = id;
      dests = [];
      panel.hidden = false;
      render();
      send({ t: "npc_open", npc: id });
    },
    close() {
      panel.hidden = true;
    },
    setDests(id, list) {
      if (id !== npc) return;
      dests = list;
      render();
    },
    setBalance(n) {
      balance = n;
      if (!panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
  };
}

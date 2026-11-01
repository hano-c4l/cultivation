import { mountOf, tuning, type ClientMessage } from "@game/shared";
import { iconButton } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface MountUi {
  /** Shows the button (once the character is in the game). */
  show(): void;
  open(): void;
  /** The server's list of the mounts the character has and the one it rides. */
  onList(owned: string[], riding: string | null): void;
  /** The beast being ridden changed (null: none). */
  onRiding(id: string | null): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The window of the beast mounts (docs/PHASE5.md, 5d): the mounts the character has, with the speed each adds, and a button to ride or to get off. The mounts that are
 * not learned yet are listed too, with the realm they need (they come from the tokens the merchants sell). It only sends what the player wants; the server decides.
 */
export function initMount(send: (msg: ClientMessage) => void): MountUi {
  const toggle = el("button");
  iconButton(toggle, "beast", vi.beast.button);
  toggle.id = "beast-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "beast-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("beast", panel, 6);

  let owned: string[] = [];
  let riding: string | null = null;

  const render = () => {
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(el("b", undefined, vi.beast.title), close);
    panel.append(head, el("div", "muted", vi.beast.hint));
    const list = tuning().mounts.list.filter((m) => m.enabled);
    for (const m of list) {
      const have = owned.includes(m.id);
      const row = el("div", "beast-row");
      const info = el("div", "beast-info");
      info.append(el("b", undefined, m.nameVi), el("div", "muted", `+${m.speedPct}% ${vi.beast.speed}`), el("div", "muted", m.descVi));
      if (!have) info.append(el("div", "muted", vi.beast.need(m.minRealm)));
      const act = el("button", undefined, riding === m.id ? vi.beast.down : vi.beast.ride);
      act.disabled = !have;
      act.onclick = () => send({ t: "beast", id: riding === m.id ? null : m.id });
      row.append(info, act);
      panel.append(row);
    }
    if (list.length === 0) panel.append(el("div", "muted", vi.beast.none));
    if (owned.some((id) => !mountOf(id))) panel.append(el("div", "muted", vi.beast.gone));
  };

  const ui: MountUi = {
    show() {
      toggle.hidden = false;
    },
    open() {
      panel.hidden = false;
      send({ t: "mount_list" });
      render();
    },
    onList(list, now) {
      owned = list;
      riding = now;
      if (!panel.hidden) render();
    },
    onRiding(id) {
      riding = id;
      if (!panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
  };
  toggle.onclick = () => (panel.hidden ? ui.open() : (panel.hidden = true));
  return ui;
}

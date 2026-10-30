import { getSkill, skillDisplayName, type ClientMessage } from "@game/shared";
import { renderIcon, skillIconSpecOf } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface DojoUi {
  /** Opens the window of the martial master `npc` (the server answers with the courses still open to this character). */
  open(npc: string): void;
  close(): void;
  setCourses(npc: string, courses: Array<{ skill: string; cost: number; ok: boolean }>): void;
  /** The Linh Thạch the character holds (a course it cannot pay for is greyed out). */
  setBalance(linhThach: number): void;
  /** A message of the master after a try (learned, or why not). */
  notify(text: string, ok: boolean): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The martial master's window: the advanced skills this character can still learn, each with its fee in Linh Thạch. A skill already learned is not listed.
 * It only sends the skill; the server checks the realm, takes the fee and stores the skill in one batch.
 */
export function initDojo(send: (msg: ClientMessage) => void): DojoUi {
  const panel = el("div");
  panel.id = "dojo-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("dojo", panel, 5);

  let npc = "";
  let courses: Array<{ skill: string; cost: number; ok: boolean }> = [];
  let balance = 0;
  let loaded = false;
  let note: { text: string; ok: boolean } | null = null;

  const render = () => {
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(el("b", "", vi.dojo.title), close);
    panel.append(head, el("div", "muted", vi.dojo.hint));
    if (note) panel.append(el("div", note.ok ? "dj-ok" : "dj-err", note.text));
    if (!loaded) panel.append(el("div", "muted", vi.dojo.loading));
    else if (courses.length === 0) panel.append(el("div", "muted", vi.dojo.none));
    for (const c of courses) {
      const def = getSkill(c.skill);
      const row = el("div", "dj-row");
      const icon = renderIcon(skillIconSpecOf(def));
      const info = el("div", "dj-info");
      info.append(el("div", "dj-name", def ? skillDisplayName(def) : c.skill), el("div", "muted", def?.descVi ?? ""), el("div", "dj-price", vi.dojo.price(c.cost.toLocaleString("vi-VN"))));
      const learn = el("button", "", vi.dojo.learn);
      learn.disabled = !c.ok || balance < c.cost;
      learn.title = !c.ok ? vi.dojo.levelLow : balance < c.cost ? vi.dojo.poor : "";
      learn.onclick = () => send({ t: "dojo_learn", npc, skill: c.skill });
      row.append(icon, info, learn);
      panel.append(row);
    }
    panel.append(el("div", "muted", vi.dojo.balance(balance.toLocaleString("vi-VN"))));
  };

  return {
    open(id) {
      npc = id;
      courses = [];
      loaded = false;
      note = null;
      panel.hidden = false;
      render();
      send({ t: "npc_open", npc: id });
    },
    close() {
      panel.hidden = true;
    },
    setCourses(id, list) {
      if (id !== npc) return;
      courses = list;
      loaded = true;
      render();
    },
    setBalance(n) {
      balance = n;
      if (!panel.hidden) render();
    },
    notify(text, ok) {
      note = { text, ok };
      if (!panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
  };
}

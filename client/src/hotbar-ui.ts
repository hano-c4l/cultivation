import { HOTBAR_SLOTS, getItemDef, getSkill, type ClientMessage } from "@game/shared";
import { vi } from "./locales/vi";

export interface HotbarUi {
  setSlots(slots: string[]): void;
  /** The skills the character can use now; a slot holding one that is no longer usable is shown dim. */
  setSkills(ids: string[]): void;
  /** A skill went off: its cooldown runs for `ms`. */
  setCooldown(skill: string, ms: number): void;
  /** Starts assigning: the next slot tapped gets `value` ("s:<skill>", "i:<item type>" or "" to clear it). */
  beginAssign(value: string, label: string): void;
  /** The bag changed: potion counts on the bar may have too. */
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The hotbar: 8 slots on keys 1-8 (tap on a phone) holding skills and potions. A skill slot sends `cast` (with the
 * current target), a potion slot sends `use_type` (the server picks the stack). Setting a slot is "tap what to assign
 * (skills window, bag), then tap a slot", which also works on a touch screen. The server decides everything; the bar only
 * shows cooldowns it was told about and dims what MP cannot pay.
 */
export function initHotbar(deps: { send: (msg: ClientMessage) => void; getTarget: () => string | null; getMp: () => number; countOf: (type: string) => number }): HotbarUi {
  const root = el("div");
  root.id = "hotbar";
  root.hidden = true;
  const note = el("div", "hb-note");
  note.hidden = true;
  const row = el("div", "hb-row");
  root.append(note, row);
  document.body.append(root);
  // On a phone the bar sits just above the chat box, whatever height that has.
  const chat = document.getElementById("chat");
  if (chat && "ResizeObserver" in window) new ResizeObserver(() => document.documentElement.style.setProperty("--chat-h", `${chat.offsetHeight}px`)).observe(chat);

  let slots: string[] = Array(HOTBAR_SLOTS).fill("");
  let usable = new Set<string>();
  const readyAt = new Map<string, number>();
  let pending: { value: string; label: string } | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  function render(): void {
    row.replaceChildren();
    let busy = false;
    slots.forEach((v, i) => {
      const b = el("button", "hb-slot");
      b.append(el("span", "hb-key", String(i + 1)));
      if (pending) b.classList.add("assigning");
      if (v.startsWith("s:")) {
        const skill = getSkill(v.slice(2));
        b.append(el("span", "hb-name", skill?.nameVi ?? v.slice(2)));
        if (skill) {
          b.title = `${skill.nameVi} · ${vi.skills.mp(skill.mpCost)}`;
          if (!usable.has(skill.id) || deps.getMp() < skill.mpCost) b.classList.add("dim");
          const left = (readyAt.get(skill.id) ?? 0) - Date.now();
          if (left > 0) {
            busy = true;
            b.classList.add("cooling");
            b.append(el("span", "hb-cd", String(Math.ceil(left / 1000))));
          }
        }
      } else if (v.startsWith("i:")) {
        const type = v.slice(2);
        const count = deps.countOf(type);
        b.append(el("span", "hb-name", getItemDef(type)?.nameVi ?? type), el("span", "hb-count", String(count)));
        if (count === 0) b.classList.add("dim");
      }
      b.onclick = () => press(i);
      row.append(b);
    });
    if (busy && !timer) timer = setInterval(render, 250);
    if (!busy && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function press(i: number): void {
    if (pending) {
      deps.send({ t: "hotbar_set", slot: i, v: pending.value });
      pending = null;
      note.hidden = true;
      render();
      return;
    }
    const v = slots[i] ?? "";
    const target = deps.getTarget();
    if (v.startsWith("s:")) deps.send(target ? { t: "cast", skill: v.slice(2), target } : { t: "cast", skill: v.slice(2) });
    else if (v.startsWith("i:")) deps.send({ t: "use_type", type: v.slice(2) });
  }

  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey || root.hidden) return;
    if (ev.key === "Escape" && pending) {
      pending = null;
      note.hidden = true;
      render();
    } else if (ev.key >= "1" && ev.key <= String(HOTBAR_SLOTS)) {
      press(Number(ev.key) - 1);
    }
  });

  return {
    setSlots(next) {
      slots = next.length === HOTBAR_SLOTS ? next : Array(HOTBAR_SLOTS).fill("");
      root.hidden = false;
      render();
    },
    setSkills(ids) {
      usable = new Set(ids);
      render();
    },
    setCooldown(skill, ms) {
      readyAt.set(skill, Date.now() + ms);
      render();
    },
    beginAssign(value, label) {
      pending = { value, label };
      note.textContent = vi.skills.assigning(label);
      note.hidden = false;
      render();
    },
    refresh: render,
  };
}

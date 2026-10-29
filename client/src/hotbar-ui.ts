import { HOTBAR_SLOTS, REALMS, getItemDef, getSkill, parseSkillSlot, skillDisplayName, type ClientMessage, type SkillContext, type SkillDef } from "@game/shared";
import { realmClass } from "./equip-text";
import { iconFor, skillIconFor } from "./icons";
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
  /** Shows (or with null hides) a line above the bar; used while the player is choosing where to teleport. */
  setAimNote(text: string | null): void;
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
export function initHotbar(deps: { send: (msg: ClientMessage) => void; aim: (skill: SkillDef) => void; mpCostOf: (skill: SkillDef) => number; getTarget: () => string | null; getAim: () => { x: number; y: number } | null; getMp: () => number; countOf: (type: string) => number; contextOf: (skill: SkillDef) => SkillContext }): HotbarUi {
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
  /** Set when a mouse drag just ended, so the click that follows it does not also press the slot. */
  let justDragged = false;

  function render(): void {
    row.replaceChildren();
    let busy = false;
    slots.forEach((v, i) => {
      const b = el("button", "hb-slot");
      b.append(el("span", "hb-key", String(i + 1)));
      b.dataset.slot = String(i);
      if (pending) b.classList.add("assigning");
      const slotSkill = parseSkillSlot(v);
      if (slotSkill) {
        const skill = getSkill(slotSkill.id);
        b.append(skillIconFor(skill), el("span", "hb-name", skill ? skillDisplayName(skill) : slotSkill.id));
        // The element the skill is used with (its own, or the one picked when it was put here) shows in the corner, like on gear.
        const element = skill?.element ?? slotSkill.element;
        if (element) b.append(el("span", `elem-dot hb-elem elem-${element}`));
        if (skill) {
          // The realm tag sits in the top left corner like on gear (coloured by realm), and the background follows the grade (phẩm cấp).
          const ctx = deps.contextOf(skill);
          b.classList.add(`hb-grade-${Math.min(Math.max(ctx.grade, 0), 4)}`);
          b.append(el("span", `hb-tag ${realmClass(ctx.realm)}`, `${REALMS[ctx.realm]?.shortVi ?? ""}${skill.source === "gear" ? (ctx.tier ?? 1) : ""}`));
          const cost = deps.mpCostOf(skill);
          b.title = `${skillDisplayName(skill)} · ${vi.skills.mp(cost)}`;
          if (!usable.has(skill.id) || deps.getMp() < cost) b.classList.add("dim");
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
        b.append(iconFor(type), el("span", "hb-name", getItemDef(type)?.nameVi ?? type), el("span", "hb-count", String(count)));
        if (count === 0) b.classList.add("dim");
      }
      b.onclick = () => {
        if (justDragged) return;
        press(i);
      };
      b.onpointerdown = (ev) => startDrag(ev, i, b);
      row.append(b);
    });
    if (busy && !timer) timer = setInterval(render, 250);
    if (!busy && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  /** Mouse drag and drop of a slot onto another one swaps them (touch keeps tap-to-assign, so the page can still scroll). */
  function startDrag(ev: PointerEvent, from: number, source: HTMLElement): void {
    if (ev.pointerType !== "mouse" || ev.button !== 0 || pending || !(slots[from] ?? "")) return;
    const sx = ev.clientX;
    const sy = ev.clientY;
    let ghost: HTMLElement | null = null;
    // The bar is rebuilt every 250 ms while a skill cools down, so the slot may be gone from the page by the time the drag
    // starts: its look (size, colours and a copy) is taken now, at the press.
    const look = getComputedStyle(source);
    const width = source.offsetWidth;
    const height = source.offsetHeight;
    const background = look.backgroundColor;
    const border = look.borderTopColor;
    const copy = source.cloneNode(true) as HTMLElement;
    const move = (e: PointerEvent) => {
      if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
        ghost = copy;
        ghost.className = "hb-ghost";
        ghost.style.width = `${width}px`;
        ghost.style.height = `${height}px`;
        ghost.style.backgroundColor = background;
        ghost.style.borderColor = border;
        document.body.append(ghost);
      }
      if (ghost) {
        ghost.style.left = `${e.clientX - width / 2}px`;
        ghost.style.top = `${e.clientY - height / 2}px`;
      }
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!ghost) return; // no drag: the click handler takes over
      ghost.remove();
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".hb-slot");
      const to = target?.dataset.slot === undefined ? NaN : Number(target.dataset.slot);
      if (Number.isInteger(to) && to !== from) {
        // Shown at once; the server's `hotbar` answer is what stays (it also corrects a refused swap).
        const next = [...slots];
        next[from] = slots[to] ?? "";
        next[to] = slots[from] ?? "";
        slots = next;
        deps.send({ t: "hotbar_swap", a: from, b: to });
        render();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function press(i: number, directional = false): void {
    if (pending) {
      deps.send({ t: "hotbar_set", slot: i, v: pending.value });
      pending = null;
      note.hidden = true;
      render();
      return;
    }
    const v = slots[i] ?? "";
    const target = deps.getTarget();
    const slotSkill = parseSkillSlot(v);
    const chosen = slotSkill ? getSkill(slotSkill.id) : undefined;
    if (chosen?.kind === "teleport") deps.aim(chosen); // needs a point: the next map click gives it
    else if (slotSkill) {
      // An attack with a target goes at the target; with none (or with Shift held) it is aimed at the point under the pointer: a directional cast.
      const aim = chosen?.kind === "attack" && (!target || directional) ? deps.getAim() : null;
      const at = aim ? { x: Math.round(aim.x * 100) / 100, y: Math.round(aim.y * 100) / 100 } : null;
      deps.send({ t: "cast", skill: slotSkill.id, ...(at ? at : target ? { target } : {}), ...(slotSkill.element ? { el: slotSkill.element } : {}) });
    }
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
    } else if (/^Digit[1-9]$/.test(ev.code) && Number(ev.code.slice(5)) <= HOTBAR_SLOTS) {
      // read from the key code: with Shift held `ev.key` is "!" or "@", not the digit
      press(Number(ev.code.slice(5)) - 1, ev.shiftKey);
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
    setAimNote(text) {
      if (pending) return; // the assigning note owns the line meanwhile
      note.textContent = text ?? "";
      note.hidden = text === null;
    },
  };
}

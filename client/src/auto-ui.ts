import { getSkill, parseSkillSlot, skillDisplayName, tuning } from "@game/shared";
import type { AutoSettings } from "./auto-brain";
import { loadAuto, saveAuto } from "./auto-store";
import { skillIconFor } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface AutoUiDeps {
  /** The character the settings belong to (they are kept per character). */
  charId(): string | null;
  /** The skills on the hotbar, as the bar holds them (the element comes with the value), with the key they sit on. */
  hotbarSkills(): Array<{ value: string; key: number }>;
  /** The potions in the bag that heal. */
  potions(): Array<{ type: string; name: string; qty: number }>;
  /** Start was pressed: false when it is refused (the scene says why), so the window stays. */
  onStart(settings: AutoSettings): boolean;
  onStop(): void;
}

export interface AutoUi {
  /** The button shows Stop while it runs and Auto otherwise. */
  setRunning(on: boolean): void;
  isRunning(): boolean;
  /** The window is closed (a map change, a start). */
  close(): void;
  show(on: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The Auto button and its window. The window holds the choices (range, skills, potion and the limits for them), keeps them per character in the browser, and
 * starts the hunt with Start; while the hunt runs the button reads Stop and stops it. The hunting itself is the scene's (`auto-brain.ts` decides).
 */
export function initAuto(deps: AutoUiDeps): AutoUi {
  const btn = el("button", undefined, vi.auto.button);
  btn.id = "auto-btn";
  btn.hidden = true;
  const panel = el("div");
  panel.id = "auto-panel";
  panel.hidden = true;
  document.body.append(btn, panel);
  registerWindow("auto", panel, 5);

  let running = false;
  let current: AutoSettings = loadAuto(deps.charId());

  const commit = (): void => saveAuto(deps.charId(), current);

  function row(label: string, control: HTMLElement): HTMLElement {
    const r = el("label", "au-row");
    r.append(el("span", "au-label", label), control);
    return r;
  }

  function slider(min: number, max: number, value: number, unit: string, onInput: (v: number) => void): HTMLElement {
    const box = el("span", "au-slide");
    const input = el("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    const out = el("b", undefined, `${value}${unit}`);
    input.oninput = () => {
      const v = Number(input.value);
      out.textContent = `${v}${unit}`;
      onInput(v);
      commit();
    };
    box.append(input, out);
    return box;
  }

  function check(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const r = el("label", "au-check");
    const input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.onchange = () => {
      onChange(input.checked);
      commit();
    };
    r.append(input, el("span", undefined, label));
    return r;
  }

  function build(): void {
    const lim = tuning().auto;
    current = loadAuto(deps.charId());
    const head = el("div", "au-head");
    const close = el("button", "au-x", "✕");
    close.onclick = () => (panel.hidden = true);
    head.append(el("b", undefined, vi.auto.title), close);

    const skills = deps.hotbarSkills();
    // a saved skill that is no longer on the bar is dropped (the element it was set up with is part of the value)
    current.skills = current.skills.filter((v) => skills.some((s) => s.value === v));
    const list = el("div", "au-skills");
    if (skills.length === 0) list.append(el("div", "au-hint", vi.auto.noSkills));
    for (const s of skills) {
      const slot = parseSkillSlot(s.value);
      const def = slot ? getSkill(slot.id) : undefined;
      if (!def) continue;
      const r = el("label", "au-skill");
      const input = el("input");
      input.type = "checkbox";
      input.checked = current.skills.includes(s.value);
      input.onchange = () => {
        current.skills = skills.map((x) => x.value).filter((v) => (v === s.value ? input.checked : current.skills.includes(v)));
        commit();
      };
      r.append(input, el("span", "au-key", String(s.key)), skillIconFor(def), el("span", undefined, skillDisplayName(def)));
      list.append(r);
    }

    const potions = deps.potions();
    const select = el("select");
    select.append(new Option(vi.auto.noPotion, ""));
    for (const p of potions) select.append(new Option(`${p.name} (${p.qty})`, p.type));
    if (current.potion && !potions.some((p) => p.type === current.potion)) select.append(new Option(current.potion, current.potion)); // not in the bag now: still the choice
    select.value = current.potion;
    select.onchange = () => {
      current.potion = select.value;
      commit();
    };

    const start = el("button", "au-start", vi.auto.start);
    start.onclick = () => {
      commit();
      if (deps.onStart({ ...current, skills: [...current.skills] })) panel.hidden = true;
    };

    panel.replaceChildren(
      head,
      row(vi.auto.radius, slider(lim.radiusMin, lim.radiusMax, current.radius, ` ${vi.auto.tiles}`, (v) => (current.radius = v))),
      check(vi.auto.returnHome, current.returnHome, (v) => (current.returnHome = v)),
      check(vi.auto.huntRare, current.huntRare, (v) => (current.huntRare = v)),
      check(vi.auto.huntBoss, current.huntBoss, (v) => (current.huntBoss = v)),
      el("div", "au-sub", vi.auto.skills),
      list,
      row(vi.auto.mpMin, slider(0, 100, current.mpMin, "%", (v) => (current.mpMin = v))),
      row(vi.auto.healBelow, slider(0, 100, current.healBelow, "%", (v) => (current.healBelow = v))),
      el("div", "au-sub", vi.auto.potion),
      row(vi.auto.potionKind, select),
      row(vi.auto.potionBelow, slider(0, 100, current.potionBelow, "%", (v) => (current.potionBelow = v))),
      el("div", "au-hint", vi.auto.note),
      start,
    );
  }

  btn.onclick = () => {
    if (running) return deps.onStop();
    if (panel.hidden) build();
    panel.hidden = !panel.hidden;
  };

  return {
    setRunning(on) {
      running = on;
      btn.textContent = on ? vi.auto.stop : vi.auto.button;
      btn.classList.toggle("running", on);
      if (on) panel.hidden = true;
    },
    isRunning: () => running,
    close: () => (panel.hidden = true),
    show: (on) => (btn.hidden = !on),
  };
}

import { getSkill, type CharacterSheet, type SkillDef } from "@game/shared";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface SkillsUi {
  setSkills(ids: string[]): void;
  setSheet(sheet: CharacterSheet): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** What a skill does, in one line. */
function effectText(s: SkillDef): string {
  if (s.kind === "attack") return `${vi.skills.kinds.attack} · ${vi.skills.power.attack(s.power)} · ${vi.skills.range(s.range)}`;
  if (s.kind === "teleport") return `${vi.skills.kinds.teleport} · ${vi.skills.power.teleport(s.range)}`;
  if (s.kind === "heal") return `${vi.skills.kinds.heal} · ${vi.skills.power.heal(Math.round(s.power * 100))}`;
  return `${vi.skills.kinds.buff} · ${vi.skills.power.buff(s.buff?.stat ?? "attack", Math.round(s.power * 100), Math.round((s.buff?.durationMs ?? 0) / 1000))}`;
}

/**
 * Skills window (button or the K key): what the character can use, with the details, and the buttons that start assigning a
 * skill to a hotbar slot (the next slot tapped gets it). Learning is server side; this only shows the list it was sent.
 */
export function initSkills(beginAssign: (value: string, label: string) => void): SkillsUi {
  const toggle = el("button", undefined, vi.skills.button);
  toggle.id = "sk-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "sk-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("skills", panel, 1);

  let ids: string[] = [];
  let sheet: CharacterSheet | null = null;

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "sk-head");
    head.append(el("b", undefined, vi.skills.title));
    const clear = el("button", "sk-small", vi.skills.clear);
    clear.onclick = () => beginAssign("", vi.skills.clearLabel);
    const close = el("button", "sk-small", "✕");
    close.onclick = () => (panel.hidden = true);
    head.append(clear, close);
    panel.append(head);
    if (ids.length === 0) panel.append(el("div", "muted", vi.skills.empty));
    for (const id of ids) {
      const s = getSkill(id);
      if (!s) continue;
      const card = el("div", "sk-card");
      const title = el("b");
      title.append(el("span", `elem-dot elem-${s.element ?? sheet?.spiritualRoot ?? "kim"}`), s.nameVi);
      const weapon = s.weapon ? ` · ${vi.skills.weapon(vi.equip.weaponTypes[s.weapon] ?? s.weapon)}` : "";
      const book = s.unlock ? "" : s.gear ? ` · ${vi.skills.fromGear}` : ` · ${vi.skills.fromBook}`;
      const info = el("div", "sk-info");
      info.append(title, el("div", "muted", effectText(s)), el("div", "muted", `${vi.skills.mp(s.mpCost)} · ${vi.skills.cooldown(Math.round(s.cooldownMs / 1000))}${weapon}${book}`), el("div", "muted", s.descVi));
      const assign = el("button", "sk-small", vi.skills.assign);
      assign.onclick = () => beginAssign(`s:${s.id}`, s.nameVi);
      card.append(info, assign);
      panel.append(card);
    }
    panel.append(el("div", "muted", vi.skills.hint));
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    render();
  };
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "k" || ev.key === "K") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) {
      panel.hidden = !panel.hidden;
      render();
    }
  });

  return {
    setSkills(next) {
      ids = next;
      toggle.hidden = false;
      render();
    },
    setSheet(next) {
      sheet = next;
      render();
    },
  };
}

import {
  MASTERY_NEEDED,
  REALMS,
  SPIRITUAL_ROOTS,
  effectiveSkill,
  gearSkillInfo,
  getItemDef,
  getSkill,
  maxSkillLevel,
  skillGrade,
  type CharacterSheet,
  type EquippedItem,
  type SkillContext,
  skillContextFor,
  PATHS,
  type SkillDef,
  type SkillSource,
  type SkillStateView,
  type SpiritualRoot,
} from "@game/shared";
import { realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface SkillsUi {
  setSkills(ids: string[]): void;
  /** Mastery of every skill that has it (the welcome). */
  setStates(states: SkillStateView): void;
  /** Mastery of one skill changed. */
  setState(id: string, lv: number, xp: number): void;
  setSheet(sheet: CharacterSheet): void;
  /** The worn gear: gear skills take the realm and grade of the piece behind them. */
  setEquipped(items: EquippedItem[]): void;
  /** The bag changed: the number of Ngộ Đạo Đan on the buttons may have too. */
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The small coloured dot of an element (the same one gear and the hotbar use). */
export function elementDot(element: string): HTMLElement {
  const dot = el("span", `elem-dot elem-${element}`);
  dot.title = vi.skills.elementNames[element] ?? element;
  return dot;
}

/** What the skill does at the strength this character has it, in one line. */
export function effectText(s: SkillDef, ctx: SkillContext): string {
  const e = effectiveSkill(s, ctx);
  const pct = Math.round(e.power * 100);
  if (s.kind === "attack") return `${vi.skills.kinds.attack} · ${vi.skills.power.attack(Math.round(e.power * 10) / 10)} · ${vi.skills.range(s.range)}`;
  if (s.kind === "teleport") return `${vi.skills.kinds.teleport} · ${vi.skills.power.teleport(s.range)}`;
  if (s.kind === "heal") return `${vi.skills.kinds.heal} · ${vi.skills.power.heal(pct)}`;
  if (s.kind === "passive") return `${vi.skills.kinds.passive} · ${vi.skills.power.passive(s.passive?.stat ?? "attack", pct)}`;
  return `${vi.skills.kinds.buff} · ${vi.skills.power.buff(s.buff?.stat ?? "attack", pct, Math.round((s.buff?.durationMs ?? 0) / 1000))}`;
}

/**
 * Skills window (button or the K key), in four tabs by where a skill comes from: the character's root, its pháp bảo, its sect
 * and what it learned. Each card shows the skill's realm and grade, its mastery level with the progress to the next one, and
 * what it does at that strength. Learning and mastery are server side; this only shows what the server sent.
 */
export function initSkills(deps: { beginAssign: (value: string, label: string) => void; boost: (skill: string) => void; pillCount: () => number }): SkillsUi {
  const toggle = el("button", undefined, vi.skills.button);
  toggle.id = "sk-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "sk-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("skills", panel, 2);

  let ids: string[] = [];
  let states: SkillStateView = {};
  let sheet: CharacterSheet | null = null;
  let worn: EquippedItem[] = [];
  /** A skill source ("root", "gear", ...) or, for a hướng tu, "path:0" (chủ tu), "path:1", "path:2" (phụ tu). */
  let tab = "root";

  /** The realm, grade and level a skill works at for this character. */
  function contextOf(s: SkillDef): SkillContext {
    const gear = s.source === "gear" ? gearSkillInfo(worn).find((g) => g.id === s.id) : undefined;
    return skillContextFor(s, { rootGrade: sheet?.rootGrade ?? 0, realm: sheet?.realm ?? 0, level: states[s.id]?.lv ?? 0, ...(sheet ? { paths: sheet.paths } : {}), ...(gear ? { gear } : {}) });
  }

  /** The tabs: root and pháp bảo, then one tab per hướng tu taken (chủ tu, phụ tu 1, 2), then sect and learned. */
  function tabList(): Array<{ id: string; label: string; match: (s: SkillDef) => boolean }> {
    const out: Array<{ id: string; label: string; match: (s: SkillDef) => boolean }> = [
      { id: "root", label: vi.skills.tabs.root, match: (s) => s.source === "root" },
      { id: "gear", label: vi.skills.tabs.gear, match: (s) => s.source === "gear" },
    ];
    const p = sheet?.paths;
    if (p?.main) out.push({ id: "path:0", label: `${vi.paths.skillsChủ} · ${PATHS[p.main].nameVi}`, match: (s) => s.source === "path" && s.path === p.main });
    p?.subs.forEach((id, i) => out.push({ id: `path:${i + 1}`, label: `${vi.paths.skillsSub(i + 1)} · ${PATHS[id].nameVi}`, match: (s) => s.source === "path" && s.path === id }));
    out.push({ id: "sect", label: vi.skills.tabs.sect, match: (s) => s.source === "sect" }, { id: "learned", label: vi.skills.tabs.learned, match: (s) => s.source === "learned" });
    return out;
  }

  function elementsOf(): SpiritualRoot[] {
    const roots = (sheet?.roots ?? []).filter((r): r is SpiritualRoot => (SPIRITUAL_ROOTS as readonly string[]).includes(r));
    return roots.length > 0 ? roots : sheet ? [sheet.spiritualRoot] : [];
  }

  function card(s: SkillDef): HTMLElement {
    const ctx = contextOf(s);
    const eff = effectiveSkill(s, ctx);
    const box = el("div", "sk-card");
    const info = el("div", "sk-info");
    const title = el("b");
    if (s.element) title.append(elementDot(s.element)); // a skill bound to an element shows it; a flexible one is given one on the hotbar
    // A gear skill carries the piece's realm and bậc ("LK4"), so pieces of one kind can be told apart.
    title.append(s.nameVi, el("span", `sk-tag ${realmClass(ctx.realm)}`, `${REALMS[ctx.realm]?.shortVi ?? ""}${s.source === "gear" ? (ctx.tier ?? 1) : ""}`));
    const meta: string[] = [vi.skills.grades[ctx.grade] ?? ""];
    // A path skill also says which level of its path it belongs to ("Kiếm Ý").
    if (s.source === "path" && s.path && (s.path in PATHS)) meta.push(PATHS[s.path as keyof typeof PATHS].levels[s.pathLevel ?? 0]?.nameVi ?? "");
    if (s.source !== "gear") meta.push(vi.skills.levels[ctx.level] ?? "");
    const weapon = s.weapon ? ` · ${vi.skills.weapon(vi.equip.weaponTypes[s.weapon] ?? s.weapon)}` : "";
    info.append(title, el("div", "sk-meta", meta.join(" · ")));
    if (s.source !== "gear") {
      const top = maxSkillLevel(ctx.grade);
      const need = ctx.level < top ? (MASTERY_NEEDED[ctx.level] ?? 0) : 0;
      const have = states[s.id]?.xp ?? 0;
      const bar = el("div", "sk-bar");
      const fill = el("div", "sk-bar-fill");
      fill.style.width = need > 0 ? `${Math.min(100, (have / need) * 100)}%` : "100%";
      bar.append(fill);
      bar.title = need > 0 ? vi.skills.masteryProgress(have, need) : vi.skills.masteryMax;
      info.append(bar, el("div", "muted", need > 0 ? vi.skills.masteryProgress(have, need) : vi.skills.masteryMax));
    }
    const cost = s.kind === "passive" ? "" : `${vi.skills.mp(eff.mpCost)} · ${vi.skills.cooldown(Math.round(eff.cooldownMs / 100) / 10)}${weapon}`;
    info.append(el("div", "muted", effectText(s, ctx)));
    if (cost) info.append(el("div", "muted", cost));
    info.append(el("div", "muted", s.descVi));
    const actions = el("div", "sk-actions");
    if (s.kind !== "passive") {
      const elements = s.flex ? elementsOf() : [];
      if (s.flex && elements.length > 1) {
        // Several elements: the one the skill is used with is chosen here, and shows as the dot on the hotbar slot.
        actions.append(el("div", "muted", vi.skills.chooseElement));
        for (const e of elements) {
          const b = el("button", "sk-small sk-el");
          b.append(elementDot(e), vi.skills.elementNames[e] ?? e);
          b.onclick = () => deps.beginAssign(`s:${s.id}:${e}`, `${s.nameVi} (${vi.skills.elementNames[e] ?? e})`);
          actions.append(b);
        }
      } else {
        const value = s.flex && elements[0] ? `s:${s.id}:${elements[0]}` : `s:${s.id}`;
        const assign = el("button", "sk-small", vi.skills.assign);
        assign.onclick = () => deps.beginAssign(value, s.nameVi);
        actions.append(assign);
      }
    }
    if (s.source !== "gear") {
      const pills = deps.pillCount();
      const top = maxSkillLevel(ctx.grade);
      const boost = el("button", "sk-small sk-pill", vi.skills.usePill(pills));
      boost.disabled = pills === 0 || ctx.level >= top;
      boost.title = getItemDef("ngo_dao_dan")?.descVi ?? "";
      boost.onclick = () => deps.boost(s.id);
      actions.append(boost);
    }
    box.append(info, actions);
    return box;
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "sk-head");
    head.append(el("b", undefined, vi.skills.title));
    const clear = el("button", "sk-small", vi.skills.clear);
    clear.onclick = () => deps.beginAssign("", vi.skills.clearLabel);
    const close = el("button", "sk-small", "✕");
    close.onclick = () => (panel.hidden = true);
    head.append(clear, close);
    panel.append(head);

    const bar = el("div", "sk-tabs");
    const tabs = tabList();
    if (!tabs.some((t) => t.id === tab)) tab = "root";
    for (const t of tabs) {
      const count = ids.filter((id) => {
        const d = getSkill(id);
        return !!d && t.match(d);
      }).length;
      const b = el("button", t.id === tab ? "active" : undefined, count > 0 ? `${t.label} (${count})` : t.label);
      b.onclick = () => {
        tab = t.id;
        render();
      };
      bar.append(b);
    }
    panel.append(bar);

    const current = tabs.find((t) => t.id === tab);
    const shown = ids.map((id) => getSkill(id)).filter((s): s is SkillDef => !!s && !!current && current.match(s));
    if (shown.length === 0) panel.append(el("div", "muted", vi.skills.emptyTab[tab] ?? vi.skills.empty));
    for (const s of shown) panel.append(card(s));
    panel.append(el("div", "muted", vi.skills.hint));
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    render();
  };
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "v" || ev.key === "V") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) {
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
    setStates(next) {
      states = { ...next };
      render();
    },
    setState(id, lv, xp) {
      states[id] = { lv, xp };
      render();
    },
    setSheet(next) {
      sheet = next;
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    refresh: render,
  };
}

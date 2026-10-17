import {
  REALMS,
  STAGES_PER_REALM,
  STAT_DEFS,
  deriveStats,
  expToNext,
  getRealm,
  type BaseStats,
  type CharacterSheet,
  type StatKey,
} from "@game/shared";
import { vi } from "./locales/vi";

export interface CharacterPanel {
  update(sheet: CharacterSheet): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Character sheet overlay (button or the C key). Points are collected locally and sent as one `allocate`
 * message on confirm, so every confirmation is a single server write. The server answers with `stats`.
 */
export function initCharacterPanel(sendAllocate: (points: Partial<BaseStats>) => void): CharacterPanel {
  const toggle = el("button", undefined, vi.character.button);
  toggle.id = "char-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "char-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);

  let sheet: CharacterSheet | null = null;
  let pending: Partial<Record<StatKey, number>> = {};

  const pendingTotal = () => Object.values(pending).reduce((a, b) => a + (b ?? 0), 0);

  function render(): void {
    panel.replaceChildren();
    if (!sheet) return;
    const s = sheet;
    const left = s.potentialPoints - pendingTotal();
    const realm = getRealm(s.realm);

    const head = el("div", "cp-head");
    head.append(el("b", undefined, s.name), el("span", undefined, `${vi.character.root}: ${vi.roots[s.spiritualRoot] ?? s.spiritualRoot}`));
    const close = el("button", "cp-close", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(close);

    const stageText = vi.character.stage(realm.nameVi, s.stage);
    const need = expToNext(s.realm, s.stage);
    const atCap = s.stage >= STAGES_PER_REALM;
    const realmLine = el("div", "cp-realm", stageText);
    const bar = el("div", "cp-bar");
    const fill = el("div", "cp-fill");
    fill.style.width = `${Math.min(100, (s.exp / need) * 100)}%`;
    bar.append(fill);
    const expLine = el("div", "cp-exp", atCap && s.realm < REALMS.length - 1 ? vi.character.atStageCap(s.exp, need) : `${vi.character.exp}: ${s.exp} / ${need}`);

    const points = el("div", "cp-points", `${vi.character.points}: ${left}`);

    const stats = el("div", "cp-stats");
    for (const def of STAT_DEFS) {
      const add = pending[def.key] ?? 0;
      const row = el("div", "cp-row");
      const value = el("span", "cp-val", String(s.base[def.key] + add));
      if (add > 0) value.classList.add("cp-changed");
      const minus = el("button", undefined, "−");
      minus.disabled = add <= 0;
      minus.onclick = () => {
        pending[def.key] = add - 1;
        render();
      };
      const plus = el("button", undefined, "+");
      plus.disabled = left <= 0;
      plus.onclick = () => {
        pending[def.key] = add + 1;
        render();
      };
      row.append(el("span", "cp-name", def.nameVi), minus, value, plus);
      stats.append(row);
    }

    const total = pendingTotal();
    const confirm = el("button", "cp-confirm", vi.character.confirm);
    confirm.disabled = total <= 0;
    confirm.onclick = () => {
      const send: Partial<BaseStats> = {};
      for (const def of STAT_DEFS) {
        const v = pending[def.key] ?? 0;
        if (v > 0) send[def.key] = v;
      }
      confirm.disabled = true;
      sendAllocate(send);
      // The server answers with `stats`, which re-renders; this only unblocks the button if the request was dropped.
      window.setTimeout(() => {
        if (confirm.isConnected) render();
      }, 1500);
    };

    const preview: BaseStats = { ...s.base };
    for (const def of STAT_DEFS) preview[def.key] += pending[def.key] ?? 0;
    const d = deriveStats(preview, s.realm, s.stage);
    const derived = el("div", "cp-derived");
    const lines: [string, string][] = [
      [vi.character.derived.maxHp, String(d.maxHp)],
      [vi.character.derived.maxMp, String(d.maxMp)],
      [vi.character.derived.attack, String(d.attack)],
      [vi.character.derived.defense, String(d.defense)],
      [vi.character.derived.critRate, `${d.critRate}%`],
      [vi.character.derived.dodgeRate, `${d.dodgeRate}%`],
      [vi.character.derived.expBonus, `+${d.expBonus}%`],
      [vi.character.derived.dropBonus, `+${d.dropBonus}%`],
    ];
    for (const [name, value] of lines) {
      const row = el("div", "cp-row");
      row.append(el("span", "cp-name", name), el("span", "cp-val", value));
      derived.append(row);
    }

    panel.append(head, realmLine, bar, expLine, points, stats, confirm, derived);
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
  };
  document.addEventListener("keydown", (ev) => {
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (!typing && (ev.key === "c" || ev.key === "C") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && sheet) {
      panel.hidden = !panel.hidden;
    }
  });

  return {
    update(next) {
      sheet = next;
      pending = {};
      toggle.hidden = false;
      render();
    },
  };
}

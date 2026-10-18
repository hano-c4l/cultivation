import {
  REALMS,
  STAGES_PER_REALM,
  breakthroughRate,
  checkBreakthroughReady,
  getBreakthrough,
  getItemDef,
  hasOverflowBonus,
  overflowExp,
  STAT_DEFS,
  clampConstitutionTier,
  constitutionTierName,
  deriveStats,
  equipmentBonus,
  passiveTotals,
  withPassives,
  expToNext,
  getConstitution,
  getRealm,
  getRootCount,
  getRootGrade,
  type BaseStats,
  type CharacterSheet,
  type EquippedItem,
  type StatKey,
} from "@game/shared";
import { getCatalog } from "./constitution-store";
import { vi } from "./locales/vi";
import { wearerOfSheet } from "./wearer";
import { registerWindow } from "./window-manager";

export interface CharacterPanel {
  update(sheet: CharacterSheet): void;
  /** The skills the character was given and their mastery: passives add to the derived stats shown. */
  setSkills(ids: readonly string[], states: Readonly<Record<string, { lv: number }>>): void;
  /** The worn gear, whose stats are part of the derived stats shown. */
  setEquipped(items: EquippedItem[]): void;
  /** The bag changed (the breakthrough pills on offer are counted from it). */
  refresh(): void;
  /** A breakthrough started: `ms` from now until it ends. */
  breakthroughStarted(ms: number, ratePct: number): void;
  /** The breakthrough ended (any way). */
  breakthroughEnded(): void;
  /** A breakthrough is running, so the player must stand still. */
  isBreaking(): boolean;
}

export interface CharacterPanelDeps {
  sendAllocate: (points: Partial<BaseStats>) => void;
  startBreakthrough: (pills: number) => void;
  cancelBreakthrough: () => void;
  /** How many of an item type the bag holds. */
  countOf: (type: string) => number;
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
export function initCharacterPanel(deps: CharacterPanelDeps): CharacterPanel {
  const sendAllocate = deps.sendAllocate;
  const toggle = el("button", undefined, vi.character.button);
  toggle.id = "char-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "char-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("character", panel, 0);

  let sheet: CharacterSheet | null = null;
  let pending: Partial<Record<StatKey, number>> = {};
  let worn: EquippedItem[] = [];
  let skillIds: readonly string[] = [];
  let skillStates: Readonly<Record<string, { lv: number }>> = {};
  /** The running breakthrough (client clock), and how many pills the player has chosen to use. */
  let running: { endsAt: number; startedAt: number; ratePct: number } | null = null;
  let chosenPills = 1;
  let tick: number | null = null;

  const pendingTotal = () => Object.values(pending).reduce((a, b) => a + (b ?? 0), 0);

  function render(): void {
    panel.replaceChildren();
    if (!sheet) return;
    const s = sheet;
    const left = s.potentialPoints - pendingTotal();
    const realm = getRealm(s.realm);

    const head = el("div", "cp-head");
    head.append(el("b", undefined, s.name), el("span", undefined, `${vi.character.root}: ${getRootCount(s.roots.length).nameVi} (${s.roots.map((r) => vi.roots[r] ?? r).join(", ")}) · ${getRootGrade(s.rootGrade).nameVi}`));
    head.title = vi.character.rootTitle(getRootCount(s.roots.length).expBonusPct + getRootGrade(s.rootGrade).expBonusPct, getRootGrade(s.rootGrade).elementDamagePct);
    const genderLine = el("div", "cp-constitution", `${vi.character.gender}: ${vi.gender[s.gender] ?? s.gender}`);
    const close = el("button", "cp-close", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(close);

    // Thể chất sits right under the spiritual root, in the same style; the tooltip carries its description.
    const catalog = getCatalog();
    const constitution = getConstitution(catalog, s.constitution);
    const tier = clampConstitutionTier(catalog, s.constitution, s.constitutionTier);
    const tierText = constitution.tiers.length > 1 ? ` · ${vi.character.constitutionTier(tier, constitution.tiers.length)}` : "";
    const constitutionLine = el("div", "cp-constitution", `${vi.character.constitution}: ${constitutionTierName(catalog, s.constitution, tier)}${tierText}`);
    constitutionLine.title = constitution.descVi;

    const stageText = vi.character.stage(realm.nameVi, s.stage);
    const need = expToNext(s.realm, s.stage);
    const atCap = s.stage >= STAGES_PER_REALM;
    const realmLine = el("div", "cp-realm", stageText);
    const bar = el("div", "cp-bar");
    const fill = el("div", "cp-fill");
    fill.style.width = `${Math.min(100, (s.exp / need) * 100)}%`;
    bar.append(fill);
    const over = overflowExp(s.realm, s.stage, s.exp);
    const overText = over > 0 ? ` · ${vi.breakthrough.overflow(Math.round((over / need) * 100))}${hasOverflowBonus(s.realm, s.stage, s.exp) ? ` (${vi.breakthrough.overflowBonus})` : ""}` : "";
    const expLine = el("div", "cp-exp", (atCap && s.realm < REALMS.length - 1 ? vi.character.atStageCap(Math.min(s.exp, need), need) : `${vi.character.exp}: ${s.exp} / ${need}`) + overText);

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
    // Gear counts as the server counts it: requirements are judged against the saved stats, not the unconfirmed clicks.
    const gear = equipmentBonus(worn, wearerOfSheet(s));
    const d = withPassives(deriveStats(preview, s.realm, s.stage, s.rootGrade, gear, s.roots.length), passiveTotals(skillIds, skillStates, s.rootGrade));
    const derived = el("div", "cp-derived");
    const lines: [string, string][] = [
      [vi.character.derived.maxHp, String(d.maxHp)],
      [vi.character.derived.maxMp, String(d.maxMp)],
      [vi.character.derived.attack, String(d.attack)],
      [vi.character.derived.defense, String(d.defense)],
      [vi.character.derived.critRate, `${d.critRate}%`],
      [vi.character.derived.dodgeRate, `${d.dodgeRate}%`],
      [vi.character.derived.expBonus, `${d.expBonus >= 0 ? "+" : ""}${d.expBonus}%`],
      [vi.character.derived.dropBonus, `+${d.dropBonus}%`],
    ];
    for (const [name, value] of lines) {
      const row = el("div", "cp-row");
      row.append(el("span", "cp-name", name), el("span", "cp-val", value));
      derived.append(row);
    }

    panel.append(head, genderLine, constitutionLine, realmLine, bar, expLine, breakthroughBox(s), points, stats, confirm, derived);
  }

  /** The breakthrough section: shown from stage 9 (or while one runs); a countdown while it goes. */
  function breakthroughBox(s: CharacterSheet): HTMLElement {
    const box = el("div", "cp-bt");
    if (!running && s.stage < STAGES_PER_REALM) return box;
    const def = getBreakthrough(s.realm);
    box.append(el("b", undefined, vi.breakthrough.title));
    if (running) {
      const info = el("div", "cp-bt-line");
      const left = Math.max(0, Math.ceil((running.endsAt - Date.now()) / 1000));
      info.textContent = vi.breakthrough.running(left, running.ratePct);
      info.dataset.bt = "left";
      const cancel = el("button", "cp-confirm", vi.breakthrough.cancel);
      cancel.onclick = () => deps.cancelBreakthrough();
      box.append(info, cancel);
      return box;
    }
    if (!def) {
      box.append(el("div", "cp-bt-line", vi.breakthrough.top));
      return box;
    }
    const ready = checkBreakthroughReady(s.realm, s.stage, s.exp);
    const pillName = getItemDef(def.pill)?.nameVi ?? def.pill;
    const have = deps.countOf(def.pill);
    chosenPills = Math.min(Math.max(chosenPills, 1), def.maxPills);
    const overflow = ready.ok ? ready.overflow : false;
    if (!ready.ok) box.append(el("div", "cp-bt-line", vi.breakthrough.needFull));
    box.append(el("div", "cp-bt-line", vi.breakthrough.pills(pillName, have)));
    const row = el("div", "cp-row");
    const minus = el("button", undefined, "−");
    minus.disabled = chosenPills <= 1;
    minus.onclick = () => {
      chosenPills -= 1;
      render();
    };
    const plus = el("button", undefined, "+");
    plus.disabled = chosenPills >= def.maxPills;
    plus.onclick = () => {
      chosenPills += 1;
      render();
    };
    row.append(el("span", "cp-name", vi.breakthrough.use), minus, el("span", "cp-val", String(chosenPills)), plus);
    box.append(
      row,
      el("div", "cp-bt-line", vi.breakthrough.rate(breakthroughRate(def, chosenPills, overflow))),
      el("div", "cp-bt-line", vi.breakthrough.cost(def.cost)),
      el("div", "cp-bt-line", vi.breakthrough.time(Math.round(def.durationMs / 1000))),
      el("div", "cp-bt-warn", vi.breakthrough.warn),
    );
    const start = el("button", "cp-confirm", vi.breakthrough.start);
    start.disabled = !ready.ok || have < chosenPills;
    start.onclick = () => {
      start.disabled = true;
      deps.startBreakthrough(chosenPills);
    };
    box.append(start);
    return box;
  }

  function stopTick(): void {
    if (tick !== null) window.clearInterval(tick);
    tick = null;
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
    setSkills(ids, states) {
      skillIds = ids;
      skillStates = states;
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    refresh() {
      if (!running) render();
    },
    breakthroughStarted(ms, ratePct) {
      const now = Date.now();
      running = { startedAt: now, endsAt: now + ms, ratePct };
      stopTick();
      // Only the countdown line changes each second; the rest of the panel keeps its state.
      tick = window.setInterval(() => {
        // The server always ends a breakthrough, but its message can be lost (a reconnect, a death in the same tick): never stay stuck.
        if (running && Date.now() > running.endsAt + 8000) {
          running = null;
          stopTick();
          render();
          return;
        }
        const line = panel.querySelector<HTMLElement>('[data-bt="left"]');
        if (!running || !line) return;
        line.textContent = vi.breakthrough.running(Math.max(0, Math.ceil((running.endsAt - Date.now()) / 1000)), running.ratePct);
      }, 500);
      render();
    },
    breakthroughEnded() {
      running = null;
      stopTick();
      render();
    },
    isBreaking() {
      return running !== null;
    },
    update(next) {
      // A kill also sends a sheet; keep the player's unconfirmed clicks unless the stats changed (an allocate
      // answer) or they no longer fit the available points.
      const statsChanged = !sheet || STAT_DEFS.some((d) => sheet!.base[d.key] !== next.base[d.key]);
      sheet = next;
      if (statsChanged || pendingTotal() > next.potentialPoints) pending = {};
      toggle.hidden = false;
      render();
    },
  };
}

import {
  STAGES_PER_REALM,
  PATHS,
  PATH_IDS,
  PATH_SUB_FACTOR,
  PATH_MIN_REALM,
  SUB_PATH_COST,
  nextPathSlot,
  pathCost,
  pathDropCost,
  pathLevelName,
  pathSwapCost,
  satKhiDamagePct,
  withPaths,
  type PathId,
  breakthroughRateParts,
  checkBreakthroughReady,
  getBreakthrough,
  getItemDef,
  expCap,
  overflowBonus,
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
import { realmClass } from "./equip-text";
import { wearerOfSheet } from "./wearer";
import { registerWindow } from "./window-manager";

export interface CharacterPanel {
  update(sheet: CharacterSheet): void;
  /** The skills the character was given and their mastery: passives add to the derived stats shown. */
  setSkills(ids: readonly string[], states: Readonly<Record<string, { lv: number }>>): void;
  /** The worn gear, whose stats are part of the derived stats shown. */
  setEquipped(items: EquippedItem[]): void;
  /** Sát khí of the character (it adds damage above 200); shown under the item-drop bonus. */
  setSatKhi(value: number): void;
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
  /** Take up a hướng tu: spends its item (and, for a phụ tu, Linh Thạch). */
  choosePath: (path: PathId) => void;
  /** Make a phụ tu the chủ tu. */
  swapPath: (path: PathId) => void;
  /** Drop a path. */
  dropPath: (path: PathId) => void;
  /** Take the item of a hướng tu (a placeholder for the NPC quest). */
  claimPath: (path: PathId) => void;
  /** GM only: take the breakthrough pill of the realm to break out of. */
  claimBreakthroughPill: () => void;
  /** The account is an admin: only then is the temporary "claim path item" button shown (the server refuses it for everyone else). */
  isAdmin: boolean;
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
  let satKhi = 0;
  let skillIds: readonly string[] = [];
  let skillStates: Readonly<Record<string, { lv: number }>> = {};
  /** The running breakthrough (client clock), and how many pills the player has chosen to use. */
  let running: { endsAt: number; startedAt: number; ratePct: number } | null = null;
  let chosenPills = 1;
  /** The hướng tu chooser: whether it is open and which path is picked in its list. */
  let pathOpen = false;
  /** The box shows the chooser (take up a path) or the manager (swap the chủ tu, drop a path). */
  let pathMode: "choose" | "manage" = "choose";
  /** A swap or drop that was clicked once and waits for the second click. */
  let pathSure: string | null = null;
  let pathSureTimer: number | undefined;
  let pathPick: PathId | null = null;
  let tick: number | null = null;

  const pendingTotal = () => Object.values(pending).reduce((a, b) => a + (b ?? 0), 0);

  function render(): void {
    panel.replaceChildren();
    if (!sheet) return;
    const s = sheet;
    const left = s.potentialPoints - pendingTotal();
    const realm = getRealm(s.realm);

    const head = el("div", "cp-head");
    head.append(el("b", undefined, s.name));
    // The spiritual root in short, on a line of its own: "Hạ phẩm linh căn · Mộc", "Thượng phẩm linh căn · Thủy Hỏa".
    const rootLine = el("div", "cp-constitution cp-root", `${getRootGrade(s.rootGrade).nameVi} · ${s.roots.map((r) => vi.roots[r] ?? r).join(" ")}`);
    rootLine.title = vi.character.rootTitle(getRootCount(s.roots.length).expBonusPct + getRootGrade(s.rootGrade).expBonusPct, getRootGrade(s.rootGrade).elementDamagePct);
    const close = el("button", "cp-close", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(close);

    // Thể chất sits right under the spiritual root, in the same style; the tooltip carries its description.
    const catalog = getCatalog();
    const constitution = getConstitution(catalog, s.constitution);
    const tier = clampConstitutionTier(catalog, s.constitution, s.constitutionTier);
    const tierText = constitution.tiers.length > 1 ? ` · ${vi.character.constitutionTier(tier, constitution.tiers.length)}` : "";
    // Gender and constitution share one line: "Nam · Phàm Thể", "Nữ · Thủy Linh Thể".
    const constitutionLine = el("div", "cp-constitution", `${vi.gender[s.gender] ?? s.gender} · ${constitutionTierName(catalog, s.constitution, tier)}${tierText}`);
    constitutionLine.title = constitution.descVi;

    const need = expToNext(s.realm, s.stage);
    // The EXP sits on the realm line: "3605/11032" while filling, "Đầy" when the bar is full, the overflow as a percentage
    // of the bar, and "Tối đa" at the most it can hold.
    const expText =
      s.stage < STAGES_PER_REALM || s.exp < need
        ? `${s.exp}/${need}`
        : s.exp === need
          ? vi.character.expFull
          : s.exp >= expCap(s.realm, s.stage)
            ? vi.character.expMax
            : `${Math.floor((s.exp / need) * 100)}%`;
    const realmLine = el("div", `cp-realm ${realmClass(s.realm)}`, `${vi.character.stage(realm.nameVi, s.stage)} · ${expText}`);
    const bar = el("div", "cp-bar");
    const fill = el("div", "cp-fill");
    fill.style.width = `${Math.min(100, (s.exp / need) * 100)}%`;
    bar.append(fill);

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
    const d = withPaths(withPassives(deriveStats(preview, s.realm, s.stage, s.rootGrade, gear, s.roots.length), passiveTotals(skillIds, skillStates, s.rootGrade)), s.paths);
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
      [vi.character.derived.satKhi, `${satKhi}${satKhiDamagePct(satKhi) > 0 ? ` (+${Math.round(satKhiDamagePct(satKhi) * 10) / 10}% sát thương)` : ""}`],
    ];
    for (const [name, value] of lines) {
      const row = el("div", "cp-row");
      row.append(el("span", "cp-name", name), el("span", "cp-val", value));
      derived.append(row);
    }

    panel.append(head, constitutionLine, rootLine, pathLine(s), pathBox(s), realmLine, bar, breakthroughBox(s), points, stats, confirm, derived);
  }

  /** "Chủ tu: Kiếm tu · Phụ tu: Đan tu, Thuật tu", or the button that opens the chooser while nothing is chosen. */
  function pathLine(s: CharacterSheet): HTMLElement {
    const row = el("div", "cp-path");
    const can = s.realm >= PATH_MIN_REALM;
    // Before Trúc Cơ there is no path line at all.
    if (!can) {
      row.hidden = true;
      return row;
    }
    if (!s.paths.main) {
      const b = el("button", "cp-path-btn", vi.paths.chooseButton);
      b.onclick = () => {
        pathOpen = !pathOpen;
        render();
      };
      row.append(b);
      return row;
    }
    const named = (p: PathId) => `${PATHS[p].nameVi} (${pathLevelName(s.paths, p)})`;
    const subs = s.paths.subs.length > 0 ? s.paths.subs.map(named).join(", ") : vi.paths.none;
    const lines = el("div", "cp-path-lines");
    lines.append(el("div", undefined, `${vi.paths.mainWord}: ${named(s.paths.main)}`), el("div", undefined, `${vi.paths.subWord}: ${subs}`));
    row.append(lines);
    if (nextPathSlot(s.paths, PATH_IDS.find((p) => p !== s.paths.main && !s.paths.subs.includes(p)) ?? "kiem") !== null) {
      const add = el("button", "cp-path-btn cp-path-add", vi.paths.addSub);
      add.onclick = () => {
        const wasChoose = pathOpen && pathMode === "choose";
        pathMode = "choose";
        pathOpen = !wasChoose;
        render();
      };
      row.append(add);
    }
    const manage = el("button", "cp-path-btn cp-path-add", vi.paths.manage);
    manage.onclick = () => {
      const wasManage = pathOpen && pathMode === "manage";
      pathMode = "manage";
      pathOpen = !wasManage;
      pathSure = null;
      render();
    };
    row.append(manage);
    return row;
  }

  /** The chooser: a list of the paths not taken yet, what the picked one needs, and the buttons to get the item and confirm. */
  function pathBox(s: CharacterSheet): HTMLElement {
    const box = el("div", "cp-bt cp-pathbox");
    const free = PATH_IDS.filter((p) => p !== s.paths.main && !s.paths.subs.includes(p));
    if (!pathOpen || (free.length === 0 && pathMode === "choose") || s.realm < PATH_MIN_REALM) {
      box.hidden = true;
      return box;
    }
    if (pathMode === "manage" && s.paths.main) {
      box.append(el("b", undefined, vi.paths.manageTitle));
      const owned: PathId[] = [s.paths.main, ...s.paths.subs];
      for (const id of owned) {
        const isMainPath = id === s.paths.main;
        const row = el("div", "cp-row");
        row.append(el("span", "cp-name", `${isMainPath ? vi.paths.mainWord : vi.paths.subWord} · ${PATHS[id].nameVi} (${pathLevelName(s.paths, id)})`));
        const confirmable = (key: string, label: string, run: () => void) => {
          const b = el("button", undefined, pathSure === key ? vi.paths.sureAgain : label);
          b.onclick = () => {
            if (pathSure !== key) {
              pathSure = key;
              window.clearTimeout(pathSureTimer);
              pathSureTimer = window.setTimeout(() => {
                pathSure = null;
                render();
              }, 4000);
              render();
              return;
            }
            pathSure = null;
            run();
          };
          return b;
        };
        if (!isMainPath) row.append(confirmable(`swap:${id}`, vi.paths.makeMain(pathSwapCost(s.paths, id)), () => deps.swapPath(id)));
        row.append(confirmable(`drop:${id}`, vi.paths.drop(pathDropCost(s.paths, id)), () => deps.dropPath(id)));
        box.append(row);
      }
      box.append(el("div", "cp-bt-warn", vi.paths.manageNote));
      return box;
    }
    const isMain = !s.paths.main;
    box.append(el("b", undefined, isMain ? vi.paths.titleMain : vi.paths.titleSub));
    if (!pathPick || !free.includes(pathPick)) pathPick = free[0] ?? null;
    const select = el("select", "cp-select");
    for (const id of free) {
      const o = el("option", undefined, PATHS[id].nameVi);
      o.value = id;
      if (id === pathPick) o.selected = true;
      select.append(o);
    }
    select.onchange = () => {
      pathPick = select.value as PathId;
      render();
    };
    const row = el("div", "cp-row");
    row.append(el("span", "cp-name", vi.paths.pick), select);
    box.append(row);
    const pick = pathPick;
    if (pick) {
      const def = PATHS[pick];
      const have = deps.countOf(def.item);
      box.append(el("div", "cp-bt-line", def.descVi));
      const gives = (Object.keys(def.bonus) as Array<keyof typeof def.bonus>).filter((k) => def.bonus[k] > 0).map((k) => vi.paths.bonusLines[k]?.(def.bonus[k] * (isMain ? 1 : PATH_SUB_FACTOR)) ?? "");
      box.append(el("div", "cp-bt-line", `${vi.paths.bonus} ${gives.join("; ")}`));
      box.append(el("div", "cp-bt-line", vi.paths.need(def.itemNameVi, have)));
      if (have === 0 && !deps.isAdmin) box.append(el("div", "cp-bt-line", vi.paths.whereToGet));
      const cost = pathCost(s.paths);
      if (cost > 0) box.append(el("div", "cp-bt-line", vi.paths.cost(cost)));
      box.append(el("div", "cp-bt-warn", `${isMain ? vi.paths.mainNote : vi.paths.subNote} ${vi.paths.final}`));
      const claim = el("button", "cp-confirm", vi.paths.claim);
      claim.onclick = () => deps.claimPath(pick);
      const confirm = el("button", "cp-confirm", vi.paths.confirm);
      confirm.onclick = () => deps.choosePath(pick);
      box.append(...(deps.isAdmin ? [claim] : []), confirm);
    }
    return box;
  }

  /** The breakthrough section: shown from stage 9 (or while one runs); a countdown while it goes. */
  function breakthroughBox(s: CharacterSheet): HTMLElement {
    const box = el("div", "cp-bt");
    // Only a full bar at stage 9 can break through (or one that is already running).
    if (!running && (s.stage < STAGES_PER_REALM || s.exp < expToNext(s.realm, s.stage))) return box;
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
    const bonus = ready.ok ? ready.overflowBonus : 0;
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
      rateLine(breakthroughRateParts(def, chosenPills, bonus)),
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
    if (deps.isAdmin) {
      const gm = el("button", "cp-confirm", vi.breakthrough.claim);
      gm.onclick = () => deps.claimBreakthroughPill();
      box.append(gm);
    }
    // Say why the button is off instead of leaving it grey.
    if (!ready.ok) box.append(el("div", "cp-bt-warn", vi.breakthrough.notReady));
    else if (have < chosenPills) box.append(el("div", "cp-bt-warn", vi.breakthrough.needPills(pillName, chosenPills, have)));
    return box;
  }

  /** "Tỉ lệ thành công: 70% + 20% + 15%": the base as is, what the pills add in gold, what the overflow adds in red; a part that adds nothing is left out. */
  function rateLine(p: { base: number; pills: number; overflow: number }): HTMLElement {
    const line = el("div", "cp-bt-line", `${vi.breakthrough.rateLabel}${p.base}%`);
    const part = (n: number, cls: string) => {
      line.append(" + ", el("span", cls, `${n}%`));
    };
    if (p.pills > 0) part(p.pills, "cp-rate-pills");
    if (p.overflow > 0) part(p.overflow, "cp-rate-over");
    return line;
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
    setSatKhi(value) {
      if (value === satKhi) return;
      satKhi = value;
      if (!running) render();
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
      // A path was taken: the chooser closes (it opens again from the line for the next phụ tu).
      if (sheet && JSON.stringify(sheet.paths) !== JSON.stringify(next.paths)) {
        pathOpen = false;
        pathSure = null;
      }
      sheet = next;
      if (statsChanged || pendingTotal() > next.potentialPoints) pending = {};
      toggle.hidden = false;
      render();
    },
  };
}

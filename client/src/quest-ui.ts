import {
  REALMS,
  getItemDef,
  objectiveTarget,
  questStatus,
  type BagItem,
  type CharacterSheet,
  type ClientMessage,
  type QuestDef,
  type QuestObjective,
  type QuestProgressView,
  type QuestRewards,
} from "@game/shared";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface QuestUi {
  /** Opens the window of the quest giver `npc` (the server answers with its quests). */
  open(npc: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  /** The quests of a giver and the character's progress on every quest. */
  setQuests(npc: string, defs: QuestDef[], states: Record<string, QuestProgressView>): void;
  /** The quests the character is on (for the tracker). */
  setActive(defs: QuestDef[], states: Record<string, QuestProgressView>): void;
  progress(quest: string, progress: number): void;
  /** The bag changed: "collect" objectives may have become possible. */
  refresh(): void;
  notify(text: string): void;
  isOpen(): boolean;
  /** The title of a quest seen so far. */
  titleOf(quest: string): string | undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;

/** The objective in words, e.g. "Hạ 10 quái ở Hắc Mộc Lâm". */
export function objectiveText(o: QuestObjective): string {
  switch (o.kind) {
    case "talk":
      return vi.quests.objective.talk(vi.npcs[o.npc] ?? o.npc);
    case "kill":
      return vi.quests.objective.kill(o.count, o.map ? (vi.maps[o.map] ?? o.map) : null, o.rare === true);
    case "collect":
      return vi.quests.objective.collect(o.qty, nameOf(o.item));
    case "reach":
      return vi.quests.objective.reach(REALMS[o.realm]?.nameVi ?? "", o.stage);
  }
}

/** The reward in words: "50 Linh Thạch, 100 tu vi, Hồi Huyết Đan × 3". */
export function rewardText(r: QuestRewards): string {
  const parts: string[] = [];
  if (r.linhThach) parts.push(vi.quests.rewardLinh(r.linhThach));
  if (r.exp) parts.push(vi.quests.rewardExp(r.exp));
  for (const it of r.items ?? []) parts.push(`${nameOf(it.item)} × ${it.qty}`);
  return parts.length > 0 ? parts.join(", ") : vi.quests.noReward;
}

/**
 * Quest window (opened by clicking the quest NPC) and the tracker line under the vitals. The window lists the giver's
 * quests as locked, available, active (with progress and a hand-in button once the objective is met) or done. The server
 * decides everything; the readiness shown here only mirrors the objective so the button is not offered too early.
 */
export function initQuests(send: (msg: ClientMessage) => void, getBag: () => BagItem[]): QuestUi {
  const panel = el("div");
  panel.id = "quest-panel";
  panel.hidden = true;
  const tracker = el("div");
  tracker.id = "quest-tracker";
  tracker.hidden = true;
  document.body.append(panel, tracker);
  registerWindow("quests", panel, 4);

  let npc = "";
  let sheet: CharacterSheet | null = null;
  let defs: QuestDef[] = [];
  let states: Record<string, QuestProgressView> = {};
  let active: QuestDef[] = [];
  let flash = "";
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const have = (type: string) => getBag().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);

  /** Progress and target of an objective as shown ("3/10"), and whether it is met. */
  function measure(def: QuestDef): { text: string; ready: boolean } {
    const o = def.objective;
    const mine = states[def.id];
    if (o.kind === "kill") return { text: `${Math.min(mine?.progress ?? 0, o.count)}/${o.count}`, ready: (mine?.progress ?? 0) >= o.count };
    if (o.kind === "talk") return { text: (mine?.progress ?? 0) >= 1 ? vi.quests.talked : vi.quests.notTalked, ready: (mine?.progress ?? 0) >= 1 };
    if (o.kind === "collect") return { text: `${Math.min(have(o.item), o.qty)}/${o.qty}`, ready: have(o.item) >= o.qty };
    const atLeast = !!sheet && (sheet.realm > o.realm || (sheet.realm === o.realm && sheet.stage >= o.stage));
    return { text: sheet ? `${REALMS[sheet.realm]?.nameVi ?? ""} ${sheet.stage}` : "", ready: atLeast };
  }

  function renderTracker(): void {
    tracker.replaceChildren();
    const list = active.filter((d) => states[d.id]?.state === "active");
    tracker.hidden = list.length === 0;
    for (const def of list) {
      const m = measure(def);
      const line = el("div", m.ready ? "qt-line ready" : "qt-line");
      line.append(el("b", undefined, def.titleVi), el("span", undefined, ` ${objectiveText(def.objective)}: ${m.text}${m.ready ? " ✓" : ""}`));
      tracker.append(line);
    }
  }

  function render(): void {
    renderTracker();
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(el("b", undefined, vi.npcs[npc] ?? vi.quests.title), close);
    panel.append(head);
    if (flash) panel.append(el("div", "shop-flash", flash));
    const sorted = [...defs].sort((a, b) => a.chain.localeCompare(b.chain) || a.seq - b.seq);
    const todo = sorted.filter((d) => questStatus(d, states) !== "done");
    const done = sorted.filter((d) => questStatus(d, states) === "done");
    if (todo.length === 0 && done.length === 0) panel.append(el("div", "muted", vi.quests.none));
    for (const def of todo) {
      const status = questStatus(def, states);
      const card = el("div", `quest-card ${status}`);
      card.append(el("div", "quest-title", def.titleVi), el("div", "muted", def.descVi), el("div", "quest-line", `${vi.quests.goal} ${objectiveText(def.objective)}`));
      card.append(el("div", "quest-line", `${vi.quests.reward} ${rewardText(def.rewards)}`));
      if (status === "locked") {
        const need = defs.find((d) => d.id === def.requires);
        card.append(el("div", "muted", vi.quests.locked(need?.titleVi ?? "")));
      } else if (status === "available") {
        const take = el("button", "eq-small", vi.quests.accept);
        take.onclick = () => send({ t: "quest_accept", npc, quest: def.id });
        card.append(take);
      } else {
        const m = measure(def);
        card.append(el("div", "quest-line", `${vi.quests.progress} ${m.text}`));
        const turn = el("button", "eq-small", vi.quests.turnIn);
        turn.disabled = !m.ready;
        turn.onclick = () => send({ t: "quest_turn_in", npc, quest: def.id });
        card.append(turn);
      }
      panel.append(card);
    }
    if (done.length > 0) panel.append(el("div", "muted", vi.quests.doneList(done.map((d) => d.titleVi).join(", "))));
  }

  const ui: QuestUi = {
    open(id) {
      npc = id;
      flash = "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet(s) {
      sheet = s;
      render();
    },
    setQuests(id, d, s) {
      if (id !== npc) return;
      defs = d;
      states = s;
      render();
    },
    setActive(d, s) {
      active = d;
      states = { ...states, ...s };
      render();
    },
    progress(quest, progress) {
      const mine = states[quest];
      if (mine) mine.progress = progress;
      render();
    },
    refresh: render,
    notify(text) {
      flash = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash = "";
        render();
      }, 5000);
      render();
    },
    isOpen: () => !panel.hidden,
    titleOf: (quest) => defs.find((d) => d.id === quest)?.titleVi ?? active.find((d) => d.id === quest)?.titleVi,
  };
  return ui;
}

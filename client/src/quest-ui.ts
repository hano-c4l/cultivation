import {
  REALMS,
  collectItems,
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
import { mapLabel, vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface QuestUi {
  /** Opens the window of the quest giver `npc` (the server answers with its quests). */
  open(npc: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  /** The quests of a giver and the character's progress on every quest. */
  setQuests(npc: string, defs: QuestDef[], states: Record<string, QuestProgressView>, need?: number): void;
  /** Every quest the character has taken (active and done) with its progress: the quest window and the tracker. */
  setActive(defs: QuestDef[], states: Record<string, QuestProgressView>): void;
  progress(quest: string, progress: number): void;
  /** The bag changed: "collect" objectives may have become possible. */
  refresh(): void;
  notify(text: string): void;
  /** The NPC refuses this player: the window shows only the reason. */
  ban(text: string): void;
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

const MAX_TRACKED = 3;
const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;

/** The objective in words, e.g. "Hạ 10 quái ở Hắc Mộc Lâm". */
export function objectiveText(o: QuestObjective): string {
  switch (o.kind) {
    case "talk":
      return vi.quests.objective.talk(vi.npcs[o.npc] ?? o.npc);
    case "kill":
      return vi.quests.objective.kill(o.count, o.map ? mapLabel(o.map) : null, o.rare === true);
    case "collect":
      return vi.quests.objective.collect(collectItems(o).map((c) => `${c.qty} ${nameOf(c.item)}`).join(", "));
    case "reach":
      return vi.quests.objective.reach(REALMS[o.realm]?.nameVi ?? "", o.stage);
  }
}

/** The reward in words: "50 Linh Thạch, 100 tu vi, Hồi Huyết Đan × 3". */
export function rewardText(r: QuestRewards): string {
  const parts: string[] = [];
  if (r.linhThach) parts.push(vi.quests.rewardLinh(r.linhThach));
  if (r.congHien) parts.push(vi.quests.rewardCong(r.congHien));
  if (r.exp) parts.push(vi.quests.rewardExp(r.exp));
  for (const it of r.items ?? []) parts.push(`${nameOf(it.item)} × ${it.qty}`);
  return parts.length > 0 ? parts.join(", ") : vi.quests.noReward;
}

/**
 * Quest window (opened by clicking the quest NPC) and the tracker line under the vitals. The window lists the giver's
 * quests as locked, available, active (with progress and a hand-in button once the objective is met) or done. The server
 * decides everything; the readiness shown here only mirrors the objective so the button is not offered too early.
 */
export function initQuests(send: (msg: ClientMessage) => void, getBag: () => BagItem[], onReady: (title: string) => void = () => undefined): QuestUi {
  const panel = el("div");
  panel.id = "quest-panel";
  panel.hidden = true;
  const tracker = el("div");
  tracker.id = "quest-tracker";
  tracker.hidden = true;
  // The character's own quest window (button under the bag button): two tabs, "Đang làm" and "Đã xong".
  const toggle = el("button", undefined, vi.quests.button);
  toggle.id = "quest-btn";
  toggle.hidden = true;
  const log = el("div");
  log.id = "quest-log";
  log.hidden = true;
  // The tracker lives under the buffs in the left column (inside #vitals-wrap), so it never overlaps the HP/MP box, the PK row or the buffs.
  document.getElementById("vitals-wrap")!.append(tracker);
  document.body.append(panel, toggle, log);
  registerWindow("quest-log", log, 4);
  registerWindow("quests", panel, 5);

  let npc = "";
  let sheet: CharacterSheet | null = null;
  let defs: QuestDef[] = [];
  /** The window was just opened and the NPC has not answered yet (so the quests of the previous NPC are not shown). */
  let loading = false;
  /** The realm the NPC says is needed before it offers anything (a hướng tu master below Trúc Cơ). */
  let needRealm: number | undefined;
  let states: Record<string, QuestProgressView> = {};
  let active: QuestDef[] = [];
  let flash = "";
  let banned = "";
  let logTab: "doing" | "done" = "doing";
  /** Quests shown under the vitals (at most MAX_TRACKED), by id; kept in this browser. */
  let tracked: string[] = [];
  let trackedLoaded = false;
  let seen = new Set<string>();
  /** Quests already announced as ready to hand in (so each is said once); `armed` is false until the first list arrives, which is only the join. */
  let announced = new Set<string>();
  let armed = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const have = (type: string) => getBag().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);

  /** Progress and target of an objective as shown ("3/10"), and whether it is met. */
  function measure(def: QuestDef): { text: string; ready: boolean } {
    const o = def.objective;
    const mine = states[def.id];
    if (o.kind === "kill") return { text: `${Math.min(mine?.progress ?? 0, o.count)}/${o.count}`, ready: (mine?.progress ?? 0) >= o.count };
    if (o.kind === "talk") return { text: (mine?.progress ?? 0) >= 1 ? vi.quests.talked : vi.quests.notTalked, ready: (mine?.progress ?? 0) >= 1 };
    if (o.kind === "collect") {
      const parts = collectItems(o);
      return { text: parts.map((c) => `${Math.min(have(c.item), c.qty)}/${c.qty}`).join(" · "), ready: parts.every((c) => have(c.item) >= c.qty) };
    }
    const atLeast = !!sheet && (sheet.realm > o.realm || (sheet.realm === o.realm && sheet.stage >= o.stage));
    return { text: sheet ? `${REALMS[sheet.realm]?.nameVi ?? ""} ${sheet.stage}` : "", ready: atLeast };
  }

  const storageKey = () => `cultivation.quest-tracked.${sheet?.id ?? ""}`; // per character, in this browser
  function loadTracked(): string[] | null {
    try {
      const raw = localStorage.getItem(storageKey());
      const list = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, MAX_TRACKED) : null;
    } catch {
      return null;
    }
  }
  function saveTracked(): void {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(tracked));
    } catch {
      // storage unavailable: the choice just lasts until the page is reloaded
    }
  }
  const activeDefs = () => active.filter((d) => states[d.id]?.state === "active").sort((a, b) => (states[a.id]?.at ?? 0) - (states[b.id]?.at ?? 0));

  /** Keeps the tracked list to active quests; a quest taken since the last time is tracked while there is room. */
  function syncTracked(): void {
    const act = activeDefs().map((d) => d.id);
    if (!trackedLoaded) {
      trackedLoaded = true;
      tracked = loadTracked() ?? act.slice(0, MAX_TRACKED);
      seen = new Set(act);
    }
    tracked = tracked.filter((id) => act.includes(id));
    for (const id of act) {
      if (!seen.has(id) && tracked.length < MAX_TRACKED) tracked.push(id);
      seen.add(id);
    }
    for (const id of [...seen]) if (!act.includes(id)) seen.delete(id);
    saveTracked();
  }

  /** Says once, when an active quest becomes ready to hand in; a quest that stops being ready (or is gone) can be announced again later. */
  function checkReady(): void {
    const now = new Set<string>();
    for (const def of activeDefs()) if (measure(def).ready) now.add(def.id);
    if (armed) for (const def of activeDefs()) if (now.has(def.id) && !announced.has(def.id)) onReady(def.titleVi);
    announced = now;
  }

  function giveUp(def: QuestDef): void {
    if (window.confirm(vi.quests.abandonSure(def.titleVi))) send({ t: "quest_abandon", quest: def.id });
  }

  function trackButton(def: QuestDef): HTMLButtonElement {
    const on = tracked.includes(def.id);
    const b = el("button", "eq-small", on ? vi.quests.untrack : vi.quests.track);
    b.disabled = !on && tracked.length >= MAX_TRACKED;
    b.title = b.disabled ? vi.quests.trackFull(MAX_TRACKED) : "";
    b.onclick = () => {
      tracked = on ? tracked.filter((id) => id !== def.id) : [...tracked, def.id].slice(0, MAX_TRACKED);
      saveTracked();
      render();
    };
    return b;
  }

  /** "Trưởng Lão · Gặp Thương nhân": the giver in front of the title (the quest window lists quests of every NPC), sorted by that name. */
  const fullTitle = (d: QuestDef) => `${vi.npcs[d.giver] ?? d.giver} · ${d.titleVi}${d.repeat ? ` ${vi.quests.daily}` : ""}`;
  const byName = (a: QuestDef, b: QuestDef) => fullTitle(a).localeCompare(fullTitle(b), "vi");

  function renderLog(): void {
    log.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => {
      log.hidden = true;
    };
    head.append(el("b", undefined, vi.quests.title), close);
    const tabs = el("div", "quest-tabs");
    for (const [key, label] of [["doing", vi.quests.tabDoing], ["done", vi.quests.tabDone]] as const) {
      const t = el("button", key === logTab ? "on" : "", label);
      t.onclick = () => {
        logTab = key;
        renderLog();
      };
      tabs.append(t);
    }
    log.append(head, tabs);
    if (flash) log.append(el("div", "shop-flash", flash));
    if (logTab === "doing") {
      const list = activeDefs().sort(byName);
      if (list.length === 0) log.append(el("div", "muted", vi.quests.noneDoing));
      for (const def of list) {
        const m = measure(def);
        const card = el("div", "quest-card active");
        card.append(el("div", "quest-title", fullTitle(def)), el("div", "muted", def.descVi), el("div", "quest-line", `${vi.quests.goal} ${objectiveText(def.objective)}`));
        card.append(el("div", "quest-line", `${vi.quests.progress} ${m.text}${m.ready ? " ✓" : ""}`), el("div", "quest-line", `${vi.quests.reward} ${rewardText(def.rewards)}`));
        card.append(el("div", "muted", vi.quests.turnInAt(vi.npcs[def.giver] ?? def.giver)));
        const row = el("div", "quest-actions");
        const drop = el("button", "eq-small", vi.quests.abandon);
        drop.onclick = () => giveUp(def);
        row.append(trackButton(def), drop);
        card.append(row);
        log.append(card);
      }
    } else {
      const list = active.filter((d) => states[d.id]?.state === "done").sort(byName);
      if (list.length === 0) log.append(el("div", "muted", vi.quests.noneDone));
      for (const def of list) {
        const card = el("div", "quest-card done");
        card.append(el("div", "quest-title", fullTitle(def)), el("div", "quest-line", `${vi.quests.reward} ${rewardText(def.rewards)}`));
        log.append(card);
      }
    }
  }

  function renderTracker(): void {
    tracker.replaceChildren();
    const list = activeDefs().filter((d) => tracked.includes(d.id));
    tracker.hidden = list.length === 0;
    for (const def of list) {
      const m = measure(def);
      const line = el("div", m.ready ? "qt-line ready" : "qt-line");
      const text = el("div", "qt-text");
      text.append(el("b", undefined, def.titleVi), el("span", undefined, ` ${objectiveText(def.objective)}: ${m.text}${m.ready ? " ✓" : ""}`));
      const x = el("button", "qt-x", "×");
      x.title = vi.quests.abandon;
      x.onclick = () => giveUp(def);
      line.append(text, x);
      tracker.append(line);
    }
  }

  function render(): void {
    renderTracker();
    if (!log.hidden) renderLog();
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(el("b", undefined, vi.npcs[npc] ?? vi.quests.title), close);
    panel.append(head);
    if (banned) {
      panel.append(el("div", "shop-flash", banned));
      return;
    }
    if (flash) panel.append(el("div", "shop-flash", flash));
    // The server sends only what can be taken or is being done, the ones already taken first in the order they were taken.
    if (loading) panel.append(el("div", "muted", vi.quests.loading));
    else if (defs.length === 0) panel.append(el("div", "muted", needRealm !== undefined ? vi.quests.needPathRealm(REALMS[needRealm]?.nameVi ?? "") : vi.quests.none));
    for (const def of defs) {
      const status = questStatus(def, states);
      const card = el("div", `quest-card ${status}`);
      card.append(el("div", "quest-title", def.repeat ? `${def.titleVi} ${vi.quests.daily}` : def.titleVi), el("div", "muted", def.descVi), el("div", "quest-line", `${vi.quests.goal} ${objectiveText(def.objective)}`));
      card.append(el("div", "quest-line", `${vi.quests.reward} ${rewardText(def.rewards)}`));
      if (status === "locked") {
        const need = defs.find((d) => d.id === def.requires);
        card.append(el("div", "muted", vi.quests.locked(need?.titleVi ?? "")));
      } else if (status === "available") {
        const take = el("button", "eq-small", vi.quests.accept);
        take.onclick = () => send({ t: "quest_accept", npc, quest: def.id });
        // Below the realm the quest asks for: say so and do not offer the button (the server refuses it anyway).
        const tooLow = def.minRealm !== undefined && !!sheet && sheet.realm < def.minRealm;
        if (tooLow) {
          take.disabled = true;
          card.append(el("div", "muted", vi.quests.needRealm(REALMS[def.minRealm ?? 0]?.nameVi ?? "")));
        }
        card.append(take);
      } else {
        const m = measure(def);
        card.append(el("div", "quest-line", `${vi.quests.progress} ${m.text}`));
        const turn = el("button", "eq-small", vi.quests.turnIn);
        turn.disabled = !m.ready;
        turn.onclick = () => send({ t: "quest_turn_in", npc, quest: def.id });
        const drop = el("button", "eq-small", vi.quests.abandon);
        drop.onclick = () => giveUp(def);
        const row = el("div", "quest-actions");
        row.append(turn, drop);
        card.append(row);
      }
      panel.append(card);
    }
  }

  const toggleLog = () => {
    log.hidden = !log.hidden;
    if (!log.hidden) renderLog();
  };
  toggle.onclick = toggleLog;
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "l" || ev.key === "L") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) toggleLog();
  });
  const ui: QuestUi = {
    open(id) {
      npc = id;
      defs = [];
      loading = true;
      needRealm = undefined;
      flash = "";
      banned = "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet(s) {
      sheet = s;
      checkReady();
      render();
    },
    setQuests(id, d, s, need) {
      if (id !== npc) return;
      loading = false;
      needRealm = need;
      defs = d;
      states = s;
      syncTracked();
      render();
    },
    setActive(d, s) {
      active = d;
      states = s;
      toggle.hidden = false;
      syncTracked();
      checkReady();
      armed = true;
      render();
    },
    progress(quest, progress) {
      const mine = states[quest];
      if (mine) mine.progress = progress;
      checkReady();
      render();
    },
    refresh() {
      checkReady();
      render();
    },
    ban(text) {
      banned = text;
      loading = false;
      render();
    },
    notify(text) {
      flash = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash = "";
        render();
      }, 5000);
      render();
    },
    isOpen: () => !panel.hidden || !log.hidden,
    titleOf: (quest) => defs.find((d) => d.id === quest)?.titleVi ?? active.find((d) => d.id === quest)?.titleVi,
  };
  return ui;
}

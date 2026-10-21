import { LEADERBOARDS, REALMS, type ClientMessage, type Leaderboard } from "@game/shared";
import { api } from "./api";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface RankUi {
  /** Shows the button (once the character is in the game). */
  show(selfName: string): void;
  /** What the GM buttons depend on: this map has monsters (so a boss can exist) and a boss stands in this room now. */
  setContext(combatMap: boolean, bossHere: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The ranking window: the top characters by realm, stage and EXP, read from the server when opened (the server caches it for a minute). */
export function initRank(send: (msg: ClientMessage) => void, isAdmin: boolean): RankUi {
  const toggle = el("button", undefined, vi.rank.button);
  toggle.id = "rank-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "rank-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("rank", panel, 6);
  let selfName = "";
  let board: Leaderboard = "realm";

  let combatMap = false;
  let bossHere = false;
  let lastBody: HTMLElement | string = "";

  function draw(body: HTMLElement | string): void {
    lastBody = body;
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", undefined, "×");
    close.onclick = () => (panel.hidden = true);
    const refresh = el("button", undefined, vi.rank.refresh);
    refresh.onclick = () => void load();
    head.append(el("b", undefined, vi.rank.title));
    // GM only (the server refuses both for everyone else), and only on a map with monsters: call the map's boss into this channel, or take it away
    // when the players cannot kill it. Order: GM button, reload, close.
    if (isAdmin && combatMap) {
      const gm = el("button", undefined, bossHere ? vi.rank.gmRemove : vi.rank.gmSummon);
      gm.onclick = () => {
        send({ t: bossHere ? "boss_remove" : "boss_summon" });
        gm.disabled = true; // the room answers with the boss appearing or going, which redraws this
        setTimeout(() => draw(lastBody), 3000);
      };
      head.append(gm);
    }
    head.append(refresh, close);
    const tabs = el("div", "eq-tabs");
    for (const id of LEADERBOARDS) {
      const b = el("button", id === board ? "active" : "sub", vi.rank.tabs[id]);
      b.onclick = () => {
        board = id;
        void load();
      };
      tabs.append(b);
    }
    panel.append(head, tabs, typeof body === "string" ? el("div", "muted", body) : body);
  }

  async function load(): Promise<void> {
    draw(vi.rank.loading);
    const asked = board;
    const r = await api.leaderboard(asked);
    if (asked !== board) return; // another tab was picked meanwhile
    if (!r.ok || !r.data) return draw(vi.rank.failed);
    if (r.data.rows.length === 0) return draw(vi.rank.empty);
    const table = el("table");
    const header = el("tr");
    for (const [text, cls] of [["#", "n"], [vi.rank.name, ""], [vi.rank.realm, ""], [vi.rank.valueHeader[board] ?? "", "n"]] as const) header.append(el("th", cls, text));
    table.append(header);
    r.data.rows.forEach((row, i) => {
      const tr = el("tr", row.name === selfName ? "me" : undefined);
      tr.append(el("td", "n", String(i + 1)), el("td", undefined, row.name), el("td", undefined, `${REALMS[row.realm]?.nameVi ?? ""} ${row.stage}`), el("td", "n", row.value.toLocaleString("vi-VN")));
      table.append(tr);
    });
    draw(table);
    panel.append(el("div", "muted", `${vi.rank.notes[board] ?? ""} ${vi.rank.updated}`));
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) void load();
  };
  return {
    setContext(combat, boss) {
      if (combat === combatMap && boss === bossHere) return;
      combatMap = combat;
      bossHere = boss;
      if (!panel.hidden) draw(lastBody);
    },
    show(name) {
      selfName = name;
      toggle.hidden = false;
    },
  };
}

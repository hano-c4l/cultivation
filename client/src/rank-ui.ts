import { REALMS, type ClientMessage } from "@game/shared";
import { api } from "./api";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface RankUi {
  /** Shows the button (once the character is in the game). */
  show(selfName: string): void;
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

  function draw(body: HTMLElement | string): void {
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", undefined, "×");
    close.onclick = () => (panel.hidden = true);
    const refresh = el("button", undefined, vi.rank.refresh);
    refresh.onclick = () => void load();
    head.append(el("b", undefined, vi.rank.title), refresh, close);
    if (isAdmin) {
      // GM only (the server refuses it for everyone else): call the map's boss into the channel you stand in.
      const gm = el("button", undefined, vi.rank.gmSummon);
      gm.onclick = () => {
        send({ t: "boss_summon" });
        gm.textContent = vi.rank.gmSummoned;
      };
      head.append(gm);
    }
    panel.append(head, typeof body === "string" ? el("div", "muted", body) : body);
  }

  async function load(): Promise<void> {
    draw(vi.rank.loading);
    const r = await api.leaderboard();
    if (!r.ok || !r.data) return draw(vi.rank.failed);
    if (r.data.rows.length === 0) return draw(vi.rank.empty);
    const table = el("table");
    const header = el("tr");
    for (const [text, cls] of [["#", "n"], [vi.rank.name, ""], [vi.rank.realm, ""], [vi.rank.exp, "n"]] as const) header.append(el("th", cls, text));
    table.append(header);
    r.data.rows.forEach((row, i) => {
      const tr = el("tr", row.name === selfName ? "me" : undefined);
      tr.append(el("td", "n", String(i + 1)), el("td", undefined, row.name), el("td", undefined, `${REALMS[row.realm]?.nameVi ?? ""} ${row.stage}`), el("td", "n", row.exp.toLocaleString("vi-VN")));
      table.append(tr);
    });
    draw(table);
    panel.append(el("div", "muted", vi.rank.note));
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) void load();
  };
  return {
    show(name) {
      selfName = name;
      toggle.hidden = false;
    },
  };
}

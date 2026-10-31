import { REALMS, SECT_RANK, SECT_ROLE_NAMES, getItemDef, roleOfRank, tuning, type ClientMessage, type SectError, type SectListItem, type SectRole, type SectView } from "@game/shared";
import { iconButton, iconFor } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface SectUi {
  /** Shows the button (once the character is in the game). */
  show(): void;
  /** The player stands by a sect NPC (its id) or walked away from it (null): founding a sect needs one. */
  setNpc(npc: string | null): void;
  open(): void;
  /** The server's answer to `sect_get`. */
  onSect(view: SectView | null, cooldownUntil: number): void;
  onDir(sects: SectListItem[]): void;
  onError(reason: SectError): void;
  /** Someone invites this player. */
  invited(from: string, name: string, sect: string, ttlMs: number): void;
  /** The player is in a sect and may invite (the menu of a player offers it). */
  canInvite(): boolean;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");
const realmOf = (lv: number): string => `${REALMS[Math.floor(lv / 10)]?.nameVi ?? "?"} ${lv % 10}`;

/**
 * The sect window: the sect the player is in (members with what they may do to each, applications, notice, leaving or closing it), or, with none, the list of sects
 * to apply to and the form to found one (at a sect NPC). It only sends what the player wants; the server decides.
 */
export function initSect(send: (msg: ClientMessage) => void, notify: (text: string, ok: boolean) => void, linhThach: () => number, selfId: () => string): SectUi {
  const toggle = el("button");
  iconButton(toggle, "merit", vi.sect.button);
  toggle.id = "sect-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "sect-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("sect", panel, 5);

  const prompt = el("div");
  prompt.id = "sect-prompt";
  prompt.hidden = true;
  document.body.append(prompt);
  let promptTimer: ReturnType<typeof setTimeout> | null = null;
  const closePrompt = () => {
    prompt.hidden = true;
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = null;
  };

  let view: SectView | null = null;
  let cooldownUntil = 0;
  let dir: SectListItem[] = [];
  let loaded = false;
  let npc: string | null = null;
  let tab: "members" | "requests" | "shop" | "weekly" = "members";
  let donateDraft = "";
  let weeklyDraft: number[] | null = null;
  let nameDraft = "";
  let noticeDraft: string | null = null;
  /** The button that asks twice (leave, close, kick): which one is waiting for its second press. */
  let sure: string | null = null;
  let sureTimer: ReturnType<typeof setTimeout> | null = null;
  const ask = (key: string): boolean => {
    if (sure === key) {
      sure = null;
      return true;
    }
    sure = key;
    if (sureTimer) clearTimeout(sureTimer);
    sureTimer = setTimeout(() => {
      sure = null;
      render();
    }, 3000);
    render();
    return false;
  };
  const sureText = (key: string, text: string) => (sure === key ? vi.sect.sure : text);

  const cfg = () => tuning().sect;

  const rankName = (rank: number) => SECT_ROLE_NAMES[roleOfRank(rank)];

  function head(title: string): HTMLElement {
    const h = el("div", "eq-head");
    const close = el("button", undefined, "×");
    close.onclick = () => (panel.hidden = true);
    const refresh = el("button", undefined, vi.sect.refresh);
    refresh.onclick = () => load();
    h.append(el("b", undefined, title), refresh, close);
    return h;
  }

  function renderNoSect(): void {
    panel.append(head(vi.sect.title));
    const wait = cooldownUntil - Date.now();
    if (wait > 0) panel.append(el("div", "tr-note", vi.sect.cooldown(Math.ceil(wait / 3_600_000))));
    // Found one.
    const c = cfg();
    const found = el("div", "sect-box");
    found.append(el("div", "muted", vi.sect.foundHint(c.createFee, REALMS[c.createRealm]?.nameVi ?? "")));
    const row = el("div", "sect-row");
    const input = el("input");
    input.type = "text";
    input.maxLength = c.nameMax;
    input.placeholder = vi.sect.namePlaceholder;
    input.value = nameDraft;
    input.oninput = () => (nameDraft = input.value);
    const go = el("button", undefined, vi.sect.found);
    go.disabled = wait > 0;
    go.onclick = () => {
      if (!npc) return notify(vi.sect.errors.npc ?? "", false);
      send({ t: "sect_create", npc, name: nameDraft });
    };
    row.append(input, go);
    found.append(row);
    if (linhThach() < c.createFee) found.append(el("div", "muted", vi.sect.poor(fmt(linhThach()))));
    panel.append(found);
    // The sects to apply to.
    panel.append(el("div", "tr-h", vi.sect.directory));
    if (!loaded) panel.append(el("div", "muted", vi.sect.loading));
    else if (dir.length === 0) panel.append(el("div", "muted", vi.sect.noneYet));
    for (const s of dir) {
      const r = el("div", "sect-item");
      const info = el("div", "sect-info");
      info.append(el("b", undefined, s.name), el("span", "muted", ` · ${vi.sect.level(s.level)} · ${s.members}/${s.maxMembers} · ${vi.sect.leaderIs(s.leader)}`));
      if (s.notice) info.append(el("div", "muted", s.notice));
      const b = el("button", undefined, s.applied ? vi.sect.withdraw : vi.sect.apply);
      b.disabled = wait > 0 && !s.applied;
      b.onclick = () => send({ t: "sect_apply", sect: s.id, on: !s.applied });
      r.append(info, b);
      panel.append(r);
    }
  }

  function renderSect(v: SectView): void {
    const c = cfg();
    const h = head(v.name);
    panel.append(h);
    panel.append(el("div", "muted", `${vi.sect.level(v.level)} · ${vi.sect.members(v.members.length, v.maxMembers)} · ${vi.sect.yourRank(rankName(v.myRank))} · ${vi.sect.contribution(fmt(v.contribution))}`));
    // The fund, the exp and the next level.
    const money = el("div", "sect-box");
    money.append(el("div", undefined, vi.sect.fundLine(fmt(v.fund), fmt(v.exp), v.expNeed > 0 ? fmt(v.expNeed) : null)));
    if (v.expNeed > 0 && v.myRank >= c.upgradeRank) {
      const up = el("button", undefined, vi.sect.upgrade(v.level + 1, fmt(v.expNeed), fmt(v.costLinh)));
      up.disabled = v.exp < v.expNeed || v.fund < v.costLinh;
      up.onclick = () => send({ t: "sect_upgrade" });
      money.append(up);
    } else if (v.expNeed === 0) money.append(el("div", "muted", vi.sect.topLevel));
    const give = el("div", "sect-row");
    const amount = el("input");
    amount.type = "number";
    amount.min = String(c.donate.min);
    amount.placeholder = vi.sect.donatePlaceholder(c.donate.min);
    amount.value = donateDraft;
    amount.oninput = () => (donateDraft = amount.value);
    const giveBtn = el("button", undefined, vi.sect.donate);
    giveBtn.onclick = () => {
      const n = Math.floor(Number(amount.value));
      if (!Number.isFinite(n) || n < c.donate.min) return notify(vi.sect.errors.invalid ?? "", false);
      donateDraft = "";
      send({ t: "sect_donate", amount: n });
    };
    give.append(amount, giveBtn);
    money.append(give, el("div", "muted", vi.sect.donateRule(c.donate.linhPerPoint, c.donate.linhPerExp)));
    if (v.weeklyPay > 0) {
      const claim = el("button", undefined, v.weeklyClaimed ? vi.sect.weeklyDone : vi.sect.weeklyClaim(fmt(v.weeklyPay)));
      claim.disabled = v.weeklyClaimed;
      claim.onclick = () => send({ t: "sect_weekly" });
      money.append(claim);
    }
    panel.append(money);
    // The notice.
    const canNotice = v.myRank >= c.perms.notice;
    const notice = el("div", "sect-box");
    if (canNotice) {
      const row = el("div", "sect-row");
      const input = el("input");
      input.type = "text";
      input.maxLength = c.noticeMax;
      input.placeholder = vi.sect.noticePlaceholder;
      input.value = noticeDraft ?? v.notice;
      input.oninput = () => (noticeDraft = input.value);
      const save = el("button", undefined, vi.sect.save);
      save.onclick = () => {
        send({ t: "sect_notice", text: input.value });
        noticeDraft = null;
      };
      row.append(input, save);
      notice.append(row);
    } else notice.append(el("div", undefined, v.notice || vi.sect.noNotice));
    panel.append(notice);

    // Tabs.
    const tabs = el("div", "eq-tabs");
    const canApprove = v.myRank >= c.perms.approve;
    const mk = (id: typeof tab, label: string) => {
      const b = el("button", id === tab ? "active" : "sub", label);
      b.onclick = () => {
        tab = id;
        render();
      };
      tabs.append(b);
    };
    mk("members", vi.sect.tabMembers(v.members.length));
    if (canApprove) mk("requests", vi.sect.tabRequests(v.requests.length));
    mk("shop", vi.sect.tabShop);
    if (v.myRank >= c.perms.appoint) mk("weekly", vi.sect.tabWeekly);
    panel.append(tabs);
    if (tab === "shop") {
      panel.append(el("div", "muted", vi.sect.shopHint));
      for (const s of c.shop) {
        const def = getItemDef(s.item);
        if (!def) continue;
        const row = el("div", "sect-item");
        const info = el("div", "sect-info");
        info.append(iconFor(s.item), document.createTextNode(` ${def.nameVi}${s.qty > 1 ? ` x${s.qty}` : ""} · `), el("b", undefined, vi.sect.cost(fmt(s.cost))));
        if (s.minLevel > v.level || s.minRank > v.myRank) info.append(el("div", "muted", vi.sect.needs(s.minLevel, rankName(s.minRank))));
        const buy = el("button", undefined, vi.sect.buy);
        buy.disabled = s.minLevel > v.level || s.minRank > v.myRank || v.contribution < s.cost;
        buy.onclick = () => {
          if (!npc) return notify(vi.sect.errors.npc ?? "", false);
          send({ t: "sect_buy", npc, item: s.item });
        };
        row.append(info, buy);
        panel.append(row);
      }
      if (c.shop.length === 0) panel.append(el("div", "muted", vi.sect.noShop));
    } else if (tab === "weekly" && v.myRank >= c.perms.appoint) {
      panel.append(el("div", "muted", vi.sect.weeklyHint));
      const draft = weeklyDraft ?? v.weekly;
      const inputs: HTMLInputElement[] = [];
      c.weeklyMax.forEach((cap, rank) => {
        const row = el("div", "sect-item");
        row.append(el("div", "sect-info", `${rankName(rank)} (${vi.sect.upTo(fmt(cap))})`));
        const input = el("input");
        input.type = "number";
        input.min = "0";
        input.max = String(cap);
        input.value = String(draft[rank] ?? 0);
        input.oninput = () => (weeklyDraft = inputs.map((x) => Math.min(Math.max(0, Math.floor(Number(x.value)) || 0), c.weeklyMax[inputs.indexOf(x)] ?? 0)));
        inputs.push(input);
        row.append(input);
        panel.append(row);
      });
      const save = el("button", undefined, vi.sect.save);
      save.onclick = () => {
        send({ t: "sect_weekly_set", amounts: inputs.map((x, i) => Math.min(Math.max(0, Math.floor(Number(x.value)) || 0), c.weeklyMax[i] ?? 0)) });
        weeklyDraft = null;
      };
      panel.append(save);
    } else if (tab === "requests" && canApprove) {
      if (v.requests.length === 0) panel.append(el("div", "muted", vi.sect.noRequests));
      for (const r of v.requests) {
        const row = el("div", "sect-item");
        row.append(el("div", "sect-info", `${r.name} · ${realmOf(r.lv)}`));
        const yes = el("button", undefined, vi.sect.accept);
        yes.onclick = () => send({ t: "sect_answer", id: r.id, ok: true });
        const no = el("button", "tr-cancel", vi.sect.refuse);
        no.onclick = () => send({ t: "sect_answer", id: r.id, ok: false });
        row.append(yes, no);
        panel.append(row);
      }
    } else {
      for (const m of v.members) {
        const row = el("div", "sect-item");
        const info = el("div", "sect-info");
        info.append(el("span", m.online ? "dot on" : "dot", "●"), document.createTextNode(" "), el("b", undefined, m.name), el("span", "muted", ` · ${rankName(m.rank)} · ${realmOf(m.lv)}`));
        row.append(info);
        if (m.id !== selfId()) {
          if (v.myRank >= c.perms.appoint && m.rank < v.myRank) {
            const pick = el("select");
            for (const r of ["disciple", "elder", "deputy"] as const satisfies readonly SectRole[]) {
              const o = el("option", undefined, SECT_ROLE_NAMES[r]);
              o.value = r;
              if (SECT_RANK[r] === m.rank) o.selected = true;
              pick.append(o);
            }
            // a rank earned by contribution (nội môn, tinh anh) is shown as it is; choosing a role is what changes it
            if (![0, 3, 4].includes(m.rank)) {
              const o = el("option", undefined, rankName(m.rank));
              o.value = "";
              o.selected = true;
              pick.prepend(o);
            }
            pick.onchange = () => pick.value && send({ t: "sect_role", id: m.id, role: pick.value as SectRole });
            row.append(pick);
          }
          if (v.myRank >= SECT_RANK.leader) {
            const to = el("button", undefined, sureText(`t:${m.id}`, vi.sect.transfer));
            to.onclick = () => ask(`t:${m.id}`) && send({ t: "sect_transfer", id: m.id });
            row.append(to);
          }
          if (v.myRank >= c.perms.kick && v.myRank > m.rank) {
            const kick = el("button", "tr-cancel", sureText(`k:${m.id}`, vi.sect.kick));
            kick.onclick = () => ask(`k:${m.id}`) && send({ t: "sect_kick", id: m.id });
            row.append(kick);
          }
        }
        panel.append(row);
      }
    }

    const bar = el("div", "tr-bar");
    if (v.myRank < SECT_RANK.leader) {
      const leave = el("button", "tr-cancel", sureText("leave", vi.sect.leave));
      leave.onclick = () => ask("leave") && send({ t: "sect_leave" });
      bar.append(leave);
    } else {
      const disband = el("button", "tr-cancel", sureText("disband", vi.sect.disband));
      disband.onclick = () => ask("disband") && send({ t: "sect_disband" });
      bar.append(disband);
    }
    panel.append(bar, el("div", "muted", vi.sect.leaveRule(c.rejoinHours)));
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    if (view) renderSect(view);
    else renderNoSect();
  }

  function load(): void {
    send({ t: "sect_get" }); // a player with no sect gets the list of sects with it
  }

  toggle.onclick = () => ui.open();
  const ui: SectUi = {
    show() {
      toggle.hidden = false;
      send({ t: "sect_get" }); // the window and the menu of a player need to know whether this player is in a sect
    },
    setNpc(id) {
      npc = id;
    },
    open() {
      panel.hidden = false;
      render();
      load();
    },
    onSect(v, until) {
      view = v;
      cooldownUntil = until;
      render();
    },
    onDir(sects) {
      dir = sects;
      loaded = true;
      render();
    },
    onError(reason) {
      notify(vi.sect.errors[reason] ?? vi.sect.errors.busy ?? "", false);
    },
    invited(from, name, sect, ttlMs) {
      closePrompt();
      prompt.replaceChildren(el("div", undefined, vi.sect.invitedBy(name, sect)));
      const row = el("div", "tr-bar");
      for (const [label, accept] of [[vi.sect.accept, true], [vi.sect.decline, false]] as const) {
        const b = el("button", undefined, label);
        b.onclick = () => {
          closePrompt();
          send({ t: "sect_reply", from, accept });
        };
        row.append(b);
      }
      prompt.append(row);
      prompt.hidden = false;
      promptTimer = setTimeout(closePrompt, ttlMs);
    },
    canInvite: () => view !== null && view.myRank >= cfg().perms.invite,
    isOpen: () => !panel.hidden,
  };
  return ui;
}

import { REALMS, SECT_RANK, SECT_ROLE_NAMES, VAULT_CATEGORIES, getItemDef, roleOfRank, tuning, vaultPoints, type BagItem, type ClientMessage, type SectError, type SectListItem, type SectRankItem, type SectRole, type SectVaultItemView, type SectView } from "@game/shared";
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
  /** The warehouse list the server sent. */
  onVault(items: SectVaultItemView[]): void;
  onRanks(sects: SectRankItem[], mine: number | null): void;
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
export function initSect(send: (msg: ClientMessage) => void, notify: (text: string, ok: boolean) => void, linhThach: () => number, selfId: () => string, bag: () => BagItem[]): SectUi {
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
  let tab: "members" | "requests" | "shop" | "weekly" | "vault" | "tasks" | "rank" = "members";
  let ranks: { sects: SectRankItem[]; mine: number | null } | null = null;
  let vaultItems: SectVaultItemView[] | null = null;
  let putId = "";
  let putQty = 1;
  let disbanding = false;
  const priceDraft = new Map<string, string>();
  let acceptDraft: { cats: Record<string, number>; minGrade: number } | null = null;
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
      const costItems = (c.levels[v.level - 1]?.costItems ?? []).map((x) => `${x.qty} ${getItemDef(x.item)?.nameVi ?? x.item}`).join(", ");
      const up = el("button", undefined, vi.sect.upgrade(v.level + 1, fmt(v.expNeed), fmt(v.costLinh)) + (costItems ? vi.sect.upgradeItems(costItems) : ""));
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
        if (id === "vault" || id === "shop") send({ t: "sect_vault" });
        if (id === "rank") send({ t: "sect_rank" });
        render();
      };
      tabs.append(b);
    };
    mk("members", vi.sect.tabMembers(v.members.length));
    if (canApprove) mk("requests", vi.sect.tabRequests(v.requests.length));
    mk("shop", vi.sect.tabShop);
    mk("vault", vi.sect.tabVault(v.vaultCount, v.vaultSlots));
    mk("tasks", vi.sect.tabTasks);
    mk("rank", vi.sect.tabRank);
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
      // What the leader put on the shelf from the warehouse.
      const shelved = (vaultItems ?? []).filter((x) => x.shelf);
      if (shelved.length > 0) panel.append(el("div", "tr-h", vi.sect.shelf));
      for (const x of shelved) {
        const row = el("div", "sect-item");
        const info = el("div", "sect-info");
        info.append(iconFor(x.type), document.createTextNode(` ${getItemDef(x.type)?.nameVi ?? x.type}${x.qty > 1 ? ` x${x.qty}` : ""} · `), el("b", undefined, x.shelf!.currency === "cong_hien" ? vi.sect.cost(fmt(x.shelf!.price)) : vi.sect.costLinh(fmt(x.shelf!.price))));
        const buy = el("button", undefined, vi.sect.buy);
        buy.disabled = x.shelf!.currency === "cong_hien" ? v.contribution < x.shelf!.price : linhThach() < x.shelf!.price;
        buy.onclick = () => {
          if (!npc) return notify(vi.sect.errors.npc ?? "", false);
          send({ t: "sect_shelf_buy", npc, id: x.id });
        };
        row.append(info, buy);
        panel.append(row);
      }
    } else if (tab === "vault") {
      renderVault(v);
    } else if (tab === "tasks") {
      panel.append(el("div", "muted", vi.sect.tasksHint));
      const held = (type: string) => bag().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);
      for (const t of c.tasks) {
        const done = v.taskDone[t.id] ?? 0;
        const def = getItemDef(t.item);
        const row = el("div", "sect-item");
        const info = el("div", "sect-info");
        const vaultText = t.reward.vault ? `${getItemDef(t.reward.vault.item)?.nameVi ?? t.reward.vault.item} x${t.reward.vault.qty}` : null;
        info.append(el("b", undefined, t.name), el("div", "muted", vi.sect.taskNeed(def?.nameVi ?? t.item, t.qty, held(t.item))), el("div", "muted", vi.sect.taskReward(t.reward.contribution, t.reward.exp, fmt(t.reward.fundLinh), fmt(t.reward.memberLinh), vaultText)));
        const go = el("button", undefined, vi.sect.taskGo(done, t.perDay));
        go.disabled = done >= t.perDay || v.level < t.minLevel || held(t.item) < t.qty;
        go.onclick = () => {
          if (!npc) return notify(vi.sect.errors.npc ?? "", false);
          send({ t: "sect_task", npc, id: t.id });
        };
        row.append(info, go);
        panel.append(row);
      }
    } else if (tab === "rank") {
      if (!ranks) panel.append(el("div", "muted", vi.sect.loading));
      else {
        if (ranks.mine !== null) panel.append(el("div", "tr-note", vi.sect.yourPlace(ranks.mine)));
        ranks.sects.forEach((s, i) => {
          const row = el("div", "sect-item");
          const info = el("div", "sect-info");
          info.append(el("b", undefined, `${i + 1}. ${s.name}`), el("span", "muted", ` · ${vi.sect.level(s.level)} · ${vi.sect.memberCount(s.members)} · ${vi.sect.leaderIs(s.leader)} · ${vi.sect.expShort(fmt(s.exp))}`));
          row.append(info);
          panel.append(row);
        });
      }
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
    if (disbanding && v.myRank >= SECT_RANK.leader) {
      panel.append(el("div", "tr-note", vi.sect.disbandAsk));
      for (const [mode, label] of [["leader", vi.sect.disbandLeader], ["share", vi.sect.disbandShare]] as const) {
        const b = el("button", "tr-cancel", sureText(`d:${mode}`, label));
        b.onclick = () => {
          if (!ask(`d:${mode}`)) return;
          disbanding = false;
          send({ t: "sect_disband", mode });
        };
        bar.append(b);
      }
      const back = el("button", undefined, vi.sect.cancel);
      back.onclick = () => {
        disbanding = false;
        render();
      };
      bar.append(back);
    } else if (v.myRank < SECT_RANK.leader) {
      const leave = el("button", "tr-cancel", sureText("leave", vi.sect.leave));
      leave.onclick = () => ask("leave") && send({ t: "sect_leave" });
      bar.append(leave);
    } else {
      const disband = el("button", "tr-cancel", vi.sect.disband);
      disband.onclick = () => {
        disbanding = true;
        render();
      };
      bar.append(disband);
    }
    panel.append(bar, el("div", "muted", vi.sect.leaveRule(c.rejoinHours)));
  }

  /** The Kho tab: put a bag item in, see the warehouse, and (the leader) take stacks out, put them on the shelf and set what it takes. */
  function renderVault(v: SectView): void {
    const c = cfg();
    const leader = v.myRank >= SECT_RANK.leader;
    panel.append(el("div", "muted", vi.sect.vaultHint(v.vaultCount, v.vaultSlots, fmt(v.vaultToday))));
    // Put in.
    const mine = bag().filter((i) => !getItemDef(i.type)?.disabled);
    const accept = v.accept;
    const put = el("div", "sect-box");
    const row = el("div", "sect-row");
    const pick = el("select");
    pick.append(Object.assign(el("option", undefined, vi.sect.pickItem), { value: "" }));
    for (const i of mine) {
      const def = getItemDef(i.type);
      const worth = vaultPoints(c, accept, def, i.qty);
      const o = el("option", undefined, `${def?.nameVi ?? i.type}${i.qty > 1 ? ` x${i.qty}` : ""}${worth > 0 ? ` (~${worth})` : ` (${vi.sect.notTaken})`}`);
      o.value = i.id;
      if (i.id === putId) o.selected = true;
      pick.append(o);
    }
    const qty = el("input");
    qty.type = "number";
    qty.min = "1";
    const chosen = mine.find((i) => i.id === putId);
    qty.value = String(Math.min(Math.max(1, putQty), chosen?.qty ?? 1));
    qty.max = String(chosen?.qty ?? 1);
    qty.readOnly = !chosen || chosen.qty <= 1;
    pick.onchange = () => {
      putId = pick.value;
      putQty = mine.find((i) => i.id === putId)?.qty ?? 1;
      render();
    };
    qty.oninput = () => (putQty = Math.floor(Number(qty.value)) || 1);
    const go = el("button", undefined, vi.sect.putIn);
    go.disabled = !chosen;
    go.onclick = () => {
      if (!chosen) return;
      send({ t: "sect_put", id: chosen.id, qty: chosen.qty <= 1 ? 1 : Math.min(Math.max(1, Math.floor(Number(qty.value)) || 1), chosen.qty) });
      putId = "";
    };
    row.append(pick, qty, go);
    put.append(row);
    panel.append(put);
    // What it takes (the leader sets it).
    if (leader) {
      const draft = acceptDraft ?? { cats: { ...accept.cats }, minGrade: accept.minGrade };
      const box = el("div", "sect-box");
      box.append(el("div", "tr-h", vi.sect.acceptTitle), el("div", "muted", vi.sect.acceptHint(c.vault.catMax)));
      const inputs: Array<[string, HTMLInputElement]> = [];
      for (const cat of VAULT_CATEGORIES) {
        const r = el("div", "sect-row");
        const input = el("input");
        input.type = "number";
        input.min = "0";
        input.max = String(c.vault.catMax);
        input.value = String(draft.cats[cat] ?? 0);
        input.oninput = () => (acceptDraft = readAccept());
        inputs.push([cat, input]);
        r.append(el("span", "sect-info", `${vi.sect.categories[cat] ?? cat} (%)`), input);
        box.append(r);
      }
      const grade = el("input");
      grade.type = "number";
      grade.min = "1";
      grade.max = "9";
      grade.value = String(draft.minGrade);
      grade.oninput = () => (acceptDraft = readAccept());
      const readAccept = () => ({ cats: Object.fromEntries(inputs.map(([k, i]) => [k, Math.min(Math.max(0, Math.floor(Number(i.value)) || 0), c.vault.catMax)])), minGrade: Math.min(Math.max(1, Math.floor(Number(grade.value)) || 1), 9) });
      const gr = el("div", "sect-row");
      gr.append(el("span", "sect-info", vi.sect.minGrade), grade);
      const save = el("button", undefined, vi.sect.save);
      save.onclick = () => {
        const a = readAccept();
        acceptDraft = null;
        send({ t: "sect_accept", cats: a.cats, minGrade: a.minGrade });
      };
      box.append(gr, save);
      panel.append(box);
    }
    // The warehouse.
    panel.append(el("div", "tr-h", vi.sect.vaultTitle));
    if (vaultItems === null) panel.append(el("div", "muted", vi.sect.loading));
    else if (vaultItems.length === 0) panel.append(el("div", "muted", vi.sect.vaultEmpty));
    for (const x of vaultItems ?? []) {
      const r = el("div", "sect-item");
      const info = el("div", "sect-info");
      info.append(iconFor(x.type), document.createTextNode(` ${getItemDef(x.type)?.nameVi ?? x.type}${x.qty > 1 ? ` x${x.qty}` : ""}`), el("span", "muted", ` · ${vi.sect.by(x.by)}`));
      if (x.shelf) info.append(el("div", "muted", vi.sect.onShelf(x.shelf.currency === "cong_hien" ? vi.sect.cost(fmt(x.shelf.price)) : vi.sect.costLinh(fmt(x.shelf.price)))));
      r.append(info);
      if (leader) {
        const to = el("select");
        for (const m of v.members) {
          const o = el("option", undefined, m.name);
          o.value = m.id;
          if (m.id === selfId()) o.selected = true;
          to.append(o);
        }
        const take = el("button", undefined, vi.sect.take);
        take.onclick = () => send({ t: "sect_take", id: x.id, to: to.value });
        r.append(to, take);
        const price = el("input");
        price.type = "number";
        price.min = "1";
        price.placeholder = vi.sect.price;
        price.value = priceDraft.get(x.id) ?? (x.shelf ? String(x.shelf.price) : "");
        price.oninput = () => priceDraft.set(x.id, price.value);
        const cur = el("select");
        for (const [k, label] of [["linh_thach", vi.sect.curLinh], ["cong_hien", vi.sect.curCong]] as const) {
          const o = el("option", undefined, label);
          o.value = k;
          if (x.shelf?.currency === k) o.selected = true;
          cur.append(o);
        }
        const shelf = el("button", undefined, vi.sect.toShelf);
        shelf.onclick = () => {
          const n = Math.floor(Number(price.value));
          if (!Number.isFinite(n) || n < 1) return notify(vi.sect.errors.invalid ?? "", false);
          send({ t: "sect_shelf", id: x.id, currency: cur.value as "linh_thach" | "cong_hien", price: n });
        };
        r.append(price, cur, shelf);
        if (x.shelf) {
          const off = el("button", "tr-cancel", vi.sect.offShelf);
          off.onclick = () => send({ t: "sect_shelf", id: x.id, currency: null, price: 0 });
          r.append(off);
        }
      }
      panel.append(r);
    }
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
    onRanks(sects, mine) {
      ranks = { sects, mine };
      render();
    },
    onVault(items) {
      vaultItems = items;
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

import { getItemDef, listingFee, marketMaxPrice, marketTax, suggestedBid, type BagItem, type ClientMessage, type MarketCfg, type MarketCurrency, type MarketError, type MarketKind, type MarketListingView } from "@game/shared";
import { equipLines, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { iconFor } from "./icons";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface MarketUi {
  /** Opens Vạn Bảo Lâu `npc` (the server answers with the listings of this town). */
  open(npc: string): void;
  close(): void;
  setListings(npc: string, listings: MarketListingView[], cfg: MarketCfg, now: number, open: boolean): void;
  /** The market of `town` changed somewhere (another player bought, bid or posted): an open window asks for the list again (`town` absent: any town). */
  invalidate(): void;
  /** The Linh Thạch and Tiên Ngọc the character holds. */
  setBalance(linhThach: number, tienNgoc: number): void;
  /** The bag changed: the list of things that can be put up may have too. */
  refresh(): void;
  done(op: "post" | "buy" | "bid" | "cancel" | "promote"): void;
  fail(reason: MarketError): void;
  isOpen(): boolean;
}

type Tab = "fixed" | "auction" | "post" | "mine";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

/** "2 giờ 5 phút", "35 phút", "< 1 phút" for a time left in ms. */
function leftText(ms: number): string {
  if (ms <= 0) return vi.market.ending;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "< 1 phút";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  return `${mins} phút`;
}

/**
 * Vạn Bảo Lâu's window (the market): the fixed-price and auction listings of this town, putting an item up, and your own listings. It only sends
 * the wish; the server prices it, takes the money and hands the goods over by mail in one batch.
 */
export function initMarket(send: (msg: ClientMessage) => void, bag: () => BagItem[]): MarketUi {
  const panel = el("div");
  panel.id = "market-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("market", panel, 5);

  let npc = "";
  let tab: Tab = "fixed";
  let listings: MarketListingView[] = [];
  let cfg: MarketCfg | null = null;
  let open = false;
  /** Server time minus the browser's at the last answer, so the countdowns follow the server clock. */
  let skew = 0;
  let balance = 0;
  let tienNgoc = 0;
  /** What the character holds of the currency a listing is priced in. */
  const held = (c: MarketCurrency) => (c === "tien_ngoc" ? tienNgoc : balance);
  const unitOf = (c: MarketCurrency) => (c === "tien_ngoc" ? vi.market.unitTienNgoc : vi.market.unitLinh);
  let loaded = false;
  let note: { text: string; ok: boolean } | null = null;
  /** The bag item chosen to put up, and the form values. */
  let picked: { tab: number; cell: number } | null = null;
  let form: { kind: MarketKind; currency: MarketCurrency; qty: number; price: number } = { kind: "fixed", currency: "linh_thach", qty: 1, price: 1000 };
  /** What the player typed in a bid box, by listing: kept while the list refreshes under them, dropped when the top bid moves past it. */
  const typedBid = new Map<string, { value: number; over: number }>();
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAsk = 0;

  /** Asks the server for the list again (at most about once a second; the server limits it too). */
  const ask = () => {
    if (panel.hidden || !npc) return;
    const wait = 900 - (Date.now() - lastAsk);
    if (wait > 0) {
      if (!refreshTimer) refreshTimer = setTimeout(() => ((refreshTimer = null), ask()), wait);
      return;
    }
    lastAsk = Date.now();
    send({ t: "market_list", npc });
  };
  // A fallback for a missed push, and it keeps the countdowns honest.
  setInterval(() => {
    if (!panel.hidden && document.visibilityState === "visible") ask();
  }, 15_000);

  const nowServer = () => Date.now() + skew;

  const itemName = (type: string, qty: number) => `${getItemDef(type)?.nameVi ?? type}${qty > 1 ? ` x${qty}` : ""}`;

  const itemBlock = (type: string, qty: number, carry: Record<string, unknown>): HTMLElement => {
    const node = el("div", "mk-item");
    const name = el("div", "mk-name", itemName(type, qty));
    name.prepend(iconFor(type));
    const tag = itemTierTag(type, carry.lv as number | undefined);
    if (tag) name.prepend(el("span", `eq-tier ${realmClass(itemTierRealm(type, carry.lv as number | undefined))}`, tag));
    const def = getItemDef(type);
    const lines = def?.category === "equipment" ? equipLines(type, carry.dur as number | undefined, carry.max as number | undefined, carry.lv as number | undefined, carry.rs as never, carry.en as number | undefined).join(" · ") : (def?.descVi ?? "");
    node.append(name, el("div", "muted", lines));
    return node;
  };

  const button = (text: string, onClick: () => void, disabled = false, title = ""): HTMLButtonElement => {
    const b = el("button", "", text);
    b.disabled = disabled;
    if (title) b.title = title;
    b.onclick = onClick;
    return b;
  };

  const renderBrowse = (kind: MarketKind) => {
    const list = listings.filter((l) => l.kind === kind && (kind === "auction" || !l.mine));
    if (kind === "auction") panel.append(el("div", open ? "mk-open" : "mk-shut", open ? vi.market.roundOpen(cfg ? `${cfg.openHour}h-${cfg.closeHour}h` : "") : vi.market.roundShut(cfg ? `${cfg.openHour}h` : "")));
    if (list.length === 0) panel.append(el("div", "muted", vi.market.none));
    for (const l of list) {
      const row = el("div", "mk-row");
      const info = itemBlock(l.type, l.qty, l.carry);
      info.append(el("div", "muted", l.mine ? vi.market.mineTag : vi.market.seller(l.sellerName)));
      const side = el("div", "mk-side");
      if (kind === "fixed") {
        side.append(el("div", "mk-price", vi.market.price(fmt(l.price), unitOf(l.currency))), el("div", "muted", vi.market.left(leftText(l.endsAt - nowServer()))));
        side.append(button(vi.market.buy, () => send({ t: "market_buy", npc, id: l.id }), held(l.currency) < l.price, held(l.currency) < l.price ? vi.market.poor : ""));
      } else {
        side.append(
          el("div", "mk-price", l.topBid > 0 ? vi.market.topBid(fmt(l.topBid), l.topIsMe, unitOf(l.currency)) : vi.market.startPrice(fmt(l.price), unitOf(l.currency))),
          el("div", "muted", vi.market.left(leftText(l.endsAt - nowServer()))),
        );
        const amount = el("input");
        amount.type = "number";
        amount.min = String(l.nextBid);
        // The box starts a notch above the top bid (the bidder can still type another amount); a typed amount stays until someone outbids it.
        const typed = typedBid.get(l.id);
        const keep = typed && typed.over === l.topBid && typed.value >= l.nextBid;
        amount.value = String(keep ? typed.value : cfg ? suggestedBid(cfg, l.price, l.topBid, l.currency) : l.nextBid);
        amount.className = "mk-amount";
        amount.oninput = () => typedBid.set(l.id, { value: Math.floor(Number(amount.value)) || 0, over: l.topBid });
        const bid = button(vi.market.bid, () => send({ t: "market_bid", npc, id: l.id, amount: Math.floor(Number(amount.value)) }), !open || l.topIsMe, !open ? vi.market.errors.closed : l.topIsMe ? vi.market.errors.top : "");
        side.append(amount, bid);
      }
      row.append(info, side);
      panel.append(row);
    }
  };

  const renderPost = () => {
    panel.append(el("div", "muted", vi.market.postHint));
    const items = bag().filter((i) => !getItemDef(i.type)?.disabled);
    if (items.length === 0) panel.append(el("div", "muted", vi.market.bagEmpty));
    const grid = el("div", "mk-bag");
    for (const i of items) {
      const cell = el("button", `mk-cell${picked && picked.tab === i.tab && picked.cell === i.cell ? " on" : ""}`);
      cell.title = itemName(i.type, i.qty);
      cell.append(iconFor(i.type));
      if (i.qty > 1) cell.append(el("span", "mk-qty", String(i.qty)));
      cell.onclick = () => {
        picked = { tab: i.tab, cell: i.cell };
        form = { ...form, qty: i.qty };
        render();
      };
      grid.append(cell);
    }
    panel.append(grid);
    const item = picked ? bag().find((i) => i.tab === picked!.tab && i.cell === picked!.cell) : undefined;
    if (!item || !cfg) return;
    const box = el("div", "mk-form");
    box.append(itemBlock(item.type, item.qty, { ...item }));
    const kindRow = el("div", "mk-kinds");
    for (const k of ["fixed", "auction"] as const) {
      const b = button(k === "fixed" ? vi.market.kindFixed : vi.market.kindAuction, () => {
        form = { ...form, kind: k };
        render();
      });
      if (form.kind === k) b.classList.add("on");
      kindRow.append(b);
    }
    // The currency the price is in: a buyer or a bidder pays in the same one.
    const moneyRow = el("div", "mk-kinds");
    for (const c of ["linh_thach", "tien_ngoc"] as const) {
      const b = button(unitOf(c), () => {
        form = { ...form, currency: c, price: Math.min(form.price, marketMaxPrice(cfg!, c)) };
        render();
      });
      if (form.currency === c) b.classList.add("on");
      moneyRow.append(b);
    }
    box.append(kindRow, moneyRow);
    const qty = el("input");
    qty.type = "number";
    qty.min = "1";
    qty.max = String(item.qty);
    qty.value = String(Math.min(form.qty, item.qty));
    qty.disabled = item.qty === 1;
    qty.oninput = () => (form = { ...form, qty: Math.min(item.qty, Math.max(1, Math.floor(Number(qty.value)) || 1)) });
    const price = el("input");
    price.type = "number";
    price.min = "1";
    price.max = String(marketMaxPrice(cfg, form.currency));
    price.value = String(form.price);
    const preview = el("div", "muted");
    const update = () => {
      const p = Math.min(marketMaxPrice(cfg!, form.currency), Math.max(1, Math.floor(Number(price.value)) || 1));
      form = { ...form, price: p };
      preview.textContent = vi.market.feePreview(fmt(listingFee(cfg!, p, form.currency)), cfg!.taxPct, fmt(p - marketTax(cfg!, p)), unitOf(form.currency));
    };
    price.oninput = update;
    update();
    const fields = el("div", "mk-fields");
    const qtyLabel = el("label", "", vi.market.qty);
    qtyLabel.append(qty);
    const priceLabel = el("label", "", form.kind === "fixed" ? vi.market.priceLabel : vi.market.startLabel);
    priceLabel.append(price);
    fields.append(qtyLabel, priceLabel);
    const fee = listingFee(cfg, form.price, form.currency);
    box.append(
      fields,
      preview,
      button(vi.market.post, () => send({ t: "market_post", npc, kind: form.kind, currency: form.currency, tab: item.tab, cell: item.cell, qty: Math.min(form.qty, item.qty), price: form.price }), held(form.currency) < fee, held(form.currency) < fee ? vi.market.poor : ""),
    );
    panel.append(box);
  };

  const renderMine = () => {
    const list = listings.filter((l) => l.mine);
    if (list.length === 0) panel.append(el("div", "muted", vi.market.noneMine));
    for (const l of list) {
      const row = el("div", "mk-row");
      const info = itemBlock(l.type, l.qty, l.carry);
      info.append(el("div", "muted", `${l.kind === "fixed" ? vi.market.kindFixed : vi.market.kindAuction} · ${vi.market.left(leftText(l.endsAt - nowServer()))}`));
      const side = el("div", "mk-side");
      side.append(el("div", "mk-price", l.kind === "fixed" ? vi.market.price(fmt(l.price), unitOf(l.currency)) : l.topBid > 0 ? vi.market.topBid(fmt(l.topBid), false, unitOf(l.currency)) : vi.market.startPrice(fmt(l.price), unitOf(l.currency))));
      // An auction cannot be taken back once its round is open (or a bid is in); a listing at night can, until the opening hour.
      const canCancel = l.kind === "fixed" || (l.topBid === 0 && !open);
      side.append(button(vi.market.cancel, () => send({ t: "market_cancel", npc, id: l.id }), !canCancel, canCancel ? "" : vi.market.cancelLocked));
      const grade = getItemDef(l.type)?.grade ?? 0;
      const promoteOk = !!cfg && grade >= cfg.promote.minGrade;
      side.append(button(vi.market.promote, () => send({ t: "market_promote", npc, id: l.id }), !promoteOk || (cfg ? balance < cfg.promote.fee : true), promoteOk && cfg ? vi.market.promoteHint(fmt(cfg.promote.fee)) : vi.market.errors.grade));
      row.append(info, side);
      panel.append(row);
    }
  };

  const render = () => {
    panel.replaceChildren();
    const head = el("div", "eq-head");
    const close = el("button", "", "×");
    close.onclick = () => (panel.hidden = true);
    head.append(el("b", "", vi.market.title), close);
    panel.append(head);
    const tabs = el("div", "mk-tabs");
    for (const [id, label] of [["fixed", vi.market.tabFixed], ["auction", vi.market.tabAuction], ["post", vi.market.tabPost], ["mine", vi.market.tabMine]] as const) {
      const b = el("button", id === tab ? "on" : "", label);
      b.onclick = () => {
        tab = id;
        note = null;
        render();
        ask(); // the list may have moved on while another tab was showing
      };
      tabs.append(b);
    }
    panel.append(tabs);
    if (note) panel.append(el("div", note.ok ? "mk-okmsg" : "mk-err", note.text));
    if (!loaded) panel.append(el("div", "muted", vi.market.loading));
    else if (tab === "post") renderPost();
    else if (tab === "mine") renderMine();
    else renderBrowse(tab);
    panel.append(el("div", "muted", vi.market.balance(fmt(balance), fmt(tienNgoc))));
  };

  return {
    open(id) {
      npc = id;
      listings = [];
      loaded = false;
      note = null;
      picked = null;
      panel.hidden = false;
      render();
      send({ t: "npc_open", npc: id, view: "market" });
    },
    close() {
      panel.hidden = true;
    },
    setListings(id, list, config, now, isOpen) {
      if (id !== npc) return;
      listings = list;
      cfg = config;
      open = isOpen;
      skew = now - Date.now();
      loaded = true;
      if (!form.price) form.price = 1000;
      if (picked && !bag().some((i) => i.tab === picked!.tab && i.cell === picked!.cell)) picked = null;
      if (tab !== "post") render(); // the post form is left alone while it is being filled in: it does not show the list
    },
    setBalance(linh, tn) {
      balance = linh;
      tienNgoc = tn;
      if (!panel.hidden) render();
    },
    invalidate() {
      ask();
    },
    refresh() {
      if (!panel.hidden && tab === "post") render();
    },
    done(op) {
      note = { text: vi.market.ok[op], ok: true };
      if (op === "post") picked = null;
      if (!panel.hidden) render();
    },
    fail(reason) {
      note = { text: vi.market.errors[reason] ?? vi.market.errors.invalid ?? "", ok: false };
      if (!panel.hidden) render();
    },
    isOpen: () => !panel.hidden,
  };
}

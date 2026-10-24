import { api, formatTime, h, listView, type Column, type FilterDef } from "./kit";

/** The "Lịch sử Tiên Ngọc" screens: every change of a currency (Tiên Ngọc by default), per character totals, and the supply. */

const CURRENCY_LABEL: Record<string, string> = { linh_thach: "Linh Thạch", cong_hien: "Cống Hiến", tien_ngoc: "Tiên Ngọc" };

const REASON_LABEL: Record<string, string> = {
  shop_buy: "Mua ở thương nhân",
  shop_sell: "Bán cho thương nhân",
  admin_grant: "Admin chỉnh tay",
  mail_claim: "Nhận từ hòm thư",
  monster_drop: "Quái rơi",
  quest: "Nhiệm vụ",
  bag_tab: "Mở tab túi",
  repair: "Sửa đồ",
  breakthrough: "Đột phá",
  waygate: "Truyền Tống Trận",
  smith_upgrade: "Nâng cấp ở Thợ Rèn",
  smith_refine: "Tinh luyện ở Thợ Rèn",
};

/** "shop_buy:ren_giu_cap:1" -> "Mua ở thương nhân · ren_giu_cap:1"; unknown reasons show as they are. */
function reasonText(reason: string): string {
  const i = reason.indexOf(":");
  const group = i < 0 ? reason : reason.slice(0, i);
  const rest = i < 0 ? "" : reason.slice(i + 1);
  const label = REASON_LABEL[group] ?? group;
  return rest ? `${label} · ${rest}` : label;
}

const num = (n: number) => n.toLocaleString("vi-VN");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
const sign = (n: number) => h("span", { class: n > 0 ? "pos" : n < 0 ? "neg" : "" }, signed(n));

interface SupplyRow {
  currency: string;
  total: number;
  holders: number;
}

async function supplyCards(): Promise<HTMLElement> {
  const res = await api<{ supply?: SupplyRow[] }>("/api/admin/supply");
  const by = new Map((res.data.supply ?? []).map((r) => [r.currency, r]));
  return h(
    "div",
    { class: "stats" },
    ...Object.keys(CURRENCY_LABEL).map((c) => {
      const r = by.get(c);
      return h("div", { class: "stat" }, h("small", null, `Tổng cung ${CURRENCY_LABEL[c]}`), h("b", null, num(r?.total ?? 0)), h("small", null, `${num(r?.holders ?? 0)} người giữ`));
    }),
  );
}

interface LedgerRow {
  id: number;
  at: number;
  currency: string;
  delta: number;
  reason: string;
  characterId: string;
  characterName: string | null;
  email: string | null;
  actor: string;
}

interface LedgerGroup {
  reason: string;
  entries: number;
  totalIn: number;
  totalOut: number;
}

interface LogSummary {
  total: number;
  totalIn: number;
  totalOut: number;
  groups: LedgerGroup[];
}

interface PeopleRow {
  characterId: string;
  characterName: string | null;
  email: string | null;
  entries: number;
  totalIn: number;
  totalOut: number;
  net: number;
  balance: number;
}

function tabs(active: "log" | "people"): HTMLElement {
  return h("div", { class: "tabs" }, h("a", { href: "/admin/jade", class: active === "log" ? "active" : "" }, "Biến động"), h("a", { href: "/admin/jade/people", class: active === "people" ? "active" : "" }, "Theo người"));
}

const CURRENCY_OPTIONS: Array<[string, string]> = [
  ["tien_ngoc", "Tiên Ngọc"],
  ["linh_thach", "Linh Thạch"],
  ["cong_hien", "Cống Hiến"],
];

function query(params: URLSearchParams): string {
  return params.toString();
}

function logColumns(): Column<LedgerRow>[] {
  return [
    { key: "created_at", label: "Thời gian", sortable: true, render: (r) => formatTime(r.at) },
    {
      key: "character_name",
      label: "Nhân vật",
      sortable: true,
      render: (r) => h("a", { href: `/admin/jade?character=${encodeURIComponent(r.characterId)}&currency=${r.currency}` }, r.characterName ?? r.characterId.slice(0, 8)),
    },
    { key: "email", label: "Tài khoản", render: (r) => r.email ?? "—" },
    { key: "currency", label: "Tiền", render: (r) => CURRENCY_LABEL[r.currency] ?? r.currency },
    { key: "delta", label: "Số lượng", sortable: true, render: (r) => sign(r.delta) },
    { key: "reason", label: "Lý do", sortable: true, render: (r) => h("span", { title: r.reason }, reasonText(r.reason)) },
    { key: "actor", label: "Người thực hiện", render: (r) => (r.actor === "system" ? "Hệ thống" : r.actor) },
  ];
}

function summaryBlock(s: LogSummary): HTMLElement {
  return h(
    "div",
    null,
    h(
      "div",
      { class: "stats" },
      h("div", { class: "stat" }, h("small", null, "Số dòng khớp"), h("b", null, num(s.total))),
      h("div", { class: "stat" }, h("small", null, "Tổng vào"), h("b", { class: "pos" }, signed(s.totalIn))),
      h("div", { class: "stat" }, h("small", null, "Tổng ra"), h("b", { class: "neg" }, signed(s.totalOut))),
      h("div", { class: "stat" }, h("small", null, "Ròng"), h("b", null, sign(s.totalIn + s.totalOut))),
    ),
    s.groups.length
      ? h("div", { class: "groups" }, "Theo lý do: ", ...s.groups.map((g) => h("span", { title: g.reason }, `${REASON_LABEL[g.reason] ?? g.reason} ×${num(g.entries)} (${signed(g.totalIn + g.totalOut)})`)))
      : null,
  );
}

/** Every ledger change, filterable (currency, reason, time range, one character) and searchable (character, email, reason). */
export async function jadeLogPage(): Promise<HTMLElement> {
  const url = new URLSearchParams(location.search);
  const character = url.get("character") ?? "";
  const currency = CURRENCY_OPTIONS.some(([v]) => v === url.get("currency")) || url.get("currency") === "all" ? url.get("currency")! : "tien_ngoc";
  const filters: FilterDef[] = [
    { key: "currency", label: "Loại tiền", kind: "select", options: [...CURRENCY_OPTIONS, ["all", "Tất cả"]], initial: currency },
    { key: "reason", label: "Lý do (vd shop_buy)", kind: "text", initial: url.get("reason") ?? "" },
    { key: "from", label: "Từ ngày", kind: "date" },
    { key: "to", label: "Đến ngày", kind: "date" },
  ];
  const chip = character
    ? h("div", { class: "chip" }, h("span", null, "Chỉ nhân vật đang chọn"), h("a", { href: `/admin/jade?currency=${currency}` }, "bỏ lọc ✕"))
    : null;
  const list = listView<LedgerRow>({
    columns: logColumns(),
    defaultSort: { key: "id", dir: "desc" },
    searchPlaceholder: "Tìm nhân vật, email hoặc lý do",
    filters,
    fixedParams: character ? { character } : {},
    renderSummary: (s) => summaryBlock(s as LogSummary),
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size), ...q.extra });
      const res = await api<{ rows: LedgerRow[]; total: number; summary: { totalIn: number; totalOut: number }; groups: LedgerGroup[] }>(`/api/admin/ledger?${query(params)}`);
      if (res.status !== 200) return null;
      return { rows: res.data.rows, total: res.data.total, summary: { total: res.data.total, ...res.data.summary, groups: res.data.groups } };
    },
  });
  return h("div", null, await supplyCards(), tabs("log"), chip, list);
}

/** Per character: money in and out within the filter, and the balance now. A name opens that character's changes. */
export async function jadePeoplePage(): Promise<HTMLElement> {
  const filters: FilterDef[] = [
    { key: "currency", label: "Loại tiền", kind: "select", options: CURRENCY_OPTIONS, initial: "tien_ngoc" },
    { key: "from", label: "Từ ngày", kind: "date" },
    { key: "to", label: "Đến ngày", kind: "date" },
  ];
  const columns: Column<PeopleRow>[] = [
    {
      key: "character_name",
      label: "Nhân vật",
      sortable: true,
      render: (r) => h("a", { href: `/admin/jade?character=${encodeURIComponent(r.characterId)}` }, r.characterName ?? r.characterId.slice(0, 8)),
    },
    { key: "email", label: "Tài khoản", render: (r) => r.email ?? "—" },
    { key: "entries", label: "Số dòng", sortable: true, render: (r) => num(r.entries) },
    { key: "total_in", label: "Tổng vào", sortable: true, render: (r) => h("span", { class: "pos" }, signed(r.totalIn)) },
    { key: "total_out", label: "Tổng ra", sortable: true, render: (r) => h("span", { class: "neg" }, signed(r.totalOut)) },
    { key: "net", label: "Ròng", sortable: true, render: (r) => sign(r.net) },
    { key: "balance", label: "Số dư hiện tại", sortable: true, render: (r) => num(r.balance) },
  ];
  const list = listView<PeopleRow>({
    columns,
    defaultSort: { key: "net", dir: "desc" },
    searchPlaceholder: "Tìm nhân vật hoặc email",
    filters,
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size), ...q.extra });
      const res = await api<{ rows: PeopleRow[]; total: number }>(`/api/admin/ledger-people?${query(params)}`);
      return res.status === 200 ? res.data : null;
    },
  });
  return h("div", null, await supplyCards(), tabs("people"), list);
}

import { api, formatTime, h, listView, type Column, type FilterDef } from "./kit";

/** The currency screens (phase 3b): detailed history (Tiên Ngọc, big Linh Thạch), totals per person, the supply and the quick check. */

export type CurrencyId = "tien_ngoc" | "linh_thach" | "cong_hien";

export const CURRENCY_LABEL: Record<CurrencyId, string> = { tien_ngoc: "Tiên Ngọc", linh_thach: "Linh Thạch", cong_hien: "Cống Hiến" };

/** Where each currency's screens live; Cống Hiến has no detailed history, so its only screen is the totals. */
const BASE: Record<CurrencyId, string> = { tien_ngoc: "/admin/jade", linh_thach: "/admin/linh-thach", cong_hien: "/admin/cong-hien" };
const HAS_HISTORY: Record<CurrencyId, boolean> = { tien_ngoc: true, linh_thach: true, cong_hien: false };

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
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n === 0 ? "0" : num(n)); // never "-0"
const sign = (n: number) => h("span", { class: n > 0 ? "pos" : n < 0 ? "neg" : "" }, signed(n));
const stat = (label: string, value: string | Node, small?: string) => h("div", { class: "stat" }, h("small", null, label), h("b", null, value), small ? h("small", null, small) : null);

interface SupplyRow {
  currency: string;
  total: number;
  holders: number;
}

/** The three supply cards (the sum of all balances per currency). */
async function supplyCards(): Promise<HTMLElement> {
  const res = await api<{ supply?: SupplyRow[] }>("/api/admin/supply");
  const by = new Map((res.data.supply ?? []).map((r) => [r.currency, r]));
  return h(
    "div",
    { class: "stats" },
    ...(Object.keys(CURRENCY_LABEL) as CurrencyId[]).map((c) => stat(`Tổng cung ${CURRENCY_LABEL[c]}`, num(by.get(c)?.total ?? 0), `${num(by.get(c)?.holders ?? 0)} người giữ`)),
  );
}

function tabs(currency: CurrencyId, active: "history" | "people"): HTMLElement {
  const base = BASE[currency];
  return h(
    "div",
    { class: "tabs" },
    HAS_HISTORY[currency] ? h("a", { href: base, class: active === "history" ? "active" : "" }, "Lịch sử chi tiết") : null,
    h("a", { href: HAS_HISTORY[currency] ? `${base}/people` : base, class: active === "people" ? "active" : "" }, "Theo người"),
    ...(Object.keys(CURRENCY_LABEL) as CurrencyId[]).filter((c) => c !== currency).map((c) => h("a", { href: BASE[c] }, CURRENCY_LABEL[c])),
  );
}

interface Group {
  group: string;
  entries: number;
  totalIn: number;
  totalOut: number;
}

function groupsLine(groups: Group[]): HTMLElement | null {
  return groups.length
    ? h("div", { class: "groups" }, "Theo nhóm lý do: ", ...groups.map((g) => h("span", { title: g.group }, `${REASON_LABEL[g.group] ?? g.group} ×${num(g.entries)} (${signed(g.totalIn - g.totalOut)})`)))
    : null;
}

// ---- detailed history ----

interface HistoryRow {
  id: number;
  at: number;
  delta: number;
  reason: string;
  characterId: string;
  characterName: string | null;
  email: string | null;
  actor: string;
}

interface HistorySummary {
  total: number;
  totalIn: number;
  totalOut: number;
  groups: Group[];
}

function historyColumns(currency: CurrencyId): Column<HistoryRow>[] {
  return [
    { key: "created_at", label: "Thời gian", sortable: true, render: (r) => formatTime(r.at) },
    { key: "character_name", label: "Nhân vật", sortable: true, render: (r) => h("a", { href: `${BASE[currency]}?character=${encodeURIComponent(r.characterId)}` }, r.characterName ?? r.characterId.slice(0, 8)) },
    { key: "email", label: "Tài khoản", render: (r) => r.email ?? "—" },
    { key: "delta", label: "Số lượng", sortable: true, render: (r) => sign(r.delta) },
    { key: "reason", label: "Lý do", sortable: true, render: (r) => h("span", { title: r.reason }, reasonText(r.reason)) },
    { key: "actor", label: "Người thực hiện", render: (r) => (r.actor === "system" ? "Hệ thống" : r.actor) },
  ];
}

function historySummary(s: HistorySummary): HTMLElement {
  return h(
    "div",
    null,
    h("div", { class: "stats" }, stat("Số dòng khớp", num(s.total)), stat("Tổng vào", h("span", { class: "pos" }, signed(s.totalIn))), stat("Tổng ra", h("span", { class: "neg" }, signed(-s.totalOut))), stat("Ròng", sign(s.totalIn - s.totalOut))),
    groupsLine(s.groups),
  );
}

/** Every recorded change of Tiên Ngọc or Linh Thạch (Linh Thạch: only the big ones and the admin's), filterable by reason group, time range and one character. */
export async function historyPage(currency: CurrencyId): Promise<HTMLElement> {
  const url = new URLSearchParams(location.search);
  const character = url.get("character") ?? "";
  const filters: FilterDef[] = [
    { key: "reason", label: "Nhóm lý do (vd shop_buy)", kind: "text", initial: url.get("reason") ?? "" },
    { key: "from", label: "Từ ngày", kind: "date" },
    { key: "to", label: "Đến ngày", kind: "date" },
  ];
  const note =
    currency === "linh_thach"
      ? h("p", { class: "muted" }, "Linh Thạch chỉ ghi chi tiết giao dịch lớn (từ ngưỡng trong cài đặt `linh_thach_trace_min`) và mọi thao tác của admin. Xem đủ mọi biến động ở tab \"Theo người\" (tổng theo nhóm lý do).")
      : null;
  const chip = character ? h("div", { class: "chip" }, h("span", null, "Chỉ nhân vật đang chọn"), h("a", { href: BASE[currency] }, "bỏ lọc ✕")) : null;
  const list = listView<HistoryRow>({
    columns: historyColumns(currency),
    defaultSort: { key: "id", dir: "desc" },
    searchPlaceholder: "Tìm nhân vật, email hoặc lý do",
    filters,
    fixedParams: { currency, ...(character ? { character } : {}) },
    renderSummary: (s) => historySummary(s as HistorySummary),
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size), ...q.extra });
      const res = await api<{ rows: HistoryRow[]; total: number; summary: { totalIn: number; totalOut: number }; groups: Group[] }>(`/api/admin/currency-history?${params}`);
      if (res.status !== 200) return null;
      return { rows: res.data.rows, total: res.data.total, summary: { total: res.data.total, ...res.data.summary, groups: res.data.groups } };
    },
  });
  return h("div", null, await supplyCards(), tabs(currency, "history"), note, chip, list);
}

// ---- totals per person ----

interface TotalsRow {
  characterId: string;
  characterName: string | null;
  email: string | null;
  entries: number;
  totalIn: number;
  totalOut: number;
  net: number;
  balance: number;
  diff: number;
}

interface TotalsSummary {
  total: number;
  totalIn: number;
  totalOut: number;
  net: number;
  balance: number;
  groups: Group[];
}

function totalsSummary(s: TotalsSummary): HTMLElement {
  const diff = s.balance - s.net;
  return h(
    "div",
    null,
    h(
      "div",
      { class: "stats" },
      stat("Số nhân vật", num(s.total)),
      stat("Tổng vào", h("span", { class: "pos" }, signed(s.totalIn))),
      stat("Tổng ra", h("span", { class: "neg" }, signed(-s.totalOut))),
      stat("Ròng (vào − ra)", sign(s.net)),
      stat("Số dư hiện có", num(s.balance), diff === 0 ? "khớp" : `lệch ${signed(diff)}`),
    ),
    groupsLine(s.groups),
  );
}

/** Per character: money in and out by reason group (every change counts here), the balance now and the difference between the two. */
export async function totalsPage(currency: CurrencyId): Promise<HTMLElement> {
  const url = new URLSearchParams(location.search);
  const character = url.get("character") ?? "";
  const withHistory = HAS_HISTORY[currency];
  const columns: Column<TotalsRow>[] = [
    {
      key: "character_name",
      label: "Nhân vật",
      sortable: true,
      render: (r) => h("a", { href: `${BASE[currency]}?character=${encodeURIComponent(r.characterId)}` }, r.characterName ?? r.characterId.slice(0, 8)), // the history of that character, or (Cống Hiến) the totals of that one
    },
    { key: "email", label: "Tài khoản", render: (r) => r.email ?? "—" },
    { key: "entries", label: "Số lần", sortable: true, render: (r) => num(r.entries) },
    { key: "total_in", label: "Tổng vào", sortable: true, render: (r) => h("span", { class: "pos" }, signed(r.totalIn)) },
    { key: "total_out", label: "Tổng ra", sortable: true, render: (r) => h("span", { class: "neg" }, signed(-r.totalOut)) },
    { key: "net", label: "Ròng", sortable: true, render: (r) => sign(r.net) },
    { key: "balance", label: "Số dư hiện có", sortable: true, render: (r) => num(r.balance) },
    { key: "diff", label: "Lệch", sortable: true, render: (r) => (r.diff === 0 ? h("span", { class: "muted" }, "khớp") : h("b", { class: "neg" }, signed(r.diff))) },
  ];
  const chip = character ? h("div", { class: "chip" }, h("span", null, "Chỉ nhân vật đang chọn"), h("a", { href: withHistory ? `${BASE[currency]}/people` : BASE[currency] }, "bỏ lọc ✕")) : null;
  const list = listView<TotalsRow>({
    columns,
    defaultSort: { key: "net", dir: "desc" },
    searchPlaceholder: "Tìm nhân vật hoặc email",
    filters: [{ key: "group", label: "Nhóm lý do (vd monster_drop)", kind: "text", initial: url.get("group") ?? "" }],
    fixedParams: { currency, ...(character ? { character } : {}) },
    renderSummary: (s) => totalsSummary(s as TotalsSummary),
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size), ...q.extra });
      const res = await api<{ rows: TotalsRow[]; total: number; summary: Omit<TotalsSummary, "total" | "groups">; groups: Group[] }>(`/api/admin/currency-totals?${params}`);
      if (res.status !== 200) return null;
      return { rows: res.data.rows, total: res.data.total, summary: { total: res.data.total, ...res.data.summary, groups: res.data.groups } };
    },
  });
  const note = h("p", { class: "muted" }, "Tổng theo nhóm lý do không có thời gian nên không lọc theo ngày; muốn xem theo thời điểm thì dùng tab \"Lịch sử chi tiết\" (nếu có).");
  return h("div", null, await supplyCards(), tabs(currency, "people"), note, chip, list);
}

// ---- the quick check ----

interface Check {
  currency: CurrencyId;
  checked: number;
  mismatches: Array<{ characterId: string; characterName: string | null; balance: number; computed: number }>;
  balanceSum: number;
  computedSum: number;
}

/** For every currency: do the totals add up to the balances? Lists the characters where they do not. */
export async function checkPage(): Promise<HTMLElement> {
  const res = await api<{ checks?: Check[] }>("/api/admin/economy-check");
  if (res.status !== 200 || !res.data.checks) return h("p", { class: "err" }, "Không tải được kết quả kiểm tra.");
  return h(
    "div",
    null,
    h("p", { class: "muted" }, "Với mỗi nhân vật và loại tiền: tổng vào trừ tổng ra (theo các nhóm lý do) phải bằng số dư. Lệch nghĩa là số dư bị sửa tay hoặc có lỗi. Hiện tối đa 100 dòng lệch lớn nhất mỗi loại tiền."),
    ...res.data.checks.map((c) =>
      h(
        "div",
        null,
        h("h2", null, CURRENCY_LABEL[c.currency]),
        h(
          "div",
          { class: "stats" },
          stat("Nhân vật đã kiểm", num(c.checked)),
          stat("Tổng số dư", num(c.balanceSum)),
          stat("Tổng theo nhóm", num(c.computedSum)),
          stat("Kết quả", c.mismatches.length === 0 ? h("span", { class: "pos" }, "Khớp hết") : h("span", { class: "neg" }, `${c.mismatches.length}${c.mismatches.length >= 100 ? "+" : ""} nhân vật lệch`)),
        ),
        c.mismatches.length
          ? h(
              "div",
              { class: "table-wrap" },
              h(
                "table",
                null,
                h("thead", null, h("tr", null, ...["Nhân vật", "Số dư", "Tổng theo nhóm", "Lệch"].map((t) => h("th", null, t)))),
                h(
                  "tbody",
                  null,
                  ...c.mismatches.map((m) =>
                    h(
                      "tr",
                      null,
                      h("td", null, h("a", { href: `${BASE[c.currency]}${HAS_HISTORY[c.currency] ? "/people" : ""}?character=${encodeURIComponent(m.characterId)}` }, m.characterName ?? m.characterId.slice(0, 8))),
                      h("td", null, num(m.balance)),
                      h("td", null, num(m.computed)),
                      h("td", null, h("b", { class: "neg" }, signed(m.balance - m.computed))),
                    ),
                  ),
                ),
              ),
            )
          : null,
      ),
    ),
  );
}

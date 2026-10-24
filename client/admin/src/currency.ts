import { api, formatTime, h, listView, navigate, type Column } from "./kit";

/**
 * "Quản lý tiền tệ" (phase 3b): one menu entry, three screens.
 *  - search (/admin/currency): totals per character and group, with a "Kiểm duyệt" button;
 *  - audit (/admin/currency/audit): the balance audit of one currency;
 *  - detail (/admin/currency/detail): one character and currency, reached from either list.
 */

type CurrencyId = "tien_ngoc" | "linh_thach" | "cong_hien";

interface Meta {
  currencies: Array<{ id: CurrencyId; labelVi: string }>;
  groups: Array<{ id: string; labelVi: string }>;
}

const FALLBACK_CURRENCIES: Meta["currencies"] = [
  { id: "tien_ngoc", labelVi: "Tiên Ngọc" },
  { id: "linh_thach", labelVi: "Linh Thạch" },
  { id: "cong_hien", labelVi: "Cống Hiến" },
];

let metaCache: Meta | null = null;

async function loadMeta(): Promise<Meta> {
  if (metaCache) return metaCache;
  const res = await api<Meta>("/api/admin/currency/meta");
  metaCache = res.status === 200 ? res.data : { currencies: FALLBACK_CURRENCIES, groups: [] };
  return metaCache;
}

const currencyLabel = (meta: Meta, id: string) => meta.currencies.find((c) => c.id === id)?.labelVi ?? id;
const groupLabel = (meta: Meta, id: string) => meta.groups.find((g) => g.id === id)?.labelVi ?? id;
const num = (n: number) => n.toLocaleString("vi-VN");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n === 0 ? "0" : num(n)); // never "-0"

const STATUS: Record<string, { label: string; cls: string }> = {
  invalid: { label: "Không hợp lệ", cls: "neg" },
  valid: { label: "Hợp lệ", cls: "pos" },
  handled: { label: "Đã xử lý", cls: "muted" },
};
const statusText = (status: string) => h("b", { class: STATUS[status]?.cls ?? "" }, STATUS[status]?.label ?? status);

function currencyParam(): CurrencyId {
  const c = new URLSearchParams(location.search).get("currency");
  return c === "linh_thach" || c === "cong_hien" ? c : "tien_ngoc";
}

function detailHref(currency: string, characterId: string, from?: "audit"): string {
  return `/admin/currency/detail?currency=${currency}&character=${encodeURIComponent(characterId)}${from ? `&from=${from}` : ""}`;
}

// ---- 1. search ----

interface SearchRow {
  accountEmail: string | null;
  characterId: string;
  characterName: string | null;
  group: string;
  totalIn: number;
  totalOut: number;
  updatedAt: number;
}

/** The main list: search the totals per character and group; nothing is shown until "Tìm kiếm" is clicked (no input at all searches everything). */
export async function searchPage(): Promise<HTMLElement> {
  const meta = await loadMeta();
  const radios = meta.currencies.map((c) => {
    const input = h("input", { type: "radio", name: "currency", value: c.id });
    input.checked = c.id === "tien_ngoc";
    return { id: c.id, input, label: h("label", { class: "radio" }, input, ` ${c.labelVi}`) };
  });
  const account = h("input", { type: "text", maxlength: "64", placeholder: "Email tài khoản" });
  const character = h("input", { type: "text", maxlength: "64", placeholder: "Tên nhân vật" });
  const group = h("select", null, h("option", { value: "" }, "Tất cả nhóm"), ...meta.groups.map((g) => h("option", { value: g.id }, g.labelVi)));
  const selected = (): CurrencyId => radios.find((r) => r.input.checked)?.id ?? "tien_ngoc";
  const controls = { search: () => {}, reload: () => {} };
  const find = h("button", { type: "button", class: "primary" }, "Tìm kiếm");
  const audit = h("button", { type: "button" }, "Kiểm duyệt");
  find.addEventListener("click", () => controls.search());
  audit.addEventListener("click", () => navigate(`/admin/currency/audit?currency=${selected()}`));
  // Rows keep the currency they were searched with, whatever is selected afterwards.
  let searched: CurrencyId = "tien_ngoc";
  const columns: Column<SearchRow>[] = [
    { key: "account", label: "Tài khoản", sortable: true, render: (r) => r.accountEmail ?? "—" },
    { key: "character_name", label: "Nhân vật", sortable: true, render: (r) => r.characterName ?? r.characterId.slice(0, 8) },
    { key: "group", label: "Nhóm", sortable: true, render: (r) => groupLabel(meta, r.group) },
    { key: "total_in", label: "Vào (thu/nhận)", sortable: true, render: (r) => h("span", { class: "pos" }, num(r.totalIn)) },
    { key: "total_out", label: "Ra (dùng/gửi)", sortable: true, render: (r) => h("span", { class: "neg" }, num(r.totalOut)) },
    { key: "updated_at", label: "Cập nhật cuối", sortable: true, render: (r) => formatTime(r.updatedAt) },
    { key: "detail", label: "", render: (r) => h("a", { href: detailHref(searched, r.characterId) }, "Chi tiết") },
  ];
  const list = listView<SearchRow>({
    columns,
    defaultSort: { key: "updated_at", dir: "desc" },
    autoLoad: false,
    hideSearch: true,
    controls,
    fetchPage: async (q) => {
      searched = selected();
      const params = new URLSearchParams({ currency: searched, account: account.value.trim(), character: character.value.trim(), group: group.value, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size) });
      const res = await api<{ rows: SearchRow[]; total: number }>(`/api/admin/currency/search?${params}`);
      return res.status === 200 ? res.data : null;
    },
  });
  for (const el of [account, character]) el.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && controls.search());
  const form = h(
    "div",
    { class: "form" },
    h("div", { class: "radios" }, h("span", { class: "muted" }, "Loại tiền: "), ...radios.map((r) => r.label)),
    h("div", { class: "toolbar" }, account, character, group, find, audit),
  );
  return h("div", null, form, list);
}

// ---- 2. audit list ----

interface AuditRow {
  accountEmail: string | null;
  characterId: string;
  characterName: string | null;
  historyAmount: number;
  balanceAmount: number;
  status: string;
  checkedAt: number;
}

interface AuditHead {
  lastAuditAt: number | null;
  pendingInvalid: number;
}

/** The audit of one currency: the last run time, "Kiểm duyệt" (run) and "Search" (show the table). */
export async function auditPage(): Promise<HTMLElement> {
  const meta = await loadMeta();
  const currency = currencyParam();
  const label = currencyLabel(meta, currency);
  const lastAt = h("b", null, "…");
  const pending = h("span", { class: "muted" });
  const msg = h("div", { class: "msg" });
  const run = h("button", { type: "button", class: "primary" }, "Kiểm duyệt");
  const show = h("button", { type: "button" }, "Search");
  const controls = { search: () => {}, reload: () => {} };
  const head = async () => {
    const res = await api<AuditHead>(`/api/admin/currency/audit?currency=${currency}&size=1`);
    if (res.status !== 200) return;
    lastAt.textContent = res.data.lastAuditAt ? formatTime(res.data.lastAuditAt) : "Chưa kiểm duyệt lần nào";
    run.disabled = res.data.pendingInvalid > 0;
    pending.textContent = res.data.pendingInvalid > 0 ? `Còn ${res.data.pendingInvalid} nhân vật "Không hợp lệ" chưa xác nhận hoặc xử lý, chưa thể kiểm duyệt lại.` : "";
  };
  const columns: Column<AuditRow>[] = [
    { key: "account", label: "Tài khoản", sortable: true, render: (r) => r.accountEmail ?? "—" },
    { key: "character_name", label: "Nhân vật", sortable: true, render: (r) => r.characterName ?? r.characterId.slice(0, 8) },
    { key: "history_amount", label: "Số tiền lịch sử", sortable: true, render: (r) => num(r.historyAmount) },
    { key: "balance_amount", label: "Số tiền nhân vật", sortable: true, render: (r) => num(r.balanceAmount) },
    { key: "status", label: "Trạng thái", sortable: true, render: (r) => statusText(r.status) },
    { key: "detail", label: "", render: (r) => h("a", { href: detailHref(currency, r.characterId, "audit") }, "Chi tiết") },
  ];
  const list = listView<AuditRow>({
    columns,
    defaultSort: { key: "status", dir: "asc" },
    autoLoad: false,
    hideSearch: true,
    controls,
    fetchPage: async (q) => {
      const params = new URLSearchParams({ currency, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size) });
      const res = await api<{ rows: AuditRow[]; total: number }>(`/api/admin/currency/audit?${params}`);
      return res.status === 200 ? res.data : null;
    },
  });
  show.addEventListener("click", () => {
    msg.textContent = "";
    controls.search();
  });
  run.addEventListener("click", async () => {
    if (!confirm(`Xóa kết quả kiểm duyệt cũ của ${label} và kiểm duyệt lại?`)) return;
    run.disabled = true;
    msg.className = "msg muted";
    msg.textContent = "Đang kiểm duyệt...";
    const res = await api<{ checked?: number; invalid?: number; error?: string }>("/api/admin/currency/audit/run", { method: "POST", body: { currency } });
    if (res.status === 200) {
      msg.className = "msg ok";
      msg.textContent = `Đã kiểm ${num(res.data.checked ?? 0)} nhân vật, ${num(res.data.invalid ?? 0)} không hợp lệ.`;
      controls.search();
    } else {
      msg.className = "msg err";
      msg.textContent = res.data.error === "pending_invalid" ? "Còn nhân vật chưa xác nhận hoặc xử lý, không kiểm duyệt lại được." : "Không kiểm duyệt được.";
    }
    await head();
  });
  void head();
  return h(
    "div",
    null,
    h("a", { href: "/admin/currency" }, "‹ Quản lý tiền tệ"),
    h("h2", null, `Kiểm duyệt ${label}`),
    h("div", { class: "form" }, h("div", null, h("span", { class: "muted" }, "Thời gian kiểm duyệt cuối: "), lastAt), h("div", { class: "toolbar" }, run, show), pending, msg),
    list,
  );
}

// ---- 3. detail ----

interface Detail {
  currency: CurrencyId;
  account: { id: string; email: string } | null;
  character: { id: string; name: string };
  balance: number;
  groups: Array<{ group: string; totalIn: number; totalOut: number; updatedAt: number }>;
  historyAmount: number;
  matches: boolean;
  audit: { status: string; checkedAt: number; resolvedAt: number | null } | null;
  banned: boolean;
}

interface HistoryRow {
  id: number;
  at: number;
  delta: number;
  reason: string;
  group: string;
  actor: string;
}

/** The popup with the detailed Tiên Ngọc history of one character; it needs a date range (the last 30 days by default) so it never loads everything. */
function historyPopup(meta: Meta, characterId: string, characterName: string): void {
  const overlay = h("div", { class: "modal" });
  const close = () => overlay.remove();
  const controls = { search: () => {}, reload: () => {} };
  const from = h("input", { type: "date" });
  const to = h("input", { type: "date" });
  const find = h("button", { type: "button", class: "primary" }, "Tìm");
  find.addEventListener("click", () => controls.search());
  const columns: Column<HistoryRow>[] = [
    { key: "at", label: "Thời gian", render: (r) => formatTime(r.at) },
    { key: "group", label: "Nhóm", render: (r) => groupLabel(meta, r.group) },
    { key: "reason", label: "Lý do", render: (r) => r.reason },
    { key: "delta", label: "Số lượng", render: (r) => h("span", { class: r.delta > 0 ? "pos" : "neg" }, signed(r.delta)) },
    { key: "actor", label: "Người thực hiện", render: (r) => (r.actor === "system" ? "Hệ thống" : r.actor) },
  ];
  const list = listView<HistoryRow>({
    columns,
    defaultSort: { key: "at", dir: "desc" },
    hideSearch: true,
    controls,
    fetchPage: async (q) => {
      const params = new URLSearchParams({ character: characterId, page: String(q.page), size: String(q.size) });
      if (from.value) params.set("from", from.value);
      if (to.value) params.set("to", to.value);
      const res = await api<{ rows: HistoryRow[]; total: number }>(`/api/admin/currency/history?${params}`);
      return res.status === 200 ? res.data : null;
    },
  });
  const closeBtn = h("button", { type: "button" }, "Đóng");
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  overlay.append(
    h(
      "div",
      { class: "modal-box" },
      h("h3", null, `Lịch sử chi tiết Tiên Ngọc · ${characterName}`),
      h("div", { class: "toolbar" }, h("label", { class: "filter" }, "Từ ngày", from), h("label", { class: "filter" }, "Đến ngày", to), find, closeBtn),
      h("p", { class: "muted" }, "Không chọn ngày thì hiện 30 ngày gần nhất."),
      list,
    ),
  );
  document.body.append(overlay);
}

/** One character and currency: the balance on the character, the history by group, and the audit result; "Xác nhận" and "Xử lý" only from the audit list. */
export async function detailPage(): Promise<HTMLElement> {
  const meta = await loadMeta();
  const url = new URLSearchParams(location.search);
  const currency = currencyParam();
  const characterId = url.get("character") ?? "";
  const fromAudit = url.get("from") === "audit";
  const res = await api<{ detail?: Detail }>(`/api/admin/currency/detail?currency=${currency}&character=${encodeURIComponent(characterId)}`);
  const d = res.data.detail;
  if (res.status !== 200 || !d) return h("div", null, h("p", null, "Không tìm thấy nhân vật."), h("a", { href: "/admin/currency" }, "‹ Quản lý tiền tệ"));
  const label = currencyLabel(meta, currency);
  const back = fromAudit ? { href: `/admin/currency/audit?currency=${currency}`, text: `Kiểm duyệt ${label}` } : { href: "/admin/currency", text: "Quản lý tiền tệ" };
  const msg = h("div", { class: "msg" });

  const info = h(
    "section",
    null,
    h("h3", null, "Thông tin nhân vật"),
    h(
      "dl",
      { class: "fields" },
      h("dt", null, "Tài khoản"),
      h("dd", null, d.account?.email ?? "—"),
      h("dt", null, "Nhân vật"),
      h("dd", null, d.character.name),
      h("dt", null, "Loại tiền"),
      h("dd", null, label),
      h("dt", null, `${label} hiện có`),
      h("dd", null, h("b", null, num(d.balance))),
    ),
  );

  const historyButton = currency === "tien_ngoc" ? h("button", { type: "button" }, "Chi tiết") : null;
  historyButton?.addEventListener("click", () => historyPopup(meta, d.character.id, d.character.name));
  const history = h(
    "section",
    null,
    h("div", { class: "toolbar" }, h("h3", null, "Thông tin lịch sử"), historyButton),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, ...["Nhóm", "Vào (thu/nhận)", "Ra (dùng/gửi)", "Cập nhật cuối"].map((t) => h("th", null, t)))),
        h(
          "tbody",
          null,
          ...d.groups.map((g) => h("tr", null, h("td", null, groupLabel(meta, g.group)), h("td", null, h("span", { class: "pos" }, num(g.totalIn))), h("td", null, h("span", { class: "neg" }, num(g.totalOut))), h("td", null, formatTime(g.updatedAt)))),
          d.groups.length === 0 ? h("tr", null, h("td", { colspan: "4", class: "muted" }, "Chưa có lịch sử.")) : null,
          h("tr", null, h("th", null, `${label} hiện có theo lịch sử (vào − ra)`), h("th", { colspan: "3" }, num(d.historyAmount))),
        ),
      ),
    ),
  );

  const diff = d.balance - d.historyAmount;
  const result = h(
    "section",
    null,
    h("h3", null, "Kết quả kiểm duyệt"),
    d.matches
      ? h("p", null, h("b", { class: "pos" }, "Hợp lệ"), " · số tiền hiện có khớp với lịch sử")
      : h("p", null, h("b", { class: "neg" }, "Không hợp lệ"), ` · số tiền nhân vật ${num(d.balance)}, lịch sử ${num(d.historyAmount)}, lệch ${signed(diff)}`),
    d.audit ? h("p", { class: "muted" }, "Trạng thái trong bảng kiểm duyệt: ", statusText(d.audit.status)) : null,
  );

  const act = async (kind: "confirm" | "handle") => {
    const text = kind === "confirm" ? `Xác nhận khoản lệch ${signed(diff)} ${label}? Phần lệch sẽ được ghi vào nhóm Admin của lịch sử.` : "Đánh dấu nhân vật này là Đã xử lý?";
    if (!confirm(text)) return;
    msg.className = "msg muted";
    msg.textContent = "Đang xử lý...";
    const r = await api<{ error?: string; difference?: number | null }>(`/api/admin/currency/audit/${kind}`, { method: "POST", body: { currency, character: characterId } });
    if (r.status === 200) {
      navigate(detailHref(currency, characterId, "audit"));
      return;
    }
    msg.className = "msg err";
    const e = r.data.error;
    msg.textContent =
      e === "still_mismatch" ? `Chưa xử lý được: số liệu vẫn lệch ${signed(r.data.difference ?? 0)} và tài khoản chưa bị khóa vĩnh viễn.` : e === "stale" ? "Số liệu vừa thay đổi, hãy tải lại trang rồi thử lại." : e === "not_invalid" ? "Dòng này không còn ở trạng thái Không hợp lệ." : "Không thực hiện được.";
  };
  const confirmBtn = h("button", { type: "button", class: "primary" }, "Xác nhận");
  const handleBtn = h("button", { type: "button" }, "Xử lý");
  confirmBtn.addEventListener("click", () => void act("confirm"));
  handleBtn.addEventListener("click", () => void act("handle"));
  const showConfirm = fromAudit && !d.matches && d.audit?.status === "invalid";
  const showHandle = fromAudit && d.audit?.status === "invalid";

  return h("div", { class: "detail" }, h("a", { href: back.href }, `‹ ${back.text}`), h("h2", null, `${d.character.name} · ${label}`), info, history, result, h("div", { class: "actions" }, showConfirm ? confirmBtn : null, showHandle ? handleBtn : null), msg);
}

// ---- the admin log ----

interface LogRow {
  id: number;
  at: number;
  adminEmail: string;
  screen: string;
  content: string;
}

/** What the admins changed, newest first. */
export function logPage(): HTMLElement {
  return listView<LogRow>({
    columns: [
      { key: "at", label: "Thời gian", render: (r) => formatTime(r.at) },
      { key: "admin", label: "Admin", render: (r) => r.adminEmail },
      { key: "screen", label: "Màn hình", render: (r) => r.screen },
      { key: "content", label: "Nội dung", render: (r) => r.content },
    ],
    defaultSort: { key: "at", dir: "desc" },
    searchPlaceholder: "Tìm theo admin, màn hình, nội dung",
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, page: String(q.page), size: String(q.size) });
      const res = await api<{ rows: LogRow[]; total: number }>(`/api/admin/log?${params}`);
      return res.status === 200 ? res.data : null;
    },
  });
}

import { api, detailShell, formatTime, h, jsonBlock, listView, type Column } from "./kit";
import { MENU } from "./menu";

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "Sai email hoặc mật khẩu.",
  rate_limited: "Thử quá nhiều lần, hãy đợi một lúc rồi thử lại.",
};

/** The login page. A player account is signed out again at once, so a stale player session never lingers behind the admin address. */
export function loginPage(): HTMLElement {
  const email = h("input", { type: "email", required: true, autocomplete: "username", maxlength: "120" });
  const password = h("input", { type: "password", required: true, autocomplete: "current-password", maxlength: "128" });
  const msg = h("div", { class: "msg" });
  const submit = h("button", { type: "submit", class: "primary" }, "Đăng nhập");
  const form = h("form", null, h("label", null, "Email", email), h("label", null, "Mật khẩu", password), submit, msg);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    submit.disabled = true;
    msg.className = "msg muted";
    msg.textContent = "Đang đăng nhập...";
    const login = await api<{ error?: string }>("/api/login", { method: "POST", body: { email: email.value, password: password.value } });
    if (login.status !== 200) {
      msg.className = "msg err";
      msg.textContent = LOGIN_ERRORS[login.data.error ?? ""] ?? "Không đăng nhập được.";
      submit.disabled = false;
      return;
    }
    const me = await api("/api/admin/me");
    if (me.status === 200) {
      location.assign("/admin");
      return;
    }
    await api("/api/logout", { method: "POST", body: {} });
    msg.className = "msg err";
    msg.textContent = "Tài khoản này không có quyền Admin.";
    submit.disabled = false;
  });
  return h("div", { class: "login" }, h("h1", null, "Quản trị · Tu Tiên Giới"), form);
}

/** The admin home: a card for every screen; the ones not built yet are greyed out with the phase that builds them. */
export function homePage(): HTMLElement {
  return h(
    "div",
    { class: "cards" },
    ...MENU.map((m) =>
      m.ready
        ? h("a", { class: "card", href: m.path }, h("b", null, m.label), h("small", null, m.hint))
        : h("div", { class: "card planned" }, h("b", null, m.label), h("small", null, `${m.hint} · chưa làm (${m.phase})`)),
    ),
  );
}

export function plannedPage(label: string, phase: string): HTMLElement {
  return h("div", null, h("p", null, `Màn "${label}" chưa làm (hạng mục ${phase} trong docs/PHASE3.md).`), h("a", { href: "/admin" }, "‹ Về trang chính"));
}

export function notFoundPage(): HTMLElement {
  return h("div", null, h("p", null, "Không có trang này."), h("a", { href: "/admin" }, "‹ Về trang chính"));
}

interface AuditRow {
  id: number;
  at: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}

const AUDIT_COLUMNS: Column<AuditRow>[] = [
  { key: "at", label: "Thời gian", sortable: true, render: (r) => formatTime(r.at) },
  { key: "admin_email", label: "Admin", sortable: true, render: (r) => r.adminEmail },
  { key: "action", label: "Hành động", sortable: true, render: (r) => r.action },
  { key: "target_type", label: "Đối tượng", sortable: true, render: (r) => (r.targetId ? `${r.targetType} · ${r.targetId}` : r.targetType) },
  { key: "summary", label: "Tóm tắt", render: (r) => r.summary },
];

/** The change log list (the first screen built on the shared list view). */
export function auditListPage(): HTMLElement {
  return listView<AuditRow>({
    columns: AUDIT_COLUMNS,
    defaultSort: { key: "id", dir: "desc" },
    searchPlaceholder: "Tìm theo admin, hành động, đối tượng, tóm tắt",
    rowHref: (r) => `/admin/audit/${r.id}`,
    fetchPage: async (q) => {
      const params = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size) });
      const res = await api<{ rows: AuditRow[]; total: number }>(`/api/admin/audit?${params}`);
      return res.status === 200 ? res.data : null;
    },
  });
}

/** One change log row with its before and after values (the first screen built on the shared detail shell). */
export async function auditDetailPage(id: number): Promise<HTMLElement> {
  const res = await api<{ entry?: AuditRow & { adminId: string; before: unknown; after: unknown } }>(`/api/admin/audit-entry?id=${id}`);
  const e = res.data.entry;
  if (res.status !== 200 || !e) return notFoundPage();
  return detailShell({
    backHref: "/admin/audit",
    backLabel: "Nhật ký thay đổi",
    title: `Thay đổi #${e.id}`,
    fields: [
      { label: "Thời gian", value: formatTime(e.at) },
      { label: "Admin", value: e.adminEmail },
      { label: "Hành động", value: e.action },
      { label: "Đối tượng", value: e.targetId ? `${e.targetType} · ${e.targetId}` : e.targetType },
      { label: "Tóm tắt", value: e.summary || "—" },
      { label: "Trước", value: jsonBlock(e.before) },
      { label: "Sau", value: jsonBlock(e.after) },
    ],
  });
}

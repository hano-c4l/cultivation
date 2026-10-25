import { api, formatTime, h, listView } from "./kit";

/**
 * "Tài khoản" (PHASE3 3m-a): a searchable list of accounts and a detail screen with banning (some days or for good, with the reason the player is shown at
 * login), lifting a ban and a temporary password (shown once). Editing the character itself is not here yet.
 */

interface Row {
  id: string;
  email: string;
  role: string;
  createdAt: number;
  character: string | null;
  realm: number | null;
  stage: number | null;
  lastSession: number | null;
  banned: boolean;
  banForever: boolean;
  banUntil: number | null;
}

interface Detail {
  account: { id: string; email: string; role: string; createdAt: number; banned: boolean; banForever: boolean; banUntil: number | null; banReason: string | null; bannedBy: string | null; sessions: number; lastSession: number | null };
  character: { id: string; name: string; gender: string; realm: number; stage: number; map: string; wallet: Record<string, number> } | null;
  characters: Array<{ id: string; name: string; gender: string; realm: number; stage: number; map: string }>;
}

const REALM = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh"];
const ERRORS: Record<string, string> = {
  invalid: "Dữ liệu không hợp lệ (lý do 1-200 ký tự; số ngày 1-3650).",
  forbidden: "Không dùng được cho tài khoản Admin.",
  not_found: "Không tìm thấy tài khoản.",
  unchanged: "Tài khoản không bị khóa.",
};
const banText = (b: { banned: boolean; banForever: boolean; banUntil: number | null }) => (!b.banned ? "" : b.banForever ? "Khóa vĩnh viễn" : `Khóa đến ${formatTime(b.banUntil ?? 0)}`);
const realmText = (r: number | null, s: number | null) => (r === null ? "—" : `${REALM[r] ?? r} ${s}`);

export function accountListPage(): HTMLElement {
  return h(
    "div",
    null,
    h("p", { class: "muted" }, "Tìm theo email hoặc đạo hiệu. “Đăng nhập cuối” là lần đăng nhập gần nhất (với tài khoản chưa đăng nhập kể từ khi có cột này thì lấy phiên cũ còn ghi lại)."),
    listView<Row>({
      columns: [
        { key: "email", label: "Email", sortable: true, render: (r) => r.email },
        { key: "name", label: "Nhân vật", sortable: true, render: (r) => r.character ?? "—" },
        { key: "realm", label: "Cảnh giới", sortable: true, render: (r) => realmText(r.realm, r.stage) },
        { key: "created", label: "Tạo lúc", sortable: true, render: (r) => formatTime(r.createdAt) },
        { key: "login", label: "Đăng nhập cuối", sortable: true, render: (r) => (r.lastSession ? formatTime(r.lastSession) : "—") },
        { key: "role", label: "Vai trò", render: (r) => (r.role === "admin" ? "Admin" : "Người chơi") },
        { key: "ban", label: "Trạng thái", render: (r) => banText(r) || "Bình thường" },
      ],
      defaultSort: { key: "created", dir: "desc" },
      searchPlaceholder: "Email hoặc đạo hiệu...",
      rowHref: (r) => `/admin/accounts/detail?id=${encodeURIComponent(r.id)}`,
      fetchPage: async (q) => {
        const p = new URLSearchParams({ q: q.q, sort: q.sort, dir: q.dir, page: String(q.page), size: String(q.size) });
        const res = await api<{ rows: Row[]; total: number }>(`/api/admin/accounts?${p}`);
        return res.status === 200 ? res.data : null;
      },
    }),
  );
}

export function accountDetailPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const load = async () => {
    const res = await api<Detail>(`/api/admin/accounts/detail?id=${encodeURIComponent(id)}`);
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy tài khoản."), h("a", { href: "/admin/accounts" }, "‹ Danh sách"));
    root.replaceChildren(view(res.data, load));
  };
  void load();
  return root;
}

function view(d: Detail, reload: () => Promise<void>): HTMLElement {
  const a = d.account;
  const msg = h("div", { class: "msg muted" });
  const show = (text: string, cls = "muted") => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
  };
  const act = async (body: Record<string, unknown>) => api<{ error?: string; password?: string; kicked?: boolean }>("/api/admin/accounts/action", { method: "POST", body: { id: a.id, ...body } });

  const forever = h("input", { type: "checkbox" });
  const days = h("input", { type: "number", min: "1", max: "3650", step: "1" });
  days.value = "7";
  days.style.width = "6em";
  const reason = h("input", { type: "text", maxlength: "200", placeholder: "Lý do (người chơi sẽ thấy)" });
  reason.style.width = "24em";
  const ban = h("button", { type: "button", class: "primary" }, "Khóa tài khoản");
  ban.addEventListener("click", async () => {
    if (!window.confirm(`Khóa ${a.email}${forever.checked ? " vĩnh viễn" : ` ${days.value} ngày`}? Họ bị đăng xuất và đá khỏi game ngay.`)) return;
    const res = await act({ action: "ban", forever: forever.checked, days: Number(days.value), reason: reason.value });
    if (res.status === 200) return void (await reload());
    show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err");
  });
  const unban = h("button", { type: "button" }, "Bỏ khóa");
  unban.disabled = !a.banned;
  unban.addEventListener("click", async () => {
    const res = await act({ action: "unban" });
    if (res.status === 200) return void (await reload());
    show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err");
  });
  const pw = h("button", { type: "button" }, "Đặt mật khẩu tạm");
  const pwBox = h("div");
  pw.addEventListener("click", async () => {
    if (!window.confirm(`Đặt mật khẩu tạm cho ${a.email}? Mật khẩu cũ mất hiệu lực, họ bị đăng xuất và đá khỏi game. Mật khẩu mới chỉ hiện một lần.`)) return;
    const res = await act({ action: "password" });
    if (res.status !== 200) return show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err");
    pwBox.replaceChildren(h("p", null, "Mật khẩu tạm (chỉ hiện một lần, hãy chép ngay): ", h("code", null, res.data.password ?? "")));
    show("Đã đặt mật khẩu tạm.");
  });
  const admin = a.role === "admin";

  return h(
    "div",
    null,
    h("a", { href: "/admin/accounts" }, "‹ Danh sách tài khoản"),
    h("h2", null, a.email),
    h(
      "dl",
      { class: "fields" },
      h("dt", null, "Vai trò"),
      h("dd", null, admin ? "Admin" : "Người chơi"),
      h("dt", null, "Tạo lúc"),
      h("dd", null, formatTime(a.createdAt)),
      h("dt", null, "Đăng nhập cuối"),
      h("dd", null, a.lastSession ? formatTime(a.lastSession) : "—"),
      h("dt", null, "Phiên đang mở"),
      h("dd", null, String(a.sessions)),
      h("dt", null, "Trạng thái"),
      h("dd", null, a.banned ? `${banText(a)} · lý do: ${a.banReason ?? ""} (bởi ${a.bannedBy ?? "?"})` : "Bình thường"),
    ),
    h("h3", null, `Nhân vật (${d.characters.length})`),
    d.characters.length === 0
      ? h("p", { class: "muted" }, "Chưa tạo nhân vật.")
      : h(
          "div",
          { class: "table-wrap" },
          h(
            "table",
            null,
            h("thead", null, h("tr", null, h("th", null, "Đạo hiệu"), h("th", null, "Giới tính"), h("th", null, "Cảnh giới"), h("th", null, "Bản đồ"), h("th", null, "Xem / sửa"), h("th", null, "Lịch sử tiền"))),
            h(
              "tbody",
              null,
              ...d.characters.map((x) =>
                h(
                  "tr",
                  null,
                  h("td", null, x.name),
                  h("td", null, x.gender === "female" ? "Nữ" : "Nam"),
                  h("td", null, realmText(x.realm, x.stage)),
                  h("td", null, x.map),
                  h("td", null, h("a", { href: `/admin/characters/detail?id=${encodeURIComponent(x.id)}` }, "Mở (chỉ số, tiền, túi đồ, kỹ năng)")),
                  h("td", null, h("a", { href: `/admin/currency/detail?currency=linh_thach&character=${encodeURIComponent(x.id)}` }, "Quản lý tiền tệ")),
                ),
              ),
            ),
          ),
        ),
    h("h3", null, "Khóa tài khoản"),
    admin ? h("p", { class: "muted" }, "Tài khoản Admin không khóa được và không đặt mật khẩu tạm ở đây.") : null,
    h("div", { class: "toolbar" }, h("label", { class: "radio" }, forever, "Vĩnh viễn"), h("span", null, "hoặc"), days, h("span", null, "ngày"), reason, ban, unban),
    h("h3", null, "Mật khẩu"),
    h("div", { class: "toolbar" }, pw),
    pwBox,
    msg,
  );
}

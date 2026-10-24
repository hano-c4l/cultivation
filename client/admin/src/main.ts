import "./style.css";
import { api, h } from "./kit";
import { auditPage, detailPage, logPage, searchPage } from "./currency";
import { MENU } from "./menu";
import { miscPage } from "./misc";
import { homePage, loginPage, notFoundPage, plannedPage } from "./pages";

const app = document.getElementById("app")!;

interface Me {
  account: { id: string; email: string; role: string };
}

let me: Me | null = null;

/** Normalised path without a trailing slash ("/admin/" and "/admin/index" are the home). */
function currentPath(): string {
  const p = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, "") : location.pathname;
  return p === "/admin/index" ? "/admin" : p;
}

function layout(title: string, content: HTMLElement | Promise<HTMLElement>, path: string): HTMLElement {
  const side = h(
    "nav",
    { class: "side" },
    h("h2", null, h("a", { href: "/admin" }, "Quản trị")),
    ...MENU.map((m) => (m.ready ? h("a", { href: m.path, class: path === m.path || path.startsWith(`${m.path}/`) ? "active" : "" }, m.label) : h("span", { class: "planned", title: `Chưa làm (${m.phase})` }, m.label))),
  );
  const logout = h("button", { type: "button" }, "Đăng xuất");
  logout.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: {} });
    location.assign("/admin/login");
  });
  const toggle = h("button", { type: "button", class: "toggle" }, "☰");
  toggle.addEventListener("click", () => side.classList.toggle("open"));
  const main = h("div", { class: "content" }, h("div", { class: "topbar" }, h("h1", null, title), h("div", { class: "who" }, toggle, h("span", { class: "muted" }, me?.account.email ?? ""), logout)));
  const slot = h("div", null, h("p", { class: "muted" }, "Đang tải..."));
  main.append(slot);
  void Promise.resolve(content).then((node) => slot.replaceChildren(node));
  return h("div", { class: "layout" }, side, main);
}

async function render(): Promise<void> {
  const path = currentPath();
  if (path === "/admin/login") {
    document.title = "Đăng nhập · Quản trị";
    app.replaceChildren(loginPage());
    return;
  }
  if (!me) {
    const res = await api<Me>("/api/admin/me");
    if (res.status !== 200) {
      // The server already redirects page loads; this covers a session that ended while the app was open.
      location.replace("/admin/login");
      return;
    }
    me = res.data;
  }
  let title = "Không tìm thấy";
  let content: HTMLElement | Promise<HTMLElement> = notFoundPage();
  if (path === "/admin") {
    title = "Trang chính";
    content = homePage();
  } else if (path === "/admin/currency") {
    title = "Quản lý tiền tệ";
    content = searchPage();
  } else if (path === "/admin/currency/audit") {
    title = "Quản lý tiền tệ · Kiểm duyệt";
    content = auditPage();
  } else if (path === "/admin/currency/detail") {
    title = "Quản lý tiền tệ · Chi tiết";
    content = detailPage();
  } else if (path === "/admin/misc") {
    title = "Chỉ số khác";
    content = miscPage();
  } else if (path === "/admin/log") {
    title = "Nhật ký admin";
    content = logPage();
  } else {
    const planned = MENU.find((m) => !m.ready && (path === m.path || path.startsWith(`${m.path}/`)));
    if (planned) {
      title = planned.label;
      content = plannedPage(planned.label, planned.phase);
    }
  }
  document.title = `${title} · Quản trị`;
  app.replaceChildren(layout(title, content, path));
}

// Links under /admin move without a page load; everything else (and modified clicks) behaves as usual.
document.addEventListener("click", (ev) => {
  const a = (ev.target as Element).closest("a");
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !(url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) return;
  ev.preventDefault();
  history.pushState(null, "", url.pathname + url.search);
  void render();
});
window.addEventListener("popstate", () => void render());
void render();

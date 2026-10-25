import "./style.css";
import { api, h } from "./kit";
import { auditPage, detailPage, logPage, searchPage } from "./currency";
import { MENU } from "./menu";
import { giftsPage } from "./gifts";
import { itemEditPage, itemListPage } from "./items";
import { bossPage, lootPage, ranksPage, speciesEditPage, speciesListPage } from "./monsters";
import { constitutionEditPage, constitutionListPage, rootsPage } from "./talents";
import { skillEditPage, skillListPage } from "./skills";
import { questEditPage, questListPage } from "./quests";
import { alchemyPage, npcEditPage, npcListPage } from "./npcs";
import { mapEditPage, mapListPage } from "./maps";
import { accountDetailPage, accountListPage } from "./accounts";
import { miscPage, tuningPage } from "./misc";
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
  } else if (path === "/admin/accounts") {
    title = "Tài khoản";
    content = accountListPage();
  } else if (path === "/admin/accounts/detail") {
    title = "Tài khoản · Chi tiết";
    content = accountDetailPage();
  } else if (path === "/admin/maps") {
    title = "Bản đồ";
    content = mapListPage();
  } else if (path === "/admin/maps/edit") {
    title = "Bản đồ · Sửa";
    content = mapEditPage();
  } else if (path === "/admin/npcs") {
    title = "NPC";
    content = npcListPage();
  } else if (path === "/admin/npcs/edit") {
    title = "NPC · Sửa";
    content = npcEditPage();
  } else if (path === "/admin/npcs/numbers") {
    title = "NPC · Con số";
    content = tuningPage("npcs");
  } else if (path === "/admin/npcs/alchemy") {
    title = "NPC · Công thức luyện đan";
    content = alchemyPage();
  } else if (path === "/admin/monsters") {
    title = "Quái / BOSS · Loài quái";
    content = speciesListPage();
  } else if (path === "/admin/monsters/edit") {
    title = "Quái / BOSS · Sửa loài";
    content = speciesEditPage();
  } else if (path === "/admin/monsters/ranks") {
    title = "Quái / BOSS · Hạng quái và rơi đồ";
    content = ranksPage();
  } else if (path === "/admin/monsters/loot") {
    title = "Quái / BOSS · Bảng rơi";
    content = lootPage();
  } else if (path === "/admin/monsters/boss") {
    title = "Quái / BOSS · BOSS và vệ binh";
    content = bossPage();
  } else if (path === "/admin/talents") {
    title = "Thiên phú · Linh căn";
    content = rootsPage();
  } else if (path === "/admin/talents/constitutions") {
    title = "Thiên phú · Thể chất";
    content = constitutionListPage();
  } else if (path === "/admin/talents/constitutions/edit") {
    title = "Thiên phú · Sửa thể chất";
    content = constitutionEditPage();
  } else if (path === "/admin/skills") {
    title = "Kỹ năng";
    content = skillListPage();
  } else if (path === "/admin/skills/edit") {
    title = "Kỹ năng · Sửa";
    content = skillEditPage();
  } else if (path === "/admin/items") {
    title = "Vật phẩm";
    content = itemListPage();
  } else if (path === "/admin/items/edit") {
    title = "Vật phẩm · Sửa";
    content = itemEditPage();
  } else if (path === "/admin/quests") {
    title = "Nhiệm vụ";
    content = questListPage();
  } else if (path === "/admin/quests/edit") {
    title = "Nhiệm vụ · Sửa";
    content = questEditPage();
  } else if (path === "/admin/gifts") {
    title = "Gửi quà";
    content = giftsPage();
  } else if (path === "/admin/realms") {
    title = "Cảnh giới";
    content = tuningPage("realms");
  } else if (path === "/admin/potential") {
    title = "Chỉ số tiềm năng";
    content = tuningPage("potential");
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

import { api, formatTime, h } from "./kit";

/**
 * "Tổng quan tiền" (phase 5f): for each currency the supply, the money in and out by group, the biggest holders and the supply by day; then the Tiên Ngọc the admins credited
 * (there is no payment gateway yet, so these are the manual top-ups). Read-only: the changes are made in "Quản lý tiền tệ" and "Gửi quà".
 */

interface Flow {
  group: string;
  labelVi: string;
  totalIn: number;
  totalOut: number;
}
interface CurrencyData {
  id: "tien_ngoc" | "linh_thach" | "cong_hien";
  supply: number;
  holders: number;
  totalIn: number;
  totalOut: number;
  groups: Flow[];
  top: Array<{ id: string; name: string; balance: number }>;
  history: Array<{ day: number; supply: number; holders: number; totalIn: number; totalOut: number }>;
}
interface Overview {
  at: number;
  day: number;
  currencies: CurrencyData[];
  topups: {
    from: number;
    count: number;
    total: number;
    byDay: Array<{ day: number; total: number; count: number }>;
    rows: Array<{ at: number; characterId: string; name: string | null; amount: number; reason: string; actor: string }>;
  };
}

const LABEL: Record<string, string> = { tien_ngoc: "Tiên Ngọc", linh_thach: "Linh Thạch", cong_hien: "Cống Hiến" };
const num = (n: number) => n.toLocaleString("vi-VN");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n === 0 ? "0" : num(n));
const dayText = (day: number) => new Date(day * 86_400_000).toLocaleDateString("vi-VN", { timeZone: "UTC" });

function table(head: string[], rows: Array<Array<string | Node>>): HTMLElement {
  return h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, ...head.map((t) => h("th", null, t)))), h("tbody", null, ...rows.map((r) => h("tr", null, ...r.map((c) => h("td", null, c)))))));
}

function currencyBlock(c: CurrencyData): HTMLElement {
  const parts: Array<HTMLElement> = [
    h("h2", null, LABEL[c.id] ?? c.id),
    h("p", null, h("b", null, num(c.supply)), ` đang được giữ bởi ${num(c.holders)} người chơi`, c.id === "cong_hien" ? " (cống hiến của thành viên các tông môn; không còn nằm trong ví)" : "."),
  ];
  if (c.groups.length > 0) {
    parts.push(
      h("h3", null, "Tiền vào và ra theo nhóm (từ đầu đến nay)"),
      table(
        ["Nhóm", "Vào", "Ra", "Ròng"],
        [
          ...c.groups.map((g) => [g.labelVi, num(g.totalIn), num(g.totalOut), signed(g.totalIn - g.totalOut)]),
          [h("b", null, "Tổng"), h("b", null, num(c.totalIn)), h("b", null, num(c.totalOut)), h("b", null, signed(c.totalIn - c.totalOut))],
        ],
      ),
      h("p", { class: "muted" }, "Vào: tiền hệ thống tạo ra hoặc nhận từ người khác. Ra: tiền hao đi hoặc trả cho người khác. Giao dịch giữa người chơi cộng ròng bằng 0 qua cả hai bên."),
    );
  }
  if (c.top.length > 0) {
    parts.push(
      h("h3", null, `${c.top.length} người giữ nhiều nhất`),
      table(
        ["#", "Nhân vật", "Số dư", "Chiếm"],
        c.top.map((t, i) => [String(i + 1), h("a", { href: `/admin/currency/detail?currency=${c.id}&character=${encodeURIComponent(t.id)}` }, t.name), num(t.balance), c.supply > 0 ? `${((t.balance / c.supply) * 100).toFixed(1)}%` : "-"]),
      ),
    );
  }
  parts.push(
    h("h3", null, "Tổng cung theo ngày"),
    c.history.length === 0
      ? h("p", { class: "muted" }, "Chưa có.")
      : table(
          ["Ngày", "Tổng cung", "Đổi so với ngày trước", "Người giữ"],
          c.history.map((r, i) => {
            const before = c.history[i + 1];
            return [dayText(r.day), num(r.supply), before ? signed(r.supply - before.supply) : "-", num(r.holders)];
          }),
        ),
    h("p", { class: "muted" }, "Mỗi ngày một dòng, ghi vào lần đầu có người mở màn này trong ngày (không có việc chạy theo lịch), nên ngày không ai mở sẽ trống."),
  );
  return h("section", { class: "card" }, ...parts);
}

export async function moneyPage(): Promise<HTMLElement> {
  const res = await api<Overview>("/api/admin/money");
  if (res.status !== 200) return h("p", { class: "error" }, "Không tải được số liệu.");
  const d = res.data;
  const t = d.topups;
  const topups = h(
    "section",
    { class: "card" },
    h("h2", null, "Tiên Ngọc admin đã cộng (30 ngày qua)"),
    h("p", null, h("b", null, num(t.total)), ` Tiên Ngọc trong ${num(t.count)} lần cộng. Chưa nối cổng thanh toán, nên đây là các khoản nạp làm tay (và quà admin gửi); đơn nạp tự động sẽ có bảng riêng khi nối cổng.`),
    t.byDay.length > 0 ? table(["Ngày", "Tiên Ngọc", "Số lần"], t.byDay.map((r) => [dayText(r.day), num(r.total), num(r.count)])) : h("p", { class: "muted" }, "Chưa có."),
    t.rows.length > 0
      ? table(
          ["Lúc", "Nhân vật", "Số lượng", "Lý do", "Người làm"],
          t.rows.map((r) => [formatTime(r.at), h("a", { href: `/admin/currency/detail?currency=tien_ngoc&character=${encodeURIComponent(r.characterId)}` }, r.name ?? r.characterId), num(r.amount), r.reason, r.actor]),
        )
      : null,
  );
  return h("div", null, h("p", { class: "muted" }, `Số liệu lúc ${formatTime(d.at)}.`), ...d.currencies.map(currencyBlock), topups);
}

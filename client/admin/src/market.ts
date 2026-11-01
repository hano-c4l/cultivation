import { api, formatTime, h, navigate } from "./kit";

/**
 * "Chợ và giao dịch" (phase 5 leftovers): the listings of Vạn Bảo Lâu (open ones, or all), the closed sales and the log of direct trades between players. The only change is taking
 * an open listing down (the item goes back to the seller by mail, a top bidder is refunded); everything else is read-only, for looking into a dispute.
 */
interface Listing {
  id: string;
  town: string;
  kind: string;
  currency: string;
  seller: string | null;
  itemName: string;
  qty: number;
  price: number;
  topBid: number;
  topBidder: string | null;
  status: string;
  createdAt: number;
  endsAt: number;
  closedAt: number | null;
}
interface Sale {
  id: string;
  town: string;
  kind: string;
  currency: string;
  seller: string | null;
  buyer: string | null;
  itemName: string;
  qty: number;
  price: number;
  tax: number;
  createdAt: number;
}
interface Trade {
  id: string;
  a: string | null;
  b: string | null;
  itemsA: Array<{ name: string; qty: number }>;
  itemsB: Array<{ name: string; qty: number }>;
  linhA: number;
  linhB: number;
  tnA: number;
  tnB: number;
  createdAt: number;
}

const CURRENCY: Record<string, string> = { linh_thach: "Linh Thạch", tien_ngoc: "Tiên Ngọc" };
const KIND: Record<string, string> = { fixed: "Bán đứt", auction: "Đấu giá" };
const STATUS: Record<string, string> = { active: "Đang bán", sold: "Đã bán", cancelled: "Đã gỡ", expired: "Hết hạn", unsold: "Không ai đặt" };
const VIEWS: Array<[string, string]> = [
  ["listings", "Tin đang bán"],
  ["all", "Mọi tin"],
  ["sales", "Đã chốt"],
  ["trades", "Giao dịch trực tiếp"],
];
const num = (n: number) => n.toLocaleString("vi-VN");

function table(head: string[], rows: Array<Array<string | Node>>): HTMLElement {
  return h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, ...head.map((t) => h("th", null, t)))), h("tbody", null, ...rows.map((r) => h("tr", null, ...r.map((c) => h("td", null, c)))))));
}

const items = (list: Array<{ name: string; qty: number }>): string => (list.length > 0 ? list.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`).join(", ") : "-");
const money = (linh: number, tn: number): string => [linh > 0 ? `${num(linh)} Linh Thạch` : "", tn > 0 ? `${num(tn)} Tiên Ngọc` : ""].filter(Boolean).join(" + ") || "-";

export async function marketPage(): Promise<HTMLElement> {
  const params = new URLSearchParams(location.search);
  const view = VIEWS.some(([v]) => v === params.get("view")) ? params.get("view")! : "listings";
  const q = params.get("q") ?? "";
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ view, ...(q ? { q } : {}), ...next });
    for (const [k, v] of [...p]) if (v === "") p.delete(k);
    navigate(`/admin/market?${p.toString()}`);
  };
  const tabs = h("div", { class: "toolbar" }, ...VIEWS.map(([v, label]) => h("button", { type: "button", class: v === view ? "primary" : "", onclick: () => go({ view: v, q: "" }) }, label)));
  const search = h("input", { type: "search", placeholder: view === "trades" ? "Tên nhân vật" : "Mã vật phẩm hoặc tên nhân vật", value: q });
  search.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") go({ q: search.value.trim() });
  });
  const bar = h("div", { class: "toolbar" }, search, h("button", { type: "button", onclick: () => go({ q: search.value.trim() }) }, "Tìm"));
  const note = h("p", { class: "muted" }, "Tối đa 200 dòng mới nhất mỗi lần.");
  const msg = h("p", { class: "muted" });
  const shell = (body: Node) => h("div", null, tabs, bar, msg, note, body);

  const query = new URLSearchParams({ view: view === "all" ? "listings" : view, ...(view === "all" ? { all: "1" } : {}), ...(q ? { q } : {}) });
  const res = await api<{ listings?: Listing[]; sales?: Sale[]; trades?: Trade[] }>(`/api/admin/market?${query.toString()}`);
  if (res.status !== 200) return shell(h("p", { class: "error" }, "Không tải được số liệu."));

  if (res.data.sales) {
    const rows = res.data.sales.map((s) => [formatTime(s.createdAt), s.town, KIND[s.kind] ?? s.kind, s.seller ?? "(đã xóa)", s.buyer ?? "(đã xóa)", `${s.itemName}${s.qty > 1 ? ` x${s.qty}` : ""}`, `${num(s.price)} ${CURRENCY[s.currency] ?? s.currency}`, num(s.tax)]);
    return shell(rows.length > 0 ? table(["Lúc", "Thành", "Loại", "Người bán", "Người mua", "Vật phẩm", "Giá", "Thuế"], rows) : h("p", { class: "muted" }, "Chưa có."));
  }
  if (res.data.trades) {
    const rows = res.data.trades.map((t) => [formatTime(t.createdAt), t.a ?? "(đã xóa)", items(t.itemsA), money(t.linhA, t.tnA), t.b ?? "(đã xóa)", items(t.itemsB), money(t.linhB, t.tnB)]);
    return shell(rows.length > 0 ? table(["Lúc", "Bên A", "A đưa", "A đưa tiền", "Bên B", "B đưa", "B đưa tiền"], rows) : h("p", { class: "muted" }, "Chưa có."));
  }
  const rows = (res.data.listings ?? []).map((l) => {
    const act: Node | string =
      l.status === "active"
        ? h("button", {
            type: "button",
            
            onclick: async () => {
              const reason = prompt(`Gỡ tin «${l.itemName}» của ${l.seller ?? "?"}? Đồ về thư người bán${l.topBid > 0 ? ", tiền người đặt giá cao nhất được hoàn" : ""}. Lý do (tùy chọn):`);
              if (reason === null) return;
              const r = await api<{ error?: string }>("/api/admin/market/takedown", { method: "POST", body: { id: l.id, reason } });
              if (r.status === 200) go({});
              else msg.textContent = r.data.error === "gone" ? "Tin đã đóng, tải lại danh sách." : "Không gỡ được.";
            },
          }, "Gỡ")
        : "";
    return [formatTime(l.createdAt), l.town, KIND[l.kind] ?? l.kind, l.seller ?? "(đã xóa)", `${l.itemName}${l.qty > 1 ? ` x${l.qty}` : ""}`, `${num(l.price)} ${CURRENCY[l.currency] ?? l.currency}`, l.topBid > 0 ? `${num(l.topBid)} (${l.topBidder ?? "?"})` : "-", STATUS[l.status] ?? l.status, formatTime(l.endsAt), act];
  });
  return shell(rows.length > 0 ? table(["Đăng lúc", "Thành", "Loại", "Người bán", "Vật phẩm", "Giá", "Giá cao nhất", "Trạng thái", "Hết hạn", ""], rows) : h("p", { class: "muted" }, "Không có tin nào."));
}

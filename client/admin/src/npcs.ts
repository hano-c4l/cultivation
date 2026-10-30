import { npcLookSection } from "./looks";
import { api, h, listView, navigate } from "./kit";

/**
 * "NPC" (PHASE3 3k): where each NPC stands and what it is called, the stock and buying rules of the NPCs that trade (merchant, alchemist, blacksmith with a shop),
 * and the alchemist's recipes. The server checks everything again on every save.
 */

interface Npc {
  id: string;
  mapId: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  sort: number;
  enabled: boolean;
  updatedAt: number;
  seed: boolean;
  hasStock: boolean;
  quests: string[];
}

interface Meta {
  maps: Array<{ id: string; size: number; realm: number | null; safe: boolean }>;
  kinds: string[];
  addable: string[];
  limits: { name: number };
  interactRadius: number;
}

type Rule =
  | { id: string; kind: "item"; item: string; price?: number; currency?: "tien_ngoc"; dailyLimit?: number }
  | { id: string; kind: "gear"; realms: number[]; tiers: number[]; grade: number; elements?: string[]; priceMult?: number }
  | { id: string; kind: "keep_level" };

interface MerchantView {
  merchant: { id: string; mapId: string; nameVi: string; sellRate: number; buys: string[] | null; stock: Rule[] };
  updatedAt: number;
  meta: { items: Array<{ id: string; nameVi: string }>; categories: string[]; elements: string[] };
}

const KIND_LABEL: Record<string, string> = { merchant: "Thương nhân", quest: "Giao nhiệm vụ", smith: "Thợ rèn", alchemist: "Đan Sư", waygate: "Truyền Tống Trận" };
const CATEGORY_LABEL: Record<string, string> = { pill: "Đan dược", gear: "Trang bị", artifact: "Pháp bảo", book: "Bí tịch", material: "Nguyên liệu" };

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu mục này. Hãy quay lại danh sách và mở lại.",
  exists: "Đã có NPC (hoặc cửa hàng) mang mã này.",
  not_found: "Không tìm thấy.",
  unchanged: "Không có gì thay đổi.",
  busy: "Dữ liệu vừa đổi. Hãy thử lại.",
  locked: "Không đổi được loại NPC; NPC có sẵn của game không xóa được (hãy tắt).",
  in_use: "Không tắt hoặc xóa được: các nhiệm vụ dưới đây còn dùng NPC này (người giao hoặc người cần nói chuyện). Hãy gỡ ở các nhiệm vụ đó trước:",
};

const PROBLEM_TEXT: Record<string, string> = {
  outside: "Vị trí nằm ngoài khu chơi của bản đồ.",
  unreachable: "Người chơi không đứng gần vị trí này được (bị chặn hết trong tầm 2,5 ô).",
  name: "Tên phải từ 1 đến 40 ký tự.",
  id: "Mã chỉ gồm a-z, 0-9, _ (tối đa 24 ký tự).",
  position: "Vị trí không hợp lệ.",
  sort: "Thứ tự là số nguyên từ 0 đến 1000.",
  kind: "Loại NPC này không thêm mới được.",
};

function select(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = h("select", null, ...options.map(([v, l]) => h("option", { value: v }, l)));
  s.value = value;
  return s;
}

function num(value: number | undefined, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "number", step: "any", ...extra });
  i.value = value === undefined ? "" : String(value);
  return i;
}

function text(value: string, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "text", ...extra });
  i.value = value;
  return i;
}

function field(label: string, ...children: Array<Node | null>): HTMLElement {
  return h("label", { class: "filter wide-field" }, label, ...children);
}

function tabs(active: "npcs" | "alchemy" | "numbers"): HTMLElement {
  const link = (href: string, label: string, on: boolean) => h("a", { href, class: on ? "active" : "" }, label);
  return h("div", { class: "toolbar" }, link("/admin/npcs", "NPC", active === "npcs"), link("/admin/npcs/alchemy", "Công thức luyện đan", active === "alchemy"), link("/admin/npcs/numbers", "Con số (Thợ Rèn, Đạo Sư, Vạn Bảo Lâu)", active === "numbers"));
}

function messageBox(): { msg: HTMLElement; problems: HTMLElement; show: (text: string, cls: string, list?: string[]) => void } {
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  return {
    msg,
    problems,
    show: (t, cls, list = []) => {
      msg.textContent = t;
      msg.className = `msg ${cls}`;
      problems.replaceChildren(...list.map((p) => h("li", null, PROBLEM_TEXT[p] ?? p)));
    },
  };
}

async function loadNpcs(): Promise<{ npcs: Npc[]; meta: Meta } | null> {
  const res = await api<{ npcs: Npc[]; meta: Meta }>("/api/admin/npcs");
  return res.status === 200 ? res.data : null;
}

export function npcListPage(): HTMLElement {
  const root = h("div");
  void loadNpcs().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const add = h("button", { type: "button", class: "primary" }, "+ Thêm NPC");
    add.addEventListener("click", () => navigate("/admin/npcs/edit"));
    const key = (n: Npc, k: string): string | number => (k === "map" ? n.mapId : k === "name" ? n.name : k === "kind" ? n.kind : k === "sort" ? n.sort : k === "quests" ? n.quests.length : n.id);
    root.replaceChildren(
      tabs("npcs"),
      h("p", { class: "muted" }, "NPC đổi có hiệu lực với máy chủ sau tối đa 30 giây; người chơi thấy NPC mới khi vào lại game hoặc đổi bản đồ. NPC có sẵn của game chỉ tắt được, không xóa."),
      listView<Npc>({
        columns: [
          { key: "map", label: "Bản đồ", sortable: true, render: (n) => n.mapId },
          { key: "id", label: "Mã", sortable: true, render: (n) => n.id },
          { key: "name", label: "Tên", sortable: true, render: (n) => n.name },
          { key: "kind", label: "Loại", sortable: true, render: (n) => KIND_LABEL[n.kind] ?? n.kind },
          { key: "pos", label: "Vị trí", render: (n) => `${n.x}, ${n.y}` },
          { key: "sort", label: "Thứ tự", sortable: true, render: (n) => String(n.sort) },
          { key: "stock", label: "Cửa hàng", render: (n) => (n.hasStock ? "có" : "") },
          { key: "quests", label: "Nhiệm vụ nhắc tới", sortable: true, render: (n) => String(n.quests.length) },
          { key: "state", label: "Trạng thái", render: (n) => (n.enabled ? "Bật" : "Tắt") },
        ],
        defaultSort: { key: "map", dir: "asc" },
        searchPlaceholder: "Tìm theo mã, tên, bản đồ, loại...",
        toolbar: [add],
        rowHref: (n) => `/admin/npcs/edit?map=${encodeURIComponent(n.mapId)}&id=${encodeURIComponent(n.id)}`,
        fetchPage: async (q) => {
          const needle = q.q.toLowerCase();
          let rows = data.npcs.filter((x) => !needle || [x.id, x.name, x.mapId, x.kind, KIND_LABEL[x.kind] ?? ""].some((s) => s.toLowerCase().includes(needle)));
          rows = [...rows].sort((a, b) => {
            const av = key(a, q.sort);
            const bv = key(b, q.sort);
            const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "vi") || a.sort - b.sort;
            return q.dir === "asc" ? c : -c;
          });
          return { rows: rows.slice((q.page - 1) * q.size, q.page * q.size), total: rows.length };
        },
      }),
    );
  });
  return root;
}

export function npcEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const params = new URLSearchParams(location.search);
  const mapId = params.get("map");
  const id = params.get("id");
  void loadNpcs().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const current = mapId && id ? data.npcs.find((n) => n.mapId === mapId && n.id === id) : undefined;
    if (id && !current) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy NPC."), h("a", { href: "/admin/npcs" }, "‹ Danh sách"));
    root.replaceChildren(form(data.meta, current));
    if (current?.hasStock) root.append(stockSection(current));
    if (current && current.kind !== "waygate") void npcLookSection(current.id, current.kind).then((node) => root.append(node));
  });
  return root;
}

function form(meta: Meta, current: Npc | undefined): HTMLElement {
  const n: Npc = current ?? { id: "", mapId: meta.maps[0]?.id ?? "town", kind: meta.addable[0] ?? "merchant", name: "", x: 0, y: 0, sort: 50, enabled: true, updatedAt: 0, seed: false, hasStock: false, quests: [] };
  const { msg, problems, show } = messageBox();
  const idInput = text(n.id, { maxlength: "24", placeholder: "ma_npc (a-z, 0-9, _)" });
  idInput.disabled = current !== undefined;
  const map = select(meta.maps.map((m): [string, string] => [m.id, `${m.id} (${m.size} × ${m.size}${m.safe ? ", an toàn" : ""})`]), n.mapId);
  map.disabled = current !== undefined;
  const kindOptions = current ? meta.kinds : meta.addable;
  const kind = select(kindOptions.map((k): [string, string] => [k, KIND_LABEL[k] ?? k]), n.kind);
  kind.disabled = current !== undefined;
  const name = text(n.name, { maxlength: String(meta.limits.name) });
  const x = num(n.x, { min: "0", step: "0.5" });
  const y = num(n.y, { min: "0", step: "0.5" });
  const sort = num(n.sort, { min: "0", max: "1000", step: "1" });
  const enabled = h("input", { type: "checkbox" });
  enabled.checked = n.enabled;

  const collect = () => ({ id: idInput.value.trim(), mapId: map.value, kind: kind.value, name: name.value, x: Number(x.value), y: Number(y.value), sort: Number(sort.value), enabled: enabled.checked });
  const fail = (res: { status: number; data: { error?: string; problems?: string[] } }) => {
    const e = res.data.error ?? "";
    show(ERRORS[e] ?? (e === "invalid" ? "NPC không hợp lệ:" : `Lỗi ${res.status}.`), "err", e === "invalid" || e === "in_use" ? res.data.problems ?? [] : []);
  };
  const save = h("button", { type: "button", class: "primary" }, current ? "Lưu" : "Thêm NPC");
  save.addEventListener("click", async () => {
    save.disabled = true;
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/npcs/save", { method: "POST", body: { npc: collect(), isNew: current === undefined, updatedAt: current?.updatedAt ?? 0 } });
    save.disabled = false;
    if (res.status === 200) return navigate("/admin/npcs");
    fail(res);
  });
  const del = h("button", { type: "button" }, "Xóa NPC");
  del.disabled = current === undefined || current.seed;
  del.title = current?.seed ? "NPC có sẵn của game chỉ tắt được" : "";
  del.addEventListener("click", async () => {
    if (!current || !window.confirm(`Xóa NPC «${current.name}»?${current.hasStock ? " Cửa hàng của nó cũng bị xóa." : ""}`)) return;
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/npcs/delete", { method: "POST", body: { mapId: current.mapId, id: current.id, updatedAt: current.updatedAt } });
    if (res.status === 200) return navigate("/admin/npcs");
    fail(res);
  });
  return h(
    "div",
    null,
    h("a", { href: "/admin/npcs" }, "‹ Danh sách NPC"),
    h("h2", null, current ? `Sửa NPC: ${n.name}` : "Thêm NPC"),
    current ? h("p", { class: "muted" }, `${n.seed ? "NPC có sẵn của game. " : ""}${n.quests.length ? `Các nhiệm vụ nhắc tới: ${n.quests.join(", ")}. ` : ""}Loại, bản đồ và mã không đổi được sau khi tạo.`) : h("p", { class: "muted" }, "Thương nhân và Đan Sư mới có cửa hàng trống: thêm hàng ở mục Cửa hàng sau khi tạo. Truyền Tống Trận không thêm mới được."),
    h(
      "section",
      { class: "form" },
      field("Mã", idInput),
      field("Bản đồ", map),
      field("Loại", kind),
      field("Tên", name),
      h("div", { class: "toolbar" }, field("Vị trí x (ô)", x), field("Vị trí y (ô)", y)),
      h("div", { class: "muted" }, `Người chơi phải đứng được trong tầm ${meta.interactRadius - 0.5} ô quanh vị trí. Chỗ đang đặt NPC có sẵn bị chặn trong lưới bản đồ nên không chuyển NPC ra xa quá tầm.`),
      field("Thứ tự", sort),
      h("label", { class: "radio" }, enabled, "Bật (đang đứng trong game)"),
    ),
    h("div", { class: "toolbar" }, save, del),
    msg,
    problems,
  );
}

/** One stock rule as a row of inputs; `read()` gives the rule back. */
function ruleRow(rule: Rule, items: MerchantView["meta"]["items"], elements: string[], remove: () => void): { node: HTMLElement; read: () => Rule } {
  const kind = select([["item", "Một món"], ["gear", "Bộ trang bị"], ["keep_level", "Hộ Cấp Phù (Tiên Ngọc)"]], rule.kind);
  const id = text(rule.id, { maxlength: "60", placeholder: "mã luật (a-z, 0-9, _, .)", size: "18" });
  const dlId = `items-${Math.random().toString(36).slice(2)}`;
  const list = h("datalist", { id: dlId }, ...items.map((i) => h("option", { value: i.id }, i.nameVi)));
  const item = text(rule.kind === "item" ? rule.item : "", { list: dlId, placeholder: "mã vật phẩm", size: "18" });
  const price = num(rule.kind === "item" ? rule.price : undefined, { min: "1", step: "1", placeholder: "giá (trống: theo giá trị)" });
  const tienNgoc = h("input", { type: "checkbox" });
  tienNgoc.checked = rule.kind === "item" && rule.currency === "tien_ngoc";
  const daily = num(rule.kind === "item" ? rule.dailyLimit : undefined, { min: "1", step: "1", placeholder: "giới hạn/ngày" });
  const realms = text(rule.kind === "gear" ? rule.realms.join(",") : "0", { size: "8", title: "Cảnh giới (0 Luyện Khí, 1 Trúc Cơ, 2 Kim Đan, 3 Nguyên Anh, 4 Hóa Thần, 5 Luyện Hư), cách nhau dấu phẩy" });
  const tiers = text(rule.kind === "gear" ? rule.tiers.join(",") : "1", { size: "8", title: "Bậc 1-9, cách nhau dấu phẩy" });
  const grade = num(rule.kind === "gear" ? rule.grade : 1, { min: "1", max: "4", step: "1" });
  const els = text(rule.kind === "gear" && rule.elements ? rule.elements.join(",") : "", { size: "14", placeholder: `hệ (trống: ngũ hành); ${elements.join(",")}` });
  const mult = num(rule.kind === "gear" ? rule.priceMult : undefined, { min: "0.01", step: "any", placeholder: "nhân giá" });
  const itemBox = h("span", { class: "toolbar" }, item, list, price, h("label", { class: "radio" }, tienNgoc, "Tiên Ngọc"), daily);
  const gearBox = h("span", { class: "toolbar" }, h("span", null, "CG:"), realms, h("span", null, "Bậc:"), tiers, h("span", null, "Phẩm:"), grade, els, mult);
  const sync = () => {
    itemBox.hidden = kind.value !== "item";
    gearBox.hidden = kind.value !== "gear";
  };
  kind.addEventListener("change", sync);
  sync();
  const rm = h("button", { type: "button" }, "✕");
  rm.addEventListener("click", remove);
  const ints = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean).map(Number);
  const opt = (el: HTMLInputElement) => (el.value.trim() === "" ? undefined : Number(el.value));
  const read = (): Rule => {
    if (kind.value === "keep_level") return { id: id.value.trim(), kind: "keep_level" };
    if (kind.value === "gear") {
      const elList = els.value.split(",").map((t) => t.trim()).filter(Boolean);
      const pm = opt(mult);
      return { id: id.value.trim(), kind: "gear", realms: ints(realms.value), tiers: ints(tiers.value), grade: Number(grade.value), ...(elList.length ? { elements: elList } : {}), ...(pm !== undefined ? { priceMult: pm } : {}) };
    }
    const p = opt(price);
    const d = opt(daily);
    return { id: id.value.trim(), kind: "item", item: item.value.trim(), ...(p !== undefined ? { price: p } : {}), ...(tienNgoc.checked ? { currency: "tien_ngoc" as const } : {}), ...(d !== undefined ? { dailyLimit: d } : {}) };
  };
  return { node: h("div", { class: "toolbar" }, kind, id, itemBox, gearBox, rm), read };
}

function stockSection(npc: Npc): HTMLElement {
  const root = h("section", { class: "form" }, h("h3", null, "Cửa hàng"), h("p", { class: "muted" }, "Đang tải..."));
  void api<MerchantView & { error?: string }>(`/api/admin/merchant?npc=${encodeURIComponent(npc.id)}`).then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("h3", null, "Cửa hàng"), h("p", { class: "err" }, "Không tải được cửa hàng."));
    const view = res.data;
    const m = view.merchant;
    const { msg, problems, show } = messageBox();
    const rate = num(m.sellRate, { min: "0", max: "1", step: "0.01" });
    const all = h("input", { type: "checkbox" });
    all.checked = m.buys === null;
    const cats = view.meta.categories.map((c) => {
      const box = h("input", { type: "checkbox" });
      box.checked = m.buys === null || m.buys.includes(c);
      return { c, box };
    });
    const syncCats = () => {
      for (const { box } of cats) box.disabled = all.checked;
    };
    all.addEventListener("change", syncCats);
    syncCats();
    const rows = h("div");
    const readers: Array<() => Rule> = [];
    const addRow = (rule: Rule) => {
      const row = ruleRow(rule, view.meta.items, view.meta.elements, () => {
        row.node.remove();
        readers.splice(readers.indexOf(row.read), 1);
      });
      readers.push(row.read);
      rows.append(row.node);
    };
    for (const rule of m.stock) addRow(rule);
    const add = h("button", { type: "button" }, "+ Thêm luật hàng");
    add.addEventListener("click", () => addRow({ id: "", kind: "item", item: "" }));
    const save = h("button", { type: "button", class: "primary" }, "Lưu cửa hàng");
    save.addEventListener("click", async () => {
      save.disabled = true;
      show("Đang lưu...", "muted");
      const buys = all.checked ? null : cats.filter((x) => x.box.checked).map((x) => x.c);
      const r = await api<{ error?: string; problems?: string[] }>("/api/admin/merchant/save", { method: "POST", body: { npc: npc.id, sellRate: Number(rate.value), buys, stock: readers.map((f) => f()), updatedAt: view.updatedAt } });
      save.disabled = false;
      if (r.status === 200) return navigate(location.pathname + location.search);
      const e = r.data.error ?? "";
      show(ERRORS[e] ?? (e === "invalid" ? "Cửa hàng không hợp lệ (mã vật phẩm phải có thật, mã luật không trùng):" : `Lỗi ${r.status}.`), "err", e === "invalid" ? r.data.problems ?? [] : []);
    });
    root.replaceChildren(
      h("h3", null, "Cửa hàng"),
      h("p", { class: "muted" }, "Thay đổi có hiệu lực với máy chủ sau tối đa 30 giây; người chơi thấy hàng mới khi mở lại cửa hàng. Mỗi luật là một món hoặc cả bộ trang bị (theo cảnh giới, bậc, phẩm). Giá để trống: lấy theo giá trị vật phẩm."),
      field("Giá thu mua (phần của giá trị vật phẩm, 0-1)", rate),
      h("div", { class: "toolbar" }, h("label", { class: "radio" }, all, "Thu mua mọi loại"), ...cats.map(({ c, box }) => h("label", { class: "radio" }, box, CATEGORY_LABEL[c] ?? c))),
      rows,
      add,
      h("div", { class: "toolbar" }, save),
      msg,
      problems,
    );
  });
  return root;
}

interface Recipe {
  id: string;
  nameVi: string;
  output: string;
  qty: number;
  inputs: Array<{ item: string; qty: number }>;
  linhThach: number;
  seconds: number;
  enabled: boolean;
}

interface AlchemyView {
  alchemy: { maxJobs: number; recipes: Recipe[] };
  updatedAt: number;
  items: Array<{ id: string; nameVi: string }>;
}

export function alchemyPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  void api<AlchemyView>("/api/admin/alchemy").then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const view = res.data;
    const { msg, problems, show } = messageBox();
    const dlId = "alchemy-items";
    const list = h("datalist", { id: dlId }, ...view.items.map((i) => h("option", { value: i.id }, i.nameVi)));
    const maxJobs = num(view.alchemy.maxJobs, { min: "1", max: "20", step: "1" });
    const rows = h("div");
    const readers: Array<() => Recipe> = [];
    const addRecipe = (r: Recipe) => {
      const id = text(r.id, { maxlength: "40", size: "16", placeholder: "mã công thức" });
      const name = text(r.nameVi, { maxlength: "60", size: "22", placeholder: "tên" });
      const output = text(r.output, { list: dlId, size: "16", placeholder: "đan làm ra" });
      const qty = num(r.qty, { min: "1", step: "1", title: "Số lượng làm ra" });
      const linh = num(r.linhThach, { min: "0", step: "1", title: "Linh Thạch" });
      const secs = num(r.seconds, { min: "1", step: "1", title: "Thời gian (giây)" });
      const enabled = h("input", { type: "checkbox" });
      enabled.checked = r.enabled;
      const inputs = h("div");
      const addInput = (item = "", q = 1) => {
        const rm = h("button", { type: "button" }, "✕");
        const row = h("div", { class: "toolbar" }, text(item, { list: dlId, size: "16", placeholder: "nguyên liệu" }), num(q, { min: "1", step: "1" }), rm);
        rm.addEventListener("click", () => row.remove());
        inputs.append(row);
      };
      for (const i of r.inputs) addInput(i.item, i.qty);
      const addInputBtn = h("button", { type: "button" }, "+ Nguyên liệu");
      addInputBtn.addEventListener("click", () => addInput());
      const box = h("div", { class: "form" });
      const read = (): Recipe => ({
        id: id.value.trim(),
        nameVi: name.value.trim(),
        output: output.value.trim(),
        qty: Number(qty.value),
        inputs: [...inputs.children].map((row) => ({ item: (row.querySelectorAll("input")[0] as HTMLInputElement).value.trim(), qty: Number((row.querySelectorAll("input")[1] as HTMLInputElement).value) })),
        linhThach: Number(linh.value),
        seconds: Number(secs.value),
        enabled: enabled.checked,
      });
      const rm = h("button", { type: "button" }, "Xóa công thức");
      rm.addEventListener("click", () => {
        box.remove();
        readers.splice(readers.indexOf(read), 1);
      });
      box.append(h("div", { class: "toolbar" }, id, name, h("label", { class: "radio" }, enabled, "Bật"), rm), h("div", { class: "toolbar" }, h("span", null, "Làm ra:"), output, h("span", null, "×"), qty, h("span", null, "Linh Thạch:"), linh, h("span", null, "Giây:"), secs), h("div", { class: "muted" }, "Nguyên liệu bị lấy ngay khi bắt đầu luyện:"), inputs, addInputBtn);
      readers.push(read);
      rows.append(box);
    };
    for (const r of view.alchemy.recipes) addRecipe(r);
    const add = h("button", { type: "button" }, "+ Thêm công thức");
    add.addEventListener("click", () => addRecipe({ id: "", nameVi: "", output: "", qty: 1, inputs: [{ item: "", qty: 1 }], linhThach: 0, seconds: 60, enabled: true }));
    const save = h("button", { type: "button", class: "primary" }, "Lưu công thức");
    save.addEventListener("click", async () => {
      save.disabled = true;
      show("Đang lưu...", "muted");
      const r = await api<{ error?: string; problems?: string[] }>("/api/admin/alchemy/save", { method: "POST", body: { alchemy: { maxJobs: Number(maxJobs.value), recipes: readers.map((f) => f()) }, updatedAt: view.updatedAt } });
      save.disabled = false;
      if (r.status === 200) return navigate("/admin/npcs/alchemy");
      const e = r.data.error ?? "";
      show(ERRORS[e] ?? (e === "invalid" ? "Công thức không hợp lệ (mã công thức a-z 0-9 _ không trùng, mã vật phẩm phải có thật, 1-6 nguyên liệu khác nhau):" : `Lỗi ${r.status}.`), "err", e === "invalid" ? r.data.problems ?? [] : []);
    });
    root.replaceChildren(
      tabs("alchemy"),
      list,
      h("p", { class: "muted" }, "Mẻ đang luyện giữ kết quả đã định lúc bắt đầu; đổi hay xóa công thức không ảnh hưởng chúng. Máy chủ nhận công thức mới sau tối đa 30 giây; người chơi thấy khi mở lại Đan Sư."),
      field("Số mẻ một nhân vật được luyện cùng lúc (kể cả mẻ xong chưa nhận)", maxJobs),
      rows,
      add,
      h("div", { class: "toolbar" }, save),
      msg,
      problems,
    );
  });
  return root;
}

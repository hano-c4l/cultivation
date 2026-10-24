import { api, h, listView, navigate } from "./kit";

/** "Vật phẩm" (PHASE3 3g): the catalogue of plain items (equipment comes from templates) as a list and a form. */

interface ItemDef {
  id: string;
  nameVi: string;
  descVi: string;
  category: string;
  maxStack: number;
  rarity: string;
  grade: number;
  healFraction?: number;
  healOverMs?: number;
  masteryPills?: number;
  teaches?: string;
  breakthroughTo?: number;
  teleportTo?: string;
  pathItem?: string;
  disabled?: boolean;
}

interface Entry {
  def: ItemDef;
  custom: boolean;
  disabled: boolean;
  updatedAt: number;
  value: number;
  owned: number;
  maxQty: number;
  gifts: number;
}

interface Listing {
  items: Entry[];
  valueToken: number;
  meta: { categories: string[]; rarities: string[]; maxGrade: number; limits: { name: number; description: number } };
}

const CATEGORY_VI: Record<string, string> = { consumable: "Đan dược / dùng được", material: "Nguyên liệu", skill_book: "Bí tịch", equipment: "Trang bị" };
const RARITY_VI: Record<string, string> = { common: "Phổ thông", uncommon: "Tốt", rare: "Hiếm", epic: "Cực hiếm" };

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu (vật phẩm hoặc giá trị). Hãy quay lại danh sách và mở lại.",
  exists: "Mã vật phẩm này đã dùng.",
  has_owner: "Mã này còn vật phẩm trong túi của nhân vật, hãy chọn mã khác.",
  deleted: "Vật phẩm đã bị xóa nên không sửa được nữa.",
  not_found: "Không tìm thấy vật phẩm.",
  unchanged: "Không có gì thay đổi.",
  busy: "Dữ liệu vừa đổi, hãy thử lại.",
  locked_field: "Đã có người sở hữu nên không đổi được loại hoặc hạ số xếp chồng xuống dưới số đang có.",
  bound: "Vật phẩm của hệ thống không xóa được.",
  in_use: "Không xóa được: vật phẩm đang được dùng ở các chỗ dưới đây. Hãy gỡ chúng trước:",
};

async function load(): Promise<Listing | null> {
  const res = await api<Listing>("/api/admin/items");
  return res.status === 200 ? res.data : null;
}

function option(value: string, label: string): HTMLOptionElement {
  return h("option", { value }, label);
}

function select(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = h("select", null, ...options.map(([v, l]) => option(v, l)));
  s.value = value;
  return s;
}

function num(value: number | undefined, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "number", step: "any", ...extra });
  i.value = value === undefined ? "" : String(value);
  return i;
}

function field(label: string, ...children: Array<Node | null>): HTMLElement {
  return h("label", { class: "filter wide-field" }, label, ...children);
}

export function itemListPage(): HTMLElement {
  const root = h("div");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const add = h("button", { type: "button", class: "primary" }, "+ Thêm vật phẩm");
    add.addEventListener("click", () => navigate("/admin/items/edit"));
    const key = (e: Entry, k: string): string | number => (k === "name" ? e.def.nameVi : k === "category" ? e.def.category : k === "rarity" ? e.def.rarity : k === "grade" ? e.def.grade : k === "value" ? e.value : k === "owned" ? e.owned : e.def.id);
    root.replaceChildren(
      h("p", { class: "muted" }, "Vật phẩm của hệ thống (nền xám) chỉ sửa được tên, mô tả, độ hiếm, phẩm cấp và giá trị. Trang bị sinh từ mẫu nên chưa có ở đây. Người đang online thấy tên mới khi vào lại game; số mới có hiệu lực với máy chủ sau tối đa 30 giây."),
      listView<Entry>({
        columns: [
          { key: "id", label: "Mã", sortable: true, render: (e) => e.def.id },
          { key: "name", label: "Tên", sortable: true, render: (e) => e.def.nameVi },
          { key: "category", label: "Loại", sortable: true, render: (e) => CATEGORY_VI[e.def.category] ?? e.def.category },
          { key: "rarity", label: "Độ hiếm", sortable: true, render: (e) => RARITY_VI[e.def.rarity] ?? e.def.rarity },
          { key: "grade", label: "Phẩm", sortable: true, render: (e) => String(e.def.grade) },
          { key: "value", label: "Giá trị", sortable: true, render: (e) => (e.value ? String(e.value) : "—") },
          { key: "owned", label: "Đang sở hữu", sortable: true, render: (e) => `${e.owned}${e.gifts ? ` (+${e.gifts} thư quà)` : ""}` },
          { key: "source", label: "Nguồn", render: (e) => (e.disabled ? "Đã xóa (mềm)" : e.custom ? "Do admin tạo" : "Hệ thống") },
        ],
        defaultSort: { key: "id", dir: "asc" },
        searchPlaceholder: "Tìm theo mã hoặc tên...",
        filters: [{ key: "category", label: "Loại", kind: "select", options: [["", "Tất cả"], ...Object.entries(CATEGORY_VI).filter(([k]) => k !== "equipment")] }],
        toolbar: [add],
        rowHref: (e) => `/admin/items/edit?id=${encodeURIComponent(e.def.id)}`,
        fetchPage: async (q) => {
          const needle = q.q.toLowerCase();
          let rows = data.items.filter((e) => (!needle || e.def.id.toLowerCase().includes(needle) || e.def.nameVi.toLowerCase().includes(needle)) && (!q.extra.category || e.def.category === q.extra.category));
          rows = [...rows].sort((a, b) => {
            const av = key(a, q.sort);
            const bv = key(b, q.sort);
            const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "vi");
            return q.dir === "asc" ? c : -c;
          });
          return { rows: rows.slice((q.page - 1) * q.size, q.page * q.size), total: rows.length };
        },
      }),
    );
  });
  return root;
}

export function itemEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const current = id ? data.items.find((i) => i.def.id === id) : undefined;
    if (id && !current) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy vật phẩm."), h("a", { href: "/admin/items" }, "‹ Danh sách"));
    root.replaceChildren(form(data, current));
  });
  return root;
}

function form(data: Listing, current: Entry | undefined): HTMLElement {
  const isNew = current === undefined;
  const system = current !== undefined && !current.custom; // an item of the code
  const locked = current?.disabled === true;
  const owned = (current?.owned ?? 0) > 0 || (current?.gifts ?? 0) > 0;
  const d: ItemDef = current?.def ?? { id: "", nameVi: "", descVi: "", category: "consumable", maxStack: 99, rarity: "common", grade: 1 };
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });

  const idInput = h("input", { type: "text", maxlength: "40", placeholder: "ma_vat_pham (a-z, 0-9, _)" });
  idInput.value = d.id;
  idInput.disabled = !isNew;
  const name = h("input", { type: "text", maxlength: String(data.meta.limits.name) });
  name.value = d.nameVi;
  const desc = h("textarea", { rows: "3", maxlength: String(data.meta.limits.description) });
  desc.value = d.descVi;
  const rarity = select(data.meta.rarities.map((r): [string, string] => [r, RARITY_VI[r] ?? r]), d.rarity);
  const grade = num(d.grade, { min: "1", max: String(data.meta.maxGrade), step: "1" });
  const category = select(data.meta.categories.map((c): [string, string] => [c, CATEGORY_VI[c] ?? c]), d.category);
  const stack = num(d.maxStack, { min: "1", max: "9999", step: "1" });
  const heal = num(d.healFraction !== undefined ? Math.round(d.healFraction * 100) : undefined, { min: "1", max: "100", placeholder: "% sinh lực" });
  const healSecs = num(d.healOverMs !== undefined ? d.healOverMs / 1000 : undefined, { min: "0", placeholder: "giây (trống = hồi ngay)" });
  const mastery = num(d.masteryPills, { min: "1", step: "1", placeholder: "điểm thuần thục" });
  const value = num(current?.value || undefined, { min: "0", step: "1", placeholder: "Linh Thạch (trống = không bán được)" });
  if (system || locked) for (const el of [category, stack, heal, healSecs, mastery]) el.disabled = true;
  if (locked) for (const el of [name, desc, rarity, grade, value]) el.disabled = true;
  if (!isNew && owned && !system) category.disabled = true;

  const mechanics = h(
    "section",
    { class: "form" },
    h("h3", null, "Cơ chế"),
    system
      ? h("p", { class: "muted" }, "Vật phẩm của hệ thống: loại, số xếp chồng và công dụng gắn với cơ chế trong game nên không sửa ở đây.")
      : h("p", { class: "muted" }, "Dùng được: hồi sinh lực theo phần trăm (có thể thấm dần trong vài giây) hoặc cộng điểm thuần thục cho kỹ năng (chọn một trong hai). Nguyên liệu không có công dụng riêng."),
    field("Loại", category),
    field("Số xếp chồng tối đa", stack),
    field("Hồi sinh lực (%)", heal),
    field("Thấm dần trong (giây)", healSecs),
    field("Cộng điểm thuần thục", mastery),
  );
  const syncMech = () => {
    const consumable = category.value === "consumable";
    for (const el of [heal, healSecs, mastery]) el.closest("label")!.hidden = !consumable;
  };
  category.addEventListener("change", syncMech);
  syncMech();

  const save = h("button", { type: "button", class: "primary" }, isNew ? "Tạo vật phẩm" : "Lưu");
  save.disabled = locked;
  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };
  save.addEventListener("click", async () => {
    const item: Record<string, unknown> = { id: idInput.value.trim(), nameVi: name.value, descVi: desc.value, rarity: rarity.value, grade: Number(grade.value) };
    if (!system) {
      item.category = category.value;
      item.maxStack = Number(stack.value);
      if (category.value === "consumable") {
        if (heal.value.trim() !== "") item.healFraction = Number(heal.value) / 100;
        if (heal.value.trim() !== "" && healSecs.value.trim() !== "" && Number(healSecs.value) > 0) item.healOverMs = Math.round(Number(healSecs.value) * 1000);
        if (mastery.value.trim() !== "") item.masteryPills = Number(mastery.value);
      }
    }
    const v = value.value.trim() === "" ? null : Number(value.value);
    save.disabled = true;
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/items/save", { method: "POST", body: { item, isNew, updatedAt: current?.updatedAt ?? 0, value: v, valueToken: data.valueToken } });
    save.disabled = locked;
    if (res.status === 200) return navigate("/admin/items");
    const e = res.data.error ?? "";
    show(ERRORS[e] ?? (e === "invalid" ? "Vật phẩm không hợp lệ:" : `Lỗi ${res.status}.`), "err", e === "invalid" || e === "locked_field" ? res.data.problems ?? [] : []);
  });
  const del = h("button", { type: "button" }, "Xóa vật phẩm");
  del.disabled = isNew || system || locked;
  del.title = system ? "Vật phẩm của hệ thống không xóa được" : "";
  del.addEventListener("click", async () => {
    if (!current) return;
    const text = `Xóa «${current.def.nameVi}»?\n${owned ? "Có người đang sở hữu nên vật phẩm chỉ ngừng phát (xóa mềm): vẫn hiện trong túi nhưng không rơi, không bán, không tặng được." : "Không ai sở hữu nên sẽ xóa hẳn."}`;
    if (!window.confirm(text)) return;
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/items/delete", { method: "POST", body: { id: current.def.id, updatedAt: current.updatedAt } });
    if (res.status === 200) return navigate("/admin/items");
    show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err", res.data.problems ?? []);
  });

  return h(
    "div",
    null,
    h("a", { href: "/admin/items" }, "‹ Danh sách vật phẩm"),
    h("h2", null, isNew ? "Thêm vật phẩm" : `Sửa vật phẩm: ${d.nameVi}`),
    locked ? h("p", { class: "err" }, "Vật phẩm này đã bị xóa mềm (còn người sở hữu), chỉ xem.") : null,
    current ? h("p", { class: "muted" }, `${current.owned} đang trong túi và hòm thư của nhân vật${current.gifts ? `, ${current.gifts} thư quà chưa nhận` : ""}.${system ? " Vật phẩm của hệ thống." : ""}`) : null,
    h("section", { class: "form" }, field("Mã (không đổi được sau khi tạo)", idInput), field("Tên", name), field("Mô tả", desc), field("Độ hiếm", rarity), field(`Phẩm cấp (1-${data.meta.maxGrade})`, grade), field("Giá trị bán cho thương nhân (Linh Thạch)", value)),
    mechanics,
    h("div", { class: "toolbar" }, save, del),
    msg,
    problems,
  );
}

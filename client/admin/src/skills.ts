import { api, h, listView, navigate } from "./kit";

/** "Kỹ năng" (PHASE3 3h): the skills of the game and the changes admins made to them (name, description, power, cost, cooldown, reach, buff length, effect). */

interface Numbers {
  nameVi?: string;
  descVi?: string;
  power?: number;
  mpCost?: number;
  cooldownMs?: number;
  range?: number;
  buffDurationMs?: number;
  fx?: string;
}

interface Entry {
  id: string;
  template: boolean;
  kind: string;
  source: string;
  element: string | null;
  realm: number | null;
  base: { nameVi: string; descVi: string; power: number; mpCost: number; cooldownMs: number; range: number; buffDurationMs?: number; fx?: string };
  override: Numbers | null;
  templateOverride: Numbers | null;
  effective: { nameVi: string; power: number; mpCost: number; cooldownMs: number; range: number; buffDurationMs?: number };
  example: { power: number; mpCost: number; cooldownMs: number } | null;
  fields: string[];
}

interface Listing {
  skills: Entry[];
  token: number;
  limits: { name: number; description: number };
  fx: string[];
}

const KIND_VI: Record<string, string> = { attack: "Tấn công", heal: "Hồi máu", buff: "Tăng chỉ số", teleport: "Dịch chuyển", passive: "Bị động" };
const SOURCE_VI: Record<string, string> = { root: "Linh căn", gear: "Pháp bảo", sect: "Tông môn", learned: "Học từ bí tịch", path: "Hướng tu" };
const REALM_VI = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh"];
const FX_VI: Record<string, string> = { melee: "Cận chiến (chưởng, chém)", ranged: "Tầm xa (đạn bắn)" };

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu kỹ năng (cùng một bảng). Hãy quay lại danh sách và mở lại.",
  unknown_skill: "Không có kỹ năng này.",
  unchanged: "Không có gì thay đổi.",
};

async function load(): Promise<Listing | null> {
  const res = await api<Listing>("/api/admin/skills");
  return res.status === 200 ? res.data : null;
}

const secs = (ms: number) => String(Math.round(ms / 100) / 10);

export function skillListPage(): HTMLElement {
  const root = h("div");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const key = (e: Entry, k: string): string | number => (k === "name" ? e.effective.nameVi : k === "kind" ? e.kind : k === "source" ? e.source : k === "realm" ? e.realm ?? -1 : k === "mp" ? e.effective.mpCost : k === "cd" ? e.effective.cooldownMs : k === "power" ? e.effective.power : e.id);
    root.replaceChildren(
      h(
        "p",
        { class: "muted" },
        "Kỹ năng linh căn sinh từ 11 mẫu cho mỗi cảnh giới: sửa ở dòng mẫu (nền in đậm, mã không có số cuối) thì áp cho mọi cảnh giới, sửa ở một dòng riêng thì chỉ kỹ năng đó và thắng mẫu. Chưa tạo được kỹ năng mới hay đổi hình thức (nón, vòng tròn, tự bám mục tiêu, điều kiện dùng) ở đây. Máy chủ nhận số mới sau tối đa 30 giây; người chơi thấy tên, số và hiệu ứng mới khi vào lại game, đổi bản đồ hoặc mở cửa hàng; hồi chiêu đang chạy giữ độ dài cũ. Sức mạnh ở đây là giá trị gốc, sát thương thật còn nhân theo cảnh giới, bậc, phẩm cấp và độ thuần thục.",
      ),
      listView<Entry>({
        columns: [
          { key: "id", label: "Mã", sortable: true, render: (e) => (e.template ? h("b", null, e.id) : e.id) },
          { key: "name", label: "Tên", sortable: true, render: (e) => e.effective.nameVi },
          { key: "source", label: "Nguồn", sortable: true, render: (e) => (e.template ? "Mẫu linh căn (mọi cảnh giới)" : SOURCE_VI[e.source] ?? e.source) },
          { key: "kind", label: "Loại", sortable: true, render: (e) => KIND_VI[e.kind] ?? e.kind },
          { key: "realm", label: "Cảnh giới", sortable: true, render: (e) => (e.realm === null ? "—" : REALM_VI[e.realm] ?? String(e.realm)) },
          { key: "power", label: "Sức mạnh", sortable: true, render: (e) => String(Math.round(e.effective.power * 100) / 100) },
          { key: "mp", label: "MP", sortable: true, render: (e) => String(e.effective.mpCost) },
          { key: "cd", label: "Hồi chiêu (s)", sortable: true, render: (e) => secs(e.effective.cooldownMs) },
          { key: "changed", label: "Đã chỉnh", render: (e) => (e.override ? "Có" : e.templateOverride ? "Theo mẫu" : "") },
        ],
        defaultSort: { key: "id", dir: "asc" },
        searchPlaceholder: "Tìm theo mã hoặc tên...",
        filters: [
          { key: "kind", label: "Loại", kind: "select", options: [["", "Tất cả"], ...Object.entries(KIND_VI)] },
          { key: "source", label: "Nguồn", kind: "select", options: [["", "Tất cả"], ["template", "Mẫu linh căn"], ...Object.entries(SOURCE_VI)] },
          { key: "changed", label: "Đã chỉnh", kind: "select", options: [["", "Tất cả"], ["yes", "Chỉ đã chỉnh"]] },
        ],
        rowHref: (e) => `/admin/skills/edit?id=${encodeURIComponent(e.id)}`,
        fetchPage: async (q) => {
          const needle = q.q.toLowerCase();
          let rows = data.skills.filter(
            (e) =>
              (!needle || e.id.toLowerCase().includes(needle) || e.effective.nameVi.toLowerCase().includes(needle)) &&
              (!q.extra.kind || e.kind === q.extra.kind) &&
              (!q.extra.source || (q.extra.source === "template" ? e.template : !e.template && e.source === q.extra.source)) &&
              (q.extra.changed !== "yes" || e.override !== null),
          );
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

export function skillEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const current = data.skills.find((s) => s.id === id);
    if (!current) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy kỹ năng."), h("a", { href: "/admin/skills" }, "‹ Danh sách"));
    root.replaceChildren(form(data, current));
  });
  return root;
}

function field(label: string, ...children: Array<Node | null>): HTMLElement {
  return h("label", { class: "filter wide-field" }, label, ...children);
}

function form(data: Listing, e: Entry): HTMLElement {
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  const has = (k: string) => e.fields.includes(k);
  const own = e.override ?? {};
  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
  const rows: HTMLElement[] = [];

  const add = (k: string, label: string, make: () => HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, baseText: string, setBase: (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void) => {
    if (!has(k)) return;
    const el = make();
    inputs[k] = el;
    const reset = h("button", { type: "button", title: "Đặt ô này về giá trị của code" }, `mặc định ${baseText}`);
    reset.addEventListener("click", () => setBase(el));
    rows.push(field(label, el, reset));
  };
  const textInput = (value: string, max: number): HTMLInputElement => {
    const i = h("input", { type: "text", maxlength: String(max) });
    i.value = value;
    return i;
  };
  const numInput = (value: number | undefined, step = "any"): HTMLInputElement => {
    const i = h("input", { type: "number", step });
    i.value = value === undefined ? "" : String(value);
    return i;
  };
  const eff = e.effective;
  add("nameVi", "Tên", () => textInput(own.nameVi ?? eff.nameVi, data.limits.name), e.base.nameVi, (el) => (el.value = e.base.nameVi));
  add(
    "descVi",
    "Mô tả",
    () => {
      const t = h("textarea", { rows: "3", maxlength: String(data.limits.description) });
      t.value = own.descVi ?? (e.templateOverride?.descVi ?? e.base.descVi);
      return t;
    },
    "(của code)",
    (el) => (el.value = e.base.descVi),
  );
  add("power", e.kind === "attack" ? "Sức mạnh gốc (nhân với công của người dùng)" : e.kind === "heal" ? "Sức mạnh gốc (phần sinh lực tối đa hồi, 0,3 = 30%)" : "Sức mạnh gốc (phần chỉ số cộng thêm, 0,3 = +30%)", () => numInput(own.power ?? eff.power), String(e.base.power), (el) => (el.value = String(e.base.power)));
  add("mpCost", "MP gốc", () => numInput(own.mpCost ?? eff.mpCost, "1"), String(e.base.mpCost), (el) => (el.value = String(e.base.mpCost)));
  add("cooldownMs", "Hồi chiêu gốc (giây)", () => numInput((own.cooldownMs ?? eff.cooldownMs) / 1000), secs(e.base.cooldownMs), (el) => (el.value = String(e.base.cooldownMs / 1000)));
  add("range", "Tầm (ô)", () => numInput(own.range ?? eff.range), String(e.base.range), (el) => (el.value = String(e.base.range)));
  add("buffDurationMs", "Thời gian hiệu lực (giây)", () => numInput((own.buffDurationMs ?? eff.buffDurationMs ?? 0) / 1000), secs(e.base.buffDurationMs ?? 0), (el) => (el.value = String((e.base.buffDurationMs ?? 0) / 1000)));
  add(
    "fx",
    "Hiệu ứng người khác nhìn thấy",
    () => {
      const s = h("select", null, h("option", { value: "" }, "(theo mẫu của game)"), ...data.fx.map((f) => h("option", { value: f }, FX_VI[f] ?? f)));
      s.value = own.fx ?? "";
      return s;
    },
    "theo mẫu",
    (el) => (el.value = ""),
  );

  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };
  const send = async (fields: Record<string, unknown> | null) => {
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/skills/save", { method: "POST", body: { key: e.id, fields, token: data.token } });
    if (res.status === 200) return navigate("/admin/skills");
    const code = res.data.error ?? "";
    show(ERRORS[code] ?? (code === "invalid" ? "Giá trị không hợp lệ:" : `Lỗi ${res.status}.`), "err", code === "invalid" ? res.data.problems ?? [] : []);
  };
  const save = h("button", { type: "button", class: "primary" }, "Lưu");
  save.addEventListener("click", () => {
    const fields: Record<string, unknown> = {};
    for (const [k, el] of Object.entries(inputs)) {
      const raw = el.value.trim();
      if (k === "fx") {
        if (raw) fields.fx = raw;
      } else if (k === "nameVi" || k === "descVi") fields[k] = el.value;
      else {
        const n = Number(raw);
        if (raw === "" || !Number.isFinite(n)) return show(`Ô "${k}" chưa nhập số hợp lệ.`, "err");
        fields[k] = k === "cooldownMs" || k === "buffDurationMs" ? Math.round(n * 1000) : n;
      }
    }
    void send(fields);
  });
  const reset = h("button", { type: "button" }, "Về mặc định cả kỹ năng");
  reset.disabled = e.override === null;
  reset.addEventListener("click", () => {
    if (window.confirm(`Đưa «${e.base.nameVi}» về đúng số của code?`)) void send(null);
  });

  return h(
    "div",
    null,
    h("a", { href: "/admin/skills" }, "‹ Danh sách kỹ năng"),
    h("h2", null, `${e.template ? "Mẫu kỹ năng" : "Kỹ năng"}: ${e.effective.nameVi} (${e.id})`),
    h(
      "p",
      { class: "muted" },
      `${KIND_VI[e.kind] ?? e.kind}${e.template ? ", áp cho mọi cảnh giới (kỹ năng có dòng riêng thì thắng mẫu)" : ` · ${SOURCE_VI[e.source] ?? e.source}${e.realm !== null ? ` · ${REALM_VI[e.realm] ?? ""}` : ""}`}.${e.example ? ` Ví dụ ở cảnh giới và bậc 1 của kỹ năng, độ thuần thục đầu: sức mạnh ${Math.round(e.example.power * 100) / 100}, MP ${e.example.mpCost}, hồi chiêu ${secs(e.example.cooldownMs)} s.` : ""}`,
    ),
    e.templateOverride ? h("p", { class: "ok" }, "Mẫu của kỹ năng này đang có chỉnh sửa, và áp cho kỹ năng này; ô bên dưới là giá trị đang có hiệu lực. Dòng riêng sẽ thắng mẫu.") : null,
    h("p", { class: "muted" }, "Nhớ sửa mô tả nếu đổi thời gian hoặc số (nhiều mô tả có ghi sẵn số giây). Nút \"mặc định\" điền số của code; nếu mẫu đang có chỉnh sửa thì lưu số đó sẽ ghim riêng kỹ năng này, khác với bỏ trống theo mẫu (dùng \"Về mặc định cả kỹ năng\" để theo mẫu)."),
    e.source === "learned" ? h("p", { class: "muted" }, "Tên bí tịch (vật phẩm) không đổi theo: sửa ở màn Vật phẩm.") : null,
    h("section", { class: "form" }, ...rows),
    h("div", { class: "toolbar" }, save, reset),
    msg,
    problems,
  );
}

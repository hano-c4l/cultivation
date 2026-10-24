import { api, h, listView, navigate } from "./kit";
import { tuningPage } from "./misc";

/** "Thiên phú" (PHASE3 3i): the spiritual roots (a tuning page) and the constitutions (a catalogue editor, one constitution at a time). */

interface Effect {
  stat: string;
  targetKind: string;
  targetTag: string;
  mode: string;
  value: number;
}
interface Tier {
  tier: number;
  nameVi: string;
  rollWeight: number;
  effects: Effect[];
}
interface Constitution {
  id: string;
  nameVi: string;
  descVi: string;
  rollWeight: number;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  tiers: Tier[];
}
interface StatMeta {
  nameVi: string;
  targets: string[];
  modes: string[];
  applied: boolean;
}
interface Catalog {
  version: number;
  constitutions: Constitution[];
  vocabulary: { stats: Record<string, StatMeta>; elements: string[]; weapons: string[]; maxTiers: number };
  holders: Array<{ id: string; tier: number; count: number }>;
}

const KIND_VI: Record<string, string> = { all: "Tất cả", element: "Hệ", weapon: "Họ vũ khí", skill: "Một kỹ năng" };
const MODE_VI: Record<string, string> = { percent: "Phần trăm", flat: "Cộng thẳng" };
const ELEMENT_VI: Record<string, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ", loi: "Lôi", bang: "Băng", phong: "Phong" };
const WEAPON_VI: Record<string, string> = { kiem: "Kiếm", dao: "Đao", thuong: "Thương", riu: "Rìu", cung: "Cung", quyen: "Quyền", phap_khi: "Pháp khí" };
const ROLL_RANGE = 10_000;

const ERRORS: Record<string, string> = {
  unchanged: "Không có gì thay đổi.",
  version_conflict: "Người khác vừa lưu danh mục thể chất. Hãy quay lại danh sách và mở lại.",
  too_large: "Danh mục quá lớn để lưu trong một lần.",
  missing_constitution: "Không được xóa thể chất (hãy tắt nó).",
  default_changed: "Không được đổi thể chất mặc định.",
  unknown_skill: "Có hiệu ứng nhắm vào kỹ năng không tồn tại:",
  invalid: "Danh mục không hợp lệ:",
};

/** The two tabs of the Thiên phú pages. */
export function talentTabs(active: "roots" | "constitutions"): HTMLElement {
  return h(
    "div",
    { class: "tabs" },
    h("a", { href: "/admin/talents", class: active === "roots" ? "active" : "" }, "Linh căn"),
    h("a", { href: "/admin/talents/constitutions", class: active === "constitutions" ? "active" : "" }, "Thể chất"),
  );
}

export function rootsPage(): HTMLElement {
  return h("div", null, talentTabs("roots"), tuningPage("talents"));
}

async function load(): Promise<Catalog | null> {
  const res = await api<Catalog>("/api/admin/constitutions");
  return res.status === 200 ? res.data : null;
}

export function constitutionListPage(): HTMLElement {
  const root = h("div");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(talentTabs("constitutions"), h("p", { class: "err" }, "Không tải được dữ liệu."));
    const heldBy = (id: string) => data.holders.filter((x) => x.id === id).reduce((n, x) => n + x.count, 0);
    const special = data.constitutions.filter((c) => !c.isDefault && c.enabled).reduce((n, c) => n + c.rollWeight, 0);
    const add = h("button", { type: "button", class: "primary" }, "+ Thêm thể chất");
    add.addEventListener("click", () => navigate("/admin/talents/constitutions/edit"));
    root.replaceChildren(
      talentTabs("constitutions"),
      h(
        "p",
        { class: "muted" },
        `Lúc tạo nhân vật máy chủ tung một số trên ${ROLL_RANGE}: lần lượt qua các thể chất đặc biệt đang bật (theo thứ tự), thể chất mặc định nhận phần còn lại. Tổng tỉ lệ các thể chất đặc biệt đang bật: ${special}/${ROLL_RANGE} (${Math.round(special) / 100}%). Không xóa được thể chất (nhân vật tham chiếu mã), chỉ tắt; người đang có vẫn giữ. Danh mục đi cùng mỗi lần vào game nên người đang online thấy tên mới khi vào lại; máy chủ nhận sau tối đa 30 giây. Nhiều chỉ số hiệu ứng chưa được game dùng (ghi "chưa có tác dụng" ở ô chọn): chỉ sát thương kỹ năng đang chạy.`,
      ),
      listView<Constitution>({
        columns: [
          { key: "sort", label: "Thứ tự", sortable: true, render: (c) => String(c.sortOrder) },
          { key: "id", label: "Mã", sortable: true, render: (c) => c.id },
          { key: "name", label: "Tên", sortable: true, render: (c) => c.nameVi },
          { key: "state", label: "Trạng thái", render: (c) => (c.isDefault ? "Mặc định" : c.enabled ? "Bật" : "Tắt") },
          { key: "weight", label: "Tỉ lệ tung", sortable: true, render: (c) => (c.isDefault ? "phần còn lại" : `${c.rollWeight}/${ROLL_RANGE}`) },
          { key: "tiers", label: "Số cấp", sortable: true, render: (c) => String(c.tiers.length) },
          { key: "holders", label: "Đang có", sortable: true, render: (c) => String(heldBy(c.id)) },
        ],
        defaultSort: { key: "sort", dir: "asc" },
        hideSearch: true,
        toolbar: [add],
        rowHref: (c) => `/admin/talents/constitutions/edit?id=${encodeURIComponent(c.id)}`,
        fetchPage: async (q) => {
          const key = (c: Constitution): string | number => (q.sort === "sort" ? c.sortOrder : q.sort === "name" ? c.nameVi : q.sort === "weight" ? c.rollWeight : q.sort === "tiers" ? c.tiers.length : q.sort === "holders" ? heldBy(c.id) : c.id);
          const rows = [...data.constitutions].sort((a, b) => {
            const av = key(a);
            const bv = key(b);
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

export function constitutionEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const current = id ? data.constitutions.find((c) => c.id === id) : undefined;
    if (id && !current) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy thể chất."), h("a", { href: "/admin/talents/constitutions" }, "‹ Danh sách"));
    root.replaceChildren(form(data, current));
  });
  return root;
}

function option(value: string, label: string): HTMLOptionElement {
  return h("option", { value }, label);
}

function field(label: string, ...children: Array<Node | null>): HTMLElement {
  return h("label", { class: "filter wide-field" }, label, ...children);
}

function form(data: Catalog, current: Constitution | undefined): HTMLElement {
  const isNew = current === undefined;
  const isDefault = current?.isDefault === true;
  const voc = data.vocabulary;
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  const warn = h("ul", { class: "muted" });
  const holders = (tier?: number) => data.holders.filter((x) => x.id === current?.id && (tier === undefined || x.tier === tier)).reduce((n, x) => n + x.count, 0);
  const sortDefault = Math.max(0, ...data.constitutions.map((c) => c.sortOrder)) + 10;

  const idInput = h("input", { type: "text", maxlength: "32", placeholder: "ma_the (a-z, 0-9, _)" });
  idInput.value = current?.id ?? "";
  idInput.disabled = !isNew;
  const name = h("input", { type: "text", maxlength: "60" });
  name.value = current?.nameVi ?? "";
  const desc = h("textarea", { rows: "2", maxlength: "300" });
  desc.value = current?.descVi ?? "";
  const weight = h("input", { type: "number", min: "0", step: "1" });
  weight.value = String(current?.rollWeight ?? 10);
  weight.disabled = isDefault;
  const enabled = h("input", { type: "checkbox" });
  enabled.checked = current?.enabled ?? true;
  enabled.disabled = isDefault;
  const sort = h("input", { type: "number", min: "0", step: "1" });
  sort.value = String(current?.sortOrder ?? sortDefault);

  // Tiers: each has a name, a roll weight and a list of effects.
  const tiersBox = h("div");
  const sum = h("div", { class: "muted" });
  const tierRows: Array<{ box: HTMLElement; name: HTMLInputElement; weight: HTMLInputElement; effects: HTMLElement }> = [];
  const refreshSum = () => {
    const total = tierRows.reduce((n, t) => n + (Number(t.weight.value) || 0), 0);
    sum.textContent = `Tổng tỉ lệ các cấp: ${total}/100${total === 100 ? "" : " (phải đúng 100)"}`;
    sum.className = total === 100 ? "muted" : "err";
  };

  const addEffect = (box: HTMLElement, e?: Effect) => {
    const stat = h("select", null, ...Object.entries(voc.stats).map(([k, m]) => option(k, `${m.nameVi}${m.applied ? "" : " (chưa có tác dụng)"}`)));
    const kind = h("select");
    const tag = h("select");
    const skillTag = h("input", { type: "text", maxlength: "32", placeholder: "mã kỹ năng" });
    const mode = h("select");
    const value = h("input", { type: "number", step: "any" });
    const rm = h("button", { type: "button" }, "✕");
    const sync = () => {
      const meta = voc.stats[stat.value]!;
      const keepKind = kind.value;
      kind.replaceChildren(...meta.targets.map((t) => option(t, KIND_VI[t] ?? t)));
      kind.value = meta.targets.includes(keepKind) ? keepKind : meta.targets[0]!;
      const keepMode = mode.value;
      mode.replaceChildren(...meta.modes.map((m) => option(m, MODE_VI[m] ?? m)));
      mode.value = meta.modes.includes(keepMode) ? keepMode : meta.modes[0]!;
      const list = kind.value === "element" ? voc.elements.map((x): [string, string] => [x, ELEMENT_VI[x] ?? x]) : kind.value === "weapon" ? voc.weapons.map((x): [string, string] => [x, WEAPON_VI[x] ?? x]) : [];
      const keepTag = tag.value;
      tag.replaceChildren(...list.map(([v, l]) => option(v, l)));
      if (list.some(([v]) => v === keepTag)) tag.value = keepTag;
      tag.hidden = list.length === 0;
      skillTag.hidden = kind.value !== "skill";
    };
    stat.addEventListener("change", sync);
    kind.addEventListener("change", sync);
    if (e) {
      stat.value = e.stat;
      sync();
      kind.value = e.targetKind;
      sync();
      mode.value = e.mode;
      if (e.targetKind === "skill") skillTag.value = e.targetTag;
      else tag.value = e.targetTag;
      value.value = String(e.value);
    } else {
      sync();
      value.value = "10";
    }
    const row = h("div", { class: "toolbar effect" }, stat, kind, tag, skillTag, mode, value, rm);
    rm.addEventListener("click", () => row.remove());
    box.append(row);
  };

  const addTier = (t?: Tier) => {
    if (tierRows.length >= voc.maxTiers) return;
    const n = tierRows.length + 1;
    const tname = h("input", { type: "text", maxlength: "40", placeholder: "tên cấp" });
    tname.value = t?.nameVi ?? `Cấp ${n}`;
    const tw = h("input", { type: "number", min: "0", step: "1" });
    tw.value = String(t?.rollWeight ?? (tierRows.length === 0 ? 100 : 0));
    tw.addEventListener("input", refreshSum);
    const effects = h("div");
    for (const e of t?.effects ?? []) addEffect(effects, e);
    const add = h("button", { type: "button" }, "+ Thêm hiệu ứng");
    add.addEventListener("click", () => addEffect(effects));
    const held = holders(n);
    const box = h(
      "div",
      { class: "form" },
      h("b", null, `Cấp ${n}${held ? ` · ${held} nhân vật đang ở cấp này` : ""}`),
      field("Tên cấp", tname),
      field("Tỉ lệ cấp này khi tung (trên 100)", tw),
      h("div", { class: "muted" }, "Danh sách hiệu ứng đầy đủ của cấp này (cấp cao không thừa hưởng cấp thấp):"),
      effects,
      add,
    );
    tierRows.push({ box, name: tname, weight: tw, effects });
    tiersBox.append(box);
    refreshSum();
  };
  for (const t of current?.tiers ?? [{ tier: 1, nameVi: "Cấp 1", rollWeight: 100, effects: [] }]) addTier(t);

  const addTierBtn = h("button", { type: "button" }, "+ Thêm cấp");
  addTierBtn.addEventListener("click", () => addTier());
  const removeTierBtn = h("button", { type: "button" }, "Bỏ cấp cuối");
  removeTierBtn.addEventListener("click", () => {
    if (tierRows.length <= 1) return;
    const top = tierRows.length;
    const above = current ? data.holders.filter((x) => x.id === current.id && x.tier >= top).reduce((n, x) => n + x.count, 0) : 0;
    if (above > 0 && !window.confirm(`${above} nhân vật đang ở cấp ${top}sẽ được tính như cấp ${top - 1}. Bỏ cấp này?`)) return;
    tierRows.pop()!.box.remove();
    refreshSum();
  });

  const collect = (): Constitution => ({
    id: idInput.value.trim(),
    nameVi: name.value.trim(),
    descVi: desc.value.trim(),
    rollWeight: isDefault ? (current?.rollWeight ?? 0) : Number(weight.value),
    isDefault,
    enabled: isDefault ? true : enabled.checked,
    sortOrder: Number(sort.value),
    tiers: tierRows.map((t, i) => ({
      tier: i + 1,
      nameVi: t.name.value.trim(),
      rollWeight: Number(t.weight.value),
      effects: [...t.effects.children].map((row) => {
        const sel = row.querySelectorAll("select");
        const kindValue = (sel[1] as HTMLSelectElement).value;
        return {
          stat: (sel[0] as HTMLSelectElement).value,
          targetKind: kindValue,
          targetTag: kindValue === "all" ? "" : kindValue === "skill" ? (row.querySelector("input[type=text]") as HTMLInputElement).value.trim() : (sel[2] as HTMLSelectElement).value,
          mode: (sel[3] as HTMLSelectElement).value,
          value: Number((row.querySelector("input[type=number]") as HTMLInputElement).value),
        };
      }),
    })),
  });

  const show = (text: string, cls: string, list: string[] = [], notes: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
    warn.replaceChildren(...notes.map((p) => h("li", null, p)));
  };
  const save = h("button", { type: "button", class: "primary" }, isNew ? "Tạo thể chất" : "Lưu");
  save.addEventListener("click", async () => {
    const next = collect();
    const bad: string[] = [];
    if (tierRows.reduce((n, t) => n + (Number(t.weight.value) || 0), 0) !== 100) bad.push("Tổng tỉ lệ các cấp phải đúng 100.");
    if (!next.nameVi) bad.push("Nhập tên thể chất.");
    if (next.tiers.some((t) => !t.nameVi)) bad.push("Mỗi cấp cần có tên.");
    if (next.tiers.some((t) => t.effects.some((e) => !Number.isFinite(e.value)))) bad.push("Mỗi hiệu ứng cần một giá trị là số.");
    const specialOthers = data.constitutions.filter((c) => c.id !== next.id && !c.isDefault && c.enabled).reduce((n, c) => n + c.rollWeight, 0);
    if (!next.isDefault && next.enabled && specialOthers + next.rollWeight > ROLL_RANGE) bad.push(`Tổng tỉ lệ các thể chất đặc biệt đang bật vượt ${ROLL_RANGE}.`);
    if (bad.length) return show("Chưa lưu được:", "err", bad);
    if (current && !next.enabled && current.enabled && holders() > 0 && !window.confirm(`${holders()} nhân vật đang có thể chất này; tắt thì người mới không tung ra nó, người đang có vẫn giữ. Tiếp tục?`)) return;
    const constitutions = isNew ? [...data.constitutions, next] : data.constitutions.map((c) => (c.id === next.id ? next : c));
    save.disabled = true;
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[]; warnings?: string[] }>("/api/admin/constitutions", { method: "POST", body: { expectedVersion: data.version, constitutions } });
    save.disabled = false;
    if (res.status === 200) {
      if (res.data.warnings?.length) {
        show("Đã lưu. Lưu ý: có hiệu ứng chưa có tác dụng trong game:", "ok", [], res.data.warnings);
        window.setTimeout(() => navigate("/admin/talents/constitutions"), 3500);
        return;
      }
      return navigate("/admin/talents/constitutions");
    }
    const code = res.data.error ?? "";
    show(ERRORS[code] ?? `Lỗi ${res.status}.`, "err", code === "invalid" || code === "unknown_skill" ? res.data.problems ?? [] : []);
  });

  return h(
    "div",
    null,
    talentTabs("constitutions"),
    h("a", { href: "/admin/talents/constitutions" }, "‹ Danh sách thể chất"),
    h("h2", null, isNew ? "Thêm thể chất" : `Sửa thể chất: ${current!.nameVi}`),
    current ? h("p", { class: "muted" }, `${holders()} nhân vật đang có thể chất này.${isDefault ? " Đây là thể chất mặc định: không tắt được, nhận phần tỉ lệ còn lại." : ""}`) : null,
    h("section", { class: "form" }, field("Mã (không đổi được sau khi tạo)", idInput), field("Tên", name), field("Mô tả", desc), field(`Tỉ lệ tung (trên ${ROLL_RANGE}; 100 = 1%)`, weight), field("Thứ tự trong lần tung (nhỏ trước)", sort), h("label", { class: "radio" }, enabled, "Bật (được tung cho nhân vật mới)")),
    h("h3", null, "Các cấp"),
    tiersBox,
    sum,
    h("div", { class: "toolbar" }, addTierBtn, removeTierBtn),
    h("div", { class: "toolbar" }, save),
    msg,
    problems,
    warn,
  );
}

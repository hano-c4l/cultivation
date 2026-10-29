import { api, h } from "./kit";

/**
 * "Trang bị" (PHASE3 3g-b): the stat ranges pieces of gear are rolled from (the master table), the names of the gear sets and the blacksmith's upgrade table.
 * Each tab saves on its own; the server only writes what changed and checks everything again.
 */

type Range = [number, number];
interface MasterRow {
  key: string;
  kind: string;
  style: string;
  realm: number;
  tier: number;
  stats: Record<string, Range>;
}
interface MasterView {
  token: number;
  kinds: Array<{ kind: string; styles: string[] }>;
  statKeys: string[];
  rows: MasterRow[];
}
interface EnhanceRow {
  level: number;
  successPct: number;
  statPct: number;
  failBonusPct: number;
  dropOnFail: boolean;
  materials: number;
  linhMult: number;
}

const REALMS = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Luyện Hư"];
const KIND_LABEL: Record<string, string> = { weapon: "Vũ khí", hat: "Mũ", robe: "Áo", bracer: "Hộ uyển", ring: "Nhẫn", jade: "Ngọc bội", necklace: "Dây chuyền", belt: "Đai", boots: "Giày", charm: "Pháp bảo", flight: "Pháp bảo phi hành" };
const STAT_LABEL: Record<string, string> = { attack: "Công", defense: "Thủ", maxHp: "Sinh lực", critRate: "Chí mạng %", dodgeRate: "Né %", moveSpeed: "Tốc độ %" };
const STYLE_LABEL: Record<string, string> = { m: "Nam", f: "Nữ", u: "Chung" };
const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu bảng này. Hãy tải lại trang.",
  unchanged: "Không có gì thay đổi.",
  invalid: "Dữ liệu không hợp lệ:",
  busy: "Dữ liệu vừa đổi. Hãy thử lại.",
  not_found: "Không tìm thấy.",
};

function tabs(active: "master" | "sets" | "enhance"): HTMLElement {
  const link = (href: string, label: string, on: boolean) => h("a", { href, class: on ? "active" : "" }, label);
  return h("div", { class: "toolbar" }, link("/admin/gear", "Chỉ số trang bị", active === "master"), link("/admin/gear/sets", "Tên bộ", active === "sets"), link("/admin/gear/enhance", "Bảng nâng cấp Thợ Rèn", active === "enhance"));
}

function box(): { msg: HTMLElement; problems: HTMLElement; show: (t: string, cls: string, list?: string[]) => void } {
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  return {
    msg,
    problems,
    show: (t, cls, list = []) => {
      msg.textContent = t;
      msg.className = `msg ${cls}`;
      problems.replaceChildren(...list.map((p) => h("li", null, p)));
    },
  };
}

function num(value: number, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "number", step: "any", ...extra });
  i.value = String(value);
  i.style.width = "6em";
  return i;
}

async function post(body: Record<string, unknown>) {
  return api<{ error?: string; problems?: string[]; token?: number }>("/api/admin/gear/save", { method: "POST", body });
}

export function gearMasterPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const kind = new URLSearchParams(location.search).get("kind") ?? "weapon";
  void api<MasterView>(`/api/admin/gear?part=master&kind=${encodeURIComponent(kind)}`).then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const v = res.data;
    const { msg, problems, show } = box();
    const pick = h("select", null, ...v.kinds.map((k) => h("option", { value: k.kind }, KIND_LABEL[k.kind] ?? k.kind)));
    pick.value = kind;
    pick.addEventListener("change", () => {
      history.pushState(null, "", `/admin/gear?kind=${pick.value}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const inputs = new Map<string, Array<{ stat: string; lo: HTMLInputElement; hi: HTMLInputElement }>>();
    const keys = v.statKeys.filter((s) => v.rows.some((r) => r.stats[s]));
    const body = h(
      "tbody",
      null,
      ...v.rows.map((r) => {
        const cells = keys.map((s) => {
          const range = r.stats[s];
          if (!range) return h("td");
          const lo = num(range[0]);
          const hi = num(range[1]);
          (inputs.get(r.key) ?? inputs.set(r.key, []).get(r.key)!).push({ stat: s, lo, hi });
          return h("td", null, lo, " – ", hi);
        });
        return h("tr", null, h("td", null, STYLE_LABEL[r.style] ?? r.style), h("td", null, `${REALMS[r.realm]} ${r.tier}`), ...cells);
      }),
    );
    const save = h("button", { type: "button", class: "primary" }, "Lưu");
    save.addEventListener("click", async () => {
      save.disabled = true;
      show("Đang lưu...", "muted");
      const rows: Record<string, Record<string, Range>> = {};
      for (const r of v.rows) {
        const list = inputs.get(r.key) ?? [];
        const next: Record<string, Range> = {};
        for (const { stat, lo, hi } of list) next[stat] = [Number(lo.value), Number(hi.value)];
        if (JSON.stringify(next) !== JSON.stringify(r.stats)) rows[r.key] = next;
      }
      const out = await post({ part: "master", kind, rows, token: v.token });
      save.disabled = false;
      if (out.status === 200) return void window.location.reload();
      const e = out.data.error ?? "";
      show(ERRORS[e] ?? `Lỗi ${out.status}.`, "err", e === "invalid" ? out.data.problems ?? [] : []);
    });
    root.replaceChildren(
      tabs("master"),
      h("p", { class: "muted" }, "Khoảng [nhỏ nhất – lớn nhất] của từng chỉ số ở phẩm Hạ; phẩm cao nhân thêm. Mỗi món rơi hoặc mua được tung riêng trong khoảng này. Món đã có giữ chỉ số đã tung. Chỉ đổi số, không thêm bớt chỉ số. Số mới áp cho món tạo sau tối đa 30 giây."),
      h("div", { class: "toolbar" }, h("span", null, "Loại:"), pick),
      h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Kiểu"), h("th", null, "Cảnh giới / bậc"), ...keys.map((s) => h("th", null, STAT_LABEL[s] ?? s)))), body)),
      h("div", { class: "toolbar" }, save),
      msg,
      problems,
    );
  });
  return root;
}

export function gearSetsPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  void api<{ token: number; realms: Array<{ realm: number; nameVi: string; names: string[] }> }>("/api/admin/gear?part=sets").then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const v = res.data;
    const { msg, problems, show } = box();
    const inputs = v.realms.map((r) =>
      r.names.map((n) => {
        const i = h("input", { type: "text", maxlength: "30" });
        i.value = n;
        i.style.width = "9em";
        return i;
      }),
    );
    const save = h("button", { type: "button", class: "primary" }, "Lưu");
    save.addEventListener("click", async () => {
      save.disabled = true;
      show("Đang lưu...", "muted");
      const out = await post({ part: "sets", names: inputs.map((row) => row.map((i) => i.value)), token: v.token });
      save.disabled = false;
      if (out.status === 200) return void window.location.reload();
      const e = out.data.error ?? "";
      show(ERRORS[e] ?? `Lỗi ${out.status}.`, "err", e === "invalid" ? out.data.problems ?? [] : []);
    });
    root.replaceChildren(
      tabs("sets"),
      h("p", { class: "muted" }, "Tên bộ của từng cảnh giới và bậc: mọi món cùng bậc gọi là “<tên bộ> <loại>”. Món đã có đổi tên theo ngay khi người chơi vào lại game."),
      ...v.realms.map((r, ri) => h("section", { class: "form" }, h("h3", null, r.nameVi), h("div", { class: "toolbar" }, ...inputs[ri]!.map((i, t) => h("label", { class: "filter" }, `Bậc ${t + 1}`, i))))),
      h("div", { class: "toolbar" }, save),
      msg,
      problems,
    );
  });
  return root;
}

export function gearEnhancePage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  void api<{ token: number; rows: EnhanceRow[] }>("/api/admin/gear?part=enhance").then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const v = res.data;
    const { msg, problems, show } = box();
    const lines = v.rows.map((r) => ({
      level: r.level,
      success: num(r.successPct, { min: "0", max: "100" }),
      stat: num(r.statPct, { min: "0" }),
      fail: num(r.failBonusPct, { min: "0", max: "100" }),
      drop: h("input", { type: "checkbox" }),
      mats: num(r.materials, { min: "0", step: "1" }),
      linh: num(r.linhMult, { min: "0" }),
    }));
    lines.forEach((l, i) => (l.drop.checked = v.rows[i]!.dropOnFail));
    const save = h("button", { type: "button", class: "primary" }, "Lưu");
    save.addEventListener("click", async () => {
      save.disabled = true;
      show("Đang lưu...", "muted");
      const rows = lines.map((l) => ({ level: l.level, successPct: Number(l.success.value), statPct: Number(l.stat.value), failBonusPct: Number(l.fail.value), dropOnFail: l.drop.checked, materials: Number(l.mats.value), linhMult: Number(l.linh.value) }));
      const out = await post({ part: "enhance", rows, token: v.token });
      save.disabled = false;
      if (out.status === 200) return void window.location.reload();
      const e = out.data.error ?? "";
      show(ERRORS[e] ?? `Lỗi ${out.status}.`, "err", e === "invalid" ? out.data.problems ?? [] : []);
    });
    root.replaceChildren(
      tabs("enhance"),
      h("p", { class: "muted" }, "Mỗi hàng là bước nâng từ cấp trước lên cấp đó. Linh Thạch của bước = Linh Thạch cơ bản của cảnh giới (mục NPC → Con số) × hệ số. Số mới có hiệu lực với máy chủ sau tối đa 30 giây; người chơi thấy khi mở lại Thợ Rèn."),
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          null,
          h("thead", null, h("tr", null, ...["Lên cấp", "Tỉ lệ thành công %", "Chỉ số cộng thêm %", "Cộng dồn khi thất bại %", "Thất bại tụt cấp", "Nguyên liệu", "Hệ số Linh Thạch"].map((t) => h("th", null, t)))),
          h("tbody", null, ...lines.map((l) => h("tr", null, h("td", null, `+${l.level}`), h("td", null, l.success), h("td", null, l.stat), h("td", null, l.fail), h("td", null, l.drop), h("td", null, l.mats), h("td", null, l.linh)))),
        ),
      ),
      h("div", { class: "toolbar" }, save),
      msg,
      problems,
    );
  });
  return root;
}

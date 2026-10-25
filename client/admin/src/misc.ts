import { api, h } from "./kit";

/** "Chỉ số khác" (PHASE3 3c): the `game_tuning` groups listed by the server, one editable block each, and the `game_settings` numbers. */

interface Field {
  path: string;
  label: string;
  kind: "int" | "num" | "frac" | "color" | "species";
  unit?: string;
}

interface Group {
  group: string;
  title: string;
  note: string;
  fields: Field[];
  value: unknown;
  default: unknown;
  updatedAt: number;
  updatedBy: string | null;
  stored: boolean;
}

type Page = "misc" | "realms" | "potential" | "talents" | "monsters" | "boss" | "npcs";

interface Setting {
  key: string;
  page: string;
  labelVi: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

/** The species a boss can be given (set by the boss page before it draws): [id, name]. */
let speciesChoices: Array<[string, string]> = [];

function getPath(value: unknown, path: string): number {
  let cur: unknown = value;
  for (const part of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return cur as number;
}

/** A colour field also shows a swatch of what is typed. */
function swatch(input: HTMLInputElement): HTMLElement {
  const box = h("span", { class: "swatch", title: "Xem trước" });
  const paint = () => {
    box.style.background = "";
    box.style.background = input.value; // an invalid colour leaves it empty
  };
  input.addEventListener("input", paint);
  paint();
  return box;
}

/** Rules that tie several fields together; the server checks them again. Returns a sentence per broken rule. */
function crossProblems(group: string, v: (path: string) => number): string[] {
  const out: string[] = [];
  if (group === "pvp") {
    if (!(v("nameTiers.yellowFrom") < v("nameTiers.orangeFrom") && v("nameTiers.orangeFrom") < v("nameTiers.redFrom"))) out.push("Mốc màu tên phải tăng dần: vàng < cam < đỏ.");
    if (!(v("satKhi.bonusFullAt") > v("satKhi.bonusAbove"))) out.push("Mức sát khí đạt tăng sát thương tối đa phải lớn hơn mức bắt đầu.");
    if (!(v("hero.tier2") >= v("hero.tier1"))) out.push("Mốc anh hùng thứ hai không được nhỏ hơn mốc thứ nhất.");
    if (!(v("protectedBelow.stage") >= 1 && v("protectedBelow.stage") <= 9)) out.push("Tầng bảo hộ tân thủ phải từ 1 đến 9.");
  }
  if (group === "breakthrough") {
    for (let i = 0; i < 3; i++) {
      if (!(v(`steps.${i}.maxRatePct`) >= v(`steps.${i}.baseRatePct`))) out.push(`Bước đột phá ${i + 1}: tỉ lệ tối đa không được nhỏ hơn tỉ lệ cơ bản.`);
      if (!(v(`steps.${i}.maxRatePct`) <= 100)) out.push(`Bước đột phá ${i + 1}: tỉ lệ không quá 100%.`);
    }
    if (!(v("overflowFrom") <= 1)) out.push("Mốc bắt đầu tính EXP tràn không quá 1.");
  }
  if (group === "aoi") {
    if (!(v("leave.x") >= v("enter.x") && v("leave.y") >= v("enter.y"))) out.push("Tầm rời không được nhỏ hơn tầm vào.");
    if (!(v("everyTicks") >= 1)) out.push("Chu kỳ cập nhật phải từ 1 tick.");
  }
  return out;
}

const SUBHEADS: Record<string, string> = {
  satKhi: "Sát khí",
  satNhan: "Sát nhân",
  nameTiers: "Màu tên theo sát nhân",
  dropChance: "Xác suất mất đồ khi bị giết, theo màu tên",
  deathDurability: "Độ bền hao khi chết, theo màu tên",
  hero: "Anh hùng",
  protectedBelow: "Bảo hộ tân thủ",
};

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu nhóm này. Đã tải lại số liệu mới, hãy kiểm tra rồi lưu lại.",
  invalid: "Máy chủ từ chối: có số ngoài khoảng cho phép hoặc sai quy tắc.",
  unchanged: "Không có gì thay đổi.",
  unknown_group: "Nhóm không tồn tại.",
};

/** Writes `a.b.0` into a value, making the objects and arrays on the way. */
function setAt(root: unknown, path: string, to: unknown): void {
  let cur = root as Record<string, unknown>;
  const parts = path.split(".");
  parts.slice(0, -1).forEach((p, i) => {
    cur[p] ??= /^\d+$/.test(parts[i + 1]!) ? [] : {};
    cur = cur[p] as Record<string, unknown>;
  });
  cur[parts[parts.length - 1]!] = to;
}

function fieldHint(f: Field): string {
  if (f.kind === "frac") return "0 đến 1 (0,25 = 25%)";
  if (f.kind === "color") return "màu CSS";
  return f.unit ?? "";
}

/** `refresh(notice, isError)` re-reads the group from the server and redraws only this block, leaving the other blocks' edits alone. */
function groupBlock(g: Group, page: Page, refresh: (notice?: string, isError?: boolean) => void, notice?: { text: string; error: boolean }): HTMLElement {
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const msg = h("div", { class: notice?.error ? "msg err" : "msg ok" }, notice?.text);
  let lastTop = "";
  const rows = g.fields.flatMap((f) => {
    const top = f.path.split(".")[0]!;
    const heading = top !== lastTop && g.fields.length > 6 ? h("tr", null, h("th", { colspan: "4", class: "subhead" }, SUBHEADS[top] ?? top)) : null;
    lastTop = top;
    const input: HTMLInputElement | HTMLSelectElement =
      f.kind === "species"
        ? h("select", { disabled: f.path === "species.town" || f.path === "species.town2" }, h("option", { value: "" }, f.path === "species.town" || f.path === "species.town2" ? "(thành không có boss)" : "(không có boss)"), ...speciesChoices.map(([v, l]) => h("option", { value: v }, l)))
        : h("input", f.kind === "color" ? { type: "text", maxlength: "60" } : { type: "number", step: f.kind === "int" ? "1" : "any" });
    input.value = f.kind === "species" ? String((getPath(g.value, f.path) as unknown as string | null) ?? "") : String(getPath(g.value, f.path));
    inputs.set(f.path, input);
    const def = getPath(g.default, f.path);
    const mark = () => input.classList.toggle("changed", f.kind === "species" ? (input.value || null) !== (getPath(g.value, f.path) as unknown as string | null) : (f.kind === "color" ? input.value : Number(input.value)) !== getPath(g.value, f.path));
    input.addEventListener("input", mark);
    const weight = g.group === "roots" ? /^(grades|counts)\.\d+\.weight$/.exec(f.path) : null;
    const share = weight ? h("span", { class: "muted" }) : null;
    if (weight && share) {
      // The weights need not add up to 100: each one's chance is its share of the five together.
      const update = () => {
        const family = [...inputs].filter(([p]) => p.startsWith(`${weight[1]}.`) && p.endsWith(".weight"));
        const total = family.reduce((n, [, el]) => n + (Number(el.value) || 0), 0);
        for (const [, el] of family) {
          const cell = el.closest("td")?.querySelector(".share");
          if (cell) cell.textContent = total > 0 ? ` = ${Math.round(((Number(el.value) || 0) / total) * 1000) / 10}%` : "";
        }
      };
      share.className = "muted share";
      input.addEventListener("input", update);
      queueMicrotask(update);
    }
    const reset = h("button", { type: "button", title: "Đặt ô này về giá trị mặc định" }, `mặc định ${(def as unknown as string | null) ?? "không"}`);
    reset.addEventListener("click", () => {
      input.value = String((def as unknown as string | null) ?? "");
      mark();
    });
    return [heading, h("tr", null, h("td", null, f.label), h("td", { class: "num-cell" }, input, f.kind === "color" ? swatch(input as HTMLInputElement) : null, share), h("td", { class: "muted" }, fieldHint(f)), h("td", null, reset))].filter((n): n is HTMLTableRowElement => n !== null);
  });
  const save = h("button", { type: "button", class: "primary" }, "Lưu");
  const resetAll = h("button", { type: "button" }, "Điền mặc định cả nhóm");
  const undo = h("button", { type: "button" }, "Hoàn tác");
  resetAll.addEventListener("click", () => {
    for (const f of g.fields) {
      const input = inputs.get(f.path)!;
      input.value = String((getPath(g.default, f.path) as unknown as string | null) ?? "");
      input.dispatchEvent(new Event("input"));
    }
    msg.textContent = "Đã điền giá trị mặc định vào ô; bấm Lưu để áp dụng.";
    msg.className = "msg muted";
  });
  undo.addEventListener("click", () => refresh());
  save.addEventListener("click", async () => {
    const body: unknown = {};
    for (const f of g.fields) {
      const raw = inputs.get(f.path)!.value.trim();
      if (f.kind === "species") {
        setAt(body, f.path, raw === "" ? null : raw);
        continue;
      }
      if (f.kind === "color") {
        if (raw === "") return fail(`"${f.label}" chưa nhập màu.`);
        setAt(body, f.path, raw);
        continue;
      }
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n)) return fail(`"${f.label}" chưa nhập số hợp lệ.`);
      if (f.kind === "int" && !Number.isInteger(n)) return fail(`"${f.label}" phải là số nguyên.`);
      if (f.kind === "frac" && (n < 0 || n > 1)) return fail(`"${f.label}" phải từ 0 đến 1.`);
      setAt(body, f.path, n);
    }
    const broken = crossProblems(g.group, (p) => getPath(body, p));
    if (broken.length) return fail(broken.join(" "));
    save.disabled = true;
    msg.textContent = "Đang lưu...";
    msg.className = "msg muted";
    const res = await api<{ error?: string; changes?: number; problems?: string[] }>("/api/admin/tuning", { method: "POST", body: { group: g.group, page, updatedAt: g.updatedAt, value: body } });
    save.disabled = false;
    if (res.status === 200) return refresh(`Đã lưu ${res.data.changes ?? 0} thay đổi.`);
    if (res.status === 409) return refresh(ERRORS.version_conflict, true);
    fail(`${ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`}${res.data.problems?.length ? ` ${res.data.problems.join("; ")}` : ""}`);
    function fail(text: string): void {
      msg.textContent = text;
      msg.className = "msg err";
    }
  });
  const saved = g.updatedBy ? `Lưu lần cuối bởi ${g.updatedBy}` : "Chưa chỉnh lần nào (đang là mặc định)";
  return h(
    "section",
    { class: "form" },
    h("h3", null, g.title),
    g.note ? h("p", { class: "muted" }, g.note) : null,
    g.stored ? null : h("p", { class: "err" }, "Dữ liệu đang lưu không còn hợp lệ nên game đang dùng giá trị mặc định. Lưu lại để thay thế."),
    h("div", { class: "table-wrap" }, h("table", null, h("tbody", null, ...rows))),
    h("div", { class: "toolbar" }, save, resetAll, undo, h("span", { class: "muted" }, saved)),
    msg,
  );
}

function settingsBlock(settings: Setting[], reload: () => void, title = "Cài đặt game"): HTMLElement {
  const rows = settings.map((s) => {
    const input = h("input", { type: "number", step: "1", min: String(s.min), max: String(s.max) });
    input.value = String(s.value);
    const msg = h("span", { class: "muted" });
    const save = h("button", { type: "button", class: "primary" }, "Lưu");
    save.addEventListener("click", async () => {
      const n = Number(input.value);
      if (input.value.trim() === "" || !Number.isInteger(n) || n < s.min || n > s.max) {
        msg.textContent = `Phải là số nguyên từ ${s.min} đến ${s.max}.`;
        msg.className = "err";
        return;
      }
      const res = await api<{ error?: string }>("/api/admin/settings", { method: "POST", body: { key: s.key, value: n } });
      if (res.status === 200) return reload();
      msg.textContent = res.data.error === "unchanged" ? "Không có gì thay đổi." : "Máy chủ từ chối giá trị này.";
      msg.className = "err";
    });
    const reset = h("button", { type: "button" }, `mặc định ${s.default}`);
    reset.addEventListener("click", () => {
      input.value = String(s.default);
    });
    return h("tr", null, h("td", null, s.labelVi), h("td", { class: "num-cell" }, input), h("td", null, reset), h("td", null, save, " ", msg));
  });
  return h("section", { class: "form" }, h("h3", null, title), h("p", { class: "muted" }, `Mỗi dòng lưu riêng. Có hiệu lực sau tối đa 30 giây.`), h("div", { class: "table-wrap" }, h("table", null, h("tbody", null, ...rows))));
}

const PAGE_NOTES: Record<Page, string> = {
  misc: "Máy chủ nhận số mới trong vòng khoảng 30 giây (quái và boss đã sinh giữ số cũ tới khi sinh lại). Người đang chơi chỉ nhận số mới của giao diện (màu tên, mốc bảo hộ...) khi vào lại game hoặc đổi bản đồ.",
  realms:
    "Tên và ký hiệu cảnh giới chưa chỉnh được ở đây (chúng còn nằm trong code và tên các vật phẩm sinh từ chúng, chờ các màn Vật phẩm, Kỹ năng, Quái, Bản đồ); thêm cảnh giới mới cũng chờ các màn đó. Màu thẻ cảnh giới chỉnh ở \"Chỉ số khác\" → Màu giao diện. Hạ EXP cần hoặc hệ số tăng có thể làm nhân vật lên nhiều tầng ở lần giết kế tiếp. Số mới có hiệu lực với máy chủ sau tối đa 30 giây; nhân vật đang online thấy thanh EXP mới khi vào lại game.",
  talents:
    "Linh căn: lúc tạo nhân vật máy chủ tung phẩm cấp và số hệ theo trọng số; cho nhân vật tạo sau đó. Hệ biến dị (Lôi, Băng, Phong) chỉ có ở đơn linh căn; chỉnh tỉ lệ và độ mạnh ở cuối trang. Thêm hệ mới, điều kiện xuất hiện của thiên phú và hệ số khắc (còn trong code) chưa chỉnh được ở đây. Thể chất ở tab bên cạnh.",
  monsters:
    "Hạng quái và rơi đồ. Số của từng loài quái chỉnh ở tab Loài quái; bảng rơi vật phẩm ở tab Bảng rơi. Số mới áp cho quái sinh ra sau đó (quái đang sống giữ số cũ); rơi đồ áp cho lần giết kế tiếp sau tối đa 30 giây. Tăng xác suất rơi và hồi sinh nhanh hơn làm tăng số dòng ghi D1 (hạn mức Free 100.000 mỗi ngày).",
  boss: "BOSS bản đồ và vệ binh. Loài boss chỉ chọn được trong các loài không có trong bãi quái; không đổi được khi boss đang có mặt trên bản đồ. Sức mạnh boss và vệ binh dùng cùng hệ số chỉ số tiềm năng (màn Chỉ số tiềm năng). Boss tính lại khi xuất hiện, số mới áp từ lần sau.",
  npcs: "Con số của Thợ Rèn (chi phí nâng cấp, Tinh luyện, Hộ Cấp Phù) và của Đạo Sư (phí đổi, bỏ hướng tu, thưởng chỉ số). Máy chủ dùng số mới sau tối đa 30 giây. Bảng cấp nâng cấp, nguyên liệu và tỉ lệ của từng cấp (bảng enhance_levels) chưa có màn (3g-b). Các tab khác của mục NPC: danh sách NPC, công thức luyện đan.",
  potential: "Máy chủ dùng hệ số mới sau tối đa 30 giây cho người vào game sau đó. Người đang online giữ chỉ số cũ tới khi vào lại game, lên tầng hoặc đổi trang bị.",
};

/** A tuning screen: the `game_tuning` groups of one admin page, and on "Chỉ số khác" also the game settings. */
export function tuningPage(page: Page): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const block = (g: Group, notice?: { text: string; error: boolean }): HTMLElement => {
    const el: HTMLElement = groupBlock(
      g,
      page,
      (text, error) =>
        void api<{ groups: Group[] }>(`/api/admin/tuning?page=${page}`).then((res) => {
          const fresh = res.data.groups?.find((x) => x.group === g.group);
          if (res.status === 200 && fresh) el.replaceWith(block(fresh, text ? { text, error: error === true } : undefined));
        }),
      notice,
    );
    return el;
  };
  const load = async () => {
    if (page === "boss") {
      const sp = await api<{ species: Array<{ id: string; effective: { nameVi: string }; maps: string[]; guard: boolean }> }>("/api/admin/monsters");
      if (sp.status === 200) speciesChoices = sp.data.species.filter((x) => x.maps.length === 0 && !x.guard).map((x): [string, string] => [x.id, `${x.effective.nameVi} (${x.id})`]);
    }
    const [tuning, settings] = await Promise.all([api<{ groups: Group[] }>(`/api/admin/tuning?page=${page}`), page === "misc" || page === "talents" ? api<{ settings: Setting[] }>("/api/admin/settings") : Promise.resolve(null)]);
    if (tuning.status !== 200 || (settings && settings.status !== 200)) {
      root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
      return;
    }
    root.replaceChildren(h("p", { class: "muted" }, PAGE_NOTES[page]), ...tuning.data.groups.map((g) => block(g)), ...(settings ? [settingsBlock(settings.data.settings.filter((x) => x.page === page), () => void load(), page === "talents" ? "Hệ biến dị và rơi đồ" : "Cài đặt game")] : []));
  };
  void load();
  return root;
}

export const miscPage = (): HTMLElement => tuningPage("misc");

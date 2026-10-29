import { api, h, listView, navigate } from "./kit";
import { tuningPage } from "./misc";

/** "Quái / BOSS" (PHASE3 3j): the species, the classes and drops, the bosses and guards (tuning pages), and the loot tables. */

type Tab = "species" | "ranks" | "boss" | "loot";

export function monsterTabs(active: Tab): HTMLElement {
  const tab = (key: Tab, href: string, label: string) => h("a", { href, class: active === key ? "active" : "" }, label);
  return h("div", { class: "tabs" }, tab("species", "/admin/monsters", "Loài quái"), tab("ranks", "/admin/monsters/ranks", "Hạng quái và rơi đồ"), tab("loot", "/admin/monsters/loot", "Bảng rơi vật phẩm"), tab("boss", "/admin/monsters/boss", "BOSS và vệ binh"));
}

export const ranksPage = (): HTMLElement => h("div", null, monsterTabs("ranks"), tuningPage("monsters"));
export const bossPage = (): HTMLElement => h("div", null, monsterTabs("boss"), tuningPage("boss"));

// ---- Species ----

interface Numbers {
  hpMult: number;
  attackMult: number;
  defenseMult: number;
  speed: number;
  aggroRadius: number;
  leashRadius: number;
  attackRange: number;
  attackCooldownMs: number;
  respawnMs: number;
}
interface Species {
  id: string;
  base: { nameVi: string; element: string } & Numbers;
  effective: { nameVi: string } & Numbers;
  changed: boolean;
  maps: string[];
  bossOf: string[];
  guard: boolean;
}
interface SpeciesList {
  species: Species[];
  token: number;
  limits: { name: number; minClusterRespawnMs: number; playerSpeed: number };
}

const MAP_VI: Record<string, string> = { town: "Thanh Vân Thành", forest: "Hắc Mộc Lâm", cave: "U Minh Động", town2: "Thiên Hà Thành", kimdan: "Xích Diễm Sơn", nguyenanh: "Vạn Cổ Hàn Uyên", town3: "Huyền Thiên Thành", hoathan: "Lôi Âm Tuyệt Cốc", luyenhu: "Hư Không Hải" };
const ELEMENT_VI: Record<string, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ" };
const ERRORS: Record<string, string> = {
  unchanged: "Không có gì thay đổi.",
  version_conflict: "Người khác vừa lưu (cùng một bảng loài quái). Hãy quay lại danh sách và mở lại.",
  unknown: "Không có loài này.",
  invalid: "Giá trị không hợp lệ:",
};

const FIELDS: Array<{ key: keyof Numbers; label: string; step: string; unit?: string; scale?: number }> = [
  { key: "hpMult", label: "Hệ số sinh lực", step: "any" },
  { key: "attackMult", label: "Hệ số công", step: "any" },
  { key: "defenseMult", label: "Hệ số thủ", step: "any" },
  { key: "speed", label: "Tốc độ chạy (ô mỗi giây; người chơi chạy 3 trở lên)", step: "any" },
  { key: "aggroRadius", label: "Tầm phát hiện người chơi (ô)", step: "any" },
  { key: "leashRadius", label: "Tầm đuổi tối đa khỏi chỗ cũ (ô)", step: "any" },
  { key: "attackRange", label: "Tầm đánh (ô)", step: "any" },
  { key: "attackCooldownMs", label: "Nhịp đánh (giây)", step: "any", scale: 1000 },
  { key: "respawnMs", label: "Hồi sinh sau (giây; 0 là không hồi sinh)", step: "any", scale: 1000 },
];

async function loadSpecies(): Promise<SpeciesList | null> {
  const res = await api<SpeciesList>("/api/admin/monsters");
  return res.status === 200 ? res.data : null;
}

const roleOf = (s: Species): string => (s.guard ? "Vệ binh" : s.bossOf.length ? `BOSS ${s.bossOf.map((m) => MAP_VI[m] ?? m).join(", ")}` : s.maps.length ? `Quái ${s.maps.map((m) => MAP_VI[m] ?? m).join(", ")}` : "Chưa dùng");

export function speciesListPage(): HTMLElement {
  const root = h("div");
  void loadSpecies().then((data) => {
    if (!data) return void root.replaceChildren(monsterTabs("species"), h("p", { class: "err" }, "Không tải được dữ liệu."));
    const key = (s: Species, k: string): string | number => (k === "name" ? s.effective.nameVi : k === "role" ? roleOf(s) : k === "hp" ? s.effective.hpMult : k === "atk" ? s.effective.attackMult : k === "def" ? s.effective.defenseMult : k === "respawn" ? s.effective.respawnMs : s.id);
    root.replaceChildren(
      monsterTabs("species"),
      h("p", { class: "muted" }, "Tên và số của từng loài quái. Số mới áp cho quái sinh ra hoặc hồi sinh sau đó (quái đang sống giữ số cũ); tên mới hiện cho người chơi khi vào lại game. Loài mới cần chỗ đứng trên bản đồ nên chưa tạo được ở đây (chờ màn Bản đồ). Hệ của quái được tung mỗi lần sinh ra."),
      listView<Species>({
        columns: [
          { key: "id", label: "Mã", sortable: true, render: (s) => s.id },
          { key: "name", label: "Tên", sortable: true, render: (s) => s.effective.nameVi },
          { key: "role", label: "Vai trò", sortable: true, render: (s) => roleOf(s) },
          { key: "hp", label: "Sinh lực x", sortable: true, render: (s) => String(s.effective.hpMult) },
          { key: "atk", label: "Công x", sortable: true, render: (s) => String(s.effective.attackMult) },
          { key: "def", label: "Thủ x", sortable: true, render: (s) => String(s.effective.defenseMult) },
          { key: "respawn", label: "Hồi sinh (s)", sortable: true, render: (s) => String(s.effective.respawnMs / 1000) },
          { key: "changed", label: "Đã chỉnh", render: (s) => (s.changed ? "Có" : "") },
        ],
        defaultSort: { key: "role", dir: "asc" },
        searchPlaceholder: "Tìm theo mã hoặc tên...",
        rowHref: (s) => `/admin/monsters/edit?id=${encodeURIComponent(s.id)}`,
        fetchPage: async (q) => {
          const needle = q.q.toLowerCase();
          let rows = data.species.filter((s) => !needle || s.id.toLowerCase().includes(needle) || s.effective.nameVi.toLowerCase().includes(needle));
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

export function speciesEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id");
  void loadSpecies().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const s = data.species.find((x) => x.id === id);
    if (!s) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy loài."), h("a", { href: "/admin/monsters" }, "‹ Danh sách"));
    root.replaceChildren(speciesForm(data, s));
  });
  return root;
}

function speciesForm(data: SpeciesList, s: Species): HTMLElement {
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  const name = h("input", { type: "text", maxlength: String(data.limits.name) });
  name.value = s.effective.nameVi;
  const inputs = new Map<keyof Numbers, HTMLInputElement>();
  const rows: HTMLElement[] = [
    h("label", { class: "filter wide-field" }, "Tên", name, (() => {
      const r = h("button", { type: "button" }, `mặc định ${s.base.nameVi}`);
      r.addEventListener("click", () => (name.value = s.base.nameVi));
      return r;
    })()),
  ];
  for (const f of FIELDS) {
    const scale = f.scale ?? 1;
    const input = h("input", { type: "number", step: f.step });
    input.value = String(s.effective[f.key] / scale);
    inputs.set(f.key, input);
    const reset = h("button", { type: "button" }, `mặc định ${s.base[f.key] / scale}`);
    reset.addEventListener("click", () => (input.value = String(s.base[f.key] / scale)));
    rows.push(h("label", { class: "filter wide-field" }, f.label, input, reset));
  }
  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };
  const send = async (fields: Record<string, unknown> | null) => {
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[]; warnings?: string[] }>("/api/admin/monsters/save", { method: "POST", body: { id: s.id, fields, token: data.token } });
    if (res.status === 200) {
      if (res.data.warnings?.length) {
        show("Đã lưu. Lưu ý:", "ok", res.data.warnings);
        window.setTimeout(() => navigate("/admin/monsters"), 3500);
        return;
      }
      return navigate("/admin/monsters");
    }
    const code = res.data.error ?? "";
    show(ERRORS[code] ?? `Lỗi ${res.status}.`, "err", code === "invalid" ? res.data.problems ?? [] : []);
  };
  const save = h("button", { type: "button", class: "primary" }, "Lưu");
  save.addEventListener("click", () => {
    const fields: Record<string, unknown> = { nameVi: name.value };
    for (const f of FIELDS) {
      const raw = inputs.get(f.key)!.value.trim();
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n)) return show(`"${f.label}" chưa nhập số hợp lệ.`, "err");
      fields[f.key] = f.scale ? Math.round(n * f.scale) : n; // milliseconds are whole numbers
    }
    void send(fields);
  });
  const reset = h("button", { type: "button" }, "Về số của code");
  reset.disabled = !s.changed;
  reset.addEventListener("click", () => {
    if (window.confirm(`Đưa «${s.base.nameVi}» về đúng tên và số của code?`)) void send(null);
  });
  return h(
    "div",
    null,
    monsterTabs("species"),
    h("a", { href: "/admin/monsters" }, "‹ Danh sách loài"),
    h("h2", null, `Loài quái: ${s.effective.nameVi} (${s.id})`),
    h("p", { class: "muted" }, `${roleOf(s)} · hệ hiện ban đầu: ${ELEMENT_VI[s.base.element] ?? s.base.element} (mỗi lần sinh ra tung lại). Hồi sinh của loài sống trong bãi quái tối thiểu ${data.limits.minClusterRespawnMs / 1000} giây; tầm đuổi không nhỏ hơn tầm phát hiện.`),
    h("section", { class: "form" }, ...rows),
    h("div", { class: "toolbar" }, save, reset),
    msg,
    problems,
  );
}

// ---- Loot tables ----

interface LootLine {
  item: string;
  chance: number;
  min: number;
  max: number;
}
type Ranks = Record<"normal" | "rare1" | "rare2", LootLine[]>;
interface Loot {
  base: Ranks;
  realm: Record<string, Ranks>;
}
interface LootData {
  loot: Loot;
  default: Loot;
  token: number;
  realms: Array<{ key: string; nameVi: string }>;
  items: Array<{ id: string; nameVi: string; disabled: boolean }>;
}

const RANK_VI: Array<["normal" | "rare1" | "rare2", string]> = [["normal", "Quái thường"], ["rare1", "Tinh Anh"], ["rare2", "Đại Yêu"]];

export function lootPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  void api<LootData>("/api/admin/loot").then((res) => {
    if (res.status !== 200) return void root.replaceChildren(monsterTabs("loot"), h("p", { class: "err" }, "Không tải được dữ liệu."));
    root.replaceChildren(monsterTabs("loot"), lootForm(res.data));
  });
  return root;
}

function lootForm(data: LootData): HTMLElement {
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  const choices = data.items.filter((i) => !i.disabled);
  const nameOf = (id: string) => data.items.find((i) => i.id === id)?.nameVi ?? id;
  const sections: Array<{ where: "base" | string; ranks: Record<string, HTMLElement> }> = [];

  const lineRow = (box: HTMLElement, line?: LootLine) => {
    const sel = h("select", null, ...choices.map((i) => h("option", { value: i.id }, `${i.nameVi} (${i.id})`)));
    // A line whose item is gone from the catalogue keeps showing so that it can be taken out.
    if (line && !choices.some((i) => i.id === line.item)) sel.prepend(h("option", { value: line.item }, `${nameOf(line.item)} (${line.item}, không còn)`));
    sel.value = line?.item ?? choices[0]?.id ?? "";
    const chance = h("input", { type: "number", min: "0", max: "100", step: "any", title: "Xác suất (%)" });
    chance.value = String(Math.round((line?.chance ?? 0.1) * 10000) / 100);
    const min = h("input", { type: "number", min: "0", step: "1", title: "Số lượng tối thiểu" });
    min.value = String(line?.min ?? 1);
    const max = h("input", { type: "number", min: "0", step: "1", title: "Số lượng tối đa" });
    max.value = String(line?.max ?? 1);
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar effect" }, sel, h("span", { class: "muted" }, "xác suất %"), chance, h("span", { class: "muted" }, "số lượng"), min, h("span", { class: "muted" }, "đến"), max, rm);
    rm.addEventListener("click", () => row.remove());
    box.append(row);
  };

  const rankBlock = (title: string, lines: Ranks, where: "base" | string): HTMLElement => {
    const ranks: Record<string, HTMLElement> = {};
    const parts = RANK_VI.map(([rank, label]) => {
      const box = h("div");
      for (const l of lines[rank]) lineRow(box, l);
      const add = h("button", { type: "button" }, "+ Thêm dòng");
      add.addEventListener("click", () => lineRow(box));
      ranks[rank] = box;
      return h("div", null, h("b", null, label), box, add);
    });
    sections.push({ where, ranks });
    return h("section", { class: "form" }, h("h3", null, title), ...parts);
  };

  const blocks: HTMLElement[] = [rankBlock("Mọi bản đồ", data.loot.base, "base")];
  for (const r of data.realms) {
    const extra = data.loot.realm[r.key];
    blocks.push(rankBlock(`Thêm cho bản đồ cảnh giới ${r.nameVi}`, extra ?? { normal: [], rare1: [], rare2: [] }, r.key));
  }

  const collect = (): Loot => {
    const read = (ranks: Record<string, HTMLElement>): Ranks => {
      const out = { normal: [], rare1: [], rare2: [] } as Ranks;
      for (const [rank] of RANK_VI)
        out[rank] = [...ranks[rank]!.children].map((row) => {
          const [sel] = row.querySelectorAll("select");
          const nums = row.querySelectorAll("input");
          return { item: (sel as HTMLSelectElement).value, chance: Math.round(Number((nums[0] as HTMLInputElement).value) * 100) / 10000, min: Number((nums[1] as HTMLInputElement).value), max: Number((nums[2] as HTMLInputElement).value) };
        });
      return out;
    };
    const loot: Loot = { base: read(sections[0]!.ranks), realm: {} };
    for (const s of sections.slice(1)) {
      const ranks = read(s.ranks);
      if (RANK_VI.some(([r]) => ranks[r].length > 0)) loot.realm[s.where] = ranks;
    }
    return loot;
  };

  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };
  const save = h("button", { type: "button", class: "primary" }, "Lưu bảng rơi");
  save.addEventListener("click", async () => {
    const loot = collect();
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/loot/save", { method: "POST", body: { loot, token: data.token } });
    if (res.status === 200) return navigate("/admin/monsters/loot");
    const code = res.data.error ?? "";
    show(ERRORS[code] ?? `Lỗi ${res.status}.`, "err", code === "invalid" ? res.data.problems ?? [] : []);
  });
  return h(
    "div",
    null,
    h(
      "p",
      { class: "muted" },
      "Mỗi lần giết, các dòng được tung theo thứ tự: xác suất (đã nhân hệ số của hạng, hoặc của boss) rồi số lượng trong khoảng. Bảng chung áp cho mọi bản đồ, bảng thêm áp cho bản đồ của cảnh giới đó. Trang bị, Linh Thạch, bí tịch và đan đột phá rơi theo cơ chế riêng (tab Hạng quái và rơi đồ). Chưa có bảng riêng từng loài. Áp dụng cho lần giết kế tiếp sau tối đa 30 giây.",
    ),
    ...blocks,
    h("div", { class: "toolbar" }, save),
    msg,
    problems,
  );
}

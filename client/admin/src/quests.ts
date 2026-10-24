import { api, h, listView, navigate } from "./kit";

/** "Nhiệm vụ" (PHASE3 3e): the quest catalogue as a list and a form. The server checks the whole catalogue again on every save. */

interface Objective {
  kind: "talk" | "kill" | "collect" | "reach";
  npc?: string;
  count?: number;
  map?: string;
  rare?: boolean;
  item?: string;
  qty?: number;
  also?: Array<{ item: string; qty: number }>;
  realm?: number;
  stage?: number;
}

interface Quest {
  id: string;
  chain: string;
  seq: number;
  giver: string;
  titleVi: string;
  descVi: string;
  enabled: boolean;
  requires: string | null;
  minRealm?: number;
  minStage?: number;
  path?: string;
  repeat?: "daily";
  objective: Objective;
  rewards: { linhThach?: number; congHien?: number; exp?: number; items?: Array<{ item: string; qty: number }> };
}

interface Item {
  def: Quest;
  updatedAt: number;
  deleted: boolean;
  active: number;
  done: number;
}

interface Named {
  id: string;
  name: string;
  maps: string[];
}

interface Meta {
  givers: Named[];
  npcs: Named[];
  items: Array<{ id: string; nameVi: string; maxStack: number }>;
  maps: string[];
  realms: Array<{ id: number; nameVi: string }>;
  paths: Array<{ id: string; nameVi: string; itemId: string }>;
  chains: string[];
  limits: { title: number; description: number };
}

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu nhiệm vụ này. Hãy quay lại danh sách và mở lại.",
  exists: "Mã nhiệm vụ này đã dùng (kể cả nhiệm vụ đã xóa).",
  has_progress: "Mã này còn tiến độ của nhân vật, hãy chọn mã khác.",
  deleted: "Nhiệm vụ đã bị xóa nên không sửa được nữa.",
  not_found: "Không tìm thấy nhiệm vụ.",
  unchanged: "Không có gì thay đổi.",
  busy: "Dữ liệu vừa đổi (có người nhận nhiệm vụ). Hãy thử lại.",
  locked_field: "Nhiệm vụ đã có người chơi giữ tiến độ nên không đổi được loại yêu cầu, hướng tu hoặc chế độ lặp.",
};

const objectiveText = (o: Objective, nameOf: (id: string) => string): string =>
  o.kind === "talk" ? `Nói chuyện với ${o.npc}` : o.kind === "kill" ? `Hạ ${o.count} quái${o.map ? ` ở ${o.map}` : ""}${o.rare ? " (hiếm)" : ""}` : o.kind === "collect" ? `Nộp ${nameOf(o.item!)} × ${o.qty}${o.also?.length ? ` +${o.also.length} loại` : ""}` : `Đạt cảnh giới ${o.realm}, tầng ${o.stage}`;

const rewardText = (r: Quest["rewards"], nameOf: (id: string) => string): string =>
  [r.linhThach ? `${r.linhThach} LT` : "", r.congHien ? `${r.congHien} CH` : "", r.exp ? `${r.exp} EXP` : "", ...(r.items ?? []).map((i) => `${nameOf(i.item)} × ${i.qty}`)].filter(Boolean).join(", ");

async function load(): Promise<{ quests: Item[]; meta: Meta } | null> {
  const res = await api<{ quests: Item[]; meta: Meta }>("/api/admin/quests");
  return res.status === 200 ? res.data : null;
}

export function questListPage(): HTMLElement {
  const root = h("div");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const nameOf = (id: string) => data.meta.items.find((i) => i.id === id)?.nameVi ?? id;
    const add = h("button", { type: "button", class: "primary" }, "+ Thêm nhiệm vụ");
    add.addEventListener("click", () => navigate("/admin/quests/edit"));
    const key = (q: Item, k: string): string | number => (k === "chain" ? q.def.chain : k === "seq" ? q.def.seq : k === "title" ? q.def.titleVi : k === "giver" ? q.def.giver : k === "active" ? q.active : k === "done" ? q.done : q.def.id);
    root.replaceChildren(
      h("p", { class: "muted" }, "Nhiệm vụ đổi có hiệu lực với máy chủ sau tối đa 30 giây; người chơi thấy tiêu đề mới khi mở lại NPC. Nhiệm vụ đang có người làm chỉ bị xóa mềm (ngừng phát)."),
      listView<Item>({
        columns: [
          { key: "chain", label: "Chuỗi", sortable: true, render: (q) => q.def.chain },
          { key: "seq", label: "Bước", sortable: true, render: (q) => String(q.def.seq) },
          { key: "id", label: "Mã", sortable: true, render: (q) => q.def.id },
          { key: "title", label: "Tên", sortable: true, render: (q) => q.def.titleVi },
          { key: "giver", label: "Người giao", sortable: true, render: (q) => q.def.giver },
          { key: "obj", label: "Yêu cầu", render: (q) => objectiveText(q.def.objective, nameOf) },
          { key: "rew", label: "Thưởng", render: (q) => rewardText(q.def.rewards, nameOf) },
          { key: "active", label: "Đang làm", sortable: true, render: (q) => String(q.active) },
          { key: "done", label: "Đã xong", sortable: true, render: (q) => String(q.done) },
          { key: "state", label: "Trạng thái", render: (q) => (q.deleted ? "Đã xóa (mềm)" : q.def.enabled ? "Bật" : "Tắt") },
        ],
        defaultSort: { key: "chain", dir: "asc" },
        searchPlaceholder: "Tìm theo mã, tên, chuỗi, người giao...",
        toolbar: [add],
        rowHref: (q) => `/admin/quests/edit?id=${encodeURIComponent(q.def.id)}`,
        fetchPage: async (q) => {
          const needle = q.q.toLowerCase();
          let rows = data.quests.filter((x) => !needle || [x.def.id, x.def.titleVi, x.def.chain, x.def.giver].some((s) => s.toLowerCase().includes(needle)));
          rows = [...rows].sort((a, b) => {
            const av = key(a, q.sort);
            const bv = key(b, q.sort);
            const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "vi") || a.def.seq - b.def.seq;
            return q.dir === "asc" ? c : -c;
          });
          return { rows: rows.slice((q.page - 1) * q.size, q.page * q.size), total: rows.length };
        },
      }),
    );
  });
  return root;
}

export function questEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id");
  void load().then((data) => {
    if (!data) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const current = id ? data.quests.find((q) => q.def.id === id) : undefined;
    if (id && !current) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy nhiệm vụ."), h("a", { href: "/admin/quests" }, "‹ Danh sách"));
    root.replaceChildren(form(data.meta, data.quests, current));
  });
  return root;
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
  const i = h("input", { type: "number", step: "1", ...extra });
  i.value = value === undefined ? "" : String(value);
  return i;
}

function field(label: string, ...children: Array<Node | null>): HTMLElement {
  return h("label", { class: "filter wide-field" }, label, ...children);
}

function form(meta: Meta, all: Item[], current: Item | undefined): HTMLElement {
  const q: Quest = current?.def ?? { id: "", chain: "events", seq: 1, giver: meta.givers[0]?.id ?? "elder", titleVi: "", descVi: "", enabled: true, requires: null, objective: { kind: "kill", count: 10 }, rewards: {} };
  const locked = current?.deleted === true;
  const hasRows = (current?.active ?? 0) + (current?.done ?? 0) > 0;
  const mapLabel = (n: Named) => `${n.name} (${n.id}${n.maps.length ? `, ${n.maps.join("/")}` : ""})`;
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });

  const idInput = h("input", { type: "text", maxlength: "40", placeholder: "ma_nhiem_vu (a-z, 0-9, _)" });
  idInput.value = q.id;
  idInput.disabled = current !== undefined;
  const chain = h("input", { type: "text", maxlength: "24", list: "chains" });
  chain.value = q.chain;
  const chainList = h("datalist", { id: "chains" }, ...meta.chains.map((c) => option(c, c)));
  const seq = num(q.seq, { min: "0" });
  const giver = select(meta.givers.map((g): [string, string] => [g.id, mapLabel(g)]), q.giver);
  const title = h("input", { type: "text", maxlength: String(meta.limits.title) });
  title.value = q.titleVi;
  const desc = h("textarea", { rows: "3", maxlength: String(meta.limits.description) });
  desc.value = q.descVi;
  const enabled = h("input", { type: "checkbox" });
  enabled.checked = q.enabled;
  const requires = select([["", "(không)"], ...all.filter((x) => x.def.id !== q.id && !x.deleted).map((x): [string, string] => [x.def.id, `${x.def.id} — ${x.def.titleVi}`])], q.requires ?? "");
  const minRealm = select([["", "(không)"], ...meta.realms.map((r): [string, string] => [String(r.id), r.nameVi])], q.minRealm === undefined ? "" : String(q.minRealm));
  const minStage = num(q.minStage, { min: "1", max: "9", placeholder: "tầng" });
  const path = select([["", "(không)"], ...meta.paths.map((p): [string, string] => [p.id, p.nameVi])], q.path ?? "");
  const repeat = h("input", { type: "checkbox" });
  repeat.checked = q.repeat === "daily";
  for (const el of [path, repeat]) el.disabled = locked || hasRows;

  // Objective: one block per kind, only the chosen one is shown.
  const o = q.objective;
  const kind = select([["talk", "Nói chuyện với NPC"], ["kill", "Hạ quái"], ["collect", "Nộp vật phẩm"], ["reach", "Đạt cảnh giới"]], o.kind);
  kind.disabled = locked || hasRows;
  const npc = select(meta.npcs.map((n): [string, string] => [n.id, mapLabel(n)]), o.npc ?? meta.npcs[0]?.id ?? "");
  const killCount = num(o.count, { min: "1" });
  const killMap = select([["", "(mọi bản đồ)"], ...meta.maps.map((m): [string, string] => [m, m])], o.map ?? "");
  const rare = h("input", { type: "checkbox" });
  rare.checked = o.rare === true;
  const itemOptions = meta.items.map((i): [string, string] => [i.id, `${i.nameVi} (${i.id})`]);
  const collectItem = select(itemOptions, o.item ?? meta.items[0]?.id ?? "");
  const collectQty = num(o.qty, { min: "1" });
  const alsoRows = h("div");
  const addAlso = (item?: string, qty?: number) => {
    if (alsoRows.children.length >= 4) return;
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar" }, select(itemOptions, item ?? meta.items[0]?.id ?? ""), num(qty ?? 1, { min: "1" }), rm);
    rm.addEventListener("click", () => row.remove());
    alsoRows.append(row);
  };
  for (const a of o.also ?? []) addAlso(a.item, a.qty);
  const addAlsoBtn = h("button", { type: "button" }, "+ Thêm loại vật phẩm nộp");
  addAlsoBtn.addEventListener("click", () => addAlso());
  const reachRealm = select(meta.realms.map((r): [string, string] => [String(r.id), r.nameVi]), String(o.realm ?? 0));
  const reachStage = num(o.stage ?? 1, { min: "1", max: "9" });
  const blocks: Record<string, HTMLElement> = {
    talk: field("NPC", npc),
    kill: h("div", null, field("Số quái", killCount), field("Bản đồ", killMap), h("label", { class: "radio" }, rare, "Chỉ quái hiếm (Tinh Anh, Đại Yêu)")),
    collect: h("div", null, field("Vật phẩm", collectItem), field("Số lượng", collectQty), h("div", { class: "muted" }, "Nộp thêm các vật phẩm khác cùng lúc:"), alsoRows, addAlsoBtn),
    reach: h("div", null, field("Cảnh giới", reachRealm), field("Tầng", reachStage)),
  };
  const showObjective = () => {
    for (const [k, el] of Object.entries(blocks)) el.hidden = k !== kind.value;
  };
  kind.addEventListener("change", showObjective);
  showObjective();

  // Rewards.
  const linh = num(q.rewards.linhThach, { min: "0" });
  const cong = num(q.rewards.congHien, { min: "0" });
  const exp = num(q.rewards.exp, { min: "0" });
  const rewardRows = h("div");
  const addReward = (item?: string, qty?: number) => {
    if (rewardRows.children.length >= 5) return;
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar" }, select(itemOptions, item ?? meta.items[0]?.id ?? ""), num(qty ?? 1, { min: "1" }), rm);
    rm.addEventListener("click", () => row.remove());
    rewardRows.append(row);
  };
  for (const r of q.rewards.items ?? []) addReward(r.item, r.qty);
  const addRewardBtn = h("button", { type: "button" }, "+ Thêm vật phẩm thưởng");
  addRewardBtn.addEventListener("click", () => addReward());

  const optNum = (el: HTMLInputElement): number | undefined => (el.value.trim() === "" ? undefined : Number(el.value));
  const pairs = (box: HTMLElement) => [...box.children].map((row) => ({ item: (row.querySelector("select") as HTMLSelectElement).value, qty: Number((row.querySelector("input") as HTMLInputElement).value) }));

  const collect = (): Quest => {
    const objective: Objective =
      kind.value === "talk" ? { kind: "talk", npc: npc.value } : kind.value === "kill" ? { kind: "kill", count: Number(killCount.value), ...(killMap.value ? { map: killMap.value } : {}), ...(rare.checked ? { rare: true } : {}) }
        : kind.value === "collect" ? { kind: "collect", item: collectItem.value, qty: Number(collectQty.value), ...(alsoRows.children.length ? { also: pairs(alsoRows) } : {}) }
          : { kind: "reach", realm: Number(reachRealm.value), stage: Number(reachStage.value) };
    const ln = optNum(linh);
    const ch = optNum(cong);
    const ex = optNum(exp);
    return {
      id: idInput.value.trim(),
      chain: chain.value.trim(),
      seq: Number(seq.value),
      giver: giver.value,
      titleVi: title.value,
      descVi: desc.value,
      enabled: enabled.checked,
      requires: requires.value || null,
      ...(minRealm.value ? { minRealm: Number(minRealm.value) } : {}),
      ...(minRealm.value && optNum(minStage) !== undefined ? { minStage: optNum(minStage) } : {}),
      ...(path.value ? { path: path.value } : {}),
      ...(repeat.checked ? { repeat: "daily" as const } : {}),
      objective,
      rewards: { ...(ln ? { linhThach: ln } : {}), ...(ch ? { congHien: ch } : {}), ...(ex ? { exp: ex } : {}), ...(rewardRows.children.length ? { items: pairs(rewardRows) } : {}) },
    };
  };

  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };
  const save = h("button", { type: "button", class: "primary" }, current ? "Lưu" : "Tạo nhiệm vụ");
  save.disabled = locked;
  save.addEventListener("click", async () => {
    save.disabled = true;
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/quests/save", { method: "POST", body: { quest: collect(), isNew: current === undefined, updatedAt: current?.updatedAt ?? 0 } });
    save.disabled = locked;
    if (res.status === 200) return navigate("/admin/quests");
    const e = res.data.error ?? "";
    show(ERRORS[e] ?? (e === "invalid" ? "Nhiệm vụ không hợp lệ:" : `Lỗi ${res.status}.`), "err", e === "invalid" || e === "locked_field" ? res.data.problems ?? [] : []);
  });
  const del = h("button", { type: "button" }, "Xóa nhiệm vụ");
  del.disabled = locked || current === undefined;
  del.addEventListener("click", async () => {
    if (!current) return;
    const dependents = all.filter((x) => x.def.requires === current.def.id).map((x) => x.def.id);
    const text = `Xóa «${current.def.titleVi}»?\n${hasRows ? "Có nhân vật đang giữ tiến độ nên nhiệm vụ chỉ ngừng phát (xóa mềm), người đang làm vẫn hoàn thành được." : "Không ai giữ tiến độ nên sẽ xóa hẳn."}${dependents.length ? `\nNhiệm vụ phía sau (${dependents.join(", ")}) sẽ nối lại vào nhiệm vụ trước của nhiệm vụ này.` : ""}`;
    if (!window.confirm(text)) return;
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/quests/delete", { method: "POST", body: { id: current.def.id, updatedAt: current.updatedAt } });
    if (res.status === 200) return navigate("/admin/quests");
    show(ERRORS[res.data.error ?? ""] ?? (res.data.error === "invalid" ? "Không xóa được vì danh mục sẽ không hợp lệ:" : `Lỗi ${res.status}.`), "err", res.data.problems ?? []);
  });

  return h(
    "div",
    null,
    h("a", { href: "/admin/quests" }, "‹ Danh sách nhiệm vụ"),
    h("h2", null, current ? `Sửa nhiệm vụ: ${q.titleVi}` : "Thêm nhiệm vụ"),
    locked ? h("p", { class: "err" }, "Nhiệm vụ này đã bị xóa mềm (còn người chơi giữ tiến độ), chỉ xem.") : null,
    current ? h("p", { class: "muted" }, `${current.active} nhân vật đang làm, ${current.done} đã xong.${hasRows ? " Không đổi được loại yêu cầu, hướng tu và chế độ lặp." : ""}`) : null,
    h("section", { class: "form" }, field("Mã (không đổi được sau khi tạo)", idInput), field("Chuỗi", chain, chainList), field("Thứ tự trong chuỗi", seq), field("Người giao", giver), field("Tên", title), field("Mô tả", desc), h("label", { class: "radio" }, enabled, "Bật (đang phát cho người chơi mới)")),
    h("section", { class: "form" }, h("h3", null, "Điều kiện nhận"), field("Phải xong nhiệm vụ", requires), field("Cảnh giới tối thiểu", minRealm), field("Tầng tối thiểu (cùng cảnh giới đó)", minStage), field("Nhiệm vụ hướng tu của", path), h("label", { class: "radio" }, repeat, "Lặp lại hằng ngày (mở lại 0 giờ giờ Việt Nam)")),
    h("section", { class: "form" }, h("h3", null, "Yêu cầu"), field("Loại", kind), blocks.talk!, blocks.kill!, blocks.collect!, blocks.reach!),
    h("section", { class: "form" }, h("h3", null, "Phần thưởng"), h("div", { class: "toolbar" }, field("Linh Thạch", linh), field("Cống Hiến", cong), field("EXP", exp)), h("div", { class: "muted" }, "Trang bị chưa dùng làm thưởng được. Nhiệm vụ hướng tu không trả tiền."), rewardRows, addRewardBtn),
    h("div", { class: "toolbar" }, save, del),
    msg,
    problems,
  );
}

import { CELLS_PER_TILE, buildFromRecipe, type GridOp, type MapRecipe } from "../../../shared/src/map";
import { api, h, listView, navigate } from "./kit";

/**
 * "Bản đồ" (PHASE3 3l-a): the list of the six maps and a form for one: colours, home town, spawn, gates and the steps that build the obstacles, with a preview
 * drawn by the game's own grid builder. Size, playing rectangle, realm and safe flag are shown but fixed. The server checks everything again on every save.
 */

interface Item {
  id: string;
  size: number;
  realm: number | null;
  safe: boolean;
  home: string;
  portals: number;
  ops: number;
  edited: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

interface View {
  recipe: MapRecipe;
  updatedAt: number;
  edited: boolean;
  maps: string[];
}

const ERRORS: Record<string, string> = {
  version_conflict: "Người khác vừa lưu bản đồ này. Hãy quay lại danh sách và mở lại.",
  unchanged: "Không có gì thay đổi.",
  not_found: "Không tìm thấy bản đồ.",
  busy: "Dữ liệu vừa đổi. Hãy thử lại.",
  locked: "Kích thước, khung chơi, cảnh giới và cờ an toàn không đổi được ở đây.",
  invalid: "Công thức không hợp lệ:",
};

const OP_LABEL: Record<GridOp["op"], string> = {
  rect: "Hình chữ nhật (ô)",
  disc: "Hình tròn (ô)",
  chamfered: "Chữ nhật cắt góc (ô)",
  srect: "Chữ nhật trên màn hình",
  blockAt: "Chặn tròn trên màn hình",
  frame: "Khung tường",
  clip: "Cắt ngoài khung",
  scatter: "Rải vật cản ngẫu nhiên",
};

const OP_KEYS: Record<GridOp["op"], string[]> = {
  rect: ["x0", "y0", "x1", "y1"],
  disc: ["cx", "cy", "r"],
  chamfered: ["x0", "y0", "x1", "y1", "cut"],
  srect: ["px0", "py0", "px1", "py1"],
  blockAt: ["px", "py", "r"],
  frame: ["halfW", "halfH", "bandX", "bandY"],
  clip: ["halfW", "halfH"],
  scatter: ["seed", "count", "rMin", "rMax", "halfW", "halfH"],
};
const HAS_FLAG = new Set<GridOp["op"]>(["rect", "disc", "chamfered", "srect"]);

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function mapListPage(): HTMLElement {
  const root = h("div");
  void api<{ maps: Item[] }>("/api/admin/maps").then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
    const maps = res.data.maps;
    root.replaceChildren(
      h("p", { class: "muted" }, "Đổi bản đồ có hiệu lực với máy chủ sau tối đa 30 giây; người chơi nhận bản đồ mới khi vào lại game hoặc đổi bản đồ. Hãy sửa lúc không có người trong bản đồ đó: máy chủ dùng lưới mới ngay cho việc đi lại, còn quái đang chạy và máy khách của người đang đứng trong bản đồ vẫn giữ lưới cũ tới khi phòng trống hoặc họ vào lại, nên họ có thể bị giật vị trí."),
      listView<Item>({
        columns: [
          { key: "id", label: "Mã", sortable: true, render: (m) => m.id },
          { key: "size", label: "Kích thước", sortable: true, render: (m) => `${m.size} × ${m.size}` },
          { key: "realm", label: "Cảnh giới", render: (m) => (m.safe ? "Thành an toàn" : String(m.realm ?? "")) },
          { key: "home", label: "Về thành", render: (m) => m.home },
          { key: "portals", label: "Cổng", sortable: true, render: (m) => String(m.portals) },
          { key: "ops", label: "Bước dựng", sortable: true, render: (m) => String(m.ops) },
          { key: "edited", label: "Trạng thái", render: (m) => (m.edited ? `Đã sửa (${m.updatedBy})` : "Bản của code") },
        ],
        defaultSort: { key: "id", dir: "asc" },
        hideSearch: true,
        rowHref: (m) => `/admin/maps/edit?id=${encodeURIComponent(m.id)}`,
        fetchPage: async (q) => {
          const rows = [...maps].sort((a, b) => (q.sort === "size" ? a.size - b.size : q.sort === "portals" ? a.portals - b.portals : q.sort === "ops" ? a.ops - b.ops : a.id.localeCompare(b.id)) * (q.dir === "asc" ? 1 : -1));
          return { rows: rows.slice((q.page - 1) * q.size, q.page * q.size), total: rows.length };
        },
      }),
    );
  });
  return root;
}

function num(value: number, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "number", step: "any", ...extra });
  i.value = String(value);
  i.style.width = "7em";
  return i;
}

function select(options: string[], value: string): HTMLSelectElement {
  const s = h("select", null, ...options.map((o) => h("option", { value: o }, o)));
  s.value = value;
  return s;
}

/** Draws the collision grid of the recipe on the screen rectangle: blocked cells dark, gates red, the spawn green. */
function drawPreview(canvas: HTMLCanvasElement, recipe: MapRecipe): void {
  const map = buildFromRecipe(recipe);
  const { halfW, halfH } = recipe.rect;
  const scale = canvas.width / (halfW * 2);
  canvas.height = Math.round(halfH * 2 * scale);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const cells = map.width * CELLS_PER_TILE;
  const [a, b, o] = [recipe.palette.groundA, recipe.palette.groundB, recipe.palette.obstacle];
  const put = (i: number, c: number) => {
    img.data[i] = (c >> 16) & 255;
    img.data[i + 1] = (c >> 8) & 255;
    img.data[i + 2] = c & 255;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // Screen unit (sx, sy) -> tile (tx, ty): tx - ty = sx, tx + ty = 2 sy + size.
      const sx = x / scale - halfW;
      const sy = y / scale - halfH;
      const tx = (sx + 2 * sy + map.width) / 2;
      const ty = (2 * sy + map.width - sx) / 2;
      const cx = Math.floor(tx * CELLS_PER_TILE);
      const cy = Math.floor(ty * CELLS_PER_TILE);
      const i = (y * canvas.width + x) * 4;
      if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) put(i, 0x000000);
      else if (map.collision[cy * cells + cx]) put(i, (Math.floor(tx) + Math.floor(ty)) % 2 === 0 ? a : b);
      else put(i, o);
    }
  }
  ctx.putImageData(img, 0, 0);
  const dot = (tx: number, ty: number, color: string) => {
    const sx = tx + 0.5 - (ty + 0.5);
    const sy = (tx + 0.5 + ty + 0.5 - map.width) / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((sx + halfW) * scale, (sy + halfH) * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const p of recipe.portals) dot(p.x, p.y, "#ff3b3b");
  dot(recipe.spawn[0], recipe.spawn[1], "#3bff6b");
}

export function mapEditPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id") ?? "";
  void api<View>(`/api/admin/maps/recipe?id=${encodeURIComponent(id)}`).then((res) => {
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy bản đồ."), h("a", { href: "/admin/maps" }, "‹ Danh sách"));
    root.replaceChildren(form(res.data));
  });
  return root;
}

function form(view: View): HTMLElement {
  const r = view.recipe;
  const msg = h("div", { class: "msg muted" });
  const problems = h("ul", { class: "err" });
  const show = (text: string, cls: string, list: string[] = []) => {
    msg.textContent = text;
    msg.className = `msg ${cls}`;
    problems.replaceChildren(...list.map((p) => h("li", null, p)));
  };

  const colors = (["groundA", "groundB", "obstacle"] as const).map((k) => {
    const i = h("input", { type: "color" });
    i.value = hex(r.palette[k]);
    return { k, i };
  });
  const home = select(view.maps, r.home);
  const spawnX = num(r.spawn[0], { step: "1" });
  const spawnY = num(r.spawn[1], { step: "1" });

  const portalRows = h("div");
  const addPortal = (p: { x: number; y: number; toMap: string; toX: number; toY: number }) => {
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar" }, num(p.x, { step: "1" }), num(p.y, { step: "1" }), h("span", null, "→"), select(view.maps, p.toMap), num(p.toX, { step: "1" }), num(p.toY, { step: "1" }), rm);
    rm.addEventListener("click", () => row.remove());
    portalRows.append(row);
  };
  for (const p of r.portals) addPortal(p);
  const addPortalBtn = h("button", { type: "button" }, "+ Thêm cổng");
  addPortalBtn.addEventListener("click", () => addPortal({ x: r.spawn[0], y: r.spawn[1], toMap: view.maps.find((m) => m !== r.id) ?? r.id, toX: 0, toY: 0 }));

  const opRows = h("div");
  const addOp = (op: GridOp) => {
    const keys = OP_KEYS[op.op];
    const inputs = keys.map((k) => num((op as unknown as Record<string, number>)[k]!, { title: k, placeholder: k }));
    const flag = h("input", { type: "checkbox" });
    flag.checked = HAS_FLAG.has(op.op) ? (op as { walkable: boolean }).walkable : false;
    const up = h("button", { type: "button" }, "↑");
    const down = h("button", { type: "button" }, "↓");
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar" }, h("b", { title: op.op }, OP_LABEL[op.op]), ...keys.flatMap((k, i) => [h("span", { class: "muted" }, k), inputs[i]!]), HAS_FLAG.has(op.op) ? h("label", { class: "radio" }, flag, "đi được") : null, up, down, rm);
    (row as unknown as { read: () => GridOp }).read = () => {
      const o: Record<string, unknown> = { op: op.op };
      keys.forEach((k, i) => (o[k] = Number(inputs[i]!.value)));
      if (HAS_FLAG.has(op.op)) o.walkable = flag.checked;
      return o as unknown as GridOp;
    };
    up.addEventListener("click", () => row.previousElementSibling && row.previousElementSibling.before(row));
    down.addEventListener("click", () => row.nextElementSibling && row.nextElementSibling.after(row));
    rm.addEventListener("click", () => row.remove());
    opRows.append(row);
  };
  for (const op of r.ops) addOp(op);
  const newKind = select(Object.keys(OP_KEYS), "srect");
  const addOpBtn = h("button", { type: "button" }, "+ Thêm bước");
  addOpBtn.addEventListener("click", () => {
    const kind = newKind.value as GridOp["op"];
    const base: Record<string, unknown> = { op: kind };
    for (const k of OP_KEYS[kind]) base[k] = 0;
    if (HAS_FLAG.has(kind)) base.walkable = false;
    if (kind === "scatter") Object.assign(base, { seed: 1, count: 10, rMin: 0.3, rMax: 0.5, halfW: r.rect.halfW, halfH: r.rect.halfH });
    // New steps go before the last one: the cut to the rectangle comes last (it is how the playing area ends).
    addOp(base as unknown as GridOp);
    const last = opRows.lastElementChild!;
    const rows = [...opRows.children];
    const clip = rows.reverse().find((x) => (x.querySelector("b") as HTMLElement | null)?.title === "clip");
    if (clip && clip !== last) clip.before(last);
  });

  const collect = (): MapRecipe => ({
    ...r,
    home: home.value as MapRecipe["home"],
    palette: { groundA: parseInt(colors[0]!.i.value.slice(1), 16), groundB: parseInt(colors[1]!.i.value.slice(1), 16), obstacle: parseInt(colors[2]!.i.value.slice(1), 16) },
    spawn: [Number(spawnX.value), Number(spawnY.value)],
    portals: [...portalRows.children].map((row) => {
      const i = row.querySelectorAll("input");
      return { x: Number(i[0]!.value), y: Number(i[1]!.value), toMap: (row.querySelector("select") as HTMLSelectElement).value as MapRecipe["home"], toX: Number(i[2]!.value), toY: Number(i[3]!.value) };
    }),
    ops: [...opRows.children].map((row) => (row as unknown as { read: () => GridOp }).read()),
  });

  const canvas = h("canvas", { width: "900", height: "450" });
  canvas.style.maxWidth = "100%";
  canvas.style.border = "1px solid #444";
  const preview = h("button", { type: "button" }, "Xem trước");
  preview.addEventListener("click", () => {
    show("Đang dựng...", "muted");
    setTimeout(() => {
      try {
        drawPreview(canvas, collect());
        show("Xanh = điểm sinh, đỏ = cổng; ô tối = vật cản. Chưa lưu.", "muted");
      } catch (err) {
        show(`Không dựng được: ${String(err)}`, "err");
      }
    }, 20);
  });

  const save = h("button", { type: "button", class: "primary" }, "Lưu");
  save.addEventListener("click", async () => {
    save.disabled = true;
    show("Đang lưu...", "muted");
    const res = await api<{ error?: string; problems?: string[] }>("/api/admin/maps/save", { method: "POST", body: { recipe: collect(), updatedAt: view.updatedAt } });
    save.disabled = false;
    if (res.status === 200) return navigate("/admin/maps");
    const e = res.data.error ?? "";
    show(ERRORS[e] ?? `Lỗi ${res.status}.`, "err", e === "invalid" || e === "locked" ? res.data.problems ?? [] : []);
  });
  const reset = h("button", { type: "button" }, "Về bản của code");
  reset.disabled = !view.edited;
  reset.addEventListener("click", async () => {
    if (!window.confirm(`Đưa bản đồ ${r.id} về bản của code? Mọi chỉnh sửa bị bỏ.`)) return;
    const res = await api<{ error?: string }>("/api/admin/maps/save", { method: "POST", body: { reset: true, id: r.id, updatedAt: view.updatedAt } });
    if (res.status === 200) return navigate("/admin/maps");
    show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err");
  });

  return h(
    "div",
    null,
    h("a", { href: "/admin/maps" }, "‹ Danh sách bản đồ"),
    h("h2", null, `Bản đồ ${r.id}`),
    h("p", { class: "muted" }, `Cố định: kích thước ${r.size} × ${r.size}, khung chơi ${r.rect.halfW} × ${r.rect.halfH}, ${r.safe ? "thành an toàn" : `cảnh giới ${r.realm}`}. Bãi quái, boss và vệ binh của bản đồ vẫn theo code (xem ghi chú ở docs/PHASE3.md). NPC chỉnh ở mục NPC.`),
    h("section", { class: "form" }, h("h3", null, "Màu"), h("div", { class: "toolbar" }, h("span", null, "Nền A"), colors[0]!.i, h("span", null, "Nền B"), colors[1]!.i, h("span", null, "Vật cản"), colors[2]!.i)),
    h("section", { class: "form" }, h("h3", null, "Điểm sinh và thành về khi chết"), h("div", { class: "toolbar" }, h("span", null, "Sinh tại ô"), spawnX, spawnY, h("span", null, "Về thành"), home)),
    h("section", { class: "form" }, h("h3", null, "Cổng (ô x, ô y → bản đồ, ô đến x, ô đến y)"), portalRows, addPortalBtn),
    h("section", { class: "form" }, h("h3", null, "Các bước dựng lưới (theo thứ tự; bước sau đè bước trước)"), h("p", { class: "muted" }, "Số liệu là số đã tính của code. Các bước “trên màn hình” dùng đơn vị màn hình 32 px. Bước cuối thường là cắt ngoài khung."), opRows, h("div", { class: "toolbar" }, newKind, addOpBtn)),
    h("section", { class: "form" }, h("h3", null, "Xem trước"), h("div", { class: "toolbar" }, preview), canvas),
    h("div", { class: "toolbar" }, save, reset),
    msg,
    problems,
  );
}

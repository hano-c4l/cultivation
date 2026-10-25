import { api, formatTime, h, navigate } from "./kit";

/**
 * "Nhân vật" (PHASE3 3m-b): the whole character of an account and its edit. "Sửa" puts the character under review for 30 minutes (the player cannot log in, an
 * online one is kicked after a confirmation); only then do the forms below work. "Xong" ends the review. The server checks the review on every change.
 */

interface View {
  id: string;
  accountId: string;
  email: string;
  name: string;
  gender: string;
  realm: number;
  stage: number;
  exp: number;
  potentialPoints: number;
  stats: Record<string, number>;
  map: string;
  satKhi: number;
  satNhan: number;
  anhHung: number;
  review: { by: string; until: number } | null;
  wallet: Record<string, number>;
  items: Array<{ id: string; type: string; qty: number; tab: number; cell: number }>;
  equipped: Array<{ id: string; type: string; slot: string }>;
  skills: Array<{ id: string; source: string; realm: number; level: number }>;
}

const REALMS = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh"];
const STAT_LABEL: Record<string, string> = { canCot: "Căn cốt", thanPhap: "Thân pháp", ngoTinh: "Ngộ tính", linhLuc: "Linh lực", thanThuc: "Thần thức", phucDuyen: "Phúc duyên" };
const CURRENCY_LABEL: Record<string, string> = { linh_thach: "Linh Thạch", cong_hien: "Cống Hiến", tien_ngoc: "Tiên Ngọc" };
const ERRORS: Record<string, string> = {
  invalid: "Dữ liệu không hợp lệ.",
  not_found: "Không tìm thấy.",
  not_reviewing: "Bạn chưa bắt đầu sửa nhân vật này, hoặc đã hết 30 phút. Bấm “Sửa” lại.",
  reviewed_by_other: "Admin khác đang sửa nhân vật này.",
  unchanged: "Không có gì thay đổi.",
  full: "Túi đồ không đủ chỗ.",
  funds: "Không đủ tiền để trừ.",
  busy: "Dữ liệu vừa đổi, hãy thử lại.",
  name_taken: "Đạo hiệu đã có người dùng.",
  equipped: "Nhân vật đang mặc trang bị nên chưa đổi giới tính được (tháo hết đồ trước).",
  unknown_item: "Vật phẩm không có hoặc không thêm được (trang bị chưa thêm được).",
};

export function characterPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const load = async () => {
    const res = await api<{ character: View; online: boolean }>(`/api/admin/character?id=${encodeURIComponent(id)}`);
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy nhân vật."), h("a", { href: "/admin/accounts" }, "‹ Tài khoản"));
    const meta = await api<{ items: Array<{ id: string; nameVi: string }> }>("/api/admin/gifts/meta");
    const skills = await api<{ skills: Array<{ id: string; nameVi: string; template?: boolean }> }>("/api/admin/skills");
    root.replaceChildren(view(res.data.character, res.data.online, meta.data.items ?? [], (skills.data.skills ?? []).filter((s) => !s.template), load));
  };
  void load();
  return root;
}

function num(value: number, extra: Record<string, string> = {}): HTMLInputElement {
  const i = h("input", { type: "number", step: "1", ...extra });
  i.value = String(value);
  i.style.width = "8em";
  return i;
}

function view(c: View, online: boolean, items: Array<{ id: string; nameVi: string }>, skills: Array<{ id: string; nameVi: string }>, reload: () => Promise<void>): HTMLElement {
  const me = document.querySelector(".who .muted")?.textContent ?? "";
  const mine = c.review !== null && c.review.by === me;
  const msg = h("div", { class: "msg muted" });
  const show = (t: string, cls = "muted") => {
    msg.textContent = t;
    msg.className = `msg ${cls}`;
  };
  const act = async (body: Record<string, unknown>, done?: string) => {
    const res = await api<{ error?: string }>("/api/admin/character/action", { method: "POST", body: { id: c.id, ...body } });
    if (res.status === 200) {
      await reload();
      return true;
    }
    show(ERRORS[res.data.error ?? ""] ?? `Lỗi ${res.status}.`, "err");
    void done;
    return false;
  };

  const start = h("button", { type: "button", class: "primary" }, c.review ? "Sửa tiếp (thêm 30 phút)" : "Sửa");
  start.addEventListener("click", async () => {
    const warn = online ? `${c.name} đang online. Sửa sẽ đá nhân vật ra khỏi game (lưu trước) và chặn đăng nhập 30 phút. Tiếp tục?` : `Bắt đầu sửa ${c.name}? Người chơi không đăng nhập được trong 30 phút.`;
    if (window.confirm(warn)) await act({ action: "start" });
  });
  const end = h("button", { type: "button" }, "Xong (cho đăng nhập lại)");
  end.disabled = c.review === null;
  end.addEventListener("click", () => void act({ action: "end" }));

  const realm = h("select", null, ...REALMS.map((r, i) => h("option", { value: String(i) }, r)));
  realm.value = String(c.realm);
  const stage = num(c.stage, { min: "1", max: "9" });
  const exp = num(c.exp, { min: "0" });
  const points = num(c.potentialPoints, { min: "0" });
  const stats = Object.fromEntries(Object.keys(STAT_LABEL).map((k) => [k, num(c.stats[k] ?? 0, { min: "0" })]));
  const saveStats = h("button", { type: "button", class: "primary" }, "Lưu chỉ số");
  saveStats.addEventListener("click", () =>
    void act({ action: "stats", input: { realm: Number(realm.value), stage: Number(stage.value), exp: Number(exp.value), potentialPoints: Number(points.value), stats: Object.fromEntries(Object.entries(stats).map(([k, i]) => [k, Number(i.value)])) } }),
  );

  const nameInput = h("input", { type: "text", maxlength: "24" });
  nameInput.value = c.name;
  const gender = h("select", null, h("option", { value: "male" }, "Nam"), h("option", { value: "female" }, "Nữ"));
  gender.value = c.gender;
  const satKhi = num(c.satKhi, { min: "0", max: "1000" });
  const satNhan = num(c.satNhan, { min: "0" });
  const anhHung = num(c.anhHung, { min: "0" });
  const saveProfile = h("button", { type: "button", class: "primary" }, "Lưu hồ sơ");
  saveProfile.addEventListener("click", () => void act({ action: "profile", input: { name: nameInput.value, gender: gender.value, satKhi: Number(satKhi.value), satNhan: Number(satNhan.value), anhHung: Number(anhHung.value) } }));
  const del = h("button", { type: "button" }, "Xóa nhân vật");
  del.addEventListener("click", async () => {
    const typed = window.prompt(`Xóa nhân vật «${c.name}» của ${c.email}? Nhân vật biến khỏi game và bảng xếp hạng, tài khoản tạo được nhân vật mới; sổ cái tiền vẫn giữ. Không hoàn tác. Gõ lại đúng đạo hiệu để xác nhận:`);
    if (typed === null) return;
    if (await act({ action: "delete", confirm: typed })) navigate(`/admin/accounts/detail?id=${encodeURIComponent(c.accountId)}`);
  });
  const currency = h("select", null, ...Object.entries(CURRENCY_LABEL).map(([k, l]) => h("option", { value: k }, l)));
  const delta = num(0);
  const money = h("button", { type: "button" }, "Cộng / trừ");
  money.addEventListener("click", () => void act({ action: "money", currency: currency.value, delta: Number(delta.value) }));

  const dl = h("datalist", { id: "char-items" }, ...items.map((i) => h("option", { value: i.id }, i.nameVi)));
  const itemId = h("input", { type: "text", list: "char-items", placeholder: "mã vật phẩm" });
  const qty = num(1, { min: "1", max: "9999" });
  const addItem = h("button", { type: "button" }, "Thêm vật phẩm");
  addItem.addEventListener("click", () => void act({ action: "addItem", item: itemId.value.trim(), qty: Number(qty.value) }));
  const nameOf = (t: string) => items.find((i) => i.id === t)?.nameVi ?? t;

  const sl = h("datalist", { id: "char-skills" }, ...skills.map((s) => h("option", { value: s.id }, s.nameVi)));
  const skillId = h("input", { type: "text", list: "char-skills", placeholder: "mã kỹ năng" });
  const addSkill = h("button", { type: "button" }, "Thêm kỹ năng");
  addSkill.addEventListener("click", () => void act({ action: "addSkill", skill: skillId.value.trim() }));

  const editable = [nameInput, gender, satKhi, satNhan, anhHung, saveProfile, del, stage, exp, points, realm, saveStats, currency, delta, money, itemId, qty, addItem, skillId, addSkill, ...Object.values(stats)];
  for (const el of editable) el.disabled = !mine;

  return h(
    "div",
    null,
    h("a", { href: "/admin/accounts" }, "‹ Tài khoản"),
    h("h2", null, `${c.name} (${c.email})`),
    h("p", { class: online ? "err" : "muted" }, online ? "Đang online." : "Không online."),
    c.review ? h("p", { class: "err" }, `Đang được ${c.review.by} xem xét đến ${formatTime(c.review.until)}; người chơi không đăng nhập được.${mine ? "" : " Bạn không phải người đang sửa nên chỉ xem."}`) : h("p", { class: "muted" }, "Muốn sửa: bấm “Sửa” (chặn đăng nhập tối đa 30 phút, tự hết hạn)."),
    h("div", { class: "toolbar" }, start, end),
    msg,
    h("h3", null, "Chỉ số"),
    h("p", { class: "muted" }, `Giới tính ${c.gender === "female" ? "Nữ" : "Nam"} · bản đồ ${c.map} · sát khí ${c.satKhi} · sát nhân ${c.satNhan} · anh hùng ${c.anhHung}. Sửa chỉ số xóa HP/MP đang lưu (đầy lại khi vào game).`),
    h("div", { class: "toolbar" }, h("span", null, "Cảnh giới"), realm, h("span", null, "tầng"), stage, h("span", null, "EXP"), exp, h("span", null, "Điểm tiềm năng"), points),
    h("div", { class: "toolbar" }, ...Object.entries(stats).flatMap(([k, i]) => [h("span", null, STAT_LABEL[k]), i])),
    h("div", { class: "toolbar" }, saveStats),
    h("h3", null, "Hồ sơ"),
    h("div", { class: "toolbar" }, h("span", null, "Đạo hiệu"), nameInput, h("span", null, "Giới tính"), gender, h("span", null, "Sát khí"), satKhi, h("span", null, "Sát nhân"), satNhan, h("span", null, "Anh hùng"), anhHung),
    h("div", { class: "toolbar" }, saveProfile, del),
    h("h3", null, "Tiền"),
    h("p", { class: "muted" }, Object.entries(CURRENCY_LABEL).map(([k, l]) => `${l}: ${(c.wallet[k] ?? 0).toLocaleString("vi-VN")}`).join(" · ") + ". Cộng/trừ ghi vào nhóm Admin của Quản lý tiền tệ."),
    h("div", { class: "toolbar" }, currency, delta, money, h("a", { href: `/admin/currency/detail?currency=linh_thach&character=${encodeURIComponent(c.id)}` }, "Lịch sử tiền")),
    h("h3", null, "Túi đồ"),
    dl,
    h("div", { class: "toolbar" }, itemId, qty, addItem),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, "Vật phẩm"), h("th", null, "Số lượng"), h("th", null, "Ô"), h("th"))),
        h(
          "tbody",
          null,
          ...c.items.map((i) => {
            const rm = h("button", { type: "button" }, "Lấy ra");
            rm.disabled = !mine;
            rm.addEventListener("click", () => window.confirm(`Lấy ${i.qty} ${nameOf(i.type)} khỏi túi?`) && void act({ action: "removeItem", instance: i.id }));
            return h("tr", null, h("td", null, `${nameOf(i.type)} (${i.type})`), h("td", null, String(i.qty)), h("td", null, `${i.tab + 1}/${i.cell + 1}`), h("td", null, rm));
          }),
        ),
      ),
    ),
    c.equipped.length ? h("p", { class: "muted" }, `Đang mặc: ${c.equipped.map((e) => `${e.slot}: ${e.type}`).join(", ")}. Trang bị chưa thêm/lấy được ở đây.`) : null,
    h("h3", null, "Kỹ năng"),
    sl,
    h("div", { class: "toolbar" }, skillId, addSkill),
    h(
      "ul",
      null,
      ...c.skills.map((s) => {
        const rm = h("button", { type: "button" }, "Lấy ra");
        rm.disabled = !mine;
        rm.addEventListener("click", () => window.confirm(`Lấy kỹ năng ${s.id}?`) && void act({ action: "removeSkill", skill: s.id }));
        return h("li", null, `${s.id} · nguồn ${s.source} · cấp ${s.level} `, rm);
      }),
    ),
    c.skills.length === 0 ? h("p", { class: "muted" }, "Chưa có kỹ năng học thêm (kỹ năng linh căn theo cảnh giới không lưu ở đây).") : null,
  );
}

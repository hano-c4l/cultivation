import { EQUIP_KINDS, GENDERED_KINDS, GEAR_ELEMENTS, WEAPON_TYPES, equipmentInfo, makeEquipmentId, type EquipKind } from "../../../shared/src/equipment-data";
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
  constitution: string;
  constitutionTier: number;
  roots: string[];
  rootGrade: number;
  review: { by: string; until: number } | null;
  wallet: Record<string, number>;
  items: Array<{ id: string; type: string; qty: number; tab: number; cell: number; dur?: number; max?: number; lv?: number; en?: number }>;
  equipped: Array<{ id: string; type: string; slot: string; dur?: number; max?: number; lv?: number; en?: number }>;
  skills: Array<{ id: string; source: string; realm: number; level: number; maxLevel: number }>;
}

const REALMS = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Luyện Hư"];
const SKILL_LEVELS = ["Nhập môn", "Tiểu thành", "Đại thành", "Viên mãn", "Thần thông"];
const ENHANCE_MAX = 10;
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
  mutant_alone: "Linh căn biến dị (Lôi, Băng, Phong) chỉ đứng một mình, không đi cùng hệ khác.",
  gender: "Trang bị này dành cho giới tính khác của nhân vật.",
  equipped: "Nhân vật đang mặc trang bị nên chưa đổi giới tính được (tháo hết đồ trước).",
  unknown_item: "Vật phẩm không có hoặc không thêm được (trang bị chưa thêm được).",
};

/** What the add forms had when the page was last built: the page is built again after every change, and the choices must not start over (several pieces of one kind are added in a row). */
const pick = { kind: "weapon", realm: "0", tier: "1", grade: "1", element: "", weapon: "kiem", gearQty: "1", item: "", itemQty: "1" };

export function characterPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const load = async () => {
    const res = await api<{ character: View; online: boolean; constitutions: Array<{ id: string; nameVi: string; tiers: number }>; siblings: Array<{ id: string; name: string }> }>(`/api/admin/character?id=${encodeURIComponent(id)}`);
    if (res.status !== 200) return void root.replaceChildren(h("p", { class: "err" }, "Không tìm thấy nhân vật."), h("a", { href: "/admin/accounts" }, "‹ Tài khoản"));
    const meta = await api<{ items: Array<{ id: string; nameVi: string }> }>("/api/admin/gifts/meta");
    const skills = await api<{ skills: Array<{ id: string; nameVi: string; template?: boolean }> }>("/api/admin/skills");
    root.replaceChildren(view(res.data.character, res.data.online, meta.data.items ?? [], (skills.data.skills ?? []).filter((s) => !s.template), res.data.constitutions ?? [], res.data.siblings ?? [], load));
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

function view(c: View, online: boolean, items: Array<{ id: string; nameVi: string }>, skills: Array<{ id: string; nameVi: string }>, constitutions: Array<{ id: string; nameVi: string; tiers: number }>, siblings: Array<{ id: string; name: string }>, reload: () => Promise<void>): HTMLElement {
  const me = document.querySelector(".who .muted")?.textContent ?? "";
  const mine = c.review !== null && c.review.by === me;
  const msg = h("div", { class: "msg muted" });
  const show = (t: string, cls = "muted") => {
    msg.textContent = t;
    msg.className = `msg ${cls}`;
  };
  const act = async (body: Record<string, unknown>, done?: string) => {
    const res = await api<{ error?: string; count?: number }>("/api/admin/character/action", { method: "POST", body: { id: c.id, ...body } });
    if (res.status === 200) {
      await reload();
      if (typeof res.data.count === "number") show(`Đã xử lý ${res.data.count} mục.`, "muted");
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
  const consti = h("select", null, ...constitutions.map((k) => h("option", { value: k.id }, k.nameVi)));
  consti.value = c.constitution;
  const tier = num(c.constitutionTier, { min: "1", max: "99" });
  const saveConsti = h("button", { type: "button" }, "Lưu thể chất");
  saveConsti.addEventListener("click", () => void act({ action: "constitution", constitution: consti.value, tier: Number(tier.value) }));
  const ROOT_LABEL: Record<string, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ", loi: "Lôi (biến dị)", bang: "Băng (biến dị)", phong: "Phong (biến dị)" };
  const GRADE_LABEL = ["Hạ phẩm", "Trung phẩm", "Thượng phẩm", "Địa phẩm", "Thiên phẩm"];
  const rootBoxes = Object.keys(ROOT_LABEL).map((k) => {
    const box = h("input", { type: "checkbox" });
    box.checked = c.roots.includes(k);
    return { k, box };
  });
  const mainRoot = h("select", null, ...Object.keys(ROOT_LABEL).map((k) => h("option", { value: k }, ROOT_LABEL[k]!)));
  mainRoot.value = c.roots[0] ?? "kim";
  const gradeSel = h("select", null, ...GRADE_LABEL.map((g, i) => h("option", { value: String(i) }, g)));
  gradeSel.value = String(c.rootGrade);
  const saveRoots = h("button", { type: "button" }, "Lưu linh căn");
  saveRoots.addEventListener("click", () => {
    const picked = rootBoxes.filter((x) => x.box.checked).map((x) => x.k);
    // the main element goes first
    const roots = picked.includes(mainRoot.value) ? [mainRoot.value, ...picked.filter((k) => k !== mainRoot.value)] : picked;
    void act({ action: "roots", roots, grade: Number(gradeSel.value) });
  });
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
  itemId.value = pick.item;
  itemId.addEventListener("input", () => (pick.item = itemId.value));
  const qty = num(Number(pick.itemQty) || 1, { min: "1", max: "9999" });
  qty.addEventListener("input", () => (pick.itemQty = qty.value));
  const addItem = h("button", { type: "button" }, "Thêm vật phẩm");
  addItem.addEventListener("click", () => void act({ action: "addItem", item: itemId.value.trim(), qty: Number(qty.value) }));
  const nameOf = (t: string) => items.find((i) => i.id === t)?.nameVi ?? t;

  const sel = (values: readonly string[], labels?: (v: string) => string) => h("select", null, ...values.map((v) => h("option", { value: v }, labels ? labels(v) : v)));
  const gKind = sel(EQUIP_KINDS);
  const gRealm = sel(REALMS.map((_, i) => String(i)), (v) => REALMS[Number(v)] ?? v);
  const gTier = sel(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const gGrade = sel(["1", "2", "3", "4"], (v) => `phẩm ${v}`);
  const gElement = sel(["", ...GEAR_ELEMENTS], (v) => v || "không hệ");
  const gWeapon = sel(WEAPON_TYPES);
  const gQty = num(Number(pick.gearQty) || 1, { min: "1", max: "45" });
  gQty.style.width = "4em";
  const gCode = h("input", { type: "text", placeholder: "mã trang bị, ví dụ eq.charm.u.3.9.4.moc", size: "34" });
  const gWeaponBox = h("span", null, gWeapon);
  const gNote = h("span", { class: "muted" });
  gKind.value = pick.kind;
  gRealm.value = pick.realm;
  gTier.value = pick.tier;
  gGrade.value = pick.grade;
  gElement.value = pick.element;
  gWeapon.value = pick.weapon;
  /** The code of what the selects say (the style follows the kind and the character's gender; a weapon type goes with an element, so a weapon always has one). */
  const codeOfPick = (): string => {
    const kind = gKind.value as EquipKind;
    const style = GENDERED_KINDS.has(kind) ? (c.gender === "female" ? "f" : "m") : "u";
    const element = gElement.value || (kind === "weapon" ? "kim" : "");
    return makeEquipmentId(kind, style, Number(gRealm.value), Number(gTier.value), Number(gGrade.value), element || undefined, kind === "weapon" ? gWeapon.value : undefined);
  };
  /** Keeps the memory, the weapon-type box (only a weapon has a type) and the code box in step with the selects. */
  const refreshPick = (fromCode = false) => {
    Object.assign(pick, { kind: gKind.value, realm: gRealm.value, tier: gTier.value, grade: gGrade.value, element: gElement.value, weapon: gWeapon.value, gearQty: gQty.value });
    gWeaponBox.style.display = gKind.value === "weapon" ? "" : "none";
    if (!fromCode) gCode.value = codeOfPick();
  };
  for (const el of [gKind, gRealm, gTier, gGrade, gElement, gWeapon]) el.addEventListener("change", () => refreshPick());
  gQty.addEventListener("input", () => refreshPick(true));
  /** A typed or pasted code picks the matching values (the code box keeps what was typed until it is valid). */
  gCode.addEventListener("input", () => {
    const info = equipmentInfo(gCode.value.trim());
    if (!info) {
      gNote.textContent = gCode.value.trim() ? "Mã chưa đúng." : "";
      return;
    }
    gKind.value = info.kind;
    gRealm.value = String(info.realm);
    gTier.value = String(info.tier);
    gGrade.value = String(info.grade);
    gElement.value = info.element ?? "";
    if (info.weaponType) gWeapon.value = info.weaponType;
    refreshPick(true);
    const mine = codeOfPick();
    gNote.textContent = mine === gCode.value.trim() ? "Đã chọn theo mã." : `Đã chọn theo mã; mã sẽ thêm: ${mine} (kiểu dáng theo giới tính nhân vật).`;
  });
  refreshPick();
  const addGear = h("button", { type: "button" }, "Thêm trang bị");
  addGear.addEventListener("click", () => void act({ action: "addEquipment", type: codeOfPick(), qty: Number(gQty.value) }));
  const sl = h("datalist", { id: "char-skills" }, ...skills.map((s) => h("option", { value: s.id }, s.nameVi)));
  const skillId = h("input", { type: "text", list: "char-skills", placeholder: "mã kỹ năng" });
  const addSkill = h("button", { type: "button" }, "Thêm kỹ năng");
  addSkill.addEventListener("click", () => void act({ action: "addSkill", skill: skillId.value.trim() }));

  /** The properties of a piece of gear in the bag or worn: upgrade level (+0..+10), trained level of a bonded pháp bảo, durability; one Lưu button for the three. */
  type Piece = { id: string; type: string; dur?: number; max?: number; lv?: number; en?: number };
  const gearButtons: HTMLButtonElement[] = [];
  const gearEditor = (p: Piece): HTMLElement | null => {
    if (!p.type.startsWith("eq.")) return null;
    const en = num(p.en ?? 0, { min: "0", max: String(ENHANCE_MAX) });
    en.style.width = "4em";
    const bonded = p.type.includes(".bonded.");
    const lv = bonded ? num(p.lv ?? 0, { min: "0", max: String(REALMS.length * 9 - 1) }) : null;
    if (lv) lv.style.width = "4em";
    const dur = p.max !== undefined ? num(p.dur ?? p.max, { min: "0", max: String(p.max) }) : null;
    if (dur) dur.style.width = "5em";
    const save = h("button", { type: "button" }, "Lưu");
    save.addEventListener("click", () => {
      const input: Record<string, number> = { en: Number(en.value) };
      if (lv) input.lv = Number(lv.value);
      if (dur) input.dur = Number(dur.value);
      void act({ action: "editItem", instance: p.id, input });
    });
    for (const el of [en, lv, dur, save]) if (el) el.disabled = !mine;
    gearButtons.push(save);
    return h("span", { class: "toolbar" }, h("span", null, "cường hóa +"), en, lv ? h("span", null, "tinh luyện") : null, lv, dur ? h("span", null, `độ bền /${p.max}`) : null, dur, save);
  };
  /** One button for a whole section (docs/PHASE2.md 2o): what it does, asked once, then done in a single guarded batch on the server. */
  const bulk = (label: string, kind: string, ask: string): HTMLButtonElement => {
    const b = h("button", { type: "button" }, label);
    b.disabled = !mine;
    b.addEventListener("click", () => window.confirm(ask) && void act({ action: "bulk", kind }));
    return b;
  };
  const bulkSkills = h("div", { class: "toolbar" }, h("span", null, "Hàng loạt"), bulk("Học toàn bộ kỹ năng", "skills_learn", `Thêm mọi kỹ năng linh căn và bí tịch của các cảnh giới tới ${REALMS[c.realm] ?? ""} mà nhân vật chưa có?`), bulk("Tăng tối đa toàn bộ kỹ năng", "skills_max", "Đưa mọi kỹ năng đang có lên cấp thuần thục cao nhất (điểm tích lũy bắt đầu lại từ 0)?"));
  const bulkGear = (where: "worn" | "bag", name: string) =>
    h(
      "div",
      { class: "toolbar" },
      h("span", null, "Hàng loạt"),
      bulk(`Cường hóa +${ENHANCE_MAX} toàn bộ`, `${where}_enhance`, `Cường hóa +${ENHANCE_MAX} mọi trang bị ${name}?`),
      bulk("Tinh luyện toàn bộ", `${where}_refine`, `Tinh luyện mọi trang bị ${name}: mọi chỉ số tung lên mức tối đa của bảng master, pháp bảo bản mệnh lên cấp của chủ?`),
      bulk("Sửa đầy độ bền toàn bộ", `${where}_repair`, `Sửa đầy độ bền mọi trang bị ${name}?`),
    );
  const levelEditor = (sk: View["skills"][number]): HTMLElement => {
    const pick = h("select", null, ...SKILL_LEVELS.slice(0, sk.maxLevel + 1).map((l, i) => h("option", { value: String(i) }, l)));
    pick.value = String(Math.min(sk.level, sk.maxLevel));
    const save = h("button", { type: "button" }, "Lưu cấp");
    save.addEventListener("click", () => void act({ action: "skillLevel", skill: sk.id, level: Number(pick.value) }));
    pick.disabled = !mine;
    save.disabled = !mine;
    return h("span", null, " cấp ", pick, " ", save);
  };

  const editable = [...rootBoxes.map((x) => x.box), mainRoot, gradeSel, saveRoots, gKind, gRealm, gTier, gGrade, gElement, gWeapon, gQty, gCode, addGear, consti, tier, saveConsti, nameInput, gender, satKhi, satNhan, anhHung, saveProfile, del, stage, exp, points, realm, saveStats, currency, delta, money, itemId, qty, addItem, skillId, addSkill, ...Object.values(stats)];
  for (const el of editable) el.disabled = !mine;

  return h(
    "div",
    null,
    h("a", { href: `/admin/accounts/detail?id=${encodeURIComponent(c.accountId)}` }, "‹ Tài khoản"),
    h("h2", null, `${c.name} (${c.email})`),
    siblings.length > 1 ? h("p", { class: "muted" }, "Nhân vật của tài khoản này: ", ...siblings.flatMap((x) => [x.id === c.id ? h("b", null, x.name) : h("a", { href: `/admin/characters/detail?id=${encodeURIComponent(x.id)}` }, x.name), " · "])) : null,
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
    h("div", { class: "toolbar" }, h("span", null, "Linh căn"), ...rootBoxes.flatMap((x) => [h("label", { class: "radio" }, x.box, ROOT_LABEL[x.k]!)]), h("span", null, "hệ chính"), mainRoot, h("span", null, "phẩm cấp"), gradeSel, saveRoots),
    h("p", { class: "muted" }, "Chọn 1-5 hệ thường, hoặc đúng một hệ biến dị. Điểm tiềm năng và kỹ năng linh căn đã nhận không đổi; HP/MP đang lưu bị xóa."),
    h("div", { class: "toolbar" }, h("span", null, "Thể chất"), consti, h("span", null, "cấp"), tier, saveConsti, h("span", { class: "muted" }, "Cấp từ 1 tới số cấp của thể chất; xóa HP/MP đang lưu.")),
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
        h("thead", null, h("tr", null, h("th", null, "Vật phẩm"), h("th", null, "Số lượng"), h("th", null, "Ô"), h("th", null, "Thuộc tính"), h("th"))),
        h(
          "tbody",
          null,
          ...c.items.map((i) => {
            const rm = h("button", { type: "button" }, "Lấy ra");
            rm.disabled = !mine;
            rm.addEventListener("click", () => window.confirm(`Lấy ${i.qty} ${nameOf(i.type)} khỏi túi?`) && void act({ action: "removeItem", instance: i.id }));
            return h("tr", null, h("td", null, `${nameOf(i.type)} (${i.type})`), h("td", null, String(i.qty)), h("td", null, `${i.tab + 1}/${i.cell + 1}`), h("td", null, gearEditor(i)), h("td", null, rm));
          }),
        ),
      ),
    ),
    h("div", { class: "toolbar" }, h("span", null, "Mã"), gCode, gNote),
    h("div", { class: "toolbar" }, h("span", null, "Trang bị"), gKind, gRealm, h("span", null, "bậc"), gTier, gGrade, gElement, gWeaponBox, h("span", null, "số lượng"), gQty, addGear),
    h("p", { class: "muted" }, "Trang bị vào túi với độ bền đầy và chỉ số tung từ bảng master, như mua ở thương nhân; thêm nhiều món một lần thì mỗi món tung chỉ số riêng. Các lựa chọn được giữ sau mỗi lần thêm. Nhập mã trang bị để chọn nhanh. Loại vũ khí chỉ hiện với vũ khí (vũ khí luôn có hệ); món đang mặc phải được tháo ra trước khi lấy."),
    bulkGear("bag", "trong túi"),
    c.equipped.length ? h("p", { class: "muted" }, "Đang mặc (sửa được thuộc tính ngay tại đây, trang bị vẫn ở trên người):") : null,
    c.equipped.length ? bulkGear("worn", "đang mặc") : null,
    c.equipped.length ? h("ul", null, ...c.equipped.map((e) => h("li", null, `${e.slot}: ${nameOf(e.type)} (${e.type}) `, gearEditor(e)))) : null,
    h("h3", null, "Kỹ năng"),
    bulkSkills,
    sl,
    h("div", { class: "toolbar" }, skillId, addSkill),
    h(
      "ul",
      null,
      ...c.skills.map((s) => {
        const rm = h("button", { type: "button" }, "Lấy ra");
        rm.disabled = !mine;
        rm.addEventListener("click", () => window.confirm(`Lấy kỹ năng ${s.id}?`) && void act({ action: "removeSkill", skill: s.id }));
        return h("li", null, `${s.id} · nguồn ${s.source} · cấp hiện tại ${SKILL_LEVELS[s.level] ?? s.level}`, levelEditor(s), " ", rm);
      }),
    ),
    h("p", { class: "muted" }, c.skills.length === 0 ? "Chưa có kỹ năng nào. " : "Đổi cấp thuần thục: điểm tích lũy trong cấp đó bắt đầu lại từ 0; cấp Thần thông chỉ mở cho kỹ năng phẩm cao."),
  );
}

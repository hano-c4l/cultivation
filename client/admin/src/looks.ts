import { DEFAULT_TUNING, FLIGHT_STYLES, GEAR_ELEMENTS, GROUND_STYLES, OBSTACLE_STYLES, WEAPON_TYPES, makeEquipmentId, type EquipKind, type FlightStyle, type GroundStyle, type IconShape, type NpcLook, type ObstacleStyle } from "@game/shared";
import { iconSpecOf } from "../../src/icons";
import { h } from "./kit";
import { Looks, iconGrid, iconNode, picker, saveBar, skillLookOptions, spriteChoices, spritePreview, type Opt } from "./looks-kit";

/**
 * The picture screens of the Admin (PHASE4 4i): the "Hình ảnh" page for what has no edit form of its own (outfits, element colours of monsters, the flight pháp bảo,
 * the icon of a whole kind of item), and the sections that sit under the edit forms of an item, a skill, a species, an NPC and a map. Everything is a choice among
 * pictures that exist; a choice is stored in a `game_tuning` row (see looks-kit.ts) and the game reads it after the next tuning reload.
 */

const section = (title: string, note: string | null, ...children: Array<Node | null>): HTMLElement => h("section", { class: "form look-section" }, h("h3", null, title), note ? h("p", { class: "muted" }, note) : null, ...children);
const row = (label: string, ...children: Node[]): HTMLElement => h("label", { class: "filter wide-field" }, label, ...children);
const failed = (): HTMLElement => h("p", { class: "err" }, "Không tải được dữ liệu hình ảnh.");

/** The kinds of gear that are made for one gender: the id of one carries it. */
const GENDERED: ReadonlySet<string> = new Set(["hat", "robe", "bracer", "jade", "necklace"]);
const ELEMENT_VI: Record<string, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ", loi: "Lôi", bang: "Băng", phong: "Phong" };
const FLIGHT_VI: Record<FlightStyle, string> = { plain: "Đĩa sáng", sword: "Kiếm bay", cloud: "Mây", lotus: "Sen", phoenix: "Phượng hoàng", dragon: "Rồng" };
const WEAPON_VI: Record<string, string> = { kiem: "Kiếm", dao: "Dao", thuong: "Thương", riu: "Rìu", cung: "Cung", quyen: "Quyền" };
const GROUND_VI: Record<GroundStyle, string> = { plain: "Trơn", grass: "Cỏ", dirt: "Đất", stone: "Đá", snow: "Tuyết", lava: "Dung nham" };
const OBSTACLE_VI: Record<ObstacleStyle, string> = { plain: "Ô phẳng", tree: "Cây", bush: "Bụi", stump: "Gốc cây", rock: "Đá nhỏ", boulder: "Tảng đá", pillar: "Cột", crystal: "Tinh thể", ember: "Than hồng", bamboo: "Tre", lantern: "Đèn lồng", jade: "Ngọc" };
const KIND_VI: Record<string, string> = {
  hat: "Mũ", robe: "Áo", bracer: "Hộ uyển", ring: "Nhẫn", jade: "Ngọc bội", necklace: "Dây chuyền", belt: "Đai lưng", boots: "Giày", charm: "Pháp bảo thường", bonded: "Pháp bảo bản mệnh", flight: "Pháp bảo phi hành",
};
const CATEGORY_VI: Record<string, string> = { consumable: "Đan / tiêu hao", material: "Nguyên liệu", skill_book: "Bí tịch" };

const options = (values: readonly string[], names: Record<string, string>, preview?: (v: string) => (() => HTMLElement | null) | undefined): Opt[] =>
  values.map((v) => {
    const p = preview?.(v);
    return { value: v, label: names[v] ?? v, ...(p ? { preview: p } : {}) };
  });

/** The outfit options: the plain clothes and every outfit the manifest has, each with a preview of the figure wearing it. */
function outfitOptions(outfits: readonly string[]): Opt[] {
  return outfits.map((o) => ({ value: o, label: o, preview: () => spritePreview(`player.male.${o}`, 56) }));
}

// ---- the "Hình ảnh" page ----

export async function looksPage(): Promise<HTMLElement> {
  const [looks, choices] = await Promise.all([Looks.load(), spriteChoices()]);
  if (!looks) return failed();
  const root = h("div", { class: "detail wide" });
  if (!choices.ok) root.append(h("p", { class: "err" }, "Không đọc được danh sách hình có sẵn (/gfx/manifest.json): các ô chọn trang phục và mô hình quái sẽ trống."));
  root.append(h("p", { class: "muted" }, "Chỉ chọn trong các hình có sẵn của game, không tải ảnh mới lên. Thay đổi có hiệu lực trong game sau khoảng 30 giây (vào lại game). Hình riêng của từng vật phẩm, kỹ năng, loài quái, NPC, bản đồ nằm ở màn sửa của chính nó."));

  // Outfits by the realm of the worn robe.
  {
    const value = looks.get<{ rules: Array<{ minRealm: number; outfit: string }> }>("outfits");
    const rules = h("div", null);
    const draw = () =>
      rules.replaceChildren(
        ...value.rules.map((r, i) => {
          const minRealm = h("input", { type: "number", min: "0", max: "99", step: "1" });
          minRealm.value = String(r.minRealm);
          minRealm.addEventListener("input", () => (r.minRealm = Math.max(0, Math.trunc(Number(minRealm.value)) || 0)));
          const del = h("button", { type: "button" }, "Xóa luật");
          del.addEventListener("click", () => {
            value.rules.splice(i, 1);
            draw();
          });
          return h("div", { class: "toolbar look-rule" }, h("span", null, "Áo từ cảnh giới số"), minRealm, h("span", null, "trở lên mặc"), picker(outfitOptions(choices.outfits), r.outfit, null, (v) => (r.outfit = v)), del);
        }),
      );
    draw();
    const add = h("button", { type: "button" }, "+ Thêm luật");
    add.addEventListener("click", () => {
      value.rules.push({ minRealm: 0, outfit: choices.outfits[0] ?? "ranger" });
      draw();
    });
    root.append(
      section("Trang phục theo cảnh giới của áo", "Cảnh giới 0 = Luyện Khí, 1 = Trúc Cơ, 2 = Kim Đan... Luật có số cảnh giới cao nhất mà áo đạt được thì thắng; không mặc áo thì mặc đồ nông dân.", rules, h("div", { class: "toolbar" }, add), saveBar(() => looks.save("outfits", { rules: [...value.rules].sort((a, b) => a.minRealm - b.minRealm) }))),
    );
  }

  // The flight pháp bảo.
  {
    const value = looks.get<{ default: FlightStyle; byElement?: Record<string, FlightStyle>; byRealm?: Record<string, FlightStyle> }>("flightLooks");
    value.byElement ??= {};
    value.byRealm ??= {};
    const styles = options(FLIGHT_STYLES, FLIGHT_VI);
    const rows: HTMLElement[] = [row("Mặc định", picker(styles, value.default, null, (v) => (value.default = v as FlightStyle)))];
    for (const el of GEAR_ELEMENTS) rows.push(row(`Hệ ${ELEMENT_VI[el]}`, picker(styles, value.byElement![el] ?? "", "(theo mặc định)", (v) => (v ? (value.byElement![el] = v as FlightStyle) : delete value.byElement![el]))));
    for (let realm = 0; realm <= 5; realm++) rows.push(row(`Cảnh giới số ${realm} của món`, picker(styles, value.byRealm![String(realm)] ?? "", "(theo hệ)", (v) => (v ? (value.byRealm![String(realm)] = v as FlightStyle) : delete value.byRealm![String(realm)]))));
    root.append(section("Pháp bảo phi hành", "Hình dưới chân người cưỡi: theo cảnh giới của món trước, rồi theo hệ, rồi mặc định.", ...rows, saveBar(() => looks.save("flightLooks", value))));
  }

  // The colour of the monsters by element.
  {
    const value = looks.get<Record<string, string>>("monsterTints");
    const rows = GEAR_ELEMENTS.map((el) => {
      const input = h("input", { type: "color" });
      input.value = /^#[0-9a-fA-F]{6}$/.test(value[el] ?? "") ? value[el]! : "#ffffff";
      input.addEventListener("input", () => (value[el] = input.value));
      const clear = h("button", { type: "button" }, "Bỏ màu (giữ màu gốc của mô hình)");
      clear.addEventListener("click", () => {
        delete value[el];
        input.value = "#ffffff";
      });
      return row(`Hệ ${ELEMENT_VI[el]}`, input, clear);
    });
    root.append(section("Màu quái theo hệ", "Mỗi hệ nhân màu này lên hình quái, nên một mô hình trông khác nhau ở mỗi hệ.", ...rows, saveBar(() => looks.save("monsterTints", value))));
  }

  // The icon of a whole kind of item.
  {
    const value = looks.get<{ items: Record<string, IconShape>; skills: Record<string, IconShape>; kinds: Record<string, IconShape> }>("iconLooks");
    const kinds: Array<[string, string, IconShape]> = [
      ...WEAPON_TYPES.map((w): [string, string, IconShape] => [`weapon.${w}`, `Vũ khí: ${WEAPON_VI[w]}`, iconSpecOf(makeEquipmentId("weapon", "u", 0, 1, 1, "kim", w)).shape]),
      ...Object.entries(KIND_VI).map(([k, name]): [string, string, IconShape] => [k, name, iconSpecOf(makeEquipmentId(k as EquipKind, GENDERED.has(k) ? "m" : "u", 0, 1, 1)).shape]),
      ...Object.entries(CATEGORY_VI).map(([c, name]): [string, string, IconShape] => [`category.${c}`, `Vật phẩm: ${name}`, c === "consumable" ? "pill" : c === "skill_book" ? "book" : "ore"]),
    ];
    const blocks = kinds.map(([key, name, base]) => h("details", { class: "look-kind" }, h("summary", null, iconNode(value.kinds[key] ?? base, null, 22), ` ${name}`), iconGrid(value.kinds[key], base, (s) => (s ? (value.kinds[key] = s) : delete value.kinds[key]))));
    root.append(section("Biểu tượng theo loại", "Áp cho mọi vật phẩm cùng loại chưa được chọn biểu tượng riêng (chọn riêng ở màn sửa vật phẩm). Trang bị sinh ra không có mã cố định nên chọn theo loại ở đây.", ...blocks, saveBar(() => looks.save("iconLooks", value))));
  }
  return root;
}

// ---- sections under the edit forms ----

/** Under the edit form of an item: the icon of this very item. */
export async function itemIconSection(itemId: string): Promise<HTMLElement> {
  const looks = await Looks.load();
  if (!looks) return failed();
  const value = looks.get<{ items: Record<string, IconShape>; skills: Record<string, IconShape>; kinds: Record<string, IconShape> }>("iconLooks");
  const base = iconSpecOf(itemId).shape;
  return section("Biểu tượng", "Chọn từ các hình có sẵn; \"theo game\" là hình game tự suy ra từ loại vật phẩm.", iconGrid(value.items[itemId], base, (s) => (s ? (value.items[itemId] = s) : delete value.items[itemId])), saveBar(() => looks.save("iconLooks", value)));
}

/** Under the edit form of a skill: its icon (not for a template, whose skills have their own ids) and the look of its effect. */
export async function skillLookSection(skillId: string, template: boolean, baseIcon: IconShape): Promise<HTMLElement> {
  const looks = await Looks.load();
  if (!looks) return failed();
  const icons = looks.get<{ items: Record<string, IconShape>; skills: Record<string, IconShape>; kinds: Record<string, IconShape> }>("iconLooks");
  const effects = looks.get<Record<string, string>>("skillLooks");
  const code = DEFAULT_TUNING.skillLooks[skillId];
  const effect = row("Hình ảnh ra đòn", picker(skillLookOptions, effects[skillId] ?? "", `(theo game${code ? `: ${code}` : ""})`, (v) => (v ? (effects[skillId] = v) : delete effects[skillId])));
  return section(
    "Hình ảnh",
    template ? "Mẫu kỹ năng: hình ra đòn áp cho mọi kỹ năng của mẫu (kỹ năng có dòng riêng thì thắng). Biểu tượng chọn ở từng kỹ năng." : null,
    effect,
    saveBar(() => looks.save("skillLooks", effects), "Lưu hình ra đòn"),
    ...(template ? [] : [h("h4", null, "Biểu tượng"), iconGrid(icons.skills[skillId], baseIcon, (s) => (s ? (icons.skills[skillId] = s) : delete icons.skills[skillId])), saveBar(() => looks.save("iconLooks", icons), "Lưu biểu tượng")]),
  );
}

/** Under the edit form of a monster species: the sprite model that draws it. */
export async function speciesLookSection(speciesId: string): Promise<HTMLElement> {
  const [looks, choices] = await Promise.all([Looks.load(), spriteChoices()]);
  if (!looks) return failed();
  const models = looks.get<Record<string, string>>("monsterModels");
  const opts: Opt[] = choices.models.map((m) => ({ value: m, label: m, preview: () => spritePreview(`monster.${m}`, 72) }));
  const code = DEFAULT_TUNING.monsterModels[speciesId];
  return section(
    "Hình ảnh",
    choices.ok ? "Chọn mô hình có sẵn; một mô hình dùng chung cho nhiều loài được. Nếu game có sẵn hình mang đúng mã loài thì hình đó được dùng trước." : "Không đọc được danh sách mô hình (/gfx/manifest.json).",
    row("Mô hình", picker(opts, models[speciesId] ?? "", `(theo game${code ? `: ${code}` : ""})`, (v) => (v ? (models[speciesId] = v) : delete models[speciesId]), code ? () => spritePreview(`monster.${code}`, 72) : undefined)),
    saveBar(() => looks.save("monsterModels", models)),
  );
}

/** Under the edit form of an NPC: the body, the outfit and the weapon of its figure (by the id of the NPC; `smith` covers `smith2` and `smith3`). */
export async function npcLookSection(npcId: string, kind: string): Promise<HTMLElement> {
  const [looks, choices] = await Promise.all([Looks.load(), spriteChoices()]);
  if (!looks) return failed();
  const value = looks.get<{ byKind: Record<string, NpcLook>; byId: Record<string, NpcLook> }>("npcLooks");
  const baseId = npcId.replace(/\d+$/, "");
  const own = value.byId[baseId];
  const look: NpcLook = { ...(own ?? value.byKind[kind] ?? { body: "male" }) };
  const body = row("Thân", picker([{ value: "male", label: "Nam", preview: () => spritePreview("player.male", 56) }, { value: "female", label: "Nữ", preview: () => spritePreview("player.female", 56) }], look.body, null, (v) => (look.body = v === "female" ? "female" : "male")));
  const outfit = row("Trang phục", picker(outfitOptions(choices.outfits), look.outfit ?? "", "(đồ nông dân)", (v) => (v ? (look.outfit = v) : delete look.outfit)));
  const weapon = row("Vũ khí", picker(options(WEAPON_TYPES.filter((w) => w !== "quyen"), WEAPON_VI), look.weapon ?? "", "(tay không)", (v) => (v ? (look.weapon = v) : delete look.weapon)));
  const reset = h("button", { type: "button" }, "Bỏ lựa chọn riêng (theo loại NPC)");
  reset.disabled = own === undefined;
  reset.addEventListener("click", async () => {
    delete value.byId[baseId];
    const problem = await looks.save("npcLooks", value);
    if (!problem) location.reload();
    else window.alert(problem);
  });
  return section(
    "Hình ảnh",
    `Hình riêng của NPC mã «${baseId}» (áp cho cả ${baseId}2, ${baseId}3...). ${own ? "Đang có lựa chọn riêng." : `Chưa có lựa chọn riêng: đang dùng hình của loại «${kind}»; lưu sẽ tạo lựa chọn riêng. Màu áo và màu vòng trận giữ như đang có.`}`,
    body,
    outfit,
    weapon,
    saveBar(() => looks.save("npcLooks", { ...value, byId: { ...value.byId, [baseId]: look } })),
    h("div", { class: "toolbar" }, reset),
  );
}

/** Under the edit form of a map: the ground and the small obstacles. */
export async function mapArtSection(mapId: string): Promise<HTMLElement> {
  const looks = await Looks.load();
  if (!looks) return failed();
  const value = looks.get<{ maps: Record<string, { ground: GroundStyle; obstacle: ObstacleStyle; mix?: ObstacleStyle[] }> }>("mapArt");
  const art = value.maps[mapId] ?? { ground: "plain" as GroundStyle, obstacle: "plain" as ObstacleStyle };
  // `mix` is a list the obstacles are drawn from at random, so a kind listed three times is three times as common: the editor shows how many times each kind is listed.
  const counts = new Map<ObstacleStyle, number>();
  for (const o of art.mix ?? []) counts.set(o, (counts.get(o) ?? 0) + 1);
  const mixBox = h("div", { class: "check-grid" });
  for (const o of OBSTACLE_STYLES.filter((s) => s !== "plain")) {
    const n = h("input", { type: "number", min: "0", max: "9", step: "1", class: "tiny" });
    n.value = String(counts.get(o) ?? 0);
    n.addEventListener("input", () => counts.set(o, Math.max(0, Math.min(9, Math.trunc(Number(n.value)) || 0))));
    mixBox.append(h("label", null, `${OBSTACLE_VI[o]} `, n));
  }
  return section(
    "Hình ảnh",
    value.maps[mapId] ? null : "Bản đồ này chưa có lựa chọn: đang vẽ trơn; lưu sẽ tạo lựa chọn.",
    row("Nền", picker(options(GROUND_STYLES, GROUND_VI), art.ground, null, (v) => (art.ground = v as GroundStyle))),
    row("Vật cản nhỏ chính", picker(options(OBSTACLE_STYLES, OBSTACLE_VI), art.obstacle, null, (v) => (art.obstacle = v as ObstacleStyle))),
    h("div", null, h("b", null, "Số lần mỗi kiểu có trong danh sách trộn (càng nhiều càng hay gặp; tất cả bằng 0 thì chỉ dùng kiểu chính)"), mixBox),
    saveBar(() => {
      const list = OBSTACLE_STYLES.flatMap((o) => Array<ObstacleStyle>(counts.get(o) ?? 0).fill(o));
      const next = { ground: art.ground, obstacle: art.obstacle, ...(list.length > 0 ? { mix: list } : {}) };
      return looks.save("mapArt", { maps: { ...value.maps, [mapId]: next } });
    }),
  );
}


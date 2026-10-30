import { ICON_PICKABLE, SKILL_LOOKS, frameName, type IconShape, type TuningGroup } from "@game/shared";
import { renderIcon } from "../../src/icons";
import { api, h } from "./kit";

/**
 * Picking pictures (PHASE4 4i). The Admin only chooses among what exists: the drawings of the icons, the sprite sets of the manifest, the looks of the effects.
 * Nothing is uploaded. Every picture group is one `game_tuning` row saved whole by `/api/admin/looks` (server/src/looks-admin.ts), with the version token of
 * the row, so a screen loads the groups it needs, edits copies of them and saves them back.
 */

export type LookGroupName = "outfits" | "monsterModels" | "monsterTints" | "mapArt" | "npcLooks" | "flightLooks" | "skillLooks" | "iconLooks";

interface GroupView {
  group: LookGroupName;
  value: unknown;
  default: unknown;
  updatedAt: number;
  updatedBy: string | null;
}

/** The groups as the screen loaded them: `value` is the copy to edit, `token` the version of the row it came from. */
export class Looks {
  private views = new Map<string, GroupView>();

  static async load(): Promise<Looks | null> {
    const res = await api<{ groups?: GroupView[] }>("/api/admin/looks");
    if (res.status !== 200 || !res.data.groups) return null;
    const looks = new Looks();
    looks.take(res.data.groups);
    return looks;
  }

  private take(groups: GroupView[]): void {
    for (const g of groups) this.views.set(g.group, g);
  }

  /** A fresh copy of the group to edit. */
  get<T = Record<string, unknown>>(group: LookGroupName): T {
    return JSON.parse(JSON.stringify(this.views.get(group)!.value)) as T;
  }

  /** Saves a group whole. Returns an error sentence, or null when it went through (the token follows). */
  async save(group: LookGroupName, value: unknown): Promise<string | null> {
    const view = this.views.get(group)!;
    const res = await api<{ error?: string; groups?: GroupView[] }>("/api/admin/looks", { method: "POST", body: { group, updatedAt: view.updatedAt, value } });
    if (res.status === 200 && res.data.groups) {
      this.take(res.data.groups);
      return null;
    }
    const code = res.data.error ?? "";
    if (code === "unchanged") return "Không có gì thay đổi.";
    if (code === "version_conflict") return "Người khác vừa lưu phần này: tải lại trang rồi chọn lại.";
    if (code === "invalid") return "Lựa chọn không hợp lệ.";
    return `Lỗi ${res.status}.`;
  }
}

/** Option of a picker: the value saved, the words shown, and an optional picture. */
export interface Opt {
  value: string;
  label: string;
  /** Shown beside the picker for the chosen option (a sprite preview). */
  preview?: () => HTMLElement | null;
}

/** Fills `box` with a Save button wired to `get`: it runs `save`, writes the result in the message and tells `after` when it went through. */
export function saveBar(save: () => Promise<string | null>, label = "Lưu"): HTMLElement {
  const msg = h("span", { class: "msg muted" });
  const button = h("button", { type: "button", class: "primary" }, label);
  button.addEventListener("click", async () => {
    button.disabled = true;
    msg.className = "msg muted";
    msg.textContent = "Đang lưu...";
    const problem = await save();
    button.disabled = false;
    msg.className = problem ? "msg err" : "msg ok";
    msg.textContent = problem ?? "Đã lưu. Có hiệu lực trong game sau khoảng 30 giây (vào lại game).";
  });
  return h("div", { class: "toolbar" }, button, msg);
}

/** A select over `options` with a first entry for "no choice" (`blank`: the words for it). `onChange` gets the value ("" for none). The preview of the chosen option follows. */
export function picker(options: readonly Opt[], current: string, blank: string | null, onChange: (value: string) => void, blankPreview?: () => HTMLElement | null): HTMLElement {
  const select = h("select", null, ...(blank === null ? [] : [h("option", { value: "" }, blank)]), ...options.map((o) => h("option", { value: o.value }, o.label)));
  const slot = h("span", { class: "look-preview" });
  const sync = () => {
    const opt = options.find((o) => o.value === select.value);
    const node = (opt ? opt.preview?.() : select.value === "" ? blankPreview?.() : undefined) ?? null;
    slot.replaceChildren(...(node ? [node] : []));
  };
  select.value = options.some((o) => o.value === current) ? current : blank === null ? (options[0]?.value ?? "") : "";
  select.addEventListener("change", () => {
    onChange(select.value);
    sync();
  });
  sync();
  return h("span", { class: "look-pick" }, select, slot);
}

/** One drawing of the icons at a size the Admin can judge. */
export function iconNode(shape: IconShape, element: string | null = null, size = 34): SVGSVGElement {
  const svg = renderIcon({ shape, element, grade: 0 });
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  return svg;
}

const ICON_VI: Readonly<Record<string, string>> = {
  sword: "Kiếm", saber: "Dao", spear: "Thương", axe: "Rìu", bow: "Cung", fist: "Quyền", hat: "Mũ", robe: "Áo", bracer: "Hộ uyển", ring: "Nhẫn", jade: "Ngọc bội", necklace: "Dây chuyền", belt: "Đai lưng",
  boots: "Giày", charm: "Phù", bonded: "Bản mệnh", flight: "Phi hành", pill: "Đan", ore: "Khoáng", book: "Bí tịch", scroll: "Cuộn", slash: "Chém", bolt: "Đạn", fan: "Quạt", blink: "Tốc biến", buff: "Tăng",
  heal: "Hồi", passive: "Bị động", pierce: "Xuyên", nova: "Tỏa", lane: "Vệt cháy", field: "Vùng",
};
export const iconName = (shape: string): string => ICON_VI[shape] ?? shape;

/**
 * The icon chooser: a grid of every drawing with the chosen one marked, and a first cell "theo game" that clears the choice. `defaultShape` is what the game
 * draws without a choice (shown under that cell); `onChange` gets the shape or "" for none.
 */
export function iconGrid(current: IconShape | undefined, defaultShape: IconShape, onChange: (shape: IconShape | "") => void): HTMLElement {
  const grid = h("div", { class: "icon-grid" });
  const cells: Array<[IconShape | "", HTMLButtonElement]> = [];
  const mark = (value: IconShape | "") => {
    for (const [v, b] of cells) b.classList.toggle("on", v === value);
  };
  const add = (value: IconShape | "", shape: IconShape, label: string) => {
    const b = h("button", { type: "button", class: "icon-cell", title: label }, iconNode(shape), h("small", null, label));
    b.addEventListener("click", () => {
      mark(value);
      onChange(value);
    });
    cells.push([value, b]);
    grid.append(b);
  };
  add("", defaultShape, `Theo game (${iconName(defaultShape)})`);
  for (const shape of ICON_PICKABLE) add(shape, shape, iconName(shape));
  mark(current ?? "");
  return grid;
}

export const SKILL_LOOK_VI: Readonly<Record<string, string>> = {
  spell: "Niệm phép", palm: "Chưởng", slash: "Chém", finger: "Chỉ", sword: "Kiếm khí", orb: "Quả cầu", great: "Đại chiêu", aura: "Hào quang", dome: "Vòm hộ thể", flames: "Ngọn lửa", wind: "Gió",
  seal: "Ấn", furnace: "Lò luyện", bell: "Chuông", lotus: "Sen", phoenix: "Phượng hoàng", blink: "Tốc biến", lance: "Xuyên thấu", nova: "Tỏa quanh người", lane: "Vệt cháy", field: "Vùng tồn tại", bolt: "Đạn phóng",
};
export const skillLookOptions: readonly Opt[] = SKILL_LOOKS.map((l) => ({ value: l, label: SKILL_LOOK_VI[l] ?? l }));

// ---- sprite sets from the manifest ----

interface ManifestSprite {
  atlas: string;
}
interface Manifest {
  atlases: Record<string, { image: string; data: string }>;
  sprites: Record<string, ManifestSprite>;
}
let manifestPromise: Promise<Manifest | null> | undefined;

/** The sprite manifest the game ships (`/gfx/manifest.json`); null when it cannot be read. */
export function manifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch("/gfx/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** The monster models the manifest has (`monster.<model>`), and the outfits of the player bodies (`player.male.<outfit>`; the plain clothes are the empty outfit). */
export async function spriteChoices(): Promise<{ models: string[]; outfits: string[]; ok: boolean }> {
  const m = await manifest();
  if (!m) return { models: [], outfits: [], ok: false };
  const keys = Object.keys(m.sprites);
  const models = keys.filter((k) => k.startsWith("monster.")).map((k) => k.slice("monster.".length)).sort();
  const outfits = keys.filter((k) => /^player\.male\.[a-z]+$/.test(k)).map((k) => k.slice("player.male.".length)).sort();
  return { models, outfits, ok: true };
}

const frames = new Map<string, Promise<{ img: HTMLImageElement; json: Record<string, { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number }; sourceSize: { w: number; h: number } }> } | null>>();

/** A small canvas with the standing frame of a sprite (`monster.wolf`, `player.male.tien`), facing the viewer; empty when the atlas cannot be read. */
export function spritePreview(spriteKey: string, size = 64): HTMLElement {
  const canvas = h("canvas", { class: "sprite-prev", width: String(size), height: String(size) });
  void (async () => {
    const m = await manifest();
    const sprite = m?.sprites[spriteKey];
    const atlas = sprite ? m?.atlases[sprite.atlas] : undefined;
    if (!m || !sprite || !atlas) return;
    let pending = frames.get(sprite.atlas);
    if (!pending) {
      pending = (async () => {
        try {
          const [json, img] = await Promise.all([
            fetch(`/gfx/${atlas.data}`).then((r) => r.json()),
            new Promise<HTMLImageElement>((ok, bad) => {
              const i = new Image();
              i.onload = () => ok(i);
              i.onerror = () => bad(new Error("image"));
              i.src = `/gfx/${atlas.image}`;
            }),
          ]);
          return { img, json: json.frames };
        } catch {
          return null;
        }
      })();
      frames.set(sprite.atlas, pending);
    }
    const loaded = await pending;
    const fr = loaded?.json[frameName("idle", 0, 0)];
    const ctx = canvas.getContext("2d");
    if (!loaded || !fr || !ctx) return;
    const k = Math.min(size / fr.sourceSize.w, size / fr.sourceSize.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(loaded.img, fr.frame.x, fr.frame.y, fr.frame.w, fr.frame.h, fr.spriteSourceSize.x * k, fr.spriteSourceSize.y * k, fr.frame.w * k, fr.frame.h * k);
  })();
  return canvas;
}

export type { TuningGroup };

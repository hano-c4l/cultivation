import Phaser from "phaser";
import { Effects } from "./fx";
import { FLIGHT_TEX, ensureFlightTextures } from "./flight-art";
import { drawQiAura, qiStyleOf } from "./qi-aura";
import { DEFAULT_THEME } from "@game/shared";

/**
 * A dev-only page (`/fx-lab.html` under `npm run dev -w client`; the build does not include it): two dots stand in for a caster and a target and every
 * skill effect can be fired at will, so effects are tuned by eye without a server, a login or a monster.
 */
/** Cultivation levels (`realm * 10 + stage`) the `qi` button shows: the first and the last stage of each realm. */
const LEVELS = [1, 9, 11, 19, 21, 29, 31, 39];
const caster = { x: 260, y: 420 };
const target = { x: 560, y: 340 };
const posOf = (id: string): { x: number; y: number } | null => (id === "me" ? caster : id === "foe" ? target : id === "far" ? { x: 120, y: 300 } : null);

class Lab extends Phaser.Scene {
  fx!: Effects;
  /** Figures wearing the qi of each level, shown with the `qi` button. */
  qi: Phaser.GameObjects.Graphics | null = null;
  create(): void {
    this.cameras.main.setBackgroundColor("#2c4a2e");
    for (const p of [caster, target]) this.add.ellipse(p.x, p.y, 36, 16, 0x000000, 0.35);
    this.add.rectangle(caster.x, caster.y - 22, 14, 36, 0xeeeeee).setDepth(10);
    this.add.rectangle(target.x, target.y - 22, 14, 36, 0xcc5555).setDepth(10);
    ensureFlightTextures(this);
    (["plain", "sword", "cloud", "lotus"] as const).forEach((k, i) => {
      const x = 120 + i * 150;
      this.add.rectangle(x, 470 - 25, 14, 36, 0xeeeeee).setDepth(1);
      this.add.image(x, 466, FLIGHT_TEX[k]).setDepth(0);
      this.add.text(x - 20, 488, k, { color: "#ddd", fontSize: "12px" });
    });
    this.fx = new Effects(this, posOf, () => "me");
    const bar = document.getElementById("bar") as HTMLElement;
    const add = (label: string, run: () => void): void => {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = run;
      bar.appendChild(b);
    };
    for (const el of ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"]) {
      add(`${el} chi`, () => this.fx.skill("me", "chi_1", "foe", undefined, el));
      add(`${el} 5`, () => this.fx.skill("me", `${el}_5`, "foe", undefined, el));
    }
    add("chuong", () => this.fx.skill("me", "chuong_1", "foe", undefined, "hoa"));
    add("tram", () => this.fx.skill("me", "tram_2", "foe", undefined, "kim"));
    add("ngu kiem", () => this.fx.skill("me", "ngu_kiem_tram", "foe", undefined, undefined));
    add("buff atk", () => this.fx.skill("me", "cuong_luc_2", undefined, undefined, undefined));
    add("buff def", () => this.fx.skill("me", "thuan_0", undefined, undefined, undefined));
    // the new ways of delivering a skill: a piercing shot, a ring round the caster, a lane and a field that stay
    for (const [label, id, el] of [["pierce kim", "kim_3", "kim"], ["pierce hoa", "hoa_4", "hoa"], ["pierce bang", "bang_3", "bang"], ["pierce loi", "loi_3", "loi"], ["pierce phong", "phong_3", "phong"], ["nova kim", "kim_4", "kim"], ["nova tho", "tho_4", "tho"], ["nova loi", "loi_4", "loi"], ["nova phong", "phong_4", "phong"]] as const) add(label, () => this.fx.skill("me", id, "foe", undefined, el));
    for (const [label, id, el] of [["lane hoa", "hoa_3", "hoa"], ["field moc", "moc_4", "moc"], ["field thuy", "thuy_5", "thuy"], ["field bang", "bang_4", "bang"], ["field tho", "tho_5", "tho"], ["field phong", "phong_5", "phong"]] as const) {
      add(label, () => {
        this.fx.skill("me", id, "foe", undefined, el);
        this.fx.zone(`lab${label}`, id, caster, target, 6000, el);
      });
    }
    add("qi", () => {
      // eight levels side by side: the first and last stage of the first four realms
      this.qi?.destroy();
      this.qi = this.add.graphics().setDepth(5);
      LEVELS.forEach((lv, i) => {
        this.add.rectangle(70 + i * 90, 300 - 20, 14, 36, 0xeeeeee).setDepth(10).setData("qi", true);
        this.add.text(54 + i * 90, 306, String(lv), { color: "#ddd", fontSize: "11px" }).setData("qi", true);
      });
    });
    add("dots", () => {
      // three running effects on one figure for 6 s, each with its own share of the circle
      const ids = ["thuan_0", "cuong_luc_2", "hoi_0"];
      const t0 = performance.now();
      const timer = window.setInterval(() => {
        const left = 6 - (performance.now() - t0) / 1000;
        if (left <= 0) return window.clearInterval(timer);
        ids.forEach((id, i) => this.fx.lingering("me", id, left, i, ids.length));
      }, 260);
    });
    add("heal", () => this.fx.skill("me", "hoi_0", undefined, undefined, undefined));
    add("heal+", () => this.fx.skill("me", "dt_dai_hoi", undefined, undefined, undefined));
    add("blink", () => this.fx.skill("me", "pt_thuan_di", undefined, target, undefined));
    add("basic", () => this.fx.basic("me", "foe", false));
    for (const w of ["kiem", "dao", "thuong", "riu", "quyen"]) add(`w ${w}`, () => this.fx.basic("me", "foe", false, w));
    add("guard", () => this.fx.basic("foe", "me", true, "thuong"));
    add("hit", () => this.fx.hit("foe", "me", "hit"));
    add("crit", () => this.fx.hit("foe", "me", "crit", "kim_3"));
    for (const [label, id] of [["palm", "chuong_1"], ["slash", "tram_2"], ["finger", "chi_1"], ["orb", "pb_kim_1"], ["great", "bm_kim"], ["dome", "thuan_0"], ["flames", "cuong_luc_2"], ["wind", "phong_bo_0"], ["seal", "tt_linh_an"], ["furnace", "dt_duong_nguyen"], ["bell", "ho_the_kd"], ["phoenix", "bm_hoi_sinh"]] as const) add(label, () => this.fx.skill("me", id, id.startsWith("bm_hoi") || ["thuan_0", "cuong_luc_2", "phong_bo_0", "tt_linh_an", "dt_duong_nguyen", "ho_the_kd"].includes(id) ? undefined : "foe", undefined, id === "chuong_1" ? "hoa" : id === "tram_2" ? "kim" : undefined));
    add("ground", () => this.fx.skill("me", "kim_3", undefined, { x: 520, y: 380 }, "kim"));
    add("basic far", () => this.fx.basic("far", "foe", false));
    add("cone", () => this.fx.coneFrom(target, caster, 5, 45));
    add("equip", () => this.fx.equip("me"));
    add("bt on", () => this.fx.channel("me", "bt", true, undefined));
    add("bt ok", () => this.fx.channel("me", "bt", false, true));
    add("bt fail", () => this.fx.channel("me", "bt", false, false));
    add("tp on", () => this.fx.channel("me", "tp", true, undefined));
    add("tp end", () => this.fx.channel("me", "tp", false, true));
    add("clear", () => this.fx.clear());
    const q = new URLSearchParams(location.search).get("run");
    const loop = new URLSearchParams(location.search).get("loop") !== null; // refire every second so a screenshot can catch it
    if (q) for (const b of Array.from(bar.children) as HTMLButtonElement[]) if (b.textContent === q) setTimeout(() => (loop ? setInterval(() => b.click(), 1000) : b.click()), 300);
  }
  update(time: number): void {
    this.fx.update(time);
    if (this.qi) {
      this.qi.clear();
      LEVELS.forEach((lv, i) => drawQiAura(this.qi!, 70 + i * 90, 300, 36, time / 1000, qiStyleOf(lv, DEFAULT_THEME.realmColors)));
    }
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: 800, height: 520, scene: Lab, backgroundColor: "#2c4a2e" });

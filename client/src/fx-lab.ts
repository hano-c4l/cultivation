import Phaser from "phaser";
import { Effects } from "./fx";

/**
 * A dev-only page (`/fx-lab.html` under `npm run dev -w client`; the build does not include it): two dots stand in for a caster and a target and every
 * skill effect can be fired at will, so effects are tuned by eye without a server, a login or a monster.
 */
const caster = { x: 260, y: 420 };
const target = { x: 560, y: 340 };
const posOf = (id: string): { x: number; y: number } | null => (id === "me" ? caster : id === "foe" ? target : id === "far" ? { x: 120, y: 300 } : null);

class Lab extends Phaser.Scene {
  fx!: Effects;
  create(): void {
    this.cameras.main.setBackgroundColor("#2c4a2e");
    for (const p of [caster, target]) this.add.ellipse(p.x, p.y, 36, 16, 0x000000, 0.35);
    this.add.rectangle(caster.x, caster.y - 22, 14, 36, 0xeeeeee);
    this.add.rectangle(target.x, target.y - 22, 14, 36, 0xcc5555);
    this.fx = new Effects(this, posOf);
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
    add("heal", () => this.fx.skill("me", "hoi_0", undefined, undefined, undefined));
    add("heal+", () => this.fx.skill("me", "dt_dai_hoi", undefined, undefined, undefined));
    add("blink", () => this.fx.skill("me", "pt_thuan_di", undefined, target, undefined));
    add("basic", () => this.fx.basic("me", "foe", false));
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
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: 800, height: 520, scene: Lab, backgroundColor: "#2c4a2e" });

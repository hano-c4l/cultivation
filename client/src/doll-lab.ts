import Phaser from "phaser";
import type { GearLook } from "@game/shared";
import { GfxKit, type GfxView } from "./gfx/kit";
import { dollLayers, dollWeaponKey } from "./gfx/doll";
import { ensureGroundTexture, propFrame } from "./map-layer";
import { GFX_PROP_ANCHOR, GFX_PROP_FRAME, GFX_PROPS_ATLAS, type GfxAnimName } from "@game/shared";

/**
 * A dev-only page (`/doll-lab.html` under `npm run dev -w client`; not in the build): one paper doll (every piece of gear chosen by hand), the old
 * single-sprite figure for comparison, monsters and props on an ink-wash ground, all through the real GfxKit, so the look of a render is judged in the game's own code.
 * `?q=` fixes the state for screenshots: `gender=female&dir=0&anim=idle&hat=3&weapon=kiem&r=2&t=3&g=2&b=1&zoom=2`.
 */
const q = new URLSearchParams(location.search);
const state = {
  gender: q.get("gender") ?? "female",
  style: q.get("style") ?? "robe",
  dir: Number(q.get("dir") ?? 0),
  anim: (q.get("anim") ?? "idle") as GfxAnimName,
  r: Number(q.get("r") ?? 2),
  t: Number(q.get("t") ?? 3),
  g: Number(q.get("g") ?? 2),
  b: Number(q.get("b") ?? 1),
  hat: Number(q.get("hat") ?? -1),
  weapon: q.get("weapon") ?? "",
  zoom: Number(q.get("zoom") ?? 1),
};

class Lab extends Phaser.Scene {
  kit!: GfxKit;
  body?: GfxView;
  wview?: GfxView;
  old?: GfxView;
  extras: Phaser.GameObjects.GameObject[] = [];
  ready = false;

  create(): void {
    this.cameras.main.setBackgroundColor("#bfc9b5").setZoom(state.zoom).centerOn(Number(q.get("cx") ?? 300), Number(q.get("cy") ?? 300));
    this.kit = new GfxKit(this);
    void this.kit.init().then(() => {
      this.kit.useMap("lab");
      const key = ensureGroundTexture(this, { groundA: 0x6f9a74, groundB: 0x84ad86, obstacle: 0x555555 } as never, "grass");
      this.add.tileSprite(0, 0, 2400, 1200, key).setOrigin(0.5, 0.5).setDepth(-1);
      this.ready = true;
    });
    this.buildBar();
  }

  buildBar(): void {
    const bar = document.getElementById("bar") as HTMLElement;
    const sel = (label: string, key: keyof typeof state, values: Array<string | number>): void => {
      const l = document.createElement("label");
      l.textContent = label;
      const s = document.createElement("select");
      for (const v of values) s.add(new Option(String(v), String(v), false, String(state[key]) === String(v)));
      s.onchange = () => ((state as Record<string, unknown>)[key] = typeof state[key] === "number" ? Number(s.value) : s.value);
      l.appendChild(s);
      bar.appendChild(l);
    };
    sel("gender", "gender", ["female", "male"]);
    sel("style", "style", ["robe", "tunic", "grand"]);
    sel("dir", "dir", [0, 1, 2, 3, 4, 5, 6, 7]);
    sel("anim", "anim", ["idle", "run", "attack", "thrust", "cast", "hit", "die", "sit"]);
    sel("robe", "r", [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    sel("hat", "hat", [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    sel("weapon", "weapon", ["", "kiem", "dao", "thuong", "riu", "cung"]);
  }

  update(time: number): void {
    if (!this.ready) return;
    const prefix = `doll.${state.gender}.${state.style}`;
    const key = this.kit.spriteKeyFor("player", undefined, `${state.gender}.${state.style}`);
    if (this.body && (!this.body.alive || this.body.key !== key)) {
      this.body.destroy();
      this.body = undefined;
    }
    if (!this.body && key) this.body = this.kit.createView(key);
    const cx = 300;
    const cy = 330;
    if (this.body) {
      const lk: GearLook = { r: state.r || undefined, t: state.t || undefined, g: state.g || undefined, b: state.b || undefined };
      Object.keys(lk).forEach((k) => (lk as Record<string, unknown>)[k] === undefined && delete (lk as Record<string, unknown>)[k]);
      const wanted = dollLayers(prefix, lk, (k) => this.kit.knows(k));
      if (state.hat >= 0 && this.kit.knows(`${prefix}.h${state.hat}`)) {
        const hair = wanted.find((w) => w.slot === "hair");
        if (hair) hair.key = `${prefix}.hairhat`;
        wanted.push({ slot: "hat", key: `${prefix}.h${state.hat}`, tint: 0xe8c878 });
      }
      this.body.setLayers(wanted);
      if (state.anim === "attack" || state.anim === "cast" || state.anim === "thrust" || state.anim === "hit") {
        if (Math.floor(time / 1200) !== (this as unknown as { last?: number }).last) {
          (this as unknown as { last?: number }).last = Math.floor(time / 1200);
          this.body.playOnce(state.anim, state.dir, 700);
        }
      } else this.body.play(state.anim, state.dir);
      const wkey = dollWeaponKey(prefix, state.weapon, (k) => this.kit.knows(k));
      if (this.wview && (!this.wview.alive || this.wview.key !== wkey)) {
        this.wview.destroy();
        this.wview = undefined;
      }
      if (!this.wview && wkey) this.wview = this.kit.createView(wkey);
      this.body.place(cx, cy, 10);
      if (this.wview) {
        this.wview.followFrame(this.body);
        this.wview.place(cx, cy, 10.02);
      }
    }
    // the old figure (the single tinted sprite) beside it, for comparison
    const oldKey = this.kit.spriteKeyFor("player", undefined, `${state.gender}.tien`);
    if (this.old && (!this.old.alive || this.old.key !== oldKey)) {
      this.old.destroy();
      this.old = undefined;
    }
    if (!this.old && oldKey) this.old = this.kit.createView(oldKey);
    this.old?.play(state.anim === "sit" ? "idle" : state.anim, state.dir);
    this.old?.place(cx - 150, cy, 10);
    // monsters and props in a row below
    this.row();
  }

  rowDone = false;
  row(): void {
    if (this.rowDone) return;
    const wolf = this.kit.spriteKeyFor("monster", "soi_rung") ?? this.kit.spriteKeyFor("monster", "wolf");
    const wv = wolf ? this.kit.createView(wolf) : undefined;
    const props = ["tree_0", "tree_2", "tree_3", "bush_0", "rock_0", "boulder_1", "pillar_1", "crystal_0", "bamboo_0", "lantern_0"];
    if (!this.textures.exists(`gfx:${GFX_PROPS_ATLAS}`) || !wv) return;
    this.rowDone = true;
    wv.place(520, 330, 10);
    wv.play("idle", 0);
    this.extras.push(wv.sprite);
    props.forEach((p, i) => {
      const [style, v] = p.split("_") as [string, string];
      const frame = propFrame(this, style as never, Number(v));
      if (!frame) return;
      this.add.image(640 + i * 150, 560, `gfx:${GFX_PROPS_ATLAS}`, frame).setOrigin(GFX_PROP_ANCHOR.x / GFX_PROP_FRAME, GFX_PROP_ANCHOR.y / GFX_PROP_FRAME).setDepth(10);
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  scene: Lab,
  pixelArt: false,
  backgroundColor: "#bfc9b5",
});

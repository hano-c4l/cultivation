import { DEFAULT_TUNING, getSkill, setTuning, skillLookOf, type SkillDef } from "@game/shared";
import { h } from "./kit";

/**
 * "Xem thử hiệu ứng" on the skill screen (PHASE4 leftovers): a small Phaser scene with a caster and a target, where the skill is fired with the look the admin has picked, saved or not
 * (the lab `client/src/fx-lab.ts` does this for developers). The game code is loaded only when the section is first built (a separate chunk), and the scene is destroyed when the screen
 * goes away. The preview draws with the numbers of the code and of the picks on this screen, not with the other tuning an admin may have changed.
 */
export interface FxPreviewState {
  /** The id of the skill, or of the template (a template row previews one of its skills). */
  skillId: string;
  /** The picked ray look (a `SKILL_LOOKS` word), "" when the game's own is wanted. */
  look: () => string;
  /** The picked "effect others see" (`melee`, `ranged`), "" when the game's own is wanted. */
  fx: () => string;
  /** The power in the form, when it is a number. */
  power: () => number | undefined;
  /** The saved hit areas (`skillAreas`) the game uses, so the area marks follow what an admin saved. */
  areas?: Record<string, unknown>;
}

const ELEMENTS: Array<[string, string]> = [["", "(hệ của kỹ năng)"], ["kim", "Kim"], ["moc", "Mộc"], ["thuy", "Thủy"], ["hoa", "Hỏa"], ["tho", "Thổ"], ["loi", "Lôi"], ["bang", "Băng"], ["phong", "Phong"]];
const CASTER = { x: 120, y: 190 };
const TARGET = { x: 400, y: 120 };

/** A skill of the game to fire for `id`: the skill itself, or the first of a template's. */
function sampleOf(id: string): SkillDef | undefined {
  const own = getSkill(id);
  if (own) return own;
  for (let i = 0; i <= 12; i++) {
    const member = getSkill(`${id}_${i}`);
    if (member) return member;
  }
  return undefined;
}

export async function fxPreviewSection(state: FxPreviewState): Promise<HTMLElement> {
  const sample = sampleOf(state.skillId);
  const root = h("section", { class: "card" }, h("h3", null, "Xem thử hiệu ứng"));
  if (!sample) return root.appendChild(h("p", { class: "muted" }, "Kỹ năng này không có hiệu ứng để xem thử.")), root;
  const [{ default: Phaser }, { Effects }] = await Promise.all([import("phaser"), import("../../src/fx")]);
  const stage = h("div", { class: "fx-stage" });
  const element = h("select", null, ...ELEMENTS.map(([v, label]) => h("option", { value: v }, label)));
  const fire = h("button", { type: "button", class: "primary" }, "Xem thử");
  const loop = h("input", { type: "checkbox" });
  const note = h("span", { class: "muted" }, sample.id !== state.skillId ? `Mẫu kỹ năng: xem thử bằng «${sample.nameVi}» (${sample.id}).` : "");
  root.append(h("div", { class: "toolbar" }, fire, h("label", { class: "radio" }, loop, "Lặp lại"), h("span", null, "Hệ:"), element, note), stage);

  let fx: InstanceType<typeof Effects> | null = null;
  let zoneSeq = 0;
  const posOf = (id: string): { x: number; y: number } | null => (id === "me" ? CASTER : id === "foe" ? TARGET : null);
  const go = (): void => {
    if (!fx) return;
    // The picks of this screen over the code's numbers: the look for the ray, the effect others see and the power; every other tuning group is the default.
    const picked = state.look();
    const effect = state.fx();
    const power = state.power();
    const override: Record<string, unknown> = {};
    if (effect) override.fx = effect;
    if (power !== undefined) override.power = power;
    setTuning({ skillAreas: { ...DEFAULT_TUNING.skillAreas, ...(state.areas as typeof DEFAULT_TUNING.skillAreas | undefined) }, skillLooks: { ...DEFAULT_TUNING.skillLooks, ...(picked ? { [state.skillId]: picked } : {}) }, skillOverrides: Object.keys(override).length > 0 ? { [sample.id]: override } : {} });
    const def = getSkill(sample.id);
    if (!def) return;
    const el = element.value || undefined;
    const attack = def.kind === "attack";
    const aimed = attack || def.kind === "teleport";
    fx.skill("me", def.id, attack ? "foe" : undefined, aimed ? TARGET : undefined, el);
    const look = effect ? undefined : skillLookOf(def);
    if (attack && (look === "lane" || look === "field")) fx.zone(`preview${zoneSeq++}`, def.id, CASTER, TARGET, 4000, el);
  };

  class PreviewScene extends Phaser.Scene {
    private next = 0;
    create(): void {
      this.cameras.main.setBackgroundColor("#2c4a2e");
      for (const p of [CASTER, TARGET]) this.add.ellipse(p.x, p.y, 36, 16, 0x000000, 0.35);
      this.add.rectangle(CASTER.x, CASTER.y - 22, 14, 36, 0xeeeeee).setDepth(10);
      this.add.rectangle(TARGET.x, TARGET.y - 22, 14, 36, 0xcc5555).setDepth(10);
      fx = new Effects(this, posOf, () => "me");
    }
    update(time: number): void {
      // The screen was replaced by the router: stop this scene for good (it would otherwise keep drawing for as long as the tab lives).
      if (!stage.isConnected) return void this.game.destroy(true);
      fx?.update(time);
      if (loop.checked && time >= this.next) {
        this.next = time + 1800;
        go();
      }
    }
  }
  const game = new Phaser.Game({ type: Phaser.CANVAS, parent: stage, width: 520, height: 260, scene: PreviewScene, banner: false, audio: { noAudio: true } });
  fire.addEventListener("click", go);
  game.events.once("destroy", () => {
    fx = null;
    setTuning(null); // the defaults again
  });
  return root;
}

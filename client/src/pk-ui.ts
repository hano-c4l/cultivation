import { decayedSatNhan, type ClientMessage } from "@game/shared";
import { vi } from "./locales/vi";

export interface PkUi {
  /** Your own PvP state from the server: the switch and the three scores (sát nhân as of now). */
  set(on: boolean, satKhi: number, satNhan: number, hero: number): void;
  /** Redraws the numbers: your sát nhân keeps falling 5 a minute while online, with no message from the server. */
  tick(): void;
  isOn(): boolean;
  /** Whether a map lets the switch matter: it is shown in every map but only works outside the safe town. */
  setSafe(safe: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The PK switch (off at every join): only with it on can another player be attacked, by clicking them. Next to it, your three
 * PvP scores when you have any. The server decides everything; this is only the button and the numbers.
 */
export function initPk(send: (msg: ClientMessage) => void): PkUi {
  const box = el("div");
  box.id = "pk-box";
  const button = el("button", undefined, vi.pk.off);
  button.id = "pk-btn";
  const scores = el("div", "pk-scores");
  box.append(button, scores);
  document.body.append(box);

  let on = false;
  let have = { satKhi: 0, satNhan: 0, hero: 0 };
  let heardAt = performance.now();
  const draw = () => {
    const sn = Math.round(decayedSatNhan(have.satNhan, performance.now() - heardAt));
    scores.textContent = have.satKhi + sn + have.hero > 0 ? vi.pk.scores(have.satKhi, sn, have.hero) : "";
    scores.title = vi.pk.scoresTitle;
  };
  button.onclick = () => send({ t: "pk_mode", on: !on });

  return {
    set(nextOn, satKhi, satNhan, hero) {
      on = nextOn;
      button.textContent = on ? vi.pk.on : vi.pk.off;
      button.classList.toggle("on", on);
      have = { satKhi, satNhan, hero };
      heardAt = performance.now();
      draw();
    },
    tick: draw,
    isOn: () => on,
    setSafe(safe) {
      button.title = safe ? vi.pk.safeTitle : vi.pk.title;
      button.classList.toggle("safe", safe);
    },
  };
}

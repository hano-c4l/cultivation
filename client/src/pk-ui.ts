import { decayedSatNhan, type ClientMessage, type PkMode } from "@game/shared";
import { vi } from "./locales/vi";

export interface PkUi {
  /** Your own PvP state from the server: the PK state and the three scores (sát nhân as of now). */
  set(mode: PkMode, satKhi: number, satNhan: number, hero: number): void;
  /** Redraws the numbers: your sát nhân keeps falling 5 a minute while online, with no message from the server. */
  tick(): void;
  /** The PK state the server has now. */
  mode(): PkMode;
  /** The state the player chose last (kept across maps; the client sends it again after each join). */
  chosen(): PkMode;
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
 * The PK button, three states: Tắt (starts no fight), PK (fights players who are PK or Đồ sát), Đồ sát (fights anyone); a click moves to
 * the next one. Other players are attacked by clicking them. Next to it, your three PvP scores when you have any. The server decides
 * everything; this is only the button and the numbers.
 */
export function initPk(send: (msg: ClientMessage) => void): PkUi {
  // Under the HP/MP box and above the buffs: the scores on the left, a small state button to their right.
  const box = document.getElementById("pk-row")!;
  const scores = el("div", "pk-scores");
  const button = el("button", undefined, vi.pk.labels[0]);
  button.id = "pk-btn";
  box.replaceChildren(scores, button);
  box.hidden = true; // shown once the server has told us the state (after joining)

  let mode: PkMode = 0;
  let chosen: PkMode = 0;
  let have = { satKhi: 0, satNhan: 0, hero: 0 };
  let heardAt = performance.now();
  const draw = () => {
    const sn = Math.round(decayedSatNhan(have.satNhan, performance.now() - heardAt));
    scores.textContent = vi.pk.scores(sn, have.hero);
    scores.title = vi.pk.scoresTitle;
  };
  button.onclick = () => {
    chosen = ((mode + 1) % 3) as PkMode;
    send({ t: "pk_mode", mode: chosen });
  };

  return {
    set(next, satKhi, satNhan, hero) {
      mode = next;
      box.hidden = false;
      button.textContent = vi.pk.labels[mode] ?? vi.pk.off;
      button.dataset.state = vi.pk.stateNames[mode] ?? "";
      button.classList.toggle("on", mode === 1);
      button.classList.toggle("slaughter", mode === 2);
      have = { satKhi, satNhan, hero };
      heardAt = performance.now();
      draw();
    },
    tick: draw,
    mode: () => mode,
    chosen: () => chosen,
    setSafe(safe) {
      button.title = `${vi.pk.stateNames[mode] ?? ""} · ${safe ? vi.pk.safeTitle : vi.pk.title}`;
      button.classList.toggle("safe", safe);
    },
  };
}

import { vi } from "./locales/vi";

export interface PlayerMenuEntry {
  label: string;
  run(): void;
}

export interface PlayerMenu {
  /** Opens the list of things to do with a player, at a point of the screen; a click anywhere else closes it. */
  show(name: string, entries: PlayerMenuEntry[], at: { x: number; y: number }): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * The menu that opens when another player is clicked: their name on top, then one line per thing that can be done with them (trading now; a challenge, a
 * party and so on can be added to the list the scene hands in).
 */
export function initPlayerMenu(): PlayerMenu {
  const box = document.createElement("div");
  box.id = "player-menu";
  box.hidden = true;
  document.body.append(box);

  const onOutside = (ev: Event) => {
    if (!box.contains(ev.target as Node)) close();
  };
  function close(): void {
    box.hidden = true;
    document.removeEventListener("pointerdown", onOutside, true);
  }

  return {
    show(name, entries, at) {
      close();
      box.replaceChildren();
      const title = document.createElement("div");
      title.className = "pm-name";
      title.textContent = name || vi.playerMenu.stranger;
      box.append(title);
      for (const e of entries) {
        const b = document.createElement("button");
        b.textContent = e.label;
        b.onclick = () => {
          close();
          e.run();
        };
        box.append(b);
      }
      box.hidden = false;
      // keep it inside the window
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      box.style.left = `${Math.max(4, Math.min(at.x + 8, window.innerWidth - w - 4))}px`;
      box.style.top = `${Math.max(4, Math.min(at.y - 8, window.innerHeight - h - 4))}px`;
      // the click that opened it must not close it at once
      setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);
    },
    close,
    isOpen: () => !box.hidden,
  };
}

/**
 * The loading screen: a card with a progress bar over the whole window, shown from the moment the player is let in until the game has everything it needs
 * to look right (the welcome from the server, the map, the sprites of the figures in view), so the scene never shows the old town for a moment or a
 * figure in its old look. The scene reports how far it is; this only draws. It never stays for ever: the scene gives up waiting after a while.
 */
import { vi } from "./locales/vi";

/** Shortest time the screen stays up, so a fast load does not make it flash. */
const MIN_VISIBLE_MS = 450;
const FADE_MS = 280;

let root: HTMLElement | null = null;
let fill: HTMLElement | null = null;
let text: HTMLElement | null = null;
let shownAt = 0;
let value = 0;
let hideTimer: number | undefined;

function parts(): boolean {
  root ??= document.getElementById("loading");
  fill ??= document.getElementById("loading-fill");
  text ??= document.getElementById("loading-text");
  return !!(root && fill && text);
}

export const loading = {
  /** Whether the screen is up (or fading out). */
  get active(): boolean {
    return !!root && !root.hidden;
  },

  /** Puts the screen up again from the start (a new entry, a map change, a lost connection). */
  show(label: string = vi.loadingScreen.starting): void {
    if (!parts()) return;
    window.clearTimeout(hideTimer);
    root!.classList.remove("fading");
    root!.hidden = false;
    shownAt = performance.now();
    value = 0;
    this.set(0.05, label);
  },

  /** Moves the bar to `fraction` (0..1, it never goes back) and, when given, changes the line under it. */
  set(fraction: number, label?: string): void {
    if (!parts() || root!.hidden) return;
    value = Math.max(value, Math.min(1, fraction));
    fill!.style.width = `${Math.round(value * 100)}%`;
    if (label !== undefined) text!.textContent = label;
  },

  /** Fills the bar and takes the screen away (after the minimum time, with a short fade). */
  finish(): void {
    if (!parts() || root!.hidden || root!.classList.contains("fading")) return;
    this.set(1, vi.loadingScreen.ready);
    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
    hideTimer = window.setTimeout(() => {
      root!.classList.add("fading");
      hideTimer = window.setTimeout(() => {
        root!.hidden = true;
        root!.classList.remove("fading");
      }, FADE_MS);
    }, wait);
  },
};

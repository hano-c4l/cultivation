/**
 * Places the overlay windows (character, equipment, bag) side by side so the group is centred on the screen, in that
 * order from left to right. Each window keeps working on its own `hidden` attribute; the manager watches it.
 * When a window is opened and the open ones no longer fit, the others are closed, nearest to the new window first
 * (the one next to it in the left-to-right order, a left neighbour before a right one), until everything fits. The window
 * that was just opened is never the one that gives way.
 */
interface Win {
  id: string;
  el: HTMLElement;
  /** Position in the left-to-right order. */
  order: number;
  wasOpen: boolean;
}

const GAP = 8;
const MARGIN = 8;
const TOP = 56;
const wins: Win[] = [];
let lastOpened: Win | null = null;

const isOpen = (w: Win) => !w.el.hidden;
const openSorted = () => wins.filter(isOpen).sort((a, b) => a.order - b.order);

function totalWidth(list: Win[]): number {
  return list.reduce((s, w) => s + w.el.offsetWidth, 0) + GAP * Math.max(0, list.length - 1);
}

function layout(): void {
  const open = openSorted();
  const total = totalWidth(open);
  let x = Math.max(MARGIN, (window.innerWidth - total) / 2);
  for (const w of open) {
    const s = w.el.style;
    s.left = `${x}px`;
    s.right = "auto";
    s.top = `${TOP}px`;
    s.transform = "none";
    s.maxHeight = `calc(100dvh - ${TOP + 16}px)`;
    x += w.el.offsetWidth + GAP;
  }
}

/** Makes room for `fresh` by closing the other open windows, nearest first, until the row fits the screen. */
function makeRoom(fresh: Win): void {
  const fits = () => totalWidth(openSorted()) <= window.innerWidth - 2 * MARGIN;
  if (fits()) return;
  const others = openSorted()
    .filter((w) => w !== fresh)
    .sort((a, b) => Math.abs(a.order - fresh.order) - Math.abs(b.order - fresh.order) || a.order - b.order);
  for (const w of others) {
    if (fits()) break;
    w.el.hidden = true; // the observer sees the change and records it
    w.wasOpen = false;
  }
}

export function registerWindow(id: string, el: HTMLElement, order: number): void {
  const w: Win = { id, el, order, wasOpen: !el.hidden };
  wins.push(w);
  new MutationObserver(() => {
    const open = isOpen(w);
    if (open && !w.wasOpen) {
      lastOpened = w;
      w.wasOpen = true;
      makeRoom(w);
    } else if (!open) {
      w.wasOpen = false;
    }
    layout();
  }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
}

window.addEventListener("resize", () => {
  if (lastOpened && isOpen(lastOpened)) makeRoom(lastOpened);
  layout();
});

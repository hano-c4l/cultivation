import { getItemDef, getSkill, type EffectView } from "@game/shared";

export interface BuffsUi {
  /** Replaces the whole list (the server sends every effect running whenever one starts or ends). */
  set(list: EffectView[]): void;
}

/** A short tag for a tile: the first letter of each of the last two words of the name ("Linh Thuẫn" gives "LT"). */
function tag(name: string): string {
  const words = name.replace(/^Bí Tịch:\s*/, "").split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Remaining time as shown on a tile: seconds while under 100, then minutes. */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 100 ? `${Math.ceil(s / 60)}p` : `${s}s`;
}

/**
 * The buff bar: one small tile per effect running on the character (buff skills and potions that work over time), right
 * under the HP and MP bars, with the time left on it. The server owns the list; the tile counts down on its own and
 * disappears when its time is up, so a missed message cannot leave a stale tile for long.
 */
export function initBuffs(): BuffsUi {
  const root = document.getElementById("buffs")!;
  let effects: Array<{ id: string; until: number }> = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  /** The tile the player tapped: its name and time are written out under the row. */
  let shown: string | null = null;

  function render(): void {
    const now = Date.now();
    effects = effects.filter((e) => e.until > now);
    root.replaceChildren(
      ...effects.map((e) => {
        const isItem = e.id.startsWith("i:");
        const key = e.id.slice(2);
        const name = isItem ? (getItemDef(key)?.nameVi ?? key) : (getSkill(key)?.nameVi ?? key);
        const tile = document.createElement("div");
        tile.className = `buff ${isItem ? "buff-item" : "buff-skill"}`;
        tile.title = `${name} · ${formatLeft(e.until - now)}`;
        const label = document.createElement("span");
        label.className = "buff-tag";
        label.textContent = tag(name);
        const left = document.createElement("span");
        left.className = "buff-left";
        left.textContent = formatLeft(e.until - now);
        tile.append(label, left);
        // Hover shows the name through `title`; a touch screen has no hover, so a tap names it in the line under the tiles.
        tile.onclick = () => {
          shown = shown === e.id ? null : e.id;
          render();
        };
        return tile;
      }),
    );
    const picked = effects.find((e) => e.id === shown);
    if (picked) {
      const isItem = picked.id.startsWith("i:");
      const key = picked.id.slice(2);
      const line = document.createElement("div");
      line.className = "buff-name";
      line.textContent = `${isItem ? (getItemDef(key)?.nameVi ?? key) : (getSkill(key)?.nameVi ?? key)} · ${formatLeft(picked.until - now)}`;
      root.append(line);
    } else shown = null;
    root.hidden = effects.length === 0;
    if (effects.length > 0 && !timer) timer = setInterval(render, 250);
    if (effects.length === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {
    set(list) {
      const now = Date.now();
      effects = list.filter((e) => e.ms > 0).map((e) => ({ id: e.id, until: now + e.ms }));
      render();
    },
  };
}

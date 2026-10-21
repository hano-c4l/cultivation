import { vi } from "./locales/vi";

export interface ChannelUi {
  /** Starts the bar in the middle of the screen: it fills over `ms`, with the seconds left under it. */
  start(label: string, ms: number, variant?: "gold"): void;
  /** Hides it (the channel ended, broke or moved us). */
  stop(): void;
}

/**
 * The channelling bar (a teleport talisman): a progress bar in the middle of the screen with the countdown right under it. The server
 * decides when the channel ends; this only draws the time it announced.
 */
export function initChannel(): ChannelUi {
  const box = document.createElement("div");
  box.id = "channel-bar";
  box.hidden = true;
  const title = document.createElement("div");
  title.className = "cb-title";
  const track = document.createElement("div");
  track.className = "cb-track";
  const fill = document.createElement("div");
  fill.className = "cb-fill";
  track.append(fill);
  const left = document.createElement("div");
  left.className = "cb-left";
  box.append(title, track, left);
  document.body.append(box);

  let timer: ReturnType<typeof setInterval> | undefined;
  let endsAt = 0;
  let total = 1;
  const draw = () => {
    // The server always ends a channel; if its message was lost, the bar must not sit at 0.0 forever.
    if (Date.now() > endsAt + 8000) return stop();
    const remaining = Math.max(0, endsAt - Date.now());
    fill.style.width = `${Math.min(100, ((total - remaining) / total) * 100)}%`;
    left.textContent = vi.shop.channelLeft((remaining / 1000).toFixed(1));
  };
  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
    box.hidden = true;
  }

  return {
    start(label, ms, variant) {
      stop();
      box.classList.toggle("gold", variant === "gold");
      total = Math.max(1, ms);
      endsAt = Date.now() + total;
      title.textContent = label;
      box.hidden = false;
      draw();
      timer = setInterval(draw, 100);
    },
    stop,
  };
}

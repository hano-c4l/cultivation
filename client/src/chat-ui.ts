import { CHAT_MAX_LENGTH } from "@game/shared";
import { vi } from "./locales/vi";

const MAX_LINES = 60;

export interface ChatUi {
  add(name: string, text: string, isSelf: boolean): void;
  system(text: string): void;
}

/** Wires the HTML chat overlay. All text is inserted with textContent, so chat can never inject markup. */
export function initChat(send: (text: string) => void): ChatUi {
  const root = document.getElementById("chat")!;
  const log = document.getElementById("chat-log")!;
  const form = document.getElementById("chat-form") as HTMLFormElement;
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const button = document.getElementById("chat-send") as HTMLButtonElement;

  input.placeholder = vi.chatPlaceholder;
  input.maxLength = CHAT_MAX_LENGTH;
  button.textContent = vi.chatSend;
  root.hidden = false;

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (text) send(text);
    input.value = "";
  };

  // Enter focuses the chat box from anywhere; Escape leaves it so the game gets the focus back.
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && document.activeElement !== input) {
      input.focus();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      input.blur();
    }
  });

  const append = (line: HTMLElement) => {
    log.append(line);
    while (log.childElementCount > MAX_LINES) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  return {
    add(name, text, isSelf) {
      const line = document.createElement("div");
      const who = document.createElement("b");
      who.textContent = name;
      if (isSelf) who.className = "self";
      line.append(who, document.createTextNode(`: ${text}`));
      append(line);
    },
    system(text) {
      const line = document.createElement("div");
      line.className = "system";
      line.textContent = text;
      append(line);
    },
  };
}

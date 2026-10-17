import { CHAT_MAX_LENGTH, CHAT_TARGET_MAX_LENGTH, type ChatChannel } from "@game/shared";
import { vi } from "./locales/vi";

const MAX_LINES = 120;

/** What a tab shows. "all" shows every line; "system" is only written by the client. */
export type ChatTab = "all" | ChatChannel | "system";
const TABS: readonly ChatTab[] = ["all", "world", "map", "whisper", "system"];
const PLAYER_SEND_CHANNELS: readonly ChatChannel[] = ["world", "map", "whisper"];

export type SystemKind = "info" | "important" | "error";

export interface ChatLineData {
  channel: ChatChannel;
  /** Sender. */
  id: string;
  name: string;
  text: string;
  /** Present on the sender's own copy of a whisper. */
  toName?: string;
}

export interface ChatUi {
  add(line: ChatLineData, selfId: string): void;
  /**
   * A client-made line for the "Hệ thống" tab. "info" (green, e.g. loot) shows in the system and all tabs; "important"
   * (red, e.g. death, map change) and "error" (red, rejected chat) stay visible in every tab.
   */
  system(text: string, kind?: SystemKind): void;
}

/** Wires the HTML chat overlay. All text is inserted with textContent, so chat can never inject markup. */
export function initChat(send: (channel: ChatChannel, text: string, to?: string) => void, isAdmin = false): ChatUi {
  // Admins can also announce in the system tab; the server checks the role again, this only decides what to offer.
  const SEND_CHANNELS: readonly ChatChannel[] = isAdmin ? [...PLAYER_SEND_CHANNELS, "system"] : PLAYER_SEND_CHANNELS;
  const root = document.getElementById("chat")!;
  const log = document.getElementById("chat-log")!;
  const tabsBar = document.getElementById("chat-tabs")!;
  const form = document.getElementById("chat-form") as HTMLFormElement;
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const button = document.getElementById("chat-send") as HTMLButtonElement;
  const select = document.getElementById("chat-channel") as HTMLSelectElement;
  const target = document.getElementById("chat-to") as HTMLInputElement;

  input.placeholder = vi.chat.placeholder;
  input.maxLength = CHAT_MAX_LENGTH;
  target.placeholder = vi.chat.targetPlaceholder;
  target.maxLength = CHAT_TARGET_MAX_LENGTH;
  button.textContent = vi.chat.send;
  root.hidden = false;

  select.replaceChildren(
    ...SEND_CHANNELS.map((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = vi.chat.channels[c];
      return o;
    }),
  );
  select.value = "map";

  let active: ChatTab = "all";
  const unread = new Map<ChatTab, number>();
  const tabButtons = new Map<ChatTab, HTMLButtonElement>();

  const renderTab = (tab: ChatTab) => {
    const b = tabButtons.get(tab)!;
    const n = unread.get(tab) ?? 0;
    b.textContent = vi.chat.tabs[tab];
    if (n > 0 && tab !== active) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = n > 99 ? "99+" : String(n);
      b.append(badge);
    }
    b.classList.toggle("active", tab === active);
  };

  const showTarget = () => {
    target.hidden = select.value !== "whisper";
  };
  const setSendChannel = (c: ChatChannel) => {
    select.value = c;
    showTarget();
  };
  select.onchange = showTarget;
  showTarget();

  const activate = (tab: ChatTab) => {
    active = tab;
    unread.set(tab, 0);
    log.className = `tab-${tab}`;
    for (const t of TABS) renderTab(t);
    log.scrollTop = log.scrollHeight;
    // Opening a sendable tab also selects it as the channel to speak in.
    if (tab === "world" || tab === "map" || tab === "whisper" || (tab === "system" && isAdmin)) setSendChannel(tab);
  };

  for (const tab of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tab = tab;
    b.onclick = () => activate(tab);
    tabButtons.set(tab, b);
    tabsBar.append(b);
  }
  activate("all");

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const channel = select.value as ChatChannel;
    if (channel === "whisper") {
      const to = target.value.trim();
      if (!to) {
        target.focus();
        return;
      }
      send(channel, text, to);
    } else {
      send(channel, text);
    }
    input.value = "";
  };

  // Enter focuses the chat box from anywhere; Escape leaves it so the game gets the focus back.
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && document.activeElement !== input && document.activeElement !== target) {
      input.focus();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      input.blur();
      target.blur();
    }
  });

  const append = (line: HTMLElement, tab: ChatTab, visibleEverywhere = false) => {
    log.append(line);
    while (log.childElementCount > MAX_LINES) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    // Shown where it is visible: everywhere for red lines, in its own tab, and in "all" except for routine system lines.
    // Anywhere else it counts as unread on its own tab.
    if (visibleEverywhere || active === tab || (active === "all" && tab !== "system")) return;
    unread.set(tab, (unread.get(tab) ?? 0) + 1);
    renderTab(tab);
  };

  const nameButton = (name: string, isSelf: boolean, replyTo: string | null): HTMLElement => {
    const who = document.createElement("b");
    who.textContent = name;
    if (isSelf) who.classList.add("self");
    if (replyTo) {
      who.classList.add("replyable");
      who.title = vi.chat.replyHint;
      who.onclick = () => {
        setSendChannel("whisper");
        target.value = replyTo;
        input.focus();
      };
    }
    return who;
  };

  return {
    add(line, selfId) {
      const el = document.createElement("div");
      el.className = `line ch-${line.channel}`;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `[${vi.chat.channels[line.channel]}] `;
      el.append(tag);
      const isSelf = line.id === selfId;
      if (line.channel === "system") {
        // An admin announcement: an important (red) line without the sender's name, visible in every tab.
        el.classList.add("important");
        el.append(document.createTextNode(line.text));
      } else if (line.channel === "whisper") {
        // Own copy: "Bạn → X"; incoming: "X → bạn". Either way clicking the other person's name starts a reply.
        const other = isSelf ? (line.toName ?? "") : line.name;
        const from = isSelf ? nameButton(vi.chat.you, true, null) : nameButton(line.name, false, other);
        const to = isSelf ? nameButton(line.toName ?? "", false, other) : nameButton(vi.chat.you, true, null);
        el.append(from, document.createTextNode(" → "), to, document.createTextNode(`: ${line.text}`));
      } else {
        el.append(nameButton(line.name, isSelf, isSelf ? null : line.name), document.createTextNode(`: ${line.text}`));
      }
      append(el, line.channel, line.channel === "system");
    },
    system(text, kind = "info") {
      const el = document.createElement("div");
      el.className = `line ch-system${kind === "info" ? "" : kind === "error" ? " err" : " important"}`;
      el.textContent = text;
      append(el, "system", kind !== "info");
    },
  };
}

import { CHAT_MAX_LENGTH, CHAT_TARGET_MAX_LENGTH, type ChatChannel } from "@game/shared";
import { vi } from "./locales/vi";

const MAX_LINES = 120;

/** What a tab shows. "all" shows every line; "system" is only written by the client. */
export type ChatTab = "all" | ChatChannel | "system";
const TABS: readonly ChatTab[] = ["all", "world", "map", "whisper", "system"];
const PLAYER_SEND_CHANNELS: readonly ChatChannel[] = ["world", "map", "whisper"];

/** "warning" is a red line for the system tab only (e.g. the sort lock); "error" belongs to the tab it came from. */
export type SystemKind = "info" | "important" | "warning" | "error";

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
   * A client-made line for the "Hệ thống" tab. "info" (teal, e.g. loot) shows only in the system tab; "important"
   * (red, e.g. death, map change) in the system and all tabs, and "error" (red, a rejected message or command) in the tab
   * that was active when it happened, plus the all tab.
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
      o.textContent = c === "system" ? vi.chat.gmSystem : vi.chat.channels[c];
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

  // Clears every tab's lines and unread counts (the history only lives in this client, so nothing else is affected).
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear";
  clear.textContent = "🗑";
  clear.title = vi.chat.clearTitle;
  clear.setAttribute("aria-label", vi.chat.clearTitle);
  clear.onclick = () => {
    log.replaceChildren();
    unread.clear();
    for (const t of TABS) renderTab(t);
  };

  for (const tab of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tab = tab;
    b.onclick = () => activate(tab);
    tabButtons.set(tab, b);
    tabsBar.append(b);
  }
  tabsBar.append(clear);
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

  /**
   * `visibleIn` says where the line is shown besides its own tab: "everywhere" (a rejection, which is shown only in the
   * tab it came from, so it never needs an unread count), "all" (chat, and red system lines such as announcements and death) or "own" (routine green system lines,
   * which live only in the system tab). A tab that does not show the line counts it as unread on the line's own tab.
   */
  const append = (line: HTMLElement, tab: ChatTab, visibleIn: "everywhere" | "all" | "own") => {
    log.append(line);
    while (log.childElementCount > MAX_LINES) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    if (visibleIn === "everywhere" || active === tab || (visibleIn === "all" && active === "all")) return;
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
        // An admin announcement: an important (red) line without the sender's name, shown in the all and system tabs.
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
      append(el, line.channel, "all");
    },
    system(text, kind = "info") {
      const el = document.createElement("div");
      el.className = `line ch-system${kind === "info" ? "" : kind === "error" ? " err" : kind === "warning" ? " important sysonly" : " important"}`;
      // A rejection belongs to the tab the player was using when it happened.
      if (kind === "error") el.dataset.origin = active;
      el.textContent = text;
      append(el, "system", kind === "error" ? "everywhere" : kind === "important" ? "all" : "own");
    },
  };
}

import Phaser from "phaser";
import { api } from "./api";
import { hideAuth, showAuth, showCharacterCreate, showCharacterList } from "./auth-ui";
import { iconButton } from "./icons";
import { loading } from "./loading-ui";
import { vi } from "./locales/vi";
import { GameScene } from "./scene";
import { applyTheme } from "./theme";
import { DEFAULT_THEME } from "@game/shared";

// Colours come from data (a stored theme can replace this later), not from the stylesheet.
applyTheme(DEFAULT_THEME);

// `?renderer=canvas` forces the Canvas renderer for devices with broken or weak WebGL.
const forceCanvas = new URLSearchParams(location.search).get("renderer") === "canvas";

function startGame(isAdmin: boolean): void {
  new Phaser.Game({
    // Read by the scene when it starts; the server decides what admins may actually do.
    callbacks: { preBoot: (game) => game.registry.set("isAdmin", isAdmin) },
    type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
    parent: "game",
    backgroundColor: "#10141c",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [GameScene],
    input: { activePointers: 2 },
  });
}

/** Resolves the login state, walking the player through login and character creation when needed. */
async function boot(): Promise<void> {
  const hud = document.getElementById("hud")!;
  hud.textContent = vi.loading;
  let me = await api.me();
  if (!me.ok) {
    hud.hidden = true;
    await showAuth();
    me = await api.me();
  }
  // This login plays one character. Without a choice: a new account goes to the creation card, an account with characters to the list (pick, make another
  // while there is room, or delete one).
  while (me.ok && !me.data!.character) {
    hud.hidden = true;
    const { characters, maxCharacters } = me.data!;
    if (characters.length === 0) {
      await showCharacterCreate(false); // creating selects the new character for this login
    } else {
      const choice = await showCharacterList(characters, maxCharacters);
      if (choice.kind === "logout") {
        await api.logout();
        return location.reload();
      }
      if (choice.kind === "create") {
        if ((await showCharacterCreate(true)) === "back") continue;
      } else {
        const picked = await api.selectCharacter(choice.id);
        if (!picked.ok) continue; // refused (under review...): the list is read again
      }
    }
    me = await api.me();
  }
  hideAuth();
  hud.hidden = false;
  hud.textContent = vi.connecting;

  const logout = document.getElementById("logout") as HTMLButtonElement;
  iconButton(logout, "door", vi.logout);
  logout.hidden = false;
  const switchChar = document.getElementById("switch-char") as HTMLButtonElement;
  iconButton(switchChar, "swap", vi.switchCharacter);
  switchChar.hidden = false;
  switchChar.onclick = async () => {
    await api.deselectCharacter();
    location.reload(); // tears the game and both sockets down; the next boot shows the list
  };
  logout.onclick = async () => {
    await api.logout();
    location.reload();
  };
  // The last button of the top bar folds the HUD: only the wallet, this button and the mini map stay (the choice is kept in this browser).
  const toggle = document.getElementById("hud-toggle") as HTMLButtonElement;
  const folded = (): boolean => {
    try {
      return localStorage.getItem("hud-folded") === "1";
    } catch {
      return false;
    }
  };
  const setFolded = (on: boolean): void => {
    document.body.classList.toggle("hud-folded", on);
    iconButton(toggle, "menu", on ? vi.hudShow : vi.hudHide);
    try {
      localStorage.setItem("hud-folded", on ? "1" : "0");
    } catch {
      // storage blocked: the choice holds for this visit
    }
  };
  setFolded(folded());
  toggle.hidden = false;
  toggle.onclick = () => setFolded(!document.body.classList.contains("hud-folded"));
  loading.show(); // up until the game has what it needs to look right (the scene finishes it)
  startGame(me.ok && me.data!.account.role === "admin");
}

void boot();

// Some devices create a WebGL context but fail to build framebuffers; retry once with Canvas.
window.addEventListener("error", (ev) => {
  if (!forceCanvas && /Framebuffer status/.test(ev.message)) {
    location.search = "?renderer=canvas";
  }
});

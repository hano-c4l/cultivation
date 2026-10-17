import Phaser from "phaser";
import { api } from "./api";
import { hideAuth, showAuth, showCharacterCreate } from "./auth-ui";
import { vi } from "./locales/vi";
import { GameScene } from "./scene";

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
  if (me.ok && !me.data!.character) {
    hud.hidden = true;
    await showCharacterCreate();
  }
  hideAuth();
  hud.hidden = false;
  hud.textContent = vi.connecting;

  const logout = document.getElementById("logout") as HTMLButtonElement;
  logout.textContent = vi.logout;
  logout.hidden = false;
  logout.onclick = async () => {
    await api.logout();
    location.reload();
  };
  startGame(me.ok && me.data!.account.role === "admin");
}

void boot();

// Some devices create a WebGL context but fail to build framebuffers; retry once with Canvas.
window.addEventListener("error", (ev) => {
  if (!forceCanvas && /Framebuffer status/.test(ev.message)) {
    location.search = "?renderer=canvas";
  }
});

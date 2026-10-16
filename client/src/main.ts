import Phaser from "phaser";
import { GameScene } from "./scene";

// `?renderer=canvas` forces the Canvas renderer for devices with broken or weak WebGL.
const forceCanvas = new URLSearchParams(location.search).get("renderer") === "canvas";

new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  backgroundColor: "#10141c",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [GameScene],
  input: { activePointers: 2 },
});

// Some devices create a WebGL context but fail to build framebuffers; retry once with Canvas.
window.addEventListener("error", (ev) => {
  if (!forceCanvas && /Framebuffer status/.test(ev.message)) {
    location.search = "?renderer=canvas";
  }
});

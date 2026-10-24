import { resolve } from "node:path";
import { defineConfig } from "vite";

// In dev, run `npm run dev:server` (wrangler on :8787) and proxy the WebSocket to it.
// The admin app (admin/index.html) is a second entry; the Worker serves it for /admin/* after checking the session.
export default defineConfig({
  server: {
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true }, "/api": "http://localhost:8787" },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), admin: resolve(__dirname, "admin/index.html") } },
  },
});

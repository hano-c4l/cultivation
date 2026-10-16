import { defineConfig } from "vite";

// In dev, run `npm run dev:server` (wrangler on :8787) and proxy the WebSocket to it.
export default defineConfig({
  server: {
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true }, "/api": "http://localhost:8787" },
  },
  build: { chunkSizeWarningLimit: 2000 },
});

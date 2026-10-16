# Tu Tiên Giới (web game)

Monorepo: `shared/` (types, map, pathfinding, protocol), `server/` (Cloudflare Worker + `MapRoom` Durable Object + D1), `client/` (Vite + Phaser). Full plan: [docs/PLAN.md](docs/PLAN.md).

## Local development
```bash
npm install
npm run db:migrate:local
npm run preview        # builds the client and serves everything on http://localhost:8787
npm run smoke          # in another terminal: 2-client protocol smoke test
npm test && npm run typecheck
```
Open `http://localhost:8787/` in two tabs/devices to see each other. Add `?renderer=canvas` if WebGL is broken.

For hot reload, run `npm run dev:server` and `npm run dev:client` (Vite proxies `/ws` to wrangler).

## Deploy to Cloudflare (one Worker serves the client assets, API, WebSocket and Durable Objects)
```bash
npx wrangler login
npx wrangler d1 create cultivation-db      # copy the database_id into wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```

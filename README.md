# fieldnotes.tw · 最近左營

A local phenomena guide — what’s blooming, fruiting, in season, or happening right now. Not a tourist map of sights, but a living notebook of place.

Homepage prototype + TypeScript API.

## Run locally

```bash
# 1. Start Postgres (requires Docker)
npm run db:up

# 2. Install deps (frontend + API)
npm install
npm --prefix server install

# 3. Push schema + seed sample phenomena
cp server/.env.example server/.env   # if needed
npm run db:push
npm run db:seed      # or: npm run db:reseed

# 4. API (port 3001) and Vite (port 5173)
npm run dev:server   # terminal 1
npm run dev          # terminal 2
```

- Site: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- API health: [http://127.0.0.1:5173/api/health](http://127.0.0.1:5173/api/health) (proxied) or [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- Phenomena: `GET /api/phenomena`

## Structure

- `index.html` / `styles.css` / `app.js` — frontend
- `images/` — card photos
- `mockups/` — design references
- `server/` — Hono + Drizzle + Postgres API
- `docker-compose.yml` — local Postgres 16

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Liveness |
| GET | `/api/phenomena` | List (`?category=plant`, `?status=active` or `all`) |
| GET | `/api/phenomena/:id` | One row |
| POST | `/api/phenomena` | Create |
| PATCH | `/api/phenomena/:id` | Partial update |
| DELETE | `/api/phenomena/:id` | Delete |

Categories: `animal` · `plant` · `sky` · `taste` · `workshop`  
Statuses: `active` · `upcoming` · `ending` · `ended`

The homepage feed loads from `GET /api/phenomena`.

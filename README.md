# fieldnotes.tw · 最近左營

A local phenomena guide — what’s blooming, fruiting, in season, or happening right now. Not a tourist map of sights, but a living notebook of place.

Homepage prototype + TypeScript API.

## Run locally

```bash
# 1. Start Postgres (requires Docker)
npm run db:up

# 2. Install deps (frontend assets + API)
npm install
npm --prefix server install

# 3. Push schema + seed (admin always; demo cards only with SEED_DEMO=1)
cp server/.env.example server/.env   # includes SEED_DEMO=1 for local
npm run db:push
npm run db:seed      # or: npm run db:reseed

# 4. Start the app (Hono + Vite HMR on :3001)
npm run dev
```

- Site: [http://127.0.0.1:3001/](http://127.0.0.1:3001/)
- Clean routes: `/`, `/login`, `/register`, `/confirm`, `/admin`, `/submit`
- API health: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- Phenomena: `GET /api/phenomena`

Dev uses Vite middleware for live reload (JS/CSS HMR; templates and `/js/*` trigger a full refresh). Production builds hashed assets with `npm run build` and serves them from the API image.

Demo photos stay in [`public/images/`](public/images/) and are copied into `server/public/media/` only for local serving (`npm run seed:media-local`). They are **not** part of the production asset bundle; staging/prod media is S3. Production boots with an empty catalog (admin user only) unless you create real content in the admin UI.

## Structure

- `client/` — homepage JS/CSS (Vite entry)
- `public/` — source static files (locales, `/js/*`, seed images); synced into `server/public/` on dev/build
- `server/` — Hono + Eta pages + API; serves runtime files from `server/public/`
- `fonts/` — Kaiti subset (synced to `/fonts/*`)
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
| POST | `/api/auth/register` | Create normal user + session cookie |
| POST | `/api/auth/login` | Session cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user (`null` if logged out) |
| GET | `/api/admin/users` | Admin-only user list |

Categories: `animal` · `plant` · `sky` · `taste` · `workshop`  
Statuses: `active` · `upcoming` · `ending` · `ended`  
Roles: `user` · `admin`

The homepage feed loads from `GET /api/phenomena`. Auth uses an httpOnly cookie (`fn_session`).

Seed an admin (local): set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`, then `npm run db:seed`. Demo phenomena require `SEED_DEMO=1`. Admin UI: `/admin`. Registration requires email confirmation (`MAIL_MODE=log` prints the link locally).

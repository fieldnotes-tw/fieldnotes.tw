#!/bin/sh
set -eu

cd /app

# Named volumes for node_modules start empty; install when missing.
if [ ! -d node_modules/vite ]; then
  echo "[dev] installing root dependencies…"
  npm ci
fi
if [ ! -d server/node_modules/tsx ]; then
  echo "[dev] installing server dependencies…"
  npm --prefix server ci
fi

npm run static:sync
npm run seed:media-local

echo "[dev] migrating database…"
npm --prefix server run db:migrate

echo "[dev] seeding…"
npm --prefix server run db:seed

echo "[dev] starting Vite + Hono…"
exec npm run dev:server

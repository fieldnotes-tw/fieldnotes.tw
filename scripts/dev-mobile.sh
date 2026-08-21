#!/bin/sh
set -e

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
PORT=${PORT:-3003}
export PORT
export HOST=0.0.0.0

if [ -n "$IP" ]; then
  export CORS_ORIGINS="http://localhost:${PORT},http://127.0.0.1:${PORT},http://${IP}:${PORT}"
else
  export CORS_ORIGINS="http://localhost:${PORT},http://127.0.0.1:${PORT}"
fi

printf '\n  📱 Phone (same Wi‑Fi): http://%s:%s/\n' "${IP:-localhost}" "$PORT"
printf '  💻 This Mac:           http://127.0.0.1:%s/\n\n' "$PORT"

npm --prefix server run dev

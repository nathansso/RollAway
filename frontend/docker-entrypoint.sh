#!/bin/sh
# Writes /srv/config.json from container env vars at startup, then starts Caddy.
# Changing a backend URL on Railway = restart with new env — NO rebuild.
# Keys mirror frontend/src/lib/config.ts RUNTIME_KEYS; empty vars are omitted
# so the app falls back to its build-time env for that endpoint.
set -eu

CONFIG=/srv/config.json

json_field() {
  # $1 = key, $2 = value. URLs never contain quotes/backslashes; guard anyway.
  printf '  "%s": "%s"' "$1" "$(printf '%s' "$2" | sed 's/\\/\\\\/g; s/"/\\"/g')"
}

{
  printf '{\n'
  first=1
  for key in RECOMMEND_SPOTS_URL VENDORS_URL CLOSURES_URL PERMIT_CHECKLIST_URL MENU_EXTRACT_URL FORM_PDF_URL; do
    value=$(printenv "$key" 2>/dev/null || true)
    [ -n "$value" ] || continue
    [ "$first" = 1 ] || printf ',\n'
    json_field "$key" "$value"
    first=0
  done
  printf '\n}\n'
} > "$CONFIG"

echo "[entrypoint] wrote $CONFIG:"
cat "$CONFIG"

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

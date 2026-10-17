#!/usr/bin/env bash
#
# Assumes config (e.g., backend/.env) is already setup, starts docker compose.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info()  { printf '\033[34m==>\033[0m %s\n' "$*"; }
die()   { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker not found."
docker info >/dev/null 2>&1       || die "Docker is not running."
command -v curl >/dev/null 2>&1    || die "curl not found."

[[ -f backend/.env ]] || die "Missing backend/.env — follow the student setup guide first."

BACKEND_PORT="$(grep -E '^PORT=' backend/.env | head -1 | cut -d= -f2- | tr -d ' "' || true)"
ENABLE_HTTPS="$(grep -E '^ENABLE_HTTPS=' backend/.env | head -1 | cut -d= -f2- | tr -d ' "' | tr '[:upper:]' '[:lower:]' || true)"

# With ENABLE_HTTPS=true the backend only speaks HTTPS. Its self-signed
# certificate names the server's public IP, not localhost, so this local
# probe skips certificate verification (-k); it only reads /health.
if [[ "$ENABLE_HTTPS" == "true" ]]; then
  BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-https://localhost:${BACKEND_PORT:-3000}/health}"
  CURL_INSECURE="-k"
else
  BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://localhost:${BACKEND_PORT:-3000}/health}"
  CURL_INSECURE=""
fi

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

info "Starting backend (docker compose up --build -d)..."
docker compose up --build -d

info "Waiting for $BACKEND_HEALTH_URL ..."
for _ in $(seq 1 120); do
  curl -sf ${CURL_INSECURE:+"$CURL_INSECURE"} "$BACKEND_HEALTH_URL" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf ${CURL_INSECURE:+"$CURL_INSECURE"} "$BACKEND_HEALTH_URL" >/dev/null 2>&1 || die "Backend not healthy. Try: docker compose logs backend"

echo
info "Backend is up. Stop with: docker compose down"

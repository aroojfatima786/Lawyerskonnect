#!/usr/bin/env bash
# LawyersKonnect — one-command public deploy with free Cloudflare HTTPS URL (no domain needed)
set -euo pipefail

COMPOSE_FILE="docker-compose.public.yml"
ENV_FILE=".env.public"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

red() { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  red "Missing $ENV_FILE — run: cp .env.public.example $ENV_FILE && nano $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${JWT_SECRET:-}" || "${JWT_SECRET}" == "change-me-to-a-long-random-secret" ]]; then
  red "Set a strong JWT_SECRET in $ENV_FILE"
  exit 1
fi

needs_url_rebuild=0
if [[ -z "${PUBLIC_URL:-}" || "${PUBLIC_URL}" == *"YOUR-TUNNEL"* ]]; then
  yellow "PUBLIC_URL not set — starting stack to discover Cloudflare free URL..."
  needs_url_rebuild=1
  export PUBLIC_URL="http://127.0.0.1:${GATEWAY_PORT:-8080}"
fi

green "Building and starting LawyersKonnect (mongo + backend + frontend + gateway + tunnel)..."
"${COMPOSE[@]}" up -d --build

green "Waiting for backend health..."
for _ in $(seq 1 30); do
  if docker inspect lawyerskonnect-backend --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 5
done

yellow "Fetching free Cloudflare URL (30–90 seconds on first run)..."
TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL=$(docker logs lawyerskonnect-tunnel 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "$TUNNEL_URL" ]]; then
  red "Could not read tunnel URL. Check: docker logs lawyerskonnect-tunnel"
  exit 1
fi

green "Free HTTPS URL: $TUNNEL_URL"
green "Local gateway:  http://127.0.0.1:${GATEWAY_PORT:-8080}"

if [[ "$needs_url_rebuild" == 1 || "${PUBLIC_URL}" != "$TUNNEL_URL" ]]; then
  yellow "Updating $ENV_FILE with tunnel URL and rebuilding frontend..."
  if grep -q '^PUBLIC_URL=' "$ENV_FILE"; then
    sed -i.bak "s|^PUBLIC_URL=.*|PUBLIC_URL=$TUNNEL_URL|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    echo "PUBLIC_URL=$TUNNEL_URL" >> "$ENV_FILE"
  fi
  export PUBLIC_URL="$TUNNEL_URL"
  "${COMPOSE[@]}" up -d --build frontend backend
  green "Done. Open in Chrome: $TUNNEL_URL"
else
  green "App ready at: $TUNNEL_URL"
fi

green "Test API: curl -s $TUNNEL_URL/public/stats"
yellow "Note: trycloudflare.com URL may change if cloudflared container restarts — run ./deploy-public.sh again if link stops working."

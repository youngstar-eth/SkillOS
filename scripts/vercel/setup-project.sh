#!/usr/bin/env bash
# Link a single game as a Vercel project and set its environment variables.
#
# Usage:
#   scripts/vercel/setup-project.sh <game>
#
# Precondition:
#   - User has authenticated (`npx vercel login` or $VERCEL_TOKEN export).
#   - apps/2048/.env.local holds canonical shared secrets.
#
# What it does:
#   1. cd apps/<game>
#   2. `vercel link --yes` (creates new project "mas-<game>" if absent)
#   3. Push env vars (shared + per-app URL/domain) into production scope
#
# Idempotent: re-running re-applies env vars (overwrite). `vercel link` is a
# no-op if already linked.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$HERE/lib.sh"

game="${1:-}"
if [ -z "$game" ]; then
  echo "Usage: $0 <game>" >&2
  exit 2
fi

appdir="$ROOT/apps/$game"
[ -d "$appdir" ] || { echo "no such app: apps/$game" >&2; exit 2; }

require_vercel_auth

project="mas-$game"
cd "$appdir"

echo "[$game] linking project $project..."
vercel_cli link --yes --project "$project" >/dev/null

# Env vars. `vercel env add` reads stdin when non-interactive.
# `|| true` on add because re-adds error on "already exists" — we'll `rm` first for idempotency.
set_env() {
  local key="$1" value="$2"
  [ -z "$value" ] && { echo "  skip $key (empty)"; return; }
  # Remove first to avoid duplicate. Swallow "does not exist" errors.
  vercel_cli env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s\n' "$value" | vercel_cli env add "$key" production >/dev/null
  echo "  set $key"
}

echo "[$game] applying env vars..."

# Shared (same value across all 20)
set_env NEXT_PUBLIC_ARCADE_POOL_ADDRESS "$(env_val NEXT_PUBLIC_ARCADE_POOL_ADDRESS)"
set_env NEXT_PUBLIC_USDC_ADDRESS         "$(env_val NEXT_PUBLIC_USDC_ADDRESS)"
set_env NEXT_PUBLIC_CHAIN_ID             "$(env_val NEXT_PUBLIC_CHAIN_ID)"
set_env NEXT_PUBLIC_SUPABASE_URL         "$(env_val NEXT_PUBLIC_SUPABASE_URL)"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY    "$(env_val NEXT_PUBLIC_SUPABASE_ANON_KEY)"
set_env SUPABASE_SERVICE_ROLE_KEY        "$(env_val SUPABASE_SERVICE_ROLE_KEY)"
set_env SCORE_SIGNER_PRIVATE_KEY         "$(env_val SCORE_SIGNER_PRIVATE_KEY)"
set_env NEXT_PUBLIC_ONCHAINKIT_API_KEY   "$(env_val NEXT_PUBLIC_ONCHAINKIT_API_KEY)"
set_env NEXT_PUBLIC_MINIKIT_PROJECT_ID   "$(env_val NEXT_PUBLIC_MINIKIT_PROJECT_ID)"

# Per-app
set_env NEXT_PUBLIC_URL    "https://mas-$game.vercel.app"
set_env QUICK_AUTH_DOMAIN  "mas-$game.vercel.app"

echo "[$game] ready for deploy."

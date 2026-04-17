#!/usr/bin/env bash
# Link a single game as a Vercel project, set rootDirectory, push env vars.
#
# Usage:
#   scripts/vercel/setup-project.sh <game>
#
# After running, the project is ready to be deployed from monorepo root
# using VERCEL_PROJECT_ID env var.

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

# 1) Link (creates project if absent; idempotent).
echo "[$game] linking project $project under scope $VERCEL_SCOPE..."
vercel_cli link --yes --project "$project" >/dev/null

# 2) Patch rootDirectory so deploys-from-root resolve npm workspaces correctly.
echo "[$game] setting rootDirectory to apps/$game..."
patch_root_directory "$game"

# 3) Env vars.
set_env() {
  local key="$1" value="$2"
  [ -z "$value" ] && { echo "  skip $key (empty)"; return; }
  vercel_cli env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s\n' "$value" | vercel_cli env add "$key" production >/dev/null
  echo "  set $key"
}

echo "[$game] applying env vars..."

set_env NEXT_PUBLIC_ARCADE_POOL_ADDRESS "$(env_val NEXT_PUBLIC_ARCADE_POOL_ADDRESS)"
set_env NEXT_PUBLIC_USDC_ADDRESS         "$(env_val NEXT_PUBLIC_USDC_ADDRESS)"
set_env NEXT_PUBLIC_CHAIN_ID             "$(env_val NEXT_PUBLIC_CHAIN_ID)"
set_env NEXT_PUBLIC_SUPABASE_URL         "$(env_val NEXT_PUBLIC_SUPABASE_URL)"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY    "$(env_val NEXT_PUBLIC_SUPABASE_ANON_KEY)"
set_env SUPABASE_SERVICE_ROLE_KEY        "$(env_val SUPABASE_SERVICE_ROLE_KEY)"
set_env SCORE_SIGNER_PRIVATE_KEY         "$(env_val SCORE_SIGNER_PRIVATE_KEY)"
set_env NEXT_PUBLIC_ONCHAINKIT_API_KEY   "$(env_val NEXT_PUBLIC_ONCHAINKIT_API_KEY)"
set_env NEXT_PUBLIC_MINIKIT_PROJECT_ID   "$(env_val NEXT_PUBLIC_MINIKIT_PROJECT_ID)"
set_env NEXT_PUBLIC_URL                  "https://mas-$game.vercel.app"
set_env QUICK_AUTH_DOMAIN                "mas-$game.vercel.app"

echo "[$game] ready for deploy."

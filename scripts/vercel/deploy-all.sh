#!/usr/bin/env bash
# Orchestrate the full deploy of all 20 MAS games to Vercel.
#
# Usage:
#   scripts/vercel/deploy-all.sh [--setup-only] [--deploy-only] [<game>...]
#
#   --setup-only   Run vercel link + env vars (skip prod deploy).
#   --deploy-only  Skip setup; only run `vercel --prod`.
#   <game>...      Restrict to a subset.
#
# Default: setup + deploy for all 20.
#
# Deploys are run in parallel (4 concurrent). Logs per-game in /tmp/deploy-<game>.log.
# Final URL extracted from vercel CLI output.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$HERE/lib.sh"

SETUP_ONLY=0
DEPLOY_ONLY=0
subset=()

for arg in "$@"; do
  case "$arg" in
    --setup-only)  SETUP_ONLY=1 ;;
    --deploy-only) DEPLOY_ONLY=1 ;;
    --*)           echo "unknown flag: $arg" >&2; exit 2 ;;
    *)             subset+=("$arg") ;;
  esac
done

if [ ${#subset[@]} -eq 0 ]; then
  GAMES_TO_RUN=("${GAMES[@]}")
else
  GAMES_TO_RUN=("${subset[@]}")
fi

require_vercel_auth

# ─── Setup phase (sequential; vercel link prompts) ──────────────────────────
if [ $DEPLOY_ONLY -eq 0 ]; then
  echo "=== SETUP PHASE (${#GAMES_TO_RUN[@]} projects) ==="
  for game in "${GAMES_TO_RUN[@]}"; do
    "$HERE/setup-project.sh" "$game" 2>&1 | sed "s/^/  /"
  done
fi

if [ $SETUP_ONLY -eq 1 ]; then
  echo "Setup complete. Run again with --deploy-only (or no flag) to ship."
  exit 0
fi

# ─── Deploy phase (4 concurrent) ────────────────────────────────────────────
echo ""
echo "=== DEPLOY PHASE (${#GAMES_TO_RUN[@]} deploys, 4 concurrent) ==="

deploy_one() {
  local game="$1"
  local log="/tmp/deploy-$game.log"
  cd "$ROOT/apps/$game"
  if vercel_cli --prod --yes > "$log" 2>&1; then
    local url
    url=$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' "$log" | tail -1)
    printf "%s ✓ %s\n" "$game" "$url"
  else
    printf "%s ✗ see %s\n" "$game" "$log"
  fi
}

export -f deploy_one
export ROOT

pids=()
for game in "${GAMES_TO_RUN[@]}"; do
  deploy_one "$game" &
  pids+=($!)
  # Throttle to 4 concurrent
  if [ "${#pids[@]}" -ge 4 ]; then
    wait "${pids[0]}"
    pids=("${pids[@]:1}")
  fi
done
wait

echo ""
echo "=== RESULTS ==="
for game in "${GAMES_TO_RUN[@]}"; do
  log="/tmp/deploy-$game.log"
  url=$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' "$log" 2>/dev/null | tail -1)
  if [ -n "$url" ]; then
    printf "  %-12s %s\n" "$game" "$url"
  else
    printf "  %-12s FAILED (%s)\n" "$game" "$log"
  fi
done

#!/usr/bin/env bash
# Orchestrate setup + parallel deploy of all 20 MAS games to Vercel.
#
# Usage:
#   scripts/vercel/deploy-all.sh [--setup-only] [--deploy-only] [<game>...]
#
#   --setup-only   Run link + rootDirectory patch + env vars (skip deploy).
#   --deploy-only  Skip setup; only run `vercel --prod` from monorepo root.
#   <game>...      Restrict to a subset.
#
# Why deploy-from-root:
#   Vercel CLI uploads only the cwd. We need the whole monorepo uploaded so
#   npm can resolve @mas/shared (a workspace link, not a published package).
#   Each project's rootDirectory is set to apps/<game> via API; Vercel uses
#   that for framework detection and build output.

set -uo pipefail

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

# ─── Setup phase (sequential; `vercel link` + env add are per-project) ──────
if [ $DEPLOY_ONLY -eq 0 ]; then
  echo "=== SETUP PHASE (${#GAMES_TO_RUN[@]} projects) ==="
  for game in "${GAMES_TO_RUN[@]}"; do
    if ! "$HERE/setup-project.sh" "$game" 2>&1 | sed "s/^/  /"; then
      echo "  [$game] SETUP FAILED — continuing with others"
    fi
  done
fi

if [ $SETUP_ONLY -eq 1 ]; then
  echo ""
  echo "Setup complete. Re-run with --deploy-only to ship."
  exit 0
fi

# ─── Deploy phase (4 concurrent, from MAS root, using VERCEL_PROJECT_ID) ────
echo ""
echo "=== DEPLOY PHASE (${#GAMES_TO_RUN[@]} deploys, 4 concurrent) ==="

deploy_one() {
  local game="$1"
  local log="/tmp/deploy-$game.log"
  local project_id org_id
  project_id="$(project_field "$game" projectId)"
  org_id="$(project_field "$game" orgId)"
  if [ -z "$project_id" ] || [ -z "$org_id" ]; then
    printf "%s ✗ not linked yet (run setup first)\n" "$game"
    return 1
  fi
  (
    cd "$ROOT"
    VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$org_id" \
      /opt/homebrew/bin/npx vercel@latest --scope "$VERCEL_SCOPE" --prod --yes > "$log" 2>&1
  )
  local rc=$?
  if [ $rc -eq 0 ]; then
    local url
    url=$(grep -oE 'https://mas-[a-z0-9.-]+\.vercel\.app' "$log" | grep -v "simpl3s-projects" | head -1)
    [ -z "$url" ] && url=$(grep -oE 'Production:[[:space:]]*https://[a-z0-9.-]+\.vercel\.app' "$log" | awk '{print $NF}' | head -1)
    printf "%s ✓ %s\n" "$game" "$url"
  else
    printf "%s ✗ see %s (rc=%d)\n" "$game" "$log" "$rc"
    tail -5 "$log" | sed 's/^/    /'
  fi
  return $rc
}

export -f deploy_one project_field
export ROOT VERCEL_SCOPE

# Throttle to 4 concurrent
pids=()
for game in "${GAMES_TO_RUN[@]}"; do
  deploy_one "$game" &
  pids+=($!)
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
  alias_url="https://mas-$game.vercel.app"
  if grep -q "Deployment.*ready" "$log" 2>/dev/null || grep -q "Aliased:" "$log" 2>/dev/null; then
    printf "  %-12s %s\n" "$game" "$alias_url"
  else
    printf "  %-12s FAILED (%s)\n" "$game" "$log"
  fi
done

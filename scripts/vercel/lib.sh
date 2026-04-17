#!/usr/bin/env bash
# Shared helpers for the MAS Vercel deploy scripts.

export PATH="/opt/homebrew/bin:$PATH"

GAMES=(
  2048 wordle snake minesweeper sudoku pong clicker breakout bubble solitaire
  match3 flappy crossy helix geometry jetpack stickman tower pool hillclimb
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Run the vercel CLI via npx (no global install needed). Caller may override
# with VERCEL_BIN=/path/to/vercel to use a global install.
vercel_cli() {
  if [ -n "${VERCEL_BIN:-}" ]; then
    "$VERCEL_BIN" "$@"
  else
    /opt/homebrew/bin/npx vercel@latest "$@"
  fi
}

# Check that the user is authenticated. Exits non-zero with a hint if not.
require_vercel_auth() {
  local whoami
  whoami="$(vercel_cli whoami 2>/dev/null)" || true
  if [ -z "$whoami" ]; then
    echo "ERROR: not logged in to Vercel." >&2
    echo "Run one of:" >&2
    echo "  npx vercel@latest login         # browser OAuth" >&2
    echo "  export VERCEL_TOKEN=xxx         # token from vercel.com/account/tokens" >&2
    return 1
  fi
  echo "Vercel user: $whoami"
  return 0
}

# Extract a var value from the canonical shared env file.
# Usage: env_val KEY → prints value (empty if missing)
env_val() {
  local key="$1"
  local file="$ROOT/apps/2048/.env.local"
  [ -f "$file" ] || { echo ""; return; }
  awk -F'=' -v k="$key" '
    $1 == k { sub(/^[^=]*=/, ""); print; exit }
  ' "$file"
}

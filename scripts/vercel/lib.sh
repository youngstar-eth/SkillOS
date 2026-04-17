#!/usr/bin/env bash
# Shared helpers for the MAS Vercel deploy scripts.

export PATH="/opt/homebrew/bin:$PATH"

# Vercel team scope. Personal scope is not allowed on this Vercel account,
# so all 20 projects live under simpl3s-projects.
VERCEL_SCOPE="${VERCEL_SCOPE:-simpl3s-projects}"

# Team UUID (needed for REST API calls). Extracted from first linked project.
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_XyslOCNkXkP8tnjcTRs3yKSC}"

# Local Vercel auth token, read from the CLI's auth state. Used for API calls
# (vercel CLI doesn't expose a project-settings-update command).
VERCEL_AUTH_TOKEN=""
_load_auth_token() {
  [ -n "$VERCEL_AUTH_TOKEN" ] && return 0
  local auth_file="$HOME/Library/Application Support/com.vercel.cli/auth.json"
  [ -f "$auth_file" ] || return 1
  VERCEL_AUTH_TOKEN=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['token'])" "$auth_file")
  export VERCEL_AUTH_TOKEN
}

GAMES=(
  2048 wordle snake minesweeper sudoku pong clicker breakout bubble solitaire
  match3 flappy crossy helix geometry jetpack stickman tower pool hillclimb
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Run the vercel CLI via npx (no global install needed). Caller may override
# with VERCEL_BIN=/path/to/vercel to use a global install.
vercel_cli() {
  if [ -n "${VERCEL_BIN:-}" ]; then
    "$VERCEL_BIN" --scope "$VERCEL_SCOPE" "$@"
  else
    /opt/homebrew/bin/npx vercel@latest --scope "$VERCEL_SCOPE" "$@"
  fi
}

# Check that the user is authenticated. Exits non-zero with a hint if not.
require_vercel_auth() {
  local whoami
  whoami="$(vercel_cli whoami 2>/dev/null)" || true
  if [ -z "$whoami" ]; then
    echo "ERROR: not logged in to Vercel." >&2
    echo "Run: npx vercel@latest login" >&2
    return 1
  fi
  echo "Vercel user: $whoami"
  _load_auth_token
  return 0
}

# Extract a var value from the canonical shared env file.
env_val() {
  local key="$1"
  local file="$ROOT/apps/2048/.env.local"
  [ -f "$file" ] || { echo ""; return; }
  awk -F'=' -v k="$key" '
    $1 == k { sub(/^[^=]*=/, ""); print; exit }
  ' "$file"
}

# Read project.json field for a given app. Returns "" if not linked yet.
# Usage: project_field <game> <key>
project_field() {
  local game="$1" key="$2"
  local pj="$ROOT/apps/$game/.vercel/project.json"
  [ -f "$pj" ] || { echo ""; return; }
  python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2],''))" "$pj" "$key"
}

# PATCH a project's rootDirectory to apps/<game> via REST API.
# Required because Vercel CLI doesn't expose a "project settings update" cmd.
patch_root_directory() {
  local game="$1"
  local project_id
  project_id="$(project_field "$game" projectId)"
  [ -n "$project_id" ] || { echo "  ERROR no projectId for $game" >&2; return 1; }
  _load_auth_token
  python3 <<PY
import json, urllib.request, urllib.error, sys
url = 'https://api.vercel.com/v9/projects/${project_id}?teamId=${VERCEL_TEAM_ID}'
body = json.dumps({'rootDirectory': 'apps/${game}'}).encode()
req = urllib.request.Request(url, data=body, method='PATCH', headers={
    'Authorization': 'Bearer ${VERCEL_AUTH_TOKEN}',
    'Content-Type': 'application/json',
})
try:
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
        print(f"  rootDirectory={d.get('rootDirectory')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
    sys.exit(1)
PY
}

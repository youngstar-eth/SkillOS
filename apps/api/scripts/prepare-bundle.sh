#!/usr/bin/env bash
# prepare-bundle.sh — Build a Vercel-deployable function bundle for apps/api.
#
# Codifies the X1 + X2 deploy workflow:
#   1. vercel build --prod (produces .vercel/output)
#   2. Manually merge npm-workspace-hoisted deps from monorepo node_modules
#      into the function's local node_modules. NFT misses these because
#      they're hoisted by npm, not directly under apps/api/node_modules.
#   3. Strip the filePathMap from .vc-config.json. NFT writes
#      `../../node_modules/...` paths Vercel can't resolve at deploy time.
#
# After running this script, deploy with:
#   vercel deploy --prebuilt --prod --archive=tgz
#
# See reference_vercel_monorepo_hono_playbook memory item for full context.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
MONOREPO_ROOT="$( cd "$APP_ROOT/../.." && pwd )"
FUNC_DIR="$APP_ROOT/.vercel/output/functions/api/index.func"

cd "$APP_ROOT"

echo "→ vercel build --prod"
rm -rf .vercel/output
vercel build --prod

echo "→ enumerating prod dep tree via npm ls --omit=dev --all"

# Use npm's resolution algorithm to discover the exact prod-only deps reachable
# from apps/api at runtime. This avoids manual cherry-picking (which kept
# missing transitive deps one at a time across X1+X2 iterations).
#
# Filter: keep only top-level paths under monorepo root's node_modules, i.e.,
# paths with exactly one '/node_modules/' segment. Nested deps (e.g.,
# viem/node_modules/@noble/curves) come along automatically with cp -R of
# their parent package.

DEP_PATHS=$(cd "$APP_ROOT" && npm ls --omit=dev --all --parseable 2>/dev/null \
  | awk -v root="$MONOREPO_ROOT" -v app="$APP_ROOT" '
      {
        # Keep paths at exactly one /node_modules/ depth, anchored at either
        # the monorepo root OR apps/api itself (which has its own
        # node_modules for version-specific deps not hoisted to root —
        # e.g., apps/api has zod@4 while root has zod@3 from a sibling app).
        n = split($0, parts, "/node_modules/")
        if (n == 2 && (parts[1] == root || parts[1] == app)) print $0
      }
    ')

if [ -z "$DEP_PATHS" ]; then
  echo "ERROR: npm ls returned no prod deps — verify package.json is healthy" >&2
  exit 1
fi

echo "→ copying $(echo "$DEP_PATHS" | wc -l | tr -d ' ') prod packages to function bundle"
cd "$FUNC_DIR/node_modules"

# Pre-create scope dirs.
mkdir -p @adraffy @asteasolutions @hono @noble @scure @spruceid @stablelib @supabase

# Copy in two passes: monorepo-root first (broad set), then apps/api-local
# second (specific overrides). app-local copies rm-then-cp so version-pinned
# deps actually replace the hoisted ones rather than merging.
copy_pass() {
  local prefix="$1"
  while IFS= read -r dep_path; do
    [ -z "$dep_path" ] && continue
    case "$dep_path" in
      "$prefix"/*) ;;
      *) continue ;;
    esac
    local rel="${dep_path#$prefix/node_modules/}"
    local parent_rel
    parent_rel="$(dirname "$rel")"
    if [ "$parent_rel" = "." ]; then
      [ "$prefix" = "$APP_ROOT" ] && rm -rf "./$rel"
      cp -RL "$dep_path" ./
    else
      mkdir -p "./$parent_rel"
      [ "$prefix" = "$APP_ROOT" ] && rm -rf "./$rel"
      cp -RL "$dep_path" "./$parent_rel/"
    fi
  done <<< "$DEP_PATHS"
}

copy_pass "$MONOREPO_ROOT"
copy_pass "$APP_ROOT"

echo "→ stripping NFT filePathMap (parent-relative paths Vercel can't resolve)"
node -e "
  const fs = require('fs');
  const p = '$FUNC_DIR/.vc-config.json';
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete c.filePathMap;
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
"

echo "→ verifying critical prod deps landed in bundle"
# Sparse bundles silently deploy then fail at Vercel's deploy-time file
# validation with ENOENT on the first missing path in filePathMap.
REQUIRED_DEPS=(hono viem ethers siwe jose @adraffy/ens-normalize @supabase/supabase-js)
MISSING_DEPS=()
for dep in "${REQUIRED_DEPS[@]}"; do
  if [ ! -d "$FUNC_DIR/node_modules/$dep" ]; then
    MISSING_DEPS+=("$dep")
  fi
done
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
  echo "ERROR: function bundle missing critical deps: ${MISSING_DEPS[*]}" >&2
  echo "  Check 'npm ls --omit=dev --all --parseable' output from \$APP_ROOT" >&2
  echo "  and the awk filter at the top of this script." >&2
  exit 1
fi
echo "✓ all ${#REQUIRED_DEPS[@]} critical deps verified"

echo "✓ Bundle ready at $FUNC_DIR"
echo "  Size: $(du -sh "$FUNC_DIR" | cut -f1)"
echo
echo "Next: vercel deploy --prebuilt --prod --archive=tgz"

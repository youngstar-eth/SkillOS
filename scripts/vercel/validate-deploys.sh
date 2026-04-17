#!/usr/bin/env bash
# Verify all 20 production deploys are live and properly configured.
#
# For each mas-<game>.vercel.app, checks:
#   - GET /                          → 200
#   - GET /.well-known/farcaster.json → 200 + valid JSON
#   - JSON contains miniapp.name, miniapp.iconUrl (required, Base App spec)
#   - JSON contains accountAssociation (optional; warns if missing — manual sign)
#   - JSON contains baseBuilder.allowedAddresses[0] (optional; warns if empty)
#   - GET / HTML contains fc:miniapp meta tag
#
# Usage:
#   scripts/vercel/validate-deploys.sh [<game>...]
#
# Exits non-zero if any required check fails. accountAssociation is
# advisory because users sign that manually after deploy (see Faz 4).

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$HERE/lib.sh"

subset=("$@")
if [ ${#subset[@]} -eq 0 ]; then
  TO_CHECK=("${GAMES[@]}")
else
  TO_CHECK=("${subset[@]}")
fi

fail=0
warn=0

printf "%-12s %-6s %-9s %-7s %-5s %-5s %s\n" "game" "page" "manifest" "miniapp" "embed" "assoc" "builder"

for game in "${TO_CHECK[@]}"; do
  base="https://mas-$game.vercel.app"
  page_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/" -m 15)
  manifest_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/.well-known/farcaster.json" -m 15)
  manifest_json=$(curl -s "$base/.well-known/farcaster.json" -m 15)
  page_html=$(curl -s "$base/" -m 15)

  miniapp=✗
  embed=✗
  assoc=✗
  builder=✗

  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); m=d.get("miniapp") or d.get("frame"); sys.exit(0 if isinstance(m,dict) and m.get("name") and m.get("iconUrl") else 1)' 2>/dev/null; then
    miniapp=✓
  fi
  if echo "$page_html" | grep -q 'fc:miniapp'; then
    embed=✓
  fi
  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d.get("accountAssociation"),dict) else 1)' 2>/dev/null; then
    assoc=✓
  fi
  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); a=d.get("baseBuilder",{}).get("allowedAddresses",[]); sys.exit(0 if a else 1)' 2>/dev/null; then
    builder=✓
  fi

  printf "%-12s %-6s %-9s %-7s %-5s %-5s %s\n" "$game" "$page_code" "$manifest_code" "$miniapp" "$embed" "$assoc" "$builder"

  if [ "$page_code" != "200" ] || [ "$manifest_code" != "200" ] || [ "$miniapp" != "✓" ] || [ "$embed" != "✓" ]; then
    fail=$((fail+1))
  fi
  if [ "$assoc" != "✓" ] || [ "$builder" != "✓" ]; then
    warn=$((warn+1))
  fi
done

echo ""
echo "Fails: $fail (required checks)"
echo "Warns: $warn (accountAssociation / baseBuilder — manual sign step)"
exit $fail

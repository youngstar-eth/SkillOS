#!/usr/bin/env bash
# Verify all 20 production deploys are live and properly configured.
#
# For each mas-<game>.vercel.app, checks:
#   - GET /                          → 200
#   - GET /.well-known/farcaster.json → 200 + valid JSON
#   - JSON contains frame.name, frame.iconUrl (required)
#   - JSON contains accountAssociation (optional; warns if missing)
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

printf "%-12s %-6s %-9s %-5s %-5s %s\n" "game" "page" "manifest" "frame" "embed" "assoc"

for game in "${TO_CHECK[@]}"; do
  base="https://mas-$game.vercel.app"
  page_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/" -m 15)
  manifest_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/.well-known/farcaster.json" -m 15)
  manifest_json=$(curl -s "$base/.well-known/farcaster.json" -m 15)
  page_html=$(curl -s "$base/" -m 15)

  frame=✗
  embed=✗
  assoc=✗

  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d.get("frame"),dict) and d["frame"].get("name") and d["frame"].get("iconUrl") else 1)' 2>/dev/null; then
    frame=✓
  fi
  if echo "$page_html" | grep -q 'fc:miniapp'; then
    embed=✓
  fi
  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d.get("accountAssociation"),dict) else 1)' 2>/dev/null; then
    assoc=✓
  fi

  printf "%-12s %-6s %-9s %-5s %-5s %s\n" "$game" "$page_code" "$manifest_code" "$frame" "$embed" "$assoc"

  if [ "$page_code" != "200" ] || [ "$manifest_code" != "200" ] || [ "$frame" != "✓" ] || [ "$embed" != "✓" ]; then
    fail=$((fail+1))
  fi
  if [ "$assoc" != "✓" ]; then
    warn=$((warn+1))
  fi
done

echo ""
echo "Fails: $fail (required checks)"
echo "Warns: $warn (accountAssociation — manual sign step)"
exit $fail

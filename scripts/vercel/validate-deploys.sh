#!/usr/bin/env bash
# Verify all 20 production deploys are live and properly configured.
#
# For each <game>.skillbase.games, checks:
#   - GET /                          → 200
#   - GET /.well-known/farcaster.json → 200 + valid JSON
#   - JSON miniapp.name, miniapp.iconUrl (required, Base App spec)
#   - JSON miniapp.canonicalDomain == <game>.skillbase.games
#   - JSON miniapp.homeUrl contains <game>.skillbase.games
#   - JSON accountAssociation (optional; warns if missing — manual sign)
#   - JSON baseBuilder.allowedAddresses[0] 0x-prefixed (optional)
#   - GET / HTML contains fc:miniapp meta tag
#   - GET /icon.png → 200 (brand asset check)
#
# Usage:
#   scripts/vercel/validate-deploys.sh [<game>...]
#
# Exits non-zero if any required check fails. accountAssociation is
# advisory because users sign that manually after deploy (see AA guide).

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

printf "%-12s %-5s %-9s %-7s %-5s %-5s %-5s %-5s %s\n" "game" "page" "manifest" "miniapp" "canon" "embed" "icon" "assoc" "builder"

for game in "${TO_CHECK[@]}"; do
  domain="$game.skillbase.games"
  base="https://$domain"
  page_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/" -m 15)
  manifest_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/.well-known/farcaster.json" -m 15)
  manifest_json=$(curl -s "$base/.well-known/farcaster.json" -m 15)
  page_html=$(curl -s "$base/" -m 15)
  icon_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/icon.png" -m 15)

  miniapp=✗
  canon=✗
  embed=✗
  assoc=✗
  builder=✗
  icon=✗

  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); m=d.get("miniapp") or d.get("frame"); sys.exit(0 if isinstance(m,dict) and m.get("name") and m.get("iconUrl") else 1)' 2>/dev/null; then
    miniapp=✓
  fi
  if echo "$manifest_json" | DOMAIN="$domain" python3 -c '
import os, sys, json
d = json.load(sys.stdin)
m = d.get("miniapp") or d.get("frame") or {}
dom = os.environ["DOMAIN"]
ok = m.get("canonicalDomain") == dom and dom in (m.get("homeUrl") or "")
sys.exit(0 if ok else 1)' 2>/dev/null; then
    canon=✓
  fi
  if echo "$page_html" | grep -q 'fc:miniapp'; then
    embed=✓
  fi
  if echo "$manifest_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); a=d.get("accountAssociation"); sys.exit(0 if isinstance(a,dict) and a.get("header") and a.get("payload") and a.get("signature") else 1)' 2>/dev/null; then
    assoc=✓
  fi
  if echo "$manifest_json" | python3 -c 'import sys,json,re; d=json.load(sys.stdin); a=d.get("baseBuilder",{}).get("allowedAddresses",[]); sys.exit(0 if a and re.match(r"^0x[0-9a-fA-F]{40}$", a[0]) else 1)' 2>/dev/null; then
    builder=✓
  fi
  [ "$icon_code" = "200" ] && icon=✓

  printf "%-12s %-5s %-9s %-7s %-5s %-5s %-5s %-5s %s\n" "$game" "$page_code" "$manifest_code" "$miniapp" "$canon" "$embed" "$icon" "$assoc" "$builder"

  if [ "$page_code" != "200" ] || [ "$manifest_code" != "200" ] || [ "$miniapp" != "✓" ] || [ "$canon" != "✓" ] || [ "$embed" != "✓" ] || [ "$icon" != "✓" ]; then
    fail=$((fail+1))
  fi
  if [ "$assoc" != "✓" ] || [ "$builder" != "✓" ]; then
    warn=$((warn+1))
  fi
done

echo ""
echo "Fails: $fail (required: page/manifest/miniapp/canonicalDomain/embed/icon)"
echo "Warns: $warn (accountAssociation / baseBuilder — manual sign step)"
exit $fail

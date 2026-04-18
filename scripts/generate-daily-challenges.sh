#!/usr/bin/env bash
# Generate today's AI-curated daily challenge for each pilot game.
#
# Usage:
#   CRON_SECRET=... scripts/generate-daily-challenges.sh
#   # or, if the secret is cached:
#   source /tmp/skillbase-secrets.txt && scripts/generate-daily-challenges.sh
#
# Each game's /api/daily/generate calls Claude (Sonnet 4.6) server-side and
# upserts a row keyed on (game_slug, challenge_date). Safe to re-run multiple
# times per day — later calls overwrite earlier ones.
#
# Add new pilots to GAMES once their /api/daily/generate endpoint is wired.

set -euo pipefail

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET not set." >&2
  echo "  source /tmp/skillbase-secrets.txt && $0" >&2
  exit 2
fi

GAMES=(wordle 2048 hillclimb)

for game in "${GAMES[@]}"; do
  printf "=== %-12s === " "$game"
  payload=$(printf '{"gameSlug":"%s"}' "$game")
  resp=$(curl -fsS -X POST "https://${game}.skillbase.games/api/daily/generate" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      printf "FAIL\n"
      echo "$resp" | head -3 | sed 's/^/    /'
      continue
    }
  theme=$(printf '%s' "$resp" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('challenge', {}).get('theme', '(?)'))
" 2>/dev/null || echo "(?)")
  printf "OK · %s\n" "$theme"
done

echo ""
echo "Done. Verify via:"
for game in "${GAMES[@]}"; do
  echo "  curl https://${game}.skillbase.games/api/daily?game=${game}"
done

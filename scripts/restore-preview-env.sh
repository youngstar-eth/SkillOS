#!/bin/bash
# Restore preview env vars from prod for wordle, 2048, hillclimb.
#
# Strategy:
#   - Pull prod env for each app into a temp file.
#   - Use Python to parse multi-line quoted values correctly (handles JWTs,
#     PEM keys, values with embedded quotes/newlines).
#   - rstrip() trailing whitespace/newlines from each value (fix data bug
#     where prod values have accidental trailing \n).
#   - Emit null-delimited KEY\0VALUE\0 pairs to avoid ANY shell quoting issues.
#   - For each pair: vercel env rm KEY preview (silent) then
#     printf '%s' "$value" | vercel env add KEY preview  (value via stdin).
#   - Skip Vercel system-managed vars (VERCEL_*, NX_DAEMON, TURBO_*, CI, NODE_ENV).
#   - PROD IS NEVER MODIFIED — read-only on production scope.
#
# Validation (after all apps processed):
#   - Pull preview for each app.
#   - Report byte-lengths for SUPABASE_SERVICE_ROLE_KEY, STUDIO_PRIVATE_KEY,
#     NEXT_PUBLIC_SUPABASE_URL — must be non-trivial (not KEY=""\n = ~20 bytes).

set -eu
export PATH="/opt/homebrew/bin:/usr/bin:/bin"

PARSE_PY=$(cat <<'PYEOF'
import sys, re
path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()
lines = content.splitlines(keepends=False)
results = {}
i = 0
while i < len(lines):
    line = lines[i]
    if not line or line.startswith('#'):
        i += 1; continue
    m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line)
    if not m:
        i += 1; continue
    key = m.group(1)
    rest = m.group(2)
    if rest.startswith('"'):
        if len(rest) > 1 and rest.endswith('"') and not rest.endswith('\\"'):
            val = rest[1:-1]
            i += 1
        else:
            # Multi-line quoted — accumulate until closing "
            val = rest[1:]
            i += 1
            while i < len(lines):
                if lines[i].endswith('"') and not lines[i].endswith('\\"'):
                    val += '\n' + lines[i][:-1]
                    i += 1
                    break
                else:
                    val += '\n' + lines[i]
                    i += 1
    else:
        val = rest
        i += 1
    # Strip trailing whitespace/newlines (data-hygiene fix for preview only)
    val = val.rstrip('\n').rstrip()
    results[key] = val

SKIP_EXACT = {
    'VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_OIDC_TOKEN', 'VERCEL_URL',
    'NX_DAEMON', 'TURBO_CACHE', 'TURBO_DOWNLOAD_LOCAL_ENABLED', 'TURBO_REMOTE_ONLY',
    'TURBO_RUN_SUMMARY', 'CI', 'NODE_ENV',
}

out = sys.stdout.buffer
for k, v in results.items():
    if k in SKIP_EXACT or k.startswith('VERCEL_GIT_'):
        continue
    out.write(k.encode() + b'\0' + v.encode() + b'\0')
PYEOF
)

restore_preview() {
  local app="$1"
  cd "/Users/inancayvaz/MAS/apps/$app"
  local tmp="/tmp/.env.prod-$app.$$"
  local pairs="/tmp/.pairs-$app.$$"

  echo "[$app] Pulling prod env..."
  /opt/homebrew/bin/npx --yes vercel@48 env pull "$tmp" --environment=production --yes < /dev/null > /dev/null 2>&1
  /bin/chmod 600 "$tmp"
  if [ ! -s "$tmp" ]; then
    echo "[$app] pull failed"
    return 1
  fi

  /usr/bin/python3 -c "$PARSE_PY" "$tmp" > "$pairs"

  local copied=0 failed=0 key value
  while IFS= read -r -d '' key && IFS= read -r -d '' value; do
    /opt/homebrew/bin/npx --yes vercel@48 env rm "$key" preview --yes < /dev/null > /dev/null 2>&1 || true
    # Pinned vercel@48: --value flag did not yet exist; value is read from stdin.
    # printf '%s' avoids appending a trailing newline that 'echo' would add.
    local add_out="/tmp/.addout-$app-$$.log"
    if /usr/bin/printf '%s' "$value" | /opt/homebrew/bin/npx --yes vercel@48 env add "$key" preview > "$add_out" 2>&1; then
      # Confirm success marker in CLI output
      if /usr/bin/grep -q 'Added Environment Variable' "$add_out" 2>/dev/null; then
        copied=$((copied+1))
      else
        failed=$((failed+1))
        echo "    fail: $key (no success marker)"
      fi
    else
      failed=$((failed+1))
      echo "    fail: $key (exit!=0)"
    fi
    /bin/rm -f "$add_out"
  done < "$pairs"

  /usr/bin/shred -u "$tmp" "$pairs" 2>/dev/null || /bin/rm -f "$tmp" "$pairs"
  echo "[$app] copied=$copied failed=$failed"
}

validate_preview() {
  local app="$1"
  cd "/Users/inancayvaz/MAS/apps/$app"
  local prev="/tmp/.val-$app.$$"
  /opt/homebrew/bin/npx --yes vercel@48 env pull "$prev" --environment=preview --yes < /dev/null > /dev/null 2>&1
  /bin/chmod 600 "$prev"
  local srk_len spk_len sup_url_len
  srk_len=$(/usr/bin/grep '^SUPABASE_SERVICE_ROLE_KEY=' "$prev" | /usr/bin/wc -c | /usr/bin/tr -d ' ' || echo 0)
  spk_len=$(/usr/bin/grep '^STUDIO_PRIVATE_KEY=' "$prev" | /usr/bin/wc -c | /usr/bin/tr -d ' ' || echo 0)
  sup_url_len=$(/usr/bin/grep '^NEXT_PUBLIC_SUPABASE_URL=' "$prev" | /usr/bin/wc -c | /usr/bin/tr -d ' ' || echo 0)
  local verdict="OK"
  # An empty value line looks like: KEY=""\n — roughly: len(key) + 4. Add margin.
  if [ "$srk_len" -lt 40 ] || [ "$spk_len" -lt 40 ] || [ "$sup_url_len" -lt 40 ]; then
    verdict="FAIL (suspiciously short)"
  fi
  echo "[$app] SRK=$srk_len bytes | SPK=$spk_len bytes | SUPA_URL=$sup_url_len bytes  →  $verdict"
  /usr/bin/shred -u "$prev" 2>/dev/null || /bin/rm -f "$prev"
}

echo "=== RESTORE ==="
for app in wordle 2048 hillclimb; do
  restore_preview "$app"
done

echo ""
echo "=== VALIDATION ==="
for app in wordle 2048 hillclimb; do
  validate_preview "$app"
done

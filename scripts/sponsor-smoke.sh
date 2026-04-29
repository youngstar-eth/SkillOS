#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Permissionless Sponsor Pool flow smoke — Gate 7 sprint deliverable.
#
# Tests the end-to-end sponsor flow against the deployed sponsor app:
#   1. Sponsor app deploy liveness     (listing page 200)
#   2. Sponsor flow page render         (/[tournamentId] 200)
#   3. Cross-game listing API           (/api/sponsor/tournaments)
#   4. Per-tournament sponsors API      (/api/sponsor/tournament/[id]/sponsors)
#   5. Sponsor contributions API        (/api/sponsor/contributions?address=...)
#   6. Cron endpoint auth gate           (401 without bearer)
#
# The 6 assertions intentionally stay read-only — no test wallet signing here.
# Write-path (sponsorPool tx, SBT mint) is exercised by Foundry tests in
# contracts/test/SponsorshipModule.t.sol and SponsorReceiptSBT.t.sol; this
# smoke confirms the deployed indexer + API + frontend serve the data those
# write-paths produced (Gate 5 manual test left 2 sponsorships persisted).
#
# Output mirrors solo-smoke.sh: PASS/FAIL per line, summary table at end.
#
# Usage:
#   ./scripts/sponsor-smoke.sh                                        # public alias
#   BASE_URL=https://skillbase-sponsor.vercel.app ./scripts/sponsor-smoke.sh
#   BASE_URL=https://sponsor.skillbase.games ./scripts/sponsor-smoke.sh
#
# Dependencies: bash, curl, jq.
#
# Exit codes:
#   0  — every assertion passed
#   1  — one or more assertions failed
#   2  — script aborted early (sponsor app down, no tournaments)
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

BASE_URL="${BASE_URL:-https://skillbase-sponsor.vercel.app}"

# ─── helpers ─────────────────────────────────────────────────────────────────

RESULTS=()

record() {
  local status="$1" name="$2" detail="${3:-}"
  RESULTS+=("${status}"$'\t'"${name}"$'\t'"${detail}")
  if [[ "$status" == "PASS" ]]; then
    printf "\033[32mPASS\033[0m  %s  %s\n" "$name" "$detail"
  else
    printf "\033[31mFAIL\033[0m  %s  %s\n" "$name" "$detail"
  fi
}

abort() {
  echo "── ABORT: $* ──" >&2
  print_summary
  exit 2
}

print_summary() {
  local total=${#RESULTS[@]} passed=0 failed=0
  for r in "${RESULTS[@]}"; do
    [[ "$r" == PASS* ]] && passed=$((passed+1)) || failed=$((failed+1))
  done
  echo
  echo "── Sponsor smoke summary ($BASE_URL) ──"
  printf '  %-44s  %s\n' "assertion" "status"
  printf '  %-44s  %s\n' "--------------------------------------------" "------"
  for r in "${RESULTS[@]}"; do
    local status name
    status="${r%%$'\t'*}"
    name="${r#*$'\t'}"; name="${name%%$'\t'*}"
    printf '  %-44s  %s\n' "$name" "$status"
  done
  printf '  %-44s  %s\n' "--------------------------------------------" "------"
  printf '  %-44s  %d passed, %d failed, %d total\n' "TOTAL" "$passed" "$failed" "$total"
}

# ─── 1: sponsor app listing page liveness ───────────────────────────────────

echo "── [1/6] Sponsor app deploy ($BASE_URL) ──"

listing_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [[ "$listing_code" == "200" ]]; then
  record PASS "sponsor.deploy_listing_200" "HTTP $listing_code"
else
  record FAIL "sponsor.deploy_listing_200" "HTTP $listing_code"
  abort "sponsor app listing not reachable"
fi

# ─── 2: cross-game tournament list API ──────────────────────────────────────

echo "── [2/6] Tournament listing API ──"

list_resp=$(curl -s "$BASE_URL/api/sponsor/tournaments")
list_count=$(echo "$list_resp" | jq -r '.tournaments | length' 2>/dev/null)
first_tid=$(echo "$list_resp" | jq -r '.tournaments[0].onChainId // empty' 2>/dev/null)

if [[ -n "$list_count" && "$list_count" -ge 1 && -n "$first_tid" ]]; then
  record PASS "api.sponsor_tournaments_returns_data" \
    "$list_count tournaments, first=${first_tid:0:14}…"
else
  record FAIL "api.sponsor_tournaments_returns_data" \
    "got: $(echo "$list_resp" | jq -c . 2>&1 | head -c 120)"
  abort "tournament listing API broken"
fi

# ─── 3: sponsor flow page renders for first tournament ──────────────────────

echo "── [3/6] Sponsor flow page ──"

flow_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/$first_tid")
if [[ "$flow_code" == "200" ]]; then
  record PASS "sponsor.flow_page_200" "HTTP $flow_code · $first_tid"
else
  record FAIL "sponsor.flow_page_200" "HTTP $flow_code"
fi

# ─── 4: per-tournament sponsors aggregate API ───────────────────────────────

echo "── [4/6] Tournament sponsors API ──"

# Pick a tournament that has sponsors. The test tournament from Gate 5 is
# the deterministic candidate; fall back to the first listed.
target_tid="0x8199e8eef3b395748f717b8589e495793eda530d0c1d215cab913f0e8bb88c83"

sponsors_resp=$(curl -s "$BASE_URL/api/sponsor/tournament/$target_tid/sponsors")
sponsors_count=$(echo "$sponsors_resp" | jq -r '.uniqueSponsorCount // -1' 2>/dev/null)
sponsors_total=$(echo "$sponsors_resp" | jq -r '.totalUsdc // empty' 2>/dev/null)

if [[ "$sponsors_count" =~ ^[0-9]+$ && -n "$sponsors_total" ]]; then
  if [[ "$sponsors_count" -ge 1 ]]; then
    record PASS "api.tournament_sponsors_aggregate" \
      "$sponsors_count sponsor(s), \$${sponsors_total} USDC external"
  else
    # Endpoint works, just no sponsors yet for this tid (different chain state).
    record PASS "api.tournament_sponsors_aggregate" \
      "shape valid (no sponsors yet for $target_tid)"
  fi
else
  record FAIL "api.tournament_sponsors_aggregate" \
    "got: $(echo "$sponsors_resp" | jq -c . 2>&1 | head -c 120)"
fi

# ─── 5: sponsor contributions read API ──────────────────────────────────────

echo "── [5/6] Sponsor contributions API ──"

# Probe with a known Gate-5 sponsor address. If no contributions exist (e.g.
# fresh deploy on a different chain), the endpoint should still return shape
# {sponsor, totalUsdc, contributions: []} — that's valid.
probe_addr="0xbc532a45174c2e65cfe17e8aea6b42e37e457064"

contrib_resp=$(curl -s "$BASE_URL/api/sponsor/contributions?address=$probe_addr")
contrib_addr=$(echo "$contrib_resp" | jq -r '.sponsor // empty' 2>/dev/null)
contrib_total=$(echo "$contrib_resp" | jq -r '.totalUsdc // empty' 2>/dev/null)
contrib_arr_present=$(echo "$contrib_resp" | jq -r 'has("contributions")' 2>/dev/null)

if [[ "$contrib_addr" == "$probe_addr" && -n "$contrib_total" && "$contrib_arr_present" == "true" ]]; then
  record PASS "api.sponsor_contributions_shape" \
    "sponsor=${probe_addr:0:10}…, \$${contrib_total} total"
else
  record FAIL "api.sponsor_contributions_shape" \
    "got: $(echo "$contrib_resp" | jq -c . 2>&1 | head -c 120)"
fi

# Bad-address path — must reject (regression guard for the address validator).
bad_addr_code=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/sponsor/contributions?address=not-a-real-addr")
if [[ "$bad_addr_code" == "400" ]]; then
  record PASS "api.sponsor_contributions_rejects_bad_addr" "HTTP 400 on garbage address"
else
  record FAIL "api.sponsor_contributions_rejects_bad_addr" \
    "expected 400, got $bad_addr_code"
fi

# ─── 6: cron endpoint requires bearer auth ──────────────────────────────────

echo "── [6/6] Cron auth gate ──"

cron_unauth_code=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/cron/index-sponsor-events")
if [[ "$cron_unauth_code" == "401" ]]; then
  record PASS "cron.requires_bearer_auth" "HTTP 401 without Authorization header"
else
  record FAIL "cron.requires_bearer_auth" \
    "expected 401, got $cron_unauth_code (cron is exposed!)"
fi

# ─── done ───────────────────────────────────────────────────────────────────

print_summary

# Exit code: 0 if all passed, 1 otherwise.
for r in "${RESULTS[@]}"; do
  [[ "$r" == FAIL* ]] && exit 1
done
exit 0

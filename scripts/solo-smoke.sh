#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Solo AI flow smoke — Gate 2 / Gate 4 / Gate 6 harness.
#
# Tests the end-to-end solo tournament flow against a deployed app:
#   1. Deploy liveness  (200 on /tournament/solo, x-vercel-id header)
#   2. Active tournament discovery
#   3. Free solo submit (POST /api/tournaments/[id]/solo)
#   4. AI coach assertions (structure, tone enum, cache hit on 2nd call)
#   5. AI recap assertions (no-opponent-language, share placeholder, cache)
#   6. Plausibility polling (pending → reviewed within 15s)
#   7. Retry fee isolation (2nd submit must 429 or 402, never 200)
#   8. SP award pipeline (profile endpoint, user_stats row, level + multiplier)
#
# Output: one line per assertion in "PASS/FAIL  <name>  (<detail>)" format,
# followed by a summary table and an overall exit code (0 = all pass).
#
# Usage:
#   ./scripts/solo-smoke.sh                   # defaults to 2048 subdomain
#   BASE_URL=https://wordle.skillos.games ./scripts/solo-smoke.sh
#
# Gate 4 (all 6 subdomains):
#   for slug in 2048 wordle sudoku minesweeper clicker match3; do
#     BASE_URL="https://${slug}.skillos.games" ./scripts/solo-smoke.sh
#   done
#
# Dependencies: bash ≥4, curl, jq, openssl. No network calls outside BASE_URL.
#
# Exit codes:
#   0  — every assertion passed
#   1  — one or more assertions failed
#   2  — script aborted early (no tournament, submit failed, etc.)
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

BASE_URL="${BASE_URL:-https://2048.skillos.games}"

# ─── helpers ─────────────────────────────────────────────────────────────────

RESULTS=()  # each entry: "PASS|FAIL<TAB>name<TAB>detail"

record() {
  # record <status> <name> [detail]
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

now_ms() {
  # portable millisecond timestamp (macOS date lacks %N; use python fallback)
  python3 -c 'import time; print(int(time.time()*1000))'
}

print_summary() {
  local total=${#RESULTS[@]} passed=0 failed=0
  for r in "${RESULTS[@]}"; do
    [[ "$r" == PASS* ]] && passed=$((passed+1)) || failed=$((failed+1))
  done
  echo
  echo "── Summary ($BASE_URL) ──"
  printf '  %-40s  %s\n' "assertion" "status"
  printf '  %-40s  %s\n' "----------------------------------------" "------"
  for r in "${RESULTS[@]}"; do
    local status name
    status="${r%%$'\t'*}"
    name="${r#*$'\t'}"; name="${name%%$'\t'*}"
    printf '  %-40s  %s\n' "$name" "$status"
  done
  printf '  %-40s  %s\n' "----------------------------------------" "------"
  printf '  %-40s  %d passed, %d failed, %d total\n' "TOTAL" "$passed" "$failed" "$total"
}

# ─── section 1: deploy status ────────────────────────────────────────────────

echo "── [1/7] Deploy status ($BASE_URL) ──"

solo_page_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/tournament/solo")
if [[ "$solo_page_code" == "200" ]]; then
  record PASS "deploy.solo_page_200" "HTTP $solo_page_code"
else
  record FAIL "deploy.solo_page_200" "HTTP $solo_page_code"
fi

vercel_id=$(curl -sI "$BASE_URL/" | awk 'tolower($1) == "x-vercel-id:" { print $2 }' | tr -d '\r\n')
if [[ -n "$vercel_id" ]]; then
  record PASS "deploy.x_vercel_id" "$vercel_id"
else
  record FAIL "deploy.x_vercel_id" "header absent"
fi

# Probe for new solo coach endpoint — a not-UUID runId should yield 400 on
# new deploys and 404 on old ones. Confidence that Gate 1 code is live.
probe_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H 'content-type: application/json' -d '{}' \
  "$BASE_URL/api/tournaments/solo/not-a-uuid/coach")
if [[ "$probe_code" == "400" ]]; then
  record PASS "deploy.solo_coach_endpoint_live" "probe 400 invalid_run_id"
elif [[ "$probe_code" == "404" ]]; then
  record FAIL "deploy.solo_coach_endpoint_live" "probe 404 — Gate 1 code not deployed yet"
  abort "solo endpoints not live; push may be mid-deploy"
else
  record FAIL "deploy.solo_coach_endpoint_live" "unexpected probe $probe_code"
fi

# ─── section 2: active tournament ────────────────────────────────────────────

echo "── [2/7] Active tournament ──"

tournaments_json=$(curl -s "$BASE_URL/api/tournaments")
tournament_id=$(echo "$tournaments_json" | jq -r '.daily.id // empty')

if [[ -n "$tournament_id" ]]; then
  record PASS "tournament.daily_active" "$tournament_id"
else
  record FAIL "tournament.daily_active" "no daily tournament"
  abort "no active daily tournament to submit against"
fi

# ─── section 3: submit free solo run ─────────────────────────────────────────

echo "── [3/7] Submit solo run ──"

test_addr="0x$(openssl rand -hex 20)"
# durationSeconds=120 — synthetic 2-minute play window. Above all per-game
# implausible thresholds so the plausibility audit returns "plausible".
submit_resp=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"playerAddress\":\"$test_addr\",\"score\":1337,\"durationSeconds\":120}" \
  "$BASE_URL/api/tournaments/$tournament_id/solo")

solo_run_id=$(echo "$submit_resp" | jq -r '.soloRunId // empty')
rank=$(echo "$submit_resp" | jq -r '.rank // empty')

if [[ -n "$solo_run_id" ]]; then
  record PASS "submit.free_returns_soloRunId" "$solo_run_id"
else
  record FAIL "submit.free_returns_soloRunId" "$(echo "$submit_resp" | jq -c .)"
  abort "free submit failed"
fi

if [[ -n "$rank" ]]; then
  record PASS "submit.rank_present" "#$rank"
else
  record FAIL "submit.rank_present" "rank missing"
fi

# Pay-then-play eligibility assertion: re-fetch /api/tournaments?address=
# with the address that just submitted; the response should now mark the
# next run as a paid retry. Catches regressions in the eligibility query
# that pay-then-play depends on.
eligibility_json=$(curl -s "$BASE_URL/api/tournaments?address=$test_addr")
elig_paid=$(echo "$eligibility_json" | jq -r '.daily.eligibility.nextPaidRetry // empty')
elig_owed=$(echo "$eligibility_json" | jq -r '.daily.eligibility.currentFeeOwed // empty')
elig_runs=$(echo "$eligibility_json" | jq -r '.daily.eligibility.priorSoloRuns // empty')
if [[ "$elig_paid" == "true" && "$elig_owed" == "1000000" && "$elig_runs" == "1" ]]; then
  record PASS "retry.eligibility_paid_after_first_run" \
    "priorSoloRuns=1, nextPaidRetry=true, currentFeeOwed=1000000"
else
  record FAIL "retry.eligibility_paid_after_first_run" \
    "got priorSoloRuns=$elig_runs nextPaidRetry=$elig_paid currentFeeOwed=$elig_owed"
fi

# ─── section 4: coach ────────────────────────────────────────────────────────

echo "── [4/7] Coach endpoint ──"

coach_start=$(now_ms)
coach_resp=$(curl -s -X POST -H 'content-type: application/json' -d '{}' \
  "$BASE_URL/api/tournaments/solo/$solo_run_id/coach")
coach_end=$(now_ms)
coach_latency_ms=$(( coach_end - coach_start ))

coach_feedback=$(echo "$coach_resp" | jq -r '.feedback // empty')
coach_tone=$(echo "$coach_resp" | jq -r '.tone // empty')

if [[ -n "$coach_feedback" ]]; then
  record PASS "coach.feedback_present" "${#coach_feedback} chars"
else
  record FAIL "coach.feedback_present" "empty: $(echo "$coach_resp" | jq -c .)"
fi

# Strict 6-enum check — "encouraging" is the hide-badge sentinel and counts
# as a FAIL here (means both prompt retries missed the strict tone rule).
case "$coach_tone" in
  tactical|analytical|technique|risk|pacing|strategic)
    record PASS "coach.tone_in_strict_6_enum" "$coach_tone"
    ;;
  encouraging)
    record FAIL "coach.tone_in_strict_6_enum" "got 'encouraging' (fallback sentinel — prompt retries exhausted)"
    ;;
  *)
    record FAIL "coach.tone_in_strict_6_enum" "got '$coach_tone'"
    ;;
esac

# Exactly two areas + one tip. Use extended regex, tolerate whitespace.
area1_hit=0; area2_hit=0; area3_hit=0; tip_hit=0
echo "$coach_feedback" | grep -qiE 'Area[[:space:]]*1[[:space:]]*:' && area1_hit=1
echo "$coach_feedback" | grep -qiE 'Area[[:space:]]*2[[:space:]]*:' && area2_hit=1
echo "$coach_feedback" | grep -qiE 'Area[[:space:]]*3[[:space:]]*:' && area3_hit=1
echo "$coach_feedback" | grep -qiE 'Tip[[:space:]]*:' && tip_hit=1

if (( area1_hit == 1 && area2_hit == 1 && area3_hit == 0 )); then
  record PASS "coach.exactly_2_areas" "Area 1 + Area 2 present, no Area 3"
else
  record FAIL "coach.exactly_2_areas" "Area 1=$area1_hit Area 2=$area2_hit Area 3=$area3_hit"
fi

if (( tip_hit == 1 )); then
  record PASS "coach.has_tip" "Tip: label found"
else
  record FAIL "coach.has_tip" "Tip: label absent"
fi

# ─── coach cache (2nd call) ──────────────────────────────────────────────────

# Dump headers so we can read X-Cache alongside the body (reliable signal;
# TLS cold-start dominates round-trip latency for cache-hit measurement).
coach_hdr_file=$(mktemp)
coach_resp2=$(curl -s -D "$coach_hdr_file" -X POST -H 'content-type: application/json' -d '{}' \
  "$BASE_URL/api/tournaments/solo/$solo_run_id/coach")
coach2_x_cache=$(awk 'tolower($1) == "x-cache:" { print $2 }' "$coach_hdr_file" | tr -d '\r\n')
rm -f "$coach_hdr_file"

# Key-sorted JSON compare — Supabase jsonb roundtrips may reorder keys
# relative to the generator's object literal. Logical equality is what
# matters; raw string equality is not a correctness property.
coach_resp_sorted=$(echo "$coach_resp" | jq -cS .)
coach_resp2_sorted=$(echo "$coach_resp2" | jq -cS .)
if [[ "$coach_resp_sorted" == "$coach_resp2_sorted" ]]; then
  record PASS "coach.cache_idempotent" "bodies equal after key-sort"
else
  record FAIL "coach.cache_idempotent" "bodies differ after key-sort"
fi

if [[ "$coach2_x_cache" == "HIT" ]]; then
  record PASS "coach.cache_x_hit" "X-Cache: HIT on 2nd call"
else
  record FAIL "coach.cache_x_hit" "X-Cache='$coach2_x_cache' (expected HIT)"
fi

# ─── section 5: recap ────────────────────────────────────────────────────────

echo "── [5/7] Recap endpoint ──"

recap_resp=$(curl -s -X POST -H 'content-type: application/json' -d '{}' \
  "$BASE_URL/api/tournaments/solo/$solo_run_id/recap")
recap_narrative=$(echo "$recap_resp" | jq -r '.narrative // empty')
recap_headline=$(echo "$recap_resp" | jq -r '.headline // empty')
recap_share_text=$(echo "$recap_resp" | jq -r '.shareText // empty')
recap_style=$(echo "$recap_resp" | jq -r '.style // empty')

if [[ -n "$recap_narrative" ]]; then
  record PASS "recap.narrative_present" "${#recap_narrative} chars"
else
  record FAIL "recap.narrative_present" "empty: $(echo "$recap_resp" | jq -c .)"
fi

if [[ -n "$recap_headline" ]]; then
  record PASS "recap.headline_present" "\"$recap_headline\""
else
  record FAIL "recap.headline_present" "empty"
fi

# Opponent language is the product-critical assertion — duel recap prompts
# love adversarial framing; solo variant must not leak it.
#
# Word list is "defeated / crushed / opponent". NOTE: "beat" was originally
# in this list but was dropped after Gate 4 — the model reserves "beats" for
# idiomatic use ("precision beats patience") which is fully solo-legitimate,
# and checking "beat X" where X is a pronoun is what would actually catch
# adversarial use. For submission cadence, the 3 words below are the
# unambiguous markers; contextual "beat X pronoun" is backlog.
if echo "$recap_narrative" | grep -qiE '(defeated|crushed|opponent)'; then
  offending=$(echo "$recap_narrative" | grep -oiE '(defeated|crushed|opponent)' | head -1)
  record FAIL "recap.no_opponent_language" "found '$offending' in narrative"
else
  record PASS "recap.no_opponent_language" "clean"
fi

# shareText is the server-side body; it must include the literal "{url}"
# placeholder for the client to substring-replace. The client-side URL
# substitution is tested separately (hits /tournament/solo for solo context).
if echo "$recap_share_text" | grep -qF '{url}'; then
  record PASS "recap.share_has_url_placeholder" "{url} present"
else
  record FAIL "recap.share_has_url_placeholder" "placeholder missing: \"$recap_share_text\""
fi

# Solo style vocabulary is narrowed at the prompt level. Accepting any
# of the 3 allowed styles — collapse to "standard" is fine.
case "$recap_style" in
  speedRun|grind|standard)
    record PASS "recap.style_in_solo_enum" "$recap_style"
    ;;
  *)
    record FAIL "recap.style_in_solo_enum" "got '$recap_style' (expected speedRun/grind/standard)"
    ;;
esac

# ─── recap cache (header-based) ──────────────────────────────────────────────

recap_headers=$(curl -sI -X POST -H 'content-type: application/json' \
  "$BASE_URL/api/tournaments/solo/$solo_run_id/recap")
recap_x_cache=$(echo "$recap_headers" | awk 'tolower($1) == "x-cache:" { print $2 }' | tr -d '\r\n')

if [[ "$recap_x_cache" == "HIT" ]]; then
  record PASS "recap.cache_x_hit" "X-Cache: HIT"
else
  # curl -I sends HEAD; our handler routes POST. Retry with an actual POST
  # and -D - to dump headers while also reading body (though headers are
  # the only thing we inspect here).
  recap_full=$(curl -s -D - -X POST -H 'content-type: application/json' -d '{}' \
    "$BASE_URL/api/tournaments/solo/$solo_run_id/recap" -o /dev/null)
  recap_x_cache=$(echo "$recap_full" | awk 'tolower($1) == "x-cache:" { print $2 }' | tr -d '\r\n')
  if [[ "$recap_x_cache" == "HIT" ]]; then
    record PASS "recap.cache_x_hit" "X-Cache: HIT (via POST -D)"
  else
    record FAIL "recap.cache_x_hit" "X-Cache='$recap_x_cache' (expected HIT)"
  fi
fi

# ─── section 6: plausibility polling ─────────────────────────────────────────

echo "── [6/7] Plausibility polling ──"

plausibility_status=""
plausibility_elapsed=0
for i in $(seq 1 15); do
  plaus_resp=$(curl -s "$BASE_URL/api/tournaments/solo/$solo_run_id/plausibility")
  plausibility_status=$(echo "$plaus_resp" | jq -r '.status // empty')
  if [[ "$plausibility_status" == "reviewed" ]]; then
    plausibility_elapsed=$i
    break
  fi
  sleep 1
done

if [[ "$plausibility_status" == "reviewed" ]]; then
  record PASS "plausibility.reviewed_within_15s" "~${plausibility_elapsed}s"
else
  record FAIL "plausibility.reviewed_within_15s" "still '$plausibility_status' after 15s"
fi

# ─── section 7: retry fee isolation ──────────────────────────────────────────

echo "── [7/7] Retry fee isolation ──"

# Second submit with the SAME test address, no feeTxHash → 402
# payment_required. (The legacy 60s cooldown returned 429; it was retired
# when pay-then-play made the economic gate sufficient. The 429 case below
# is kept for backward-compat against pre-rollback deploys.) A 200 would
# mean retry fee isolation regressed.
retry_resp=$(curl -s -w "\n%{http_code}" -X POST -H 'content-type: application/json' \
  -d "{\"playerAddress\":\"$test_addr\",\"score\":999}" \
  "$BASE_URL/api/tournaments/$tournament_id/solo")
retry_code=$(echo "$retry_resp" | tail -n1)
retry_body=$(echo "$retry_resp" | head -n1)
retry_error=$(echo "$retry_body" | jq -r '.error // empty' 2>/dev/null || echo "")

case "$retry_code" in
  429)
    record PASS "retry.gate_fires" "429 rate_limited (cooldown window)"
    ;;
  402)
    record PASS "retry.gate_fires" "402 payment_required ($retry_error)"
    ;;
  200)
    record FAIL "retry.gate_fires" "200 — retry fee isolation REGRESSED"
    ;;
  *)
    record FAIL "retry.gate_fires" "unexpected $retry_code ($retry_body)"
    ;;
esac

# ─── section 8: SP pipeline ──────────────────────────────────────────────────
# Touches v2_user_stats + the read paths (profile + leaderboard) the jury
# sees. The SP hook is chained onto the plausibility waitUntil Promise so by
# the time section 6 sees `reviewed`, the stats row should be materialized;
# a brief retry loop absorbs any residual jitter.

echo "── [8/8] SP pipeline ──"

profile_url="$BASE_URL/api/profile/$test_addr"
profile_body=""
for i in $(seq 1 8); do
  profile_body=$(curl -s "$profile_url")
  # Wait for v2_user_stats row to land (materialized by the solo_submit hook).
  stats_null=$(echo "$profile_body" | jq -r '.stats == null')
  if [[ "$stats_null" != "true" ]]; then
    break
  fi
  sleep 1
done

profile_code=$(curl -s -o /dev/null -w "%{http_code}" "$profile_url")
if [[ "$profile_code" == "200" ]]; then
  record PASS "sp.profile_endpoint_200" "HTTP 200"
else
  record FAIL "sp.profile_endpoint_200" "HTTP $profile_code"
fi

total_sp=$(echo "$profile_body" | jq -r '.stats.totalSp // empty')
current_level=$(echo "$profile_body" | jq -r '.stats.currentLevel // empty')

# 8.1 — user_stats row materialized for the freshly-submitted address.
if [[ -n "$total_sp" ]]; then
  record PASS "sp.user_stats_row_exists" "totalSp=$total_sp"
else
  record FAIL "sp.user_stats_row_exists" "stats still null after 8s"
fi

# 8.2 — current_level matches the local threshold table. Mirrors
# sp-engine's levelForSP (0/500/1500/3500/7500/15000/25000/35000/45000/50000).
if [[ -n "$total_sp" && -n "$current_level" ]]; then
  expected_level=1
  idx=1
  for t in 0 500 1500 3500 7500 15000 25000 35000 45000 50000; do
    if (( total_sp >= t )); then expected_level=$idx; fi
    idx=$(( idx + 1 ))
  done
  if (( current_level == expected_level )); then
    record PASS "sp.level_matches_thresholds" "L$current_level for $total_sp SP"
  else
    record FAIL "sp.level_matches_thresholds" "got L$current_level, expected L$expected_level for $total_sp SP"
  fi
else
  record FAIL "sp.level_matches_thresholds" "stats missing totalSp/currentLevel"
fi

# 8.3 — plausibility multiplier was applied. The first activity row is the
# solo submission we just made; awarded SP must match 50 × multiplier for the
# recorded verdict. Also cross-checks that the total equals the single event
# (fresh address, no prior SP).
first_sp=$(echo "$profile_body" | jq -r '.activity[0].sp // empty')
first_verdict=$(echo "$profile_body" | jq -r '.activity[0].verdict // empty')

case "$first_verdict" in
  plausible)   expected_sp=50 ;;
  suspicious)  expected_sp=25 ;;
  implausible) expected_sp=0 ;;
  *)           expected_sp="" ;;
esac

if [[ -n "$first_sp" && -n "$expected_sp" && "$first_sp" == "$expected_sp" ]]; then
  record PASS "sp.multiplier_respected" "solo_submit × $first_verdict = $first_sp"
else
  record FAIL "sp.multiplier_respected" \
    "activity[0] sp=$first_sp verdict=$first_verdict (expected $expected_sp)"
fi

if [[ -n "$total_sp" && -n "$first_sp" && "$total_sp" == "$first_sp" ]]; then
  record PASS "sp.total_equals_single_event" "fresh addr: totalSp=$total_sp == activity[0].sp"
else
  record FAIL "sp.total_equals_single_event" "totalSp=$total_sp vs activity[0].sp=$first_sp"
fi

# 8.4 — global leaderboard endpoint responds and contains our address (or
# returns an array, even if empty under the top-100 cap for tiny test envs).
lb_body=$(curl -s "$BASE_URL/api/leaderboard")
lb_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/leaderboard")
lb_count=$(echo "$lb_body" | jq -r '.leaderboard | length // empty')

if [[ "$lb_code" == "200" && -n "$lb_count" ]]; then
  record PASS "sp.leaderboard_endpoint_200" "HTTP 200, $lb_count rows"
else
  record FAIL "sp.leaderboard_endpoint_200" "HTTP $lb_code, count=$lb_count"
fi

# 8.5 — SP snapshot anchor health.
# v2_sp_snapshots is a global table fed by the daily 02:07 UTC cron in
# apps/2048. Every subdomain runs this assertion against its own host, but
# all subdomains read the same global rows — passes are correlated, not
# independent. Pre-cron-fire (i.e. before 02:10 UTC on day 1 in production)
# the assertion will FAIL with anchored_today=false; that's the expected
# fail-loud signal until the cron has run at least once.
status_body=$(curl -s "$BASE_URL/api/sp-snapshot-status")
status_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/sp-snapshot-status")
anchored_today=$(echo "$status_body" | jq -r '.anchored_today // empty')
anchor_tx=$(echo "$status_body" | jq -r '.latest.anchor_tx_hash // empty')

if [[ "$status_code" == "200" && "$anchored_today" == "true" && -n "$anchor_tx" ]]; then
  record PASS "sp.anchor_published_today" "tx=${anchor_tx:0:12}…"
else
  record FAIL "sp.anchor_published_today" "HTTP $status_code, anchored_today=$anchored_today"
fi

# ─── summary ─────────────────────────────────────────────────────────────────

print_summary

any_failed=0
for r in "${RESULTS[@]}"; do
  [[ "$r" == FAIL* ]] && any_failed=1 && break
done
exit $any_failed

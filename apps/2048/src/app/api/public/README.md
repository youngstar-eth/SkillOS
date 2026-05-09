# Public x402 API — `/api/public/*`

Production x402-paid endpoints for autonomous agent access to SkillOS
gaming data + AI inference. All six routes live at
<https://2048.skillos.network>, priced in USDC on Base Sepolia via the
Coinbase CDP facilitator, and auto-discoverable through the x402 Bazaar.

## x402 flow in one breath

1. Agent GETs the endpoint without a payment header → server returns
   `402 Payment Required` with a base64-encoded `payment-required`
   header containing the `PaymentRequired` envelope (price, asset,
   payTo, maxTimeoutSeconds, and Bazaar metadata).
2. Agent decodes the envelope, signs an EIP-3009
   `transferWithAuthorization` over USDC using its own wallet, and
   re-sends the request with an `x-payment` header carrying the signed
   payload (base64 JSON).
3. Server calls the CDP facilitator to **verify** the payload, then
   runs the business logic, then calls the facilitator to **settle**
   (broadcasts the signed transfer on-chain). On success the server
   returns the response plus an `x-payment-response` header with the
   settlement tx hash.

Spec: <https://docs.cdp.coinbase.com/x402/welcome>.
Bazaar discovery: <https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources>.

## Endpoints

### `GET /api/public/data/sp-tier-distribution` — $0.01 USDC

Aggregate histogram of SkillOS players bucketed by level across all
six Phase-1 games. Decisions column is filtered to plausibility_verdict
= 'plausible' only. No PII — no wallet addresses or per-player rows.

```bash
curl -i https://2048.skillos.network/api/public/data/sp-tier-distribution
# → 402 + payment-required envelope
```

Response on 200 (`category: gaming-data`, tags include `aggregate`,
`training-data`, `ai-training`, `human-decision-data`):

```json
{
  "generated_at": "2026-04-24T21:38:13.913Z",
  "source": "SkillOS — 6 games, verified human decisions",
  "total_verified_players": 38,
  "total_decisions_recorded": 0,
  "tier_distribution": {
    "level_1_3":  { "players": 38, "pct": 100, "decisions": 0 },
    "level_4_6":  { "players": 0,  "pct": 0,   "decisions": 0 },
    "level_7_9":  { "players": 0,  "pct": 0,   "decisions": 0 },
    "level_10":   { "players": 0,  "pct": 0,   "decisions": 0 }
  },
  "plausibility_filter_applied": "plausible_only",
  "sample_note": "…",
  "related_endpoints": ["/api/public/data/decision-sample", "/api/public/ai/coach-sample"]
}
```

### `GET /api/public/data/decision-sample/{any,tier/1-4,tier/5-7,tier/8-plus}` — $0.01–$0.10 USDC

Single random verified decision trace, tier-filtered by price tier.
Anonymized: `decision_id = sha256(solo_run.id).slice(0, 16)`. Schema v1
exposes only match-level fields (final_score, duration_seconds,
plausibility_score). Per-decision traces (game_state_hash, choice
sequences, time-pressure telemetry) are v3 replay-verify territory — a
`sample_note` flags the gap.

| Route | Price | Tier filter |
|---|---:|---|
| `/api/public/data/decision-sample/any` | $0.01 | none |
| `/api/public/data/decision-sample/tier/1-4` | $0.02 | `current_level in [1, 4]` |
| `/api/public/data/decision-sample/tier/5-7` | $0.05 | `current_level in [5, 7]` |
| `/api/public/data/decision-sample/tier/8-plus` | $0.10 | `current_level >= 8` |

Optional: `?game=2048|wordle|sudoku|minesweeper|clicker|match3` for
per-game filtering.

On empty filter result (e.g. no L8+ decisions yet), returns 200 with an
explicit note in `meta.note` rather than a 404 — payment was valid, the
seller just has no inventory for that query.

### `GET /api/public/ai/coach-sample?game={slug}&score={int}` — $0.05 USDC

AI Coach inference sample. Reuses the exact same solo-coach pipeline
SkillOS uses in production: Claude Sonnet 4.6, 6-tone strict enum, single
retry on enum-violation, hide-badge fallback. Returns 2 improvement
areas + 1 actionable tip.

```bash
curl -i "https://2048.skillos.network/api/public/ai/coach-sample?game=2048&score=1234"
# → 402
```

Response on 200 (`category: ai-inference`, tags include `gaming-ai`,
`coaching`, `claude-sonnet`, `skill-gaming`, `player-analysis`):

```json
{
  "generated_at": "2026-04-24T21:38:35.007Z",
  "game": "2048",
  "score_analyzed": 1234,
  "coach_verdict": {
    "improvement_area_1": {
      "area": "Corner anchor collapse",
      "tone": "tactical",
      "observation": "you failed to maintain a locked corner position, forcing reactive merges instead of planned sequences."
    },
    "improvement_area_2": { "area": "…", "tone": "tactical", "observation": "…" },
    "actionable_tip": "…"
  },
  "meta": {
    "model": "claude-sonnet-4-6-via-skillbase",
    "sample_note": "Same Coach pipeline as live SkillOS games…",
    "rate_limit_note": "Sample endpoint — 30 req/min per IP."
  }
}
```

**Rate limiting.** In-memory sliding window, 30 req/min per IP. Checked
*after* payment verification. On 429 the payment is non-refundable
(sample tier); upgrade to production SDK at `sales@simpl3.ai` for
per-tenant rate limits. Post-submission backlog: migrate limiter to
Upstash Redis so limits survive serverless cold-starts.

## Test agent

[`scripts/x402-smoke.ts`](../../../../../scripts/x402-smoke.ts) — signs
payments with a funded Base Sepolia wallet and walks all six routes
via `@x402/fetch`'s `wrapFetchWithPayment`. Prints status, decoded
Bazaar metadata, and BaseScan tx link per route.

```bash
set -a && source apps/2048/.env.local && set +a
X402_BASE_URL=https://2048.skillos.network \
  npx tsx scripts/x402-smoke.ts
```

## Bazaar discovery

Every 402 envelope includes `extensions.bazaar = {discoverable: true,
category, tags}`. CDP facilitator catalogs the endpoint on first
successful settlement — no manual submission required. Query discovery:

```bash
curl https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
```

## Roadmap

**Phase 2 (post-submission)**
- Mainnet migration on Base (`eip155:8453`), dedicated treasury
  address, migrate facilitator auth to `@coinbase/x402`'s helper.
- Self-serve tier-filtered marketplace with user-facing agent console
  + streaming feeds.
- Upstash Redis rate limiter + per-tenant quotas.

**Phase 3**
- Schema v2 with per-decision traces (game_state_hash, choice
  sequence, time_pressure_ms, choice_signature, available_choices_count)
  — unlocks once v3 replay verification ships.
- Multi-token pricing (ETH + USDC).
- WebSocket feeds for live decision streams.

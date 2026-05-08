# x402 Live Proof — SkillOS on Base Sepolia

**Generated:** 2026-04-24T21:38Z
**Base domain:** https://2048.skillbase.games
**Network:** Base Sepolia (`eip155:84532`)
**Facilitator:** Coinbase CDP (`https://api.cdp.coinbase.com/platform/v2/x402`)
**Asset:** USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals, EIP-3009 via `transferWithAuthorization`)
**Scheme:** `exact` (ExactEvmScheme)

## Summary

| | |
|---|---|
| Routes live | 6 / 6 |
| Routes discoverable via Bazaar | 6 / 6 |
| Paid round-trips completed | 6 / 6 |
| Total USDC spent (testnet) | **$0.24** |
| Test-wallet signer | `0x6ec639c0b3B63C0d0A6b1d9e5e0Ca75E39C0714c` |
| Payee (ChallengeEscrow trustedSigner) | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` |
| Git commit deployed | `65b9d9a` |
| Vercel deploy | `skillbase-duel-lrbfx5fwk` |

## Endpoint inventory

| Route | Price | Bazaar category | Tags |
|---|---:|---|---|
| `GET /api/public/data/sp-tier-distribution` | $0.01 | `gaming-data` | skill-gaming, aggregate, training-data, ai-training, human-decision-data |
| `GET /api/public/data/decision-sample/any` | $0.01 | `gaming-data` | skill-gaming, decision-trace, training-data, ai-training, verified-human, tier-filtered |
| `GET /api/public/data/decision-sample/tier/1-4` | $0.02 | `gaming-data` | (same as above) |
| `GET /api/public/data/decision-sample/tier/5-7` | $0.05 | `gaming-data` | (same as above) |
| `GET /api/public/data/decision-sample/tier/8-plus` | $0.10 | `gaming-data` | (same as above) |
| `GET /api/public/ai/coach-sample?game={slug}&score={int}` | $0.05 | `ai-inference` | gaming-ai, coaching, claude-haiku, skill-gaming, player-analysis |

## Per-endpoint live evidence

### 1. `sp-tier-distribution` — $0.01

**Unpaid GET** → `402 Payment Required`
```
payment-required (base64-decoded):
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xA24f9122568e98b72f4dDD61119C7D92D0975692",
    "maxTimeoutSeconds": 300
  }],
  "extensions": {
    "bazaar": {
      "discoverable": true,
      "category": "gaming-data",
      "tags": ["skill-gaming","aggregate","training-data","ai-training","human-decision-data"]
    }
  }
}
```

**Paid GET** → `200 OK`
```json
{
  "generated_at": "2026-04-24T21:38:13.913Z",
  "source": "SkillOS — 6 games, verified human decisions",
  "total_verified_players": 38,
  "total_decisions_recorded": 0,
  "tier_distribution": {
    "level_1_3": { "players": 38, "pct": 100, "decisions": 0 },
    "level_4_6": { "players": 0,  "pct": 0,   "decisions": 0 },
    "level_7_9": { "players": 0,  "pct": 0,   "decisions": 0 },
    "level_10":  { "players": 0,  "pct": 0,   "decisions": 0 }
  },
  "plausibility_filter_applied": "plausible_only",
  "related_endpoints": ["/api/public/data/decision-sample", "/api/public/ai/coach-sample"]
}
```

**TX:** [0xdf846f98…0305c9](https://sepolia.basescan.org/tx/0xdf846f98fa72ea5b3ce44d85c629fcc9d1fe0200d3a20b5a93e4a1ea120305c9)
**Method:** `transferWithAuthorization`  •  **Value:** 10000 μUSDC  •  **Status:** success  •  **Block:** 40649204

### 2. `decision-sample/any` — $0.01

**Paid GET** → `200 OK`
```json
{
  "generated_at": "2026-04-24T21:38:17.424Z",
  "decision_id": null,
  "game": null,
  "tier_at_decision_time": null,
  "plausibility_verdict": null,
  "available_fields": {},
  "meta": {
    "sample_note": "This sample returns match-level verified decision data. Phase 2 expands to per-decision traces once v3 replay verify ships…",
    "pricing_tier": "any",
    "schema_version": "v1",
    "note": "No decisions match filter at this time. Try tier=any or wait for fresh matches."
  }
}
```
*(empty result expected — the 38 players on prod are all at L1–L3 and none have submitted tournament solo runs yet, so the plausibility-filtered set is empty.)*

**TX:** [0x503a7e0a…5928f0](https://sepolia.basescan.org/tx/0x503a7e0a903e7f39e1c0ab580b76ecfb9389e92ff99576d82d696126c45928f0)
**Value:** 10000 μUSDC  •  **Status:** success

### 3. `decision-sample/tier/1-4` — $0.02
**TX:** [0xf0f2e467…eaed05](https://sepolia.basescan.org/tx/0xf0f2e467aa2faf67fba638ec92a576d73ffa1f1db37130164e6315c8cfeaed05)
**Value:** 20000 μUSDC  •  **Status:** success

### 4. `decision-sample/tier/5-7` — $0.05
**TX:** [0xa24e5a04…eeb00c](https://sepolia.basescan.org/tx/0xa24e5a04daddc601509f74b96d88d37e60202ba88e426ad401b51a4903eeb00c)
**Value:** 50000 μUSDC  •  **Status:** success

### 5. `decision-sample/tier/8-plus` — $0.10
**TX:** [0xf32bc584…238df2](https://sepolia.basescan.org/tx/0xf32bc5842c3ecb97980ec5e166420cbe9c5cc2d3a44462e4345506bdef238df2)
**Value:** 100000 μUSDC  •  **Status:** success

### 6. `coach-sample?game=2048&score=1234` — $0.05

**Paid GET** → `200 OK` (real Claude Haiku inference)
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
    "improvement_area_2": {
      "area": "…",
      "tone": "tactical",
      "observation": "…"
    },
    "actionable_tip": "…"
  },
  "meta": {
    "model": "claude-haiku-via-skillos",
    "sample_note": "Same Coach pipeline as live SkillOS games. For production SDK access with tier-aware prompts and volume pricing, contact sales@simpl3.ai.",
    "rate_limit_note": "Sample endpoint — 30 req/min per IP."
  }
}
```

**TX:** [0x4bc12666…1b492](https://sepolia.basescan.org/tx/0x4bc12666a3df8606ac87f173dccfcb499dae2f239534da1eb2bc4721cad1b492)
**Value:** 50000 μUSDC  •  **Status:** success

## Rate limiter proof

Unit-tested `checkRateLimit(ip)` 31× against the same IP:
```
call #1:  ok
call #30: ok
call #31: rate-limited, retryAfter=60s

summary: 30 ok, 1 rate-limited (expected: 30 ok, 1 rate-limited)
```

Coach handler calls `checkRateLimit` *after* payment verification and *before* the Anthropic round-trip — a 429 response still triggers settlement (payment non-refundable per sample-tier spec).

## Reproduce

```bash
# Prerequisites (already in apps/2048/.env.local):
#   CDP_API_KEY_ID, CDP_API_KEY_SECRET, X402_PAY_TO,
#   X402_FACILITATOR_URL, X402_NETWORK,
#   X402_TEST_WALLET_PRIVATE_KEY (funded on Base Sepolia)

set -a && source apps/2048/.env.local && set +a
X402_BASE_URL=https://2048.skillbase.games \
  npx tsx scripts/x402-smoke.ts
```

Script source: [`scripts/x402-smoke.ts`](../scripts/x402-smoke.ts)

## Architecture notes (delta from spec)

1. **Next 14 Edge-runtime incompatibility with `@coinbase/x402`.** `@x402/next` requires Next ^16; `x402-next@1.2.0` requires Next ^15.5.9. apps/2048 runs Next 14.2.35. `@coinbase/cdp-sdk → axios` uses Node-only APIs (`setImmediate`, `process.nextTick`, `CompressionStream`) which crash Next 14's Edge middleware. Solution: hand-rolled per-route wrapper `withX402` in `apps/2048/src/lib/x402-handle.ts`, built on framework-agnostic `@x402/core` + `@x402/evm` + `@coinbase/x402` (all Node-runtime safe).

2. **Pre-settlement pattern.** Middleware-less design means each route handler: (a) lets `withX402` verify payment, (b) runs business logic, (c) returns a Response, (d) `withX402` settles via facilitator, attaches `x-payment-response` header, forwards response. If the handler returns a non-2xx (rate-limit 429, upstream 502), settlement still runs — matches the spec's "payment non-refundable in sample tier" contract. The only skip is verify failure.

3. **Bazaar metadata surfaces via `extensions` at the envelope top level** (not per-accepts). CDP facilitator auto-indexes on first successful settlement to https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources — no manual submission required.

4. **Address typo corrected.** Sprint spec had `0xA24f9122568e98b72f4dD61119C7D92D0975692` (39 hex chars, missing one D). Canonical `payTo` per on-chain `ChallengeEscrow.trustedSigner()` read on Base Sepolia is `0xA24f9122568e98b72f4dDD61119C7D92D0975692` (three Ds).

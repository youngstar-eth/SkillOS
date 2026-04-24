# x402 Mainnet Migration — Planning Doc

Pre-flight checklist + cost model for moving the six production x402
endpoints from Base Sepolia to Base mainnet.

## Config diff

| Key | Testnet (current) | Mainnet (target) |
|---|---|---|
| `X402_FACILITATOR_URL` | `https://api.cdp.coinbase.com/platform/v2/x402` | `https://api.cdp.coinbase.com/platform/v2/x402` *(same host; CDP multiplexes by network)* |
| `X402_NETWORK` | `eip155:84532` | `eip155:8453` |
| USDC contract | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC) |
| `X402_PAY_TO` | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` *(ChallengeEscrow testnet trustedSigner)* | **TBD — dedicated treasury wallet**, multisig-owned, audited, top-up pipeline ready |
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` | testnet-only project keys | Rotate to production project keys in CDP portal (same keypair format, different project) |
| Smoke test wallet | `X402_TEST_WALLET_PRIVATE_KEY` funded on Sepolia | Not needed in prod (agents fund themselves on mainnet) |

Code-side: the only change is the `X402_NETWORK` env var and the `payTo`.
The route config in `apps/2048/src/lib/x402-server.ts` reads both from env,
so no code edits needed. `ExactEvmScheme` handles both Sepolia and mainnet
USDC via CAIP-2 + USDC's canonical mainnet address (the scheme derives the
asset from the network automatically).

## Cost estimate for 10,000 transactions/month on mainnet

Per-transaction costs (Base mainnet as of Q2 2026):

| Item | Value | Source |
|---|---:|---|
| CDP facilitator fee (post-free-tier) | $0.001 / tx | CDP docs |
| Base L2 gas for `transferWithAuthorization` | ~85k gas × ~$0.002/L2 gas | our Sepolia logs (85,768 gas used, tx 0xdf846f98…) |
| Base blob/DA amortized | negligible (rolls into L2 gas) | OP Stack pricing |
| Coinbase-issued USDC transfer — no additional fees | — | circle.com/usdc |

Per-tx total: **≤ $0.003** (facilitator + gas).

Monthly @ 10,000 tx: **≤ $30 / month** in operational payment costs.

Per-route net revenue (after fees) at current pricing:

| Route | Gross/call | Per-tx fee | Net/call |
|---|---:|---:|---:|
| sp-tier-distribution | $0.010 | $0.003 | **$0.007** |
| decision-sample/any | $0.010 | $0.003 | **$0.007** |
| decision-sample/tier/1-4 | $0.020 | $0.003 | $0.017 |
| decision-sample/tier/5-7 | $0.050 | $0.003 | $0.047 |
| decision-sample/tier/8-plus | $0.100 | $0.003 | **$0.097** |
| coach-sample | $0.050 | $0.003 | $0.047 |

Weighted average (assuming uniform 1:1:1:1:1:1 call distribution): ~$0.040 net
per call, so 10k tx/mo ≈ **$400 gross revenue, ~$30 operational cost, ~$370 net**.

Coach-sample is the highest variable cost (hits real Claude Haiku — roughly
$0.01/call on Anthropic at Skillbase's current prompt size), so its effective
margin is ~$0.037/call, not $0.047. Still positive.

## Pre-flight checklist

Before flipping `X402_NETWORK` to mainnet in Vercel production:

- [ ] **Treasury wallet provisioned.** A new dedicated receiver for x402
      payments, separate from `STUDIO_PRIVATE_KEY`'s duel-escrow role.
      Multisig custody. Address hardcoded nowhere — `X402_PAY_TO` env
      only.
- [ ] **Treasury top-up pipeline.** Even though the treasury only receives
      USDC, it still needs ETH for the occasional outbound tx (e.g. sweep
      to cold storage). Auto-topup from Base Sepolia → Base mainnet ETH
      via Circle CCTP or manual bridge.
- [ ] **CDP production project.** New CDP project in portal with mainnet
      enabled + production API key. Rotate `CDP_API_KEY_ID` /
      `CDP_API_KEY_SECRET` on Vercel production env.
- [ ] **CDP quota check.** CDP free tier is 1000 tx/mo. At 10k tx/mo we're
      $9/mo above free. Set billing alerts at $20 and $50.
- [ ] **Rate limiter upgrade.** Current in-memory per-IP limiter leaks
      state across serverless instances. Migrate coach-sample (and any
      future Anthropic-backed endpoint) to Upstash Redis. Don't flip to
      mainnet without this — a spammer on a mainnet-priced endpoint can
      actually drain the Anthropic budget.
- [ ] **Monitoring.** Add per-endpoint Sentry/Grafana dashboards:
      settlement success rate, P50/P99 latency, per-day tx count, revenue
      by tier. Needed to evaluate price changes empirically.
- [ ] **Legal review.** Selling data via USDC on mainnet is a different
      compliance surface than testnet. Terms of Service for per-call data
      licensing. Jurisdictional check (are we offering a financial service
      under any US/EU definition?). Sign off from legal before flip.
- [ ] **Audited middleware.** `apps/2048/src/lib/x402-handle.ts` +
      `x402-server.ts` carry verify/settle logic handling real money. Run
      through security review (static analysis + manual) before mainnet.
      The non-refundable 429 path needs especially clear documentation.
- [ ] **Bazaar confirmation.** Verify testnet endpoints actually appeared
      in Bazaar before flipping mainnet — we want visual confirmation the
      auto-indexer is doing its job.
- [ ] **Mainnet smoke wallet.** Fund a fresh mainnet wallet with ~$5 USDC
      + $0.50 ETH. Run `scripts/x402-smoke.ts` with `X402_NETWORK=eip155:8453`
      before flipping traffic. Confirm 6/6 settle via mainnet BaseScan.
- [ ] **Rollback plan.** Keep the Sepolia env vars documented so a flag
      flip in Vercel can revert to testnet in < 5 min if mainnet has
      issues. Document the exact `vercel env add` commands.
- [ ] **Apex copy update.** `/x402` page headings and code blocks
      currently hardcode `eip155:84532`. Swap to `eip155:8453` and revise
      "Base Sepolia" → "Base" mentions across Hero / WhyBase / AiDataLayer.

## Execution order

1. Provision treasury + top-up pipeline. Verify with a $0.01 send/receive
   on mainnet via Etherscan.
2. Set up CDP production project + API keys.
3. Deploy rate-limiter migration (Upstash Redis) to testnet first. Run
   smoke + confirm limiter behavior under distributed load.
4. Audit middleware (internal + optional external). Fix any findings.
5. Run mainnet smoke with fresh wallet against a `preview` deployment
   (Vercel branch deploy). Do not flip production env yet.
6. Confirm Bazaar indexed mainnet entries.
7. Flip production `X402_NETWORK` + `X402_PAY_TO` + CDP keys in Vercel.
   Redeploy. Smoke again with mainnet wallet.
8. Update apex copy in same deploy window.
9. Announce mainnet launch.

## Open questions

- Does CDP honor x402 free-tier quotas per project or per org? Matters for
  multi-environment concurrent testing.
- Is there a Bazaar "featured" tier or paid-placement mechanism? Worth
  discussing with Coinbase DevRel.
- Do we want to expose the same 6 endpoints with dual-protocol pricing
  (x402 sample tier + paid API-key tier via Stripe) or keep the two
  channels strictly separated?

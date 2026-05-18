# RCA — 3-cron production 500 errors

**Sprint:** diag-3-cron-500
**Date:** 2026-05-18
**Scope:** Root cause analysis ONLY. No fix in this sprint.
**Phase 2 hardening pre-req. Mainnet cutover blocker.**

---

## TL;DR

1. **Two independent root causes, not one shared.** Sprint plan hypothesised a shared bug (H1 event signature drift). Evidence rules that out.
2. **Bucket A — `create-tournaments` (NEW failure on 2026-05-18):** sponsor wallet USDC depleted; `preflightSponsorBalance` throws. Confidence ~95%.
3. **Bucket B — both indexers (CHRONIC ≥3 days):** RPC provider rejected `getLogs` block-range request. Confidence ~90%.
4. **Production damage:** 1 day of missed tournament creation; ≥3 days of stale sponsor + creator dashboards. No funds at risk (sweepstakes posture intact; `sponsorPool()` still writes the SBT).

---

## Evidence

### Cron failure pattern (Vercel runtime logs, production, branch=main)

| Date (UTC) | Cron | Status | Active deploy |
|------------|------|--------|---------------|
| 2026-05-18 00:00:23 | create-tournaments | **500** | `dpl_EmZJ3t3uKG5eDtagq8JUGUxRvPG3` (PR #126 docs) |
| 2026-05-18 00:05:22 | settle-tournaments | 200 ✓ | (same) |
| 2026-05-18 00:15:00 | index-sponsor-events | **500** | `dpl_64ABUQext13GmgVQEj26TovpZCJW` (PR #127 docs) |
| 2026-05-18 00:23:48 | index-tournaments-created | **500** | (same) |
| 2026-05-17 00:00:29 | create-tournaments | **200 ✓** | `dpl_FVtyz3puMigtxfDbcQ6t7KHfLSwD` |
| 2026-05-17 00:15:38 | index-sponsor-events | **500** | (same) |
| 2026-05-17 00:23:41 | index-tournaments-created | **500** | (same) |
| 2026-05-16 00:00:14 | create-tournaments | **200 ✓** | `dpl_DLVNiVBwo3Xrs7N87JBHroT3BG3F` |
| 2026-05-16 00:15:48 | index-sponsor-events | **500** | (same) |
| 2026-05-16 00:23:00 | index-tournaments-created | **500** | (same) |

**Sprint premise correction:** sprint plan asserted all three crons fail daily.
The two indexers are chronic ≥3 days; `create-tournaments` was 200 ✓ on
2026-05-17 and 2026-05-16, first failed today. Two distinct buckets.

### Error message substring fingerprints

Vercel runtime log table truncates the message body, but the full-text `query`
filter functions as a substring oracle (the row only matches if the body
contains the term).

| Cron | Substring proven present | Implies |
|------|--------------------------|---------|
| create-tournaments | `"insufficient"`, `"balance"` | `tournament.create.preflight.insufficient_balance` event from `preflightSponsorBalance` (`packages/duel-backend/src/cron/tournaments.ts:296`) |
| index-sponsor-events | `"getLogs"`, `"block range"` | RPC provider rejected `publicClient.getLogs` call inside `runIndexSponsorEvents` (`packages/duel-backend/src/cron/sponsors.ts:146`) |
| index-tournaments-created | (same handler shape, same deploy) | `publicClient.getLogs` rejection at `index-tournaments-created.ts:186` |

Vercel-side log capture cap: the API truncates to ~32 chars and refuses to
stream raw message bodies for cron invocations. The substring oracle is the
maximum-fidelity evidence available without a redeploy-with-instrumentation
loop.

### Code state verified (origin/main HEAD at sprint start)

- `packages/duel-backend/src/cron/tournaments.ts:273-309` — `preflightSponsorBalance` throws `Error("runCreateTournaments: insufficient sponsor USDC balance — have X wei, need Y wei…")` when sponsor balance < total need. Caller `runCreateTournaments` rethrows; route handler returns `{ok:false, error: msg, status: 500}`.
- `packages/duel-backend/src/cron/sponsors.ts:130-160` — `MAX_BLOCK_SPAN = 5_000n`. Single `publicClient.getLogs({fromBlock, toBlock})` covering up to 5K blocks.
- `packages/duel-backend/src/cron/index-tournaments-created.ts:60-204` — mirror of the sponsors indexer; same `MAX_BLOCK_SPAN = 5_000n`.

### Handler ↔ contract ↔ ABI consistency check (rules out H1)

| Layer | `createTournament` arg count | `TournamentCreated` event field count |
|-------|-----------------------------:|--------------------------------------:|
| `contracts/src/TournamentPool.sol:475-484` (v2.2 source, NOT deployed) | 8 (with `devAddr`) | 9 (with `devAddr`) |
| `packages/contracts/src/abi.ts` (`TOURNAMENT_POOL_ABI`) | 7 (no `devAddr`) | 8 (no `devAddr`) |
| `packages/duel-backend/src/cron/tournaments.ts:457-471` (handler call) | 7 args | n/a |
| `packages/duel-backend/src/cron/index-tournaments-created.ts:188-200` (inline event filter) | n/a | 8 (no `devAddr`) |
| On-chain `0x52049b812780134d2F69D6c20C2ef881D49702da` (deployed 2026-04-29, v2.1) | 7 | 8 |

**All four runtime layers consistent (v2.1).** The v2.2 source changes
(`2ae8db4`, `e072fab`, `d158aff`) modify Solidity but have NOT been deployed
to Base Sepolia. `@skillos/contracts` ABI was not bumped alongside the source —
which is correct, because the bumped ABI would break the production handler
against the still-v2.1 on-chain contract.

H1 (event-signature drift) is therefore ruled out. The hypothesis was correct
in identifying the v2.2 source change but wrong about whether it had reached
production.

---

## Hypothesis cross-check matrix

| # | Hypothesis | Bucket A (create-tournaments today) | Bucket B (both indexers chronic) |
|---|------------|-------------------------------------|----------------------------------|
| H1 | TournamentCreated event signature drift (v2.2 added `devAddr`) | **RULED OUT** — on-chain still v2.1, ABI consistent | **RULED OUT** — same; topic0 mismatch would yield empty result not 500 |
| H2 | RPC endpoint block-range / chunk limit | Unlikely — no `getLogs` in handler hot path | **LIKELY** — substring `"getLogs"` + `"block range"` matched |
| H3 | Supabase RLS / write surface regression | Unlikely — substring `"insufficient"`/`"balance"` doesn't match Supabase error shape | Unlikely — same |
| H4 | Build artifact stale | Ruled out — both buckets ran on identical READY deploys yesterday/today |
| H5 | Env var miss (RPC URL / CRON_SECRET) | Ruled out — auth gate would 401 not 500 | Ruled out — same |
| H6 | Sponsor wallet USDC depleted (X9.1 preflight) | **LIKELY** — substring `"insufficient"` + `"balance"` matched the exact log event shape from `tournament.create.preflight.insufficient_balance` | N/A — indexers don't touch USDC |

---

## Root cause statements

### Bucket A — `create-tournaments` (2026-05-18 only)

> The sponsor wallet's USDC balance on Base Sepolia is below the daily-sweep
> total need (`prizePool × targets.length` = 5 USDC × 6 games + Monday-weekly
> doubles). `preflightSponsorBalance` at
> `packages/duel-backend/src/cron/tournaments.ts:273-309` throws synchronously,
> the route's `catch` block returns 500 with `{ok:false, error: msg}`.

**Confidence:** ~95%.
**Evidence:** error body contains `"insufficient"` + `"balance"`, exclusive to
the `tournament.create.preflight.insufficient_balance` event path; deployed
code unchanged between May 17 (200) and May 18 (500); transition only
explainable by external state change (wallet balance, USDC contract state,
or RPC).

**Why this matches the known pattern:**
Memory `[[project_match3_chronic_and_510_outage_post_yc]]` documents the
sponsor wallet burndown failure mode. PR #80 added the preflight check
explicitly so the cron would fail loudly at the top of the loop with a
structured deficit log, instead of mid-sweep ERC20 reverts with partial
daily coverage. **This sprint is the preflight working as designed — but
the loud signal is not reaching ops because there is no alert on Vercel
cron 500s.**

### Bucket B — `index-sponsor-events` + `index-tournaments-created` (chronic ≥3 days)

> `publicClient.getLogs({fromBlock, toBlock})` is called with a span up to
> `MAX_BLOCK_SPAN = 5_000n` blocks. The RPC endpoint (Alchemy Base Sepolia
> free tier per memory `[[reference_alchemy_base_sepolia_endpoint]]`) rejects
> requests over the free-tier block-range cap (10 blocks documented).
> The error propagates, the route's `catch` returns 500.

**Confidence:** ~90%.
**Evidence:** error body contains `"getLogs"` + `"block range"`; both indexers
fail with the same fingerprint; the indexers are the ONLY cron paths that
use `getLogs` (settle path uses Multicall3, create path uses direct
read/writeContract — both compatible with chunk-limited RPCs).

**Remaining 10% uncertainty:** could also be a misconfigured RPC URL
returning a `block range exceeded`-shaped error from a different provider
(QuickNode public tier, Base public RPC under load, etc). Substring match
proves the error mentions block range; it doesn't prove Alchemy specifically.

**Why the chronic pattern:**
Daily cadence (Hobby tier crons run once/day) + watermark advances ONLY on
successful sweep ⇒ each failed run extends the next run's required range,
locking the indexer in a self-reinforcing failure mode. The watermark is
either at `DEFAULT_DEPLOY_BLOCK - 1n = 40_851_425n` (first-run-failed) or
some early advance point, while the chain is now ~600K blocks ahead.

---

## Cross-bucket impact

| Fix scope | Crons recovered |
|-----------|----------------|
| Top up sponsor wallet to ≥30 USDC (or auto-funder) | 1 — `create-tournaments` only |
| Pin `getLogs` chunk size below RPC cap, or rotate to higher-tier RPC, or reset watermark to recent block | 2 — both indexers |

**No single fix unblocks all three.** Two separate sub-sprints recommended,
running in parallel.

---

## Production damage assessment

### Bucket A — `create-tournaments` not running
- **Since:** 2026-05-18 00:00:23 UTC (one daily tick missed)
- **Surface:** 6 daily tournaments × ~5 USDC pool not created on-chain
- **User-visible:** today's tournaments missing from /tournaments dashboard
- **Funds at risk:** none — sponsor wallet retains all unspent USDC
- **Backlog size:** 0 (tournaments are time-bounded; missed = gone, no replay)

### Bucket B — indexers not running
- **Since:** earliest verified failure 2026-05-16 00:15 UTC (3 ticks ≥); likely older — watermark inspection from `v2_sponsor_indexer_state` and `v2_tournament_indexer_state` would establish true onset
- **Surface (sponsor):** `v2_sponsor_contributions` table not advanced. Any sponsor-submitted `sponsorPool()` calls in the gap show no row in `tournament-sponsors` API → sponsor dashboard misleading
- **Surface (tournament-created):** orchestrator-created rows have `creation_tx_hash IS NULL` (designed to be backfilled by the indexer); SDK-created tournaments not in DB at all → not visible to readers
- **Funds at risk:** none — on-chain state authoritative; the indexer only mirrors. Sponsors who funded got their SBT (on-chain), just not the dashboard reflection
- **Backlog size:** N × `(now - watermark) / block_time` ≈ unknown until watermark queried. Sweep-from-deploy block scenario covers ~14 days × ~43200 blocks/day ≈ 600K blocks; at 5K span per run would need 120 runs to catch up

---

## Recommended fix scope (separate sub-sprints, NOT this one)

### Sub-sprint A1 — sponsor wallet refill ops
- Top up sponsor wallet to ≥60 USDC (2× daily need buffer)
- Add Vercel-side observability on cron 500 — Slack webhook or PagerDuty
- Out of scope: Phase 2 permissionless sponsor pool replacement of orchestrator funding

### Sub-sprint B1 — indexer RPC remediation
- Reduce `MAX_BLOCK_SPAN` to a chunk size compatible with current RPC tier (10 if free-tier Alchemy)
- Loop within one cron invocation: keep calling `getLogs` until `toBlock = safeLatest` or wall-clock budget exhausted
- Better: rotate to RPC tier with ≥10K block-range allowance — eliminates the chunking loop
- Backlog replay: one-time watermark reset OR sequential cron-run-until-caught-up — must be planned to not OOM the writer batch

---

## Phase 2 mainnet readiness signal

This RCA surfaces an alerting gap, not just a code bug. Mainnet cutover
**requires** alerting on cron 500s — at production-money stakes, "silently
returning 500 daily for 3 days" is unacceptable. The Phase 2 hardening
checklist should mandate:

1. Synthetic monitoring on every `/api/cron/*` path (run independently,
   alert on `ok:false`)
2. Slack/Telegram channel for cron-fatal alerts wired to Vercel log drain
3. Watermark monotonic-advancement assertion in a post-sweep cron run
4. Sponsor wallet USDC balance preflight alert at >24h-of-runway threshold

---

## Out of scope (deferred)

- Actual fix implementation (any bucket)
- Contract redeploy (v2.2 source remains undeployed; deployment is a
  separate sprint with its own audit/spec gates)
- Indexer backlog replay
- Alerting wiring (depends on Phase 2 ops infra choice)

---

## Pre-flight / verification log

- Repo state: origin/main at `97c9621` (PR #141 merged), with PR #140 + #141
  both confirmed present
- Worktree: `.claude/worktrees/diag-3-cron-500-rca` on branch
  `chore/diag-3-cron-500-rca`
- Vercel project: `prj_rx1pF35UJ9H7FUiufwPABFddgq0A` (skillbase-orchestrator),
  team `team_XyslOCNkXkP8tnjcTRs3yKSC`
- Log retention: Pro tier 30d confirmed via successful retrieval of
  2026-05-16 logs (older than the 7d Hobby tier)
- Memory consulted: `project_match3_chronic_and_510_outage_post_yc`,
  `project_post_yc_tournament_created_indexer`,
  `reference_alchemy_base_sepolia_endpoint`,
  `reference_vercel_logs_cli_historical`,
  `settle_tournaments_silent_swallow_phase2`

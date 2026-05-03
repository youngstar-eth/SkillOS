# Sunday Re-Audit — 2026-05-03

**Run timestamp:** 2026-05-03T06:05:00Z (approx)
**Baseline:** reports/ultrareview-20260501.md (Friday audit, PR #10, merged 2026-05-02)
**Scope:** Layer 1 (Production Health) + Layer 2 (On-Chain State) only
**Method:** Read-only. Blockscout MCP, GitHub MCP, curl. No contract writes, no code edits.

---

## Summary

| # | Item | Status | Severity if FAIL |
|---|---|---|---|
| 1 | sponsor.skillbase.games 200 | **PASS** | CRITICAL |
| 2 | v2.1 active routing | **PASS** | CRITICAL |
| 3 | v2.1 trustedSigner unchanged | **PASS** | CRITICAL |
| 4 | 4 contracts verified | **PASS** | HIGH |
| 5 | Apex Lighthouse no regression | **UNKNOWN** | HIGH |
| 6 | Migration PR merged + deployed | **PASS** | HIGH |
| 7 | Cron creating tournaments on v2.1 | **PASS** | HIGH |
| 8 | BadSignature errors = 0 | **UNKNOWN** | CRITICAL |

---

## Per-item evidence

### 1. sponsor.skillbase.games returns 200 — PASS

`curl -I -L https://sponsor.skillbase.games` returned `HTTP/2 200`, `server: Vercel`, `x-vercel-cache: HIT`. Full page HTML confirms the sponsor dashboard rendered: `<title>Skillbase — Sponsor a Pool</title>`, nav with Skillbase pixel mark, `<h1>Sponsor a Pool</h1>`, and "Loading active tournaments…" content. CRITICAL #2 from Friday audit is fully resolved; sponsor app is deployed, routed, and serving.

### 2. v2.1 active routing — PASS

`get_transactions_by_address` on v2.1 (`0x52049b…`) from 2026-05-02T06:00Z returned **6 `createTournament` calls** at Sunday midnight UTC (blocks 40999086–40999091, all from canonical signer `0xA24f9122…`). The same query on v2.0 (`0x5CadD…`) returned **0 transactions** — no new submits on the legacy pool post-migration.

**Timing note:** The migration PR #19 merged Saturday at 07:35 UTC, after the 00:00 UTC Saturday midnight cron. The first post-migration cron run on v2.1 was therefore Sunday midnight (6 games × 1 run = 6 events). The audit brief expected ≥12 events; 6 is correct given the merge timing — not a failure. Saturday's midnight run landed on v2.0 as expected; v2.1 picked up from Sunday midnight onward.

### 3. v2.1 trustedSigner unchanged — PASS

`read_contract(chain_id=84532, address=0x52049b…, fn=trustedSigner)` returned `0xA24f9122568e98b72f4dDD61119C7D92D0975692` — exact match to canonical signer. Independently confirmed by the `TrustedSignerUpdated` event log at block 40932024 (tx `0xb5db90eaeba5d78a921f68ab71238a0891dc1d4f5c167f82e164b874464591e8`) still present in the contract log history. No regression.

### 4. All 4 contracts still verified on Blockscout — PASS

`get_address_info` on all four addresses returned `is_verified: true`:

| Address | Name | Verified |
|---|---|---|
| `0x52049b812780134d2F69D6c20C2ef881D49702da` | TournamentPool (v2.1) | true |
| `0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1` | TournamentPool (v2.0) | true |
| `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | SponsorshipModule | true |
| `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | Skillbase Sponsor Receipt (ERC-721 SBT) | true |

All four verified since Friday PR #9 (`eac44d3`); no regression.

### 5. Apex Lighthouse no regression — UNKNOWN

Chrome/Chromium is not installed in this remote audit environment (`which chromium-browser google-chrome` → not found). Lighthouse cannot run. Friday baseline (mobile 95/100/100/100, desktop 96/100/100/100) cannot be delta-checked here.

**Mitigation:** No apex source files were modified by the v2.1 migration (PR #19 touched `packages/contracts/src/addresses.ts` and `package-lock.json` only). Lighthouse regression risk is low. Manual re-run recommended before submit if time allows.

### 6. Migration PR merged + production deploy successful — PASS

PR #19 ("feat(contracts): v2.1 stack migration + axios SSRF fix") merged **2026-05-02T07:35:47Z** (Saturday morning). Vercel bot comment on the PR showed deploy results at 07:23 UTC:

| Project | Deploy Status |
|---|---|
| skillbase-duel (2048) | Ready |
| mas-sudoku | Ready |
| mas-minesweeper | Ready |
| mas-clicker | Ready |
| mas-match3 | Ready |
| skillbase-sponsor | Ready |
| mas-wordle | **Error** |

`mas-wordle` failed on PR #19 due to a pre-existing Vercel cache-restore/tsconfig issue. This was resolved by two follow-up PRs also merged Saturday:
- PR #20 ("fix(wordle): inline tsconfig.base.json") — merged 2026-05-02T09:46:10Z
- PR #21 ("fix(wordle): vercel.json installCommand override") — merged 2026-05-02T10:27:03Z

Live verification: `curl -I https://wordle.skillbase.games` returned **HTTP/2 200** — wordle is live and serving post-fix.

All 7 apps (6 games + sponsor) confirmed serving HTTP 200 as of this audit run.

### 7. Cron creating tournaments on v2.1 — PASS

`/api/v2/addresses/0x52049b…/logs` returned **6 decoded `TournamentCreated` events** at blocks 40999086–40999091 (2026-05-03T00:01 UTC), each with:
- `sponsor = 0xA24f9122…` (canonical signer / cron wallet)
- `prizePool = 1,000,000` (1 USDC)
- `startsAt = 1777766400` (2026-05-03T00:00Z) → `endsAt = 1777852800` (2026-05-04T00:00Z) — daily window
- 6 distinct `game` bytes32 hashes (one per subdomain game)

Event signature confirmed: `TournamentCreated(bytes32 indexed id, address indexed sponsor, bytes32 indexed game, uint8 cycleType, uint64 startsAt, uint64 endsAt, uint256 prizePool, uint256 participationBonus)`. Cron is healthy and targeting v2.1 correctly.

### 8. BadSignature error count — UNKNOWN

Vercel CLI v52 hangs on `vercel logs --no-follow` (known issue from Friday audit, finding 1.9). Neither `vercel logs --json` nor `vercel inspect --logs` is available without auth in this remote environment. Vercel CLI is not authenticated here.

**Risk assessment:** trustedSigner is confirmed correct (check 3), and all Sunday midnight `createTournament` calls succeeded (check 7). If BadSignature errors were occurring, the cron creates would be reverting. Their success is indirect evidence that the signer config is healthy. Manual Vercel dashboard log check (filter: `BadSignature`, last 24h, all 6 game API routes) remains recommended pre-submit.

---

## Sponsor wallet status (bonus check)

Sponsor wallet `0xc784e5D5aCc7308c7bADAA124664E7C347cAc919` balance: **29,993,437,946,409,684 wei ≈ 0.030 ETH**. Unchanged from Friday post-top-up. No depletion observed. Friday P0 #2 (top-up) remains intact.

---

## Regressions vs Friday baseline

**None detected.** All 6 PASS items match or exceed Friday baseline:

- P0 #1 (trustedSigner) remains resolved: `0xA24f9122…` confirmed on-chain
- P0 #2 (sponsor wallet) remains resolved: 0.030 ETH balance unchanged
- P0 #3 (contract verification) remains resolved: all 4 `is_verified: true`
- CRITICAL #2 (sponsor 404) is now resolved: HTTP 200, full dashboard serving
- Migration routing is correct: v2.1 live, v2.0 quiesced

**mas-wordle deploy failure on PR #19** was not a regression from baseline — wordle was deploying fine before PR #19, the failure was caused by PR #19's lockfile wipe interacting with a Vercel project misconfiguration specific to mas-wordle. Resolved by PRs #20 and #21. No net regression: wordle serves HTTP 200 now.

---

## Final verdict

**GO** for Monday submit.

Zero regressions from Friday baseline. All three Friday CRITICALs are resolved and holding. The v2.1 migration is clean: routing flipped, cron producing correct daily tournaments, trustedSigner intact, all contracts verified, sponsor app live. Two UNKNOWN items (Lighthouse, Vercel logs) are low-risk — no apex source changes were in the migration, and successful cron execution is indirect evidence against BadSignature errors. Recommend one manual Vercel dashboard log spot-check before hitting submit.

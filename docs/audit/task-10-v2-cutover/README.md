# Task 10 — V2 cut-over backfill audit trail

Post-cutover broadcast receipts for the 6 daily tournament backfills onto
the v2 TournamentPool contract. Preserved separately from
`contracts/broadcast/` (which is forge-ephemeral + gitignored) so the
audit story survives future forge runs.

## Context

On 2026-04-23, Tournaments v2 shipped with a new contract address
(`0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1`). The daily-tournament
cron had already created today's 6 tournaments on the v1 contract at UTC
midnight — _before_ the backend flipped to v2. After the cut-over the
backend signs/broadcasts against v2; the 6 tournament ids existed only
on v1, so every `submitSoloScore` / `submitScore` reverted with
`TournamentNotFound`.

These broadcasts reconcile that drainage: the same 6 deterministic
tournament ids are created on v2 with identical params (startsAt, endsAt,
prizePool, participationBonus) matching the DB rows exactly. After this
operation, DB ↔ on-chain alignment holds for every Phase-1 game for
today's cycle. Tomorrow's cron runs on v2 natively — no further backfill
needed.

## Operation metadata

| Field | Value |
|---|---|
| **Date (UTC)** | 2026-04-23 |
| **Operator** | `0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe` (DEPLOYER wallet) |
| **Target contract (v2)** | `0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1` |
| **USDC contract** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Base Sepolia Circle) |
| **Chain** | Base Sepolia (84532) |
| **Rolled-back v1 contract** | `0xc5d13168908E29496B7C5072b08d06C2c65290F8` (preserved, not drained) |
| **Reason** | V1 → V2 contract migration; 1 cycle drainage |
| **Outcome** | 6 tournaments live on v2; `feeCollected[tid] == 0` per tournament (invariant fresh) |

## Transactions

All txs have `status: 0x1` (success).

### 2048 individual backfill — `2048-backfill-tx-2026-04-23.json`

| # | Function | Tx hash | Gas | Basescan |
|---|---|---|---|---|
| 1 | `USDC.approve(V2, max)` | `0xdb22d227d82eff468397b8243341ab516f9d2f97b9f85ce68a2a1dc33c61c5c8` | 55,785 | [view](https://sepolia.basescan.org/tx/0xdb22d227d82eff468397b8243341ab516f9d2f97b9f85ce68a2a1dc33c61c5c8) |
| 2 | `createTournament(2048)` | `0x89c10a1ab9a6e683e6f821828659d2172b3da8acd473098b924c2e2347b88227` | 190,043 | [view](https://sepolia.basescan.org/tx/0x89c10a1ab9a6e683e6f821828659d2172b3da8acd473098b924c2e2347b88227) |

### Batch 5 remaining backfill — `batch-5-backfill-tx-2026-04-23.json`

| # | Game | Tx hash | Gas | Basescan |
|---|---|---|---|---|
| 1 | clicker | `0xde6a5d2f8ad61bfcd5c6913f38f2c4e39b1b115393452d067dbdc47e961055ee` | 172,955 | [view](https://sepolia.basescan.org/tx/0xde6a5d2f8ad61bfcd5c6913f38f2c4e39b1b115393452d067dbdc47e961055ee) |
| 2 | match3 | `0x669122105c60d9654ae2c45d241542a29a7de538139e02f1ed1e03da870c6832` | 172,955 | [view](https://sepolia.basescan.org/tx/0x669122105c60d9654ae2c45d241542a29a7de538139e02f1ed1e03da870c6832) |
| 3 | minesweeper | `0x1d9566bd5d78541889d2028f7c07960f5e7901205138925997f8c54c7464bf5d` | 172,955 | [view](https://sepolia.basescan.org/tx/0x1d9566bd5d78541889d2028f7c07960f5e7901205138925997f8c54c7464bf5d) |
| 4 | sudoku | `0x7646a85f3b0426b7528231d8701dfefb8825cd5f4aadbf9e110b80e17f4b38e1` | 172,955 | [view](https://sepolia.basescan.org/tx/0x7646a85f3b0426b7528231d8701dfefb8825cd5f4aadbf9e110b80e17f4b38e1) |
| 5 | wordle | `0x1a2f83f6ee4e3bfde16a9b222d7bf856b55b1d12f44e7f4ca248761e07df819b` | 172,955 | [view](https://sepolia.basescan.org/tx/0x1a2f83f6ee4e3bfde16a9b222d7bf856b55b1d12f44e7f4ca248761e07df819b) |

Allowance skip: the 2048 backfill left USDC approval at `max uint256`, so
the batch script detected it and bypassed a second approve — 5 `createTournament`
calls only.

## Totals

| Metric | Value |
|---|---|
| Total on-chain txs | 7 |
| Total gas | 1,086,583 |
| Total USDC spent (prize pools) | 6.00 USDC (= 6 × 1 USDC) |
| ETH spent (gas) | ≈ 0.000045 ETH |

## Per-tournament post-state (on-chain ↔ DB reconciliation)

Read via `getTournament(bytes32)` against v2 contract after broadcast.
All 6 rows match DB exactly.

| Game | on_chain_id | startsAt | endsAt | prizePool | bonus | feeCollected |
|---|---|---|---|---|---|---|
| 2048 | `0x70a1b897…` | 1776902400 | 1776988800 | 1_000_000 | 50 | 0 |
| clicker | `0x2bfe7ade…` | 1776902400 | 1776988800 | 1_000_000 | 1 | 0 |
| match3 | `0x77d971f6…` | 1776902400 | 1776988800 | 1_000_000 | 15 | 0 |
| minesweeper | `0xb489b0f9…` | 1776902400 | 1776988800 | 1_000_000 | 20 | 0 |
| sudoku | `0x4478fa2d…` | 1776902400 | 1776988800 | 1_000_000 | 10 | 0 |
| wordle | `0x60ebce49…` | 1776902400 | 1776988800 | 1_000_000 | 200 | 0 |

Every `feeCollected == 0` — sweepstakes invariant fresh; no retry fees
commingled with prize pool at cycle start.

## Team-wallet caveat

On-chain `sponsor` for all 6 tournaments is DEPLOYER (`0x3a4F…`). The DB
`sponsor_address` column was written by the cron using STUDIO wallet
(`0xA24f…`). Both team-controlled, UI uses DB `sponsor_name = "Skillbase"`
for display — no user-facing impact. Settle refunds on today's cycle
flow back to DEPLOYER instead of STUDIO; tomorrow's cron-created
tournaments restore the pattern of `sponsor == STUDIO`.

## Related ceremonial tx

During Task 9 local verify a separate signer-mismatch was discovered and
fixed: V2 contract's `trustedSigner` was accidentally set to a stale
`SCORE_SIGNER_ADDRESS` env value at deploy time, while the backend signs
with STUDIO_PRIVATE_KEY. Fix tx:

- `setTrustedSigner(0xA24f…)`: [0x45f980c4915ace2a0d6b7e473550deefd455f2157f05c11089f4b9979ef26844](https://sepolia.basescan.org/tx/0x45f980c4915ace2a0d6b7e473550deefd455f2157f05c11089f4b9979ef26844) (gas 30,231)

Documented here for completeness; receipt JSON is in
`contracts/broadcast/SetTournamentPoolSigner.s.sol/84532/` (forge-local,
gitignored, can be regenerated from chain via `cast receipt` using the
hash above).

## Related commits

| Commit | Scope |
|---|---|
| `9e0b593` | `feat(contracts)` — v2 TournamentPool source + tests + deploy script |
| `98b0a83` | `feat(migration)` — v2_tournament_solo_runs + entries extensions |
| `54b253f` | `feat(backend+frontend)` — solo endpoint + solo page + 6-app replicate + BackfillV2Tournament.s.sol source (executed here) |

Main HEAD pre-cutover rollback target: `671dbd3`.

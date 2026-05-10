# Permissionless Sponsor Pool — Flow Documentation

> SkillOS tournaments are funded by sponsors. As of Phase 2 (sprint
> completed 2026-04-29), sponsorship is **permissionless on-chain** — anyone
> can fund any active tournament's prize pool by signing one transaction.
> No application, no Tally form, no manual review. Sanctions screening is
> the only gate, enforced at the contract level.

## TL;DR

```
Connect wallet → Pick tournament → Approve USDC → SponsorPool → Soulbound NFT receipt
```

Live UI: **https://sponsor.skillos.games** (or `https://skillbase-sponsor.vercel.app`
until DNS propagates).

## Architecture

### Three contracts, one entry point

| Contract | Role |
|---|---|
| `TournamentPool` v2.1 | Existing prize-pool contract, patched in this sprint to expose `fundPrizePool(bytes32 id, uint256 amount)`. Permissionlessly callable, only mutates `t.prizePool`, never touches `feeCollected[id]`. |
| `SponsorshipModule` | Permissionless sponsor entry point. Wraps `fundPrizePool` with sanctions screening + soulbound receipt mint + per-sponsor accounting. |
| `SponsorReceiptSBT` | ERC-5192 soulbound NFT minted to the sponsor on each successful `sponsorPool` call. Transfers + approvals revert. On-chain JSON metadata. |

The module is the canonical caller in production. The pool's
`fundPrizePool` is technically callable directly, but doing so bypasses
sanctions screening and the SBT receipt — module-fronted is the supported
sponsor surface.

### Sweepstakes-safe invariant

The legal posture rests on a strict storage-level separation:

```
TournamentPool storage:
  tournaments[id].prizePool   ← prize pool money (sponsor deposits, refunds out)
  feeCollected[id]            ← retry fee bucket (player retries, team withdrawals)
```

`fundPrizePool` is provably-only writing to `prizePool`. `chargeRetryFee`
is provably-only writing to `feeCollected`. `withdrawFees` is
provably-only reading from `feeCollected`. `settle` is provably-only
distributing from `prizePool`.

The Foundry test
`test_invariant_fundPrizePool_neverTouchesFeeCollected` verifies this for
arbitrary interleavings of `fundPrizePool`, `chargeRetryFee`, and
`withdrawFees` calls. After the cleanest possible bookkeeping, the team
wallet only ever receives retry fees; the prize pool only ever distributes
to winners and refunds dust to the original tournament sponsor.

## Sponsor flow (end-user)

1. Visit `https://sponsor.skillos.games`. Browse the cross-game listing
   of active tournaments (filterable by game; sorted by ends-soonest).
2. Click **Sponsor a Pool** on any row → `/[tournamentId]`.
3. Connect wallet (Coinbase Smart Wallet preferred; any EIP-1193 provider
   works via the apex's existing wagmi config).
4. Enter sponsorship amount (USDC, min 1.00). Wallet balance + current
   allowance to `SponsorshipModule` are shown live.
5. **Two transactions:**
   - **Approve USDC** — only required if `allowance(sender, module) < amount`.
     The UI advances automatically once the approval mines.
   - **Sponsor pool** — calls `SponsorshipModule.sponsorPool(tournamentId, amount)`.
     The contract pre-flights sanctions screening, pulls USDC, forwards to
     `TournamentPool.fundPrizePool`, and mints the receipt SBT.
6. Success state shows the tx hash + a deep link to your dashboard.

The dashboard at `/dashboard` lists every sponsorship the connected wallet
has made — receipt token id, amount, target tournament, BaseScan tx link.
Data lags up to 24 h on Vercel Hobby (cron at 00:15 UTC daily); manual
trigger possible with the bearer token. (Sub-daily cadence requires a
Vercel Pro upgrade or an external scheduler.)

## Pre-flight ordering inside `sponsorPool`

```
1. amount > 0                                (free)
2. sanctions oracle isSanctioned(msg.sender) (1 SLOAD on oracle)
3. USDC.safeTransferFrom(sender → module)    (external; reverts on insufficient allowance/balance)
4. TournamentPool.fundPrizePool(id, amount)  (bubbles TournamentNotFound / TournamentAlreadySettled)
5. SponsorReceiptSBT.mint(sender, id, amount) (after pool succeeds → no orphan receipts)
6. emit PoolSponsored(id, sender, amount, tokenId)
```

Sanctions check is second (before any USDC movement) so a sanctioned
wallet hits a dedicated error message, never a generic ERC-20 error.

## Sanctions screening

| Environment | Oracle |
|---|---|
| Testnet (Base Sepolia) | `MockSanctionsOracle` — owner-curated blacklist; deployer can `addToBlacklist(addr)` to test the revert path. |
| Mainnet (planned) | Chainalysis on-chain Sanctions Oracle at `0x40C57923924B5c5c5455c48D93317139ADDaC8fb` (Base mainnet). Same `isSanctioned(address) returns (bool)` interface as the mock — production swap is a single env-driven address change, no module redeploy. |

The oracle is hot-swappable by the module owner via
`setSanctionsOracle(ISanctionsOracle)`. New module deployments are NOT
required to migrate testnet → mainnet.

## Indexer

Cron at `apps/orchestrator/api/cron/index-sponsor-events` (migrated from
`apps/sponsor` in PR #33; see `apps/orchestrator/README.md` for the full
schedule table):
- Reads `v2_sponsor_indexer_state.last_indexed_block` for the
  SponsorshipModule address.
- Fetches `PoolSponsored` events from `lastIndexed + 1` to
  `(latestBlock - REORG_BUFFER)`, capped at `MAX_BLOCK_SPAN = 5000`
  blocks per run.
- Upserts to `v2_sponsor_contributions` with `ON CONFLICT (tx_hash,
  log_index) DO NOTHING` — idempotent against retries.
- Advances watermark only on successful sweep.

Schedule: daily 00:15 UTC (Vercel Hobby cap). For sub-daily cadence,
upgrade to Pro or use an external scheduler hitting:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://skillbase-orchestrator.vercel.app/api/cron/index-sponsor-events
```

## Smart contract addresses (Base Sepolia, deployed 2026-04-29)

| Contract | Address |
|---|---|
| `TournamentPool` v2.1 | [`0x52049b812780134d2F69D6c20C2ef881D49702da`](https://sepolia.basescan.org/address/0x52049b812780134d2F69D6c20C2ef881D49702da) |
| `SponsorshipModule` | [`0xD76670adB574A4C8D06dfF47127e7143d780ff87`](https://sepolia.basescan.org/address/0xD76670adB574A4C8D06dfF47127e7143d780ff87) |
| `SponsorReceiptSBT` | [`0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768`](https://sepolia.basescan.org/address/0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768) |
| `MockSanctionsOracle` | [`0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC`](https://sepolia.basescan.org/address/0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC) |
| Base Sepolia USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

ABIs are exported from `@skillos/contracts` (`SPONSORSHIP_MODULE_ABI`,
`TOURNAMENT_POOL_ABI` — extended with `fundPrizePool` + `PrizePoolFunded`
in this sprint).

**BaseScan verification status:** deferred. The Etherscan v2 multichain
API rejected our verification submissions for Base Sepolia despite local
bytecode matching the deployed bytecode byte-for-byte. Retry path:

```bash
forge verify-contract <addr> <fully-qualified-name> \
  --chain-id 84532 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --compiler-version v0.8.26+commit.8a97fa7a
```

## Mainnet migration checklist

When mainnet legal review clears:

1. Deploy `TournamentPool` v2.1, `SponsorshipModule`, `SponsorReceiptSBT`
   to Base mainnet (no mock oracle — the module wires directly to
   Chainalysis at `0x40C57923924B5c5c5455c48D93317139ADDaC8fb`).
2. Set `NEXT_PUBLIC_*` and runtime env vars on `apps/sponsor` Vercel
   project to mainnet addresses + `NEXT_PUBLIC_CHAIN_ID=8453`.
3. Set `SPONSOR_INDEXER_DEPLOY_BLOCK` to the actual mainnet deploy block.
4. Apply the same migrations to the production Supabase project.
5. Update mainnet sponsor wallet allowance docs.

## Reference

- Contracts: `contracts/src/{TournamentPool, SponsorshipModule, SponsorReceiptSBT, MockSanctionsOracle, ISanctionsOracle}.sol`
- Foundry tests: `contracts/test/{TournamentPool, SponsorshipModule, SponsorReceiptSBT}.t.sol`
- Indexer: `packages/duel-backend/src/cron/sponsors.ts`
- Frontend: `apps/sponsor/src/app/`
- Smoke: `scripts/sponsor-smoke.sh`
- Migration: `supabase/migrations/v2_20260429_sponsor_contributions.sql`
- Deploy script: `contracts/script/DeploySponsorStack.s.sol`
- Deployment record: `contracts/deployments/sponsor-stack-base-sepolia.json`

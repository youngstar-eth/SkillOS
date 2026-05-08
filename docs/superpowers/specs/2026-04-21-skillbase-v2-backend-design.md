# SkillOS V2 — Backend + Contract Integration Design

**Owner:** Agent 2 (Opus)
**Date:** 2026-04-21
**Deadline:** 2026-04-27 (Base Batches 003 submission)
**Branch:** `v2-clean`
**Scope:** async 2-player 2048 duel with on-chain USDC escrow

## 1. Goals & non-goals

### Goals
- Async matchmaking: P1 stakes → queued; P2 stakes → FIFO match; both play same seed; higher score wins pool.
- Real `ChallengeEscrow` ABI wired through `src/lib/contracts.ts`.
- Four public API routes (`queue`, `queue/accept-tx`, `status`, `submit`) plus an internal `settle` helper.
- Server-signed attestation triggers on-chain `settle(...)` when both players have submitted.
- Supabase schema with RLS, indexes, and race-safe state transitions.

### Non-goals
- Leaderboards, profiles, admin tools, analytics.
- ZK proofs or on-chain gameplay (`V2` trust-client; ZK = future work).
- Relayer / gas sponsorship.
- Custom cancel endpoint (contract's `expireOpen` is sufficient).
- Multi-game support (`gameSlug` is hardcoded to `keccak256("2048")`).

## 2. Critical decisions (locked)

1. **P2 flow** — P1 calls `createChallenge` on-chain, P2 calls `acceptChallenge` on-chain. API is the matchmaker, not a relayer. Each player signs their own two transactions (`USDC.approve` + escrow call).
2. **Refund** — Timeout via `ChallengeEscrow.expireOpen()`. No custom cancel endpoint. Frontend surfaces the contract call when `status='queued'` and creation time > 5 min ago.
3. **Tie break** — First submitter wins (compare `submitted_at`). Deterministic, zero contract gymnastics.
4. **Score validation** — Trust client with sanity checks: integer, `0 < score < 50000` (typical 2-min 2048 runs <25k; 50k is a generous sanity bound), submitted within play window + 30s grace, same address cannot submit twice. Code comment labels this **"V1 trust-client, V2 ZK-proof"**.

## 3. Fixed constants (V2 demo)

| Constant | Value | Notes |
|---|---|---|
| Stake | `1_000_000` (1 USDC, 6 decimals) | Global constant, not user-chosen |
| Game slug | `keccak256("2048")` | Passed to `createChallenge` |
| Challenge `duration` | 600 s (10 min) | Single on-chain expiry; covers queue wait + play window + buffer (see note below) |
| Queue wait budget | 300 s (5 min) | Server-side target; if exceeded, P1 may call `expireOpen` |
| Play window | 120 s (2 min) | Client timer; server-enforced on `submit` |
| Submit grace | 30 s | Beyond play window, to cover client latency |
| Walkover threshold | play window + grace = 150 s after `acceptedAt` | Server may sign `walkover` after this |
| Seed format | `0x`-prefixed hex, **32 bytes / 64 hex chars**, text column | Shared with Agent 1 for deterministic 2048 RNG |

**Expiry clock note.** `ChallengeEscrow.expiresAt` is set once at `createChallenge` time as `block.timestamp + duration`. There is only one on-chain clock. The `duration=600` value is large enough to cover the worst case (P2 joins at t≈300, then 120s play + 30s grace = t≈450) with margin. The 5-min queue-wait and 2-min play-window are *server/client* budgets, not separate on-chain deadlines.

## 4. Match lifecycle

```
P1:  USDC.approve(escrow, 1e6)
     client generates uuid v4 → bytes32 id = keccak256(uuid)
     createChallenge(id, gameSlug=keccak256("2048"), stake=1e6, duration=600)
     → POST /api/duel/queue { address, createTxHash, matchId }
     → DB: insert row status='queued', seed=random32, player1=addr, onchain_id=id

P2:  USDC.approve(escrow, 1e6)
     POST /api/duel/queue { address }   // no createTxHash → matchmaker branch
     → API atomically claims FIFO oldest status='queued' row and sets
       status='matched', player2=addr, matched_at=now()
     → returns { matchId, challengeId, seed, opponent, stakeAmount }
     → client calls acceptChallenge(challengeId)
     → POST /api/duel/queue/accept-tx { matchId, acceptTxHash }

Both: play 2048 with the shared seed, 2-min timer
     → POST /api/duel/submit { matchId, address, score }
     → DB: set player{N}_score, player{N}_submitted_at,
            status transitions queued → matched → player1_submitted
                                  → player2_submitted → settled
     → On 2nd submit: triggerSettle(matchId) runs in-process
            winner = higher score; tie → earlier submitted_at
            digest  = keccak256(abi.encode(id, winner, p1Score, p2Score, contract, chainId))
            ethSig  = personal_sign(digest) with STUDIO_PRIVATE_KEY
            broadcast settle(id, winner, p1Score, p2Score, sig)
            DB: status='settled', winner_address, settle_tx_hash

Timeouts (contract primitives, no custom logic):
  queued > 5 min, no P2 (and challenge expired):           anyone calls expireOpen(id) → P1 refunded
  matched, only one submit > 150 s after acceptedAt:       server signs walkover(id, submitter)
  matched, neither submits and expiresAt passed:           anyone calls expireAccepted(id) → both refunded
```

### UX note for Agent 1 (documented here for cross-team clarity)
- P1 flow: **2 transactions** — `USDC.approve` + `createChallenge`
- P2 flow: **2 transactions** — `USDC.approve` + `acceptChallenge`
- Score submission does **not** require a signed tx from the player (server-signed attestation settles the match)

## 5. Module layout

| File | Purpose | Depends on |
|---|---|---|
| `src/lib/contracts.ts` | Real `ChallengeEscrow` ABI (extracted from `contracts/out/ChallengeEscrow.sol/ChallengeEscrow.json`), addresses, chain id, `GAME_SLUG`, `STAKE_AMOUNT` | env |
| `src/lib/supabase.ts` | Browser + service clients, `Duel` row type | `@supabase/supabase-js` |
| `src/lib/seed.ts` | Crypto-strong 32-byte seed generator (`0x` + 64 hex) + bytes32 id from uuid | `node:crypto` |
| `src/lib/attestation.ts` | Build settle/walkover digest, personal_sign with studio key | `viem` |
| `src/lib/rpc.ts` | Server-side viem wallet client for Base Sepolia | `viem` |
| `src/lib/settle.ts` | `triggerSettle(matchId)` — in-process function, called from submit route | supabase, attestation, rpc |
| `src/app/api/duel/queue/route.ts` | Single POST endpoint; branches on whether `createTxHash` is present (P1 enqueue) or absent (P2 FIFO match) | supabase |
| `src/app/api/duel/queue/accept-tx/route.ts` | POST accept tx hash after `acceptChallenge` confirms | supabase |
| `src/app/api/duel/status/route.ts` | GET read-only match lookup by `matchId` or `address` | supabase |
| `src/app/api/duel/submit/route.ts` | POST score; triggers settle when both have submitted | supabase, settle |
| `supabase/migrations/v2_20260421_duels.sql` | Extend scaffold: RLS, indexes, updated_at trigger | — |

No internal HTTP `/api/duel/settle` endpoint. Settle is a direct function call from `submit/route.ts` via `triggerSettle(matchId)`. Smaller attack surface, no auth header to forget, no self-call latency.

## 6. Data contract (API ↔ Agent 1 frontend)

```ts
// P1 initial call (includes createTxHash)
POST /api/duel/queue
  req:  { address: `0x${string}`, createTxHash: `0x${string}`, matchId: string }
  resp: { matchId, challengeId, seed, status: 'queued', stakeAmount: '1000000' }

// P2 match call (no createTxHash)
POST /api/duel/queue
  req:  { address: `0x${string}` }
  resp: { matchId, challengeId, seed, status: 'matched',
          opponent: `0x${string}`, stakeAmount: '1000000' }
  // If no queued row exists: 404 { error: 'no_queued_challenges' }

POST /api/duel/queue/accept-tx
  req:  { matchId: string, acceptTxHash: `0x${string}` }
  resp: { ok: true }

GET  /api/duel/status?matchId=<uuid>
GET  /api/duel/status?address=<0x..>
  resp: Duel row (sanitized — no signing state)

POST /api/duel/submit
  req:  { matchId: string, address: `0x${string}`, score: number }
  resp: { submitted: true, settled: boolean,
          winner: `0x${string}` | null,
          settleTxHash?: `0x${string}` }
```

## 7. Supabase schema (extensions to scaffold)

Existing scaffold (see `supabase/migrations/v2_20260421_duels.sql`) already has the `v2_duels` table, status check constraint, and basic indexes. We extend with:

```sql
-- RLS: anon can only read their own rows (by address match); writes are service-role only
alter table v2_duels enable row level security;

create policy v2_duels_anon_select on v2_duels
  for select to anon
  using (true);  -- demo: reads are public; no PII beyond wallet addresses

-- No insert/update/delete policy for anon → service role (via getSupabaseService) has full access;
-- browser client can only read.

-- Extra indexes
create index if not exists v2_duels_onchain_id_idx on v2_duels(onchain_id);
create unique index if not exists v2_duels_matched_pair_unique
  on v2_duels(player1_address, player2_address)
  where status in ('matched','player1_submitted','player2_submitted','settled');

-- updated_at helper
alter table v2_duels add column if not exists updated_at timestamptz default now();
create or replace function v2_duels_set_updated_at()
  returns trigger as $$ begin new.updated_at = now(); return new; end $$ language plpgsql;
drop trigger if exists v2_duels_updated_at on v2_duels;
create trigger v2_duels_updated_at
  before update on v2_duels for each row
  execute function v2_duels_set_updated_at();
```

## 8. Race conditions & how they're handled

| Race | Mechanism |
|---|---|
| Two P2s claim the same queued row | Atomic `UPDATE ... WHERE status='queued' AND id=(SELECT id FROM v2_duels WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. At most one succeeds. |
| Duplicate settle broadcast | Before signing, re-read row with service client; bail if status already `settled`. |
| Double submit by same address | DB unique guard: `player{N}_score` is only set if currently null; submit route checks caller matches `player{1,2}_address` and that their slot is still `null`. |
| Simultaneous submits by both players | Second write sees both slots filled → `triggerSettle` runs in the second request's handler. First request returns `{settled:false}`; second returns `{settled:true}`. |

## 9. Attestation format

```
digest   = keccak256(abi.encode(id, winner, creatorScore, challengerScore, contractAddress, chainId))
ethHash  = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest))
signature = personal_sign(ethHash, STUDIO_PRIVATE_KEY)
```

`creatorScore` corresponds to `player1` (the `createChallenge` caller), `challengerScore` to `player2` (the `acceptChallenge` caller). Order is mandatory — the contract's `_verifySettleSignature` expects this exact encoding.

Walkover digest (used if one player fails to submit after play window + grace):
```
digest = keccak256(abi.encode(id, winner, "walkover", contractAddress, chainId))
```

## 10. Environment variables

Server-side only (never prefixed with `NEXT_PUBLIC_`):
- `SUPABASE_SERVICE_ROLE_KEY`
- `STUDIO_PRIVATE_KEY` — must match `trustedSigner` set on the deployed ChallengeEscrow
- `BASE_SEPOLIA_RPC_URL`

Public (safe in browser):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CHAIN_ID` (84532)
- `NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS`

## 11. Testing posture

- **Unit**: seed generator output shape, attestation digest vs known vectors, tie-break comparator, score sanity-check function. Files under `src/lib/__tests__/`.
- **Integration** (scripted, optional): two-wallet flow against live Base Sepolia + staging Supabase.
- **Manual**: real duel coordinated with Agent 1 after API freeze.

No test framework added if one doesn't already exist — lean on `tsx` one-off scripts.

## 12. Out-of-scope / known limitations (V2 demo)

- Trust-client scores: a determined cheater can post a fabricated score. Acceptable for demo; V2 roadmap tracks ZK replay proof.
- Walkover logic exists in the contract but the V2 API does not auto-trigger walkovers on a schedule — a cron or manual admin call is required. Documented, not fixed.
- Only one active challenge per player-pair (unique partial index). Rematch requires the previous duel to be `settled` or `refunded`.

## 13. Open questions

None at time of writing. All four critical decisions are locked.

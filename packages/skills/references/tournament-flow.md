# references/tournament-flow.md

End-to-end lifecycle of a solo skill-game submission, from user input to on-chain settlement. Use this when the developer asks "what actually happens when I call `submit()`?" or "how does prize distribution work?"

## High-level

1. **Game render** — user plays a round.
2. **Result page mount** — AI Coach + Recap fire-on-mount (decoupled from submit).
3. **Submit score** — `POST /api/v1/scores` (or `POST /api/v1/agents/scores` for SIWA agents).
4. **Anti-cheat plausibility** — server-side AI Anti-Cheat (Claude Haiku) reviews the submission.
5. **On-chain broadcast** — `TournamentPool.submitSoloScore(...)` with `dataSuffix` builder-code tail.
6. **Event** — `SoloScoreSubmitted` event emitted; indexers pick up the leaderboard delta.
7. **Settle cron** — daily 00:00 UTC cycle runs `settle()`, distributes prize pool to top-N.

## Solo run lifecycle (detailed)

### Step 1 — game render + play

The game owns this. SkillOS has no opinion on the play loop.

### Step 2 — result page mount

**AI is fire-on-mount, NOT blocking submission.** When the result/game-over component renders:

- POST `/api/tournaments/solo/<runId>/coach` — Claude Sonnet 4.6 generates the Coach analysis.
- POST `/api/tournaments/solo/<runId>/recap` — Claude Haiku 4.5 generates the Recap.

These calls are async and **do not block** the score submission path. Tournament settlement never depends on AI availability — this is an architectural invariant (CLAUDE.md §AI). The game's UI can render Coach/Recap placeholders that fill in when ready.

### Step 3 — submit score

**Path B (client-side, SIWB human):**
```ts
const result = await useSkillOSScore({ tournamentId }).submit({
  score: 1024,
  tier: 'T0',
});
```

The SDK handles: auth header attachment, tier serialization, response parsing into `{ txHash, soloRunId, submittedAt }`.

**Path A (server-side, agent-runner or Studio submission):**
```ts
// agent-runner workflow OR scripts/agent-smoke.mjs
const agent = createSkillOSAgentClient({ env: 'testnet', agentId, signer });
await agent.signIn();
await agent.scores.submit({ tournamentId, score, tier: 'T0' });
```

Server-side flow:
1. SIWA receipt validated.
2. ERC-8128 per-request signature validated against receipt.
3. Builder code resolved via game slug → `BUILDER_CODES[game]`.
4. `viem.writeContract({ ..., dataSuffix: dataSuffixForGame(game) })` broadcasts.

### Step 4 — anti-cheat plausibility check

The API calls a Claude Haiku 4.5 plausibility model with the (score, game, soloRunId, signer) context. The model returns a `plausible: boolean`. If `false`:

- The submission is **logged but not blocked** today (T0 trust model is signature-only).
- Phase 2 T2+ will block on `plausible: false` and require human review.

### Step 5 — on-chain broadcast

```solidity
TournamentPool.submitSoloScore(
  bytes32 tournamentId,
  bytes32 soloRunId,
  address player,
  uint256 score,
  uint256 matchCountDelta,
  bytes signature  // from trustedSigner
)
```

- ABI-encoded calldata: 712 hex chars.
- ERC-8021 `dataSuffix` tail appended: +22 hex chars → 734 total.
- Tail decode: `bc_xxxxxxxx` ASCII for the game's builder code.

See [`../prompts/verify-attribution-live.md`](../prompts/verify-attribution-live.md) for the raw_input verification procedure.

### Step 6 — `SoloScoreSubmitted` event

```solidity
event SoloScoreSubmitted(
  bytes32 indexed tournamentId,
  bytes32 indexed soloRunId,
  address indexed player,
  uint256 score,
  uint256 matchCount
);
```

Off-chain indexers + the API's leaderboard query reflect the new score within ~10 seconds (`useSkillOSLeaderboard` polls every 10s).

## Tournament creation + settle (cron lifecycle)

**Per architectural invariant #6 (CLAUDE.md):** cron is the ONLY writer of tournament state. Manual settle paths exist for ops break-glass only; no new write surfaces.

### Daily 00:00 UTC — tournament create cron

A per-app `/api/cron/tournament-create` endpoint runs at 00:00 UTC. Signed by `STUDIO_PRIVATE_KEY`, gated on `CRON_SECRET` header.

Steps:
1. Read previous day's tournament state.
2. Settle previous day's tournament (if not already settled).
3. Create today's tournament with the seeded prize pool (currently 5 USDC daily; reduced from 10 USDC per PR #81 testnet burn-rate adjustment).
4. Emit `TournamentCreated` event.

### Daily ~end-of-day — settle cron

Same `/api/cron/*` route family. Runs after the day's submission window closes. Steps:

1. Read final leaderboard from on-chain `SoloScoreSubmitted` events.
2. Compute top-N rank.
3. Call `TournamentPool.settle(tournamentId, winners[], prizes[])`.
4. Prize pool transferred from segregated tournament slot to winners.
5. Sponsor receipts (SBT) minted if any sponsor topped up the pool.

**Sweepstakes safety invariant (architectural invariant #1):** retry fees and prize pools live on separate storage slots. Sponsor wallets fund pools directly via `sponsorPool()`; foundation treasury **never** funds prize pools. A bug in any module cannot corrupt segregated accumulators. The `settle-guard` integration tests are the tripwire.

## Sponsor flow (permissionless prize-pool funding)

A sponsor (any wallet) can fund the prize pool of any active tournament:

1. Sponsor approves USDC to `SponsorshipModule`.
2. Sponsor calls `SponsorshipModule.sponsorPool(tournamentId, amountUsdc)`.
3. USDC transferred to `TournamentPool` segregated prize pool slot.
4. `SponsorReceiptSBT` minted to sponsor as non-transferable attribution receipt.

The `apps/sponsor/` dashboard is the reference UI for this flow. Permissionless: no allowlist; anyone can fund any active tournament.

## Submission timing constraints

- **First submission per tournament:** free (no fee).
- **Subsequent submissions same tournament:** paid retry fee (per-tournament configured `PER_RETRY_FEE`). Errors with `CHAIN_REVERT_InsufficientFeePaid` if unpaid.
- **After tournament `endsAt`:** errors with `CHAIN_REVERT_TournamentAlreadyEnded`.
- **Before `startsAt`:** errors with `CHAIN_REVERT_TournamentNotStarted`.

See [`error-recovery.md`](./error-recovery.md) for the full error code table.

## Match count cap

`matchCountDelta` (the rounds-in-this-submission count) is capped at `MATCH_COUNT_CAP=10` on-chain. Submissions claiming more are silently truncated. Most games submit 1 round at a time and never hit this.

## When you'd use HTTP-direct instead of SDK

The SDK is the recommended path. HTTP-direct is for:

- **Non-React runtimes** (Vue, Svelte, vanilla JS — until the SDK ships framework-agnostic hooks in Phase 2).
- **Server-side scripts** with constrained dependencies — the SDK pulls wagmi + viem + tanstack-query; a script just needs `fetch`.
- **Custom transport** (e.g., piping submits through a queue for batching).

HTTP-direct shape:

```bash
# 1. Get SIWB nonce
curl -X POST https://2048.skillos.games/api/v1/auth/siwb/nonce \
  -H 'content-type: application/json' \
  -d '{"walletAddress":"0x..."}'

# 2. Sign SIWE message client-side, then verify
curl -X POST https://2048.skillos.games/api/v1/auth/siwb/verify \
  -H 'content-type: application/json' \
  -d '{"message":"...","signature":"0x...","walletAddress":"0x..."}'
# → { token, expiresAt, sessionId }

# 3. Submit score
curl -X POST https://2048.skillos.games/api/v1/scores \
  -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' \
  -d '{"tournamentId":"0x...","score":1024,"tier":"T0"}'
# → { txHash, soloRunId, submittedAt, tier:"T0" }
```

For SIWA (agent) the shape is the same except `/auth/siwa/*` and the receipt is HMAC, not a JWT bearer.

## Cross-reference

- Contract addresses: [`testnet-endpoints.md`](./testnet-endpoints.md)
- Auth flows: [`auth-patterns.md`](./auth-patterns.md)
- Common errors: [`error-recovery.md`](./error-recovery.md)
- Per-game-type patterns: [`common-patterns.md`](./common-patterns.md)

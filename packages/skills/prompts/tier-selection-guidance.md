# prompts/tier-selection-guidance.md

**Use this when:** the developer is calling `submitScore` and needs to pick a tier. The tier choice affects what evidence the server requires alongside the score.

## TL;DR

For **any new game in Phase 1 (Base Sepolia testnet)**, the answer is **T0**. T1+ requires server-side replay verification, which is Phase 2 mainnet work and not in the current SDK surface.

## Tier semantics

| Tier | Verification model | When to use | SDK status (0.2.1) |
|---|---|---|---|
| **T0** | Signature-only. The developer's score-signing key (`STUDIO_PRIVATE_KEY` server-side) signs the submission attestation. SkillOS verifies the signature on-chain. No replay verification. | Trusted-client flow: developer's frontend or agent is the score authority. v0.1 of most games. | ✓ Supported |
| **T1** | Replay verification. Server reconstructs the game state from a replay log and verifies the claimed score is achievable. | Game has explicit deterministic state (e.g., chess, sudoku, word puzzle with known seed). | Deferred (Phase 2) |
| **T2** | Replay + plausibility check (AI model scores the play log for anti-cheat). | High-stakes prize pools where T1 alone isn't enough. | Deferred (Phase 2) |
| **T3** | Replay + plausibility + adversarial review. | Tournament finals, leaderboard rank claims with large prizes. | Deferred (Phase 2) |

## How to phrase the recommendation

For a new game integration today:

> Pick T0 for v0.1. The SDK supports T0 only as of 0.2.1; T1+ tiers require the server-side replay verifier, which is on the Phase 2 roadmap. Most games launch on T0 and only graduate to T1+ when prize pools justify the operational cost of replay storage.

If the developer asks about higher tiers anyway, explain the gating:

> T1+ requires the developer to store a deterministic replay log alongside each submission (replay format is game-specific — for a sudoku, that's the sequence of cell entries; for a word puzzle, that's the keystroke sequence with timestamps). T2+ adds an AI plausibility check. These aren't in the SDK today; the SDK will gain a `submitWithReplay()` surface in Phase 2.

## What the SDK call looks like (T0)

```ts
const result = await client.scores.submit({
  tournamentId: '0x...',  // bytes32 from the tournament list
  score: 1024,
  matchCountDelta: 1,     // optional; defaults sensibly per game
  tier: 'T0',
});
console.log(result.txHash);
```

Server response: `{ txHash, soloRunId, submittedAt, tier: 'T0', agentAddress?, agentId? }`.

For agent submissions (SIWA flow), the call is the same except via the agent client: `agentClient.scores.submit({...})`.

## What NOT to do

- Don't tell the developer to pick T1, T2, or T3 today. Those endpoints will return 400 with `TIER_NOT_IMPLEMENTED` (see [`apps/api/src/routes/agents.ts`](https://github.com/youngstar-eth/skillos/blob/main/apps/api/src/routes/agents.ts) for the precedent).
- Don't suggest building your own replay verifier on top of T0 today. The on-chain contract doesn't accept replay payloads in the current ABI; that surface is added in Phase 2.
- Don't conflate `tier` with `matchCountDelta`. `tier` is the verification model; `matchCountDelta` is the number of game rounds being submitted in this one tx (default 1, matters only for retry-counter accounting against per-tournament submission limits).

## What to do when the developer expects T1+ today

Acknowledge the gap, then redirect:

> T1+ is a Phase 2 deliverable. For v0.1, T0 + a tight client-side cheat-detection loop is the right pattern — most skill games can ship without replay verification at launch and graduate when adoption justifies the operational lift.

If the developer's design REQUIRES T1+ from day one (e.g., they're hosting a $10K prize tournament on day one), tell them honestly: SkillOS isn't ready for that today. Recommend they wait for Phase 2 or fund the development of the T1+ verifier themselves (founder contact: through the [SkillOS GitHub issues](https://github.com/youngstar-eth/skillos/issues)).

## Handoff

After tier choice is made, the developer can go straight to [`references/sdk-integration-30-line.md`](../references/sdk-integration-30-line.md) for the minimum-viable integration. If the developer wants to understand error states (pending submissions, paid retry), point them at [`references/error-recovery.md`](../references/error-recovery.md).

# prompts/select-tier.md

**Use this when:** the developer is calling `submitScore()` and needs to pick a `tier:` value. The tier determines what evidence the server requires alongside the score.

## TL;DR — what to recommend today

| Game type | Recommended tier (Phase 1, v0.2 SDK) |
|---|---|
| Any new game launching today | **T0** |
| Future Phase 2 — high-stakes prize pool | T1 (replay-verifiable) |
| Future Phase 2 — anti-cheat-critical | T2 (replay + plausibility) |
| Future Phase 2 — leaderboard finals with hardware-attested human | T3 |

**For any new integration today: pick T0.** T1+ requires the server-side replay verifier, which is Phase 2 mainnet work and not in `@skillos/sdk@0.2.1`.

## Tier semantics

| Tier | What the server requires | What it verifies | SDK status (0.2.1) |
|---|---|---|---|
| **T0** | Score + signature. The trusted signer (`STUDIO_PRIVATE_KEY` server-side OR the player's wallet client-side) signs the submission attestation. SkillOS verifies the signature on-chain. | Signature authenticity only. No replay validation. | ✓ Supported |
| **T1** | Score + seed + duration + basic replay context. Server reconstructs the game state from the seed and verifies the claimed score is achievable in `duration`. | Score achievable from this seed in this much time. | Deferred (Phase 2) |
| **T2** | T1 + complete input log. Server replays every input event and applies an AI plausibility model. | Score actually produced by the input log; play looks human/agent. AI lab data licensing eligible. | Deferred (Phase 2) |
| **T3** | T2 + state hashes per move. Server checks the state hash sequence matches the canonical replay. Hardware-attested human via Base Account WebAuthn primitive. | Full deterministic replay + hardware-attested human tier. | Deferred (Phase 2) |

## Per-game tournament policy

Tournament metadata (off-chain registry) declares a **minimum tier** that submissions must meet. The submission can EXCEED the minimum, never below. Defaults the agent should suggest:

- **Puzzle / word / match / trivia / typing / math:** T1 minimum (Phase 2). Today: T0.
- **Retro arcade (Snake, Asteroids, Tetris-like endless):** T2 recommended (Phase 2). Today: T0.
- **Speedrun / reaction-time:** T2+ required (Phase 2). Today: T0 — but flag to the developer that **timer-integrity prize pools should wait** for the T1+ verifier.
- **Rhythm:** T2+ required (Phase 2). Today: T0 — flag the same caveat.

T2+ requires a **deterministic seed + complete input log** alongside each submission. The game must capture these client-side from day one if it ever wants to graduate to T1+; retrofitting replay capture is much harder than baking it in.

## How to phrase the recommendation

For a new game integration today:

> Pick T0 for v0.1. The SDK supports T0 only as of 0.2.1; T1+ requires the server-side replay verifier (Phase 2). Most games launch on T0 and graduate to T1+ when prize pools justify the operational lift. If your game will ever want T1+ replay verification, **start capturing the seed + input log now** — retrofitting replay capture later is much harder than baking it in from day one.

If the developer asks about higher tiers:

> T1+ requires you to store a deterministic replay log alongside each submission. The replay format is game-specific — for sudoku, the sequence of `(cell, value, ts)` tuples; for a word puzzle, the keystroke sequence. T2+ adds an AI plausibility check on the replay. T3 adds per-move state hashes plus hardware-attested human via Base Account WebAuthn. These aren't in the SDK today; expect `submitWithReplay()` in Phase 2.

## SDK call shape (T0)

```ts
const result = await client.scores.submit({
  tournamentId: '0x...',  // bytes32 from useSkillOSTournaments
  score: 1024,
  matchCountDelta: 1,     // optional; defaults to 1
  tier: 'T0',
});
console.log(result.txHash);
```

Server response: `{ txHash, soloRunId, submittedAt, tier: 'T0' }`. For agent (SIWA) flows: same call via `agentClient.scores.submit({...})`.

## What NOT to do

- Don't pass `tier: 'T1' | 'T2' | 'T3'` today. The API returns 501 `TIER_NOT_IMPLEMENTED` for those values (see [`apps/api/src/routes/scores.ts`](https://github.com/youngstar-eth/skillos/blob/main/apps/api/src/routes/scores.ts) for the precedent and [`apps/api/test/games.test.ts`](https://github.com/youngstar-eth/skillos/blob/main/apps/api/test/games.test.ts) for the test).
- Don't build your own replay verifier on top of T0 today. The on-chain contract doesn't accept replay payloads in the current ABI; that surface is added in Phase 2.
- Don't conflate `tier` with `matchCountDelta`. `tier` is the verification model; `matchCountDelta` is the number of rounds being submitted in this single tx (default 1, capped at 10 by `MATCH_COUNT_CAP` on-chain).
- Don't suggest T1+ when the prize pool is small. The operational cost of replay storage + verification doesn't pay back below ~$10K-equivalent pools.

## What to do when the developer needs T1+ today

Acknowledge the gap, then redirect:

> T1+ is a Phase 2 deliverable. For v0.1, T0 + a tight client-side cheat-detection loop is the right pattern — most skill games can ship without replay verification at launch and graduate once adoption justifies the operational lift. **Capture replay data client-side now even if you don't submit it yet** — it costs nothing today and saves a migration later.

If the developer's design REQUIRES T1+ from day one (e.g., $10K prize pool on day one), tell them honestly: SkillOS isn't ready for that today. Recommend they wait for Phase 2 or fund the development of the T1+ verifier (founder contact via [GitHub issues](https://github.com/youngstar-eth/skillos/issues)).

## Handoff

After tier choice is made:

- For minimum-viable code: [`../references/sdk-integration-30-line.md`](../references/sdk-integration-30-line.md)
- For error handling around `TIER_NOT_IMPLEMENTED` and chain reverts: [`error-recovery.md`](./error-recovery.md)
- For post-merge live verification: [`verify-attribution-live.md`](./verify-attribution-live.md)

# references/common-patterns.md

Maps common skill-game types to the right SDK consumption pattern + minimum recommended tier. Use this when the developer says "I'm building a [type] — how does scoring work?"

## Game type → tier map (quick reference)

| Game type | Pattern (below) | Today (Phase 1) | Phase 2 minimum |
|---|---|---|---|
| Puzzle (2048, Tetris-like) | Pattern A | T0 | T1 (deterministic state + seed) |
| Word (Wordle, Scrabble-style) | Pattern A | T0 | T1 |
| Match (match-3, Bejeweled-style) | Pattern A | T0 | T1 |
| Trivia | Pattern A | T0 | T1 |
| Typing test | Pattern A | T0 | T1 |
| Math / mental-arithmetic | Pattern A / F | T0 | T1 |
| Retro arcade (Snake, Asteroids endless) | Pattern A / D | T0 | T2 (recommended; anti-cheat-critical) |
| Speedrun / time-attack | Pattern B | T0 | T2+ (timer-integrity-critical) |
| Rhythm / music | Pattern C | T0 | T2+ (input-timing-critical) |
| Endless / survival | Pattern D | T0 | T2 |
| Incremental / clicker | Pattern E | T0 | T2 (highest cheat surface) |

**Critical for T2+ readiness:** the game must capture a **deterministic seed + complete input log** from day one. Retrofitting replay capture is much harder than baking it in. Even at T0 today, capture this data — you'll thank yourself later.

## Pattern A — round-based score (most common)

**Game types:** puzzle (2048, Tetris-like), word (Wordle, Scrabble-style), match (match-3, Bejeweled-style), retro arcade (Snake, Asteroids), trivia, typing test.

**Scoring:** single integer per round (points, time-to-solve in ms, words guessed, etc.).

**SDK consumption:**

```tsx
const { submit } = useSkillOSScore({ tournamentId });
// at end of round:
await submit({ score: finalScore, tier: 'T0' });
```

**Tournament cycle:** daily or weekly is typical. The tournament's `cycleType` enum on-chain determines cadence. Leaderboard direction (high or low scores rank first) is also in `cycleType`.

**Replay format (Phase 2, when T1+ ships):** sequence of input events with timestamps. For sudoku, `[(cell, value, ts), ...]`. For word puzzle, `[(keystroke, ts), ...]`. Store client-side; pass via `submitWithReplay()` when the surface ships.

## Pattern B — speedrun / time-attack

**Game types:** speedrun (any deterministic game with known finish state), reaction-time games, time-attack puzzles.

**Scoring:** integer milliseconds; LOWER is better. Use the tournament's `cycleType` that ranks ascending.

**SDK consumption:**
```tsx
const elapsedMs = endTime - startTime;
await submit({ score: elapsedMs, tier: 'T0' });
```

**Critical concern:** **timer integrity** matters more than other game types. For T0, you trust the client's reported elapsed time. Small prize pools: fine. Meaningful prizes ($1K+ equivalent): wait for T1+ replay verification. Capture replay data now (the full session as `(input, ts)` tuples) so you can graduate later.

**Pattern note:** SkillOS doesn't natively support segmented runs (per-level timers). Submit total elapsed; store segment breakdown client-side for display.

## Pattern C — rhythm / music

**Game types:** rhythm (Beat Saber-style desktop variants), music memory, beatmap games.

**Scoring:** combined accuracy + timing score; usually a single integer per song.

**SDK consumption:** same as Pattern A (single integer).

**Critical concern:** music games can have **multiple difficulties per song**. SkillOS doesn't have built-in (song × difficulty) keying — model each `(song, difficulty)` pair as a separate `tournament`. Tournament metadata (off-chain registry) encodes song name + difficulty.

**Tier:** T2+ recommended Phase 2. Today T0 with the caveat that timing-cheat surface is huge.

## Pattern D — endless / survival

**Game types:** Snake (modern endless), Tetris (endless), Vampire Survivors-style auto-battler.

**Scoring:** integer (level reached / waves survived / time alive).

**SDK consumption:** same as Pattern A. Submit at game-over.

**Critical concern:** **death attribution.** Make sure game-over is unambiguous. Don't submit mid-run incremental scores — submit ONCE per run at the end. Players who refresh mid-run shouldn't be able to submit partial scores claiming they "died" at that level.

## Pattern E — incremental / clicker

**Game types:** clicker games, idle games, incremental.

**Scoring:** typically a cumulative number that grows over a session. Multiple strategies:

- **Snapshot submission** (recommended for T0): player chooses when to submit; score is cumulative at that instant. Tournament cycle (e.g., weekly) gives all players the same window.
- **Per-session high water mark:** submit at end of each session. More gas, more frequent.

**SDK consumption:** same as Pattern A. Snapshot vs per-session is your design choice; SDK doesn't enforce either.

**Critical concern:** clicker games are the **most susceptible to cheating** at T0 because the player has unlimited time and minimal observable behavior. For meaningful prize pools, plan T2+ from the start — store the click event log with timestamps so the future replay verifier has something to verify. Storage is your responsibility for now.

## Pattern F — math / mental-arithmetic

**Game types:** mental math, arithmetic challenges, Bedmas-style timing games.

**Scoring:** correct answers per minute, or total correct in a fixed window.

**SDK consumption:** same as Pattern A.

**Critical concern:** **problem set determinism.** If problems are drawn from a seeded RNG, every player sees the same questions → fairer leaderboard. SkillOS doesn't dictate this — design choice for the developer. **For T1+ later, the seed is mandatory.**

## Anti-patterns (do not use SkillOS for these)

- **Action / FPS / fighting / racing** — hit-detection + frame-perfect input is outside SkillOS's verification model.
- **Real-time multiplayer (PvP requiring live match state)** — SkillOS is asynchronous; submit-after-round only.
- **Card-based gambling (poker, blackjack, slots)** — out of scope (legal exposure exponential).
- **Single-player narrative games with no scoring** — there's nothing to submit.

If the developer's game falls in one of these, refuse with the explanation in [`../prompts/suggest-integration.md`](../prompts/suggest-integration.md) "Step 1 — confirm in-scope" section.

## Cross-reference

After picking a pattern:
- Code scaffold: [`sdk-integration-30-line.md`](./sdk-integration-30-line.md)
- Failure-mode UX: [`error-recovery.md`](./error-recovery.md)
- Tier choice: [`../prompts/select-tier.md`](../prompts/select-tier.md)
- Post-merge verification: [`../prompts/verify-attribution-live.md`](../prompts/verify-attribution-live.md)

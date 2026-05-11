# references/common-game-types.md

Maps common skill-game types to the right SDK consumption pattern. Use this when the developer says "I'm building a [type] — how does scoring work?"

## Pattern A — round-based score (most common)

**Game types:** puzzle (2048, Tetris-like), word (Wordle, Scrabble-style), match (match-3, Bejeweled-style), retro arcade (Snake, Asteroids), trivia, typing test.

**Scoring:** single integer per round (could be points, time-to-solve in ms, words guessed, etc.).

**SDK consumption:**

```tsx
const { submit } = useSkillOSScore({ tournamentId });
// at end of round:
await submit({ score: finalScore, tier: 'T0' });
```

**Tournament cycle:** daily or weekly is typical. The tournament's `cycleType` enum on-chain determines the cadence. Leaderboard ranks by score (high or low depending on the game — `cycleType` also encodes direction).

**Replay verification (when ready, Phase 2):** the replay log is the sequence of input events with timestamps. For a sudoku, it's `[(cell, value, timestamp), ...]`. For a word puzzle, it's `[(keystroke, timestamp), ...]`. Store on the client during play, send with `submitWithReplay()` once the T1+ surface ships.

## Pattern B — speedrun / time-attack

**Game types:** speedrun (any deterministic game with known finish state), reaction-time games, time-attack puzzles.

**Scoring:** integer milliseconds; LOWER is better. Use the tournament's `cycleType` that ranks ascending.

**SDK consumption:**

```tsx
const elapsedMs = endTime - startTime;
await submit({ score: elapsedMs, tier: 'T0' });
```

**Special concern:** **timer integrity** matters more than other game types. For T0, you're trusting the client's reported elapsed time. If the prize pool is small, this is fine; if it's meaningful, plan for T1+ (replay verification of the full session, server-side timer reconstruction from the replay log).

**Pattern note:** SkillOS doesn't natively support segmented runs (where each level has its own timer). Submit total elapsed; if you want segment breakdown for display, store it client-side.

## Pattern C — rhythm / music

**Game types:** rhythm (DDR / Beat Saber-style desktop variants), music memory, beatmap games.

**Scoring:** combined accuracy + timing score; usually a single integer per song.

**SDK consumption:** same as Pattern A. `score` is the combined integer.

**Special concern:** music games can have **multiple difficulties per song**. SkillOS doesn't have a built-in concept of "song × difficulty" as a primary key — model each (song, difficulty) pair as a separate `tournament`. Tournament metadata can encode the song name + difficulty via the off-chain registry.

## Pattern D — endless / survival

**Game types:** Snake (modern endless), Tetris (endless), Vampire Survivors-style auto-battler.

**Scoring:** integer (level reached / waves survived / time alive).

**SDK consumption:** same as Pattern A. Submit at game-over.

**Special concern:** **death attribution.** Make sure the game-over event is unambiguous (single integer score). Don't submit mid-run incremental scores — submit ONCE per run at the end. Players who refresh mid-run shouldn't be able to submit partial scores claiming they "died" at that level.

## Pattern E — incremental / clicker

**Game types:** clicker games, idle games, incremental.

**Scoring:** typically a cumulative number that grows over a session. Multiple submission strategies:

- **Snapshot submission** (recommended for T0): the player chooses when to submit; score is the cumulative number at that instant. Tournament cycle (e.g., weekly) gives all players the same window.
- **Per-session high water mark:** submit at the end of each "session" (when the page closes / when the player explicitly stops). More frequent submissions = more gas.

**SDK consumption:** same as Pattern A. Choose snapshot vs per-session in your game design; the SDK doesn't enforce either.

**Special concern:** clicker games are the **most susceptible to cheating** at T0 because the player has unlimited time and minimal observable behavior. For meaningful prize pools, plan T1+ from the start — store the click event log with timestamps so the future replay verifier has something to verify against. (Storage is your responsibility for now; SDK doesn't help.)

## Pattern F — math / mental-arithmetic

**Game types:** mental math, arithmetic challenges, Bedmas-style timing games.

**Scoring:** correct answers per minute, or total correct in a fixed window.

**SDK consumption:** same as Pattern A.

**Special concern:** **problem set determinism.** If the math problems are drawn from a seeded RNG (same seed → same problem set), every player sees the same questions, making leaderboards fairer. SkillOS doesn't dictate this — design choice for the developer.

## Anti-patterns (don't use SkillOS for these)

- **Action / FPS / fighting / racing** — hit-detection + frame-perfect input is outside SkillOS's verification model.
- **Real-time multiplayer (PvP requiring live match state)** — SkillOS is asynchronous; submit-after-round only.
- **Single-player narrative games with no scoring** — there's nothing to submit.

If the developer's game falls in one of these, redirect: SkillOS isn't the right substrate for them today.

## Cross-reference

After picking a pattern, see [`sdk-integration-30-line.md`](./sdk-integration-30-line.md) for the minimum-viable code and [`error-recovery.md`](./error-recovery.md) for the failure-mode UX.

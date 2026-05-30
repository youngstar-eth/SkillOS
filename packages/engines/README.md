# @skillos/engines

Deterministic, game-agnostic **replay / adjudication engines** for SkillOS (Δ6).

Pure functions over a seeded LCG — **no MCP, Next, or network dependencies.**
The settlement layer, a fraud-proof challenger, and the `/v1/data/match-replay`
endpoint all reach every game through one game-agnostic call:

```ts
import { verifyMatch } from '@skillos/engines';

const { score, valid } = verifyMatch(gameId, seed, inputLog);
//      └ engine-authoritative      └ false ⇒ malformed log (never a throw)
```

## Canonical inputLog contract — `MoveRecord<M>`

> Resolves `SkillOS-Delta6-Replay-Engine-SPEC` §8 ("inputLog format
> standardization across 6 games"): a **generic envelope + per-game payload**,
> chosen over a closed cross-game union so adding a game never edits a
> settlement-shared type.

```ts
interface MoveRecord<M = unknown> {
  seq: number; // 0-based move index; a well-formed log covers exactly {0..n-1}
  move: M;     // game-native payload (opaque at the registry boundary)
}
```

- **Envelope** (`seq` + ordering) is shared and game-agnostic. The `seq` is the
  on-chain-anchor-friendly ordering key and the hook for future per-move state
  hashing (SPEC §8 open item).
- **Payload `M`** is game-native and owned by each engine:

  | game | `M` (`move` payload) | score | session bound |
  |---|---|---|---|
  | 2048 | `'up' \| 'down' \| 'left' \| 'right'` (`Move2048`) | merge sum | game-over **or** `MAX_MOVES=100` (engine cap) |
  | wordle | a 5-letter guess string (`MoveWordle`) | guess-bonus (skill-pure; see note) | win **or** 6 guesses (natural) |
  | sudoku | `{ row, col, value }` (`MoveSudoku`) | `countCorrect` 41→81 | solved (natural) **or** end-of-log; defensive `MAX_MOVES=4096` |
  | minesweeper | `{ row, col, action:'reveal'\|'flag' }` (`MoveMinesweeper`) | `revealedCount` 0→71 | win/loss (natural) **or** end-of-log; defensive `MAX_MOVES=4096` |
  | clicker | `{ t? }` a tap, optional ms timestamp (`MoveClicker`) | tap count (skill-pure) | **the input log** — live 2-min timer made replayable (design choice) |
  | match3 | `{ a:[r,c], b:[r,c] }` a swap (`MoveMatch3`) | cascade accumulator | **the input log** — no natural terminal; defensive `MAX_MOVES=4096` |

The registry boundary treats `move` as `unknown`; each engine **re-validates and
narrows** its own payload inside `verify`. Structural validation of the envelope
(null / non-array / bad-`seq`) is shared via `orderedMoves` — so the
`moves=null` bypass the F0 gate has today **cannot reach any scoring path**
(SPEC §4).

## Session bounds & score notes (per game)

Every engine documents its session bound explicitly in its file header (no
inherited caps — cf. the 2048 `MAX_MOVES=100` lesson). Two games have **no
natural terminal**, so "the input log is the session" (a defensive cap only
bounds replay cost on a forged log):

- **2048** — game-over (no legal move) or the engine `MAX_MOVES=100` cap.
- **wordle** — win or 6 guesses (natural). Guesses after the terminal are
  rejected (`guess_after_terminal`).
- **sudoku** — solved (natural) or end-of-log; given-cell edits no-op (live-faithful).
- **minesweeper** — win (71 revealed) / loss (mine hit), or end-of-log; flags are score-neutral; post-terminal taps ignored (live-faithful).
- **clicker** — *design choice* (no live terminal): the live 2-minute timer is
  encoded as `SESSION_MS`; the replayable bound is the recorded taps. Clicker
  has **no seeded gameplay state** — the seed only picks a cosmetic emoji — so
  its live-fidelity check is necessarily shallow (cosmetic seed-fold + the
  count rule), and its score is trust-client by design (live V1).
- **match3** — *no natural terminal*: the live session is wall-clock-bounded;
  the engine's bound is the input log + a defensive `MAX_MOVES=4096`.

**Cross-game scoring rule (matters for the settlement call site):** `verify()`
returns the **deterministic, skill-pure** score. Non-replayable or submit-layer
adjustments are deliberately **excluded** and exposed separately:

- **wordle** — the live score adds a **wall-clock speed bonus** (up to 6000)
  that is *not* recoverable from the log (no per-move timestamps). `verify()`
  scores the guess-bonus only ⇒ an on-chain live score can exceed `verify()` by
  up to 6000. A naive equality check would reject legitimate runs — the
  settlement layer must reconcile (record a log-derived duration, settle on
  guess-bonus, or allow a speed band). **Founder decision pending.**
- **match3 / clicker** — the live submit clamps `min(max(1|0, s), 49999)`;
  `verify()` returns the raw count and exposes `clampSubmitScore()` for callers.

## Determinism contract

`verify(seed, log)` is **pure**: same `(seed, log)` → same `{ score, valid }` on
every machine, every run. No wall-clock, no `Math.random`, no nondeterministic
iteration order; integer math where the game allows. The seeded RNG
(`SeededRng` + `hashSeed`, a 32-bit LCG) is lifted verbatim from the live game
so its draw order byte-matches the UI — **do not "improve" it** (a change
invalidates every golden vector and every on-chain-anchored score).

## Correctness is pinned three ways

1. **Unit rules** — `src/games/__tests__/*.test.ts` pin specific game rules
   (merge math, no-op budget, MAX_MOVES cap, deadlock).
2. **Golden vectors** — `src/__tests__/golden/<game>.golden.json` bake the
   engine's expected score/board as **constants**; any rule change that moves a
   score fails CI (`golden.test.ts`). _Golden vectors ARE the spec of
   correctness_ (SPEC §4).
3. **Live fidelity** — `scripts/fidelity-2048-live-vs-engine.test.ts`
   cross-checks the engine against `apps/<game>`'s live rules; drift on either
   side fails CI (SPEC §5).

## Adding an engine (Stage 2)

```ts
// src/games/<game>.ts
import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

export type MoveX = /* game-native move */;

export const engineX: GameEngine<MoveX> = {
  gameId: '<game>',
  verify(seed, log): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    // …reject illegal payloads, replay deterministically from `seed`…
    return { score, valid: true };
  },
};
```

Then one line in `src/registry.ts`: `registerEngine(engineX)`. **Settlement code
does not change.** Ship golden vectors generated from the live game + a live
fidelity check alongside it.

## Scope boundary

This package **registers** engines and exposes `verify`. It is **not** the
verification *call site* — wiring `verify` into `settle()` is the separate
HIGH-safety Δ5 + Δ6 settlement rework and lives nowhere here.

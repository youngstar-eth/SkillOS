# @skillos/anti-cheat

X20.0b — F0 deterministic plausibility formula for the SkillOS AntiCheat layer.

Pure function. No I/O, no randomness, no LLM coupling. Per Option F lock
(architecture supplement v1.4 §3.13) this is the function intended to become
the sole on-chain authority for plausibility once X20.4 ships.

## Usage

```ts
import { plausibility } from "@skillos/anti-cheat";

const verdict = plausibility({
  game: "2048",
  moves: 300,
  durationMs: 180_000,
  score: 8_000,
});
// → { plausible: true, reason: "ok", confidence: 1.0, thresholds: { ... } }
```

## Axes

Three independent checks; any single failure returns `plausible: false`
with a reason that names the failing axis:

1. **duration/move floor** — `durationMs / moves ≥ min_duration_per_move_ms`
2. **score/move ceiling** — `score / moves ≤ max_score_per_move`
3. **move count bounds** — `min_moves ≤ moves ≤ max_moves`

Coefficients live in `src/coefficients.ts`, one entry per game
(`2048`, `wordle`, `sudoku`, `minesweeper`, `clicker`, `match3`).

## Coefficient calibration

Initial coefficients are **founder-spec placeholders**. Data-calibrated
tuning happens post-mainnet once Phase 2 traffic accumulates (per
[SCOPING.md §5.2](../../docs/sprints/x20-anticheat-rebuild/SCOPING.md)).
The function shape is stable; only the numbers move.

## Out of scope

- Submit-time enforcement integration → X20.1
- Confidence gate on Haiku verdict → X20.2
- Per-tournament circuit-breaker → X20.3
- Off-chain Haiku advisory queue → X20.4

## Tests

```sh
npx tsx --test test/formula.test.ts
```

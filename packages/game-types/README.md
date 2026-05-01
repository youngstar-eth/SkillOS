# @skillbase/game-types

Shared TypeScript types — single source of truth for cross-package data shapes.

## Exports

- `Duel` — full `v2_duels` row shape (matched / submitted / settled state)
- `DuelStatus` — `'queued' | 'matched' | 'player1_submitted' | 'player2_submitted' | 'settled' | 'refunded' | 'expired'`
- `GameType` — `'game2048' | 'wordle' | 'sudoku' | 'minesweeper' | 'clicker' | 'match3'`
- `CoachResponse`, `CoachTone` — Coach output shape consumed by the `AICoach` component
- `RecapResponse`, `RecapArchetype` — Recap output
- `PlausibilityCheck` — anti-cheat verdict shape

No runtime code; types only. Re-exported from `@skillbase/lib-shared` for consumer convenience (so apps don't have to import from two packages for one symbol set).

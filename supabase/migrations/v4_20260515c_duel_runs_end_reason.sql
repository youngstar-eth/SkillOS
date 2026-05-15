-- X15.5/6/8 compound fix: end_reason FSM on duel_runs.
--
-- Sprint X20 runner historically capped matches at 24 moves; the watch UI
-- rendered "ENDED" with no disambiguation for natural game-over vs forced
-- truncation. Phase 2 readiness requires authentic gameplay and a unified
-- terminal-state chip.
--
-- Adds end_reason as a nullable text column with a CHECK constraint.
-- Nullable to preserve existing rows; the frontend falls back to plain
-- "ENDED" when end_reason is null.
--
-- Constraint covers all 5 FSM exit reasons:
--   win       — 2048 tile reached
--   game_over — board full, no legal moves
--   timeout   — wall-clock cap exceeded
--   stuck     — 5x consecutive same-direction (agent forfeit)
--   error     — Claude API failure or invalid state

ALTER TABLE duel_runs
  ADD COLUMN IF NOT EXISTS end_reason text
  CHECK (end_reason IS NULL OR end_reason IN ('win','game_over','timeout','stuck','error'));

CREATE INDEX IF NOT EXISTS idx_duel_runs_end_reason
  ON duel_runs (end_reason)
  WHERE end_reason IS NOT NULL;

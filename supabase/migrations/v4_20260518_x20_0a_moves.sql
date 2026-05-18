-- ───────────────────────────────────────────────────────────────────────────
-- X20.0a — moves instrumentation plumbing (AntiCheat F0 prerequisite).
--
-- This sprint is PURE PLUMBING. The column is captured at submit time but
-- never read by any consumer in this PR. The F0 plausibility formula in
-- X20.0b will be the first reader; the off-chain Haiku queue (X20.4) and
-- the per-tournament circuit breaker (X20.3) consume it after that.
--
-- Why nullable:
--   - Existing v2_tournament_solo_runs rows have no captured moves count;
--     a synthetic backfill would lie about the data.
--   - The F0 formula in X20.0b will explicitly `WHERE moves IS NOT NULL`
--     and skip pre-instrumentation rows. Once the rollout window passes
--     (~1 cycle) we can revisit NOT NULL — tracked in the X20.0a PR
--     follow-up section. No constraint tightening in this sprint.
--
-- Why no enforcement here:
--   - The plan deliberately separates instrumentation from enforcement so
--     we can collect real moves data BEFORE deciding on formula bounds
--     in X20.0b. Ship-then-tune is a safer rollout than instrument+enforce
--     in one PR. See PR #122 SCOPING.md §X20.0a.
--
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
-- Reference: architecture-doc-supplement-v1.5.md §3.17.
-- ───────────────────────────────────────────────────────────────────────────

alter table v2_tournament_solo_runs
  add column if not exists moves integer;

-- Partial index on non-null rows only. F0 formula reads will all filter
-- `moves IS NOT NULL`, so a partial index keeps the structure small and
-- avoids paying for the legacy-row blanks. Drop and rebuild as
-- non-partial only after legacy rows age out.
create index if not exists idx_v2_tournament_solo_runs_moves
  on v2_tournament_solo_runs (moves) where moves is not null;

-- ─── Verification (run manually post-apply) ────────────────────────────────
--   select count(*) from v2_tournament_solo_runs where moves is null;
--   select min(moves), max(moves), avg(moves)
--     from v2_tournament_solo_runs where moves is not null;

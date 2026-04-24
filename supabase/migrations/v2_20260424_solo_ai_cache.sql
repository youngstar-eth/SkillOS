-- ───────────────────────────────────────────────────────────────────────────
-- Phase-1 AI cache columns on v2_tournament_solo_runs — mirror of the duel
-- cache shapes added in v2_20260422_coach_cache.sql and
-- v2_20260422_recap_cache.sql. Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Why this migration exists separately from v2_20260423_tournament_solo.sql:
-- the solo_runs table landed one day after the duel cache columns and the
-- cross-cutting concern was missed. Symmetry with duel is the point —
-- shapes and predicates are identical, only the target table differs.
--
-- Schema:
--   coach_cache jsonb NOT NULL DEFAULT '{}'::jsonb
--   recap_cache jsonb                                  (nullable, no default)
--
-- Expected shape at rest (written by packages/duel-backend/src/api/tournaments/):
--
--   coach_cache: the CoachResponse object stored at root (solo has one
--     player per run, so no per-slot wrapper — cache-hit predicate is
--     `coach_cache <> '{}'` identical to duel). Example:
--       { "feedback": "...", "tone": "tactical" }
--     Empty object '{}' means "no coach call made yet for this run".
--
--   recap_cache: single RecapResponse per run (mirrors duel's one-per-match
--     semantics). NULL = no call yet, non-NULL = cached. Example:
--       { "style": "blowout", "headline": "...", "narrative": "...",
--         "shareText": "... {url} @skillbase" }
-- ───────────────────────────────────────────────────────────────────────────

alter table v2_tournament_solo_runs
  add column if not exists coach_cache jsonb not null default '{}'::jsonb;

alter table v2_tournament_solo_runs
  add column if not exists recap_cache jsonb;

-- Partial index on rows that have cached coach output. Mirrors duel's
-- v2_duels_coach_cache_used_idx intent (debug / who-used-coach audit aid).
-- No status predicate: solo_runs rows are inserted at submit time, so every
-- row is already in the "post-game, eligible for coach" state.
create index if not exists v2_tournament_solo_runs_coach_cache_used_idx
  on v2_tournament_solo_runs((coach_cache is not null and coach_cache <> '{}'::jsonb));

-- No index on recap_cache — same rationale as duel: single-read-by-PK, no
-- audit scan needed for Phase 1.

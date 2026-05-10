-- ───────────────────────────────────────────────────────────────────────────
-- Phase-1 AI Recap cache column on v2_duels.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Schema:
--   recap_cache jsonb (nullable, no default)
--
-- Nullability is load-bearing here. The recap endpoint uses
-- `recap_cache IS NOT NULL` as its cache-hit predicate — a single recap
-- per match (unlike coach_cache which is per-player and uses the empty
-- object as its "no-call-yet" state).
--
-- Expected shape at rest (written by packages/duel-backend/src/api/recap.ts):
--   {
--     "style": "comeback",
--     "headline": "...",
--     "narrative": "...",
--     "shareText": "... {url} @SkillOS"
--   }
--
-- No index for Phase 1 — reads are always via the PK on duel id, and the
-- column is write-once per match. Partial "was-a-recap-generated" index
-- deferred to Phase 2 if we ever need the audit.
-- ───────────────────────────────────────────────────────────────────────────

alter table v2_duels
  add column if not exists recap_cache jsonb;

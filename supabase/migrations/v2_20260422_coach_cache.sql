-- ───────────────────────────────────────────────────────────────────────────
-- Phase-1 AI Coach cache column on v2_duels.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all 6 Phase-1 apps).
--
-- Schema:
--   coach_cache jsonb default '{}'::jsonb
--
-- Expected shape at rest (written by packages/duel-backend/src/api/coach.ts):
--   {
--     "p1": { "feedback": "...", "tone": "tactical" },
--     "p2": { "feedback": "...", "tone": "tactical" }
--   }
--
-- Keys are player slots ('p1' | 'p2'), values are CoachResponse objects.
-- Missing key → no coach call has been made for that player yet.
-- ───────────────────────────────────────────────────────────────────────────

alter table v2_duels
  add column if not exists coach_cache jsonb not null default '{}'::jsonb;

-- Partial index on settled rows where at least one player has cached coach
-- output. Keeps cold rows out of the index (99% of historical duels will
-- never be viewed again post-settlement). Supports the hot read path
-- `select ... from v2_duels where id = $1` — the PK already covers it, so
-- this is mostly a "debug / who-used-coach" audit aid rather than a perf lever.
create index if not exists v2_duels_coach_cache_used_idx
  on v2_duels((coach_cache is not null and coach_cache <> '{}'::jsonb))
  where status = 'settled';

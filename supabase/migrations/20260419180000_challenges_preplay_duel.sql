-- ─── Feature 2a: Pre-play duel rewrite ──────────────────────────────────────
-- Challenge model changes: Alice creates without playing; both players play
-- after accept. New intermediate + walkover states track async submissions.
--
-- Transitions:
--   pending_creator_stake → open        (Alice stake confirmed)
--   pending_creator_stake → cancelled
--   open                  → accepted    (Bob stake confirmed)
--   open                  → expired_refunded
--   accepted              → creator_played
--   accepted              → challenger_played
--   accepted              → expired_refunded   (neither submitted)
--   creator_played        → both_played
--   creator_played        → walkover_creator   (Bob timeout)
--   challenger_played     → both_played
--   challenger_played     → walkover_challenger (Alice timeout)
--   both_played           → settled
--   walkover_*            → settled

-- 1. Widen status CHECK with 5 new states.
alter table public.challenges
  drop constraint challenges_status_check;

alter table public.challenges
  add constraint challenges_status_check
  check (status in (
    'pending_creator_stake',
    'open',
    'accepted',
    'creator_played',
    'challenger_played',
    'both_played',
    'settled',
    'expired_refunded',
    'walkover_creator',
    'walkover_challenger',
    'cancelled'
  ));

-- 2. creator_score becomes nullable — Alice doesn't play at create time.
-- Existing rows (from the first F2 deploy) stay intact; their scores are
-- now treated as Alice's post-stake submit.
alter table public.challenges
  alter column creator_score drop not null;

-- 3. Update the check to allow NULL (current check is `creator_score >= 0`).
-- Look up + re-create defensively so rerun is safe.
do $$
declare cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'public.challenges'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%creator_score%';
  if cn is not null then
    execute format('alter table public.challenges drop constraint %I', cn);
  end if;
end $$;

alter table public.challenges
  add constraint challenges_creator_score_check
  check (creator_score is null or creator_score >= 0);

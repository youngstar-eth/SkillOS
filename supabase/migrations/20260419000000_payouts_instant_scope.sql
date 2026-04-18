-- ─── Feature 1: Instant Payout UX ──────────────────────────────────────────
-- Widens payouts.scope to accept 'instant' (mid-day off-chain USDC.transfer
-- triggered by rank-1 score submission) and adds a UNIQUE partial index so
-- parallel /api/payout/trigger requests can't double-pay the same slot.
--
-- The two-phase INSERT-then-UPDATE pattern in @mas/shared/payout/transfer.ts
-- relies on this index: reservation INSERT with status='pending' will collide
-- on the partial unique constraint if another caller is already mid-transfer.

-- 1. Widen the scope CHECK constraint.
--    Constraint name is Postgres-generated for inline CHECKs. Look it up
--    defensively so the migration is rerun-safe across clones.
do $$
declare
  cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'public.payouts'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%scope%';
  if cn is not null then
    execute format('alter table public.payouts drop constraint %I', cn);
  end if;
end $$;

alter table public.payouts
  add constraint payouts_scope_check
  check (scope in ('game', 'category', 'overall', 'instant'));

-- 2. Prevent double-pay races.
--    At most one active (pending|sent) payout per logical slot.
--    Failed rows stay out of the index so retries are allowed.
create unique index if not exists uniq_payouts_active_slot
  on public.payouts (
    user_address,
    scope,
    day,
    coalesce(game_slug, ''),
    coalesce(category, ''),
    coalesce(rank, 0)
  )
  where status in ('pending', 'sent');

comment on index public.uniq_payouts_active_slot
  is 'Race guard: at most one active (pending/sent) payout per (user,scope,day,game,category,rank) slot. Stale-pending rows are reclaimed after 10 min by the shared transfer helper.';

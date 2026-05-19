-- Replace the functional COALESCE(category,'') index on daily_aggregates with
-- a `UNIQUE NULLS NOT DISTINCT` constraint (Postgres 15+) so PostgREST upsert
-- with `onConflict: "user_address,scope,category,day"` actually matches a
-- real constraint.
--
-- The functional index from 20260418120000_leaderboard.sql still enforces
-- uniqueness correctly, but PostgREST's on_conflict parameter requires a
-- literal column list that maps to a real CONSTRAINT (not a functional
-- expression). NULLS NOT DISTINCT lets us keep the (user, scope, NULL, day)
-- collapse without COALESCE.

drop index if exists public.uniq_agg_user_scope_cat_day;

alter table public.daily_aggregates
  add constraint uniq_agg_user_scope_cat_day
  unique nulls not distinct (user_address, scope, category, day);

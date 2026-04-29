-- ───────────────────────────────────────────────────────────────────────────
-- Follow-up to v2_20260429_sponsor_contributions: pin the trigger function's
-- search_path. SECURITY DEFINER functions with a mutable search_path can be
-- tricked into resolving now() / gen_random_uuid() against a malicious schema
-- if a hostile role manages to insert one ahead of pg_catalog. Setting it
-- explicitly to '' makes the function safely use fully-qualified names only.
--
-- Pre-existing v2_duels_set_updated_at has the same advisory and is left
-- alone here — separate cleanup migration if/when that gets prioritized.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function v2_sponsor_indexer_state_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

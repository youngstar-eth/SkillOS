-- X14.0: tournament class declaration + child class persistence
-- Per supplement v1.5 §3.16 (off-chain enforcement lock) +
-- founder-locked scope 2026-05-18. CLAUDE.md invariant #3 (agent is a class).

-- v2_tournaments: declared class per tournament.
alter table public.v2_tournaments
  add column if not exists tournament_class text
    not null default 'mixed-declared'
    check (tournament_class in ('human-only', 'agent-only', 'mixed-declared'));

-- v2_tournament_entries: per-entry class persistence.
alter table public.v2_tournament_entries
  add column if not exists is_agent boolean not null default false;
alter table public.v2_tournament_entries
  add column if not exists class_tag text not null default 'human'
    check (class_tag in ('human', 'agent'));

-- v2_tournament_solo_runs: per-run class persistence.
alter table public.v2_tournament_solo_runs
  add column if not exists is_agent boolean not null default false;
alter table public.v2_tournament_solo_runs
  add column if not exists class_tag text not null default 'human'
    check (class_tag in ('human', 'agent'));

-- v2_duels: per-player class persistence.
alter table public.v2_duels
  add column if not exists player1_class text not null default 'human'
    check (player1_class in ('human', 'agent'));
alter table public.v2_duels
  add column if not exists player2_class text not null default 'human'
    check (player2_class in ('human', 'agent'));

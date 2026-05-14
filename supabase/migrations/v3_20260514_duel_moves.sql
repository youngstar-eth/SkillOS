-- ───────────────────────────────────────────────────────────────────────────
-- Sprint X20 — Solo agent live spectator MVP.
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all Phase-1 apps).
--
-- Adds two new tables for the agent-vs-baseline spectator demo:
--
--   duel_runs   — one row per agent match (solo X20; dual X21 later)
--   duel_moves  — per-move event log; Realtime broadcast source
--
-- Wired to apex `/watch/[runId]` via Supabase Realtime: each duel_moves
-- INSERT broadcasts on channel `duel_match_{run_id}`, the spectator UI tails
-- the stream. The duel_runs row hydrates the page on initial load.
--
-- Design calls worth reading before editing:
--
--   FK target — duel_moves.run_id references duel_runs(id) but is NOT
--     ON DELETE CASCADE; we want the audit trail to survive deliberate
--     run hard-deletes so post-mortems still resolve. Deletes are a manual
--     ops break-glass anyway (no app code deletes runs).
--
--   board snapshot storage — boards stored as jsonb (4x4 int matrix) on
--     both `board_before` and `board_after`. Storing both makes the watch
--     UI trivial — it can render any historical move snapshot without
--     replaying the engine. Costs ~120 bytes/move × ~25 moves = ~3KB/run.
--
--   reasoning length — text not varchar; some Haiku traces run long when
--     the model explains a merge chain. Capped softly at 4000 chars in
--     application code (apps/api/src/lib/duel/runner.ts).
--
--   Realtime publication — replication identity FULL on duel_moves so the
--     INSERT event carries the full row payload to subscribers. Default
--     DEFAULT identity ships PK-only, which would force a follow-up SELECT
--     from the watch client — defeats the streaming UX.
--
--   RLS — duel_runs + duel_moves are public-read (the watch page has no
--     auth), service-role-write only. Anon key can SELECT but not INSERT.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── duel_runs: one row per agent match ──────────────────────────────────

create table if not exists duel_runs (
  id uuid primary key default gen_random_uuid(),
  -- Game slug — must match the KNOWN_GAMES set in apps/api/src/lib/games.ts.
  -- X20 ships 2048 only; X21+ broadens to wordle/sudoku/etc.
  game text not null check (game in ('2048','wordle','sudoku','minesweeper','clicker','match3')),
  -- Deterministic seed for replay verification. bytes32-style hex string;
  -- the engine's SeededRng accepts string|number so we store as text.
  seed text not null,
  -- Mode discriminator. 'solo' = X20 single-agent demo; 'duel' reserved for
  -- X21 dual-agent matches. Constraint left open to forward-compat.
  mode text not null default 'solo' check (mode in ('solo','duel')),
  -- Agent EOA. For X20 this is the STUDIO_PRIVATE_KEY-derived address
  -- (server identity); X21 fields per-agent wallets.
  agent_address text not null,
  -- Lifecycle: pending → running → ended | timeout | error.
  -- pending → server inserted row but background task hasn't started
  -- running → first move emitted, match in progress
  -- ended   → game_over reached (no legal moves) OR move cap hit cleanly
  -- timeout → exceeded MATCH_TIMEOUT_MS without game_over
  -- error   → orchestrator caught unrecoverable failure (Anthropic 5xx, etc.)
  status text not null default 'pending'
    check (status in ('pending','running','ended','timeout','error')),
  -- Final game score (sum of merge values across all moves). NULL until ended.
  final_score integer,
  -- On-chain submitSoloScore tx hash. NULL when X20_DEMO_TOURNAMENT_ID env
  -- is unset (local dev) or when run terminated before submit attempt.
  on_chain_tx_hash text,
  -- ChallengeEscrow address from contracts.ts — included for the watch page
  -- "view escrow" link without an extra round-trip to env.
  challenge_escrow_address text,
  -- Last error message if status='error'; truncated to 500 chars by the app.
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Realtime channel name is `duel_match_{id}` — index on id for the
-- spectator's initial SELECT before subscribing.
create index if not exists idx_duel_runs_started
  on duel_runs (started_at desc);

-- ─── duel_moves: per-move event log ──────────────────────────────────────

create table if not exists duel_moves (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references duel_runs(id),
  -- 1-based for human readability in the move history panel.
  move_number integer not null,
  -- Cardinal direction the agent picked this move.
  direction text not null check (direction in ('up','down','left','right')),
  -- 4x4 jsonb int matrix — the board the agent SAW (post-spawn from prior move).
  board_before jsonb not null,
  -- 4x4 jsonb int matrix — the board AFTER applyMove + spawnTile.
  -- Spectator UI renders this snapshot.
  board_after jsonb not null,
  -- Score delta this move produced (sum of merges); cumulative score sits
  -- on duel_runs.final_score and is recomputed at game end.
  score_delta integer not null default 0,
  cumulative_score integer not null default 0,
  -- Claude's free-text reasoning for this move choice. Drives the
  -- ReasoningTrace sidebar. NULL allowed for fallback / baseline moves.
  reasoning text,
  -- Per-move latency budget tracking (ms). Useful for post-mortem on
  -- "why was move 14 so slow?" debugging.
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (run_id, move_number)
);

create index if not exists idx_duel_moves_run
  on duel_moves (run_id, move_number);

-- ─── Realtime publication ────────────────────────────────────────────────
-- The `supabase_realtime` publication is what makes Postgres LOGICAL
-- replication forward INSERTs to the Supabase Realtime fan-out service.
-- We add both tables, but the watch UI only subscribes to duel_moves; the
-- run-level state changes are pulled by the page on mount + on the final
-- 'ended' message.
--
-- alter publication … add table is NOT idempotent (no IF NOT EXISTS form),
-- so guard against re-run via pg_publication_tables lookup.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'duel_moves'
  ) then
    alter publication supabase_realtime add table duel_moves;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'duel_runs'
  ) then
    alter publication supabase_realtime add table duel_runs;
  end if;
end $$;

-- FULL identity emits the whole row to subscribers, not just the PK —
-- the watch client needs board_after + reasoning in the same payload.
alter table duel_moves replica identity full;
alter table duel_runs replica identity full;

-- ─── RLS — public read, service-role write ───────────────────────────────

alter table duel_runs enable row level security;
alter table duel_moves enable row level security;

-- Idempotent: drop-then-create for safety on re-run.
drop policy if exists duel_runs_public_read on duel_runs;
create policy duel_runs_public_read on duel_runs
  for select using (true);

drop policy if exists duel_moves_public_read on duel_moves;
create policy duel_moves_public_read on duel_moves
  for select using (true);

-- No public write policies — service role bypasses RLS implicitly.

-- ───────────────────────────────────────────────────────────────────────────
-- Sprint X15.8 — Payment attempts ledger (ADR 0003 D9).
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (shared across all Phase-1 apps).
--
-- Adds one new table:
--
--   x15_payment_attempts — per-run x402 settlement + on-chain charge ledger
--
-- Use case (ADR 0003 D9):
--   "If x402 settles but chargeEntryFee reverts, record (runId, x402TxHash,
--    debit) in x15_payment_attempts. Surface for manual operator review.
--    No auto-refund logic."
--
-- Wiring boundaries:
--   X15.3 backend orchestration writes rows (server-side, service role).
--   X15.5 frontend subscribes to Realtime channel for live UX updates.
--   This sub-task (X15.8) only ships the schema + RLS + Realtime config.
--
-- Design calls worth reading before editing:
--
--   FK behaviour — run_id references duel_runs(id) ON DELETE CASCADE per
--     ADR 0003 D9 spec. Note this diverges from duel_moves (which does NOT
--     cascade so the audit trail outlives ops break-glass deletes). Spec
--     explicit; revisit if operator-review requirements expand.
--
--   Two-status model — separates the off-chain settlement (x402_status) from
--     the on-chain charge (charge_status). The whole point of this table is
--     to capture the divergence: x402_status='settled' AND
--     charge_status='reverted' is the manual-review signal.
--
--   needs_manual_review flag — set by the backend when the two statuses
--     diverge; queried by operator tooling as a queue. Indexed so the
--     dashboard SELECT stays fast even as the table grows.
--
--   builder_code default — defaults to 2048's code per X15 spec (the
--     primary flagship app); X15.3 should override per-app when wiring.
--
--   updated_at trigger — Postgres only stamps DEFAULT now() on INSERT.
--     A trigger keeps updated_at fresh as status fields churn during the
--     settle → confirm pipeline.
--
--   Realtime publication — replica identity FULL on the table so the
--     X15.5 subscriber receives the full row (status + tx hashes + error
--     message) in one event without a follow-up SELECT.
--
--   RLS — public-read so the operator dashboard can render without a
--     service-role key from the browser. Writes are service-role only
--     (RLS bypassed implicitly).
-- ───────────────────────────────────────────────────────────────────────────

-- ─── x15_payment_attempts: per-run payment ledger ────────────────────────

create table if not exists x15_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  -- FK to duel_runs. CASCADE per ADR 0003 D9 spec.
  run_id uuid not null references duel_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Agent EOA (lowercase 0x… hex). Mirrors duel_runs.agent_address format
  -- so cross-table joins on agent identity don't need to lower() either side.
  agent_address text not null,
  -- bytes32 hex of the tournament the run was scoring into. Stored as text
  -- because we hex-encode at the API boundary; lets us index without a
  -- bytea cast.
  tournament_id text not null,

  -- ─── x402 settlement (off-chain, EIP-3009 USDC) ─────────────────────────
  -- pending → row inserted; settlement HTTP call not yet completed.
  -- settled → x402 facilitator returned 200; tx hash recorded.
  -- failed  → facilitator returned non-2xx or threw; error_message set.
  x402_status text not null default 'pending'
    check (x402_status in ('pending', 'settled', 'failed')),
  x402_tx_hash text,
  -- Atomic units (USDC has 6 decimals on Base). e.g., 1050000 = $1.05.
  -- numeric not bigint — keeps headroom for future stablecoins with more decimals.
  x402_amount_atomic numeric,
  x402_settled_at timestamptz,

  -- ─── on-chain chargeEntryFee (TournamentPool) ───────────────────────────
  -- pending  → tx broadcast; not yet mined.
  -- success  → mined + status=1.
  -- reverted → mined + status=0. THIS is the divergence signal that triggers
  --            needs_manual_review when paired with x402_status='settled'.
  -- skipped  → orchestrator decided not to call chargeEntryFee (e.g., free
  --            retry path, or x402 already failed).
  charge_status text not null default 'pending'
    check (charge_status in ('pending', 'success', 'reverted', 'skipped')),
  charge_tx_hash text,
  charge_block_number bigint,
  charge_confirmed_at timestamptz,

  -- ─── reconciliation flags ───────────────────────────────────────────────
  -- Set by backend when (x402_status, charge_status) diverges in a way that
  -- requires human attention. Operator dashboard queries this index.
  needs_manual_review boolean not null default false,
  review_notes text,
  -- Last error text from whichever step failed (x402 facilitator OR chain
  -- revert reason). Truncated to 500 chars in application code.
  error_message text,

  -- ─── builder code attribution (X10 pattern) ─────────────────────────────
  -- 2048's bc per X15 spec; X15.3 overrides per-app at insert time.
  builder_code text not null default 'bc_o6szuvg1'
);

-- ─── Indexes ─────────────────────────────────────────────────────────────

-- Per-run lookup (the most common access pattern: "show the ledger row for
-- this run"). One run can have multiple attempts if retries get logged.
create index if not exists idx_x15_payment_attempts_run
  on x15_payment_attempts (run_id);

-- Operator dashboard: "give me everything that needs review". Partial index
-- — we only ever care about needs_manual_review=true here, so a full-table
-- index would waste pages on the dominant false case.
create index if not exists idx_x15_payment_attempts_review
  on x15_payment_attempts (created_at desc)
  where needs_manual_review = true;

-- Per-agent history feed: "show me this agent's last 50 payments".
create index if not exists idx_x15_payment_attempts_agent
  on x15_payment_attempts (agent_address, created_at desc);

-- ─── updated_at trigger ──────────────────────────────────────────────────
-- DEFAULT now() only fires on INSERT. A BEFORE UPDATE trigger keeps the
-- column honest as the row mutates through settle → confirm states.

-- search_path locked to '' to satisfy advisor 0011 (function_search_path_mutable)
-- and follow the v2_20260429_sponsor_function_search_path.sql precedent.
create or replace function set_x15_payment_attempts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_x15_payment_attempts_updated_at on x15_payment_attempts;
create trigger trg_x15_payment_attempts_updated_at
  before update on x15_payment_attempts
  for each row
  execute function set_x15_payment_attempts_updated_at();

-- ─── Realtime publication ────────────────────────────────────────────────
-- ALTER PUBLICATION … ADD TABLE has no IF NOT EXISTS form, so guard via
-- pg_publication_tables lookup for idempotent re-run.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'x15_payment_attempts'
  ) then
    alter publication supabase_realtime add table x15_payment_attempts;
  end if;
end $$;

-- FULL identity emits the whole row to subscribers — X15.5 needs status +
-- tx hashes + error_message all in one event payload.
alter table x15_payment_attempts replica identity full;

-- ─── RLS — public read, service-role write ───────────────────────────────

alter table x15_payment_attempts enable row level security;

drop policy if exists x15_payment_attempts_public_read on x15_payment_attempts;
create policy x15_payment_attempts_public_read on x15_payment_attempts
  for select using (true);

-- No public write policies — service role bypasses RLS implicitly.

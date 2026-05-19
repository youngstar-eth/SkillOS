-- ───────────────────────────────────────────────────────────────────────────
-- Sprint X15.8 — Payment attempts ledger: CANONICAL SCHEMA LOCK (ADR 0003 D9)
-- Idempotent: safe to re-run.
-- Target project: clizuqvtkekzxiflbsyr (SkillOS prod).
--
-- ─── Why this follow-up exists ──────────────────────────────────────────────
-- The first migration (v4_20260515_x15_payment_attempts.sql) shipped a
-- two-status schema (x402_status + charge_status) capturing the
-- off-chain/on-chain divergence as separate columns.
--
-- Concurrently, two un-coordinated consumers landed with DIFFERENT field
-- expectations:
--
--   CONSUMER A — apps/api/src/lib/duel/charge-retry-fee.ts (X15.3, merged
--     08f4cf4) writes: status, tx_hash, approve_tx_hash, prior_solo,
--     agent_address (lowercase), run_id, tournament_id, error_message, reason
--
--   CONSUMER B — skillos-apex PR #30 (X15.5, merged 10967e9) subscribes to:
--     state, chain_tx_hash, amount_usdc_atomic, attempt_number
--     Enum: authorizing/settling/anchored/failed
--
-- Neither matches the originally-applied schema. INSERTs from X15.3 would
-- fail in prod (missing columns) the moment the orchestrator runs.
--
-- ─── Reconciliation rule (locked here) ──────────────────────────────────────
-- X15.3 backend wins on field names because:
--   - 'status' is the Supabase standard convention (matches duel_runs,
--     duel_moves, v2_tournaments)
--   - X15.3 already production-merged → less code rework
--   - X15.5 frontend rename is a single file → cheaper follow-up
--
-- X15.5 schema rename queued as fast PR: state→status, chain_tx_hash→tx_hash,
-- amount_usdc_atomic→x402_amount_atomic; status enum maps:
--   authorizing → pending
--   settling    → x402_settled
--   anchored    → anchored
--   failed      → failed
--   (+ new: skipped — for free-first-slot path)
--
-- ─── Idempotency strategy ───────────────────────────────────────────────────
-- The DROP is GUARDED on detection of the old two-status schema via the
-- presence of the x402_status column. Once this migration runs successfully,
-- x402_status is gone → guard returns false → DROP becomes a no-op on
-- subsequent runs. CREATE TABLE IF NOT EXISTS handles the steady state.
--
-- This means re-running this file AFTER canonical is in place is a true
-- no-op — it will NOT nuke production data once X15.3 starts writing rows.
--
-- ─── Pre-apply state ────────────────────────────────────────────────────────
-- Verified 2026-05-15 prior to apply: x15_payment_attempts row count = 0.
-- No production traffic — safe to drop and recreate.
--
-- ─── X19 audit-trail note (2026-05-19) ──────────────────────────────────────
-- This file lived in /Users/inancayvaz/MAS/supabase/migrations/ as untracked
-- from 2026-05-15 (applied date) through 2026-05-19, when PR #110 detected
-- the drift. Cherry-committed here verbatim — no SQL changes, only git add.
-- See docs/audit-prep/x19-schema-drift-analysis.md → Class C.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── Guarded drop of legacy two-status schema ────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'x15_payment_attempts'
      and column_name = 'x402_status'
  ) then
    drop table x15_payment_attempts cascade;
  end if;
end $$;

-- ─── Canonical schema (X15.3 backend wins on field names) ────────────────
create table if not exists x15_payment_attempts (
  id uuid primary key default gen_random_uuid(),

  -- FK to duel_runs; CASCADE per ADR 0003 D9 (diverges from duel_moves which
  -- intentionally does NOT cascade — payment ledger lifecycle is bounded by
  -- the run that triggered it, while moves outlive break-glass deletes).
  run_id uuid not null references duel_runs(id) on delete cascade,

  -- One run can have multiple attempts (e.g., retry after transient
  -- facilitator failure). UNIQUE (run_id, attempt_number) below guarantees
  -- monotonic, gap-free attempt numbering per run.
  attempt_number int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ─── Identity ────────────────────────────────────────────────────────────
  -- Lowercase 0x… hex enforced at insert site (X15.3 charge-retry-fee.ts).
  -- Mirrors duel_runs.agent_address format so cross-table joins don't need
  -- lower() on either side.
  agent_address text not null,
  tournament_id text not null,  -- bytes32 hex; stored text for indexability
  prior_solo bigint not null,   -- soloSubmissionCount snapshot at attempt time

  -- ─── Lifecycle (single-status enum per canonical lock) ──────────────────
  -- pending      → row inserted; x402 settlement not yet started
  -- x402_settled → x402 facilitator returned 200; off-chain debit confirmed
  -- anchored     → chargeRetryFee on-chain tx mined (status=1)
  -- failed       → terminal: any step errored; error_code + error_message set
  -- skipped      → orchestrator decided no fee owed (e.g., free first slot)
  --
  -- Divergence between x402_settled + chargeRetryFee revert is captured by
  -- needs_manual_review=true (status stays at x402_settled while error fields
  -- describe the on-chain revert).
  status text not null default 'pending'
    check (status in ('pending', 'x402_settled', 'anchored', 'failed', 'skipped')),

  -- Free-form provenance: 'free_first_slot', 'paid_retry', 'orchestrator_skip',
  -- etc. Set by X15.3 at insert time.
  reason text,

  -- ─── x402 off-chain settlement (EIP-3009 USDC) ──────────────────────────
  x402_tx_hash text,
  -- Atomic units (USDC has 6 decimals on Base). e.g., 1050000 = $1.05.
  -- numeric (not bigint) keeps headroom for future stablecoins with more decimals.
  x402_amount_atomic numeric,
  x402_settled_at timestamptz,

  -- ─── On-chain chargeRetryFee (TournamentPool) ───────────────────────────
  -- Optional USDC approval tx (max-approve once per agent → null on subsequent
  -- attempts that reuse the allowance).
  approve_tx_hash text,
  -- The chargeRetryFee on-chain anchor tx. Naming intentionally matches the
  -- X15.3 backend insert call (tx_hash, not charge_tx_hash) — the canonical
  -- lock decision.
  tx_hash text,
  charge_block_number bigint,
  charge_confirmed_at timestamptz,

  -- ─── Reconciliation flags ───────────────────────────────────────────────
  -- Set by backend when (x402 settled) AND (chargeRetryFee reverted/missing).
  -- This is the ONLY signal that flags a row for human attention — operator
  -- dashboard queries this index.
  needs_manual_review boolean not null default false,
  review_notes text,

  -- Enum routing for apex copy drift protection — frontend looks up the
  -- localized user-facing message from error_code, NOT from error_message
  -- (which is server-side text that may change without coordination).
  error_code text,
  -- Last error text from whichever step failed (x402 facilitator OR chain
  -- revert reason). Truncated to 500 chars in application code.
  error_message text,

  -- ─── Builder code attribution (X10 pattern) ─────────────────────────────
  -- 2048's bc per X15 spec — primary flagship app default; X15.3 overrides
  -- per-app at insert time when row originates from non-2048 game.
  builder_code text not null default 'bc_o6szuvg1',

  -- Monotonic attempt numbering per run.
  unique (run_id, attempt_number)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────

-- Per-run lookup: "show the ledger row(s) for this run". Hot path.
create index if not exists idx_x15_pay_run_id
  on x15_payment_attempts (run_id);

-- Operator dashboard: "give me everything that needs review". Partial index
-- — we only ever care about needs_manual_review=true here, so a full-table
-- index would waste pages on the dominant false case.
create index if not exists idx_x15_pay_review
  on x15_payment_attempts (created_at desc)
  where needs_manual_review = true;

-- Per-agent history feed: "show me this agent's last N payments".
create index if not exists idx_x15_pay_agent_recent
  on x15_payment_attempts (agent_address, created_at desc);

-- ─── updated_at trigger ──────────────────────────────────────────────────
-- DEFAULT now() only fires on INSERT. BEFORE UPDATE trigger keeps the
-- column honest as the row mutates through pending → x402_settled →
-- anchored. search_path locked to '' to satisfy advisor 0011
-- (function_search_path_mutable) per v2_20260429_sponsor_function_search_path
-- precedent.
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
-- ALTER PUBLICATION has no IF NOT EXISTS form; guard via pg_publication_tables.
-- DROP TABLE CASCADE above implicitly removes the table from the publication,
-- so this re-adds it on every canonical apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'x15_payment_attempts'
  ) then
    alter publication supabase_realtime add table x15_payment_attempts;
  end if;
end $$;

-- FULL identity emits the whole row to subscribers — X15.5 frontend needs
-- status + tx hashes + error fields all in one event payload.
alter table x15_payment_attempts replica identity full;

-- ─── RLS — public read, service-role write ───────────────────────────────
alter table x15_payment_attempts enable row level security;

drop policy if exists x15_payment_attempts_public_read on x15_payment_attempts;
create policy x15_payment_attempts_public_read on x15_payment_attempts
  for select using (true);

-- No INSERT/UPDATE policies — default deny for anon. Service role bypasses
-- RLS implicitly (X15.3 backend orchestrator writes via service-role client).

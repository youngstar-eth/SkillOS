// ───────────────────────────────────────────────────────────────────────────
// Cron run-lock: Postgres-side coordination for overlapping cron invocations.
//
// Background: when two cron runs overlap (e.g. Vercel platform redrive,
// or a slow run still finishing as the next scheduled tick fires), both
// can read the same pending-tournaments slice (settled_at IS NULL) and
// both broadcast settle() — the second tx reverts but burns gas.
//
// Postgres advisory locks (pg_try_advisory_lock) would be the standard
// fix, but the Supabase JS client doesn't expose them as first-class API
// and our pooled HTTP connection mode makes session-bound locks awkward.
// Instead we use a unique-key insert into v2_cron_runs as a coordination
// primitive: the first run inserts a (cron_name, run_window_start) row,
// subsequent runs in the same window get a 23505 unique-violation and
// skip cleanly.
//
// Window granularity is the lock's effective period. Settle uses 1-minute
// truncation: future-proof for sub-daily cadence, deterministic across
// concurrent runs, and rolls cleanly minute-to-minute.
// ───────────────────────────────────────────────────────────────────────────

import type { getSupabaseService } from "@skillos/lib-shared";

type SupabaseLike = ReturnType<typeof getSupabaseService>;

export interface AcquireLockArgs {
  supabase: SupabaseLike;
  cronName: string;
  /** Window start (ISO string). Truncate to your lock granularity before passing. */
  windowStart: string;
}

export interface AcquireLockResult {
  acquired: boolean;
  reason?: string;
}

export interface ReleaseLockArgs {
  supabase: SupabaseLike;
  cronName: string;
  windowStart: string;
  summary?: unknown;
}

/**
 * Truncate the current time to a 1-minute window start, ISO string.
 * Exposed for callers to pass the same window value into both
 * acquireCronLock and releaseCronLock.
 */
export function currentMinuteWindow(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/**
 * Try to claim the cron run window. On unique-violation (Postgres 23505),
 * returns acquired:false with a human-readable reason — caller should
 * exit early without doing work.
 *
 * RPC/network errors are surfaced as acquired:false too, with the
 * underlying message. Callers can choose to bail (safer) or proceed
 * anyway (riskier — re-introduces the race we're trying to eliminate).
 * The current cron path treats this as bail-via-skip.
 */
export async function acquireCronLock(
  args: AcquireLockArgs,
): Promise<AcquireLockResult> {
  const { supabase, cronName, windowStart } = args;
  const { error } = await supabase
    .from("v2_cron_runs")
    .insert({
      cron_name: cronName,
      run_window_start: windowStart,
      started_at: new Date().toISOString(),
    })
    .select("started_at")
    .single();

  if (!error) return { acquired: true };

  // Postgres unique_violation surfaces as code 23505 via PostgREST.
  // We treat it as a successful coordination outcome ("another run holds
  // it"), not an error.
  const code = (error as { code?: string }).code;
  if (code === "23505") {
    return {
      acquired: false,
      reason: `another cron run holds ${cronName} lock for window ${windowStart}`,
    };
  }
  return {
    acquired: false,
    reason: `lock-insert error (${code ?? "unknown"}): ${error.message}`,
  };
}

/**
 * Mark the run completed with optional result summary. Best-effort — if
 * the update fails (e.g. row was deleted by an ops cleanup), we swallow
 * silently. Lock effectiveness lives in the unique constraint on the
 * primary key, not in the completion update.
 */
export async function releaseCronLock(args: ReleaseLockArgs): Promise<void> {
  const { supabase, cronName, windowStart, summary } = args;
  await supabase
    .from("v2_cron_runs")
    .update({
      completed_at: new Date().toISOString(),
      result_summary: summary ?? null,
    })
    .eq("cron_name", cronName)
    .eq("run_window_start", windowStart);
}

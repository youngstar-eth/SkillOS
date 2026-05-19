// ───────────────────────────────────────────────────────────────────────────
// Tournament cron logic — create + settle.
//
// Two entry points, both intended to be called from a Vercel Cron route.
// Actual schedules live in apps/orchestrator/vercel.json — that file is
// the source of truth; the cadence notes below are descriptive only.
//
//   runCreateTournaments()
//     Currently scheduled daily at 00:00 UTC. Creates one daily tournament
//     per game if none active, and one weekly tournament every Monday.
//     Idempotent: a deterministic bytes32 id
//     (keccak256(game|cycle|startsAt)) makes the on-chain createTournament
//     call revert with TournamentAlreadyExists on retry, which we swallow
//     cleanly. DB insert uses on_chain_id as the dedupe key.
//
//   runSettleTournaments()
//     Currently scheduled daily at 00:05 UTC. For tournaments whose
//     ends_at has passed:
//     (1) acquires v2_cron_runs lock for the current minute window —
//     overlapping runs exit cleanly with lockSkipped (PR #4);
//     (2) reads on-chain state for ALL pending tournaments in a single
//     Multicall3 RPC via readSettleGuardBatch — skips already-settled /
//     not-found / ends-after-now states pre-tx (PR #4 + PR #5);
//     (3) cross-checks each entry's source_duel_ids against v2_duels
//     plausibility verdicts — flags 'implausible' contributors on-chain;
//     (4) builds the sorted ranking and calls settle() on the contract,
//     using an in-memory NonceManager to allow safe parallel broadcasts
//     up to a p-limit(5) in-flight cap (PR #5);
//     (5) updates DB with prize amounts and tx hashes.
//     Idempotent: settle() reverts TournamentAlreadySettled if run twice,
//     and we re-sync DB settled_at from receipt.
//
//     Throughput: PR #5 removed the legacy .limit(20) governor on the
//     pending fetch. Concurrency is now bounded by p-limit(5) wall-time
//     (≤ 5 in-flight tx ≤ 5 mempool slots ≤ 5 RPC calls), not by
//     truncating the pending list. result.deferred is preserved on the
//     public API but always 0.
//
// Both functions return a structured result the cron route JSON-serializes
// directly. Errors are collected per-tournament so a single bad row
// doesn't stop the sweep.
// ───────────────────────────────────────────────────────────────────────────

import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Address,
  type Hex,
  encodeAbiParameters,
  getAddress,
  keccak256,
  toBytes,
} from "viem";
import {
  ERC20_ABI,
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V2_ADDRESS,
  USDC_ADDRESS,
} from "@skillos/contracts";
import { applySPAward } from "../sp/award";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
} from "@skillos/lib-shared";
import { readSettleGuardBatch, type CronSettleGuardResult } from "./settle-guard";
import {
  acquireCronLock,
  currentMinuteWindow,
  releaseCronLock,
} from "./run-lock";
import { createNonceManager, type NonceManager } from "./nonce-manager";
import { createLimit } from "./p-limit";

// ─── Canonical config ──────────────────────────────────────────────────────

export const TOURNAMENT_GAMES = [
  "2048",
  "wordle",
  "sudoku",
  "minesweeper",
  "clicker",
  "match3",
] as const;
export type TournamentGame = (typeof TOURNAMENT_GAMES)[number];

/** Per-game participation bonus. Calibrated so participation contributes
 *  meaningfully without dominating skill. See plan §Task 5. */
const PARTICIPATION_BONUS: Record<TournamentGame, number> = {
  "2048": 50,
  wordle: 200,
  sudoku: 10,
  minesweeper: 20,
  clicker: 1,
  match3: 15,
};

const CYCLE_DAILY = 0; // CycleType.Daily
const CYCLE_WEEKLY = 1; // CycleType.Weekly
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;

/** Default prize pool when env not set. USDC has 6 decimals.
 *
 *  Lowered 10 → 5 on 2026-05-14 to manage testnet sponsor wallet burn rate.
 *  Circle Base Sepolia USDC faucet hard limit is 20 USDC / 2 hrs / address;
 *  6 games × 10 USDC = 60 USDC daily burn was unsustainable. With 5 USDC
 *  pool the daily burn is 30 USDC (60 on Mondays with weeklies) — still
 *  over the faucet rate but manageable with periodic ops top-ups until
 *  the permissionless sponsor pool (Phase 2) replaces direct orchestrator
 *  funding.
 *
 *  Note: `TESTNET_DEFAULT_PRIZE_POOL` env var (set in Vercel for
 *  orchestrator, encrypted) overrides this default. Updating the code
 *  constant alone has no runtime effect until the env value is also
 *  changed or removed.
 *
 *  Revert when Phase 2 permissionless sponsor pool is live and the
 *  orchestrator no longer funds prize pools directly. */
function defaultPrizePoolUsdc(): bigint {
  const raw = process.env.TESTNET_DEFAULT_PRIZE_POOL;
  const n = raw ? Number(raw) : 5;
  if (!Number.isFinite(n) || n <= 0) throw new Error("bad TESTNET_DEFAULT_PRIZE_POOL");
  return BigInt(Math.round(n * 1_000_000));
}

// ─── Time helpers ──────────────────────────────────────────────────────────

/** Start of today in UTC, seconds. */
function startOfTodayUtcSec(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Start of this week's Monday 00:00 UTC, seconds. */
function startOfWeekMondayUtcSec(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  // getUTCDay: Sunday=0, Monday=1, …, Saturday=6. Back up to Monday.
  const dow = d.getUTCDay();
  const offsetDays = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return Math.floor(d.getTime() / 1000);
}

// ─── Logging + error types ─────────────────────────────────────────────────

/** Fatal sweep-aborting error for createTournament reverts. Per X9 strict
 *  policy: any non-TournamentAlreadyExists contract revert is treated as
 *  signaling shared-state corruption (sponsor role, prize pool funding,
 *  derivation logic) and aborts the whole loop — subsequent targets would
 *  hit the same root cause. Next cron tick retries. */
export class TournamentCreateError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TournamentCreateError";
  }
}

/** Structured JSON-line log for Vercel log search. Event names are
 *  dot-separated paths so filters can use prefix matches
 *  (e.g. `tournament.create.*`). */
function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  ctx: Record<string, unknown>,
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...ctx,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

// ─── Revert decoding ───────────────────────────────────────────────────────

/** Walk a viem error chain to the ABI-decoded revert reason, if any.
 *  Returns the custom error name (e.g. "TournamentAlreadyExists") or null
 *  if the error didn't carry decoded revert data (network failure,
 *  non-ABI revert, malformed RPC response).
 *
 *  Why not substring match on err.message: viem's shortMessage format
 *  varies between versions and providers; the selector (4-byte error sig)
 *  encoded in revert data does not. Selector-based decode is invariant.
 *
 *  Note: settle-tournaments has a similar TournamentAlreadySettled
 *  substring match at line ~739; Phase 2 backlog. */
function decodeRevertErrorName(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk(
    (e) => e instanceof ContractFunctionRevertedError,
  );
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.data?.errorName ?? null;
  }
  return null;
}

// ─── ID derivation ─────────────────────────────────────────────────────────

/** Deterministic on-chain id: keccak256(abi.encode(gameSlug, cycle, startsAt)).
 *  Same input → same id → idempotent create on retry. */
export function deriveTournamentId(
  game: TournamentGame,
  cycle: 0 | 1,
  startsAtSec: number,
): Hex {
  const gameSlug = keccak256(toBytes(game));
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint64" },
      ],
      [gameSlug, cycle, BigInt(startsAtSec)],
    ),
  );
}

// ─── Sponsor USDC approval (lazy-ensured) ──────────────────────────────────

async function ensureUsdcAllowance(sponsor: Address, need: bigint): Promise<void> {
  const publicClient = getPublicClient();
  const current = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [sponsor, TOURNAMENT_POOL_V2_ADDRESS],
  })) as bigint;
  if (current >= need) return;

  const walletClient = getWalletClient();
  const approveHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    // Max allowance — one approval covers all future createTournament calls
    // from this sponsor wallet.
    args: [TOURNAMENT_POOL_V2_ADDRESS, 2n ** 256n - 1n],
    account: walletClient.account ?? null,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
}

// ─── Balance preflight ─────────────────────────────────────────────────────

/** X9.1: pre-flight sponsor USDC balance check. Catches wallet burndown
 *  BEFORE the loop starts. Without this, ERC20-balance reverts surface
 *  mid-sweep as TournamentCreateError (X9 strict throw) AFTER some games
 *  have already broadcast — leaving partial daily coverage and operators
 *  chasing per-game logs to find the root cause. Failing loud at the top
 *  with a structured deficit log lets ops top up the sponsor wallet
 *  before the next 00:00 UTC tick.
 *
 *  RCA evidence: GitHub issue #79. Match3 chronic (since 2026-05-09) was
 *  the last-iteration manifestation of this burndown — TOURNAMENT_GAMES
 *  iterates ["2048", "wordle", "sudoku", "minesweeper", "clicker", "match3"]
 *  so match3 is first to be unfunded as balance depletes. 5/10 whole-cron
 *  outage was the all-iteration manifestation (balance zero at start; all
 *  6 reverted). Pre-X9 substring-match catch silently swallowed these
 *  ERC20 reverts via ABI-metadata false-positive on the literal string
 *  "TournamentAlreadyExists" present in viem error context.
 *
 *  Exported for testability; used internally by runCreateTournaments. */
export async function preflightSponsorBalance(args: {
  publicClient: ReturnType<typeof getPublicClient>;
  sponsor: Address;
  totalNeed: bigint;
  cronRunId: string;
  numTargets: number;
  prizePoolPerTarget: bigint;
}): Promise<void> {
  const {
    publicClient,
    sponsor,
    totalNeed,
    cronRunId,
    numTargets,
    prizePoolPerTarget,
  } = args;
  const balance = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [sponsor],
  })) as bigint;
  if (balance < totalNeed) {
    logEvent("error", "tournament.create.preflight.insufficient_balance", {
      cron_run_id: cronRunId,
      sponsor,
      balance_wei: balance.toString(),
      need_wei: totalNeed.toString(),
      deficit_wei: (totalNeed - balance).toString(),
      num_targets: numTargets,
      prize_pool_per_target_wei: prizePoolPerTarget.toString(),
    });
    throw new Error(
      `runCreateTournaments: insufficient sponsor USDC balance — have ${balance.toString()} wei, need ${totalNeed.toString()} wei (${numTargets} targets × ${prizePoolPerTarget.toString()})`,
    );
  }
}

// ─── createTournaments ─────────────────────────────────────────────────────

export interface CreateTournamentsResult {
  created: Array<{
    game: TournamentGame;
    cycle: "daily" | "weekly";
    onChainId: Hex;
    txHash: Hex;
    dbId: string;
  }>;
  skipped: Array<{ game: TournamentGame; cycle: "daily" | "weekly"; reason: string }>;
  errors: Array<{ game: TournamentGame; cycle: "daily" | "weekly"; message: string }>;
}

export async function runCreateTournaments(): Promise<CreateTournamentsResult> {
  const result: CreateTournamentsResult = { created: [], skipped: [], errors: [] };

  const supabase = getSupabaseService();
  const walletClient = getWalletClient();
  const sponsor = walletClient.account?.address;
  if (!sponsor) throw new Error("runCreateTournaments: wallet client has no account");

  const cronRunId = crypto.randomUUID();
  const prizePool = defaultPrizePoolUsdc();

  const nowSec = Math.floor(Date.now() / 1000);
  const todayStart = startOfTodayUtcSec();
  const weekStart = startOfWeekMondayUtcSec();
  const isMonday = new Date().getUTCDay() === 1;

  type Target = {
    game: TournamentGame;
    cycle: "daily" | "weekly";
    cycleEnum: 0 | 1;
    startsAt: number;
    endsAt: number;
    bonus: number;
  };

  const targets: Target[] = [];
  for (const game of TOURNAMENT_GAMES) {
    targets.push({
      game,
      cycle: "daily",
      cycleEnum: CYCLE_DAILY,
      startsAt: todayStart,
      endsAt: todayStart + SECONDS_PER_DAY,
      bonus: PARTICIPATION_BONUS[game],
    });
    if (isMonday) {
      targets.push({
        game,
        cycle: "weekly",
        cycleEnum: CYCLE_WEEKLY,
        startsAt: weekStart,
        endsAt: weekStart + SECONDS_PER_WEEK,
        bonus: PARTICIPATION_BONUS[game],
      });
    }
  }

  // Approve USDC once for the entire sweep. Sized generously to cover all
  // of today's createTournament calls even after partial earlier spend.
  try {
    await ensureUsdcAllowance(sponsor, prizePool * BigInt(targets.length));
  } catch (err) {
    // Can't fund anyone; surface a clear error and bail. The cron will retry
    // next hour; if STUDIO has no balance, manual intervention required.
    throw new Error(
      `runCreateTournaments: USDC approval failed — ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  // X9.1: pre-flight sponsor USDC balance check (see preflightSponsorBalance
  // for rationale + RCA evidence).
  await preflightSponsorBalance({
    publicClient: getPublicClient(),
    sponsor,
    totalNeed: prizePool * BigInt(targets.length),
    cronRunId,
    numTargets: targets.length,
    prizePoolPerTarget: prizePool,
  });

  for (const t of targets) {
    const onChainId = deriveTournamentId(t.game, t.cycleEnum, t.startsAt);

    // Dedupe: if a row with this on_chain_id already exists, skip.
    const { data: existing, error: readErr } = await supabase
      .from("v2_tournaments")
      .select("id, on_chain_id")
      .eq("on_chain_id", onChainId)
      .maybeSingle();
    if (readErr) {
      result.errors.push({ game: t.game, cycle: t.cycle, message: `db read: ${readErr.message}` });
      continue;
    }
    if (existing) {
      // X9 Commit 4: on-chain verify before trusting the dedupe row.
      // If on-chain sponsor === zero, this is a DB-orphan — DB has a row
      // but the chain side was never populated (prior cron crashed after
      // INSERT but before/during writeContract, or a reorg dropped the
      // create tx). Fall through to re-create; the UPSERT below will
      // UPDATE the existing row with real audit data.
      const onChainState = await getPublicClient().readContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "getTournament",
        args: [onChainId],
      });
      const sponsorOnChain = (onChainState as { sponsor: Address }).sponsor;
      const isOrphan = sponsorOnChain === zeroAddress;
      if (!isOrphan) {
        result.skipped.push({
          game: t.game,
          cycle: t.cycle,
          reason: "already exists (verified on-chain)",
        });
        continue;
      }
      logEvent("warn", "tournament.dedupe.orphan_recovery", {
        cron_run_id: cronRunId,
        game: t.game,
        cycle: t.cycle,
        on_chain_id: onChainId,
        db_id: existing.id,
      });
    }

    // Already-ended tournaments (e.g. cron fired late after window closed)
    // shouldn't be created — the contract would accept them but nobody
    // can submit.
    if (t.endsAt <= nowSec) {
      result.skipped.push({ game: t.game, cycle: t.cycle, reason: "window already ended" });
      continue;
    }

    // Broadcast on-chain create. If contract already has this id (e.g. a
    // prior cron left a DB gap), swallow TournamentAlreadyExists.
    let txHash: Hex;
    // X9: audit-trail fields for the DB insert below. NULL on the swallow
    // path so index-tournaments-created can backfill from on-chain events
    // (its UPDATE is gated on creation_tx_hash IS NULL).
    let creationTxHash: Hex | null;
    let creationBlockNumber: bigint | null;
    try {
      txHash = await walletClient.writeContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "createTournament",
        args: [
          onChainId,
          keccak256(toBytes(t.game)),
          t.cycleEnum,
          BigInt(t.startsAt),
          BigInt(t.endsAt),
          prizePool,
          BigInt(t.bonus),
        ],
        account: walletClient.account ?? null,
        chain: walletClient.chain,
      });
      const receipt = await getPublicClient().waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
      creationTxHash = txHash;
      creationBlockNumber = receipt.blockNumber;
    } catch (err) {
      const errorName = decodeRevertErrorName(err);
      if (errorName === "TournamentAlreadyExists") {
        // Chain has it but DB doesn't — reconcile by inserting the DB row
        // below with a null tx hash (we don't know which tx created it).
        logEvent("info", "tournament.create.duplicate", {
          cron_run_id: cronRunId,
          game: t.game,
          cycle: t.cycle,
          on_chain_id: onChainId,
          error_name: errorName,
        });
        txHash = "0x" + "0".repeat(64) as Hex;
        creationTxHash = null;
        creationBlockNumber = null;
      } else {
        // X9 strict policy: any non-TournamentAlreadyExists revert is fatal
        // for the sweep. Subsequent targets share state (sponsor role,
        // prize-pool funding, derivation logic) — if one reverts on these
        // grounds, the rest will too. Throw to the route handler; the next
        // cron tick retries from a fresh sweep.
        const shortMessage =
          err instanceof BaseError
            ? err.shortMessage
            : err instanceof Error
              ? err.message
              : "unknown";
        logEvent("error", "tournament.create.failed", {
          cron_run_id: cronRunId,
          game: t.game,
          cycle: t.cycle,
          on_chain_id: onChainId,
          error_name: errorName ?? "unknown",
          error_message: shortMessage.slice(0, 500),
        });
        throw new TournamentCreateError(
          `createTournament reverted: ${errorName ?? shortMessage}`,
          { cause: err },
        );
      }
    }

    // Persist DB row. X9 Commit 4: UPSERT (not INSERT) so the orphan-
    // recovery path UPDATES the existing DB row with real audit fields
    // instead of failing on the on_chain_id unique constraint. On the
    // swallow path creator_address + creation_tx_hash +
    // creation_block_number stay NULL so the index-tournaments-created
    // cron backfills them from on-chain events (gated on
    // creation_tx_hash IS NULL).
    const { data: inserted, error: insertErr } = await supabase
      .from("v2_tournaments")
      .upsert(
        {
          on_chain_id: onChainId,
          game: t.game,
          cycle_type: t.cycle,
          starts_at: new Date(t.startsAt * 1000).toISOString(),
          ends_at: new Date(t.endsAt * 1000).toISOString(),
          prize_pool_usdc: Number(prizePool) / 1_000_000,
          participation_bonus: t.bonus,
          sponsor_address: sponsor,
          sponsor_name: "Skillbase",
          creator_address:
            creationTxHash === null ? null : sponsor.toLowerCase(),
          created_via: "orchestrator",
          tournament_class: "mixed-declared",
          creation_tx_hash: creationTxHash,
          creation_block_number:
            creationBlockNumber === null ? null : Number(creationBlockNumber),
        },
        { onConflict: "on_chain_id" },
      )
      .select("id")
      .single();
    if (insertErr) {
      result.errors.push({
        game: t.game,
        cycle: t.cycle,
        message: `db insert: ${insertErr.message}`,
      });
      continue;
    }

    const dbId = (inserted as { id: string }).id;
    logEvent("info", "tournament.create.success", {
      cron_run_id: cronRunId,
      game: t.game,
      cycle: t.cycle,
      on_chain_id: onChainId,
      db_id: dbId,
      tx_hash: creationTxHash,
      block_number:
        creationBlockNumber !== null ? Number(creationBlockNumber) : null,
      mode: creationTxHash === null ? "swallow" : "fresh",
    });

    result.created.push({
      game: t.game,
      cycle: t.cycle,
      onChainId,
      txHash,
      dbId,
    });
  }

  return result;
}

// ─── settleTournaments ─────────────────────────────────────────────────────

interface EntryForSettle {
  id: string;
  player_address: string;
  best_score: number;
  match_count: number;
  effective_rank_score: string;
  excluded: boolean;
  source_duel_ids: string[];
  // X14.0b — class persistence. Default 'human' for legacy rows (per migration
  // v4_20260518_x14_class.sql). Settle-cron filters against tournament_class.
  class_tag?: string;
}

export interface SettleTournamentsResult {
  settled: Array<{
    dbId: string;
    onChainId: Hex;
    settleTxHash: Hex;
    participantsSettled: number;
    excluded: number;
    /**
     * X14.0b — count of entries excluded specifically due to class mismatch
     * vs the tournament's declared class. Subset of `excluded` (which also
     * includes anticheat_implausible flags). Surfaced separately so the
     * post-settle audit can distinguish defense-in-depth catches from
     * plausibility catches.
     */
    classMismatchExcluded: number;
    prizePaidUsdc: string;
  }>;
  skipped: Array<{ dbId: string; reason: string }>;
  errors: Array<{ dbId: string; message: string }>;
  /**
   * Count of tournaments matching the pending criteria (settled_at null +
   * ends_at past) that this run did NOT process because of an upstream
   * cap. Preserved as part of the public API for backward compat, but as
   * of PR #5 it is always 0: the .limit(20) cap was removed and overflow
   * is bounded by p-limit(5) wall-time, not pending-list truncation.
   */
  deferred: number;
  /**
   * True when this run exited early because the v2_cron_runs lock was
   * held by another in-flight run (PR #4). Distinct from per-tournament
   * skipped: lockSkipped means we did NO work this tick. Caller can use
   * this to suppress alerting on intentional no-ops.
   */
  lockSkipped?: boolean;
  /** Human-readable lock-acquisition outcome when lockSkipped === true. */
  lockReason?: string;
}

/**
 * Optional dependency overrides for runSettleTournaments. When omitted
 * (production path), each falls back to the corresponding singleton in
 * @skillos/lib-shared / sibling sp/award module — preserving current
 * behavior byte-for-byte.
 *
 * Tests pass mock objects matching the minimal call surface used by the
 * runner. See packages/duel-backend/test/cron-settle.test.ts.
 */
export interface SettleDependencies {
  supabase?: ReturnType<typeof getSupabaseService>;
  walletClient?: ReturnType<typeof getWalletClient>;
  publicClient?: ReturnType<typeof getPublicClient>;
  awardSP?: typeof applySPAward;
  /**
   * PR #5: explicit nonce manager for parallel-safe writeContract calls.
   * Default: lazy-instantiated inside runSettleTournaments from the
   * walletClient.account.address + publicClient. Tests pass a mock to
   * assert nonce-allocation behavior.
   */
  nonceManager?: NonceManager;
  /**
   * PR #5: in-flight tx concurrency cap. Default: createLimit(5).
   * Tests can pass a smaller value (e.g. 1) to force sequential
   * execution and assert ordering invariants.
   */
  concurrency?: number;
}

export async function runSettleTournaments(
  deps: SettleDependencies = {},
): Promise<SettleTournamentsResult> {
  const result: SettleTournamentsResult = {
    settled: [],
    skipped: [],
    errors: [],
    deferred: 0,
  };

  const supabase = deps.supabase ?? getSupabaseService();
  const walletClient = deps.walletClient ?? getWalletClient();
  const publicClient = deps.publicClient ?? getPublicClient();
  const awardSP = deps.awardSP ?? applySPAward;
  // PR #5: lazy NonceManager bound to the signing account. One instance
  // per cron invocation — discarded at end of run, re-seeded on the next.
  // Lazy default avoids triggering getTransactionCount in tests that pass
  // their own mock nonce manager.
  const nonceManager =
    deps.nonceManager ??
    createNonceManager({
      publicClient,
      address: walletClient.account?.address ??
        (() => {
          throw new Error(
            "runSettleTournaments: walletClient has no account; cannot derive nonce manager address",
          );
        })(),
    });
  const concurrency = deps.concurrency ?? 5;

  // C6: Acquire v2_cron_runs lock for this minute-window. If another run
  // already inserted the (cron_name, run_window_start) row, bail without
  // doing any work. Eliminates the wasted-gas race where two overlapping
  // runs both observe settled_at IS NULL and both broadcast settle().
  const cronName = "settle-tournaments";
  const windowStart = currentMinuteWindow();
  const lock = await acquireCronLock({ supabase, cronName, windowStart });
  if (!lock.acquired) {
    return {
      ...result,
      lockSkipped: true,
      lockReason: lock.reason ?? "lock not acquired",
    };
  }

  try {
    return await settleSweep({
      result,
      supabase,
      walletClient,
      publicClient,
      awardSP,
      nonceManager,
      concurrency,
    });
  } finally {
    // Best-effort completion mark. Lock effectiveness is in the unique key,
    // not the completion update, so a release failure doesn't reintroduce
    // the race.
    await releaseCronLock({
      supabase,
      cronName,
      windowStart,
      summary: {
        settled: result.settled.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
        deferred: result.deferred,
        // X14.0b — surface the defense-in-depth catch count in v2_cron_runs
        // so a single SQL on result_summary->'classMismatchExcludedTotal'
        // tells operators whether the off-chain class gate is firing.
        classMismatchExcludedTotal: result.settled.reduce(
          (acc, s) => acc + (s.classMismatchExcluded ?? 0),
          0,
        ),
      },
    });
  }
}

/**
 * Inner sweep — extracted from runSettleTournaments so the lock acquire/
 * release wrapper can stay readable. Mutates the result in place AND
 * returns it (covers both call patterns).
 */
async function settleSweep(args: {
  result: SettleTournamentsResult;
  supabase: ReturnType<typeof getSupabaseService>;
  walletClient: ReturnType<typeof getWalletClient>;
  publicClient: ReturnType<typeof getPublicClient>;
  awardSP: typeof applySPAward;
  nonceManager: NonceManager;
  concurrency: number;
}): Promise<SettleTournamentsResult> {
  const {
    result,
    supabase,
    walletClient,
    publicClient,
    awardSP,
    nonceManager,
    concurrency,
  } = args;

  // PR #5: pending fetch is now unbounded. Throughput is bounded by the
  // p-limit(concurrency) wall-time below, not by truncating the list.
  const { data: pendingRaw, error: readErr } = await supabase
    .from("v2_tournaments")
    .select("*")
    .is("settled_at", null)
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true });
  if (readErr) throw new Error(`runSettleTournaments: ${readErr.message}`);

  type TournamentRow = {
    id: string;
    on_chain_id: string;
    game: string;
    participation_bonus: number;
    prize_pool_usdc: string | number | null;
    // X14.0b — declared class gate. NOT NULL default 'mixed-declared' per
    // migration v4_20260518_x14_class.sql; older rows backfilled at apply.
    tournament_class?: string;
  };
  const pending = (pendingRaw ?? []) as TournamentRow[];

  // PR #5: pre-loop multicall — read on-chain state for all pending
  // tournaments in ONE RPC. Per-tournament handlers below look up their
  // verdict from this map instead of issuing N separate RPCs.
  const guardMap = await readSettleGuardBatch(
    publicClient,
    pending.map((t) => t.on_chain_id as Hex),
  );

  const limit = createLimit(concurrency);

  // Process all pending tournaments concurrently, capped at `concurrency`
  // in-flight. Each handler runs independently — Array.push to result
  // arrays is race-free under JS's single-threaded event loop.
  await Promise.all(
    pending.map((t) =>
      limit(() => settleOneTournament({
        t,
        guard: guardMap.get(t.on_chain_id as Hex),
        result,
        supabase,
        walletClient,
        publicClient,
        awardSP,
        nonceManager,
      })),
    ),
  );

  // PR #5: deferred always 0 — cap removed, full pending list processed.
  result.deferred = 0;
  return result;
}

/**
 * Per-tournament handler — extracted so the parallel loop reads as a
 * single Promise.all + p-limit composition. Side effects identical to
 * the original sequential body: pushes to result.settled / .skipped /
 * .errors and writes to the supabase client passed in.
 *
 * The `guard` argument comes from the multicall pre-loop; if undefined
 * (defensive — shouldn't happen since we built the map from this same
 * id list), we treat it as not_found.
 */
async function settleOneTournament(args: {
  t: {
    id: string;
    on_chain_id: string;
    game: string;
    participation_bonus: number;
    prize_pool_usdc: string | number | null;
    tournament_class?: string;
  };
  guard: CronSettleGuardResult | undefined;
  result: SettleTournamentsResult;
  supabase: ReturnType<typeof getSupabaseService>;
  walletClient: ReturnType<typeof getWalletClient>;
  publicClient: ReturnType<typeof getPublicClient>;
  awardSP: typeof applySPAward;
  nonceManager: NonceManager;
}): Promise<void> {
  const {
    t,
    guard,
    result,
    supabase,
    walletClient,
    publicClient,
    awardSP,
    nonceManager,
  } = args;
  try {
    const onChainId = t.on_chain_id as Hex;

    // PR #5: consume the cached guard verdict from the pre-loop multicall.
    const effectiveGuard: CronSettleGuardResult = guard ?? {
      ok: false,
      reason: "not_found",
      settled: false,
      endsAt: 0n,
      sponsor: "0x0000000000000000000000000000000000000000",
    };
    if (!effectiveGuard.ok) {
      if (effectiveGuard.reason === "already_settled") {
        await supabase
          .from("v2_tournaments")
          .update({ settled_at: new Date().toISOString() })
          .eq("id", t.id)
          .is("settled_at", null);
        result.skipped.push({
          dbId: t.id,
          reason: "on-chain already settled (pre-flight)",
        });
        return;
      }
      if (effectiveGuard.reason === "not_found") {
        result.skipped.push({ dbId: t.id, reason: "on-chain not found" });
        return;
      }
      // ends_after_now: defense-in-depth (pending fetch already filters)
      result.skipped.push({
        dbId: t.id,
        reason: "on-chain ends_at still in future",
      });
      return;
    }

    const { data: entriesRaw, error: eErr } = await supabase
      .from("v2_tournament_entries")
      .select("*")
      .eq("tournament_id", t.id);
    if (eErr) throw new Error(`entries: ${eErr.message}`);
    const entries = (entriesRaw ?? []) as EntryForSettle[];

    // Cross-check plausibility. If any source duel for an entry has
    // verdict='implausible' in v2_duels.plausibility_check, flag + exclude.
    const allDuelIds = new Set<string>();
    for (const e of entries) for (const d of e.source_duel_ids) allDuelIds.add(d);
    const duelIdList = Array.from(allDuelIds);

    const implausibleDuels = new Set<string>();
    if (duelIdList.length > 0) {
      const { data: dRows, error: dErr } = await supabase
        .from("v2_duels")
        .select("id, plausibility_check")
        .in("id", duelIdList);
      if (dErr) throw new Error(`plausibility read: ${dErr.message}`);
      for (const row of dRows ?? []) {
        const verdict = (row as { plausibility_check: { verdict?: string } | null })
          .plausibility_check?.verdict;
        if (verdict === "implausible") {
          implausibleDuels.add((row as { id: string }).id);
        }
      }
    }

    // X14.0b — class-mismatch defense-in-depth. Entries that submitted under
    // a class_tag inconsistent with the tournament's declared class get the
    // same flag-then-exclude treatment as anticheat_implausible. The submit
    // path (X14.0) already returns 403 for the equivalent mismatch; this
    // catches anything that bypassed that gate (legacy rows, schema drift,
    // or paths added without the gate). Per supplement v1.5 §3.16: contracts
    // class-agnostic, enforcement off-chain.
    const declaredClass = t.tournament_class ?? "mixed-declared";
    const classMismatched = new Set<string>();
    if (declaredClass === "human-only" || declaredClass === "agent-only") {
      const required = declaredClass === "human-only" ? "human" : "agent";
      for (const e of entries) {
        if (e.excluded) continue;
        const tag = e.class_tag ?? "human";
        if (tag !== required) {
          classMismatched.add(e.id);
          // Structured audit — emitted before flag so the audit trail is
          // intact even if the flag tx later reverts. Reason field is the
          // grep key for cron run-log review.
          console.warn(
            "[cron settle-tournaments] class_mismatch_settle_exclusion",
            JSON.stringify({
              tournament_id: t.id,
              on_chain_id: onChainId,
              entry_id: e.id,
              player_address: e.player_address,
              tournament_class: declaredClass,
              entry_class_tag: tag,
              reason: "class_mismatch_settle_exclusion",
              ts: new Date().toISOString(),
            }),
          );
        }
      }
    }

    // Flag on-chain + DB for entries tied to any implausible duel OR
    // class-mismatched per X14.0b. Single pass — each entry flagged at most
    // once; reason field disambiguates downstream forensic queries.
    const toFlag: EntryForSettle[] = [];
    for (const e of entries) {
      if (e.excluded) continue;
      const implausible = e.source_duel_ids.some((d) => implausibleDuels.has(d));
      const mismatched = classMismatched.has(e.id);
      if (implausible || mismatched) toFlag.push(e);
    }
    for (const e of toFlag) {
      const player = getAddress(e.player_address);
      try {
        // PR #5: explicit nonce from in-memory NonceManager — required
        // for parallel-safe writeContract under p-limit(N>1).
        const nonce = await nonceManager.next();
        const flagHash = await walletClient.writeContract({
          address: TOURNAMENT_POOL_V2_ADDRESS,
          abi: TOURNAMENT_POOL_ABI,
          functionName: "flagScore",
          args: [onChainId, player],
          account: walletClient.account ?? null,
          chain: walletClient.chain,
          nonce,
        });
        await publicClient.waitForTransactionReceipt({
          hash: flagHash,
          timeout: 60_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        throw new Error(`flagScore(${player}) failed: ${msg}`);
      }
      // class_mismatch takes precedence in the reason field when both apply
      // — class declaration is the structural invariant; implausibility is
      // score-shape evidence. Forensic readers want the structural reason.
      const reason = classMismatched.has(e.id)
        ? "class_mismatch_settle_exclusion"
        : "anticheat_implausible";
      await supabase
        .from("v2_tournament_entries")
        .update({ excluded: true, excluded_reason: reason })
        .eq("id", e.id);
      e.excluded = true; // in-memory mirror for sort below
    }

    // Build sorted ranking from non-excluded entries.
    const ranking = entries
      .filter((e) => !e.excluded)
      .sort((a, b) => {
        const ea = BigInt(Math.round(Number(a.effective_rank_score)));
        const eb = BigInt(Math.round(Number(b.effective_rank_score)));
        if (ea === eb) return 0;
        return ea > eb ? -1 : 1;
      })
      .map((e) => getAddress(e.player_address) as Address);

    // Settle on-chain.
    let settleHash: Hex;
    try {
      // PR #5: explicit nonce from NonceManager — see flagScore comment.
      const nonce = await nonceManager.next();
      settleHash = await walletClient.writeContract({
        address: TOURNAMENT_POOL_V2_ADDRESS,
        abi: TOURNAMENT_POOL_ABI,
        functionName: "settle",
        args: [onChainId, ranking],
        account: walletClient.account ?? null,
        chain: walletClient.chain,
        nonce,
      });
      await publicClient.waitForTransactionReceipt({
        hash: settleHash,
        timeout: 60_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg.includes("TournamentAlreadySettled")) {
        // Idempotent: someone else already settled. Mark DB settled but
        // leave settle_tx_hash null — we didn't own that tx.
        await supabase
          .from("v2_tournaments")
          .update({ settled_at: new Date().toISOString() })
          .eq("id", t.id)
          .is("settled_at", null);
        result.skipped.push({ dbId: t.id, reason: "already settled on-chain" });
        return;
      }
      throw new Error(`settle: ${msg}`);
    }

    const n = ranking.length;
    const pool = BigInt(
      Math.round(Number(t.prize_pool_usdc ?? 0) * 1_000_000),
    );
    const prizes = computePrizeDistribution(n, pool);

    // Persist settlement metadata.
    await supabase
      .from("v2_tournaments")
      .update({
        settled_at: new Date().toISOString(),
        settle_tx_hash: settleHash,
      })
      .eq("id", t.id);

    // A1: batched per-entry prize upsert.
    const prizeRows: Array<{
      tournament_id: string;
      player_address: Address;
      prize_won_usdc: number;
      prize_tx_hash: Hex;
    }> = [];
    for (let i = 0; i < n; ++i) {
      const amt = prizes[i];
      if (amt <= 0n) continue;
      prizeRows.push({
        tournament_id: t.id,
        player_address: ranking[i],
        prize_won_usdc: Number(amt) / 1_000_000,
        prize_tx_hash: settleHash,
      });
    }
    if (prizeRows.length > 0) {
      await supabase
        .from("v2_tournament_entries")
        .upsert(prizeRows, { onConflict: "tournament_id,player_address" });
    }

    // A3: parallel SP awards across ranking — each address is distinct.
    await Promise.all(
      ranking.map((address, i) =>
        awardSP({
          userAddress: address,
          event: { kind: "tournament_rank_bonus", rank: i + 1 },
          counterDelta: {
            tournamentsParticipated: 1,
            tournamentsWon: i === 0 ? 1 : 0,
          },
        }).catch((err) => {
          console.warn(
            "[sp-award] tournament-settle failed",
            t.id,
            address,
            err,
          );
        }),
      ),
    );

    const distributed = prizes.reduce((acc, p) => acc + p, 0n);
    result.settled.push({
      dbId: t.id,
      onChainId,
      settleTxHash: settleHash,
      participantsSettled: n,
      excluded: toFlag.length,
      classMismatchExcluded: classMismatched.size,
      prizePaidUsdc: (Number(distributed) / 1_000_000).toFixed(6),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    result.errors.push({ dbId: t.id, message: msg });
  }
}

/** Mirrors TournamentPool._distributePrizes for DB-side prize bookkeeping.
 *  Returns an array length n of prize amounts (USDC 6-decimals), 0 for
 *  places outside top-50%. */
export function computePrizeDistribution(n: number, pool: bigint): bigint[] {
  const out = new Array<bigint>(n).fill(0n);
  if (n === 0) return out;
  if (n < 4) {
    out[0] = pool;
    return out;
  }
  const topN = Math.ceil(n / 2);
  const BPS_DEN = 10_000n;
  out[0] = (pool * 2500n) / BPS_DEN;
  if (topN >= 2) out[1] = (pool * 1500n) / BPS_DEN;
  if (topN >= 3) out[2] = (pool * 1000n) / BPS_DEN;
  const tier4End = topN < 10 ? topN : 10;
  const per4_10 = (pool * 500n) / BPS_DEN;
  for (let i = 3; i < tier4End; ++i) out[i] = per4_10;
  if (topN > 10) {
    const tier5Count = BigInt(topN - 10);
    const tier5Pool = (pool * 1500n) / BPS_DEN;
    const perT5 = tier5Pool / tier5Count;
    for (let i = 10; i < topN; ++i) out[i] = perT5;
  }
  return out;
}


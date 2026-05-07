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
} from "@skillbase/contracts";
import { applySPAward } from "../sp/award";
import {
  getPublicClient,
  getSupabaseService,
  getWalletClient,
} from "@skillbase/lib-shared";
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

/** Default prize pool when env not set. USDC has 6 decimals. */
function defaultPrizePoolUsdc(): bigint {
  const raw = process.env.TESTNET_DEFAULT_PRIZE_POOL;
  const n = raw ? Number(raw) : 10;
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
      result.skipped.push({ game: t.game, cycle: t.cycle, reason: "already exists" });
      continue;
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
      await getPublicClient().waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      if (message.includes("TournamentAlreadyExists")) {
        // Chain has it but DB doesn't — reconcile by inserting the DB row
        // below with a null tx hash (we don't know which tx created it).
        txHash = "0x" + "0".repeat(64) as Hex;
      } else {
        result.errors.push({ game: t.game, cycle: t.cycle, message });
        continue;
      }
    }

    // Persist DB row.
    const { data: inserted, error: insertErr } = await supabase
      .from("v2_tournaments")
      .insert({
        on_chain_id: onChainId,
        game: t.game,
        cycle_type: t.cycle,
        starts_at: new Date(t.startsAt * 1000).toISOString(),
        ends_at: new Date(t.endsAt * 1000).toISOString(),
        prize_pool_usdc: Number(prizePool) / 1_000_000,
        participation_bonus: t.bonus,
        sponsor_address: sponsor,
        sponsor_name: "Skillbase",
      })
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

    result.created.push({
      game: t.game,
      cycle: t.cycle,
      onChainId,
      txHash,
      dbId: (inserted as { id: string }).id,
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
}

export interface SettleTournamentsResult {
  settled: Array<{
    dbId: string;
    onChainId: Hex;
    settleTxHash: Hex;
    participantsSettled: number;
    excluded: number;
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
 * @skillbase/lib-shared / sibling sp/award module — preserving current
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

    // Flag on-chain + DB for entries tied to any implausible duel.
    const toFlag: EntryForSettle[] = [];
    for (const e of entries) {
      if (e.excluded) continue;
      if (e.source_duel_ids.some((d) => implausibleDuels.has(d))) {
        toFlag.push(e);
      }
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
      await supabase
        .from("v2_tournament_entries")
        .update({ excluded: true, excluded_reason: "anticheat_implausible" })
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


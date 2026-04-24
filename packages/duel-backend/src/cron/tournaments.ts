// ───────────────────────────────────────────────────────────────────────────
// Tournament cron logic — create + settle.
//
// Two entry points, both intended to be called from a Vercel Cron route:
//
//   runCreateTournaments()
//     Scheduled hourly. Creates one daily tournament per game if none
//     active, and one weekly tournament every Monday. Idempotent: a
//     deterministic bytes32 id (keccak256(game|cycle|startsAt)) makes
//     the on-chain createTournament call revert with TournamentAlreadyExists
//     on retry, which we swallow cleanly. DB insert uses on_chain_id as
//     the dedupe key.
//
//   runSettleTournaments()
//     Scheduled every minute. For tournaments whose ends_at has passed:
//     (1) cross-checks each entry's source_duel_ids against v2_duels
//     plausibility verdicts — flags 'implausible' contributors on-chain;
//     (2) builds the sorted ranking, calls settle() on the contract;
//     (3) updates DB with prize amounts and tx hashes.
//     Idempotent: settle() reverts TournamentAlreadySettled if run twice,
//     and we re-sync DB settled_at from receipt. Safe to race.
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
}

export async function runSettleTournaments(): Promise<SettleTournamentsResult> {
  const result: SettleTournamentsResult = { settled: [], skipped: [], errors: [] };

  const supabase = getSupabaseService();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  // Pick up tournaments whose window has ended but aren't settled yet.
  const { data: pendingRaw, error: readErr } = await supabase
    .from("v2_tournaments")
    .select("*")
    .is("settled_at", null)
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true })
    .limit(20);
  if (readErr) throw new Error(`runSettleTournaments: ${readErr.message}`);

  type TournamentRow = {
    id: string;
    on_chain_id: string;
    game: string;
    participation_bonus: number;
  };
  const pending = (pendingRaw ?? []) as TournamentRow[];

  for (const t of pending) {
    try {
      const onChainId = t.on_chain_id as Hex;

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
          const flagHash = await walletClient.writeContract({
            address: TOURNAMENT_POOL_V2_ADDRESS,
            abi: TOURNAMENT_POOL_ABI,
            functionName: "flagScore",
            args: [onChainId, player],
            account: walletClient.account ?? null,
            chain: walletClient.chain,
          });
          await publicClient.waitForTransactionReceipt({
            hash: flagHash,
            timeout: 60_000,
          });
        } catch (err) {
          // Log + continue — the DB mark still happens so ranking is correct
          // even if on-chain flag missed. Settle might then revert
          // (contract still sees this entry as unexcluded). We surface the
          // error and bail this tournament for the current cycle.
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
          // Compare as bigint to be safe against numeric(20,4) scientific
          // notation from PostgREST.
          const ea = BigInt(Math.round(Number(a.effective_rank_score)));
          const eb = BigInt(Math.round(Number(b.effective_rank_score)));
          if (ea === eb) return 0;
          return ea > eb ? -1 : 1;
        })
        .map((e) => getAddress(e.player_address) as Address);

      // Settle on-chain.
      let settleHash: Hex;
      try {
        settleHash = await walletClient.writeContract({
          address: TOURNAMENT_POOL_V2_ADDRESS,
          abi: TOURNAMENT_POOL_ABI,
          functionName: "settle",
          args: [onChainId, ranking],
          account: walletClient.account ?? null,
          chain: walletClient.chain,
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
          continue;
        }
        throw new Error(`settle: ${msg}`);
      }

      // Compute prize amounts per the same top-50% curve the contract uses,
      // so we can persist per-entry prize_won_usdc. Matches TournamentPool
      // _distributePrizes byte-for-byte.
      const n = ranking.length;
      const pool = await readPrizePool(t.id);
      const prizes = computePrizeDistribution(n, pool);

      // Persist settlement metadata.
      await supabase
        .from("v2_tournaments")
        .update({
          settled_at: new Date().toISOString(),
          settle_tx_hash: settleHash,
        })
        .eq("id", t.id);

      for (let i = 0; i < n; ++i) {
        const amt = prizes[i];
        if (amt <= 0n) continue;
        await supabase
          .from("v2_tournament_entries")
          .update({
            prize_won_usdc: Number(amt) / 1_000_000,
            prize_tx_hash: settleHash,
          })
          .eq("tournament_id", t.id)
          .eq("player_address", ranking[i]);
      }

      // Award SP rank bonus + tournament counters to every ranked
      // participant. Top-50 gets (51 - rank) * 2 SP; rank-1 flips the
      // tournaments_won counter. Implausible entries were already excluded
      // up at line ~440, so a rank bonus here is by construction against
      // plausibility-clean rows — no multiplier applies at settle time.
      //
      // Errors per-entry are logged and swallowed so a single failed
      // UPSERT doesn't strip downstream entries' SP.
      for (let i = 0; i < n; ++i) {
        const rank = i + 1;
        try {
          await applySPAward({
            userAddress: ranking[i],
            event: { kind: "tournament_rank_bonus", rank },
            counterDelta: {
              tournamentsParticipated: 1,
              tournamentsWon: rank === 1 ? 1 : 0,
            },
          });
        } catch (err) {
          console.warn(
            "[sp-award] tournament-settle failed",
            t.id,
            ranking[i],
            err,
          );
        }
      }

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

  return result;
}

async function readPrizePool(tournamentDbId: string): Promise<bigint> {
  const { data } = await getSupabaseService()
    .from("v2_tournaments")
    .select("prize_pool_usdc")
    .eq("id", tournamentDbId)
    .single();
  const usd = Number((data as { prize_pool_usdc: string | number } | null)?.prize_pool_usdc ?? 0);
  return BigInt(Math.round(usd * 1_000_000));
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


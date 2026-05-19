// Run with: npx tsx --test packages/duel-backend/test/cron-settle.test.ts
//
// ─── Test scaffolding for runSettleTournaments ─────────────────────────────
//
// Foundation for the cron throughput sprint. PR #1 (orchestrator migration)
// moved the cron host without changing logic; this PR (#2) adds a deps
// injection seam plus 6 test cases so subsequent PRs (#3-5: throughput +
// parallel + nonce manager) can change runner internals without losing
// regression coverage.
//
// Convention: matches settle-guard.test.ts + reconcile.test.ts —
//   - node:test built-in runner, node:assert/strict for assertions
//   - manual mock objects passed via the deps parameter (no vi.mock,
//     no jest, no third-party test framework)
//   - one-line "Run with" header so any contributor can re-run locally
//
// Mock strategy: a thin Supabase chainable that records each query's
// (table, op, payload, filters) and routes responses based on filter
// shape. Writes are captured into a `writes` array for assertions.
// Wallet + public clients expose only the call surface runSettleTournaments
// actually invokes (.writeContract / .waitForTransactionReceipt /
// .account / .chain).

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address, type Hex } from "viem";
import {
  runSettleTournaments,
  type SettleDependencies,
} from "../src/cron/tournaments";

// ─── Address fixtures ──────────────────────────────────────────────────────

const STUDIO = getAddress("0x000000000000000000000000000000000000feed") as Address;
const P1 = getAddress("0x000000000000000000000000000000000000cafe") as Address;
const P2 = getAddress("0x000000000000000000000000000000000000beef") as Address;
const P3 = getAddress("0x000000000000000000000000000000000000abcd") as Address;
const P4 = getAddress("0x000000000000000000000000000000000000dead") as Address;

const TOURNAMENT_DB_ID = "11111111-2222-3333-4444-555555555555";
const ON_CHAIN_ID = ("0x" + "ab".repeat(32)) as Hex;
const TX_HASH_DEFAULT = ("0x" + "cd".repeat(32)) as Hex;

// ─── Mock factories ────────────────────────────────────────────────────────

interface SupabaseMockOptions {
  /** Rows returned by the pending-tournaments fetch. */
  pending?: Array<{
    id: string;
    on_chain_id: string;
    game: string;
    participation_bonus: number;
    // X14.0b — optional declared class; absent means tests are agnostic.
    tournament_class?: string;
  }>;
  /** Entries per tournament_id — keyed by tournament UUID. */
  entriesByTournament?: Map<
    string,
    Array<{
      id: string;
      player_address: string;
      best_score: number;
      match_count: number;
      effective_rank_score: string;
      excluded: boolean;
      source_duel_ids: string[];
      // X14.0b — per-entry class persistence (migration v4_20260518_x14_class).
      // Optional so existing fixtures still type-check without modification.
      class_tag?: string;
    }>
  >;
  /** Plausibility verdicts per source duel id. */
  duelsById?: Map<string, { plausibility_check: { verdict?: string } | null }>;
  /** Prize pool USDC (decimal) per tournament_id. */
  prizePoolByTournamentId?: Map<string, number>;
  /**
   * Override the total-pending count returned by the count: "exact"
   * pending fetch. Defaults to opts.pending.length (zero-deferred). Use
   * to simulate the overflow case where >20 tournaments match the WHERE
   * but only 20 are returned.
   */
  totalPendingOverride?: number;
  /**
   * PR #4 (C6) — simulate a held v2_cron_runs lock by returning a
   * Postgres unique-violation (23505) on the insert. Default false: the
   * insert succeeds (lock acquired). Tests for the lockSkipped path
   * flip this to true.
   */
  cronRunsLockHeld?: boolean;
}

interface CapturedWrite {
  table: string;
  op: "update" | "insert" | "upsert";
  payload: unknown;
  filters: Record<string, unknown>;
}

/**
 * Build a supabase-shaped chainable mock. Responds to the exact set of
 * read queries runSettleTournaments + readPrizePool issue, and records
 * every write to `mock.writes` for later assertion.
 *
 * Cast to the SettleDependencies['supabase'] shape at the call site so
 * tests don't have to satisfy the full SupabaseClient<Database> type.
 */
function makeSupabaseMock(opts: SupabaseMockOptions = {}) {
  const writes: CapturedWrite[] = [];

  function from(table: string) {
    const ctx = {
      table,
      operation: "select" as "select" | "update" | "insert" | "upsert",
      payload: null as unknown,
      filters: {} as Record<string, unknown>,
    };

    const respond = async (): Promise<{
      data: unknown;
      count?: number;
      error: { message: string } | null;
    }> => {
      if (ctx.operation === "update") {
        writes.push({
          table,
          op: "update",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        return { data: null, error: null };
      }
      if (ctx.operation === "insert") {
        writes.push({
          table,
          op: "insert",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        // PR #4 (C6): simulate held lock by returning Postgres 23505.
        if (table === "v2_cron_runs" && opts.cronRunsLockHeld) {
          return {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "v2_cron_runs_pkey"',
            } as { code: string; message: string },
          };
        }
        return { data: ctx.payload, error: null };
      }
      if (ctx.operation === "upsert") {
        // A1: runSettleTournaments now batches per-entry prize writes via
        // a single .upsert(rows, { onConflict }). Capture the array payload
        // verbatim so tests can assert batching (one call, payload.length).
        writes.push({
          table,
          op: "upsert",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        return { data: null, error: null };
      }

      // SELECT routing based on table + filter shape used by the runner.
      if (table === "v2_tournaments") {
        if ("is:settled_at" in ctx.filters && "lt:ends_at" in ctx.filters) {
          // Pending fetch — count: "exact" returns total matching rows
          // alongside the (capped) data slice. Default count = data.length
          // (zero-deferred state); deferredCount option lets tests inject
          // an overflow scenario for the deferred surface assertion.
          const data = opts.pending ?? [];
          const count = opts.totalPendingOverride ?? data.length;
          return { data, count, error: null };
        }
        if ("eq:id" in ctx.filters) {
          // Legacy readPrizePool select branch — kept for forward-compat
          // even though A2 inlined the read into the pending row scope.
          const id = ctx.filters["eq:id"] as string;
          const usd = opts.prizePoolByTournamentId?.get(id);
          return {
            data: usd != null ? { prize_pool_usdc: usd } : null,
            error: null,
          };
        }
      }
      if (table === "v2_tournament_entries") {
        if ("eq:tournament_id" in ctx.filters) {
          const id = ctx.filters["eq:tournament_id"] as string;
          return { data: opts.entriesByTournament?.get(id) ?? [], error: null };
        }
      }
      if (table === "v2_duels") {
        if ("in:id" in ctx.filters) {
          const ids = ctx.filters["in:id"] as string[];
          const data = ids.map((id) => ({
            id,
            plausibility_check:
              opts.duelsById?.get(id)?.plausibility_check ?? null,
          }));
          return { data, error: null };
        }
      }

      return {
        data: null,
        error: {
          message: `unhandled mock query: ${JSON.stringify({ table, ...ctx })}`,
        },
      };
    };

    const builder = {} as Record<string, unknown>;
    Object.assign(builder, {
      select: () => builder,
      insert: (payload: unknown) => {
        ctx.operation = "insert";
        ctx.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        ctx.operation = "update";
        ctx.payload = payload;
        return builder;
      },
      upsert: (payload: unknown, _opts?: unknown) => {
        ctx.operation = "upsert";
        ctx.payload = payload;
        return builder;
      },
      is: (col: string, val: unknown) => {
        ctx.filters[`is:${col}`] = val;
        return builder;
      },
      lt: (col: string, val: unknown) => {
        ctx.filters[`lt:${col}`] = val;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        ctx.filters[`eq:${col}`] = val;
        return builder;
      },
      in: (col: string, val: unknown) => {
        ctx.filters[`in:${col}`] = val;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: () => respond(),
      maybeSingle: () => respond(),
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) => respond().then(onFulfilled, onRejected),
    });
    return builder;
  }

  return { writes, from: from as unknown as { (table: string): unknown } };
}

interface WalletMockOptions {
  /** Per-call writeContract impl. Default returns TX_HASH_DEFAULT. */
  onWriteContract?: (args: {
    functionName: string;
    args: readonly unknown[];
    nonce?: number;
  }) => Promise<Hex>;
}

function makeWalletClient(opts: WalletMockOptions = {}) {
  // PR #5: capture nonce too — Test 6 asserts uniqueness across parallel
  // settles. Optional because pre-PR #5 callers passed no nonce and
  // we want the regression-existing tests to keep working unchanged.
  const writeContractCalls: Array<{
    functionName: string;
    args: readonly unknown[];
    nonce?: number;
  }> = [];
  const writeContract = async (args: {
    functionName: string;
    args: readonly unknown[];
    nonce?: number;
  }) => {
    writeContractCalls.push({
      functionName: args.functionName,
      args: args.args,
      nonce: args.nonce,
    });
    if (opts.onWriteContract) return opts.onWriteContract(args);
    return TX_HASH_DEFAULT;
  };
  return {
    writeContractCalls,
    client: {
      account: { address: STUDIO },
      chain: { id: 84532, name: "Base Sepolia" },
      writeContract,
    },
  };
}

interface PublicClientMockOptions {
  /**
   * PR #4 (B5) — settle-guard readContract response per onChainId.
   * Default: ok-to-settle state (sponsor=STUDIO, settled=false,
   * endsAt=1 (any past timestamp)). Tests for guard branches inject
   * specific shapes here. Keyed by onChainId; "*" is the catch-all.
   */
  tournamentState?: Map<
    string,
    {
      sponsor: `0x${string}`;
      settled: boolean;
      endsAt: bigint;
    }
  >;
}

const STUDIO_SPONSOR_DEFAULT = STUDIO;

function makePublicClient(opts: PublicClientMockOptions = {}) {
  const waitForTransactionReceiptCalls: Array<{ hash: Hex }> = [];
  const readContractCalls: Array<{ functionName: string; args: readonly unknown[] }> = [];

  const readContract = async (args: {
    functionName: string;
    args: readonly unknown[];
  }) => {
    readContractCalls.push({
      functionName: args.functionName,
      args: args.args,
    });
    if (args.functionName === "getTournament") {
      const id = args.args[0] as string;
      const state =
        opts.tournamentState?.get(id) ??
        opts.tournamentState?.get("*") ?? {
          sponsor: STUDIO_SPONSOR_DEFAULT,
          settled: false,
          endsAt: 1n, // any past timestamp — guard's ok-to-settle path
        };
      // Mirrors the on-chain Tournament struct shape (excluding fields the
      // guard doesn't read — game, cycleType, startsAt, prizePool, etc.).
      return {
        sponsor: state.sponsor,
        settled: state.settled,
        endsAt: state.endsAt,
        startsAt: 0n,
        prizePool: 0n,
        participationBonus: 0n,
        participants: [],
        game: "0x" + "00".repeat(32),
        cycleType: 0,
      };
    }
    return null;
  };

  // PR #5: multicall surface used by readSettleGuardBatch. Routes each
  // contract call through the same getTournament resolver as readContract,
  // so a test that sets tournamentState gets consistent verdicts whether
  // its tournaments are queried singly or in a batch.
  const multicallCalls: Array<{ contractCount: number }> = [];
  const multicall = async (args: {
    contracts: ReadonlyArray<{
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }>;
    allowFailure?: boolean;
  }) => {
    multicallCalls.push({ contractCount: args.contracts.length });
    const results: Array<
      | { status: "success"; result: unknown }
      | { status: "failure"; error: unknown }
    > = [];
    for (const c of args.contracts) {
      try {
        const result = await readContract({
          address: c.address,
          abi: c.abi,
          functionName: c.functionName,
          args: c.args,
        });
        results.push({ status: "success" as const, result });
      } catch (err) {
        results.push({ status: "failure" as const, error: err });
      }
    }
    return results;
  };

  return {
    waitForTransactionReceiptCalls,
    readContractCalls,
    multicallCalls,
    client: {
      waitForTransactionReceipt: async (args: { hash: Hex; timeout?: number }) => {
        waitForTransactionReceiptCalls.push({ hash: args.hash });
        return { status: "success" as const };
      },
      readContract,
      multicall,
    },
  };
}

function makeAwardSP() {
  const calls: Array<{
    userAddress: Address;
    rank: number;
  }> = [];
  const fn = async (input: {
    userAddress: string;
    event: { kind: string; rank?: number };
    counterDelta?: unknown;
  }) => {
    calls.push({
      userAddress: getAddress(input.userAddress),
      rank: input.event.rank ?? -1,
    });
    return { delta: 0, total: 0, level: 1, levelProgress: 0 };
  };
  return { calls, fn };
}

/**
 * PR #5: deterministic NonceManager for tests. Issues sequential
 * integers starting at `start` (default 100 — chosen to be visibly
 * non-zero so unset values stand out in failures). Records each
 * .next() result for assertions.
 */
function makeNonceManager(start: number = 100) {
  let counter = start;
  const issued: number[] = [];
  return {
    issued,
    manager: {
      next: async () => {
        const n = counter++;
        issued.push(n);
        return n;
      },
      refresh: async () => {
        counter = start;
      },
    },
  };
}

/** Build the SettleDependencies mock bundle for a test, casting through
 *  the shapes runSettleTournaments expects. */
function buildDeps(parts: {
  supabase: ReturnType<typeof makeSupabaseMock>;
  wallet: ReturnType<typeof makeWalletClient>;
  publicClient: ReturnType<typeof makePublicClient>;
  awardSP: ReturnType<typeof makeAwardSP>;
  nonceManager?: ReturnType<typeof makeNonceManager>;
  concurrency?: number;
}): SettleDependencies {
  const nm = parts.nonceManager ?? makeNonceManager();
  return {
    supabase: parts.supabase as unknown as SettleDependencies["supabase"],
    walletClient: parts.wallet.client as unknown as SettleDependencies["walletClient"],
    publicClient: parts.publicClient.client as unknown as SettleDependencies["publicClient"],
    awardSP: parts.awardSP.fn as unknown as SettleDependencies["awardSP"],
    nonceManager: nm.manager as unknown as SettleDependencies["nonceManager"],
    concurrency: parts.concurrency,
  };
}

// ─── Fixture builders ──────────────────────────────────────────────────────

function makeTournamentRow(
  overrides: Partial<{
    id: string;
    on_chain_id: string;
    game: string;
    participation_bonus: number;
    prize_pool_usdc: number;
    // X14.0b — declared class for class-mismatch settle exclusion test.
    // Default 'mixed-declared' matches the migration's NOT NULL default
    // (existing tests are agnostic to declared class).
    tournament_class: string;
  }> = {},
) {
  return {
    id: TOURNAMENT_DB_ID,
    on_chain_id: ON_CHAIN_ID,
    game: "2048",
    participation_bonus: 50,
    // A2: prize_pool_usdc is now read from the pending row directly
    // (no separate readPrizePool call). 10 USDC matches the existing
    // prizePoolByTournamentId fixture default.
    prize_pool_usdc: 10,
    tournament_class: "mixed-declared",
    ...overrides,
  };
}

function makeEntry(
  player: Address,
  rankScore: string,
  overrides: Partial<{
    id: string;
    excluded: boolean;
    source_duel_ids: string[];
    class_tag: string;
  }> = {},
) {
  return {
    id: `entry-${player.slice(2, 10)}`,
    player_address: player,
    best_score: 1000,
    match_count: 3,
    effective_rank_score: rankScore,
    excluded: false,
    source_duel_ids: [`duel-${player.slice(2, 10)}`],
    // X14.0b — default 'human' matches migration default for legacy rows
    // and existing tests that pre-date class persistence.
    class_tag: "human",
    ...overrides,
  };
}

// ─── Test 1 ────────────────────────────────────────────────────────────────

test("empty pending list → empty result, no chain calls", async () => {
  const supabase = makeSupabaseMock({ pending: [] });
  const wallet = makeWalletClient();
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  assert.deepEqual(result, {
    settled: [],
    skipped: [],
    errors: [],
    deferred: 0,
  });
  assert.equal(wallet.writeContractCalls.length, 0);
  assert.equal(publicClient.waitForTransactionReceiptCalls.length, 0);
  assert.equal(awardSP.calls.length, 0);

  // PR #4 (C6): the lock acquire/release pair writes two rows to
  // v2_cron_runs even on a no-op sweep. Filter those out — the
  // "no domain writes" invariant is what we care about here.
  const domainWrites = supabase.writes.filter(
    (w) => w.table !== "v2_cron_runs",
  );
  assert.equal(domainWrites.length, 0);

  // Settle-guard's getTournament read shouldn't fire when there's nothing
  // pending — the loop body is the only call site.
  const guardReads = publicClient.readContractCalls.filter(
    (c) => c.functionName === "getTournament",
  );
  assert.equal(guardReads.length, 0);
});

// ─── Test 2 ────────────────────────────────────────────────────────────────

test("happy path: 4 entries → settle on-chain + multi-rank prize writes", async () => {
  // n=4 exercises the n>=4 branch in computePrizeDistribution: top-50% = 2,
  // so ranks 1 & 2 each get a non-zero prize (25% + 15% of 10 USDC).
  const entries = [
    makeEntry(P1, "4000"),
    makeEntry(P2, "3000"),
    makeEntry(P3, "2000"),
    makeEntry(P4, "1000"),
  ];
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([[TOURNAMENT_DB_ID, entries]]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]), // 10 USDC pool
  });
  const wallet = makeWalletClient();
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  assert.equal(result.errors.length, 0, `unexpected errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.settled.length, 1);
  assert.equal(result.settled[0].dbId, TOURNAMENT_DB_ID);
  assert.equal(result.settled[0].participantsSettled, 4);
  assert.equal(result.settled[0].excluded, 0);
  assert.equal(result.settled[0].settleTxHash, TX_HASH_DEFAULT);

  // Exactly one settle call (no flags — no implausible verdicts).
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 1);
  // Ranking arg = top-down [P1, P2, P3, P4]
  assert.deepEqual(settleCalls[0].args[1], [P1, P2, P3, P4]);

  // Per the existing n>=4 / topN=2 prize curve: rank 1 = 25%, rank 2 = 15%,
  // ranks 3+4 = 0 (outside top-50%). 25% + 15% = 4 USDC distributed.
  const prizePaid = parseFloat(result.settled[0].prizePaidUsdc);
  assert.equal(prizePaid, 4); // 2.5 + 1.5

  // A1 invariant: ONE batched upsert call against v2_tournament_entries
  // with an array payload of length 2 (P1 + P2 are the only paying ranks
  // in n=4 / topN=2 prize curve). A regression to per-row updates would
  // fail this assertion — that's the point.
  const prizeUpserts = supabase.writes.filter(
    (w) =>
      w.table === "v2_tournament_entries" &&
      w.op === "upsert" &&
      Array.isArray(w.payload),
  );
  assert.equal(prizeUpserts.length, 1, "A1: prize writes must be one batched upsert call");
  const prizePayload = prizeUpserts[0].payload as unknown[];
  assert.equal(prizePayload.length, 2, "A1: upsert payload must contain exactly 2 paying-rank rows");

  // A3 invariant: SP awards issued via Promise.all — order-independent
  // because parallel resolution may interleave. Assert set membership
  // rather than positional rank.
  assert.equal(awardSP.calls.length, 4);
  const ranksSeen = awardSP.calls.map((c) => c.rank).sort((a, b) => a - b);
  assert.deepEqual(ranksSeen, [1, 2, 3, 4]);

  // Deferred surface: pending = 1, totalPending defaults to data.length = 1
  // → no overflow.
  assert.equal(result.deferred, 0);
});

// ─── Test 3 ────────────────────────────────────────────────────────────────
//
// Forward-looking: validates the idempotency invariant for upcoming PR #5
// (B4 — parallel + nonce manager). Today's daily cron schedule never exercises
// this in production, but the parallel refactor in PR #5 will make this
// invariant load-bearing. Catching a regression here is cheaper than catching
// it after a contract revert in prod.
test("parallel invocations: one settled, one skipped (idempotent)", async () => {
  // Shared on-chain state: first settle wins, subsequent ones revert with
  // TournamentAlreadySettled.
  let chainSettled = false;
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([
      [
        TOURNAMENT_DB_ID,
        [makeEntry(P1, "2000"), makeEntry(P2, "1000")],
      ],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient({
    onWriteContract: async ({ functionName }) => {
      if (functionName === "settle") {
        if (chainSettled) {
          throw new Error(
            "execution reverted: TournamentAlreadySettled(0xab...)",
          );
        }
        chainSettled = true;
      }
      return TX_HASH_DEFAULT;
    },
  });
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const deps = buildDeps({ supabase, wallet, publicClient, awardSP });

  // Run two invocations in parallel — they share the chain mock so the
  // second's settle MUST hit the already-settled branch.
  const [a, b] = await Promise.all([
    runSettleTournaments(deps),
    runSettleTournaments(deps),
  ]);

  const settledCount = a.settled.length + b.settled.length;
  const skippedCount = a.skipped.length + b.skipped.length;
  const errorCount = a.errors.length + b.errors.length;

  assert.equal(errorCount, 0, "no runner errors expected for idempotent revert");
  assert.equal(settledCount, 1, "exactly one runner should observe settled");
  assert.equal(skippedCount, 1, "exactly one runner should observe skipped");

  const skippedRow = [...a.skipped, ...b.skipped][0];
  assert.match(skippedRow.reason, /already settled/);
  assert.equal(skippedRow.dbId, TOURNAMENT_DB_ID);

  // Deferred surface: both invocations see the same single-row pending
  // set, so neither has overflow.
  assert.equal(a.deferred + b.deferred, 0);
});

// ─── Test 4 ────────────────────────────────────────────────────────────────

test("TournamentAlreadySettled revert → classified as skipped, not error", async () => {
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([
      [TOURNAMENT_DB_ID, [makeEntry(P1, "2000"), makeEntry(P2, "1000")]],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient({
    onWriteContract: async ({ functionName }) => {
      if (functionName === "settle") {
        throw new Error(
          "execution reverted: TournamentAlreadySettled(0xab...)",
        );
      }
      return TX_HASH_DEFAULT;
    },
  });
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.settled.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /already settled/);
  assert.equal(result.skipped[0].dbId, TOURNAMENT_DB_ID);

  // The DB-side already-settled sync writes settled_at WITHOUT settle_tx_hash
  // (we don't own that tx — see tournaments.ts:478-482).
  const tournamentUpdates = supabase.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(tournamentUpdates.length, 1);
  const payload = tournamentUpdates[0].payload as Record<string, unknown>;
  assert.ok("settled_at" in payload, "settled_at must be set");
  assert.ok(
    !("settle_tx_hash" in payload),
    "settle_tx_hash must be unset for already-settled-on-chain rows",
  );

  assert.equal(result.deferred, 0);
});

// ─── Test 5 ────────────────────────────────────────────────────────────────

test("flagScore mid-list throw → partial DB flags, settle never attempted", async () => {
  const e1 = makeEntry(P1, "3000", { source_duel_ids: ["bad-duel-1"] });
  const e2 = makeEntry(P2, "2000", { source_duel_ids: ["bad-duel-2"] });
  const e3 = makeEntry(P3, "1000", { source_duel_ids: ["bad-duel-3"] });

  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([[TOURNAMENT_DB_ID, [e1, e2, e3]]]),
    duelsById: new Map([
      ["bad-duel-1", { plausibility_check: { verdict: "implausible" } }],
      ["bad-duel-2", { plausibility_check: { verdict: "implausible" } }],
      ["bad-duel-3", { plausibility_check: { verdict: "implausible" } }],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });

  let flagCallIndex = 0;
  const wallet = makeWalletClient({
    onWriteContract: async ({ functionName }) => {
      if (functionName === "flagScore") {
        flagCallIndex++;
        if (flagCallIndex === 3) {
          throw new Error("execution reverted: simulated RPC failure");
        }
        return TX_HASH_DEFAULT;
      }
      return TX_HASH_DEFAULT;
    },
  });
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  // Tournament reported in errors — outer try/catch (tournaments.ts:556-559)
  // catches the re-thrown flagScore failure.
  assert.equal(result.settled.length, 0);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].dbId, TOURNAMENT_DB_ID);
  assert.match(result.errors[0].message, /flagScore/);

  // Settle never called — runner bailed before line 461 settle() write.
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 0);

  // Exactly two entries marked excluded in DB (entries 1 & 2 — DB write
  // happens AFTER chain receipt at tournaments.ts:438, so the 3rd entry's
  // throw on the chain write skips the matching DB update).
  const excludedWrites = supabase.writes.filter(
    (w) =>
      w.table === "v2_tournament_entries" &&
      w.op === "update" &&
      typeof w.payload === "object" &&
      w.payload !== null &&
      "excluded" in w.payload,
  );
  assert.equal(excludedWrites.length, 2);

  // No SP awards — settle never executed, so the SP loop never ran.
  assert.equal(awardSP.calls.length, 0);

  assert.equal(result.deferred, 0);
});

// ─── Test 6 (skipped placeholder) ──────────────────────────────────────────
//
// Activation trigger: PR #5 (B4 — parallel settle + nonce manager). Today,
// runSettleTournaments processes pending rows sequentially and viem auto-
// manages nonces against the public client — there is no nonce manager to
// test. Once PR #5 introduces a NonceTracker (or equivalent), un-skip this
// test and assert that 5 parallel runs emit 5 distinct nonces on
// writeContract calls (hence no "nonce too low" reverts at scale).
// Activated in PR #5 — proves NonceManager allocates distinct
// consecutive integers across parallel settle broadcasts within a
// single runSettleTournaments invocation. Without the manager, viem's
// default writeContract would fetch getTransactionCount(pending) on
// every call and hand back the same nonce to two concurrent callers,
// reverting the second tx as "nonce too low".
test("nonce manager: 5 parallel settles emit 5 distinct consecutive nonces", async () => {
  // Five distinct tournaments — each gets its own DB row, on-chain id,
  // entries, and prize pool. settleSweep processes them via p-limit(5)
  // wrapped Promise.all → up to 5 concurrent writeContract calls.
  const tournaments = Array.from({ length: 5 }, (_, i) => ({
    dbId: `tour-${i}`,
    onChainId: ("0x" + (10 + i).toString(16).padStart(64, "0")) as Hex,
  }));

  const pending = tournaments.map((tt) =>
    makeTournamentRow({ id: tt.dbId, on_chain_id: tt.onChainId }),
  );
  const entriesByTournament = new Map(
    tournaments.map((tt) => [
      tt.dbId,
      [makeEntry(P1, "2000"), makeEntry(P2, "1000")],
    ]),
  );
  const prizePoolByTournamentId = new Map(
    tournaments.map((tt) => [tt.dbId, 10]),
  );

  const supabase = makeSupabaseMock({
    pending,
    entriesByTournament,
    prizePoolByTournamentId,
  });
  const wallet = makeWalletClient();
  // Default tournament state (ok-to-settle) for every onChainId via the
  // catch-all "*" key — saves declaring 5 separate entries.
  const publicClient = makePublicClient({
    tournamentState: new Map([
      ["*", { sponsor: STUDIO, settled: false, endsAt: 1n }],
    ]),
  });
  const awardSP = makeAwardSP();
  const nonceManager = makeNonceManager(100);

  const result = await runSettleTournaments(
    buildDeps({
      supabase,
      wallet,
      publicClient,
      awardSP,
      nonceManager,
      concurrency: 5,
    }),
  );

  // All 5 settled cleanly.
  assert.equal(result.errors.length, 0, `unexpected errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.settled.length, 5);

  // Critical invariant — exactly 5 settle broadcasts, each carrying
  // a distinct consecutive nonce. This is the core regression Test 6
  // protects: a viem default-nonce path would emit duplicate or
  // collision-prone values here.
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 5, "must emit one settle per tournament");

  const noncesIssued = settleCalls.map((c) => c.nonce);
  // Every settle MUST have received an explicit nonce — undefined here
  // means we forgot to pass it through writeContract args.
  for (const n of noncesIssued) {
    assert.equal(typeof n, "number", `settle missing explicit nonce: ${n}`);
  }
  // 5 distinct values.
  const uniqueNonces = new Set(noncesIssued);
  assert.equal(uniqueNonces.size, 5, `expected 5 unique nonces, got ${noncesIssued.join(",")}`);

  // The nonce manager handed out exactly 5 sequential values starting
  // at the seed (100). Sorting because Promise.all order is not
  // deterministic across parallel resolution.
  const sortedNonces = [...noncesIssued].sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(sortedNonces, [100, 101, 102, 103, 104]);

  // Manager-side captured order: each next() call recorded. With 5
  // tournaments running in parallel, the manager's mutex serializes
  // them, so issued values are 100..104 in some order — and the count
  // matches the number of writeContract calls issued.
  assert.equal(nonceManager.issued.length, 5);
  assert.deepEqual(
    [...nonceManager.issued].sort((a, b) => a - b),
    [100, 101, 102, 103, 104],
  );

  // Multicall pre-loop: ONE call carrying all 5 contracts.
  assert.equal(publicClient.multicallCalls.length, 1);
  assert.equal(publicClient.multicallCalls[0].contractCount, 5);

  // SP awards: 2 entries × 5 tournaments = 10 fan-out calls.
  assert.equal(awardSP.calls.length, 10);

  // Cap removed: deferred is always 0 in PR #5+.
  assert.equal(result.deferred, 0);
});

// ─── Test 7 (PR #4 — B5 settle-guard, already_settled) ─────────────────────

test("settle-guard catches already-settled state pre-tx — settle never broadcast", async () => {
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([
      [TOURNAMENT_DB_ID, [makeEntry(P1, "2000"), makeEntry(P2, "1000")]],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient();
  const publicClient = makePublicClient({
    tournamentState: new Map([
      [
        ON_CHAIN_ID,
        { sponsor: STUDIO, settled: true, endsAt: 1n },
      ],
    ]),
  });
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.settled.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].dbId, TOURNAMENT_DB_ID);
  assert.match(result.skipped[0].reason, /pre-flight/);
  assert.match(result.skipped[0].reason, /already settled/);

  // The pre-flight skip path mirrors the post-tx already-settled path:
  // mark settled_at, no settle_tx_hash (we don't own that tx).
  const tournamentUpdates = supabase.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(tournamentUpdates.length, 1);
  const payload = tournamentUpdates[0].payload as Record<string, unknown>;
  assert.ok("settled_at" in payload);
  assert.ok(
    !("settle_tx_hash" in payload),
    "pre-flight skip must NOT set settle_tx_hash",
  );

  // Critical invariant: settle() never called → no gas burned.
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 0, "B5: settle must NOT broadcast pre-flight");

  // Guard read happened exactly once (one pending tournament).
  const guardReads = publicClient.readContractCalls.filter(
    (c) => c.functionName === "getTournament",
  );
  assert.equal(guardReads.length, 1);

  // No SP awarded — settle never executed.
  assert.equal(awardSP.calls.length, 0);
});

// ─── Test 8 (PR #4 — B5 settle-guard, not_found) ───────────────────────────

test("settle-guard catches not-found state pre-tx — DB anomaly preserved", async () => {
  const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow()],
    entriesByTournament: new Map([
      [TOURNAMENT_DB_ID, [makeEntry(P1, "2000"), makeEntry(P2, "1000")]],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient();
  // sponsor === 0x0 ⇒ contract storage zero-init ⇒ tournament never created.
  const publicClient = makePublicClient({
    tournamentState: new Map([
      [
        ON_CHAIN_ID,
        { sponsor: ZERO, settled: false, endsAt: 0n },
      ],
    ]),
  });
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.settled.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /not found/);

  // Critical invariant: not_found does NOT mark DB settled. The DB row
  // remains visible to ops as an anomaly to investigate.
  const tournamentUpdates = supabase.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(
    tournamentUpdates.length,
    0,
    "not_found path must NOT mark DB settled — preserves anomaly",
  );

  // settle() never broadcast.
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 0);
  assert.equal(awardSP.calls.length, 0);
});

// ─── Test 9 (PR #4 — C6 advisory lock) ─────────────────────────────────────

test("advisory lock held by other run → early exit with lockSkipped", async () => {
  const supabase = makeSupabaseMock({
    cronRunsLockHeld: true, // simulate Postgres 23505 unique-violation
    pending: [makeTournamentRow()], // present but never read
    entriesByTournament: new Map([
      [TOURNAMENT_DB_ID, [makeEntry(P1, "2000")]],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient();
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  const result = await runSettleTournaments(
    buildDeps({ supabase, wallet, publicClient, awardSP }),
  );

  // Result shape: lockSkipped flag set, all sweep-result arrays empty.
  assert.equal(result.lockSkipped, true);
  assert.equal(typeof result.lockReason, "string");
  assert.match(
    result.lockReason ?? "",
    /settle-tournaments/,
    "lock reason should name the cron",
  );
  assert.equal(result.settled.length, 0);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.deferred, 0);

  // Critical invariant: NO domain side effects when the lock is held.
  // The other run is doing the work — ours must be a clean no-op.
  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 0, "C6: settle must NOT broadcast under held lock");

  // No pending fetch — runner bails before line 469's v2_tournaments select.
  const tournamentReads = supabase.writes.filter(
    (w) => w.table === "v2_tournaments",
  );
  assert.equal(tournamentReads.length, 0);

  // No settle-guard read either — runner exits before per-tournament loop.
  const guardReads = publicClient.readContractCalls.filter(
    (c) => c.functionName === "getTournament",
  );
  assert.equal(guardReads.length, 0);

  // No SP awards.
  assert.equal(awardSP.calls.length, 0);

  // The single v2_cron_runs insert attempt was made (and rejected by the
  // mock with 23505) — there was NO update (release) because we never
  // entered the try-finally body.
  const cronRunsWrites = supabase.writes.filter(
    (w) => w.table === "v2_cron_runs",
  );
  assert.equal(cronRunsWrites.length, 1);
  assert.equal(cronRunsWrites[0].op, "insert");
});

// ─── Test 10 — X14.0b class-mismatch settle exclusion ──────────────────────
//
// Defense-in-depth: the submit path (X14.0) already 403s when a class_tag
// would land in a tournament with an incompatible class declaration. This
// test simulates the bypass scenario — an agent-class entry that somehow
// reached v2_tournament_entries inside a human-only tournament — and
// asserts the cron settle path excludes it the same way it excludes
// anticheat_implausible entries. Per supplement v1.5 §3.16: contracts
// class-agnostic, enforcement off-chain.

test("X14.0b: class-mismatch entry flagged + excluded + structured audit", async () => {
  // Tournament declares human-only. P1 (agent) is the bypass attempt;
  // P2 (human) is legitimate. Settle should flag P1 and rank only P2.
  const supabase = makeSupabaseMock({
    pending: [makeTournamentRow({ tournament_class: "human-only" })],
    entriesByTournament: new Map([
      [
        TOURNAMENT_DB_ID,
        [
          // Explicit ids — the default `entry-${player.slice(2,10)}` collides
          // because all P# fixture addresses share their 4th-byte run of 0s.
          makeEntry(P1, "5000", { id: "entry-p1", class_tag: "agent" }),
          makeEntry(P2, "3000", { id: "entry-p2", class_tag: "human" }),
        ],
      ],
    ]),
    prizePoolByTournamentId: new Map([[TOURNAMENT_DB_ID, 10]]),
  });
  const wallet = makeWalletClient();
  const publicClient = makePublicClient();
  const awardSP = makeAwardSP();

  // Capture structured warn output. The cron emits a JSON-string payload
  // for each excluded row keyed by reason='class_mismatch_settle_exclusion'.
  const warnCalls: Array<{ tag: string; payload: string }> = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const [tag, payload] = args;
    if (
      typeof tag === "string" &&
      tag.includes("class_mismatch_settle_exclusion") &&
      typeof payload === "string"
    ) {
      warnCalls.push({ tag, payload });
    }
  };

  let result;
  try {
    result = await runSettleTournaments(
      buildDeps({ supabase, wallet, publicClient, awardSP }),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(result.errors.length, 0);
  assert.equal(result.settled.length, 1);
  assert.equal(
    result.settled[0].classMismatchExcluded,
    1,
    "P1 (agent in human-only) must count toward classMismatchExcluded",
  );
  assert.equal(
    result.settled[0].excluded,
    1,
    "P1 must show up in the total excluded count too",
  );
  assert.equal(
    result.settled[0].participantsSettled,
    1,
    "ranking on-chain must contain only the human (P2)",
  );

  // Chain calls: exactly one flagScore (P1) + one settle ([P2]).
  const flagCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "flagScore",
  );
  assert.equal(flagCalls.length, 1, "flagScore must fire once for P1");
  assert.equal(flagCalls[0].args[1], P1, "flagScore target must be P1");

  const settleCalls = wallet.writeContractCalls.filter(
    (c) => c.functionName === "settle",
  );
  assert.equal(settleCalls.length, 1);
  assert.deepEqual(
    settleCalls[0].args[1],
    [P2],
    "ranking must exclude class-mismatched P1",
  );

  // DB write: P1's entry update carries the class_mismatch reason (NOT the
  // anticheat_implausible reason — the precedence rule routes structural
  // mismatches to the structural reason field).
  const excludeUpdates = supabase.writes.filter(
    (w) =>
      w.table === "v2_tournament_entries" &&
      w.op === "update" &&
      typeof w.payload === "object" &&
      w.payload !== null &&
      "excluded_reason" in (w.payload as Record<string, unknown>),
  );
  assert.equal(excludeUpdates.length, 1, "exactly one entry exclusion update");
  const updatePayload = excludeUpdates[0].payload as {
    excluded: boolean;
    excluded_reason: string;
  };
  assert.equal(updatePayload.excluded, true);
  assert.equal(
    updatePayload.excluded_reason,
    "class_mismatch_settle_exclusion",
    "structural mismatch must take precedence in excluded_reason",
  );

  // Structured audit: one console.warn line, JSON-parseable, contains the
  // canonical reason key + the tournament/entry context for forensic search.
  assert.equal(
    warnCalls.length,
    1,
    "exactly one class_mismatch_settle_exclusion audit entry",
  );
  const audit = JSON.parse(warnCalls[0].payload) as {
    tournament_id: string;
    entry_id: string;
    player_address: string;
    tournament_class: string;
    entry_class_tag: string;
    reason: string;
  };
  assert.equal(audit.tournament_id, TOURNAMENT_DB_ID);
  assert.equal(audit.entry_id, "entry-p1");
  assert.equal(audit.player_address, P1);
  assert.equal(audit.tournament_class, "human-only");
  assert.equal(audit.entry_class_tag, "agent");
  assert.equal(audit.reason, "class_mismatch_settle_exclusion");
});

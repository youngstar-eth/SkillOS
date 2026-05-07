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
    }>
  >;
  /** Plausibility verdicts per source duel id. */
  duelsById?: Map<string, { plausibility_check: { verdict?: string } | null }>;
  /** Prize pool USDC (decimal) per tournament_id. */
  prizePoolByTournamentId?: Map<string, number>;
}

interface CapturedWrite {
  table: string;
  op: "update" | "insert";
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
      operation: "select" as "select" | "update" | "insert",
      payload: null as unknown,
      filters: {} as Record<string, unknown>,
    };

    const respond = async (): Promise<{
      data: unknown;
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
        return { data: ctx.payload, error: null };
      }

      // SELECT routing based on table + filter shape used by the runner.
      if (table === "v2_tournaments") {
        if ("is:settled_at" in ctx.filters && "lt:ends_at" in ctx.filters) {
          // Pending fetch
          return { data: opts.pending ?? [], error: null };
        }
        if ("eq:id" in ctx.filters) {
          // readPrizePool single() select
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
  }) => Promise<Hex>;
}

function makeWalletClient(opts: WalletMockOptions = {}) {
  const writeContractCalls: Array<{
    functionName: string;
    args: readonly unknown[];
  }> = [];
  const writeContract = async (args: {
    functionName: string;
    args: readonly unknown[];
  }) => {
    writeContractCalls.push({
      functionName: args.functionName,
      args: args.args,
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

function makePublicClient() {
  const waitForTransactionReceiptCalls: Array<{ hash: Hex }> = [];
  return {
    waitForTransactionReceiptCalls,
    client: {
      waitForTransactionReceipt: async (args: { hash: Hex; timeout?: number }) => {
        waitForTransactionReceiptCalls.push({ hash: args.hash });
        return { status: "success" as const };
      },
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

/** Build the SettleDependencies mock bundle for a test, casting through
 *  the shapes runSettleTournaments expects. */
function buildDeps(parts: {
  supabase: ReturnType<typeof makeSupabaseMock>;
  wallet: ReturnType<typeof makeWalletClient>;
  publicClient: ReturnType<typeof makePublicClient>;
  awardSP: ReturnType<typeof makeAwardSP>;
}): SettleDependencies {
  return {
    supabase: parts.supabase as unknown as SettleDependencies["supabase"],
    walletClient: parts.wallet.client as unknown as SettleDependencies["walletClient"],
    publicClient: parts.publicClient.client as unknown as SettleDependencies["publicClient"],
    awardSP: parts.awardSP.fn as unknown as SettleDependencies["awardSP"],
  };
}

// ─── Fixture builders ──────────────────────────────────────────────────────

function makeTournamentRow(overrides: Partial<{ id: string; on_chain_id: string; game: string; participation_bonus: number }> = {}) {
  return {
    id: TOURNAMENT_DB_ID,
    on_chain_id: ON_CHAIN_ID,
    game: "2048",
    participation_bonus: 50,
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

  assert.deepEqual(result, { settled: [], skipped: [], errors: [] });
  assert.equal(wallet.writeContractCalls.length, 0);
  assert.equal(publicClient.waitForTransactionReceiptCalls.length, 0);
  assert.equal(awardSP.calls.length, 0);
  assert.equal(supabase.writes.length, 0);
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

  // Two prize update writes — one per paying rank (P1, P2).
  const prizeUpdates = supabase.writes.filter(
    (w) =>
      w.table === "v2_tournament_entries" &&
      w.op === "update" &&
      typeof w.payload === "object" &&
      w.payload !== null &&
      "prize_won_usdc" in w.payload,
  );
  assert.equal(prizeUpdates.length, 2);

  // SP awards: one per ranked participant (4).
  assert.equal(awardSP.calls.length, 4);
  assert.equal(awardSP.calls[0].rank, 1);
  assert.equal(awardSP.calls[3].rank, 4);
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
});

// ─── Test 6 (skipped placeholder) ──────────────────────────────────────────
//
// Activation trigger: PR #5 (B4 — parallel settle + nonce manager). Today,
// runSettleTournaments processes pending rows sequentially and viem auto-
// manages nonces against the public client — there is no nonce manager to
// test. Once PR #5 introduces a NonceTracker (or equivalent), un-skip this
// test and assert that 5 parallel runs emit 5 distinct nonces on
// writeContract calls (hence no "nonce too low" reverts at scale).
test(
  "PLACEHOLDER (PR #5): parallel settles emit unique nonces via nonce manager",
  { skip: "Pending PR #5 — nonce manager does not exist yet" },
  async () => {
    // Shape sketch for future activation:
    //   const nonces = wallet.writeContractCalls.map((c) => c.nonce);
    //   const unique = new Set(nonces);
    //   assert.equal(unique.size, 5);
    //   assert.equal(nonces.length, 5);
    assert.fail("placeholder body — should remain skipped until PR #5 lands");
  },
);

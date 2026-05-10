// Run with: npx tsx --test packages/duel-backend/test/index-tournaments-created.test.ts
//
// ─── Test scaffolding for runIndexTournamentsCreated ───────────────────────
//
// Mirrors the cron-settle.test.ts mock factory pattern (slimmer — this
// indexer touches fewer tables and has no wallet path). Convention:
//   - node:test built-in runner, node:assert/strict for assertions
//   - manual mock objects passed via the deps parameter (no vi.mock,
//     no jest, no third-party test framework)
//   - one-line "Run with" header so any contributor can re-run locally
//
// Mock strategy: a thin Supabase chainable that records each query's
// (table, op, payload, filters) and routes responses based on filter
// shape. Writes are captured into a `writes` array for assertions.
// PublicClient exposes only the call surface runIndexTournamentsCreated
// invokes (.getBlockNumber / .getLogs).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  toBytes,
} from "viem";
import {
  runIndexTournamentsCreated,
  type IndexTournamentsCreatedDependencies,
} from "../src/cron/index-tournaments-created";
import { TOURNAMENT_POOL_ABI } from "@skillos/contracts";

// ─── Address fixtures ──────────────────────────────────────────────────────

const SDK_CREATOR = getAddress(
  "0x000000000000000000000000000000000000beef",
) as Address;
const ORCHESTRATOR = getAddress(
  "0x000000000000000000000000000000000000feed",
) as Address;

const ON_CHAIN_ID_A = ("0x" + "ab".repeat(32)) as Hex;
const ON_CHAIN_ID_B = ("0x" + "cd".repeat(32)) as Hex;
const TX_HASH = ("0x" + "ee".repeat(32)) as Hex;
const TX_HASH_2 = ("0x" + "ff".repeat(32)) as Hex;

const GAME_2048_HASH = keccak256(toBytes("2048"));
const GAME_WORDLE_HASH = keccak256(toBytes("wordle"));
const UNKNOWN_GAME_HASH = keccak256(toBytes("not-a-game-slug-X"));

// ─── Log builder ───────────────────────────────────────────────────────────

interface LogArgs {
  id: Hex;
  sponsor: Address;
  game: Hex;
  cycleType: number;
  startsAt: bigint;
  endsAt: bigint;
  prizePool: bigint;
  participationBonus: bigint;
}

function buildLog(args: LogArgs, blockNumber: bigint, txHash: Hex, logIndex: number) {
  // Build topics + data the way TournamentPool emits TournamentCreated.
  // viem.encodeEventTopics handles the indexed slots; data carries the
  // non-indexed tail.
  const topics = encodeEventTopics({
    abi: TOURNAMENT_POOL_ABI,
    eventName: "TournamentCreated",
    args: { id: args.id, sponsor: args.sponsor, game: args.game },
  });
  const data = encodeAbiParameters(
    [
      { type: "uint8" },
      { type: "uint64" },
      { type: "uint64" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [
      args.cycleType,
      args.startsAt,
      args.endsAt,
      args.prizePool,
      args.participationBonus,
    ],
  );
  return {
    address: "0x0000000000000000000000000000000000000123" as Address,
    topics,
    data,
    blockNumber,
    blockHash: ("0x" + "bb".repeat(32)) as Hex,
    transactionHash: txHash,
    transactionIndex: 0,
    logIndex,
    removed: false,
  };
}

// ─── Supabase mock ─────────────────────────────────────────────────────────

interface SupabaseMockOptions {
  /** Watermark row returned for v2_tournament_indexer_state. */
  watermark?: { last_indexed_block: string } | null;
  /** Lookup hits for v2_tournaments by on_chain_id. Key = lowercase id. */
  tournamentsByOnChainId?: Map<
    string,
    { id: string; creation_tx_hash: string | null }
  >;
}

interface CapturedWrite {
  table: string;
  op: "update" | "insert" | "upsert";
  payload: unknown;
  filters: Record<string, unknown>;
}

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
      if (ctx.operation === "upsert") {
        writes.push({
          table,
          op: "upsert",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        return { data: null, error: null };
      }

      // SELECT routing
      if (table === "v2_tournament_indexer_state") {
        // Watermark lookup
        return { data: opts.watermark ?? null, error: null };
      }
      if (table === "v2_tournaments") {
        if ("eq:on_chain_id" in ctx.filters) {
          const id = ctx.filters["eq:on_chain_id"] as string;
          const row = opts.tournamentsByOnChainId?.get(id);
          return { data: row ?? null, error: null };
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
      eq: (col: string, val: unknown) => {
        ctx.filters[`eq:${col}`] = val;
        return builder;
      },
      is: (col: string, val: unknown) => {
        ctx.filters[`is:${col}`] = val;
        return builder;
      },
      maybeSingle: () => respond(),
      single: () => respond(),
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) => respond().then(onFulfilled, onRejected),
    });
    return builder;
  }

  return { writes, from: from as unknown as { (table: string): unknown } };
}

// ─── PublicClient mock ────────────────────────────────────────────────────

interface PublicClientMockOptions {
  blockNumber?: bigint;
  logs?: ReturnType<typeof buildLog>[];
  /** Capture getLogs args for span/range assertions. */
  onGetLogs?: (args: { fromBlock: bigint; toBlock: bigint }) => void;
}

function makePublicClient(opts: PublicClientMockOptions = {}) {
  const getLogsCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  return {
    calls: getLogsCalls,
    client: {
      getBlockNumber: async () => opts.blockNumber ?? 0n,
      getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) => {
        getLogsCalls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
        opts.onGetLogs?.(args);
        return opts.logs ?? [];
      },
    },
  };
}

// ─── Helper: build deps ───────────────────────────────────────────────────

function makeDeps(
  supabase: ReturnType<typeof makeSupabaseMock>,
  publicClient: ReturnType<typeof makePublicClient>,
): IndexTournamentsCreatedDependencies {
  return {
    supabase: supabase as unknown as IndexTournamentsCreatedDependencies["supabase"],
    publicClient: publicClient.client as unknown as IndexTournamentsCreatedDependencies["publicClient"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

test("empty result set: no events → zero writes (other than watermark advance)", async () => {
  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [],
  });

  const result = await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(result.eventsFound, 0);
  assert.equal(result.backfilled, 0);
  assert.equal(result.inserted, 0);
  assert.deepEqual(result.errors, []);
  // Only write should be the watermark upsert.
  const watermarkWrites = supabase.writes.filter(
    (w) => w.table === "v2_tournament_indexer_state",
  );
  assert.equal(watermarkWrites.length, 1);
  assert.equal(watermarkWrites[0]!.op, "upsert");
  // safeLatest = 40851600 - 30 = 40851570 → toBlock = 40851570
  assert.equal(
    (watermarkWrites[0]!.payload as { last_indexed_block: string })
      .last_indexed_block,
    "40851570",
  );
});

test("first run with no watermark: fromBlock = deployBlock (40_851_426)", async () => {
  const supabase = makeSupabaseMock({ watermark: null });
  const publicClient = makePublicClient({
    blockNumber: 40_900_000n,
    logs: [],
  });

  await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  // First getLogs call should start at deployBlock - 1 + 1 = 40_851_426.
  assert.equal(publicClient.calls.length, 1);
  assert.equal(publicClient.calls[0]!.fromBlock, 40_851_426n);
});

test("orchestrator-existing row: backfills creator_address + creation_tx_hash via UPDATE", async () => {
  const tournaments = new Map<string, { id: string; creation_tx_hash: string | null }>();
  tournaments.set(ON_CHAIN_ID_A, {
    id: "11111111-2222-3333-4444-555555555555",
    creation_tx_hash: null,
  });

  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
    tournamentsByOnChainId: tournaments,
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [
      buildLog(
        {
          id: ON_CHAIN_ID_A,
          sponsor: ORCHESTRATOR,
          game: GAME_2048_HASH,
          cycleType: 0,
          startsAt: 1_700_000_000n,
          endsAt: 1_700_086_400n,
          prizePool: 10_000_000n,
          participationBonus: 50n,
        },
        40851550n,
        TX_HASH,
        7,
      ),
    ],
  });

  const result = await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(result.eventsFound, 1);
  assert.equal(result.backfilled, 1);
  assert.equal(result.inserted, 0);
  assert.deepEqual(result.errors, []);

  const updates = supabase.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(updates.length, 1);
  const payload = updates[0]!.payload as Record<string, unknown>;
  assert.equal(payload.creator_address, ORCHESTRATOR.toLowerCase());
  assert.equal(payload.creation_tx_hash, TX_HASH.toLowerCase());
  assert.equal(payload.creation_block_number, "40851550");
  // Idempotency: must filter on creation_tx_hash IS NULL.
  assert.equal(updates[0]!.filters["is:creation_tx_hash"], null);
});

test("SDK-new event (no existing row): INSERT with created_via='sdk'", async () => {
  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
    tournamentsByOnChainId: new Map(), // no matches → SDK path
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [
      buildLog(
        {
          id: ON_CHAIN_ID_B,
          sponsor: SDK_CREATOR,
          game: GAME_WORDLE_HASH,
          cycleType: 1, // weekly
          startsAt: 1_700_000_000n,
          endsAt: 1_700_604_800n,
          prizePool: 25_500_000n, // 25.5 USDC
          participationBonus: 200n,
        },
        40851560n,
        TX_HASH_2,
        3,
      ),
    ],
  });

  const result = await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(result.eventsFound, 1);
  assert.equal(result.backfilled, 0);
  assert.equal(result.inserted, 1);

  const inserts = supabase.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "insert",
  );
  assert.equal(inserts.length, 1);
  const payload = inserts[0]!.payload as Record<string, unknown>;
  assert.equal(payload.on_chain_id, ON_CHAIN_ID_B.toLowerCase());
  assert.equal(payload.game, "wordle");
  assert.equal(payload.cycle_type, "weekly");
  assert.equal(payload.created_via, "sdk");
  assert.equal(payload.creator_address, SDK_CREATOR.toLowerCase());
  assert.equal(payload.sponsor_address, SDK_CREATOR.toLowerCase());
  assert.equal(payload.prize_pool_usdc, "25.500000");
  assert.equal(payload.participation_bonus, 200);
  assert.equal(payload.creation_tx_hash, TX_HASH_2.toLowerCase());
});

test("unknown game slug: skipped + recorded in errors[]", async () => {
  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [
      buildLog(
        {
          id: ON_CHAIN_ID_A,
          sponsor: SDK_CREATOR,
          game: UNKNOWN_GAME_HASH,
          cycleType: 0,
          startsAt: 1_700_000_000n,
          endsAt: 1_700_086_400n,
          prizePool: 10_000_000n,
          participationBonus: 50n,
        },
        40851550n,
        TX_HASH,
        0,
      ),
    ],
  });

  const result = await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(result.eventsFound, 1);
  assert.equal(result.backfilled, 0);
  assert.equal(result.inserted, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]!.message, /unknown game hash/);

  // No tournament writes — only watermark advance.
  const tournamentWrites = supabase.writes.filter(
    (w) => w.table === "v2_tournaments",
  );
  assert.equal(tournamentWrites.length, 0);
});

test("reorg buffer respected: toBlock ≤ currentBlock - REORG_BUFFER_BLOCKS (30)", async () => {
  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [],
  });

  await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(publicClient.calls.length, 1);
  // safeLatest = 40851600 - 30 = 40851570
  assert.equal(publicClient.calls[0]!.toBlock, 40851570n);
});

test("block-span cap honored: toBlock ≤ fromBlock + MAX_BLOCK_SPAN - 1 (5000)", async () => {
  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40000000" },
  });
  const publicClient = makePublicClient({
    blockNumber: 40_851_600n, // 851_600 blocks ahead — far past MAX_BLOCK_SPAN
    logs: [],
  });

  await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(publicClient.calls.length, 1);
  // fromBlock = 40_000_001, MAX_BLOCK_SPAN = 5000 → toBlock = 40_005_000
  assert.equal(publicClient.calls[0]!.fromBlock, 40_000_001n);
  assert.equal(publicClient.calls[0]!.toBlock, 40_005_000n);
});

test("idempotent re-run: existing row with creation_tx_hash already set → skip silently", async () => {
  const tournaments = new Map<string, { id: string; creation_tx_hash: string | null }>();
  tournaments.set(ON_CHAIN_ID_A, {
    id: "11111111-2222-3333-4444-555555555555",
    creation_tx_hash: TX_HASH.toLowerCase(), // already backfilled
  });

  const supabase = makeSupabaseMock({
    watermark: { last_indexed_block: "40851500" },
    tournamentsByOnChainId: tournaments,
  });
  const publicClient = makePublicClient({
    blockNumber: 40851600n,
    logs: [
      buildLog(
        {
          id: ON_CHAIN_ID_A,
          sponsor: ORCHESTRATOR,
          game: GAME_2048_HASH,
          cycleType: 0,
          startsAt: 1_700_000_000n,
          endsAt: 1_700_086_400n,
          prizePool: 10_000_000n,
          participationBonus: 50n,
        },
        40851550n,
        TX_HASH,
        0,
      ),
    ],
  });

  const result = await runIndexTournamentsCreated(makeDeps(supabase, publicClient));

  assert.equal(result.eventsFound, 1);
  // No backfill, no insert — already-indexed row.
  assert.equal(result.backfilled, 0);
  assert.equal(result.inserted, 0);
  assert.deepEqual(result.errors, []);

  const tournamentWrites = supabase.writes.filter(
    (w) => w.table === "v2_tournaments",
  );
  assert.equal(tournamentWrites.length, 0);
});

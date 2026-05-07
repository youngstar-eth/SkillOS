// Run with: npx tsx --test packages/duel-backend/test/reconcile-duels.test.ts
//
// Tests for runReconcileDuels (the daily cron sweep). Convention matches
// reconcile.test.ts + cron-settle.test.ts: node:test + node:assert/strict +
// hand-rolled mock deps via the deps injection seam.
//
// Mock surface: minimal — only the methods runReconcileDuels actually calls
//   supabase.from(table).select|in|eq|is|lt|limit
//   supabase.from(table).update(payload).eq(id)
//   publicClient.readContract({...})  // getChallenge → status + winner
//   publicClient.waitForTransactionReceipt({...})  // drive-settle path
//   walletClient.writeContract({...})              // drive-settle path
//
// Each test pre-seeds the candidate-row buckets (lies, actives) and asserts
// the resulting ReconcileDuelsResult shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address, type Hex } from "viem";
import {
  runReconcileDuels,
  type ReconcileDuelsDependencies,
} from "../src/cron/reconcile-duels";
import { CHALLENGE_STATUS } from "../src/settle-guard";

const P1 = getAddress("0x000000000000000000000000000000000000cafe") as Address;
const P2 = getAddress("0x000000000000000000000000000000000000beef") as Address;
const ZERO = getAddress("0x0000000000000000000000000000000000000000") as Address;

const ONCHAIN_ID = ("0x" + "ab".repeat(32)) as Hex;
const TX_HASH = ("0x" + "cd".repeat(32)) as Hex;

interface DuelRow {
  id: string;
  onchain_id: string;
  status: string;
  player1_address: string;
  player1_score: number | null;
  player1_submitted_at: string | null;
  player2_address: string | null;
  player2_score: number | null;
  player2_submitted_at: string | null;
  matched_at: string | null;
  winner_address: string | null;
  // (other columns omitted; runReconcileDuels touches only the above)
}

interface CapturedWrite {
  table: string;
  payload: Record<string, unknown>;
  filterId: string;
}

// ─── Supabase mock factory ─────────────────────────────────────────────────

function makeSupabase(opts: {
  lies?: DuelRow[];
  actives?: DuelRow[];
}) {
  const lies = opts.lies ?? [];
  const actives = opts.actives ?? [];
  const writes: CapturedWrite[] = [];

  function from(table: string) {
    let op: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};

    const chain = {
      select() {
        op = "select";
        return chain;
      },
      update(p: Record<string, unknown>) {
        op = "update";
        payload = p;
        return chain;
      },
      eq(col: string, val: unknown) {
        filters[`eq:${col}`] = val;
        return chain;
      },
      in(col: string, val: unknown[]) {
        filters[`in:${col}`] = val;
        return chain;
      },
      is(col: string, val: unknown) {
        filters[`is:${col}`] = val;
        return chain;
      },
      lt(col: string, val: unknown) {
        filters[`lt:${col}`] = val;
        return chain;
      },
      async limit(_n: number) {
        if (table !== "v2_duels" || op !== "select") return { data: [], error: null };
        // lie-state query: status='settled' AND winner_address IS NULL
        if (filters["eq:status"] === "settled" && filters["is:winner_address"] === null) {
          return { data: lies, error: null };
        }
        // stale-active query: status IN [...], matched_at < cutoff
        if (filters["in:status"] && filters["lt:matched_at"]) {
          return { data: actives, error: null };
        }
        return { data: [], error: null };
      },
      // direct-await for update path: `.update(...).eq(...)` returns a thenable
      then(resolve: (value: { data: null; error: null }) => void) {
        if (op === "update" && typeof filters["eq:id"] === "string") {
          writes.push({
            table,
            payload,
            filterId: filters["eq:id"] as string,
          });
        }
        resolve({ data: null, error: null });
      },
    };
    return chain;
  }

  return {
    client: { from } as unknown as NonNullable<ReconcileDuelsDependencies["supabase"]>,
    writes,
  };
}

// ─── Public client mock ────────────────────────────────────────────────────

function makePublicClient(opts: {
  onChainStatus: number;
  onChainWinner?: Address;
  // findTerminalTxHash uses getBlockNumber + getContractEvents — return 0/empty
  // so the helper falls through to null cleanly.
}) {
  return {
    async readContract() {
      return {
        status: opts.onChainStatus,
        winner: opts.onChainWinner ?? ZERO,
      };
    },
    async getBlockNumber() {
      return 0n;
    },
    async getContractEvents() {
      return [];
    },
    async waitForTransactionReceipt() {
      return { status: "success" };
    },
  } as unknown as NonNullable<ReconcileDuelsDependencies["publicClient"]>;
}

function makeWalletClient(): NonNullable<ReconcileDuelsDependencies["walletClient"]> {
  return {
    account: { address: getAddress("0x000000000000000000000000000000000000feed") },
    chain: { id: 84532 } as unknown,
    async writeContract() {
      return TX_HASH;
    },
  } as unknown as NonNullable<ReconcileDuelsDependencies["walletClient"]>;
}

function makeDuelRow(overrides: Partial<DuelRow> = {}): DuelRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    onchain_id: ONCHAIN_ID,
    status: "settled",
    player1_address: P1,
    player1_score: null,
    player1_submitted_at: null,
    player2_address: P2,
    player2_score: null,
    player2_submitted_at: null,
    matched_at: "2026-05-06T00:00:00.000Z",
    winner_address: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("runReconcileDuels: empty result set → all-zero result", async () => {
  const supabase = makeSupabase({});
  const publicClient = makePublicClient({ onChainStatus: CHALLENGE_STATUS.None });
  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: false,
  });
  assert.equal(result.scanned, 0);
  assert.deepEqual(result.acted, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.dryRun, false);
});

test("runReconcileDuels: lie-state row with on-chain Settled → backfill-settled action", async () => {
  const lieRow = makeDuelRow({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    status: "settled",
    winner_address: null,
    player1_score: 100,
    player2_score: 50,
  });
  const supabase = makeSupabase({ lies: [lieRow] });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P1,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: false,
  });

  assert.equal(result.scanned, 1);
  assert.equal(result.acted.length, 1);
  assert.equal(result.acted[0].matchId, lieRow.id);
  assert.equal(result.acted[0].action, "backfill-settled");
  assert.equal(supabase.writes.length, 1);
  assert.equal(supabase.writes[0].table, "v2_duels");
  assert.equal(supabase.writes[0].payload.status, "settled");
  assert.equal(supabase.writes[0].payload.winner_address, P1);
});

test("runReconcileDuels: dry-run mode logs intent but writes nothing", async () => {
  const lieRow = makeDuelRow({
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    status: "settled",
    winner_address: null,
    player1_score: 100,
    player2_score: 50,
  });
  const supabase = makeSupabase({ lies: [lieRow] });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P1,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.scanned, 1);
  assert.equal(result.acted.length, 1, "intended action should be recorded");
  assert.equal(result.acted[0].action, "backfill-settled");
  assert.equal(result.acted[0].txHash, null, "dry-run never produces a tx hash");
  assert.equal(supabase.writes.length, 0, "dry-run must not write to DB");
});

test("runReconcileDuels: noop-already-reconciled row is reported but not written", async () => {
  const cleanRow = makeDuelRow({
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    status: "settled",
    winner_address: P2, // matches on-chain winner
    player1_score: 50,
    player2_score: 100,
  });
  const supabase = makeSupabase({ lies: [cleanRow] });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P2,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: false,
  });

  // Note: cleanRow (winner_address set) wouldn't actually match the lie-state
  // selector in production. We seed it into `lies` here purely to exercise
  // the noop path inside runReconcileDuels (the decision is reached after
  // the on-chain read; the upstream selector is mocked).
  assert.equal(result.scanned, 1);
  assert.equal(result.noops.length, 1);
  assert.equal(result.noops[0].matchId, cleanRow.id);
  assert.equal(supabase.writes.length, 0);
});

test("runReconcileDuels: needs-manual when on-chain Open + DB lie-state", async () => {
  const lieRow = makeDuelRow({
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    status: "settled",
    winner_address: null,
    player1_score: 100,
    player2_score: 50,
  });
  const supabase = makeSupabase({ lies: [lieRow] });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Open,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: false,
  });

  assert.equal(result.needsManual.length, 1);
  assert.equal(result.needsManual[0].matchId, lieRow.id);
  assert.match(result.needsManual[0].reason, /Open/);
  assert.equal(supabase.writes.length, 0);
});

test("runReconcileDuels: row with missing onchain_id is skipped via errors[], sweep continues", async () => {
  const noChainRow = makeDuelRow({
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    onchain_id: "", // empty → skip
    status: "settled",
    winner_address: null,
  });
  const validRow = makeDuelRow({
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    status: "settled",
    winner_address: null,
    player1_score: 100,
    player2_score: 50,
  });
  const supabase = makeSupabase({ lies: [noChainRow, validRow] });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P1,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: false,
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].matchId, noChainRow.id);
  assert.match(result.errors[0].message, /onchain_id/);
  // Valid row should still have been processed (sweep continues past the
  // bad row instead of aborting on first error).
  assert.equal(result.acted.length, 1);
  assert.equal(result.acted[0].matchId, validRow.id);
});

test("runReconcileDuels: limit cap enforced when both buckets together exceed", async () => {
  const mkLie = (n: number) =>
    makeDuelRow({
      id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
      status: "settled",
      winner_address: null,
      player1_score: 10,
      player2_score: 10,
      player1_submitted_at: "2026-05-07T00:00:01.000Z",
      player2_submitted_at: "2026-05-07T00:00:02.000Z",
    });
  const lies = Array.from({ length: 5 }, (_, i) => mkLie(i));
  const supabase = makeSupabase({ lies });
  const publicClient = makePublicClient({
    onChainStatus: CHALLENGE_STATUS.Settled,
    onChainWinner: P1,
  });

  const result = await runReconcileDuels({
    supabase: supabase.client,
    publicClient,
    walletClient: makeWalletClient(),
    dryRun: true,
    limit: 3,
  });

  // After dedupe + cap: only 3 of the 5 should be scanned (limit honored).
  assert.equal(result.scanned, 3);
});

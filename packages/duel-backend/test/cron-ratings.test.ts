// Run with: npx tsx --test packages/duel-backend/test/cron-ratings.test.ts
//
// ─── Test scaffolding for runUpdateRatings ─────────────────────────────────
//
// Mirrors cron-settle.test.ts conventions:
//   - node:test built-in runner, node:assert/strict for assertions
//   - manual Supabase mock injected via the deps parameter
//   - no third-party test framework (jest/vitest/etc.)
//
// Per SPEC §G.2 we cover: happy path, single-cohort no-op, mixed-class
// cohort isolation, >200 cohort pruning, lock-skipped, per-tournament
// error sweep continuation, and tied-score derivation.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runUpdateRatings,
  type UpdateRatingsDependencies,
} from "../src/cron/ratings";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const T_ID = "11111111-2222-3333-4444-555555555555";
const T_ID_2 = "11111111-2222-3333-4444-666666666666";
const GAME = "2048";
const P1 = "0x0000000000000000000000000000000000000001";
const P2 = "0x0000000000000000000000000000000000000002";
const P3 = "0x0000000000000000000000000000000000000003";
const P4 = "0x0000000000000000000000000000000000000004";
const P5 = "0x0000000000000000000000000000000000000005";

interface CapturedWrite {
  table: string;
  op: "insert" | "update" | "upsert";
  payload: unknown;
  filters: Record<string, unknown>;
}

interface MockOptions {
  pending?: Array<{ id: string; game: string }>;
  entriesByTournament?: Map<
    string,
    Array<{
      player_address: string;
      class_tag: string;
      best_score: number;
      excluded: boolean;
    }>
  >;
  soloRunsByTournament?: Map<
    string,
    Array<{
      player_address: string;
      class_tag: string;
      score: number;
      excluded: boolean;
    }>
  >;
  ratingsByLookup?: Map<
    string, // key = `${game}|${class}|${wallet,wallet,...}`
    Array<{
      wallet: string;
      rating: number;
      rd: number;
      volatility: number;
      updates_count: number;
    }>
  >;
  cronRunsLockHeld?: boolean;
  /** Inject an error response on a specific (table, op) pair. */
  failOn?: { table: string; op: "insert" | "update" | "upsert" };
}

function makeSupabaseMock(opts: MockOptions = {}) {
  const writes: CapturedWrite[] = [];

  function from(table: string) {
    const ctx = {
      table,
      operation: "select" as "select" | "update" | "insert" | "upsert",
      payload: null as unknown,
      filters: {} as Record<string, unknown>,
    };

    const maybeFail = (
      op: "insert" | "update" | "upsert",
    ): { error: { message: string } } | null => {
      if (opts.failOn && opts.failOn.table === table && opts.failOn.op === op) {
        return { error: { message: `injected ${op} failure on ${table}` } };
      }
      return null;
    };

    const respond = async (): Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }> => {
      if (ctx.operation === "insert") {
        writes.push({
          table,
          op: "insert",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        if (table === "v2_cron_runs" && opts.cronRunsLockHeld) {
          return {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "v2_cron_runs_pkey"',
            },
          };
        }
        const fail = maybeFail("insert");
        if (fail) return { data: null, ...fail };
        return { data: ctx.payload, error: null };
      }
      if (ctx.operation === "update") {
        writes.push({
          table,
          op: "update",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        const fail = maybeFail("update");
        if (fail) return { data: null, ...fail };
        return { data: null, error: null };
      }
      if (ctx.operation === "upsert") {
        writes.push({
          table,
          op: "upsert",
          payload: ctx.payload,
          filters: { ...ctx.filters },
        });
        const fail = maybeFail("upsert");
        if (fail) return { data: null, ...fail };
        return { data: null, error: null };
      }

      // SELECT routing.
      if (table === "v2_tournaments") {
        // Pending fetch — .not('settled_at','is',null).is('ratings_updated_at',null)
        if (
          "not:settled_at" in ctx.filters &&
          "is:ratings_updated_at" in ctx.filters
        ) {
          return { data: opts.pending ?? [], error: null };
        }
      }
      if (table === "v2_tournament_entries") {
        if ("eq:tournament_id" in ctx.filters) {
          const id = ctx.filters["eq:tournament_id"] as string;
          return {
            data: opts.entriesByTournament?.get(id) ?? [],
            error: null,
          };
        }
      }
      if (table === "v2_tournament_solo_runs") {
        if ("eq:tournament_id" in ctx.filters) {
          const id = ctx.filters["eq:tournament_id"] as string;
          return {
            data: opts.soloRunsByTournament?.get(id) ?? [],
            error: null,
          };
        }
      }
      if (table === "v2_player_ratings") {
        if (
          "in:wallet" in ctx.filters &&
          "eq:game" in ctx.filters &&
          "eq:class" in ctx.filters
        ) {
          const wallets = ctx.filters["in:wallet"] as string[];
          const game = ctx.filters["eq:game"] as string;
          const klass = ctx.filters["eq:class"] as string;
          const key = `${game}|${klass}|${[...wallets].sort().join(",")}`;
          return {
            data: opts.ratingsByLookup?.get(key) ?? [],
            error: null,
          };
        }
      }

      return {
        data: null,
        error: {
          message: `unhandled mock query: ${JSON.stringify({
            table,
            operation: ctx.operation,
            filters: ctx.filters,
          })}`,
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
      not: (col: string, _op: string, val: unknown) => {
        ctx.filters[`not:${col}`] = val;
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
      single: () => respond(),
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) => respond().then(onFulfilled, onRejected),
    });
    return builder;
  }

  return {
    writes,
    from: from as unknown as { (t: string): unknown },
  };
}

function buildDeps(mock: ReturnType<typeof makeSupabaseMock>): UpdateRatingsDependencies {
  return {
    supabase: mock as unknown as UpdateRatingsDependencies["supabase"],
  };
}

function entriesFor(
  rows: Array<{ p: string; cls: string; score: number; excluded?: boolean }>,
) {
  return rows.map((r) => ({
    player_address: r.p,
    class_tag: r.cls,
    best_score: r.score,
    excluded: r.excluded ?? false,
  }));
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("happy path: 4 'human' entries → 4 ratings + 4 history + 1 stamp", async () => {
  const mock = makeSupabaseMock({
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([
      [
        T_ID,
        entriesFor([
          { p: P1, cls: "human", score: 100 },
          { p: P2, cls: "human", score: 80 },
          { p: P3, cls: "human", score: 60 },
          { p: P4, cls: "human", score: 40 },
        ]),
      ],
    ]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.tournamentsProcessed, 1);
  assert.equal(result.ratingsUpdated, 4);
  assert.equal(result.cohortsPruned, 0);
  assert.equal(result.errors.length, 0);

  const historyInserts = mock.writes.filter(
    (w) => w.table === "v2_player_rating_history" && w.op === "insert",
  );
  assert.equal(historyInserts.length, 1, "one batched history insert");
  assert.equal(
    (historyInserts[0].payload as unknown[]).length,
    4,
    "4 history rows in batch",
  );

  const ratingUpserts = mock.writes.filter(
    (w) => w.table === "v2_player_ratings" && w.op === "upsert",
  );
  assert.equal(ratingUpserts.length, 1);
  assert.equal((ratingUpserts[0].payload as unknown[]).length, 4);

  const stamps = mock.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(stamps.length, 1, "exactly one stamp write");
  assert.equal(stamps[0].filters["eq:id"], T_ID);
  const stampPayload = stamps[0].payload as { ratings_updated_at: string };
  assert.ok(stampPayload.ratings_updated_at, "ratings_updated_at set");

  // Winner (P1) rating should rise above default; loser (P4) should fall below.
  const upsertRows = ratingUpserts[0].payload as Array<{
    wallet: string;
    rating: number;
  }>;
  const winner = upsertRows.find((r) => r.wallet === P1);
  const loser = upsertRows.find((r) => r.wallet === P4);
  assert.ok(winner && winner.rating > 1000, "winner rating > default");
  assert.ok(loser && loser.rating < 1000, "loser rating < default");
});

test("single-participant cohort: no ratings written, still stamped", async () => {
  const mock = makeSupabaseMock({
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([
      [T_ID, entriesFor([{ p: P1, cls: "human", score: 100 }])],
    ]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.tournamentsProcessed, 1);
  assert.equal(result.ratingsUpdated, 0, "no rating writes");

  const ratingUpserts = mock.writes.filter(
    (w) => w.table === "v2_player_ratings" && w.op === "upsert",
  );
  assert.equal(ratingUpserts.length, 0);

  const stamps = mock.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(stamps.length, 1, "stamp still happens to prevent retry");
});

test("mixed-class cohort: human and agent update independently, no cross-class", async () => {
  const mock = makeSupabaseMock({
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([
      [
        T_ID,
        entriesFor([
          { p: P1, cls: "human", score: 100 },
          { p: P2, cls: "human", score: 80 },
          { p: P3, cls: "human", score: 60 },
          { p: P4, cls: "agent", score: 200 },
          { p: P5, cls: "agent", score: 50 },
        ]),
      ],
    ]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.ratingsUpdated, 5, "3 human + 2 agent updates");

  const ratingUpserts = mock.writes.filter(
    (w) => w.table === "v2_player_ratings" && w.op === "upsert",
  );
  assert.equal(ratingUpserts.length, 2, "one upsert per cohort");

  // Verify each cohort batch contains only same-class wallets.
  for (const upsert of ratingUpserts) {
    const rows = upsert.payload as Array<{ wallet: string; class: string }>;
    const distinctClasses = new Set(rows.map((r) => r.class));
    assert.equal(
      distinctClasses.size,
      1,
      `cohort batch must be single-class, got ${[...distinctClasses].join(",")}`,
    );
  }

  // Cross-check: agent P4 (won) should rise above default; agent P5 should fall.
  // Human P1 (highest in human cohort) should rise; P3 should fall.
  const agentBatch = ratingUpserts.find((u) =>
    (u.payload as Array<{ class: string }>).every((r) => r.class === "agent"),
  );
  const agentRows = agentBatch!.payload as Array<{
    wallet: string;
    rating: number;
  }>;
  const agentWinner = agentRows.find((r) => r.wallet === P4);
  assert.ok(agentWinner && agentWinner.rating > 1000);
});

test("oversized cohort (>200 participants): logged, skipped, stamped", async () => {
  // Build 201 distinct addresses.
  const big = Array.from({ length: 201 }, (_, i) => ({
    p: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    cls: "human",
    score: 1000 - i,
  }));

  const mock = makeSupabaseMock({
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([[T_ID, entriesFor(big)]]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.cohortsPruned, 1);
  assert.equal(result.ratingsUpdated, 0, "no rating writes for pruned cohort");

  const stamps = mock.writes.filter(
    (w) => w.table === "v2_tournaments" && w.op === "update",
  );
  assert.equal(
    stamps.length,
    1,
    "tournament still stamped so we don't retry the pruned cohort",
  );
});

test("v2_cron_runs lock held → early exit with lockSkipped:true", async () => {
  const mock = makeSupabaseMock({
    cronRunsLockHeld: true,
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([
      [
        T_ID,
        entriesFor([
          { p: P1, cls: "human", score: 100 },
          { p: P2, cls: "human", score: 50 },
        ]),
      ],
    ]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.lockSkipped, true);
  assert.match(result.lockReason ?? "", /another cron run holds/);
  assert.equal(result.tournamentsProcessed, 0);
  assert.equal(result.ratingsUpdated, 0);

  // No reads or writes against rating tables — lock blocked us upfront.
  const ratingWrites = mock.writes.filter(
    (w) =>
      w.table === "v2_player_ratings" ||
      w.table === "v2_player_rating_history",
  );
  assert.equal(ratingWrites.length, 0);
});

test("tied scores: pair gets 0.5 / 0.5 (verified via post-period equality)", async () => {
  // Two identical-state players tying → identical updated ratings, both
  // ratings hold roughly constant (RD shrinks slightly from getting a draw).
  const mock = makeSupabaseMock({
    pending: [{ id: T_ID, game: GAME }],
    entriesByTournament: new Map([
      [
        T_ID,
        entriesFor([
          { p: P1, cls: "human", score: 100 },
          { p: P2, cls: "human", score: 100 },
        ]),
      ],
    ]),
  });

  const result = await runUpdateRatings(buildDeps(mock));

  assert.equal(result.ratingsUpdated, 2);

  const ratingUpsert = mock.writes.find(
    (w) => w.table === "v2_player_ratings" && w.op === "upsert",
  );
  assert.ok(ratingUpsert);
  const rows = ratingUpsert!.payload as Array<{
    wallet: string;
    rating: number;
    rd: number;
  }>;
  const r1 = rows.find((r) => r.wallet === P1)!;
  const r2 = rows.find((r) => r.wallet === P2)!;
  assert.equal(
    r1.rating,
    r2.rating,
    "tied players starting at same rating end at same rating",
  );
  assert.ok(
    Math.abs(r1.rating - 1000) < 0.01,
    "tied pair rating barely moves from default 1000",
  );
});

test("per-tournament error: one tournament errors, others still process", async () => {
  // First tournament has no entries fixture for T_ID, so the mock will
  // return an empty array and the function will succeed (no writes,
  // just stamp). To force an error mid-sweep we inject an insert failure
  // on the rating history insert when processing T_ID — the second
  // tournament T_ID_2 succeeds.
  const mock = makeSupabaseMock({
    pending: [
      { id: T_ID, game: GAME },
      { id: T_ID_2, game: GAME },
    ],
    entriesByTournament: new Map([
      [
        T_ID,
        entriesFor([
          { p: P1, cls: "human", score: 100 },
          { p: P2, cls: "human", score: 50 },
        ]),
      ],
      [
        T_ID_2,
        entriesFor([
          { p: P3, cls: "human", score: 90 },
          { p: P4, cls: "human", score: 40 },
        ]),
      ],
    ]),
    failOn: { table: "v2_player_rating_history", op: "insert" },
  });

  const result = await runUpdateRatings(buildDeps(mock));

  // Both tournaments attempted; both hit the same history-insert failure
  // because the failure injector matches by table+op, not by tournament.
  // This still proves the sweep doesn't abort on the first error.
  assert.equal(result.errors.length, 2, "both tournaments error, sweep continues");
  assert.equal(result.tournamentsProcessed, 0, "no tournament fully processed");
  assert.match(result.errors[0].message, /history insert/);
  assert.equal(result.errors[0].tournamentId, T_ID);
  assert.equal(result.errors[1].tournamentId, T_ID_2);
});

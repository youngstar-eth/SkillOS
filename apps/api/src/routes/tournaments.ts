// Tournaments routes.
//
// Sprint X2 follow-up (2026-05-10): the LIST endpoint reads from the
// Supabase `v2_tournaments` table populated by duel-backend's
// `cron/index-tournaments-created` cron. This retires the chunked event
// scan that worked for X1 but fell apart on Base Sepolia public RPC's
// tightened limits (2000-block max range + aggressive parallel rate limit).
//
// Fix #4a-S4 (2026-06-04): GET and leaderboard are now DB-primary too.
//
//   • Leaderboard reads the `v2_tournament_scores` read-model (populated by
//     duel-backend's `cron/index-scores-submitted` from SoloScoreSubmitted
//     events). It then runs a BOUNDED tail-scan for freshness — only the gap
//     between the indexer watermark and tip, for the correct on-chain event
//     (SoloScoreSubmitted; the pool never emits ScoreSubmitted for solo runs).
//     This retires the deploy→tip full-range ScoreSubmitted scan that scanned
//     the wrong event AND timed out under the RPC's getLogs limit → opaque 500.
//     Tail failure degrades to DB-only (200, structured log); only an empty
//     read-model AND a failed tail returns 502.
//
//   • GET reads `v2_tournaments` (the same source LIST uses), so a tournament
//     present in the index never 500s on an RPC hiccup. A single readContract
//     remains as OPTIONAL, non-fatal freshness for the live participant count
//     (the one field the read-model does not track) and as the orphan fallback
//     for a tournament the indexer hasn't picked up yet.
//
// The opaque "[unhandled] 500" is replaced by structured error logs carrying
// tournamentId + scan window + cause on every on-chain fallback path.

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError } from '../middleware/errorEnvelope.js';
import {
  Bytes32HexSchema,
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
} from '../schemas/common.js';
import {
  LeaderboardResponseSchema,
  type LeaderboardEntry,
} from '../schemas/score.js';
import {
  TournamentListResponseSchema,
  TournamentSchema,
  type Tournament,
} from '../schemas/tournament.js';
import {
  TOURNAMENT_POOL_ABI,
  TOURNAMENT_POOL_V21_ADDRESS,
} from '../lib/contracts.js';
import { decodeGame } from '../lib/games.js';
import {
  decodeIndexCursor,
  encodeIndexCursor,
} from '../lib/pagination.js';
import { scanContractEvents } from '../lib/scan.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { FROM_BLOCK, getPublicClient } from '../lib/viem.js';

// On-chain SoloScoreSubmitted log shape (the freshness tail). The pool emits
// SoloScoreSubmitted (NOT ScoreSubmitted) for solo runs — verified on-chain;
// ScoreSubmitted has zero occurrences on the deployed pool. We only read the
// id/player/score subset the leaderboard surfaces.
type SoloScoreRow = {
  args: {
    id?: `0x${string}`;
    player?: `0x${string}`;
    score?: bigint;
    matchCountDelta?: bigint;
    nonce?: `0x${string}`;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

// On-chain getTournament struct (optional freshness read in GET).
type OnchainTournament = {
  sponsor: `0x${string}`;
  game: `0x${string}`;
  cycleType: number | bigint;
  startsAt: bigint;
  endsAt: bigint;
  prizePool: bigint;
  participationBonus: bigint;
  settled: boolean;
  participants: readonly `0x${string}`[];
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// DB → API field mapping. cycle_type comes back as 'daily' / 'weekly' text;
// map to the 0/1 enum the on-chain contract uses.
const CYCLE_TYPE_DB_TO_NUM: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
};

// ─── Pure helpers (unit-tested in test/tournaments.test.ts) ─────────────────

/** Canonical-ordered, output-ready score row, unified across DB + tail. */
export type NormalizedScore = {
  player: `0x${string}`;
  score: bigint; // for sorting at full uint256 precision
  scoreStr: string; // for output — no Number() coercion
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  timestamp: number; // unix seconds
};

/** v2_tournament_scores row shape (score selected as ::text for precision). */
export type ScoreDbRow = {
  player_address: string;
  score: string;
  block_number: number | string;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
};

/** v2_tournaments row shape used by GET + LIST. */
export type TournamentDbRow = {
  on_chain_id: string;
  game: string;
  cycle_type: string;
  starts_at: string;
  ends_at: string;
  prize_pool_usdc: number | string;
  participation_bonus: number | null;
  sponsor_address: string;
  settled_at: string | null;
  tournament_class: string | null;
};

export function dbRowToScore(r: ScoreDbRow): NormalizedScore {
  return {
    player: r.player_address as `0x${string}`,
    score: BigInt(r.score),
    scoreStr: String(r.score),
    blockNumber: BigInt(r.block_number),
    logIndex: r.log_index,
    txHash: r.tx_hash as `0x${string}`,
    timestamp: Math.floor(new Date(r.block_timestamp).getTime() / 1000),
  };
}

/** Event identity used to dedup the tail against the read-model. */
export function scoreKey(txHash: string, logIndex: number): string {
  return `${txHash.toLowerCase()}:${logIndex}`;
}

/** Score DESC, then earliest block ASC, then logIndex ASC (tie-breakers). */
export function compareScores(a: NormalizedScore, b: NormalizedScore): number {
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? 1 : -1;
  return a.logIndex - b.logIndex;
}

/**
 * Merge the read-model rows with the freshness tail, dedup by (tx_hash,
 * log_index), and sort canonically. DB rows arrive pre-sorted but the union
 * must be re-sorted to place tail events.
 */
export function mergeScores(
  dbScores: NormalizedScore[],
  tailScores: NormalizedScore[],
): NormalizedScore[] {
  const seen = new Set<string>();
  const out: NormalizedScore[] = [];
  for (const s of [...dbScores, ...tailScores]) {
    const k = scoreKey(s.txHash, s.logIndex);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  out.sort(compareScores);
  return out;
}

/** Slice one page, assign 1-based ranks, and report the next cursor offset. */
export function paginateLeaderboard(
  sorted: NormalizedScore[],
  start: number,
  limit: number,
): { items: LeaderboardEntry[]; nextStart: number | null } {
  const slice = sorted.slice(start, start + limit);
  const items: LeaderboardEntry[] = slice.map((row, i) => ({
    rank: start + i + 1,
    player: row.player,
    score: row.scoreStr,
    blockNumber: Number(row.blockNumber),
    transactionHash: row.txHash,
    timestamp: row.timestamp,
  }));
  const nextStart = start + limit < sorted.length ? start + limit : null;
  return { items, nextStart };
}

/**
 * Lower bound for the freshness tail-scan. The spec floor is
 * `creation_block_number ?? FROM_BLOCK`; we additionally floor at the indexer
 * watermark+1 because the read-model is authoritative for every block ≤
 * watermark (the indexer drains contiguously). That bounds the hot-path scan
 * to the genuine freshness gap (a couple of chunks) instead of the tournament's
 * whole lifetime — while never rewinding below a brand-new tournament's
 * creation block.
 */
export function computeTailFloor(
  creationBlock: bigint | null,
  watermark: bigint | null,
  fromBlock: bigint,
): bigint {
  const base = creationBlock ?? fromBlock;
  if (watermark != null && watermark + 1n > base) return watermark + 1n;
  return base;
}

/**
 * DB row → API tournament shape. Single source of truth shared by LIST and
 * GET so their field derivation can never drift. `participantsCount` is
 * injected: LIST passes 0 (not tracked in the index); GET passes the live
 * on-chain count when the optional freshness read succeeds, else 0.
 */
export function dbRowToTournament(
  r: TournamentDbRow,
  participantsCount: number,
): Tournament {
  return {
    id: r.on_chain_id as `0x${string}`,
    sponsor: r.sponsor_address as `0x${string}`,
    game: r.game,
    cycleType: CYCLE_TYPE_DB_TO_NUM[r.cycle_type] ?? 0,
    startsAt: Math.floor(new Date(r.starts_at).getTime() / 1000),
    endsAt: Math.floor(new Date(r.ends_at).getTime() / 1000),
    // DB stores prize pool as numeric(20,6) USDC; on-chain + API surface is
    // base units (uint256, 6 decimals). Multiply by 1e6, drop fractional.
    prizePool: BigInt(Math.round(Number(r.prize_pool_usdc) * 1_000_000)).toString(),
    participationBonus: String(r.participation_bonus ?? 0),
    settled: r.settled_at !== null,
    participantsCount,
    tournamentClass:
      (r.tournament_class as Tournament['tournamentClass'] | null) ??
      'mixed-declared',
  };
}

// Structured error log for the on-chain / DB fallback paths. Replaces the
// opaque "[unhandled] 500" with a single JSON line carrying the tournament,
// the scan window, and the cause — so a DB-primary degrade (or a 502) is
// debuggable from logs alone.
function logTournamentFallback(fields: {
  route: 'leaderboard' | 'get_tournament';
  event: string;
  tournamentId: string;
  floor?: string;
  tip?: string;
  message: string;
}): void {
  console.error(JSON.stringify({ level: 'error', ...fields }));
}

export const tournamentRoutes = new OpenAPIHono();

// ─── GET /v1/tournaments ──────────────────────────────────────────────────

const listRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments',
  summary: 'List tournaments',
  description:
    'Paginated list of tournaments, newest-first. Derived from TournamentCreated events; per-tournament settled/participantsCount fields read via multicall.',
  tags: ['tournaments'],
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: 'Tournament list page',
      content: {
        'application/json': { schema: TournamentListResponseSchema },
      },
    },
    422: {
      description: 'Invalid query parameters',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

tournamentRoutes.openapi(listRoute, async (c) => {
  const { cursor, limit } = c.req.valid('query');
  const start = decodeIndexCursor(cursor) ?? 0;

  // Off-by-one safe range: Supabase `range(from, to)` is inclusive, so we
  // request `limit` rows + 1 sentinel to detect "more pages exist".
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('v2_tournaments')
    .select(
      'on_chain_id, game, cycle_type, starts_at, ends_at, prize_pool_usdc, participation_bonus, sponsor_address, settled_at, tournament_class',
    )
    .order('starts_at', { ascending: false })
    .range(start, start + limit); // request limit+1 rows
  if (error) {
    throw new ApiError(502, 'INDEXER_QUERY_FAILED', `v2_tournaments read failed: ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  // Shared mapper (see dbRowToTournament). The index doesn't track a live
  // participant count, so LIST passes 0 — single-tournament GET fills it in
  // from the optional on-chain freshness read.
  const tournaments: Tournament[] = slice.map((r) =>
    dbRowToTournament(r as TournamentDbRow, 0),
  );

  const next = hasMore ? encodeIndexCursor(start + limit) : undefined;
  return c.json({ items: tournaments, pagination: next ? { next } : {} }, 200);
});

// ─── GET /v1/tournaments/:id ──────────────────────────────────────────────

const getRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments/{id}',
  summary: 'Get tournament by id',
  description:
    'Tournament state from the v2_tournaments read-model (DB-primary), with an optional non-fatal on-chain read for the live participant count.',
  tags: ['tournaments'],
  request: {
    params: z.object({ id: Bytes32HexSchema }),
  },
  responses: {
    200: {
      description: 'Tournament state',
      content: { 'application/json': { schema: TournamentSchema } },
    },
    404: {
      description: 'Tournament does not exist',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Invalid id',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    502: {
      description: 'Read-model and chain both unavailable',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

// All v2_tournaments columns GET / LIST surface.
const TOURNAMENT_COLUMNS =
  'on_chain_id, game, cycle_type, starts_at, ends_at, prize_pool_usdc, participation_bonus, sponsor_address, settled_at, tournament_class';

tournamentRoutes.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param');
  const idLower = id.toLowerCase();
  const supabase = getSupabaseClient();

  // ── DB-primary: v2_tournaments is the same read-model LIST serves from. It's
  // authoritative for existence + every returned field except the live
  // participant count, which only the chain tracks.
  const { data: row, error: dbError } = await supabase
    .from('v2_tournaments')
    .select(TOURNAMENT_COLUMNS)
    .eq('on_chain_id', idLower)
    .maybeSingle<TournamentDbRow>();
  if (dbError) {
    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      `v2_tournaments read failed: ${dbError.message}`,
    );
  }

  // ── Optional bounded freshness: a single readContract (NOT a scan) for the
  // live participant count the read-model does not track. Wrapped so an RPC
  // revert/timeout degrades gracefully instead of 500-ing the request.
  let onchain: OnchainTournament | null = null;
  try {
    onchain = (await getPublicClient().readContract({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      functionName: 'getTournament',
      args: [id as `0x${string}`],
    })) as OnchainTournament;
  } catch (err) {
    logTournamentFallback({
      route: 'get_tournament',
      event: 'freshness_read_failed',
      tournamentId: id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (row) {
    // DB-primary mapping (identical derivation to LIST). participantsCount from
    // the live read when available, else 0 (degraded, never fatal).
    const participantsCount = onchain ? onchain.participants.length : 0;
    return c.json(dbRowToTournament(row, participantsCount), 200);
  }

  // ── No index row: orphan (chain has it, indexer hasn't caught up) or
  // genuinely absent. Fall back to the chain.
  if (onchain === null) {
    // Not indexed AND chain unreachable → can't determine existence.
    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      `Tournament ${id} not indexed and chain unreachable`,
    );
  }
  // getTournament returns a zero-filled struct for unknown ids. sponsor === 0x0
  // AND endsAt === 0 → not found (both zero so we don't false-negative a
  // degenerate-but-valid tournament).
  if (onchain.sponsor === ZERO_ADDRESS && onchain.endsAt === 0n) {
    throw new ApiError(404, 'NOT_FOUND', `Tournament ${id} does not exist`);
  }
  // Orphan: serve canonical on-chain state; class defaults until the indexer
  // backfills the off-chain declaration (supplement v1.5 §3.16). Typed as
  // Tournament so the 'mixed-declared' literal narrows to the class union.
  const orphan: Tournament = {
    id: id as `0x${string}`,
    sponsor: onchain.sponsor,
    game: decodeGame(onchain.game),
    cycleType: Number(onchain.cycleType),
    startsAt: Number(onchain.startsAt),
    endsAt: Number(onchain.endsAt),
    prizePool: onchain.prizePool.toString(),
    participationBonus: onchain.participationBonus.toString(),
    settled: onchain.settled,
    participantsCount: onchain.participants.length,
    tournamentClass: 'mixed-declared',
  };
  return c.json(orphan, 200);
});

// ─── GET /v1/tournaments/:id/leaderboard ──────────────────────────────────

const leaderboardRoute = createRoute({
  method: 'get',
  path: '/v1/tournaments/{id}/leaderboard',
  summary: 'Score history for a tournament',
  description:
    'All SoloScoreSubmitted entries for the tournament, sorted by score descending (block number then log index ascending as tiebreakers). DB-primary from the v2_tournament_scores read-model, with a bounded on-chain freshness tail. Each row is one submission, not best-per-player.',
  tags: ['tournaments'],
  request: {
    params: z.object({ id: Bytes32HexSchema }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Leaderboard page',
      content: { 'application/json': { schema: LeaderboardResponseSchema } },
    },
    422: {
      description: 'Invalid params',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    502: {
      description: 'Read-model empty and on-chain tail-scan unavailable',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

// Read the scores indexer watermark (last fully-indexed block). Non-fatal —
// returns null on miss so the tail floor falls back to creation_block.
async function readScoresWatermark(
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<bigint | null> {
  const { data } = await supabase
    .from('v2_tournament_scores_indexer_state')
    .select('last_indexed_block')
    .eq('contract_address', TOURNAMENT_POOL_V21_ADDRESS.toLowerCase())
    .maybeSingle<{ last_indexed_block: number | string }>();
  return data?.last_indexed_block != null ? BigInt(data.last_indexed_block) : null;
}

tournamentRoutes.openapi(leaderboardRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');
  const idLower = id.toLowerCase();
  const supabase = getSupabaseClient();

  // ── DB-primary: the v2_tournament_scores read-model, server-side ordered.
  // score selected as ::text so numeric(78,0) keeps full uint256 precision
  // (Number() coercion would lose it for large scores).
  const { data: dbData, error: dbError } = await supabase
    .from('v2_tournament_scores')
    .select('player_address, score::text, block_number, log_index, tx_hash, block_timestamp')
    .eq('tournament_on_chain_id', idLower)
    .order('score', { ascending: false })
    .order('block_number', { ascending: true })
    .order('log_index', { ascending: true });
  if (dbError) {
    logTournamentFallback({
      route: 'leaderboard',
      event: 'db_read_failed',
      tournamentId: id,
      message: dbError.message,
    });
    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      `v2_tournament_scores read failed: ${dbError.message}`,
    );
  }
  const dbScores = ((dbData ?? []) as ScoreDbRow[]).map(dbRowToScore);

  // ── Bounded freshness tail-scan: catch SoloScoreSubmitted events newer than
  // the indexer watermark. The floor is creation_block_number ?? FROM_BLOCK,
  // tightened to watermark+1 (read-model authoritative ≤ watermark). The whole
  // block is wrapped: any RPC failure degrades to DB-only instead of 500-ing.
  let tailScores: NormalizedScore[] = [];
  let tailFailed = false;
  let floor = FROM_BLOCK;
  try {
    const client = getPublicClient();
    const [{ data: tRow }, watermark] = await Promise.all([
      supabase
        .from('v2_tournaments')
        .select('creation_block_number')
        .eq('on_chain_id', idLower)
        .maybeSingle<{ creation_block_number: number | string | null }>(),
      readScoresWatermark(supabase),
    ]);
    const creationBlock =
      tRow?.creation_block_number != null ? BigInt(tRow.creation_block_number) : null;
    floor = computeTailFloor(creationBlock, watermark, FROM_BLOCK);

    const tip = await client.getBlockNumber();
    const tail = await scanContractEvents<SoloScoreRow>({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      eventName: 'SoloScoreSubmitted',
      args: { id: id as `0x${string}` },
      fromBlock: floor,
      toBlock: tip,
    });

    // Resolve block timestamps once per unique block (bounded — tail only
    // covers the freshness gap).
    const blocks = [...new Set(tail.map((e) => e.blockNumber))];
    const blockTimes = new Map<bigint, number>();
    await Promise.all(
      blocks.map(async (bn) => {
        const b = await client.getBlock({ blockNumber: bn });
        blockTimes.set(bn, Number(b.timestamp));
      }),
    );
    tailScores = tail.map((ev) => ({
      player: ev.args.player!,
      score: ev.args.score ?? 0n,
      scoreStr: (ev.args.score ?? 0n).toString(),
      blockNumber: ev.blockNumber,
      logIndex: ev.logIndex,
      txHash: ev.transactionHash,
      timestamp: blockTimes.get(ev.blockNumber) ?? 0,
    }));
  } catch (err) {
    tailFailed = true;
    logTournamentFallback({
      route: 'leaderboard',
      event: 'tail_scan_failed',
      tournamentId: id,
      floor: floor.toString(),
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const merged = mergeScores(dbScores, tailScores);

  // Empty read-model AND a failed tail → we can't confirm the leaderboard.
  if (merged.length === 0 && tailFailed) {
    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      `Leaderboard for ${id} unavailable: read-model empty and tail-scan failed`,
    );
  }

  const start = decodeIndexCursor(cursor) ?? 0;
  const { items, nextStart } = paginateLeaderboard(merged, start, limit);
  const next = nextStart !== null ? encodeIndexCursor(nextStart) : undefined;

  return c.json(
    { tournamentId: id, items, pagination: next ? { next } : {} },
    200,
  );
});

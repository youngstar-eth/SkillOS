// Canonical Δ6 replay-engine contracts, shared across all six SkillOS games.
//
// `MoveRecord<M>` is the canonical off-chain inputLog envelope: a thin,
// game-AGNOSTIC wrapper around a game-native `move` payload, ordered by a
// 0-based `seq`. The settlement layer (and any fraud-proof challenger)
// drives every game through `registry[gameId].verify(seed, log)` without
// knowing the payload type `M` — each engine owns and validates its own `M`.
//
// (This file RESOLVES SkillOS-Delta6-Replay-Engine-SPEC §8 "inputLog format
// standardization across 6 games": a generic envelope + per-game payload,
// not a closed cross-game union — so adding a game never edits a
// settlement-shared type.)

/**
 * Canonical SkillOS game ids — the keys of the adjudicator registry and the
 * single source of truth for "which games exist". The existing zod enums in
 * `submit_score`, `apps/api/schemas/agents`, etc. mirror this tuple; they can
 * later import `GAME_IDS` to dedupe (out of scope for Δ6 Stage 1).
 */
export const GAME_IDS = [
  '2048',
  'wordle',
  'sudoku',
  'minesweeper',
  'clicker',
  'match3',
] as const;

export type GameId = (typeof GAME_IDS)[number];

/**
 * Canonical off-chain inputLog record (Δ6). One per move.
 *
 * - `seq`  0-based move index. A well-formed log covers exactly {0..n-1}
 *          with no gaps or duplicates (see {@link orderedMoves}).
 * - `move` game-native payload (a {@link "./games/game2048".Direction} for
 *          2048, a guessed word for wordle, a cell+value for sudoku, …).
 *          Opaque at the registry boundary; each engine narrows it.
 */
export interface MoveRecord<M = unknown> {
  seq: number;
  move: M;
}

/** Result of replaying an inputLog under an engine. Pure data — no I/O. */
export interface VerifyResult {
  /** Engine-authoritative score. `0` whenever `valid` is false. */
  score: number;
  /** True iff the inputLog was well-formed and replayed cleanly. */
  valid: boolean;
  /**
   * Machine-readable reason when `valid` is false (e.g. `inputLog_not_array`,
   * `seq_duplicate`, `invalid_direction`). Omitted when `valid` is true.
   */
  reason?: string;
}

/**
 * A deterministic, stateless adjudicator for one game.
 *
 * `verify` MUST be pure: the same `(seed, log)` yields the same
 * {@link VerifyResult} on every machine, every run — no wall-clock, no
 * `Math.random`, no nondeterministic iteration order, integer math where the
 * game allows. It MUST reject a malformed `log` with `{ valid: false }`
 * rather than throwing or silently scoring it.
 */
export interface GameEngine<M = unknown> {
  readonly gameId: GameId;
  verify(seed: string, log: MoveRecord<M>[]): VerifyResult;
}

/** Successful envelope parse: moves laid out in strict `seq` order. */
type OrderedOk<M> = { ok: true; moves: M[] };
/** Failed envelope parse: a machine-readable reason, no moves. */
type OrderedErr = { ok: false; reason: string };

/**
 * Validates the canonical envelope of an inputLog and returns its payloads in
 * strict `seq` order. Returns an error reason instead of throwing so engines
 * fold it straight into a `{ valid: false }` {@link VerifyResult}.
 *
 * This is the shared gate for Δ6 §4 "reject null/invalid log" — every engine
 * runs its raw input through here first, so the `moves=null` bypass that the
 * F0 gate has today cannot reach any engine's scoring path:
 *
 *  - `log` MUST be a non-null array (`null` / non-array → `inputLog_not_array`).
 *  - each entry MUST be an object with an integer `seq` in `[0, n)` and a
 *    `move` field.
 *  - the `seq` set MUST be exactly `{0,1,…,n-1}` — no gaps, duplicates, or
 *    out-of-range indices. (`n` distinct integers all in `[0,n)` ⇒ a
 *    bijection onto `{0..n-1}`, so an in-range + no-duplicate check is
 *    sufficient; no separate gap scan needed.)
 *
 * An empty log is valid and yields `moves: []` (a player who made no moves
 * scores 0). Payload *semantics* (e.g. "is this a legal direction") are the
 * individual engine's job, after this structural gate.
 */
export function orderedMoves<M>(log: MoveRecord<M>[]): OrderedOk<M> | OrderedErr {
  if (!Array.isArray(log)) return { ok: false, reason: 'inputLog_not_array' };
  const n = log.length;
  const seen = new Array<boolean>(n).fill(false);
  const moves = new Array<M>(n);
  for (const rec of log) {
    if (rec === null || typeof rec !== 'object') {
      return { ok: false, reason: 'record_not_object' };
    }
    if (!('move' in rec)) return { ok: false, reason: 'missing_move' };
    const { seq } = rec;
    if (!Number.isInteger(seq) || seq < 0 || seq >= n) {
      return { ok: false, reason: 'seq_out_of_range' };
    }
    if (seen[seq]) return { ok: false, reason: 'seq_duplicate' };
    seen[seq] = true;
    moves[seq] = rec.move;
  }
  return { ok: true, moves };
}

// Deterministic match-3 replay engine.
//
// Source-of-truth lift from `apps/match3/src/lib/match3/engine.ts` (+ types.ts).
// The pure rules — seed fold, board generation, match detection, swap legality,
// and the cascade resolve (score + gravity + RNG refill) — are byte-identical
// to the live game. A permanent CI fidelity test
// (`scripts/fidelity-match3-live-vs-engine.test.ts`) reconstructs the live
// session from the live exports and fails the build on any drift on either side.
//
// ─── RNG NOTE (read before "improving" anything) ───────────────────────────
// match3 does NOT use the shared `SeededRng` (32-bit LCG) in `../rng`. It has
// its OWN deterministic generator, lifted verbatim:
//   - seed fold:  FNV-1a → uint32 (`numberFromSeed`), identical constants to
//                 hashSeed but kept LOCAL so a change to the shared hash can
//                 never silently re-key match3 boards already anchored on-chain.
//   - step:       Knuth multiplicative hash `state = (state * 2654435761) >>> 0`.
//   - color pick: `((rng ^ (rng >>> 16)) >>> 0) % COLORS.length` — the XOR-fold
//                 is load-bearing (it un-does the parity trap of the bare mod;
//                 see the live engine comment). Do NOT simplify to `rng % 6`.
// The RNG is fully seed-derived — there is NO `Math.random` in the live rule
// path (the app's `randomSeed()` only chooses WHICH seed; the seed itself is
// the on-chain match row). match3 is therefore replayable. ✅
//
// ─── DRAW ORDER (the crux for byte-match) ──────────────────────────────────
// 1. Board gen: row-major (r outer, c inner). Each cell does `rng = step(rng)`
//    then `pickColor`, RETRYING (re-stepping) up to 20 times while the draw
//    would complete a horizontal (two equal to the left) or vertical (two
//    equal above) 3-streak. Initial state is `rng = numberFromSeed(seed) || 1`.
// 2. Cascade refill: column by column (c = 0..cols-1). Within a column the
//    surviving (non-cleared) colors keep their top-to-bottom order; the empty
//    TOP is refilled by `unshift`-ing freshly stepped colors until the column
//    is full. The single `rng` register is threaded across all columns of a
//    cascade step and across all cascade steps of a resolve, in that order.
// Consuming the seed/RNG in any other order desynchronizes the generated
// board from the live game.
//
// ─── SESSION BOUND (Δ6 Step 4 — explicit + documented) ─────────────────────
// The LIVE match3 game has **no natural terminal**: `movesLeft` was dropped, so
// the engine never sets `gameOver`. A session is **time-boxed** by the shared
// 2-minute duel/solo Timer; finalization is the timer-expire submit of the live
// score accumulator. There is no board-deadlock end state (refills keep the
// board playable, and an illegal swap is simply rejected without consuming a
// turn — match3 cannot "soft-lock" the way a full 2048 board can).
//
// For deterministic REPLAY the bound is therefore the **recorded input log
// itself**: the session ends after the player's last recorded swap. This is
// skill-pure (the wall-clock 2-minute window is identical for every entrant and
// injects no luck — the seed/board is shared) and replayable (the log
// terminates deterministically). We add a defensive `MAX_MOVES` cap ONLY to
// guarantee replay termination on a pathological/forged over-long log; a real
// 2-minute session cannot approach it. The cap is NOT a live game rule — it is
// engine-specific (the 2048 MAX_MOVES=100 lesson: do not mistake a defensive
// replay cap for a game mechanic). `sessionBoundIsDesignChoice` is set false:
// "the log is the session" is the direct, forced consequence of a timer-boxed
// game with no natural terminal, not a non-obvious judgment call.
//
// ─── SCORE ─────────────────────────────────────────────────────────────────
// `score` is the live accumulator: each cascade step adds
// `matchedCells * 10 * chainDepth` (chain 1 → 1×, chain 2 → 2×, …). The live
// submit path clamps the SUBMITTED value with `Math.min(Math.max(1, score),
// 49_999)`; that sandwich clamp is a submit-layer concern, not a game rule, so
// the engine returns the RAW accumulator as its authoritative score and exposes
// `clampSubmitScore` for callers that need the wire value.
//
// Determinism contract: same seed string + same swap sequence → same grid +
// same score on every machine. Integer math; no I/O, no wall-clock, no
// `Math.random`, no nondeterministic iteration order.

import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

export const ROWS = 8;
export const COLS = 8;
export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple', 'pink'] as const;
export type GemColor = (typeof COLORS)[number];

/**
 * Defensive replay cap (engine-only, NOT a live rule). A 2-minute match cannot
 * approach this; it exists purely so a pathological/forged log terminates.
 */
export const MAX_MOVES = 4096;

export type Coord = [number, number];

/**
 * Per-move payload for match3's `MoveRecord<MoveMatch3>` inputLog: a swap of two
 * grid cells. `a`/`b` are `[row, col]`. The smallest faithful action — a single
 * tap-tap swap the player performs. Must be adjacent (Manhattan distance 1) and
 * must create at least one 3+ line, or it is illegal (live: rejected, no turn
 * consumed; replay: a structurally-illegal payload in the log is rejected).
 */
export interface MoveMatch3 {
  a: Coord;
  b: Coord;
}

/** A grid cell. `color: null` is a transient cleared cell (mid-cascade only). */
export interface Cell {
  color: GemColor | null;
}

export interface Match3Session {
  seed: string;
  grid: Cell[][];
  rng: number;
  score: number;
  combo: number;
  maxCombo: number;
  totalMatches: number;
  movesUsed: number;
  moves: MoveMatch3[];
}

// ─── Seeded RNG (match3's OWN — verbatim from the live engine) ──────────────

/** FNV-1a fold of the seed string to a uint32 (matches `numberFromSeed`). */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

/** Single step of Knuth's multiplicative hash. State is a uint32. */
export function stepRng(rng: number): number {
  return Math.imul(rng, 2654435761) >>> 0;
}

/**
 * Map a uint32 rng value to a color index uniformly across COLORS.length.
 * The `rng ^ (rng >>> 16)` fold is load-bearing — see the live engine comment
 * (a bare `rng % 6` collapses to three colors under Knuth's odd multiplier).
 */
export function pickColorIndex(rng: number): number {
  return ((rng ^ (rng >>> 16)) >>> 0) % COLORS.length;
}

// ─── Board helpers ─────────────────────────────────────────────────────────

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.map((cell) => ({ color: cell.color })));
}

/** Serializable view of the grid as a 2-D array of color strings (null kept). */
export function serializeGrid(grid: Cell[][]): (GemColor | null)[][] {
  return grid.map((row) => row.map((cell) => cell.color));
}

export function gridsEqual(a: Cell[][], b: Cell[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) if (a[r][c].color !== b[r][c].color) return false;
  }
  return true;
}

/** True iff `a` and `b` are orthogonally adjacent (Manhattan distance 1). */
export function areAdjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

function inBounds(p: Coord): boolean {
  return Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
    p[0] >= 0 && p[0] < ROWS && p[1] >= 0 && p[1] < COLS;
}

// ─── Match detection (verbatim semantics from the live engine) ─────────────

/**
 * Return the set of `"row,col"` keys participating in a 3+ horizontal or
 * vertical streak. L/T/plus shapes contribute whichever arms meet 3.
 */
export function findMatches(grid: Cell[][]): Set<string> {
  const matches = new Set<string>();

  // Horizontal
  for (let r = 0; r < grid.length; r++) {
    let streak = 1;
    for (let c = 1; c < grid[r].length; c++) {
      if (grid[r][c].color && grid[r][c].color === grid[r][c - 1].color) {
        streak++;
      } else {
        if (streak >= 3) for (let k = c - streak; k < c; k++) matches.add(`${r},${k}`);
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = grid[r].length - streak; k < grid[r].length; k++) matches.add(`${r},${k}`);
    }
  }

  // Vertical
  for (let c = 0; c < grid[0].length; c++) {
    let streak = 1;
    for (let r = 1; r < grid.length; r++) {
      if (grid[r][c].color && grid[r][c].color === grid[r - 1][c].color) {
        streak++;
      } else {
        if (streak >= 3) for (let k = r - streak; k < r; k++) matches.add(`${k},${c}`);
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = grid.length - streak; k < grid.length; k++) matches.add(`${k},${c}`);
    }
  }

  return matches;
}

// ─── Initial state ─────────────────────────────────────────────────────────

/**
 * Build an 8×8 grid with no pre-existing 3-in-a-row matches, deterministically
 * from `seed`. Row-major; each cell re-draws (re-steps the rng) up to 20 times
 * while it would complete a left/above 3-streak. Identical seed → identical
 * board for every entrant. Mirrors `createInitialState` draw-for-draw.
 */
export function createSession(seed: string): Match3Session {
  const seedNum = numberFromSeed(seed);
  let rng = seedNum || 1;
  const grid: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      let color: GemColor;
      let attempts = 0;
      do {
        rng = stepRng(rng);
        color = COLORS[pickColorIndex(rng)];
        attempts++;
        if (attempts > 20) break;
      } while (
        (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) ||
        (r >= 2 && grid[r - 1][c].color === color && grid[r - 2][c].color === color)
      );
      row.push({ color });
    }
    grid.push(row);
  }
  return {
    seed,
    grid,
    rng,
    score: 0,
    combo: 0,
    maxCombo: 0,
    totalMatches: 0,
    movesUsed: 0,
    moves: [],
  };
}

// ─── Swap legality ─────────────────────────────────────────────────────────

/**
 * A swap is LEGAL iff: both cells are in bounds, the two are adjacent, and
 * performing the swap creates at least one match. Pure predicate — does not
 * mutate. (Distinct from a structurally-invalid payload, which the verifier
 * rejects before scoring.)
 */
export function isLegalSwap(grid: Cell[][], a: Coord, b: Coord): boolean {
  if (!inBounds(a) || !inBounds(b)) return false;
  if (!areAdjacent(a, b)) return false;
  const test = cloneGrid(grid);
  const tmp = test[a[0]][a[1]];
  test[a[0]][a[1]] = test[b[0]][b[1]];
  test[b[0]][b[1]] = tmp;
  return findMatches(test).size > 0;
}

// ─── Cascade resolve (score + gravity + RNG refill) ────────────────────────

/**
 * Run the cascade loop on a swapped grid to completion, in place on a session
 * copy's fields:
 *   1. find matched cells; clear (null) their colors;
 *   2. score `matchedCells * 10 * chainDepth`;
 *   3. gravity + refill, column by column (survivors keep order; empty tops are
 *      refilled by `unshift` from the threaded rng);
 *   4. repeat until no matches remain.
 * Mirrors the live `resolve` draw-for-draw. Returns the post-resolve grid, the
 * advanced rng, the score gained, the deepest chain, and matched-cell total.
 */
export function resolveCascade(
  grid: Cell[][],
  rngIn: number,
): { grid: Cell[][]; rng: number; gained: number; maxChain: number; matchedCells: number } {
  let work = cloneGrid(grid);
  let rng = rngIn;
  let chainLen = 0;
  let gained = 0;
  let matchedCells = 0;

  while (true) {
    const matches = findMatches(work);
    if (matches.size === 0) break;
    chainLen++;

    for (const key of matches) {
      const [r, c] = key.split(',').map(Number);
      work[r][c].color = null;
    }
    gained += matches.size * 10 * chainLen;
    matchedCells += matches.size;

    // Gravity + refill, column by column.
    for (let c = 0; c < COLS; c++) {
      const column: (GemColor | null)[] = [];
      for (let r = 0; r < ROWS; r++) if (work[r][c].color !== null) column.push(work[r][c].color);
      while (column.length < ROWS) {
        rng = stepRng(rng);
        column.unshift(COLORS[pickColorIndex(rng)]);
      }
      for (let r = 0; r < ROWS; r++) work[r][c] = { color: column[r] };
    }
  }

  return { grid: work, rng, gained, maxChain: chainLen, matchedCells };
}

/**
 * Apply one swap move to the session. Returns whether it was applied.
 *
 * - legal swap → grid swapped, cascade resolved, score/combo/totals updated,
 *   movesUsed incremented, move recorded.
 * - illegal swap (non-adjacent / out of bounds / forms no match) → session
 *   untouched, NOT applied, turn NOT consumed (matches live UX).
 *
 * Past the defensive cap the session is "over" and the move is ignored.
 */
export function applyMove(
  session: Match3Session,
  mv: MoveMatch3,
): { applied: boolean; scoreDelta: number; over: boolean } {
  if (session.movesUsed >= MAX_MOVES) return { applied: false, scoreDelta: 0, over: true };
  if (!isLegalSwap(session.grid, mv.a, mv.b)) {
    return { applied: false, scoreDelta: 0, over: false };
  }
  const swapped = cloneGrid(session.grid);
  const tmp = swapped[mv.a[0]][mv.a[1]];
  swapped[mv.a[0]][mv.a[1]] = swapped[mv.b[0]][mv.b[1]];
  swapped[mv.b[0]][mv.b[1]] = tmp;

  const { grid, rng, gained, maxChain, matchedCells } = resolveCascade(swapped, session.rng);
  session.grid = grid;
  session.rng = rng;
  session.score += gained;
  session.combo = maxChain;
  session.maxCombo = Math.max(session.maxCombo, maxChain);
  session.totalMatches += matchedCells;
  session.movesUsed += 1;
  session.moves.push({ a: [mv.a[0], mv.a[1]], b: [mv.b[0], mv.b[1]] });
  return { applied: true, scoreDelta: gained, over: session.movesUsed >= MAX_MOVES };
}

/** Live submit-layer sandwich clamp. NOT a game rule; exposed for wire callers. */
export function clampSubmitScore(score: number): number {
  return Math.min(Math.max(1, score), 49_999);
}

/**
 * Replay a swap sequence from scratch and return the resulting session. The
 * verifier never trusts a claimed score; it replays on the same seed and uses
 * the engine's accumulator. Illegal swaps in the array are skipped (turn not
 * consumed); replay stops at the defensive cap.
 *
 * NOTE: `replay` is lenient (skips illegal swaps) because it is a pure
 * re-derivation primitive shared with the fidelity test. The Δ6 `verify`
 * adapter is STRICTER — an illegal swap in a settlement inputLog is a malformed
 * log and is rejected outright (see `engineMatch3.verify`).
 */
export function replay(seed: string, moves: MoveMatch3[]): Match3Session {
  const session = createSession(seed);
  for (const mv of moves) {
    if (session.movesUsed >= MAX_MOVES) break;
    applyMove(session, mv);
  }
  return session;
}

// ─── Payload validation (the wire boundary) ────────────────────────────────

function isCoord(v: unknown): v is Coord {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    Number.isInteger(v[0]) &&
    Number.isInteger(v[1])
  );
}

/** Structural shape check for a move payload arriving as `unknown` off the wire. */
export function isMoveShape(m: unknown): m is MoveMatch3 {
  if (m === null || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return isCoord(o.a) && isCoord(o.b);
}

// ─── Δ6 adjudicator adapter ────────────────────────────────────────────────

/**
 * The match3 entry in the Δ6 adjudicator registry. Reached by game-agnostic
 * callers (settlement, fraud-proof challengers, match-replay) only through
 * `registry['match3'].verify(seed, log)`.
 *
 * Contract:
 *  1. structurally validate the `MoveRecord` envelope (rejects null / non-array
 *     / bad-seq logs via {@link orderedMoves});
 *  2. reject any payload that is not a well-formed `{ a:[r,c], b:[r,c] }`
 *     (`malformed_move`), then reject any swap that is not legal on the board
 *     at that point in the replay (`illegal_swap`) — a settlement inputLog must
 *     contain only the swaps the player actually made, so an illegal swap is a
 *     forged/corrupt log, not a no-op;
 *  3. replay deterministically and return the authoritative raw accumulator.
 *     A malformed log yields `{ score: 0, valid: false, reason }`, never a throw
 *     and never a silent pass.
 */
export const engineMatch3: GameEngine<MoveMatch3> = {
  gameId: 'match3',
  verify(seed: string, log: MoveRecord<MoveMatch3>[]): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    for (const m of parsed.moves) {
      if (!isMoveShape(m)) return { score: 0, valid: false, reason: 'malformed_move' };
    }
    const session = createSession(seed);
    for (const mv of parsed.moves) {
      if (session.movesUsed >= MAX_MOVES) {
        return { score: 0, valid: false, reason: 'move_cap_exceeded' };
      }
      if (!isLegalSwap(session.grid, mv.a, mv.b)) {
        return { score: 0, valid: false, reason: 'illegal_swap' };
      }
      applyMove(session, mv);
    }
    return { score: session.score, valid: true };
  },
};

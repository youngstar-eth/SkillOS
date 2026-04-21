// ───────────────────────────────────────────────────────────────────────────
// Match-3 engine — adapted from the legacy main-branch implementation.
//
// Key differences from legacy:
//   1. Seed is a bytes32 hex string (match row). FNV-1a folded to uint32
//      via `numberFromSeed`, matching the other game engines.
//   2. No `movesLeft` limit — duel is timer-boxed, so the engine never
//      transitions to `gameOver` on its own. The duel/[id] timer expire
//      path submits liveScore; that's the only finalization.
//   3. `calculateScore` dropped. The `state.score` accumulator already
//      includes the cascade multiplier (`matches × 10 × chainLen`), so
//      the duel page submits it directly with the standard sandwich
//      clamp `Math.min(Math.max(1, score), 49_999)`.
//   4. Grid creation guards against pre-existing matches (3-in-a-row
//      left or above) so the starting board is always stable — matches
//      the legacy code.
// ───────────────────────────────────────────────────────────────────────────

import {
  COLORS,
  COLS,
  ROWS,
  type Cell,
  type GemColor,
  type Match3State,
} from "./types";

export { COLORS, COLS, ROWS };

// ─── Seed conversion ──────────────────────────────────────────────────────

/**
 * FNV-1a fold of the bytes32 seed to a uint32. Matches the pattern in the
 * other game engines.
 */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────

/** Single step of Knuth's multiplicative hash. State is a uint32. */
function stepRng(rng: number): number {
  return Math.imul(rng, 2654435761) >>> 0;
}

/**
 * Map a uint32 rng value to a color index uniformly across COLORS.length.
 *
 * Bug fixed here: `rng % COLORS.length` with COLORS.length = 6 loses
 * entropy. Knuth's multiplicative hash (odd multiplier) preserves
 * parity — if the seed is odd, `rng = prev × M` stays odd forever, so
 * `rng % 6` only ever emits 1, 3, 5. The board ends up with three
 * colours (yellow / blue / pink) and half the palette is silently
 * unused.
 *
 * Fix: fold the high half into the low half via XOR before the mod.
 * `rng ^ (rng >>> 16)` scrambles parity so the mod produces all six
 * indices roughly uniformly. Verified in the dev-test: seed
 * `0x + "a" × 64` now shows all six colours instead of three.
 */
function pickColorIndex(rng: number): number {
  return ((rng ^ (rng >>> 16)) >>> 0) % COLORS.length;
}

// ─── Initial state ────────────────────────────────────────────────────────

/**
 * Build an 8×8 grid with no pre-existing 3-in-a-row matches. Each cell is
 * assigned a color from the seeded RNG, retried up to 20 times if the
 * draw would complete a horizontal or vertical three-streak. Identical
 * seed → identical board for every duelist.
 */
export function createInitialState(seed: string): Match3State {
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
        (c >= 2 &&
          row[c - 1].color === color &&
          row[c - 2].color === color) ||
        (r >= 2 &&
          grid[r - 1][c].color === color &&
          grid[r - 2][c].color === color)
      );
      row.push({ color, id: `${r}-${c}-0` });
    }
    grid.push(row);
  }
  return {
    grid,
    rows: ROWS,
    cols: COLS,
    score: 0,
    combo: 0,
    maxCombo: 0,
    totalMatches: 0,
    selected: null,
    status: "playing",
    seed: seedNum,
    rng,
  };
}

// ─── Adjacency ────────────────────────────────────────────────────────────

export function areAdjacent(
  a: [number, number],
  b: [number, number],
): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

// ─── Match detection ──────────────────────────────────────────────────────

/**
 * Return the set of `"row,col"` keys that participate in a 3+ horizontal
 * or vertical streak. L/T/plus shapes contribute whichever of their arms
 * meet the 3-threshold — standard match-3 behaviour.
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
        if (streak >= 3) {
          for (let k = c - streak; k < c; k++) matches.add(`${r},${k}`);
        }
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = grid[r].length - streak; k < grid[r].length; k++) {
        matches.add(`${r},${k}`);
      }
    }
  }

  // Vertical
  for (let c = 0; c < grid[0].length; c++) {
    let streak = 1;
    for (let r = 1; r < grid.length; r++) {
      if (grid[r][c].color && grid[r][c].color === grid[r - 1][c].color) {
        streak++;
      } else {
        if (streak >= 3) {
          for (let k = r - streak; k < r; k++) matches.add(`${k},${c}`);
        }
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = grid.length - streak; k < grid.length; k++) {
        matches.add(`${k},${c}`);
      }
    }
  }

  return matches;
}

// ─── Selection helpers ────────────────────────────────────────────────────

export function selectCell(
  state: Match3State,
  row: number,
  col: number,
): Match3State {
  if (state.status !== "playing") return state;
  return { ...state, selected: [row, col] };
}

export function clearSelection(state: Match3State): Match3State {
  return { ...state, selected: null };
}

// ─── Swap ─────────────────────────────────────────────────────────────────

/**
 * Swap two adjacent cells. Returns:
 *   - the next state (status = "resolving") if the swap creates at least
 *     one match, so the caller should run `resolve` next;
 *   - `null` if the swap is invalid (non-adjacent or no match formed).
 *
 * Classic rule — illegal swaps never take effect; the caller should
 * deselect or flash an error. Modern casual variants would allow the
 * swap and just score nothing; we choose the skill-first version.
 */
export function swap(
  state: Match3State,
  a: [number, number],
  b: [number, number],
): Match3State | null {
  if (state.status !== "playing") return null;
  if (!areAdjacent(a, b)) return null;

  const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
  const temp = newGrid[a[0]][a[1]];
  newGrid[a[0]][a[1]] = newGrid[b[0]][b[1]];
  newGrid[b[0]][b[1]] = temp;

  if (findMatches(newGrid).size === 0) return null;

  return {
    ...state,
    grid: newGrid,
    selected: null,
    status: "resolving",
  };
}

// ─── Resolve (cascade loop) ───────────────────────────────────────────────

/**
 * Run the cascade loop to completion:
 *   1. Find every matched cell; zero their colors.
 *   2. Score: matchedCells × 10 × chainDepth (chain 1 → 1×, chain 2 → 2×, …)
 *   3. Apply gravity — surviving cells in each column fall to the bottom,
 *      the empty tops are refilled from `rng` in sequence.
 *   4. Repeat until no matches remain.
 *
 * Cell ids are regenerated on every cascade step so React can key-reset
 * the relevant <Gem> nodes; the `idTick` counter guarantees uniqueness
 * within a resolve invocation.
 */
export function resolve(state: Match3State): Match3State {
  if (state.status !== "resolving") return state;
  let current = state;
  let chainLen = 0;
  let idTick = 0;

  while (true) {
    const matches = findMatches(current.grid);
    if (matches.size === 0) break;
    chainLen++;
    idTick++;

    const grid = current.grid.map((row) => row.map((c) => ({ ...c })));
    for (const key of matches) {
      const [r, c] = key.split(",").map(Number);
      grid[r][c].color = null;
    }

    const scoreDelta = matches.size * 10 * chainLen;

    // Gravity + refill, column by column.
    let rng = current.rng;
    for (let c = 0; c < current.cols; c++) {
      const column: (GemColor | null)[] = [];
      for (let r = 0; r < current.rows; r++) {
        if (grid[r][c].color !== null) column.push(grid[r][c].color);
      }
      while (column.length < current.rows) {
        rng = stepRng(rng);
        column.unshift(COLORS[pickColorIndex(rng)]);
      }
      for (let r = 0; r < current.rows; r++) {
        grid[r][c] = {
          color: column[r],
          id: `${r}-${c}-${current.seed}-${idTick}`,
        };
      }
    }

    current = {
      ...current,
      grid,
      rng,
      score: current.score + scoreDelta,
      combo: chainLen,
      maxCombo: Math.max(current.maxCombo, chainLen),
      totalMatches: current.totalMatches + matches.size,
    };
  }

  return { ...current, status: "playing", combo: 0 };
}

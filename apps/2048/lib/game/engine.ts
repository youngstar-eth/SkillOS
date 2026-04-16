import {
  GRID_SIZE,
  WINNING_TILE,
  type Cell,
  type Direction,
  type Grid,
  type MoveResult,
  type Row,
} from "./types";

// ---------------------------------------------------------------------------
// Grid construction + cloning
// ---------------------------------------------------------------------------

export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array<Cell>(GRID_SIZE).fill(null),
  );
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tile spawning
// ---------------------------------------------------------------------------

function emptyCells(grid: Grid): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === null) out.push([r, c]);
    }
  }
  return out;
}

/** Place a 2 (90%) or 4 (10%) in a random empty cell. Returns a new grid. */
export function spawnTile(grid: Grid, rng: () => number = Math.random): Grid {
  const empties = emptyCells(grid);
  if (empties.length === 0) return grid;
  const [r, c] = empties[Math.floor(rng() * empties.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const next = cloneGrid(grid);
  next[r][c] = value;
  return next;
}

// ---------------------------------------------------------------------------
// Left-move primitive — compress, merge, compress
// ---------------------------------------------------------------------------

/** Move non-null tiles to the left of a row without merging. */
function compress(row: Row): Row {
  const filtered = row.filter((c): c is number => c !== null);
  while (filtered.length < GRID_SIZE) filtered.push(null as unknown as number);
  return filtered as Row;
}

/**
 * Merge adjacent equal tiles left-to-right, each tile consumable only once
 * per move. Returns the merged row and the sum of new values.
 */
function mergeRow(row: Row): { row: Row; gained: number } {
  const out = row.slice();
  let gained = 0;
  for (let i = 0; i < GRID_SIZE - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a !== null && a === b) {
      const merged = a * 2;
      out[i] = merged;
      out[i + 1] = null;
      gained += merged;
      // Skip the next index — tile already consumed.
      i++;
    }
  }
  return { row: out, gained };
}

function moveLeft(grid: Grid): MoveResult {
  const next = createEmptyGrid();
  let score = 0;
  let moved = false;
  for (let r = 0; r < GRID_SIZE; r++) {
    const compressed = compress(grid[r]);
    const { row: merged, gained } = mergeRow(compressed);
    const final = compress(merged);
    next[r] = final;
    score += gained;
    if (!rowsEqual(grid[r], final)) moved = true;
  }
  return { grid: next, score, moved };
}

function rowsEqual(a: Row, b: Row): boolean {
  for (let i = 0; i < GRID_SIZE; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rotations — all four directions map to moveLeft
// ---------------------------------------------------------------------------

function reverseRows(grid: Grid): Grid {
  return grid.map((row) => row.slice().reverse());
}

function transpose(grid: Grid): Grid {
  const out = createEmptyGrid();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      out[c][r] = grid[r][c];
    }
  }
  return out;
}

export function move(grid: Grid, direction: Direction): MoveResult {
  switch (direction) {
    case "left":
      return moveLeft(grid);
    case "right": {
      const { grid: g, score, moved } = moveLeft(reverseRows(grid));
      return { grid: reverseRows(g), score, moved };
    }
    case "up": {
      const { grid: g, score, moved } = moveLeft(transpose(grid));
      return { grid: transpose(g), score, moved };
    }
    case "down": {
      const { grid: g, score, moved } = moveLeft(reverseRows(transpose(grid)));
      return { grid: transpose(reverseRows(g)), score, moved };
    }
  }
}

// ---------------------------------------------------------------------------
// Terminal states
// ---------------------------------------------------------------------------

export function hasWon(grid: Grid): boolean {
  for (const row of grid) {
    for (const v of row) {
      if (v !== null && v >= WINNING_TILE) return true;
    }
  }
  return false;
}

export function maxTile(grid: Grid): number {
  let max = 0;
  for (const row of grid) {
    for (const v of row) {
      if (v !== null && v > max) max = v;
    }
  }
  return max;
}

/**
 * Game is over when the grid is full AND no adjacent cells share a value
 * (no possible merge in any of the four directions).
 */
export function isGameOver(grid: Grid): boolean {
  if (emptyCells(grid).length > 0) return false;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = grid[r][c];
      if (c + 1 < GRID_SIZE && grid[r][c + 1] === v) return false;
      if (r + 1 < GRID_SIZE && grid[r + 1][c] === v) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fresh game setup
// ---------------------------------------------------------------------------

/** Empty grid with two starting tiles. */
export function initialGrid(rng: () => number = Math.random): Grid {
  return spawnTile(spawnTile(createEmptyGrid(), rng), rng);
}

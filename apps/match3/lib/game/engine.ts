import type { Cell, GemColor, Match3State } from "./types";

export const ROWS = 8;
export const COLS = 8;
export const COLORS: GemColor[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
];
export const INITIAL_MOVES = 30;

function stepRng(rng: number): number {
  return Math.imul(rng, 2654435761) >>> 0;
}

export function createInitialState(seed: number): Match3State {
  let rng = seed || 1;
  const grid: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      let color: GemColor;
      let attempts = 0;
      do {
        rng = stepRng(rng);
        color = COLORS[rng % COLORS.length];
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
    movesLeft: INITIAL_MOVES,
    combo: 0,
    maxCombo: 0,
    totalMatches: 0,
    gemsPopped: 0,
    selected: null,
    status: "playing",
    seed,
    rng,
  };
}

export function areAdjacent(
  a: [number, number],
  b: [number, number],
): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

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
  const matches = findMatches(newGrid);
  if (matches.size === 0) return null;
  return {
    ...state,
    grid: newGrid,
    movesLeft: state.movesLeft - 1,
    selected: null,
    status: "resolving",
  };
}

export function resolve(state: Match3State): Match3State {
  if (state.status !== "resolving") return state;
  let current = state;
  let chainLen = 0;
  // Deterministic per-resolve id seed (no Date.now / Math.random in core).
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
    let rng = current.rng;
    for (let c = 0; c < current.cols; c++) {
      const column: (GemColor | null)[] = [];
      for (let r = 0; r < current.rows; r++) {
        if (grid[r][c].color !== null) column.push(grid[r][c].color);
      }
      while (column.length < current.rows) {
        rng = stepRng(rng);
        column.unshift(COLORS[rng % COLORS.length]);
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
      gemsPopped: current.gemsPopped + matches.size,
    };
  }
  const newStatus: Match3State["status"] =
    current.movesLeft <= 0 ? "gameOver" : "playing";
  return { ...current, status: newStatus, combo: 0 };
}

export function calculateScore(state: Match3State): number {
  return state.score + state.maxCombo * 50;
}

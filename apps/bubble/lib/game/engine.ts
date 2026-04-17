import type { Bubble, BubbleColor, BubbleState } from "./types";

// ---------------------------------------------------------------------------
// Board layout — virtual units. Hexagonal grid: even rows start at col=0,
// odd rows are offset by +BUBBLE_RADIUS. Row height = BUBBLE_DIAMETER × √3/2
// so adjacent circles kiss without overlap.
// ---------------------------------------------------------------------------
export const BOARD_WIDTH = 400;
export const BOARD_HEIGHT = 600;
export const BUBBLE_RADIUS = 18;
export const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
export const GRID_COLS = 10;
export const ROW_HEIGHT = BUBBLE_DIAMETER * 0.866; // sqrt(3)/2
export const GRID_TOP_OFFSET = 20;

export const SHOOTER_Y = BOARD_HEIGHT - 40;
export const SHOOTER_X = BOARD_WIDTH / 2;
/** Danger line — a bubble whose centre crosses this y triggers game over. */
export const GAME_OVER_Y = SHOOTER_Y - BUBBLE_DIAMETER;

export const SHOTS_PER_NEW_ROW = 8;
export const BALL_SPEED = 12;
export const INITIAL_ROWS = 5;
/** Aim angle clamp — ±80° from straight up. */
export const MAX_AIM_ANGLE = (80 * Math.PI) / 180;

export const COLORS: readonly BubbleColor[] = [
  "red",
  "pink",
  "yellow",
  "blue",
  "purple",
  "teal",
];

const FRAME_MS = 1000 / 60;

function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Convert grid coordinates to pixel centre. Odd rows are pushed right by
 * BUBBLE_RADIUS — the hex offset that packs circles at 60° intervals.
 */
export function gridToPixel(row: number, col: number): { x: number; y: number } {
  const offset = row % 2 === 1 ? BUBBLE_RADIUS : 0;
  const x = col * BUBBLE_DIAMETER + BUBBLE_RADIUS + offset;
  const y = row * ROW_HEIGHT + BUBBLE_RADIUS + GRID_TOP_OFFSET;
  return { x, y };
}

/** Inverse of `gridToPixel`, with rounding to the nearest grid cell. */
export function pixelToGrid(x: number, y: number): { row: number; col: number } {
  const row = Math.max(
    0,
    Math.round((y - BUBBLE_RADIUS - GRID_TOP_OFFSET) / ROW_HEIGHT),
  );
  const offset = row % 2 === 1 ? BUBBLE_RADIUS : 0;
  const col = Math.max(
    0,
    Math.round((x - BUBBLE_RADIUS - offset) / BUBBLE_DIAMETER),
  );
  return { row, col };
}

/**
 * 6 hex neighbours — order differs per row parity. Even rows: upper/lower
 * neighbours shift LEFT; odd rows: they shift RIGHT.
 */
export function getNeighbors(row: number, col: number): Array<[number, number]> {
  if (row % 2 === 1) {
    return [
      [row - 1, col],
      [row - 1, col + 1],
      [row, col - 1],
      [row, col + 1],
      [row + 1, col],
      [row + 1, col + 1],
    ];
  }
  return [
    [row - 1, col - 1],
    [row - 1, col],
    [row, col - 1],
    [row, col + 1],
    [row + 1, col - 1],
    [row + 1, col],
  ];
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function createInitialState(seed: number): BubbleState {
  const rand = seededRandom(seed);
  const grid = new Map<string, Bubble>();
  for (let row = 0; row < INITIAL_ROWS; row++) {
    const colsInRow = row % 2 === 1 ? GRID_COLS - 1 : GRID_COLS;
    for (let col = 0; col < colsInRow; col++) {
      const color = COLORS[Math.floor(rand() * COLORS.length)];
      const { x, y } = gridToPixel(row, col);
      grid.set(`${row},${col}`, { row, col, color, x, y });
    }
  }
  return {
    grid,
    flying: null,
    currentShooterColor: COLORS[Math.floor(rand() * COLORS.length)],
    nextShooterColor: COLORS[Math.floor(rand() * COLORS.length)],
    aimAngle: 0,
    shotsFired: 0,
    bubblesPopped: 0,
    score: 0,
    maxCombo: 0,
    rowsAdded: 0,
    status: "aiming",
    seed,
  };
}

export function setAim(state: BubbleState, angle: number): BubbleState {
  if (state.status !== "aiming") return state;
  const clamped = Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, angle));
  return { ...state, aimAngle: clamped };
}

export function shoot(state: BubbleState): BubbleState {
  if (state.status !== "aiming") return state;
  const vx = Math.sin(state.aimAngle) * BALL_SPEED;
  const vy = -Math.cos(state.aimAngle) * BALL_SPEED;
  return {
    ...state,
    status: "flying",
    flying: {
      x: SHOOTER_X,
      y: SHOOTER_Y,
      vx,
      vy,
      color: state.currentShooterColor,
    },
  };
}

/**
 * Advance the in-flight bubble by `dt` ms. Wall-bounces on the sides,
 * snaps to the grid when it hits either the top, another bubble, or the
 * danger line (=game over).
 */
export function updateFlying(state: BubbleState, dt: number): BubbleState {
  if (state.status !== "flying" || !state.flying) return state;
  const frame = Math.min(dt, 50) / FRAME_MS;

  let { x, y, vx, vy } = state.flying;
  x += vx * frame;
  y += vy * frame;

  if (x < BUBBLE_RADIUS) {
    x = BUBBLE_RADIUS;
    vx = -vx;
  } else if (x > BOARD_WIDTH - BUBBLE_RADIUS) {
    x = BOARD_WIDTH - BUBBLE_RADIUS;
    vx = -vx;
  }

  if (y < BUBBLE_RADIUS) {
    return attachBubble(state, x, BUBBLE_RADIUS);
  }

  // Grid collision — first overlap wins.
  for (const b of state.grid.values()) {
    const dx = x - b.x;
    const dy = y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < BUBBLE_DIAMETER - 2) {
      return attachBubble(state, x, y);
    }
  }

  return { ...state, flying: { ...state.flying, x, y, vx, vy } };
}

function attachBubble(state: BubbleState, x: number, y: number): BubbleState {
  if (!state.flying) return state;
  const { row, col } = pixelToGrid(x, y);

  // If the target cell is occupied, prefer the nearest open neighbour.
  let finalRow = row;
  let finalCol = col;
  if (state.grid.has(`${finalRow},${finalCol}`) || finalRow < 0 || finalCol < 0) {
    let bestDist = Infinity;
    for (const [nr, nc] of getNeighbors(row, col)) {
      if (nr < 0 || nc < 0) continue;
      if (state.grid.has(`${nr},${nc}`)) continue;
      const { x: nx, y: ny } = gridToPixel(nr, nc);
      const d = (nx - x) ** 2 + (ny - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        finalRow = nr;
        finalCol = nc;
      }
    }
    if (bestDist === Infinity) {
      // No free neighbour (extremely rare) — drop the shot as a miss.
      return { ...state, flying: null, status: "aiming" };
    }
  }

  const { x: px, y: py } = gridToPixel(finalRow, finalCol);
  const newBubble: Bubble = {
    row: finalRow,
    col: finalCol,
    color: state.flying.color,
    x: px,
    y: py,
  };

  const newGrid = new Map(state.grid);
  newGrid.set(`${finalRow},${finalCol}`, newBubble);

  if (py + BUBBLE_RADIUS >= GAME_OVER_Y) {
    return { ...state, grid: newGrid, flying: null, status: "gameOver" };
  }

  return resolveMatch(
    {
      ...state,
      grid: newGrid,
      flying: null,
      status: "resolving",
      shotsFired: state.shotsFired + 1,
    },
    finalRow,
    finalCol,
  );
}

/**
 * After attach: find same-colour connected cluster; if ≥ 3, pop it and
 * drop any bubbles no longer connected to row 0. Rolls the shooter
 * queue (current ← next ← fresh random) and may add a new top row every
 * SHOTS_PER_NEW_ROW shots.
 */
function resolveMatch(
  state: BubbleState,
  row: number,
  col: number,
): BubbleState {
  const startBubble = state.grid.get(`${row},${col}`);
  if (!startBubble) return { ...state, status: "aiming" };

  let newGrid = state.grid;
  let scoreDelta = 0;
  let comboDelta = 0;

  const matched = findConnectedSameColor(
    state.grid,
    row,
    col,
    startBubble.color,
  );

  if (matched.size >= 3) {
    newGrid = new Map(state.grid);
    for (const key of matched) newGrid.delete(key);
    scoreDelta = matched.size * 10;
    comboDelta = matched.size;

    // Drop any disconnected islands.
    const connected = findConnectedToTop(newGrid);
    const toDrop: string[] = [];
    for (const key of newGrid.keys()) {
      if (!connected.has(key)) toDrop.push(key);
    }
    for (const key of toDrop) newGrid.delete(key);
    scoreDelta += toDrop.length * 20;
    comboDelta += toDrop.length;
  }

  const rand = seededRandom(state.seed + state.shotsFired * 7 + 1);
  const newNext = COLORS[Math.floor(rand() * COLORS.length)];

  let newState: BubbleState = {
    ...state,
    grid: newGrid,
    currentShooterColor: state.nextShooterColor,
    nextShooterColor: newNext,
    score: state.score + scoreDelta,
    bubblesPopped: state.bubblesPopped + comboDelta,
    maxCombo: Math.max(state.maxCombo, comboDelta),
    status: "aiming",
  };

  if (newState.shotsFired > 0 && newState.shotsFired % SHOTS_PER_NEW_ROW === 0) {
    newState = addNewRow(newState);
  }

  if (newState.status !== "gameOver" && newState.grid.size === 0) {
    newState = { ...newState, status: "won" };
  }

  return newState;
}

export function findConnectedSameColor(
  grid: Map<string, Bubble>,
  startRow: number,
  startCol: number,
  color: BubbleColor,
): Set<string> {
  const matched = new Set<string>();
  const queue: Array<[number, number]> = [[startRow, startCol]];
  while (queue.length > 0) {
    const top = queue.shift();
    if (!top) break;
    const [r, c] = top;
    const key = `${r},${c}`;
    if (matched.has(key)) continue;
    const b = grid.get(key);
    if (!b || b.color !== color) continue;
    matched.add(key);
    for (const [nr, nc] of getNeighbors(r, c)) queue.push([nr, nc]);
  }
  return matched;
}

/**
 * BFS from every row-0 bubble. Any bubble NOT reached is "floating" and
 * should be dropped. This is the defining rule that makes bubble shooter
 * feel explosive — strategic shots can drop huge chunks.
 */
export function findConnectedToTop(grid: Map<string, Bubble>): Set<string> {
  const connected = new Set<string>();
  const queue: Array<[number, number]> = [];
  for (const b of grid.values()) {
    if (b.row === 0) {
      const key = `${b.row},${b.col}`;
      connected.add(key);
      queue.push([b.row, b.col]);
    }
  }
  while (queue.length > 0) {
    const top = queue.shift();
    if (!top) break;
    const [r, c] = top;
    for (const [nr, nc] of getNeighbors(r, c)) {
      const nkey = `${nr},${nc}`;
      if (connected.has(nkey)) continue;
      if (grid.has(nkey)) {
        connected.add(nkey);
        queue.push([nr, nc]);
      }
    }
  }
  return connected;
}

/** Push all rows down by 1 and seed a fresh row 0. Game-overs if any bubble
 *  crosses the danger line after the shift. */
function addNewRow(state: BubbleState): BubbleState {
  const rand = seededRandom(state.seed + state.rowsAdded * 13 + 1);
  const newGrid = new Map<string, Bubble>();
  let dangerHit = false;

  for (const b of state.grid.values()) {
    const newRow = b.row + 1;
    const { x, y } = gridToPixel(newRow, b.col);
    newGrid.set(`${newRow},${b.col}`, { ...b, row: newRow, x, y });
    if (y + BUBBLE_RADIUS >= GAME_OVER_Y) dangerHit = true;
  }

  for (let col = 0; col < GRID_COLS; col++) {
    const color = COLORS[Math.floor(rand() * COLORS.length)];
    const { x, y } = gridToPixel(0, col);
    newGrid.set(`0,${col}`, { row: 0, col, color, x, y });
  }

  return {
    ...state,
    grid: newGrid,
    rowsAdded: state.rowsAdded + 1,
    status: dangerHit ? "gameOver" : state.status,
  };
}

/**
 * Advance by one tick. Currently only the flying bubble needs per-frame
 * updates; idle / resolving states are no-ops (their transitions happen
 * synchronously inside `attachBubble` / `resolveMatch`).
 */
export function tick(state: BubbleState, dt: number): BubbleState {
  if (state.status === "flying") return updateFlying(state, dt);
  return state;
}

/**
 * Final score = base score + maxCombo × 20 + 500 win bonus.
 * Combo multiplier rewards setting up big chain drops; win bonus nudges
 * clearing the board instead of farming.
 */
export function calculateScore(state: BubbleState): number {
  const winBonus = state.status === "won" ? 500 : 0;
  return state.score + state.maxCombo * 20 + winBonus;
}

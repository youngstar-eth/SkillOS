import { BOARD_SIZE, type Cell, type Direction, type SnakeState } from "./types";

export { BOARD_SIZE };

/** Snake initial length — 3 cells horizontally at board centre, heading right. */
const INIT_LENGTH = 3;

/**
 * Start state — deterministic given `seed`. Snake at centre, food placed
 * via a seeded hash so SSR and client agree.
 */
export function createInitialState(seed = 0): SnakeState {
  const cy = Math.floor(BOARD_SIZE / 2);
  const cx = Math.floor(BOARD_SIZE / 2);
  const snake: Cell[] = [];
  for (let i = 0; i < INIT_LENGTH; i++) {
    snake.push([cx - i, cy]);
  }
  return {
    snake,
    food: spawnFood(snake, seed),
    direction: "right",
    nextDirection: "right",
    score: 0,
    ateCount: 0,
    status: "playing",
    tick: 0,
  };
}

/**
 * Pick a board cell not currently occupied by the snake. Uses Knuth's
 * multiplicative hash on `(seed + attempt)` so the placement is
 * reproducible — important for SSR parity. Falls back to a linear scan
 * in the degenerate case of a near-full board.
 */
export function spawnFood(snake: Cell[], seed: number): Cell {
  const occupied = new Set(snake.map(([x, y]) => `${x},${y}`));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const hash = ((seed + attempt + 1) * 2654435761) >>> 0;
    const x = hash % BOARD_SIZE;
    const y = (hash >>> 16) % BOARD_SIZE;
    if (!occupied.has(`${x},${y}`)) return [x, y];
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) return [x, y];
    }
  }
  return [0, 0];
}

export function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

/**
 * Buffer a direction change. Reversing into the snake's own neck is
 * dropped silently — even though the user tapped a key, accepting it
 * would auto-collide on the next tick.
 */
export function changeDirection(state: SnakeState, dir: Direction): SnakeState {
  if (isOpposite(state.direction, dir)) return state;
  return { ...state, nextDirection: dir };
}

/** Advance the world by one tick. Pauses and game-overs are no-ops. */
export function tick(state: SnakeState): SnakeState {
  if (state.status !== "playing") return state;

  const direction = state.nextDirection;
  const [headX, headY] = state.snake[0];
  let newHead: Cell;
  switch (direction) {
    case "up":
      newHead = [headX, headY - 1];
      break;
    case "down":
      newHead = [headX, headY + 1];
      break;
    case "left":
      newHead = [headX - 1, headY];
      break;
    case "right":
      newHead = [headX + 1, headY];
      break;
  }

  const [nx, ny] = newHead;

  // Wall collision
  if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) {
    return { ...state, status: "gameOver", direction };
  }

  const willEat = nx === state.food[0] && ny === state.food[1];

  // Self-collision. The tail cell is excluded when we're NOT eating, because
  // the tail vacates as the head advances. When eating, the tail stays, so
  // every body cell is a real obstacle.
  const body = willEat ? state.snake : state.snake.slice(0, -1);
  if (body.some(([x, y]) => x === nx && y === ny)) {
    return { ...state, status: "gameOver", direction };
  }

  const newSnake: Cell[] = willEat
    ? [newHead, ...state.snake]
    : [newHead, ...state.snake.slice(0, -1)];

  const newTick = state.tick + 1;
  const newFood = willEat ? spawnFood(newSnake, newTick * 31) : state.food;

  return {
    ...state,
    snake: newSnake,
    food: newFood,
    direction,
    score: state.score + (willEat ? 10 : 0),
    ateCount: state.ateCount + (willEat ? 1 : 0),
    tick: newTick,
  };
}

/**
 * Tick period in ms. Starts slow (200 ms), drops by 20 ms per 5 food
 * eaten, floored at 80 ms. Caller should re-create its setInterval
 * whenever `ateCount` changes.
 */
export function tickInterval(ateCount: number): number {
  return Math.max(80, 200 - Math.floor(ateCount / 5) * 20);
}

/**
 * Submitted score = collected points + survival bonus.
 *   Survival: +1 per second alive, capped at +100.
 * This nudges both efficiency (food clusters) and endurance.
 */
export function calculateFinalScore(
  state: SnakeState,
  durationMs: number,
): number {
  const survivalBonus = Math.min(Math.floor(durationMs / 1000), 100);
  return state.score + survivalBonus;
}

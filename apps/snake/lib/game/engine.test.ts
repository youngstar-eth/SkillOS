/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  calculateFinalScore,
  changeDirection,
  createInitialState,
  isOpposite,
  spawnFood,
  tick,
  tickInterval,
} from "./engine";
import type { Cell } from "./types";

describe("createInitialState", () => {
  it("3-cell snake starting at centre, heading right", () => {
    const s = createInitialState(0);
    assert.equal(s.snake.length, 3);
    assert.deepEqual(s.snake[0], [10, 10]);
    assert.equal(s.direction, "right");
    assert.equal(s.nextDirection, "right");
    assert.equal(s.status, "playing");
    assert.equal(s.score, 0);
    assert.equal(s.ateCount, 0);
    assert.equal(s.tick, 0);
  });

  it("food is not on the snake", () => {
    const s = createInitialState(42);
    const occ = new Set(s.snake.map(([x, y]) => `${x},${y}`));
    assert.ok(!occ.has(`${s.food[0]},${s.food[1]}`));
  });

  it("deterministic for the same seed", () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    assert.deepEqual(a.food, b.food);
  });
});

describe("isOpposite", () => {
  it("opposite pairs", () => {
    assert.equal(isOpposite("up", "down"), true);
    assert.equal(isOpposite("left", "right"), true);
    assert.equal(isOpposite("right", "left"), true);
  });
  it("non-opposite pairs", () => {
    assert.equal(isOpposite("up", "left"), false);
    assert.equal(isOpposite("up", "up"), false);
  });
});

describe("changeDirection", () => {
  it("normal change buffers into nextDirection", () => {
    const s0 = createInitialState(0);
    const s1 = changeDirection(s0, "up");
    assert.equal(s1.nextDirection, "up");
    assert.equal(s1.direction, "right"); // unchanged until tick
  });

  it("opposite of current direction is ignored", () => {
    const s0 = createInitialState(0); // heading right
    const s1 = changeDirection(s0, "left");
    assert.equal(s1.nextDirection, "right");
    assert.equal(s1, s0); // same reference — cheap no-op
  });
});

describe("tick: movement", () => {
  it("moves right by one when not eating", () => {
    const s0 = createInitialState(0);
    const s = { ...s0, food: [15, 15] as Cell };
    const next = tick(s);
    assert.deepEqual(next.snake[0], [11, 10]);
    assert.equal(next.snake.length, 3);
    assert.equal(next.score, 0);
    assert.equal(next.tick, 1);
  });

  it("eats food → grows + scores, respawns food elsewhere", () => {
    const s0 = createInitialState(0);
    const s = { ...s0, food: [11, 10] as Cell };
    const next = tick(s);
    assert.deepEqual(next.snake[0], [11, 10]);
    assert.equal(next.snake.length, 4);
    assert.equal(next.score, 10);
    assert.equal(next.ateCount, 1);
    assert.ok(next.food[0] !== 11 || next.food[1] !== 10);
  });

  it("commits buffered direction on tick", () => {
    const s0 = createInitialState(0);
    const queued = changeDirection(s0, "up");
    const next = tick({ ...queued, food: [15, 15] });
    assert.equal(next.direction, "up");
    assert.deepEqual(next.snake[0], [10, 9]); // moved up from [10,10]
  });
});

describe("tick: collisions", () => {
  it("wall collision → gameOver", () => {
    const s0 = createInitialState(0);
    const s = {
      ...s0,
      snake: [
        [19, 10],
        [18, 10],
        [17, 10],
      ] as Cell[],
      direction: "right" as const,
      nextDirection: "right" as const,
      food: [0, 0] as Cell,
    };
    const next = tick(s);
    assert.equal(next.status, "gameOver");
  });

  it("self-collision → gameOver", () => {
    // 5-cell curled snake, head at [3,3] moving down into [3,4] which is body.
    const s0 = createInitialState(0);
    const s = {
      ...s0,
      snake: [
        [3, 3],
        [2, 3],
        [2, 4],
        [3, 4],
        [4, 4],
      ] as Cell[],
      direction: "down" as const,
      nextDirection: "down" as const,
      food: [10, 10] as Cell,
    };
    const next = tick(s);
    assert.equal(next.status, "gameOver");
  });

  it("chasing your own tail is safe while not eating", () => {
    // 4-cell square, head [3,3] moving left to [2,3]. Tail [3,4] vacates.
    const s0 = createInitialState(0);
    const s = {
      ...s0,
      snake: [
        [3, 3],
        [4, 3],
        [4, 4],
        [3, 4],
      ] as Cell[],
      direction: "left" as const,
      nextDirection: "left" as const,
      food: [10, 10] as Cell,
    };
    const next = tick(s);
    assert.equal(next.status, "playing");
    assert.deepEqual(next.snake[0], [2, 3]);
  });
});

describe("tick: paused / gameOver are no-ops", () => {
  it("paused state is returned unchanged", () => {
    const s = { ...createInitialState(0), status: "paused" as const };
    const next = tick(s);
    assert.deepEqual(next, s);
  });
  it("gameOver state is returned unchanged", () => {
    const s = { ...createInitialState(0), status: "gameOver" as const };
    const next = tick(s);
    assert.deepEqual(next, s);
  });
});

describe("spawnFood", () => {
  it("never places on the snake", () => {
    const snake: Cell[] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    for (let seed = 0; seed < 50; seed++) {
      const f = spawnFood(snake, seed);
      const onSnake = snake.some(([x, y]) => x === f[0] && y === f[1]);
      assert.ok(!onSnake, `seed ${seed} placed food on snake: ${f}`);
    }
  });

  it("stays within board bounds", () => {
    const f = spawnFood([[10, 10]], 123);
    assert.ok(f[0] >= 0 && f[0] < BOARD_SIZE);
    assert.ok(f[1] >= 0 && f[1] < BOARD_SIZE);
  });
});

describe("tickInterval", () => {
  it("starts at 200ms", () => {
    assert.equal(tickInterval(0), 200);
  });
  it("drops 20ms per 5 eaten", () => {
    assert.equal(tickInterval(5), 180);
    assert.equal(tickInterval(10), 160);
    assert.equal(tickInterval(15), 140);
  });
  it("floored at 80ms", () => {
    assert.equal(tickInterval(100), 80);
    assert.equal(tickInterval(999), 80);
  });
});

describe("calculateFinalScore", () => {
  it("score + survival bonus (1pt/sec)", () => {
    const s = { ...createInitialState(0), score: 50 };
    assert.equal(calculateFinalScore(s, 30_000), 80);
  });
  it("survival bonus capped at 100", () => {
    const s = { ...createInitialState(0), score: 50 };
    assert.equal(calculateFinalScore(s, 300_000), 150);
  });
  it("sub-second duration → no bonus", () => {
    const s = { ...createInitialState(0), score: 0 };
    assert.equal(calculateFinalScore(s, 500), 0);
  });
});

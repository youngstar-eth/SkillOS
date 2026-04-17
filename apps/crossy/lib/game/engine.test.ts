/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_WIDTH,
  COLS,
  SAFE_ROWS_START,
  TILE,
  calculateScore,
  createInitialState,
  move,
  tick,
} from "./engine";
import type { CrossyState, Row } from "./types";

function makeGrassState(): CrossyState {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i++) rows.push({ y: i, type: "grass" });
  return {
    player: { x: Math.floor(COLS / 2) * TILE, y: 0 },
    rows,
    cameraY: 0,
    maxY: 0,
    elapsedMs: 0,
    status: "playing",
    seed: 1,
    rng: 1,
  };
}

describe("createInitialState", () => {
  it("creates SAFE_ROWS_START grass rows at the beginning", () => {
    const s = createInitialState(42);
    for (let i = 0; i < SAFE_ROWS_START; i++) {
      assert.equal(s.rows[i].type, "grass");
    }
    assert.equal(s.status, "playing");
    assert.equal(s.player.y, 0);
    assert.equal(s.maxY, 0);
  });

  it("is deterministic for the same seed", () => {
    const a = createInitialState(123);
    const b = createInitialState(123);
    assert.equal(a.rows.length, b.rows.length);
    for (let i = 0; i < a.rows.length; i++) {
      assert.equal(a.rows[i].type, b.rows[i].type);
    }
  });
});

describe("move", () => {
  it("moves player up (y++)", () => {
    const s = makeGrassState();
    const next = move(s, "up");
    assert.equal(next.player.y, 1);
    assert.equal(next.maxY, 1);
  });

  it("move down does not go below 0", () => {
    const s = makeGrassState();
    const next = move(s, "down");
    assert.equal(next.player.y, 0);
  });

  it("move left decreases x by TILE but not below 0", () => {
    const s = makeGrassState();
    const left1 = move(s, "left");
    assert.equal(left1.player.x, s.player.x - TILE);
    // push to edge
    let cur = left1;
    for (let i = 0; i < 20; i++) cur = move(cur, "left");
    assert.equal(cur.player.x, 0);
    const stuck = move(cur, "left");
    assert.equal(stuck.player.x, 0);
  });

  it("move right increases x by TILE but clamps at COLS-1", () => {
    const s = makeGrassState();
    const right1 = move(s, "right");
    assert.equal(right1.player.x, s.player.x + TILE);
    let cur = right1;
    for (let i = 0; i < 20; i++) cur = move(cur, "right");
    assert.equal(cur.player.x, (COLS - 1) * TILE);
    const stuck = move(cur, "right");
    assert.equal(stuck.player.x, (COLS - 1) * TILE);
  });

  it("maxY tracks highest reached y", () => {
    let s = makeGrassState();
    s = move(s, "up");
    s = move(s, "up");
    s = move(s, "up");
    assert.equal(s.maxY, 3);
    // if we could move down (simulate by manually bumping y up then down via repeated moves)
    // maxY never decreases
    s = move(s, "down");
    assert.equal(s.maxY, 3);
  });

  it("move is a no-op when gameOver", () => {
    const s = { ...makeGrassState(), status: "gameOver" as const };
    const next = move(s, "up");
    assert.deepEqual(next, s);
  });
});

describe("tick - vehicles", () => {
  it("vehicles move in their direction", () => {
    const base = makeGrassState();
    base.rows[0] = {
      y: 0,
      type: "road",
      direction: 1,
      speed: 2,
      vehicles: [{ x: 10, width: TILE, speed: 2 }],
    };
    // Put the player on grass row at y=1 so they are not affected.
    base.rows[1] = { y: 1, type: "grass" };
    base.player = { x: 0, y: 1 };
    const next = tick(base, 16.67);
    const v = next.rows[0].vehicles![0];
    assert.ok(v.x > 10, "vehicle should move right");
  });

  it("vehicles wrap around off the right edge", () => {
    const base = makeGrassState();
    base.rows[0] = {
      y: 0,
      type: "road",
      direction: 1,
      speed: 100,
      vehicles: [{ x: BOARD_WIDTH + 201, width: TILE, speed: 100 }],
    };
    base.player = { x: 0, y: 1 };
    base.rows[1] = { y: 1, type: "grass" };
    const next = tick(base, 16.67);
    const v = next.rows[0].vehicles![0];
    assert.ok(v.x < 0, "vehicle should wrap around to the left");
  });

  it("player hit by a vehicle triggers gameOver", () => {
    const base = makeGrassState();
    base.player = { x: 100, y: 1 };
    base.rows[1] = {
      y: 1,
      type: "road",
      direction: 1,
      speed: 0,
      vehicles: [{ x: 100, width: TILE, speed: 0 }],
    };
    const next = tick(base, 16.67);
    assert.equal(next.status, "gameOver");
  });
});

describe("tick - water and logs", () => {
  it("logs move along with their speed", () => {
    const base = makeGrassState();
    base.rows[2] = {
      y: 2,
      type: "water",
      direction: 1,
      speed: 1,
      logs: [{ x: 20, width: TILE * 3, speed: 1 }],
    };
    base.player = { x: 0, y: 0 };
    const next = tick(base, 16.67);
    const log = next.rows[2].logs![0];
    assert.ok(log.x > 20, "log should have moved right");
  });

  it("player on a log is carried along with the log", () => {
    const base = makeGrassState();
    const logSpeed = 1;
    base.rows[2] = {
      y: 2,
      type: "water",
      direction: 1,
      speed: logSpeed,
      logs: [{ x: 0, width: TILE * 4, speed: logSpeed }],
    };
    base.player = { x: TILE, y: 2 };
    const next = tick(base, 16.67);
    assert.equal(next.status, "playing");
    assert.ok(next.player.x > TILE, "player should move with log");
    assert.ok(next.player.onLog, "player.onLog should be set");
  });

  it("player on log at edge triggers gameOver", () => {
    const base = makeGrassState();
    // Log and player near right edge; log moves player off the board.
    const logSpeed = 100; // huge speed so one tick pushes beyond the edge
    base.rows[1] = {
      y: 1,
      type: "water",
      direction: 1,
      speed: logSpeed,
      logs: [{ x: BOARD_WIDTH - TILE * 3, width: TILE * 3, speed: logSpeed }],
    };
    base.player = { x: BOARD_WIDTH - TILE, y: 1 };
    const next = tick(base, 16.67);
    assert.equal(next.status, "gameOver");
  });

  it("player on water without a log triggers gameOver", () => {
    const base = makeGrassState();
    base.rows[1] = {
      y: 1,
      type: "water",
      direction: 1,
      speed: 1,
      logs: [{ x: BOARD_WIDTH + 100, width: TILE * 2, speed: 1 }],
    };
    base.player = { x: TILE, y: 1 };
    const next = tick(base, 16.67);
    assert.equal(next.status, "gameOver");
  });
});

describe("tick - grass is safe", () => {
  it("player on grass remains alive and elapsed advances", () => {
    const base = makeGrassState();
    base.player = { x: TILE * 2, y: 1 };
    const next = tick(base, 16.67);
    assert.equal(next.status, "playing");
    assert.ok(next.elapsedMs > 0);
  });

  it("tick is a no-op when gameOver", () => {
    const s = { ...makeGrassState(), status: "gameOver" as const };
    const next = tick(s, 16.67);
    assert.equal(next, s);
  });
});

describe("calculateScore", () => {
  it("scores 10 per maxY step", () => {
    const s = makeGrassState();
    s.maxY = 5;
    assert.equal(calculateScore(s), 50);
  });

  it("zero when player never moved", () => {
    const s = makeGrassState();
    assert.equal(calculateScore(s), 0);
  });
});

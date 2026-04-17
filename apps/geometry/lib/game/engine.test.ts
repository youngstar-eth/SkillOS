/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_WIDTH,
  GROUND_Y,
  INITIAL_SPEED,
  JUMP_VELOCITY,
  PLAYER_SIZE,
  calculateScore,
  createInitialState,
  jump,
  tick,
} from "./engine";
import type { GeometryState, Obstacle } from "./types";

function clearObstacles(s: GeometryState): GeometryState {
  return { ...s, obstacles: [] };
}

function withObstacle(s: GeometryState, ob: Obstacle): GeometryState {
  return { ...s, obstacles: [ob] };
}

describe("createInitialState", () => {
  it("creates 30 obstacles and starts on the ground", () => {
    const s = createInitialState(42);
    assert.equal(s.obstacles.length, 30);
    assert.equal(s.isOnGround, true);
    assert.equal(s.status, "playing");
    assert.equal(s.playerY, GROUND_Y - PLAYER_SIZE);
    assert.equal(s.playerX, 100);
    assert.equal(s.speed, INITIAL_SPEED);
    assert.equal(s.distance, 0);
  });
});

describe("jump", () => {
  it("applies upward velocity and lifts off ground", () => {
    const s = jump(createInitialState(1));
    assert.equal(s.playerVy, JUMP_VELOCITY);
    assert.equal(s.isOnGround, false);
  });

  it("is a no-op while midair", () => {
    const s = jump(createInitialState(1));
    const again = jump(s);
    assert.strictEqual(again, s);
  });

  it("is a no-op after gameOver", () => {
    const base = createInitialState(1);
    const dead: GeometryState = { ...base, status: "gameOver" };
    const next = jump(dead);
    assert.strictEqual(next, dead);
  });
});

describe("tick: physics", () => {
  it("applies gravity while airborne", () => {
    const jumped = jump(createInitialState(1));
    // One 16.67ms frame — vy should increase by ~GRAVITY (0.8)
    const stepped = tick(clearObstacles(jumped), 16.67);
    assert.ok(stepped.playerVy > jumped.playerVy);
    assert.ok(stepped.playerY < jumped.playerY); // moved up (smaller y)
  });

  it("lands back on the ground after enough ticks", () => {
    let s = jump(createInitialState(1));
    s = clearObstacles(s);
    for (let i = 0; i < 120; i++) {
      s = tick(s, 16.67);
    }
    assert.equal(s.isOnGround, true);
    assert.equal(s.playerY, GROUND_Y - PLAYER_SIZE);
    assert.equal(s.playerVy, 0);
  });
});

describe("tick: obstacles", () => {
  it("moves obstacles left each frame", () => {
    const s = createInitialState(1);
    const firstX = s.obstacles[0].x;
    const next = tick(s, 16.67);
    assert.ok(next.obstacles[0].x < firstX);
  });

  it("filters obstacles that go off-screen", () => {
    const base = createInitialState(1);
    const s: GeometryState = {
      ...base,
      obstacles: [
        { x: -200, type: "spike", height: 30 },
        { x: BOARD_WIDTH, type: "spike", height: 30 },
      ],
    };
    const next = tick(s, 16.67);
    assert.equal(next.obstacles.length, 1);
    assert.ok(next.obstacles[0].x > 0);
  });
});

describe("tick: collisions", () => {
  it("spike hit at ground level → gameOver", () => {
    const base = createInitialState(1);
    const s = withObstacle(base, {
      x: base.playerX + 5,
      type: "spike",
      height: 40,
    });
    const next = tick(s, 16.67);
    assert.equal(next.status, "gameOver");
  });

  it("block side hit → gameOver", () => {
    // Player airborne, at block height, horizontally overlapping → side hit.
    // Block top = GROUND_Y - 40. Player bottom = GROUND_Y - 10 > block top + 10.
    const base = createInitialState(1);
    const airborne: GeometryState = {
      ...base,
      isOnGround: false,
      playerVy: -5, // still moving up, won't land on ground this frame
      playerY: GROUND_Y - PLAYER_SIZE - 10,
    };
    const s = withObstacle(airborne, {
      x: airborne.playerX + 5,
      type: "block",
      height: 40,
    });
    const next = tick(s, 16.67);
    assert.equal(next.status, "gameOver");
  });

  it("block top land → stands on top, no game over", () => {
    // Player descending, bottom just crosses block top → lands on block.
    const base = createInitialState(1);
    const blockHeight = 40;
    const landingY = GROUND_Y - blockHeight - PLAYER_SIZE;
    const s: GeometryState = {
      ...base,
      isOnGround: false,
      playerVy: 5,
      // Just 1px above the block top (so this frame will cross the top by < 10)
      playerY: landingY - 1,
      obstacles: [
        { x: base.playerX + 5, type: "block", height: blockHeight },
      ],
    };
    const next = tick(s, 16.67);
    assert.equal(next.status, "playing");
    assert.equal(next.isOnGround, true);
    assert.equal(next.playerY, landingY);
    assert.equal(next.playerVy, 0);
  });

  it("gap while on ground → gameOver", () => {
    const base = createInitialState(1);
    const s: GeometryState = {
      ...base,
      isOnGround: true,
      obstacles: [{ x: base.playerX - 10, type: "gap", height: 0 }],
    };
    const next = tick(s, 16.67);
    assert.equal(next.status, "gameOver");
  });
});

describe("tick: progression", () => {
  it("speed increases over time", () => {
    let s = clearObstacles(createInitialState(1));
    const before = s.speed;
    for (let i = 0; i < 60; i++) {
      s = tick(s, 16.67);
    }
    assert.ok(s.speed > before);
  });

  it("distance accumulates each tick", () => {
    let s = clearObstacles(createInitialState(1));
    const d0 = s.distance;
    s = tick(s, 16.67);
    const d1 = s.distance;
    s = tick(s, 16.67);
    const d2 = s.distance;
    assert.ok(d1 > d0);
    assert.ok(d2 > d1);
  });

  it("elapsedMs accumulates", () => {
    let s = clearObstacles(createInitialState(1));
    s = tick(s, 16.67);
    s = tick(s, 16.67);
    assert.ok(s.elapsedMs > 30);
  });
});

describe("calculateScore", () => {
  it("is floor(distance / 10)", () => {
    const base = createInitialState(1);
    const s: GeometryState = { ...base, distance: 123.7 };
    assert.equal(calculateScore(s), 12);
  });
});

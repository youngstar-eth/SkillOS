/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALL_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  calculateScore,
  createInitialState,
  setAim,
  shoot,
  tick,
} from "./engine";
import type { PoolState } from "./types";

function runUntilRest(state: PoolState, maxMs = 60000): PoolState {
  let s = state;
  let t = 0;
  while (s.status === "simulating" && t < maxMs) {
    s = tick(s, 16.67);
    t += 16.67;
  }
  return s;
}

describe("createInitialState", () => {
  it("creates 16 balls — 1 cue + 15 racked", () => {
    const s = createInitialState(1);
    assert.equal(s.balls.length, 16);
    assert.equal(s.balls.filter((b) => b.isCue).length, 1);
    assert.equal(s.balls.filter((b) => !b.isCue).length, 15);
  });

  it("initial status is 'aiming' with zero counters", () => {
    const s = createInitialState(42);
    assert.equal(s.status, "aiming");
    assert.equal(s.shotsFired, 0);
    assert.equal(s.fouls, 0);
    assert.equal(s.ballsPocketed, 0);
    assert.equal(s.elapsedMs, 0);
  });
});

describe("setAim", () => {
  it("sets angle and clamps power into [0,1]", () => {
    const s = createInitialState(1);
    const a = setAim(s, Math.PI / 4, 2);
    assert.equal(a.aimAngle, Math.PI / 4);
    assert.equal(a.aimPower, 1);
    const b = setAim(s, -1, -0.5);
    assert.equal(b.aimPower, 0);
  });

  it("is a no-op when not aiming", () => {
    const s = { ...createInitialState(1), status: "simulating" as const };
    const after = setAim(s, 1, 0.5);
    assert.equal(after.aimAngle, 0);
    assert.equal(after.aimPower, 0.5);
  });
});

describe("shoot", () => {
  it("sets cue ball velocity and transitions to simulating", () => {
    let s = createInitialState(1);
    s = setAim(s, 0, 1);
    const after = shoot(s);
    assert.equal(after.status, "simulating");
    assert.equal(after.shotsFired, 1);
    const cue = after.balls.find((b) => b.isCue);
    assert.ok(cue);
    assert.ok(cue!.vx > 0);
    assert.equal(Math.round(cue!.vy), 0);
  });

  it("is a no-op when not aiming", () => {
    const s = { ...createInitialState(1), status: "simulating" as const };
    const after = shoot(s);
    assert.equal(after, s);
  });
});

describe("tick: friction", () => {
  it("decelerates balls over time", () => {
    let s = createInitialState(1);
    s = setAim(s, 0, 1);
    s = shoot(s);
    const initialVx = s.balls.find((b) => b.isCue)!.vx;
    // A few ticks of friction
    for (let i = 0; i < 10; i++) s = tick(s, 16.67);
    const laterVx = s.balls.find((b) => b.isCue)!.vx;
    assert.ok(laterVx < initialVx, "cue should slow down");
  });
});

describe("tick: wall bounce", () => {
  it("bounces cue off left wall when shot toward it", () => {
    let s = createInitialState(1);
    // Put cue near left wall, shoot left.
    s = {
      ...s,
      balls: s.balls.map((b) =>
        b.isCue ? { ...b, x: 40, y: BOARD_HEIGHT / 2, vx: 0, vy: 0 } : b,
      ),
    };
    s = setAim(s, Math.PI, 0.5); // pointing left
    s = shoot(s);
    // Step a few frames; velocity x should flip to positive after hit.
    let flipped = false;
    for (let i = 0; i < 20; i++) {
      s = tick(s, 16.67);
      const cue = s.balls.find((b) => b.isCue)!;
      if (cue.vx > 0) {
        flipped = true;
        break;
      }
    }
    assert.ok(flipped, "cue x velocity should flip after wall bounce");
  });
});

describe("tick: ball-ball collision", () => {
  it("transfers momentum from cue to a target ball", () => {
    let s = createInitialState(1);
    // Manually place a single non-cue target in line with cue.
    const cueX = 100;
    const targetX = cueX + BALL_RADIUS * 2 + 2;
    s = {
      ...s,
      balls: [
        {
          id: 0,
          x: cueX,
          y: BOARD_HEIGHT / 2,
          vx: 0,
          vy: 0,
          radius: BALL_RADIUS,
          color: "white",
          pocketed: false,
          isCue: true,
        },
        {
          id: 1,
          x: targetX,
          y: BOARD_HEIGHT / 2,
          vx: 0,
          vy: 0,
          radius: BALL_RADIUS,
          color: "#ff3030",
          pocketed: false,
          isCue: false,
        },
      ],
    };
    s = setAim(s, 0, 1);
    s = shoot(s);
    // Tick a handful of frames for contact.
    for (let i = 0; i < 5; i++) s = tick(s, 16.67);
    const target = s.balls.find((b) => b.id === 1)!;
    assert.ok(target.vx > 0, "target should pick up rightward velocity");
  });
});

describe("tick: pocket detection", () => {
  it("marks a non-cue ball pocketed when it reaches a pocket", () => {
    let s = createInitialState(1);
    // Place a non-cue ball right next to top-left pocket, drifting into it.
    s = {
      ...s,
      status: "simulating",
      balls: s.balls.map((b, i) =>
        i === 1 ? { ...b, x: 30, y: 30, vx: -2, vy: -2 } : b,
      ),
    };
    for (let i = 0; i < 60; i++) s = tick(s, 16.67);
    const ball = s.balls.find((b) => b.id === 1)!;
    assert.equal(ball.pocketed, true);
    assert.ok(s.ballsPocketed >= 1);
  });
});

describe("tick: cue in pocket → foul + reposition", () => {
  it("counts foul and restores cue after pocket scratch", () => {
    let s = createInitialState(1);
    // Keep only cue + 1 target away from any pocket, slam cue into a pocket.
    s = {
      ...s,
      balls: [
        {
          id: 0,
          x: 40,
          y: 40,
          vx: -2,
          vy: -2,
          radius: BALL_RADIUS,
          color: "white",
          pocketed: false,
          isCue: true,
        },
        {
          id: 1,
          x: BOARD_WIDTH / 2,
          y: BOARD_HEIGHT / 2,
          vx: 0,
          vy: 0,
          radius: BALL_RADIUS,
          color: "#ff3030",
          pocketed: false,
          isCue: false,
        },
      ],
      status: "simulating",
    };
    for (let i = 0; i < 200; i++) s = tick(s, 16.67);
    const cue = s.balls.find((b) => b.isCue)!;
    // Cue was re-spotted.
    assert.equal(cue.pocketed, false);
    assert.equal(cue.x, 200);
    assert.equal(cue.y, BOARD_HEIGHT / 2);
    assert.ok(s.fouls >= 1, "scratching the cue should produce a foul");
  });
});

describe("tick: all at rest → aiming", () => {
  it("returns to aiming when motion stops and balls remain", () => {
    let s = createInitialState(1);
    s = setAim(s, 0, 0.3);
    s = shoot(s);
    s = runUntilRest(s);
    assert.ok(
      s.status === "aiming" || s.status === "finished",
      `expected aiming/finished but got ${s.status}`,
    );
  });
});

describe("tick: all non-cue pocketed → finished", () => {
  it("finishes when every non-cue ball is pocketed", () => {
    let s = createInitialState(1);
    // Pre-pocket all non-cue balls, leave cue idle — a single tick should
    // detect all-at-rest and flip to finished.
    s = {
      ...s,
      status: "simulating",
      balls: s.balls.map((b) =>
        b.isCue ? { ...b, vx: 0, vy: 0 } : { ...b, pocketed: true, vx: 0, vy: 0 },
      ),
      ballsPocketed: 15,
    };
    s = tick(s, 16.67);
    assert.equal(s.status, "finished");
  });
});

describe("calculateScore", () => {
  it("never returns a negative number", () => {
    const s: PoolState = {
      ...createInitialState(1),
      shotsFired: 1000,
      fouls: 1000,
      ballsPocketed: 0,
      elapsedMs: 10_000_000,
    };
    assert.ok(calculateScore(s) >= 0);
  });

  it("rewards pocketed balls and fast play", () => {
    const fast: PoolState = {
      ...createInitialState(1),
      ballsPocketed: 15,
      shotsFired: 10,
      fouls: 0,
      elapsedMs: 30_000,
    };
    const slow: PoolState = { ...fast, elapsedMs: 250_000 };
    assert.ok(calculateScore(fast) > calculateScore(slow));
  });
});

/**
 * Run with:  npx tsx --test lib/game/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_HEIGHT,
  PLAYER_SIZE,
  attachRope,
  calculateScore,
  createInitialState,
  releaseRope,
  tick,
} from "./engine";
import type { StickmanState } from "./types";

describe("createInitialState", () => {
  it("creates 20 anchors and a flag beyond the last anchor", () => {
    const s = createInitialState(42);
    assert.equal(s.anchors.length, 20);
    const lastAnchor = s.anchors[s.anchors.length - 1];
    assert.ok(s.flagX > lastAnchor.x, "flag must be past last anchor");
    assert.equal(s.status, "playing");
    assert.equal(s.x, 100);
    assert.equal(s.y, 300);
  });

  it("is deterministic for the same seed", () => {
    const a = createInitialState(123);
    const b = createInitialState(123);
    assert.deepEqual(a.anchors, b.anchors);
    assert.equal(a.flagX, b.flagX);
  });
});

describe("attachRope", () => {
  it("snaps to the closest anchor within forgiveness radius", () => {
    const s = createInitialState(1);
    const target = s.anchors[0];
    const after = attachRope(s, target.x + 2, target.y - 2);
    assert.ok(after.ropeAnchor);
    assert.equal(after.ropeAnchor?.x, target.x);
    assert.equal(after.ropeAnchor?.y, target.y);
    assert.ok(after.ropeLength !== null);
  });

  it("does not attach when click is too far from any anchor", () => {
    const s = createInitialState(1);
    const after = attachRope(s, -99999, -99999);
    assert.equal(after.ropeAnchor, null);
    assert.equal(after.ropeLength, null);
  });

  it("is a no-op when status is not playing", () => {
    const s: StickmanState = { ...createInitialState(1), status: "gameOver" };
    const target = s.anchors[0];
    const after = attachRope(s, target.x, target.y);
    assert.equal(after.ropeAnchor, null);
  });
});

describe("releaseRope", () => {
  it("clears the rope anchor and length", () => {
    const s = createInitialState(1);
    const target = s.anchors[0];
    const attached = attachRope(s, target.x, target.y);
    const released = releaseRope(attached);
    assert.equal(released.ropeAnchor, null);
    assert.equal(released.ropeLength, null);
  });
});

describe("tick - gravity", () => {
  it("applies gravity to vy when no rope is attached", () => {
    const s = createInitialState(1);
    const after = tick(s, 16.67);
    assert.ok(after.vy > 0, "vy should increase from gravity");
    assert.ok(after.y > s.y, "y should increase after one tick");
  });
});

describe("tick - rope tension", () => {
  it("pulls the player back toward the anchor when beyond rope length", () => {
    const anchor = { x: 200, y: 100, radius: 15 };
    const base = createInitialState(1);
    const s: StickmanState = {
      ...base,
      x: 200,
      y: 200,
      vx: 0,
      vy: 20,
      ropeAnchor: anchor,
      ropeLength: 100,
      anchors: [anchor, ...base.anchors.slice(1)],
    };
    const after = tick(s, 16.67);
    const dx = after.x - anchor.x;
    const dy = after.y - anchor.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Distance should be clamped ~ close to ropeLength (allow tiny fp slack)
    assert.ok(d <= 100 + 1e-6, `distance ${d} must be <= ropeLength`);
  });

  it("reflects velocity tangentially along the rope", () => {
    const anchor = { x: 0, y: 0, radius: 15 };
    const base = createInitialState(1);
    const s: StickmanState = {
      ...base,
      x: 0,
      y: 100,
      vx: 0,
      vy: 10, // purely radial (outward)
      ropeAnchor: anchor,
      ropeLength: 100,
      anchors: [anchor, ...base.anchors.slice(1)],
    };
    const after = tick(s, 16.67);
    // After tick, radial component should be killed -> vy near 0 (with damping)
    assert.ok(Math.abs(after.vy) < Math.abs(s.vy), "radial vy should shrink");
  });
});

describe("tick - floor collision", () => {
  it("sets status to gameOver when the player hits the floor", () => {
    const base = createInitialState(1);
    const s: StickmanState = {
      ...base,
      x: 100,
      y: BOARD_HEIGHT - PLAYER_SIZE - 1,
      vx: 0,
      vy: 100,
    };
    const after = tick(s, 16.67);
    assert.equal(after.status, "gameOver");
    assert.equal(after.y, BOARD_HEIGHT - PLAYER_SIZE);
  });
});

describe("tick - flag reached", () => {
  it("sets status to won when within 25px of flag", () => {
    const base = createInitialState(1);
    const s: StickmanState = {
      ...base,
      x: base.flagX - 5,
      y: base.flagY - 5,
      vx: 0,
      vy: 0,
    };
    const after = tick(s, 16.67);
    assert.equal(after.status, "won");
  });
});

describe("distance tracking", () => {
  it("distance tracks the maximum x achieved", () => {
    const base = createInitialState(1);
    const s: StickmanState = {
      ...base,
      x: 500,
      y: 100,
      vx: 10,
      vy: 0,
      distance: 400,
    };
    const after = tick(s, 16.67);
    assert.ok(after.distance >= 500);
  });
});

describe("calculateScore", () => {
  it("returns distance plus win bonus of 500 when won", () => {
    const base = createInitialState(1);
    const s: StickmanState = { ...base, distance: 1234, status: "won" };
    assert.equal(calculateScore(s), 1234 + 500);
  });

  it("returns just distance floor when not won", () => {
    const base = createInitialState(1);
    const s: StickmanState = { ...base, distance: 42.7, status: "gameOver" };
    assert.equal(calculateScore(s), 42);
  });
});

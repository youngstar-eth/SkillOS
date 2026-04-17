import type { Anchor, Obstacle, StickmanState } from "./types";

export const GRAVITY = 0.3;
export const ROPE_SPRING = 0.02;
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 500;
export const PLAYER_SIZE = 12;

export function createInitialState(seed: number): StickmanState {
  let rng = seed || 1;
  const anchors: Anchor[] = [];
  const obstacles: Obstacle[] = [];
  let x = 300;
  for (let i = 0; i < 20; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const yOffset = (rng / 0x100000000 - 0.5) * 200;
    anchors.push({ x, y: 150 + yOffset, radius: 15 });
    rng = Math.imul(rng, 2654435761) >>> 0;
    x += 200 + (rng / 0x100000000) * 100;
  }
  return {
    x: 100,
    y: 300,
    vx: 0,
    vy: 0,
    ropeAnchor: null,
    ropeLength: null,
    anchors,
    obstacles,
    flagX: x + 100,
    flagY: 300,
    cameraX: 0,
    status: "playing",
    distance: 0,
    seed,
    rng,
  };
}

export function attachRope(
  state: StickmanState,
  ax: number,
  ay: number,
): StickmanState {
  if (state.status !== "playing") return state;
  let closest: Anchor | null = null;
  let minDist = Infinity;
  for (const a of state.anchors) {
    const dx = a.x - ax;
    const dy = a.y - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < a.radius + 30 && d < minDist) {
      minDist = d;
      closest = a;
    }
  }
  if (!closest) return state;
  const dx = closest.x - state.x;
  const dy = closest.y - state.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return { ...state, ropeAnchor: closest, ropeLength: length };
}

export function releaseRope(state: StickmanState): StickmanState {
  return { ...state, ropeAnchor: null, ropeLength: null };
}

export function tick(state: StickmanState, dt: number): StickmanState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  let { x, y, vx, vy } = state;
  vy += GRAVITY * frame;
  x += vx * frame;
  y += vy * frame;

  // Rope constraint (spring-ish)
  if (state.ropeAnchor && state.ropeLength) {
    const dx = x - state.ropeAnchor.x;
    const dy = y - state.ropeAnchor.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > state.ropeLength) {
      const overshoot = d - state.ropeLength;
      const nx = dx / d;
      const ny = dy / d;
      x -= nx * overshoot;
      y -= ny * overshoot;
      // Reflect velocity along rope (tangential)
      const dot = vx * nx + vy * ny;
      vx -= nx * dot;
      vy -= ny * dot;
      vx *= 0.99;
      vy *= 0.99;
    }
  }

  // Floor
  if (y > BOARD_HEIGHT - PLAYER_SIZE) {
    return {
      ...state,
      x,
      y: BOARD_HEIGHT - PLAYER_SIZE,
      vx: 0,
      vy: 0,
      status: "gameOver",
    };
  }

  // Flag reached
  const dfx = state.flagX - x;
  const dfy = state.flagY - y;
  if (Math.sqrt(dfx * dfx + dfy * dfy) < 25) {
    return { ...state, x, y, vx, vy, status: "won" };
  }

  return {
    ...state,
    x,
    y,
    vx,
    vy,
    distance: Math.max(state.distance, x),
    cameraX: Math.max(0, x - 200),
  };
}

export function calculateScore(state: StickmanState): number {
  const base = Math.floor(state.distance);
  const winBonus = state.status === "won" ? 500 : 0;
  return base + winBonus;
}

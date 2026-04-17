import type { HillState } from "./types";

export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 400;
export const CAR_WIDTH = 60;
export const CAR_HEIGHT = 30;
export const GRAVITY = 0.35;
export const TERRAIN_STEP = 20;
export const MAX_FUEL = 100;
export const FUEL_CONSUMPTION = 0.05; // per tick

/**
 * Build a fresh run: procedurally generated terrain, fuel topped up,
 * car resting on the ground a few steps in.
 */
export function createInitialState(seed: number): HillState {
  let rng = seed || 1;
  const terrain: number[] = [];
  const count = 2000;
  let height = BOARD_HEIGHT - 100;
  for (let i = 0; i < count; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const noise = (rng / 0x100000000 - 0.5) * 8;
    height += noise;
    // Gentle sine wave overlay
    height += Math.sin(i * 0.02) * 0.5;
    terrain.push(
      Math.max(BOARD_HEIGHT - 250, Math.min(BOARD_HEIGHT - 50, height)),
    );
  }
  return {
    carX: 80,
    carY: terrain[4] - CAR_HEIGHT,
    carVx: 0,
    carVy: 0,
    carAngle: 0,
    carAngularVy: 0,
    throttle: 0,
    fuel: MAX_FUEL,
    fuelConsumed: 0,
    terrain,
    terrainStep: TERRAIN_STEP,
    distance: 0,
    maxDistance: 0,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng,
  };
}

export function setThrottle(state: HillState, throttle: number): HillState {
  if (state.status !== "playing") return state;
  return { ...state, throttle: Math.max(-1, Math.min(1, throttle)) };
}

function terrainHeightAt(state: HillState, x: number): number {
  const idx = Math.floor(x / TERRAIN_STEP);
  if (idx < 0) return state.terrain[0];
  if (idx >= state.terrain.length - 1)
    return state.terrain[state.terrain.length - 1];
  const t = (x - idx * TERRAIN_STEP) / TERRAIN_STEP;
  return state.terrain[idx] * (1 - t) + state.terrain[idx + 1] * t;
}

export { terrainHeightAt };

export function tick(state: HillState, dt: number): HillState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;

  // Fuel
  const fuel =
    state.fuel -
    (state.throttle !== 0 ? FUEL_CONSUMPTION : FUEL_CONSUMPTION * 0.3) *
      frame;
  if (fuel <= 0) return { ...state, fuel: 0, status: "gameOver" };

  // Terrain follow
  const targetY =
    terrainHeightAt(state, state.carX + CAR_WIDTH / 2) - CAR_HEIGHT;
  const heightLeft = terrainHeightAt(state, state.carX);
  const heightRight = terrainHeightAt(state, state.carX + CAR_WIDTH);
  const targetAngle = Math.atan2(heightRight - heightLeft, CAR_WIDTH);

  // Throttle → forward force (angle-corrected)
  const thrust = state.throttle * 0.4;
  let carVx = state.carVx + Math.cos(state.carAngle) * thrust * frame;
  let carVy = state.carVy + Math.sin(state.carAngle) * thrust * frame;

  // Gravity
  carVy += GRAVITY * frame;

  // Apply velocity
  let carX = state.carX + carVx * frame;
  let carY = state.carY + carVy * frame;

  // Ground constraint
  if (carY > targetY) {
    carY = targetY;
    carVy = 0;
    // Rolling friction
    carVx *= 0.98;
  }

  // Angle: spring toward target
  const carAngle = state.carAngle + state.carAngularVy * frame;
  const angleDiff = targetAngle - carAngle;
  const carAngularVy =
    state.carAngularVy +
    angleDiff * 0.2 * frame -
    state.carAngularVy * 0.15 * frame;

  // Flip → death (car upside down)
  if (Math.abs(carAngle) > Math.PI * 0.7) {
    return {
      ...state,
      carX,
      carY,
      carVx,
      carVy,
      carAngle,
      carAngularVy,
      fuel,
      status: "gameOver",
    };
  }

  const distance = Math.max(state.distance, carX);

  return {
    ...state,
    carX,
    carY,
    carVx,
    carVy,
    carAngle,
    carAngularVy,
    fuel,
    fuelConsumed: state.fuelConsumed + FUEL_CONSUMPTION,
    distance,
    maxDistance: Math.max(state.maxDistance, distance),
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: HillState): number {
  return Math.floor(state.distance / 5);
}

import type { Coin, Hazard, HazardType, JetpackState } from "./types";

export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 500;
export const CEILING_Y = 40;
export const FLOOR_Y = BOARD_HEIGHT - 40;
export const PLAYER_X = 150;
export const PLAYER_RADIUS = 18;
export const GRAVITY = 0.5;
export const THRUST = -0.8;
export const MAX_VY = 10;
export const INITIAL_SPEED = 4;

export function createInitialState(seed: number): JetpackState {
  let rng = seed || 1;
  const hazards: Hazard[] = [];
  const coins: Coin[] = [];
  let x = BOARD_WIDTH + 200;
  for (let i = 0; i < 40; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const isHazard = rng / 0x100000000 < 0.5;
    if (isHazard) {
      rng = Math.imul(rng, 2654435761) >>> 0;
      const r = rng / 0x100000000;
      const type: HazardType =
        r < 0.5 ? "laser-h" : r < 0.85 ? "laser-v" : "missile";
      rng = Math.imul(rng, 2654435761) >>> 0;
      const y =
        CEILING_Y + (rng / 0x100000000) * (FLOOR_Y - CEILING_Y - 100);
      hazards.push({
        x,
        y,
        width: type === "laser-v" ? 10 : 140,
        height: type === "laser-h" ? 10 : 100,
        type,
      });
    } else {
      rng = Math.imul(rng, 2654435761) >>> 0;
      const y =
        CEILING_Y + (rng / 0x100000000) * (FLOOR_Y - CEILING_Y - 40);
      // 3 coin row
      for (let k = 0; k < 3; k++)
        coins.push({ x: x + k * 30, y, collected: false });
    }
    rng = Math.imul(rng, 2654435761) >>> 0;
    x += 160 + (rng / 0x100000000) * 150;
  }
  return {
    playerY: BOARD_HEIGHT / 2,
    playerVy: 0,
    thrusting: false,
    hazards,
    coins,
    distance: 0,
    coinsCollected: 0,
    speed: INITIAL_SPEED,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng,
  };
}

export function setThrust(state: JetpackState, on: boolean): JetpackState {
  if (state.status !== "playing") return state;
  return { ...state, thrusting: on };
}

export function tick(state: JetpackState, dt: number): JetpackState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  let vy = state.playerVy + (state.thrusting ? THRUST : GRAVITY) * frame;
  vy = Math.max(-MAX_VY, Math.min(MAX_VY, vy));
  let y = state.playerY + vy * frame;
  if (y < CEILING_Y + PLAYER_RADIUS) {
    y = CEILING_Y + PLAYER_RADIUS;
    vy = 0;
  }
  if (y > FLOOR_Y - PLAYER_RADIUS) {
    y = FLOOR_Y - PLAYER_RADIUS;
    vy = 0;
  }

  const hazards = state.hazards
    .map((h) => ({ ...h, x: h.x - state.speed * frame }))
    .filter((h) => h.x > -200);
  const coins = state.coins
    .map((c) => ({ ...c, x: c.x - state.speed * frame }))
    .filter((c) => c.x > -50);

  // Collision: hazards
  for (const h of hazards) {
    if (
      PLAYER_X + PLAYER_RADIUS > h.x &&
      PLAYER_X - PLAYER_RADIUS < h.x + h.width
    ) {
      if (y + PLAYER_RADIUS > h.y && y - PLAYER_RADIUS < h.y + h.height) {
        return { ...state, playerY: y, playerVy: vy, status: "gameOver" };
      }
    }
  }

  // Collect coins
  let coinsCollected = state.coinsCollected;
  for (const c of coins) {
    if (!c.collected) {
      const dx = c.x - PLAYER_X;
      const dy = c.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_RADIUS + 10) {
        c.collected = true;
        coinsCollected++;
      }
    }
  }

  return {
    ...state,
    playerY: y,
    playerVy: vy,
    hazards,
    coins,
    coinsCollected,
    distance: state.distance + state.speed * frame,
    speed: state.speed + 0.0005 * dt,
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: JetpackState): number {
  return Math.floor(state.distance / 5) + state.coinsCollected * 50;
}

import type { GeometryState, Obstacle, ObstacleType } from "./types";

export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 400;
export const PLAYER_SIZE = 30;
export const GROUND_Y = 340;
export const GRAVITY = 0.8;
export const JUMP_VELOCITY = -12;
export const INITIAL_SPEED = 5;
export const SPEED_INCREMENT_PER_SEC = 0.08;

export function createInitialState(seed: number): GeometryState {
  let rng = seed || 1;
  const obstacles: Obstacle[] = [];
  let x = BOARD_WIDTH + 200;
  for (let i = 0; i < 30; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const r = rng / 0x100000000;
    const type: ObstacleType = r < 0.5 ? "spike" : r < 0.85 ? "block" : "gap";
    rng = Math.imul(rng, 2654435761) >>> 0;
    const height = 30 + (rng / 0x100000000) * 40;
    obstacles.push({ x, type, height });
    rng = Math.imul(rng, 2654435761) >>> 0;
    x += 150 + (rng / 0x100000000) * 200;
  }
  return {
    playerX: 100,
    playerY: GROUND_Y - PLAYER_SIZE,
    playerVy: 0,
    groundY: GROUND_Y,
    obstacles,
    distance: 0,
    speed: INITIAL_SPEED,
    isOnGround: true,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng,
  };
}

export function jump(state: GeometryState): GeometryState {
  if (state.status !== "playing") return state;
  if (!state.isOnGround) return state;
  return { ...state, playerVy: JUMP_VELOCITY, isOnGround: false };
}

export function tick(state: GeometryState, dt: number): GeometryState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  let playerY = state.playerY + state.playerVy * frame;
  let playerVy = state.playerVy + GRAVITY * frame;
  let isOnGround = false;

  if (playerY >= state.groundY - PLAYER_SIZE) {
    playerY = state.groundY - PLAYER_SIZE;
    playerVy = 0;
    isOnGround = true;
  }

  // Move obstacles left
  const obstacles = state.obstacles
    .map((o) => ({ ...o, x: o.x - state.speed * frame }))
    .filter((o) => o.x > -100);

  // Collision check
  for (const ob of obstacles) {
    if (ob.x < state.playerX + PLAYER_SIZE && ob.x + 40 > state.playerX) {
      if (ob.type === "spike") {
        if (playerY + PLAYER_SIZE > state.groundY - ob.height) {
          return { ...state, playerY, playerVy, status: "gameOver" };
        }
      }
      if (ob.type === "block") {
        if (playerY + PLAYER_SIZE > state.groundY - ob.height && !isOnGround) {
          // Side hit
          if (playerY + PLAYER_SIZE > state.groundY - ob.height + 10) {
            return { ...state, playerY, playerVy, status: "gameOver" };
          }
          // Land on top
          playerY = state.groundY - ob.height - PLAYER_SIZE;
          playerVy = 0;
          isOnGround = true;
        }
      }
      if (ob.type === "gap" && isOnGround) {
        if (state.playerX + PLAYER_SIZE > ob.x && state.playerX < ob.x + 80) {
          return { ...state, playerY, playerVy, status: "gameOver" };
        }
      }
    }
  }

  const newSpeed = state.speed + SPEED_INCREMENT_PER_SEC * (dt / 1000);

  return {
    ...state,
    playerY,
    playerVy,
    obstacles,
    isOnGround,
    speed: newSpeed,
    distance: state.distance + state.speed * frame,
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: GeometryState): number {
  return Math.floor(state.distance / 10);
}

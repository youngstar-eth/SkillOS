import type { CrossyState, Log, Row, RowType, Vehicle } from "./types";

export const TILE = 48;
export const COLS = 9;
export const BOARD_WIDTH = TILE * COLS;
export const BOARD_HEIGHT = TILE * 11;
export const ROW_SPAWN_AHEAD = 20;
export const SAFE_ROWS_START = 3;

export function createInitialState(seed: number): CrossyState {
  let rng = seed || 1;
  const rows: Row[] = [];
  for (let i = 0; i < SAFE_ROWS_START; i++) {
    rows.push({ y: i, type: "grass" });
  }
  for (let i = SAFE_ROWS_START; i < ROW_SPAWN_AHEAD; i++) {
    rng = Math.imul(rng, 2654435761) >>> 0;
    const r = rng / 0x100000000;
    const type: RowType = r < 0.45 ? "road" : r < 0.75 ? "water" : "grass";
    if (type === "road") {
      rng = Math.imul(rng, 2654435761) >>> 0;
      const dir: 1 | -1 = (rng & 1) ? 1 : -1;
      rng = Math.imul(rng, 2654435761) >>> 0;
      const speed = (0.8 + (rng / 0x100000000) * 1.6) * dir;
      const vehicles: Vehicle[] = [];
      let vx = dir > 0 ? -200 : BOARD_WIDTH + 100;
      for (let k = 0; k < 3; k++) {
        rng = Math.imul(rng, 2654435761) >>> 0;
        const width = TILE * (1 + Math.floor((rng / 0x100000000) * 2));
        vehicles.push({ x: vx, width, speed });
        vx += (width + TILE * 2.5) * dir;
      }
      rows.push({ y: i, type, vehicles, speed, direction: dir });
    } else if (type === "water") {
      rng = Math.imul(rng, 2654435761) >>> 0;
      const dir: 1 | -1 = (rng & 1) ? 1 : -1;
      rng = Math.imul(rng, 2654435761) >>> 0;
      const speed = (0.5 + (rng / 0x100000000) * 1.0) * dir;
      const logs: Log[] = [];
      let lx = 0;
      for (let k = 0; k < 3; k++) {
        rng = Math.imul(rng, 2654435761) >>> 0;
        const width = TILE * (2 + Math.floor((rng / 0x100000000) * 2));
        logs.push({ x: lx, width, speed });
        lx += width + TILE * 2;
      }
      rows.push({ y: i, type, logs, speed, direction: dir });
    } else {
      rows.push({ y: i, type: "grass" });
    }
  }
  return {
    player: { x: Math.floor(COLS / 2) * TILE, y: 0 },
    rows,
    cameraY: 0,
    maxY: 0,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng,
  };
}

export function move(
  state: CrossyState,
  dir: "up" | "down" | "left" | "right",
): CrossyState {
  if (state.status !== "playing") return state;
  let { x, y } = state.player;
  if (dir === "up") y++;
  if (dir === "down" && y > 0) y--;
  if (dir === "left" && x > 0) x -= TILE;
  if (dir === "right" && x < (COLS - 1) * TILE) x += TILE;
  const newState: CrossyState = {
    ...state,
    player: { x, y },
    maxY: Math.max(state.maxY, y),
  };
  return newState;
}

export function tick(state: CrossyState, dt: number): CrossyState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  const rows = state.rows.map((r) => {
    if (r.vehicles) {
      return {
        ...r,
        vehicles: r.vehicles.map((v) => {
          let newX = v.x + (v.speed * frame * TILE) / 10;
          if (v.speed > 0 && newX > BOARD_WIDTH + 200) newX = -v.width - 50;
          if (v.speed < 0 && newX < -v.width - 200) newX = BOARD_WIDTH + 50;
          return { ...v, x: newX };
        }),
      };
    }
    if (r.logs) {
      return {
        ...r,
        logs: r.logs.map((l) => {
          let newX = l.x + (l.speed * frame * TILE) / 10;
          if (l.speed > 0 && newX > BOARD_WIDTH + 100) newX = -l.width - 50;
          if (l.speed < 0 && newX < -l.width - 100) newX = BOARD_WIDTH + 50;
          return { ...l, x: newX };
        }),
      };
    }
    return r;
  });

  // Player on log?
  const playerRow = rows.find((r) => r.y === state.player.y);
  let playerX = state.player.x;
  let onLog: Log | null = null;
  if (playerRow?.type === "water" && playerRow.logs) {
    const px = state.player.x + TILE / 2;
    for (const log of playerRow.logs) {
      if (px >= log.x && px <= log.x + log.width) {
        onLog = log;
        playerX += (log.speed * frame * TILE) / 10;
        break;
      }
    }
    if (!onLog) return { ...state, rows, status: "gameOver" };
    if (playerX < 0 || playerX > BOARD_WIDTH - TILE) {
      return { ...state, rows, status: "gameOver" };
    }
  }

  // Collision with vehicle
  if (playerRow?.type === "road" && playerRow.vehicles) {
    const px = state.player.x;
    for (const v of playerRow.vehicles) {
      if (px + TILE > v.x && px < v.x + v.width) {
        return { ...state, rows, status: "gameOver" };
      }
    }
  }

  return {
    ...state,
    rows,
    player: { ...state.player, x: playerX, onLog },
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: CrossyState): number {
  return state.maxY * 10;
}

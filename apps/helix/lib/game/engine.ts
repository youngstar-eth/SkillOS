import type {
  HelixState,
  Platform,
  Segment,
  SegmentType,
} from "./types";

export const BALL_RADIUS = 16;
export const CYLINDER_RADIUS = 100;
export const PLATFORM_THICKNESS = 24;
export const PLATFORM_SPACING = 120;
export const GRAVITY = 0.4;
export const BOUNCE_VELOCITY = -11;
export const TERMINAL_VELOCITY = 15;
export const PLATFORM_COUNT = 50;

const TAU = Math.PI * 2;

/** Fowler-ish hash step for deterministic platform generation. */
function nextRng(n: number): number {
  return (Math.imul(n || 1, 2654435761) >>> 0) || 1;
}

function generatePlatform(y: number, seedOffset: number): Platform {
  // 6 sectors (60° each). 1 gap, 0-1 danger, rest normal.
  const segments: Segment[] = [];
  const sectorCount = 6;
  const sectorSize = TAU / sectorCount;
  let rng = seedOffset || 1;
  const gapSector = Math.abs(rng % sectorCount);
  rng = nextRng(rng);
  const dangerSector = Math.abs(rng % sectorCount);
  for (let i = 0; i < sectorCount; i++) {
    let type: SegmentType = "normal";
    if (i === gapSector) type = "gap";
    else if (i === dangerSector && i !== gapSector) type = "danger";
    segments.push({
      startAngle: i * sectorSize,
      endAngle: (i + 1) * sectorSize,
      type,
    });
  }
  return { y, segments, passed: false };
}

export function createInitialState(seed: number): HelixState {
  let rng = seed || 1;
  const platforms: Platform[] = [];
  for (let i = 0; i < PLATFORM_COUNT; i++) {
    platforms.push(
      generatePlatform(i * PLATFORM_SPACING + PLATFORM_SPACING, rng),
    );
    rng = nextRng(rng);
  }
  return {
    ballY: 0,
    ballVy: 0,
    cylinderRotation: 0,
    platforms,
    score: 0,
    combo: 0,
    elapsedMs: 0,
    status: "playing",
    seed,
    rng,
  };
}

export function rotateCylinder(state: HelixState, delta: number): HelixState {
  if (state.status !== "playing") return state;
  return { ...state, cylinderRotation: state.cylinderRotation + delta };
}

export function tick(state: HelixState, dt: number): HelixState {
  if (state.status !== "playing") return state;
  const frame = Math.min(dt, 50) / 16.67;
  let ballY = state.ballY + state.ballVy * frame;
  let ballVy = Math.min(
    TERMINAL_VELOCITY,
    state.ballVy + GRAVITY * frame,
  );
  let score = state.score;
  let combo = state.combo;
  let status: HelixState["status"] = state.status;

  const platforms = state.platforms.map((p) => ({ ...p }));
  for (const platform of platforms) {
    const relY = platform.y - ballY;
    if (
      relY > -PLATFORM_THICKNESS &&
      relY < BALL_RADIUS &&
      ballVy > 0
    ) {
      // Find the segment the ball is currently over.
      const ballAngle = ((state.cylinderRotation % TAU) + TAU) % TAU;
      let hitSegment: Segment | undefined;
      for (const seg of platform.segments) {
        if (ballAngle >= seg.startAngle && ballAngle < seg.endAngle) {
          hitSegment = seg;
          break;
        }
      }

      if (!hitSegment || hitSegment.type === "gap") {
        // Falls through a gap.
        if (!platform.passed) {
          platform.passed = true;
          score++;
          combo++;
        }
      } else if (hitSegment.type === "danger") {
        // Combo < 3 → game over. Perfect-chain breaks through.
        if (combo < 3) {
          return {
            ...state,
            ballY: platform.y,
            ballVy: 0,
            status: "gameOver",
            score,
            combo,
            platforms,
            elapsedMs: state.elapsedMs + dt,
          };
        }
        if (!platform.passed) {
          platform.passed = true;
          score++;
          combo++;
        }
      } else {
        // Normal → bounce.
        ballY = platform.y - BALL_RADIUS;
        ballVy = BOUNCE_VELOCITY;
        combo = 0;
        break;
      }
    }
  }

  return {
    ...state,
    ballY,
    ballVy,
    platforms,
    score,
    combo,
    status,
    elapsedMs: state.elapsedMs + dt,
  };
}

export function calculateScore(state: HelixState): number {
  return Math.max(0, state.score * 10);
}

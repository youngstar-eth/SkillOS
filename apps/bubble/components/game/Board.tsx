"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BUBBLE_RADIUS,
  GAME_OVER_Y,
  SHOOTER_X,
  SHOOTER_Y,
} from "@/lib/game/engine";
import type { BubbleColor, BubbleState } from "@/lib/game/types";

interface BoardProps {
  state: BubbleState;
  /** Board-virtual pointer X, Y — called on move. */
  onPointer: (x: number, y: number) => void;
  /** Click / tap-up → shoot. */
  onShoot: () => void;
}

// Keep in sync with globals.css token values so gradient centers look right.
const BUBBLE_RGB: Record<BubbleColor, [number, number, number]> = {
  red: [255, 120, 130],
  pink: [255, 160, 200],
  yellow: [255, 215, 100],
  blue: [130, 180, 255],
  purple: [190, 140, 240],
  teal: [130, 220, 200],
};

function darken([r, g, b]: readonly [number, number, number], amt = 0.3) {
  const f = 1 - amt;
  return `rgb(${Math.floor(r * f)}, ${Math.floor(g * f)}, ${Math.floor(b * f)})`;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: BubbleColor,
) {
  const rgb = BUBBLE_RGB[color];
  const grad = ctx.createRadialGradient(
    x - BUBBLE_RADIUS * 0.35,
    y - BUBBLE_RADIUS * 0.35,
    2,
    x,
    y,
    BUBBLE_RADIUS,
  );
  grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  grad.addColorStop(0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.95)`);
  grad.addColorStop(1, darken(rgb, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, BUBBLE_RADIUS - 1, 0, Math.PI * 2);
  ctx.fill();
  // Subtle outer ring for crisp silhouette against the soft pink bg.
  ctx.strokeStyle = `rgba(${Math.floor(rgb[0] * 0.7)}, ${Math.floor(rgb[1] * 0.7)}, ${Math.floor(rgb[2] * 0.7)}, 0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Trace the aim line including one wall bounce for nicer targeting. */
function drawAimLine(
  ctx: CanvasRenderingContext2D,
  angle: number,
  state: BubbleState,
) {
  let x = SHOOTER_X;
  let y = SHOOTER_Y;
  let vx = Math.sin(angle);
  let vy = -Math.cos(angle);
  const STEP = 10;
  let bounces = 0;
  const MAX_BOUNCES = 1;
  const maxSteps = 140;
  ctx.strokeStyle = "rgba(255, 100, 150, 0.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < maxSteps; i++) {
    x += vx * STEP;
    y += vy * STEP;
    if (x < BUBBLE_RADIUS || x > BOARD_WIDTH - BUBBLE_RADIUS) {
      vx = -vx;
      bounces++;
      if (bounces > MAX_BOUNCES) break;
    }
    if (y < BUBBLE_RADIUS) break;
    // Stop at first intersection with a bubble.
    let hit = false;
    for (const b of state.grid.values()) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 < (BUBBLE_RADIUS * 2 - 2) ** 2) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function Board({ state, onPointer, onShoot }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Danger-line haze near the bottom.
    const dangerGrad = ctx.createLinearGradient(
      0,
      GAME_OVER_Y - 40,
      0,
      GAME_OVER_Y,
    );
    dangerGrad.addColorStop(0, "rgba(255, 100, 150, 0)");
    dangerGrad.addColorStop(1, "rgba(255, 100, 150, 0.12)");
    ctx.fillStyle = dangerGrad;
    ctx.fillRect(0, GAME_OVER_Y - 40, BOARD_WIDTH, 40);
    ctx.strokeStyle = "rgba(255, 100, 150, 0.35)";
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GAME_OVER_Y);
    ctx.lineTo(BOARD_WIDTH, GAME_OVER_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid bubbles
    for (const b of state.grid.values()) {
      drawBubble(ctx, b.x, b.y, b.color);
    }

    // Aim line (only while aiming).
    if (state.status === "aiming") {
      drawAimLine(ctx, state.aimAngle, state);
    }

    // Shooter — current + next (on-deck to the left).
    // On-deck is slightly smaller and translucent.
    ctx.save();
    ctx.globalAlpha = 0.7;
    const nx = SHOOTER_X - BUBBLE_RADIUS * 2.4;
    const ny = SHOOTER_Y;
    const nr = BUBBLE_RADIUS * 0.75;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.scale(nr / BUBBLE_RADIUS, nr / BUBBLE_RADIUS);
    drawBubble(ctx, 0, 0, state.nextShooterColor);
    ctx.restore();
    ctx.restore();

    // Active shooter.
    drawBubble(ctx, SHOOTER_X, SHOOTER_Y, state.currentShooterColor);
    // Cannon indicator — rotated rectangle pointing along aimAngle.
    ctx.save();
    ctx.translate(SHOOTER_X, SHOOTER_Y);
    ctx.rotate(state.aimAngle);
    ctx.fillStyle = "rgba(30, 30, 45, 0.25)";
    ctx.fillRect(-2, -BUBBLE_RADIUS - 10, 4, 10);
    ctx.restore();

    // Flying bubble
    if (state.flying) {
      drawBubble(ctx, state.flying.x, state.flying.y, state.flying.color);
    }
  }, [state]);

  const handleMove = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scaleX = BOARD_WIDTH / rect.width;
    const scaleY = BOARD_HEIGHT / rect.height;
    onPointer((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };

  return (
    <div
      className="bubble-board mx-auto w-full"
      style={{
        aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`,
        maxWidth: BOARD_WIDTH,
      }}
    >
      <canvas
        ref={canvasRef}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        className="block h-full w-full"
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onTouchMove={(e) => {
          if (e.touches.length) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onClick={() => {
          if (state.status === "aiming") onShoot();
        }}
        onTouchEnd={(e) => {
          if (state.status === "aiming") {
            e.preventDefault();
            onShoot();
          }
        }}
      />
    </div>
  );
}

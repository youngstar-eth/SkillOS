"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  GROUND_Y,
  PLAYER_SIZE,
} from "@/lib/game/engine";
import type { GeometryState } from "@/lib/game/types";

interface BoardProps {
  state: GeometryState;
  onTap: () => void;
  deathFlash?: boolean;
}

function render(ctx: CanvasRenderingContext2D, state: GeometryState) {
  // Black background
  ctx.fillStyle = "rgb(8, 8, 12)";
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // Subtle grid
  ctx.strokeStyle = "rgba(0, 240, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < BOARD_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BOARD_HEIGHT);
    ctx.stroke();
  }

  // Ground line (dashed, broken over gaps)
  ctx.strokeStyle = "rgb(0, 240, 255)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 6]);
  ctx.beginPath();

  const gapRanges: Array<[number, number]> = state.obstacles
    .filter((o) => o.type === "gap")
    .map((o) => [o.x, o.x + 80]);

  let penX = 0;
  ctx.moveTo(0, GROUND_Y);
  for (const [gx0, gx1] of gapRanges.sort((a, b) => a[0] - b[0])) {
    if (gx1 < 0 || gx0 > BOARD_WIDTH) continue;
    ctx.lineTo(Math.max(penX, gx0), GROUND_Y);
    ctx.moveTo(Math.min(BOARD_WIDTH, gx1), GROUND_Y);
    penX = gx1;
  }
  ctx.lineTo(BOARD_WIDTH, GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pit under gaps
  for (const [gx0, gx1] of gapRanges) {
    ctx.fillStyle = "rgba(255, 0, 180, 0.15)";
    ctx.fillRect(gx0, GROUND_Y, gx1 - gx0, BOARD_HEIGHT - GROUND_Y);
  }

  // Obstacles
  for (const ob of state.obstacles) {
    if (ob.x < -50 || ob.x > BOARD_WIDTH + 50) continue;
    if (ob.type === "spike") {
      ctx.fillStyle = "rgb(255, 60, 60)";
      ctx.beginPath();
      ctx.moveTo(ob.x, GROUND_Y);
      ctx.lineTo(ob.x + 20, GROUND_Y - ob.height);
      ctx.lineTo(ob.x + 40, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (ob.type === "block") {
      const top = GROUND_Y - ob.height;
      // magenta→purple gradient
      const grad = ctx.createLinearGradient(ob.x, top, ob.x, GROUND_Y);
      grad.addColorStop(0, "rgb(255, 0, 180)");
      grad.addColorStop(1, "rgb(120, 0, 200)");
      ctx.fillStyle = grad;
      ctx.fillRect(ob.x, top, 40, ob.height);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ob.x + 0.5, top + 0.5, 39, ob.height - 1);
    }
  }

  // Player — cyan square, rotates while airborne
  ctx.save();
  const cx = state.playerX + PLAYER_SIZE / 2;
  const cy = state.playerY + PLAYER_SIZE / 2;
  ctx.translate(cx, cy);
  if (!state.isOnGround) {
    const rotation = (state.distance * 0.05) % (Math.PI * 2);
    ctx.rotate(rotation);
  }
  ctx.fillStyle = "rgb(0, 240, 255)";
  ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
  ctx.strokeStyle = "rgb(255, 255, 255)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
  // Inner eye square
  ctx.fillStyle = "rgb(8, 8, 12)";
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();

  // Death glitch overlay
  if (state.status === "gameOver") {
    ctx.fillStyle = "rgba(255, 0, 180, 0.15)";
    ctx.fillRect(-4, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.fillStyle = "rgba(0, 240, 255, 0.15)";
    ctx.fillRect(4, 0, BOARD_WIDTH, BOARD_HEIGHT);
    // Scanlines
    for (let y = 0; y < BOARD_HEIGHT; y += 4) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(0, y, BOARD_WIDTH, 1);
    }
  }
}

export function Board({ state, onTap, deathFlash }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    render(ctx, state);
  }, [state]);

  return (
    <div
      className={deathFlash ? "death-glitch" : undefined}
      style={{ width: "100%", maxWidth: BOARD_WIDTH }}
    >
      <canvas
        ref={canvasRef}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        onMouseDown={onTap}
        onTouchStart={(e) => {
          e.preventDefault();
          onTap();
        }}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          border: "1px solid rgba(0, 240, 255, 0.4)",
          background: "rgb(8, 8, 12)",
          imageRendering: "pixelated",
          cursor: "pointer",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  POCKETS,
} from "@/lib/game/engine";
import type { PoolState } from "@/lib/game/types";

interface BoardProps {
  state: PoolState;
  onPointerDown?: (p: { x: number; y: number }) => void;
  onPointerMove?: (p: { x: number; y: number }) => void;
  onPointerUp?: (p: { x: number; y: number }) => void;
}

const RAIL = 20;

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const grad = ctx.createRadialGradient(x - r / 3, y - r / 3, r / 8, x, y, r);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.stroke();
}

export function Board({
  state,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== BOARD_WIDTH * dpr) {
      canvas.width = BOARD_WIDTH * dpr;
      canvas.height = BOARD_HEIGHT * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Wooden rail border
    ctx.fillStyle = "rgb(90, 60, 30)";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    // Gold inner line
    ctx.strokeStyle = "rgba(200,170,100,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, BOARD_WIDTH - 8, BOARD_HEIGHT - 8);

    // Felt playing area
    const feltGrad = ctx.createLinearGradient(0, RAIL, 0, BOARD_HEIGHT - RAIL);
    feltGrad.addColorStop(0, "rgb(40, 110, 70)");
    feltGrad.addColorStop(1, "rgb(22, 75, 45)");
    ctx.fillStyle = feltGrad;
    ctx.fillRect(
      RAIL,
      RAIL,
      BOARD_WIDTH - RAIL * 2,
      BOARD_HEIGHT - RAIL * 2,
    );

    // Pockets
    for (const p of POCKETS) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(10, 10, 10)";
      ctx.fill();
      ctx.strokeStyle = "rgba(200,170,100,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Balls
    for (const b of state.balls) {
      if (b.pocketed) continue;
      drawBall(ctx, b.x, b.y, b.radius, b.color);
      if (!b.isCue) {
        // Ball number bubble
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgb(30,30,30)";
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(b.id), b.x, b.y + 0.5);
      }
    }

    // Aim line
    if (state.status === "aiming") {
      const cue = state.balls.find((b) => b.isCue && !b.pocketed);
      if (cue) {
        const len = 60 + state.aimPower * 120;
        const tx = cue.x + Math.cos(state.aimAngle) * len;
        const ty = cue.y + Math.sin(state.aimAngle) * len;
        ctx.save();
        ctx.strokeStyle = "rgba(235,225,200,0.8)";
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        // Arrowhead
        ctx.fillStyle = "rgba(200,170,100,0.9)";
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [state]);

  function relativePoint(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT;
    return { x, y };
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label="pool table"
      className="gold-border rounded-md"
      style={{
        width: "min(95vw, 800px)",
        aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`,
        touchAction: "none",
        cursor: state.status === "aiming" ? "crosshair" : "default",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPointerDown?.(relativePoint(e));
      }}
      onPointerMove={(e) => onPointerMove?.(relativePoint(e))}
      onPointerUp={(e) => onPointerUp?.(relativePoint(e))}
    />
  );
}

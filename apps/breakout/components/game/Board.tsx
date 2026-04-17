"use client";

import { useEffect, useRef } from "react";
import {
  BALL_RADIUS,
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PADDLE_HEIGHT,
} from "@/lib/game/engine";
import type { BlockColor, BreakoutState } from "@/lib/game/types";

interface BoardProps {
  state: BreakoutState;
  /** Called with board-virtual X whenever the cursor/touch moves. */
  onPointer: (x: number) => void;
  /** Called on click / tap / keypress to launch a ready ball. */
  onLaunch: () => void;
}

/** Color lookup for block fill + glow. Kept in sync with globals.css tokens. */
const BLOCK_RGB: Record<BlockColor, [number, number, number]> = {
  pink: [255, 61, 139],
  purple: [170, 84, 255],
  cyan: [82, 174, 255],
  yellow: [255, 210, 80],
};

const TRAIL_LEN = 6;

export function Board({ state, onPointer, onLaunch }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Blocks
    for (const b of state.blocks) {
      if (b.destroyed) continue;
      const [r, g, bl] = BLOCK_RGB[b.color];
      const fade = b.hits / b.maxHits; // dim slightly as block degrades
      const alpha = 0.55 + 0.45 * fade;
      ctx.shadowColor = `rgba(${r}, ${g}, ${bl}, 0.75)`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
      ctx.fillRect(b.x, b.y, b.width, b.height);
      // Tiny inner highlight bar
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * fade})`;
      ctx.fillRect(b.x + 2, b.y + 2, BLOCK_WIDTH - 4, 2);
    }
    ctx.shadowBlur = 0;

    // Paddle — cyan neon bar
    ctx.shadowColor = "rgba(82, 174, 255, 0.85)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgb(82, 174, 255)";
    ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, PADDLE_HEIGHT);
    ctx.shadowBlur = 0;
    // Glossy highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(state.paddle.x + 4, state.paddle.y + 2, state.paddle.width - 8, 2);

    // Ball trail — older positions fade out and shrink.
    if (state.status === "playing") {
      trailRef.current.push({ x: state.ball.x, y: state.ball.y });
      if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();
    } else if (state.status === "ready") {
      trailRef.current.length = 0;
    }
    trailRef.current.forEach((p, i) => {
      const t = (i + 1) / trailRef.current.length;
      ctx.fillStyle = `rgba(255, 61, 139, ${t * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_RADIUS * t * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ball — white core with pink glow
    ctx.shadowColor = "rgba(255, 61, 139, 0.95)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [state]);

  const handleMove = (clientX: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = BOARD_WIDTH / rect.width;
    onPointer((clientX - rect.left) * scale);
  };

  return (
    <div
      className="breakout-board mx-auto w-full"
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
        onMouseMove={(e) => handleMove(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches.length) handleMove(e.touches[0].clientX);
        }}
        onClick={() => {
          if (state.status === "ready") onLaunch();
        }}
      />
    </div>
  );
}

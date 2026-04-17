"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  BALL_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_X_OFFSET,
} from "@/lib/game/engine";
import type { PongState } from "@/lib/game/types";

export interface BoardHandle {
  /** Convert a pointer clientY on the canvas → board-virtual Y. */
  clientYToBoardY: (clientY: number) => number;
}

interface BoardProps {
  state: PongState;
  /** Called on mouse/touch move over the canvas with a board-virtual Y. */
  onPointer: (boardY: number) => void;
  /** Clear the pointer — return AI to the usual rules when finger lifts. */
  onPointerLeave: () => void;
}

/**
 * Canvas renderer for the pong board. We always draw in the virtual
 * 800×400 coordinate space and let CSS scale the bitmap — so collision
 * math (in the engine) is resolution-independent.
 */
export const Board = forwardRef<BoardHandle, BoardProps>(function Board(
  { state, onPointer, onPointerLeave },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      clientYToBoardY(clientY: number) {
        const el = canvasRef.current;
        if (!el) return BOARD_HEIGHT / 2;
        const rect = el.getBoundingClientRect();
        const scale = BOARD_HEIGHT / rect.height;
        return (clientY - rect.top) * scale;
      },
    }),
    [],
  );

  // Paint on every state change. Cheap — single canvas sweep.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Centre dashed line — retro signature
    ctx.strokeStyle = "rgba(84, 174, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(BOARD_WIDTH / 2, 0);
    ctx.lineTo(BOARD_WIDTH / 2, BOARD_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddles — blue with soft glow
    ctx.shadowColor = "rgba(84, 174, 255, 0.6)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#e6edf3";
    ctx.fillRect(
      PADDLE_X_OFFSET,
      state.playerPaddle.y,
      PADDLE_WIDTH,
      PADDLE_HEIGHT,
    );
    ctx.fillRect(
      BOARD_WIDTH - PADDLE_X_OFFSET - PADDLE_WIDTH,
      state.aiPaddle.y,
      PADDLE_WIDTH,
      PADDLE_HEIGHT,
    );

    // Ball — pink glow for contrast against blue paddles
    ctx.shadowColor = "rgba(255, 0, 149, 0.8)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff0095";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [state]);

  // Pointer → board-Y translation.
  const handleMove = (clientY: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = BOARD_HEIGHT / rect.height;
    onPointer((clientY - rect.top) * scale);
  };

  return (
    <div
      className="pong-board mx-auto w-full"
      style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`, maxWidth: BOARD_WIDTH }}
    >
      <canvas
        ref={canvasRef}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        className="block h-full w-full"
        onMouseMove={(e) => handleMove(e.clientY)}
        onTouchMove={(e) => {
          if (e.touches.length) handleMove(e.touches[0].clientY);
        }}
        onMouseLeave={onPointerLeave}
        onTouchEnd={onPointerLeave}
      />
    </div>
  );
});

"use client";

import { useEffect, useRef } from "react";
import { BOARD_SIZE } from "@/lib/game/engine";
import type { SnakeState } from "@/lib/game/types";

interface BoardProps {
  state: SnakeState;
  cellSize: number;
}

/**
 * Canvas renderer — snake game at 60fps would be overkill for React DOM,
 * and Canvas gives us trivial pulse/glow effects via globalAlpha/shadow.
 * The canvas is re-painted whenever `state` changes (once per tick).
 */
export function Board({ state, cellSize }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Grow a small counter so food pulsing is always animating even between ticks.
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = BOARD_SIZE * cellSize;

    const draw = () => {
      frameRef.current += 1;
      ctx.clearRect(0, 0, w, w);

      // Grid lines — very subtle so they don't fight the scanline overlay.
      ctx.strokeStyle = "rgba(175, 229, 221, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= BOARD_SIZE; i++) {
        const p = i * cellSize + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, w);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
        ctx.stroke();
      }

      // Food — hot-pink pulsing dot with glow.
      const [fx, fy] = state.food;
      const pulse = 0.85 + 0.15 * Math.sin(frameRef.current * 0.08);
      const cx = fx * cellSize + cellSize / 2;
      const cy = fy * cellSize + cellSize / 2;
      ctx.shadowColor = "rgba(255, 100, 180, 0.85)";
      ctx.shadowBlur = cellSize * 0.8;
      ctx.fillStyle = "rgb(255, 100, 180)";
      ctx.beginPath();
      ctx.arc(cx, cy, (cellSize / 2 - 2) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Snake — head brightest, body fades back. Teal with a soft glow.
      ctx.shadowColor = "rgba(175, 229, 221, 0.55)";
      ctx.shadowBlur = cellSize * 0.4;
      state.snake.forEach(([x, y], i) => {
        const alpha = i === 0 ? 1 : Math.max(0.35, 1 - i * 0.04);
        ctx.fillStyle = `rgba(175, 229, 221, ${alpha})`;
        ctx.fillRect(
          x * cellSize + 1,
          y * cellSize + 1,
          cellSize - 2,
          cellSize - 2,
        );
      });
      ctx.shadowBlur = 0;

      // Draw two tiny "eyes" on the head so direction reads at a glance.
      if (state.snake.length > 0 && state.status !== "gameOver") {
        const [hx, hy] = state.snake[0];
        const ex = hx * cellSize + cellSize / 2;
        const ey = hy * cellSize + cellSize / 2;
        let dx = 0;
        let dy = 0;
        switch (state.direction) {
          case "up":    dy = -cellSize * 0.2; break;
          case "down":  dy =  cellSize * 0.2; break;
          case "left":  dx = -cellSize * 0.2; break;
          case "right": dx =  cellSize * 0.2; break;
        }
        ctx.fillStyle = "rgba(5, 5, 15, 0.9)";
        const off = cellSize * 0.15;
        ctx.beginPath();
        if (state.direction === "up" || state.direction === "down") {
          ctx.arc(ex - off, ey + dy, cellSize * 0.08, 0, Math.PI * 2);
          ctx.arc(ex + off, ey + dy, cellSize * 0.08, 0, Math.PI * 2);
        } else {
          ctx.arc(ex + dx, ey - off, cellSize * 0.08, 0, Math.PI * 2);
          ctx.arc(ex + dx, ey + off, cellSize * 0.08, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    draw();

    // While playing, keep a rAF loop alive so the food pulse animates smoothly
    // even when no tick has fired. Stop the loop once the game ends.
    let running = state.status === "playing";
    const loop = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    if (running) rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state, cellSize]);

  const side = BOARD_SIZE * cellSize;
  return (
    <canvas
      ref={canvasRef}
      width={side}
      height={side}
      className="rounded-sm border-2 border-accent/60 shadow-[0_0_24px_rgba(175,229,221,0.35)]"
      aria-label="Snake board"
    />
  );
}

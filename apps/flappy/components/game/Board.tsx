"use client";

import { useEffect, useRef } from "react";
import {
  BIRD_RADIUS,
  BIRD_X,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIPE_WIDTH,
} from "@/lib/game/engine";
import type { FlappyState } from "@/lib/game/types";

interface BoardProps {
  state: FlappyState;
}

interface Cloud {
  x: number;
  y: number;
  r: number;
  speed: number;
}

// Pre-seeded cloud layout so SSR and first client paint match.
const CLOUDS: Cloud[] = [
  { x: 60, y: 90, r: 28, speed: 0.15 },
  { x: 230, y: 140, r: 36, speed: 0.1 },
  { x: 340, y: 60, r: 22, speed: 0.2 },
  { x: 120, y: 220, r: 30, speed: 0.08 },
  { x: 300, y: 300, r: 26, speed: 0.12 },
  { x: 40, y: 380, r: 32, speed: 0.09 },
  { x: 260, y: 450, r: 24, speed: 0.14 },
];

export function Board({ state }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      frameRef.current += 1;
      const t = frameRef.current;

      // Pastel gradient sky — top pink, bottom blue.
      const sky = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
      sky.addColorStop(0, "#ffc8e6");
      sky.addColorStop(1, "#c8dcff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      // Drifting cloud layer.
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const cloud of CLOUDS) {
        const cx = ((cloud.x - t * cloud.speed) % (BOARD_WIDTH + 120) + BOARD_WIDTH + 120) %
          (BOARD_WIDTH + 120) - 60;
        drawCloud(ctx, cx, cloud.y, cloud.r);
      }
      ctx.restore();

      // Pipes — rounded gradient from teal-green to pale cyan.
      for (const pipe of state.pipes) {
        const gapTop = pipe.gapY - pipe.gapSize / 2;
        const gapBottom = pipe.gapY + pipe.gapSize / 2;
        drawPipe(ctx, pipe.x, 0, PIPE_WIDTH, gapTop);
        drawPipe(ctx, pipe.x, gapBottom, PIPE_WIDTH, BOARD_HEIGHT - gapBottom - 20);
      }

      // Ground strip.
      ctx.fillStyle = "#b8e0a8";
      ctx.fillRect(0, BOARD_HEIGHT - 20, BOARD_WIDTH, 20);
      ctx.strokeStyle = "#6aaa5a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, BOARD_HEIGHT - 20);
      ctx.lineTo(BOARD_WIDTH, BOARD_HEIGHT - 20);
      ctx.stroke();

      // Bird — yellow circle + white eye + pink beak, with flap tilt.
      drawBird(ctx, BIRD_X, state.birdY, state.birdVy, t);
    };

    draw();
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className="dream-glow rounded-2xl border border-[rgb(var(--color-border))] shadow-lg"
    />
  );
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.8, y + 4, r * 0.9, 0, Math.PI * 2);
  ctx.arc(x - r * 0.8, y + 6, r * 0.75, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.6, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#96DCB4");
  grad.addColorStop(1, "#C8F0DC");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#4a8a6a";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  // Lip to give the pipe its classic top/bottom bulge.
  const lipY = y === 0 ? y + h - 14 : y;
  roundRect(ctx, x - 4, lipY, w + 8, 14, 4);
  ctx.fill();
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vy: number,
  frame: number,
) {
  const tilt = Math.max(-0.4, Math.min(1, vy / 10));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Body.
  ctx.fillStyle = "#ffd28c";
  ctx.strokeStyle = "#c9963f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing — gentle flap offset using the frame counter.
  const flap = Math.sin(frame * 0.3) * 3;
  ctx.fillStyle = "#ffe0b0";
  ctx.beginPath();
  ctx.ellipse(-3, 2 + flap, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye.
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(5, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(6, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak.
  ctx.fillStyle = "#ffa0c8";
  ctx.beginPath();
  ctx.moveTo(BIRD_RADIUS - 2, 0);
  ctx.lineTo(BIRD_RADIUS + 6, -2);
  ctx.lineTo(BIRD_RADIUS + 6, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

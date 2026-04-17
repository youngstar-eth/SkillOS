"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CEILING_Y,
  FLOOR_Y,
  PLAYER_RADIUS,
  PLAYER_X,
} from "@/lib/game/engine";
import type { JetpackState } from "@/lib/game/types";

interface BoardProps {
  state: JetpackState;
}

export function Board({ state }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = state.elapsedMs;

    // Background: deep space gradient
    const bg = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
    bg.addColorStop(0, "#080a19");
    bg.addColorStop(1, "#140528");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Cyber grid (scrolling)
    const grid = 40;
    const offset = (state.distance % grid) - grid;
    ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = offset; x < BOARD_WIDTH; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, CEILING_Y);
      ctx.lineTo(x, FLOOR_Y);
      ctx.stroke();
    }
    for (let y = CEILING_Y; y <= FLOOR_Y; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }

    // Ceiling & floor bars
    ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
    ctx.fillRect(0, 0, BOARD_WIDTH, CEILING_Y);
    ctx.fillRect(0, FLOOR_Y, BOARD_WIDTH, BOARD_HEIGHT - FLOOR_Y);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, CEILING_Y);
    ctx.lineTo(BOARD_WIDTH, CEILING_Y);
    ctx.moveTo(0, FLOOR_Y);
    ctx.lineTo(BOARD_WIDTH, FLOOR_Y);
    ctx.stroke();

    // Hazards
    for (const h of state.hazards) {
      if (h.x > BOARD_WIDTH || h.x + h.width < 0) continue;

      if (h.type === "laser-h") {
        const pulse = 0.5 + 0.5 * Math.sin(t / 120);
        ctx.strokeStyle = `rgba(255, 40, 80, ${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 4 + 2 * pulse;
        ctx.shadowColor = "#ff2850";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y + h.height / 2);
        ctx.lineTo(h.x + h.width, h.y + h.height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (h.type === "laser-v") {
        const pulse = 0.5 + 0.5 * Math.sin(t / 120 + 1);
        ctx.strokeStyle = `rgba(255, 40, 80, ${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 4 + 2 * pulse;
        ctx.shadowColor = "#ff2850";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(h.x + h.width / 2, h.y);
        ctx.lineTo(h.x + h.width / 2, h.y + h.height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // missile — triangle pointing left
        ctx.fillStyle = "#ff2850";
        ctx.shadowColor = "#ff2850";
        ctx.shadowBlur = 10;
        const cx = h.x + h.width / 2;
        const cy = h.y + h.height / 2;
        const w = h.width / 2;
        const hgt = h.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx - w, cy);
        ctx.lineTo(cx + w, cy - hgt);
        ctx.lineTo(cx + w, cy + hgt);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // exhaust
        ctx.fillStyle = `rgba(255, 210, 0, ${0.5 + 0.5 * Math.sin(t / 60)})`;
        ctx.beginPath();
        ctx.moveTo(cx + w, cy);
        ctx.lineTo(cx + w + 18, cy - 6);
        ctx.lineTo(cx + w + 18, cy + 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Coins
    for (const c of state.coins) {
      if (c.collected) continue;
      if (c.x < -20 || c.x > BOARD_WIDTH + 20) continue;
      ctx.fillStyle = "#ffd200";
      ctx.shadowColor = "#ffd200";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#080a19";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", c.x, c.y + 1);
    }

    // Player — humanoid with jetpack
    const px = PLAYER_X;
    const py = state.playerY;

    // Flame (behind body)
    const flameLen = state.thrusting ? 26 + 4 * Math.sin(t / 40) : 10;
    const flameGrad = ctx.createLinearGradient(
      px - 10,
      py + PLAYER_RADIUS,
      px - 10,
      py + PLAYER_RADIUS + flameLen,
    );
    flameGrad.addColorStop(0, "#ffd200");
    flameGrad.addColorStop(0.6, "#ff2850");
    flameGrad.addColorStop(1, "rgba(255, 0, 220, 0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(px - 14, py + PLAYER_RADIUS - 4);
    ctx.lineTo(px - 6, py + PLAYER_RADIUS - 4);
    ctx.lineTo(px - 10, py + PLAYER_RADIUS + flameLen);
    ctx.closePath();
    ctx.fill();

    // Jetpack body (behind player)
    ctx.fillStyle = "#1a1f3a";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.5;
    ctx.fillRect(px - 16, py - 10, 8, 22);
    ctx.strokeRect(px - 16, py - 10, 8, 22);

    // Body
    ctx.fillStyle = "#dcf0ff";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Visor
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.arc(px + 4, py - 3, 6, 0, Math.PI * 2);
    ctx.fill();

    // HUD overlay: distance + coins
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(12, 50, 180, 48);
    ctx.strokeStyle = "#00f0ff";
    ctx.strokeRect(12, 50, 180, 48);
    ctx.fillStyle = "#00f0ff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`DIST  ${Math.floor(state.distance)}m`, 20, 58);
    ctx.fillStyle = "#ffd200";
    ctx.fillText(`COINS ${state.coinsCollected}`, 20, 78);

    if (state.status === "gameOver") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      ctx.fillStyle = "#ff2850";
      ctx.shadowColor = "#ff2850";
      ctx.shadowBlur = 20;
      ctx.font = "bold 48px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GAME OVER", BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
      ctx.shadowBlur = 0;
    }
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className="block w-full max-w-full border border-accent/40 bg-black"
      style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
    />
  );
}

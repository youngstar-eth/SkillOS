"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CAR_HEIGHT,
  CAR_WIDTH,
  TERRAIN_STEP,
} from "@/lib/game/engine";
import type { HillState } from "@/lib/game/types";

interface BoardProps {
  state: HillState;
}

/**
 * Side-view canvas renderer. Camera pans horizontally to keep the car
 * anchored at ~1/3 of the viewport. Terrain, car, exhaust, parallax hills,
 * fuel gauge + distance meter all painted in a single 2D pass.
 */
export function Board({ state }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const exhaustRef = useRef<Array<{ x: number; y: number; age: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Camera offset so the car sits around x = BOARD_WIDTH / 3.
    const cameraX = state.carX - BOARD_WIDTH / 3;

    // --- Sky gradient ---
    const sky = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
    sky.addColorStop(0, "rgb(120 115 90)");
    sky.addColorStop(1, "rgb(80 85 65)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // --- Far parallax hills ---
    ctx.fillStyle = "rgb(60 65 50)";
    ctx.beginPath();
    ctx.moveTo(0, BOARD_HEIGHT);
    for (let x = 0; x <= BOARD_WIDTH; x += 20) {
      const worldX = (cameraX * 0.3 + x) * 0.5;
      const y =
        BOARD_HEIGHT - 180 + Math.sin(worldX * 0.01) * 40 +
        Math.cos(worldX * 0.005) * 20;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(BOARD_WIDTH, BOARD_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // --- Mid silhouettes (factories / smokestacks) ---
    ctx.fillStyle = "rgb(45 50 38)";
    for (let i = 0; i < 10; i++) {
      const worldX = Math.floor(cameraX * 0.5) - 200 + i * 140;
      const screenX = worldX - cameraX * 0.5;
      if (screenX > -80 && screenX < BOARD_WIDTH + 80) {
        const h = 60 + (i % 3) * 20;
        ctx.fillRect(screenX, BOARD_HEIGHT - 120 - h, 50, h);
        ctx.fillRect(screenX + 15, BOARD_HEIGHT - 140 - h, 6, 20); // chimney
      }
    }

    // --- Terrain fill (foreground) ---
    const firstIdx = Math.max(0, Math.floor(cameraX / TERRAIN_STEP) - 2);
    const lastIdx = Math.min(
      state.terrain.length - 1,
      Math.ceil((cameraX + BOARD_WIDTH) / TERRAIN_STEP) + 2,
    );

    ctx.fillStyle = "rgb(70 75 45)";
    ctx.strokeStyle = "rgb(200 110 50)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo((firstIdx * TERRAIN_STEP) - cameraX, BOARD_HEIGHT);
    for (let i = firstIdx; i <= lastIdx; i++) {
      const sx = i * TERRAIN_STEP - cameraX;
      const sy = state.terrain[i];
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo((lastIdx * TERRAIN_STEP) - cameraX, BOARD_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Terrain rim stroke
    ctx.beginPath();
    for (let i = firstIdx; i <= lastIdx; i++) {
      const sx = i * TERRAIN_STEP - cameraX;
      const sy = state.terrain[i];
      if (i === firstIdx) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // --- Exhaust trail ---
    if (state.throttle > 0 && state.status === "playing") {
      exhaustRef.current.push({
        x: state.carX - 6,
        y: state.carY + CAR_HEIGHT / 2,
        age: 0,
      });
    }
    exhaustRef.current = exhaustRef.current
      .map((p) => ({ ...p, age: p.age + 1 }))
      .filter((p) => p.age < 40);

    for (const p of exhaustRef.current) {
      const alpha = Math.max(0, 0.5 - p.age / 80);
      const radius = 3 + p.age * 0.25;
      ctx.fillStyle = `rgba(30, 25, 20, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x - cameraX, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Car (chunky side-view) ---
    const cx = state.carX - cameraX;
    const cy = state.carY;
    ctx.save();
    ctx.translate(cx + CAR_WIDTH / 2, cy + CAR_HEIGHT / 2);
    ctx.rotate(state.carAngle);

    // Chassis
    ctx.fillStyle = "rgb(110 80 50)";
    ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);

    // Cab
    ctx.fillStyle = "rgb(200 110 50)";
    ctx.fillRect(-CAR_WIDTH / 2 + 8, -CAR_HEIGHT / 2 - 10, 22, 12);

    // Brass trim
    ctx.fillStyle = "rgb(220 180 90)";
    ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2 + 2, CAR_WIDTH, 3);
    ctx.fillRect(-CAR_WIDTH / 2, CAR_HEIGHT / 2 - 5, CAR_WIDTH, 3);

    // Rivets
    ctx.fillStyle = "rgb(220 180 90)";
    for (const [rx, ry] of [
      [-CAR_WIDTH / 2 + 4, -CAR_HEIGHT / 2 + 8],
      [CAR_WIDTH / 2 - 6, -CAR_HEIGHT / 2 + 8],
      [-CAR_WIDTH / 2 + 4, CAR_HEIGHT / 2 - 10],
      [CAR_WIDTH / 2 - 6, CAR_HEIGHT / 2 - 10],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wheels
    ctx.fillStyle = "rgb(20 20 15)";
    ctx.beginPath();
    ctx.arc(-CAR_WIDTH / 2 + 12, CAR_HEIGHT / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CAR_WIDTH / 2 - 12, CAR_HEIGHT / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Wheel hubs (brass)
    ctx.fillStyle = "rgb(220 180 90)";
    ctx.beginPath();
    ctx.arc(-CAR_WIDTH / 2 + 12, CAR_HEIGHT / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CAR_WIDTH / 2 - 12, CAR_HEIGHT / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- HUD: Distance meter (top-left) ---
    ctx.fillStyle = "rgba(20, 20, 15, 0.7)";
    ctx.fillRect(12, 12, 160, 40);
    ctx.strokeStyle = "rgb(220 180 90)";
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 160, 40);
    ctx.fillStyle = "rgb(220 210 180)";
    ctx.font = "11px monospace";
    ctx.fillText("DISTANCE", 20, 26);
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "rgb(220 180 90)";
    ctx.fillText(`${Math.floor(state.distance)} m`, 20, 44);

    // --- HUD: Fuel gauge (top-right) ---
    const gaugeX = BOARD_WIDTH - 172;
    ctx.fillStyle = "rgba(20, 20, 15, 0.7)";
    ctx.fillRect(gaugeX, 12, 160, 40);
    ctx.strokeStyle = "rgb(220 180 90)";
    ctx.lineWidth = 2;
    ctx.strokeRect(gaugeX, 12, 160, 40);
    ctx.fillStyle = "rgb(220 210 180)";
    ctx.font = "11px monospace";
    ctx.fillText("FUEL", gaugeX + 8, 26);

    const fuelPct = Math.max(0, Math.min(1, state.fuel / 100));
    const barW = 110 * fuelPct;
    ctx.fillStyle =
      fuelPct < 0.2
        ? "rgb(220 50 30)"
        : fuelPct < 0.5
          ? "rgb(220 180 90)"
          : "rgb(120 160 70)";
    ctx.fillRect(gaugeX + 40, 32, barW, 12);
    ctx.strokeStyle = "rgb(110 80 50)";
    ctx.lineWidth = 1;
    ctx.strokeRect(gaugeX + 40, 32, 110, 12);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className="rivet-border block w-full max-w-full"
      style={{
        imageRendering: "pixelated",
        aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`,
      }}
    />
  );
}

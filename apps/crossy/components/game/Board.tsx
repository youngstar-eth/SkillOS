"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  COLS,
  TILE,
} from "@/lib/game/engine";
import type { CrossyState } from "@/lib/game/types";

// Player is visually fixed near the bottom of the canvas — we scroll the
// world down as the player's logical y increases.
const PLAYER_SCREEN_ROW_FROM_BOTTOM = 2;
const VISIBLE_ROWS = Math.floor(BOARD_HEIGHT / TILE); // 11

interface BoardProps {
  state: CrossyState;
}

export function Board({ state }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Camera: player always PLAYER_SCREEN_ROW_FROM_BOTTOM above the bottom.
    // world y grows UP; screen y grows DOWN. Convert:
    //   screenY(worldY) = (VISIBLE_ROWS - 1 - (worldY - camY)) * TILE
    // where camY = player.y - (VISIBLE_ROWS - 1 - PLAYER_SCREEN_ROW_FROM_BOTTOM)
    const camY = Math.max(
      0,
      state.player.y - (VISIBLE_ROWS - 1 - PLAYER_SCREEN_ROW_FROM_BOTTOM),
    );

    // Clear with sky / bg color
    ctx.fillStyle = "rgb(29, 43, 83)";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Draw rows bottom-up
    for (let screenRow = 0; screenRow < VISIBLE_ROWS; screenRow++) {
      const worldY = camY + (VISIBLE_ROWS - 1 - screenRow);
      const row = state.rows.find((r) => r.y === worldY);
      const yPx = screenRow * TILE;

      if (!row || row.type === "grass") {
        // grass
        ctx.fillStyle = "rgb(0, 135, 81)";
        ctx.fillRect(0, yPx, BOARD_WIDTH, TILE);
        // dotted texture
        ctx.fillStyle = "rgb(0, 107, 64)";
        for (let gx = 4; gx < BOARD_WIDTH; gx += 16) {
          for (let gy = 4; gy < TILE; gy += 16) {
            ctx.fillRect(gx + ((gy / 16) & 1) * 8, yPx + gy, 4, 4);
          }
        }
      } else if (row.type === "road") {
        ctx.fillStyle = "rgb(65, 60, 55)";
        ctx.fillRect(0, yPx, BOARD_WIDTH, TILE);
        // dashed yellow center line
        ctx.fillStyle = "rgb(255, 236, 39)";
        const midY = yPx + TILE / 2 - 2;
        for (let dx = 0; dx < BOARD_WIDTH; dx += 24) {
          ctx.fillRect(dx, midY, 12, 4);
        }
        // vehicles
        if (row.vehicles) {
          for (const v of row.vehicles) {
            const isTruck = v.width >= TILE * 2;
            ctx.fillStyle = isTruck ? "rgb(255, 0, 77)" : "rgb(41, 173, 255)";
            ctx.fillRect(v.x, yPx + 6, v.width, TILE - 12);
            // wheels
            ctx.fillStyle = "rgb(29, 29, 29)";
            ctx.fillRect(v.x + 4, yPx + TILE - 10, 8, 6);
            ctx.fillRect(v.x + v.width - 12, yPx + TILE - 10, 8, 6);
            // windshield hint
            ctx.fillStyle = "rgb(194, 195, 199)";
            if (v.speed > 0) {
              ctx.fillRect(v.x + v.width - 14, yPx + 10, 10, 10);
            } else {
              ctx.fillRect(v.x + 4, yPx + 10, 10, 10);
            }
          }
        }
      } else if (row.type === "water") {
        ctx.fillStyle = "rgb(41, 173, 255)";
        ctx.fillRect(0, yPx, BOARD_WIDTH, TILE);
        // wave texture
        ctx.fillStyle = "rgb(131, 204, 255)";
        for (let wx = 0; wx < BOARD_WIDTH; wx += 16) {
          ctx.fillRect(wx + 2, yPx + 8, 8, 2);
          ctx.fillRect(wx + 6, yPx + 30, 8, 2);
        }
        // logs
        if (row.logs) {
          for (const l of row.logs) {
            ctx.fillStyle = "rgb(132, 75, 27)";
            ctx.fillRect(l.x, yPx + 4, l.width, TILE - 8);
            // wood stripes
            ctx.fillStyle = "rgb(92, 53, 20)";
            for (let wx = l.x + 4; wx < l.x + l.width - 4; wx += 10) {
              ctx.fillRect(wx, yPx + 6, 2, TILE - 12);
            }
          }
        }
      }

      // subtle row separator (pixel-art row edge)
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, yPx + TILE - 2, BOARD_WIDTH, 2);
    }

    // Draw player on top
    const playerScreenY = (VISIBLE_ROWS - 1 - (state.player.y - camY)) * TILE;
    const px = state.player.x;
    const py = playerScreenY;

    // chicken body (yellow block)
    ctx.fillStyle = "rgb(255, 236, 39)";
    ctx.fillRect(px + 8, py + 10, TILE - 16, TILE - 18);
    // head
    ctx.fillRect(px + 14, py + 4, TILE - 28, 10);
    // beak
    ctx.fillStyle = "rgb(255, 155, 0)";
    ctx.fillRect(px + TILE - 12, py + 8, 6, 4);
    // eye
    ctx.fillStyle = "rgb(29, 29, 29)";
    ctx.fillRect(px + TILE - 18, py + 6, 3, 3);
    // feet
    ctx.fillStyle = "rgb(255, 155, 0)";
    ctx.fillRect(px + 12, py + TILE - 6, 6, 3);
    ctx.fillRect(px + TILE - 18, py + TILE - 6, 6, 3);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className="crossy-canvas"
      style={{
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        maxWidth: "100%",
        imageRendering: "pixelated",
        border: "4px solid rgb(255, 241, 232)",
        boxShadow: "6px 6px 0 rgb(0, 0, 0)",
        background: "rgb(29, 43, 83)",
      }}
      aria-label={`crossy board ${COLS} columns`}
    />
  );
}

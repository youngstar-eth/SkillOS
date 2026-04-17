"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  TILE,
} from "@/lib/game/engine";
import type {
  EnemyType,
  TowerDefenseState,
  TowerType,
} from "@/lib/game/types";

interface BoardProps {
  state: TowerDefenseState;
  selectedType: TowerType;
  onTileClick?: (col: number, row: number) => void;
}

const TOWER_COLORS: Record<TowerType, string> = {
  arrow: "rgb(160, 110, 60)", // brown brass
  cannon: "rgb(110, 110, 115)", // iron gray
  magic: "rgb(150, 90, 180)", // arcane purple
};

const ENEMY_COLORS: Record<EnemyType, string> = {
  grunt: "rgb(170, 170, 175)", // gray
  fast: "rgb(230, 200, 80)", // yellow
  tank: "rgb(200, 70, 55)", // red
};

export function Board({ state, selectedType, onTileClick }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Draw tiles
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = state.grid[r][c];
        if (tile === "path") {
          ctx.fillStyle = "rgb(110, 75, 50)"; // cobblestone brown
        } else if (tile === "blocked") {
          ctx.fillStyle = "rgb(40, 25, 20)";
        } else {
          ctx.fillStyle = "rgb(80, 100, 60)"; // grass green
        }
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

        // Grid lines
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE, TILE);
      }
    }

    // Draw towers
    for (const tw of state.towers) {
      const cx = tw.x * TILE + TILE / 2;
      const cy = tw.y * TILE + TILE / 2;
      ctx.fillStyle = TOWER_COLORS[tw.type];
      ctx.strokeStyle = "rgb(30, 20, 10)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Fire flash — tiny pulse when cooldown just reset
      if (tw.cooldownMs > tw.fireRateMs - 120) {
        ctx.fillStyle = "rgba(255, 230, 150, 0.7)";
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw enemies
    for (const e of state.enemies) {
      const [c1, r1] = state.path[e.pathIndex];
      const [c2, r2] = state.path[e.pathIndex + 1];
      const ex = (c1 + (c2 - c1) * e.t) * TILE + TILE / 2;
      const ey = (r1 + (r2 - r1) * e.t) * TILE + TILE / 2;
      ctx.fillStyle = ENEMY_COLORS[e.type];
      ctx.strokeStyle = "rgb(20, 15, 10)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, ey, TILE * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // HP bar
      const barW = TILE * 0.7;
      const barH = 4;
      const bx = ex - barW / 2;
      const by = ey - TILE * 0.45;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "rgb(100, 200, 90)";
      const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.fillRect(bx, by, barW * pct, barH);
    }
  }, [state]);

  const handleClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTileClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    onTileClick(col, row);
  };

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      onClick={handleClick}
      aria-label={`Tower Defense board. Selected tower: ${selectedType}`}
      className="brass-panel rounded-sm"
      style={{ cursor: "crosshair", width: BOARD_WIDTH, height: BOARD_HEIGHT }}
    />
  );
}

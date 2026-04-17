"use client";

import { useEffect, useRef } from "react";
import {
  BALL_RADIUS,
  CYLINDER_RADIUS,
  PLATFORM_THICKNESS,
} from "@/lib/game/engine";
import type { HelixState, Segment } from "@/lib/game/types";

const CANVAS_W = 400;
const CANVAS_H = 600;
const BALL_SCREEN_Y = 200;
const TAU = Math.PI * 2;

// Memphis-ish palette; drawn directly so the canvas does not depend on CSS.
const COLORS = {
  bg: "#fffaeb",
  outline: "#0f0f0f",
  cylinder: "#fff",
  normal: ["#ff3c64", "#50c8e6", "#ffc832", "#8c64e6"], // rotates per platform
  danger: "#ff3232",
  ball: "#0f0f0f",
  ballHighlight: "#ffc832",
  hud: "#0f0f0f",
};

export interface BoardProps {
  state: HelixState;
  width?: number;
  height?: number;
}

export function Board({ state, width = CANVAS_W, height = CANVAS_H }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background.
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Light repeating Memphis-ish diagonal pattern overlay.
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2;
    for (let i = -height; i < width + height; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }
    ctx.restore();

    const centerX = width / 2;
    const ballScreenY = BALL_SCREEN_Y;

    // Central "shaft" line behind the cylinder.
    ctx.save();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
    ctx.restore();

    // Draw platforms as flattened ellipses from top-down projection.
    const rx = CYLINDER_RADIUS;
    const ry = CYLINDER_RADIUS * 0.35; // squash for fake 3D

    // The ball sits at screen-y = BALL_SCREEN_Y. Camera follows ball.
    // Each platform's screen-y = ballScreenY + (platform.y - state.ballY)
    const visible = state.platforms.filter((p) => {
      const sy = ballScreenY + (p.y - state.ballY);
      return sy > -PLATFORM_THICKNESS && sy < height + PLATFORM_THICKNESS;
    });

    // Draw back-to-front so the nearest platform overlays.
    visible.sort((a, b) => a.y - b.y);
    for (const p of visible) {
      const sy = ballScreenY + (p.y - state.ballY);
      drawPlatform(
        ctx,
        centerX,
        sy,
        rx,
        ry,
        p.segments,
        state.cylinderRotation,
      );
    }

    // Ball
    ctx.save();
    ctx.translate(centerX + rx - 4, ballScreenY);
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Highlight dot for fake lighting.
    ctx.fillStyle = COLORS.ballHighlight;
    ctx.beginPath();
    ctx.arc(-4, -4, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Score + combo HUD.
    ctx.save();
    ctx.fillStyle = COLORS.hud;
    ctx.font = "bold 28px 'Archivo Black', Impact, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${state.score}`, 16, 36);
    ctx.font = "bold 14px 'Rubik', sans-serif";
    ctx.globalAlpha = 0.7;
    ctx.fillText("SCORE", 16, 52);
    ctx.restore();

    if (state.combo >= 2) {
      ctx.save();
      ctx.fillStyle = "#ff3c64";
      ctx.font = "bold 32px 'Archivo Black', Impact, sans-serif";
      ctx.textAlign = "right";
      const pulse = 1 + Math.sin(state.elapsedMs / 120) * 0.07;
      ctx.translate(width - 16, 40);
      ctx.scale(pulse, pulse);
      ctx.fillText(`×${state.combo}`, 0, 0);
      ctx.restore();
    }

    if (state.status === "gameOver") {
      ctx.save();
      ctx.fillStyle = "rgba(15,15,15,0.7)";
      ctx.fillRect(0, height / 2 - 50, width, 100);
      ctx.fillStyle = "#fffaeb";
      ctx.textAlign = "center";
      ctx.font = "bold 36px 'Archivo Black', Impact, sans-serif";
      ctx.fillText("GAME OVER", width / 2, height / 2 + 8);
      ctx.restore();
    }
  }, [state, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        borderRadius: 8,
        border: "3px solid #0f0f0f",
        boxShadow: "6px 6px 0 #0f0f0f",
        background: "#fffaeb",
        touchAction: "none",
      }}
    />
  );
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments: Segment[],
  rotation: number,
) {
  // Top ellipse thickness (flat disk with 24px side wall).
  const thickness = PLATFORM_THICKNESS;

  // Bottom-side wall (behind) per segment (just front-facing arc band).
  ctx.save();

  segments.forEach((seg, i) => {
    if (seg.type === "gap") return;
    const start = seg.startAngle - rotation;
    const end = seg.endAngle - rotation;
    const color =
      seg.type === "danger"
        ? COLORS.danger
        : COLORS.normal[i % COLORS.normal.length];

    // Side band (fake 3D depth).
    ctx.fillStyle = shade(color, -0.25);
    ctx.beginPath();
    ctx.ellipse(cx, cy + thickness, rx, ry, 0, start, end);
    ctx.ellipse(cx, cy, rx, ry, 0, end, start, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Top face.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, start, end);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Danger spike pattern (tiny triangles along the arc).
    if (seg.type === "danger") {
      const steps = 6;
      ctx.fillStyle = COLORS.outline;
      for (let t = 0; t <= steps; t++) {
        const a = start + ((end - start) * t) / steps;
        const px = cx + Math.cos(a) * rx * 0.7;
        const py = cy + Math.sin(a) * ry * 0.7;
        ctx.beginPath();
        ctx.moveTo(px - 3, py + 4);
        ctx.lineTo(px + 3, py + 4);
        ctx.lineTo(px, py - 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  });

  ctx.restore();
}

/** Lighten/darken a hex color by `amt` in [-1, 1]. */
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const adj = (c: number) => {
    const v = Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt));
    return Math.max(0, Math.min(255, v));
  };
  return `rgb(${adj(r)}, ${adj(g)}, ${adj(b)})`;
}

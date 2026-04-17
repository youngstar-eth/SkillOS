"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PLAYER_SIZE,
} from "@/lib/game/engine";
import type { StickmanState } from "@/lib/game/types";

interface BoardProps {
  state: StickmanState;
  onPointerDown?: (worldX: number, worldY: number) => void;
  onPointerUp?: () => void;
}

export function Board({ state, onPointerDown, onPointerUp }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const s = stateRef.current;
      const camX = s.cameraX;

      // Background gradient (olive/rust grunge)
      const grad = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
      grad.addColorStop(0, "rgb(55,45,35)");
      grad.addColorStop(1, "rgb(35,30,25)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      // Subtle grunge grid
      ctx.strokeStyle = "rgba(120,130,80,0.08)";
      ctx.lineWidth = 1;
      const gridOff = camX % 40;
      for (let gx = -gridOff; gx < BOARD_WIDTH; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, BOARD_HEIGHT);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(-camX, 0);

      // Obstacles
      for (const o of s.obstacles) {
        ctx.fillStyle = o.deadly ? "rgb(200,50,40)" : "rgb(55,45,35)";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = "rgb(220,210,195)";
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }

      // Anchors (only those near the camera window)
      for (const a of s.anchors) {
        if (a.x < camX - 40 || a.x > camX + BOARD_WIDTH + 40) continue;
        // Outer ring
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(180,80,60,0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Inner dot
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius - 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(240,230,210)";
        ctx.fill();
      }

      // Rope
      if (s.ropeAnchor) {
        ctx.beginPath();
        ctx.moveTo(s.ropeAnchor.x, s.ropeAnchor.y);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = "rgb(220,210,195)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Flag
      const flagPoleX = s.flagX;
      const flagPoleTop = s.flagY - 60;
      ctx.strokeStyle = "rgb(220,210,195)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(flagPoleX, flagPoleTop);
      ctx.lineTo(flagPoleX, s.flagY + 20);
      ctx.stroke();
      ctx.fillStyle = "rgb(180,80,60)";
      ctx.beginPath();
      ctx.moveTo(flagPoleX, flagPoleTop);
      ctx.lineTo(flagPoleX + 30, flagPoleTop + 10);
      ctx.lineTo(flagPoleX, flagPoleTop + 20);
      ctx.closePath();
      ctx.fill();

      // Player (stickman)
      const px = s.x;
      const py = s.y;
      ctx.strokeStyle = "rgb(240,230,210)";
      ctx.fillStyle = "rgb(240,230,210)";
      ctx.lineWidth = 2;
      // head
      ctx.beginPath();
      ctx.arc(px, py - PLAYER_SIZE, PLAYER_SIZE * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // body
      ctx.beginPath();
      ctx.moveTo(px, py - PLAYER_SIZE / 2);
      ctx.lineTo(px, py + PLAYER_SIZE / 2);
      ctx.stroke();
      // arms
      ctx.beginPath();
      if (s.ropeAnchor) {
        ctx.moveTo(px, py - 2);
        ctx.lineTo(s.ropeAnchor.x > px ? px + 6 : px - 6, py - 6);
      } else {
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
      }
      ctx.stroke();
      // legs
      ctx.beginPath();
      ctx.moveTo(px, py + PLAYER_SIZE / 2);
      ctx.lineTo(px - 5, py + PLAYER_SIZE);
      ctx.moveTo(px, py + PLAYER_SIZE / 2);
      ctx.lineTo(px + 5, py + PLAYER_SIZE);
      ctx.stroke();

      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = BOARD_WIDTH / rect.width;
    const scaleY = BOARD_HEIGHT / rect.height;
    const localX = (clientX - rect.left) * scaleX;
    const localY = (clientY - rect.top) * scaleY;
    return { x: localX + stateRef.current.cameraX, y: localY };
  };

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className="grunge-frame block w-full max-w-[800px] touch-none select-none bg-black"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const { x, y } = toWorld(e.clientX, e.clientY);
        onPointerDown?.(x, y);
      }}
      onPointerUp={(e) => {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
        onPointerUp?.();
      }}
      onPointerLeave={() => onPointerUp?.()}
    />
  );
}

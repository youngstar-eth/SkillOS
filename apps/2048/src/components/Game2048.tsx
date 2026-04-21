"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  BOARD_SIZE,
  type Board,
  type Direction,
  type SeededRng,
  canMove,
  createInitialBoard,
  move,
  spawnTile,
} from "@/lib/game2048";

type Props = {
  seed: string;
  /** Called with the final score when the game ends (no legal moves). */
  onGameOver: (score: number) => void;
  /** Called on every score change, for live leaderboard display. */
  onScoreChange?: (score: number) => void;
  /** External kill switch — when true, game stops accepting input. */
  frozen?: boolean;
};

type State = {
  board: Board;
  score: number;
  rng: SeededRng;
  over: boolean;
};

type Action =
  | { type: "move"; dir: Direction }
  | { type: "reset"; seed: string };

function reduce(state: State, action: Action): State {
  if (action.type === "reset") {
    const { board, rng } = createInitialBoard(action.seed);
    return { board, score: 0, rng, over: false };
  }
  if (state.over) return state;
  const { board, gained, moved } = move(state.board, action.dir);
  if (!moved) return state;
  const spawned = spawnTile(board, state.rng);
  const over = !canMove(spawned);
  return {
    board: spawned,
    score: state.score + gained,
    rng: state.rng,
    over,
  };
}

function init(seed: string): State {
  const { board, rng } = createInitialBoard(seed);
  return { board, score: 0, rng, over: false };
}

/**
 * Tailwind color + text classes per tile value.
 * Classic 2048 warm palette, dark-mode friendly.
 */
const TILE_CLASSES: Record<number, string> = {
  0: "bg-bg-elev2 text-transparent",
  2: "bg-neutral-200 text-neutral-900",
  4: "bg-neutral-300 text-neutral-900",
  8: "bg-orange-400 text-white",
  16: "bg-orange-500 text-white",
  32: "bg-red-400 text-white",
  64: "bg-red-500 text-white",
  128: "bg-yellow-400 text-black",
  256: "bg-yellow-500 text-black",
  512: "bg-amber-400 text-black",
  1024: "bg-amber-500 text-black",
  2048: "bg-skill text-black ring-2 ring-yellow-300",
  4096: "bg-fuchsia-500 text-white",
};

export function Game2048({
  seed,
  onGameOver,
  onScoreChange,
  frozen,
}: Props) {
  const [state, dispatch] = useReducer(reduce, seed, init);
  const boardRef = useRef<HTMLDivElement>(null);
  const overFired = useRef(false);
  const milestoneFired = useRef(false);
  const [showMilestone, setShowMilestone] = useState(false);

  // Reset when seed changes
  useEffect(() => {
    dispatch({ type: "reset", seed });
    overFired.current = false;
    milestoneFired.current = false;
    setShowMilestone(false);
  }, [seed]);

  // Detect first time 2048 tile appears — one-shot, auto-dismisses after 2s.
  useEffect(() => {
    if (milestoneFired.current) return;
    const max = Math.max(...state.board.flat());
    if (max >= 2048) {
      milestoneFired.current = true;
      setShowMilestone(true);
      const t = setTimeout(() => setShowMilestone(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state.board]);

  // Emit score changes
  useEffect(() => {
    onScoreChange?.(state.score);
  }, [state.score, onScoreChange]);

  // Fire onGameOver once
  useEffect(() => {
    if (state.over && !overFired.current) {
      overFired.current = true;
      onGameOver(state.score);
    }
  }, [state.over, state.score, onGameOver]);

  // Keyboard
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (frozen || state.over) return;
      let dir: Direction | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dir = "up";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dir = "down";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dir = "left";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dir = "right";
          break;
      }
      if (dir) {
        e.preventDefault();
        dispatch({ type: "move", dir });
      }
    },
    [frozen, state.over],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Touch swipe
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;

    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    }
    function onMove(e: TouchEvent) {
      // Prevent the page from scrolling while swiping on the board
      if (touchStart.current) e.preventDefault();
    }
    function onEnd(e: TouchEvent) {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      if (frozen || state.over) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const THRESHOLD = 30;
      if (Math.max(absX, absY) < THRESHOLD) return;
      let dir: Direction;
      if (absX > absY) dir = dx > 0 ? "right" : "left";
      else dir = dy > 0 ? "down" : "up";
      dispatch({ type: "move", dir });
    }

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
    };
  }, [frozen, state.over]);

  return (
    <div className="relative flex flex-col items-center gap-3">
      <div
        ref={boardRef}
        className="grid aspect-square w-full max-w-[420px] select-none grid-cols-4 gap-2 rounded-xl border border-border bg-bg-elev p-2 touch-none"
        role="grid"
        aria-label="2048 board"
      >
        {state.board.flatMap((row, r) =>
          row.map((value, c) => (
            <div
              key={`${r}-${c}`}
              role="gridcell"
              aria-label={
                value === 0 ? `row ${r + 1} column ${c + 1} empty` : `${value}`
              }
              className={`flex aspect-square items-center justify-center rounded-lg text-lg font-bold sm:text-2xl ${TILE_CLASSES[value] ?? "bg-fuchsia-700 text-white"}`}
            >
              {value !== 0 ? value : ""}
            </div>
          )),
        )}
      </div>

      {/* 2048 milestone toast — one-shot, 2s auto-dismiss */}
      {showMilestone && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full border border-skill/60 bg-skill/15 px-4 py-1.5 text-sm font-semibold text-skill shadow-lg backdrop-blur animate-tilePop"
        >
          You hit 2048! Keep going.
        </div>
      )}

      <p className="text-xs text-neutral-500 sm:hidden">Swipe to move</p>
      <p className="hidden text-xs text-neutral-500 sm:block">
        Arrow keys or WASD to move
      </p>
    </div>
  );
}

export const BOARD = BOARD_SIZE;

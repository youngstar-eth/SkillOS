"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Board } from "./Board";
import { ScoreDisplay } from "./ScoreDisplay";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  BOARD_SIZE,
  calculateFinalScore,
  changeDirection,
  createInitialState,
  tick,
  tickInterval,
} from "@/lib/game/engine";
import type { Direction, SnakeState } from "@/lib/game/types";

export const SNAKE_TOURNAMENT_ID = 2n;

const CELL_PX_MOBILE = 16;
const CELL_PX_DESKTOP = 20;
const SWIPE_THRESHOLD = 28;

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

export function Game() {
  const { address, isConnected } = useAccount();

  // Seed with 0 for SSR parity; re-seed on mount for variety per session.
  const [state, setState] = useState<SnakeState>(() => createInitialState(0));
  const [startedAt, setStartedAt] = useState(0);
  const [cellSize, setCellSize] = useState(CELL_PX_MOBILE);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  // Fresh state for listeners / interval, without re-binding per render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mount: new seed + clock + responsive cell size.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff);
    setState(createInitialState(seed));
    setStartedAt(Date.now());

    const update = () => {
      setCellSize(
        window.innerWidth >= 520 ? CELL_PX_DESKTOP : CELL_PX_MOBILE,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Tick loop — interval is rebuilt each time `ateCount` crosses a speed tier.
  useEffect(() => {
    if (state.status !== "playing") return;
    const period = tickInterval(state.ateCount);
    const id = window.setInterval(() => {
      setState((s) => tick(s));
    }, period);
    return () => window.clearInterval(id);
  }, [state.status, state.ateCount]);

  // Keyboard — arrows + WASD, plus space to toggle pause.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setState((s) => {
          if (s.status === "playing") return { ...s, status: "paused" };
          if (s.status === "paused") return { ...s, status: "playing" };
          return s;
        });
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      setState((s) => changeDirection(s, dir));
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Touch swipe — resolves the dominant axis of the gesture.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < SWIPE_THRESHOLD) return;
      const dir: Direction =
        ax > ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      setState((s) => changeDirection(s, dir));
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff);
    setState(createInitialState(seed));
    setStartedAt(Date.now());
    setSubmit({ status: "idle" });
  }, []);

  const togglePause = useCallback(() => {
    setState((s) => {
      if (s.status === "playing") return { ...s, status: "paused" };
      if (s.status === "paused") return { ...s, status: "playing" };
      return s;
    });
  }, []);

  // ----- Submit score (2048 pattern, preserved) --------------------------
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  useEffect(() => {
    if (writeW.error) {
      setSubmit({ status: "error", message: writeW.error.message });
    }
  }, [writeW.error]);

  useEffect(() => {
    if (writeW.data && submit.status === "writing") {
      setSubmit((prev) =>
        prev.status === "writing"
          ? {
              status: "confirming",
              sessionId: prev.sessionId,
              nonce: prev.nonce,
              signature: prev.signature,
              txHash: writeW.data as Hex,
            }
          : prev,
      );
    }
  }, [writeW.data, submit.status]);

  useEffect(() => {
    if (writeRcpt.isSuccess && writeRcpt.data && submit.status === "confirming") {
      setSubmit((prev) =>
        prev.status === "confirming"
          ? {
              status: "done",
              txHash: prev.txHash,
              sessionId: prev.sessionId,
            }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setSubmit({
        status: "error",
        message: writeRcpt.error?.message ?? "tx failed",
      });
    }
  }, [
    writeRcpt.isSuccess,
    writeRcpt.isError,
    writeRcpt.data,
    writeRcpt.error,
    submit.status,
  ]);

  const finalScore = calculateFinalScore(state, Date.now() - startedAt);

  const submitScore = useCallback(async () => {
    if (submit.status === "signed") {
      const stashed = submit;
      setSubmit({ ...stashed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          SNAKE_TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(stashed.nonce),
          stashed.signature,
        ],
      });
      return;
    }

    setSubmit({ status: "signing" });
    try {
      const token = await sdk.quickAuth.getToken();
      const res = await fetch("/api/score", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: Number(SNAKE_TOURNAMENT_ID),
          score: finalScore,
          // Remap generic fields: longest body segment is the "max tile" analogue,
          // total ticks play the role of moves, and the grid stash holds the
          // end-state payload so /api/leaderboard can replay the run later.
          maxTile: state.snake.length,
          moves: state.tick,
          durationMs: Date.now() - startedAt,
          won: state.status === "gameOver" && state.score > 0,
          grid: {
            snakeLength: state.snake.length,
            ateCount: state.ateCount,
            ticks: state.tick,
            tournamentId: Number(SNAKE_TOURNAMENT_ID),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const signed: SubmitState = {
        status: "signed",
        sessionId: data.sessionId,
        nonce: data.nonce,
        signature: data.signature as Hex,
      };
      setSubmit(signed);
      setSubmit({ ...signed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          SNAKE_TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmit({ status: "error", message });
    }
  }, [submit, finalScore, state, startedAt, writeW]);

  const gameOver = state.status === "gameOver";

  return (
    <div className="flex flex-col gap-4">
      <ScoreDisplay
        score={state.score}
        ateCount={state.ateCount}
        snakeLength={state.snake.length}
        paused={state.status === "paused"}
      />

      <div className="flex justify-center">
        <Board state={state} cellSize={cellSize} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span className="uppercase tracking-[0.15em]">
          ⌨ Arrows / WASD · ☝ Swipe · ␣ Pause
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePause}
            disabled={gameOver}
            className="min-h-[32px] rounded-sm border border-accent/40 bg-black/30 px-3 text-[11px] uppercase tracking-[0.15em] text-fg hover:border-accent disabled:opacity-40"
          >
            {state.status === "paused" ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={restart}
            className="min-h-[32px] rounded-sm border border-accent-2/50 bg-black/30 px-3 text-[11px] uppercase tracking-[0.15em] text-accent-2 hover:border-accent-2"
          >
            New
          </button>
        </div>
      </div>

      {state.status === "paused" && (
        <div className="border border-warning/40 bg-black/40 p-3 text-center text-sm text-warning">
          PAUSED · press space / tap resume
        </div>
      )}

      {gameOver && (
        <GameOver
          score={finalScore}
          ateCount={state.ateCount}
          snakeLength={state.snake.length}
          ticks={state.tick}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}

// Keep BOARD_SIZE import alive for tree-shaking clarity (and in case
// downstream components want the constant).
export { BOARD_SIZE };

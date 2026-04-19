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
import { ScoreBoard } from "./ScoreBoard";
import { GameOver, type SubmitState } from "./GameOver";
import {
  AICoachButton,
  AutoSubmitScore,
  PayoutCelebration,
} from "@mas/shared/components";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  createEmptyGrid,
  hasWon as engineHasWon,
  initialGrid,
  isGameOver,
  maxTile,
  move,
  spawnTile,
} from "@/lib/game/engine";
import type { Direction, Grid } from "@/lib/game/types";

const BEST_KEY = "2048:best";
export const TOURNAMENT_ID = 22n;
const SWIPE_THRESHOLD = 50;

export interface GameProps {
  /** Daily challenge: pre-seeded tiles that replace the default 2-tile spawn. */
  dailyTiles?: Array<{ row: number; col: number; value: number }>;
}

// Build a 4×4 grid with specific tile placements. Used in daily-challenge mode
// to enforce the AI-designed starting board instead of the random init.
function gridFromTiles(
  tiles: Array<{ row: number; col: number; value: number }>,
): Grid {
  const g = createEmptyGrid();
  for (const t of tiles) {
    if (t.row < 0 || t.row > 3 || t.col < 0 || t.col > 3) continue;
    const row = g[t.row];
    if (row) row[t.col] = t.value;
  }
  return g;
}

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};

export function Game({ dailyTiles }: GameProps = {}) {
  const { address, isConnected } = useAccount();

  // Deterministic initial state (hydration-safe), seeded after mount.
  const [grid, setGrid] = useState<Grid>(() => createEmptyGrid());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  // Refs so a single keyboard/touch listener always sees fresh state.
  const gridRef = useRef(grid);
  const gameOverRef = useRef(gameOver);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  // Seed the two starting tiles + clock on client mount.
  // Daily mode replaces the random init with AI-designed tiles.
  useEffect(() => {
    setGrid(
      dailyTiles && dailyTiles.length > 0
        ? gridFromTiles(dailyTiles)
        : initialGrid(),
    );
    setStartedAt(Date.now());
  }, [dailyTiles]);

  // Hydrate best score from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw) setBest(Number.parseInt(raw, 10) || 0);
    } catch { /* SSR / privacy */ }
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* noop */ }
    }
  }, [score, best]);

  const step = useCallback((dir: Direction) => {
    if (gameOverRef.current) return;
    const result = move(gridRef.current, dir);
    if (!result.moved) return;
    const next = spawnTile(result.grid);
    setGrid(next);
    setScore((s) => s + result.score);
    setMoves((m) => m + 1);
    if (engineHasWon(next)) setWon(true);
    if (isGameOver(next)) setGameOver(true);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      step(dir);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step]);

  // Touch / swipe
  useEffect(() => {
    let startX = 0, startY = 0, active = false;
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
      const absX = Math.abs(dx), absY = Math.abs(dy);
      if (Math.max(absX, absY) < SWIPE_THRESHOLD) return;
      if (absX > absY) step(dx > 0 ? "right" : "left");
      else step(dy > 0 ? "down" : "up");
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [step]);

  const restart = useCallback(() => {
    setGrid(initialGrid());
    setScore(0);
    setMoves(0);
    setStartedAt(Date.now());
    setGameOver(false);
    setWon(false);
    setSubmit({ status: "idle" });
  }, []);

  // ----------------------------------------------------------
  // Submit score — 3-phase: signing (backend) → writing (wallet) → confirming
  // ----------------------------------------------------------
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  // Watch write lifecycle + roll state machine forward.
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
  }, [writeRcpt.isSuccess, writeRcpt.isError, writeRcpt.data, writeRcpt.error, submit.status]);

  const submitScore = useCallback(async () => {
    // If a signature is already in hand, just send the on-chain tx again.
    if (submit.status === "signed" || submit.status === "error") {
      const stashed = submit.status === "signed" ? submit : null;
      if (!stashed) {
        // From an error after receiving signature we lost context — fall through to re-sign.
      } else {
        setSubmit({ ...stashed, status: "writing" });
        writeW.writeContract({
          address: ARCADE_POOL_ADDRESS,
          abi: ARCADE_POOL_ABI,
          functionName: "submitScore",
          args: [
            TOURNAMENT_ID,
            BigInt(score),
            BigInt(stashed.nonce),
            stashed.signature,
          ],
        });
        return;
      }
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
          tournamentId: Number(TOURNAMENT_ID),
          score,
          maxTile: maxTile(grid),
          moves,
          durationMs: Date.now() - startedAt,
          won,
          grid,
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

      // Auto-advance to writing — prompt wallet right after signing.
      setSubmit({ ...signed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          TOURNAMENT_ID,
          BigInt(score),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmit({ status: "error", message });
    }
  }, [submit, score, grid, moves, startedAt, won, writeW]);

  return (
    <>
      <ScoreBoard score={score} best={best} moves={moves} />

      <div className="flex justify-center">
        <Board grid={grid} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>⌨ Arrow keys / WASD · ☝ Swipe</span>
        <button
          type="button"
          onClick={restart}
          className="bg-fg/10 px-2b py-1b font-display text-[10px] font-bold uppercase tracking-widest hover:bg-fg/20"
        >
          New
        </button>
      </div>

      {gameOver && (
        <GameOver
          score={score}
          won={won}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
          aiCoachSlot={
            <>
              <AutoSubmitScore
                userAddress={address}
                gameSlug="2048"
                score={score}
                tournamentId={Number(TOURNAMENT_ID)}
                gameData={{
                  maxTile: maxTile(grid),
                  moves,
                  durationMs: Date.now() - startedAt,
                  won,
                }}
              />
              <PayoutCelebration
                userAddress={address}
                gameSlug="2048"
                score={score}
                enabled={
                  process.env.NEXT_PUBLIC_INSTANT_PAYOUT === "1"
                }
              />
              {address ? (
                <AICoachButton
                  gameSlug="2048"
                  userAddress={address}
                  score={score}
                  tournamentId={Number(TOURNAMENT_ID)}
                  stats={{
                    score,
                    moves,
                    maxTile: maxTile(grid),
                    durationMs: Date.now() - startedAt,
                    won,
                  }}
                />
              ) : null}
            </>
          }
        />
      )}
    </>
  );
}

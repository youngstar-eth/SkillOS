"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Board } from "./Board";
import { StatusBar } from "./StatusBar";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  calculateScore,
  createInitialState,
  reveal,
  toggleFlag,
} from "@/lib/game/engine";
import type { Difficulty, MinesweeperState } from "@/lib/game/types";

export const MINESWEEPER_TOURNAMENT_ID = 3n;

const CELL_PX_MOBILE = 28;
const CELL_PX_DESKTOP = 32;

export function Game() {
  const { address, isConnected } = useAccount();

  const [difficulty] = useState<Difficulty>("beginner");
  const [state, setState] = useState<MinesweeperState>(() =>
    createInitialState(difficulty, 0),
  );
  // Timer pump — re-render once/sec so elapsed seconds read live.
  const [now, setNow] = useState(0);
  const [exploded, setExploded] = useState<[number, number] | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const [cellSize, setCellSize] = useState(CELL_PX_MOBILE);

  // Re-seed on mount for variety per session.
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff);
    setState(createInitialState(difficulty, seed));
  }, [difficulty]);

  // Responsive cell size — tight enough that 9×9 fits phones.
  useEffect(() => {
    const update = () => {
      setCellSize(
        window.innerWidth >= 520 ? CELL_PX_DESKTOP : CELL_PX_MOBILE,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // 1s timer tick while playing.
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  const elapsedSec = useMemo(() => {
    if (!state.startedAt) return 0;
    // On win/loss, freeze the clock at the final duration.
    const end =
      state.status === "won" || state.status === "lost"
        ? // Snapshot when transition happened; fall back to `now` for safety.
          now || Date.now()
        : now || Date.now();
    return Math.max(0, Math.floor((end - state.startedAt) / 1000));
  }, [state.startedAt, state.status, now]);

  const handleReveal = useCallback((row: number, col: number) => {
    setState((s) => {
      const wasMine = s.status !== "ready" && s.board[row][col].isMine;
      const next = reveal(s, row, col);
      if (wasMine && next.status === "lost") {
        setExploded([row, col]);
      }
      return next;
    });
  }, []);

  const handleFlag = useCallback((row: number, col: number) => {
    setState((s) => toggleFlag(s, row, col));
  }, []);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff);
    setState(createInitialState(difficulty, seed));
    setExploded(null);
    setSubmit({ status: "idle" });
    setNow(0);
  }, [difficulty]);

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

  const durationMs = state.startedAt
    ? (state.status === "won" || state.status === "lost"
        ? elapsedSec * 1000
        : Date.now() - state.startedAt)
    : 0;
  const finalScore = calculateScore(state, durationMs);

  const submitScore = useCallback(async () => {
    if (submit.status === "signed") {
      const stashed = submit;
      setSubmit({ ...stashed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          MINESWEEPER_TOURNAMENT_ID,
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
          tournamentId: Number(MINESWEEPER_TOURNAMENT_ID),
          score: finalScore,
          // Remap generic fields to per-game meaning.
          maxTile: state.revealedCount,
          moves: state.flagCount,
          durationMs,
          won: state.status === "won",
          grid: {
            difficulty: state.difficulty,
            seed: state.seed,
            revealedCount: state.revealedCount,
            flagCount: state.flagCount,
            tournamentId: Number(MINESWEEPER_TOURNAMENT_ID),
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
          MINESWEEPER_TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmit({ status: "error", message });
    }
  }, [submit, finalScore, state, durationMs, writeW]);

  const minesLeft = state.mineCount - state.flagCount;
  const terminal = state.status === "won" || state.status === "lost";

  return (
    <div className="win-raised mx-auto max-w-fit">
      <div className="win-titlebar">
        <span>Minesweeper — {difficulty}</span>
        <span className="opacity-75">◻ × ▢</span>
      </div>

      <div className="flex flex-col gap-2 p-2 bg-window">
        <StatusBar
          minesLeft={minesLeft}
          elapsedSec={elapsedSec}
          status={state.status}
          onRestart={restart}
        />

        <Board
          state={state}
          cellSize={cellSize}
          onReveal={handleReveal}
          onFlag={handleFlag}
          exploded={exploded}
        />

        <p className="px-1 text-center text-[10px] leading-tight text-muted">
          Left-click reveal · right-click / long-press flag.
        </p>
      </div>

      {terminal && (
        <GameOver
          won={state.status === "won"}
          score={finalScore}
          revealed={state.revealedCount}
          flagged={state.flagCount}
          elapsedSec={elapsedSec}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}

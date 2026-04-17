"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Board } from "./Board";
import { NumberPad } from "./NumberPad";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  BOARD_SIZE,
  calculateScore,
  createInitialState,
  getHint,
  selectCell as selectCellOp,
  setCellValue,
  toggleNote,
} from "@/lib/game/engine";
import type { Difficulty, SudokuState } from "@/lib/game/types";

export const SUDOKU_TOURNAMENT_ID = 4n;

/**
 * Tournament-driven difficulty. Same ID → same difficulty for every player.
 * Hash the ID and bucket into easy/medium/hard. Tournament 4 → hash%3 = 1 → medium.
 */
function difficultyFromTournament(id: bigint): Difficulty {
  const n = Number(id % 997n);
  const bucket = ((n * 2654435761) >>> 0) % 3;
  return bucket === 0 ? "easy" : bucket === 1 ? "medium" : "hard";
}

export function Game() {
  const { address, isConnected } = useAccount();

  const difficulty = useMemo(
    () => difficultyFromTournament(SUDOKU_TOURNAMENT_ID),
    [],
  );

  // Deterministic seed per tournament so the puzzle is the same for everyone.
  const [state, setState] = useState<SudokuState>(() =>
    createInitialState(difficulty, Number(SUDOKU_TOURNAMENT_ID) + 1),
  );
  const [noteMode, setNoteMode] = useState(false);
  const [now, setNow] = useState(0);
  const [solvedFlash, setSolvedFlash] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Re-seed on first client render so startedAt is accurate.
  useEffect(() => {
    setState((s) => ({ ...s, startedAt: Date.now() }));
  }, []);

  // Live timer — re-render once per second while playing.
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Solved flash — pulse green briefly, then let GameOver take over.
  useEffect(() => {
    if (state.status === "solved") {
      setSolvedFlash(true);
      const t = window.setTimeout(() => setSolvedFlash(false), 800);
      return () => window.clearTimeout(t);
    }
  }, [state.status]);

  const handleSelect = useCallback((row: number, col: number) => {
    setState((s) => selectCellOp(s, row, col));
  }, []);

  const handleNumber = useCallback(
    (n: number) => {
      setState((s) => {
        const sel = s.selectedCell;
        if (!sel) return s;
        return noteMode
          ? toggleNote(s, sel[0], sel[1], n)
          : setCellValue(s, sel[0], sel[1], n);
      });
    },
    [noteMode],
  );

  const handleClear = useCallback(() => {
    setState((s) => {
      const sel = s.selectedCell;
      if (!sel) return s;
      return setCellValue(s, sel[0], sel[1], null);
    });
  }, []);

  const handleHint = useCallback(() => {
    setState((s) => getHint(s));
  }, []);

  const handleToggleNotes = useCallback(() => {
    setNoteMode((m) => !m);
  }, []);

  // Keyboard shortcuts: 1-9 place/note, Backspace/Delete clear, N toggle, arrows move.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.status !== "playing") return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const n = Number(e.key);
        if (s.selectedCell) {
          setState((cur) =>
            noteMode
              ? toggleNote(cur, cur.selectedCell![0], cur.selectedCell![1], n)
              : setCellValue(cur, cur.selectedCell![0], cur.selectedCell![1], n),
          );
        }
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        if (s.selectedCell) handleClear();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNoteMode((m) => !m);
      } else if (s.selectedCell) {
        const [r, c] = s.selectedCell;
        let nr = r;
        let nc = c;
        if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
        else if (e.key === "ArrowDown") nr = Math.min(BOARD_SIZE - 1, r + 1);
        else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
        else if (e.key === "ArrowRight") nc = Math.min(BOARD_SIZE - 1, c + 1);
        else return;
        e.preventDefault();
        setState((cur) => selectCellOp(cur, nr, nc));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [noteMode, handleClear]);

  const restart = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 0xffffff);
    const fresh = createInitialState(difficulty, newSeed);
    setState({ ...fresh, startedAt: Date.now() });
    setSubmit({ status: "idle" });
    setNoteMode(false);
  }, [difficulty]);

  // ----- Submit score (2048 pattern) -----
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  useEffect(() => {
    if (writeW.error) setSubmit({ status: "error", message: writeW.error.message });
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
          ? { status: "done", txHash: prev.txHash, sessionId: prev.sessionId }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setSubmit({ status: "error", message: writeRcpt.error?.message ?? "tx failed" });
    }
  }, [
    writeRcpt.isSuccess,
    writeRcpt.isError,
    writeRcpt.data,
    writeRcpt.error,
    submit.status,
  ]);

  const durationMs = state.startedAt ? (now || Date.now()) - state.startedAt : 0;
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
          SUDOKU_TOURNAMENT_ID,
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
          tournamentId: Number(SUDOKU_TOURNAMENT_ID),
          score: finalScore,
          maxTile: state.hintsUsed, // repurpose: hints used
          moves: state.errorsCount, // repurpose: errors
          durationMs,
          won: state.status === "solved",
          grid: {
            difficulty: state.difficulty,
            seed: state.seed,
            hintsUsed: state.hintsUsed,
            errorsCount: state.errorsCount,
            tournamentId: Number(SUDOKU_TOURNAMENT_ID),
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
          SUDOKU_TOURNAMENT_ID,
          BigInt(finalScore),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      setSubmit({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [submit, finalScore, state, durationMs, writeW]);

  // Remaining digit counts for NumberPad badges.
  const remaining = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let n = 1; n <= 9; n++) counts[n] = 9;
    for (const row of state.grid) {
      for (const cell of row) {
        if (cell.value !== null) counts[cell.value] = (counts[cell.value] ?? 0) - 1;
      }
    }
    return counts;
  }, [state.grid]);

  const elapsedSec = Math.max(0, Math.floor(durationMs / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata strip */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-bg/60 px-4 py-2 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Stat label="Difficulty" value={state.difficulty} capitalize />
          <Stat label="Errors" value={state.errorsCount} />
          <Stat label="Hints" value={state.hintsUsed} />
        </div>
        <div className="font-mono text-sm tabular-nums text-fg">
          {mm}:{ss}
        </div>
      </div>

      <Board state={state} onSelect={handleSelect} solvedFlash={solvedFlash} />

      <NumberPad
        noteMode={noteMode}
        onNumber={handleNumber}
        onClear={handleClear}
        onToggleNotes={handleToggleNotes}
        onHint={handleHint}
        disabled={state.status !== "playing"}
        remaining={remaining}
      />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>1–9 to place · N notes · ⌫ clear · ←↑↓→ move</span>
        <button
          type="button"
          onClick={restart}
          className="rounded-md border border-border bg-bg px-3 py-1 text-[11px] font-semibold text-fg hover:border-accent"
        >
          New puzzle
        </button>
      </div>

      {state.status === "solved" && (
        <GameOver
          score={finalScore}
          difficulty={state.difficulty}
          elapsedSec={elapsedSec}
          hintsUsed={state.hintsUsed}
          errorsCount={state.errorsCount}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: number | string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-fg ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

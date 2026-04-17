"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ClickArea } from "./ClickArea";
import { LeafCounter } from "./LeafCounter";
import { UpgradePanel } from "./UpgradePanel";
import { GameOver, type SubmitState } from "./GameOver";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  buyUpgrade,
  calculateScore,
  click as doClick,
  createInitialState,
  tick,
} from "@/lib/game/engine";
import type { ClickerState } from "@/lib/game/types";

export const CLICKER_TOURNAMENT_ID = 6n;

/** 100ms tick is plenty: LPS reads stay smooth, battery cost minimal. */
const TICK_MS = 100;

export function Game() {
  const { address, isConnected } = useAccount();

  const [state, setState] = useState<ClickerState>(() =>
    createInitialState(Number(CLICKER_TOURNAMENT_ID) + 1),
  );
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fresh seed + reset clock on mount (after hydration).
  useEffect(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
  }, []);

  // Passive-income loop. Uses setInterval with real elapsed-ms deltas so
  // wall-clock drift (tab in background, mid-blur frames) is absorbed.
  useEffect(() => {
    if (state.status !== "playing") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      // Clamp long stalls so backgrounded tabs don't teleport the leaderboard.
      const dt = Math.min(now - last, 500);
      last = now;
      setState((s) => tick(s, dt));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  const handleClick = useCallback(() => {
    setState((s) => doClick(s));
  }, []);

  const handleBuy = useCallback((id: string) => {
    setState((s) => buyUpgrade(s, id));
  }, []);

  // Space = click shortcut. Esc / N reserved for future (hotbar upgrades).
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleClick]);

  const restart = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffff) || 1;
    setState(createInitialState(seed));
    setSubmit({ status: "idle" });
  }, []);

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

  const finalScore = calculateScore(state);

  const submitScore = useCallback(async () => {
    if (submit.status === "signed") {
      const stashed = submit;
      setSubmit({ ...stashed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          CLICKER_TOURNAMENT_ID,
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
      const upgradesOwned = state.upgrades.reduce((n, u) => n + u.owned, 0);
      const res = await fetch("/api/score", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: Number(CLICKER_TOURNAMENT_ID),
          score: finalScore,
          // Repurpose generic fields.
          maxTile: upgradesOwned,              // breadth of upgrades purchased
          moves: state.totalClicks,            // raw click count
          durationMs: state.elapsedMs,
          won: finalScore > 0,
          grid: {
            totalLeavesEarned: Math.floor(state.totalLeavesEarned),
            totalClicks: state.totalClicks,
            upgradesOwned,
            upgradesSnapshot: state.upgrades.map((u) => ({ id: u.id, owned: u.owned })),
            seed: state.seed,
            tournamentId: Number(CLICKER_TOURNAMENT_ID),
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
          CLICKER_TOURNAMENT_ID,
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
  }, [submit, finalScore, state, writeW]);

  return (
    <div className="flex flex-col gap-5">
      <LeafCounter state={state} />
      <ClickArea
        disabled={state.status !== "playing"}
        leavesPerClick={state.leavesPerClick}
        onClick={handleClick}
      />
      <UpgradePanel state={state} onBuy={handleBuy} />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>Tap the tree · Space also works</span>
        <button
          type="button"
          onClick={restart}
          className="rounded-md border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted hover:border-accent"
        >
          Reset
        </button>
      </div>

      {state.status === "finished" && (
        <GameOver
          finalScore={finalScore}
          totalLeavesEarned={Math.floor(state.totalLeavesEarned)}
          totalClicks={state.totalClicks}
          upgradesOwned={state.upgrades.reduce((n, u) => n + u.owned, 0)}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
        />
      )}
    </div>
  );
}

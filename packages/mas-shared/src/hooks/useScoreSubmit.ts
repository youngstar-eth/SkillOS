"use client";

import { useCallback, useEffect, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "../contracts/arcade-pool";

export type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "signed"; sessionId: string; nonce: string; signature: Hex }
  | { status: "writing"; sessionId: string; nonce: string; signature: Hex }
  | {
      status: "confirming";
      sessionId: string;
      nonce: string;
      signature: Hex;
      txHash: Hex;
    }
  | { status: "done"; txHash: Hex; sessionId: string }
  | { status: "error"; message: string };

export interface SubmitPayload {
  score: number;
  /** Longest tile / rally / combo (per-game semantic). */
  maxTile?: number;
  /** Move / guess / shot count. */
  moves?: number;
  durationMs?: number;
  won?: boolean;
  /** Game-specific end-state snapshot (stored as JSON). */
  grid?: unknown;
}

export interface UseScoreSubmitOptions {
  tournamentId: bigint;
}

export interface UseScoreSubmitResult {
  state: SubmitState;
  submit: (payload: SubmitPayload) => Promise<void>;
  reset: () => void;
}

/**
 * Client submit pipeline:
 *   1. Ask Warpcast Quick Auth for a JWT (via Farcaster frame SDK).
 *   2. POST to `/api/score` with the body — server persists the session
 *      row and returns an EIP-712 signature + nonce.
 *   3. Call `submitScore` on ArcadePool with (tournamentId, score, nonce,
 *      signature). Wait for the receipt.
 *
 * `state` walks through: idle → signing → signed → writing → confirming
 * → done (or → error at any stage). UI renders buttons off `state.status`.
 */
export function useScoreSubmit(
  opts: UseScoreSubmitOptions,
): UseScoreSubmitResult {
  const { tournamentId } = opts;
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  // Surface write-side errors (wallet rejected, RPC fail, etc.).
  useEffect(() => {
    if (writeW.error) {
      setState({ status: "error", message: writeW.error.message });
    }
  }, [writeW.error]);

  // writing → confirming once the tx hash is back from the wallet.
  useEffect(() => {
    if (writeW.data && state.status === "writing") {
      setState((prev) =>
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
  }, [writeW.data, state.status]);

  // confirming → done once the receipt lands.
  useEffect(() => {
    if (writeRcpt.isSuccess && writeRcpt.data && state.status === "confirming") {
      setState((prev) =>
        prev.status === "confirming"
          ? { status: "done", txHash: prev.txHash, sessionId: prev.sessionId }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setState({
        status: "error",
        message: writeRcpt.error?.message ?? "tx failed",
      });
    }
  }, [
    writeRcpt.isSuccess,
    writeRcpt.isError,
    writeRcpt.data,
    writeRcpt.error,
    state.status,
  ]);

  const submit = useCallback(
    async (payload: SubmitPayload) => {
      // Re-trigger after `signed`: skip the HTTP call and just send the tx.
      if (state.status === "signed") {
        const stashed = state;
        setState({ ...stashed, status: "writing" });
        writeW.writeContract({
          address: ARCADE_POOL_ADDRESS,
          abi: ARCADE_POOL_ABI,
          functionName: "submitScore",
          args: [
            tournamentId,
            BigInt(payload.score),
            BigInt(stashed.nonce),
            stashed.signature,
          ],
        });
        return;
      }

      setState({ status: "signing" });
      try {
        const token = await sdk.quickAuth.getToken();
        const res = await fetch("/api/score", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tournamentId: Number(tournamentId),
            score: payload.score,
            maxTile: payload.maxTile ?? 0,
            moves: payload.moves ?? 0,
            durationMs: payload.durationMs ?? 0,
            won: payload.won ?? false,
            grid: payload.grid ?? null,
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
        setState(signed);
        setState({ ...signed, status: "writing" });
        writeW.writeContract({
          address: ARCADE_POOL_ADDRESS,
          abi: ARCADE_POOL_ABI,
          functionName: "submitScore",
          args: [
            tournamentId,
            BigInt(payload.score),
            BigInt(data.nonce),
            data.signature as Hex,
          ],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      }
    },
    [state, tournamentId, writeW],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, submit, reset };
}

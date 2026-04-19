"use client";

import { useState } from "react";
import type { Address, Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { USDC_ABI } from "../contracts/arcade-pool";

export interface CreateChallengeButtonProps {
  gameSlug: string;
  /** Alice's bar score — required. */
  score: number;
  /** Apps should pass `process.env.NEXT_PUBLIC_CHALLENGES === "1"`. */
  enabled?: boolean;
}

type Step =
  | { step: "idle" }
  | { step: "picking" }
  | {
      step: "creating";
      stakeUsdc: 0.5 | 1 | 5;
      durationSeconds: 3600 | 86400 | 604800;
    }
  | {
      step: "ready_to_stake";
      challengeId: string;
      studioWallet: Address;
      stakeUsdcAtomic: bigint;
      usdcAddress: Address;
      stakeUsdc: number;
    }
  | { step: "approving_stake"; challengeId: string; stakeUsdc: number }
  | { step: "confirming"; challengeId: string; txHash: Hex }
  | { step: "done"; challengeId: string; shareUrl: string }
  | { step: "error"; message: string };

const STAKE_OPTIONS: Array<0.5 | 1 | 5> = [0.5, 1, 5];
const DURATION_OPTIONS: Array<{
  label: string;
  seconds: 3600 | 86400 | 604800;
}> = [
  { label: "1h", seconds: 3600 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 },
];

/**
 * Post-game-over CTA — Alice picks a stake + duration, we write the DB row
 * (in `pending_creator_stake`), then prompt the wallet to USDC.transfer
 * the stake to the studio escrow. On receipt we POST confirm-stake to
 * flip the row to `open` and render the shareable link.
 */
export function CreateChallengeButton({
  gameSlug,
  score,
  enabled = false,
}: CreateChallengeButtonProps) {
  const { address } = useAccount();
  const [state, setState] = useState<Step>({ step: "idle" });
  const writeW = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  if (!enabled) return null;
  if (!address) return null;
  if (score <= 0) return null;

  const onChallenge = () => setState({ step: "picking" });

  const create = async (
    stakeUsdc: 0.5 | 1 | 5,
    durationSeconds: 3600 | 86400 | 604800,
  ) => {
    setState({ step: "creating", stakeUsdc, durationSeconds });
    try {
      const res = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          creatorAddress: address,
          creatorScore: score,
          stakeUsdc,
          durationSeconds,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        challengeId?: string;
        studioWallet?: string;
        stakeUsdcAtomic?: string;
        usdcAddress?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeId) {
        setState({ step: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({
        step: "ready_to_stake",
        challengeId: data.challengeId,
        studioWallet: data.studioWallet as Address,
        stakeUsdcAtomic: BigInt(data.stakeUsdcAtomic!),
        usdcAddress: data.usdcAddress as Address,
        stakeUsdc,
      });
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const sendStake = () => {
    if (state.step !== "ready_to_stake") return;
    setState({
      step: "approving_stake",
      challengeId: state.challengeId,
      stakeUsdc: state.stakeUsdc,
    });
    writeW.writeContract(
      {
        address: state.usdcAddress,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [state.studioWallet, state.stakeUsdcAtomic],
      },
      {
        onSuccess: (hash) => {
          setState({ step: "confirming", challengeId: state.challengeId, txHash: hash });
          // Poll receipt → confirm-stake (done in effect below via rcpt)
          void confirmStakeOnReceipt(state.challengeId, hash);
        },
        onError: (err) => {
          setState({ step: "error", message: err.message });
        },
      },
    );
  };

  const confirmStakeOnReceipt = async (challengeId: string, txHash: Hex) => {
    // Wait for the receipt in the background — rcpt hook already watches it.
    // We still call confirm-stake directly which does its own waitForReceipt.
    const res = await fetch(`/api/challenge/${challengeId}/confirm-stake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "creator", txHash }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setState({
        step: "error",
        message: data.error ?? `confirm-stake HTTP ${res.status}`,
      });
      return;
    }
    const shareUrl = `${window.location.origin}/challenge/${challengeId}`;
    setState({ step: "done", challengeId, shareUrl });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (state.step === "idle") {
    return (
      <button
        type="button"
        onClick={onChallenge}
        style={{
          background: "transparent",
          color: "#FFC72C",
          border: "1px solid #FFC72C",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          marginTop: "10px",
          width: "100%",
        }}
      >
        Challenge a Friend →
      </button>
    );
  }

  if (state.step === "picking") {
    return (
      <div
        style={{
          padding: "12px",
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.05)",
          marginTop: "10px",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: "11px",
        }}
      >
        <div style={{ opacity: 0.8, marginBottom: 8, letterSpacing: "0.15em" }}>
          PICK STAKE · DURATION
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STAKE_OPTIONS.map((s) =>
            DURATION_OPTIONS.map((d) => (
              <button
                key={`${s}-${d.seconds}`}
                type="button"
                onClick={() => create(s, d.seconds)}
                style={pickButtonStyle()}
              >
                {s} USDC · {d.label}
              </button>
            )),
          )}
        </div>
      </div>
    );
  }

  if (
    state.step === "creating" ||
    state.step === "approving_stake" ||
    state.step === "confirming"
  ) {
    const label =
      state.step === "creating"
        ? "CREATING CHALLENGE…"
        : state.step === "approving_stake"
          ? "APPROVE STAKE IN WALLET…"
          : "WAITING FOR TX CONFIRMATION…";
    return <PendingBanner label={label} />;
  }

  if (state.step === "ready_to_stake") {
    return (
      <div
        style={{
          padding: "12px",
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.05)",
          marginTop: "10px",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: "11px",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          Stake {state.stakeUsdc} USDC to lock in your challenge.
        </div>
        <button type="button" onClick={sendStake} style={primaryStyle()}>
          Send Stake →
        </button>
      </div>
    );
  }

  if (state.step === "done") {
    return (
      <div
        style={{
          padding: "12px",
          border: "2px solid #FFC72C",
          background:
            "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,199,44,0.2) 100%)",
          marginTop: "10px",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: "11px",
          textAlign: "center",
        }}
      >
        <div style={{ letterSpacing: "0.2em", marginBottom: 6 }}>
          CHALLENGE LIVE
        </div>
        <input
          readOnly
          value={state.shareUrl}
          style={{
            width: "100%",
            border: "1px solid rgba(255,199,44,0.5)",
            background: "rgba(0,0,0,0.3)",
            color: "#FFC72C",
            padding: "6px 8px",
            fontSize: "10px",
            fontFamily: "monospace",
            textAlign: "center",
          }}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          type="button"
          style={{ ...primaryStyle(), marginTop: 10 }}
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ url: state.shareUrl });
              } catch {
                /* user dismissed */
              }
              return;
            }
            await navigator.clipboard?.writeText(state.shareUrl);
          }}
        >
          Share
        </button>
      </div>
    );
  }

  // error
  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid rgba(220,50,50,0.4)",
        background: "rgba(220,50,50,0.08)",
        marginTop: "10px",
        color: "#F55",
        fontFamily: "monospace",
        fontSize: "11px",
        wordBreak: "break-all",
      }}
    >
      Challenge error: {state.message.slice(0, 200)}
    </div>
  );
}

function PendingBanner({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "12px",
        border: "1px solid rgba(255,199,44,0.4)",
        background: "rgba(255,199,44,0.05)",
        marginTop: "10px",
        color: "#FFC72C",
        fontFamily: "monospace",
        fontSize: "11px",
        letterSpacing: "0.15em",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

function pickButtonStyle(): React.CSSProperties {
  return {
    background: "rgba(255,199,44,0.08)",
    color: "#FFC72C",
    border: "1px solid rgba(255,199,44,0.4)",
    padding: "6px 10px",
    fontSize: "10px",
    fontFamily: "monospace",
    cursor: "pointer",
    letterSpacing: "0.05em",
  };
}

function primaryStyle(): React.CSSProperties {
  return {
    background: "#FFC72C",
    color: "#0B0B0F",
    border: "none",
    padding: "8px 16px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.2em",
    cursor: "pointer",
    textTransform: "uppercase",
  };
}

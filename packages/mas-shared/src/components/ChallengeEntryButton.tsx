"use client";

import { useState } from "react";
import type { Address, Hex } from "viem";
import {
  useAccount,
  useConnect,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { USDC_ABI } from "../contracts/arcade-pool";

export interface ChallengeEntryButtonProps {
  gameSlug: string;
  /** Apps should pass `process.env.NEXT_PUBLIC_CHALLENGES === "1"`. */
  enabled?: boolean;
  /** Styling variant for the different call-sites. */
  variant?: "primary" | "ghost";
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
  | {
      step: "done";
      challengeId: string;
      shareUrl: string;
      playHref: string;
    }
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
 * Pre-play duel entry: Alice clicks this from the game's home page, picks a
 * stake + duration, sends USDC to the studio wallet, and gets a share link.
 * She doesn't play yet — both players open `/challenge/<id>` after accept.
 *
 * Wallet guard: if not connected, clicking surfaces the wagmi connectors so
 * the user can connect before the stake picker opens.
 */
export function ChallengeEntryButton({
  gameSlug,
  enabled = false,
  variant = "primary",
}: ChallengeEntryButtonProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const [state, setState] = useState<Step>({ step: "idle" });
  const writeW = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  if (!enabled) return null;

  const onClick = () => {
    if (!isConnected) {
      // Kick the first available connector. Most pilots use Coinbase Smart
      // Wallet via OnchainKit; this surfaces the wallet popup.
      const connector = connectors[0];
      if (connector) connect({ connector });
      return;
    }
    setState({ step: "picking" });
  };

  const create = async (
    stakeUsdc: 0.5 | 1 | 5,
    durationSeconds: 3600 | 86400 | 604800,
  ) => {
    if (!address) return;
    setState({ step: "creating", stakeUsdc, durationSeconds });
    try {
      const res = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          creatorAddress: address,
          // creatorScore intentionally omitted — pre-play duel
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
          void confirmStakeOnReceipt(state.challengeId, hash);
        },
        onError: (err) => {
          setState({ step: "error", message: err.message });
        },
      },
    );
  };

  const confirmStakeOnReceipt = async (challengeId: string, txHash: Hex) => {
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
    const playHref = `${window.location.origin}/challenge/${challengeId}`;
    setState({ step: "done", challengeId, shareUrl, playHref });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const buttonStyle: React.CSSProperties =
    variant === "primary"
      ? {
          background: "#FFC72C",
          color: "#0B0B0F",
          border: "none",
          padding: "12px 18px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          width: "100%",
          fontFamily: "monospace",
        }
      : {
          background: "transparent",
          color: "#FFC72C",
          border: "1px solid #FFC72C",
          padding: "12px 18px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          width: "100%",
          fontFamily: "monospace",
        };

  if (state.step === "idle") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={connectStatus === "pending"}
        style={buttonStyle}
      >
        {isConnected ? "Challenge a Friend" : "Connect & Challenge"}
      </button>
    );
  }

  if (state.step === "picking") {
    return (
      <div
        style={{
          padding: "14px",
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.05)",
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
                style={pickBtn()}
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
    return <Pending label={label} />;
  }

  if (state.step === "ready_to_stake") {
    return (
      <div
        style={{
          padding: "14px",
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.05)",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: "11px",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          Stake {state.stakeUsdc} USDC to lock in your challenge.
        </div>
        <button type="button" onClick={sendStake} style={buttonStyle}>
          Send Stake →
        </button>
      </div>
    );
  }

  if (state.step === "done") {
    return (
      <div
        style={{
          padding: "14px",
          border: "2px solid #FFC72C",
          background:
            "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,199,44,0.2) 100%)",
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
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <button
            type="button"
            style={{ ...buttonStyle, padding: "8px 12px", fontSize: 10 }}
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({ url: state.shareUrl });
                } catch {
                  /* dismissed */
                }
                return;
              }
              await navigator.clipboard?.writeText(state.shareUrl);
            }}
          >
            Share
          </button>
          <a
            href={state.playHref}
            style={{
              ...buttonStyle,
              padding: "8px 12px",
              fontSize: 10,
              textDecoration: "none",
              display: "block",
            }}
          >
            Play Now →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid rgba(220,50,50,0.4)",
        background: "rgba(220,50,50,0.08)",
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

function Pending({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "12px",
        border: "1px solid rgba(255,199,44,0.4)",
        background: "rgba(255,199,44,0.05)",
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

function pickBtn(): React.CSSProperties {
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

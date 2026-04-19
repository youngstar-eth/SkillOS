"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { USDC_ABI } from "../contracts/arcade-pool";

export interface AcceptChallengeModalProps {
  challengeId: string;
  gameSlug: string;
  creatorAddress: string;
  creatorScore: number;
  stakeUsdc: number;
  expiresAt: string;
  /** Where Bob goes to actually play after accepting. */
  playHref: string;
}

type Step =
  | { step: "idle" }
  | { step: "preparing" }
  | {
      step: "ready";
      studioWallet: Address;
      stakeUsdcAtomic: bigint;
      usdcAddress: Address;
    }
  | { step: "approving" }
  | { step: "confirming"; txHash: Hex }
  | { step: "accepted" }
  | { step: "error"; message: string };

export function AcceptChallengeModal({
  challengeId,
  gameSlug,
  creatorAddress,
  creatorScore,
  stakeUsdc,
  expiresAt,
  playHref,
}: AcceptChallengeModalProps) {
  const { address } = useAccount();
  const [state, setState] = useState<Step>({ step: "idle" });
  const writeW = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  const isSelf =
    address && address.toLowerCase() === creatorAddress.toLowerCase();
  const expired = new Date(expiresAt).getTime() < Date.now();

  const prepare = async () => {
    if (!address) return;
    setState({ step: "preparing" });
    try {
      const res = await fetch(
        `/api/challenge/${challengeId}/prepare-accept?challenger=${address}`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        studioWallet?: string;
        stakeUsdcAtomic?: string;
        usdcAddress?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState({ step: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({
        step: "ready",
        studioWallet: data.studioWallet as Address,
        stakeUsdcAtomic: BigInt(data.stakeUsdcAtomic!),
        usdcAddress: data.usdcAddress as Address,
      });
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const send = () => {
    if (state.step !== "ready" || !address) return;
    setState({ step: "approving" });
    writeW.writeContract(
      {
        address: state.usdcAddress,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [state.studioWallet, state.stakeUsdcAtomic],
      },
      {
        onSuccess: (hash) => {
          setState({ step: "confirming", txHash: hash });
          void accept(hash);
        },
        onError: (err) => {
          setState({ step: "error", message: err.message });
        },
      },
    );
  };

  const accept = async (txHash: Hex) => {
    try {
      const res = await fetch(`/api/challenge/${challengeId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengerAddress: address, txHash }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState({ step: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ step: "accepted" });
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        padding: "20px",
        border: "1px solid rgba(255,199,44,0.4)",
        background: "rgba(255,199,44,0.05)",
        color: "#FFC72C",
        fontFamily: "monospace",
        fontSize: "12px",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <div
        style={{ fontSize: 11, letterSpacing: "0.2em", marginBottom: 6, opacity: 0.7 }}
      >
        CHALLENGE · {gameSlug.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, marginBottom: 10 }}>
        {creatorAddress.slice(0, 6)}…{creatorAddress.slice(-4)} scored{" "}
        <b>{creatorScore}</b>. Beat it.
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 14 }}>
        Stake: {stakeUsdc} USDC · Winner takes 2x (−10% fee) · Expires{" "}
        {new Date(expiresAt).toLocaleString()}
      </div>

      {!address ? (
        <div style={{ opacity: 0.7 }}>Connect wallet to accept.</div>
      ) : isSelf ? (
        <div style={{ opacity: 0.7 }}>You created this challenge.</div>
      ) : expired ? (
        <div style={{ opacity: 0.7 }}>Expired.</div>
      ) : state.step === "idle" ? (
        <button type="button" onClick={prepare} style={primary()}>
          Accept Challenge
        </button>
      ) : state.step === "preparing" ? (
        <Pending label="PREPARING…" />
      ) : state.step === "ready" ? (
        <button type="button" onClick={send} style={primary()}>
          Stake {stakeUsdc} USDC & Start
        </button>
      ) : state.step === "approving" ? (
        <Pending label="APPROVE IN WALLET…" />
      ) : state.step === "confirming" ? (
        <Pending label="WAITING FOR TX…" />
      ) : state.step === "accepted" ? (
        <a href={playHref} style={{ ...primary(), textDecoration: "none", display: "inline-block" }}>
          Play Now →
        </a>
      ) : (
        <div style={{ color: "#F55", wordBreak: "break-all" }}>
          Error: {state.message.slice(0, 200)}
        </div>
      )}
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid rgba(255,199,44,0.3)",
        color: "#FFC72C",
        fontSize: 11,
        textAlign: "center",
        letterSpacing: "0.15em",
      }}
    >
      {label}
    </div>
  );
}

function primary(): React.CSSProperties {
  return {
    background: "#FFC72C",
    color: "#0B0B0F",
    border: "none",
    padding: "10px 20px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.2em",
    cursor: "pointer",
    textTransform: "uppercase",
  };
}

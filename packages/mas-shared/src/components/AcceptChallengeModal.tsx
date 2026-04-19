"use client";

import { useEffect, useState } from "react";
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  useAccount,
  useConnect,
  useWriteContract,
} from "wagmi";
import {
  CHALLENGE_ESCROW_ABI,
  USDC_ABI,
} from "../contracts";

async function waitForTxSuccess(hash: Hex, timeoutMs = 120_000): Promise<void> {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const chain = chainId === 8453 ? base : baseSepolia;
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";
  const client = createPublicClient({ chain, transport: http(rpc) });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: timeoutMs,
  });
  if (receipt.status !== "success") {
    throw new Error(`tx_reverted:${receipt.status}`);
  }
}

export interface AcceptChallengeModalProps {
  challengeId: string;
  gameSlug: string;
  creatorAddress: string;
  /** Nullable in the pre-play duel model — Alice hasn't played yet. */
  creatorScore: number | null;
  stakeUsdc: number;
  expiresAt: string;
  /** Where Bob goes to actually play after accepting. */
  playHref: string;
  /** Auto-redirect to playHref N ms after `accepted`. Default 1500. */
  autoRedirectMs?: number;
}

type Step =
  | { step: "idle" }
  | { step: "preparing" }
  | {
      step: "ready";
      studioWallet: Address; // legacy alias for contractAddress
      stakeUsdcAtomic: bigint;
      usdcAddress: Address;
      onchainId: Hex;
      contractAddress: Address;
    }
  | { step: "approving" }
  | { step: "approve_pending" }
  | { step: "accepting" }
  | { step: "accept_pending"; txHash: Hex }
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
  autoRedirectMs = 1500,
}: AcceptChallengeModalProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const [state, setState] = useState<Step>({ step: "idle" });
  const writeW = useWriteContract();

  // Auto-redirect to the play page once Bob's accept lands on-chain.
  useEffect(() => {
    if (state.step !== "accepted") return;
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      window.location.href = playHref;
    }, autoRedirectMs);
    return () => window.clearTimeout(t);
  }, [state.step, playHref, autoRedirectMs]);

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
        onchainId?: Hex;
        contractAddress?: Address;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState({ step: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      if (!data.onchainId || !data.contractAddress) {
        setState({
          step: "error",
          message: "Server missing on-chain fields — old challenge?",
        });
        return;
      }
      setState({
        step: "ready",
        studioWallet: data.contractAddress as Address,
        stakeUsdcAtomic: BigInt(data.stakeUsdcAtomic!),
        usdcAddress: data.usdcAddress as Address,
        onchainId: data.onchainId,
        contractAddress: data.contractAddress as Address,
      });
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const send = async () => {
    if (state.step !== "ready" || !address) return;
    const { usdcAddress, contractAddress, onchainId, stakeUsdcAtomic } = state;
    try {
      // ── 1. USDC approve ─────────────────────────────────────────────
      setState({ step: "approving" });
      const approveTx = await writeW.writeContractAsync({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: "approve",
        args: [contractAddress, stakeUsdcAtomic],
      });
      setState({ step: "approve_pending" });
      await waitForTxSuccess(approveTx as Hex);

      // ── 2. acceptChallenge on-chain ─────────────────────────────────
      setState({ step: "accepting" });
      const acceptTx = await writeW.writeContractAsync({
        address: contractAddress,
        abi: CHALLENGE_ESCROW_ABI,
        functionName: "acceptChallenge",
        args: [onchainId],
      });
      setState({ step: "accept_pending", txHash: acceptTx as Hex });
      await waitForTxSuccess(acceptTx as Hex);

      // ── 3. Server confirmation ──────────────────────────────────────
      setState({ step: "confirming", txHash: acceptTx as Hex });
      await confirmAccept(acceptTx as Hex);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ step: "error", message: msg });
    }
  };

  const confirmAccept = async (txHash: Hex) => {
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
        {creatorAddress.slice(0, 6)}…{creatorAddress.slice(-4)}
        {creatorScore !== null ? (
          <>
            {" "}scored <b>{creatorScore}</b>. Beat it.
          </>
        ) : (
          <>{" "}is ready to duel.</>
        )}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 14 }}>
        Stake: {stakeUsdc} USDC · Winner takes 2x (−10% fee) · Expires{" "}
        {new Date(expiresAt).toLocaleString()}
      </div>

      {!address || !isConnected ? (
        <button
          type="button"
          onClick={() => {
            const c = connectors[0];
            if (c) connect({ connector: c });
          }}
          disabled={connectStatus === "pending"}
          style={primary()}
        >
          {connectStatus === "pending" ? "Connecting…" : "Connect Wallet"}
        </button>
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
        <Pending label="APPROVE USDC IN WALLET…" />
      ) : state.step === "approve_pending" ? (
        <Pending label="WAITING FOR APPROVAL TX…" />
      ) : state.step === "accepting" ? (
        <Pending label="SIGN acceptChallenge IN WALLET…" />
      ) : state.step === "accept_pending" ? (
        <Pending label="WAITING FOR ACCEPT TX…" />
      ) : state.step === "confirming" ? (
        <Pending label="FINALIZING ON SERVER…" />
      ) : state.step === "accepted" ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
            ✓ Accepted — redirecting to play…
          </div>
          <a href={playHref} style={{ ...primary(), textDecoration: "none", display: "inline-block" }}>
            Play Now →
          </a>
        </div>
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

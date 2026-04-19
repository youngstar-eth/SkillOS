"use client";

import { useState } from "react";
import {
  createPublicClient,
  http,
  parseUnits,
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
  CHALLENGE_ESCROW_ADDRESS,
  USDC_ABI,
  slugToBytes32,
} from "../contracts";

export interface ChallengeEntryButtonProps {
  gameSlug: string;
  /** Apps should pass `process.env.NEXT_PUBLIC_CHALLENGES === "1"`. */
  enabled?: boolean;
  variant?: "primary" | "ghost";
}

type Step =
  | "idle"
  | "picking"
  | "creating_db"
  | "approving"
  | "approve_pending"
  | "creating_chain"
  | "chain_pending"
  | "confirming"
  | "done"
  | "error";

const STAKE_OPTIONS: Array<0.5 | 1 | 5> = [0.5, 1, 5];
const DURATION_OPTIONS: Array<{
  label: string;
  seconds: 3600 | 86400 | 604800;
}> = [
  { label: "1h", seconds: 3600 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 },
];

const USDC_DECIMALS = 6;

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

/**
 * Pre-play on-chain duel entry. Flow:
 *   1. Wallet connect (guard)
 *   2. Pick stake/duration
 *   3. POST /api/challenge/create → receive onchainId, contractAddress, stakeAtomic
 *   4. USDC.approve(escrow, stake) → wait
 *   5. contract.createChallenge(onchainId, slugBytes32, stake, duration) → wait
 *   6. POST /api/challenge/[id]/confirm-create → DB status flips to 'open'
 *   7. Render share URL + Play link
 */
export function ChallengeEntryButton({
  gameSlug,
  enabled = false,
  variant = "primary",
}: ChallengeEntryButtonProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    challengeId: string;
    shareUrl: string;
    playHref: string;
  } | null>(null);

  if (!enabled) return null;

  const buttonStyle: React.CSSProperties =
    variant === "primary"
      ? {
          background: "#FFC72C",
          color: "#0B0B0F",
          border: "none",
          padding: "12px 18px",
          fontSize: 12,
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
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          width: "100%",
          fontFamily: "monospace",
        };

  const onIdleClick = () => {
    setError(null);
    if (!isConnected) {
      const c = connectors[0];
      if (c) connect({ connector: c });
      return;
    }
    setStep("picking");
  };

  const runCreateFlow = async (
    stakeUsdc: 0.5 | 1 | 5,
    durationSeconds: 3600 | 86400 | 604800,
  ) => {
    if (!address) return;
    setError(null);

    try {
      // ── 1. Create DB row ──────────────────────────────────────────────
      setStep("creating_db");
      const createRes = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          creatorAddress: address,
          stakeUsdc,
          durationSeconds,
        }),
      });
      const createData = (await createRes.json()) as {
        ok?: boolean;
        challengeId?: string;
        onchainId?: Hex;
        contractAddress?: Address;
        stakeUsdcAtomic?: string;
        usdcAddress?: Address;
        gameSlugBytes32?: Hex;
        durationSeconds?: number;
        error?: string;
      };
      if (!createRes.ok || !createData.ok || !createData.challengeId) {
        throw new Error(createData.error ?? `HTTP ${createRes.status}`);
      }
      const {
        challengeId,
        onchainId,
        contractAddress,
        stakeUsdcAtomic,
        usdcAddress,
      } = createData;
      if (!onchainId || !contractAddress || !stakeUsdcAtomic || !usdcAddress) {
        throw new Error("missing_onchain_fields_in_create_response");
      }

      const stakeAtomic = BigInt(stakeUsdcAtomic);
      const gameSlugBytes32 =
        createData.gameSlugBytes32 ?? (slugToBytes32(gameSlug) as Hex);

      // ── 2. USDC approve ───────────────────────────────────────────────
      setStep("approving");
      const approveTx = await writeContractAsync({
        address: usdcAddress as Address,
        abi: USDC_ABI,
        functionName: "approve",
        args: [contractAddress as Address, stakeAtomic],
      });
      setStep("approve_pending");
      await waitForTxSuccess(approveTx as Hex);

      // ── 3. createChallenge on-chain ───────────────────────────────────
      setStep("creating_chain");
      const createTx = await writeContractAsync({
        address: contractAddress as Address,
        abi: CHALLENGE_ESCROW_ABI,
        functionName: "createChallenge",
        args: [
          onchainId,
          gameSlugBytes32,
          stakeAtomic,
          BigInt(durationSeconds),
        ],
      });
      setStep("chain_pending");
      await waitForTxSuccess(createTx as Hex);

      // ── 4. Confirm with server ────────────────────────────────────────
      setStep("confirming");
      const confirmRes = await fetch(
        `/api/challenge/${challengeId}/confirm-create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorAddress: address,
            txHash: createTx,
          }),
        },
      );
      const confirmData = (await confirmRes.json()) as {
        ok?: boolean;
        error?: string;
        reason?: string;
      };
      if (!confirmRes.ok || !confirmData.ok) {
        // Non-fatal — on-chain state is already created. Log + expose.
        console.warn(
          "[ChallengeEntryButton] confirm-create failed",
          confirmData,
        );
      }

      const base = typeof window !== "undefined" ? window.location.origin : "";
      const shareUrl = `${base}/challenge/${challengeId}`;
      const playHref = `${base}/challenge/${challengeId}`;
      setResult({ challengeId, shareUrl, playHref });
      setStep("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ChallengeEntryButton]", e);
      setError(msg);
      setStep("error");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (step === "idle" || step === "error") {
    return (
      <div>
        <button
          type="button"
          onClick={onIdleClick}
          disabled={connectStatus === "pending"}
          style={buttonStyle}
        >
          {!isConnected
            ? connectStatus === "pending"
              ? "Connecting…"
              : "Connect & Challenge"
            : step === "error"
              ? "Retry"
              : "Challenge a Friend"}
        </button>
        {error ? (
          <div
            style={{
              padding: 8,
              marginTop: 8,
              border: "1px solid rgba(220,50,50,0.4)",
              background: "rgba(220,50,50,0.08)",
              color: "#F55",
              fontFamily: "monospace",
              fontSize: 10,
              wordBreak: "break-all",
            }}
          >
            {error.slice(0, 300)}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "picking") {
    return (
      <div
        style={{
          padding: 14,
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.05)",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: 11,
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
                onClick={() => runCreateFlow(s, d.seconds)}
                style={{
                  background: "rgba(255,199,44,0.08)",
                  color: "#FFC72C",
                  border: "1px solid rgba(255,199,44,0.4)",
                  padding: "6px 10px",
                  fontSize: 10,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                {s} USDC · {d.label}
              </button>
            )),
          )}
        </div>
      </div>
    );
  }

  if (step === "done" && result) {
    return (
      <div
        style={{
          padding: 14,
          border: "2px solid #FFC72C",
          background:
            "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,199,44,0.2) 100%)",
          color: "#FFC72C",
          fontFamily: "monospace",
          fontSize: 11,
          textAlign: "center",
        }}
      >
        <div style={{ letterSpacing: "0.2em", marginBottom: 6 }}>
          CHALLENGE LIVE · ON-CHAIN
        </div>
        <input
          readOnly
          value={result.shareUrl}
          style={{
            width: "100%",
            border: "1px solid rgba(255,199,44,0.5)",
            background: "rgba(0,0,0,0.3)",
            color: "#FFC72C",
            padding: "6px 8px",
            fontSize: 10,
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
                  await navigator.share({ url: result.shareUrl });
                } catch {
                  /* dismissed */
                }
                return;
              }
              await navigator.clipboard?.writeText(result.shareUrl);
            }}
          >
            Share
          </button>
          <a
            href={result.playHref}
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

  // pending states
  const pendingLabel: Record<Step, string> = {
    idle: "",
    picking: "",
    creating_db: "PREPARING CHALLENGE…",
    approving: "APPROVE USDC IN WALLET…",
    approve_pending: "WAITING FOR APPROVAL TX…",
    creating_chain: "SIGN createChallenge IN WALLET…",
    chain_pending: "WAITING FOR CREATE TX…",
    confirming: "FINALIZING ON SERVER…",
    done: "",
    error: "",
  };

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid rgba(255,199,44,0.4)",
        background: "rgba(255,199,44,0.05)",
        color: "#FFC72C",
        fontFamily: "monospace",
        fontSize: 11,
        letterSpacing: "0.15em",
        textAlign: "center",
      }}
    >
      {pendingLabel[step]}
    </div>
  );
}

// Silence unused-parameter warning
const _parseUnits = parseUnits;
void _parseUnits;

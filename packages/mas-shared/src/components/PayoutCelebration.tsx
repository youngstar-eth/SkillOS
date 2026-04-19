"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";

export interface PayoutCelebrationProps {
  /** Connected wallet address. If absent, component renders nothing. */
  userAddress?: string;
  gameSlug: string;
  score: number;
  /**
   * Feature flag. Apps should pass
   * `process.env.NEXT_PUBLIC_INSTANT_PAYOUT === "1"`.
   * Defaults to false so the component ships dark.
   */
  enabled?: boolean;
  /** Default "base-sepolia". Drives the basescan host. */
  chainSlug?: "base-sepolia" | "base-mainnet";
}

type State =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "not_eligible" }
  | { status: "paying" }
  | { status: "paid"; amount: number; txHash: string; basescanUrl: string }
  | {
      status: "duplicate";
      txHash: string | null;
      basescanUrl: string | null;
    }
  | { status: "error"; message: string };

const DELAY_BEFORE_CHECK_MS = 1200;
const LOG_PREFIX = "[PayoutCelebration]";

/**
 * Game-over companion: after AutoSubmitScore lands, this component asks the
 * server whether the connected wallet is rank 1 for the game's current
 * window. If yes, the server wallet fires a USDC.transfer, we animate the
 * "you won" state, and surface the Basescan tx.
 *
 * The server enforces rank-1; the client is purely a trigger. The shared
 * payout helper's UNIQUE partial index + two-phase INSERT guards against
 * double-pay on duplicate clicks or parallel tabs.
 *
 * Wrapped in an ErrorBoundary so a crash inside the payout chain (network,
 * rendering, etc.) never takes down the surrounding GameOver modal.
 */
export function PayoutCelebration(props: PayoutCelebrationProps) {
  return (
    <PayoutErrorBoundary>
      <PayoutCelebrationInner {...props} />
    </PayoutErrorBoundary>
  );
}

function PayoutCelebrationInner({
  userAddress,
  gameSlug,
  score,
  enabled = false,
  chainSlug = "base-sepolia",
}: PayoutCelebrationProps) {
  const [state, setState] = useState<State>({ status: "idle" });
  const ranRef = useRef(false);

  // Hold a ref to the latest score so effect can read it without re-running
  // every time the parent re-renders (wordle's score recalculates each render
  // because it includes `Date.now() - startedAt` for the speed bonus).
  const scoreRef = useRef(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    if (!enabled) {
      console.debug(LOG_PREFIX, "disabled (flag off)");
      return;
    }
    if (!userAddress) {
      console.debug(LOG_PREFIX, "no userAddress yet");
      return;
    }
    if (scoreRef.current <= 0) {
      console.debug(LOG_PREFIX, "score <= 0, skipping", {
        score: scoreRef.current,
      });
      return;
    }
    if (ranRef.current) {
      console.debug(LOG_PREFIX, "already ran, skipping duplicate mount");
      return;
    }
    ranRef.current = true;

    let cancelled = false;
    setState({ status: "checking" });
    console.debug(LOG_PREFIX, "checking eligibility", { userAddress, gameSlug });

    // Let AutoSubmitScore POST /api/submit-score land first so the
    // leaderboard reflects this run before we check rank.
    const delay = window.setTimeout(() => {
      void (async () => {
        try {
          setState({ status: "paying" });
          const res = await fetch("/api/payout/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAddress, gameSlug }),
          });
          let data: Record<string, unknown> = {};
          try {
            data = (await res.json()) as Record<string, unknown>;
          } catch {
            /* body wasn't JSON */
          }
          console.debug(LOG_PREFIX, "trigger response", { status: res.status, data });

          if (cancelled) return;

          if (!res.ok) {
            const err = data.error;
            if (err === "not_rank_1" || err === "instant_payout_disabled") {
              setState({ status: "not_eligible" });
              return;
            }
            setState({
              status: "error",
              message:
                (typeof data.message === "string" && data.message) ||
                (typeof data.error === "string" && data.error) ||
                `HTTP ${res.status}`,
            });
            return;
          }

          if (data.duplicate === true) {
            setState({
              status: "duplicate",
              txHash: (data.txHash as string | undefined) ?? null,
              basescanUrl: (data.basescanUrl as string | undefined) ?? null,
            });
            return;
          }

          const amount =
            typeof data.amount === "number" ? data.amount : 0;
          const txHash =
            typeof data.txHash === "string" ? data.txHash : "";
          const basescanUrl =
            typeof data.basescanUrl === "string" ? data.basescanUrl : "";

          setState({ status: "paid", amount, txHash, basescanUrl });
          fireConfetti();
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(LOG_PREFIX, "fetch threw", e);
          setState({ status: "error", message: msg });
        }
      })();
    }, DELAY_BEFORE_CHECK_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(delay);
    };
    // We intentionally omit `score` here — see scoreRef above. The effect
    // guards against re-entry with ranRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userAddress, gameSlug]);

  if (!enabled) return null;
  if (state.status === "idle") return null;
  if (state.status === "not_eligible") return null;

  if (state.status === "checking" || state.status === "paying") {
    return (
      <div
        style={{
          padding: "12px",
          border: "1px solid rgba(255,199,44,0.4)",
          background: "rgba(255,199,44,0.08)",
          color: "#FFC72C",
          fontSize: "12px",
          fontFamily: "monospace",
          letterSpacing: "0.08em",
          textAlign: "center",
          animation: "mas-pulse 1.4s ease-in-out infinite",
        }}
      >
        <style>{`@keyframes mas-pulse { 0%,100% { opacity: 0.6 } 50% { opacity: 1 } }`}</style>
        {state.status === "checking"
          ? "CALCULATING WINNER…"
          : "SENDING YOUR USDC…"}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        style={{
          padding: "10px",
          border: "1px solid rgba(220,50,50,0.3)",
          background: "rgba(220,50,50,0.08)",
          color: "#F55",
          fontSize: "11px",
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        Payout error: {state.message.slice(0, 200)}
      </div>
    );
  }

  const isPaid = state.status === "paid";
  const amount = isPaid ? state.amount : null;
  const txHash = state.txHash;
  const basescanUrl = state.basescanUrl;

  return (
    <div
      style={{
        padding: "20px 16px",
        border: "2px solid #FFC72C",
        background:
          "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,199,44,0.22) 100%)",
        color: "#FFC72C",
        textAlign: "center",
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.25em",
          opacity: 0.7,
        }}
      >
        {isPaid ? "YOU WON" : "ALREADY PAID"}
      </div>
      {amount !== null && (
        <div
          style={{
            fontSize: "36px",
            fontWeight: 700,
            marginTop: "6px",
            lineHeight: 1,
            animation: isPaid ? "mas-countup 700ms ease-out" : undefined,
          }}
        >
          <style>{`@keyframes mas-countup { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
          +{amount.toFixed(2)} USDC
        </div>
      )}
      {basescanUrl && txHash && (
        <div style={{ marginTop: "10px", fontSize: "11px" }}>
          <a
            href={basescanUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#FFC72C",
              textDecoration: "underline",
              letterSpacing: "0.05em",
            }}
          >
            View tx {txHash.slice(0, 10)}… on Basescan →
          </a>
        </div>
      )}
      <div style={{ marginTop: "12px" }}>
        <ShareWinButton
          gameSlug={gameSlug}
          score={scoreRef.current}
          amount={amount ?? 0}
          userAddress={userAddress ?? ""}
        />
      </div>
      <div
        style={{
          marginTop: "8px",
          fontSize: "9px",
          opacity: 0.4,
          letterSpacing: "0.15em",
        }}
      >
        {chainSlug === "base-mainnet" ? "BASE MAINNET" : "BASE SEPOLIA"}
      </div>
    </div>
  );
}

function ShareWinButton({
  gameSlug,
  score,
  amount,
  userAddress,
}: {
  gameSlug: string;
  score: number;
  amount: number;
  userAddress: string;
}) {
  const [copied, setCopied] = useState(false);

  const shareText = `I just won ${amount.toFixed(
    2,
  )} USDC playing ${gameSlug} on Skillbase. Beat me →`;
  const shareUrl = `https://skillbase.games/?game=${gameSlug}&from=${userAddress}&score=${score}`;

  const onClick = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
      } catch {
        /* user dismissed — silent */
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* noop */
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#FFC72C",
        color: "#0B0B0F",
        border: "none",
        padding: "8px 16px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.2em",
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      {copied ? "Copied!" : "Share Win"}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Error boundary — a thrown error in the payout chain MUST NOT take down
// the GameOver modal. Catches render + lifecycle throws and falls back to
// a subdued single-line warning, preserving the rest of the UI.
// ───────────────────────────────────────────────────────────────────────────
class PayoutErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(
      LOG_PREFIX,
      "boundary caught error",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "8px 10px",
            border: "1px dashed rgba(255,199,44,0.3)",
            background: "rgba(255,199,44,0.05)",
            color: "#FFC72C",
            fontSize: "10px",
            fontFamily: "monospace",
            opacity: 0.7,
          }}
        >
          Celebration unavailable — open DevTools console for details.
        </div>
      );
    }
    return this.props.children;
  }
}

// Dynamically load canvas-confetti so the component stays lean on apps that
// don't install it. Respects prefers-reduced-motion.
function fireConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  void (async () => {
    try {
      // Dynamic runtime dep — we cast through unknown because the host app
      // may or may not have @types/canvas-confetti installed.
      const mod = (await import(
        /* webpackIgnore: false */ "canvas-confetti" as string
      ).catch(() => null)) as
        | { default?: (o?: object) => void }
        | ((o?: object) => void)
        | null;
      if (!mod) return;
      const confetti: (o?: object) => void =
        typeof mod === "function"
          ? (mod as (o?: object) => void)
          : ((mod as { default?: (o?: object) => void }).default ??
            ((): void => {}));
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.65 },
        colors: ["#FFC72C", "#FFFFFF", "#0B0B0F"],
      });
      window.setTimeout(
        () =>
          confetti({
            particleCount: 80,
            spread: 140,
            origin: { y: 0.3 },
            colors: ["#FFC72C", "#FFFFFF"],
          }),
        400,
      );
    } catch {
      // canvas-confetti not installed or failed to load — celebration works
      // without particles.
    }
  })();
}

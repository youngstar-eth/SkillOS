"use client";

import { useEffect, useState } from "react";

export interface AutoSubmitScoreProps {
  /** Connected wallet address. If absent, no submit happens. */
  userAddress?: string;
  gameSlug: string;
  /** Final score for the run (≥ 0). */
  score: number;
  /** Optional on-chain tournament id (for x-ref in payouts). */
  tournamentId?: number;
  /** Game-specific extras (grid, guesses, terrain seed, etc.) for replay. */
  gameData?: Record<string, unknown>;
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "ok"; scoreId: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

/**
 * Fires a single POST /api/submit-score the moment the component mounts (i.e.
 * when game-over renders this slot). Idempotent inside the component lifecycle
 * — won't double-submit on re-render. The server-side rate limit + dedup-by-
 * stats-hash protect against bursts across remounts.
 */
export function AutoSubmitScore({
  userAddress,
  gameSlug,
  score,
  tournamentId,
  gameData,
}: AutoSubmitScoreProps) {
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    if (!userAddress) {
      setState({
        status: "skipped",
        reason: "Wallet not connected — leaderboard submit skipped.",
      });
      return;
    }
    if (score <= 0) {
      setState({
        status: "skipped",
        reason: "Score is 0 — no leaderboard entry.",
      });
      return;
    }

    setState({ status: "submitting" });
    fetch("/api/submit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAddress,
        gameSlug,
        score,
        tournamentId,
        gameData,
      }),
    })
      .then(async (r) => {
        const data = (await r.json()) as { scoreId?: string; error?: string };
        if (!r.ok) {
          throw new Error(
            data.error ? `${data.error} (HTTP ${r.status})` : `HTTP ${r.status}`,
          );
        }
        if (!cancelled) {
          setState({ status: "ok", scoreId: data.scoreId ?? "" });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // Submit fires once per mount; re-submitting on prop change isn't desired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base: React.CSSProperties = {
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 4,
    fontSize: 11.5,
    fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
    letterSpacing: "0.04em",
    border: "1px solid",
  };

  if (state.status === "ok") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(52, 211, 120, 0.08)",
          borderColor: "rgba(52, 211, 120, 0.4)",
          color: "#34D378",
        }}
      >
        ✓ Submitted to leaderboard
      </div>
    );
  }
  if (state.status === "submitting") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(255, 199, 44, 0.06)",
          borderColor: "rgba(255, 199, 44, 0.3)",
          color: "#FFC72C",
        }}
      >
        Submitting to leaderboard…
      </div>
    );
  }
  if (state.status === "skipped") {
    return (
      <div
        style={{
          ...base,
          borderColor: "rgb(var(--color-border, 55 57 62))",
          color: "rgb(var(--color-fg, 255 255 255) / 0.55)",
        }}
      >
        {state.reason}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(237, 68, 90, 0.06)",
          borderColor: "rgba(237, 68, 90, 0.4)",
          color: "#ED445A",
        }}
      >
        Leaderboard submit failed: {state.message}
      </div>
    );
  }
  return null;
}

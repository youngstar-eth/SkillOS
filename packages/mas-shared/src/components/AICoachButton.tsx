"use client";

import { useState } from "react";

export interface AICoachButtonProps {
  gameSlug: string;
  /** Wallet address — used as cache key scope. Lowercased server-side. */
  userAddress: string;
  score: number;
  /** Game-specific stats. Shape must match prompts/<slug>.ANALYSIS_PROMPT. */
  stats: Record<string, unknown>;
  tournamentId?: number;
}

/**
 * Click-to-reveal AI coach narration. Idempotent at the server via
 * (user, game, stats_hash) — replaying the same run returns the cached
 * narration without a fresh Claude call.
 */
export function AICoachButton({
  gameSlug,
  userAddress,
  score,
  stats,
  tournamentId,
}: AICoachButtonProps) {
  const [narration, setNarration] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          userAddress,
          score,
          stats,
          tournamentId,
        }),
      });
      const data = (await res.json()) as {
        narration?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error
            ? `${data.error}${data.detail ? ": " + data.detail : ""}`
            : `HTTP ${res.status}`,
        );
      }
      setNarration(data.narration ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (narration) {
    return (
      <div
        style={{
          marginTop: 14,
          padding: "14px 16px",
          border: "1px solid rgba(255, 199, 44, 0.4)",
          background: "rgba(255, 199, 44, 0.06)",
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#FFC72C",
          }}
        >
          🤖 AI coach
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {narration}
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        style={{
          width: "100%",
          minHeight: 40,
          border: "1px solid rgba(255, 199, 44, 0.4)",
          background: "rgba(255, 199, 44, 0.08)",
          borderRadius: 6,
          color: "#FFC72C",
          fontFamily:
            "var(--font-sans, 'Inter', 'Helvetica Neue', Arial, sans-serif)",
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: "0.02em",
          cursor: loading ? "progress" : "pointer",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 200ms cubic-bezier(0.2,0.8,0.2,1)",
        }}
      >
        {loading ? "Analysing run…" : "🤖 AI Coach Analysis"}
      </button>
      {error ? (
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#ED445A",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

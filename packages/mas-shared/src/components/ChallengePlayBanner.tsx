"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export interface ChallengePlayBannerProps {
  challengeId: string;
  gameSlug: string;
  /** Polling interval for challenge state (ms). Default 4000. */
  pollMs?: number;
}

type ChallengeStatus =
  | "pending_creator_stake"
  | "open"
  | "accepted"
  | "creator_played"
  | "challenger_played"
  | "both_played"
  | "settled"
  | "expired_refunded"
  | "walkover_creator"
  | "walkover_challenger"
  | "cancelled";

interface Challenge {
  id: string;
  status: ChallengeStatus;
  creator_address: string;
  challenger_address: string | null;
  creator_score: number | null;
  challenger_score: number | null;
  payout_tx_hash: string | null;
  winner_address: string | null;
  stake_usdc: number;
}

/**
 * Client companion for the challenge play page. Three responsibilities:
 *   1. Role banner: show whose turn status / opponent progress.
 *   2. Manual "Submit My Score" button — reads the latest game_scores row
 *      for this (user, gameSlug) and POSTs to /api/challenge/<id>/submit-score.
 *      Auto-triggered once when the latest game_scores row is fresh (<90s).
 *   3. Poll challenge status; when both_played → settled, surface payout
 *      tx link + winner banner.
 *
 * We intentionally keep Game.tsx untouched — that component already writes
 * the run to game_scores via AutoSubmitScore. This wrapper watches the
 * server side and forwards the player's score into the challenge row.
 */
export function ChallengePlayBanner({
  challengeId,
  gameSlug,
  pollMs = 4000,
}: ChallengePlayBannerProps) {
  const { address } = useAccount();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoSubmittedRef = useRef(false);

  // Poll challenge state
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/challenge/${challengeId}`);
        const data = (await res.json()) as { challenge?: Challenge };
        if (!cancelled && data.challenge) setChallenge(data.challenge);
      } catch {
        /* swallow — will retry */
      }
    };
    void load();
    const t = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [challengeId, pollMs]);

  const role = !address || !challenge
    ? "spectator"
    : address.toLowerCase() === challenge.creator_address.toLowerCase()
      ? "creator"
      : challenge.challenger_address &&
        address.toLowerCase() === challenge.challenger_address.toLowerCase()
      ? "challenger"
      : "spectator";

  const mySubmitted =
    role === "creator"
      ? challenge?.creator_score !== null
      : role === "challenger"
      ? challenge?.challenger_score !== null
      : true;

  const oppSubmitted =
    role === "creator"
      ? challenge?.challenger_score !== null
      : role === "challenger"
      ? challenge?.creator_score !== null
      : true;

  const canSubmit =
    challenge &&
    !mySubmitted &&
    (role === "creator" || role === "challenger") &&
    (challenge.status === "accepted" ||
      challenge.status === "creator_played" ||
      challenge.status === "challenger_played");

  const submitMyScore = async () => {
    if (!address || !challenge) return;
    setSubmitting(true);
    setError(null);
    try {
      // Pull the player's latest game_scores row for this game via my-stats
      const mine = await fetch(
        `/api/my-stats?address=${address}`,
      ).then((r) => r.json());
      const gameStats = mine?.gameRanks?.[gameSlug];
      const bestScore = gameStats?.bestScore ?? null;
      if (bestScore === null || bestScore === undefined) {
        setError(
          "No score found on the leaderboard yet — finish a run, then submit.",
        );
        setSubmitting(false);
        return;
      }
      const res = await fetch(
        `/api/challenge/${challengeId}/submit-score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: address,
            score: bestScore,
            gameData: { source: "ChallengePlayBanner" },
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settled?: boolean;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-submit once if we detect my score is on the leaderboard but not in
  // the challenge yet. Gives a smoother UX — user doesn't need to click.
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    if (!canSubmit) return;
    autoSubmittedRef.current = true;
    void submitMyScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, address, challenge?.status]);

  // ─── Render ──────────────────────────────────────────────────────────────
  if (!challenge) {
    return <Banner label="Loading challenge…" tone="neutral" />;
  }

  if (challenge.status === "settled") {
    const iWon =
      address &&
      challenge.winner_address?.toLowerCase() === address.toLowerCase();
    return (
      <Banner
        label={
          iWon
            ? `🏆 You won — ${challenge.stake_usdc * 2 * 0.9} USDC sent`
            : `Challenge settled. Winner: ${challenge.winner_address?.slice(0, 8)}…`
        }
        tone={iWon ? "win" : "neutral"}
        txHash={challenge.payout_tx_hash ?? undefined}
      />
    );
  }

  if (challenge.status === "walkover_creator") {
    return (
      <Banner
        label="Opponent timed out — creator wins by walkover."
        tone="win"
        txHash={challenge.payout_tx_hash ?? undefined}
      />
    );
  }
  if (challenge.status === "walkover_challenger") {
    return (
      <Banner
        label="Creator timed out — challenger wins by walkover."
        tone="win"
        txHash={challenge.payout_tx_hash ?? undefined}
      />
    );
  }
  if (challenge.status === "expired_refunded") {
    return <Banner label="Challenge expired — stakes refunded." tone="neutral" />;
  }
  if (challenge.status === "cancelled") {
    return <Banner label="Challenge cancelled." tone="neutral" />;
  }

  if (role === "spectator") {
    return (
      <Banner
        label={`Spectating — ${challenge.status}`}
        tone="neutral"
      />
    );
  }

  if (mySubmitted && !oppSubmitted) {
    return (
      <Banner
        label="Your score is in — waiting for your opponent…"
        tone="neutral"
      />
    );
  }

  if (mySubmitted && oppSubmitted) {
    return <Banner label="Both played — settling…" tone="neutral" />;
  }

  // My turn — need to submit
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid rgba(255,199,44,0.4)",
        background: "rgba(255,199,44,0.05)",
        color: "#FFC72C",
        fontFamily: "monospace",
        fontSize: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.75 }}>
        DUEL · {challenge.stake_usdc} USDC · you are {role}
      </div>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        Play the run below. Your best score will be submitted automatically.
      </div>
      <button
        type="button"
        disabled={submitting}
        onClick={submitMyScore}
        style={{
          marginTop: 10,
          background: "#FFC72C",
          color: "#0B0B0F",
          border: "none",
          padding: "6px 12px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: submitting ? "not-allowed" : "pointer",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? "Submitting…" : "Submit Score Now"}
      </button>
      {error ? (
        <div style={{ color: "#F55", fontSize: 10, marginTop: 6, wordBreak: "break-all" }}>
          {error.slice(0, 200)}
        </div>
      ) : null}
    </div>
  );
}

function Banner({
  label,
  tone,
  txHash,
}: {
  label: string;
  tone: "win" | "neutral";
  txHash?: string;
}) {
  const border =
    tone === "win" ? "2px solid #FFC72C" : "1px solid rgba(255,199,44,0.3)";
  const bg =
    tone === "win"
      ? "linear-gradient(135deg, rgba(255,199,44,0.08) 0%, rgba(255,199,44,0.2) 100%)"
      : "rgba(255,199,44,0.05)";
  return (
    <div
      style={{
        padding: 12,
        border,
        background: bg,
        color: "#FFC72C",
        fontFamily: "monospace",
        fontSize: 12,
        textAlign: "center",
        marginBottom: 16,
      }}
    >
      {label}
      {txHash ? (
        <div style={{ marginTop: 6, fontSize: 10 }}>
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#FFC72C", textDecoration: "underline" }}
          >
            tx {txHash.slice(0, 10)}… on Basescan →
          </a>
        </div>
      ) : null}
    </div>
  );
}

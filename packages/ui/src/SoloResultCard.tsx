"use client";

// ───────────────────────────────────────────────────────────────────────────
// SoloResultCard — the "submitted" status card from solo/page.tsx, lifted
// from a 6× templated duplication into a single shared component.
//
// Refactor history:
//   - PR #26 fixed solo result UX with templated edits across 6 game apps
//     (current submission score + NEW BEST badge + cycle-aware best label).
//   - PR #27 demonstrated the shared-component pattern via <Header> in
//     packages/ui — one edit fixes 6 consumers.
//   - This component applies that pattern to the result card, eliminating
//     the templating drift class for any future SoloResultCard tweak.
//
// Slot architecture (why render-props instead of direct imports):
//   The four AI-feature components (AIReviewedBadge, SPEarnedCard, AIRecap,
//   AICoach) are passed as React.ReactNode slots by each consuming app,
//   not imported here. Reason: AIRecap.tsx hardcodes its app's subdomain
//   (`process.env.NEXT_PUBLIC_URL ?? "https://2048.skillbase.games"` etc.)
//   as a fallback URL — a per-app constant that can't be lifted to packages/ui
//   without a parallel env-var refactor. Since AIRecap can't be lifted
//   without scope creep, the slot pattern was used for symmetry across all
//   four AI components. This also keeps SoloResultCard logic-free: no
//   conditionals, no app-specific branches, just layout + score-display
//   semantics.
//
// Visual contract:
//   The rendered DOM at /tournament/solo's "submitted" state must be
//   byte-identical to the pre-extraction templated version. This is a
//   pure refactor — zero observable behavior change.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import React from "react";

export type SoloResultCardProps = {
  /** Score from the run that just ended; may be null on localStorage replay. */
  finalScore: number | null;
  /** Player's tournament best score (server-returned). */
  bestScore: number;
  /** Tournament cycle — drives "Daily best" / "Weekly best" label. */
  cycleType: "daily" | "weekly";

  /** Player's rank in the tournament leaderboard. */
  rank: number;
  /** Player's total submitted runs in this tournament. */
  matchCount: number;
  /** Whether this submission cost 1 USDC (paid retry) or was free. */
  isPaidRetry: boolean;

  /** Click handler for "Play again" — wires through to chargeRetryFee + replay. */
  onPlayAgain: () => void;
  /** Disables the "Play again" button while a wallet operation is in-flight. */
  walletBusy: boolean;
  /** Where "View tournament" links to. Defaults to "/tournament". */
  tournamentHref?: string;

  /** Per-app slot for the AI-reviewed badge. */
  aiReviewedBadge: React.ReactNode;
  /** Per-app slot for the SP-earned card. */
  spEarnedCard: React.ReactNode;
  /** Per-app slot for the AI recap card. */
  aiRecap: React.ReactNode;
  /** Per-app slot for the AI coach card. */
  aiCoach: React.ReactNode;
};

export const SoloResultCard: React.FC<SoloResultCardProps> = ({
  finalScore,
  bestScore,
  cycleType,
  rank,
  matchCount,
  isPaidRetry,
  onPlayAgain,
  walletBusy,
  tournamentHref = "/tournament",
  aiReviewedBadge,
  spEarnedCard,
  aiRecap,
  aiCoach,
}) => {
  const isNewBest = finalScore != null && finalScore === bestScore;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
      {/* Highlight panel — Panel(highlight=true) Tailwind classes inlined here
          to avoid a separate Panel prop or duplicating the local Panel function
          from each app's solo/page.tsx. The other Panel uses (loading, error,
          submitting status states) remain in each app's local Panel function. */}
      <div className="rounded-xl border border-skill/50 bg-skill/5 p-4">
        <p className="text-sm font-semibold text-neutral-100">
          Score submitted ✓ {finalScore ?? bestScore} points
          {isNewBest && (
            <span className="ml-2 text-xs font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
              NEW BEST
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {cycleType === "daily" ? "Daily best" : "Weekly best"}: {bestScore}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Rank #{rank} · {matchCount}{" "}
          {matchCount === 1 ? "run" : "runs"} submitted
          {" · 1.00 USDC fee"}
        </p>
        <div className="mt-3">{aiReviewedBadge}</div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPlayAgain}
            disabled={walletBusy}
            className="flex-1 rounded-lg bg-skill px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Play again (1.00 USDC)
          </button>
          <Link
            href={tournamentHref}
            className="flex-1 rounded-lg border border-border bg-bg-elev px-3 py-2 text-center text-sm font-semibold text-neutral-200 hover:bg-bg-elev2"
          >
            View tournament
          </Link>
        </div>
      </div>
      {spEarnedCard}
      {aiRecap}
      {aiCoach}
    </div>
  );
};

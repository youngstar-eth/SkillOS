"use client";

// ───────────────────────────────────────────────────────────────────────────
// DuelResultCard — the duel post-match result UI.
//
// Three render branches keyed off (status, winnerAddress, viewerAddress):
//
//   1. Match Voided — status='settled' AND winnerAddress IS null.
//      Defense-in-depth fallback for the "lie state" class of bug
//      (DB says settled but no on-chain settlement happened). Should be
//      near-zero in production thanks to the settle-guard pre-flight (PR #4)
//      and the daily reconcile-duels cron sweep (this PR), but if a row
//      ever surfaces, the user sees a meaningful message instead of a
//      silent failure. Stake reconciliation runs automatically.
//
//   2. You won — viewerAddress matches winnerAddress.
//
//   3. You lost — winnerAddress is set and ≠ viewerAddress.
//
//   4. Settling… — non-settled status (transient, polled by the page).
//
// Wiring policy (Phase 2 prep):
//   This component is BUILT but NOT YET WIRED into any of the 6 game apps.
//   All apps still render <DuelComingSoon /> at /duel/[id]/result while
//   duels are paused. v2.2 cutover (smart-contract reactivation) will swap
//   <DuelComingSoon /> for <DuelResultCard /> in each app — a one-line
//   change, plus passing the fetched match + viewer address.
//
// Slot architecture (lifted from SoloResultCard):
//   AI components (AIRecap, SPEarnedCard) are passed as React.ReactNode
//   slots so each app supplies its own subdomain-bound URL helpers, keeping
//   this component logic-free. Slots are optional (this PR ships the
//   render shell; AI wiring is a v2.2 follow-up).
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import React from "react";
import type { Address } from "viem";
import {
  selectDuelResultBranch,
  type DuelResultBranch,
} from "./duel-result-branch";

export type { DuelResultBranch };

export interface DuelResultCardProps {
  /** v2_duels status. "settled" + winnerAddress=null → Match Voided. */
  status: "queued" | "matched" | "player1_submitted" | "player2_submitted" | "settled" | "refunded";
  /** Winner address from the contract / DB. null for void or pre-settle. */
  winnerAddress: Address | null;
  /** The connected wallet viewing this page. */
  viewerAddress: Address | null;
  /** Both players' final scores (rendered for context). null while pre-submit. */
  player1Score: number | null;
  player2Score: number | null;
  /** Where the "Back to lobby" link points. Default "/duel". */
  duelHref?: string;
  /** Optional AI-recap card slot (per-app, see SoloResultCard rationale). */
  aiRecap?: React.ReactNode;
  /** Optional SP-earned card slot. */
  spEarnedCard?: React.ReactNode;
}

export const DuelResultCard: React.FC<DuelResultCardProps> = ({
  status,
  winnerAddress,
  viewerAddress,
  player1Score,
  player2Score,
  duelHref = "/duel",
  aiRecap,
  spEarnedCard,
}) => {
  const branch = selectDuelResultBranch({ status, winnerAddress, viewerAddress });

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {branch === "void" && <VoidedPanel duelHref={duelHref} />}
        {branch === "win" && (
          <ResultPanel
            tone="win"
            headline="You won"
            subline={scoreSummary(player1Score, player2Score)}
            duelHref={duelHref}
          />
        )}
        {branch === "loss" && (
          <ResultPanel
            tone="loss"
            headline="You lost"
            subline={scoreSummary(player1Score, player2Score)}
            duelHref={duelHref}
          />
        )}
        {branch === "pending" && (
          <ResultPanel
            tone="pending"
            headline="Settling…"
            subline="Confirming on-chain. This usually takes a few seconds."
            duelHref={duelHref}
          />
        )}
        {/* AI slots — optional in this PR. Wired in v2.2 cutover. */}
        {spEarnedCard ? <div className="mt-4">{spEarnedCard}</div> : null}
        {aiRecap ? <div className="mt-4">{aiRecap}</div> : null}
      </div>
    </main>
  );
};

// ─── Sub-panels ────────────────────────────────────────────────────────────

function scoreSummary(s1: number | null, s2: number | null): string {
  if (s1 == null || s2 == null) return "Final scores unavailable";
  return `Final: ${s1} vs ${s2}`;
}

const VoidedPanel: React.FC<{ duelHref: string }> = ({ duelHref }) => (
  <div className="rounded-xl border border-border-subtle bg-bg-elev p-6 text-center">
    <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elev2 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
      Match voided
    </p>
    <h1 className="mt-5 text-2xl font-semibold tracking-tight">
      Match could not be settled
    </h1>
    <p className="mt-3 text-sm text-neutral-400">
      Your stake is being reconciled — funds will return to your wallet
      automatically. No SP gained or lost. This is a rare safety fallback
      that triggers when on-chain settlement can&apos;t complete cleanly.
    </p>
    <div className="mt-6 flex flex-col gap-2">
      <Link
        href={duelHref}
        className="inline-flex items-center justify-center rounded-xl border border-border bg-bg-elev2 px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-bg-elev"
      >
        Back to lobby
      </Link>
      <Link
        href="/tournament/solo"
        className="inline-flex items-center justify-center rounded-xl bg-skill px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-400"
      >
        Play solo →
      </Link>
    </div>
  </div>
);

const ResultPanel: React.FC<{
  tone: "win" | "loss" | "pending";
  headline: string;
  subline: string;
  duelHref: string;
}> = ({ tone, headline, subline, duelHref }) => {
  const dotClass =
    tone === "win"
      ? "bg-skill"
      : tone === "loss"
        ? "bg-neutral-500"
        : "bg-blue-400 animate-pulse";
  const labelText =
    tone === "win" ? "Win" : tone === "loss" ? "Loss" : "Pending";
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elev p-6 text-center">
      <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elev2 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {labelText}
      </p>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{headline}</h1>
      <p className="mt-3 text-sm text-neutral-400">{subline}</p>
      <div className="mt-6">
        <Link
          href={duelHref}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-bg-elev2 px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-bg-elev"
        >
          Back to lobby
        </Link>
      </div>
    </div>
  );
};

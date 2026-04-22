"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import {
  basescanTx,
  getMatchStatus,
  truncateAddress,
  type MatchObject,
} from "@skillbase/ui";
import { AICoach } from "@/components/AICoach";
import { AIRecap } from "@/components/AIRecap";
import { AIReviewedBadge } from "@/components/AIReviewedBadge";

type PageProps = { params: { id: string } };

type Outcome = "win" | "lose" | "tie" | "pending";

// 10% platform fee in basis points — mirrors ChallengeEscrow.FEE_BPS.
const FEE_BPS = 1000n;
const BPS_DENOMINATOR = 10_000n;

export default function ResultPage({ params }: PageProps) {
  const matchId = params.id;
  const { address } = useAccount();

  const { data: match, isLoading } = useQuery<MatchObject>({
    queryKey: ["match", matchId],
    queryFn: () => getMatchStatus(matchId),
    refetchInterval: (q) => {
      const d = q.state.data;
      // Stop polling once the match is finalised.
      if (d && (d.status === "settled" || d.status === "refunded")) return false;
      return 3000;
    },
  });

  const { outcome, myScore, oppScore, payoutUsdc } = useMemo(() => {
    if (!match || !address) {
      return {
        outcome: "pending" as Outcome,
        myScore: 0,
        oppScore: 0,
        payoutUsdc: "0",
      };
    }
    const me = address.toLowerCase();
    const isP1 = match.player1.address.toLowerCase() === me;
    const myScore = (isP1 ? match.player1.score : match.player2?.score) ?? 0;
    const oppScore = (isP1 ? match.player2?.score : match.player1.score) ?? 0;

    let outcome: Outcome = "pending";
    if (match.status === "settled" && match.winnerAddress) {
      outcome = match.winnerAddress.toLowerCase() === me ? "win" : "lose";
    } else if (match.status === "settled") {
      // Settled with no winner shouldn't happen under the current contract,
      // but guard anyway.
      outcome = "tie";
    } else if (match.status === "refunded") {
      outcome = "tie";
    }

    // Payout math mirrors the contract: pool = 2 × stake, fee = pool × 10%.
    const stake = BigInt(match.stakeAmount);
    const pool = stake * 2n;
    const fee = (pool * FEE_BPS) / BPS_DENOMINATOR;
    const winnerPayout = pool - fee;
    const payoutUsdc =
      outcome === "win" ? formatUnits(winnerPayout, 6) : "0";
    return { outcome, myScore, oppScore, payoutUsdc };
  }, [match, address]);

  if (isLoading || !match) {
    return (
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4">
        <p className="text-sm text-neutral-400">Loading result…</p>
      </main>
    );
  }

  const headline =
    outcome === "win"
      ? "You won!"
      : outcome === "lose"
        ? "You lost"
        : outcome === "tie"
          ? "Tie / refund"
          : "Settling…";

  const headlineColor =
    outcome === "win"
      ? "text-skill"
      : outcome === "lose"
        ? "text-red-400"
        : outcome === "tie"
          ? "text-neutral-300"
          : "text-neutral-400";

  const p1 = match.player1.address;
  const p2 = match.player2?.address ?? null;
  const winner = match.winnerAddress;

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-border bg-bg-elev p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Match #{match.matchId.slice(0, 6)}
          </p>
          <h1 className={`mt-2 text-4xl font-bold tracking-tight ${headlineColor}`}>
            {headline}
          </h1>
          {outcome === "win" && (
            <p className="mt-3 text-lg font-semibold text-neutral-100">
              Payout: {payoutUsdc} USDC
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <ScoreBlock label="You" score={myScore} isMe />
            <ScoreBlock label="Opponent" score={oppScore} />
          </div>

          <div className="mt-5 space-y-1 text-xs text-neutral-500">
            <p>
              P1: {truncateAddress(p1)}
              {winner && winner.toLowerCase() === p1.toLowerCase() && (
                <span className="ml-2 rounded bg-skill/20 px-1.5 py-0.5 text-skill">
                  winner
                </span>
              )}
            </p>
            <p>
              P2: {p2 ? truncateAddress(p2) : "—"}
              {p2 && winner && winner.toLowerCase() === p2.toLowerCase() && (
                <span className="ml-2 rounded bg-skill/20 px-1.5 py-0.5 text-skill">
                  winner
                </span>
              )}
            </p>
          </div>

          {match.settleTxHash && (
            <a
              href={basescanTx(match.settleTxHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-xs text-neutral-400 underline hover:text-neutral-200"
            >
              View settle tx on Basescan ↗
            </a>
          )}

          {/*
           * Trust signal pill — anti-cheat audit verdict (user-safe).
           * Lives INSIDE the score card so the verification is visually
           * attached to the final result, not mixed with the narrative
           * cards (recap/coach) below. Hidden entirely on fetch error.
           */}
          {match.status === "settled" && (
            <div className="mt-5">
              <AIReviewedBadge matchId={match.matchId} />
            </div>
          )}
        </div>

        {/*
         * Recap is shown to any viewer of a settled match — it's match-wide,
         * not per-player. Placed ABOVE AICoach because recap is the hero
         * (the story of the match), coach is the detail (tactical advice).
         * Silently hides on error; see AIRecap component.
         */}
        {match.status === "settled" && (
          <AIRecap matchId={match.matchId} />
        )}

        {/*
         * Only render AICoach once the match is fully settled. A "pending"
         * or mid-submission state would 409 from the coach endpoint — we
         * could show it anyway and rely on the error fallback, but hiding
         * the card until it can actually produce a response keeps the UX
         * cleaner.
         */}
        {match.status === "settled" && address && (
          <AICoach matchId={match.matchId} player={address} />
        )}

        <div className="flex flex-col gap-2">
          <Link
            href="/duel/waiting"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-skill text-sm font-semibold text-black hover:bg-yellow-400"
          >
            Play again
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-bg-elev text-sm text-neutral-200 hover:border-neutral-600"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ScoreBlock({
  label,
  score,
  isMe,
}: {
  label: string;
  score: number;
  isMe?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (isMe ? "border-skill/50 bg-skill/5" : "border-border bg-bg-elev2")
      }
    >
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{score}</p>
    </div>
  );
}

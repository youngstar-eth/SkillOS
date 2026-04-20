"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { getMatchStatus, type MatchObject } from "@/lib/api";
import { basescanTx, truncateAddress } from "@/lib/utils";

type PageProps = { params: { id: string } };

type Outcome = "win" | "lose" | "tie" | "pending";

export default function ResultPage({ params }: PageProps) {
  const matchId = params.id;
  const { address } = useAccount();

  const { data: raw, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatchStatus(matchId),
    // Keep polling briefly in case the settle tx is still confirming.
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d && "status" in d && d.status === "settled") return false;
      return 3000;
    },
  });

  const match = (raw && "seed" in raw ? raw : null) as MatchObject | null;

  const { outcome, myScore, oppScore, payout } = useMemo(() => {
    if (!match || !address) {
      return { outcome: "pending" as Outcome, myScore: 0, oppScore: 0, payout: "0" };
    }
    const isP1 = match.player1_address.toLowerCase() === address.toLowerCase();
    const myScore = (isP1 ? match.player1_score : match.player2_score) ?? 0;
    const oppScore = (isP1 ? match.player2_score : match.player1_score) ?? 0;
    let outcome: Outcome = "pending";
    if (match.status === "settled" && match.winner_address) {
      if (match.winner_address.toLowerCase() === address.toLowerCase())
        outcome = "win";
      else if (match.winner_address === match.player1_address || match.winner_address === match.player2_address)
        outcome = "lose";
    } else if (match.status === "settled" && !match.winner_address) {
      outcome = "tie";
    }
    // Pool = 2 * stake, minus any fees the backend applies. For the MVP we
    // just show 2 × stake_amount_usdc.
    const stakeStr = match.stake_amount_usdc ?? "0";
    const payout = outcome === "win" ? (Number(stakeStr) * 2).toString() : "0";
    return { outcome, myScore, oppScore, payout };
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
          ? "It's a tie"
          : "Settling…";

  const headlineColor =
    outcome === "win"
      ? "text-skill"
      : outcome === "lose"
        ? "text-red-400"
        : outcome === "tie"
          ? "text-neutral-300"
          : "text-neutral-400";

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-border bg-bg-elev p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Match #{match.id.slice(0, 6)}
          </p>
          <h1 className={`mt-2 text-4xl font-bold tracking-tight ${headlineColor}`}>
            {headline}
          </h1>
          {outcome === "win" && (
            <p className="mt-3 text-lg font-semibold text-neutral-100">
              Payout: {payout} USDC
            </p>
          )}

          {/* Scores */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <ScoreBlock label="You" score={myScore} isMe />
            <ScoreBlock label="Opponent" score={oppScore} />
          </div>

          {/* Players */}
          <div className="mt-5 space-y-1 text-xs text-neutral-500">
            <p>
              P1: {truncateAddress(match.player1_address)}
              {match.winner_address?.toLowerCase() ===
                match.player1_address.toLowerCase() && (
                <span className="ml-2 rounded bg-skill/20 px-1.5 py-0.5 text-skill">winner</span>
              )}
            </p>
            <p>
              P2:{" "}
              {match.player2_address
                ? truncateAddress(match.player2_address)
                : "—"}
              {match.player2_address &&
                match.winner_address?.toLowerCase() ===
                  match.player2_address.toLowerCase() && (
                  <span className="ml-2 rounded bg-skill/20 px-1.5 py-0.5 text-skill">winner</span>
                )}
            </p>
          </div>

          {match.settle_tx_hash && (
            <a
              href={basescanTx(match.settle_tx_hash)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-xs text-neutral-400 underline hover:text-neutral-200"
            >
              View settle tx on Basescan ↗
            </a>
          )}
        </div>

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
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{score}</p>
    </div>
  );
}

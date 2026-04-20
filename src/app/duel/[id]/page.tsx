"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { Game2048 } from "@/components/Game2048";
import { Timer } from "@/components/Timer";
import { getMatchStatus, submitScore, type MatchObject } from "@/lib/api";
import { truncateAddress } from "@/lib/utils";

type PageProps = { params: { id: string } };

export default function DuelPage({ params }: PageProps) {
  const matchId = params.id;
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [liveScore, setLiveScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitGuard = useRef(false);

  // Fetch + poll match state
  const { data: matchRaw } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatchStatus(matchId),
    refetchInterval: 3000,
  });

  const match = (matchRaw && "seed" in matchRaw ? matchRaw : null) as
    | MatchObject
    | null;

  // Redirect to result when settled / refunded
  useEffect(() => {
    if (!match) return;
    if (
      match.status === "settled" ||
      match.status === "refunded" ||
      match.status === "cancelled"
    ) {
      router.replace(`/duel/${matchId}/result`);
    }
  }, [match, matchId, router]);

  const isP1 = address && match?.player1_address?.toLowerCase() === address.toLowerCase();
  const myScore = isP1 ? match?.player1_score : match?.player2_score;
  const oppScore = isP1 ? match?.player2_score : match?.player1_score;
  const oppAddress = isP1 ? match?.player2_address : match?.player1_address;

  const submit = useCallback(
    async (score: number) => {
      if (submitGuard.current || !match || !address) return;
      submitGuard.current = true;
      setSubmitting(true);
      setFrozen(true);
      try {
        // Sign the score attestation so the backend can verify authenticity.
        const message = `Skillbase duel ${match.id} score ${score}`;
        const signature = await signMessageAsync({ message });
        await submitScore({ matchId: match.id, score, signature });
        setSubmitted(true);
      } catch (e) {
        setError((e as Error).message);
        submitGuard.current = false; // allow retry
      } finally {
        setSubmitting(false);
      }
    },
    [match, address, signMessageAsync],
  );

  const handleGameOver = useCallback(
    (finalScore: number) => {
      submit(finalScore);
    },
    [submit],
  );

  const handleTimerExpire = useCallback(() => {
    submit(liveScore);
  }, [submit, liveScore]);

  if (!match) {
    return (
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
        <p className="text-sm text-neutral-400">Loading duel…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-6">
      {/* Top bar: timer + opponent */}
      <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            You
          </p>
          <p className="font-mono text-xs text-neutral-300">
            {address ? truncateAddress(address) : "—"}
          </p>
        </div>

        <Timer deadline={match.ends_at} onExpire={handleTimerExpire} />

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            Opponent
          </p>
          <p className="font-mono text-xs text-neutral-300">
            {oppAddress ? truncateAddress(oppAddress) : "—"}
          </p>
        </div>
      </div>

      {/* Score strip */}
      <div className="mb-4 grid w-full max-w-md grid-cols-2 gap-2">
        <ScoreCard
          label="Your score"
          value={submitted ? (myScore ?? liveScore) : liveScore}
          highlight
        />
        <ScoreCard
          label="Opponent"
          value={oppScore ?? "—"}
          pending={oppScore == null}
        />
      </div>

      {/* Game */}
      <Game2048
        seed={match.seed}
        onGameOver={handleGameOver}
        onScoreChange={setLiveScore}
        frozen={frozen}
      />

      {/* Post-submit state */}
      {(submitting || submitted) && (
        <div className="mt-6 w-full max-w-md rounded-xl border border-border bg-bg-elev p-4 text-center">
          {submitting && (
            <p className="text-sm text-neutral-300">
              Submitting your score… sign the attestation in your wallet.
            </p>
          )}
          {submitted && !submitting && (
            <>
              <p className="text-sm font-semibold">Score submitted ✓</p>
              <p className="mt-1 text-xs text-neutral-400">
                {oppScore == null
                  ? "Waiting for opponent to finish…"
                  : "Settling match…"}
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 w-full max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
          <button
            onClick={() => {
              setError(null);
              submit(liveScore);
            }}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      )}
    </main>
  );
}

function ScoreCard({
  label,
  value,
  highlight,
  pending,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (highlight
          ? "border-skill/50 bg-skill/5"
          : "border-border bg-bg-elev")
      }
    >
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={
          "mt-0.5 text-2xl font-bold tabular-nums " +
          (pending ? "text-neutral-600" : "text-neutral-100")
        }
      >
        {value}
      </p>
    </div>
  );
}

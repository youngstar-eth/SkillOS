"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { PLAY_WINDOW_MS } from "@skillbase/contracts";
import {
  Timer,
  getMatchStatus,
  parseWalletError,
  submitScore,
  truncateAddress,
  type MatchObject,
} from "@skillbase/ui";
import { GameMatch3 } from "@/components/GameMatch3";

type PageProps = { params: { id: string } };

export default function DuelPage({ params }: PageProps) {
  const matchId = params.id;
  const router = useRouter();
  const { address } = useAccount();

  const [liveScore, setLiveScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitGuard = useRef(false);

  const { data: match } = useQuery<MatchObject>({
    queryKey: ["match", matchId],
    queryFn: () => getMatchStatus(matchId),
    refetchInterval: 3000,
  });

  // Route to result when the match closes.
  useEffect(() => {
    if (!match) return;
    if (match.status === "settled" || match.status === "refunded") {
      router.replace(`/duel/${matchId}/result`);
    }
  }, [match, matchId, router]);

  const me = address?.toLowerCase();
  const isP1 = Boolean(
    me && match && match.player1.address.toLowerCase() === me,
  );

  // My own score is fine to show at any time.
  const myScore = isP1 ? match?.player1.score : match?.player2?.score;
  const oppAddress = isP1 ? match?.player2?.address : match?.player1.address;

  // Competitive-integrity rule: NEVER read `player.score` for the opponent
  // while either player is still playing. We derive submission state from
  // `submittedAt` timestamps (or equivalently the status enum) — these
  // reveal *that* a submission happened, not the *value* of the score.
  const mySubmittedAt = isP1
    ? match?.player1.submittedAt
    : match?.player2?.submittedAt;
  const oppSubmittedAt = isP1
    ? match?.player2?.submittedAt
    : match?.player1.submittedAt;

  // Local React state (`submitted`) fires instantly on successful submit;
  // server state arrives on the next 3s poll. OR them so the UI feels snappy
  // and survives a page refresh.
  const iHaveSubmitted = submitted || Boolean(mySubmittedAt);
  const opponentHasSubmitted = Boolean(oppSubmittedAt);

  // Compute the play deadline from matchedAt + PLAY_WINDOW_MS on the client.
  const deadlineIso = useMemo(() => {
    if (!match?.matchedAt) return null;
    return new Date(
      new Date(match.matchedAt).getTime() + PLAY_WINDOW_MS,
    ).toISOString();
  }, [match?.matchedAt]);

  const submit = useCallback(
    async (score: number) => {
      if (submitGuard.current || !match || !address) return;
      submitGuard.current = true;
      setSubmitting(true);
      setFrozen(true);
      // Match-3 sandwich clamp: Floor to 1 so a "never swapped, timer
      // expired" submission still clears the backend's score > 0 check.
      // Ceiling at 49_999 as a belt-and-suspenders against an engine bug
      // blowing past the backend's implausible_score threshold; typical
      // deep-combo play caps at ~5000.
      const safeScore = Math.min(Math.max(1, score), 49_999);
      try {
        await submitScore({
          matchId: match.matchId,
          address,
          score: safeScore,
        });
        setSubmitted(true);
      } catch (e) {
        setError(parseWalletError(e).message);
        submitGuard.current = false;
        setFrozen(false);
      } finally {
        setSubmitting(false);
      }
    },
    [match, address],
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

  // Auto-hydrate the submitted panel on refresh: if the server already has a
  // submission for this player, flip local state so the UI matches. We read
  // `submittedAt` (boolean-ish) rather than `score` to keep this component
  // strictly score-leak-free — the opponent branch reuses the same pattern.
  useEffect(() => {
    if (!match) return;
    const mineAt = isP1
      ? match.player1.submittedAt
      : match.player2?.submittedAt;
    if (mineAt && !submitted) {
      submitGuard.current = true;
      setSubmitted(true);
      setFrozen(true);
    }
  }, [match, isP1, submitted]);

  if (!match) {
    return (
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
        <p className="text-sm text-neutral-400">Loading duel…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-6">
      <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">You</p>
          <p className="font-mono text-xs text-neutral-300">
            {address ? truncateAddress(address) : "—"}
          </p>
        </div>

        <Timer deadline={deadlineIso} onExpire={handleTimerExpire} />

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Opponent</p>
          <p className="font-mono text-xs text-neutral-300">
            {oppAddress ? truncateAddress(oppAddress) : "—"}
          </p>
        </div>
      </div>

      <div className="mb-4 grid w-full max-w-md grid-cols-2 gap-2">
        <ScoreCard
          label="Your score"
          value={iHaveSubmitted ? (myScore ?? liveScore) : liveScore}
          highlight
        />
        {/*
          Opponent score is hidden until the match settles — then we redirect
          to the result page. So during play we only surface *whether* the
          opponent has submitted, never *what* they scored.
        */}
        <ScoreCard
          label="Opponent"
          value="?"
          pending
          caption={
            opponentHasSubmitted
              ? "submitted ✓"
              : "still playing…"
          }
        />
      </div>

      <GameMatch3
        seed={match.seed}
        onGameOver={handleGameOver}
        onScoreChange={setLiveScore}
        frozen={frozen}
      />

      {(submitting || iHaveSubmitted) && (
        <div className="mt-6 w-full max-w-md rounded-xl border border-border bg-bg-elev p-4 text-center">
          {submitting && (
            <p className="text-sm text-neutral-300">Submitting your score…</p>
          )}
          {iHaveSubmitted && !submitting && (
            <>
              <p className="text-sm font-semibold">
                Score submitted ✓ {myScore ?? liveScore} points
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {opponentHasSubmitted
                  ? "Settling match on-chain…"
                  : "Waiting for opponent to finish…"}
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
  caption,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  pending?: boolean;
  caption?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (highlight ? "border-skill/50 bg-skill/5" : "border-border bg-bg-elev")
      }
    >
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className={
          "mt-0.5 text-2xl font-bold tabular-nums " +
          (pending ? "text-neutral-600" : "text-neutral-100")
        }
      >
        {value}
      </p>
      {caption && (
        <p className="mt-1 text-[10px] text-neutral-500">{caption}</p>
      )}
    </div>
  );
}

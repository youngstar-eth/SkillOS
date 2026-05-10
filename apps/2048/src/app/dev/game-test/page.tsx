"use client";

/**
 * DEV-ONLY playtest route for Game2048 + Timer.
 *
 * Guarded by NODE_ENV — returns 404 in production so it never ships. Lets
 * the frontend team playtest the duel UI without the backend being live.
 *
 * Mock match:
 *   seed = 0x + "a" * 64    (valid bytes32)
 *   player1 = 0x...0001     (you)
 *   player2 = 0x...0002
 *   ends_at = now + 2min
 */

import { notFound } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, truncateAddress } from "@skillos/ui";
import { Game2048 } from "@/components/Game2048";

const MOCK = {
  matchId: "dev-match-001",
  seed: "0x" + "a".repeat(64),
  player1: "0x0000000000000000000000000000000000000001",
  player2: "0x0000000000000000000000000000000000000002",
};

export default function GameTestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [liveScore, setLiveScore] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [reason, setReason] = useState<"game_over" | "timer_expired" | null>(
    null,
  );
  const [frozen, setFrozen] = useState(false);
  const submitGuard = useRef(false);

  // Fresh 2-minute deadline on mount. Resets if the user clicks "restart".
  const [deadline, setDeadline] = useState(
    () => new Date(Date.now() + 120_000).toISOString(),
  );
  const [seed, setSeed] = useState(MOCK.seed);
  const [runId, setRunId] = useState(0);

  const end = useCallback(
    (why: "game_over" | "timer_expired", score: number) => {
      if (submitGuard.current) return;
      submitGuard.current = true;
      setFinalScore(score);
      setReason(why);
      setFrozen(true);
      // Matches the real submit flow: log what would be signed + sent.
      console.log("[dev-game-test] final", {
        matchId: MOCK.matchId,
        reason: why,
        score,
        message: `SkillOS duel ${MOCK.matchId} score ${score}`,
      });
    },
    [],
  );

  const handleGameOver = useCallback(
    (score: number) => end("game_over", score),
    [end],
  );
  const handleExpire = useCallback(
    () => end("timer_expired", liveScore),
    [end, liveScore],
  );

  function restart() {
    submitGuard.current = false;
    setFinalScore(null);
    setReason(null);
    setFrozen(false);
    setLiveScore(0);
    // Tiny change to the seed forces Game2048 reducer to re-init + unmounts
    // Timer with a new deadline.
    setSeed(
      "0x" +
        "a".repeat(62) +
        ((runId + 1) % 256).toString(16).padStart(2, "0"),
    );
    setRunId((n) => n + 1);
    setDeadline(new Date(Date.now() + 120_000).toISOString());
  }

  useEffect(() => {
    // Keyboard hint — make sure the window has focus.
    if (typeof window !== "undefined") window.focus();
  }, []);

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-6">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-skill/40 bg-skill/10 px-3 py-1 text-[11px] uppercase tracking-wider text-skill">
        <span className="h-1.5 w-1.5 rounded-full bg-skill" />
        Dev route · no backend, no wallet
      </div>

      <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            You (P1)
          </p>
          <p className="font-mono text-xs text-neutral-300">
            {truncateAddress(MOCK.player1)}
          </p>
        </div>

        <Timer deadline={deadline} onExpire={handleExpire} />

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            Opponent (P2)
          </p>
          <p className="font-mono text-xs text-neutral-300">
            {truncateAddress(MOCK.player2)}
          </p>
        </div>
      </div>

      <div className="mb-4 grid w-full max-w-md grid-cols-2 gap-2">
        <div className="rounded-xl border border-skill/50 bg-skill/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            Your score
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{liveScore}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-elev p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            Opponent
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-neutral-600">
            —
          </p>
        </div>
      </div>

      <Game2048
        key={runId}
        seed={seed}
        onGameOver={handleGameOver}
        onScoreChange={setLiveScore}
        frozen={frozen}
      />

      {finalScore !== null && (
        <div className="mt-6 w-full max-w-md rounded-xl border border-border bg-bg-elev p-4 text-center">
          <p className="text-sm font-semibold">
            {reason === "game_over" ? "Game over" : "Time's up"} · final score{" "}
            <span className="text-skill">{finalScore}</span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            See DevTools console for the attestation payload that would be
            signed + submitted.
          </p>
          <button
            onClick={restart}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-skill px-4 text-sm font-semibold text-black hover:opacity-90"
          >
            Restart
          </button>
        </div>
      )}

      <p className="mt-6 max-w-md text-center text-xs text-neutral-500">
        Mock match <span className="font-mono">{MOCK.matchId}</span> · seed{" "}
        <span className="font-mono">{seed.slice(0, 10)}…</span> · deadline +2min
      </p>
    </main>
  );
}

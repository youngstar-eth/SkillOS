"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader } from "@/components/game/ConnectHeader";
import { Game, WORDLE_TOURNAMENT_ID } from "@/components/game/Game";
import { TournamentEntry } from "@/components/game/TournamentEntry";
import {
  DailyChallengeBanner,
  GameLeaderboard,
  type DailyChallenge,
} from "@mas/shared/components";

const REQUIRED_CHAIN = baseSepolia.id;

type WordleChallengeData = { word: string; hint?: string };

/**
 * Demo-mode detector: bypasses the on-chain tournament entry so we can
 * exercise the daily challenge + AI coach end-to-end even when the active
 * tournament has expired. Triggered by `?demo=1` on the URL. Score
 * submission still goes through the normal /api/score path, so a demo
 * session that happens to land after a new tournament starts still works.
 */
function useDemoMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOn(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);
  return on;
}

export default function HomePage() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();

  const demo = useDemoMode();
  const [entered, setEntered] = useState(false);
  const onEntered = useCallback(() => setEntered(true), []);

  // Optional: when a user taps "Play Daily" before entering the tournament,
  // we remember the daily word and forward it into <Game/> once they enter.
  const [pendingDaily, setPendingDaily] = useState<string | null>(null);

  const onPlayDaily = useCallback((c: DailyChallenge) => {
    const d = c.challenge_data as WordleChallengeData | null;
    if (d?.word) setPendingDaily(d.word);
  }, []);

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const wrongChain = isConnected && chainId !== REQUIRED_CHAIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-4 px-4 py-6">
      <ConnectHeader />

      {/* AI daily challenge banner (above tournament entry and game). */}
      <DailyChallengeBanner
        gameSlug="wordle"
        onPlay={onPlayDaily}
        playDisabled={!demo && (!isConnected || wrongChain)}
        playLabel={
          demo || entered ? "Load Daily Word" : "Enter then Play Daily →"
        }
      />

      {!isConnected && !demo && <ConnectPrompt />}

      {isConnected && wrongChain && (
        <WrongChain
          onSwitch={() => switchChain({ chainId: REQUIRED_CHAIN })}
          pending={switchPending}
        />
      )}

      {demo && (
        <section className="rounded border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          ⚠ Demo mode — tournament entry bypassed. On-chain submit still works
          if a tournament is live.
        </section>
      )}

      {isConnected && !wrongChain && !entered && !demo && (
        <TournamentEntry
          tournamentId={WORDLE_TOURNAMENT_ID}
          gameLabel="wordle"
          durationLabel="24h"
          onEntered={onEntered}
        />
      )}

      {(demo || (isConnected && !wrongChain && entered)) && (
        <Game dailyWord={pendingDaily ?? undefined} />
      )}

      <GameLeaderboard gameSlug="wordle" highlightAddress={address} />
    </main>
  );
}

function ConnectPrompt() {
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-h3 text-fg">Connect wallet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Wordle runs on Base Sepolia. Connect a wallet to enter the tournament
        and start playing. Scores are signed server-side and submitted
        on-chain.
      </p>
    </section>
  );
}

function WrongChain({
  onSwitch,
  pending,
}: {
  onSwitch: () => void;
  pending: boolean;
}) {
  return (
    <section className="rounded border border-warning/40 bg-warning/10 p-4">
      <h2 className="text-h3 text-warning">Wrong network</h2>
      <p className="mt-1 text-sm text-muted">
        Switch your wallet to Base Sepolia (chainId {REQUIRED_CHAIN}).
      </p>
      <button
        type="button"
        onClick={onSwitch}
        disabled={pending}
        className="mt-3 min-h-[40px] w-full rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Switching…" : "Switch to Base Sepolia"}
      </button>
    </section>
  );
}

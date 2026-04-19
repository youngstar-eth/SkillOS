"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  ConnectHeader,
  TournamentEntry,
  DailyChallengeBanner,
  GameLeaderboard,
  type DailyChallenge,
} from "@mas/shared/components";
import { Game } from "@/components/game/Game";

const TOURNAMENT_ID = 22n;

const REQUIRED_CHAIN = baseSepolia.id;

type Game2048ChallengeData = {
  startingTiles: Array<{ row: number; col: number; value: number }>;
  targetScore?: number;
};

/** Demo bypass — `?demo=1` lets us exercise AI layer without on-chain entry. */
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

  // Daily tiles forwarded into <Game/> when the user taps "Load Daily Board".
  const [pendingDailyTiles, setPendingDailyTiles] = useState<
    Array<{ row: number; col: number; value: number }> | null
  >(null);

  const onPlayDaily = useCallback((c: DailyChallenge) => {
    const d = c.challenge_data as Game2048ChallengeData | null;
    if (d?.startingTiles?.length) setPendingDailyTiles(d.startingTiles);
  }, []);

  // Signal to Warpcast host that we're ready to render.
  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const wrongChain = isConnected && chainId !== REQUIRED_CHAIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-3b px-2b py-3b">
      <ConnectHeader title="2048" kicker="on Base" />

      <DailyChallengeBanner
        gameSlug="2048"
        onPlay={onPlayDaily}
        playDisabled={!demo && (!isConnected || wrongChain)}
        playLabel={
          demo || entered ? "Load Daily Board" : "Enter then Play Daily →"
        }
      />

      {demo && (
        <section className="border border-accent-primary/40 bg-accent-primary/10 p-2b text-xs text-accent-primary">
          ⚠ Demo mode — tournament entry bypassed. On-chain submit still works
          if a tournament is live.
        </section>
      )}

      {!isConnected && !demo && <ConnectPrompt />}

      {isConnected && wrongChain && (
        <WrongChain
          onSwitch={() => switchChain({ chainId: REQUIRED_CHAIN })}
          pending={switchPending}
        />
      )}

      {isConnected && !wrongChain && !entered && !demo && (
        <TournamentEntry
          tournamentId={TOURNAMENT_ID}
          gameLabel="2048"
          onEntered={onEntered}
        />
      )}

      {(demo || (isConnected && !wrongChain && entered)) && (
        <Game dailyTiles={pendingDailyTiles ?? undefined} />
      )}

      <GameLeaderboard gameSlug="2048" highlightAddress={address} />
    </main>
  );
}

function ConnectPrompt() {
  return (
    <section className="border border-fg/20 bg-fg/5 p-4b">
      <h2 className="font-display text-h3 font-black">Connect wallet</h2>
      <p className="mt-1b text-sm text-muted">
        2048 runs on Base Sepolia. Connect a wallet to enter the tournament
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
    <section className="border border-accent-primary/40 bg-accent-primary/10 p-3b">
      <h2 className="font-display text-h3 font-black text-accent-primary">
        Wrong network
      </h2>
      <p className="mt-1b text-sm text-muted">
        Switch your wallet to Base Sepolia (chainId {REQUIRED_CHAIN}).
      </p>
      <button
        type="button"
        onClick={onSwitch}
        disabled={pending}
        className="mt-2b min-h-[44px] w-full bg-accent-primary px-3b py-2b font-display text-sm font-bold uppercase tracking-wider text-fg disabled:opacity-50"
      >
        {pending ? "Switching…" : "Switch to Base Sepolia"}
      </button>
    </section>
  );
}

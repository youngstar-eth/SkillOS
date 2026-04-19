"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  ChallengeEntryButton,
  ConnectHeader,
  TournamentEntry,
  DailyChallengeBanner,
  GameLeaderboard,
  type DailyChallenge,
} from "@mas/shared/components";
import { Game, TOURNAMENT_ID } from "@/components/game/Game";

const REQUIRED_CHAIN = baseSepolia.id;

type HillclimbChallengeData = {
  seed: number;
  targetDistance?: number;
  conditions?: string;
};

/** Demo bypass — `?demo=1` exercises AI layer without on-chain entry. */
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

  const [pendingDailySeed, setPendingDailySeed] = useState<number | null>(null);

  const onPlayDaily = useCallback((c: DailyChallenge) => {
    const d = c.challenge_data as HillclimbChallengeData | null;
    if (typeof d?.seed === "number") setPendingDailySeed(d.seed);
  }, []);

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const wrongChain = isConnected && chainId !== REQUIRED_CHAIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-4 px-4 py-6">
      <ConnectHeader title="Hill Climb" kicker="on Base" />

      <DailyChallengeBanner
        gameSlug="hillclimb"
        onPlay={onPlayDaily}
        playDisabled={!demo && (!isConnected || wrongChain)}
        playLabel={
          demo || entered ? "Load Daily Terrain" : "Enter then Play Daily →"
        }
      />

      {demo && (
        <section className="rounded border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
          ⚠ Demo mode — tournament entry bypassed. On-chain submit still works
          if a tournament is live.
        </section>
      )}

      {!isConnected && !demo && (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="text-h3 text-fg">Connect wallet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Hill Climb runs on Base Sepolia. Connect a wallet to enter the
            tournament and start playing.
          </p>
        </section>
      )}

      {isConnected && wrongChain && (
        <section className="rounded border border-warning/50 bg-warning/10 p-4">
          <h2 className="text-h3 text-warning">Wrong network</h2>
          <button
            type="button"
            onClick={() => switchChain({ chainId: REQUIRED_CHAIN })}
            disabled={switchPending}
            className="mt-3 min-h-[40px] w-full rounded bg-accent px-3 py-2 text-sm font-bold text-bg disabled:opacity-50"
          >
            {switchPending ? "Switching…" : "Switch to Base Sepolia"}
          </button>
        </section>
      )}

      {isConnected && !wrongChain && !entered && !demo && (
        <TournamentEntry
          tournamentId={TOURNAMENT_ID}
          gameLabel="hillclimb"
          onEntered={onEntered}
        />
      )}

      {!entered && !demo && (
        <section
          style={{
            borderTop: "1px solid rgba(255,199,44,0.25)",
            paddingTop: 12,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              opacity: 0.55,
              color: "#FFC72C",
              fontFamily: "monospace",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            OR · 1v1 DUEL
          </div>
          <ChallengeEntryButton
            gameSlug="hillclimb"
            enabled={process.env.NEXT_PUBLIC_CHALLENGES === "1"}
          />
        </section>
      )}

      {(demo || (isConnected && !wrongChain && entered)) && (
        <Game dailySeed={pendingDailySeed ?? undefined} />
      )}

      <GameLeaderboard gameSlug="hillclimb" highlightAddress={address} />
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader, TournamentEntry } from "@mas/shared/components";
import { Game, TOURNAMENT_ID } from "@/components/game/Game";

const REQUIRED_CHAIN = baseSepolia.id;

export default function HomePage() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();

  const [entered, setEntered] = useState(false);
  const onEntered = useCallback(() => setEntered(true), []);

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const wrongChain = isConnected && chainId !== REQUIRED_CHAIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-4 px-4 py-6">
      <ConnectHeader title="Hill Climb" kicker="on Base" />

      {!isConnected && (
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

      {isConnected && !wrongChain && !entered && (
        <TournamentEntry
          tournamentId={TOURNAMENT_ID}
          gameLabel="hillclimb"
          onEntered={onEntered}
        />
      )}

      {isConnected && !wrongChain && entered && <Game />}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader } from "@/components/game/ConnectHeader";
import { Game, PONG_TOURNAMENT_ID } from "@/components/game/Game";
import { TournamentEntry } from "@/components/game/TournamentEntry";

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
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-5 px-4 py-6">
      <ConnectHeader />

      {!isConnected && <ConnectPrompt />}

      {isConnected && wrongChain && (
        <WrongChain
          onSwitch={() => switchChain({ chainId: REQUIRED_CHAIN })}
          pending={switchPending}
        />
      )}

      {isConnected && !wrongChain && !entered && (
        <TournamentEntry
          tournamentId={PONG_TOURNAMENT_ID}
          gameLabel="pong"
          durationLabel="24h"
          onEntered={onEntered}
        />
      )}

      {isConnected && !wrongChain && entered && <Game />}
    </main>
  );
}

function ConnectPrompt() {
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-h3 text-fg">Connect wallet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Pong runs on Base Sepolia. Connect a wallet to enter the tournament
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
    <section className="rounded border border-warning/60 bg-warning/10 p-4">
      <h2 className="text-h3 text-warning">Wrong network</h2>
      <p className="mt-1 text-sm text-muted">
        Switch your wallet to Base Sepolia (chainId {REQUIRED_CHAIN}).
      </p>
      <button
        type="button"
        onClick={onSwitch}
        disabled={pending}
        className="mt-3 min-h-[40px] w-full rounded bg-accent px-3 py-2 text-sm font-bold text-[#0d1117] shadow-[0_0_18px_rgba(84,174,255,0.45)] hover:bg-accent/90 disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? "Switching…" : "Switch to Base Sepolia"}
      </button>
    </section>
  );
}

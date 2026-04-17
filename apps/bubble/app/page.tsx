"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader } from "@/components/game/ConnectHeader";
import { Game, BUBBLE_TOURNAMENT_ID } from "@/components/game/Game";
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
          tournamentId={BUBBLE_TOURNAMENT_ID}
          gameLabel="bubble"
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
    <section className="rounded-xl border-2 border-border bg-surface p-5 shadow-[0_6px_20px_rgba(255,100,150,0.08)]">
      <h2 className="display text-h2 text-accent-deep">A sweet popping spree</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Bubble Pop runs on Base Sepolia. Connect a wallet to enter the
        tournament and clear the board. Scores are signed server-side and
        submitted on-chain.
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
    <section className="rounded-xl border-2 border-warning/60 bg-warning/10 p-4">
      <h2 className="display text-h3 text-fg">Wrong network</h2>
      <p className="mt-1 text-sm text-muted">
        Switch your wallet to Base Sepolia (chainId {REQUIRED_CHAIN}).
      </p>
      <button
        type="button"
        onClick={onSwitch}
        disabled={pending}
        className="mt-3 min-h-[40px] w-full rounded-full bg-accent px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,100,150,0.4)] hover:bg-accent-deep disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? "Switching…" : "Switch to Base Sepolia"}
      </button>
    </section>
  );
}

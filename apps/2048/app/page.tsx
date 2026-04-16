"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader } from "@/components/game/ConnectHeader";
import { Game } from "@/components/game/Game";
import { TournamentEntry } from "@/components/game/TournamentEntry";

const REQUIRED_CHAIN = baseSepolia.id;

export default function HomePage() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();

  // Track whether the connected wallet has entered the tournament.
  const [entered, setEntered] = useState(false);
  const onEntered = useCallback(() => setEntered(true), []);

  // Signal to Warpcast host that we're ready to render.
  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const wrongChain = isConnected && chainId !== REQUIRED_CHAIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-3b px-2b py-3b">
      <ConnectHeader />

      {!isConnected && <ConnectPrompt />}

      {isConnected && wrongChain && (
        <WrongChain
          onSwitch={() => switchChain({ chainId: REQUIRED_CHAIN })}
          pending={switchPending}
        />
      )}

      {isConnected && !wrongChain && !entered && (
        <TournamentEntry onEntered={onEntered} />
      )}

      {isConnected && !wrongChain && entered && <Game />}
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

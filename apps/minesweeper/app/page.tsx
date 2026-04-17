"use client";

import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ConnectHeader } from "@/components/game/ConnectHeader";
import {
  Game,
  MINESWEEPER_TOURNAMENT_ID,
} from "@/components/game/Game";
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
    <main className="mx-auto flex min-h-screen max-w-screen-sm flex-col gap-3 px-3 py-4">
      {/* Outer "window" wraps brand + wallet so the whole app feels Win98. */}
      <div className="win-raised">
        <div className="win-titlebar">
          <span>MAS — Minesweeper.exe</span>
          <span className="opacity-75">◻ × ▢</span>
        </div>
        <div className="bg-window px-3 py-2">
          <ConnectHeader />
        </div>
      </div>

      {!isConnected && <ConnectPrompt />}

      {isConnected && wrongChain && (
        <WrongChain
          onSwitch={() => switchChain({ chainId: REQUIRED_CHAIN })}
          pending={switchPending}
        />
      )}

      {isConnected && !wrongChain && !entered && (
        <TournamentEntry
          tournamentId={MINESWEEPER_TOURNAMENT_ID}
          gameLabel="minesweeper"
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
    <div className="win-raised">
      <div className="win-titlebar">
        <span>Welcome.txt</span>
        <span className="opacity-75">◻ × ▢</span>
      </div>
      <div className="bg-window p-4">
        <h2 className="text-sm font-bold">Connect wallet</h2>
        <p className="mt-2 text-xs leading-relaxed">
          Minesweeper runs on Base Sepolia. Connect a wallet to enter the
          tournament and start playing. Scores are signed server-side and
          submitted on-chain.
        </p>
      </div>
    </div>
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
    <div className="win-raised">
      <div className="win-titlebar" style={{ background: "#800000" }}>
        <span>⚠ Wrong network</span>
        <span className="opacity-75">◻ × ▢</span>
      </div>
      <div className="bg-window p-3">
        <p className="text-xs">
          Switch your wallet to Base Sepolia (chainId {REQUIRED_CHAIN}).
        </p>
        <button
          type="button"
          onClick={onSwitch}
          disabled={pending}
          className="win-raised active:win-pressed mt-2 min-h-[28px] w-full px-3 py-1 text-xs font-bold disabled:opacity-50"
        >
          {pending ? "Switching…" : "Switch to Base Sepolia"}
        </button>
      </div>
    </div>
  );
}

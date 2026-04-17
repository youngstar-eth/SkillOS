"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectHeader() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  return (
    <header className="flex items-center justify-between border-b border-accent/30 pb-3">
      <div>
        <h1 className="text-h1 neon-teal leading-none">SNAKE</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.25em] neon-pink">
          on Base · Poolsuite
        </p>
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="min-h-[40px] border border-accent/50 bg-black/30 px-3 text-xs uppercase tracking-[0.15em] text-fg hover:border-accent"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="min-h-[40px] border border-accent-2 bg-accent-2/10 px-4 text-sm uppercase tracking-[0.2em] text-accent-2 hover:bg-accent-2/20 disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        <div className="h-[40px] w-[120px]" />
      )}
    </header>
  );
}

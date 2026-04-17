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
    <header className="flex items-center justify-between border-b border-border pb-4">
      <div>
        <h1 className="text-h1 text-fg">PONG</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.25em] neon-pink">
          vs AI · on Base
        </p>
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="min-h-[40px] rounded border border-border bg-surface px-3 font-mono text-xs text-fg hover:border-accent"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="min-h-[40px] rounded bg-accent px-4 text-sm font-bold uppercase tracking-[0.15em] text-[#0d1117] shadow-[0_0_18px_rgba(84,174,255,0.45)] hover:bg-accent/90 disabled:opacity-50 disabled:shadow-none"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        <div className="h-[40px] w-[120px]" />
      )}
    </header>
  );
}

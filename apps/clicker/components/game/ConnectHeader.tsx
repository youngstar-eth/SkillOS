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
        <h1 className="display text-h1 text-accent-deep">Leafkeeper</h1>
        <p className="mt-0 text-xs font-semibold uppercase tracking-[0.2em] text-bark">
          on Base · cottagecore clicker
        </p>
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="min-h-[40px] rounded-lg border-2 border-border bg-surface px-3 font-mono text-xs text-fg hover:border-accent"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="min-h-[40px] rounded-lg bg-accent px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(90,132,92,0.4)] hover:bg-accent-deep disabled:opacity-50 disabled:shadow-none"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        <div className="h-[40px] w-[120px]" />
      )}
    </header>
  );
}

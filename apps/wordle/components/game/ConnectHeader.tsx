"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * Header bar: brand left, wallet right.
 *
 * Direct wagmi hooks (instead of OnchainKit's <Wallet>) — the latter silently
 * null-renders in non-Warpcast preview contexts. wagmi primitives give us a
 * deterministic, themed connect button we fully control.
 */
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
        <h1 className="text-h1 leading-none text-fg">Wordle</h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-accent">
          on Base
        </p>
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="min-h-[40px] rounded-sm border border-border bg-surface px-3 font-mono text-xs font-semibold text-fg hover:border-fg/30"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="min-h-[40px] rounded-sm bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        // SSR placeholder — matches height so no layout shift on hydration.
        <div className="h-[40px] w-[120px]" />
      )}
    </header>
  );
}

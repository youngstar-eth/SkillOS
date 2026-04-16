"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * Header bar: brand left, wallet right.
 *
 * Direct wagmi hooks instead of OnchainKit's <Wallet> — the latter silently
 * null-renders in preview (investigated: useIsMounted effect never fires under
 * MiniKitProvider in non-Warpcast browser context). Using wagmi primitives
 * gives us a deterministic, Bauhaus-styled connect button we fully control.
 */
export function ConnectHeader() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <header className="flex items-center justify-between border-b border-fg/20 pb-2b">
      <div>
        <h1 className="font-display text-h2 leading-none text-fg">2048</h1>
        <p className="font-display text-sm uppercase tracking-widest text-accent-primary">
          on Base
        </p>
      </div>

      <div className="flex items-center gap-2b">
        <div className="hidden items-center gap-2b sm:flex">
          <div className="bauhaus-block h-6 w-6 bg-accent-primary" />
          <div className="bauhaus-block h-6 w-6 rounded-full bg-accent-tertiary" />
          <div
            className="h-0 w-0 border-b-[24px] border-l-[12px] border-r-[12px] border-b-accent-secondary border-l-transparent border-r-transparent"
            aria-hidden
          />
        </div>

        {mounted && isConnected && address ? (
          <button
            type="button"
            onClick={() => disconnect()}
            title="Click to disconnect"
            className="min-h-[44px] border border-fg/30 bg-fg/10 px-3b font-display text-xs font-bold uppercase tracking-wider text-fg hover:bg-fg/20"
          >
            {shortAddr}
          </button>
        ) : mounted ? (
          <button
            type="button"
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            disabled={isPending || !connectors[0]}
            className="min-h-[44px] bg-accent-primary px-3b font-display text-xs font-bold uppercase tracking-wider text-fg hover:bg-accent-primary/90 disabled:opacity-50"
          >
            {isPending ? "Connecting…" : "Connect"}
          </button>
        ) : (
          // SSR placeholder — matches height so no layout shift on hydration.
          <div className="h-[44px] w-[120px]" />
        )}
      </div>
    </header>
  );
}

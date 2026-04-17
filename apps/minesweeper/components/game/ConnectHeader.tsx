"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * Title-bar style header. The whole page lives inside a Win98 window, so
 * this renders an inner header with brand + wallet pill below the title.
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
    <div className="flex items-center justify-between gap-2 pb-2">
      <div>
        <h1 className="text-lg font-bold leading-none">Minesweeper</h1>
        <p className="mt-1 text-[10px] leading-none text-muted">
          on Base · Y2K edition
        </p>
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="win-raised active:win-pressed min-h-[28px] px-3 text-[11px] font-mono"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="win-raised active:win-pressed min-h-[28px] px-3 text-[11px] font-bold disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        <div className="h-[28px] w-[96px]" />
      )}
    </div>
  );
}

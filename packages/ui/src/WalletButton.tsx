"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { cx, parseWalletError, truncateAddress } from "./utils";

/**
 * Wallet connect/disconnect button.
 * - Disconnected: opens a small connector picker (Smart Wallet first, injected fallback)
 * - Connected: shows truncated address + dropdown with disconnect
 */
export function WalletButton() {
  const { address, status } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Avoid SSR / hydration mismatch for address text
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Loading / reconnecting state — render a neutral placeholder to avoid flicker
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return (
      <div className="h-9 w-28 rounded-lg border border-border-subtle bg-bg-elev" />
    );
  }

  // Connected but on the wrong network — surface a switch CTA before the
  // address pill so wrong-network is recoverable in-UI (audit #4.3).
  if (status === "connected" && address && chainId !== baseSepolia.id) {
    return (
      <div className="relative">
        <button
          onClick={() => switchChain({ chainId: baseSepolia.id })}
          disabled={isSwitching}
          className={cx(
            "inline-flex h-9 items-center gap-2 rounded-lg bg-skill px-4 text-sm font-semibold text-black transition",
            isSwitching ? "opacity-60" : "hover:bg-yellow-400",
          )}
        >
          {isSwitching ? "Switching…" : "Switch to Base Sepolia"}
        </button>
        {switchError && (
          <p className="absolute right-0 mt-2 max-w-xs text-right text-xs text-red-400">
            {parseWalletError(switchError).message}
          </p>
        )}
      </div>
    );
  }

  if (status === "connected" && address) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-elev px-3 text-sm font-medium hover:border-neutral-600"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          {truncateAddress(address)}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-bg-elev shadow-lg">
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-bg-elev2"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Disconnected
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-lg bg-skill px-4 text-sm font-semibold text-black transition",
          isPending ? "opacity-60" : "hover:bg-yellow-400",
        )}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-bg-elev shadow-lg">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                // Wrap in try/catch so a synchronous throw from connector init
                // (e.g. Coinbase Wallet popup attempt inside an iframe) doesn't
                // bubble to the framework error boundary. Async errors surface
                // via `error` from useConnect and are rendered below.
                try {
                  connect({ connector: c });
                } catch {
                  /* surfaced via `error` state */
                }
                setOpen(false);
              }}
              className="block w-full px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-bg-elev2"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="absolute right-0 mt-2 max-w-xs text-right text-xs text-red-400">
          {error.message}
        </p>
      )}
    </div>
  );
}

"use client";

// ───────────────────────────────────────────────────────────────────────────
// EmbedWalletFallback — Mini App embed disconnected-state surface.
//
// Tier C-min hides the standalone Header (and its WalletButton) when the app
// runs inside Warpcast / Base App / any iframe. The Farcaster connector is
// expected to auto-connect, but if it doesn't (host without wallet, race,
// reconnect failure), the user is otherwise stranded with no manual path.
//
// This component fills that gap: in embed AND disconnected, it renders a
// small panel with an explicit "Connect with Farcaster" button that targets
// the Farcaster connector by id. Outside embed, or once connected, it
// returns null — standalone web continues to use Header+WalletButton.
//
// connect() is wrapped in try/catch so a synchronous connector-init throw
// surfaces via the inline error message instead of bubbling to the
// framework error boundary (which would otherwise show the Next.js default
// "unexpected error" overlay).
// ───────────────────────────────────────────────────────────────────────────

import { useAccount, useConnect } from "wagmi";
import { useIsEmbedded } from "./useIsEmbedded";

export function EmbedWalletFallback(): React.ReactElement | null {
  const isEmbedded = useIsEmbedded();
  const { address } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();

  if (!isEmbedded || address) return null;

  const farcaster = connectors.find((c) => c.id === "farcaster");

  function handleConnect() {
    if (!farcaster) return;
    try {
      connect({ connector: farcaster });
    } catch {
      // synchronous throw from connector init — already surfaced via `error`
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-bg-elev p-4 text-center">
      <p className="text-sm font-semibold text-neutral-100">
        Wallet didn&apos;t auto-connect
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        Tap below, or reload this app inside Warpcast.
      </p>
      <button
        onClick={handleConnect}
        disabled={!farcaster || isPending}
        className="mt-3 w-full rounded-lg bg-skill px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Connecting…" : "Connect with Farcaster"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error.message}</p>
      )}
    </div>
  );
}

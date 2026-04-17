"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export interface ConnectHeaderProps {
  /** Main page title (e.g. "2048", "Wordle", "BREAKOUT"). */
  title: string;
  /** Kicker subtitle under the title. */
  kicker?: ReactNode;
  /**
   * Optional overrides — each game's globals.css usually defines CSS
   * variables like `--color-accent`, `--color-bg`, `--color-fg`. Default
   * classNames below resolve through those variables. Pass a className to
   * override if a specific game wants a custom look (Minesweeper for a
   * raised Win98 button, for example).
   */
  className?: string;
  titleClassName?: string;
  kickerClassName?: string;
  buttonClassName?: string;
}

/**
 * Shared wallet-connect header. Reads Wallet state via wagmi, renders a
 * brand block on the left and a Connect / disconnect pill on the right.
 *
 * This component makes NO design decisions — it expects Tailwind classes
 * like `bg-accent` / `text-fg` to be defined by each game's Tailwind
 * config, which itself points at CSS variables that the game's globals.css
 * sets. One component, 9 visual identities.
 */
export function ConnectHeader({
  title,
  kicker,
  className,
  titleClassName = "text-h1 text-fg",
  kickerClassName = "mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent",
  buttonClassName = "min-h-[40px] rounded-md bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50",
}: ConnectHeaderProps) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  return (
    <header
      className={
        className ?? "flex items-center justify-between border-b border-border pb-4"
      }
    >
      <div>
        <h1 className={titleClassName}>{title}</h1>
        {kicker && <p className={kickerClassName}>{kicker}</p>}
      </div>

      {mounted && isConnected && address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          title="Click to disconnect"
          className="min-h-[40px] rounded-md border border-border bg-surface px-3 font-mono text-xs text-fg hover:border-accent"
        >
          {shortAddr}
        </button>
      ) : mounted ? (
        <button
          type="button"
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className={buttonClassName}
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
      ) : (
        // SSR placeholder — matches button height to avoid layout shift.
        <div className="h-[40px] w-[120px]" />
      )}
    </header>
  );
}

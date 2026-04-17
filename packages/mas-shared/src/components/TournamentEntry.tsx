"use client";

import type { Hex } from "viem";
import { useTournamentEntry } from "../hooks/useTournamentEntry";

export interface TournamentEntryProps {
  tournamentId: bigint;
  /** Default: 1 USDC (6 decimals). */
  entryFee?: bigint;
  /** Short label shown in the header ("2048", "wordle", etc.). */
  gameLabel: string;
  /** Human-readable tournament duration (for the subtitle). */
  durationLabel?: string;
  /** Fires on first successful `hasEntered` read. */
  onEntered: () => void;
  /** Full-card replacement for the "entered" success state. */
  enteredView?: React.ReactNode;
}

/**
 * Prop-driven Tournament entry card. Wraps `useTournamentEntry` hook
 * with a canonical two-button UI (Approve → Enter). Each game's
 * globals.css paints it via CSS variables; no per-game JSX fork needed.
 */
export function TournamentEntry({
  tournamentId,
  entryFee = 1_000_000n,
  gameLabel,
  durationLabel = "24h",
  onEntered,
  enteredView,
}: TournamentEntryProps) {
  const entry = useTournamentEntry({ tournamentId, entryFee, onEntered });

  if (entry.status === "entered") {
    return (
      enteredView ?? (
        <div className="rounded border border-success/40 bg-success/10 p-4">
          <p className="text-sm font-bold text-success">
            ✓ Entered — Tournament #{tournamentId.toString()}
          </p>
          <p className="mt-1 text-xs text-muted">You are in. Play below.</p>
        </div>
      )
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div>
        <h3 className="text-h3 text-fg">
          Tournament #{tournamentId.toString()}
        </h3>
        <p className="text-xs text-muted">
          Entry fee: 1 USDC · gameId &ldquo;{gameLabel}&rdquo; · {durationLabel}
        </p>
      </div>

      <StatusRow
        status={entry.status}
        balance={entry.balance}
        allowance={entry.allowance}
        approveHash={entry.approveHash}
        enterHash={entry.enterHash}
        approveError={entry.approveError}
        enterError={entry.enterError}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={entry.approve}
          disabled={entry.status !== "needs_approve" && entry.status !== "error"}
          className="min-h-[40px] flex-1 rounded border border-border bg-surface-2 px-3 py-2 text-sm font-bold text-fg hover:border-accent disabled:opacity-40"
        >
          {entry.status === "approving" ? "Approving…" : "1. Approve 1 USDC"}
        </button>
        <button
          type="button"
          onClick={entry.enter}
          disabled={entry.status !== "needs_enter"}
          className="min-h-[40px] flex-1 rounded bg-accent px-3 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
        >
          {entry.status === "entering" ? "Entering…" : "2. Enter Tournament"}
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  status,
  balance,
  allowance,
  approveHash,
  enterHash,
  approveError,
  enterError,
}: {
  status: string;
  balance?: bigint;
  allowance?: bigint;
  approveHash?: Hex;
  enterHash?: Hex;
  approveError?: string;
  enterError?: string;
}) {
  const fmt = (v: bigint | undefined) =>
    v === undefined ? "—" : (Number(v) / 1e6).toFixed(2) + " USDC";
  const basescanTx = (h?: Hex) =>
    h ? `https://sepolia.basescan.org/tx/${h}` : null;

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-border bg-bg/40 p-2 text-xs">
      <span className="text-muted">Balance</span>
      <span className="text-right text-fg tabular-nums">{fmt(balance)}</span>
      <span className="text-muted">Allowance</span>
      <span className="text-right text-fg tabular-nums">{fmt(allowance)}</span>

      {status === "no_balance" && (
        <p className="col-span-2 mt-1 rounded bg-warning/20 p-2 text-fg">
          Need Base Sepolia USDC.{" "}
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            circle faucet ↗
          </a>
        </p>
      )}
      {status === "connecting" && (
        <p className="col-span-2 text-muted">Connect wallet first.</p>
      )}
      {status === "checking" && (
        <p className="col-span-2 text-muted">Checking on-chain state…</p>
      )}

      {(approveHash || enterHash) && (
        <p className="col-span-2 mt-1 break-all text-muted">
          {enterHash ? "enter: " : "approve: "}
          <a
            href={(basescanTx(enterHash) ?? basescanTx(approveHash))!}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            {(enterHash ?? approveHash ?? "").slice(0, 10)}…
          </a>
        </p>
      )}

      {(approveError || enterError) && (
        <p className="col-span-2 mt-1 rounded border border-danger/50 bg-danger/10 p-2 text-danger">
          {(enterError ?? approveError)!.split("\n")[0]}
        </p>
      )}
    </div>
  );
}

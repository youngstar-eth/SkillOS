"use client";

import type { ReactNode } from "react";
import type { SubmitState } from "../hooks/useScoreSubmit";

export interface GameOverSubmitProps {
  /** Discriminated submit state — usually `useScoreSubmit().state`. */
  submit: SubmitState;
  /** Canonical submitted score (what gets written on-chain). */
  finalScore: number;
  /** True when the wallet can actually sign (isConnected + address). */
  canSubmit: boolean;
  onPlayAgain: () => void;
  onSubmit: () => void;
  /** Title rendered at the top of the modal. */
  title: ReactNode;
  /** Extra class for the title (apply game-specific color / neon). */
  titleClassName?: string;
  /** Per-game stats grid / flavour text. Rendered between title and buttons. */
  children?: ReactNode;
  /** When a loss should not attempt a submit, pass false. */
  allowZeroScoreSubmit?: boolean;
  /** Override the Play Again button label ("Plant again", "New puzzle", etc.). */
  playAgainLabel?: string;
}

function friendlyError(raw: string): string {
  const m = raw.match(/reverted with reason string ['"](.+?)['"]/);
  const reason = m?.[1] ?? raw.split("\n")[0];
  const map: Record<string, string> = {
    "Not entered": "You haven't entered this tournament yet.",
    "Tournament ended": "Tournament is over. Scores can no longer be submitted.",
    "Nonce used": "This session was already submitted.",
    "Invalid signature": "Signature verification failed — server/client mismatch.",
  };
  return map[reason] ?? reason;
}

/**
 * Shared game-over modal. Renders:
 *   1. Title (game-specific, via prop)
 *   2. Children (per-game stats grid)
 *   3. Play again + Submit buttons with submit state machine UI
 *   4. Submit receipt / error panel
 *
 * The modal styling uses CSS variables (border, bg, etc.) so each game's
 * globals.css paints it per-aesthetic. No design decisions are made here.
 */
export function GameOverSubmit({
  submit,
  finalScore,
  canSubmit,
  onPlayAgain,
  onSubmit,
  title,
  titleClassName = "text-h2 text-fg",
  children,
  allowZeroScoreSubmit = false,
  playAgainLabel = "Play again",
}: GameOverSubmitProps) {
  const buttonLabel = (() => {
    switch (submit.status) {
      case "signing":
        return "Preparing…";
      case "signed":
      case "writing":
        return "Confirm in wallet";
      case "confirming":
        return "Waiting for block…";
      case "done":
        return "Submitted ✓";
      case "error":
        return "Retry submit";
      default:
        return canSubmit ? "Submit on-chain" : "Connect wallet to submit";
    }
  })();

  const buttonDisabled =
    !canSubmit ||
    submit.status === "signing" ||
    submit.status === "writing" ||
    submit.status === "confirming" ||
    submit.status === "done" ||
    (!allowZeroScoreSubmit && finalScore === 0 && submit.status === "idle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded border-2 border-border bg-surface p-5">
        <h2 className={titleClassName}>{title}</h2>

        {children}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="min-h-[44px] w-full rounded border border-border bg-surface-2 text-sm font-bold text-fg hover:border-accent"
          >
            {playAgainLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded bg-accent text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {buttonLabel}
          </button>
          {!allowZeroScoreSubmit && finalScore === 0 && submit.status === "idle" && (
            <p className="text-center text-[10px] text-muted">
              Score of 0 — nothing to submit on-chain.
            </p>
          )}
        </div>

        {submit.status === "signed" && (
          <Panel>
            <Row label="session">{submit.sessionId}</Row>
            <Row label="nonce" mono>
              {submit.nonce}
            </Row>
            <Row label="sig" mono>
              {submit.signature.slice(0, 10)}…{submit.signature.slice(-8)}
            </Row>
            <p className="mt-1 text-muted">
              Click <b>Confirm in wallet</b> to call submitScore on-chain.
            </p>
          </Panel>
        )}

        {submit.status === "confirming" && (
          <Panel>
            Pending tx —{" "}
            <a
              href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              {submit.txHash.slice(0, 10)}…
            </a>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded border border-success/50 bg-success/10 p-3 text-xs">
            <p className="font-bold text-success">✓ Score submitted on-chain</p>
            <p className="mt-1 break-all text-muted">
              <a
                href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {submit.txHash}
              </a>
            </p>
          </div>
        )}

        {submit.status === "error" && (
          <p className="mt-4 rounded border border-danger/50 bg-danger/10 p-3 text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded border border-border bg-bg/60 p-3 text-[11px] text-muted">
      {children}
    </div>
  );
}

function Row({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={mono ? "mt-1 break-all font-mono" : ""}>
      <span className="font-bold text-fg">{label}:</span> {children}
    </div>
  );
}

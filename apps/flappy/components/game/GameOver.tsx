"use client";

import type { Hex } from "viem";

export type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | {
      status: "signed";
      sessionId: string;
      nonce: string;
      signature: Hex;
    }
  | {
      status: "writing";
      sessionId: string;
      nonce: string;
      signature: Hex;
    }
  | {
      status: "confirming";
      sessionId: string;
      nonce: string;
      signature: Hex;
      txHash: Hex;
    }
  | { status: "done"; txHash: Hex; sessionId: string }
  | { status: "error"; message: string };

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

interface Props {
  score: number;
  pipesPassed: number;
  durationMs: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}

export function GameOver({
  score,
  pipesPassed,
  durationMs,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: Props) {
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
    (score === 0 && submit.status === "idle");

  const seconds = (durationMs / 1000).toFixed(1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-6 shadow-[0_8px_40px_rgba(255,180,220,0.35)]">
        <h2 className="text-3xl font-bold text-[rgb(var(--color-accent))]">
          Game Over
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--color-fg))]/70">
          Final score{" "}
          <span className="text-2xl font-bold text-[rgb(var(--color-accent-2))]">
            {score}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-white/60 p-3 text-xs">
          <Stat label="Pipes" value={pipesPassed} />
          <Stat label="Time" value={`${seconds}s`} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded-full border border-[rgb(var(--color-accent))]/60 bg-[rgb(var(--color-accent))]/20 text-sm font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-fg))] hover:bg-[rgb(var(--color-accent))]/30"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded-full border border-[rgb(var(--color-accent-2))] bg-[rgb(var(--color-accent-2))]/30 text-sm font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-fg))] hover:bg-[rgb(var(--color-accent-2))]/40 disabled:opacity-40"
          >
            {buttonLabel}
          </button>
          {score === 0 && submit.status === "idle" && (
            <p className="text-[11px] text-[rgb(var(--color-fg))]/60">
              No pipes passed — nothing to submit.
            </p>
          )}
        </div>

        {submit.status === "confirming" && (
          <Panel>
            Pending tx —{" "}
            <a
              href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {submit.txHash.slice(0, 10)}…
            </a>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-xs">
            <p className="text-green-600">✓ Score submitted on-chain</p>
            <p className="mt-1 break-all text-[rgb(var(--color-fg))]/60">
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
          <p className="mt-4 rounded-lg border border-red-400/50 bg-red-400/10 p-3 text-xs text-red-600">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-[rgb(var(--color-fg))]/60">
        {label}
      </div>
      <div className="text-lg font-semibold text-[rgb(var(--color-accent-2))]">
        {value}
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-[rgb(var(--color-border))] bg-white/60 p-3 text-xs text-[rgb(var(--color-fg))]/70">
      {children}
    </div>
  );
}

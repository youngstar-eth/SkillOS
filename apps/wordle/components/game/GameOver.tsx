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

/** Map raw contract revert reasons to friendly copy. */
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

export function GameOver({
  won,
  answer,
  guessCount,
  score,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  won: boolean;
  answer: string;
  guessCount: number;
  score: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
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
    // Losing = 0 score, don't bother hitting the contract.
    (!won && submit.status === "idle");

  const title = won ? "Solved" : "Out of tries";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-xl">
        <h2 className="text-h2 text-fg">{title}</h2>

        <p className="mt-2 text-sm text-muted">
          Answer:{" "}
          <span className="font-mono text-base font-semibold uppercase tracking-widest text-fg">
            {answer}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded border border-border bg-surface p-3 text-xs">
          <StatRow label="Score" value={won ? score.toLocaleString() : "0"} />
          <StatRow label="Guesses" value={`${guessCount}/6`} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded-sm border border-border bg-surface text-sm font-semibold text-fg hover:border-fg/30"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded-sm bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {buttonLabel}
          </button>
          {!won && submit.status === "idle" && (
            <p className="text-[11px] text-muted">
              No score to submit on a loss.
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
            <p className="mt-2 text-muted">
              Click <b>Confirm in wallet</b> to call submitScore on-chain.
            </p>
          </Panel>
        )}

        {submit.status === "confirming" && (
          <Panel>
            <p className="text-muted">
              Pending tx —{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${submit.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                {submit.txHash.slice(0, 10)}…
              </a>
            </p>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded border border-success/40 bg-success/10 p-3 text-xs">
            <p className="font-semibold text-success">✓ Score submitted on-chain</p>
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
          <p className="mt-4 rounded border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className="mt-0.5 text-lg font-semibold text-fg">{value}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded border border-border bg-surface p-3 text-[11px] text-muted">
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
  children: React.ReactNode;
}) {
  return (
    <div className={mono ? "mt-1 break-all" : ""}>
      <span className="font-semibold text-fg">{label}</span> {children}
    </div>
  );
}

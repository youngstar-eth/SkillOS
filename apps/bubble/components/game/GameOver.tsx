"use client";

import type { Hex } from "viem";

export type SubmitState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "signed"; sessionId: string; nonce: string; signature: Hex }
  | { status: "writing"; sessionId: string; nonce: string; signature: Hex }
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

export function GameOver({
  won,
  finalScore,
  score,
  bubblesPopped,
  maxCombo,
  shotsFired,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  won: boolean;
  finalScore: number;
  score: number;
  bubblesPopped: number;
  maxCombo: number;
  shotsFired: number;
  canSubmit: boolean;
  onRestart: () => void;
  onSubmit: () => void;
  submit: SubmitState;
}) {
  const title = won ? "All clear!" : "Game over";

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
    (finalScore === 0 && submit.status === "idle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/20 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border-2 border-accent-soft bg-surface p-6 shadow-[0_20px_48px_rgba(255,100,150,0.25)]">
        <h2 className="display text-h1 text-accent-deep">{title}</h2>

        <p className="mt-1 text-sm text-muted">
          Final score:{" "}
          <span className="display text-h2 text-accent">
            {finalScore.toLocaleString()}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-4 gap-3 rounded-lg border border-border bg-surface-2 p-3 text-xs">
          <Stat label="Score" value={score.toLocaleString()} />
          <Stat label="Popped" value={bubblesPopped} />
          <Stat label="Shots" value={shotsFired} />
          <Stat label="Combo" value={maxCombo} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded-full border-2 border-border bg-surface text-sm font-semibold text-fg hover:border-accent hover:text-accent"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded-full bg-accent text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,100,150,0.4)] hover:bg-accent-deep disabled:opacity-40 disabled:shadow-none"
          >
            {buttonLabel}
          </button>
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
              className="text-accent-deep underline"
            >
              {submit.txHash.slice(0, 10)}…
            </a>
          </Panel>
        )}

        {submit.status === "done" && (
          <div className="mt-4 rounded-lg border border-success/50 bg-success/10 p-3 text-xs">
            <p className="font-semibold text-accent-deep">✓ Score submitted on-chain</p>
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
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <span className="font-bold text-fg tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-[11px] text-muted">
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
    <div className={mono ? "mt-1 break-all font-mono" : ""}>
      <span className="font-semibold text-fg">{label}:</span> {children}
    </div>
  );
}

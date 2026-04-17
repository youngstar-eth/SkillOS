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
  score,
  difficulty,
  elapsedSec,
  hintsUsed,
  errorsCount,
  canSubmit,
  onRestart,
  onSubmit,
  submit,
}: {
  score: number;
  difficulty: string;
  elapsedSec: number;
  hintsUsed: number;
  errorsCount: number;
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
    submit.status === "done";

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Solved"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/20 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-6 shadow-[0_20px_60px_rgba(6,27,49,0.18)]">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-success" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-success">
            Solved
          </span>
        </div>

        <h2 className="mt-1 text-h2 text-fg">
          <span className="font-mono font-semibold">{score.toLocaleString()}</span>{" "}
          <span className="text-sm font-medium text-muted">points</span>
        </h2>

        <div className="mt-4 grid grid-cols-4 gap-3 rounded-lg border border-border bg-surface p-3 text-xs">
          <StatRow label="Difficulty" value={difficulty} capitalize />
          <StatRow label="Time" value={`${mm}:${ss}`} mono />
          <StatRow label="Hints" value={hintsUsed} />
          <StatRow label="Errors" value={errorsCount} />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded-lg border border-border bg-bg text-sm font-semibold text-fg hover:border-accent"
          >
            New puzzle
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={buttonDisabled}
            className="min-h-[44px] w-full rounded-lg bg-accent text-sm font-semibold text-white shadow-[0_4px_14px_rgba(99,91,255,0.35)] hover:bg-accent-deep disabled:opacity-40 disabled:shadow-none"
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
            <p className="mt-2 text-muted">
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
          <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
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
          <p className="mt-4 rounded-lg border border-error/40 bg-error/5 p-3 text-xs text-error">
            {friendlyError(submit.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: number | string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span
        className={[
          "text-sm font-semibold text-fg",
          mono ? "font-mono tabular-nums" : "",
          capitalize ? "capitalize" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-3 text-[11px] text-muted">
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
